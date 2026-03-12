# 关系型数据库基础与SQL

---

## 1. 关系型数据库 vs NoSQL 数据库？

**回答：**

```
关系型 (RDBMS):
  数据模型: 表格 (行/列), 固定 Schema
  查询语言: SQL (结构化查询语言)
  事务:     完整 ACID 支持
  扩展方式: 垂直扩展 (Scale Up) 为主
  代表:     MySQL, PostgreSQL, Oracle, SQL Server

NoSQL:
  数据模型:
    文档型:   MongoDB (JSON/BSON)
    键值型:   Redis, DynamoDB
    列族型:   Cassandra, HBase
    图数据库: Neo4j, Neptune

  ┌──────────┬────────────────┬────────────────────┐
  │ 维度      │ SQL            │ NoSQL              │
  ├──────────┼────────────────┼────────────────────┤
  │ Schema   │ 强制固定        │ 灵活/无 Schema      │
  │ 扩展     │ 垂直 (加配置)   │ 水平 (加节点)       │
  │ 一致性   │ 强一致性 (ACID) │ 最终一致性 (BASE)   │
  │ 关联     │ JOIN 查询       │ 嵌套文档/反范式     │
  │ 性能     │ 复杂查询优      │ 简单查询/高吞吐优   │
  │ 事务     │ 多表事务        │ 单文档事务为主      │
  └──────────┴────────────────┴────────────────────┘

BASE 原则 (NoSQL):
  Basically Available: 基本可用
  Soft state:          软状态 (允许中间状态)
  Eventually consistent: 最终一致性

CAP 定理:
  C (Consistency):   一致性
  A (Availability):  可用性
  P (Partition tolerance): 分区容错性
  → 三者只能满足两个 (网络分区必须容忍, 实际是 CP 或 AP)

  CP: MongoDB, HBase, Redis Cluster
  AP: Cassandra, DynamoDB, CouchDB
```

---

## 2. 什么是 ACID？

**回答：**

```
ACID: 关系型数据库事务的四大特性

  A — Atomicity (原子性):
    事务是不可分割的最小单位
    要么全部成功 (COMMIT), 要么全部回滚 (ROLLBACK)
    实现: undo log (回滚日志)

  C — Consistency (一致性):
    事务前后数据满足所有约束和规则
    是事务的最终目标
    通过 A + I + D 保证

  I — Isolation (隔离性):
    并发事务之间互不干扰
    通过隔离级别控制可见性
    实现: 锁 + MVCC

  D — Durability (持久性):
    事务提交后, 数据永久保存
    即使数据库崩溃也不会丢失
    实现: redo log (重做日志) + WAL
```

```sql
-- ACID 示例: 银行转账
START TRANSACTION;

-- A: 两条 SQL 要么都成功, 要么都回滚
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;

-- C: 转账前后总金额不变
-- I: 其他事务看不到中间状态 (扣了没加)
-- D: COMMIT 后即使宕机数据也不丢

COMMIT;
```

---

## 3. SQL 语言分类？

**回答：**

```
SQL 分类:
  ┌──────┬──────────────────────┬──────────────────────────┐
  │ 类型  │ 全称                  │ 主要语句                  │
  ├──────┼──────────────────────┼──────────────────────────┤
  │ DDL  │ Data Definition Lang │ CREATE, ALTER, DROP,      │
  │      │                      │ TRUNCATE                  │
  ├──────┼──────────────────────┼──────────────────────────┤
  │ DML  │ Data Manipulation    │ INSERT, UPDATE, DELETE,   │
  │      │                      │ SELECT                    │
  ├──────┼──────────────────────┼──────────────────────────┤
  │ DCL  │ Data Control Lang    │ GRANT, REVOKE             │
  ├──────┼──────────────────────┼──────────────────────────┤
  │ TCL  │ Transaction Control  │ COMMIT, ROLLBACK,         │
  │      │                      │ SAVEPOINT                 │
  └──────┴──────────────────────┴──────────────────────────┘

DDL vs DML 区别:
  DDL: 操作表/库结构, 自动提交, 不可回滚
  DML: 操作数据, 需手动提交, 可回滚

DELETE vs TRUNCATE vs DROP:
  DELETE:   DML, 逐行删除, 可 WHERE, 可回滚, 不释放空间
  TRUNCATE: DDL, 清空表, 不可回滚, 释放空间, 重置自增
  DROP:     DDL, 删除整个表结构和数据
```

---

## 4. SQL JOIN 类型详解？

**回答：**

```
JOIN 示意:

  表 A:              表 B:
  ┌────┬──────┐     ┌────┬──────┐
  │ id │ name │     │ id │ dept │
  ├────┼──────┤     ├────┼──────┤
  │ 1  │ 张三  │     │ 1  │ 研发 │
  │ 2  │ 李四  │     │ 3  │ 产品 │
  │ 3  │ 王五  │     │ 4  │ 运维 │
  └────┴──────┘     └────┴──────┘
```

```sql
-- INNER JOIN: 两表交集
SELECT a.name, b.dept
FROM A a INNER JOIN B b ON a.id = b.id;
-- 结果: 张三-研发 (只有 id=1 匹配)
-- 王五没有因为 B 里 id=3 是产品, A 里 id=3 是王五 → 也匹配
-- 实际: 张三-研发, 王五-产品

-- LEFT JOIN: 左表全部 + 右表匹配
SELECT a.name, b.dept
FROM A a LEFT JOIN B b ON a.id = b.id;
-- 结果: 张三-研发, 李四-NULL, 王五-产品

-- RIGHT JOIN: 右表全部 + 左表匹配
SELECT a.name, b.dept
FROM A a RIGHT JOIN B b ON a.id = b.id;
-- 结果: 张三-研发, 王五-产品, NULL-运维

-- FULL OUTER JOIN (MySQL 不直接支持):
SELECT * FROM A a LEFT JOIN B b ON a.id = b.id
UNION
SELECT * FROM A a RIGHT JOIN B b ON a.id = b.id;
-- 结果: 所有行, 无匹配的填 NULL

-- CROSS JOIN: 笛卡尔积
SELECT * FROM A CROSS JOIN B;
-- 结果: 3 × 3 = 9 行
```

```
JOIN 性能注意:
  ✓ JOIN 的列要建索引
  ✓ 小表驱动大表 (小表做驱动表)
  ✓ 避免过多 JOIN (一般不超过 3-4 个表)
  ✓ JOIN 列类型要一致 (避免隐式转换)
```

---

## 5. 子查询 vs JOIN？

**回答：**

```sql
-- 子查询 (Subquery)
SELECT name FROM users
WHERE id IN (
  SELECT user_id FROM orders WHERE amount > 100
);

-- 改写为 JOIN (通常更高效)
SELECT DISTINCT u.name
FROM users u
INNER JOIN orders o ON u.id = o.user_id
WHERE o.amount > 100;

-- 相关子查询 (Correlated Subquery) — 性能差
SELECT name, (
  SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id
) AS order_count
FROM users u;

-- 改写为 LEFT JOIN + GROUP BY
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
GROUP BY u.id, u.name;
```

```
子查询 vs JOIN 对比:
  ┌──────────────┬──────────────────┬──────────────────┐
  │ 维度          │ 子查询            │ JOIN             │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 可读性        │ 直观              │ 需理解 JOIN 逻辑 │
  │ 性能          │ 可能较慢          │ 通常更快         │
  │ 优化器        │ 可能每行执行      │ 一次性关联       │
  │ 适用场景      │ EXISTS, IN       │ 多表关联查询     │
  └──────────────┴──────────────────┴──────────────────┘

EXISTS vs IN:
  EXISTS: 子查询大表时更好 (找到即停)
  IN:     子查询小结果集时更好

  SELECT * FROM users u
  WHERE EXISTS (
    SELECT 1 FROM orders o WHERE o.user_id = u.id
  );
```

---

## 6. GROUP BY 和聚合函数？

**回答：**

```sql
-- 聚合函数
SELECT
  COUNT(*)           AS total,        -- 总数
  COUNT(DISTINCT col) AS unique_count, -- 去重计数
  SUM(amount)        AS total_amount, -- 求和
  AVG(amount)        AS avg_amount,   -- 平均
  MAX(amount)        AS max_amount,   -- 最大
  MIN(amount)        AS min_amount    -- 最小
FROM orders;

-- GROUP BY 分组
SELECT department, COUNT(*) AS emp_count, AVG(salary) AS avg_salary
FROM employees
GROUP BY department;

-- HAVING: 对分组结果过滤 (WHERE 是对原始行过滤)
SELECT department, AVG(salary) AS avg_salary
FROM employees
GROUP BY department
HAVING AVG(salary) > 10000;

-- SQL 执行顺序:
-- FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT
```

```
WHERE vs HAVING:
  WHERE:  在分组前过滤原始行, 不能用聚合函数
  HAVING: 在分组后过滤分组结果, 可以用聚合函数

  -- WHERE: 过滤掉工资 < 5000 的员工, 然后再分组
  SELECT dept, AVG(salary) FROM emp
  WHERE salary > 5000
  GROUP BY dept;

  -- HAVING: 先分组, 再过滤平均工资 > 10000 的部门
  SELECT dept, AVG(salary) AS avg_sal FROM emp
  GROUP BY dept
  HAVING avg_sal > 10000;
```

---

## 7. 窗口函数 (Window Functions)？

**回答：**

```sql
-- 窗口函数: 不减少行数, 在每行上计算一个值

-- ROW_NUMBER(): 行号 (不重复)
SELECT name, salary,
  ROW_NUMBER() OVER (ORDER BY salary DESC) AS rn
FROM employees;

-- RANK(): 排名 (并列跳号: 1,2,2,4)
SELECT name, salary,
  RANK() OVER (ORDER BY salary DESC) AS rnk
FROM employees;

-- DENSE_RANK(): 排名 (并列不跳号: 1,2,2,3)
SELECT name, salary,
  DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rnk
FROM employees;

-- 分组排名 (PARTITION BY)
-- 每个部门工资排名
SELECT dept, name, salary,
  ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn
FROM employees;
```

```sql
-- 常用窗口函数
-- LAG/LEAD: 取前/后一行的值
SELECT name, salary,
  LAG(salary, 1) OVER (ORDER BY salary) AS prev_salary,
  LEAD(salary, 1) OVER (ORDER BY salary) AS next_salary
FROM employees;

-- SUM/AVG OVER: 累计/移动平均
SELECT date, revenue,
  SUM(revenue) OVER (ORDER BY date) AS cumulative_revenue,
  AVG(revenue) OVER (ORDER BY date ROWS 6 PRECEDING) AS ma_7day
FROM daily_sales;

-- NTILE: 分桶
SELECT name, salary,
  NTILE(4) OVER (ORDER BY salary) AS quartile
FROM employees;

-- 面试常见: 取每组 Top N
SELECT * FROM (
  SELECT dept, name, salary,
    ROW_NUMBER() OVER (PARTITION BY dept ORDER BY salary DESC) AS rn
  FROM employees
) t
WHERE rn <= 3;  -- 每个部门工资 Top 3
```

---

## 8. 数据库范式与反范式？

**回答：**

```
三大范式:
  1NF (第一范式): 字段不可再分 (原子性)
    ✗ 地址 = "北京市海淀区xxx路"
    ✓ 省 = "北京", 区 = "海淀", 街道 = "xxx路"

  2NF (第二范式): 满足 1NF + 非主键列完全依赖主键
    ✗ (学号, 课程号) → 学生姓名  ← 姓名只依赖学号, 部分依赖
    ✓ 拆分: 学生表(学号, 姓名) + 选课表(学号, 课程号, 成绩)

  3NF (第三范式): 满足 2NF + 非主键列不传递依赖主键
    ✗ 学号 → 院系编号 → 院系名称  ← 传递依赖
    ✓ 拆分: 学生表(学号, 院系编号) + 院系表(院系编号, 院系名称)

反范式 (Denormalization):
  为了查询性能, 故意冗余数据

  场景:
    订单表冗余商品名称 (避免 JOIN 查商品表)
    用户表冗余订单数量 (避免 COUNT 查询)

  范式 vs 反范式:
  ┌──────────────┬──────────────┬──────────────┐
  │ 维度          │ 范式化        │ 反范式化      │
  ├──────────────┼──────────────┼──────────────┤
  │ 数据冗余      │ 少            │ 多           │
  │ 写性能        │ 好 (更新一处)  │ 差 (多处更新) │
  │ 读性能        │ 差 (多表 JOIN) │ 好 (单表查询) │
  │ 数据一致性    │ 好             │ 需维护       │
  │ 适用          │ OLTP 写多     │ OLAP 读多    │
  └──────────────┴──────────────┴──────────────┘
```

---

## 9. 常用 SQL 面试题？

**回答：**

```sql
-- 1. 连续登录 N 天的用户
SELECT user_id, MIN(login_date) AS start_date,
       MAX(login_date) AS end_date,
       COUNT(*) AS consecutive_days
FROM (
  SELECT user_id, login_date,
    DATE_SUB(login_date, INTERVAL
      ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY login_date) DAY
    ) AS grp
  FROM login_log
) t
GROUP BY user_id, grp
HAVING COUNT(*) >= 3;  -- 连续 3 天

-- 2. 第二高的薪水
SELECT MAX(salary) AS SecondHighestSalary
FROM employees
WHERE salary < (SELECT MAX(salary) FROM employees);

-- 或用窗口函数
SELECT salary FROM (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM employees
) t WHERE rnk = 2 LIMIT 1;

-- 3. 每个部门最高工资的员工
SELECT dept, name, salary FROM (
  SELECT dept, name, salary,
    RANK() OVER (PARTITION BY dept ORDER BY salary DESC) AS rnk
  FROM employees
) t WHERE rnk = 1;

-- 4. 行转列 (PIVOT)
SELECT
  user_id,
  SUM(CASE WHEN subject = '语文' THEN score END) AS 语文,
  SUM(CASE WHEN subject = '数学' THEN score END) AS 数学,
  SUM(CASE WHEN subject = '英语' THEN score END) AS 英语
FROM scores
GROUP BY user_id;

-- 5. 累计去重 (每天新增用户数)
SELECT date,
  COUNT(DISTINCT user_id) - LAG(COUNT(DISTINCT user_id), 1, 0)
    OVER (ORDER BY date) AS new_users
FROM user_visits
GROUP BY date;
```

---

## 10. PostgreSQL vs MySQL？

**回答：**

```
  ┌──────────────┬────────────────────┬────────────────────┐
  │ 维度          │ MySQL              │ PostgreSQL          │
  ├──────────────┼────────────────────┼────────────────────┤
  │ MVCC         │ Undo Log           │ 多版本元组          │
  │ 复杂查询      │ 较弱               │ 强 (CTE/窗口函数)   │
  │ JSON 支持     │ 基础               │ JSONB (索引+查询)   │
  │ 扩展性       │ 存储引擎插件        │ 扩展 Extension     │
  │ 全文搜索      │ 基础               │ 内置 tsvector      │
  │ 地理信息      │ 基础               │ PostGIS 强大       │
  │ 复制          │ 基于 Binlog        │ 基于 WAL, 逻辑复制  │
  │ 连接模型      │ 线程               │ 进程 (需 pgbouncer) │
  │ 生态          │ LAMP, 互联网主流    │ 企业级, 数据密集型   │
  │ 云服务        │ RDS MySQL, Aurora  │ RDS PG, Aurora PG  │
  │ 学习曲线      │ 简单               │ 稍复杂              │
  └──────────────┴────────────────────┴────────────────────┘

选型建议:
  MySQL:      互联网 OLTP, 高并发读写, 简单业务
  PostgreSQL: 复杂查询, 地理/JSON 数据, 数据分析

PostgreSQL 独有特性:
  ✓ CTE (WITH 递归查询)
  ✓ JSONB 索引
  ✓ 数组/范围类型
  ✓ 表继承
  ✓ PostGIS 地理信息
  ✓ 逻辑复制 (表级别)
  ✓ 丰富的 Extension (TimescaleDB, Citus 等)
```
