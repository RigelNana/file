# DDD领域驱动设计

---

## 1. DDD 核心思想？

**回答：**

```
DDD = 以业务领域为核心驱动设计

  核心理念：
  1. 业务专家和开发紧密协作
  2. 统一语言（Ubiquitous Language）
  3. 代码反映业务概念

  DDD 分层架构：
  ┌──────────────────────────────────┐
  │ interfaces/  → 接口层(API/gRPC) │
  ├──────────────────────────────────┤
  │ application/ → 应用层(用例编排) │
  ├──────────────────────────────────┤
  │ domain/      → 领域层(核心逻辑) │
  ├──────────────────────────────────┤
  │ infrastructure/ → 基础设施层    │
  │ (DB/MQ/外部服务)                │
  └──────────────────────────────────┘

  依赖方向：外层→内层
  核心原则：domain 层不依赖任何外层

战略设计 vs 战术设计：
  战略设计：限界上下文、上下文映射（宏观）
  战术设计：实体、值对象、聚合根（微观）
```

---

## 2. 限界上下文（Bounded Context）？

**回答：**

```
限界上下文 = 一个明确的业务边界
  同一概念在不同上下文含义不同

  "商品"在不同上下文：
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │ 商品目录上下文│ │ 订单上下文    │ │ 物流上下文    │
  │ Product:     │ │ OrderItem:   │ │ Package:     │
  │  Name        │ │  ProductID   │ │  ItemID      │
  │  Description │ │  Price       │ │  Weight      │
  │  Category    │ │  Quantity    │ │  Volume      │
  │  Images      │ │  Discount    │ │  Address     │
  └──────────────┘ └──────────────┘ └──────────────┘
  各自独立建模 不共享模型

上下文映射关系：
  ┌──────────────┬───────────────────────────┐
  │ 关系          │ 说明                      │
  ├──────────────┼───────────────────────────┤
  │ 共享内核      │ 共享部分模型              │
  │ 客户/供应商   │ 下游依赖上游              │
  │ 防腐层(ACL)   │ 隔离外部模型 转换成自己的 │
  │ 开放主机服务  │ 提供标准API供他人集成     │
  │ 发布语言      │ 公共交换格式              │
  └──────────────┴───────────────────────────┘

  最常用：防腐层（ACL）
  外部系统 → ACL(适配器) → 领域模型
```

---

## 3. 实体、值对象、聚合根？

**回答：**

```
  ┌──────────┬──────────────┬──────────────────┐
  │ 概念      │ 标识          │ 特点              │
  ├──────────┼──────────────┼──────────────────┤
  │ 实体      │ 有唯一ID      │ 可变 生命周期长  │
  │ 值对象    │ 无ID 按值比较 │ 不可变 可替换    │
  │ 聚合根    │ 实体的根      │ 保证一致性边界   │
  └──────────┴──────────────┴──────────────────┘

Go 实现：
  // 值对象（不可变）
  type Money struct {
      Amount   int64
      Currency string
  }
  
  func NewMoney(amount int64, currency string) Money {
      return Money{Amount: amount, Currency: currency}
  }
  
  func (m Money) Add(other Money) Money {
      if m.Currency != other.Currency {
          panic("currency mismatch")
      }
      return Money{Amount: m.Amount + other.Amount, Currency: m.Currency}
  }
  
  // 实体
  type OrderItem struct {
      ID        string
      ProductID string
      Price     Money
      Quantity  int
  }
  
  // 聚合根
  type Order struct {
      ID        string
      UserID    string
      Items     []OrderItem
      Status    OrderStatus
      Total     Money
      CreatedAt time.Time
  }
  
  // 业务规则在聚合根内
  func (o *Order) AddItem(item OrderItem) error {
      if o.Status != OrderStatusDraft {
          return errors.New("can only add items to draft order")
      }
      o.Items = append(o.Items, item)
      o.recalculateTotal()
      return nil
  }
```

---

## 4. 领域服务？

**回答：**

```
领域服务 = 不属于任何单个实体的业务逻辑

  判断标准：
  这个行为属于哪个实体？
  如果不属于任何一个 → 领域服务

  例：转账涉及两个账户 不属于单一 Account
  type TransferService struct{}
  
  func (s *TransferService) Transfer(
      ctx context.Context,
      from, to *Account,
      amount Money,
  ) error {
      if err := from.Debit(amount); err != nil {
          return fmt.Errorf("debit failed: %w", err)
      }
      to.Credit(amount)
      return nil
  }

领域服务 vs 应用服务：
  ┌──────────────┬──────────────────────────────┐
  │ 领域服务      │ 核心业务逻辑                 │
  │              │ 如：价格计算、风控规则         │
  ├──────────────┼──────────────────────────────┤
  │ 应用服务      │ 编排/协调                    │
  │              │ 如：事务管理、调用多个领域服务 │
  └──────────────┴──────────────────────────────┘

  // 应用服务：编排用例
  type OrderApplicationService struct {
      orderRepo   OrderRepository
      stockSvc    StockDomainService
      paymentSvc  PaymentDomainService
  }
  
  func (s *OrderApplicationService) PlaceOrder(ctx context.Context, cmd PlaceOrderCmd) error {
      order := domain.NewOrder(cmd.UserID, cmd.Items)
      if err := s.stockSvc.Reserve(ctx, order.Items); err != nil {
          return err
      }
      return s.orderRepo.Save(ctx, order)
  }
```

---

## 5. 仓储模式（Repository）？

**回答：**

```
Repository = 聚合根的持久化接口
  领域层定义接口 基础设施层实现

  // domain 层定义接口
  type OrderRepository interface {
      FindByID(ctx context.Context, id string) (*Order, error)
      Save(ctx context.Context, order *Order) error
      FindByUser(ctx context.Context, userID string) ([]*Order, error)
  }
  
  // infrastructure 层实现
  type MySQLOrderRepository struct {
      db *sql.DB
  }
  
  func (r *MySQLOrderRepository) FindByID(ctx context.Context, id string) (*Order, error) {
      row := r.db.QueryRowContext(ctx,
          "SELECT id, user_id, status, total FROM orders WHERE id = ?", id)
      var order Order
      err := row.Scan(&order.ID, &order.UserID, &order.Status, &order.Total.Amount)
      if err != nil {
          return nil, err
      }
      // 加载 OrderItems
      order.Items, _ = r.loadItems(ctx, id)
      return &order, nil
  }
  
  func (r *MySQLOrderRepository) Save(ctx context.Context, order *Order) error {
      // 保存聚合根及其子实体
      tx, _ := r.db.BeginTx(ctx, nil)
      defer tx.Rollback()
      // INSERT/UPDATE order + items
      return tx.Commit()
  }

Repository 原则：
  一个聚合根一个 Repository
  Repository 只操作聚合根整体
  领域层不关心如何存储
```

---

## 6. 领域事件？

**回答：**

```
领域事件 = 领域中发生的有意义的事情

  命名：过去式 + 业务含义
  OrderCreated / PaymentCompleted / StockReserved

Go 实现：
  type DomainEvent interface {
      EventName() string
      OccurredAt() time.Time
  }
  
  type OrderCreatedEvent struct {
      OrderID   string
      UserID    string
      Total     Money
      Timestamp time.Time
  }
  
  func (e OrderCreatedEvent) EventName() string     { return "order.created" }
  func (e OrderCreatedEvent) OccurredAt() time.Time { return e.Timestamp }
  
  // 聚合根收集事件
  type Order struct {
      ID     string
      events []DomainEvent
      // ...
  }
  
  func (o *Order) AddItem(item OrderItem) {
      o.Items = append(o.Items, item)
      // 记录事件
      o.events = append(o.events, ItemAddedEvent{
          OrderID: o.ID, ItemID: item.ID,
      })
  }
  
  func (o *Order) DomainEvents() []DomainEvent {
      return o.events
  }
  
  func (o *Order) ClearEvents() {
      o.events = nil
  }

  应用服务在保存后发布事件：
  order.AddItem(item)
  repo.Save(ctx, order)
  for _, e := range order.DomainEvents() {
      eventBus.Publish(ctx, e)
  }
  order.ClearEvents()
```

---

## 7. 防腐层（ACL）？

**回答：**

```
ACL = Anti-Corruption Layer
  隔离外部系统模型 不让外部模型污染领域模型

  外部系统 → ACL(翻译/适配) → 领域模型

  场景：集成第三方支付
  // 第三方支付 SDK 返回的结构
  type ThirdPartyPayResult struct {
      Code    string
      OrderNo string
      Amt     string
      Ts      string
  }
  
  // 领域层的支付结果
  type PaymentResult struct {
      Success   bool
      OrderID   string
      Amount    Money
      PaidAt    time.Time
  }
  
  // 防腐层：翻译
  type PaymentACL struct {
      client ThirdPartyPayClient
  }
  
  func (acl *PaymentACL) Pay(ctx context.Context, order *Order) (*PaymentResult, error) {
      // 转换成第三方格式
      resp, err := acl.client.DoPay(order.ID, order.Total.String())
      if err != nil {
          return nil, err
      }
      // 翻译回领域模型
      amount, _ := strconv.ParseInt(resp.Amt, 10, 64)
      paidAt, _ := time.Parse(time.RFC3339, resp.Ts)
      return &PaymentResult{
          Success: resp.Code == "SUCCESS",
          OrderID: resp.OrderNo,
          Amount:  Money{Amount: amount, Currency: "CNY"},
          PaidAt:  paidAt,
      }, nil
  }

好处：
  第三方 SDK 升级 只改 ACL
  领域层不受污染
  可以 Mock ACL 测试
```

---

## 8. DDD 项目结构？

**回答：**

```
Go DDD 项目结构：
  project/
  ├── cmd/
  │   └── server/main.go          # 启动入口 组装依赖
  ├── internal/
  │   ├── domain/                  # 领域层（核心）
  │   │   ├── order/
  │   │   │   ├── order.go         # 聚合根
  │   │   │   ├── order_item.go    # 子实体
  │   │   │   ├── money.go         # 值对象
  │   │   │   ├── repository.go    # Repository 接口
  │   │   │   ├── service.go       # 领域服务
  │   │   │   └── events.go        # 领域事件
  │   │   └── user/
  │   ├── application/             # 应用层
  │   │   ├── order_service.go     # 应用服务（用例编排）
  │   │   └── dto/                 # 数据传输对象
  │   ├── interfaces/              # 接口层
  │   │   ├── http/                # HTTP handler
  │   │   └── grpc/                # gRPC handler
  │   └── infrastructure/          # 基础设施层
  │       ├── persistence/         # Repository 实现
  │       ├── messaging/           # MQ 实现
  │       └── external/            # 外部服务 ACL
  ├── pkg/                         # 公共包
  └── go.mod

依赖注入（main.go）：
  func main() {
      db := initDB()
      orderRepo := persistence.NewMySQLOrderRepo(db)
      orderSvc := application.NewOrderService(orderRepo)
      handler := http.NewOrderHandler(orderSvc)
      // 启动 HTTP Server
  }
```

---

## 9. DDD 实施建议？

**回答：**

```
何时用 DDD：
  ✓ 业务复杂 规则多
  ✓ 领域知识是核心竞争力
  ✓ 团队有学习意愿
  
  ✗ 简单 CRUD（杀鸡别用牛刀）
  ✗ 纯技术项目
  ✗ 团队不理解 DDD

渐进式实施：
  1. 先分层：handler → service → repository
  2. 引入领域模型：实体/值对象
  3. 梳理限界上下文
  4. 领域事件解耦
  5. 战略设计优化

常见误区：
  ┌──────────────┬──────────────────────────────┐
  │ 误区          │ 正确做法                     │
  ├──────────────┼──────────────────────────────┤
  │ 贫血模型      │ 把逻辑放回实体，不是全在Service│
  │ 到处DDD       │ 核心域用DDD，支撑域简单做    │
  │ 过度抽象      │ 先简单 后重构                │
  │ 忽视限界上下文│ 先画清边界再写代码            │
  │ 数据库驱动    │ 先设计领域模型 后考虑存储     │
  └──────────────┴──────────────────────────────┘

贫血模型 vs 充血模型：
  贫血：Entity只有getter/setter 逻辑在Service
  充血：Entity包含业务方法（DDD推崇）
  
  // 充血模型
  func (o *Order) Cancel() error {
      if o.Status == Shipped {
          return errors.New("shipped order cannot be cancelled")
      }
      o.Status = Cancelled
      o.events = append(o.events, OrderCancelledEvent{...})
      return nil
  }
```

---

## 10. DDD面试速答？

**回答：**

```
Q: 什么是限界上下文？
A: 一个明确的业务边界
   同一概念在不同上下文含义不同

Q: 实体和值对象区别？
A: 实体有唯一ID 可变
   值对象无ID 按值比较 不可变

Q: 聚合根的作用？
A: 保证一致性边界的实体根
   外部只通过聚合根操作

Q: Repository模式？
A: 领域层定义接口 基础设施层实现
   隔离领域和持久化技术

Q: 防腐层做什么？
A: 隔离外部系统模型
   翻译成领域内的概念

Q: 领域服务vs应用服务？
A: 领域服务=跨实体的业务逻辑
   应用服务=用例编排和事务管理

Q: 贫血模型vs充血模型？
A: 贫血=逻辑在Service 实体只有数据
   充血=实体包含业务方法(DDD推崇)

Q: 什么时候不用DDD？
A: 简单CRUD 纯技术项目
   团队不理解DDD 业务不复杂
```
