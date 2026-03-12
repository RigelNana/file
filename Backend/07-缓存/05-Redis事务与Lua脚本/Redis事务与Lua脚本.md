# Redis事务与Lua脚本

---

## 1. Redis 事务原理？

**回答：**

```
Redis 事务流程：
  MULTI → 开启事务
  → 命令入队
  → 命令入队
  EXEC  → 批量执行

  ┌─────────────────────────────────────┐
  │ MULTI                               │
  │   SET user:1001:balance 100         │→ QUEUED
  │   DECRBY user:1001:balance 30       │→ QUEUED
  │   INCRBY user:1002:balance 30       │→ QUEUED
  │ EXEC                                │→ 批量执行
  └─────────────────────────────────────┘

  DISCARD → 取消事务，清空队列

特性：
  ✅ 批量执行，不被打断
  ❌ 没有回滚（命令出错仍继续）
  ❌ 不保证原子性（部分成功部分失败）

与传统数据库事务对比：
  ┌──────────┬──────────┬──────────┐
  │          │ MySQL    │ Redis    │
  ├──────────┼──────────┼──────────┤
  │ 原子性   │ ✅       │ ❌ 不回滚│
  │ 隔离性   │ ✅       │ ✅ EXEC  │
  │ 持久性   │ ✅       │ 取决配置 │
  │ 一致性   │ ✅       │ ❌ 弱    │
  └──────────┴──────────┴──────────┘
```

---

## 2. WATCH 乐观锁机制？

**回答：**

```
WATCH 实现 CAS（Check-And-Set）：
  监视 key，如果 EXEC 前 key 被修改 → 事务取消

流程：
  WATCH balance
  val = GET balance
  MULTI
  SET balance (val - 30)
  EXEC   → 如果 balance 被改 → nil（事务放弃）

  ┌──────────────┐     ┌──────────────┐
  │  Client A    │     │  Client B    │
  │ WATCH bal    │     │              │
  │ GET bal → 100│     │              │
  │ MULTI        │     │              │
  │ SET bal 70   │     │ SET bal 50 ← │ 修改了 bal
  │ EXEC → nil ← │     │              │ 事务失败
  └──────────────┘     └──────────────┘

  → Client A 需要重试

UNWATCH：取消所有 WATCH
EXEC/DISCARD 后自动 UNWATCH
```

```go
// Go 实现 WATCH + 事务重试
func decrBalance(ctx context.Context, rdb *redis.Client, 
    userKey string, amount int64) error {
    
    const maxRetries = 3
    for i := 0; i < maxRetries; i++ {
        err := rdb.Watch(ctx, func(tx *redis.Tx) error {
            bal, err := tx.Get(ctx, userKey).Int64()
            if err != nil {
                return err
            }
            if bal < amount {
                return fmt.Errorf("balance not enough")
            }
            _, err = tx.TxPipelined(ctx, func(pipe redis.Pipeliner) error {
                pipe.DecrBy(ctx, userKey, amount)
                return nil
            })
            return err
        }, userKey)
        
        if err == redis.TxFailedErr {
            continue // 被其他客户端修改，重试
        }
        return err
    }
    return fmt.Errorf("max retries exceeded")
}
```

---

## 3. Lua 脚本基础？

**回答：**

```
为什么用 Lua？
  事务不保证原子性 → Lua 脚本可以
  Lua 在 Redis 中单线程原子执行
  执行期间不会被其他命令打断

EVAL 命令：
  EVAL script numkeys key [key ...] arg [arg ...]

  EVAL "return redis.call('GET', KEYS[1])" 1 mykey

Lua 中操作 Redis：
  redis.call(cmd, ...)    → 出错则中断脚本
  redis.pcall(cmd, ...)   → 出错返回错误对象

KEYS[] 和 ARGV[]：
  KEYS[1] 起始为 1（Lua 下标从 1 开始）
  KEYS → 操作的 key
  ARGV → 参数
```

```lua
-- 示例：限流（固定窗口）
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])

local current = tonumber(redis.call('GET', key) or "0")
if current >= limit then
    return 0  -- 被限流
end

redis.call('INCR', key)
if current == 0 then
    redis.call('EXPIRE', key, window)
end
return 1  -- 放行
```

---

## 4. Lua 脚本实战场景？

**回答：**

```lua
-- 1. 分布式锁（原子的加锁 + 设过期）
-- 加锁
local key = KEYS[1]
local value = ARGV[1]
local ttl = tonumber(ARGV[2])
if redis.call('SETNX', key, value) == 1 then
    redis.call('PEXPIRE', key, ttl)
    return 1
end
return 0

-- 解锁（只有持锁者才能删）
if redis.call('GET', KEYS[1]) == ARGV[1] then
    return redis.call('DEL', KEYS[1])
end
return 0
```

```lua
-- 2. 库存扣减（原子判断 + 扣减）
local stock = tonumber(redis.call('GET', KEYS[1]))
local amount = tonumber(ARGV[1])
if stock >= amount then
    redis.call('DECRBY', KEYS[1], amount)
    return 1  -- 扣减成功
end
return 0  -- 库存不足
```

```lua
-- 3. 滑动窗口限流
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
    return 0
end
redis.call('ZADD', key, now, now .. math.random())
redis.call('EXPIRE', key, window / 1000)
return 1
```

---

## 5. Go 中使用 Lua 脚本？

**回答：**

```go
// 1. 直接执行
script := `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local current = tonumber(redis.call('GET', key) or "0")
if current >= limit then
    return 0
end
redis.call('INCR', key)
return 1
`

result, err := rdb.Eval(ctx, script, []string{"rate:api:1001"}, 100).Int()

// 2. 使用 Script 对象（EVALSHA 优化）
var rateLimitScript = redis.NewScript(`
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = tonumber(redis.call('GET', key) or "0")
if current >= limit then
    return 0
end
local result = redis.call('INCR', key)
if result == 1 then
    redis.call('EXPIRE', key, window)
end
return 1
`)

// 首次 EVALSHA → 找不到 → 自动降级 EVAL
// 之后通过 SHA1 直接调用，减少网络传输
result, err := rateLimitScript.Run(ctx, rdb,
    []string{"rate:api:1001"}, 100, 60).Int()

// 3. 预加载脚本
sha, _ := rdb.ScriptLoad(ctx, script).Result()
result, _ := rdb.EvalSha(ctx, sha, []string{"key"}, args...).Result()
```

---

## 6. EVALSHA 与脚本缓存？

**回答：**

```
EVAL vs EVALSHA：
  EVAL  → 每次发送完整脚本
  EVALSHA → 发送脚本 SHA1 哈希值

流程：
  1. 首次用 EVAL 执行脚本
  2. Redis 缓存脚本，返回 SHA1
  3. 后续用 EVALSHA sha1 调用

  ┌──────┐  EVALSHA sha1  ┌──────┐
  │Client│───────────────→│Redis │
  │      │                │ 脚本 │
  │      │  NOSCRIPT err  │ 缓存 │
  │      │←───────────────│      │
  │      │  EVAL script   │      │
  │      │───────────────→│      │
  └──────┘                └──────┘

脚本管理命令：
  SCRIPT LOAD script       → 预加载返回 SHA1
  SCRIPT EXISTS sha1       → 检查是否已缓存
  SCRIPT FLUSH             → 清空脚本缓存
  SCRIPT KILL              → 终止正在运行的脚本

注意：Redis 重启后脚本缓存清空
Cluster 模式每个节点独立缓存
```

---

## 7. Lua 脚本注意事项？

**回答：**

```
1. 执行时间：
   Lua 脚本阻塞 Redis 主线程
   lua-time-limit 5000（默认 5 秒警告）
   超时后其他命令返回 BUSY 错误
   → SCRIPT KILL 终止（未写入时）
   → SHUTDOWN NOSAVE（已写入时，最后手段）

2. 幂等性：
   Lua 中避免 TIME / RANDOMKEY 等非确定命令
   Redis 7.0+ 提供 redis.REPL_NONE 等标志

3. Cluster 兼容：
   所有 KEYS 必须在同一个 slot
   → 使用 Hash Tag 保证

4. 内存：
   脚本中不要创建大量临时变量
   避免死循环

5. 调试：
   redis.log(redis.LOG_WARNING, "msg")
   → 输出到 Redis 日志

6. 最佳实践：
   脚本尽量短小
   逻辑在应用层，原子操作在 Lua
   结果类型注意 Lua → Redis 转换
   nil → false
   number → integer
   string → bulk string
```

---

## 8. Pipeline 管道？

**回答：**

```
Pipeline 原理：
  普通模式（RTT × N）：
    CMD1 → Response1 → CMD2 → Response2

  Pipeline 模式（≈ 1 RTT）：
    CMD1 + CMD2 + CMD3 → Response1 + Response2 + Response3

  ┌──────┐  批量发送   ┌──────┐
  │Client│ ═══════════→│Redis │
  │      │  批量返回   │      │
  │      │ ←═══════════│      │
  └──────┘             └──────┘

  不是原子操作！只是减少 RTT
  中间可能穿插其他客户端的命令
```

```go
// Go Pipeline 用法
pipe := rdb.Pipeline()

// 批量写入
for i := 0; i < 1000; i++ {
    key := fmt.Sprintf("user:%d", i)
    pipe.Set(ctx, key, "value", time.Hour)
}
cmds, err := pipe.Exec(ctx)

// 批量读取
pipe = rdb.Pipeline()
gets := make([]*redis.StringCmd, 100)
for i := 0; i < 100; i++ {
    gets[i] = pipe.Get(ctx, fmt.Sprintf("user:%d", i))
}
pipe.Exec(ctx)
for _, cmd := range gets {
    val, _ := cmd.Result()
    fmt.Println(val)
}
```

---

## 9. Pipeline vs 事务 vs Lua？

**回答：**

```
  ┌──────────┬──────────┬──────────┬──────────┐
  │ 特性      │Pipeline  │MULTI事务 │Lua脚本   │
  ├──────────┼──────────┼──────────┼──────────┤
  │ 原子执行  │ ❌      │ ❌不回滚  │ ✅       │
  │ 不可打断  │ ❌      │ ✅       │ ✅       │
  │ 条件判断  │ ❌      │ ❌       │ ✅       │
  │ 减少 RTT │ ✅      │ ✅       │ ✅       │
  │ 阻塞主线程│ 分散     │ EXEC 时  │ 整体阻塞 │
  │ Cluster  │ 按 slot  │ 同 slot  │ 同 slot  │
  │ 使用场景  │ 批量操作 │ 简单批量 │ 复杂逻辑 │
  └──────────┴──────────┴──────────┴──────────┘

选择建议：
  批量读写，不需要原子 → Pipeline
  简单的原子批量 → MULTI/EXEC
  需要条件判断的原子操作 → Lua 脚本
  需要乐观锁 → WATCH + MULTI
```

---

## 10. Redis事务与Lua面试速答？

**回答：**

```
Q: Redis 事务支持回滚吗？
A: 不支持。命令出错仍继续执行，
   设计者认为错误都是编程错误

Q: WATCH 怎么用？
A: 监视 key → MULTI → EXEC
   期间 key 被改 → EXEC 返回 nil

Q: Lua 脚本为什么能保证原子性？
A: 单线程执行，脚本运行期间
   不会被其他命令打断

Q: EVAL 和 EVALSHA 区别？
A: EVAL 发完整脚本
   EVALSHA 发 SHA1 哈希，减少网络传输

Q: Pipeline 是原子操作吗？
A: 不是。只是批量发送减少 RTT
   中间可能穿插其他客户端命令

Q: Lua 脚本超时怎么办？
A: lua-time-limit 默认 5s 后警告
   SCRIPT KILL 终止（未写入时）

Q: Cluster 中 Lua 的限制？
A: 所有 KEYS 必须在同一个 slot
   需要用 Hash Tag 保证

Q: 扣库存用什么方案？
A: Lua 脚本：原子判断 + 扣减
   保证并发安全
```
