# MongoDB 与 NoSQL

---

## 1. MongoDB 核心概念？

**回答：**

```
MongoDB: 文档型 NoSQL 数据库

术语对照:
  ┌──────────────────┬──────────────────┐
  │ RDBMS            │ MongoDB          │
  ├──────────────────┼──────────────────┤
  │ Database         │ Database         │
  │ Table            │ Collection       │
  │ Row              │ Document         │
  │ Column           │ Field            │
  │ Primary Key      │ _id              │
  │ JOIN             │ $lookup / 嵌套   │
  │ Index            │ Index            │
  │ Transaction      │ Transaction (4.0+)│
  └──────────────────┴──────────────────┘

文档格式 (BSON):
  {
    "_id": ObjectId("65a1b2c3d4e5f6a7b8c9d0e1"),
    "name": "张三",
    "age": 25,
    "address": {
      "city": "北京",
      "district": "海淀"
    },
    "tags": ["engineer", "devops"],
    "created_at": ISODate("2024-01-01T00:00:00Z")
  }

特点:
  灵活 Schema: 同一 Collection 中文档结构可以不同
  嵌套文档:    一对一/一对多关系可以嵌套
  数组字段:    支持数组和数组索引
  自动 _id:    ObjectId (12 字节, 包含时间戳)

ObjectId 结构:
  4 字节时间戳 + 5 字节随机值 + 3 字节递增计数器
  → 有序, 包含创建时间
```

---

## 2. MongoDB CRUD 操作？

**回答：**

```javascript
// 插入
db.users.insertOne({ name: "张三", age: 25 })
db.users.insertMany([
  { name: "李四", age: 30 },
  { name: "王五", age: 28 }
])

// 查询
db.users.find({ age: { $gt: 25 } })           // age > 25
db.users.find({ name: "张三" })                // 等值查询
db.users.find({ tags: "devops" })              // 数组包含
db.users.find({ "address.city": "北京" })       // 嵌套字段

// 查询操作符
// $gt, $gte, $lt, $lte, $ne, $in, $nin
// $and, $or, $not, $nor
// $exists, $type, $regex

db.users.find({
  $and: [
    { age: { $gte: 20, $lte: 30 } },
    { tags: { $in: ["devops", "sre"] } }
  ]
})

// 投影 (只返回特定字段)
db.users.find({}, { name: 1, age: 1, _id: 0 })

// 排序 + 分页
db.users.find().sort({ age: -1 }).skip(10).limit(10)

// 更新
db.users.updateOne(
  { name: "张三" },
  { $set: { age: 26 }, $push: { tags: "k8s" } }
)
db.users.updateMany(
  { age: { $lt: 20 } },
  { $set: { status: "junior" } }
)

// 删除
db.users.deleteOne({ name: "张三" })
db.users.deleteMany({ status: "inactive" })
```

---

## 3. MongoDB 索引？

**回答：**

```
索引类型:
  ┌──────────────────┬──────────────────────────────────┐
  │ 类型              │ 说明                             │
  ├──────────────────┼──────────────────────────────────┤
  │ 单字段索引        │ { name: 1 }                      │
  │ 复合索引          │ { name: 1, age: -1 }             │
  │ 多键索引          │ 自动为数组字段创建                │
  │ 文本索引          │ 全文搜索                         │
  │ 地理空间索引       │ 2dsphere, 地理位置查询            │
  │ 哈希索引          │ { _id: "hashed" } 分片用         │
  │ TTL 索引          │ 自动过期删除文档                  │
  │ 唯一索引          │ unique: true                     │
  │ 部分索引          │ partialFilterExpression           │
  │ 稀疏索引          │ sparse: true (跳过无此字段的文档) │
  └──────────────────┴──────────────────────────────────┘
```

```javascript
// 创建索引
db.users.createIndex({ name: 1 })                    // 升序
db.users.createIndex({ name: 1, age: -1 })           // 复合索引
db.users.createIndex({ email: 1 }, { unique: true }) // 唯一索引

// TTL 索引 (自动过期)
db.sessions.createIndex(
  { lastAccess: 1 },
  { expireAfterSeconds: 3600 }  // 1 小时过期
)

// 部分索引 (只索引满足条件的文档)
db.orders.createIndex(
  { status: 1 },
  { partialFilterExpression: { status: "active" } }
)

// 查看执行计划
db.users.find({ name: "张三" }).explain("executionStats")
// 关注: stage (IXSCAN vs COLLSCAN), totalDocsExamined

// 查看索引
db.users.getIndexes()

// 删除索引
db.users.dropIndex("name_1")

// 索引最佳实践:
//   ESR 原则: Equality → Sort → Range
//   覆盖查询: projection 只含索引字段
//   避免过多索引 (写入变慢)
//   监控: db.collection.stats() → 索引使用率
```

---

## 4. MongoDB 聚合管道 (Aggregation Pipeline)？

**回答：**

```javascript
// 聚合管道: 类似 SQL 的 GROUP BY + 各种转换

// 常用阶段:
// $match    → WHERE
// $group    → GROUP BY
// $sort     → ORDER BY
// $project  → SELECT
// $limit    → LIMIT
// $skip     → OFFSET
// $unwind   → 展开数组
// $lookup   → JOIN
// $addFields → 添加计算字段

// 示例: 每个部门的平均工资 (工资 > 5000)
db.employees.aggregate([
  { $match: { salary: { $gt: 5000 } } },
  { $group: {
    _id: "$department",
    avgSalary: { $avg: "$salary" },
    count: { $sum: 1 },
    maxSalary: { $max: "$salary" }
  }},
  { $sort: { avgSalary: -1 } },
  { $limit: 10 }
])

// $lookup (JOIN)
db.orders.aggregate([
  { $lookup: {
    from: "users",
    localField: "userId",
    foreignField: "_id",
    as: "userInfo"
  }},
  { $unwind: "$userInfo" },
  { $project: {
    orderNo: 1,
    amount: 1,
    "userInfo.name": 1
  }}
])

// $unwind: 展开数组
// 文档: { tags: ["a", "b", "c"] }
// $unwind: "$tags" → 3 个文档, 每个包含一个 tag
db.articles.aggregate([
  { $unwind: "$tags" },
  { $group: { _id: "$tags", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
// → 统计每个标签出现的次数
```

---

## 5. MongoDB 副本集 (Replica Set)？

**回答：**

```
副本集架构:

  ┌──────────────────────────────────────────┐
  │  Primary (主节点)                        │
  │    处理所有写操作                        │
  │    oplog (操作日志, 类似 binlog)          │
  │                                          │
  │  ┌─── Secondary 1 (从节点)              │
  │  │    同步 oplog, 可处理读请求           │
  │  │                                       │
  │  ├─── Secondary 2 (从节点)              │
  │  │    同步 oplog, 可处理读               │
  │  │                                       │
  │  └─── Arbiter (仲裁节点, 可选)           │
  │       仅参与选举, 不存数据               │
  └──────────────────────────────────────────┘

选举机制:
  Primary 故障 → Secondary 发起选举
  协议: Raft (MongoDB 4.0+)
  需要: 多数派投票 (3 节点需 2 票)
  优先级: priority 最高的优先当选
  选举时间: 通常 < 12 秒

Read Preference (读偏好):
  primary:            只读 Primary (默认)
  primaryPreferred:   优先 Primary, 不可用时读 Secondary
  secondary:          只读 Secondary
  secondaryPreferred: 优先 Secondary
  nearest:            最近的节点

Write Concern (写关注):
  w: 1        默认, Primary 确认即返回
  w: "majority"  多数节点确认 (推荐)
  w: 0        不等确认 (fire-and-forget)
  j: true     写入 journal 后确认

  db.orders.insertOne(
    { orderNo: "123" },
    { writeConcern: { w: "majority", j: true, wtimeout: 5000 } }
  )
```

---

## 6. MongoDB 分片 (Sharding)？

**回答：**

```
分片架构:

  Client
    │
  mongos (路由, 可多个)
    │
  Config Server (3 个, 存储分片元数据)
    │
  ┌─────────┬─────────┬─────────┐
  │ Shard 1 │ Shard 2 │ Shard 3 │
  │ (RS)    │ (RS)    │ (RS)    │
  └─────────┴─────────┴─────────┘
  
  每个 Shard 是一个副本集 (Replica Set)

分片键 (Shard Key):
  决定数据如何分布到各 Shard
  
  分片策略:
    范围分片 (Range):
      key 值连续的文档在同一 Shard
      优: 范围查询高效
      缺: 可能热点 (最新数据集中在一个 Shard)
    
    哈希分片 (Hashed):
      key 值哈希后分布
      优: 均匀分布, 无热点
      缺: 范围查询需扫描所有 Shard

  选择分片键:
    ✓ 高基数 (cardinality 大)
    ✓ 查询中频繁使用
    ✓ 写入均匀分布
    ✗ 避免: 递增字段 (时间戳) 用范围分片 → 热点
    ✗ 避免: 低基数 (status = active/inactive)
```

```javascript
// 启用分片
sh.enableSharding("mydb")

// 创建分片键索引
db.orders.createIndex({ userId: "hashed" })

// 分片
sh.shardCollection("mydb.orders", { userId: "hashed" })

// 查看分片状态
sh.status()

// Chunks: 数据块, 默认 128MB
// 数据增长 → Chunk 分裂 → Balancer 自动均衡
```

---

## 7. MongoDB 事务 (4.0+)？

**回答：**

```javascript
// MongoDB 4.0+: 多文档事务 (副本集)
// MongoDB 4.2+: 分布式事务 (分片集群)

const session = db.getMongo().startSession()
session.startTransaction({
  readConcern: { level: "snapshot" },
  writeConcern: { w: "majority" }
})

try {
  const orders = session.getDatabase("mydb").orders
  const accounts = session.getDatabase("mydb").accounts

  orders.insertOne({ orderNo: "ORD001", amount: 100 }, { session })
  accounts.updateOne(
    { userId: "U001" },
    { $inc: { balance: -100 } },
    { session }
  )

  session.commitTransaction()
} catch (e) {
  session.abortTransaction()
  throw e
} finally {
  session.endSession()
}
```

```
事务注意事项:
  默认超时: 60 秒
  性能影响: 事务有额外开销
  最佳实践:
    优先用嵌套文档 (单文档操作天然原子)
    事务尽量短 (避免锁定过多数据)
    retry logic (网络问题自动重试)

何时需要事务:
  ✓ 多个 Collection 的关联更新
  ✓ 金融/订单等需要一致性的业务
  ✗ 单文档操作 (本身就是原子的)
  ✗ 大批量操作 (性能差)
```

---

## 8. MongoDB vs 其他 NoSQL？

**回答：**

```
  ┌──────────┬──────────────┬──────────────┬──────────────┐
  │ 维度      │ MongoDB      │ Cassandra    │ DynamoDB     │
  ├──────────┼──────────────┼──────────────┼──────────────┤
  │ 数据模型  │ 文档 (JSON)  │ 宽列          │ 键值/文档     │
  │ 一致性    │ 可调 (CP)    │ 可调 (AP)     │ 可调 (默认AP) │
  │ 扩展      │ 分片         │ 无主分布式    │ 自动          │
  │ 事务      │ 多文档 (4.0+)│ 轻量级        │ 单表事务      │
  │ 查询      │ 丰富         │ CQL (受限)    │ 受限          │
  │ 运维      │ 中等         │ 复杂          │ 全托管        │
  │ 适用      │ 通用         │ 时序/高写入    │ Serverless    │
  └──────────┴──────────────┴──────────────┴──────────────┘

选型指南:
  灵活 Schema + 丰富查询 → MongoDB
  超高写入吞吐 + 多数据中心 → Cassandra
  Serverless + AWS 生态 → DynamoDB
  全文搜索 → Elasticsearch
  图关系 → Neo4j
  时序数据 → InfluxDB / TimescaleDB
  缓存 → Redis
  消息队列 → Redis Stream / Kafka
```

---

## 9. MongoDB 设计模式？

**回答：**

```
数据建模: 嵌套 vs 引用

  嵌套 (Embedding):
    // 用户和地址 (一对一/一对少)
    {
      name: "张三",
      address: { city: "北京", street: "xxx" }
    }
    优: 一次查询获取所有数据, 原子更新
    缺: 文档大小限制 16MB, 嵌套数据更新复杂

  引用 (Referencing):
    // 用户和订单 (一对多)
    // users: { _id: 1, name: "张三" }
    // orders: { _id: 101, userId: 1, amount: 100 }
    优: 数据独立, 无大小限制
    缺: 需要 $lookup (额外查询)

设计原则:
  ┌──────────────┬──────────────┬──────────────┐
  │ 关系          │ 推荐方式      │ 原因          │
  ├──────────────┼──────────────┼──────────────┤
  │ 一对一        │ 嵌套         │ 一起读写       │
  │ 一对少 (<100) │ 嵌套         │ 数组不会太大   │
  │ 一对多        │ 引用         │ 避免文档过大   │
  │ 多对多        │ 引用         │ 两边各存 ID    │
  │ 读多写少      │ 嵌套 (反范式) │ 查询性能       │
  │ 写多读少      │ 引用 (范式)   │ 更新性能       │
  └──────────────┴──────────────┴──────────────┘

常见设计模式:
  Bucket Pattern:  时序数据按时间桶聚合
  Computed Pattern: 预计算频繁查询的值
  Subset Pattern:  只嵌套最新 N 条 (如最近 10 条评论)
  Polymorphic:     同一 Collection 存不同类型文档
```

---

## 10. NoSQL 面试速答？

**回答：**

```
Q: MongoDB 适合什么场景?
A: 灵活 Schema (内容管理/日志等), 快速迭代
   不适合: 强事务 (金融核心), 复杂多表 JOIN

Q: MongoDB 的 _id 是什么?
A: 默认 ObjectId (12字节), 包含时间戳+随机值+计数器
   可以自定义 _id

Q: MongoDB 怎么做 JOIN?
A: 聚合管道 $lookup, 或嵌套文档避免 JOIN
   MongoDB 不擅长 JOIN, 优先考虑反范式设计

Q:副本集最少几个节点?
A: 3 个 (奇数个, 多数派选举)
   2 数据节点 + 1 仲裁节点也行 (但不推荐)

Q: 分片键怎么选?
A: 高基数 + 查询常用 + 写入均匀
   避免递增字段范围分片 (热点)

Q: Write Concern "majority" 什么意思?
A: 多数节点确认写入才返回成功
   保证写入不丢 (即使 Primary 故障)

Q: CAP 定理怎么理解?
A: 网络分区 (P) 必须容忍
   MongoDB: CP (优先一致性)
   Cassandra: AP (优先可用性)
   实际上可调 (Read/Write Concern)

Q: 什么时候用 NoSQL 而不是 MySQL?
A: Schema 频繁变化 → 文档型 (MongoDB)
   高写入吞吐 → 列族型 (Cassandra)
   简单 KV 缓存 → Redis
   其他大多数情况 → 还是 MySQL/PostgreSQL
```
