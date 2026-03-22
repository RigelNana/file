# 分布式追踪 Traces 八股文

---

## 一、分布式追踪基础

### 1. 为什么需要分布式追踪？

**答：**

```
单体应用：
  一个请求 → 一个进程 → 一份日志
  排查简单：看日志就行

微服务架构：
  一个请求 → 经过 5-20 个服务 → 分散在多台机器
  排查困难：哪个服务慢？哪个服务出错？调用链是什么？

分布式追踪解决：
  给每个请求一个全局 ID（Trace ID）
  记录请求经过的每个服务的时间和状态
  还原完整的调用链路
```

### 2. 分布式追踪的核心数据模型是什么？

**答：**

```
Trace（调用链）
└── Span A: API Gateway [0ms - 150ms]
    ├── Span B: User Service [10ms - 50ms]
    │   └── Span C: Redis Cache [15ms - 20ms]
    ├── Span D: Order Service [55ms - 140ms]
    │   ├── Span E: MySQL Query [60ms - 100ms]
    │   └── Span F: Payment Service [105ms - 135ms]
    │       └── Span G: External API [110ms - 130ms]
    └── Span H: Notification [142ms - 148ms]
```

**Span 包含的信息**：

| 字段 | 描述 | 示例 |
|------|------|------|
| trace_id | 全局追踪 ID | abc-123-def |
| span_id | 当前 Span ID | span-001 |
| parent_span_id | 父 Span ID | span-000 |
| operation_name | 操作名称 | GET /api/orders |
| start_time | 开始时间 | 1705312200000 |
| duration | 持续时间 | 140ms |
| tags/attributes | 标签 | http.status=200 |
| logs/events | 事件 | "cache miss" |
| status | 状态 | OK / ERROR |

### 3. 追踪上下文是如何传播的？

**答：**

```
上下文传播（Context Propagation）：

服务A → HTTP 请求 → 服务B → gRPC 请求 → 服务C

HTTP 传播（W3C Trace Context）：
  traceparent: 00-abc123-span001-01
  tracestate: vendor=value

gRPC 传播：
  metadata 中携带 trace context

消息队列传播：
  消息 header 中携带 trace context
```

**W3C Trace Context 标准格式**：
```
traceparent: {version}-{trace-id}-{parent-id}-{trace-flags}
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

---

## 二、追踪系统实践

### 4. 主流分布式追踪系统对比？

**答：**

| 系统 | 开发方 | 存储 | 特点 |
|------|--------|------|------|
| **Jaeger** | Uber | ES/Cassandra/Kafka | CNCF 毕业、功能全面 |
| **Zipkin** | Twitter | ES/MySQL/Cassandra | 老牌、简单 |
| **Tempo** | Grafana | 对象存储(S3) | 无索引、低成本 |
| **SkyWalking** | Apache | ES/H2/MySQL | Java 生态友好、APM 功能 |

### 5. Jaeger 的架构是怎样的？

**答：**

```
应用（SDK/Agent）
      │
      ▼
Jaeger Agent（UDP/HTTP 接收）
      │
      ▼
Jaeger Collector（处理和存储）
      │
      ├── Kafka（可选缓冲）
      │       │
      │       ▼
      │   Jaeger Ingester
      │       │
      └───────┤
              ▼
        存储后端（ES/Cassandra）
              │
              ▼
        Jaeger Query（API/UI）
```

### 6. 如何在 Go/Python 应用中接入链路追踪？

**答：**

```go
// Go + OpenTelemetry
import (
    "go.opentelemetry.io/otel"
    "go.opentelemetry.io/otel/trace"
)

func HandleOrder(ctx context.Context, orderID string) error {
    tracer := otel.Tracer("order-service")
    ctx, span := tracer.Start(ctx, "HandleOrder")
    defer span.End()

    span.SetAttributes(
        attribute.String("order.id", orderID),
    )

    // 调用下游服务时传递 ctx
    err := paymentService.Charge(ctx, orderID)
    if err != nil {
        span.RecordError(err)
        span.SetStatus(codes.Error, err.Error())
        return err
    }
    return nil
}
```

---

## 三、采样策略与优化

### 7. 链路追踪的采样策略有哪些？

**答：**

| 策略 | 决策时机 | 优点 | 缺点 |
|------|----------|------|------|
| **头部采样** | 请求入口 | 链路完整 | 可能错过异常 |
| **尾部采样** | 请求完成后 | 保留所有异常 | 需要全量收集后过滤 |
| **概率采样** | 固定比例 | 简单 | 低流量时样本不足 |
| **速率限制** | 每秒N条 | 控制成本 | 不均匀 |
| **自适应采样** | 动态调整 | 平衡成本和覆盖 | 配置复杂 |

**推荐策略**：

```yaml
# OpenTelemetry Collector 尾部采样配置
processors:
  tail_sampling:
    policies:
      # 保留所有错误请求
      - name: errors
        type: status_code
        status_code: {status_codes: [ERROR]}
      # 保留所有慢请求（>2s）
      - name: slow-requests
        type: latency
        latency: {threshold_ms: 2000}
      # 正常请求 1% 采样
      - name: normal
        type: probabilistic
        probabilistic: {sampling_percentage: 1}
```

### 8. 链路追踪的存储成本如何优化？

**答：**

| 策略 | 效果 |
|------|------|
| 尾部采样 | 只保留有价值的 Trace，减少 80-95% |
| 使用 Tempo | 无索引设计，对象存储成本低 |
| Span 压缩 | 合并重复 Span |
| 保留策略 | 7-14 天（Trace 的时效性短） |
| 降低精度 | 减少 Span 中的标签和日志 |

---

## 四、面试高频题

### 9. 面试题：链路追踪中如何定位延迟瓶颈？

**答：**

```
Step 1：找到慢请求的 Trace
  查询条件：duration > 2s AND service = "order-service"

Step 2：查看 Span 瀑布图
  API Gateway:     [==========================] 2.5s
    Order Service:   [======================] 2.3s
      DB Query:        [================] 1.8s  ← 瓶颈！
      Cache Lookup:    [=] 5ms
    Email Service:   [==] 50ms

Step 3：分析瓶颈 Span
  DB Query Span:
    db.statement: "SELECT * FROM orders WHERE user_id = ?"
    db.duration: 1800ms
    → 缺少索引导致慢查询

Step 4：修复
  添加索引 → DB Query 降至 20ms → 总延迟降至 300ms
```

### 10. 面试题：Trace ID 冲突如何处理？

**答：**

```
Trace ID 通常是 128 位随机数
冲突概率极低（2^128 ≈ 3.4 × 10^38）

但如果确实需要防冲突：
  - 使用 UUID v4（128 位随机）
  - 使用雪花算法（含时间戳+机器ID）
  - W3C 标准要求 128 位

实际问题通常不是 ID 冲突，而是：
  - 上下文传播断裂（某个服务没传递 trace header）
  - 异步场景丢失 context（消息队列、协程池）
  → 解决：确保所有调用路径都正确传播上下文
```
