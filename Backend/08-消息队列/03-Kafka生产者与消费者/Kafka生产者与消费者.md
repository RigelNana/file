# Kafka生产者与消费者

---

## 1. Producer 发送流程？

**回答：**

```
Producer 发送消息流程：

  ┌──────────────────────────────────────┐
  │ Producer                             │
  │ ┌──────┐  ┌──────┐  ┌─────────┐     │
  │ │序列化│→ │分区器│→ │RecordAcc│     │
  │ │      │  │      │  │umulator │     │
  │ │Key   │  │hash/ │  │(缓冲区) │     │
  │ │Value │  │round │  │按分区   │     │
  │ │      │  │robin │  │批量聚合 │     │
  │ └──────┘  └──────┘  └────┬────┘     │
  │                          │          │
  │                     ┌────┴────┐     │
  │                     │ Sender  │     │
  │                     │(IO线程) │     │
  │                     └────┬────┘     │
  └──────────────────────────┼──────────┘
                             │ 批量发送
                        ┌────┴────┐
                        │ Broker  │
                        └─────────┘

关键配置：
  acks = 0/1/all
    0: 不等确认（最快，可能丢）
    1: Leader 确认（默认）
    all: 所有 ISR 确认（最安全）
  
  batch.size = 16384        # 批次大小 16KB
  linger.ms = 5             # 等待聚合时间
  buffer.memory = 33554432  # 发送缓冲区 32MB
  retries = Integer.MAX     # 重试次数
  max.in.flight.requests.per.connection = 5
  
  enable.idempotence = true # 幂等
  compression.type = lz4    # 压缩
```

```go
// Go Kafka Producer (confluent-kafka-go)
import "github.com/confluentinc/confluent-kafka-go/v2/kafka"

producer, _ := kafka.NewProducer(&kafka.ConfigMap{
    "bootstrap.servers": "broker1:9092,broker2:9092",
    "acks":              "all",
    "retries":           3,
    "linger.ms":         5,
    "batch.size":        16384,
    "compression.type":  "lz4",
})

// 异步发送
topic := "orders"
producer.Produce(&kafka.Message{
    TopicPartition: kafka.TopicPartition{
        Topic:     &topic,
        Partition: kafka.PartitionAny,
    },
    Key:   []byte("order-1001"),
    Value: []byte(`{"id":1001,"amount":99}`),
}, nil)

// 同步等待
producer.Flush(5000)
```

---

## 2. Producer 分区策略？

**回答：**

```
内置分区策略：

1. 指定分区 → 直接发到目标分区

2. 有 Key → Murmur2 hash(key) % numPartitions
   同一 key → 同一分区 → 分区内有序

3. 无 Key（2.4 之前）→ Round Robin
   轮询发到各分区

4. 无 Key（2.4+）→ Sticky Partitioner
   粘性分区：先填满一个 batch 再换分区
   减少请求次数，提升吞吐

自定义分区器：
  根据业务逻辑路由
  如：VIP 用户 → 独立分区优先处理
```

---

## 3. Consumer 消费流程？

**回答：**

```
Consumer Group 消费：

  ┌──────────────────────────┐
  │ Topic: orders (4 分区)   │
  │  P0   P1    P2    P3     │
  └──┬────┬─────┬─────┬──────┘
     │    │     │     │
  ┌──┴──┐ │   ┌─┴───┐ │
  │ C1  │ │   │ C2  │ │    Consumer Group
  │ P0  │ │   │ P2  │ │
  │     │←┘   │     │←┘
  │ P1  │     │ P3  │
  └─────┘     └─────┘

分配策略：
  Range：按分区范围分（可能不均匀）
  RoundRobin：轮询分配（更均匀）
  Sticky：尽量保持原有分配（减少Rebalance变动）
  CooperativeSticky：增量Rebalance

关键配置：
  group.id = "order-group"
  auto.offset.reset = latest/earliest
  enable.auto.commit = false      # 推荐手动提交
  max.poll.records = 500          # 单次拉取条数
  max.poll.interval.ms = 300000   # 两次 poll 最大间隔
  session.timeout.ms = 45000      # 会话超时
  heartbeat.interval.ms = 3000    # 心跳间隔
  fetch.min.bytes = 1
  fetch.max.wait.ms = 500
```

```go
// Go Kafka Consumer
consumer, _ := kafka.NewConsumer(&kafka.ConfigMap{
    "bootstrap.servers":  "broker1:9092",
    "group.id":           "order-group",
    "auto.offset.reset":  "earliest",
    "enable.auto.commit": false,
})

consumer.SubscribeTopics([]string{"orders"}, nil)

for {
    msg, err := consumer.ReadMessage(time.Second)
    if err != nil {
        continue
    }
    
    // 处理消息
    processMessage(msg)
    
    // 手动提交 offset
    consumer.CommitMessage(msg)
}
```

---

## 4. Offset 管理？

**回答：**

```
Offset 管理：
  消费进度由 Offset 标识
  存储在 __consumer_offsets topic

自动提交：
  enable.auto.commit = true
  auto.commit.interval.ms = 5000
  问题：处理失败但已提交 → 丢消息

手动提交：
  同步提交：commitSync()（阻塞等待确认）
  异步提交：commitAsync()（不阻塞）
  
  推荐：正常用异步，关闭前用同步

  ┌─────────────────────────────────┐
  │ 消费流程                        │
  │ poll() → process() → commit()  │
  │                                 │
  │ 提交策略：                      │
  │ 处理完一批再提交（性能好）       │
  │ 处理完每条就提交（安全但慢）     │
  │ 折中：每处理 N 条提交一次       │
  └─────────────────────────────────┘

Offset 重置策略：
  auto.offset.reset：
  earliest → 从头消费
  latest   → 从最新消费（默认）
  none     → 没有 offset 则报错

手动指定 Offset：
  seek(partition, offset) → 指定位置消费
  seekToBeginning() → 从头
  seekToEnd() → 从尾
```

---

## 5. Consumer Rebalance 详解？

**回答：**

```
触发 Rebalance 的场景：
  1. 消费者加入/离开组
  2. 消费者崩溃（心跳超时）
  3. 订阅的 Topic 分区数变化
  4. 正则订阅匹配到新 Topic

Rebalance 过程：
  ┌────────┐  JoinGroup   ┌────────────┐
  │Consumer│─────────────→│  Group     │
  │        │              │Coordinator │
  │        │  SyncGroup   │  (Broker)  │
  │        │←─────────────│            │
  └────────┘              └────────────┘

  1. 所有消费者发送 JoinGroup
  2. Coordinator 选出 Leader Consumer
  3. Leader 执行分区分配
  4. 通过 SyncGroup 下发分配结果

Rebalance 的问题：
  期间所有消费者停止消费（Stop The World）
  大量分区 → 重分配时间长

优化方案：
  1. CooperativeSticky（增量Rebalance）
     只重新分配需要变化的分区
  
  2. Static Membership
     group.instance.id = "consumer-1"
     短暂重启不触发 Rebalance

  3. 合理超时设置
     session.timeout.ms 不要太小
     max.poll.interval.ms 足够长
```

---

## 6. 消费者多线程消费？

**回答：**

```
方案1：每个线程一个 Consumer（推荐）
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Thread 1  │  │Thread 2  │  │Thread 3  │
  │Consumer 1│  │Consumer 2│  │Consumer 3│
  │ P0, P1   │  │ P2, P3   │  │ P4, P5   │
  └──────────┘  └──────────┘  └──────────┘
  
  简单，分区级有序
  线程数 ≤ 分区数

方案2：单 Consumer + 线程池处理
  ┌──────────┐      ┌──────────────┐
  │Consumer  │─────→│ Worker Pool  │
  │ 拉取消息 │      │ Thread1      │
  │          │      │ Thread2      │
  │          │      │ Thread3      │
  └──────────┘      └──────────────┘
  
  灵活，吞吐高
  但 offset 提交复杂（乱序处理问题）
  需要手动管理提交顺序
```

```go
// 方案1：多 Consumer 实例
func startConsumerGroup(ctx context.Context, n int) {
    for i := 0; i < n; i++ {
        go func(id int) {
            consumer, _ := kafka.NewConsumer(&kafka.ConfigMap{
                "bootstrap.servers":  "broker:9092",
                "group.id":           "my-group",
                "enable.auto.commit": false,
            })
            consumer.SubscribeTopics([]string{"orders"}, nil)
            
            for {
                select {
                case <-ctx.Done():
                    consumer.Close()
                    return
                default:
                    msg, err := consumer.ReadMessage(time.Second)
                    if err != nil {
                        continue
                    }
                    processMessage(msg)
                    consumer.CommitMessage(msg)
                }
            }
        }(i)
    }
}
```

---

## 7. Producer 可靠性保障？

**回答：**

```
可靠性配置组合：

最高可靠性（不丢消息）：
  acks = all
  min.insync.replicas = 2
  retries = Integer.MAX_VALUE
  enable.idempotence = true
  max.in.flight.requests.per.connection = 5

  acks=all → 所有 ISR 确认
  min.insync.replicas=2 → 至少 2 个副本同步
  retries → 发送失败自动重试
  idempotence → 防止重试导致重复
  max.in.flight ≤ 5 → 幂等模式下保证顺序

发送回调处理：
  异步发送 + 回调检查结果
  发送失败 → 记录日志 + 告警
  不要忽略发送结果！

高吞吐优先（可容忍少量丢失）：
  acks = 1
  linger.ms = 10
  batch.size = 65536
  compression.type = lz4
```

---

## 8. Consumer 可靠性保障？

**回答：**

```
保证消息不丢失：
  enable.auto.commit = false
  处理成功后手动提交 offset
  
  poll → process → commit（同步）

保证消息不重复（幂等消费）：
  at-least-once 必然有重复
  消费端做幂等：
  唯一ID + 去重表
  数据库唯一性约束
  
  ┌───────────────────────────┐
  │ 消费流程                   │
  │ 1. poll 拉取消息           │
  │ 2. 检查是否已处理(幂等)    │
  │ 3. 处理业务逻辑            │
  │ 4. 写入结果 + 标记已处理   │
  │ 5. 提交 offset            │
  └───────────────────────────┘

消费失败处理：
  重试 N 次 → 发到死信队列
  记录失败消息 → 人工处理
  避免无限重试阻塞消费
```

---

## 9. 消费者 Lag 监控与管理？

**回答：**

```
Lag = 分区最新 Offset - 消费者已提交 Offset

查看 Lag：
  kafka-consumer-groups.sh \
    --bootstrap-server broker:9092 \
    --group my-group \
    --describe

  GROUP      TOPIC   PARTITION  CURRENT  LOG-END  LAG
  my-group   orders  0          1000     1050     50
  my-group   orders  1          2000     2000     0

Lag 持续增大 → 消费能力不足

解决：
  1. 增加消费者实例（≤ 分区数）
  2. 增加分区（需要数据再平衡）
  3. 优化消费逻辑（减少IO/批量处理）
  4. 临时方案：跳过/转移非关键消息

监控工具：
  Burrow：LinkedIn 开源的 Lag 监控
  kafka_exporter → Prometheus → Grafana
  Kafka UI / CMAK
```

---

## 10. Kafka生产消费面试速答？

**回答：**

```
Q: acks 参数含义？
A: 0:不等确认 1:Leader确认
   all:所有ISR确认(最安全)

Q: 怎么保证消息不丢？
A: 生产:acks=all+重试
   消费:手动提交offset

Q: 怎么保证不重复消费？
A: 消费端幂等处理
   唯一ID+去重表或数据库约束

Q: 消费者 Rebalance 是什么？
A: 消费者组成员变化时重新分配分区
   期间消费暂停

Q: 怎么减少 Rebalance？
A: Static Membership
   CooperativeSticky分配
   合理超时设置

Q: 多线程消费方案？
A: 方案1:每线程一个Consumer(简单)
   方案2:单Consumer+线程池(灵活)

Q: 消费 Lag 怎么处理？
A: 增加消费者/分区
   优化消费逻辑/批量处理

Q: Offset 管理推荐？
A: 关闭自动提交
   处理成功后手动提交
```
