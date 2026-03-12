# Loki 与日志管理

---

## 1. Grafana Loki 架构和设计理念？

**回答：**

```
Loki: "Like Prometheus, but for logs"

设计理念:
  ✗ 不全文索引日志内容 (不像 Elasticsearch)
  ✓ 只索引元数据 (标签集)
  ✓ 日志内容以压缩块存储
  ✓ 查询时对匹配的日志流做 grep

  好处:
    存储成本低 (不建倒排索引)
    运维简单 (无需 JVM, 无需管理分片)
    与 Prometheus 标签体系一致
  
  代价:
    全文搜索慢 (需要遍历匹配流的所有日志)
    不适合需要复杂全文搜索的场景

架构:
  ┌──────────────┐   ┌──────────────┐
  │ Promtail     │   │ Fluent Bit   │  (采集器)
  │ (Log Agent)  │   │ (Log Agent)  │
  └──────┬───────┘   └──────┬───────┘
         │                   │
         └─────────┬─────────┘
                   │ Push API
         ┌─────────┴─────────┐
         │       Loki        │
         │  ┌─────────────┐  │
         │  │ Distributor  │  │  接收日志, 分发
         │  │ Ingester     │  │  写入内存, 刷盘
         │  │ Querier      │  │  查询日志
         │  │ Query Frontend│ │  查询缓存/分片
         │  │ Compactor    │  │  压缩和保留
         │  └─────────────┘  │
         └────────┬──────────┘
                  │
         ┌────────┴──────────┐
         │  Object Store     │  S3 / GCS / MinIO
         │  (Chunks + Index) │
         └───────────────────┘
```

---

## 2. Loki 部署模式？

**回答：**

```
三种部署模式:

1. Monolithic (单体模式)
   所有组件在一个进程中
   适合: 开发/测试, 日志量 < 100GB/天
   
   docker run grafana/loki:latest

2. Simple Scalable (简单可扩展)
   分为 Read 和 Write 两组
   适合: 中等规模, 日志量 100GB-1TB/天
   
   Write Path: distributor + ingester
   Read Path:  query-frontend + querier
   Backend:    compactor + ruler

3. Microservices (微服务模式)
   每个组件独立部署, 独立扩展
   适合: 大规模生产, 日志量 > 1TB/天

推荐:
  大多数场景: Simple Scalable + S3
```

```yaml
# Docker Compose 部署 (Monolithic)
services:
  loki:
    image: grafana/loki:2.9.0
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/local-config.yaml
    volumes:
      - ./loki-config.yaml:/etc/loki/local-config.yaml
      - loki-data:/loki

  promtail:
    image: grafana/promtail:2.9.0
    volumes:
      - ./promtail-config.yaml:/etc/promtail/config.yml
      - /var/log:/var/log
    command: -config.file=/etc/promtail/config.yml
```

```yaml
# loki-config.yaml (S3 存储)
auth_enabled: false

server:
  http_listen_port: 3100

common:
  path_prefix: /loki
  storage:
    s3:
      s3: s3://us-east-1/loki-chunks
      access_key_id: ${AWS_ACCESS_KEY_ID}
      secret_access_key: ${AWS_SECRET_ACCESS_KEY}
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 30d
  max_query_series: 500
  max_query_parallelism: 32

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
```

---

## 3. Promtail 配置详解？

**回答：**

```yaml
# promtail-config.yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml    # 记录采集位置 (类似 Filebeat registry)

clients:
  - url: http://loki:3100/loki/api/v1/push
    tenant_id: default             # 多租户

scrape_configs:
  # 静态文件采集
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          host: server1
          __path__: /var/log/*.log

  # Nginx 日志
  - job_name: nginx
    static_configs:
      - targets: [localhost]
        labels:
          job: nginx
          __path__: /var/log/nginx/access.log
    pipeline_stages:
      - regex:
          expression: '^(?P<remote_addr>[\w\.]+) - .* \[.*\] "(?P<method>\w+) (?P<url>.*) HTTP/.*" (?P<status>\d+) (?P<bytes>\d+)'
      - labels:
          method:
          status:
      - metrics:
          http_requests_total:
            type: Counter
            description: "Total HTTP requests"
            source: status
            config:
              action: inc

  # Docker 容器日志
  - job_name: docker
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        target_label: 'container'
      - source_labels: ['__meta_docker_container_log_stream']
        target_label: 'stream'

  # Kubernetes Pod 日志
  - job_name: kubernetes
    kubernetes_sd_configs:
      - role: pod
    relabel_configs:
      - source_labels: [__meta_kubernetes_pod_label_app]
        target_label: app
      - source_labels: [__meta_kubernetes_namespace]
        target_label: namespace
      - source_labels: [__meta_kubernetes_pod_name]
        target_label: pod
    pipeline_stages:
      - cri: {}                    # 解析 CRI 日志格式
      - json:
          expressions:
            level: level
            msg: message
      - labels:
          level:
```

---

## 4. Promtail Pipeline Stages？

**回答：**

```yaml
# Pipeline: 日志处理管道
# 阶段类型:
#   解析: docker, cri, regex, json, logfmt, multiline
#   转换: template, replace, trim
#   标签: labels, labelallow, labeldrop
#   指标: metrics
#   过滤: match, drop
#   输出: output, tenant

pipeline_stages:
  # 1. JSON 解析
  - json:
      expressions:
        level: level
        message: msg
        trace_id: trace_id
        timestamp: ts

  # 2. 正则解析
  - regex:
      expression: '^(?P<timestamp>\S+) (?P<level>\w+) (?P<message>.*)$'

  # 3. Logfmt 解析 (key=value 格式)
  - logfmt:
      mapping:
        level:
        msg:
        caller:

  # 4. 设置标签 (从解析结果)
  - labels:
      level:           # 将解析出的 level 设为标签

  # 5. 时间戳处理
  - timestamp:
      source: timestamp
      format: "2006-01-02T15:04:05.000Z"   # Go 时间格式

  # 6. 输出 (设置日志行内容)
  - output:
      source: message   # 只保留 message 字段作为日志行

  # 7. 多行合并
  - multiline:
      firstline: '^\d{4}-\d{2}-\d{2}'
      max_wait_time: 3s
      max_lines: 128

  # 8. 丢弃日志
  - drop:
      expression: '.*healthcheck.*'
      drop_counter_reason: "healthcheck"

  # 9. 模板转换
  - template:
      source: level
      template: '{{ ToUpper .Value }}'

  # 10. 租户 ID
  - tenant:
      source: team        # 按 team 标签多租户路由

  # 11. 指标生成 (Promtail 暴露 Prometheus 指标)
  - metrics:
      log_lines_total:
        type: Counter
        description: "Total log lines"
        config:
          match_all: true
          action: inc
```

---

## 5. LogQL 查询语言？

**回答：**

```
LogQL = Log Query Language, 类似 PromQL

两种查询类型:
  Log Query (日志查询):  返回日志行
  Metric Query (指标查询): 返回数值 (从日志中计算)
```

```
# ===== Log Query =====

# 流选择器 (Stream Selector)
{job="nginx"}                         # 精确匹配
{namespace="production", app="api"}   # 多标签
{job=~"nginx|apache"}                 # 正则匹配
{job!="debug"}                        # 不等于

# 行过滤 (Line Filter)
{job="nginx"} |= "error"             # 包含 error
{job="nginx"} != "healthcheck"       # 不包含
{job="nginx"} |~ "4[0-9]{2}"         # 正则匹配
{job="nginx"} !~ "GET /static"       # 正则不匹配

# 日志解析器
{job="api"} | json                    # 解析 JSON
{job="api"} | logfmt                  # 解析 key=value
{job="nginx"} | pattern "<ip> - - [<_>] \"<method> <uri> <_>\" <status> <size>"
{job="api"} | regexp "(?P<ip>\\S+) (?P<method>\\w+)"

# 标签过滤 (解析后)
{job="api"} | json | status >= 400
{job="api"} | json | level = "error"
{job="api"} | json | duration > 1s
{job="api"} | json | method = "POST", status >= 500

# 行格式化
{job="api"} | json | line_format "{{.level}} {{.message}}"

# 标签格式化
{job="api"} | json | label_format duration="{{div .duration 1000}}ms"

# 去重
{job="api"} | decolorize | json | dedup 5s

# 组合示例: 查找 API 500 错误的详情
{namespace="production", app="api"} 
  | json 
  | status = 500 
  | line_format "{{.timestamp}} {{.method}} {{.path}} {{.error}}"
```

```
# ===== Metric Query =====

# 日志计数
count_over_time({job="nginx"} |= "error" [5m])        # 5 分钟内错误数

# 速率
rate({job="nginx"} |= "error" [5m])                    # 每秒错误率
bytes_rate({job="nginx"} [5m])                         # 每秒字节率

# 聚合
sum by (status)(count_over_time({job="nginx"} | json [5m]))   # 按状态码统计

# 分位数
quantile_over_time(0.99, {job="api"} | json | unwrap duration [5m])
# P99 延迟 (从日志中提取 duration 字段)

# Top 5 错误最多的服务
topk(5, sum by(app)(rate({namespace="production"} |= "error" [1h])))

# 不同值计数
count_over_time({job="api"} | json | distinct user_id [1h])
```

---

## 6. Loki 标签最佳实践？

**回答：**

```
标签 = Loki 的索引, 标签组合决定 Stream

核心原则:
  ✓ 使用少量静态标签 (job, namespace, app, env)
  ✗ 避免高基数标签 (user_id, request_id, ip)
  ✗ 避免动态标签 (values 经常变化)

推荐标签:
  ┌──────────────┬─────────────────────────────────┐
  │ 标签          │ 说明                             │
  ├──────────────┼─────────────────────────────────┤
  │ job          │ 来源 (nginx, api, worker)        │
  │ namespace    │ K8s 命名空间                      │
  │ app/service  │ 应用名                           │
  │ env          │ 环境 (prod, staging, dev)        │
  │ cluster      │ 集群名                           │
  │ level        │ 日志级别 (谨慎, 值少时可用)        │
  └──────────────┴─────────────────────────────────┘

不推荐的标签:
  ✗ user_id      → 高基数, 会创建百万 Stream
  ✗ trace_id     → 每个请求不同
  ✗ ip           → 动态变化
  ✗ request_path → 如果包含 ID (/users/123)

如何处理需要搜索的高基数字段:
  不设为标签, 放日志内容中
  查询时用解析器 + 过滤:
  {app="api"} | json | user_id = "123"

Stream 数量估算:
  labels: job(5) × namespace(3) × env(3) = 45 streams
  ✓ 合理

  labels: job(5) × pod(100) × container(3) = 1500 streams
  ⚠ 较多但可接受

  labels: job(5) × user_id(100000) = 500000 streams
  ✗ 太多, 会严重影响性能
```

---

## 7. Loki 与 Prometheus 配合？

**回答：**

```
标签一致性:
  Prometheus 和 Loki 使用相同标签体系
  方便从 Metrics 跳转到 Logs

示例:
  Prometheus 告警: up{job="api", instance="api-1:8080"} == 0
  Loki 查日志:     {job="api"} | json | pod = "api-1" |= "error"

Grafana 中关联:
  Dashboard 变量 $namespace, $app
  Prometheus Panel: rate(http_errors{namespace="$namespace", app="$app"}[5m])
  Loki Panel:       {namespace="$namespace", app="$app"} |= "error"
  → 切换变量时两个面板联动

Grafana Explore:
  Split View:
    左侧: Prometheus (指标图)
    右侧: Loki (对应时间段的日志)
  
  快速跳转:
    Prometheus Panel → 右键 → Explore → 切换到 Loki
    自动带上时间范围和相关标签

Recording Rules (Loki → Metrics):
  Loki Ruler 可以从日志中生成 Prometheus 指标
```

```yaml
# Loki Ruler 配置
ruler:
  storage:
    type: local
    local:
      directory: /loki/rules
  rule_path: /loki/rules-temp
  alertmanager_url: http://alertmanager:9093
  ring:
    kvstore:
      store: inmemory
  enable_api: true

# /loki/rules/tenant/rules.yml
groups:
  - name: log-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate({app="api"} |= "error" [5m])) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in logs"
```

---

## 8. Fluentd 和 Fluent Bit？

**回答：**

```
两者关系:
  Fluentd:   CNCF 毕业项目, Ruby, 功能强大, 插件丰富
  Fluent Bit: Fluentd 子项目, C, 极轻量, 适合边缘/容器

对比:
  ┌──────────────┬─────────────────────┬─────────────────────┐
  │ 维度          │ Fluentd             │ Fluent Bit          │
  ├──────────────┼─────────────────────┼─────────────────────┤
  │ 语言          │ Ruby + C            │ C                   │
  │ 内存占用       │ ~40 MB              │ ~1 MB               │
  │ 插件数量       │ 700+                │ 100+                │
  │ 适用角色       │ 聚合器 (Aggregator)  │ 采集器 (Agent)      │
  │ K8s 场景      │ 集中处理             │ DaemonSet 采集      │
  │ 性能          │ 中等                │ 高                  │
  └──────────────┴─────────────────────┴─────────────────────┘

常见架构:
  Node → Fluent Bit (轻量采集) → Fluentd (集中处理) → ES/Loki/S3
```

```yaml
# Fluent Bit 配置 (K8s DaemonSet)
# fluent-bit.conf
[SERVICE]
    Flush         5
    Daemon        Off
    Log_Level     info
    Parsers_File  parsers.conf

[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            cri
    Tag               kube.*
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   On
    Refresh_Interval  10

[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Merge_Log           On
    K8S-Logging.Parser  On

[OUTPUT]
    Name          loki
    Match         *
    Host          loki
    Port          3100
    Labels        job=fluent-bit, namespace=$kubernetes['namespace_name'], app=$kubernetes['labels']['app']
    Remove_Keys   kubernetes,stream

# 或输出到 Elasticsearch
[OUTPUT]
    Name          es
    Match         *
    Host          elasticsearch
    Port          9200
    Index         fluent-bit
    Type          _doc
```

---

## 9. 日志采集架构设计？

**回答：**

```
小规模 (日志 < 10 GB/天):
  App → Promtail → Loki → Grafana
  简单, 成本低

中规模 (日志 10-100 GB/天):
  App → Fluent Bit (DaemonSet) → Loki (Simple Scalable) → Grafana
  或
  App → Filebeat → Logstash → Elasticsearch → Kibana

大规模 (日志 > 100 GB/天):
  App → Fluent Bit → Kafka → Logstash/Flink → ES Cluster → Kibana
  
  引入 Kafka 的好处:
    削峰填谷 (突发流量缓冲)
    解耦 (采集和处理独立)
    数据持久化 (Kafka 保留)
    多消费者 (同时写 ES + S3)

多目的地架构:
  App → Fluent Bit → Kafka ─┬→ Logstash → ES (热查询)
                             ├→ S3 (长期归档)
                             └→ Loki (Grafana 查询)
```

```
K8s 日志架构:
  ┌─────────────────────────────────────────────┐
  │                K8s Cluster                   │
  │                                              │
  │  Pod   Pod   Pod  ← stdout/stderr            │
  │   │     │     │                              │
  │   └──── Container Runtime (CRI) ────┐        │
  │         /var/log/containers/*.log    │        │
  │                                     │        │
  │   ┌─────────────────────────────┐   │        │
  │   │  Fluent Bit (DaemonSet)     │───┘        │
  │   │  每个 Node 一个 Pod          │            │
  │   └────────────┬────────────────┘            │
  └────────────────┼─────────────────────────────┘
                   │
            ┌──────┴──────┐
            │ Loki / ES   │
            └──────┬──────┘
                   │
            ┌──────┴──────┐
            │ Grafana/    │
            │ Kibana      │
            └─────────────┘
```

---

## 10. 日志安全与合规？

**回答：**

```
日志脱敏:
  敏感数据不应出现在日志中:
    密码, Token, API Key
    信用卡号, 身份证号
    个人隐私 (PII)

  脱敏方式:
    应用层:   日志框架过滤 (log4j2 PatternLayout)
    采集层:   Fluent Bit/Logstash 插件脱敏
    存储层:   ES Field-level security

  # Logstash 脱敏示例
  filter {
    mutate {
      gsub => [
        "message", "\b\d{16,19}\b", "****CARD****",     # 信用卡号
        "message", "password=\S+", "password=***",       # 密码
        "message", "\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b", "***@***.***"  # 邮箱
      ]
    }
  }

日志保留策略:
  ┌──────────────┬──────────────────┐
  │ 日志类型      │ 建议保留时间      │
  ├──────────────┼──────────────────┤
  │ 应用日志      │ 30-90 天          │
  │ 安全审计日志   │ 1-7 年 (合规要求) │
  │ 访问日志      │ 90-180 天         │
  │ 调试日志      │ 7-14 天           │
  └──────────────┴──────────────────┘

访问控制:
  ES: RBAC (角色/字段级别权限)
  Loki: 多租户 (tenant_id)
  Kibana: Spaces (空间隔离)
  
合规:
  GDPR: 用户要求删除 → 需要能定位和删除相关日志
  PCI DSS: 信用卡数据不能出现在日志中
  HIPAA: 医疗数据加密存储
```
