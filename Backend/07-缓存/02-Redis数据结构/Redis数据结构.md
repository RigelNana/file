# Redis数据结构

---

## 1. String 类型与 SDS？

**回答：**

```
String 是最基础的类型：
  可存字符串/整数/浮点数/二进制数据

底层实现 - SDS（Simple Dynamic String）：
  struct sdshdr {
      int len;      // 已使用长度
      int free;     // 剩余可用
      char buf[];   // 实际数据
  }

  相比 C 字符串的优势：
  1. O(1) 获取长度（len 字段）
  2. 二进制安全（不以 \0 判断结尾）
  3. 预分配策略：
     < 1MB → 分配 2*len
     ≥ 1MB → 多分配 1MB
  4. 惰性释放（缩短不立即回收）

编码方式：
  int：整数值（省内存）
  embstr：≤ 44 字节（对象和SDS连续内存）
  raw：> 44 字节（对象和SDS分开分配）

常用命令：
  SET key value EX 60         # 设置带过期
  GET key                     # 获取
  INCR/DECR key               # 原子自增/减
  MSET k1 v1 k2 v2            # 批量设置
  SETNX key value              # 不存在才设置
  SETEX key 60 value           # 设置+过期

应用场景：
  缓存、计数器、分布式锁、限流
```

---

## 2. Hash 类型？

**回答：**

```
Hash 存储字段-值映射（对象存储）：

底层编码：
  ziplist（压缩列表）：
    元素数 ≤ hash-max-ziplist-entries(128)
    且所有值 ≤ hash-max-ziplist-value(64 字节)
    → 连续内存，省空间

  hashtable（哈希表）：
    超过阈值自动转换
    → O(1) 查找

常用命令：
  HSET user:1 name "张三" age 25
  HGET user:1 name
  HMSET user:1 name "张三" age 25 city "北京"
  HGETALL user:1
  HINCRBY user:1 age 1       # 字段自增
  HDEL user:1 city

应用场景：
  用户信息：HSET user:{id} name "张三" age 25
  购物车：HSET cart:{uid} {pid} {quantity}
  计数器组：HSET counters page_view 100 api_call 200

vs String 存对象：
  String(JSON)：
    读取全部字段（整体序列化/反序列化）
    不支持单字段修改

  Hash：
    ✅ 单字段读写（HGET/HSET）
    ✅ 减少序列化开销
    ✅ 节省内存（ziplist 编码时）
```

---

## 3. List 类型？

**回答：**

```
List 有序列表，支持两端操作：

底层实现 - quicklist（3.2+）：
  ziplist 的双向链表
  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ ziplist  │↔ │ ziplist  │↔ │ ziplist  │
  │ [a,b,c] │  │ [d,e,f] │  │ [g,h]   │
  └─────────┘  └─────────┘  └─────────┘
  
  兼顾 ziplist 的内存效率和链表的灵活性
  list-max-ziplist-size: 每个 ziplist 的大小

常用命令：
  LPUSH/RPUSH key v1 v2     # 左/右推入
  LPOP/RPOP key             # 左/右弹出
  LRANGE key 0 -1           # 范围查询
  LLEN key                  # 长度
  BLPOP key timeout         # 阻塞弹出（消息队列）

应用场景：
  消息队列（简单场景）：LPUSH + BRPOP
  最新N条记录：LPUSH + LTRIM（控制长度）
  时间线/Feed流：按时间插入

限制：
  不支持 ACK（消息丢失风险）
  不支持消费者组
  → 正式消息队列用 Stream 或 Kafka
```

---

## 4. Set 类型？

**回答：**

```
Set 无序不重复集合：

底层编码：
  intset：所有元素都是整数且数量少
  hashtable：否则

常用命令：
  SADD key v1 v2 v3         # 添加
  SMEMBERS key              # 所有成员
  SISMEMBER key v1           # 是否存在
  SCARD key                 # 元素个数
  SRANDMEMBER key 3         # 随机取3个
  SPOP key                  # 随机弹出

集合运算：
  SINTER key1 key2           # 交集
  SUNION key1 key2           # 并集
  SDIFF key1 key2            # 差集

应用场景：
  标签系统：SADD user:1:tags "Go" "Docker"
  共同关注：SINTER user:1:follow user:2:follow
  抽奖：SRANDMEMBER / SPOP
  去重：访问IP统计
  点赞：SADD post:1:likes user_id
```

---

## 5. ZSet（Sorted Set）类型？

**回答：**

```
ZSet 有序集合：成员唯一 + 分数排序

底层实现：
  ziplist：元素少（< 128）且值短（< 64字节）
  skiplist + dict：否则
    跳表：范围查询 O(logN)
    字典：单元素查找 O(1)

跳表结构（简化）：
  Level 3:  1 ──────────────────→ 9
  Level 2:  1 ──────→ 5 ────────→ 9
  Level 1:  1 → 3 → 5 → 7 → 9
  
  查找 7：从高层开始，逐层定位
  1→9(超过)↓ → 1→5→9(超过)↓ → 5→7✅

常用命令：
  ZADD rank 100 "user1" 90 "user2"   # 添加
  ZRANGE rank 0 9 WITHSCORES         # 正序前10
  ZREVRANGE rank 0 9 WITHSCORES      # 倒序前10
  ZSCORE rank "user1"                # 查分数
  ZRANK rank "user1"                 # 查排名
  ZINCRBY rank 5 "user1"             # 分数+5
  ZRANGEBYSCORE rank 80 100          # 按分数范围

应用场景：
  排行榜：ZADD + ZREVRANGE
  延迟队列：score=执行时间戳
  带权重的优先队列
  时间线：score=时间戳
```

---

## 6. Stream 类型（5.0+）？

**回答：**

```
Stream：Redis 原生消息流

  vs List 做消息队列的优势：
  ✅ 消费者组（Consumer Group）
  ✅ ACK 确认机制
  ✅ 消息持久化
  ✅ 阻塞读取
  ✅ 消息 ID 有序

命令：
  XADD stream * field1 value1        # 发送消息
  XREAD COUNT 10 BLOCK 5000 
    STREAMS stream 0                 # 读取消息

  # 消费者组
  XGROUP CREATE stream group1 0      # 创建消费者组
  XREADGROUP GROUP group1 consumer1 
    COUNT 1 BLOCK 5000 
    STREAMS stream >                 # 组内消费
  XACK stream group1 msg_id          # 确认消息

适用场景：
  轻量级消息队列
  事件流处理
  日志收集

局限：
  不如 Kafka 适合大规模场景
  持久化依赖 Redis 的 RDB/AOF
  功能不如专业 MQ 全面
```

---

## 7. Bitmap 和 HyperLogLog？

**回答：**

```
Bitmap（位图）：
  本质是 String，按 bit 操作
  
  SETBIT key offset 1        # 设置某位为1
  GETBIT key offset           # 获取某位
  BITCOUNT key               # 统计1的个数
  BITOP AND destkey k1 k2    # 位运算

  场景：
  签到：SETBIT sign:uid:202401 day 1
  在线状态：SETBIT online day uid 1
  
  存储效率：1亿用户签到 ≈ 12MB

HyperLogLog（基数估算）：
  概率算法，统计不重复元素数
  误差 0.81%
  最多占 12KB 内存

  PFADD hll user1 user2 user3  # 添加
  PFCOUNT hll                  # 估算基数
  PFMERGE dest hll1 hll2       # 合并

  场景：
  UV 统计：每天独立访客数
  不需要精确值的大规模去重计数

GEO（地理位置）：
  底层用 ZSet 存储（Geohash 编码）
  
  GEOADD city 116.40 39.90 "Beijing"
  GEODIST city "Beijing" "Shanghai" km
  GEORADIUS city 116.40 39.90 100 km
  
  场景：附近的人/门店搜索
```

---

## 8. Redis 对象编码与内存优化？

**回答：**

```
Redis 对象结构：
  typedef struct redisObject {
      unsigned type:4;      // 类型（String/Hash/...）
      unsigned encoding:4;  // 编码（ziplist/skiplist/...）
      unsigned lru:24;      // LRU/LFU 时间
      int refcount;         // 引用计数
      void *ptr;            // 指向底层数据结构
  }

编码转换条件：
  ┌──────────┬──────────────┬──────────────┐
  │ 类型      │ 小数据编码   │ 大数据编码   │
  ├──────────┼──────────────┼──────────────┤
  │ String   │ int/embstr   │ raw          │
  │ Hash     │ ziplist      │ hashtable    │
  │ List     │ quicklist    │ quicklist    │
  │ Set      │ intset       │ hashtable    │
  │ ZSet     │ ziplist      │ skiplist     │
  └──────────┴──────────────┴──────────────┘

内存优化技巧：
  1. 用 Hash 代替多个 String（ziplist 编码省内存）
     HSET user:info:bucket1 uid1 "data" uid2 "data"
  
  2. 控制 key 数量（key 本身有开销 ~70字节）
  
  3. 使用短 key（节省内存）
  
  4. 整数用 int 编码（共享整数对象池 0-9999）
  
  5. 启用内存回收：
     CONFIG SET maxmemory 4gb
     CONFIG SET maxmemory-policy allkeys-lfu

查看编码：
  OBJECT ENCODING key
  MEMORY USAGE key
  DEBUG OBJECT key
```

---

## 9. Redis 底层数据结构总结？

**回答：**

```
底层数据结构一览：

  SDS（Simple Dynamic String）：
  → 二进制安全/O(1)长度/预分配/惰性释放

  ziplist（压缩列表）：
  → 连续内存/小数据高效/遍历O(n)

  quicklist（快速列表,3.2+）：
  → ziplist 节点的双向链表

  listpack（紧凑列表,7.0+）：
  → ziplist 改进版，解决级联更新问题

  dict（哈希表）：
  → 链地址法解决冲突/渐进式rehash

  intset（整数集合）：
  → 有序整数数组/升级机制(int16→int32→int64)

  skiplist（跳表）：
  → 多级索引/O(logN)/1/4概率升层

  渐进式 rehash：
  dict 扩容时不会一次性迁移所有数据
  → 每次操作时迁移一部分
  → 同时维护两个哈希表(ht[0]和ht[1])
  → 避免阻塞
```

---

## 10. Redis数据结构面试速答？

**回答：**

```
Q: Redis 有哪些数据类型？
A: String/Hash/List/Set/ZSet
   + Stream/Bitmap/HyperLogLog/GEO

Q: String 底层用什么？
A: SDS（Simple Dynamic String）
   int/embstr/raw 三种编码

Q: ZSet 底层结构？
A: ziplist（小数据）或
   skiplist+dict（大数据）

Q: 跳表为什么不用红黑树？
A: 实现简单
   范围查询更高效（链表遍历）
   并发友好

Q: Hash 什么时候从 ziplist 转 hashtable？
A: 字段数 > 128 或
   单个值 > 64 字节

Q: Bitmap 适合什么场景？
A: 签到/在线状态
   1亿用户≈12MB，极省空间

Q: HyperLogLog 误差多少？
A: 0.81%，最多12KB
   适合UV统计（不需精确）

Q: 怎么优化 Redis 内存？
A: Hash代替多String(ziplist编码)
   短key/整数用int编码
   控制key数量
```
