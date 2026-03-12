# MySQL基础与架构

---

## 1. MySQL 整体架构是怎样的？

**回答：**

```
MySQL 分层架构：

  ┌─────────────────────────────────────┐
  │           客户端连接层               │
  │  MySQL Client / JDBC / Go sql.DB   │
  ├─────────────────────────────────────┤
  │           Server 层                 │
  │  ┌───────────┐ ┌────────────────┐  │
  │  │ 连接管理   │ │ 查询缓存(8.0删)│  │
  │  └───────────┘ └────────────────┘  │
  │  ┌───────────┐ ┌────────────────┐  │
  │  │ SQL解析器  │ │  预处理器      │  │
  │  └───────────┘ └────────────────┘  │
  │  ┌───────────┐ ┌────────────────┐  │
  │  │ 优化器    │ │   执行器        │  │
  │  └───────────┘ └────────────────┘  │
  ├─────────────────────────────────────┤
  │        存储引擎层（可插拔）          │
  │  InnoDB │ MyISAM │ Memory │ ...    │
  ├─────────────────────────────────────┤
  │          文件系统层                  │
  │  数据文件 / 日志文件 / 索引文件      │
  └─────────────────────────────────────┘

SQL 执行流程：
  客户端 → 连接器（认证/权限）
        → 查询缓存（8.0移除）
        → 解析器（词法/语法分析 → AST）
        → 预处理器（语义检查/权限）
        → 优化器（选择索引/JOIN顺序/执行计划）
        → 执行器（调用存储引擎接口）
        → 存储引擎（读写数据）
        → 返回结果
```

---

## 2. InnoDB 与 MyISAM 的区别？

**回答：**

```
  ┌──────────────┬──────────────┬──────────────┐
  │ 对比维度      │ InnoDB       │ MyISAM       │
  ├──────────────┼──────────────┼──────────────┤
  │ 事务          │ ✅ 支持      │ ❌ 不支持     │
  │ 行锁          │ ✅ 行级锁    │ ❌ 仅表级锁   │
  │ 外键          │ ✅ 支持      │ ❌ 不支持     │
  │ MVCC         │ ✅ 支持      │ ❌ 不支持     │
  │ 崩溃恢复      │ ✅ redo log  │ ❌ 不支持     │
  │ 索引结构      │ 聚簇索引     │ 非聚簇索引    │
  │ 全文索引      │ ✅ 5.6+     │ ✅ 支持       │
  │ 表空间        │ .ibd 文件   │ .MYD + .MYI  │
  │ 适用场景      │ OLTP 读写    │ 只读/读多写少 │
  └──────────────┴──────────────┴──────────────┘

InnoDB 聚簇索引：
  主键索引叶子节点 → 完整行数据
  数据按主键顺序组织
  
MyISAM 非聚簇索引：
  索引文件(.MYI) 和 数据文件(.MYD) 分离
  索引叶子节点 → 数据行的物理地址

生产环境选择：几乎都用 InnoDB
```

---

## 3. 一条 SQL 的完整执行过程？

**回答：**

```
以 SELECT * FROM users WHERE id = 1 为例：

1. 连接阶段：
   客户端 TCP 三次握手 → MySQL 连接器
   验证用户名密码 → 获取权限信息
   
2. 查询缓存（8.0已删除）：
   以 SQL 文本为 key 查缓存
   命中直接返回，不命中继续

3. 解析器：
   词法分析：拆分 SQL 关键字/表名/列名
   语法分析：检查语法 → 生成 AST

4. 预处理器：
   检查表和列是否存在
   解析通配符 * 为具体列
   权限检查

5. 优化器：
   估算不同执行方案的代价
   选择最优索引和 JOIN 顺序
   生成执行计划

6. 执行器：
   检查用户对表的权限
   调用存储引擎接口
   InnoDB: B+树查找 id=1 的数据页
   读取数据页到 Buffer Pool
   返回满足条件的行

7. 返回结果：
   将结果集发给客户端
   如有查询缓存则缓存结果
```

---

## 4. MySQL 的连接管理？

**回答：**

```
连接生命周期：
  建立连接 → 认证 → 执行查询 → 断开连接

  长连接：连接建立后持续使用（推荐）
  短连接：每次查询新建连接（开销大）

连接池（应用端）：
  维护若干长连接复用
  避免频繁的 TCP 握手 + MySQL 认证

Go 连接池配置：
```

```go
db, _ := sql.Open("mysql", dsn)

// 连接池参数
db.SetMaxOpenConns(100)    // 最大打开连接数
db.SetMaxIdleConns(20)     // 最大空闲连接数
db.SetConnMaxLifetime(     // 连接最大生存时间
    30 * time.Minute)
db.SetConnMaxIdleTime(     // 空闲连接最大存活
    10 * time.Minute)
```

```
MySQL 端参数：
  max_connections: 最大连接数（默认 151）
  wait_timeout: 空闲连接超时（默认 8h）
  interactive_timeout: 交互式连接超时

  查看当前连接：SHOW PROCESSLIST;
  杀死连接：KILL <id>;
```

---

## 5. MySQL 的字符集与排序规则？

**回答：**

```
推荐配置：
  字符集：utf8mb4（真正的 UTF-8，支持 emoji）
  排序规则：utf8mb4_general_ci 或 utf8mb4_0900_ai_ci

  utf8 vs utf8mb4：
  utf8 → 最多 3 字节（不支持 4 字节的 emoji）
  utf8mb4 → 最多 4 字节（完整 UTF-8）

  排序规则后缀：
  _ci → Case Insensitive（不区分大小写）
  _cs → Case Sensitive（区分大小写）
  _bin → 按二进制比较

  设置级别：
  Server → Database → Table → Column
  低级别继承高级别

建表推荐：
  CREATE TABLE users (
      id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

---

## 6. MySQL 数据类型选择？

**回答：**

```
整数类型：
  TINYINT(1字节) → SMALLINT(2) → MEDIUMINT(3)
  → INT(4) → BIGINT(8)
  建议：主键用 BIGINT UNSIGNED AUTO_INCREMENT

字符串：
  CHAR(N)：定长，N 字节（适合固定长度如 MD5）
  VARCHAR(N)：变长，存储 = 数据长度 + 1/2 字节长度前缀
  TEXT：大文本（尽量避免，不能有默认值）

时间：
  DATETIME：范围大，8 字节，不受时区影响
  TIMESTAMP：4 字节，存 UTC 自动转时区，范围到 2038
  推荐：DATETIME 或 BIGINT 存毫秒时间戳

小数：
  DECIMAL(M,D)：精确（金额必用）
  FLOAT/DOUBLE：近似，有精度问题

  ┌──────────────────────────────────────┐
  │ 金额 → DECIMAL(10,2)               │
  │ 主键 → BIGINT UNSIGNED             │
  │ 状态 → TINYINT                     │
  │ 时间 → DATETIME / BIGINT           │
  │ UUID → CHAR(36) 或 BINARY(16)      │
  │ IP → INT UNSIGNED (INET_ATON)      │
  │ JSON → JSON 类型 (5.7+)            │
  └──────────────────────────────────────┘
```

---

## 7. InnoDB 的 Buffer Pool？

**回答：**

```
Buffer Pool 是 InnoDB 的核心缓存：
  缓存数据页和索引页到内存
  减少磁盘 IO

  ┌──────────────────────────────────┐
  │         Buffer Pool              │
  │  ┌─────────────────────────┐    │
  │  │  数据页 (16KB/页)        │    │
  │  │  索引页                  │    │
  │  │  Insert Buffer          │    │
  │  │  自适应哈希索引          │    │
  │  │  Lock Info              │    │
  │  └─────────────────────────┘    │
  │                                  │
  │  LRU 链表管理（改进版）：         │
  │  ┌────────┬─────────────┐       │
  │  │ young  │    old       │       │
  │  │  (热)  │   (5/8冷)    │       │
  │  └────────┴─────────────┘       │
  │  新页先放 old 区域               │
  │  再次访问且超过阈值 → 移到 young │
  │  防止全表扫描污染 Buffer Pool    │
  └──────────────────────────────────┘

关键参数：
  innodb_buffer_pool_size: 推荐物理内存的 60-80%
  innodb_buffer_pool_instances: 多实例减少锁竞争
  
查看状态：SHOW ENGINE INNODB STATUS;
命中率：(1 - 磁盘读/总读) × 100%
目标：命中率 > 99%
```

---

## 8. InnoDB 的数据页结构？

**回答：**

```
InnoDB 页大小默认 16KB：

  ┌──────────────────────────┐
  │ File Header (38字节)      │ ← 页号/校验和/前后页指针
  ├──────────────────────────┤
  │ Page Header (56字节)      │ ← 记录数/页目录槽数
  ├──────────────────────────┤
  │ Infimum + Supremum       │ ← 虚拟最小/最大记录
  ├──────────────────────────┤
  │ User Records             │ ← 实际行数据（单向链表）
  │ (行数据，按主键序)         │
  ├──────────────────────────┤
  │ Free Space               │ ← 空闲空间
  ├──────────────────────────┤
  │ Page Directory           │ ← 槽数组（二分查找用）
  ├──────────────────────────┤
  │ File Trailer (8字节)      │ ← 校验和（保证完整性）
  └──────────────────────────┘

页内查找过程：
  1. Page Directory 二分查找定位槽
  2. 从槽对应的记录开始遍历链表
  3. 找到目标记录

行格式（COMPACT）：
  变长字段长度列表 | NULL 标志位
  记录头信息 (5字节)
  列1 | 列2 | ... | 列N
  隐藏列: row_id | trx_id | roll_pointer
```

---

## 9. MySQL 8.0 新特性？

**回答：**

```
MySQL 8.0 重要新特性：

  1. 窗口函数：
     ROW_NUMBER() / RANK() / DENSE_RANK()
     LAG() / LEAD() / SUM() OVER()

  2. CTE 公共表表达式：
     WITH cte AS (SELECT ...) SELECT ... FROM cte

  3. JSON 增强：
     JSON_TABLE() 将 JSON 转为关系表
     更多 JSON 函数

  4. 原子 DDL：
     DDL 支持原子操作（事务性）
     失败可回滚

  5. 删除查询缓存：
     Query Cache 彻底移除（高并发下反而是瓶颈）

  6. 默认字符集 utf8mb4：
     默认排序 utf8mb4_0900_ai_ci

  7. 不可见索引：
     ALTER TABLE t ALTER INDEX idx INVISIBLE;
     测试删除索引的影响

  8. 降序索引：
     CREATE INDEX idx ON t(a ASC, b DESC);

  9. 角色管理：
     CREATE ROLE / GRANT / SET ROLE

  10. innodb_dedicated_server：
      根据服务器配置自动调参
```

---

## 10. MySQL基础面试速答？

**回答：**

```
Q: MySQL 架构分几层？
A: 连接层/Server层(解析优化执行)/存储引擎层/文件系统层

Q: InnoDB 和 MyISAM 最大区别？
A: InnoDB 支持事务+行锁+MVCC+崩溃恢复
   MyISAM 不支持事务，只有表锁

Q: 为什么用 utf8mb4 而不是 utf8？
A: utf8 最多3字节不支持emoji
   utf8mb4 才是真正的 UTF-8

Q: Buffer Pool 是什么？
A: InnoDB 核心内存缓存
   缓存数据页/索引页，减少磁盘IO
   推荐设为物理内存的 60-80%

Q: 一页多大？
A: 默认 16KB

Q: 数据类型选金额用什么？
A: DECIMAL，不能用 FLOAT/DOUBLE

Q: 主键推荐用什么类型？
A: BIGINT UNSIGNED AUTO_INCREMENT
   自增有序，插入效率高

Q: 长连接和短连接？
A: 长连接复用（推荐，配合连接池）
   短连接每次新建（开销大）
```
