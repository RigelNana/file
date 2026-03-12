# ELK 日志系统

---

## 1. ELK Stack 架构和各组件作用？

**回答：**

```
ELK Stack (Elastic Stack):

  日志源 → Beats/Fluentd → Logstash → Elasticsearch → Kibana
           (采集)          (处理)      (存储和搜索)    (可视化)

组件:
  ┌─────────────────┬──────────────────────────────────────────────┐
  │ 组件             │ 作用                                         │
  ├─────────────────┼──────────────────────────────────────────────┤
  │ Elasticsearch   │ 分布式搜索和分析引擎, 基于 Lucene            │
  │                 │ 存储和索引日志, 提供 RESTful API              │
  │ Logstash        │ 数据处理管道 (Input → Filter → Output)       │
  │                 │ 支持丰富的插件: grok, mutate, geoip 等       │
  │ Kibana          │ Web 可视化界面                                │
  │                 │ 搜索、分析、Dashboard、Lens、Maps            │
  │ Beats           │ 轻量级数据采集器                              │
  │                 │ Filebeat(文件), Metricbeat(指标),             │
  │                 │ Packetbeat(网络), Heartbeat(探测)            │
  └─────────────────┴──────────────────────────────────────────────┘

常见架构模式:
  简单:     Filebeat → Elasticsearch → Kibana
  标准:     Filebeat → Logstash → Elasticsearch → Kibana
  缓冲:     Filebeat → Kafka → Logstash → Elasticsearch → Kibana
  高可用:   Filebeat → Kafka → Logstash(多实例) → ES(集群) → Kibana
```

---

## 2. Elasticsearch 核心概念？

**回答：**

```
与关系数据库类比:
  ┌──────────────┬──────────────┐
  │ Elasticsearch │ RDBMS        │
  ├──────────────┼──────────────┤
  │ Index        │ Database     │
  │ Document     │ Row          │
  │ Field        │ Column       │
  │ Mapping      │ Schema       │
  │ Shard        │ Partition    │
  │ Replica      │ Replica      │
  └──────────────┴──────────────┘

Index (索引):
  文档的集合, 类似数据库
  命名: filebeat-2024.01.15 (按日分索引)
  
Document (文档):
  JSON 格式的数据单元
  {
    "@timestamp": "2024-01-15T10:00:00Z",
    "level": "ERROR",
    "message": "Connection timeout",
    "service": "api"
  }

Shard (分片):
  Primary Shard:  数据的主分片 (创建后不可更改数量)
  Replica Shard:  主分片的副本 (可动态调整)
  
  Index: 5 primary shards × 1 replica = 10 shards total
  
  分片策略:
    日志场景: 按日分索引 → 每个索引固定分片数
    分片大小: 建议 10-50 GB /shard

Mapping (映射):
  定义字段的数据类型
  text:    全文搜索 (分词)
  keyword: 精确匹配 (不分词)
  date:    日期
  long:    整数
  boolean: 布尔
```

---

## 3. Elasticsearch 集群架构？

**回答：**

```
节点角色:
  ┌────────────────┬──────────────────────────────────┐
  │ 角色            │ 说明                             │
  ├────────────────┼──────────────────────────────────┤
  │ Master         │ 集群管理 (创建/删除索引, 分片分配) │
  │ Data           │ 存储数据, 执行 CRUD 和搜索         │
  │ Ingest         │ 预处理管道 (类似轻量 Logstash)     │
  │ Coordinating   │ 接收请求, 路由分发, 合并结果       │
  │ ML             │ 机器学习节点                       │
  └────────────────┴──────────────────────────────────┘

生产集群推荐:
  3 Master-eligible nodes (高可用, 防止脑裂)
  N Data nodes (根据数据量和查询量)
  2+ Coordinating nodes (处理查询请求)

集群架构:
  Client → Coordinating Node → Data Nodes
                                  │
                              ┌───┴───┐
                              │Master │ (选举)
                              │Cluster│
                              └───────┘
```

```yaml
# elasticsearch.yml (Data Node)
cluster.name: production-logs
node.name: data-node-1
node.roles: [data, ingest]

network.host: 0.0.0.0
discovery.seed_hosts: ["master-1", "master-2", "master-3"]
cluster.initial_master_nodes: ["master-1", "master-2", "master-3"]

path.data: /var/lib/elasticsearch
path.logs: /var/log/elasticsearch

# JVM 设置 (jvm.options)
# -Xms16g
# -Xmx16g (不超过物理内存 50%, 且不超过 32GB)
```

---

## 4. Filebeat 配置和使用？

**回答：**

```yaml
# filebeat.yml
filebeat.inputs:
  # 采集 Nginx 日志
  - type: log
    enabled: true
    paths:
      - /var/log/nginx/access.log
      - /var/log/nginx/error.log
    fields:
      app: nginx
      env: production
    fields_under_root: true

  # 多行日志 (Java Stack Trace)
  - type: log
    paths:
      - /var/log/app/application.log
    multiline.pattern: '^\d{4}-\d{2}-\d{2}'
    multiline.negate: true
    multiline.match: after
    # 不以日期开头的行 → 合并到上一行

  # 容器日志
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
    processors:
      - add_docker_metadata: ~
      - add_kubernetes_metadata: ~

# 处理器 (轻量处理)
processors:
  - add_host_metadata: ~
  - add_cloud_metadata: ~
  - drop_fields:
      fields: ["agent.ephemeral_id", "agent.hostname"]

# 输出到 Elasticsearch
output.elasticsearch:
  hosts: ["es-node1:9200", "es-node2:9200"]
  index: "filebeat-%{[agent.version]}-%{+yyyy.MM.dd}"
  username: "elastic"
  password: "${ES_PASSWORD}"

# 或输出到 Logstash
output.logstash:
  hosts: ["logstash:5044"]
  loadbalance: true

# 或输出到 Kafka (缓冲)
output.kafka:
  hosts: ["kafka1:9092", "kafka2:9092"]
  topic: "logs-%{[fields.app]}"
  partition.round_robin:
    reachable_only: true
```

```
Filebeat 模块 (开箱即用):
  filebeat modules enable nginx
  filebeat modules enable system
  filebeat modules enable mysql
  filebeat modules enable docker
  filebeat modules enable kubernetes

  模块包含:
    预定义的采集配置
    Logstash/Ingest pipeline
    Kibana Dashboard
```

---

## 5. Logstash Pipeline 详解？

**回答：**

```ruby
# logstash.conf
# 三段式: Input → Filter → Output

input {
  beats {
    port => 5044
  }
  
  kafka {
    bootstrap_servers => "kafka:9092"
    topics => ["app-logs"]
    group_id => "logstash"
    codec => "json"
  }
}

filter {
  # 1. Grok — 解析非结构化日志
  if [app] == "nginx" {
    grok {
      match => {
        "message" => '%{IPORHOST:client_ip} - %{DATA:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status:int} %{NUMBER:bytes:int} "%{DATA:referrer}" "%{DATA:user_agent}"'
      }
    }
  }

  # 2. JSON — 解析 JSON 日志
  if [app] == "api" {
    json {
      source => "message"
      target => "parsed"
    }
  }

  # 3. Date — 解析时间戳
  date {
    match => ["timestamp", "dd/MMM/yyyy:HH:mm:ss Z", "ISO8601"]
    target => "@timestamp"
  }

  # 4. Mutate — 修改字段
  mutate {
    rename    => { "client_ip" => "client.ip" }
    convert   => { "status" => "integer" }
    remove_field => ["message", "agent", "ecs"]
    add_field => { "environment" => "production" }
    lowercase => ["method"]
  }

  # 5. GeoIP — IP 地理位置
  geoip {
    source => "client.ip"
    target => "geo"
  }

  # 6. Useragent — 解析 UA
  useragent {
    source => "user_agent"
    target => "ua"
  }

  # 7. Drop — 丢弃不需要的日志
  if [status] == 200 and [request] =~ "healthz" {
    drop { }
  }

  # 8. Fingerprint — 去重
  fingerprint {
    source => ["message"]
    target => "[@metadata][fingerprint]"
    method => "SHA256"
  }
}

output {
  elasticsearch {
    hosts => ["es:9200"]
    index => "%{[app]}-%{+YYYY.MM.dd}"
    document_id => "%{[@metadata][fingerprint]}"
    user => "elastic"
    password => "${ES_PWD}"
  }
  
  # 调试输出
  # stdout { codec => rubydebug }
}
```

---

## 6. Grok 表达式怎么写？

**回答：**

```
Grok: 预定义正则表达式的命名模式

语法: %{PATTERN:field_name:type}

常用模式:
  %{IP:client_ip}             → 匹配 IP 地址
  %{IPORHOST:host}            → IP 或主机名
  %{NUMBER:count:int}         → 数字 (转整数)
  %{WORD:method}              → 单个词
  %{DATA:field}               → 任意字符 (非贪婪)
  %{GREEDYDATA:message}       → 任意字符 (贪婪)
  %{HTTPDATE:timestamp}       → HTTP 日期格式
  %{URIPATHPARAM:request}     → URI 路径+参数
  %{LOGLEVEL:level}           → 日志级别

常见日志格式:

# Nginx Combined
'%{IPORHOST:client_ip} - %{DATA:user} \[%{HTTPDATE:timestamp}\] "%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:http_version}" %{NUMBER:status} %{NUMBER:bytes} "%{DATA:referrer}" "%{DATA:user_agent}"'

# Apache Common
'%{COMMONAPACHELOG}'

# Syslog
'%{SYSLOGLINE}'

# 自定义应用日志
# 2024-01-15 10:00:05 ERROR [main] com.app.Service - Failed to connect
'%{TIMESTAMP_ISO8601:timestamp} %{LOGLEVEL:level} \[%{DATA:thread}\] %{DATA:class} - %{GREEDYDATA:message}'
```

```
调试工具:
  Kibana Dev Tools → Grok Debugger
  在线: grokdebugger.com
  命令行: logstash -e 'filter { grok { ... } }'

性能注意:
  ✗ 避免过于复杂的正则 (性能差)
  ✓ 使用 anchoring: ^pattern$
  ✓ 如果是 JSON 日志, 直接用 json filter, 不用 grok
```

---

## 7. Index Lifecycle Management (ILM)？

**回答：**

```
ILM: 自动管理索引生命周期

阶段:
  Hot    → Warm    → Cold    → Frozen → Delete
  (读写)   (只读)   (低频)    (归档)    (删除)

  Hot:    SSD, 高性能, 当前写入的索引
  Warm:   HDD, 只读, 近期数据 (7-30 天)
  Cold:   低成本存储, 极少访问
  Frozen: 快照恢复, 归档
  Delete: 自动删除过期数据
```

```json
// ILM Policy
PUT _ilm/policy/logs-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_age": "1d",
            "max_primary_shard_size": "50gb"
          },
          "set_priority": { "priority": 100 }
        }
      },
      "warm": {
        "min_age": "7d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 },
          "set_priority": { "priority": 50 },
          "allocate": {
            "require": { "data": "warm" }
          }
        }
      },
      "cold": {
        "min_age": "30d",
        "actions": {
          "set_priority": { "priority": 0 },
          "allocate": {
            "require": { "data": "cold" }
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

```json
// 索引模板关联 ILM
PUT _index_template/logs-template
{
  "index_patterns": ["logs-*"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "index.lifecycle.name": "logs-policy",
      "index.lifecycle.rollover_alias": "logs"
    }
  }
}
```

---

## 8. Kibana 常用功能？

**回答：**

```
Kibana 核心功能:
  ┌─────────────────────┬──────────────────────────────────┐
  │ 功能                 │ 说明                             │
  ├─────────────────────┼──────────────────────────────────┤
  │ Discover            │ 搜索和浏览日志 (主要功能)          │
  │ Dashboard           │ 可视化仪表盘                      │
  │ Lens                │ 拖拽式可视化创建工具               │
  │ Dev Tools           │ 直接执行 ES API 请求              │
  │ Stack Monitoring    │ 监控 ELK 自身健康                 │
  │ Alerts & Actions    │ Kibana 原生告警                   │
  │ Index Management    │ 索引管理, ILM 策略                │
  │ Security            │ 用户/角色/空间管理                │
  │ Spaces              │ 多租户隔离                        │
  └─────────────────────┴──────────────────────────────────┘

KQL (Kibana Query Language):
  status: 200                        # 精确匹配
  status >= 400                      # 范围查询
  message: "error" or message: "timeout"  # OR
  message: "error" and status: 500   # AND
  not status: 200                    # NOT
  message: error*                    # 通配符

Lucene Query:
  status:500                         # 精确
  message:"connection timeout"       # 短语
  status:[400 TO 500]                # 范围
  message:/err.*/                    # 正则
```

---

## 9. ELK 性能优化？

**回答：**

```
Elasticsearch 优化:

1. JVM Heap
   设置为物理内存 50%, 不超过 32GB
   -Xms16g -Xmx16g (相等, 避免 swap)

2. 分片策略
   分片大小: 10-50 GB
   分片数 = 数据量 / 分片大小
   过多分片 → Master 压力大
   过少分片 → 单分片过大, 恢复慢
   
3. Mapping 优化
   不需要搜索的字段 → "index": false
   不需要分词的字段 → "type": "keyword"
   不需要 _source → enabled: false (慎用)

4. 索引设置
   refresh_interval: 30s (默认 1s, 写入密集场景调大)
   translog.durability: async (异步刷盘, 提升写入性能)

5. 批量写入
   bulk API, 批量大小 5-15 MB
   
6. 查询优化
   使用 filter 替代 query (利用缓存)
   避免 wildcard 开头的查询
   设置 terminate_after 限制结果数

Logstash 优化:
  pipeline.workers: CPU 核数
  pipeline.batch.size: 125-500
  pipeline.batch.delay: 50-200 ms
  使用 persistent queue (磁盘队列, 防数据丢失)

Filebeat 优化:
  queue.mem.events: 4096
  output.elasticsearch.bulk_max_size: 2048
  harvester 数量 = 并发采集文件数
```

---

## 10. ELK 替代方案对比？

**回答：**

```
日志方案对比:
  ┌─────────────────┬─────────────────┬─────────────────┬─────────────────┐
  │ 维度             │ ELK Stack       │ Grafana Loki    │ Splunk          │
  ├─────────────────┼─────────────────┼─────────────────┼─────────────────┤
  │ 索引方式         │ 全文索引         │ 只索引标签       │ 全文索引         │
  │ 资源消耗         │ 高 (ES 吃内存)   │ 低               │ 高              │
  │ 搜索能力         │ 强 (Lucene)      │ 标签快/全文慢    │ 强              │
  │ 成本             │ 中 (自建)        │ 低               │ 高 (商业)       │
  │ Grafana 集成     │ 插件             │ 原生             │ 插件            │
  │ K8s 集成         │ Filebeat/Fluent  │ Promtail 原生    │ Connect         │
  │ 学习曲线         │ 中               │ 低               │ 中              │
  │ 适用规模         │ 中大型           │ 中小型           │ 大型企业        │
  └─────────────────┴─────────────────┴─────────────────┴─────────────────┘

选型建议:
  已有 Grafana + Prometheus → Loki (Grafana Stack)
  需要强大全文搜索 → ELK
  企业级/合规需求 → Splunk / Elastic Cloud
  预算有限 → Loki
  
日志采集器对比:
  ┌──────────────┬─────────────────────────────────┐
  │ 采集器        │ 特点                             │
  ├──────────────┼─────────────────────────────────┤
  │ Filebeat     │ Elastic 出品, 轻量, ELK 生态     │
  │ Fluentd      │ CNCF 项目, 插件丰富, K8s 标配    │
  │ Fluent Bit   │ Fluentd 的轻量版, 资源消耗极低   │
  │ Promtail     │ Loki 专用, 简单高效               │
  │ Vector       │ Datadog 开发, Rust, 高性能        │
  └──────────────┴─────────────────────────────────┘
```
