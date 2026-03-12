# API限流与降级

---

## 1. 限流算法详解？

**回答：**

```
  四种限流算法：
  ┌──────────────┬──────────────────┬──────────────────┐
  │ 算法          │ 原理              │ 特点             │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 固定窗口      │ 时间窗口计数      │ 简单 有边界问题  │
  │ 滑动窗口      │ 滑动时间段计数    │ 精确 内存占用大  │
  │ 漏桶          │ 固定速率流出      │ 平滑 不处理突发  │
  │ 令牌桶        │ 固定速率放Token   │ 允许突发 推荐    │
  └──────────────┴──────────────────┴──────────────────┘

  令牌桶（Token Bucket）：
  以固定速率往桶里放Token
  每个请求消耗一个Token
  桶满时丢弃新Token
  桶空时拒绝请求
  → 允许短暂突发（桶里有存量）

  Go令牌桶（标准库）：
  import "golang.org/x/time/rate"
  
  // 每秒10个请求 突发20
  limiter := rate.NewLimiter(10, 20)
  
  if !limiter.Allow() {
      // 拒绝
      http.Error(w, "too many requests", 429)
      return
  }

  滑动窗口（Redis实现）：
  -- Lua脚本
  local key = KEYS[1]
  local window = tonumber(ARGV[1])  -- 窗口大小(秒)
  local limit = tonumber(ARGV[2])   -- 限制次数
  local now = tonumber(ARGV[3])     -- 当前时间
  
  redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
  local count = redis.call('ZCARD', key)
  if count < limit then
      redis.call('ZADD', key, now, now .. math.random())
      redis.call('EXPIRE', key, window)
      return 1
  end
  return 0
```

---

## 2. 多维度限流？

**回答：**

```
  限流维度：
  ┌──────────────┬──────────────────────────────┐
  │ 维度          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 全局          │ 系统总QPS上限                │
  │ IP            │ 防刷/防爬虫                  │
  │ 用户          │ 按用户公平分配               │
  │ API           │ 不同API不同限制              │
  │ 租户          │ SaaS多租户按套餐限流         │
  │ 组合          │ IP+API 或 用户+API           │
  └──────────────┴──────────────────────────────┘

  Go多维度限流：
  type MultiLimiter struct {
      limiters map[string]*rate.Limiter
      mu       sync.RWMutex
      configs  map[string]LimitConfig
  }
  
  type LimitConfig struct {
      Rate  rate.Limit
      Burst int
  }
  
  func (ml *MultiLimiter) Allow(dimensions ...string) bool {
      key := strings.Join(dimensions, ":")
      
      ml.mu.RLock()
      limiter, ok := ml.limiters[key]
      ml.mu.RUnlock()
      
      if !ok {
          ml.mu.Lock()
          limiter = rate.NewLimiter(ml.getRate(dimensions), ml.getBurst(dimensions))
          ml.limiters[key] = limiter
          ml.mu.Unlock()
      }
      
      return limiter.Allow()
  }
  
  // 使用
  func RateLimitMiddleware(ml *MultiLimiter) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              ip := getClientIP(r)
              userID := getUserID(r)
              
              // IP维度
              if !ml.Allow("ip", ip) {
                  writeRateLimitResponse(w)
                  return
              }
              
              // 用户+API维度
              if userID != "" && !ml.Allow("user", userID, r.URL.Path) {
                  writeRateLimitResponse(w)
                  return
              }
              
              next.ServeHTTP(w, r)
          })
      }
  }
```

---

## 3. 限流响应设计？

**回答：**

```
  标准限流响应：
  HTTP/1.1 429 Too Many Requests
  Content-Type: application/json
  Retry-After: 30
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 0
  X-RateLimit-Reset: 1704067200

  {
    "error": {
      "code": "RATE_LIMITED",
      "message": "请求过于频繁，请稍后重试",
      "retry_after": 30
    }
  }

  Header说明：
  ┌────────────────────┬──────────────────────────┐
  │ Header              │ 说明                     │
  ├────────────────────┼──────────────────────────┤
  │ Retry-After         │ 多少秒后可重试           │
  │ X-RateLimit-Limit   │ 窗口内总配额             │
  │ X-RateLimit-Remaining│ 剩余配额                │
  │ X-RateLimit-Reset   │ 窗口重置时间(Unix时间戳) │
  └────────────────────┴──────────────────────────┘

  Go写限流响应：
  func writeRateLimitResponse(w http.ResponseWriter) {
      w.Header().Set("Content-Type", "application/json")
      w.Header().Set("Retry-After", "30")
      w.Header().Set("X-RateLimit-Remaining", "0")
      w.WriteHeader(429)
      json.NewEncoder(w).Encode(map[string]interface{}{
          "error": map[string]interface{}{
              "code":        "RATE_LIMITED",
              "message":     "请求过于频繁",
              "retry_after": 30,
          },
      })
  }

  每个正常响应也带限流Header：
  让客户端知道自己的配额使用情况
```

---

## 4. 分布式限流？

**回答：**

```
  单机限流不够：多实例部署时 每个实例独立计数

  Redis集中式限流：
  func RateLimitByRedis(ctx context.Context, rdb *redis.Client, key string, limit int, window time.Duration) (bool, error) {
      // Lua脚本保证原子性
      script := redis.NewScript(`
          local key = KEYS[1]
          local limit = tonumber(ARGV[1])
          local window = tonumber(ARGV[2])
          
          local current = redis.call('INCR', key)
          if current == 1 then
              redis.call('EXPIRE', key, window)
          end
          
          if current > limit then
              return 0
          end
          return 1
      `)
      
      result, err := script.Run(ctx, rdb, []string{key},
          limit, int(window.Seconds())).Int()
      return result == 1, err
  }

  分布式令牌桶：
  更精确但实现复杂
  每次请求从Redis获取Token
  
  或者用近似方案：
  单机限流 × 实例数 ≈ 总限流
  简单但不精确

  限流服务独立部署：
  所有实例调用限流服务
  限流服务本身需要高可用
  
  限流降级：
  Redis不可用时 → 降级为单机限流
  不能因为限流服务挂了就不限流
```

---

## 5. 服务降级策略？

**回答：**

```
  降级 = 非核心功能关闭 保障核心功能

  降级级别：
  ┌──────────────┬──────────────────────────────┐
  │ 级别          │ 动作                         │
  ├──────────────┼──────────────────────────────┤
  │ P0 核心      │ 不降级 全力保障              │
  │ P1 重要      │ 返回缓存/简化数据            │
  │ P2 一般      │ 返回默认值/静态数据          │
  │ P3 低优      │ 直接关闭                     │
  └──────────────┴──────────────────────────────┘

  示例：电商
  P0: 下单/支付 → 不降级
  P1: 商品详情 → 返回缓存
  P2: 推荐列表 → 返回热销榜
  P3: 评论/足迹 → 关闭

  Go降级开关：
  type DegradeConfig struct {
      switches sync.Map // feature → enabled
  }
  
  func (d *DegradeConfig) IsEnabled(feature string) bool {
      v, ok := d.switches.Load(feature)
      if !ok { return true } // 默认开启
      return v.(bool)
  }
  
  func (d *DegradeConfig) SetSwitch(feature string, enabled bool) {
      d.switches.Store(feature, enabled)
  }
  
  // 使用
  func GetProductDetail(w http.ResponseWriter, r *http.Request) {
      product := getProduct(r.PathValue("id"))
      
      // 推荐降级
      if degradeConfig.IsEnabled("recommendation") {
          product.Recommendations = getRecommendations(product.ID)
      } else {
          product.Recommendations = getHotProducts() // 返回热销榜
      }
      
      // 评论降级
      if degradeConfig.IsEnabled("comments") {
          product.Comments = getComments(product.ID)
      }
      // 降级时不返回评论
      
      json.NewEncoder(w).Encode(product)
  }
```

---

## 6. 熔断机制？

**回答：**

```
  熔断器状态：
  Closed（正常）→ Open（熔断）→ Half-Open（试探）

  ┌─────────┐  失败率达阈值  ┌─────────┐
  │ Closed  │──────────────→│  Open   │
  │ (正常)  │               │ (熔断)  │
  └────▲────┘               └────┬────┘
       │                         │ 超时后
       │     试探成功            │
  ┌────┴────┐←──────────────┌────▼────┐
  │         │               │Half-Open│
  │         │──────────────→│ (试探)  │
  └─────────┘  试探失败      └─────────┘

  Go gobreaker：
  import "github.com/sony/gobreaker"
  
  cb := gobreaker.NewCircuitBreaker(gobreaker.Settings{
      Name:        "downstream-service",
      MaxRequests: 3,                    // Half-Open时最多3个试探
      Interval:    10 * time.Second,     // Closed状态清零间隔
      Timeout:     30 * time.Second,     // Open→Half-Open超时
      ReadyToTrip: func(counts gobreaker.Counts) bool {
          return counts.ConsecutiveFailures > 5 // 连续5次失败熔断
      },
      OnStateChange: func(name string, from, to gobreaker.State) {
          log.Printf("breaker %s: %s → %s", name, from, to)
      },
  })
  
  // 使用
  result, err := cb.Execute(func() (interface{}, error) {
      return callDownstream(ctx, req)
  })
  
  if err != nil {
      if errors.Is(err, gobreaker.ErrOpenState) {
          // 熔断中 → 降级处理
          return fallbackResponse(), nil
      }
      return nil, err
  }
```

---

## 7. 限流与降级联动？

**回答：**

```
  分层防护：
  1. 限流 → 控制入口流量
  2. 熔断 → 保护下游依赖
  3. 降级 → 保障核心功能

  联动策略：
  正常 → 全功能
  ↓ QPS上升
  限流 → 拒绝超额请求(429)
  ↓ 下游异常
  熔断 → 隔离故障下游
  ↓ 系统负载过高
  降级 → 关闭非核心功能
  ↓ 极端情况
  降级+缓存 → 只返回缓存数据

  Go综合防护中间件：
  func ProtectionMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          // 1. 限流检查
          if !rateLimiter.Allow() {
              writeRateLimitResponse(w)
              return
          }
          
          // 2. 系统负载检查
          if systemLoad() > 0.9 {
              // 自动降级非核心接口
              if !isCriticalAPI(r.URL.Path) {
                  w.WriteHeader(503)
                  return
              }
          }
          
          next.ServeHTTP(w, r)
      })
  }

  自适应限流：
  根据系统指标（CPU/内存/延迟）动态调整限流阈值
  负载高 → 收紧限流
  负载低 → 放宽限流
```

---

## 8. 按套餐限流（SaaS）？

**回答：**

```
  不同套餐不同配额：
  ┌──────────────┬──────────┬──────────┬──────────┐
  │ 套餐          │ QPS      │ 日调用量  │ 并发     │
  ├──────────────┼──────────┼──────────┼──────────┤
  │ 免费          │ 10       │ 1000     │ 5        │
  │ 基础          │ 100      │ 100K     │ 50       │
  │ 专业          │ 1000     │ 1M       │ 200      │
  │ 企业          │ 不限     │ 不限     │ 不限     │
  └──────────────┴──────────┴──────────┴──────────┘

  Go套餐限流：
  type PlanLimiter struct {
      plans map[string]PlanConfig
      rdb   *redis.Client
  }
  
  type PlanConfig struct {
      QPS      int
      DailyMax int
  }
  
  func (pl *PlanLimiter) Check(ctx context.Context, tenantID, plan string) error {
      config := pl.plans[plan]
      
      // QPS检查
      qpsKey := fmt.Sprintf("qps:%s", tenantID)
      allowed, _ := RateLimitByRedis(ctx, pl.rdb, qpsKey, config.QPS, time.Second)
      if !allowed {
          return fmt.Errorf("QPS exceeded for plan %s", plan)
      }
      
      // 日调用量检查
      dailyKey := fmt.Sprintf("daily:%s:%s", tenantID, time.Now().Format("2006-01-02"))
      count, _ := pl.rdb.Incr(ctx, dailyKey).Result()
      if count == 1 {
          pl.rdb.Expire(ctx, dailyKey, 25*time.Hour)
      }
      if int(count) > config.DailyMax {
          return fmt.Errorf("daily limit exceeded for plan %s", plan)
      }
      
      return nil
  }

  超额处理：
  返回429 + 升级提示
  {
    "error": {
      "code": "QUOTA_EXCEEDED",
      "message": "已超出免费版每日配额",
      "upgrade_url": "https://example.com/pricing"
    }
  }
```

---

## 9. 限流监控与调优？

**回答：**

```
  监控指标：
  1. 限流触发次数（按维度）
  2. 通过率（通过/总请求）
  3. 各维度当前使用量
  4. 熔断器状态变化

  Prometheus指标：
  var (
      rateLimitTriggered = promauto.NewCounterVec(prometheus.CounterOpts{
          Name: "api_rate_limit_triggered_total",
      }, []string{"dimension", "key"})
      
      rateLimitUsage = promauto.NewGaugeVec(prometheus.GaugeOpts{
          Name: "api_rate_limit_usage_ratio",
      }, []string{"dimension", "key"})
  )

  Grafana面板：
  1. 限流触发趋势图
  2. 各API配额使用率
  3. Top10被限流的用户/IP
  4. 熔断器状态时间线

  调优建议：
  1. 观察正常峰值 → 限流阈值 = 峰值 × 1.5
  2. 逐步收紧 不要一步到位
  3. 分API设置不同阈值
  4. 核心API阈值高 非核心可以更严格
  5. 告警在限流触发时通知
  6. 定期review限流配置

  动态调整：
  限流配置放配置中心（etcd/Nacos）
  修改即时生效 不需要重启
```

---

## 10. 限流降级面试速答？

**回答：**

```
Q: 限流算法推荐哪种？
A: 令牌桶（允许突发）
   Go用golang.org/x/time/rate

Q: 分布式限流怎么做？
A: Redis + Lua脚本保证原子性
   Redis不可用降级为单机限流

Q: 限流响应怎么设计？
A: 429状态码+Retry-After Header
   X-RateLimit-Remaining告知剩余配额

Q: 什么时候降级？
A: 非核心功能在系统压力大时关闭
   P0核心不降级 P3直接关闭

Q: 熔断器怎么工作？
A: Closed→Open→Half-Open三态
   连续失败触发 超时后试探恢复

Q: 限流和降级什么关系？
A: 限流控入口 降级减负载 熔断护下游
   三者联动 分层防护

Q: SaaS怎么按套餐限流？
A: 不同套餐不同QPS和日调用量
   Redis计数 超额返回429+升级提示

Q: 限流阈值怎么定？
A: 观察正常峰值×1.5
   逐步收紧 动态可调
```
