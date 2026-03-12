# Redis 高级特性与集群

---

## 1. Redis 事务与 Lua 脚本？

**回答：**

```bash
# Redis 事务 (MULTI/EXEC)
MULTI                          # 开启事务
SET key1 "value1"              # 入队
SET key2 "value2"              # 入队
INCR counter                   # 入队
EXEC                           # 执行所有命令

# 事务特性:
#   命令按顺序执行, 不会被其他客户端打断
#   不支持回滚! (某条命令报错, 其他仍执行)
#   WATCH 乐观锁: key 被修改则事务取消

WATCH balance                  # 监视 key
MULTI
DECRBY balance 100
INCRBY target 100
EXEC                           # 如果 balance 被其他客户端修改 → 返回 nil (事务取消)
```

```lua
-- Lua 脚本: 原子执行多条命令 (推荐替代事务)

-- 限流: 滑动窗口
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

-- 移除窗口外的记录
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
-- 当前窗口请求数
local count = redis.call('ZCARD', key)

if count < limit then
    redis.call('ZADD', key, now, now .. math.random())
    redis.call('EXPIRE', key, window)
    return 1  -- 允许
else
    return 0  -- 拒绝
end
```

```bash
# 执行 Lua 脚本
EVAL "return redis.call('SET', KEYS[1], ARGV[1])" 1 mykey myvalue

# 加载脚本 (返回 SHA)
SCRIPT LOAD "return redis.call('GET', KEYS[1])"
# 用 SHA 执行 (避免重复传输脚本)
EVALSHA <sha> 1 mykey

# Lua 脚本优势:
#   原子性: 整个脚本原子执行
#   减少网络: 一次发送, 多条执行
#   复用: SCRIPT LOAD + EVALSHA
```

---

## 2. Redis Pipeline？

**回答：**

```
Pipeline: 批量发送命令, 减少网络往返

普通模式:
  Client → SET k1 v1 → Server
  Client ← OK          ← Server
  Client → SET k2 v2 → Server
  Client ← OK          ← Server
  → N 条命令 = N 次网络往返 (RTT)

Pipeline 模式:
  Client → SET k1 v1  → Server
         → SET k2 v2
         → SET k3 v3
  Client ← OK         ← Server
         ← OK
         ← OK
  → N 条命令 = 1 次网络往返!

性能对比:
  无 Pipeline: 10 万条命令 ≈ 50 秒 (网络 RTT 瓶颈)
  有 Pipeline: 10 万条命令 ≈ 0.5 秒

注意事项:
  Pipeline 不是原子的 (命令之间可能穿插其他客户端命令)
  不要一次发送太多命令 (内存消耗, 建议每批 1000-10000)
  需要原子性 → 用 Lua 脚本
```

---

## 3. Redis 发布/订阅与 Stream？

**回答：**

```bash
# Pub/Sub (发布/订阅)
SUBSCRIBE channel1              # 订阅频道
PUBLISH channel1 "hello"        # 发布消息

# 缺点:
#   消息不持久化, 发送后即丢
#   订阅者不在线则丢失消息
#   不支持消费者组
#   → 不适合做消息队列!

# === Stream (Redis 5.0+, 推荐) ===
# 类似 Kafka 的消息流

# 生产消息
XADD mystream * name "order" action "created"
# * 表示自动生成 ID (时间戳-序号)
# 返回: 1683000000000-0

# 消费 (简单)
XREAD COUNT 10 BLOCK 5000 STREAMS mystream 0
# 从头读 10 条, 阻塞 5 秒

XREAD COUNT 10 BLOCK 5000 STREAMS mystream $
# 只读新消息 ($ = 最新)

# 消费者组 (Consumer Group)
XGROUP CREATE mystream mygroup 0
# 创建消费者组 mygroup, 从头开始消费

XREADGROUP GROUP mygroup consumer1 COUNT 10 BLOCK 5000 STREAMS mystream >
# consumer1 从 mygroup 读取未分配的消息

XACK mystream mygroup 1683000000000-0
# 确认消费

# Stream vs Pub/Sub vs List:
# ┌──────────┬──────────┬──────────┬──────────┐
# │ 特性      │ Pub/Sub  │ List     │ Stream   │
# ├──────────┼──────────┼──────────┼──────────┤
# │ 持久化    │ ❌       │ ✅       │ ✅       │
# │ 消费者组  │ ❌       │ ❌       │ ✅       │
# │ ACK 确认  │ ❌       │ ❌       │ ✅       │
# │ 回溯消费  │ ❌       │ ❌       │ ✅       │
# │ 适用场景  │ 实时通知  │ 简单队列  │ 消息队列 │
# └──────────┴──────────┴──────────┴──────────┘
```

---

## 4. Redis Sentinel (哨兵)？

**回答：**

```
Sentinel: Redis 高可用方案 (主从故障自动转移)

架构:
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Sentinel1│  │ Sentinel2│  │ Sentinel3│
  └─────┬────┘  └─────┬────┘  └─────┬────┘
        │              │              │
        └──── 监控 ────┴──── 监控 ────┘
                       │
              ┌────────┴────────┐
              │  Master (主)     │
              │  ┌──── Slave1   │
              │  └──── Slave2   │
              └─────────────────┘

功能:
  监控:   Sentinel 定期 ping Master/Slave
  通知:   故障时通知管理员
  故障转移: Master 下线 → 选 Slave 为新 Master
  配置中心: 客户端从 Sentinel 获取 Master 地址

故障转移流程:
  1. 主观下线: 单个 Sentinel 认为 Master 不可达
  2. 客观下线: quorum 个 Sentinel 确认 Master 不可达 (多数派)
  3. Leader 选举: Sentinel 之间选出 Leader (Raft)
  4. 故障转移:
     Leader 选择最优 Slave (复制偏移量最大)
     → SLAVEOF NO ONE (提升为 Master)
     → 其他 Slave 指向新 Master
     → 通知客户端新 Master 地址

配置:
  sentinel monitor mymaster 10.0.0.1 6379 2
  # 监控 mymaster, quorum = 2
  sentinel down-after-milliseconds mymaster 30000
  # 30 秒无响应 → 主观下线
  sentinel failover-timeout mymaster 180000
  # 故障转移超时 180 秒

至少 3 个 Sentinel (奇数个, 多数派投票)
```

---

## 5. Redis Cluster (集群)？

**回答：**

```
Redis Cluster: 分布式方案 (数据分片 + 高可用)

架构:
  ┌──────────────────────────────────────────────┐
  │              Redis Cluster                    │
  │                                              │
  │  Node A (Master)     Node B (Master)          │
  │  Slots: 0-5460       Slots: 5461-10922       │
  │  └── Slave A1        └── Slave B1            │
  │                                              │
  │  Node C (Master)                              │
  │  Slots: 10923-16383                          │
  │  └── Slave C1                                │
  └──────────────────────────────────────────────┘

数据分片:
  16384 个 Hash Slot (哈希槽)
  key → CRC16(key) % 16384 → 分配到对应节点
  每个 Master 负责一部分 Slot

  Hash Tag:
    {user}.name 和 {user}.age → 相同的 Slot
    → 保证相关 key 在同一节点 (支持 MGET 等多 key 命令)

节点通信:
  Gossip 协议: 分散式, 节点间交换信息
  每个节点维护集群状态 (Slot 分配, 节点存活)

请求路由:
  客户端发请求到任意节点
  key 不在该节点 → 返回 MOVED 错误 + 正确节点
  客户端重定向到正确节点
  Smart Client (如 Jedis Cluster): 缓存 Slot 映射, 直接路由

扩容/缩容:
  添加节点 → 迁移部分 Slot 到新节点
  redis-cli --cluster reshard
  → 在线迁移, 不影响服务
```

```bash
# 创建集群
redis-cli --cluster create \
  10.0.0.1:6379 10.0.0.2:6379 10.0.0.3:6379 \
  10.0.0.4:6379 10.0.0.5:6379 10.0.0.6:6379 \
  --cluster-replicas 1    # 每个 Master 一个 Slave

# 查看集群信息
redis-cli cluster info
redis-cli cluster nodes

# 添加节点
redis-cli --cluster add-node new_host:6379 existing_host:6379

# 迁移 Slot
redis-cli --cluster reshard existing_host:6379
```

---

## 6. Sentinel vs Cluster？

**回答：**

```
  ┌──────────────────┬──────────────────┬──────────────────┐
  │ 维度              │ Sentinel         │ Cluster          │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ 数据分布          │ 不分片 (全量)     │ 分片 (16384 Slot)│
  │ 容量              │ 单机内存限制      │ 横向扩展         │
  │ 写入能力          │ 单 Master        │ 多 Master        │
  │ 高可用            │ 故障自动转移      │ 故障自动转移      │
  │ 复杂度            │ 简单              │ 较复杂           │
  │ 多 key 操作       │ 支持              │ 需 Hash Tag      │
  │ 事务              │ 支持              │ 同 Slot 才支持   │
  │ 适用场景          │ 数据量不大        │ 大数据量/高写入   │
  │                  │ 读写分离          │ 水平扩展         │
  └──────────────────┴──────────────────┴──────────────────┘

选择建议:
  数据 < 30GB, QPS < 10 万 → Sentinel
  数据 > 30GB 或 QPS > 10 万 → Cluster
  需要读写分离 → Sentinel (更简单)
  需要水平扩展 → Cluster

云服务:
  AWS ElastiCache: 支持 Cluster Mode
  阿里云 Redis: Cluster 版/标准版
```

---

## 7. Redis 内存优化？

**回答：**

```
内存分析:
  INFO memory
  → used_memory:         Redis 使用的内存
  → used_memory_rss:     OS 分配的物理内存
  → mem_fragmentation_ratio: 碎片率 (rss/used)
    > 1.5: 碎片过高, 需优化
    < 1.0: 使用了 swap, 性能严重下降!

  MEMORY USAGE key        # 单个 key 内存占用
  MEMORY DOCTOR            # 内存诊断

内存优化方法:
  1. 选择合适的数据结构
     小对象: 用 ziplist/listpack 编码 (自动)
     Hash 存对象比多个 String key 省内存

  2. 控制 key 大小
     key 名: 简短 (u:1001 vs user:1001)
     value: 压缩大字符串 (gzip)

  3. 设置过期时间
     所有缓存 key 必须设 TTL
     避免内存无限增长

  4. 内存淘汰策略
     maxmemory 4gb
     maxmemory-policy allkeys-lru

  5. 避免大 key (Big Key)
     String > 10KB → 考虑压缩
     Hash/List/Set > 5000 元素 → 考虑拆分

  6. 碎片整理 (Redis 4.0+)
     activedefrag yes
     → 自动碎片整理, 不阻塞

大 Key 问题:
  发现: redis-cli --bigkeys (扫描)
       MEMORY USAGE key
  
  影响:
    读写阻塞主线程 (大 value 序列化/反序列化)
    DEL 大 Key 阻塞 (百万元素 Hash)
    主从同步延迟
  
  解决:
    拆分: 大 Hash → 多个小 Hash
    异步删除: UNLINK key (后台线程删除, 4.0+)
    渐进式操作: HSCAN + HDEL (分批删除)
```

---

## 8. Redis 与数据库一致性？

**回答：**

```
缓存更新策略:

  1. Cache Aside (旁路缓存) — 最常用:
     读: 先读缓存 → 命中返回 → 未命中读 DB → 写缓存
     写: 先更新 DB → 再删除缓存

     为什么删缓存而不是更新缓存?
     → 两个并发写, 可能缓存写入旧值
     → 删缓存 + 下次读重建, 更安全

     延迟双删:
       删缓存 → 更新 DB → sleep(500ms) → 再删缓存
       → 防止在删缓存到更新 DB 之间有读请求写入旧缓存

  2. Read/Write Through:
     应用只操作缓存, 缓存层负责同步到 DB
     → 缓存层做封装, 应用简单

  3. Write Behind (Write Back):
     写只写缓存, 异步批量写 DB
     → 性能最好, 但可能丢数据

一致性问题:
  ┌──────────────────────────────────────────────┐
  │ 强一致性: 不可能! (两个系统无法原子操作)       │
  │ 最终一致性: 可达到 (推荐)                     │
  └──────────────────────────────────────────────┘

最终一致性方案:
  1. 先更新 DB → 删缓存 (基本方案)
  2. + 延迟双删 (增强)
  3. + 消息队列重试删除 (更可靠)
  4. + 订阅 binlog 异步删缓存 (最可靠)
     Canal 监听 MySQL binlog → 删除对应缓存
```

---

## 9. Redis 运维与安全？

**回答：**

```
安全加固:
  1. 设置密码
     requirepass <strong_password>
     ACL (Redis 6.0+): 更细粒度权限控制
     ACL SETUSER worker on >password ~cache:* +get +set

  2. 绑定 IP
     bind 127.0.0.1 10.0.0.1
     不要 bind 0.0.0.0!

  3. 禁用危险命令
     rename-command FLUSHALL ""
     rename-command FLUSHDB ""
     rename-command KEYS ""
     rename-command CONFIG "CONFIG_xxx"

  4. 网络隔离
     Redis 不暴露到公网
     VPC 内网 + Security Group

运维关注:
  1. 禁用 KEYS 命令 (阻塞主线程!)
     替代: SCAN 增量遍历

  2. 避免阻塞操作
     大 Key 删除: UNLINK 代替 DEL
     大 Key 遍历: HSCAN/SSCAN/ZSCAN

  3. 慢日志
     slowlog-log-slower-than 10000  # 10ms
     slowlog-max-len 128
     SLOWLOG GET 10                 # 查看最近 10 条

  4. 连接池
     应用使用连接池 (不要每次新建连接)
     最大连接数合理设置

  5. 监控
     INFO 命令各项指标
     redis-cli --stat (实时监控)
     Prometheus + redis_exporter
```

---

## 10. Redis 高级面试速答？

**回答：**

```
Q: Redis 事务能回滚吗?
A: 不能! 命令出错继续执行其他命令
   用 Lua 脚本替代事务 (原子 + 可判断)

Q: Pipeline 和事务的区别?
A: Pipeline: 批量发送减少网络往返, 非原子
   事务 MULTI/EXEC: 原子, 但仍有网络往返
   Lua 脚本: 原子 + 减少网络往返 (最佳)

Q: Sentinel 和 Cluster 怎么选?
A: 数据量小 (<30GB) → Sentinel
   需要水平扩展 → Cluster

Q: Cluster 为什么用 16384 个 Slot?
A: 节点间 Gossip 心跳需传输 Slot 信息
   16384 = 2KB 的 bitmap, 能接受
   65536 = 8KB, 太大了

Q: Redis 如何保证和 DB 的一致性?
A: 先更新 DB → 删缓存 (Cache Aside)
   + 消息队列重试 / binlog 订阅丢失补偿
   只保证最终一致性

Q: 大 Key 怎么处理?
A: 发现: --bigkeys 扫描
   删除: UNLINK (异步)
   拆分: 大 Hash → 多个小 Hash

Q: Redis 能做消息队列吗?
A: 轻量: Stream (5.0+, 支持消费者组/ACK)
   重量: 建议用 Kafka/RabbitMQ
   不要用 Pub/Sub (消息丢失)

Q: KEYS 命令为什么危险?
A: 遍历所有 key, O(N), 阻塞主线程
   生产禁用! 用 SCAN 替代

Q: Redis 6.0 多线程是什么意思?
A: 网络 IO 收发用多线程
   命令执行仍然是单线程
   提升网络吞吐, 不改变编程模型
```
