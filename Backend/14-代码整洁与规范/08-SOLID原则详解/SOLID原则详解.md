# SOLID原则详解

---

## 1. 单一职责原则（SRP）？

**回答：**

```
  SRP = 一个模块只有一个变更的理由
  （一个模块只对一个Actor负责）

  违反SRP：
  type UserService struct{}
  
  func (s *UserService) CreateUser()        // 用户CRUD → 产品需求
  func (s *UserService) GenerateReport()    // 报表 → 运营需求
  func (s *UserService) SendNotification()  // 通知 → 市场需求
  func (s *UserService) SyncToES()          // 搜索 → 搜索团队需求
  // 4个不同需求方 任何一方变更都改这个类

  遵循SRP：
  type UserService struct{}           // 只管用户CRUD
  type ReportService struct{}         // 只管报表
  type NotificationService struct{}   // 只管通知
  type SearchSyncService struct{}     // 只管搜索同步

  Go包级别SRP：
  // 差：万能utils包
  package utils
  func FormatTime()
  func HashPassword()
  func SendHTTP()
  func ParseJSON()
  
  // 好：按职责分包
  package timeutil   // 时间工具
  package auth       // 认证相关
  package httpclient // HTTP客户端
  package codec      // 编解码

  判断标准：
  能否用一句话描述这个包做什么？
  "这个包负责___" 如果答案用了"和" → 需要拆
```

---

## 2. 开闭原则（OCP）？

**回答：**

```
  OCP = 对扩展开放 对修改关闭
  添加新功能时 不修改已有代码

  违反OCP：
  // 每加一种通知方式 都要改这个函数
  func Notify(channel string, msg string) error {
      switch channel {
      case "email":
          return sendEmail(msg)
      case "sms":
          return sendSMS(msg)
      case "wechat":        // 新增
          return sendWechat(msg)
      case "dingtalk":      // 又新增
          return sendDingTalk(msg)
      }
  }

  遵循OCP（Go接口实现）：
  type Notifier interface {
      Notify(ctx context.Context, msg string) error
  }
  
  type EmailNotifier struct{}
  func (e *EmailNotifier) Notify(ctx context.Context, msg string) error {
      // 发邮件
  }
  
  type SMSNotifier struct{}
  func (s *SMSNotifier) Notify(ctx context.Context, msg string) error {
      // 发短信
  }
  
  // 新增通知方式 → 加一个实现 不改已有代码
  type WechatNotifier struct{}
  func (w *WechatNotifier) Notify(ctx context.Context, msg string) error {
      // 发微信
  }
  
  // 注册表管理
  type NotificationManager struct {
      notifiers map[string]Notifier
  }
  func (m *NotificationManager) Register(name string, n Notifier) {
      m.notifiers[name] = n
  }

  关键：用接口定义抽象 用多态实现扩展
```

---

## 3. 里氏替换原则（LSP）？

**回答：**

```
  LSP = 子类型必须能替换基类型使用
  Go没有继承 通过接口和组合体现

  违反LSP（接口契约被破坏）：
  type Cache interface {
      Get(key string) (string, error)
      Set(key string, value string, ttl time.Duration) error
  }
  
  // 违反：ReadOnlyCache实现了Cache接口但Set会panic
  type ReadOnlyCache struct{}
  func (c *ReadOnlyCache) Get(key string) (string, error) { ... }
  func (c *ReadOnlyCache) Set(key, value string, ttl time.Duration) error {
      panic("read-only cache cannot set")  // 违反LSP！
  }

  遵循LSP（接口隔离）：
  type CacheReader interface {
      Get(key string) (string, error)
  }
  
  type CacheWriter interface {
      Set(key string, value string, ttl time.Duration) error
  }
  
  type Cache interface {
      CacheReader
      CacheWriter
  }
  
  type ReadOnlyCache struct{}
  func (c *ReadOnlyCache) Get(key string) (string, error) { ... }
  // 只实现CacheReader 不实现Cache
  // 需要只读缓存的地方用CacheReader类型

  Go的LSP体现在：
  实现接口的所有方法都要符合契约
  不能有"空实现"或"异常实现"
  如果某些方法不需要 → 接口太大 需要拆
```

---

## 4. 接口隔离原则（ISP）？

**回答：**

```
  ISP = 接口小而专 不强迫实现不需要的方法

  Go天然支持ISP：隐式实现+小接口

  Go标准库的典范：
  type Reader interface { Read(p []byte) (n int, err error) }
  type Writer interface { Write(p []byte) (n int, err error) }
  type Closer interface { Close() error }
  
  // 组合使用
  type ReadWriter interface { Reader; Writer }
  type ReadCloser interface { Reader; Closer }
  type ReadWriteCloser interface { Reader; Writer; Closer }

  违反ISP：
  // 接口太大 大部分实现者只需要其中几个方法
  type Repository interface {
      Create(ctx context.Context, entity interface{}) error
      FindByID(ctx context.Context, id string) (interface{}, error)
      Update(ctx context.Context, entity interface{}) error
      Delete(ctx context.Context, id string) error
      List(ctx context.Context, filter interface{}) ([]interface{}, error)
      Count(ctx context.Context, filter interface{}) (int64, error)
      Transaction(ctx context.Context, fn func(tx *gorm.DB) error) error
      BulkInsert(ctx context.Context, entities []interface{}) error
      Migrate() error
  }

  遵循ISP：
  type Reader interface {
      FindByID(ctx context.Context, id string) (*Entity, error)
      List(ctx context.Context, filter Filter) ([]*Entity, error)
  }
  
  type Writer interface {
      Create(ctx context.Context, entity *Entity) error
      Update(ctx context.Context, entity *Entity) error
      Delete(ctx context.Context, id string) error
  }
  
  // 需要只读 → 依赖Reader
  // 需要读写 → 依赖ReadWriter
  type ReadWriter interface { Reader; Writer }

  Go惯例：接口越小越好 1-3个方法最佳
```

---

## 5. 依赖倒置原则（DIP）？

**回答：**

```
  DIP = 高层模块不依赖低层模块 都依赖抽象

  违反DIP（直接依赖具体实现）：
  type OrderService struct {
      db    *gorm.DB         // 直接依赖GORM
      redis *redis.Client    // 直接依赖Redis
      kafka *kafka.Producer  // 直接依赖Kafka
  }
  // 换数据库/缓存/消息队列 → 改OrderService

  遵循DIP（依赖抽象接口）：
  // 定义抽象
  type OrderRepository interface {
      Save(ctx context.Context, order *Order) error
      FindByID(ctx context.Context, id string) (*Order, error)
  }
  
  type CacheStore interface {
      Get(ctx context.Context, key string) (string, error)
      Set(ctx context.Context, key string, val string, ttl time.Duration) error
  }
  
  type EventPublisher interface {
      Publish(ctx context.Context, topic string, event interface{}) error
  }
  
  // 高层依赖抽象
  type OrderService struct {
      repo      OrderRepository
      cache     CacheStore
      publisher EventPublisher
  }
  
  // 构造注入
  func NewOrderService(repo OrderRepository, cache CacheStore, 
      pub EventPublisher) *OrderService {
      return &OrderService{repo: repo, cache: cache, publisher: pub}
  }
  
  // main.go（组装层）决定具体实现
  func main() {
      repo := mysql.NewOrderRepo(db)
      cache := redis.NewCacheStore(rdb)
      pub := kafka.NewPublisher(producer)
      svc := NewOrderService(repo, cache, pub)
  }

  好处：
  换MySQL→PostgreSQL → 只改repo实现
  测试时注入Mock → 不需要真实数据库
```

---

## 6. SOLID在Go中的特殊性？

**回答：**

```
  Go语言特性与SOLID的关系：

  1. 隐式接口实现 → 天然ISP+DIP
     不需要声明实现哪个接口
     调用方定义接口 实现方无感知
  
  // 消费者定义所需接口
  package order
  type UserGetter interface {
      GetUser(ctx context.Context, id string) (*User, error)
  }
  // 即使user包不知道这个接口 只要有GetUser方法就满足
  
  2. 组合优于继承 → 天然LSP
     没有继承 没有子类覆盖父类方法的问题
     用嵌入(embedding)复用 不是继承
  
  type Base struct{}
  type Extended struct {
      Base  // 组合 不是继承
  }
  
  3. 包 = 模块 → 天然SRP
     Go的包就是模块边界
     一个包一个职责

  4. 函数式特性 → 天然OCP
     函数是一等公民
     高阶函数/闭包实现策略模式
  
  type HandlerFunc func(http.ResponseWriter, *http.Request)
  // 任何满足签名的函数都可以扩展

  Go的SOLID总结：
  S → 包划分
  O → 接口 + 注册表
  L → 组合替代继承
  I → 小接口（1-3方法）
  D → 接口注入 + 构造函数
```

---

## 7. 依赖注入实践？

**回答：**

```
  Go依赖注入方式：

  1. 构造函数注入（推荐）
  func NewOrderService(
      repo OrderRepository,
      cache CacheStore,
  ) *OrderService {
      return &OrderService{repo: repo, cache: cache}
  }

  2. Wire（Google编译期DI）
  // +build wireinject
  func InitializeApp() (*App, error) {
      wire.Build(
          NewConfig,
          NewDB,
          NewUserRepo,
          NewUserService,
          NewServer,
          NewApp,
      )
      return nil, nil
  }
  // wire生成代码 无运行时反射

  3. fx（Uber运行时DI）
  func main() {
      fx.New(
          fx.Provide(NewConfig),
          fx.Provide(NewDB),
          fx.Provide(NewUserRepo),
          fx.Provide(NewUserService),
          fx.Provide(NewServer),
          fx.Invoke(func(s *Server) { s.Start() }),
      ).Run()
  }

  对比：
  ┌──────────────┬───────────────┬───────────────┐
  │ 方式          │ 优势           │ 劣势           │
  ├──────────────┼───────────────┼───────────────┤
  │ 手动(构造函数)│ 简单明确       │ 大项目繁琐     │
  │ Wire         │ 编译期安全      │ 需要codegen    │
  │ fx           │ 功能强大       │ 运行时 调试难   │
  └──────────────┴───────────────┴───────────────┘

  小项目 → 手动注入
  中大项目 → Wire
```

---

## 8. 接口设计最佳实践？

**回答：**

```
  Go接口设计原则：

  1. 消费者定义接口（不是提供者）
  // 差：provider定义大接口
  package db
  type Database interface {
      Query(); Exec(); Begin(); Commit(); ...
  }
  
  // 好：consumer定义需要的小接口
  package order
  type OrderStore interface {
      FindByID(ctx context.Context, id string) (*Order, error)
      Save(ctx context.Context, order *Order) error
  }

  2. 接受接口 返回结构体
  // 参数用接口 → 灵活
  func NewService(repo UserRepository) *Service
  // 返回具体类型 → 明确
  func NewService(...) *Service  // 不是 Service接口

  3. 标准库接口优先
  func Process(r io.Reader) error     // 用标准Reader
  func Handler() http.Handler          // 用标准Handler
  func Format() fmt.Stringer           // 用标准Stringer

  4. 不要过早抽象
  // 只有一个实现时不需要接口
  // 等到需要第二个实现时再提取接口
  
  // 例外：需要Mock测试外部依赖时
  // 即使只有一个实现也值得定义接口
  type EmailSender interface {
      Send(to, body string) error
  }

  5. 避免空接口
  // 差
  func Process(data interface{}) interface{}
  // 好
  func Process(data *Request) *Response
  // Go 1.18+ 用泛型替代 interface{}
```

---

## 9. 面向接口编程实战？

**回答：**

```
  完整示例 — 订单系统：

  // 1. 定义领域接口
  type OrderRepository interface {
      Save(ctx context.Context, order *Order) error
      FindByID(ctx context.Context, id string) (*Order, error)
  }
  
  type PaymentGateway interface {
      Charge(ctx context.Context, amount int64, method string) (*PaymentResult, error)
  }
  
  type EventBus interface {
      Publish(ctx context.Context, event Event) error
  }

  // 2. Service依赖接口
  type OrderService struct {
      repo    OrderRepository
      payment PaymentGateway
      events  EventBus
  }
  
  func NewOrderService(r OrderRepository, p PaymentGateway, e EventBus) *OrderService {
      return &OrderService{repo: r, payment: p, events: e}
  }
  
  func (s *OrderService) PlaceOrder(ctx context.Context, req *PlaceOrderReq) (*Order, error) {
      order := NewOrder(req)
      
      result, err := s.payment.Charge(ctx, order.Total, req.PaymentMethod)
      if err != nil {
          return nil, fmt.Errorf("charge: %w", err)
      }
      order.PaymentID = result.ID
      
      if err := s.repo.Save(ctx, order); err != nil {
          return nil, fmt.Errorf("save order: %w", err)
      }
      
      s.events.Publish(ctx, OrderCreatedEvent{OrderID: order.ID})
      return order, nil
  }

  // 3. 测试：注入Mock
  func TestPlaceOrder(t *testing.T) {
      svc := NewOrderService(
          &mockRepo{...},
          &mockPayment{...},
          &mockEvents{...},
      )
      order, err := svc.PlaceOrder(ctx, req)
      assert.NoError(t, err)
  }
```

---

## 10. SOLID原则面试速答？

**回答：**

```
Q: SRP怎么理解？
A: 一个模块一个变更理由
   Go用包划分职责

Q: OCP怎么实现？
A: 用接口+注册表
   新增功能加实现 不改已有代码

Q: LSP在Go中怎么体现？
A: 组合替代继承 没有子类覆盖问题
   接口实现不能有"空实现"

Q: ISP在Go中怎么体现？
A: 小接口(1-3方法)
   标准库Reader/Writer是典范

Q: DIP怎么落地？
A: 高层依赖接口 不依赖具体实现
   构造函数注入

Q: Go接口设计原则？
A: 消费者定义接口
   接受接口 返回结构体

Q: Go依赖注入怎么做？
A: 小项目→手动构造函数注入
   中大项目→Wire编译期DI

Q: 什么时候需要接口？
A: 需要Mock外部依赖时
   需要多个实现时
   只有一个实现且不需要Mock→不用
```
