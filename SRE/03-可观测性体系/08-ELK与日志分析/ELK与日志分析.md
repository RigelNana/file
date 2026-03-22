# ELK 与日志分析八股文

---

## 一、ELK 架构

### 1. ELK 栈的各组件作用是什么？

**答：**

| 组件 | 全称 | 作用 |
|------|------|------|
| **Elasticsearch** | - | 分布式全文搜索和分析引擎 |
| **Logstash** | - | 日志采集、转换、输出管道 |
| **Kibana** | - | 可视化和搜索界面 |
| **Beats** | Filebeat 等 | 轻量级数据采集器 |

```
完整架构：

应用日志 → Filebeat → Kafka(缓冲) → Logstash → Elasticsearch → Kibana
                                        │
                                    解析/转换/富化
```

### 2. Elasticsearch 的核心概念有哪些？

**答：**

| 概念 | 类比 | 描述 |
|------|------|------|
| **Index** | 数据库表 | 文档集合（如 logs-2024.01） |
| **Document** | 行 | 一条日志记录 |
| **Shard** | 分片 | 索引的水平切分 |
| **Replica** | 副本 | 分片的冗余拷贝 |
| **Node** | 服务器 | ES 集群中的一个实例 |
| **Mapping** | Schema | 字段类型定义 |

```
集群拓扑示例：

Index: logs-2024.01 (2 shards, 1 replica)

Node 1           Node 2           Node 3
┌──────────┐    ┌──────────┐    ┌──────────┐
│ Shard 0  │    │ Shard 1  │    │ Replica 0│
│ (Primary)│    │ (Primary)│    │          │
│          │    │ Replica 0│    │ Replica 1│
└──────────┘    └──────────┘    └──────────┘
```

### 3. Filebeat 和 Logstash 的区别？

**答：**

| 对比 | Filebeat | Logstash |
|------|----------|----------|
| 资源 | 极轻量（Go 编写） | 较重（JVM） |
| 功能 | 采集和简单处理 | 复杂转换和富化 |
| 部署 | DaemonSet/Sidecar | 集中部署 |
| 解析 | 简单的行处理 | Grok/正则解析 |
| 推荐 | 前端采集 | 后端处理 |

---

## 二、日志解析与索引

### 4. Logstash 的 Grok 解析是什么？

**答：**

```ruby
# Logstash 配置
input {
  beats { port => 5044 }
}

filter {
  # Grok 解析 Nginx 日志
  grok {
    match => { "message" => "%{IPORHOST:clientip} - %{USER:user} \[%{HTTPDATE:timestamp}\] \"%{WORD:method} %{URIPATHPARAM:request} HTTP/%{NUMBER:httpversion}\" %{NUMBER:status} %{NUMBER:bytes}" }
  }
  
  # 日期解析
  date {
    match => [ "timestamp", "dd/MMM/yyyy:HH:mm:ss Z" ]
  }
  
  # GeoIP 富化
  geoip {
    source => "clientip"
  }
}

output {
  elasticsearch {
    hosts => ["es-node:9200"]
    index => "nginx-logs-%{+YYYY.MM.dd}"
  }
}
```

### 5. ES 索引策略如何设计？

**答：**

```
按时间切分（推荐）：
  logs-2024.01.15
  logs-2024.01.16
  logs-2024.01.17

按应用切分：
  logs-order-service-2024.01.15
  logs-payment-service-2024.01.15

ILM（索引生命周期管理）：
  Hot  (0-7天)：SSD 存储，全量索引
  Warm (7-30天)：HDD 存储，只读
  Cold (30-90天)：冻结，最低资源
  Delete (90天)：自动删除
```

---

## 三、Kibana 搜索与分析

### 6. Kibana 的 KQL 查询语法有哪些？

**答：**

```
# 简单搜索
status: 500

# AND/OR
status: 500 AND service: "payment"
status: 500 OR status: 502

# 范围查询
response_time > 1000

# 通配符
message: *timeout*

# 否定
NOT status: 200

# 组合
(status: 500 OR status: 502) AND service: "order" AND NOT path: "/health"
```

### 7. 如何用 Kibana 做日志分析仪表盘？

**答：**

```
常用 Kibana 可视化类型：

1. 日志量趋势（Line Chart）
   聚合：Date Histogram on @timestamp
   分组：Terms on status

2. 错误分布（Pie Chart）
   聚合：Terms on error_type
   过滤：status >= 400

3. 慢请求 Top 10（Data Table）
   聚合：Terms on request_path
   指标：Avg(response_time)
   排序：降序

4. 热力图（Heatmap）
   X轴：时间
   Y轴：response_time 区间
   颜色：请求数量
```

---

## 四、ES 运维与优化

### 8. Elasticsearch 常见性能问题和优化手段？

**答：**

| 问题 | 表现 | 优化 |
|------|------|------|
| 写入慢 | 索引速率下降 | 调大 refresh_interval、批量写入 |
| 查询慢 | 搜索超时 | 优化 Mapping、减少分片数 |
| 磁盘满 | 集群只读 | ILM 策略、扩容 |
| 内存不足 | OOM/GC 频繁 | 堆内存 ≤ 32GB、优化查询 |
| 分片过多 | 集群不稳定 | 合并小分片、调整策略 |

**关键调优参数**：

```yaml
# index settings
index.refresh_interval: 30s    # 写多读少时增大
index.number_of_shards: 2      # 根据数据量调整
index.number_of_replicas: 1    # 至少1个副本

# 每个分片建议大小：10-50GB
# 每个节点建议分片数：< 1000
```

### 9. ES 集群如何实现高可用？

**答：**

```
高可用架构：

至少3个Master-eligible节点（防脑裂）
  discovery.seed_hosts: ["es1", "es2", "es3"]
  cluster.initial_master_nodes: ["es1", "es2", "es3"]

节点角色分离：
  Master 节点：集群管理（3个，小规格）
  Data 节点：数据存储查询（N个，大规格）
  Coordinating 节点：查询路由（2个，中规格）
  Ingest 节点：数据预处理（2个，中规格）
```

---

## 五、面试高频题

### 10. 面试题：ELK 架构中 Kafka 的作用是什么？

**答：**

```
没有 Kafka：
  Filebeat → Logstash → ES
  问题：
  - ES 写入慢时 Logstash 背压 → Filebeat 阻塞
  - ES 重启期间日志丢失
  - 无法应对流量突增

加入 Kafka：
  Filebeat → Kafka → Logstash → ES
  优势：
  - 解耦：ES 慢不影响采集
  - 缓冲：流量突增时 Kafka 缓存
  - 可靠：日志不丢失
  - 多消费：其他系统也可以消费日志
```

### 11. 面试题：日志量突增 10 倍怎么办？

**答：**

```
紧急应对：
  1. 启用日志采样（正常请求 10% 采样）
  2. 提高 ES refresh_interval → 60s
  3. 临时关闭副本写入
  4. 扩容 ES Data 节点

根因排查：
  1. 哪个服务日志增多？
  2. 是代码 Bug 导致大量错误日志？
  3. 是流量暴增导致？
  4. 是日志级别配错（DEBUG 开到了线上）？

长期优化：
  1. 建立日志量监控和告警
  2. 限制单应用日志速率
  3. 优化日志内容（减少冗余）
  4. 改用低成本方案（如 Loki）
```
