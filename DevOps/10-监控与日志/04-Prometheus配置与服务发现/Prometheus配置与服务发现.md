# Prometheus 配置与服务发现

---

## 1. prometheus.yml 全局配置详解？

**回答：**

```yaml
# prometheus.yml 完整结构
global:
  scrape_interval: 15s            # 默认抓取间隔
  scrape_timeout: 10s             # 抓取超时 (必须 < scrape_interval)
  evaluation_interval: 15s        # 规则评估间隔
  external_labels:                # 远程写入/联邦时附加的标签
    cluster: 'production'
    region: 'us-east-1'

# 告警规则文件
rule_files:
  - 'rules/*.yml'                 # 支持通配符

# Alertmanager 配置
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
      # 或使用服务发现
      # kubernetes_sd_configs:
      #   - role: endpoints

# 远程写入
remote_write:
  - url: 'http://thanos-receive:19291/api/v1/receive'

# 远程读取
remote_read:
  - url: 'http://thanos-query:9090/api/v1/read'

# 抓取配置 (核心)
scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
```

---

## 2. scrape_configs 详细配置？

**回答：**

```yaml
scrape_configs:
  - job_name: 'my-app'             # Job 名称 (对应 job 标签)
    
    # 覆盖全局配置
    scrape_interval: 10s
    scrape_timeout: 5s
    
    # 抓取路径和协议
    metrics_path: '/metrics'        # 默认 /metrics
    scheme: 'https'                 # 默认 http
    
    # 基本认证
    basic_auth:
      username: 'admin'
      password: 'secret'
    
    # Bearer Token
    authorization:
      type: Bearer
      credentials: 'token_xxx'
    
    # TLS 配置
    tls_config:
      ca_file: /etc/prom/ca.crt
      cert_file: /etc/prom/client.crt
      key_file: /etc/prom/client.key
      insecure_skip_verify: false
    
    # 静态目标
    static_configs:
      - targets: ['app1:8080', 'app2:8080']
        labels:
          env: 'production'
          team: 'backend'
      - targets: ['app3:8080']
        labels:
          env: 'staging'
    
    # 抓取时的标签处理
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
    
    # 指标存储前的标签处理
    metric_relabel_configs:
      - source_labels: [__name__]
        regex: 'go_.*'
        action: drop
```

---

## 3. 服务发现 (Service Discovery) 机制？

**回答：**

```
Prometheus 支持的服务发现方式:

┌──────────────────────┬──────────────────────────────────┐
│ 方式                  │ 说明                             │
├──────────────────────┼──────────────────────────────────┤
│ static_configs       │ 手动配置静态目标                  │
│ file_sd_configs      │ 文件服务发现 (JSON/YAML)          │
│ kubernetes_sd_configs│ Kubernetes API 自动发现           │
│ consul_sd_configs    │ Consul 服务注册中心               │
│ dns_sd_configs       │ DNS SRV/A 记录发现                │
│ ec2_sd_configs       │ AWS EC2 实例发现                  │
│ gce_sd_configs       │ GCP 实例发现                      │
│ azure_sd_configs     │ Azure VM 发现                     │
│ docker_sd_configs    │ Docker 容器发现                   │
│ http_sd_configs      │ 自定义 HTTP 端点发现              │
└──────────────────────┴──────────────────────────────────┘
```

```yaml
# 文件服务发现 (灵活, 配合 CMDB)
scrape_configs:
  - job_name: 'file_sd'
    file_sd_configs:
      - files:
          - '/etc/prometheus/targets/*.json'
          - '/etc/prometheus/targets/*.yml'
        refresh_interval: 30s     # 文件变更检测间隔

# targets.json
[
  {
    "targets": ["app1:8080", "app2:8080"],
    "labels": {
      "env": "prod",
      "team": "backend"
    }
  }
]
```

```yaml
# DNS 服务发现
scrape_configs:
  - job_name: 'dns_sd'
    dns_sd_configs:
      - names:
          - '_prometheus._tcp.example.com'   # SRV 记录
        type: SRV
        refresh_interval: 30s

# Consul 服务发现
scrape_configs:
  - job_name: 'consul'
    consul_sd_configs:
      - server: 'consul:8500'
        services:
          - 'web'
          - 'api'
```

---

## 4. Kubernetes 服务发现详解？

**回答：**

```yaml
# Kubernetes SD 支持的 role:
# node     → 发现 K8s 节点
# pod      → 发现 Pod
# service  → 发现 Service
# endpoints → 发现 Endpoints
# endpointslice → 发现 EndpointSlice
# ingress  → 发现 Ingress

# 发现 Pod (最常用)
scrape_configs:
  - job_name: 'kubernetes-pods'
    kubernetes_sd_configs:
      - role: pod
        namespaces:
          names: ['default', 'production']   # 限制命名空间
    relabel_configs:
      # 只抓取带 prometheus.io/scrape: "true" 注解的 Pod
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
        action: keep
        regex: true
      
      # 自定义 metrics 路径
      - source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_path]
        action: replace
        target_label: __metrics_path__
        regex: (.+)
      
      # 自定义端口
      - source_labels: [__address__, __meta_kubernetes_pod_annotation_prometheus_io_port]
        action: replace
        regex: ([^:]+)(?::\d+)?;(\d+)
        replacement: $1:$2
        target_label: __address__
      
      # 保留 Pod 相关标签
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
```

```yaml
# Pod 注解 (让 Prometheus 发现)
apiVersion: v1
kind: Pod
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "8080"
    prometheus.io/path: "/metrics"
```

```yaml
# 发现 Node (node_exporter on DaemonSet)
scrape_configs:
  - job_name: 'kubernetes-nodes'
    kubernetes_sd_configs:
      - role: node
    relabel_configs:
      - action: labelmap
        regex: __meta_kubernetes_node_label_(.+)
    scheme: https
    tls_config:
      ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    authorization:
      credentials_file: /var/run/secrets/kubernetes.io/serviceaccount/token

# 发现 Service (通过 ServiceMonitor, Prometheus Operator)
# ServiceMonitor 是 CRD, 无需手写 scrape_configs
```

---

## 5. relabel_configs 详解？

**回答：**

```
relabel_configs: 在抓取之前处理目标标签
metric_relabel_configs: 在存储之前处理指标标签

流程:
  服务发现 → __meta_* 标签
  → relabel_configs (处理目标, 决定是否抓取)
  → 抓取指标
  → metric_relabel_configs (处理指标, 决定是否保留)
  → 存储到 TSDB
```

```yaml
# relabel_configs action 类型:

# 1. keep — 保留匹配的目标
- source_labels: [__meta_kubernetes_pod_annotation_prometheus_io_scrape]
  action: keep
  regex: true
  # 只保留 annotation 为 true 的 Pod

# 2. drop — 丢弃匹配的目标
- source_labels: [__meta_kubernetes_namespace]
  action: drop
  regex: kube-system
  # 排除 kube-system 命名空间

# 3. replace — 替换标签值 (默认)
- source_labels: [__meta_kubernetes_namespace]
  target_label: namespace
  action: replace
  # 将 __meta_kubernetes_namespace 复制到 namespace 标签

# 4. labelmap — 批量映射标签名
- action: labelmap
  regex: __meta_kubernetes_node_label_(.+)
  # __meta_kubernetes_node_label_role → role

# 5. labeldrop — 删除匹配的标签
- action: labeldrop
  regex: __meta_.*
  # 删除所有 __meta_ 开头的标签

# 6. labelkeep — 只保留匹配的标签
- action: labelkeep
  regex: (job|instance|__name__)

# 7. hashmod — 哈希取模 (分片)
- source_labels: [__address__]
  modulus: 3
  target_label: __tmp_hash
  action: hashmod
- source_labels: [__tmp_hash]
  regex: 0                   # 只处理 hash=0 的 shard
  action: keep
```

---

## 6. metric_relabel_configs 实战用法？

**回答：**

```yaml
# 1. 丢弃不需要的指标 (减少存储)
metric_relabel_configs:
  # 丢弃 Go runtime 指标
  - source_labels: [__name__]
    regex: 'go_(gc|memstats|info|threads).*'
    action: drop
  
  # 丢弃高基数指标
  - source_labels: [__name__]
    regex: 'http_request_duration_seconds_bucket'
    action: drop

# 2. 丢弃特定标签值的指标
  - source_labels: [__name__, method]
    separator: ':'
    regex: 'http_requests_total:OPTIONS'
    action: drop

# 3. 重命名指标
  - source_labels: [__name__]
    regex: 'old_metric_name'
    target_label: __name__
    replacement: 'new_metric_name'

# 4. 删除不需要的标签 (减少基数)
  - action: labeldrop
    regex: '(pod_template_hash|controller_revision_hash)'

# 5. 替换标签值
  - source_labels: [instance]
    regex: '(.+):(\d+)'
    target_label: instance
    replacement: '$1'          # 去掉端口号
```

```
实际场景:
  问题: node_exporter 暴露 500+ 指标, 只需要 50 个
  方案: 用 metric_relabel_configs 白名单过滤
  
  - source_labels: [__name__]
    regex: 'node_(cpu|memory|disk|filesystem|network).*'
    action: keep               # 只保留匹配的指标
```

---

## 7. Blackbox Exporter 外部探测？

**回答：**

```yaml
# blackbox.yml (Blackbox Exporter 配置)
modules:
  http_2xx:
    prober: http
    timeout: 5s
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2.0"]
      valid_status_codes: [200]
      method: GET
      follow_redirects: true
      fail_if_body_matches_regexp:
        - "error"
  
  http_post_2xx:
    prober: http
    http:
      method: POST
      body: '{"test": true}'
      headers:
        Content-Type: application/json
  
  tcp_connect:
    prober: tcp
    timeout: 5s
  
  icmp_ping:
    prober: icmp
    timeout: 5s
  
  dns_test:
    prober: dns
    dns:
      query_name: "example.com"
      query_type: "A"
```

```yaml
# prometheus.yml 配置
scrape_configs:
  - job_name: 'blackbox-http'
    metrics_path: /probe
    params:
      module: [http_2xx]
    static_configs:
      - targets:
          - https://example.com
          - https://api.example.com/health
          - https://internal-service:8080/healthz
    relabel_configs:
      # 将目标 URL 传给 blackbox exporter
      - source_labels: [__address__]
        target_label: __param_target
      - source_labels: [__param_target]
        target_label: instance
      - target_label: __address__
        replacement: blackbox-exporter:9115
```

```
Blackbox Exporter 关键指标:
  probe_success               # 1=成功, 0=失败
  probe_duration_seconds      # 探测总耗时
  probe_http_status_code      # HTTP 状态码
  probe_ssl_earliest_cert_expiry  # SSL 证书过期时间
  probe_http_content_length   # 响应体大小
  probe_dns_lookup_time_seconds   # DNS 解析时间

告警示例:
  # 网站宕机
  probe_success{job="blackbox-http"} == 0

  # SSL 证书 30 天内过期
  probe_ssl_earliest_cert_expiry - time() < 86400 * 30
```

---

## 8. Prometheus Operator 和 ServiceMonitor？

**回答：**

```
Prometheus Operator:
  K8s 原生方式管理 Prometheus
  通过 CRD 定义监控配置, 无需手写 prometheus.yml

CRD 资源:
  ┌─────────────────────┬──────────────────────────────┐
  │ CRD                 │ 用途                          │
  ├─────────────────────┼──────────────────────────────┤
  │ Prometheus          │ 管理 Prometheus 实例           │
  │ ServiceMonitor      │ 定义 Service 级抓取规则        │
  │ PodMonitor          │ 定义 Pod 级抓取规则            │
  │ PrometheusRule      │ 定义告警/Recording 规则        │
  │ Alertmanager        │ 管理 Alertmanager 实例         │
  │ ThanosRuler         │ 管理 Thanos 规则               │
  └─────────────────────┴──────────────────────────────┘
```

```yaml
# ServiceMonitor 示例
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  namespace: monitoring
  labels:
    release: kube-prometheus-stack   # 要匹配 Prometheus 的选择器
spec:
  namespaceSelector:
    matchNames:
      - production
  selector:
    matchLabels:
      app: my-app                    # 匹配 Service 标签
  endpoints:
    - port: http-metrics             # Service 端口名
      path: /metrics
      interval: 15s
      scrapeTimeout: 10s
```

```yaml
# PodMonitor 示例 (不需要 Service)
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: my-job
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: batch-job
  podMetricsEndpoints:
    - port: metrics
      interval: 30s
```

```yaml
# PrometheusRule 示例
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: my-app-alerts
  namespace: monitoring
  labels:
    release: kube-prometheus-stack
spec:
  groups:
    - name: my-app.rules
      rules:
        - alert: MyAppDown
          expr: up{job="my-app"} == 0
          for: 5m
          labels:
            severity: critical
          annotations:
            summary: "{{ $labels.instance }} is down"
```

---

## 9. Pushgateway 使用场景和配置？

**回答：**

```
Pushgateway: 用于短生命周期任务推送指标

场景:
  ✓ CronJob / Batch Job (运行完就退出)
  ✓ 脚本/工具 (运行时间极短)
  ✗ 不用于长期运行的服务 (用 Pull)
  ✗ 不用于替代服务发现

工作流:
  Short-lived Job → Push → Pushgateway ← Pull ← Prometheus
```

```bash
# 推送指标到 Pushgateway

# 简单推送
echo "batch_job_duration_seconds 42" | curl --data-binary @- \
  http://pushgateway:9091/metrics/job/batch_job/instance/cron1

# 推送多个指标
cat <<EOF | curl --data-binary @- http://pushgateway:9091/metrics/job/etl/instance/daily
# TYPE etl_records_processed counter
etl_records_processed 150000
# TYPE etl_duration_seconds gauge
etl_duration_seconds 325.5
# TYPE etl_errors_total counter
etl_errors_total 3
EOF

# 删除指标
curl -X DELETE http://pushgateway:9091/metrics/job/batch_job/instance/cron1
```

```python
# Python 推送
from prometheus_client import CollectorRegistry, Gauge, Counter, push_to_gateway

registry = CollectorRegistry()
duration = Gauge('batch_duration_seconds', 'Duration', registry=registry)
records = Counter('records_processed_total', 'Records', registry=registry)

duration.set(42.5)
records.inc(1000)

push_to_gateway('pushgateway:9091', job='etl_job', registry=registry)
```

```yaml
# Prometheus 抓取 Pushgateway
scrape_configs:
  - job_name: 'pushgateway'
    honor_labels: true             # 保留 Push 时设置的标签
    static_configs:
      - targets: ['pushgateway:9091']
```

```
注意事项:
  ✗ Pushgateway 不会自动清理过期指标
  ✗ 多个 Job Push 同一指标会覆盖
  ✓ 设置 honor_labels: true
  ✓ 用完主动 DELETE 清理
  ✓ Pushgateway 本身是单点, 需要保证可用性
```

---

## 10. Prometheus 配置热重载？

**回答：**

```bash
# 方法 1: 发送 SIGHUP 信号
kill -HUP $(pidof prometheus)

# 方法 2: HTTP API (需启用 --web.enable-lifecycle)
curl -X POST http://localhost:9090/-/reload

# 方法 3: Prometheus Operator 自动重载
# 修改 ConfigMap/Secret → Operator 自动检测 → 重载

# 启动参数启用 lifecycle API
prometheus \
  --config.file=/etc/prometheus/prometheus.yml \
  --web.enable-lifecycle \
  --storage.tsdb.path=/prometheus \
  --storage.tsdb.retention.time=30d \
  --web.console.templates=/etc/prometheus/consoles \
  --web.console.libraries=/etc/prometheus/console_libraries
```

```yaml
# K8s ConfigMap 挂载 + Sidecar 自动重载
# 使用 configmap-reload sidecar
containers:
  - name: prometheus
    image: prom/prometheus:v2.48.0
    args:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--web.enable-lifecycle'
    volumeMounts:
      - name: config
        mountPath: /etc/prometheus
  
  - name: config-reloader
    image: jimmidyson/configmap-reload:v0.9.0
    args:
      - '--volume-dir=/etc/prometheus'
      - '--webhook-url=http://localhost:9090/-/reload'
    volumeMounts:
      - name: config
        mountPath: /etc/prometheus

# 验证配置
promtool check config prometheus.yml
# 输出: Checking prometheus.yml ... SUCCESS
```
