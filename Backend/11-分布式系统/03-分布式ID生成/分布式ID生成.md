# 分布式ID生成

---

## 1. 分布式ID的需求？

**回答：**

```
  为什么需要分布式ID：
  单库自增ID → 分库后ID冲突
  需要全局唯一 + 趋势递增（对B+树索引友好）

  要求：
  ┌──────────────┬──────────────────────────────┐
  │ 特性          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 全局唯一      │ 不能重复                     │
  │ 趋势递增      │ 大致有序（不必严格）         │
  │ 高性能        │ 生成速度快 不成为瓶颈        │
  │ 高可用        │ 不能单点                     │
  │ 信息安全      │ 不暴露业务信息（如日订单量）  │
  └──────────────┴──────────────────────────────┘
```

---

## 2. UUID？

**回答：**

```
UUID = 128位 通常表示为36字符字符串
  550e8400-e29b-41d4-a716-446655440000

  版本：
  v1：时间戳 + MAC地址（暴露MAC）
  v4：纯随机（最常用）
  v7：时间戳 + 随机（RFC 9562 新增 有序）

  import "github.com/google/uuid"
  id := uuid.New()  // v4

  优点：
  - 无中心化 本地生成
  - 不会冲突（概率极低）

  缺点：
  - 36字符太长（存储+索引开销）
  - 无序 → B+树频繁页分裂
  - 不可读

  适用场景：
  ✓ 非数据库主键（TraceID/请求ID）
  ✗ 数据库主键（性能差）
  ✗ 需要排序的场景
```

---

## 3. Snowflake算法？

**回答：**

```
Twitter 开源 64位ID

  +--+-------------------+----------+------------+
  |0 | 41位时间戳(ms)     | 10位机器 | 12位序列号  |
  +--+-------------------+----------+------------+
   1     41                 10          12

  时间戳：可用约69年
  机器ID：最多1024个节点
  序列号：每ms每节点4096个ID → 单机400万/s

Go 实现：
  const (
      epoch         = 1704067200000 // 2024-01-01
      workerIDBits  = 10
      sequenceBits  = 12
      maxWorkerID   = (1 << workerIDBits) - 1
      maxSequence   = (1 << sequenceBits) - 1
  )
  
  type Snowflake struct {
      mu        sync.Mutex
      timestamp int64
      workerID  int64
      sequence  int64
  }
  
  func (s *Snowflake) Generate() int64 {
      s.mu.Lock()
      defer s.mu.Unlock()
      
      now := time.Now().UnixMilli() - epoch
      if now == s.timestamp {
          s.sequence = (s.sequence + 1) & maxSequence
          if s.sequence == 0 { // 当前ms序列号用完
              for now <= s.timestamp {
                  now = time.Now().UnixMilli() - epoch
              }
          }
      } else {
          s.sequence = 0
      }
      s.timestamp = now
      return (now << (workerIDBits + sequenceBits)) |
             (s.workerID << sequenceBits) |
             s.sequence
  }
```

---

## 4. Snowflake时钟回拨问题？

**回答：**

```
  时钟回拨：NTP同步导致系统时间倒退
  → 可能生成重复ID

  解决方案：
  
  方案1：拒绝生成 等待时钟追上
    if now < s.timestamp {
        // 等待
        time.Sleep(time.Duration(s.timestamp-now) * time.Millisecond)
        now = time.Now().UnixMilli() - epoch
    }

  方案2：预留回拨位
    +--+----+-------------------+--------+----------+
    |0 | 3位 | 38位时间戳       | 10位机器| 12位序列  |
    +--+----+-------------------+--------+----------+
       回拨次数
    每次回拨 backoff++ 
    同时间戳+回拨次数组合仍然唯一

  方案3：本地缓存最后时间戳
    持久化到文件：lastTimestamp
    启动时检查：if 当前时间 < lastTimestamp → 报警/等待

  百度 UidGenerator：
    预分配一批ID到 RingBuffer
    即使时钟回拨也有缓存可用
```

---

## 5. 号段模式？

**回答：**

```
从DB批量取一段ID 本地分发

  ┌──────────┐  取号段(1-1000)   ┌──────────┐
  │ Service  │←──────────────────│   DB     │
  │ 本地分发  │                   │ id_alloc │
  │ 1,2,3... │                   └──────────┘
  └──────────┘

  DB 表：
  CREATE TABLE id_alloc (
      biz_tag    VARCHAR(64) PRIMARY KEY,
      max_id     BIGINT,
      step       INT,
      updated_at TIMESTAMP
  );

  取号段：
  UPDATE id_alloc 
  SET max_id = max_id + step 
  WHERE biz_tag = 'order';
  
  → 获得 [old_max_id+1, old_max_id+step]

  双Buffer优化（美团Leaf）：
  ┌───────────────────────────┐
  │ Buffer 1: [1001-2000]     │ ← 当前使用
  │ Buffer 2: [2001-3000]     │ ← 预加载
  └───────────────────────────┘
  
  Buffer 1 用到 20% 时触发加载 Buffer 2
  Buffer 1 用完时切换到 Buffer 2
  → 数据库不可用也能撑一段时间

优点：
  ID有序 简单可靠
  DB挂了还有Buffer
缺点：
  依赖DB（需高可用）
  ID可能不连续（服务重启丢弃剩余号段）
```

---

## 6. 各方案对比？

**回答：**

```
  ┌──────────────┬────────┬──────┬──────┬────────┬──────────┐
  │ 方案          │ 有序   │ 性能 │ 可用 │ 长度   │ 依赖      │
  ├──────────────┼────────┼──────┼──────┼────────┼──────────┤
  │ UUID v4       │ ✗      │ 高   │ 高   │ 128bit │ 无       │
  │ DB自增        │ ✓      │ 低   │ 低   │ 64bit  │ DB       │
  │ Redis INCR   │ ✓      │ 中   │ 中   │ 64bit  │ Redis    │
  │ Snowflake    │ 趋势   │ 高   │ 高   │ 64bit  │ 时钟     │
  │ 号段(Leaf)   │ ✓      │ 高   │ 高   │ 64bit  │ DB       │
  │ UUID v7       │ 趋势   │ 高   │ 高   │ 128bit │ 无       │
  └──────────────┴────────┴──────┴──────┴────────┴──────────┘

  推荐选择：
  简单项目 → UUID v7（有序+无依赖）
  主键/Kafka Key → Snowflake（64位+高性能）
  强递增要求 → 号段模式（Leaf）
  TraceID/RequestID → UUID v4
```

---

## 7. Redis生成ID？

**回答：**

```
  INCR 命令原子递增

  // 简单方案
  id := rdb.Incr(ctx, "id:order").Val()

  // 带日期前缀
  func GenerateID(rdb *redis.Client, bizTag string) string {
      date := time.Now().Format("20060102")
      key := fmt.Sprintf("id:%s:%s", bizTag, date)
      seq := rdb.Incr(ctx, key).Val()
      rdb.Expire(ctx, key, 48*time.Hour)
      return fmt.Sprintf("%s%08d", date, seq)
  }
  // 结果：2024011500000001

优点：
  简单 有序 高性能（10万+/s）

缺点：
  依赖Redis高可用
  Redis重启可能丢失（AOF everysec最多丢1s）
  不适合做数据库主键（Redis是瓶颈）

适用场景：
  订单号（日期+序号）
  短期唯一的业务编号
  不要求全局唯一持久化的场景
```

---

## 8. ULID 和 UUID v7？

**回答：**

```
ULID（Universally Unique Lexicographically Sortable Identifier）：
  128位 = 48位时间戳(ms) + 80位随机
  Base32编码：01ARZ3NDEKTSV4RRFFQ69G5FAV
  26个字符 可排序

UUID v7（RFC 9562 2024年标准化）：
  128位 = 48位Unix时间戳(ms) + 4位版本 + 12位随机 + 64位随机
  标准UUID格式 可排序

  优势（相比UUID v4）：
  时间有序 → B+树索引友好
  兼容UUID格式 → 无需修改字段类型

Go 使用：
  // ULID
  import "github.com/oklog/ulid/v2"
  
  entropy := ulid.Monotonic(rand.New(rand.NewSource(time.Now().UnixNano())), 0)
  id := ulid.MustNew(ulid.Timestamp(time.Now()), entropy)
  
  // UUID v7
  import "github.com/google/uuid"
  id, _ := uuid.NewV7()

选择建议：
  新项目数据库主键 → UUID v7（标准 有序）
  需要紧凑表示 → ULID（26字符）
  已有UUID v4的项目 → 切换到v7很容易
```

---

## 9. 分布式ID与分库分表？

**回答：**

```
  分片键和ID的关系：
  
  方案1：ID中嵌入分片信息
    Snowflake workerID 对应分片号
    → ID本身就能确定在哪个分片
  
  方案2：独立分片键
    ID是全局唯一
    分片键是另一个字段（如userID）
    → 灵活但查询需要带分片键

  实践建议：
  ┌──────────────┬──────────────────────────────┐
  │ 场景          │ ID方案                       │
  ├──────────────┼──────────────────────────────┤
  │ 订单表        │ Snowflake(workerID=分片号)    │
  │ 用户表        │ 号段模式(连续ID利于查询)      │
  │ 日志/事件     │ UUID v7(只写不改 不需要短ID)  │
  │ 关联表        │ 和主表用同一分片键            │
  └──────────────┴──────────────────────────────┘

  订单ID设计示例：
  0|timestamp(41)|shardID(6)|workerID(4)|sequence(12)
  
  → 从ID就能知道去哪个分片查询
  → 趋势递增 对索引友好
```

---

## 10. 分布式ID面试速答？

**回答：**

```
Q: 为什么不用DB自增？
A: 分库后ID冲突 单库是性能瓶颈
   分布式环境需要全局唯一ID

Q: UUID做主键的问题？
A: v4无序→B+树频繁页分裂
   128位太长 索引存储开销大

Q: Snowflake核心原理？
A: 64位=41位时间+10位机器+12位序列
   单机400万/s 趋势递增

Q: 时钟回拨怎么办？
A: 等待追上/预留回拨位/本地缓存
   百度UidGenerator用RingBuffer预分配

Q: 号段模式优势？
A: DB批量取号段+双Buffer预加载
   ID严格递增 DB挂了仍有缓存

Q: UUID v7是什么？
A: 2024年标准 48位时间戳+随机
   时间有序 兼容UUID格式

Q: ID和分片的关系？
A: ID中嵌入分片信息(workerID=分片号)
   从ID直接定位分片 避免广播查询

Q: 怎么选方案？
A: DB主键→Snowflake/UUID v7
   业务编号→号段模式 TraceID→UUID v4
```
