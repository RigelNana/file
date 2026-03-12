# 设计原则与SOLID

---

## 1. 什么是 SOLID 原则？

**回答：**

```
SOLID：面向对象设计五大原则

  ┌─────┬──────────────────────┬──────────────────┐
  │ 字母 │ 原则                 │ 核心思想         │
  ├─────┼──────────────────────┼──────────────────┤
  │ S   │ 单一职责 SRP         │ 一个类只有一个   │
  │     │                      │ 变化的原因       │
  ├─────┼──────────────────────┼──────────────────┤
  │ O   │ 开闭原则 OCP         │ 对扩展开放       │
  │     │                      │ 对修改关闭       │
  ├─────┼──────────────────────┼──────────────────┤
  │ L   │ 里氏替换 LSP         │ 子类可替换父类   │
  │     │                      │ 不影响正确性     │
  ├─────┼──────────────────────┼──────────────────┤
  │ I   │ 接口隔离 ISP         │ 不依赖不需要的   │
  │     │                      │ 接口方法         │
  ├─────┼──────────────────────┼──────────────────┤
  │ D   │ 依赖倒置 DIP         │ 依赖抽象         │
  │     │                      │ 不依赖具体实现   │
  └─────┴──────────────────────┴──────────────────┘
```

---

## 2. 单一职责原则（SRP）？

**回答：**

```
核心：一个模块只有一个变化的原因

反例：
  type UserService struct{}
  func (s *UserService) CreateUser(...)   // 用户管理
  func (s *UserService) SendEmail(...)    // 邮件发送
  func (s *UserService) GenerateReport()  // 报表生成
  → 三种原因导致变化，职责不清
```

```go
// 正例：拆分职责
type UserService struct {
    repo   UserRepository
    notify Notifier
}

func (s *UserService) CreateUser(ctx context.Context, user *User) error {
    if err := s.repo.Save(ctx, user); err != nil {
        return err
    }
    return s.notify.UserCreated(ctx, user)
}

type Notifier interface {
    UserCreated(ctx context.Context, user *User) error
}

type EmailNotifier struct{ /* 邮件实现 */ }
type SMSNotifier struct{ /* 短信实现 */ }
```

```
判断标准：
  如果描述一个类时用了"和"、"或"
  说明职责不单一
  例："管理用户 和 发送通知" → 拆
```

---

## 3. 开闭原则（OCP）？

**回答：**

```
核心：通过扩展（新增代码）而非修改（改已有代码）来应对变化
```

```go
// 反例：每加一种支付都要改 switch
func Pay(method string, amount float64) error {
    switch method {
    case "wechat":
        // 微信支付逻辑
    case "alipay":
        // 支付宝逻辑
    // 新增支付方式要修改这里 ❌
    }
    return nil
}

// 正例：通过接口扩展
type PaymentStrategy interface {
    Pay(ctx context.Context, amount float64) error
}

type WechatPay struct{}
func (w *WechatPay) Pay(ctx context.Context, amount float64) error { /* ... */ return nil }

type Alipay struct{}
func (a *Alipay) Pay(ctx context.Context, amount float64) error { /* ... */ return nil }

// 新增 ApplePay 只需实现接口，不修改已有代码 ✅
type ApplePay struct{}
func (a *ApplePay) Pay(ctx context.Context, amount float64) error { /* ... */ return nil }

type PaymentService struct {
    strategies map[string]PaymentStrategy
}

func (s *PaymentService) Pay(ctx context.Context, method string, amount float64) error {
    strategy, ok := s.strategies[method]
    if !ok {
        return fmt.Errorf("unsupported payment method: %s", method)
    }
    return strategy.Pay(ctx, amount)
}
```

---

## 4. 里氏替换原则（LSP）？

**回答：**

```
核心：子类型必须能替换父类型

经典反例：正方形继承长方形
  长方形.SetWidth(5).SetHeight(3)
  → 正方形改宽 → 高也变了 → 面积不是 15
  → 违反 LSP

Go 中的体现：接口实现
  实现接口的类型必须满足接口的契约
  不只是方法签名，还包含行为语义
```

```go
// 正例：满足行为契约
type Reader interface {
    // Read 读取最多 len(p) 字节到 p
    // 返回读取的字节数 n (0 <= n <= len(p))
    // 到达末尾返回 err = io.EOF
    Read(p []byte) (n int, err error)
}

// 任何 Reader 实现都必须遵守以上契约
// 调用方可以安全替换任何 Reader 实现

// 反例：违反契约
type BadReader struct{}
func (r *BadReader) Read(p []byte) (int, error) {
    return len(p) + 1, nil // 返回值 > len(p)，违反契约 ❌
}
```

---

## 5. 接口隔离原则（ISP）？

**回答：**

```
核心：客户端不应被迫依赖不使用的方法

Go 天然支持 ISP：
  小接口 → 按需组合
  "接受接口，返回结构体"
```

```go
// 反例：臃肿接口
type Repository interface {
    Create(ctx context.Context, entity interface{}) error
    Update(ctx context.Context, entity interface{}) error
    Delete(ctx context.Context, id string) error
    FindByID(ctx context.Context, id string) (interface{}, error)
    FindAll(ctx context.Context) ([]interface{}, error)
    Count(ctx context.Context) (int64, error)
    Export(ctx context.Context) ([]byte, error)       // 不是所有调用者都需要
    ImportBatch(ctx context.Context, data []byte) error // 同上
}

// 正例：按需拆分
type Reader interface {
    FindByID(ctx context.Context, id string) (interface{}, error)
    FindAll(ctx context.Context) ([]interface{}, error)
}

type Writer interface {
    Create(ctx context.Context, entity interface{}) error
    Update(ctx context.Context, entity interface{}) error
    Delete(ctx context.Context, id string) error
}

type ReadWriter interface {
    Reader
    Writer
}

// 只做查询的服务只依赖 Reader
type ReportService struct {
    repo Reader  // 不需要写权限
}

// Go标准库的经典示例：
// io.Reader  → 1个方法 Read
// io.Writer  → 1个方法 Write
// io.Closer  → 1个方法 Close
// io.ReadWriteCloser → 组合
```

---

## 6. 依赖倒置原则（DIP）？

**回答：**

```
核心：
  高层模块不依赖低层模块
  两者都依赖抽象

  ┌─────────────────┐
  │ Business Logic  │ ──→ interface (抽象)
  └─────────────────┘          ↑
                               │ 实现
  ┌─────────────────┐          │
  │  MySQL / Redis  │ ─────────┘
  └─────────────────┘

  依赖方向倒置：
  传统：业务 → 数据库
  DIP：  业务 → 接口 ← 数据库
```

```go
// DIP 实践
type OrderRepository interface {
    Save(ctx context.Context, order *Order) error
    FindByID(ctx context.Context, id string) (*Order, error)
}

type OrderService struct {
    repo OrderRepository  // 依赖接口，不依赖具体实现
}

func NewOrderService(repo OrderRepository) *OrderService {
    return &OrderService{repo: repo}
}

// MySQL 实现
type MySQLOrderRepo struct {
    db *sql.DB
}
func (r *MySQLOrderRepo) Save(ctx context.Context, order *Order) error { /* ... */ return nil }
func (r *MySQLOrderRepo) FindByID(ctx context.Context, id string) (*Order, error) { return nil, nil }

// 测试用 Mock 实现
type MockOrderRepo struct {
    orders map[string]*Order
}
func (r *MockOrderRepo) Save(ctx context.Context, order *Order) error {
    r.orders[order.ID] = order
    return nil
}
func (r *MockOrderRepo) FindByID(ctx context.Context, id string) (*Order, error) {
    return r.orders[id], nil
}

// 注入不同实现
service := NewOrderService(&MySQLOrderRepo{db: db})     // 生产
service := NewOrderService(&MockOrderRepo{orders: map[string]*Order{}}) // 测试
```

---

## 7. 其他重要设计原则？

**回答：**

```
  ┌──────────────┬────────────────────────────┐
  │ 原则         │ 说明                       │
  ├──────────────┼────────────────────────────┤
  │ KISS         │ 保持简单                   │
  │ YAGNI        │ 不需要就不做               │
  │ DRY          │ 不重复自己                 │
  │ LoD 迪米特   │ 只和直接朋友通信           │
  │ Tell Don't   │ 告诉对象做什么             │
  │  Ask         │ 而不是问状态再操作         │
  │ CQS          │ 命令和查询分离             │
  │ 组合优于继承 │ has-a 优于 is-a            │
  └──────────────┴────────────────────────────┘

KISS 实践：
  能用简单 if-else 就不用设计模式
  只有当复杂度真正出现时才重构

DRY 的误区：
  不是消除所有重复代码
  而是消除重复的知识/逻辑
  两段相似代码如果变化原因不同
  → 不应该合并
```

---

## 8. 组合优于继承？

**回答：**

```
继承的问题：
  - 强耦合（父类改变影响所有子类）
  - 单继承限制
  - 菱形继承
  - 破坏封装（子类知道父类内部）
  
Go 的解法：组合 + 接口

  Go 没有 class 和继承
  用结构体嵌入（embedding）实现复用
  用接口实现多态
```

```go
// 组合示例
type Logger struct{}
func (l *Logger) Log(msg string) { fmt.Println(msg) }

type Metrics struct{}
func (m *Metrics) Record(name string, value float64) { /* ... */ }

// 组合而非继承
type UserService struct {
    Logger   // 嵌入，获得 Log 能力
    Metrics  // 嵌入，获得 Record 能力
    repo UserRepository
}

func (s *UserService) CreateUser(ctx context.Context, user *User) error {
    s.Log("creating user")  // 直接使用
    defer s.Record("user.create", 1)
    return s.repo.Save(ctx, user)
}

// 策略组合：运行时替换行为
type Validator interface {
    Validate(data interface{}) error
}

type Service struct {
    validator Validator  // 可注入不同验证策略
}
```

---

## 9. 依赖注入在 Go 中的实践？

**回答：**

```
Go 依赖注入方式：

1. 构造函数注入（最常用）
2. 接口注入
3. 使用 wire/fx 等框架

不推荐 Go 用 DI 容器
手动 DI 更清晰、编译期检查
```

```go
// 构造函数注入（推荐）
type Server struct {
    userSvc  *UserService
    orderSvc *OrderService
}

func NewServer(userSvc *UserService, orderSvc *OrderService) *Server {
    return &Server{userSvc: userSvc, orderSvc: orderSvc}
}

// 手动组装（main.go）
func main() {
    db := NewDB(cfg.DSN)
    cache := NewRedisCache(cfg.Redis)
    
    userRepo := NewMySQLUserRepo(db)
    orderRepo := NewMySQLOrderRepo(db)
    
    userSvc := NewUserService(userRepo, cache)
    orderSvc := NewOrderService(orderRepo, userSvc)
    
    server := NewServer(userSvc, orderSvc)
    server.Run(":8080")
}

// Google Wire 自动生成（大型项目）
// wire.go
func InitializeServer(cfg *Config) (*Server, error) {
    wire.Build(
        NewDB,
        NewRedisCache,
        NewMySQLUserRepo,
        NewMySQLOrderRepo,
        NewUserService,
        NewOrderService,
        NewServer,
    )
    return nil, nil
}
```

---

## 10. 设计原则面试速答？

**回答：**

```
Q: SOLID 五大原则？
A: S单一职责 O开闭 L里氏替换
   I接口隔离 D依赖倒置

Q: 开闭原则怎么实现？
A: 通过接口/抽象扩展新功能
   不修改已有代码

Q: Go 中怎么体现接口隔离？
A: 小接口(1-3方法) 按需组合
   io.Reader / io.Writer 经典

Q: 依赖倒置怎么落地？
A: 高层依赖接口不依赖实现
   构造函数注入接口

Q: 组合和继承区别？
A: 继承is-a强耦合
   组合has-a松耦合 Go推荐组合

Q: Go 的依赖注入怎么做？
A: 构造函数注入（推荐）
   大项目用 Wire 自动生成

Q: KISS 和 YAGNI？
A: KISS保持简单 YAGNI不需要就不做
   不要过度设计

Q: DRY 的误区？
A: 不是消除所有重复代码
   是消除重复的业务逻辑
   变化原因不同的相似代码不要合并
```
