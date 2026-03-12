# MVCC与隔离级别

---

## 1. MVCC 的实现原理？

**回答：**

```
MVCC（Multi-Version Concurrency Control）：
  多版本并发控制 → 读不加锁，读写不冲突

核心组成：
  1. 隐藏列
  2. undo log 版本链
  3. ReadView（快照）

隐藏列（每行数据自动添加）：
  ┌──────────┬──────────────────────────┐
  │ 列名      │ 作用                      │
  ├──────────┼──────────────────────────┤
  │ DB_TRX_ID │ 最近修改该行的事务 ID     │
  │ DB_ROLL_PTR│ 指向 undo log 前一版本   │
  │ DB_ROW_ID │ 隐藏自增 ID（无主键时用） │
  └──────────┴──────────────────────────┘

undo log 版本链：
  ┌────────┐   roll_ptr   ┌────────┐   roll_ptr
  │ 当前版本│────────────→│ 旧版本1 │────────────→ ...
  │trx_id=5│              │trx_id=3│
  │name=王五│              │name=李四│
  └────────┘              └────────┘
  
  UPDATE 产生版本链：
  每次修改 → 旧版本写入 undo log
  新版本的 roll_ptr 指向旧版本
  → 形成链表（版本链）
```

---

## 2. ReadView 的工作原理？

**回答：**

```
ReadView 包含四个字段：
  ┌──────────────┬──────────────────────────┐
  │ 字段          │ 含义                      │
  ├──────────────┼──────────────────────────┤
  │ m_ids        │ 生成时活跃的事务 ID 列表   │
  │ min_trx_id   │ 活跃事务中最小的 ID       │
  │ max_trx_id   │ 下一个待分配的事务 ID     │
  │ creator_trx_id│ 创建该 ReadView 的事务 ID │
  └──────────────┴──────────────────────────┘

可见性判断规则：
  对版本链中的每个版本(trx_id)：

  1. trx_id == creator_trx_id
     → 可见（自己修改的）

  2. trx_id < min_trx_id
     → 可见（该事务已提交）

  3. trx_id >= max_trx_id
     → 不可见（该事务在 ReadView 之后开始）

  4. min_trx_id <= trx_id < max_trx_id
     → 如果 trx_id 在 m_ids 中：不可见（还未提交）
     → 如果 trx_id 不在 m_ids 中：可见（已提交）

  不可见 → 沿版本链找更早的版本，直到找到可见版本

RC vs RR 的本质区别：
  RC：每次 SELECT 生成新 ReadView → 能看到其他已提交事务
  RR：第一次 SELECT 生成 ReadView，后续复用 → 可重复读
```

---

## 3. 四种隔离级别的区别？

**回答：**

```
  ┌──────────────┬──────┬────────┬──────┐
  │ 隔离级别      │ 脏读 │不可重复读│ 幻读 │
  ├──────────────┼──────┼────────┼──────┤
  │ READ         │  ✅  │  ✅    │  ✅  │
  │ UNCOMMITTED  │      │        │      │
  ├──────────────┼──────┼────────┼──────┤
  │ READ         │  ❌  │  ✅    │  ✅  │
  │ COMMITTED(RC)│      │        │      │
  ├──────────────┼──────┼────────┼──────┤
  │ REPEATABLE   │  ❌  │  ❌    │  ✅* │
  │ READ(RR)     │      │        │      │
  ├──────────────┼──────┼────────┼──────┤
  │ SERIALIZABLE │  ❌  │  ❌    │  ❌  │
  └──────────────┴──────┴────────┴──────┘
  * InnoDB RR 通过 MVCC + Next-Key Lock 基本解决幻读

脏读：读到未提交事务的修改
不可重复读：同一事务中两次读同一行结果不同
幻读：同一事务中两次查询行数不同（新增/删除行）

设置隔离级别：
  SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
  
  查看当前级别：
  SELECT @@transaction_isolation;

互联网项目常用 RC（读已提交）：
  性能更好（无 Gap Lock）
  配合业务逻辑保证一致性
```

---

## 4. RC 和 RR 级别的实现区别？

**回答：**

```
示例场景：
  事务100: INSERT (id=1, name='张三')  → 已提交
  事务200开始：
  事务300开始：

  事务200:                  事务300:
  BEGIN;                    BEGIN;
                            UPDATE SET name='李四'
                            WHERE id=1;
                            (未提交，trx_id=300)

  SELECT name FROM t 
  WHERE id=1;
  → ReadView: m_ids=[200,300]
    min=200, max=301

  版本链：trx_id=300(李四) → trx_id=100(张三)
  
  300 在 m_ids 中 → 不可见
  100 < 200(min)  → 可见
  → 返回"张三" ✅

  ---事务300提交---

  SELECT name FROM t WHERE id=1;

  RC 级别：
    生成新 ReadView: m_ids=[200]
    300 不在 m_ids → 可见
    → 返回"李四"（看到了其他事务的提交）

  RR 级别：
    复用第一次 ReadView: m_ids=[200,300]
    300 在 m_ids → 不可见
    → 仍返回"张三"（可重复读）

核心差别：RC 每次读新快照，RR 复用首次快照
```

---

## 5. InnoDB 如何解决幻读？

**回答：**

```
幻读场景：
  事务A:                    事务B:
  BEGIN;
  SELECT * FROM t 
  WHERE age > 20;           
  → 返回 2 行

                            INSERT INTO t (age) 
                            VALUES (25);
                            COMMIT;

  SELECT * FROM t 
  WHERE age > 20;
  → 返回 3 行？← 幻读

InnoDB RR 级别的解决：

  1. 快照读（普通 SELECT）：
     MVCC ReadView → 看不到其他事务的新增
     → 快照读不会幻读 ✅

  2. 当前读（FOR UPDATE / DML）：
     Next-Key Lock 锁住间隙
     → 其他事务无法在间隙插入
     → 当前读也不会幻读 ✅

  仍可能"幻读"的特殊情况：
  事务A:                    事务B:
  BEGIN;
  SELECT * FROM t 
  WHERE id = 5;   -- 快照读，无锁
  → 不存在

                            INSERT INTO t (id) 
                            VALUES (5);
                            COMMIT;

  UPDATE t SET name='x' 
  WHERE id = 5;   -- 当前读，能看到!
  → 更新成功

  SELECT * FROM t 
  WHERE id = 5;   -- 快照能看到(自己更新过)
  → 看到了！← 快照读和当前读混用的幻读

  解决：第一次就用 FOR UPDATE（当前读+加锁）
```

---

## 6. undo log 的详细机制？

**回答：**

```
undo log 分类：
  insert undo log：INSERT 操作产生
    → 事务提交后立即释放（无需 MVCC）
  
  update undo log：UPDATE/DELETE 操作产生
    → 提交后不能立即释放（MVCC 可能需要）
    → purge 线程异步清理

undo log 与版本链：
  原始数据：id=1, name=A, trx_id=10
  
  事务20 UPDATE name='B':
  ┌─ 当前行 ────────────┐
  │ id=1, name=B         │
  │ trx_id=20            │
  │ roll_ptr ──→ undo1   │
  └──────────────────────┘
        ↓
  ┌─ undo1 ──────────────┐
  │ id=1, name=A          │
  │ trx_id=10             │
  │ roll_ptr → NULL       │
  └───────────────────────┘

  事务30 UPDATE name='C':
  ┌─ 当前行 ────────────┐
  │ id=1, name=C         │
  │ trx_id=30            │
  │ roll_ptr ──→ undo2   │
  └──────────────────────┘
        ↓
  ┌─ undo2 ──────────────┐       ┌─ undo1 ──────┐
  │ id=1, name=B          │──────→│ id=1, name=A  │
  │ trx_id=20             │       │ trx_id=10     │
  └───────────────────────┘       └───────────────┘

Purge 清理：
  当所有活跃事务都不再需要某版本 → purge 线程清理
  DELETE 标记删除 → purge 真正删除
```

---

## 7. 长事务的危害？

**回答：**

```
长事务危害：

  1. 锁持有时间长：
     行锁/间隙锁不释放 → 其他事务阻塞
     可能导致大面积锁等待

  2. undo log 膨胀：
     长事务的 ReadView 需要旧版本
     → undo log 不能被 purge 清理
     → 磁盘空间增长

  3. Binlog 延迟：
     事务提交时才写 binlog
     → 主从复制延迟

  4. MDL 锁冲突：
     长事务持有 MDL 读锁
     → DDL 被阻塞 → 后续 DML 也排队

  5. 回滚代价大：
     长事务回滚需要大量 undo log 回放

排查长事务：
  -- 查看运行超过 60 秒的事务
  SELECT * FROM information_schema.innodb_trx
  WHERE TIME_TO_SEC(TIMEDIFF(NOW(), trx_started)) > 60;

  -- 查看锁等待
  SELECT * FROM performance_schema.data_lock_waits;

避免长事务：
  - 设置 autocommit=1
  - 事务中不要有 RPC 调用/IO 操作
  - 设置 innodb_lock_wait_timeout（较短）
  - 监控告警
```

---

## 8. 事务的传播行为（应用层）？

**回答：**

```
Go 中事务管理：
```

```go
// 简单事务
func CreateOrder(db *sql.DB, order Order) error {
    tx, err := db.BeginTx(ctx, &sql.TxOptions{
        Isolation: sql.LevelReadCommitted,  // 指定隔离级别
    })
    if err != nil {
        return err
    }
    defer tx.Rollback()  // 失败自动回滚

    // 扣库存
    result, err := tx.Exec(
        "UPDATE inventory SET stock = stock - ? WHERE product_id = ? AND stock >= ?",
        order.Quantity, order.ProductID, order.Quantity)
    if err != nil {
        return err
    }
    affected, _ := result.RowsAffected()
    if affected == 0 {
        return errors.New("stock not enough")
    }

    // 创建订单
    _, err = tx.Exec(
        "INSERT INTO orders(user_id, product_id, quantity) VALUES(?, ?, ?)",
        order.UserID, order.ProductID, order.Quantity)
    if err != nil {
        return err
    }

    return tx.Commit()
}
```

```
事务设计原则：
  1. 事务尽量短（快进快出）
  2. 不在事务中做 RPC/IO
  3. 只锁必要的行
  4. 合理选择隔离级别
  5. 幂等设计（重试安全）
```

---

## 9. MVCC 与其他并发控制对比？

**回答：**

```
并发控制方案对比：

  ┌──────────┬──────────────┬──────────────┐
  │ 方案      │ 优点          │ 缺点          │
  ├──────────┼──────────────┼──────────────┤
  │ 表锁      │ 简单          │ 并发极低      │
  │ 行锁      │ 粒度细        │ 读写互斥      │
  │ MVCC     │ 读写不冲突    │ 版本链维护开销│
  │ 乐观锁    │ 无锁高并发    │ 冲突需重试    │
  └──────────┴──────────────┴──────────────┘

MVCC 的优势：
  读操作不加锁 → 写不阻塞读
  一致性读 → 事务内数据稳定
  Copy-On-Write 思想 → 多个版本共存

MVCC 的局限：
  版本链过长 → 查询性能下降
  undo log 存储开销
  purge 不及时 → 空间膨胀

实际使用：
  InnoDB = MVCC（快照读）+ 行锁（当前读）
  写写冲突：行锁解决
  读写冲突：MVCC 解决（无锁）
  读读：无冲突
```

---

## 10. MVCC与隔离级别面试速答？

**回答：**

```
Q: MVCC 核心组件？
A: 隐藏列(trx_id/roll_ptr)
   + undo log 版本链
   + ReadView 快照

Q: RC 和 RR 的 MVCC 区别？
A: RC 每次 SELECT 新建 ReadView
   RR 只第一次 SELECT 建，后续复用

Q: ReadView 怎么判断版本可见性？
A: trx_id < min → 可见(已提交)
   trx_id >= max → 不可见(未来事务)
   在 m_ids 中 → 不可见(未提交)
   不在 m_ids → 可见(已提交)

Q: InnoDB RR 解决幻读了吗？
A: 基本解决：快照读靠 MVCC
   当前读靠 Next-Key Lock
   混合使用可能仍有特殊幻读

Q: undo log 什么时候清理？
A: purge 线程清理
   没有活跃事务引用时才能删

Q: 长事务为什么有害？
A: 锁不释放→阻塞/undo不清理→空间膨胀
   MDL 锁→DDL 阻塞→全部排队

Q: 为什么互联网项目用 RC？
A: 无 Gap Lock → 锁冲突少 → 并发高
   业务层保证一致性足够
```
