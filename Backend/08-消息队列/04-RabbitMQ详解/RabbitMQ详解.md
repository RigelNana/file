# RabbitMQ详解

---

## 1. RabbitMQ 架构与核心概念？

**回答：**

```
RabbitMQ 基于 AMQP 协议

  ┌──────────────────────────────────────────┐
  │              RabbitMQ Broker              │
  │                                          │
  │ Producer → Exchange → Binding → Queue → Consumer
  │                                          │
  │ ┌─────────┐  routing   ┌──────┐         │
  │ │Exchange │────key────→│Queue │→ Consumer│
  │ │         │           │      │          │
  │ │ direct  │  binding  │      │          │
  │ │ fanout  │───────────→│Queue │→ Consumer│
  │ │ topic   │           │      │          │
  │ │ headers │           └──────┘          │
  │ └─────────┘                              │
  └──────────────────────────────────────────┘

核心概念：
  Connection：TCP 连接
  Channel：逻辑通道（轻量级，复用 Connection）
  Exchange：交换机（路由规则）
  Queue：消息队列（存储消息）
  Binding：交换机和队列的绑定关系
  Virtual Host：虚拟主机（隔离）
  
  一个 Connection 多个 Channel
  避免频繁创建 TCP 连接
```

---

## 2. Exchange 类型详解？

**回答：**

```
1. Direct Exchange（精确匹配）：
   routing_key == binding_key → 投递
   
   Producer → Exchange(direct) 
     → routing_key="order.create"
     → Queue(binding_key="order.create") ✅
     → Queue(binding_key="order.pay") ❌

2. Fanout Exchange（广播）：
   忽略 routing_key，发到所有绑定队列
   
   Producer → Exchange(fanout)
     → Queue1 ✅
     → Queue2 ✅
     → Queue3 ✅

3. Topic Exchange（通配符匹配）：
   * 匹配一个单词
   # 匹配零或多个单词
   
   binding_key="order.#"
     → routing_key="order.create" ✅
     → routing_key="order.pay.success" ✅
   
   binding_key="order.*"
     → routing_key="order.create" ✅
     → routing_key="order.pay.success" ❌

4. Headers Exchange：
   按消息 headers 匹配（少用）
   x-match=all → 全部匹配
   x-match=any → 任一匹配
```

---

## 3. 消息确认机制？

**回答：**

```
1. Publisher Confirm（生产者确认）：
   生产者发消息 → Broker 确认收到
   
   confirm 模式：
   channel.ConfirmSelect()
   → Broker ACK/NACK 每条消息
   → 异步回调处理

2. Consumer ACK（消费者确认）：
   autoAck=false → 手动 ACK
   
   BasicAck：确认处理成功
   BasicNack：拒绝（可重入队列）
   BasicReject：拒绝单条
   
   ┌──────┐  Deliver   ┌──────┐
   │Broker│───────────→│Client│
   │      │            │      │
   │      │    ACK     │处理  │
   │      │←───────────│成功  │
   └──────┘            └──────┘
   
   消费者崩溃（未ACK）→ 消息重新入队
   → 被其他消费者消费

3. 消息持久化：
   Exchange durable=true
   Queue durable=true
   Message deliveryMode=2（持久化）
   三者都设置才能保证重启不丢
```

---

## 4. 死信队列（DLX）？

**回答：**

```
死信队列（Dead Letter Exchange）：
  消息变成"死信"时转发到 DLX

死信产生条件：
  1. 消息被 Reject/Nack 且 requeue=false
  2. 消息 TTL 过期
  3. 队列满了（max-length）

  ┌──────┐         ┌──────┐         ┌──────┐
  │Normal│ 死信 →  │ DLX  │ ──────→ │Dead  │
  │Queue │         │      │         │Letter│
  └──────┘         └──────┘         │Queue │
                                    └──────┘

配置：
  队列设置：
  x-dead-letter-exchange = "dlx.exchange"
  x-dead-letter-routing-key = "dlx.routing.key"

应用场景：
  1. 延迟队列（TTL + DLX）
  2. 消费失败重试
  3. 异常消息收集和分析
  
延迟队列实现：
  消息 TTL=30s → Normal Queue（无消费者）
  → 30s 后变死信 → DLX → Dead Letter Queue
  → 消费者从 DLQ 消费 → 实现延迟

  注意：队列头部的消息先过期才会投递
  如果第一条 TTL=60s, 第二条 TTL=10s
  → 第二条也要等 60s → 延迟消息插件更好
```

---

## 5. RabbitMQ 高可用方案？

**回答：**

```
1. 普通集群：
   队列数据只在一个节点
   其他节点存元数据(指针)
   节点挂 → 队列不可用

2. 镜像队列（Mirrored Queue）：
   队列在多个节点有副本
   ha-mode: all/exactly/nodes
   
   ┌────────┐ 同步 ┌────────┐ 同步 ┌────────┐
   │Node 1  │─────→│Node 2  │─────→│Node 3  │
   │Master  │      │Mirror  │      │Mirror  │
   └────────┘      └────────┘      └────────┘
   
   Master 挂 → Mirror 提升为 Master
   
   问题：同步开销大，性能下降

3. Quorum Queue（3.8+，推荐）：
   基于 Raft 协议
   多数节点确认写入
   比镜像队列更可靠、性能更好
   
   声明：x-queue-type = quorum
   
   优势：
   - 数据安全性更高
   - 自动 Leader 选举
   - 不需要手动配置镜像策略
   
   限制：
   - 不支持 exclusive / auto-delete
   - 不支持 TTL（可用 Dead Letter）
```

---

## 6. RabbitMQ 消息有序性？

**回答：**

```
单队列单消费者 → 天然有序

多消费者 → 无法保证全局有序

有序方案：
  1. 单队列单消费者（简单但吞吐低）
  
  2. 按业务 key 路由到不同队列
     同一 key 的消息 → 同一队列 → 有序
     
     order_queue_0: [order-1001的消息]
     order_queue_1: [order-1002的消息]
     
     hash(order_id) % N → 选择队列

  3. 消费端内存排序
     收到消息后按序号排序处理
     复杂度高，不推荐
```

---

## 7. RabbitMQ 性能优化？

**回答：**

```
1. Channel 复用：
   一个连接多个 Channel
   不要每次操作都创建新连接
   Channel 建议绑定到 goroutine

2. 预取计数（Prefetch）：
   channel.Qos(prefetch_count, 0, false)
   控制消费者未ACK的消息数
   建议 10~50（需根据处理速度调整）

3. 批量发布：
   Publisher Confirm 异步模式
   不要同步等每条确认

4. 持久化权衡：
   非关键消息可不持久化
   delivery_mode=1（非持久化）→ 更快

5. Lazy Queue：
   消息直接写磁盘，不留在内存
   适合消息量大、消费慢的场景
   x-queue-mode = lazy

6. 消息大小：
   建议 < 1MB
   大消息影响吞吐
   大数据放 OSS，MQ 传引用
```

---

## 8. RabbitMQ 集群部署？

**回答：**

```
集群组网：
  Erlang Cookie 统一
  节点类型：
    disc 节点：元数据持久化到磁盘
    ram 节点：元数据在内存（更快）
    至少 1 个 disc 节点

网络分区处理：
  cluster_partition_handling:
    ignore：忽略（默认）
    pause_minority：少数节点暂停
    autoheal：自动修复（可能丢数据）

负载均衡：
  HAProxy / Nginx → 多个 RabbitMQ 节点
  客户端轮询连接

  ┌──────┐    ┌────────┐    ┌──────┐
  │Client│───→│HAProxy │───→│Node 1│
  │      │    │        │───→│Node 2│
  │      │    │        │───→│Node 3│
  └──────┘    └────────┘    └──────┘

监控：
  Management Plugin（Web UI）
  rabbitmq_prometheus plugin → Grafana
  rabbitmqctl list_queues
```

---

## 9. RabbitMQ vs Kafka？

**回答：**

```
  ┌──────────┬──────────────┬──────────────┐
  │ 对比      │ RabbitMQ     │ Kafka        │
  ├──────────┼──────────────┼──────────────┤
  │ 模型     │ Queue        │ Log          │
  │ 消费后   │ 消息删除     │ 消息保留     │
  │ 路由     │ 灵活(交换机) │ 简单(Topic)  │
  │ 吞吐     │ 万级         │ 百万级       │
  │ 延迟     │ μs 级        │ ms 级        │
  │ 消费方式 │ Push         │ Pull         │
  │ 回溯消费 │ ❌           │ ✅ 按Offset  │
  │ 事务消息 │ ❌           │ ✅           │
  │ 延迟消息 │ 插件/DLX     │ ❌ 需额外实现│
  │ 顺序     │ 单队列有序   │ 单分区有序   │
  │ 语言     │ Erlang       │ Scala/Java   │
  │ 运维     │ 较复杂       │ 中等         │
  │ 社区生态 │ 成熟         │ 大数据生态   │
  └──────────┴──────────────┴──────────────┘

选择：
  需要灵活路由/低延迟 → RabbitMQ
  需要高吞吐/日志流 → Kafka
  需要延迟+事务消息 → RocketMQ
```

---

## 10. RabbitMQ面试速答？

**回答：**

```
Q: RabbitMQ 有几种交换机？
A: Direct(精确匹配)/Fanout(广播)
   Topic(通配符)/Headers(消息头)

Q: 怎么保证消息不丢？
A: Publisher Confirm + 消息持久化
   + 消费者手动ACK

Q: 死信队列是什么？
A: 消息被拒绝/过期/队列满
   → 转到 DLX → 死信队列

Q: 延迟队列怎么实现？
A: TTL + 死信队列
   或用 delayed-message-exchange 插件

Q: RabbitMQ 怎么做高可用？
A: 3.8+ Quorum Queue（Raft协议）
   或镜像队列（旧方案）

Q: Prefetch 设多少合适？
A: 一般 10~50
   根据消费处理速度调整

Q: Channel 和 Connection 区别？
A: Connection 是 TCP 连接
   Channel 是逻辑通道，复用 Connection

Q: 网络分区怎么处理？
A: pause_minority 模式
   少数节点暂停避免脑裂
```
