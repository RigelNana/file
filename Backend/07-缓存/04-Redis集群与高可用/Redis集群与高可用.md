# Redis集群与高可用

---

## 1. Redis 主从复制原理？

**回答：**

```
主从复制流程：
  ┌──────────┐  全量/增量  ┌──────────┐
  │  Master  │───────────→│  Slave   │
  │ 读写     │            │ 只读     │
  └──────────┘            └──────────┘

全量复制（首次连接/断开太久）：
  1. Slave 发送 PSYNC ? -1
  2. Master BGSAVE 生成 RDB
  3. Master 发送 RDB 给 Slave
  4. Slave 加载 RDB
  5. Master 发送 RDB 期间的增量命令

增量复制（网络短暂断开）：
  Master 维护 repl_backlog（环形缓冲区）
  Slave 记录 offset
  重连后发送 PSYNC repl_id offset
  Master 从 offset 开始发送增量数据

  repl_backlog_size: 默认 1MB
  → 调大可减少全量复制概率

关键参数：
  replicaof master_ip 6379        # 从库配置
  replica-read-only yes           # 从库只读
  repl-backlog-size 64mb          # 增量缓冲区
  min-replicas-to-write 1         # 最少写入从库数
```

---

## 2. Redis Sentinel 哨兵？

**回答：**

```
Sentinel 架构：
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │Sentinel 1│  │Sentinel 2│  │Sentinel 3│
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │              │              │
       │    监控/故障检测/自动切换     │
       │              │              │
  ┌────┴─────┐        │              │
  │  Master  │←───────┴──────────┘
  │          │
  └────┬─────┘
       │ 复制
  ┌────┴─────┐  ┌──────────┐
  │  Slave 1 │  │  Slave 2 │
  └──────────┘  └──────────┘

故障检测：
  主观下线(SDOWN)：单个 Sentinel 认为不可达
  客观下线(ODOWN)：多数 Sentinel 确认不可达
  → quorum 投票（通常 >= 2）

故障切换流程：
  1. Sentinel 选出 Leader（Raft）
  2. Leader 选择最优 Slave：
     优先级 > 复制偏移量最大 > runid 最小
  3. 提升 Slave 为新 Master
  4. 其他 Slave 指向新 Master
  5. 旧 Master 恢复后变为 Slave

客户端连接：
  连接 Sentinel 获取 Master 地址
  主从切换后 Sentinel 通知客户端
```

```go
// Go 连接 Redis Sentinel
rdb := redis.NewFailoverClient(&redis.FailoverOptions{
    MasterName:    "mymaster",
    SentinelAddrs: []string{
        "sentinel1:26379",
        "sentinel2:26379",
        "sentinel3:26379",
    },
    Password:      "password",
    DB:            0,
})
```

---

## 3. Redis Cluster 集群？

**回答：**

```
Redis Cluster 架构：
  去中心化，16384 个 hash slot
  
  CRC16(key) % 16384 → 对应节点
  
  ┌───────────┐  ┌───────────┐  ┌───────────┐
  │  Node A   │  │  Node B   │  │  Node C   │
  │ slot 0-   │  │ slot 5461-│  │ slot 10923│
  │    5460   │  │   10922   │  │   -16383  │
  │ Replica A'│  │ Replica B'│  │ Replica C'│
  └───────────┘  └───────────┘  └───────────┘

节点通信：Gossip 协议
  PING/PONG 交换集群信息
  每个节点知道所有 slot 的分配

客户端路由：
  MOVED 重定向：key 不在当前节点
  → 客户端更新 slot 映射表
  ASK 重定向：迁移中的临时重定向

故障转移：
  1. 其他主节点检测到某主节点不可达
  2. 该主节点的从节点发起选举
  3. 多数主节点投票
  4. 当选从节点提升为新主节点
  5. 更新 slot 映射
```

```go
// Go 连接 Redis Cluster
rdb := redis.NewClusterClient(&redis.ClusterOptions{
    Addrs: []string{
        "node1:6379", "node2:6379", "node3:6379",
    },
    Password: "password",
})
```

---

## 4. Hash Tag 和跨 slot 操作？

**回答：**

```
限制：Cluster 不支持跨 slot 的多 key 操作
  MGET key1 key2 如果在不同 slot → 报错

Hash Tag 解决方案：
  用 {tag} 指定哈希计算的部分
  CRC16 只计算 {} 内的内容
  
  user:{1001}:name → CRC16("1001")
  user:{1001}:age  → CRC16("1001")
  → 同一个 slot → 可以一起操作

  MGET user:{1001}:name user:{1001}:age  ✅

注意事项：
  Hash Tag 可能导致数据倾斜
  同一个 tag 的所有 key 在同一节点
  热点 tag → 单节点压力过大

Pipeline 在 Cluster：
  go-redis 自动按 slot 分组
  各组分别 Pipeline 执行
  对开发者透明
```

---

## 5. Cluster 扩容与缩容？

**回答：**

```
扩容（添加新节点）：
  1. 添加节点到集群
     redis-cli --cluster add-node new_ip:6379 existing_ip:6379

  2. 分配 slot（从已有节点迁移部分 slot）
     redis-cli --cluster reshard existing_ip:6379
     → 指定迁移多少 slot 到新节点

  3. 迁移过程：
     源节点设置 slot 为 MIGRATING
     目标节点设置 slot 为 IMPORTING
     逐个 key MIGRATE 到目标
     完成后更新 slot 映射

  4. 添加从节点
     redis-cli --cluster add-node new_slave:6379 \
       new_master:6379 --cluster-slave

缩容（移除节点）：
  1. 将要移除节点的 slot 迁移到其他节点
  2. 移除节点
     redis-cli --cluster del-node ip:port node_id

  迁移过程中：
  - 读写正常（MOVED/ASK 重定向）
  - 客户端自动重试
  - 对业务基本无影响
```

---

## 6. Sentinel vs Cluster？

**回答：**

```
  ┌──────────────┬──────────────┬──────────────┐
  │ 对比          │ Sentinel     │ Cluster      │
  ├──────────────┼──────────────┼──────────────┤
  │ 数据分片      │ ❌ 不分片    │ ✅ 16384 slot│
  │ 容量          │ 单节点内存   │ 多节点总容量 │
  │ 高可用        │ ✅ 自动切换  │ ✅ 自动切换  │
  │ 架构          │ 主从+哨兵    │ 去中心化     │
  │ 复杂度        │ 简单         │ 较复杂       │
  │ 多 key 操作  │ ✅           │ 需 Hash Tag  │
  │ 事务/Lua     │ ✅           │ 同 slot 内   │
  │ 适用场景      │ 数据量中等   │ 大数据量     │
  └──────────────┴──────────────┴──────────────┘

选择建议：
  数据量 < 10GB → Sentinel（简单够用）
  数据量 > 10GB 或需要水平扩展 → Cluster
```

---

## 7. Redis 高可用最佳实践？

**回答：**

```
部署建议：
  1. 至少 3 主 3 从（Cluster）
     或 1 主 2 从 + 3 Sentinel
  
  2. 跨机架/可用区部署
     主从不在同一物理机

  3. 内存规划：
     maxmemory 设为物理内存的 70%
     预留 COW 内存和操作系统开销

  4. 持久化：
     主库 AOF / 从库 RDB+AOF
     定期备份到远程

  5. 监控：
     INFO 命令采集指标
     内存使用/命令延迟/连接数
     慢日志：SLOWLOG GET 10

  6. 客户端：
     连接池配置合理
     超时和重试设置
     读写分离（读从库）

  7. 安全：
     设置密码 requirepass
     bind 限制访问地址
     禁用危险命令 rename-command
```

---

## 8. 客户端连接池配置？

**回答：**

```go
// Go redis 连接池配置
rdb := redis.NewClient(&redis.Options{
    Addr:     "localhost:6379",
    Password: "password",
    DB:       0,

    // 连接池配置
    PoolSize:     100,           // 最大连接数
    MinIdleConns: 20,            // 最小空闲连接
    MaxIdleConns: 50,            // 最大空闲连接
    
    // 超时配置
    DialTimeout:  5 * time.Second,  // 连接超时
    ReadTimeout:  3 * time.Second,  // 读超时
    WriteTimeout: 3 * time.Second,  // 写超时
    PoolTimeout:  4 * time.Second,  // 获取连接超时
    
    // 连接生命周期
    ConnMaxIdleTime: 30 * time.Minute,
    ConnMaxLifetime: 0, // 不限制
    
    // 重试
    MaxRetries:      3,
    MinRetryBackoff: 8 * time.Millisecond,
    MaxRetryBackoff: 512 * time.Millisecond,
})

// 检查连接
if err := rdb.Ping(ctx).Err(); err != nil {
    log.Fatal("redis connect failed:", err)
}

// 连接池状态监控
stats := rdb.PoolStats()
fmt.Printf("Hits=%d Misses=%d Timeouts=%d\n",
    stats.Hits, stats.Misses, stats.Timeouts)
```

---

## 9. Redis 集群常见问题？

**回答：**

```
1. 脑裂（Split Brain）：
   网络分区导致从库被提升为主库
   → 原主库恢复后数据丢失
   解决：
   min-replicas-to-write 1
   min-replicas-max-lag 10

2. 数据迁移丢失：
   主库故障时异步复制未完成
   → 从库缺少最新数据
   解决：半同步（WAIT 命令）

3. 热点 key：
   单个 key 访问量极大 → 单节点瓶颈
   解决：
   本地缓存 / key 加后缀分散读取

4. 大 key 迁移：
   Cluster 迁移 slot 时遇到大 key
   → 阻塞迁移过程
   解决：提前拆分大 key

5. Cluster 不支持的操作：
   跨 slot 事务 / KEYS 命令
   数据库选择（只能用 DB 0）
   → 设计时就要考虑
```

---

## 10. Redis集群面试速答？

**回答：**

```
Q: Redis 集群有几种模式？
A: 主从复制 / Sentinel 哨兵 / Cluster 集群

Q: Sentinel 怎么做故障切换？
A: 多数哨兵确认主库下线(ODOWN)
   Leader 哨兵选新主库并切换

Q: Cluster 怎么分片？
A: 16384 个 hash slot
   CRC16(key) % 16384 → 对应节点

Q: Cluster 怎么处理跨 slot 操作？
A: Hash Tag：{tag}key
   同一 tag 在同一 slot

Q: 主从复制是同步还是异步？
A: 默认异步（可能丢数据）
   WAIT 命令可实现半同步

Q: Cluster 扩容怎么做？
A: 添加新节点 → reshard 迁移 slot
   迁移期间 MOVED/ASK 重定向

Q: Sentinel 和 Cluster 怎么选？
A: 数据量小(< 10GB) → Sentinel
   需要水平扩展 → Cluster

Q: 脑裂怎么防？
A: min-replicas-to-write 1
   min-replicas-max-lag 10
```
