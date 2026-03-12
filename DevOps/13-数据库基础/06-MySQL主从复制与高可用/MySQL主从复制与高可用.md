# MySQL 主从复制与高可用

---

## 1. MySQL 主从复制原理？

**回答：**

```
主从复制架构:

  Master (主库)                         Slave (从库)
  ┌──────────────┐                    ┌──────────────┐
  │ 1. 写入数据   │                    │ 4. IO Thread │
  │      ↓        │                    │      ↓       │
  │ 2. 写 Binlog  │ ─── 网络传输 ──→   │ 5. Relay Log │
  │      ↓        │                    │      ↓       │
  │ 3. Dump Thread│                    │ 6. SQL Thread│
  └──────────────┘                    │      ↓       │
                                      │ 7. 应用到数据 │
                                      └──────────────┘

三个关键线程:
  主库: Binlog Dump Thread
    读取主库 binlog, 发送给从库

  从库: IO Thread
    接收主库 binlog, 写入本地 Relay Log

  从库: SQL Thread
    读取 Relay Log, 回放 SQL 到从库数据

Binlog 格式:
  STATEMENT: 记录 SQL 语句
    优: 日志量小
    缺: 某些函数 (NOW(), UUID()) 主从不一致
  
  ROW: 记录行变更 (修改前后的数据)
    优: 最安全, 不会不一致
    缺: 日志量大 (大批量UPDATE)
  
  MIXED: 混合模式 (默认 STATEMENT, 不安全时切 ROW)

  生产推荐: ROW 格式
```

```sql
-- 主库配置 (my.cnf)
[mysqld]
server-id = 1
log-bin = mysql-bin
binlog_format = ROW
sync_binlog = 1
gtid_mode = ON
enforce-gtid-consistency = ON

-- 从库配置
[mysqld]
server-id = 2
relay-log = relay-bin
read_only = ON
super_read_only = ON
gtid_mode = ON
enforce-gtid-consistency = ON

-- 主库创建复制用户
CREATE USER 'repl'@'%' IDENTIFIED BY 'password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- 从库配置复制 (GTID)
CHANGE MASTER TO
  MASTER_HOST = '10.0.0.1',
  MASTER_USER = 'repl',
  MASTER_PASSWORD = 'password',
  MASTER_AUTO_POSITION = 1;

START SLAVE;
SHOW SLAVE STATUS\G
```

---

## 2. 复制模式对比？

**回答：**

```
  ┌──────────────────┬──────────────────────────────────────┐
  │ 复制模式          │ 说明                                  │
  ├──────────────────┼──────────────────────────────────────┤
  │ 异步复制          │ 默认模式                              │
  │ (Asynchronous)   │ 主库写完 binlog 即返回, 不等从库       │
  │                  │ 优: 性能最好                          │
  │                  │ 缺: 主库宕机可能丢数据                 │
  ├──────────────────┼──────────────────────────────────────┤
  │ 半同步复制        │ 主库等至少 1 个从库确认收到 binlog      │
  │ (Semi-sync)      │ rpl_semi_sync_master_wait_point      │
  │                  │ = AFTER_SYNC (无损, MySQL 5.7+)       │
  │                  │ 超时后退化为异步                       │
  │                  │ 折中方案, 推荐生产使用                  │
  ├──────────────────┼──────────────────────────────────────┤
  │ 组复制 (MGR)      │ Group Replication                    │
  │                  │ 基于 Paxos 协议, 多数派确认            │
  │                  │ 单主/多主模式                         │
  │                  │ MySQL 官方高可用方案 (MySQL 8.0)       │
  └──────────────────┴──────────────────────────────────────┘

GTID (全局事务 ID):
  格式: server_uuid:transaction_id
  例: 3E11FA47-71CA-11E1-9E33-C80AA9429562:1-100

  优势:
    不需要指定 binlog 文件和位点
    故障转移时从库自动找到正确位置
    判断事务是否已复制

  CHANGE MASTER TO MASTER_AUTO_POSITION = 1;
```

---

## 3. 主从延迟问题？

**回答：**

```
主从延迟: 从库跟不上主库的速度

查看延迟:
  SHOW SLAVE STATUS\G
  → Seconds_Behind_Master: 延迟秒数 (不完全准确)

  更准确: pt-heartbeat (Percona Toolkit)
  → 主库定期写入心跳时间, 从库读取计算差值

延迟原因:
  1. 主库大事务 (大批量 UPDATE/DELETE)
  2. 从库 SQL Thread 是单线程回放 (5.6 之前)
  3. 从库硬件不如主库
  4. 网络延迟
  5. 从库负载高 (大量读查询)
  6. DDL 操作 (ALTER TABLE 大表)

解决方案:
  1. 并行复制 (Parallel Replication):
     MySQL 5.6: 库级并行 (slave_parallel_type = DATABASE)
     MySQL 5.7: 组提交并行 (LOGICAL_CLOCK) ← 推荐
     MySQL 8.0: writeset 并行 (更细粒度)
     
     slave_parallel_workers = 16    # 并行线程数
     slave_parallel_type = LOGICAL_CLOCK

  2. 避免大事务
     大 DELETE → 分批 LIMIT 1000

  3. 从库优化
     硬件规格不低于主库
     read_only ON (减少写入)

  4. 架构优化
     关键读走主库 (写后读一致性)
     非关键读走从库 (允许短暂延迟)
```

---

## 4. 读写分离方案？

**回答：**

```
读写分离架构:

  客户端
    │
    ├── 写请求 ──→ Master (主库)
    │                  │
    │             Binlog 复制
    │                  │
    └── 读请求 ──→ Slave 1 ──→ 负载均衡
                   Slave 2
                   Slave 3

实现方案:
  ┌──────────────┬──────────────────────────────────┐
  │ 方案          │ 说明                             │
  ├──────────────┼──────────────────────────────────┤
  │ 代理层        │ ProxySQL, MaxScale, MySQL Router │
  │              │ 应用无感知, 中间件自动路由          │
  ├──────────────┼──────────────────────────────────┤
  │ 应用层        │ 多数据源 + 注解路由               │
  │              │ Spring + @Master/@Slave           │
  │              │ 灵活但侵入业务                    │
  ├──────────────┼──────────────────────────────────┤
  │ 云服务        │ RDS Proxy, Aurora Reader Endpoint│
  │              │ 免运维, 自动管理                   │
  └──────────────┴──────────────────────────────────┘

ProxySQL 配置示例:
  写规则: ^SELECT.*FOR UPDATE → Writer (主库)
  写规则: ^(INSERT|UPDATE|DELETE) → Writer
  读规则: ^SELECT → Reader (从库)

读写分离注意事项:
  1. 写后读一致性: 刚写的数据立即读 → 走主库
  2. 事务内读写: 事务中的 SELECT 也走主库
  3. 强一致性要求: 走主库
  4. 监控主从延迟: > 阈值 → 读切回主库
```

---

## 5. MySQL 高可用方案？

**回答：**

```
  ┌──────────────────┬──────────┬──────────────────────────┐
  │ 方案              │ 切换时间  │ 说明                     │
  ├──────────────────┼──────────┼──────────────────────────┤
  │ MHA               │ 10-30s  │ 传统方案, 自动故障转移    │
  │ InnoDB Cluster     │ < 30s   │ MySQL 官方, MGR + Router │
  │ Orchestrator       │ < 30s   │ GitHub 开源, 可视化       │
  │ Galera Cluster     │ 近实时  │ 多主同步, PXC            │
  │ RDS Multi-AZ       │ 60-120s │ AWS 托管, 自动故障转移    │
  │ Aurora             │ < 30s   │ AWS, 计算存储分离         │
  └──────────────────┴──────────┴──────────────────────────┘

MHA (Master HA):
  Manager → 监控 Master
  Master 故障 → 选择最新的 Slave → 提升为新 Master
  其他 Slave → 指向新 Master
  VIP 漂移到新 Master

InnoDB Cluster (MySQL 8.0 官方):
  组件:
    MySQL Group Replication (MGR): 底层复制
    MySQL Shell: 管理工具
    MySQL Router: 中间件代理

  架构:
    Router (读写分流) → MGR Cluster (3/5 节点)
    Primary: 读写
    Secondary: 只读
    Primary 挂 → 自动选主 (Paxos)

Orchestrator (GitHub):
  Web UI 可视化拓扑
  自动故障检测和转移
  支持多数据中心
  可配置故障转移策略
```

---

## 6. 数据库代理中间件？

**回答：**

```
ProxySQL:
  功能:
    读写分离 (自动路由)
    连接池 (复用连接到后端 MySQL)
    查询缓存
    查询规则 (路由/重写/拦截)
    后端健康检查
    故障自动切换

  架构:
    App → ProxySQL (6033) → MySQL Master/Slave
    Admin 接口 (6032): 动态配置, 无需重启

  核心表:
    mysql_servers:         后端 MySQL 列表
    mysql_users:           用户映射
    mysql_query_rules:     查询路由规则

MaxScale (MariaDB):
  类似 ProxySQL
  支持更多路由模式 (ReadWriteSplit, SchemaRouter)
  MariaDB 生态

MySQL Router:
  MySQL 官方轻量代理
  配合 InnoDB Cluster 使用
  自动感知集群拓扑变化

选型:
  通用 MySQL HA → ProxySQL (最流行)
  MySQL 8.0 + 官方方案 → MySQL Router + InnoDB Cluster
  MariaDB → MaxScale
  云环境 → RDS Proxy
```

---

## 7. 备份与恢复策略？

**回答：**

```
备份方式:
  ┌────────────────┬────────────────────────────────────┐
  │ 方式            │ 说明                               │
  ├────────────────┼────────────────────────────────────┤
  │ mysqldump      │ 逻辑备份, SQL 文件, 小库适用        │
  │                │ --single-transaction (InnoDB 一致性)│
  ├────────────────┼────────────────────────────────────┤
  │ xtrabackup     │ 物理备份, 热备, 大库推荐            │
  │ (Percona)      │ 支持增量备份, 恢复快                │
  ├────────────────┼────────────────────────────────────┤
  │ mysqlpump      │ mysqldump 增强版, 并行导出          │
  ├────────────────┼────────────────────────────────────┤
  │ MySQL Shell    │ MySQL 8.0, 多线程 dump/load        │
  │ dump/load      │                                    │
  └────────────────┴────────────────────────────────────┘
```

```bash
# mysqldump 全量备份
mysqldump -u root -p \
  --single-transaction \   # InnoDB 一致性快照
  --routines \             # 存储过程
  --triggers \             # 触发器
  --events \               # 事件
  --all-databases > full_backup.sql

# 恢复
mysql -u root -p < full_backup.sql

# xtrabackup 全量备份
xtrabackup --backup --target-dir=/backup/full \
  --user=root --password=xxx

# xtrabackup 增量备份
xtrabackup --backup --target-dir=/backup/inc1 \
  --incremental-basedir=/backup/full

# xtrabackup 恢复
xtrabackup --prepare --target-dir=/backup/full
xtrabackup --prepare --target-dir=/backup/full \
  --incremental-dir=/backup/inc1
xtrabackup --copy-back --target-dir=/backup/full
```

```
备份策略:
  每周日: 全量备份 (xtrabackup)
  每天:   增量备份 (xtrabackup incremental)
  实时:   binlog 持续归档

  恢复: 全量 + 增量 + binlog 回放到指定时间点 (PITR)

  Point-in-Time Recovery:
    1. 恢复全量 + 增量
    2. mysqlbinlog --stop-datetime='2024-01-01 12:00:00' binlog.000123 | mysql

备份检查清单:
  □ 定期恢复演练 (至少每季度一次!)
  □ 备份异地存储 (不同 AZ/Region)
  □ 监控备份任务状态
  □ 验证备份文件完整性
  □ 记录 RPO/RTO 指标
```

---

## 8. 数据库迁移方案？

**回答：**

```
迁移场景:
  同构: MySQL → MySQL (版本升级/机房迁移)
  异构: MySQL → PostgreSQL / Oracle → MySQL

同构迁移方案:
  1. 主从复制迁移 (推荐, 零停机)
     旧主库 → 新从库 (建立复制)
     追上后 → 切换应用连接到新库
     → 停机时间: 秒级

  2. mysqldump / xtrabackup
     适合小库, 有停机窗口
     大库用 xtrabackup 更快

  3. MySQL Shell dumping
     MySQL 8.0, 多线程, 比 mysqldump 快 10x+

异构迁移:
  AWS DMS (Database Migration Service)
  AWS SCT (Schema Conversion Tool)
  pgloader (MySQL → PostgreSQL)

迁移检查清单:
  □ 字符集一致 (utf8mb4)
  □ Schema 兼容性
  □ 存储过程/触发器/视图
  □ 数据量和迁移耗时评估
  □ 应用连接字符串切换
  □ 灰度切流 + 回滚方案
  □ 迁移后数据校验 (pt-table-checksum)
```

---

## 9. MySQL 监控指标？

**回答：**

```
关键监控指标:
  ┌──────────────────┬──────────────────────────────────┐
  │ 类别              │ 指标                             │
  ├──────────────────┼──────────────────────────────────┤
  │ 连接              │ Threads_connected (当前连接数)    │
  │                  │ Threads_running (活跃连接数)      │
  │                  │ Aborted_connects (失败连接数)     │
  ├──────────────────┼──────────────────────────────────┤
  │ 查询              │ Questions (查询总数/s)           │
  │                  │ Slow_queries (慢查询数)           │
  │                  │ Com_select / Com_insert / ...    │
  ├──────────────────┼──────────────────────────────────┤
  │ InnoDB           │ Buffer Pool 命中率 (>99%)        │
  │                  │ Row Lock Waits (行锁等待)         │
  │                  │ Deadlocks (死锁次数)              │
  ├──────────────────┼──────────────────────────────────┤
  │ 复制              │ Seconds_Behind_Master (延迟)     │
  │                  │ Slave_IO/SQL_Running (线程状态)   │
  ├──────────────────┼──────────────────────────────────┤
  │ 系统              │ CPU, 内存, 磁盘 IO, 网络         │
  │                  │ 磁盘空间 (表空间 + binlog)        │
  └──────────────────┴──────────────────────────────────┘

告警阈值:
  Threads_running > 50        → 活跃连接过多
  Slow_queries > 100/min      → 慢查询过多
  Seconds_Behind_Master > 60  → 主从延迟严重
  Buffer Pool hit < 99%       → 内存不足
  Deadlocks > 0               → 死锁告警
  磁盘使用 > 85%               → 空间告警

监控工具:
  PMM (Percona Monitoring and Management): 最推荐
  Grafana + Prometheus + mysqld_exporter
  Datadog / New Relic
  Zabbix (传统)
```

---

## 10. 主从与高可用面试速答？

**回答：**

```
Q: 主从复制原理三句话概括?
A: 主库写 binlog → 从库 IO Thread 接收写 relay log
   → 从库 SQL Thread 回放 relay log 到数据库

Q: binlog 格式推荐哪个?
A: ROW 格式, 最安全, 记录行级变更

Q: 主从延迟怎么办?
A: 1. 开启并行复制 (LOGICAL_CLOCK)
   2. 避免大事务
   3. 关键读走主库

Q: GTID 是什么?
A: 全局事务 ID (server_uuid:trx_id)
   自动定位复制位点, 简化故障转移

Q: 推荐哪种高可用方案?
A: MySQL 8.0: InnoDB Cluster (MGR + Router)
   传统: MHA / Orchestrator + ProxySQL
   云: RDS Multi-AZ / Aurora

Q: 全量备份用什么工具?
A: 小库: mysqldump --single-transaction
   大库: xtrabackup (物理热备, 支持增量)

Q: 如何做零停机迁移?
A: 建立主从复制 → 追上后切换连接
   灰度切流 + pt-table-checksum 校验

Q: 读写分离怎么保证一致性?
A: 写后立即读 → 走主库
   事务内 → 走主库
   延迟大 → 读切回主库
```
