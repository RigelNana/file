# OpenTelemetry 统一可观测八股文

---

## 一、OpenTelemetry 基础

### 1. 什么是 OpenTelemetry？

**答：** OpenTelemetry（OTel）是一个**CNCF 孵化项目**，提供统一的可观测性数据采集标准，覆盖 Metrics、Logs、Traces 三大信号。

```
之前：
  Metrics → Prometheus SDK
  Traces  → Jaeger SDK / Zipkin SDK
  Logs    → 各自方案
  每个工具不同的 SDK、不同的协议、不同的格式

现在（OpenTelemetry）：
  Metrics ──┐
  Traces  ──┼── 统一 OTel SDK ── OTel Collector ──→ 任意后端
  Logs    ──┘
```

### 2. OpenTelemetry 的核心组件有哪些？

**答：**

| 组件 | 作用 |
|------|------|
| **API** | 定义采集接口（不含实现） |
| **SDK** | API 的实现，处理和导出数据 |
| **Collector** | 独立进程，接收/处理/导出数据 |
| **OTLP** | OpenTelemetry Protocol，统一传输协议 |
| **Instrumentation** | 自动/手动埋点库 |
| **Semantic Conventions** | 统一命名约定 |

### 3. OTLP 协议是什么？

**答：**

```
OTLP (OpenTelemetry Protocol)

传输方式：
  - gRPC（推荐，高效）
  - HTTP/protobuf（防火墙友好）
  - HTTP/JSON（调试友好）

数据格式：
  统一的 protobuf 定义
  覆盖 Metrics + Traces + Logs

支持的后端：
  Jaeger → 原生支持 OTLP
  Prometheus → OTLP 远程写入
  Grafana Tempo → 原生支持
  Grafana Loki → 支持 OTLP Logs
  各商业 APM → 大多支持
```

---

## 二、OTel Collector

### 4. OTel Collector 的架构和部署模式？

**答：**

```
Collector 管道架构：

Receivers → Processors → Exporters
(接收)       (处理)       (导出)

示例：
  OTLP Receiver      Batch Processor    Prometheus Exporter
  Prometheus Receiver  Filter Processor   Jaeger Exporter
  Kafka Receiver      Sampling Processor Loki Exporter
```

**部署模式**：

| 模式 | 描述 | 适用 |
|------|------|------|
| **Agent** | 每个节点一个（DaemonSet） | 边缘采集 |
| **Gateway** | 集中式部署 | 集中处理和路由 |
| **Sidecar** | 每个 Pod 一个 | 精细隔离 |

```
推荐架构：

应用 → OTel SDK → Agent Collector → Gateway Collector → 后端
                  (DaemonSet)        (Deployment)
                  轻量采集+转发       集中处理+路由
```

### 5. OTel Collector 配置示例是什么？

**答：**

```yaml
# otel-collector-config.yaml
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  batch:
    timeout: 5s
    send_batch_size: 1024
  
  memory_limiter:
    limit_mib: 512
    spike_limit_mib: 128
    check_interval: 5s

  filter:
    traces:
      span:
        - 'attributes["http.target"] == "/health"'

exporters:
  otlp/jaeger:
    endpoint: jaeger:4317
    tls:
      insecure: true
  
  prometheus:
    endpoint: 0.0.0.0:8889
  
  loki:
    endpoint: http://loki:3100/loki/api/v1/push

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter, batch, filter]
      exporters: [otlp/jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [prometheus]
    logs:
      receivers: [otlp]
      processors: [memory_limiter, batch]
      exporters: [loki]
```

---

## 三、OTel SDK 接入

### 6. Go 应用如何接入 OpenTelemetry？

**答：**

```go
// 初始化 OTel
func initTracer() (*sdktrace.TracerProvider, error) {
    exporter, err := otlptracegrpc.New(context.Background(),
        otlptracegrpc.WithEndpoint("otel-collector:4317"),
        otlptracegrpc.WithInsecure(),
    )
    if err != nil {
        return nil, err
    }

    tp := sdktrace.NewTracerProvider(
        sdktrace.WithBatcher(exporter),
        sdktrace.WithResource(resource.NewWithAttributes(
            semconv.SchemaURL,
            semconv.ServiceNameKey.String("order-service"),
            semconv.ServiceVersionKey.String("1.0.0"),
        )),
    )
    otel.SetTracerProvider(tp)
    return tp, nil
}
```

### 7. 自动埋点和手动埋点有什么区别？

**答：**

| 对比 | 自动埋点 | 手动埋点 |
|------|----------|----------|
| 方式 | 框架集成库 | 代码中手动创建 Span |
| 覆盖 | HTTP/gRPC/DB 等通用操作 | 自定义业务逻辑 |
| 成本 | 接入简单 | 需要修改代码 |
| 灵活性 | 低 | 高 |
| 推荐 | ✅ 基础覆盖 | ✅ 关键业务补充 |

---

## 四、OTel 最佳实践

### 8. OpenTelemetry 的 Semantic Conventions 是什么？

**答：**

```
统一命名约定，确保不同语言/框架的遥测数据一致

HTTP 语义约定：
  http.request.method = "GET"
  http.response.status_code = 200
  url.path = "/api/orders"
  server.address = "api.example.com"

数据库语义约定：
  db.system = "mysql"
  db.name = "orders_db"
  db.operation = "SELECT"
  db.statement = "SELECT * FROM orders WHERE ..."

消息队列语义约定：
  messaging.system = "kafka"
  messaging.destination.name = "order-events"
  messaging.operation = "publish"
```

### 9. OTel 迁移策略是什么？

**答：**

```
逐步迁移路径：

Phase 1：部署 Collector
  现有 SDK → Collector → 现有后端
  (不改应用代码)

Phase 2：新服务用 OTel SDK
  新服务 → OTel SDK → Collector → 后端

Phase 3：存量服务逐步迁移
  老服务从 Jaeger SDK/Prometheus SDK → OTel SDK

Phase 4：利用 Collector 处理能力
  在 Collector 中做采样、过滤、转换
```

---

## 五、面试高频题

### 10. 面试题：为什么选择 OpenTelemetry？

**答：**

| 原因 | 描述 |
|------|------|
| **厂商中立** | 不锁定任何后端 |
| **统一标准** | 一套 SDK 覆盖三大信号 |
| **社区强大** | CNCF 孵化，所有大厂参与 |
| **自动埋点** | 主流框架自动覆盖 |
| **未来趋势** | 正在取代 OpenTracing/OpenCensus |

### 11. 面试题：OTel Collector 在架构中的价值？

**答：**

```
没有 Collector：
  应用 SDK → 直接发到后端
  问题：SDK 承担太多逻辑、后端更换要改代码

有 Collector：
  应用 SDK → Collector → 后端
  优势：
  1. 解耦：应用不关心后端是谁
  2. 处理：批量化、采样、过滤在 Collector 中做
  3. 路由：同一份数据发到多个后端
  4. 安全：敏感信息在 Collector 中脱敏
  5. 缓冲：Collector 可以缓冲突增流量
```
