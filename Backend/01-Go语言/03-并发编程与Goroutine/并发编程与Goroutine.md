# 并发编程与Goroutine

---

## 1. Goroutine 的本质？与线程的区别？

**回答：**

```
Goroutine: 用户态轻量级线程 (协程)

Goroutine vs OS Thread:
  ┌──────────────┬──────────────────┬──────────────────┐
  │              │ OS Thread        │ Goroutine        │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 创建成本      │ ~1MB 栈          │ ~2KB 栈 (可增长) │
  │ 切换成本      │ 内核态切换 ~μs   │ 用户态切换 ~ns   │
  │ 调度          │ OS 内核调度      │ Go runtime 调度  │
  │ 数量          │ 千级             │ 百万级           │
  │ 通信          │ 共享内存+锁      │ Channel (CSP)    │
  │ 栈大小        │ 固定 (1-8MB)     │ 动态 (2KB→1GB)  │
  │ ID           │ 有 TID           │ 无公开 ID       │
  └──────────────┴──────────────────┴──────────────────┘

Goroutine 栈增长:
  初始 2KB → 不够时翻倍增长 → 最大 1GB
  增长时需要拷贝整个栈 (连续栈)
  缩小时在 GC 阶段回收
```

```go
// 创建 goroutine
go func() {
    fmt.Println("hello from goroutine")
}()

// 注意: main 退出 → 所有 goroutine 被杀
// 需要同步机制等待
var wg sync.WaitGroup
wg.Add(1)
go func() {
    defer wg.Done()
    doWork()
}()
wg.Wait()
```

---

## 2. GMP 调度模型详解？

**回答：**

```
GMP 模型:
  G (Goroutine): 待执行的任务
  M (Machine):   OS 线程, 执行 G 的载体
  P (Processor): 逻辑处理器, 含本地 G 队列

  ┌────────────────────────────────────────────────┐
  │                全局队列 (Global Run Queue)        │
  │  [G10] [G11] [G12] ...                          │
  └──────────────────┬───────────────────────────────┘
                     │ (本地为空时获取)
  ┌──────────────────┼────────────────────────────┐
  │    P0            │           P1                │
  │  ┌──────────┐   │  ┌──────────┐               │
  │  │本地队列   │   │  │本地队列   │               │
  │  │G1 G2 G3  │   │  │G4 G5     │               │
  │  └────┬─────┘   │  └────┬─────┘               │
  │       ↓         │       ↓                     │
  │    M0 (运行G1)  │    M1 (运行G4)               │
  │    ↓            │    ↓                         │
  │  [OS Thread]    │  [OS Thread]                 │
  └──────────────────┴─────────────────────────────┘

关键机制:
  1. 本地队列优先: P 先从本地队列取 G 执行 (无锁)
  2. 全局队列: 本地为空时, 从全局队列批量获取 (len/GOMAXPROCS+1)
  3. 工作窃取: 全局也为空时, 从其他 P 偷一半 G
  4. 自旋线程: 空闲的 M 自旋等待新 G (避免频繁休眠唤醒)

特殊场景:
  系统调用阻塞:
    M 执行的 G 进入系统调用 (如文件IO)
    → P 与 M 解绑, P 绑定新的 M (或创建新 M)
    → 系统调用返回后, G 回到队列

  网络IO:
    Go 使用 netpoller (epoll/kqueue)
    → G 不阻塞 M, 只是挂起 G
    → 网络就绪时重新放入队列
```

---

## 3. Goroutine 调度时机？抢占式调度？

**回答：**

```
调度时机 (G 让出 P 的时机):
  ┌──────────────────┬──────────────────────────────┐
  │ 触发              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ channel 操作阻塞  │ 发送/接收阻塞时让出            │
  │ 系统调用          │ 阻塞系统调用时 P 解绑          │
  │ select 阻塞       │ 所有 case 都不就绪时           │
  │ go 语句           │ 创建新 G 可能触发调度          │
  │ GC               │ GC 期间 STW                   │
  │ time.Sleep       │ 主动让出                       │
  │ runtime.Gosched  │ 手动让出                       │
  │ 抢占             │ 运行超 10ms 被异步抢占          │
  └──────────────────┴──────────────────────────────┘

抢占式调度演进:
  Go 1.13 以前: 协作式抢占
    → 只在函数调用时检查抢占标记
    → 死循环 (无函数调用) 会导致其他 G 饿死

  Go 1.14+: 异步抢占 (signal-based)
    → sysmon 监控线程发送信号 (SIGURG)
    → M 收到信号后在安全点暂停当前 G
    → 解决了死循环不让出 CPU 的问题
```

```go
// sysmon: 系统监控线程 (独立 M, 不需要 P)
// 职责:
// 1. 检查运行超 10ms 的 G → 发抢占信号
// 2. 检查 netpoll → 就绪的网络 G 放入队列
// 3. 检查 timer → 到期的定时器触发
// 4. 强制 GC (2分钟无GC时)
```

---

## 4. Goroutine 泄漏？怎么检测和预防？

**回答：**

```
Goroutine 泄漏: goroutine 永远阻塞无法退出
  → 内存泄漏, goroutine 数量不断增长

常见泄漏场景:
  1. channel 忘记关闭/无人消费
  2. 无超时的 HTTP 请求
  3. 死锁 (互相等待)
  4. 无退出条件的 for-select

检测方法:
  runtime.NumGoroutine()    → 监控数量
  pprof: /debug/pprof/goroutine → 查看堆栈
  goleak (uber): 测试中检测泄漏
```

```go
// 泄漏: channel 无消费者
func leak() {
    ch := make(chan int)
    go func() {
        ch <- 1 // 永远阻塞! 没人接收
    }()
}

// 修复: 使用 context 控制生命周期
func noLeak(ctx context.Context) {
    ch := make(chan int, 1) // 带缓冲
    go func() {
        select {
        case ch <- doWork():
        case <-ctx.Done():
            return // 超时/取消时退出
        }
    }()
}

// 泄漏: 无退出的 for-select
func leak2() {
    go func() {
        for {
            select {
            case <-time.After(time.Second):
                doWork()
            // 没有退出条件!
            }
        }
    }()
}

// 修复: 加 done channel 或 context
func noLeak2(ctx context.Context) {
    go func() {
        for {
            select {
            case <-ctx.Done():
                return
            case <-time.After(time.Second):
                doWork()
            }
        }
    }()
}

// goleak: 单元测试检测泄漏
func TestNoLeak(t *testing.T) {
    defer goleak.VerifyNone(t)
    // ... 测试代码
}
```

---

## 5. WaitGroup 使用和原理？

**回答：**

```go
// WaitGroup: 等待一组 goroutine 完成

var wg sync.WaitGroup

for i := 0; i < 10; i++ {
    wg.Add(1) // 必须在 go 之前 Add!
    go func(id int) {
        defer wg.Done()
        process(id)
    }(i)
}
wg.Wait() // 阻塞直到计数器归零

// 底层: 计数器 + 信号量
// Add(n): 计数器 +n
// Done(): 计数器 -1 (= Add(-1))
// Wait(): 计数器 > 0 时阻塞

// 常见错误:
// 1. Add 放在 go 里面
go func() {
    wg.Add(1)  // 错! 主 goroutine 可能先 Wait
    defer wg.Done()
}()

// 2. 传值而非传指针
func work(wg sync.WaitGroup) { // 错! 值拷贝
    defer wg.Done()
}
func work(wg *sync.WaitGroup) { // 对! 传指针
    defer wg.Done()
}

// 3. 负计数 panic
wg.Add(1)
wg.Done()
wg.Done() // panic: negative WaitGroup counter
```

---

## 6. errgroup 并发错误处理？

**回答：**

```go
import "golang.org/x/sync/errgroup"

// errgroup: WaitGroup + 错误收集 + 取消传播
func fetchAll(ctx context.Context, urls []string) error {
    g, ctx := errgroup.WithContext(ctx)

    for _, url := range urls {
        url := url
        g.Go(func() error {
            req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
            if err != nil {
                return err
            }
            resp, err := http.DefaultClient.Do(req)
            if err != nil {
                return err // 一个失败 → ctx 取消 → 其他也停
            }
            defer resp.Body.Close()
            return nil
        })
    }

    return g.Wait() // 返回第一个错误
}

// 限制并发数
g.SetLimit(10) // 最多 10 个 goroutine 并行

// errgroup vs WaitGroup:
// WaitGroup: 只等待, 不收集错误
// errgroup: 等待 + 收集第一个错误 + 自动取消
```

---

## 7. 并发安全的数据结构？

**回答：**

```
Go 并发安全方案:
  ┌──────────────────┬──────────────────────────────┐
  │ 方案              │ 适用场景                      │
  ├──────────────────┼──────────────────────────────┤
  │ sync.Mutex       │ 通用互斥访问                  │
  │ sync.RWMutex     │ 读多写少                      │
  │ sync.Map         │ 读多写少的 map                │
  │ atomic 包        │ 简单数值的原子操作             │
  │ channel          │ goroutine 间通信              │
  │ sync.Once        │ 一次性初始化                  │
  └──────────────────┴──────────────────────────────┘
```

```go
// sync.Map: 并发安全的 map
var m sync.Map
m.Store("key", "value")
v, ok := m.Load("key")
m.Delete("key")
m.Range(func(k, v interface{}) bool {
    fmt.Println(k, v)
    return true // false 停止遍历
})

// sync.Map 适合: key 稳定, 读多写少
// 不适合: 频繁写入 → 用 sync.RWMutex + map

// atomic: 原子操作
var counter int64
atomic.AddInt64(&counter, 1)  // 原子 +1
atomic.LoadInt64(&counter)    // 原子读
atomic.StoreInt64(&counter, 0) // 原子写
atomic.CompareAndSwapInt64(&counter, old, new) // CAS

// Go 1.19+ atomic.Int64
var counter atomic.Int64
counter.Add(1)
counter.Load()
counter.Store(0)
```

---

## 8. 并发模式: Pipeline 和 Fan-out/Fan-in？

**回答：**

```go
// Pipeline: 多阶段流水线, 每阶段一个 goroutine

// 阶段1: 生成数据
func gen(nums ...int) <-chan int {
    out := make(chan int)
    go func() {
        for _, n := range nums {
            out <- n
        }
        close(out)
    }()
    return out
}

// 阶段2: 平方
func sq(in <-chan int) <-chan int {
    out := make(chan int)
    go func() {
        for n := range in {
            out <- n * n
        }
        close(out)
    }()
    return out
}

// 组合: gen → sq → 消费
for v := range sq(gen(1, 2, 3)) {
    fmt.Println(v) // 1, 4, 9
}

// Fan-out/Fan-in: 一个输入多个 worker, 结果汇聚
func fanOut(in <-chan int, workers int) <-chan int {
    out := make(chan int)
    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for n := range in {
                out <- process(n)
            }
        }()
    }
    go func() {
        wg.Wait()
        close(out)
    }()
    return out
}
```

---

## 9. context 与并发控制？

**回答：**

```go
// context: goroutine 的生命周期管理

// 1. 超时控制
ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
defer cancel()

select {
case result := <-doWork(ctx):
    fmt.Println(result)
case <-ctx.Done():
    fmt.Println("timeout:", ctx.Err()) // context deadline exceeded
}

// 2. 取消传播
ctx, cancel := context.WithCancel(context.Background())

go worker(ctx, 1)
go worker(ctx, 2)
go worker(ctx, 3)

time.Sleep(time.Second)
cancel() // 所有 worker 收到取消信号

func worker(ctx context.Context, id int) {
    for {
        select {
        case <-ctx.Done():
            fmt.Printf("worker %d stopped\n", id)
            return
        default:
            doWork()
        }
    }
}

// 3. 传值 (请求级数据)
type ctxKey string
ctx := context.WithValue(ctx, ctxKey("traceID"), "abc-123")
traceID := ctx.Value(ctxKey("traceID")).(string)

// context 最佳实践:
// 1. 作为函数第一个参数
// 2. 不存 struct 中
// 3. 不传 nil, 用 context.Background()
// 4. WithValue 只传请求级数据 (traceID, userID)
```

---

## 10. 并发编程面试速答？

**回答：**

```
Q: Goroutine 为什么轻量?
A: 2KB 初始栈 (线程 1MB+), 用户态调度
   切换不经内核, 成本约 ns 级
   一个进程可创建百万级 goroutine

Q: GMP 模型是什么?
A: G=Goroutine, M=OS线程, P=逻辑处理器
   P 数量 = CPU 核数, 维护本地 G 队列
   工作窃取 + 抢占调度

Q: Go 怎么做抢占调度?
A: Go 1.14+ 异步信号抢占 (SIGURG)
   sysmon 检测运行超 10ms 的 G
   解决 for{} 死循环不让出 CPU

Q: goroutine 泄漏怎么排查?
A: runtime.NumGoroutine() 监控数量
   pprof /debug/pprof/goroutine
   goleak 测试检测
   根因: channel 阻塞/无 context 退出

Q: Channel 和 Mutex 怎么选?
A: 传递数据所有权 → Channel
   保护共享状态 → Mutex
   口诀: 用通信共享内存, 别用共享内存通信

Q: sync.Map 什么时候用?
A: 读多写少 + key 集合稳定
   频繁写入用 RWMutex + map 更好

Q: context 的作用?
A: 超时控制 + 取消传播 + 传值
   链式传播, 父取消则子取消
   Always defer cancel()
```
