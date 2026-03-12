# Go语言八股文

---

## 一、基础语法

### 1. Go 的基本数据类型和零值？

**答：**

| 类型 | 零值 | 说明 |
|------|------|------|
| bool | false | 布尔 |
| int/int8/int16/int32/int64 | 0 | 整型 |
| uint/uint8/uint16/uint32/uint64 | 0 | 无符号整型 |
| float32/float64 | 0.0 | 浮点 |
| string | "" | 字符串（不可变） |
| pointer | nil | 指针 |
| slice | nil | 切片 |
| map | nil | 映射 |
| channel | nil | 通道 |
| interface | nil | 接口 |
| func | nil | 函数 |
| struct | 各字段零值 | 结构体 |

```go
// 值类型 vs 引用类型
值类型: int, float, bool, string, array, struct
  → 赋值/传参会复制

引用类型: slice, map, channel, func, interface
  → 底层包含指针，赋值/传参共享底层数据
```

### 2. slice 和 array 的区别？slice 扩容机制？

**答：**

| 特性 | array | slice |
|------|-------|-------|
| 长度 | 固定 | 动态 |
| 类型 | [N]T（长度是类型一部分）| []T |
| 传参 | 值复制 | 引用传递（共享底层数组） |
| 比较 | 可用 == | 不可用 == |

```go
// slice 底层结构
type slice struct {
    array unsafe.Pointer  // 指向底层数组
    len   int             // 当前长度
    cap   int             // 容量
}
```

**扩容策略（Go 1.18+）：**
- cap < 256：翻倍扩容
- cap >= 256：增长因子约 1.25 + 192（平滑过渡）
- 最终会做内存对齐

### 3. map 的底层实现？

**答：**

```
Go map = 哈希表 (hmap)

hmap 结构:
  ┌──────────────────────────┐
  │ count    → 键值对数量     │
  │ B        → 桶数量 = 2^B   │
  │ buckets  → 桶数组指针     │
  │ oldbuckets → 旧桶（扩容用）│
  └──────────────────────────┘
       │
       ↓
  ┌────────────────────────────────┐
  │ bucket (bmap) 每个桶 8 个 KV   │
  │ tophash[8] → 高 8 位哈希加速   │
  │ keys[8]                        │
  │ values[8]                      │
  │ overflow → 溢出桶指针          │
  └────────────────────────────────┘
```

**扩容条件：**
- 装载因子 > 6.5（翻倍扩容）
- 溢出桶过多（等量扩容，整理碎片）
- 扩容是渐进式的，每次访问搬迁 1~2 个桶

**注意：** map 非线程安全，并发读写需用 `sync.Map` 或加锁。

---

## 二、函数与方法

### 4. defer 的执行顺序和陷阱？

**答：**

```go
// 1. LIFO 后进先出
func f() {
    defer fmt.Println("1")
    defer fmt.Println("2")
    defer fmt.Println("3")
}
// 输出: 3 2 1

// 2. 参数在 defer 注册时求值
func f() {
    x := 0
    defer fmt.Println(x) // x=0 此时求值
    x = 1
}
// 输出: 0

// 3. defer + 闭包可修改命名返回值
func f() (result int) {
    defer func() { result++ }()
    return 0 // 实际返回 1
}

// 4. defer + recover 捕获 panic
func safeFunc() {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("recovered: %v", r)
        }
    }()
    panic("something went wrong")
}
```

---

## 三、并发编程

### 5. goroutine 的调度模型（GMP）？

**答：**

```
GMP 调度模型:

  G (Goroutine): 协程，轻量级线程（~2KB 栈）
  M (Machine):   系统线程，执行 G 的载体
  P (Processor): 逻辑处理器，维护本地 G 队列

  ┌──────────────────────────────────────┐
  │            全局队列 (Global Queue)     │
  │  [G5] [G6] [G7] ...                  │
  └─────────────┬────────────────────────┘
                │
  ┌─────────────┼───────────────────┐
  │ P0          │        P1         │
  │ ┌────────┐  │  ┌────────┐      │
  │ │本地队列 │  │  │本地队列 │      │
  │ │G1 G2 G3│  │  │G4      │      │
  │ └────┬───┘  │  └────┬───┘      │
  │      ↓      │       ↓          │
  │   M0(运行G1)│    M1(运行G4)     │
  │   ↓         │    ↓              │
  │  OS Thread  │   OS Thread       │
  └─────────────┴───────────────────┘

调度策略:
  1. 本地队列优先：P 优先从本地队列取 G
  2. 全局队列：本地为空时从全局队列批量获取
  3. 工作窃取：全局也为空时，从其他 P 偷一半 G
  4. 抢占式调度：运行超 10ms 的 G 会被抢占
```

**P 的数量：** 默认 = CPU 核数，可通过 `GOMAXPROCS` 设置。

### 6. channel 的底层实现和使用？

**答：**

| 操作 | nil channel | 已关闭 channel | 正常 channel |
|------|-------------|---------------|-------------|
| 发送 | 永久阻塞 | panic | 阻塞或成功 |
| 接收 | 永久阻塞 | 返回零值 | 阻塞或成功 |
| 关闭 | panic | panic | 成功 |

```go
// channel 底层结构 (hchan)
type hchan struct {
    buf      unsafe.Pointer // 环形缓冲区
    dataqsiz uint           // 缓冲区大小
    sendx    uint           // 发送索引
    recvx    uint           // 接收索引
    sendq    waitq          // 等待发送的 G 队列
    recvq    waitq          // 等待接收的 G 队列
    lock     mutex          // 互斥锁
}

// 常用模式
// 1. 通知信号 (done channel)
done := make(chan struct{})
go func() { work(); close(done) }()
<-done

// 2. 生产者-消费者
// 3. 扇入扇出 (Fan-in / Fan-out)
// 4. 超时控制 (select + time.After)
```

### 7. sync 包常用并发原语？

**答：**

| 原语 | 用途 | 注意 |
|------|------|------|
| `sync.Mutex` | 互斥锁 | 不可重入 |
| `sync.RWMutex` | 读写锁 | 读多写少场景 |
| `sync.WaitGroup` | 等待一组 goroutine | Add 必须在 Go 之前 |
| `sync.Once` | 只执行一次 | 单例/初始化 |
| `sync.Map` | 并发安全 map | 读多写少 |
| `sync.Pool` | 临时对象池 | 减少 GC 压力 |
| `sync.Cond` | 条件变量 | 少用，channel 更好 |

---

## 四、内存与 GC

### 8. Go 的内存管理和 GC 原理？

**答：**

```
内存分配器 (TCMalloc 变种):
  ┌─────────────────────────────────────┐
  │ mcache (每个 P 一个, 无锁)           │
  │   → 微小对象 (< 16B): tiny allocator│
  │   → 小对象 (16B~32KB): 按 size class │
  ├─────────────────────────────────────┤
  │ mcentral (全局, 有锁)               │
  │   → 为 mcache 提供 span             │
  ├─────────────────────────────────────┤
  │ mheap (全局堆)                      │
  │   → 管理大块内存, 向 OS 申请/释放    │
  └─────────────────────────────────────┘

GC: 三色标记 + 混合写屏障

  白色: 未扫描（可能回收）
  灰色: 已扫描自身，子对象未扫描
  黑色: 已扫描自身和所有子对象

  步骤:
    1. STW → 开启写屏障
    2. 并发标记（与用户代码并行）
    3. STW → 关闭写屏障，完成标记
    4. 并发清扫

GC 触发条件:
  1. 堆内存增长到上次 GC 后的 2 倍 (GOGC=100)
  2. 定时触发 (2 分钟没有 GC)
  3. 手动 runtime.GC()
```

---

## 五、接口与反射

### 9. interface 底层实现？值接收者 vs 指针接收者？

**答：**

```go
// iface: 有方法的接口
type iface struct {
    tab  *itab          // 类型信息 + 方法表
    data unsafe.Pointer // 指向实际数据
}

// eface: 空接口 interface{}
type eface struct {
    _type *_type         // 类型信息
    data  unsafe.Pointer // 指向实际数据
}
```

| 对比 | 值接收者 | 指针接收者 |
|------|---------|-----------|
| 值变量调用 | ✅ | ❌ 不能实现接口 |
| 指针变量调用 | ✅ 自动取值 | ✅ |
| 是否修改原值 | 否（操作副本） | 是 |
| 实现接口 | 值和指针都实现 | 仅指针实现 |

**interface 判断 nil 的陷阱：**
```go
var p *int = nil
var i interface{} = p
fmt.Println(i == nil) // false! (type 不为 nil)
```

---

## 六、工程实践

### 10. Go 常用的并发模式和最佳实践？

**答：**

| 模式 | 说明 |
|------|------|
| **errgroup** | 一组 goroutine 有一个出错就取消其他 |
| **pipeline** | 多阶段流水线：chan 连接各阶段 |
| **fan-out/fan-in** | 一个产生，多个消费，结果汇聚 |
| **worker pool** | 固定数量 worker 消费任务 |
| **context 传播** | 超时/取消信号逐级传递 |
| **singleflight** | 相同请求只执行一次，共享结果 |

```go
// Worker Pool 示例
func workerPool(jobs <-chan Job, results chan<- Result, workers int) {
    var wg sync.WaitGroup
    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            for job := range jobs {
                results <- process(job)
            }
        }()
    }
    wg.Wait()
    close(results)
}
```

**性能优化要点：**
- 减少内存分配（sync.Pool / 预分配）
- 避免不必要的 goroutine 泄漏（context 控制生命周期）
- string ↔ []byte 零拷贝转换
- 使用 pprof 定位瓶颈

### 11. Go Module 依赖管理？

**答：**

```bash
go mod init myproject    # 初始化
go mod tidy              # 整理依赖
go mod vendor            # 生成 vendor 目录
go mod graph             # 查看依赖图

# go.mod 文件
module github.com/user/project
go 1.21
require (
    github.com/gin-gonic/gin v1.9.1
)

# 版本选择: 最小版本选择 (MVS)
# 多个依赖要求不同版本 → 选满足所有需求的最小版本
```

### 12. context 的用法和原理？

**答：**

```go
// 四种创建方式
ctx := context.Background()           // 根 context
ctx := context.TODO()                 // 占位
ctx, cancel := context.WithCancel(parent)     // 取消
ctx, cancel := context.WithTimeout(parent, 5*time.Second) // 超时
ctx, cancel := context.WithDeadline(parent, deadline)    // 截止时间
ctx := context.WithValue(parent, key, value)  // 传值

// 使用规范:
// 1. 作为函数第一个参数传递
// 2. 不要存在 struct 中
// 3. 不传 nil，用 context.Background() 代替
// 4. WithValue 仅传请求级数据（traceID），不传业务参数
```
