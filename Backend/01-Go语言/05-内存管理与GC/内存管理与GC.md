# 内存管理与GC

---

## 1. Go 内存分配器原理？

**回答：**

```
Go 内存分配: 基于 TCMalloc 的多级分配器

分配层级:
  ┌─────────────────────────────────────────┐
  │ mcache (每个 P 一个, 无锁分配)            │
  │   tiny allocator: < 16B 且无指针的小对象  │
  │   span 缓存: 按 size class 缓存 mspan    │
  ├─────────────────────────────────────────┤
  │ mcentral (全局, 按 size class 分组)       │
  │   为 mcache 补充 mspan                    │
  │   回收 mcache 归还的 mspan                │
  ├─────────────────────────────────────────┤
  │ mheap (全局堆)                           │
  │   管理所有 span                           │
  │   向 OS 申请/释放内存 (mmap)              │
  └─────────────────────────────────────────┘

对象大小分类:
  ┌──────────────┬──────────────────────────────┐
  │ 类别          │ 分配策略                      │
  ├──────────────┼──────────────────────────────┤
  │ 微对象 <16B   │ tiny allocator 合并分配       │
  │ 小对象 ≤32KB  │ mcache → mcentral → mheap   │
  │ 大对象 >32KB  │ 直接从 mheap 分配            │
  └──────────────┴──────────────────────────────┘

size class: 约 70 个, 如 8B, 16B, 32B, 48B, 64B...
  → 减少内部碎片 (最多浪费约 12.5%)
```

---

## 2. Go GC 三色标记算法？

**回答：**

```
三色标记 (Tri-color Marking):

  白色: 未被扫描, 可能是垃圾
  灰色: 已扫描自身, 子对象未扫描
  黑色: 已扫描自身和所有子对象, 确认存活

  过程:
    1. 初始: 所有对象白色
    2. 根对象 (全局变量/栈/寄存器) 标灰
    3. 取灰色对象 → 扫描其引用 → 引用标灰, 自身标黑
    4. 重复直到无灰色对象
    5. 剩余白色 = 垃圾, 回收

  初始:  所有白色
    ○ ○ ○ ○ ○ ○

  标记根:
    ● → ◐ → ○ → ○
              ↓
              ○ → ○
    ●=黑 ◐=灰 ○=白

  扫描灰色:
    ● → ● → ◐ → ○
              ↓
              ◐ → ○

  继续:
    ● → ● → ● → ◐
              ↓
              ● → ◐

  完成:
    ● → ● → ● → ●   (存活)
              ↓
              ● → ●
    ○ (不可达 → 回收)
```

---

## 3. 混合写屏障？为什么需要？

**回答：**

```
并发标记问题:
  GC 与用户代码并发执行时, 可能丢失存活对象

  场景 (对象丢失):
    1. 黑色 A 引用白色 C (新增引用)
    2. 灰色 B 删除对 C 的引用
    → C 不会被扫描到 → 被错误回收!

    需要: 三色不变式
    强三色: 黑色不直接引用白色
    弱三色: 白色对象必须被灰色对象保护

写屏障 (Write Barrier):
  在赋值操作时插入额外代码, 维护三色不变式

  Go 1.8+: 混合写屏障 (Hybrid Write Barrier)
    = 插入写屏障 + 删除写屏障

  规则:
    1. GC 开始时栈上对象全部标黑 (不需要 re-scan 栈)
    2. 堆上新创建的对象标黑
    3. 被删除引用的对象标灰
    4. 被添加引用的对象标灰

  优势:
    不需要 stack re-scan (Go 1.7 之前需要)
    → STW 时间大幅缩短 (从 ms 到 μs)
```

---

## 4. GC 完整流程？

**回答：**

```
Go GC 完整流程 (并发 GC):

  阶段1: Mark Setup (STW) ~10-30μs
    开启写屏障
    扫描栈, 标记根对象为灰色

  阶段2: Concurrent Mark (并发)
    GC goroutine 与用户代码并发执行
    消耗约 25% CPU (GOGC 默认)
    扫描灰色对象, 标记引用

  阶段3: Mark Termination (STW) ~60-90μs
    关闭写屏障
    完成剩余标记
    准备清扫

  阶段4: Concurrent Sweep (并发)
    回收白色对象的内存
    归还 span 给 mheap
    大块内存归还 OS (MADV_FREE)

时间线:
  ──STW──┤ 并发标记 (25% CPU) ├──STW──┤ 并发清扫 ├──
  ~10μs        ~ms 级            ~60μs       后台

GC 目标: STW < 500μs (通常 < 100μs)
```

---

## 5. GC 触发条件和调优？

**回答：**

```
GC 触发条件:
  ┌──────────────────┬──────────────────────────────┐
  │ 触发方式          │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ 堆增长           │ 堆大小达到上次GC后的GOGC%增长 │
  │                  │ GOGC=100 → 堆翻倍时触发       │
  │ 定时              │ 2 分钟没有 GC → 强制触发      │
  │ 手动              │ runtime.GC() 手动触发         │
  └──────────────────┴──────────────────────────────┘
```

```go
// GOGC: 控制 GC 频率
// GOGC=100 (默认): 堆增长 100% 触发
// GOGC=200: 堆增长 200% 触发 (GC 更少, 内存更大)
// GOGC=50:  堆增长 50% 触发 (GC 更频繁, 内存更小)
// GOGC=off: 关闭 GC

// Go 1.19+ GOMEMLIMIT: 内存软上限
// 比 GOGC 更好的控制方式
// 自动调整 GC 频率以控制内存在限制内
GOMEMLIMIT=1GiB  // 软限制 1GB

// 调优策略:
// 1. 减少内存分配量 (根本)
//    sync.Pool 复用对象
//    预分配 slice/map
//    避免不必要的 string ↔ []byte 转换

// 2. 调整 GOGC
//    内存充裕 + 低延迟 → 调大 GOGC (减少 GC 频率)
//    内存紧张 → 调小 GOGC 或用 GOMEMLIMIT

// 3. 大量临时对象用 sync.Pool
var bufPool = sync.Pool{
    New: func() interface{} {
        return bytes.NewBuffer(make([]byte, 0, 4096))
    },
}
buf := bufPool.Get().(*bytes.Buffer)
defer bufPool.Put(buf)
buf.Reset()
```

---

## 6. 逃逸分析？

**回答：**

```
逃逸分析: 编译器决定变量分配在栈还是堆

  栈分配: 快, 函数返回自动回收, 无 GC 压力
  堆分配: 慢, 需要 GC 回收, 有额外开销

规则: 变量的生命周期超出函数 → 逃逸到堆

常见逃逸场景:
  ┌──────────────────┬──────────────────────────────┐
  │ 场景              │ 原因                          │
  ├──────────────────┼──────────────────────────────┤
  │ 返回局部指针      │ 函数返回后仍需访问             │
  │ 发送到 channel    │ 可能被其他 goroutine 使用     │
  │ 赋值给 interface │ interface 存指针               │
  │ 闭包捕获变量      │ 闭包延长变量生命周期           │
  │ slice/map 过大    │ 栈空间不够                    │
  │ fmt.Println 等    │ 参数是 interface{}            │
  └──────────────────┴──────────────────────────────┘
```

```go
// 查看逃逸分析
// go build -gcflags="-m" main.go

// 逃逸: 返回局部变量指针
func newInt() *int {
    x := 42
    return &x // x 逃逸到堆
}

// 不逃逸: 局部使用
func noEscape() {
    x := 42  // 分配在栈
    fmt.Println(x) // 但 Println 的参数是 interface{} → x 逃逸
}

// 优化: 避免不必要的逃逸
// 差: 返回指针
func bad() *User { return &User{} } // 逃逸

// 好: 返回值 (小 struct)
func good() User { return User{} } // 栈分配

// 差: interface{} 参数
func log(msg interface{}) {} // 参数逃逸

// 好: 具体类型参数
func log(msg string) {} // 不逃逸
```

---

## 7. sync.Pool 原理和使用？

**回答：**

```go
// sync.Pool: 临时对象池, 减少内存分配和 GC 压力

var bufPool = sync.Pool{
    New: func() interface{} {
        return new(bytes.Buffer)
    },
}

func process(data []byte) {
    buf := bufPool.Get().(*bytes.Buffer) // 获取
    defer func() {
        buf.Reset()
        bufPool.Put(buf) // 归还
    }()
    buf.Write(data)
    // 使用 buf...
}

// 原理:
// 每个 P 有私有缓存 + 共享链表
// Get: 先从私有获取 → 再从共享链表 → 再从其他 P 偷 → New()
// Put: 放入私有缓存 (满了放共享链表)
// GC 时清空所有 Pool 中的对象!

// 适用场景:
// 高频创建/销毁的临时对象 (bytes.Buffer, 编解码器等)
// 不适合: 有状态的对象, 需要精确生命周期管理的对象

// 标准库使用:
// fmt.Println → 内部用 sync.Pool 复用 printer
// encoding/json → 复用 encoder/decoder
// net/http → 复用 bufio.Reader/Writer
```

---

## 8. 栈管理和栈增长？

**回答：**

```
Goroutine 栈:
  初始大小: 2KB (Go 1.4+, 之前是 8KB)
  最大大小: 1GB (默认)
  增长方式: 连续栈 (copystack)

栈增长过程:
  1. 函数调用时检查栈空间是否足够
  2. 不够 → 分配新栈 (通常 2 倍大小)
  3. 拷贝旧栈内容到新栈
  4. 更新所有指向旧栈的指针
  5. 释放旧栈

  旧栈:                    新栈:
  ┌──────┐                ┌──────────────┐
  │ 数据  │ ──拷贝──→    │ 数据          │
  │      │                │              │
  └──────┘                │              │
   2KB                    │              │
                          └──────────────┘
                           4KB

栈缩小:
  GC 阶段检查: 栈使用量 < 1/4 容量 → 缩小一半
  → 避免 goroutine 常驻但栈不释放

vs 分段栈 (Go 1.3 以前):
  分段栈: 用链表连接多段栈
  问题: "热分裂" — 函数调用在栈边界反复分配/释放
  连续栈: 拷贝整个栈, 避免热分裂
```

---

## 9. 内存泄漏场景和排查？

**回答：**

```
常见内存泄漏:
  ┌──────────────────┬──────────────────────────────┐
  │ 场景              │ 原因                          │
  ├──────────────────┼──────────────────────────────┤
  │ goroutine 泄漏    │ goroutine 永久阻塞不退出     │
  │ 全局 map 不清理   │ 只增不删, 持续增长            │
  │ slice 底层数组    │ 小 slice 引用大底层数组       │
  │ time.After 滥用   │ 每次循环创建新 timer          │
  │ 闭包引用          │ 闭包持有大对象引用            │
  │ cgo 内存          │ C 分配的内存不被 Go GC 管理   │
  │ 字符串截取        │ 子串引用原始大字符串           │
  └──────────────────┴──────────────────────────────┘
```

```go
// 排查工具
import _ "net/http/pprof" // 注册 pprof handler
go http.ListenAndServe(":6060", nil)

// 命令行
// go tool pprof http://localhost:6060/debug/pprof/heap
// go tool pprof http://localhost:6060/debug/pprof/goroutine

// 常见修复:
// 1. slice 泄漏
data := loadBigData() // 100MB
small := data[:10]    // 引用 100MB!
// 修复: 拷贝
small := make([]byte, 10)
copy(small, data[:10])

// 2. time.After 泄漏
for {
    select {
    case <-time.After(time.Second): // 每次创建新 timer!
        doWork()
    }
}
// 修复: 用 time.NewTimer + Reset
timer := time.NewTimer(time.Second)
defer timer.Stop()
for {
    select {
    case <-timer.C:
        doWork()
        timer.Reset(time.Second)
    }
}
```

---

## 10. 内存管理面试速答？

**回答：**

```
Q: Go 内存分配多少级?
A: 三级: mcache(P级无锁) → mcentral(全局) → mheap(堆)
   <16B tiny分配器, ≤32KB 按size class, >32KB 直接mheap

Q: GC 算法是什么?
A: 三色标记 + 混合写屏障
   并发标记 (与用户代码并行), STW < 100μs

Q: GOGC 怎么调?
A: 默认100, 堆翻倍触发GC
   调大→GC少但内存大, 调小→GC频繁但内存小
   Go 1.19+ 推荐用 GOMEMLIMIT

Q: 什么是逃逸分析?
A: 编译器判断变量分配在栈还是堆
   返回指针/发送channel/赋值interface → 逃逸到堆
   go build -gcflags="-m" 查看

Q: sync.Pool 有什么用?
A: 临时对象池, 减少分配和GC压力
   Get/Put 接口, GC 时会清空
   适合高频临时对象 (Buffer/编解码器)

Q: goroutine 栈多大?
A: 初始 2KB, 动态增长(翻倍拷贝), 最大 1GB
   GC 时可缩小 (使用量<1/4)

Q: 内存泄漏怎么排查?
A: pprof: heap/goroutine profile
   常见: goroutine泄漏, 全局map不清理
   slice 引用大底层数组, time.After 滥用
```
