# Kafka架构与原理

---

## 1. Kafka 整体架构？

**回答：**

```
Kafka 集群架构：

  ┌──────────────────────────────────────────┐
  │              Kafka Cluster               │
  │                                          │
  │  ┌────────┐  ┌────────┐  ┌────────┐     │
  │  │Broker 0│  │Broker 1│  │Broker 2│     │
  │  │P0-L    │  │P0-F    │  │P1-F    │     │
  │  │P1-L    │  │P2-L    │  │P2-F    │     │
  │  └────────┘  └────────┘  └────────┘     │
  │                                          │
  └──────────────────────────────────────────┘
        ↑                          ↑
   ┌────┴────┐                ┌────┴────┐
   │Producer │                │Consumer │
   │         │                │ Group   │
   └─────────┘                └─────────┘

核心组件：
  Broker：Kafka 服务实例
  Topic：消息的逻辑分类
  Partition：Topic 的物理分片，有序
  Replica：副本，分 Leader 和 Follower
  ZooKeeper/KRaft：元数据管理和选举
  
  KRaft 模式（Kafka 3.3+）：
  去除 ZooKeeper 依赖
  Controller 节点用 Raft 协议选举
```

---

## 2. Kafka 分区机制？

**回答：**

```
Partition 特点：
  每个 Partition 是一个有序、不可变的消息序列
  消息在 Partition 内按 Offset 递增
  不同 Partition 之间无序

  Topic: orders (3 partitions)
  ┌─────────────────────────┐
  │ Partition 0: [0,1,2,3,4]│
  │ Partition 1: [0,1,2,3]  │
  │ Partition 2: [0,1,2]    │
  └─────────────────────────┘

分区策略（Producer 端）：
  1. 指定分区 → 直接发到指定分区
  2. 有 Key → hash(key) % numPartitions
     同一 key 总是到同一分区
  3. 无 Key → Round Robin 或 Sticky Partitioner

分区数设置：
  吞吐量 = partitions × 单分区吞吐
  消费者数 ≤ 分区数（多余消费者空闲）
  分区太多 → Leader 选举慢 / 内存开销大

  建议：topic 初始 6~12 个分区
  后续可增加（但不能减少分区）
```

---

## 3. 副本与 ISR 机制？

**回答：**

```
副本机制：
  每个 Partition 有多个副本
  Leader：负责读写
  Follower：从 Leader 同步数据

  replication.factor = 3
  
  ┌──────────────────────────────────────┐
  │ Partition 0                          │
  │ Leader(Broker0) → Follower(Broker1)  │
  │                → Follower(Broker2)  │
  └──────────────────────────────────────┘

ISR（In-Sync Replicas）：
  保持同步的副本集合
  Follower 落后太多 → 踢出 ISR
  replica.lag.time.max.ms = 30000（默认30s）

  ISR = {Leader, Follower1, Follower2}
  Follower2 落后 → ISR = {Leader, Follower1}

Leader 选举：
  Leader 挂了 → 从 ISR 中选新 Leader
  ISR 为空 → unclean.leader.election.enable
    true: 从非 ISR 选（可能丢数据）
    false: 分区不可用（数据安全优先）

min.insync.replicas = 2：
  acks=all 时，至少 2 个副本确认
  ISR < 2 → 拒绝写入 → 保证不丢数据
```

---

## 4. Kafka 存储机制？

**回答：**

```
日志存储结构：
  每个 Partition → 一个目录
  目录下多个 Segment（段文件）
  每个 Segment = .log + .index + .timeindex

  topic-orders-0/
  ├── 00000000000000000000.log      # 消息数据
  ├── 00000000000000000000.index    # 偏移量索引
  ├── 00000000000000000000.timeindex # 时间索引
  ├── 00000000000045678901.log
  ├── 00000000000045678901.index
  └── 00000000000045678901.timeindex

  文件名 = 起始 Offset

查找消息流程（二分查找）：
  1. 根据 Offset → 找到对应 Segment 文件
  2. 在 .index 中二分查找 → 物理位置
  3. 在 .log 中定位读取

为什么顺序 IO 性能高？
  磁盘顺序读写 ≈ 600MB/s
  磁盘随机读写 ≈ 100KB/s
  Kafka 全部顺序写（append-only）

零拷贝（Zero Copy）：
  普通：磁盘 → 内核缓冲 → 用户缓冲 → Socket缓冲 → 网卡
  零拷贝：磁盘 → 内核缓冲 → 网卡（sendfile）
  减少 2 次内存拷贝 + 2 次上下文切换
```

---

## 5. Kafka Controller 和选举？

**回答：**

```
Controller 角色：
  集群中一个 Broker 担任 Controller
  负责：
  - 分区 Leader 选举
  - 副本分配
  - 元数据管理
  - Broker 上下线处理

ZooKeeper 模式（旧）：
  Broker 启动时在 ZK 注册临时节点
  第一个注册 /controller 的成为 Controller
  Controller 监听 /brokers/ids 变化
  
KRaft 模式（Kafka 3.3+）：
  去除 ZooKeeper 依赖
  Controller 节点运行 Raft 协议
  元数据以日志形式持久化
  
  优势：
  - 部署简单（不需要 ZK）
  - 元数据处理更快
  - 支持更多分区（百万级）

分区 Leader 选举：
  Controller 从 ISR 列表中选第一个作为新 Leader
  Preferred Leader Election：
    优先选 replica list 中第一个
    auto.leader.rebalance.enable = true
```

---

## 6. Kafka 日志压缩（Log Compaction）？

**回答：**

```
两种清理策略：

1. delete（默认）：
   过期数据直接删除
   log.retention.hours = 168
   按时间或大小删除旧 Segment

2. compact：
   保留每个 key 的最新值
   适合 changelog / 状态存储

  ┌─────────────────────────────────────┐
  │ 压缩前：                            │
  │ K1:v1, K2:v1, K1:v2, K3:v1, K2:v2 │
  │                                     │
  │ 压缩后：                            │
  │ K1:v2, K3:v1, K2:v2               │
  │ （每个key只保留最新值）             │
  └─────────────────────────────────────┘

  key=null (tombstone) → 标记删除
  压缩后最终移除

使用场景：
  __consumer_offsets topic（消费位移）
  Kafka Streams state store
  CDC changelog
  配置表同步
```

---

## 7. Kafka 幂等与事务？

**回答：**

```
幂等 Producer（Exactly Once Delivery to partition）：
  enable.idempotence = true
  
  原理：
  Producer ID(PID) + Sequence Number
  Broker 检查序号 → 重复消息丢弃
  
  保证：单分区 + 单 Session 内不重复
  不保证：跨分区 / Producer 重启

事务 Producer（Exactly Once Semantics）：
  支持跨分区原子写入
  Producer → 多个 Partition → 全部成功或全部失败

  transactional.id = "my-tx-producer"
  isolation.level = read_committed

流程：
  1. initTransactions()
  2. beginTransaction()
  3. send(record1), send(record2)...
  4. sendOffsetsToTransaction() # 原子提交offset
  5. commitTransaction() / abortTransaction()

  Consumer 设 isolation.level=read_committed
  → 只读已提交的消息
```

---

## 8. Kafka Streams 和 Connect？

**回答：**

```
Kafka Connect：
  数据集成框架
  Source Connector：外部 → Kafka
  Sink Connector：Kafka → 外部

  ┌──────┐  Source  ┌──────┐  Sink  ┌──────┐
  │MySQL │────────→│Kafka │───────→│ES    │
  │      │ Debezium│      │        │      │
  └──────┘         └──────┘        └──────┘

  内置 Connector：File / JDBC / S3 / ES ...
  分布式模式支持扩展和容错

Kafka Streams：
  流处理库（不是独立服务）
  嵌入应用程序中运行
  支持：过滤 / 映射 / 聚合 / 窗口 / Join
  状态存储：RocksDB（本地）
  Exactly-Once 语义

  与 Flink/Spark Streaming 对比：
  轻量级（无需集群）
  仅处理 Kafka 中的数据
  适合简单到中等复杂度的流处理
```

---

## 9. Kafka 生产部署建议？

**回答：**

```
1. 硬件：
   磁盘：多块 HDD（顺序写不需要 SSD），JBOD
   内存：64GB+（大部分给 Page Cache）
   网络：万兆网卡
   CPU：不是瓶颈（8-16核够用）

2. JVM：
   堆内存 6-8GB（不要太大）
   G1 GC（默认）
   大部分内存留给 Page Cache

3. 关键配置：
   # Broker
   num.partitions = 6
   default.replication.factor = 3
   min.insync.replicas = 2
   log.retention.hours = 168
   log.segment.bytes = 1073741824
   
   # 性能
   num.network.threads = 8
   num.io.threads = 16
   socket.send.buffer.bytes = 102400
   socket.receive.buffer.bytes = 102400

4. 监控：
   JMX 指标 → Prometheus + Grafana
   消费 Lag → Burrow
   集群管理 → CMAK / Conduktor

5. 安全：
   SASL/SSL 认证
   ACL 权限控制
   加密传输
```

---

## 10. Kafka架构面试速答？

**回答：**

```
Q: Kafka 的核心组件？
A: Broker/Topic/Partition/Replica
   Producer/Consumer Group/Offset

Q: 分区有什么用？
A: 水平扩展吞吐量
   提供并行消费能力

Q: ISR 是什么？
A: 与 Leader 保持同步的副本集合
   Leader 挂了从 ISR 选新 Leader

Q: Kafka 为什么快？
A: 顺序写磁盘 + Page Cache
   + 零拷贝 + 批量 + 分区并行

Q: 消息怎么存储？
A: 每个 Partition 目录下多个 Segment
   Segment = .log + .index + .timeindex

Q: 日志压缩是什么？
A: compact 策略保留每个 key 最新值
   适合 changelog 场景

Q: 幂等 Producer 原理？
A: PID + Sequence Number
   Broker 去重相同序号的消息

Q: KRaft 和 ZooKeeper 区别？
A: KRaft 去掉 ZK 依赖
   用 Raft 协议管理元数据
   部署更简单，支持更多分区
```
