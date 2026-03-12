# Prometheus 架构与原理

---

## 1. Prometheus 整体架构？

**回答：**

```
┌─────────────────────────────────────────────────────────────┐
│                    Prometheus Server                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │  Retrieval   │  │    TSDB      │  │   HTTP Server     │  │
│  │  (拉取引擎)  │  │  (时序数据库) │  │  (PromQL API)     │  │
│  └──────┬──────┘  └──────────────┘  └────────┬──────────┘  │
│         │                                      │            │
│  ┌──────┴──────┐                               │            │
│  │ Service     │                               │            │
│  │ Discovery   │                               │            │
│  └─────────────┘                               │            │
└─────────┼──────────────────────────────────────┼────────────┘
          │ Pull (HTTP GET /metrics)              │ Query
          │                                       │
   ┌──────┴──────────────┐              ┌─────────┴──────────┐
   │    Targets          │              │  Consumers          │
   │ ┌─────────────────┐ │              │ ┌────────────────┐  │
   │ │ Node Exporter   │ │              │ │ Grafana        │  │
   │ │ App /metrics    │ │              │ │ Alertmanager   │  │
   │ │ cAdvisor        │ │              │ │ API Clients    │  │
   │ │ kube-state-     │ │              │ └────────────────┘  │
   │ │ metrics         │ │              └────────────────────┘
   │ └─────────────────┘ │
   └─────────────────────┘

Pushgateway (特殊场景):
   短生命周期 Job → Push → Pushgateway ← Pull ← Prometheus
```

核心组件说明:

| 组件 | 功能 |
|------|------|
| Retrieval | 按 scrape_interval 周期拉取目标指标 |
| TSDB | 本地时序数据库，高效存储和查询 |
| HTTP Server | 提供 PromQL 查询 API |
| Service Discovery | 自动发现监控目标 (K8s, Consul, DNS, 文件) |
| Alertmanager | 接收告警规则评估结果，路由/分组/通知 |
| Pushgateway | 接收短时任务 Push 的指标 |

---

## 2. Pull 模式 vs Push 模式？

**回答：**

```
Pull 模式 (Prometheus):
  Prometheus Server → HTTP GET /metrics → Target
  
  优点:
    ✓ 目标健康检查内置 (拉不到 = 目标挂了)
    ✓ 便于本地调试 (curl localhost:9090/metrics)
    ✓ 集中控制抓取频率和目标
    ✓ 避免 DDos 自身 (由 Server 控制速率)
  缺点:
    ✗ 短生命任务可能在两次抓取间消失
    ✗ 需要目标有 HTTP 端点
    ✗ 防火墙可能阻止 Server 访问 Target

Push 模式 (InfluxDB, Datadog, StatsD):
  App → Push metrics → 收集器
  
  优点:
    ✓ 适合短生命任务 (batch job)
    ✓ 适合防火墙/NAT 环境
    ✓ 事件驱动, 立即发送
  缺点:
    ✗ 可能 DDos 收集器
    ✗ 不知道目标是否存活
    ✗ 分散控制

Prometheus 如何处理 Push 场景:
  使用 Pushgateway:
    短时 Job → push → Pushgateway ← pull ← Prometheus
    
  注意:
    ✗ Pushgateway 不是正常指标采集方式
    ✗ 不设置实例标签 → 多个 Job 指标可能覆盖
    ✓ 只用于真正的短生命任务 (CronJob, Batch)
```

---

## 3. TSDB 时序数据库原理？

**回答：**

```
时间序列 = 指标名 + 标签集 + (时间戳, 值) 的序列

  http_requests_total{method="GET", status="200"} → [(t1, 100), (t2, 105), (t3, 112), ...]

TSDB 存储结构:
  data/
  ├── 01BKGV7JBM69T2G1BGBGM6KB12/    # Block (2小时)
  │   ├── chunks/                      # 压缩的时间序列数据
  │   │   └── 000001
  │   ├── tombstones                   # 删除标记
  │   ├── index                        # 倒排索引
  │   └── meta.json                    # Block 元信息
  ├── 01BKGTZQ1SYQJTR4PB43C8PD98/    # 另一个 Block
  │   └── ...
  ├── chunks_head/                     # 最新 Block (内存 + WAL)
  │   └── 000001
  └── wal/                            # Write-Ahead Log
      ├── 00000001
      └── 00000002

关键概念:
  Block:    2 小时的数据块 (不可变)
  Head:     当前正在写入的块 (内存中)
  WAL:      预写日志, 防止 crash 丢数据
  Compaction: 合并小 Block → 大 Block, 优化查询

数据压缩:
  Gorilla 压缩算法 (来自 Facebook):
    时间戳: delta-of-delta 编码
    值:     XOR 编码
    压缩比: 约 1.37 bytes/sample (原始 16 bytes)
    效果:   约 12x 压缩率
```

---

## 4. Prometheus 的数据类型有哪些？

**回答：**

```
四种指标类型:

1. Counter (计数器)
   特点: 只增不减, 重启清零
   场景: 请求总数, 错误总数, 字节数
   使用: 必须配合 rate() / increase()
   
   http_requests_total{method="GET"} 12345
   
   rate(http_requests_total[5m])      # 每秒增长率
   increase(http_requests_total[1h])   # 1小时增量

2. Gauge (仪表盘)
   特点: 可增可减, 瞬时值
   场景: 温度, 内存使用, 队列长度, 协程数
   使用: 可直接查询
   
   node_memory_MemAvailable_bytes 4294967296
   go_goroutines 42

3. Histogram (直方图)
   特点: 按 bucket 分桶统计, 可计算分位数
   场景: 请求延迟分布, 响应大小分布
   自动生成:
     _bucket{le="X"}  → 累计桶计数
     _sum             → 总和
     _count           → 总次数
   
   http_duration_seconds_bucket{le="0.01"} 100
   http_duration_seconds_bucket{le="0.05"} 800
   http_duration_seconds_bucket{le="0.1"}  900
   http_duration_seconds_bucket{le="0.5"}  980
   http_duration_seconds_bucket{le="1"}    995
   http_duration_seconds_bucket{le="+Inf"} 1000
   http_duration_seconds_sum 120.5
   http_duration_seconds_count 1000

4. Summary (摘要)
   特点: 客户端直接计算分位数
   场景: 请求延迟 (不需要聚合的场景)
   自动生成:
     {quantile="X"} → 分位数值
     _sum           → 总和
     _count         → 总次数
   
   http_duration_seconds{quantile="0.5"} 0.03
   http_duration_seconds{quantile="0.9"} 0.08
   http_duration_seconds{quantile="0.99"} 0.45
```

```
Histogram vs Summary:
  ┌────────────┬───────────────────┬───────────────────┐
  │ 维度        │ Histogram         │ Summary           │
  ├────────────┼───────────────────┼───────────────────┤
  │ 计算位置    │ 服务端 (PromQL)    │ 客户端            │
  │ 可聚合      │ ✓ (跨实例聚合)     │ ✗ (不可聚合)      │
  │ 精确度      │ 近似值 (受桶影响)   │ 精确 (流式算法)    │
  │ 性能        │ 客户端轻量         │ 客户端较重         │
  │ 推荐        │ ✓ 大多数场景       │ 特殊场景           │
  └────────────┴───────────────────┴───────────────────┘
  
  结论: 优先使用 Histogram
```

---

## 5. Exporter 是什么？常见 Exporter 有哪些？

**回答：**

```
Exporter: 将第三方系统指标转换为 Prometheus 格式的适配器

工作流程:
  第三方系统 → Exporter (转换) → /metrics 端点 ← Prometheus Pull

常见 Exporter:
  ┌───────────────────────┬───────┬─────────────────────────────┐
  │ Exporter              │ 端口  │ 监控对象                     │
  ├───────────────────────┼───────┼─────────────────────────────┤
  │ node_exporter         │ 9100  │ Linux 系统 (CPU/内存/磁盘)   │
  │ windows_exporter      │ 9182  │ Windows 系统                 │
  │ blackbox_exporter     │ 9115  │ 外部探测 (HTTP/TCP/ICMP/DNS) │
  │ mysqld_exporter       │ 9104  │ MySQL                        │
  │ postgres_exporter     │ 9187  │ PostgreSQL                   │
  │ redis_exporter        │ 9121  │ Redis                        │
  │ mongodb_exporter      │ 9216  │ MongoDB                      │
  │ nginx_exporter        │ 9113  │ Nginx                        │
  │ kafka_exporter        │ 9308  │ Kafka                        │
  │ rabbitmq_exporter     │ 9419  │ RabbitMQ                     │
  │ elasticsearch_exporter│ 9114  │ Elasticsearch                │
  │ kube-state-metrics    │ 8080  │ K8s 资源状态                  │
  │ cAdvisor              │ 8080  │ 容器资源使用                  │
  │ process_exporter      │ 9256  │ 进程级指标                    │
  └───────────────────────┴───────┴─────────────────────────────┘

自定义 Exporter (Python 示例):
```

```python
from prometheus_client import start_http_server, Gauge, Counter
import time, random

# 定义指标
REQUEST_COUNT = Counter('app_requests_total', 'Total requests', ['method', 'endpoint'])
ACTIVE_USERS = Gauge('app_active_users', 'Number of active users')
REQUEST_LATENCY = Histogram('app_request_latency_seconds', 'Request latency',
                            buckets=[0.01, 0.05, 0.1, 0.5, 1, 5])

# 更新指标
REQUEST_COUNT.labels(method='GET', endpoint='/api/users').inc()
ACTIVE_USERS.set(42)

# 启动 HTTP 服务暴露 /metrics
start_http_server(8000)
```

---

## 6. Prometheus 数据保留与远程存储？

**回答：**

```
本地存储:
  默认保留: 15 天
  配置: --storage.tsdb.retention.time=30d
        --storage.tsdb.retention.size=50GB
  特点: 高性能, 但不适合长期存储

远程存储 (Remote Storage):
  Prometheus → Remote Write → 远端存储
  查询时:   Prometheus → Remote Read → 远端存储
  
  远程存储方案:
  ┌─────────────────────┬──────────────────────────────────┐
  │ 方案                 │ 特点                             │
  ├─────────────────────┼──────────────────────────────────┤
  │ Thanos              │ CNCF 项目, S3 存储, 全局视图       │
  │ Cortex / Mimir      │ 多租户, 水平扩展, Grafana 主推     │
  │ VictoriaMetrics     │ 高性能, 兼容 Prometheus API        │
  │ InfluxDB            │ 老牌时序数据库                     │
  │ M3DB                │ Uber 开发, 分布式                  │
  └─────────────────────┴──────────────────────────────────┘
```

```yaml
# prometheus.yml 配置远程写入
remote_write:
  - url: "http://thanos-receive:19291/api/v1/receive"
    queue_config:
      max_samples_per_send: 5000
      batch_send_deadline: 5s

remote_read:
  - url: "http://thanos-query:9090/api/v1/read"
    read_recent: false   # 最近数据从本地读
```

```
Thanos 架构:
  Prometheus + Sidecar → Object Store (S3)
                                ↑
  Thanos Query ──────────── Thanos Store Gateway
       ↑
  Grafana

  组件:
    Sidecar:       挂在 Prometheus 旁, 上传 Block 到 S3
    Store Gateway: 从 S3 读取历史数据
    Query:         统一查询入口 (类似 Prometheus)
    Compact:       压缩和降采样
    Ruler:         分布式告警规则评估
```

---

## 7. Prometheus Federation (联邦) 是什么？

**回答：**

```
联邦 (Federation): 一个 Prometheus 从另一个 Prometheus 拉取指标

场景:
  1. 层级联邦: 全局 Prometheus 从各集群 Prometheus 拉取聚合指标
  2. 跨集群聚合: 多个集群的指标汇总

层级联邦架构:
  ┌─────────────────────────────────────────┐
  │          Global Prometheus              │
  │    (低频抓取聚合指标, 长期存储)           │
  └──────────────┬──────────────────────────┘
                 │ /federate (Pull)
       ┌─────────┼─────────┐
  ┌────┴─────┐ ┌──┴──────┐ ┌──┴──────┐
  │ Cluster1 │ │ Cluster2│ │ Cluster3│
  │ Prom     │ │ Prom    │ │ Prom    │
  └──────────┘ └─────────┘ └─────────┘
```

```yaml
# 全局 Prometheus 配置
scrape_configs:
  - job_name: 'federate'
    scrape_interval: 60s          # 低频抓取
    honor_labels: true             # 保留原始标签
    metrics_path: '/federate'
    params:
      'match[]':
        - '{job="app"}'            # 只拉取特定指标
        - 'up'
        - '{__name__=~"job:.*"}'   # 拉取 recording rules
    static_configs:
      - targets:
          - 'prom-cluster1:9090'
          - 'prom-cluster2:9090'
```

```
联邦 vs Thanos:
  ┌────────────┬────────────────────┬───────────────────┐
  │ 维度        │ Federation         │ Thanos            │
  ├────────────┼────────────────────┼───────────────────┤
  │ 复杂度      │ 简单               │ 较复杂             │
  │ 扩展性      │ 有限               │ 高度扩展           │
  │ 历史数据    │ 受限于本地存储       │ S3 无限存储        │
  │ 全局视图    │ 部分聚合指标         │ 完整全局视图       │
  │ 适用场景    │ 小规模多集群         │ 大规模生产环境     │
  └────────────┴────────────────────┴───────────────────┘
```

---

## 8. Recording Rules (预计算规则)？

**回答：**

```yaml
# recording_rules.yml
groups:
  - name: http_rules
    interval: 30s
    rules:
      # 记录 5 分钟平均 QPS (按 job)
      - record: job:http_requests_total:rate5m
        expr: sum by (job)(rate(http_requests_total[5m]))

      # 记录错误率
      - record: job:http_errors:rate5m
        expr: |
          sum by (job)(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum by (job)(rate(http_requests_total[5m]))

      # 记录 P99 延迟
      - record: job:http_duration:p99
        expr: histogram_quantile(0.99, sum by (job, le)(rate(http_request_duration_seconds_bucket[5m])))

  - name: node_rules
    rules:
      # CPU 使用率
      - record: instance:node_cpu_utilization:ratio
        expr: 1 - avg by (instance)(rate(node_cpu_seconds_total{mode="idle"}[5m]))

      # 内存使用率
      - record: instance:node_memory_utilization:ratio
        expr: 1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes
```

```
命名规范:
  level:metric:operations
  
  level:       聚合级别 (job, instance, cluster)
  metric:      原始指标名
  operations:  应用的操作 (rate5m, p99, ratio)
  
  示例:
    job:http_requests_total:rate5m
    instance:node_cpu_utilization:ratio
    cluster:memory_usage:sum

为什么使用 Recording Rules:
  1. 性能: 预计算复杂查询, Dashboard 加载更快
  2. 联邦: 只拉取预计算结果, 减少数据量
  3. 告警: 告警规则引用预计算指标, 更高效
  4. 一致性: 统一计算逻辑, 各处引用同一结果
```

---

## 9. Prometheus 高可用方案？

**回答：**

```
方案 1: 双副本 (简单)
  两个相同配置的 Prometheus, 各自独立抓取
  Grafana 配两个数据源或通过 LB 访问
  
  问题: 数据可能略有差异 (抓取时间不完全一致)

方案 2: Thanos
  Prometheus + Sidecar → S3
  Thanos Query 统一查询, 自动去重
  
  优势: 长期存储, 全局视图, 去重

方案 3: Cortex / Mimir
  Prometheus remote_write → Cortex/Mimir
  多副本写入, 读取时去重
  
  优势: 多租户, 水平扩展

方案 4: VictoriaMetrics (Cluster)
  Prometheus remote_write → VM
  vmselect/vminsert/vmstorage 分离
  
  优势: 高性能, 低资源消耗

HA 架构图 (Thanos):
  ┌──────────────┐  ┌──────────────┐
  │ Prometheus-0 │  │ Prometheus-1 │
  │ + Sidecar    │  │ + Sidecar    │
  └──────┬───────┘  └──────┬───────┘
         │                  │
         └────────┬─────────┘
                  │ upload
           ┌──────┴──────┐
           │  S3 / GCS   │
           └──────┬──────┘
                  │ read
           ┌──────┴──────┐
           │Thanos Query │ ← Grafana
           │  (去重)      │
           └─────────────┘
```

---

## 10. Prometheus 性能优化？

**回答：**

```
1. 控制时间序列数量 (Cardinality)
   ✗ 避免高基数标签 (user_id, request_id)
   ✓ 使用 relabel_configs 丢弃不需要的指标
   ✓ 定期检查: prometheus_tsdb_head_series

   metric_relabel_configs:
     - source_labels: [__name__]
       regex: 'go_.*'            # 丢弃 go runtime 指标
       action: drop

2. 优化抓取配置
   ✓ 合理 scrape_interval (15s-60s)
   ✓ scrape_timeout < scrape_interval
   ✗ 不要全局 5s 抓取

3. 使用 Recording Rules
   ✓ 预计算复杂查询
   ✓ 减少 Dashboard 查询开销

4. 存储优化
   ✓ SSD 存储 (TSDB 需要高 IOPS)
   ✓ 合理保留时间 (--storage.tsdb.retention)
   ✓ WAL 压缩: --storage.tsdb.wal-compression

5. 查询优化
   ✗ 避免全局聚合无过滤的大查询
   ✓ 使用标签过滤缩小范围
   ✓ 避免超长时间范围查询 (>7d)

6. 资源规划
   内存估算: 每百万活跃时间序列 ≈ 2-3 GB 内存
   磁盘估算: 每百万序列 × 每样本 1-2 bytes × 保留时间

   示例:
     100 万序列 × 15s 采样 × 15 天保留
     = 100万 × (86400/15) × 15 × 1.5 bytes
     ≈ 130 GB
```
