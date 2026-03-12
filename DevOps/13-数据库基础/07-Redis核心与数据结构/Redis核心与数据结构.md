# Redis 核心与数据结构

---

## 1. Redis 概述与特点？

**回答：**

```
Redis: Remote Dictionary Server
  内存数据库, 键值存储, 开源

核心特点:
  ✓ 速度快: 纯内存操作, 10 万+ QPS
  ✓ 单线程模型: 避免锁竞争 (6.0+ IO 多线程)
  ✓ 丰富数据结构: String, Hash, List, Set, ZSet, Stream
  ✓ 持久化: RDB + AOF
  ✓ 高可用: 主从 + Sentinel + Cluster
  ✓ 原子操作: 单命令原子, Lua 脚本原子

为什么快:
  1. 纯内存操作 (ns 级)
  2. 单线程, 无上下文切换和锁竞争
  3. IO 多路复用 (epoll), 单线程处理多连接
  4. 高效数据结构 (SDS, ziplist, skiplist 等)

单线程模型:
  Redis 6.0 之前: 完全单线程
  Redis 6.0+: 网络 IO 多线程, 命令执行仍单线程
  
  ┌──────────────┐     ┌──────────────┐
  │ IO Thread 1  │ ──→ │              │
  │ IO Thread 2  │ ──→ │  主线程       │ ──→ 命令执行
  │ IO Thread 3  │ ──→ │  (单线程)     │
  │ 主线程 IO    │ ──→ │              │
  └──────────────┘     └──────────────┘
  
  io-threads 4           # 开启 4 个 IO 线程
  io-threads-do-reads yes # 读也用多线程

使用场景:
  缓存 (最主要)
  会话存储 (Session)
  排行榜 (Sorted Set)
  计数器 (INCR)
  分布式锁 (SET NX EX)
  消息队列 (Stream/List)
  限流 (令牌桶/滑动窗口)
```

---

## 2. String 类型深入？

**回答：**

```
String: 最基础的类型, 二进制安全, 最大 512MB

底层编码:
  int:    整数 (值是整数且 < 2^63)
  embstr: 短字符串 (≤ 44 字节, 一次内存分配)
  raw:    长字符串 (> 44 字节, 两次内存分配)

SDS (Simple Dynamic String):
  Redis 自研字符串, 替代 C 字符串
  ┌──────┬──────┬──────────────┐
  │ len  │ free │ buf[]        │
  └──────┴──────┴──────────────┘
  优势:
    O(1) 获取长度 (C 字符串 O(n))
    二进制安全 (可存 \0)
    空间预分配, 减少内存重分配
    惰性释放 (缩短时不立即回收)
```

```bash
# 基础操作
SET key value                  # 设置
SET key value EX 3600          # 设置 + 过期时间 3600 秒
SET key value NX               # 不存在才设置 (分布式锁)
SET key value XX               # 存在才更新
SETNX key value                # 等同 SET NX (旧命令)
GET key                        # 获取
MSET k1 v1 k2 v2              # 批量设置
MGET k1 k2                    # 批量获取 (减少网络往返)

# 计数器
INCR counter                   # +1 (原子操作)
INCRBY counter 10              # +10
DECR counter                   # -1
INCRBYFLOAT price 1.5          # 浮点数增量

# 位操作 (Bitmap)
SETBIT key 1000 1              # 设置第 1000 位为 1
GETBIT key 1000                # 获取第 1000 位
BITCOUNT key                   # 统计 1 的个数
BITOP AND dest key1 key2       # 位运算

# Bitmap 使用场景:
#   用户签到: SETBIT sign:20240101 uid 1
#   活跃用户: BITCOUNT active:20240101
#   在线状态: SETBIT online uid 1
```

---

## 3. Hash 类型？

**回答：**

```
Hash: 键值对的集合, 适合存对象

底层编码:
  ziplist: 元素少且值小时 (节省内存)
    hash-max-ziplist-entries 128    # 元素 ≤ 128
    hash-max-ziplist-value 64      # 值 ≤ 64 字节
  
  hashtable: 超过阈值时转为哈希表
  
  listpack: Redis 7.0 替代 ziplist (更安全, 无级联更新)
```

```bash
# 基础操作
HSET user:1001 name "张三" age 25 email "z@test.com"
HGET user:1001 name             # "张三"
HMGET user:1001 name age        # 批量获取字段
HGETALL user:1001               # 获取所有字段和值
HDEL user:1001 email            # 删除字段
HEXISTS user:1001 name          # 字段是否存在
HLEN user:1001                  # 字段数量
HINCRBY user:1001 age 1         # 字段值 +1
HSCAN user:1001 0 COUNT 100     # 增量遍历

# Hash vs String 存储对象
# 方案 1: 整个对象序列化为 String
SET user:1001 '{"name":"张三","age":25}'
# 优: 简单
# 缺: 修改一个字段需要全量读写

# 方案 2: Hash 每个字段单独存
HSET user:1001 name "张三"
HSET user:1001 age 25
# 优: 单字段读写高效
# 缺: 过期只能对整个 key, 不能对单个字段

# 方案 3: 分 key 存储
SET user:1001:name "张三"
SET user:1001:age 25
# 缺: key 太多, 内存浪费

# 推荐: Hash (方案 2)
```

---

## 4. List、Set、Sorted Set？

**回答：**

```bash
# === List (双端链表) ===
# 底层: quicklist (ziplist 组成的链表)

LPUSH mylist a b c              # 左插入: c b a
RPUSH mylist d e                # 右插入: c b a d e
LPOP mylist                     # 左弹出: c
RPOP mylist                     # 右弹出: e
LRANGE mylist 0 -1              # 获取全部
LLEN mylist                     # 长度
LINDEX mylist 0                 # 按索引

# 阻塞弹出 (消息队列)
BLPOP mylist 30                 # 阻塞 30 秒, 无数据则超时

# 场景: 消息队列 (简单), 最新列表 (最新 N 条消息)

# === Set (无序集合) ===
# 底层: intset (全整数) 或 hashtable

SADD myset a b c d
SMEMBERS myset                  # 所有成员
SISMEMBER myset a               # 是否存在
SCARD myset                     # 集合大小
SRANDMEMBER myset 2             # 随机 2 个成员

# 集合运算
SINTER set1 set2                # 交集 (共同好友)
SUNION set1 set2                # 并集
SDIFF set1 set2                 # 差集 (set1 有 set2 没有)

# 场景: 去重, 共同好友, 标签, 抽奖 (SRANDMEMBER)

# === Sorted Set (有序集合) ===
# 底层: ziplist (小数据) 或 skiplist + hashtable

ZADD leaderboard 100 "player1"
ZADD leaderboard 200 "player2"
ZADD leaderboard 150 "player3"

ZREVRANGE leaderboard 0 9       # Top 10 (分数从高到低)
ZRANK leaderboard "player1"     # 排名 (从低到高)
ZREVRANK leaderboard "player1"  # 排名 (从高到低)
ZSCORE leaderboard "player1"    # 分数
ZINCRBY leaderboard 50 "player1" # 加分
ZRANGEBYSCORE leaderboard 100 200  # 分数范围查询
ZCARD leaderboard               # 集合大小

# 场景: 排行榜, 延迟队列 (分数=执行时间), 带权重的列表
```

---

## 5. Redis 跳表 (Skip List)？

**回答：**

```
跳表: Sorted Set 的底层数据结构 (数据量大时)

为什么不用平衡树 (红黑树/AVL):
  跳表实现简单, 容易理解和调试
  范围查询更方便 (链表遍历 vs 中序遍历)
  并发修改更容易 (锁的粒度更小)

跳表结构:
  Level 3:  1 ──────────────────────→ 7 ──────→ NULL
  Level 2:  1 ────────→ 4 ──────────→ 7 ──────→ NULL
  Level 1:  1 ──→ 3 ──→ 4 ──→ 5 ──→ 7 ──→ 9 → NULL

  查找 5 的过程:
    L3: 1 → 7 (7>5, 下降)
    L2: 1 → 4 → 7 (7>5, 下降)
    L1: 4 → 5 (找到!)
    → O(log n) 时间复杂度

Redis 跳表特点:
  最大层数: 32
  每层概率: 1/4 (平均 1.33 个指针/节点)
  支持: 分值相同时按字典序排序
  支持: 反向遍历 (双向链表)

时间复杂度:
  插入: O(log n)
  删除: O(log n)
  查找: O(log n)
  范围查询: O(log n + m), m 为范围内元素数
```

---

## 6. Redis 持久化详解？

**回答：**

```
RDB (Redis Database):
  定时生成内存快照, 保存到 dump.rdb

  触发方式:
    自动: save 配置 (redis.conf)
      save 900 1        # 900 秒内 1 次修改
      save 300 10       # 300 秒内 10 次修改
      save 60 10000     # 60 秒内 10000 次修改
    
    手动:
      SAVE              # 同步 (阻塞主线程, 不推荐)
      BGSAVE            # 异步 (fork 子进程, 推荐)

  工作原理:
    BGSAVE → fork 子进程 → 子进程写 RDB → 替换旧文件
    fork 使用 COW (Copy-On-Write), 不阻塞主线程
    但 fork 本身在大内存时可能短暂阻塞

  优: 恢复速度快, 文件紧凑, 适合备份
  缺: 可能丢失最后一次快照后的数据

AOF (Append Only File):
  记录每条写命令到 appendonly.aof

  写入策略:
    appendfsync always    # 每条命令刷盘 (最安全, 最慢)
    appendfsync everysec  # 每秒刷盘 (推荐, 最多丢 1 秒)
    appendfsync no        # 交给 OS (最快不安全)

  AOF 重写:
    文件太大时重写 (合并命令)
    BGREWRITEAOF 手动触发
    auto-aof-rewrite-percentage 100    # 文件增长 100% 时重写
    auto-aof-rewrite-min-size 64mb     # 最小 64MB 才重写

  优: 数据安全性高 (最多丢 1 秒)
  缺: 文件大, 恢复比 RDB 慢

混合持久化 (Redis 4.0+):
  aof-use-rdb-preamble yes
  AOF 文件 = RDB 快照 + 增量 AOF
  兼顾恢复速度和数据安全

生产推荐:
  开启 AOF (everysec) + RDB (作为备份)
  开启混合持久化
```

---

## 7. Redis 过期和淘汰策略？

**回答：**

```
过期删除策略:
  1. 惰性删除: 访问 key 时检查是否过期, 过期则删除
     → 节省 CPU, 但过期 key 可能占内存

  2. 定期删除: 每 100ms 随机检查一批 key
     → 每次检查 20 个 key
     → 如果过期比例 > 25%, 继续检查
     → CPU 和内存的折中

  Redis 同时使用惰性删除 + 定期删除

内存淘汰策略 (maxmemory-policy):
  内存达到 maxmemory 时触发

  ┌─────────────────────┬──────────────────────────────┐
  │ 策略                 │ 说明                          │
  ├─────────────────────┼──────────────────────────────┤
  │ noeviction          │ 不淘汰, 写操作报错 (默认)      │
  │ allkeys-lru         │ 所有 key 中 LRU 淘汰 ← 推荐  │
  │ volatile-lru        │ 有过期时间的 key 中 LRU         │
  │ allkeys-lfu         │ 所有 key 中 LFU 淘汰 (4.0+)   │
  │ volatile-lfu        │ 有过期的 key 中 LFU            │
  │ allkeys-random      │ 随机淘汰                       │
  │ volatile-random     │ 有过期的随机淘汰                │
  │ volatile-ttl        │ 淘汰 TTL 最小的 key            │
  └─────────────────────┴──────────────────────────────┘

  LRU: 最近最少使用 (淘汰最久没访问的)
  LFU: 最不经常使用 (淘汰访问频率最低的, 4.0+)
       → LFU 更精确, 但实现复杂

  Redis 的 LRU 是近似算法:
    随机采样 maxmemory-samples 个 key (默认 5)
    淘汰其中最久未访问的
    → 性能好, 精度可接受
```

---

## 8. 缓存穿透、击穿、雪崩？

**回答：**

```
缓存穿透:
  请求不存在的数据 → 缓存未命中 → 每次都查 DB
  
  原因: 恶意攻击/代码 bug, 查询 id=-1 的数据
  
  解决:
  1. 缓存空值
     key 不存在 → 缓存 NULL (短过期时间 5min)
     
  2. 布隆过滤器 (Bloom Filter)
     BitMap + 多个哈希函数
     查询前先判断 key 是否可能存在
     → 判断不存在 = 一定不存在 (不查 DB)
     → 判断存在 = 可能存在 (继续查)
     
     Redis BF: BF.ADD / BF.EXISTS (RedisBloom 模块)
  
  3. 参数校验 (前端/网关层过滤非法请求)

缓存击穿:
  热点 key 突然过期 → 大量并发请求涌入 DB
  
  解决:
  1. 互斥锁 (分布式锁)
     缓存未命中 → 加锁 → 查 DB → 写缓存 → 释放锁
     其他请求等待或返回旧值
     
  2. 热点 key 永不过期
     逻辑过期: value 中存过期时间, 后台异步更新
     
  3. 提前续期 (缓存预热)

缓存雪崩:
  大量 key 同时过期 / Redis 宕机 → DB 压力暴增
  
  解决:
  1. 过期时间加随机值
     expire = base_time + random(0, 300)
     
  2. 多级缓存
     本地缓存 (Caffeine) + Redis + DB
     
  3. 限流降级
     DB 层限流, 超过的直接返回默认值
     
  4. Redis 高可用
     Sentinel / Cluster, 避免单点故障
```

---

## 9. 分布式锁？

**回答：**

```bash
# Redis 分布式锁

# 加锁 (SET NX EX 原子操作)
SET lock:order:1001 "uuid-xxx" NX EX 30
# NX: 不存在才设置 (互斥)
# EX 30: 30 秒过期 (防死锁)
# value: 随机值 (识别锁的持有者)

# 解锁 (Lua 脚本保证原子性)
# ✗ 错误: 不能先 GET 再 DEL (非原子)
# ✓ 正确: Lua 脚本
```

```lua
-- 解锁 Lua 脚本
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
-- KEYS[1] = "lock:order:1001"
-- ARGV[1] = "uuid-xxx" (确认是自己的锁才删)
```

```
分布式锁注意事项:

  1. 锁超时问题: 业务没完锁过期了
     → Redisson 看门狗 (Watchdog) 自动续期
     → 后台线程每 10 秒续期到 30 秒

  2. Redis 主从切换: 主库加锁后挂, 从库没同步到
     → RedLock 算法: 向 N 个独立 Redis 加锁
       N/2 + 1 个成功 → 加锁成功
     → 但争议大, Martin Kleppmann 指出问题
     → 生产建议使用 Redisson (封装好)

  3. 可重入锁
     → Redisson 支持, 用 Hash 存 (锁名 → 线程ID:重入次数)

Redisson 使用 (Java):
  RLock lock = redisson.getLock("lock:order:1001");
  lock.lock();    // 自动续期
  try {
    // 业务逻辑
  } finally {
    lock.unlock();
  }
```

---

## 10. Redis 数据结构面试速答？

**回答：**

```
Q: Redis 为什么这么快?
A: 纯内存 + 单线程无锁竞争 + IO 多路复用
   + 高效数据结构 (SDS, skiplist, ziplist)

Q: 单线程为什么能处理高并发?
A: IO 多路复用 (epoll) 监听多个连接
   单线程处理命令 → 避免上下文切换和锁
   瓶颈在网络不在 CPU

Q: String 的底层编码?
A: int (整数), embstr (≤44B), raw (>44B)

Q: Sorted Set 底层数据结构?
A: ziplist (小数据) 或 skiplist + hashtable (大数据)

Q: 缓存穿透/击穿/雪崩区别?
A: 穿透: 查不存在的数据 → 布隆过滤器 + 空值缓存
   击穿: 热点 key 过期 → 互斥锁 + 永不过期
   雪崩: 大量 key 同时过期 → 随机过期时间 + 多级缓存

Q: Redis 持久化推荐?
A: AOF (everysec) + RDB + 混合持久化

Q: 淘汰策略推荐?
A: allkeys-lru (缓存场景)
   volatile-lru (有些 key 不能淘汰时)

Q: 分布式锁怎么实现?
A: SET key uuid NX EX 30 (加锁)
   Lua 脚本判断 uuid 后 DEL (解锁)
   Redisson (生产推荐, 自动续期)

Q: 为什么不用 SETNX + EXPIRE?
A: 两条命令不是原子的! 中间宕机 → 死锁
   用 SET key value NX EX 30 (一条命令原子操作)
```
