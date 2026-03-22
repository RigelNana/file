# Prometheus 与监控实践八股文

---

## 一、Prometheus 架构

### 1. Prometheus 的架构组件有哪些？

**答：**

```
                    ┌──────────────┐
                    │ Prometheus   │
目标(Targets)       │   Server     │       Grafana
 ┌─────────┐  pull │ ┌──────────┐ │       ┌──────┐
 │ exporter │◄──────│ │ 采集引擎  │ │──────▶│ 可视化│
 └─────────┘       │ ├──────────┤ │ PromQL└──────┘
 ┌─────────┐  pull │ │ TSDB     │ │
 │ 应用/SDK │◄──────│ │ 时序存储  │ │       Alertmanager
 └─────────┘       │ ├──────────┤ │       ┌──────────┐
                    │ │ 告警引擎  │ │──────▶│ 路由/静默 │
 Service Discovery  │ └──────────┘ │       │ 通知分发  │
 ┌─────────┐       └──────────────┘       └──────────┘
 │ K8s/DNS │               │
 │ Consul  │               ▼
 └─────────┘         远程存储(可选)
                    Thanos/Mimir
```

| 组件 | 作用 |
|------|------|
| **Prometheus Server** | 采集、存储、查询、告警规则评估 |
| **Exporters** | 暴露各种系统指标 |
| **Pushgateway** | 短生命周期任务推送指标 |
| **Alertmanager** | 告警路由、静默、分组、通知 |
| **Service Discovery** | 自动发现监控目标 |

### 2. Prometheus 的 Pull 模型有什么优缺点？

**答：**

| Pull 模型 | Push 模型 |
|-----------|-----------|
| Prom 主动拉取 | 应用主动推送 |
| ✅ 监控端控制节奏 | ✅ 适合短生命周期任务 |
| ✅ 容易判断目标健康 | ✅ 穿越防火墙 |
| ❌ 需要目标可达 | ❌ 可能淹没监控端 |
| ❌ 短任务可能错过 | ❌ 难以判断目标宕机 |

### 3. Prometheus 在 Kubernetes 中如何服务发现？

**答：**

```yaml
# prometheus.yml
scrape_configs:
  # 自动发现所有 Pod（带 annotations）
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      # 只采集有 prometheus.io/scrape=true 的 Pod
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      # 使用 Pod annotations 中的端口
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        target_label: __address__
        regex: (.+)
```

---

## 二、PromQL 核心

### 4. PromQL 常用函数有哪些？

**答：**

| 函数 | 作用 | 示例 |
|------|------|------|
| **rate()** | Counter 的每秒变化率 | rate(http_requests_total[5m]) |
| **increase()** | Counter 的增量 | increase(http_requests_total[1h]) |
| **histogram_quantile()** | 计算百分位 | histogram_quantile(0.99, rate(http_duration_bucket[5m])) |
| **sum()** | 求和聚合 | sum(rate(...)) by (service) |
| **avg()** | 平均值 | avg(cpu_usage) by (instance) |
| **topk()** | Top N | topk(5, rate(http_requests_total[5m])) |
| **predict_linear()** | 线性预测 | predict_linear(disk_free[1h], 4*3600) |
| **absent()** | 目标消失检测 | absent(up{job="api"}) |

### 5. 常用的告警 PromQL 表达式有哪些？

**答：**

```promql
# 服务宕机
up == 0

# HTTP 错误率 > 1%
sum(rate(http_requests_total{code=~"5.."}[5m]))
/ sum(rate(http_requests_total[5m])) > 0.01

# P99 延迟 > 1s
histogram_quantile(0.99,
  sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
) > 1

# 磁盘 4 小时后将满
predict_linear(node_filesystem_avail_bytes[1h], 4*3600) < 0

# Pod 频繁重启
increase(kube_pod_container_status_restarts_total[1h]) > 3

# 证书 7 天内过期
(probe_ssl_earliest_cert_expiry - time()) / 86400 < 7
```

---

## 三、告警实践

### 6. Alertmanager 的告警路由机制是怎样的？

**答：**

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m

route:
  receiver: 'default-slack'
  group_by: ['alertname', 'service']
  group_wait: 30s       # 同组告警等待时间
  group_interval: 5m    # 同组告警发送间隔
  repeat_interval: 4h   # 重复告警间隔
  routes:
    # P0 告警 → 电话通知
    - match:
        severity: critical
      receiver: 'pagerduty'
      repeat_interval: 15m
    # P1 告警 → Slack
    - match:
        severity: warning
      receiver: 'slack-oncall'
    # 数据库告警 → DBA 频道
    - match:
        team: dba
      receiver: 'slack-dba'

inhibit_rules:
  # critical 抑制同服务的 warning
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'service']
```

### 7. 如何减少告警噪音？

**答：**

| 策略 | 方法 |
|------|------|
| **聚合** | group_by 将相关告警合并 |
| **抑制** | 高级别抑制低级别 |
| **静默** | 计划维护时创建 Silence |
| **阈值调优** | 基于历史数据调整阈值 |
| **for 子句** | 持续一段时间才告警 |
| **燃烧率** | 用 SLO 燃烧率代替静态阈值 |

---

## 四、高可用与扩展

### 8. Prometheus 如何实现高可用？

**答：**

```
方案一：双写（简单）
┌──────────┐    ┌──────────┐
│ Prom-A   │    │ Prom-B   │
│ (主)     │    │ (备)      │
└────┬─────┘    └────┬─────┘
     │               │
     └───── 都采集 ───┘ 同样的目标
         │
    Alertmanager (HA)
    └── 去重后通知

方案二：Thanos（生产推荐）
Prometheus-1 ─┐
Prometheus-2 ─┼──▶ Thanos Sidecar ──▶ 对象存储(S3)
Prometheus-3 ─┘           │
                     Thanos Query ◄── Grafana
                     (全局查询去重)
```

### 9. Thanos 和 Cortex/Mimir 怎么选？

**答：**

| 对比 | Thanos | Cortex/Mimir |
|------|--------|-------------|
| 架构 | Sidecar 模式 | 集中写入 |
| 部署 | 相对简单 | 较复杂 |
| 多租户 | 有限支持 | 原生支持 |
| 长期存储 | ✅ 对象存储 | ✅ 对象存储 |
| 全局查询 | ✅ | ✅ |
| 适合 | 中等规模、分散部署 | 大规模、多租户 |

---

## 五、面试高频题

### 10. 面试题：Prometheus 的局限性有哪些？

**答：**

| 局限性 | 描述 | 应对 |
|--------|------|------|
| 本地存储 | 单机 TSDB 容量有限 | Thanos/Mimir 远程存储 |
| Pull 模型 | 短生命周期任务难采集 | Pushgateway |
| 高基数 | 标签基数爆炸性能差 | 严格管控标签 |
| 非分布式 | 单实例查询能力有限 | 联邦/Thanos |
| 无日志/追踪 | 只做 Metrics | 配合 Loki/Tempo |
| 精确度 | 采样间隔限制（15s默认） | 缩短间隔或用其他方案 |

### 11. 面试题：如何监控 Prometheus 自身？

**答：**

```promql
# Prometheus 自身关键指标

# 采集目标健康度
up

# 采集持续时间
scrape_duration_seconds

# TSDB 存储大小
prometheus_tsdb_storage_size_bytes

# 查询延迟
prometheus_engine_query_duration_seconds

# 告警规则评估延迟
prometheus_rule_evaluation_duration_seconds

# 内存使用
process_resident_memory_bytes

# 目标采集失败
scrape_samples_scraped - scrape_samples_post_metric_relabeling
```
