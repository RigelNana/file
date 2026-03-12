# Redis性能优化

---

## 1. Redis 为什么这么快？

**回答：**

```
1. 纯内存操作：
   数据存在内存中，读写 ns 级别

2. 单线程模型：
   避免上下文切换和锁竞争
   串行执行命令，没有并发开销
   （6.0+ IO 多线程，命令执行仍单线程）

3. 高效数据结构：
   SDS / ziplist / skiplist / dict
   针对不同场景优化底层编码

4. IO 多路复用：
   epoll/kqueue 处理大量连接
   单线程处理多客户端

5. 协议简单：
   RESP 协议解析高效

  ┌────────────────────────────────────┐
  │   Client1  Client2  Client3  ...   │
  │     │        │        │            │
  │     └────────┼────────┘            │
  │              │                     │
  │        ┌─────┴──────┐              │
  │        │ IO 多路复用 │  epoll      │
  │        └─────┬──────┘              │
  │              │                     │
  │        ┌─────┴──────┐              │
  │        │ 单线程执行  │  串行命令    │
  │        └─────┬──────┘              │
  │              │                     │
  │        ┌─────┴──────┐              │
  │        │   内存数据  │              │
  │        └────────────┘              │
  └────────────────────────────────────┘
```

---

## 2. Redis 6.0 多线程？

**回答：**

```
Redis 6.0 多线程 IO：
  IO 读写 → 多线程（解析请求/写出响应）
  命令执行 → 仍然单线程

  ┌──────────────────────────────────┐
  │ IO Thread 1 → 读取请求 → 解析   │
  │ IO Thread 2 → 读取请求 → 解析   │
  │ IO Thread 3 → 读取请求 → 解析   │
  │        ↓                        │
  │ Main Thread → 单线程执行命令     │
  │        ↓                        │
  │ IO Thread 1 → 写出响应          │
  │ IO Thread 2 → 写出响应          │
  │ IO Thread 3 → 写出响应          │
  └──────────────────────────────────┘

开启多线程：
  io-threads 4            # IO 线程数
  io-threads-do-reads yes # 读也用多线程

建议：
  CPU 核数 ≤ 4 → 不用开
  大量连接 + 大 value → 开启
  线程数 = CPU 核数 - 1
```

---

## 3. 慢查询排查？

**回答：**

```
慢查询日志：
  slowlog-log-slower-than 10000  # 微秒（10ms）
  slowlog-max-len 128            # 保留条数

  SLOWLOG GET 10    → 获取最近 10 条慢查询
  SLOWLOG LEN       → 慢查询数量
  SLOWLOG RESET     → 清空

慢查询常见原因：
  1. KEYS *    → O(N) 遍历所有 key → 用 SCAN 替代
  2. 大 key 操作 → HGETALL 大 Hash → 分批 HSCAN
  3. 聚合命令   → SORT / ZUNIONSTORE
  4. 范围查询   → LRANGE 0 -1 大 List
  5. Lua 脚本耗时过长

INFO commandstats → 统计各命令调用次数和耗时

延迟分析：
  redis-cli --latency        → 延迟监测
  redis-cli --latency-dist   → 延迟分布
  redis-cli --intrinsic-latency 100  → 系统固有延迟

危险命令禁用：
  rename-command KEYS ""
  rename-command FLUSHALL ""
  rename-command FLUSHDB ""
```

---

## 4. 内存优化？

**回答：**

```
1. 合理选择数据结构编码：
   Hash field 少 → ziplist（内存省）
   hash-max-ziplist-entries 128
   hash-max-ziplist-value 64

   List 元素少 → quicklist 中 ziplist 节点紧凑
   list-max-ziplist-size -2

2. 减少 key 数量：
   ❌ user:1001:name, user:1001:age
   ✅ user:1001 → Hash {name, age}

3. 短 key 名：
   ❌ user:information:name
   ✅ u:1001:n

4. 过期策略：
   设置合理 TTL，避免数据永驻
   maxmemory-policy allkeys-lru

5. 压缩 value：
   JSON → MessagePack / Protobuf
   大 String → gzip 压缩

6. 内存分析：
   INFO memory                    → 总内存
   MEMORY USAGE key               → 单个 key
   redis-cli --bigkeys            → 找大 key
   MEMORY DOCTOR                  → 内存诊断
```

```go
// value 压缩示例
import "compress/gzip"

func compressAndSet(ctx context.Context, rdb *redis.Client, 
    key string, data []byte, ttl time.Duration) error {
    var buf bytes.Buffer
    gz := gzip.NewWriter(&buf)
    gz.Write(data)
    gz.Close()
    return rdb.Set(ctx, key, buf.Bytes(), ttl).Err()
}

func getAndDecompress(ctx context.Context, rdb *redis.Client, 
    key string) ([]byte, error) {
    data, err := rdb.Get(ctx, key).Bytes()
    if err != nil {
        return nil, err
    }
    gz, _ := gzip.NewReader(bytes.NewReader(data))
    defer gz.Close()
    return io.ReadAll(gz)
}
```

---

## 5. 淘汰策略详解？

**回答：**

```
maxmemory 达到上限时的淘汰策略：

  ┌──────────────────┬────────────────────────┐
  │ 策略              │ 说明                   │
  ├──────────────────┼────────────────────────┤
  │ noeviction       │ 不淘汰，写入报错        │
  │ allkeys-lru      │ 所有key中淘汰最近最少用 │
  │ volatile-lru     │ 有过期时间的key中LRU    │
  │ allkeys-lfu      │ 所有key中淘汰最不常用   │
  │ volatile-lfu     │ 有过期的key中LFU        │
  │ allkeys-random   │ 随机淘汰               │
  │ volatile-random  │ 有过期时间的key随机淘汰 │
  │ volatile-ttl     │ 淘汰 TTL 最小的key     │
  └──────────────────┴────────────────────────┘

LRU vs LFU：
  LRU（Least Recently Used）：最长时间未使用
  → 偶尔访问的冷数据会被误保留
  
  LFU（Least Frequently Used）：使用次数最少
  → Redis 4.0+ 支持
  → 更准确，推荐

Redis LRU 实现（近似 LRU）：
  不是精确 LRU（太耗内存）
  随机采样 N 个 key，淘汰最旧的
  maxmemory-samples 5（采样数，越大越精确）

推荐配置：
  缓存场景 → allkeys-lfu（4.0+）或 allkeys-lru
  会话场景 → volatile-ttl
```

---

## 6. 过期 Key 删除策略？

**回答：**

```
Redis 两种过期删除策略：

1. 惰性删除（Lazy）：
   访问 key 时检查是否过期
   过期 → 删除 → 返回 nil
   问题：不访问的 key 永远不删 → 内存泄漏

2. 定期删除（Active）：
   每 100ms 执行一次（hz 配置）
   随机抽样检查 20 个设有过期时间的 key
   删除已过期的
   如果过期比例 > 25% → 继续抽样
   → 自适应调节频率

  ┌──────────────────────────┐
  │ 惰性删除 + 定期删除 结合  │
  │                          │
  │ 定期扫描：每次20个key     │
  │    → 过期率 > 25% → 继续 │
  │    → 过期率 ≤ 25% → 停止 │
  │                          │
  │ 惰性检查：访问时判断      │
  │                          │
  │ 兜底：maxmemory淘汰策略   │
  └──────────────────────────┘

注意：
  从库不主动删除过期 key
  等主库 DEL 命令同步过来
  → 3.2+ 从库读到过期 key 返回 nil
```

---

## 7. Pipeline 与批量操作优化？

**回答：**

```
单次 RTT 影响：
  局域网 RTT ≈ 0.5ms
  10000 次操作 = 5s（RTT 开销）

Pipeline：
  批量发送，减少 RTT → 大幅提升吞吐

MGET/MSET vs Pipeline：
  MGET/MSET：原生批量命令，原子
  Pipeline：任意命令组合，非原子

Cluster 中的 Pipeline：
  go-redis 自动按 slot 分组
  各组分别 Pipeline

批量操作建议：
  每批 100~1000 个命令
  太多 → 单次响应过大，阻塞
  太少 → RTT 开销仍然大
```

```go
// 高效批量操作
func batchSet(ctx context.Context, rdb *redis.Client,
    data map[string]interface{}) error {
    
    pipe := rdb.Pipeline()
    count := 0
    
    for k, v := range data {
        pipe.Set(ctx, k, v, time.Hour)
        count++
        
        if count%500 == 0 {
            if _, err := pipe.Exec(ctx); err != nil {
                return err
            }
            pipe = rdb.Pipeline()
        }
    }
    
    if count%500 != 0 {
        _, err := pipe.Exec(ctx)
        return err
    }
    return nil
}
```

---

## 8. Redis 监控指标？

**回答：**

```
关键指标：

1. 性能指标：
   instantaneous_ops_per_sec  → QPS
   latency_percentiles        → 延迟分布

2. 内存指标：
   used_memory               → 已用内存
   used_memory_rss           → 物理内存
   mem_fragmentation_ratio   → 碎片率
   → > 1.5 碎片严重 → MEMORY PURGE
   → < 1 使用了 swap → 危险

3. 连接指标：
   connected_clients         → 当前连接数
   rejected_connections      → 拒绝连接数
   blocked_clients           → 阻塞客户端数

4. 命中率：
   keyspace_hits / (hits + misses) → 缓存命中率
   → < 90% 需要优化

5. 持久化指标：
   rdb_last_bgsave_status   → 最近 RDB 状态
   aof_last_rewrite_status  → 最近 AOF 重写状态

6. 复制指标：
   master_link_status       → 主从连接状态
   master_repl_offset       → 复制偏移量

监控工具：Prometheus + Grafana + redis_exporter
```

---

## 9. 常见性能问题与解决？

**回答：**

```
1. 抖动和延迟：
   原因：fork 耗时 / 大 key / 慢查询
   排查：SLOWLOG + latency monitor
   解决：避免大 key / 优化 fork

2. 内存碎片：
   原因：频繁更新不同大小的 value
   判断：mem_fragmentation_ratio > 1.5
   解决：
   activedefrag yes（4.0+自动碎片整理）
   或重启 Redis

3. 连接数爆满：
   原因：连接泄漏 / 短连接
   解决：使用连接池 + 合理 maxclients

4. CPU 100%：
   原因：大量计算命令 / Lua 耗时
   排查：INFO commandstats
   解决：拆分命令 / 优化 Lua

5. 主从延迟大：
   原因：网络 / 大 key / 从库负载高
   排查：INFO replication → lag
   解决：优化网络 / 拆大 key

6. AOF 重写阻塞：
   原因：数据量大 + 写入频繁
   解决：
   no-appendfsync-on-rewrite yes
   auto-aof-rewrite-percentage 100
```

---

## 10. Redis性能优化面试速答？

**回答：**

```
Q: Redis 为什么快？
A: 内存操作 + 单线程无锁 + IO多路复用
   + 高效数据结构

Q: 6.0 多线程是什么？
A: IO读写多线程，命令执行仍单线程
   提升网络IO效率

Q: 怎么排查慢查询？
A: SLOWLOG GET 查看慢日志
   避免 KEYS/HGETALL 等O(N)命令

Q: 淘汰策略推荐？
A: 缓存场景用 allkeys-lfu
   会话场景用 volatile-ttl

Q: 过期 key 怎么删除？
A: 惰性删除(访问时) + 定期删除(随机抽样)
   兜底：maxmemory 淘汰

Q: 内存碎片怎么办？
A: fragmentation_ratio > 1.5 → 碎片严重
   activedefrag yes 自动整理

Q: Pipeline 注意事项？
A: 每批 100-1000 命令
   非原子操作，只减少RTT

Q: 最重要的监控指标？
A: QPS、延迟、内存、命中率、连接数
   用 Prometheus + redis_exporter
```
