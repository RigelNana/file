# 指标 Metrics 体系设计八股文

---

## 一、Metrics 体系基础

### 1. 什么是好的指标体系设计？

**答：**

| 原则 | 描述 |
|------|------|
| **层次分明** | 业务指标 → 应用指标 → 基础设施指标 |
| **适度粒度** | 不过粗（看不出问题）也不过细（信息爆炸） |
| **命名统一** | 遵循统一命名规范 |
| **标签合理** | 高基数标签会导致存储爆炸 |

```
指标层次：

业务层：  订单量、GMV、转化率
    │
应用层：  QPS、错误率、延迟、SLI
    │
中间件层：数据库连接池、缓存命中率、MQ 积压
    │
基础设施层：CPU、内存、磁盘IO、网络
```

### 2. RED 方法和 USE 方法分别是什么？

**答：**

**RED 方法（面向服务/请求）**：

| 指标 | 英文 | 适用 |
|------|------|------|
| **Rate** | 请求速率 | 每秒请求数 |
| **Errors** | 错误数/率 | 失败请求比例 |
| **Duration** | 延迟分布 | 请求处理时间 |

**USE 方法（面向资源）**：

| 指标 | 英文 | 适用 |
|------|------|------|
| **Utilization** | 利用率 | CPU 使用率 70% |
| **Saturation** | 饱和度 | 等待队列长度 |
| **Errors** | 错误数 | 磁盘 IO 错误 |

```
何时用哪个：
  微服务/API → RED 方法
  服务器/硬件 → USE 方法
  数据库     → 两者结合
```

### 3. Prometheus 指标命名规范是什么？

**答：**

```
格式：<namespace>_<subsystem>_<name>_<unit>

规则：
  - 小写字母 + 下划线
  - 带上单位后缀：_total, _seconds, _bytes
  - Counter 必须带 _total
  - 布尔值用 1/0

好的命名：
  http_requests_total
  http_request_duration_seconds
  node_memory_usage_bytes
  process_open_fds

坏的命名：
  requests          （缺少上下文）
  httpRequestCount  （驼峰式不规范）
  request_time      （缺少单位）
```

---

## 二、指标类型深入

### 4. Counter、Gauge、Histogram、Summary 如何选择？

**答：**

| 类型 | 场景 | 查询 |
|------|------|------|
| **Counter** | 请求总数、错误总数 | 用 rate() 计算速率 |
| **Gauge** | 温度、连接数、队列长度 | 直接查看或用 delta() |
| **Histogram** | 延迟分布、响应大小分布 | 用 histogram_quantile() |
| **Summary** | 需要精确百分位但不做聚合 | 直接查看计算好的分位数 |

**Histogram vs Summary**：

| 对比 | Histogram | Summary |
|------|-----------|---------|
| 聚合 | ✅ 可跨实例聚合 | ❌ 不可聚合 |
| 精确度 | 近似（取决于桶配置） | 精确 |
| 性能 | 客户端轻量 | 客户端计算重 |
| 推荐 | ✅ 推荐（大多数场景） | 单实例精确场景 |

### 5. Histogram 的桶（Bucket）如何设置？

**答：**

```go
// 默认桶：适合大多数 HTTP 服务
prometheus.DefBuckets = []float64{
    .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10,
}

// 自定义桶：根据 SLO 设计
// SLO: 95% 请求 < 200ms, 99% < 500ms
prometheus.LinearBuckets(0.05, 0.05, 10)  // 50ms 间隔
// 或
prometheus.ExponentialBuckets(0.01, 2, 12) // 指数增长

// 建议：在 SLO 阈值附近多设桶
[]float64{0.01, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.5, 1, 2, 5}
//                              ↑
//                    SLO 阈值 200ms 附近加密
```

---

## 三、高基数与存储优化

### 6. 什么是标签基数问题？如何避免？

**答：**

```
标签基数 = 各标签值数量的乘积

http_requests_total{
  method="GET",       # 5 种 → 5
  status="200",       # 20 种 → 20
  path="/api/v1/...", # 10000 种 → 10000!
  user_id="..."       # 1000000 种 → 1000000!
}

时间序列数 = 5 × 20 × 10000 × 1000000
           = 1,000,000,000,000  ← 灾难！
```

**避免策略**：

| 策略 | 做法 |
|------|------|
| **禁止高基数标签** | 不要用 user_id、request_id 做标签 |
| **路径归一化** | /api/users/123 → /api/users/:id |
| **限制标签值数量** | 每个标签最多 100-1000 个值 |
| **用 Exemplar** | 将单个 trace_id 附在 Metric 上，而非做标签 |

### 7. Prometheus 存储和性能优化有哪些手段？

**答：**

| 手段 | 描述 |
|------|------|
| **Recording Rules** | 预计算常用查询，避免实时计算 |
| **降采样** | 远期数据降低精度（如 Thanos） |
| **联邦集群** | 多 Prometheus 实例分片 |
| **远程存储** | Thanos/Cortex/Mimir 长期存储 |
| **标签裁剪** | 删除不需要的标签 |

```yaml
# Recording Rule 预计算
groups:
  - name: sli-recording
    interval: 30s
    rules:
      - record: job:http_requests:rate5m
        expr: sum(rate(http_requests_total[5m])) by (job)
      
      - record: job:http_errors:rate5m
        expr: sum(rate(http_requests_total{code=~"5.."}[5m])) by (job)
```

---

## 四、业务指标设计

### 8. 如何设计微服务的指标体系？

**答：**

```
每个微服务标准指标集：

# RED 指标（必需）
http_requests_total{method, status, path}
http_request_duration_seconds{method, path}

# 运行时指标（必需）
process_cpu_seconds_total
process_resident_memory_bytes
go_goroutines / jvm_threads_current

# 业务指标（按需）
orders_created_total
payment_success_total
payment_failure_total{reason}

# 依赖指标（推荐）
http_client_requests_total{target_service}
db_query_duration_seconds{query_type}
cache_hit_total / cache_miss_total
```

### 9. 如何用 Grafana 构建有效的指标仪表盘？

**答：**

```
仪表盘布局建议（自上而下）：

Row 1：服务概览
  ┌──────┬──────┬──────┬──────┐
  │ QPS  │ 错误率│ P99  │ 饱和度│
  └──────┴──────┴──────┴──────┘

Row 2：流量和错误详情
  ┌─────────────────┬─────────────────┐
  │ 请求量趋势（按状态码）│ 错误率趋势      │
  └─────────────────┴─────────────────┘

Row 3：延迟分布
  ┌─────────────────┬─────────────────┐
  │ 延迟百分位趋势    │ 延迟热力图       │
  └─────────────────┴─────────────────┘

Row 4：基础设施
  ┌─────────┬─────────┬─────────────────┐
  │ CPU     │ Memory  │ 网络/磁盘        │
  └─────────┴─────────┴─────────────────┘
```

---

## 五、面试高频题

### 10. 面试题：如何从零搭建指标监控体系？

**答：**

```
Step 1（第1周）：基础设施监控
  - 部署 Prometheus + node_exporter
  - CPU、内存、磁盘、网络基础指标

Step 2（第2周）：应用指标
  - 接入应用的 RED 指标
  - 配置 Grafana 服务仪表盘

Step 3（第3-4周）：告警
  - 配置基础告警（CPU > 80%、5xx > 1%）
  - 配置 SLO 燃烧率告警

Step 4（第2月）：优化
  - 添加 Recording Rules
  - 标签优化、存储优化
  - 业务指标接入
```

### 11. 面试题：Prometheus 的 rate() 和 irate() 有什么区别？

**答：**

| 函数 | 计算方式 | 特点 |
|------|----------|------|
| **rate()** | 范围内的平均速率 | 平滑、适合告警和 SLI |
| **irate()** | 最后两个点的瞬时速率 | 灵敏、适合看实时波动 |

```promql
# rate：5 分钟平均速率（推荐用于告警）
rate(http_requests_total[5m])

# irate：瞬时速率（适合实时仪表盘）
irate(http_requests_total[5m])
```
