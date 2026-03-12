# MySQL 存储引擎与架构

---

## 1. MySQL 整体架构？

**回答：**

```
MySQL 架构分层:

  Client (客户端)
    │
  ┌─┴──────────────────────────────────────┐
  │ 连接层 (Connection Layer)               │
  │   连接管理, 认证, 线程池                 │
  ├────────────────────────────────────────┤
  │ SQL 层 (SQL Layer / Server Layer)       │
  │   ┌────────────────────────────┐       │
  │   │ 解析器 (Parser)            │       │
  │   │   → SQL 语法解析, 生成解析树 │       │
  │   ├────────────────────────────┤       │
  │   │ 优化器 (Optimizer)         │       │
  │   │   → 查询优化, 选择执行计划   │       │
  │   ├────────────────────────────┤       │
  │   │ 执行器 (Executor)          │       │
  │   │   → 调用存储引擎接口执行     │       │
  │   └────────────────────────────┘       │
  ├────────────────────────────────────────┤
  │ 存储引擎层 (Storage Engine Layer)       │
  │   InnoDB | MyISAM | Memory | ...       │
  ├────────────────────────────────────────┤
  │ 文件系统层                              │
  │   数据文件, 日志文件, 配置文件            │
  └────────────────────────────────────────┘

一条 SQL 的执行流程:
  1. 客户端发送 SQL
  2. 连接器: 验证身份, 建立连接
  3. (查询缓存: MySQL 8.0 已移除)
  4. 解析器: 词法分析 + 语法分析 → 解析树
  5. 优化器: 选择索引, 确定 JOIN 顺序, 生成执行计划
  6. 执行器: 检查权限, 调用存储引擎接口
  7. 存储引擎: 读写数据, 返回结果
```

---

## 2. InnoDB 存储引擎详解？

**回答：**

```
InnoDB: MySQL 默认存储引擎 (5.5+)

核心特性:
  ✓ ACID 事务支持
  ✓ 行级锁 (Row-Level Locking)
  ✓ MVCC (多版本并发控制)
  ✓ 聚簇索引 (Clustered Index)
  ✓ 外键约束
  ✓ 崩溃恢复 (Crash Recovery)
  ✓ Buffer Pool 缓存

InnoDB 内存结构:
  ┌─────────────────────────────────────────┐
  │ Buffer Pool (缓冲池)                     │
  │   数据页缓存 (最重要的内存区域)            │
  │   默认 128MB, 生产建议 物理内存的 60-80%  │
  │   ├── 数据页 (Data Pages)               │
  │   ├── 索引页 (Index Pages)              │
  │   ├── 自适应哈希索引 (AHI)               │
  │   └── Change Buffer                    │
  ├─────────────────────────────────────────┤
  │ Log Buffer (日志缓冲)                    │
  │   redo log 写入磁盘前的缓冲              │
  │   默认 16MB                             │
  └─────────────────────────────────────────┘

InnoDB 磁盘结构:
  ├── 系统表空间 (ibdata1)
  │     Undo Log, Change Buffer, 元数据
  ├── 独立表空间 (.ibd 文件)
  │     每个表一个文件, 数据 + 索引
  ├── Redo Log (ib_logfile0/1)
  │     WAL 日志, 崩溃恢复
  ├── Undo Log
  │     事务回滚, MVCC
  └── Doublewrite Buffer
       防止部分写入 (torn page)
```

---

## 3. InnoDB vs MyISAM？

**回答：**

```
  ┌──────────────┬──────────────────┬──────────────────┐
  │ 特性          │ InnoDB           │ MyISAM           │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 事务          │ ✅ 支持          │ ❌ 不支持         │
  │ 锁粒度        │ 行级锁           │ 表级锁           │
  │ 外键          │ ✅ 支持          │ ❌ 不支持         │
  │ MVCC         │ ✅ 支持          │ ❌ 不支持         │
  │ 崩溃恢复      │ ✅ redo log      │ ❌ 需手动修复     │
  │ 索引结构      │ 聚簇索引         │ 非聚簇索引        │
  │ 全文索引      │ ✅ (5.6+)       │ ✅               │
  │ 存储文件      │ .ibd             │ .MYD + .MYI      │
  │ COUNT(*)     │ 需扫全表         │ 有行计数器 (极快)  │
  │ 适用场景      │ OLTP, 事务       │ 读多 (已淘汰)     │
  └──────────────┴──────────────────┴──────────────────┘

聚簇索引 vs 非聚簇索引:
  InnoDB 聚簇索引:
    主键索引的叶子节点存储完整数据行
    一个表只有一个聚簇索引
    二级索引叶子存主键值 → 需要回表

  MyISAM 非聚簇索引:
    索引和数据分开存储
    索引叶子节点存数据的物理地址
    不需要回表

回表: 二级索引查到主键值 → 再通过主键索引查到完整数据行

InnoDB 选择主键:
  ✓ 使用自增整数 (AUTO_INCREMENT)
  ✓ 顺序插入, 避免页分裂
  ✗ 避免用 UUID (随机插入, 性能差)
  ✗ 避免用字符串 (比较慢, 占空间大)
```

---

## 4. InnoDB Buffer Pool？

**回答：**

```
Buffer Pool: InnoDB 最重要的缓存组件

  作用:
    缓存数据页和索引页在内存中
    读: 先查 Buffer Pool, 命中则直接返回 (避免磁盘 IO)
    写: 先写 Buffer Pool (脏页), 后台异步刷盘

  LRU 淘汰算法 (改进版):
    传统 LRU: 最近最少使用的页被淘汰
    
    InnoDB 改进: 将 LRU 分为 young 和 old 两个区域
    ┌─────────────────────────────────────┐
    │  Young 区 (5/8)   │  Old 区 (3/8)  │
    │  热数据            │  新读入的数据   │
    └─────────────────────────────────────┘
    
    新页先进 old 区头部
    在 old 区停留 > 1s 且再次被访问 → 移到 young 区
    → 防止全表扫描冲刷热数据!

  关键参数:
    innodb_buffer_pool_size     = 物理内存 60-80%
    innodb_buffer_pool_instances = 8 (多实例减少锁竞争)
```

```sql
-- 查看 Buffer Pool 状态
SHOW ENGINE INNODB STATUS\G

-- 查看命中率
SHOW GLOBAL STATUS LIKE 'Innodb_buffer_pool%';

-- 命中率计算
-- hit_rate = 1 - (Innodb_buffer_pool_reads / Innodb_buffer_pool_read_requests)
-- 生产环境应 > 99%
```

---

## 5. InnoDB 日志系统？

**回答：**

```
三种日志:

1. Redo Log (重做日志):
   作用: 崩溃恢复 (保证持久性 D)
   机制: WAL (Write-Ahead Logging)
         先写日志, 再写数据
   格式: 物理日志 (记录页面的物理修改)
   文件: ib_logfile0, ib_logfile1 (循环使用)

   写入流程:
     修改数据 → 写 redo log buffer → flush 到磁盘
     innodb_flush_log_at_trx_commit:
       = 0: 每秒写入并刷盘 (性能最好, 可能丢 1s 数据)
       = 1: 每次提交都刷盘 (最安全, 默认)
       = 2: 每次提交写 OS cache, 每秒刷盘 (折中)

2. Undo Log (回滚日志):
   作用: 事务回滚 + MVCC (保证原子性 A)
   机制: 记录数据修改前的旧版本
   MVCC: 通过 undo log 链构建数据的历史版本
   清理: purge 线程异步清理不再需要的 undo log

3. Binlog (二进制日志):
   作用: 主从复制 + 数据恢复
   层级: Server 层 (不是 InnoDB 层)
   格式:
     STATEMENT: 记录 SQL 语句 (可能不一致)
     ROW:       记录行数据变更 (安全, 日志大)
     MIXED:     混合模式

Redo Log vs Binlog:
  ┌──────────┬─────────────────┬─────────────────┐
  │ 维度      │ Redo Log        │ Binlog          │
  ├──────────┼─────────────────┼─────────────────┤
  │ 层级      │ InnoDB 引擎     │ Server 层       │
  │ 内容      │ 物理日志 (页修改)│ 逻辑日志 (SQL)  │
  │ 写入方式  │ 循环写          │ 追加写           │
  │ 用途      │ 崩溃恢复        │ 复制 + 备份恢复  │
  └──────────┴─────────────────┴─────────────────┘
```

---

## 6. MySQL 连接管理？

**回答：**

```
连接方式:
  短连接: 每次 SQL 都建立/关闭连接 → 开销大
  长连接: 连接复用, 减少握手开销 → 推荐

连接池:
  应用侧: HikariCP (Java), SQLAlchemy Pool (Python)
  代理侧: ProxySQL, MySQL Router

  HikariCP 参数:
    minimumIdle:     10    # 最小空闲连接
    maximumPoolSize: 50    # 最大连接数
    connectionTimeout: 30000  # 连接超时 30s
    idleTimeout:     600000   # 空闲超时 10min

MySQL 连接数:
  max_connections: 默认 151, 生产可设 500-2000
  
  连接数计算:
    太多: 内存不足 (每个连接约 10MB)
    太少: 并发受限
    建议: CPU核数 × 2 + 有效磁盘数 (OLTP)

  查看连接:
    SHOW PROCESSLIST;               -- 当前连接
    SHOW GLOBAL STATUS LIKE 'Threads%';
    
    Threads_connected:  当前连接数
    Threads_running:    活跃连接数
    Threads_created:    历史创建连接数
    Max_used_connections: 历史最大连接数
```

---

## 7. MySQL 字符集和排序规则？

**回答：**

```
字符集 (Character Set):
  utf8:    MySQL 的 utf8 只支持 3 字节 (不支持 emoji!)
  utf8mb4: 真正的 UTF-8, 最多 4 字节 (支持 emoji)
  → 永远使用 utf8mb4!

排序规则 (Collation):
  utf8mb4_general_ci:   不区分大小写, 简单比较 (快)
  utf8mb4_unicode_ci:   不区分大小写, Unicode 标准 (准确)
  utf8mb4_0900_ai_ci:   MySQL 8.0 默认, 基于 Unicode 9.0
  utf8mb4_bin:          二进制比较, 区分大小写

  ci = case insensitive
  cs = case sensitive
  bin = binary
```

```sql
-- 设置字符集
CREATE DATABASE mydb
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE TABLE users (
  name VARCHAR(100)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 查看字符集
SHOW VARIABLES LIKE 'character%';
SHOW VARIABLES LIKE 'collation%';
```

---

## 8. MySQL 数据类型选择？

**回答：**

```
整数类型:
  TINYINT:   1 字节 (-128 ~ 127)
  SMALLINT:  2 字节
  MEDIUMINT: 3 字节
  INT:       4 字节 (-21 亿 ~ 21 亿)
  BIGINT:    8 字节

  选择: 能用小的就不用大的, 节省空间和索引大小
  主键: 用 BIGINT UNSIGNED AUTO_INCREMENT

字符串类型:
  CHAR(n):    定长, n 个字符, 不足补空格
  VARCHAR(n): 变长, 最大 n 个字符
  TEXT:       长文本, 不能设默认值, 性能差
  
  选择:
    固定长度 (MD5, UUID) → CHAR
    变长字符串 (名字, 地址) → VARCHAR
    避免 TEXT, 用 VARCHAR(10000) 替代

时间类型:
  DATE:      日期 (2024-01-01)
  DATETIME:  日期时间, 8 字节, 不受时区影响
  TIMESTAMP: 时间戳, 4 字节, 自动时区转换, 范围到 2038 年
  
  选择:
    需要时区自动转换 → TIMESTAMP
    范围超过 2038 → DATETIME
    一般推荐 DATETIME

DECIMAL vs FLOAT:
  FLOAT/DOUBLE: 浮点数, 有精度损失
  DECIMAL:      精确数值
  → 金额等精确计算必须用 DECIMAL!
```

---

## 9. MySQL 配置优化？

**回答：**

```
核心配置 (my.cnf / my.ini):

# InnoDB
innodb_buffer_pool_size      = 物理内存 60-80%  # 最重要!
innodb_buffer_pool_instances = 8               # 多实例减少锁
innodb_log_file_size         = 1G              # redo log 大小
innodb_flush_log_at_trx_commit = 1             # 安全: 1, 性能: 2
innodb_io_capacity           = 2000            # SSD 可调高
innodb_read_io_threads       = 4
innodb_write_io_threads      = 4

# 连接
max_connections              = 500
thread_cache_size            = 64
wait_timeout                 = 600             # 空闲连接超时

# 查询
tmp_table_size               = 64M
max_heap_table_size          = 64M
sort_buffer_size             = 2M
join_buffer_size             = 2M

# 日志
slow_query_log               = ON
long_query_time              = 1               # 慢查询阈值 1s
log_queries_not_using_indexes = ON

# Binlog
binlog_format                = ROW
sync_binlog                  = 1               # 每次提交刷盘
expire_logs_days             = 7

双一配置 (最安全):
  innodb_flush_log_at_trx_commit = 1
  sync_binlog = 1
  → 每次事务提交都落盘 redo log + binlog
  → 性能有损, 但不丢数据
```

---

## 10. MySQL 版本特性？

**回答：**

```
MySQL 版本演进:
  ┌──────────┬──────────────────────────────────────────┐
  │ 版本      │ 关键特性                                  │
  ├──────────┼──────────────────────────────────────────┤
  │ 5.6      │ InnoDB 全文索引, GTID 复制, Online DDL    │
  │ 5.7      │ JSON 类型, 虚拟列, sys schema, 组复制     │
  │ 8.0      │ 窗口函数, CTE, 原子 DDL, 角色,           │
  │          │ 不可见索引, 降序索引, 移除查询缓存          │
  │ 8.4 LTS  │ 长期支持版本                               │
  └──────────┴──────────────────────────────────────────┘

MySQL 8.0 重要新特性:
  窗口函数:     ROW_NUMBER, RANK, DENSE_RANK 等
  CTE:         WITH 递归查询
  原子 DDL:    DDL 操作原子性 (不会半完成)
  角色 (Role): CREATE ROLE, GRANT role TO user
  JSON 增强:   JSON_TABLE, ->> 操作符
  不可见索引:   ALTER TABLE t ALTER INDEX idx INVISIBLE
               测试删索引影响而不真删
  降序索引:     CREATE INDEX idx ON t(a ASC, b DESC)
  直方图:       ANALYZE TABLE t UPDATE HISTOGRAM ON col
               帮助优化器更好估算

升级建议:
  新项目: 直接用 MySQL 8.0+
  旧项目: 5.7 → 8.0 (注意兼容性测试)
  建议跳过 5.6 (已 EOL)
```
