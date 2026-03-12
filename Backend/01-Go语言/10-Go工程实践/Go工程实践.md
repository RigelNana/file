# Go工程实践

---

## 1. Go 项目标准布局？

**回答：**

```
推荐项目结构 (参考 golang-standards/project-layout):

  myproject/
  ├── cmd/                    # 入口程序 (main.go)
  │   ├── api-server/
  │   │   └── main.go
  │   └── worker/
  │       └── main.go
  ├── internal/               # 私有代码 (不可被外部导入)
  │   ├── handler/            # HTTP Handler
  │   ├── service/            # 业务逻辑
  │   ├── repository/         # 数据访问
  │   ├── model/              # 数据模型
  │   └── middleware/         # 中间件
  ├── pkg/                    # 公共库 (可被外部导入)
  │   ├── logger/
  │   └── httputil/
  ├── api/                    # API 定义 (OpenAPI/protobuf)
  ├── configs/                # 配置文件模板
  ├── scripts/                # 脚本
  ├── migrations/             # 数据库迁移
  ├── docs/                   # 文档
  ├── test/                   # 集成测试/测试数据
  ├── go.mod
  ├── go.sum
  ├── Makefile
  ├── Dockerfile
  └── README.md

关键规则:
  ┌──────────────┬──────────────────────────────┐
  │ 目录          │ 意义                          │
  ├──────────────┼──────────────────────────────┤
  │ cmd/          │ 每个可执行文件一个子目录       │
  │ internal/     │ Go 强制: 包外不可导入          │
  │ pkg/          │ 可被外部项目使用的公共代码     │
  │ api/          │ API 定义 (proto/openapi)      │
  └──────────────┴──────────────────────────────┘
```

---

## 2. 依赖注入与分层架构？

**回答：**

```go
// 分层架构: Handler → Service → Repository

// 1. Repository 层 (数据访问)
type UserRepository interface {
    GetByID(ctx context.Context, id int64) (*model.User, error)
    Create(ctx context.Context, user *model.User) error
}

type userRepo struct{ db *sql.DB }

func NewUserRepository(db *sql.DB) UserRepository {
    return &userRepo{db: db}
}

// 2. Service 层 (业务逻辑)
type UserService struct {
    repo  UserRepository
    cache CacheService
}

func NewUserService(repo UserRepository, cache CacheService) *UserService {
    return &UserService{repo: repo, cache: cache}
}

func (s *UserService) GetUser(ctx context.Context, id int64) (*model.User, error) {
    // 先查缓存
    if u, err := s.cache.Get(ctx, id); err == nil {
        return u, nil
    }
    // 查数据库
    return s.repo.GetByID(ctx, id)
}

// 3. Handler 层 (HTTP 处理)
type UserHandler struct {
    svc *UserService
}

func NewUserHandler(svc *UserService) *UserHandler {
    return &UserHandler{svc: svc}
}

// 4. 组装 (main.go 或 wire)
func main() {
    db := connectDB()
    cache := connectRedis()
    
    userRepo := NewUserRepository(db)
    cacheService := NewCacheService(cache)
    userService := NewUserService(userRepo, cacheService)
    userHandler := NewUserHandler(userService)
    
    // 路由注册
    r := http.NewServeMux()
    r.HandleFunc("/users/", userHandler.GetUser)
}

// 依赖注入工具:
// wire (Google): 编译时 DI, 代码生成
// fx (Uber): 运行时 DI, 基于反射
// dig (Uber): fx 的底层库
```

---

## 3. Go Module 管理？

**回答：**

```bash
# Go Module 基本操作
go mod init github.com/user/project   # 初始化
go mod tidy                            # 整理依赖 (增删)
go mod download                        # 下载依赖
go mod vendor                          # 创建 vendor 目录
go mod verify                          # 校验依赖完整性
go mod graph                           # 依赖图
go mod why <pkg>                       # 为什么需要某依赖

# 代理设置 (国内)
go env -w GOPROXY=https://goproxy.cn,direct
go env -w GOPRIVATE=github.com/mycompany/*

# 版本选择
go get github.com/pkg/errors@v0.9.1    # 指定版本
go get github.com/pkg/errors@latest     # 最新版
go get -u ./...                         # 更新所有依赖

# go.mod 主要指令:
# module: 模块路径
# go: 最低 Go 版本
# require: 依赖列表
# replace: 替换依赖路径 (本地开发)
# exclude: 排除某个版本
# retract: 撤回已发布版本
```

```
版本语义:
  v1.2.3
  │ │ └── Patch: 修 Bug, 向后兼容
  │ └──── Minor: 新功能, 向后兼容
  └────── Major: 破坏性变更

  v2+: 必须修改 module path
    module github.com/user/pkg/v2
    import "github.com/user/pkg/v2"

最佳实践:
  定期 go mod tidy 清理
  CI 中 go mod verify 校验
  go.sum 必须提交到 Git
  私有库设好 GOPRIVATE
```

---

## 4. 配置管理与初始化？

**回答：**

```go
// 配置管理: Viper (最流行) 或环境变量

// 方式1: 结构化配置 + 环境变量
type Config struct {
    Server   ServerConfig   `mapstructure:"server"`
    Database DatabaseConfig `mapstructure:"database"`
    Redis    RedisConfig    `mapstructure:"redis"`
    Log      LogConfig      `mapstructure:"log"`
}

type ServerConfig struct {
    Port         int           `mapstructure:"port" envconfig:"SERVER_PORT"`
    ReadTimeout  time.Duration `mapstructure:"read_timeout"`
    WriteTimeout time.Duration `mapstructure:"write_timeout"`
}

// 方式2: Viper 加载
func LoadConfig(path string) (*Config, error) {
    viper.SetConfigFile(path)
    viper.AutomaticEnv()          // 环境变量覆盖
    viper.SetEnvKeyReplacer(
        strings.NewReplacer(".", "_"),
    )
    
    if err := viper.ReadInConfig(); err != nil {
        return nil, err
    }
    
    var cfg Config
    if err := viper.Unmarshal(&cfg); err != nil {
        return nil, err
    }
    return &cfg, nil
}

// 方式3: 纯环境变量 (12-Factor App)
type Config struct {
    Port    int    `env:"PORT" envDefault:"8080"`
    DBHost  string `env:"DB_HOST,required"`
    DBPort  int    `env:"DB_PORT" envDefault:"5432"`
    Debug   bool   `env:"DEBUG" envDefault:"false"`
}
// 使用 github.com/caarlos0/env/v10 解析

// 初始化顺序:
// 1. 加载配置
// 2. 初始化日志
// 3. 连接数据库/缓存
// 4. 初始化服务
// 5. 启动 HTTP 服务
// 6. 优雅关闭
```

---

## 5. 优雅关闭 (Graceful Shutdown)？

**回答：**

```go
func main() {
    srv := &http.Server{
        Addr:    ":8080",
        Handler: setupRouter(),
    }

    // 启动服务 (非阻塞)
    go func() {
        if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("listen: %s", err)
        }
    }()

    // 等待信号
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit
    log.Println("Shutting down server...")

    // 优雅关闭: 最多等 30 秒
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := srv.Shutdown(ctx); err != nil {
        log.Fatalf("Server forced to shutdown: %v", err)
    }

    // 关闭其他资源
    db.Close()
    rdb.Close()
    
    log.Println("Server exited")
}

// K8s 配合:
// 1. Pod 收到 SIGTERM
// 2. K8s 同时从 Service endpoints 移除 Pod
// 3. 有 terminationGracePeriodSeconds (默认 30s)
// 4. 服务继续处理已有请求, 拒绝新连接
// 5. 超时后 SIGKILL 强杀

// preStop Hook 延迟:
// lifecycle:
//   preStop:
//     exec:
//       command: ["sh", "-c", "sleep 5"]
// → 等 5 秒让 endpoints 更新完再开始关闭
```

---

## 6. 日志规范与实践？

**回答：**

```go
// 推荐: 结构化日志 (zap / slog)

// Go 1.21+ 标准库 slog
import "log/slog"

logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
    Level: slog.LevelInfo,
}))

logger.Info("user created",
    slog.Int64("user_id", 123),
    slog.String("name", "Alice"),
    slog.Duration("latency", 42*time.Millisecond),
)
// {"time":"...","level":"INFO","msg":"user created","user_id":123,"name":"Alice","latency":"42ms"}

// Zap (高性能)
import "go.uber.org/zap"

logger, _ := zap.NewProduction()
defer logger.Sync()

logger.Info("user created",
    zap.Int64("user_id", 123),
    zap.String("name", "Alice"),
)

// 日志规范:
// 1. 必须用结构化日志 (JSON), 不用 fmt.Println
// 2. 日志级别: DEBUG < INFO < WARN < ERROR
// 3. 每条日志必须有: timestamp, level, message, traceID
// 4. 错误日志必须有: error 字段 + 上下文
// 5. 敏感信息脱敏 (密码/token/手机号)
// 6. 不在循环中打日志 (影响性能)
```

```
日志级别使用规范:
  ┌──────────┬──────────────────────────────────┐
  │ 级别      │ 用途                              │
  ├──────────┼──────────────────────────────────┤
  │ DEBUG    │ 开发调试, 生产关闭                 │
  │ INFO     │ 关键业务流程 (用户登录/订单创建)    │
  │ WARN     │ 可恢复的异常 (重试成功/降级)       │
  │ ERROR    │ 需要关注的错误 (DB失败/外部超时)    │
  │ FATAL    │ 致命错误, 程序退出 (极少使用)       │
  └──────────┴──────────────────────────────────┘
```

---

## 7. 中间件模式？

**回答：**

```go
// 中间件: 洋葱模型, 请求→中间件链→Handler→中间件链→响应

type Middleware func(http.Handler) http.Handler

// 日志中间件
func LoggingMiddleware(logger *slog.Logger) Middleware {
    return func(next http.Handler) http.Handler {
        return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            start := time.Now()
            
            // 包装 ResponseWriter 捕获状态码
            ww := &responseWriter{ResponseWriter: w, status: 200}
            
            next.ServeHTTP(ww, r)
            
            logger.Info("request",
                slog.String("method", r.Method),
                slog.String("path", r.URL.Path),
                slog.Int("status", ww.status),
                slog.Duration("latency", time.Since(start)),
            )
        })
    }
}

// Recovery 中间件
func RecoveryMiddleware() Middleware {
    return func(next http.Handler) http.Handler {
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
}

// 中间件链
func Chain(handler http.Handler, middlewares ...Middleware) http.Handler {
    for i := len(middlewares) - 1; i >= 0; i-- {
        handler = middlewares[i](handler)
    }
    return handler
}

// 使用:
handler := Chain(myHandler,
    RecoveryMiddleware(),
    LoggingMiddleware(logger),
    AuthMiddleware(authSvc),
    RateLimitMiddleware(limiter),
)
```

---

## 8. Context 最佳实践？

**回答：**

```go
// Context 使用规范

// 1. context 作为第一个参数传递
func GetUser(ctx context.Context, id int64) (*User, error)

// 2. 不要存在 struct 里
// 差: type Service struct { ctx context.Context }
// 好: 每个方法接收 ctx 参数

// 3. 超时传播
func handler(w http.ResponseWriter, r *http.Request) {
    ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
    defer cancel()
    
    user, err := userService.GetUser(ctx, id)
    // 如果 5 秒超时, 下游所有调用都会取消
}

// 4. 传递请求级数据 (traceID/userID)
type contextKey string
const traceIDKey contextKey = "traceID"

func WithTraceID(ctx context.Context, id string) context.Context {
    return context.WithValue(ctx, traceIDKey, id)
}

func TraceIDFrom(ctx context.Context) string {
    id, _ := ctx.Value(traceIDKey).(string)
    return id
}

// 5. 响应 Context 取消
func longTask(ctx context.Context) error {
    for i := 0; i < 1000; i++ {
        select {
        case <-ctx.Done():
            return ctx.Err() // context.Canceled 或 DeadlineExceeded
        default:
            doWork(i)
        }
    }
    return nil
}
```

```
Context 规则:
  ┌──────────────────┬──────────────────────────────┐
  │ 规则              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ 第一个参数        │ func Foo(ctx context.Context) │
  │ 不存 struct       │ 每次调用传入, 不缓存           │
  │ 不传 nil          │ 不确定就用 context.TODO()      │
  │ 只传请求级数据    │ traceID/userID, 不传业务数据  │
  │ cancel 必须调用   │ defer cancel() 防泄漏         │
  │ Value key 用私有类型│ 避免冲突                    │
  └──────────────────┴──────────────────────────────┘
```

---

## 9. Go 代码规范与 Linter？

**回答：**

```bash
# 代码格式化 (强制)
gofmt -w .      # 标准格式化
goimports -w .  # 格式化 + 管理 import

# golangci-lint (最全面的 Linter 聚合工具)
golangci-lint run ./...

# .golangci.yml 配置示例
linters:
  enable:
    - errcheck       # 检查错误是否被忽略
    - govet          # go vet 检查
    - staticcheck    # 静态分析
    - gosimple       # 简化建议
    - ineffassign    # 无效赋值
    - unused         # 未使用的代码
    - misspell       # 拼写检查
    - gocritic       # 代码风格建议
    - revive         # golint 替代
    - gosec          # 安全检查
    - prealloc       # 建议预分配

linters-settings:
  govet:
    check-shadowing: true
  errcheck:
    check-blank: true

issues:
  exclude-use-default: false
  max-issues-per-linter: 0
```

```
Go 代码规范要点:
  ┌──────────────────┬──────────────────────────────┐
  │ 规范              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ 命名              │ 驼峰, 首字母大小写控制导出     │
  │ 错误处理          │ 不忽略 error, 不 panic       │
  │ 包命名            │ 小写单词, 不用下划线/复数      │
  │ 接口命名          │ -er 后缀 (Reader/Writer)     │
  │ error 变量        │ Err 前缀 (ErrNotFound)       │
  │ 注释              │ 导出符号必须注释              │
  │ import 分组       │ 标准库/第三方/本项目 三组      │
  │ 不用 init()       │ 避免隐式初始化, 显式调用      │
  └──────────────────┴──────────────────────────────┘
```

---

## 10. Go工程实践面试速答？

**回答：**

```
Q: Go 项目标准布局?
A: cmd/ (入口), internal/ (私有), pkg/ (公共)
   internal 强制不可被外部导入
   分层: handler → service → repository

Q: 怎么做依赖注入?
A: 构造函数参数注入 (New 函数接收接口)
   在 main 中手动组装, 或用 wire/fx
   接口定义在消费端, 不在实现端

Q: Go Module 怎么管理?
A: go mod tidy 整理, go.sum 必须提交
   GOPROXY 设国内镜像, GOPRIVATE 设私有库
   v2+ 必须改 module path

Q: 优雅关闭怎么做?
A: 监听 SIGTERM/SIGINT → srv.Shutdown(ctx)
   设超时 (30s), 处理完已有请求再退出
   K8s 配合 preStop hook 和 terminationGracePeriod

Q: 日志用什么?
A: slog (Go1.21 标准库) 或 zap
   必须结构化 (JSON), 带 traceID
   敏感信息脱敏, 不在循环中打日志

Q: Context 怎么用?
A: 第一个参数传, 不存 struct, 不传 nil
   传请求级数据 (traceID), cancel 必须 defer
   用私有类型做 key 避免冲突

Q: 用什么 Linter?
A: golangci-lint (聚合工具)
   必须启用: errcheck, govet, staticcheck
   CI 中必须跑 lint, 不通过不合并

Q: 中间件模式?
A: func(http.Handler) http.Handler
   洋葱模型: 日志→认证→限流→Handler→限流→认证→日志
   Chain 函数串联多个中间件
```
