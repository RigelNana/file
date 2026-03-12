# Redis持久化

---

## 1. RDB 快照详解？

**回答：**

```
RDB：某个时间点的全量内存快照
  生成二进制文件 dump.rdb

触发方式：
  手动：SAVE（阻塞）/ BGSAVE（后台）
  自动：配置 save 规则
    save 900 1      # 900秒内1次修改
    save 300 10     # 300秒内10次修改
    save 60 10000   # 60秒内10000次修改

BGSAVE 流程：
  1. 主进程 fork() 子进程
  2. 子进程共享父进程内存页（COW）
  3. 子进程将内存数据写入临时 RDB 文件
  4. 写完后替换旧 RDB 文件
  
  ┌──────────┐  fork()  ┌──────────┐
  │ 主进程    │────────→│ 子进程    │
  │ 继续处理  │         │ 写RDB文件 │
  │ 客户端命令│         │          │
  │          │  COW    │          │
  │ 修改的页 ←┤────────→│ 原始页   │
  └──────────┘         └──────────┘

  Copy-On-Write (COW)：
  fork 后父子共享物理内存页
  父进程修改时 → 操作系统复制该页
  → 子进程仍读到 fork 时刻的数据

优缺点：
  ✅ 文件紧凑，恢复速度快
  ✅ 适合备份和灾备
  ❌ 可能丢失最后几分钟数据
  ❌ fork 时间与内存大小相关（大内存可能卡顿）
```

---

## 2. AOF 日志详解？

**回答：**

```
AOF（Append Only File）：
  记录每条写命令，追加写入文件

开启：appendonly yes

写入流程：
  命令执行 → 写入 AOF 缓冲区 → 刷盘

刷盘策略（appendfsync）：
  ┌──────────────┬──────────┬──────────┐
  │ 策略          │ 安全性   │ 性能      │
  ├──────────────┼──────────┼──────────┤
  │ always       │ 最高     │ 最慢      │
  │ everysec ★  │ 最多丢1秒│ 折中      │
  │ no           │ 最低     │ 最快      │
  └──────────────┴──────────┴──────────┘
  推荐：everysec

AOF 重写（BGREWRITEAOF）：
  AOF 文件越来越大 → 定期重写压缩
  
  重写前 AOF：
  SET name "张三"
  SET name "李四"
  SET name "王五"
  INCR counter
  INCR counter
  INCR counter
  
  重写后 AOF：
  SET name "王五"
  SET counter 3
  
  自动触发条件：
  auto-aof-rewrite-percentage 100  # 增长100%
  auto-aof-rewrite-min-size 64mb   # 最小64MB

  重写流程：
  1. fork 子进程
  2. 子进程根据内存数据生成新 AOF
  3. 主进程继续处理命令，新命令写入 AOF 重写缓冲区
  4. 子进程完成 → 重写缓冲区追加到新 AOF
  5. 替换旧 AOF 文件
```

---

## 3. 混合持久化（4.0+）？

**回答：**

```
混合持久化：AOF 重写时使用 RDB + AOF 混合格式

开启：aof-use-rdb-preamble yes（5.0+ 默认开启）

  重写后的 AOF 文件：
  ┌──────────────────────────┐
  │  RDB 格式（全量快照）      │ ← 重写时的数据
  ├──────────────────────────┤
  │  AOF 格式（增量命令）      │ ← 重写期间的新命令
  └──────────────────────────┘

加载顺序：
  1. 先加载 RDB 部分（快）
  2. 再重放 AOF 增量部分

优势：
  兼顾 RDB 快速恢复 + AOF 数据安全
  重启速度大幅提升
  数据丢失最小化

推荐配置：
  appendonly yes
  appendfsync everysec
  aof-use-rdb-preamble yes
  
  同时开启 RDB（作为额外备份）：
  save 900 1
  save 300 10
```

---

## 4. 持久化对性能的影响？

**回答：**

```
fork 的影响：
  BGSAVE / BGREWRITEAOF 都需要 fork
  fork 时间 ∝ 实例内存大小
  内存 10GB → fork 约 20ms
  内存 20GB → fork 约 40ms
  
  fork 期间主进程阻塞！
  → 大实例要注意

COW 的内存开销：
  fork 后主进程写入 → 触发页面复制
  写操作越多 → 额外内存越大
  极端情况：2倍内存（所有页都修改了）
  → 预留足够内存

AOF 刷盘影响：
  always → 每条命令 fsync（显著降低吞吐）
  everysec → 后台线程每秒 fsync（影响小）
  no → 无影响（但不安全）

优化建议：
  1. Redis 实例不要太大（单实例 < 10GB）
  2. 关闭 Transparent Hugepage (THP)
     echo never > /sys/kernel/mm/transparent_hugepage/enabled
  3. 避免在高峰期进行 BGSAVE
  4. 使用 SSD 减少 IO 延迟
  5. 主从架构：主库关 RDB，从库做持久化
```

---

## 5. 数据恢复流程？

**回答：**

```
恢复优先级：
  1. 如果有 AOF 文件 → 优先用 AOF 恢复（数据更完整）
  2. 如果只有 RDB → 用 RDB 恢复
  3. 两者都有 → 用 AOF（appendonly yes 时）

恢复流程：
  启动 Redis → 检测 appendonly 配置
  → YES → 加载 AOF 文件
  → NO  → 加载 RDB 文件

AOF 文件损坏修复：
  redis-check-aof --fix appendonly.aof

RDB 文件检查：
  redis-check-rdb dump.rdb

备份策略（生产环境）：
  1. 开启 AOF + 混合持久化
  2. 定时 BGSAVE 生成 RDB（额外备份）
  3. RDB 文件定期备份到远程存储（S3 / NFS）
  4. 异地备份（灾难恢复）
  5. 定期验证备份可恢复

  # crontab 定时备份
  0 */1 * * * cp /var/lib/redis/dump.rdb \
    /backup/redis/dump_$(date +%Y%m%d%H).rdb
```

---

## 6. RDB 和 AOF 对比总结？

**回答：**

```
  ┌──────────────┬──────────────┬──────────────┐
  │ 对比维度      │ RDB          │ AOF          │
  ├──────────────┼──────────────┼──────────────┤
  │ 持久化方式    │ 全量快照      │ 增量命令日志 │
  │ 文件大小      │ 紧凑（压缩）  │ 较大         │
  │ 恢复速度      │ 快           │ 慢（重放命令）│
  │ 数据安全      │ 可能丢几分钟  │ 最多丢1秒    │
  │ IO 影响       │ fork+写文件  │ 追加写（小）  │
  │ 适合场景      │ 备份/灾恢    │ 数据安全要求高│
  │ 文件格式      │ 二进制       │ 文本（可读）  │
  └──────────────┴──────────────┴──────────────┘

最佳实践：
  同时开启 RDB + AOF + 混合持久化
  AOF everysec → 最多丢 1 秒
  RDB 定时备份 → 灾难恢复
  
  主从架构中：
  主库：只开 AOF（减少 fork 影响）
  从库：开 RDB + AOF（备份 + 安全）
```

---

## 7. Redis 7.0 的 Multi Part AOF？

**回答：**

```
Redis 7.0 改进 AOF 机制：
  将单个 AOF 文件拆分为多个部分

  目录结构：
  appendonlydir/
  ├── base.rdb           # 基础 RDB（重写产生）
  ├── incr.1.aof         # 增量 AOF 1
  ├── incr.2.aof         # 增量 AOF 2（当前写入）
  └── manifest           # 清单文件

  优势：
  1. 重写更安全（不需要替换大文件）
  2. 支持增量 fsync
  3. 管理更灵活
  4. 减少磁盘空间使用波动

  兼容性：
  配置项不变，底层自动管理
  appendonly yes
  appenddirname "appendonlydir"
```

---

## 8. fork 优化与大实例策略？

**回答：**

```
fork 优化：
  1. 控制实例大小（单实例 ≤ 5-10GB）
  2. 关闭 THP（Transparent Huge Pages）
  3. 使用 jemalloc 内存分配器
  4. 部署在物理机或专用虚拟机

大实例处理：
  问题：25GB 实例 fork 可能耗时 50-100ms
  
  方案：
  1. 拆分为多个小实例
  2. 主库不做持久化，从库做
  3. 使用 Redis Cluster 分片
  4. 合理设置 BGSAVE 频率

监控 fork 耗时：
  INFO stats
  → latest_fork_usec: fork 最近耗时(微秒)
  
  CONFIG SET latency-monitor-threshold 100
  LATENCY HISTORY fork

内存碎片：
  INFO memory
  → mem_fragmentation_ratio: 碎片率
  理想值：1.0-1.5
  > 1.5：碎片过多
  
  解决：
  CONFIG SET activedefrag yes  # 自动碎片整理(4.0+)
```

---

## 9. 持久化在集群中的策略？

**回答：**

```
主从架构持久化策略：
  ┌──────────┐         ┌──────────┐
  │  Master  │────────→│  Slave   │
  │ AOF only │  复制    │ RDB+AOF  │
  │ (或关闭)  │         │ (做备份) │
  └──────────┘         └──────────┘
  
  主库：关闭 RDB / 只开 AOF
  → 减少 fork 对主库的影响
  
  从库：开启 RDB + AOF
  → 持久化和备份都由从库承担

Sentinel 场景：
  主库如果关闭持久化 → 主库重启数据为空
  → 复制后从库也清空！
  → 至少开启 AOF 或设置从库自动提升

Redis Cluster：
  每个主节点建议开启 AOF
  数据分片后单节点数据量小
  fork 影响可控
```

---

## 10. Redis持久化面试速答？

**回答：**

```
Q: RDB 和 AOF 区别？
A: RDB 全量快照，文件小恢复快但可能丢数据
   AOF 增量命令，数据安全但文件大恢复慢

Q: BGSAVE 怎么工作？
A: fork 子进程 + COW 写时复制
   子进程写 RDB，主进程不阻塞

Q: AOF appendfsync 推荐什么？
A: everysec（每秒刷盘）
   最多丢 1 秒数据

Q: 混合持久化是什么？
A: AOF 重写时: 前半 RDB + 后半 AOF
   兼顾恢复速度和数据安全

Q: 启动时用哪个文件恢复？
A: 开启 AOF → 优先用 AOF
   否则用 RDB

Q: fork 有什么影响？
A: fork 期间主进程阻塞
   大实例(>10GB)fork时间长
   COW 可能消耗额外内存

Q: 生产环境怎么配？
A: AOF(everysec) + 混合持久化
   定时 RDB 备份到远程
   主库轻量化/从库做持久化

Q: AOF 文件太大怎么办？
A: AOF 重写(BGREWRITEAOF)
   自动触发条件配置
```
