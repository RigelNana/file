# SQL优化与执行计划

---

## 1. 慢查询定位与分析？

**回答：**

```
开启慢查询日志：
  -- 查看是否开启
  SHOW VARIABLES LIKE 'slow_query%';
  SHOW VARIABLES LIKE 'long_query_time';

  -- 开启
  SET GLOBAL slow_query_log = ON;
  SET GLOBAL long_query_time = 1;  -- 阈值(秒)
  SET GLOBAL slow_query_log_file = '/var/log/mysql-slow.log';

分析慢查询日志：
  mysqldumpslow -s t -t 10 /var/log/mysql-slow.log
  -s t: 按查询时间排序
  -t 10: 显示前 10 条

  或使用 pt-query-digest（Percona Toolkit）：
  pt-query-digest /var/log/mysql-slow.log

分析步骤：
  1. 定位慢 SQL（慢查询日志）
  2. EXPLAIN 分析执行计划
  3. SHOW PROFILE 查看各阶段耗时
  4. 优化 SQL / 添加索引 / 调整表结构
  5. 验证优化效果
```

---

## 2. SELECT * 为什么不推荐？

**回答：**

```
问题：
  1. 无法利用覆盖索引（必须回表）
  2. 传输多余数据（带宽浪费）
  3. 客户端内存占用增大
  4. 表结构变更时可能引入 Bug
  5. 影响查询优化器的选择

推荐：
  -- 不推荐
  SELECT * FROM users WHERE id = 1;

  -- 推荐（只查需要的列）
  SELECT id, name, email FROM users WHERE id = 1;

  -- 覆盖索引生效
  -- INDEX(name, email)
  SELECT name, email FROM users WHERE name = '张三';
  -- Extra: Using index（无需回表）
```

---

## 3. JOIN 优化？

**回答：**

```
JOIN 算法：

  Nested Loop Join (NLJ)：
  驱动表每行 → 在被驱动表查找匹配
  有索引时高效：驱动表行数 × 索引查找 O(logN)

  Block Nested Loop (BNL, 8.0.18前)：
  驱动表数据放入 Join Buffer → 批量匹配
  无索引时使用，8.0.20 用 Hash Join 替代

  Hash Join (8.0.18+)：
  小表建哈希表 → 大表探测匹配
  等值 JOIN 无索引时自动使用

优化原则：
  1. 小表驱动大表（优化器自动选择）
  2. 被驱动表的关联字段加索引
  3. 减少 JOIN 的表数量
  4. 避免笛卡尔积（确保 ON 条件）

  -- 确保关联字段有索引
  SELECT u.name, o.amount
  FROM users u
  JOIN orders o ON o.user_id = u.id  -- orders.user_id 需要索引
  WHERE u.status = 1;

  -- 小表在前（虽然优化器会自动调整）
  -- STRAIGHT_JOIN 强制左表驱动
```

---

## 4. 分页查询优化？

**回答：**

```
大偏移量问题：
  SELECT * FROM orders ORDER BY id LIMIT 1000000, 10;
  → 扫描 1000010 行，丢弃 1000000 行，极慢！

优化方案 1：延迟关联
  SELECT o.* FROM orders o
  INNER JOIN (
      SELECT id FROM orders ORDER BY id LIMIT 1000000, 10
  ) AS t ON o.id = t.id;
  → 子查询只扫描索引（覆盖索引），再回表 10 行

优化方案 2：游标分页（推荐）
  -- 第一页
  SELECT * FROM orders WHERE id > 0 
  ORDER BY id LIMIT 10;
  
  -- 下一页（传入上页最后的 id）
  SELECT * FROM orders WHERE id > last_id
  ORDER BY id LIMIT 10;
  → 直接索引定位，无论第几页都快

优化方案 3：覆盖索引
  如果只需少量字段且都在索引中
  SELECT id, amount FROM orders ORDER BY id LIMIT 1000000, 10;

对比：
  ┌──────────────┬──────────┬──────────────┐
  │ 方案          │ 性能     │ 限制          │
  ├──────────────┼──────────┼──────────────┤
  │ LIMIT offset │ ❌ 慢    │ 偏移大时极慢  │
  │ 延迟关联      │ ✅ 较快  │ 需要 JOIN     │
  │ 游标分页      │ ✅ 最快  │ 不支持跳页    │
  └──────────────┴──────────┴──────────────┘
```

---

## 5. 子查询与 EXISTS 优化？

**回答：**

```
子查询 vs JOIN：
  -- 子查询（可能创建临时表）
  SELECT * FROM users 
  WHERE id IN (SELECT user_id FROM orders WHERE amount > 100);

  -- 改写为 JOIN（通常更高效）
  SELECT DISTINCT u.* FROM users u
  JOIN orders o ON u.id = o.user_id
  WHERE o.amount > 100;

IN vs EXISTS：
  -- IN 适合子查询结果集小
  SELECT * FROM users 
  WHERE id IN (SELECT user_id FROM vip_users);

  -- EXISTS 适合外层表小
  SELECT * FROM users u
  WHERE EXISTS (
      SELECT 1 FROM orders o WHERE o.user_id = u.id
  );

  经验法则：
  小表 IN 大表 → IN
  大表 EXISTS 小表 → EXISTS
  MySQL 优化器可能会自动转换

NOT IN 的陷阱：
  -- NOT IN 遇到 NULL 值返回空结果！
  SELECT * FROM t1 WHERE id NOT IN (1, 2, NULL);
  → 永远返回空（NULL 比较都是 UNKNOWN）
  
  -- 用 NOT EXISTS 或排除 NULL
  SELECT * FROM t1 WHERE id NOT IN (
      SELECT id FROM t2 WHERE id IS NOT NULL);
```

---

## 6. ORDER BY 与 GROUP BY 优化？

**回答：**

```
ORDER BY 优化：

  走索引排序（最优）：
  INDEX(status, create_time)
  SELECT * FROM orders 
  WHERE status = 1 ORDER BY create_time;
  → Extra: 无 Using filesort

  文件排序（filesort，需优化）：
  两种算法：
  - 单路排序：读取所有列到 sort_buffer，内存排序
  - 双路排序：只读排序列+指针，排序后再回表
  
  参数：sort_buffer_size（排序缓冲区）
  超出 sort_buffer → 磁盘临时文件排序（很慢）

  优化：
  1. 利用索引自然有序避免 filesort
  2. 增大 sort_buffer_size
  3. 只 SELECT 需要的列（减少排序数据量）

GROUP BY 优化：

  走索引分组（最优）：
  INDEX(department_id)
  SELECT department_id, COUNT(*) 
  FROM users GROUP BY department_id;

  临时表分组（需优化）：
  Extra: Using temporary; Using filesort
  
  优化：
  1. GROUP BY 列加索引
  2. 先 WHERE 过滤再 GROUP BY
  3. 避免 GROUP BY 后 ORDER BY 不同列
```

---

## 7. COUNT(*) 性能问题？

**回答：**

```
COUNT 性能对比：
  ┌──────────────┬──────────┬──────────────────┐
  │ 写法          │ 性能     │ 说明              │
  ├──────────────┼──────────┼──────────────────┤
  │ COUNT(*)     │ 最优     │ 不取值，只计数     │
  │ COUNT(1)     │ 同上     │ 与 COUNT(*) 等价  │
  │ COUNT(id)    │ 稍慢     │ 要取 id 值判非空  │
  │ COUNT(字段)  │ 最慢     │ 取值+判NULL+计数  │
  └──────────────┴──────────┴──────────────────┘

InnoDB COUNT(*) 为什么慢？
  InnoDB 支持 MVCC → 不同事务看到的行数可能不同
  → 必须逐行判断可见性 → 无法缓存准确的总行数
  （MyISAM 有行数缓存，COUNT(*)瞬间返回，但无MVCC）

优化方案：
  1. 使用缓存（Redis）维护计数
     INSERT 后 INCR，DELETE 后 DECR
     问题：事务与缓存不一致

  2. 维护计数表
     CREATE TABLE table_counts (
         table_name VARCHAR(64) PRIMARY KEY,
         row_count BIGINT
     );
     在同一事务中更新（保证一致性）

  3. 近似值
     SHOW TABLE STATUS LIKE 'users'; → Rows 字段
     或 EXPLAIN SELECT COUNT(*) ...  → rows 估算
```

---

## 8. INSERT 批量插入优化？

**回答：**

```
单条 vs 批量：
  -- 慢：逐条插入（每次一个事务+一次网络）
  INSERT INTO users VALUES (1, '张三');
  INSERT INTO users VALUES (2, '李四');

  -- 快：批量插入（一次事务+一次网络）
  INSERT INTO users VALUES 
  (1, '张三'), (2, '李四'), (3, '王五');

  -- 更快：事务包裹
  BEGIN;
  INSERT INTO users VALUES (1, '张三'), ...;
  INSERT INTO users VALUES (1001, '赵六'), ...;
  COMMIT;
```

```go
// Go 批量插入
func BatchInsert(db *sql.DB, users []User) error {
    tx, _ := db.Begin()
    defer tx.Rollback()

    stmt, _ := tx.Prepare(
        "INSERT INTO users(name, age) VALUES(?, ?)")
    defer stmt.Close()

    for _, u := range users {
        _, err := stmt.Exec(u.Name, u.Age)
        if err != nil {
            return err
        }
    }
    return tx.Commit()
}
```

```
其他优化：
  1. LOAD DATA INFILE（最快，直接加载文件）
  2. 临时关闭自增锁：innodb_autoinc_lock_mode = 2
  3. 临时关闭唯一性检查：SET unique_checks = 0
  4. 按主键顺序插入（减少页分裂）
  5. 调大 innodb_log_buffer_size
```

---

## 9. UPDATE 和 DELETE 优化？

**回答：**

```
UPDATE 优化：
  -- 避免更新所有列
  UPDATE users SET name='张三', age=25, 
  email='z@test.com' WHERE id = 1;
  → 只更新变化的列

  -- WHERE 条件走索引
  UPDATE orders SET status = 2 
  WHERE user_id = 100 AND status = 1;
  → user_id 需要索引

  -- 大批量更新分批处理
  -- 避免长事务和大量锁
  WHILE affected > 0:
    UPDATE orders SET status = 2 
    WHERE status = 1 LIMIT 1000;

DELETE 优化：
  -- 少量删除
  DELETE FROM logs WHERE create_time < '2023-01-01'
  LIMIT 1000;  -- 分批删除

  -- 大量删除用分区表
  ALTER TABLE logs DROP PARTITION p202301;

  -- 清空表用 TRUNCATE（DDL，不记录行级日志）
  TRUNCATE TABLE temp_table;
  -- 比 DELETE 快得多，但不可回滚

避免锁表：
  大范围 UPDATE/DELETE → 锁住大量行 → 其他事务阻塞
  解决：分批处理 + 适当 sleep
```

---

## 10. SQL优化面试速答？

**回答：**

```
Q: 慢查询怎么定位？
A: 开启慢查询日志(long_query_time)
   mysqldumpslow 或 pt-query-digest 分析

Q: EXPLAIN 关注什么？
A: type(ALL最差)/key(用了什么索引)
   rows(扫描行数)/Extra(filesort/temporary要优化)

Q: 大分页怎么优化？
A: 游标分页(id > last_id)最优
   延迟关联(子查询走覆盖索引)

Q: COUNT(*) 慢怎么办？
A: Redis 缓存计数
   或计数表（同事务更新）

Q: 为什么不用 SELECT *？
A: 无法覆盖索引
   传输浪费/返回多余数据

Q: JOIN 怎么优化？
A: 被驱动表关联字段加索引
   小表驱动大表

Q: 大批量数据怎么插入？
A: 批量 INSERT / LOAD DATA INFILE
   事务包裹 / 按主键顺序

Q: 大批量 DELETE 怎么做？
A: 分批删除(LIMIT)
   分区表直接 DROP PARTITION
```
