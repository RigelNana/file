# 设计模式Go实现

---

## 1. 接口+组合替代继承？

**回答：**

```
Go 的哲学：
  没有 class / 继承
  用 struct embedding + interface 实现 OOP

  继承问题 → Go 的解法：
  多态 → 接口 interface
  复用 → 组合（embedding）
  封装 → 首字母大小写
```

```go
// 行为定义：接口
type Saver interface {
    Save(ctx context.Context, data []byte) error
}

type Loader interface {
    Load(ctx context.Context, key string) ([]byte, error)
}

// 能力复用：组合
type BaseRepository struct {
    db *sql.DB
}

func (r *BaseRepository) Exec(ctx context.Context, query string, args ...interface{}) error {
    _, err := r.db.ExecContext(ctx, query, args...)
    return err
}

// 组合 = 嵌入 + 扩展
type UserRepository struct {
    BaseRepository  // 获得 Exec 能力
}

func (r *UserRepository) Save(ctx context.Context, user *User) error {
    return r.Exec(ctx, "INSERT INTO users ...", user.Name)
}

type OrderRepository struct {
    BaseRepository
}

func (r *OrderRepository) Save(ctx context.Context, order *Order) error {
    return r.Exec(ctx, "INSERT INTO orders ...", order.Total)
}
```

---

## 2. Go 中间件模式？

**回答：**

```
Go 最经典的设计模式应用

  Request → [Auth] → [Log] → [Metrics] → Handler → Response
```

```go
type Middleware func(http.Handler) http.Handler

// 日志中间件
func Logger(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        start := time.Now()
        
        // 包装 ResponseWriter 获取状态码
        ww := &statusWriter{ResponseWriter: w, status: 200}
        
        next.ServeHTTP(ww, r)
        
        log.Printf("%s %s %d %v",
            r.Method, r.URL.Path, ww.status, time.Since(start))
    })
}

type statusWriter struct {
    http.ResponseWriter
    status int
}

func (w *statusWriter) WriteHeader(code int) {
    w.status = code
    w.ResponseWriter.WriteHeader(code)
}

// 恢复中间件
func Recovery(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        defer func() {
            if err := recover(); err != nil {
                log.Printf("panic: %v\n%s", err, debug.Stack())
                http.Error(w, "Internal Server Error", 500)
            }
        }()
        next.ServeHTTP(w, r)
    })
}

// 链式组合
func Chain(middlewares ...Middleware) Middleware {
    return func(handler http.Handler) http.Handler {
        for i := len(middlewares) - 1; i >= 0; i-- {
            handler = middlewares[i](handler)
        }
        return handler
    }
}

// 使用
mux := http.NewServeMux()
mux.HandleFunc("/api/users", handleUsers)

handler := Chain(Recovery, Logger, Auth)(mux)
http.ListenAndServe(":8080", handler)
```

---

## 3. Go 版策略模式？

**回答：**

```go
// 接口即策略
type Compressor interface {
    Compress(data []byte) ([]byte, error)
    Decompress(data []byte) ([]byte, error)
}

type GzipCompressor struct{}
func (c *GzipCompressor) Compress(data []byte) ([]byte, error) {
    var buf bytes.Buffer
    w := gzip.NewWriter(&buf)
    w.Write(data)
    w.Close()
    return buf.Bytes(), nil
}
func (c *GzipCompressor) Decompress(data []byte) ([]byte, error) {
    r, _ := gzip.NewReader(bytes.NewReader(data))
    return io.ReadAll(r)
}

type SnappyCompressor struct{}
func (c *SnappyCompressor) Compress(data []byte) ([]byte, error) {
    return snappy.Encode(nil, data), nil
}
func (c *SnappyCompressor) Decompress(data []byte) ([]byte, error) {
    return snappy.Decode(nil, data)
}

// 使用策略
type FileStore struct {
    compressor Compressor
}

func NewFileStore(comp Compressor) *FileStore {
    return &FileStore{compressor: comp}
}

func (s *FileStore) Save(path string, data []byte) error {
    compressed, err := s.compressor.Compress(data)
    if err != nil {
        return err
    }
    return os.WriteFile(path, compressed, 0644)
}

// 注入不同策略
store := NewFileStore(&GzipCompressor{})    // gzip 压缩
store := NewFileStore(&SnappyCompressor{})  // snappy 压缩
```

---

## 4. Go 版观察者模式？

**回答：**

```go
// 类型安全的事件系统（泛型）
type EventBus[T any] struct {
    mu       sync.RWMutex
    handlers []func(T)
}

func NewEventBus[T any]() *EventBus[T] {
    return &EventBus[T]{}
}

func (b *EventBus[T]) Subscribe(handler func(T)) {
    b.mu.Lock()
    defer b.mu.Unlock()
    b.handlers = append(b.handlers, handler)
}

func (b *EventBus[T]) Publish(event T) {
    b.mu.RLock()
    handlers := make([]func(T), len(b.handlers))
    copy(handlers, b.handlers)
    b.mu.RUnlock()
    
    for _, h := range handlers {
        h(event)
    }
}

// 使用
type OrderCreated struct {
    OrderID string
    UserID  string
    Amount  float64
}

bus := NewEventBus[OrderCreated]()

bus.Subscribe(func(e OrderCreated) {
    fmt.Printf("Send email for order %s\n", e.OrderID)
})

bus.Subscribe(func(e OrderCreated) {
    fmt.Printf("Update inventory for order %s\n", e.OrderID)
})

bus.Publish(OrderCreated{OrderID: "001", UserID: "u1", Amount: 99.9})
```

---

## 5. Go 版 Repository 模式？

**回答：**

```go
// 仓储模式：数据访问抽象
type User struct {
    ID    string
    Name  string
    Email string
}

type UserRepository interface {
    FindByID(ctx context.Context, id string) (*User, error)
    FindByEmail(ctx context.Context, email string) (*User, error)
    Save(ctx context.Context, user *User) error
    Delete(ctx context.Context, id string) error
    List(ctx context.Context, offset, limit int) ([]*User, error)
}

// MySQL 实现
type MySQLUserRepo struct {
    db *sql.DB
}

func NewMySQLUserRepo(db *sql.DB) UserRepository {
    return &MySQLUserRepo{db: db}
}

func (r *MySQLUserRepo) FindByID(ctx context.Context, id string) (*User, error) {
    user := &User{}
    err := r.db.QueryRowContext(ctx,
        "SELECT id, name, email FROM users WHERE id = ?", id,
    ).Scan(&user.ID, &user.Name, &user.Email)
    if err == sql.ErrNoRows {
        return nil, ErrNotFound
    }
    return user, err
}

func (r *MySQLUserRepo) Save(ctx context.Context, user *User) error {
    _, err := r.db.ExecContext(ctx,
        "INSERT INTO users (id, name, email) VALUES (?, ?, ?) "+
            "ON DUPLICATE KEY UPDATE name=?, email=?",
        user.ID, user.Name, user.Email, user.Name, user.Email)
    return err
}

// Service 依赖接口
type UserService struct {
    repo UserRepository
}

func (s *UserService) GetUser(ctx context.Context, id string) (*User, error) {
    return s.repo.FindByID(ctx, id)
}
```

---

## 6. Go 版装饰器（接口包装）？

**回答：**

```go
// 通用服务装饰器
type UserService interface {
    GetUser(ctx context.Context, id string) (*User, error)
    CreateUser(ctx context.Context, user *User) error
}

// 日志装饰器
type LoggingUserService struct {
    next   UserService
    logger *slog.Logger
}

func NewLoggingUserService(next UserService, logger *slog.Logger) UserService {
    return &LoggingUserService{next: next, logger: logger}
}

func (s *LoggingUserService) GetUser(ctx context.Context, id string) (*User, error) {
    s.logger.Info("GetUser", "id", id)
    user, err := s.next.GetUser(ctx, id)
    if err != nil {
        s.logger.Error("GetUser failed", "id", id, "error", err)
    }
    return user, err
}

func (s *LoggingUserService) CreateUser(ctx context.Context, user *User) error {
    s.logger.Info("CreateUser", "user", user.Name)
    return s.next.CreateUser(ctx, user)
}

// 缓存装饰器
type CachedUserService struct {
    next  UserService
    cache *redis.Client
}

func (s *CachedUserService) GetUser(ctx context.Context, id string) (*User, error) {
    // 查缓存
    key := "user:" + id
    if data, err := s.cache.Get(ctx, key).Bytes(); err == nil {
        var user User
        json.Unmarshal(data, &user)
        return &user, nil
    }
    
    // 查下层
    user, err := s.next.GetUser(ctx, id)
    if err != nil {
        return nil, err
    }
    
    // 写缓存
    data, _ := json.Marshal(user)
    s.cache.Set(ctx, key, data, 5*time.Minute)
    return user, nil
}

// 层层包装
var svc UserService = &RealUserService{db: db}
svc = &CachedUserService{next: svc, cache: rdb}
svc = &LoggingUserService{next: svc, logger: logger}
// 调用顺序：Logging → Cache → Real
```

---

## 7. Go 版状态机？

**回答：**

```go
// 使用 map + 函数实现简洁的状态机
type State string
type Event string

const (
    StatePending   State = "pending"
    StatePaid      State = "paid"
    StateShipped   State = "shipped"
    StateCompleted State = "completed"
    StateCancelled State = "cancelled"
)

const (
    EventPay    Event = "pay"
    EventShip   Event = "ship"
    EventReceive Event = "receive"
    EventCancel Event = "cancel"
)

type Transition struct {
    From   State
    Event  Event
    To     State
    Action func(ctx context.Context, order *Order) error
}

type StateMachine struct {
    transitions map[State]map[Event]*Transition
}

func NewOrderStateMachine() *StateMachine {
    sm := &StateMachine{
        transitions: make(map[State]map[Event]*Transition),
    }
    
    sm.AddTransition(StatePending, EventPay, StatePaid, onPay)
    sm.AddTransition(StatePending, EventCancel, StateCancelled, onCancel)
    sm.AddTransition(StatePaid, EventShip, StateShipped, onShip)
    sm.AddTransition(StatePaid, EventCancel, StateCancelled, onRefund)
    sm.AddTransition(StateShipped, EventReceive, StateCompleted, onReceive)
    
    return sm
}

func (sm *StateMachine) AddTransition(from State, event Event, to State, action func(context.Context, *Order) error) {
    if sm.transitions[from] == nil {
        sm.transitions[from] = make(map[Event]*Transition)
    }
    sm.transitions[from][event] = &Transition{From: from, Event: event, To: to, Action: action}
}

func (sm *StateMachine) Fire(ctx context.Context, order *Order, event Event) error {
    events, ok := sm.transitions[order.State]
    if !ok {
        return fmt.Errorf("no transitions from state %s", order.State)
    }
    
    t, ok := events[event]
    if !ok {
        return fmt.Errorf("invalid event %s in state %s", event, order.State)
    }
    
    if err := t.Action(ctx, order); err != nil {
        return err
    }
    
    order.State = t.To
    return nil
}
```

---

## 8. Go 依赖注入实践？

**回答：**

```go
// 手动 DI（小项目推荐）
func main() {
    // 基础设施
    db, _ := sql.Open("mysql", dsn)
    rdb := redis.NewClient(&redis.Options{Addr: "localhost:6379"})
    logger := slog.Default()
    
    // Repository 层
    userRepo := NewMySQLUserRepo(db)
    orderRepo := NewMySQLOrderRepo(db)
    
    // Service 层
    userSvc := NewUserService(userRepo, rdb)
    orderSvc := NewOrderService(orderRepo, userSvc)
    
    // Handler 层
    userHandler := NewUserHandler(userSvc)
    orderHandler := NewOrderHandler(orderSvc)
    
    // Router
    mux := http.NewServeMux()
    mux.HandleFunc("GET /users/{id}", userHandler.Get)
    mux.HandleFunc("POST /orders", orderHandler.Create)
    
    server := &http.Server{
        Addr:    ":8080",
        Handler: Chain(Recovery, Logger)(mux),
    }
    server.ListenAndServe()
}

// Wire DI（大项目推荐）
// wire.go
//go:build wireinject

func InitApp(cfg *Config) (*App, error) {
    wire.Build(
        // 基础设施
        NewDB,
        NewRedis,
        NewLogger,
        // Repository
        NewMySQLUserRepo,
        wire.Bind(new(UserRepository), new(*MySQLUserRepo)),
        // Service
        NewUserService,
        NewOrderService,
        // Handler
        NewUserHandler,
        NewOrderHandler,
        // App
        NewApp,
    )
    return nil, nil
}
```

---

## 9. 常用 Go 设计模式总结？

**回答：**

```
  ┌──────────────────┬──────────────┬─────────────────┐
  │ 模式              │ Go 实现      │ 典型场景        │
  ├──────────────────┼──────────────┼─────────────────┤
  │ 函数选项          │ Option func  │ 构造复杂对象    │
  │ 中间件            │ func(H) H    │ HTTP/gRPC链     │
  │ 策略              │ interface    │ 算法替换        │
  │ 观察者            │ EventBus     │ 事件通知        │
  │ 单例              │ sync.Once    │ 全局资源        │
  │ 工厂              │ NewXxx()     │ 对象创建        │
  │ 装饰器            │ 接口包装     │ 日志/缓存/监控  │
  │ 仓储              │ interface    │ 数据访问        │
  │ 状态机            │ map+func     │ 状态流转        │
  │ Worker Pool       │ chan + WG    │ 并发控制        │
  │ Pipeline          │ chan 串联    │ 数据处理流水线  │
  │ singleflight     │ x/sync       │ 缓存防击穿      │
  └──────────────────┴──────────────┴─────────────────┘
```

---

## 10. 设计模式Go实现面试速答？

**回答：**

```
Q: Go 怎么实现多态？
A: 接口 interface
   隐式实现 不需要 implements

Q: Go 怎么代替继承？
A: struct embedding 复用
   interface 多态

Q: Go 最常用的设计模式？
A: 函数选项、中间件、策略
   工厂函数、装饰器包装

Q: Go 中间件怎么写？
A: func(http.Handler) http.Handler
   Chain 链式组合

Q: Go 状态机怎么实现？
A: map[State]map[Event]Transition
   Fire 触发状态转换

Q: Go DI 怎么做？
A: 小项目手动DI(main组装)
   大项目用Wire代码生成

Q: Repository 模式？
A: 接口定义数据访问
   具体实现MySQL/Mongo等
   Service层依赖接口

Q: Go 事件系统怎么实现？
A: EventBus + Subscribe/Publish
   泛型保证类型安全
```
