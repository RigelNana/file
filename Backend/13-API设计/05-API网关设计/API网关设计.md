# API网关设计

---

## 1. API网关的作用与架构？

**回答：**

```
  API网关 = 所有API请求的统一入口

  ┌─────────────────────────────────────────┐
  │              API Gateway                 │
  │  认证 → 限流 → 路由 → 协议转换 → 日志   │
  └────┬──────────┬──────────┬──────────────┘
       │          │          │
  ┌────▼───┐ ┌───▼───┐ ┌───▼───┐
  │ UserSvc│ │OrderSvc│ │PaySvc │
  └────────┘ └───────┘ └───────┘

  核心职责：
  ┌──────────────────┬──────────────────────────────┐
  │ 职责              │ 说明                         │
  ├──────────────────┼──────────────────────────────┤
  │ 路由转发          │ 根据URL/Header转发到后端服务 │
  │ 认证鉴权          │ JWT验证/OAuth2/API Key       │
  │ 限流熔断          │ 保护后端服务                 │
  │ 协议转换          │ HTTP→gRPC/WebSocket         │
  │ 请求改写          │ Header注入/路径重写          │
  │ 负载均衡          │ 多实例分发                   │
  │ 日志监控          │ 请求日志/链路追踪           │
  │ 灰度发布          │ 按比例/规则分流             │
  │ 响应缓存          │ 加速频繁请求                 │
  │ CORS              │ 跨域统一处理                 │
  └──────────────────┴──────────────────────────────┘
```

---

## 2. 网关选型？

**回答：**

```
  主流方案对比：
  ┌──────────────┬──────────────┬──────────────────┐
  │ 方案          │ 语言/特点     │ 适用场景         │
  ├──────────────┼──────────────┼──────────────────┤
  │ Kong          │ Lua/Nginx    │ 企业级 插件丰富  │
  │ APISIX        │ Lua/Nginx    │ 国产 性能极高    │
  │ Traefik       │ Go           │ K8s原生 自动发现 │
  │ Envoy         │ C++          │ Service Mesh     │
  │ Nginx         │ C            │ 简单反向代理     │
  │ 自研          │ Go           │ 定制需求         │
  └──────────────┴──────────────┴──────────────────┘

  选型建议：
  K8s场景 → Traefik/APISIX
  企业级 → Kong/APISIX
  Service Mesh → Envoy（Istio自带）
  简单场景 → Nginx + Lua
  强定制需求 → Go自研

  APISIX vs Kong：
  APISIX: etcd存储 性能更高 国内社区活跃
  Kong: PostgreSQL存储 插件生态更丰富 商业支持好
```

---

## 3. Go自研网关核心？

**回答：**

```
  基于httputil.ReverseProxy：
  type Gateway struct {
      routes   map[string]*Route
      mu       sync.RWMutex
  }
  
  type Route struct {
      PathPrefix string
      Backends   []string // 后端地址列表
      index      uint64   // 轮询计数
  }
  
  func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
      route := g.matchRoute(r.URL.Path)
      if route == nil {
          http.Error(w, "not found", 404)
          return
      }
      
      // 轮询选择后端
      idx := atomic.AddUint64(&route.index, 1)
      backend := route.Backends[idx%uint64(len(route.Backends))]
      
      target, _ := url.Parse(backend)
      proxy := httputil.NewSingleHostReverseProxy(target)
      
      // 注入Header
      r.Header.Set("X-Request-ID", uuid.New().String())
      r.Header.Set("X-Forwarded-For", r.RemoteAddr)
      
      proxy.ServeHTTP(w, r)
  }
  
  func (g *Gateway) matchRoute(path string) *Route {
      g.mu.RLock()
      defer g.mu.RUnlock()
      
      for prefix, route := range g.routes {
          if strings.HasPrefix(path, prefix) {
              return route
          }
      }
      return nil
  }

  中间件链：
  handler := chain(
      recoveryMiddleware,
      loggingMiddleware,
      corsMiddleware,
      authMiddleware,
      rateLimitMiddleware,
      gateway,
  )
```

---

## 4. 网关认证与鉴权？

**回答：**

```
  认证流程：
  Client → Gateway(验证Token) → 后端服务(信任Gateway)

  Gateway JWT验证：
  func AuthMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          // 公开接口跳过
          if isPublicRoute(r.URL.Path) {
              next.ServeHTTP(w, r)
              return
          }
          
          token := extractBearerToken(r)
          if token == "" {
              http.Error(w, "unauthorized", 401)
              return
          }
          
          claims, err := validateJWT(token)
          if err != nil {
              http.Error(w, "invalid token", 401)
              return
          }
          
          // 注入用户信息到Header（后端服务直接使用）
          r.Header.Set("X-User-ID", claims.UserID)
          r.Header.Set("X-User-Role", claims.Role)
          r.Header.Del("Authorization") // 不传Token给后端
          
          next.ServeHTTP(w, r)
      })
  }

  后端服务信任Gateway：
  只接受来自Gateway的请求（内网/mTLS）
  直接从Header读取X-User-ID
  不需要再次验证Token

  多认证方式：
  /api/* → JWT Bearer Token
  /webhook/* → 签名验证
  /open/* → API Key
```

---

## 5. 网关限流设计？

**回答：**

```
  多维度限流：
  ┌──────────────┬──────────────────────────────┐
  │ 维度          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 全局          │ 总QPS上限                    │
  │ 路由          │ 每个API独立限流              │
  │ 用户          │ 每个用户独立限流             │
  │ IP            │ 每个IP限流（防刷）           │
  │ 租户          │ 多租户SaaS按租户限流         │
  └──────────────┴──────────────────────────────┘

  令牌桶限流（Go）：
  import "golang.org/x/time/rate"
  
  type RateLimiter struct {
      limiters sync.Map // key → *rate.Limiter
      rate     rate.Limit
      burst    int
  }
  
  func (rl *RateLimiter) GetLimiter(key string) *rate.Limiter {
      if v, ok := rl.limiters.Load(key); ok {
          return v.(*rate.Limiter)
      }
      limiter := rate.NewLimiter(rl.rate, rl.burst)
      rl.limiters.Store(key, limiter)
      return limiter
  }
  
  func RateLimitMiddleware(rl *RateLimiter) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              key := getClientIP(r)
              limiter := rl.GetLimiter(key)
              
              if !limiter.Allow() {
                  w.Header().Set("Retry-After", "1")
                  http.Error(w, "too many requests", 429)
                  return
              }
              next.ServeHTTP(w, r)
          })
      }
  }

  分布式限流 → Redis + Lua脚本
```

---

## 6. 协议转换与请求改写？

**回答：**

```
  HTTP → gRPC转换：
  客户端发HTTP JSON → 网关转为gRPC调用

  请求/响应改写：
  1. 路径重写
     /api/v1/users → /users（去掉前缀）
  
  2. Header注入
     X-Request-ID（请求追踪）
     X-User-ID（认证信息传递）
     X-Forwarded-For（客户端IP）
  
  3. 请求体转换
     JSON → Protobuf
     XML → JSON
  
  4. 响应改写
     移除内部Header
     统一包装响应格式

  Go请求改写：
  func RewriteMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          // 路径重写
          r.URL.Path = strings.TrimPrefix(r.URL.Path, "/api/v1")
          
          // 注入请求ID
          requestID := r.Header.Get("X-Request-ID")
          if requestID == "" {
              requestID = uuid.New().String()
              r.Header.Set("X-Request-ID", requestID)
          }
          
          // 响应Header
          w.Header().Set("X-Request-ID", requestID)
          
          next.ServeHTTP(w, r)
      })
  }

  聚合请求（API组合）：
  一个前端请求 → 网关并行调用多个后端
  → 聚合结果返回
  BFF模式常用
```

---

## 7. 网关高可用？

**回答：**

```
  网关本身的高可用：
  无状态设计 → 水平扩展
  前面加负载均衡（LB/VIP）

  架构：
  客户端 → DNS → LB(L4) → Gateway集群 → 后端服务
                ┌──────┐
                │ GW-1 │
  LB ──────────┤ GW-2 │
                │ GW-3 │
                └──────┘

  K8s部署：
  apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: api-gateway
  spec:
    replicas: 3
    template:
      spec:
        containers:
        - name: gateway
          resources:
            requests:
              cpu: 500m
              memory: 256Mi
          readinessProbe:
            httpGet:
              path: /healthz
              port: 8080
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
  ---
  apiVersion: autoscaling/v2
  kind: HorizontalPodAutoscaler
  spec:
    minReplicas: 3
    maxReplicas: 10
    metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 70

  优雅关闭：
  网关收到SIGTERM → 停止接受新请求
  → 等待进行中请求完成 → 关闭
```

---

## 8. 灰度发布与流量管理？

**回答：**

```
  网关灰度发布：
  根据规则将部分流量路由到新版本

  灰度策略：
  1. 按比例 → 10%流量到v2
  2. 按Header → X-Version: v2
  3. 按用户ID → 特定用户走v2
  4. 按Cookie → 灰度标记

  Go灰度路由：
  type CanaryConfig struct {
      Weight    int      // 灰度比例 0-100
      Headers   map[string]string
      UserIDs   []string
  }
  
  func CanaryMiddleware(config CanaryConfig, v1, v2 http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          useCanary := false
          
          // 规则1: Header匹配
          for k, v := range config.Headers {
              if r.Header.Get(k) == v {
                  useCanary = true
                  break
              }
          }
          
          // 规则2: 用户ID匹配
          userID := r.Header.Get("X-User-ID")
          for _, id := range config.UserIDs {
              if userID == id {
                  useCanary = true
                  break
              }
          }
          
          // 规则3: 按比例
          if !useCanary && rand.Intn(100) < config.Weight {
              useCanary = true
          }
          
          if useCanary {
              v2.ServeHTTP(w, r)
          } else {
              v1.ServeHTTP(w, r)
          }
      })
  }
```

---

## 9. 网关可观测性？

**回答：**

```
  三大支柱：
  1. 日志（Logging）
     请求日志：方法/路径/状态码/延迟/客户端IP
  
  2. 指标（Metrics）
     QPS、延迟P50/P95/P99、错误率
     按路由/后端/状态码分维度
  
  3. 链路追踪（Tracing）
     网关注入TraceID → 传递给后端

  Prometheus指标：
  var (
      requestDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
          Name:    "gateway_request_duration_seconds",
          Buckets: prometheus.DefBuckets,
      }, []string{"method", "path", "status"})
      
      requestTotal = promauto.NewCounterVec(prometheus.CounterOpts{
          Name: "gateway_requests_total",
      }, []string{"method", "path", "status"})
  )
  
  func MetricsMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          start := time.Now()
          rw := &responseWriter{ResponseWriter: w, statusCode: 200}
          
          next.ServeHTTP(rw, r)
          
          status := strconv.Itoa(rw.statusCode)
          duration := time.Since(start).Seconds()
          
          requestTotal.WithLabelValues(r.Method, r.URL.Path, status).Inc()
          requestDuration.WithLabelValues(r.Method, r.URL.Path, status).Observe(duration)
      })
  }

  访问日志：
  {
    "timestamp": "2024-01-01T00:00:00Z",
    "method": "GET",
    "path": "/v1/users",
    "status": 200,
    "duration_ms": 45,
    "client_ip": "10.0.0.1",
    "request_id": "abc-123",
    "upstream": "user-svc:8080"
  }
```

---

## 10. API网关面试速答？

**回答：**

```
Q: API网关核心职责？
A: 路由+认证+限流+协议转换+日志
   所有请求的统一入口

Q: 网关怎么选型？
A: K8s→Traefik/APISIX
   企业级→Kong/APISIX 定制→Go自研

Q: 网关怎么做认证？
A: Gateway验证JWT 注入X-User-ID到Header
   后端信任Gateway 不再验证Token

Q: 网关限流怎么做？
A: 多维度(IP/用户/路由/全局)
   单机令牌桶 分布式Redis+Lua

Q: 网关怎么保证高可用？
A: 无状态+水平扩展+LB前置
   K8s Deployment多副本+HPA

Q: 协议转换怎么做？
A: HTTP JSON→gRPC Protobuf
   gRPC-Gateway自动生成

Q: 灰度发布怎么做？
A: 按比例/Header/用户ID分流
   网关路由到不同版本后端

Q: 网关监控什么指标？
A: QPS/延迟P99/错误率/后端健康
   Prometheus指标+访问日志+链路追踪
```
