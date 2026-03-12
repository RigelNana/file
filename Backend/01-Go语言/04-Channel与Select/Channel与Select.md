# Channel与Select

---

## 1. Channel 底层结构？

**回答：**

```
Channel 底层: runtime.hchan

  type hchan struct {
      qcount   uint    // 缓冲区中的数据个数
      dataqsiz uint    // 缓冲区大小 (make 的第二个参数)
      buf      unsafe.Pointer // 环形缓冲区
      elemsize uint16  // 元素大小
      closed   uint32  // 是否关闭
      sendx    uint    // 发送索引 (环形)
      recvx    uint    // 接收索引 (环形)
      recvq    waitq   // 等待接收的 G 队列
      sendq    waitq   // 等待发送的 G 队列
      lock     mutex   // 互斥锁
  }

  无缓冲 Channel (dataqsiz=0):
    发送方 ──→ 直接拷贝到接收方 (无缓冲区)
    必须同时有发送方和接收方

  有缓冲 Channel:
    ┌────────────────────────────┐
    │ buf (环形缓冲区)            │
    │ [v1] [v2] [  ] [  ] [  ]  │
    │       ↑              ↑     │
    │     recvx          sendx   │
    └────────────────────────────┘
```

---

## 2. Channel 操作的行为？

**回答：**

```
  ┌──────────────┬──────────┬──────────────┬──────────────┐
  │ 操作          │ nil chan  │ 已关闭 chan   │ 正常 chan     │
  ├──────────────┼──────────┼──────────────┼──────────────┤
  │ ch <- v 发送  │ 永久阻塞  │ panic        │ 阻塞或成功   │
  │ <-ch 接收     │ 永久阻塞  │ 返回零值,    │ 阻塞或成功   │
  │              │          │ ok=false     │              │
  │ close(ch)    │ panic    │ panic        │ 成功         │
  │ len(ch)      │ 0        │ 缓冲剩余     │ 缓冲中个数   │
  │ cap(ch)      │ 0        │ 缓冲区大小   │ 缓冲区大小   │
  └──────────────┴──────────┴──────────────┴──────────────┘

原则:
  1. 不要关闭已关闭的 channel (panic)
  2. 不要向已关闭的 channel 发送 (panic)
  3. 关闭 channel 由发送方负责
  4. 多个发送方时不要直接关闭, 用 sync.Once 或额外信号
```

```go
// 安全关闭 channel
type SafeChannel struct {
    ch   chan int
    once sync.Once
}

func (sc *SafeChannel) Close() {
    sc.once.Do(func() {
        close(sc.ch)
    })
}

// 判断 channel 是否关闭
v, ok := <-ch
if !ok {
    // channel 已关闭且缓冲区为空
}

// range 遍历 (自动在关闭时退出)
for v := range ch {
    process(v)
}
```

---

## 3. 无缓冲和有缓冲 Channel 的区别？

**回答：**

```
  ┌──────────────┬──────────────────┬──────────────────┐
  │              │ 无缓冲 (同步)     │ 有缓冲 (异步)     │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 创建          │ make(chan T)      │ make(chan T, N)  │
  │ 发送          │ 阻塞直到有接收方  │ 缓冲满时才阻塞   │
  │ 接收          │ 阻塞直到有发送方  │ 缓冲空时才阻塞   │
  │ 同步性        │ 强同步 (握手)     │ 解耦生产/消费    │
  │ 适用场景      │ 信号通知/同步     │ 生产者-消费者    │
  └──────────────┴──────────────────┴──────────────────┘
```

```go
// 无缓冲: 同步通信 (手递手)
ch := make(chan int)
go func() { ch <- 42 }() // 阻塞到有人接收
v := <-ch                  // 立即收到 42

// 有缓冲: 异步通信 (信箱)
ch := make(chan int, 3)
ch <- 1 // 不阻塞
ch <- 2 // 不阻塞
ch <- 3 // 不阻塞
// ch <- 4 // 阻塞! 缓冲满了

// 缓冲大小选择:
// 0: 确保同步 (信号通知)
// 1: 最简单的异步解耦
// N: batch 场景, N 取决于生产/消费速率
```

---

## 4. select 语句详解？

**回答：**

```go
// select: 同时监听多个 channel

// 基本用法
select {
case v := <-ch1:
    fmt.Println("from ch1:", v)
case ch2 <- 42:
    fmt.Println("sent to ch2")
case <-time.After(3 * time.Second):
    fmt.Println("timeout")
default:
    fmt.Println("no channel ready")
}

// select 规则:
// 1. 多个 case 就绪 → 随机选一个 (公平)
// 2. 没有 case 就绪 + 无 default → 阻塞
// 3. 没有 case 就绪 + 有 default → 执行 default
// 4. 空 select{} → 永久阻塞

// 超时控制
func doWithTimeout(ctx context.Context) error {
    ch := make(chan result, 1)
    go func() { ch <- doWork() }()

    select {
    case r := <-ch:
        return r.err
    case <-ctx.Done():
        return ctx.Err()
    }
}

// 非阻塞发送/接收
select {
case ch <- v:
    // 发送成功
default:
    // channel 满, 丢弃
}

// 多路合并 (fan-in)
func merge(chs ...<-chan int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup
    for _, ch := range chs {
        wg.Add(1)
        go func(c <-chan int) {
            defer wg.Done()
            for v := range c {
                out <- v
            }
        }(ch)
    }
    go func() { wg.Wait(); close(out) }()
    return out
}
```

---

## 5. Channel 的方向限制？

**回答：**

```go
// 双向 channel
ch := make(chan int)

// 单向 channel (编译期约束)
var sendOnly chan<- int = ch // 只能发送
var recvOnly <-chan int = ch // 只能接收

// 函数签名中限制方向
func producer(out chan<- int) {
    out <- 42
    // <-out  // 编译错误! 只能发送
}

func consumer(in <-chan int) {
    v := <-in
    // in <- 1 // 编译错误! 只能接收
}

// 实际用法: 返回只读 channel
func gen(nums ...int) <-chan int { // 返回只读
    out := make(chan int)
    go func() {
        for _, n := range nums {
            out <- n
        }
        close(out)
    }()
    return out
}

// 双向可以赋值给单向, 反之不行
// chan T → chan<- T ✅
// chan T → <-chan T ✅
// chan<- T → chan T ❌
// <-chan T → chan T ❌
```

---

## 6. 用 Channel 实现常见模式？

**回答：**

```go
// 1. Done 信号 (通知退出)
done := make(chan struct{})
go func() {
    doWork()
    close(done) // 通知完成
}()
<-done

// 2. 信号量 (限制并发)
sem := make(chan struct{}, 10) // 最多 10 并发
for _, task := range tasks {
    sem <- struct{}{} // 获取信号量
    go func(t Task) {
        defer func() { <-sem }() // 释放信号量
        process(t)
    }(task)
}

// 3. 定时器
ticker := time.NewTicker(time.Second)
defer ticker.Stop()
for {
    select {
    case <-ticker.C:
        doPeriodicWork()
    case <-ctx.Done():
        return
    }
}

// 4. Or-Done 模式 (任一完成即退出)
func or(channels ...<-chan struct{}) <-chan struct{} {
    switch len(channels) {
    case 0:
        return nil
    case 1:
        return channels[0]
    }
    done := make(chan struct{})
    go func() {
        defer close(done)
        switch len(channels) {
        case 2:
            select {
            case <-channels[0]:
            case <-channels[1]:
            }
        default:
            select {
            case <-channels[0]:
            case <-channels[1]:
            case <-channels[2]:
            case <-or(append(channels[3:], done)...):
            }
        }
    }()
    return done
}
```

---

## 7. Channel vs Mutex 怎么选？

**回答：**

```
Channel 适合:
  ┌──────────────────────────────────────────┐
  │ · 数据所有权转移 (一个 G 传给另一个 G)    │
  │ · 协调多个 goroutine 的执行顺序           │
  │ · 生产者-消费者模型                       │
  │ · 事件通知 / 信号                         │
  │ · pipeline 流水线                         │
  └──────────────────────────────────────────┘

Mutex 适合:
  ┌──────────────────────────────────────────┐
  │ · 保护共享状态 (计数器/缓存/map)          │
  │ · 临界区很小 (简单增删改查)               │
  │ · 性能敏感 (锁比 channel 更快)           │
  │ · sync.Map 场景                          │
  └──────────────────────────────────────────┘

经验法则:
  "Don't communicate by sharing memory;
   share memory by communicating."
  
  但不要教条化, Mutex 更适合简单场景
```

---

## 8. Channel 死锁场景？

**回答：**

```go
// 场景1: 单 goroutine 无缓冲 channel
func main() {
    ch := make(chan int)
    ch <- 1    // 阻塞! main 自己等自己
    fmt.Println(<-ch)
}
// fatal error: all goroutines are asleep - deadlock!

// 场景2: 互相等待
func main() {
    ch1 := make(chan int)
    ch2 := make(chan int)
    go func() { ch1 <- <-ch2 }()
    go func() { ch2 <- <-ch1 }()
    select {} // deadlock
}

// 场景3: 忘记关闭 channel
func main() {
    ch := make(chan int)
    go func() {
        ch <- 1
        ch <- 2
        // 忘记 close(ch)
    }()
    for v := range ch { // range 永不退出
        fmt.Println(v)
    }
}

// 避免死锁:
// 1. 确保每个 channel 有配对的发送/接收
// 2. 用 select + default 或 timeout 避免永久阻塞
// 3. 发送完毕后 close(ch)
// 4. 用 context 控制生命周期
```

---

## 9. Channel 性能注意事项？

**回答：**

```
性能特点:
  Channel 有锁 (hchan.lock), 比 Mutex 慢
  适合协调/通信, 不适合高频数据交换

  Benchmark 参考 (单次操作):
    无缓冲 channel: ~100ns
    有缓冲 channel: ~50ns
    Mutex Lock/Unlock: ~20ns
    atomic 操作: ~5ns
```

```go
// 优化: 批量通过 channel
// 差: 每个元素一次 channel 操作
for _, item := range items {
    ch <- item
}

// 好: 批量发送
batch := make([]Item, 0, 100)
for _, item := range items {
    batch = append(batch, item)
    if len(batch) >= 100 {
        ch <- batch
        batch = make([]Item, 0, 100)
    }
}

// 缓冲区大小选择:
// 太小 → 频繁阻塞
// 太大 → 浪费内存, 延迟问题
// 经验: 根据生产/消费速率比确定
```

---

## 10. Channel 面试速答？

**回答：**

```
Q: Channel 底层是什么?
A: hchan 结构体: 环形缓冲区 + 发送/接收等待队列 + 互斥锁

Q: 向已关闭 channel 发送数据?
A: panic! 读已关闭 channel 返回零值

Q: nil channel 有什么用?
A: select 中禁用某个 case
   读写 nil channel 永久阻塞

Q: 无缓冲 vs 有缓冲?
A: 无缓冲: 同步 (握手), 发送方阻塞等接收方
   有缓冲: 异步, 满了才阻塞

Q: select 多个 case 就绪?
A: 随机选一个 (公平调度)
   不是顺序选择!

Q: 怎么优雅关闭 channel?
A: 发送方关闭, 接收方 range 读取
   多发送方用 sync.Once 或 done channel

Q: Channel 有锁吗?
A: 有! hchan 内部有 mutex
   比 Mutex 慢, 但提供更好的抽象

Q: 怎么实现超时?
A: select + context.WithTimeout
   或 select + time.After
```
