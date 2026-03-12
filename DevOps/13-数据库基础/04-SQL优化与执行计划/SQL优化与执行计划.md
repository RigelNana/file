# SQL 优化与执行计划

---

## 1. 慢查询排查流程？

**回答：**

```
慢查询排查步骤:

  1. 开启慢查询日志
     SET GLOBAL slow_query_log = ON;
     SET GLOBAL long_query_time = 1;          -- 阈值 1 秒
     SET GLOBAL log_queries_not_using_indexes = ON;  -- 未用索引的查询
     SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';

  2. 分析慢查询日志
     mysqldumpslow:
       mysqldumpslow -s t -t 10 /var/log/mysql/slow.log
       -s t: 按查询时间排序
       -t 10: 显示前 10 条

     pt-query-digest (推荐):
       pt-query-digest /var/log/mysql/slow.log
       → 按查询模式聚合, 显示执行次数/平均时间/总时间

  3. EXPLAIN 分析具体 SQL
     EXPLAIN SELECT ...;
     → 看 type, key, rows, Extra

  4. 优化 SQL 或添加索引

  5. 验证效果
     对比优化前后的执行时间和扫描行数

监控工具:
  MySQL 自带: Performance Schema, sys schema
  第三方:     PMM (Percona Monitoring), Datadog, Grafana
```

---

## 2. SQL 优化常见手段？

**回答：**

```sql
-- 1. 只查需要的列 (避免 SELECT *)
-- ✗
SELECT * FROM users WHERE id = 100;
-- ✓
SELECT name, email FROM users WHERE id = 100;
-- SELECT * 导致: 无法覆盖索引, 多余数据传输, 内存浪费

-- 2. 批量操作代替循环
-- ✗ 循环 1000 次 INSERT
INSERT INTO t VALUES (1, 'a');
INSERT INTO t VALUES (2, 'b');
-- ✓ 一条 SQL 批量插入
INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c'), ...;
-- 每批 500-1000 条

-- 3. 避免子查询, 改用 JOIN
-- ✗ IN 子查询 (可能每行执行一次)
SELECT * FROM orders WHERE user_id IN (
  SELECT id FROM users WHERE status = 1
);
-- ✓ JOIN
SELECT o.* FROM orders o
INNER JOIN users u ON o.user_id = u.id
WHERE u.status = 1;

-- 4. 用 EXISTS 代替 IN (大子查询)
-- 当子查询结果集很大时:
SELECT * FROM orders o
WHERE EXISTS (
  SELECT 1 FROM users u WHERE u.id = o.user_id AND u.status = 1
);

-- 5. UNION ALL 代替 UNION
-- UNION: 去重 (排序), 慢
-- UNION ALL: 不去重, 快
-- 确定无重复时用 UNION ALL

-- 6. 小表驱动大表
-- ✓ 小表 IN 大表
SELECT * FROM big_table WHERE id IN (SELECT id FROM small_table);
-- ✓ 大表 EXISTS 小表
SELECT * FROM big_table b
WHERE EXISTS (SELECT 1 FROM small_table s WHERE s.id = b.id);
```

---

## 3. 大表分页优化？

**回答：**

```sql
-- 问题: OFFSET 越大越慢
SELECT * FROM orders ORDER BY id LIMIT 100000, 10;
-- MySQL 需要扫描 100010 行, 丢弃前 100000 行!

-- 方案 1: 延迟关联 (Deferred Join)
SELECT o.*
FROM orders o
INNER JOIN (
  SELECT id FROM orders ORDER BY id LIMIT 100000, 10
) AS t ON o.id = t.id;
-- 子查询只读索引 (覆盖索引), 外层只回表 10 行

-- 方案 2: 游标分页 (记住上次位置)
-- 第一页
SELECT * FROM orders ORDER BY id LIMIT 10;
-- 假设最后一条 id = 10
-- 第二页
SELECT * FROM orders WHERE id > 10 ORDER BY id LIMIT 10;
-- 直接定位, 不扫描跳过的行!

-- 方案 3: 子查询偏移
SELECT * FROM orders
WHERE id >= (SELECT id FROM orders ORDER BY id LIMIT 100000, 1)
ORDER BY id LIMIT 10;

-- 对比:
-- ┌──────────┬──────────┬────────────┬─────────────┐
-- │ 方案      │ 性能     │ 适用场景    │ 限制         │
-- ├──────────┼──────────┼────────────┼─────────────┤
-- │ OFFSET   │ 差       │ 小数据量    │ 大 OFFSET 慢│
-- │ 延迟关联  │ 中       │ 通用        │ 需主键排序   │
-- │ 游标分页  │ 好       │ 瀑布流/API  │ 不支持跳页   │
-- └──────────┴──────────┴────────────┴─────────────┘
```

---

## 4. COUNT 优化？

**回答：**

```sql
-- COUNT 的区别
COUNT(*)   -- 统计总行数 (包括 NULL), 优化器会选最小索引
COUNT(1)   -- 同 COUNT(*), 性能相同
COUNT(id)  -- 统计 id 不为 NULL 的行数
COUNT(col) -- 统计 col 不为 NULL 的行数

-- InnoDB COUNT(*) 为什么慢?
-- 因为 MVCC, 每个事务看到的行数可能不同
-- InnoDB 必须逐行判断可见性 → 没有行计数器
-- MyISAM 有行计数器, COUNT(*) 极快 (但不支持事务)

-- 优化方案:
-- 1. 使用近似值 (允许误差时)
SHOW TABLE STATUS LIKE 'orders'\G
-- Rows: 近似行数 (来自统计信息, 有误差)

EXPLAIN SELECT COUNT(*) FROM orders;
-- rows: 优化器估算, 有误差

-- 2. 缓存计数
-- Redis 维护计数: INCR order_count
-- 定期用 COUNT(*) 校准

-- 3. 汇总表
CREATE TABLE table_counts (
  table_name VARCHAR(64) PRIMARY KEY,
  row_count BIGINT
);
-- 插入时 +1, 删除时 -1
-- 定期全量校准

-- 4. 条件 COUNT 优化
-- ✗ 慢
SELECT COUNT(*) FROM orders WHERE status = 1;
-- ✓ 加索引
CREATE INDEX idx_status ON orders(status);
```

---

## 5. INSERT 优化？

**回答：**

```sql
-- 1. 批量插入
-- ✗ 逐条 (每条一次网络往返 + 一次磁盘 IO)
INSERT INTO t VALUES (1, 'a');
INSERT INTO t VALUES (2, 'b');

-- ✓ 批量 (一次网络往返, 一次提交)
INSERT INTO t VALUES (1, 'a'), (2, 'b'), (3, 'c'), ...;
-- 每批 500-1000 条, 不要太大 (max_allowed_packet 限制)

-- 2. 事务包裹
START TRANSACTION;
INSERT INTO t VALUES (1, 'a');
INSERT INTO t VALUES (2, 'b');
-- ... 多条 INSERT
COMMIT;
-- 减少事务提交次数 → 减少磁盘刷写

-- 3. LOAD DATA INFILE (最快)
LOAD DATA INFILE '/tmp/data.csv'
INTO TABLE t
FIELDS TERMINATED BY ','
LINES TERMINATED BY '\n';
-- 比 INSERT 快 10-20 倍

-- 4. 顺序插入 (主键自增)
-- 自增主键 → 追加写入 → 无页分裂 → 最快
-- UUID → 随机写入 → 页分裂 → 慢

-- 5. 临时禁用索引和约束 (大批量导入)
ALTER TABLE t DISABLE KEYS;
-- ... 大量 INSERT
ALTER TABLE t ENABLE KEYS;
-- 导完后一次性建索引, 比边插入边维护索引快

-- 6. INSERT ... ON DUPLICATE KEY UPDATE
INSERT INTO t (id, name, count)
VALUES (1, 'a', 1)
ON DUPLICATE KEY UPDATE count = count + 1;
-- 存在则更新, 不存在则插入 (避免 SELECT 再判断)
```

---

## 6. UPDATE 和 DELETE 优化？

**回答：**

```sql
-- 1. WHERE 条件必须走索引
-- ✗ 全表锁
UPDATE orders SET status = 2 WHERE create_time < '2024-01-01';
-- create_time 无索引 → 全表扫描 → 行锁退化为表锁!

-- ✓ 加索引
CREATE INDEX idx_create_time ON orders(create_time);

-- 2. 大批量更新: 分批操作
-- ✗ 一次更新百万行 → 长事务, 锁表, 主从延迟
UPDATE orders SET status = 2 WHERE status = 1;

-- ✓ 分批更新
-- 每次更新 1000 行
UPDATE orders SET status = 2
WHERE status = 1
ORDER BY id LIMIT 1000;
-- 循环直到影响行数 = 0

-- 3. 大批量删除: 同样分批
-- ✗
DELETE FROM logs WHERE create_time < '2023-01-01';
-- ✓
DELETE FROM logs WHERE create_time < '2023-01-01'
ORDER BY id LIMIT 1000;

-- 4. 避免大事务
-- 大事务导致: undo log 膨胀, 锁持有时间长, 主从延迟大
-- 拆成小事务, 每批 COMMIT

-- 5. DELETE vs TRUNCATE
-- 少量数据: DELETE WHERE ...
-- 清空全表: TRUNCATE TABLE t  (不记录行日志, 极快)
-- 保留表结构删表: DROP TABLE t; CREATE TABLE t (...);
```

---

## 7. JOIN 优化？

**回答：**

```
MySQL JOIN 算法:

  1. Nested Loop Join (嵌套循环):
     外层表每一行, 遍历内层表匹配
     → O(M × N), 内层表需索引!

  2. Block Nested Loop Join (BNL):
     外层表读入 join_buffer
     内层表全表扫描, 与 buffer 中的行匹配
     → 减少内层表扫描次数
     MySQL 8.0.18 之前使用

  3. Hash Join (MySQL 8.0.18+):
     小表建哈希表, 大表扫描匹配
     → 无索引时比 BNL 更快
     → MySQL 8.0.20 完全替代 BNL
```

```sql
-- JOIN 优化原则:

-- 1. JOIN 列必须有索引
EXPLAIN SELECT * FROM orders o
JOIN users u ON o.user_id = u.id;
-- u.id 是主键 (自动有索引)
-- o.user_id 也需要索引!
CREATE INDEX idx_user_id ON orders(user_id);

-- 2. 小表驱动大表
-- MySQL 优化器通常会自动选择, 但可以用 STRAIGHT_JOIN 强制
SELECT STRAIGHT_JOIN o.*
FROM users u    -- 小表 (驱动表)
JOIN orders o ON u.id = o.user_id;

-- 3. 避免 JOIN 太多表
-- ✗ 5+ 表 JOIN → 执行计划复杂, 性能差
-- ✓ 控制在 3-4 个表以内
-- ✓ 超过的考虑: 冗余字段 / 分步查询 / 缓存

-- 4. 关联列类型一致
-- ✗ INT JOIN VARCHAR → 隐式转换 → 索引失效!
-- ✓ 确保 JOIN ON 两侧列类型、字符集一致

-- 5. 利用 JOIN 的 Buffer
-- join_buffer_size 默认 256KB
-- 适当增大可改善 BNL/Hash Join 性能
SET SESSION join_buffer_size = 4 * 1024 * 1024; -- 4MB
```

---

## 8. 查询缓存与 Prepared Statement？

**回答：**

```
查询缓存 (Query Cache):
  MySQL 8.0 已移除!
  原因: 写操作会使所有相关表的缓存失效
        高并发写入场景效果差, 反而成为瓶颈
  替代: 应用层缓存 (Redis)

Prepared Statement (预处理语句):
  好处:
    1. 防 SQL 注入 (参数化查询)
    2. 减少解析开销 (SQL 只解析一次)
    3. 减少网络传输 (二进制协议)
```

```sql
-- MySQL Prepared Statement
PREPARE stmt FROM 'SELECT * FROM users WHERE id = ?';
SET @id = 100;
EXECUTE stmt USING @id;
DEALLOCATE PREPARE stmt;

-- 应用代码 (Python)
-- ✗ SQL 注入风险
-- cursor.execute(f"SELECT * FROM users WHERE id = {user_input}")

-- ✓ 参数化查询
-- cursor.execute("SELECT * FROM users WHERE id = %s", (user_input,))
```

```
MySQL 性能分析工具:

  1. EXPLAIN:       执行计划分析
  2. EXPLAIN ANALYZE (8.0.18+): 实际执行统计
  3. SHOW PROFILE:  SQL 各阶段耗时
  4. Performance Schema: 细粒度性能数据
  5. sys schema:    Performance Schema 的视图
  6. pt-query-digest: 慢查询分析 (Percona Toolkit)
  7. OPTIMIZER TRACE: 优化器决策过程
```

```sql
-- SHOW PROFILE
SET profiling = 1;
SELECT * FROM orders WHERE user_id = 100;
SHOW PROFILE FOR QUERY 1;
-- ┌──────────────────────┬──────────┐
-- │ Status               │ Duration │
-- ├──────────────────────┼──────────┤
-- │ starting             │ 0.000080 │
-- │ checking permissions │ 0.000010 │
-- │ Opening tables       │ 0.000030 │
-- │ init                 │ 0.000050 │
-- │ System lock          │ 0.000010 │
-- │ optimizing           │ 0.000020 │
-- │ statistics           │ 0.000090 │
-- │ preparing            │ 0.000020 │
-- │ executing            │ 0.000010 │
-- │ Sending data         │ 0.000500 │  ← 最耗时
-- │ end                  │ 0.000010 │
-- └──────────────────────┴──────────┘
```

---

## 9. 分库分表？

**回答：**

```
为什么分库分表:
  单表 > 2000 万行 → 查询变慢
  单库 QPS > 5000 → 需要分库
  单库存储 > 500GB → 需要分库

垂直拆分:
  垂直分库: 按业务拆 (用户库、订单库、商品库)
  垂直分表: 大表拆 (用户基本信息 + 用户详情)

水平拆分:
  水平分表: 同库多表 (orders_0, orders_1, ..., orders_15)
  水平分库: 多库多表

分片策略:
  ┌──────────────────┬──────────────────────────────┐
  │ 策略              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ Hash 取模         │ id % 16 → 分到 16 个表        │
  │                  │ 均匀分布, 但扩容不方便          │
  ├──────────────────┼──────────────────────────────┤
  │ 范围分片          │ id 1-100万 → 表1, 100万-200万  │
  │                  │ 扩容方便, 但可能热点             │
  ├──────────────────┼──────────────────────────────┤
  │ 一致性哈希        │ 扩容时只迁移部分数据            │
  └──────────────────┴──────────────────────────────┘

分片中间件:
  ShardingSphere (Apache): Java 生态, 功能丰富
  Vitess (PlanetScale):   MySQL 分片, K8s 原生
  ProxySQL:               轻量代理
  TiDB:                   分布式 NewSQL (自动分片)

分库分表带来的问题:
  跨库 JOIN → 应用层关联 / 冗余数据
  分布式事务 → XA / TCC / Saga
  全局 ID → 雪花算法 / 号段模式
  排序分页 → 各分片查询后合并
  扩容缩容 → 数据迁移复杂
```

---

## 10. SQL 优化面试速答？

**回答：**

```
Q: 怎么定位慢 SQL?
A: 开启 slow_query_log → pt-query-digest 分析
   → EXPLAIN 看执行计划 → 针对性优化

Q: EXPLAIN type 从好到差?
A: system > const > eq_ref > ref > range > index > ALL
   ALL 必须优化!

Q: SELECT * 有什么问题?
A: 无法覆盖索引, 多余数据传输, 浪费内存

Q: 大表分页怎么优化?
A: 延迟关联或游标分页 (WHERE id > last_id LIMIT N)

Q: 为什么要避免大事务?
A: undo log 膨胀, 锁持有时间长, 主从延迟大

Q: COUNT(*) 和 COUNT(1) 区别?
A: 无区别, 性能相同, 都统计总行数

Q: 如何优化 INSERT 性能?
A: 批量插入, 事务包裹, LOAD DATA INFILE,
   自增主键顺序写入

Q: JOIN 的优化要点?
A: JOIN 列建索引, 小表驱动大表,
   控制 JOIN 表数量 (≤4), 列类型一致

Q: 什么时候考虑分库分表?
A: 单表 > 2000万行, 单库 QPS > 5000
   先优化 SQL 和索引, 再考虑分库分表!

Q: 分库分表后 ORDER BY + LIMIT 怎么处理?
A: 每个分片查 LIMIT N, 应用层合并排序取 TopN
   深分页问题更凸显, 需要游标分页
```
