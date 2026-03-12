# 内存管理与GC

---

## 1. Python的内存管理机制是怎样的？

**回答：**

Python 的内存管理分为多个层次：

```
┌──────────── Python 内存管理层次 ────────────┐
│                                             │
│  Layer 3: 对象特定分配器                      │
│  ┌─────────────────────────────────────┐    │
│  │ int, str, list, dict 各自的缓存池    │    │
│  └─────────────────────────────────────┘    │
│  Layer 2: Python 对象分配器 (pymalloc)       │
│  ┌─────────────────────────────────────┐    │
│  │ Arena → Pool → Block               │    │
│  │ 管理 ≤512 bytes 的小对象            │    │
│  └─────────────────────────────────────┘    │
│  Layer 1: Python 内存分配器                  │
│  ┌─────────────────────────────────────┐    │
│  │ 封装 malloc/free                    │    │
│  └─────────────────────────────────────┘    │
│  Layer 0: 操作系统内存管理                    │
│  ┌─────────────────────────────────────┐    │
│  │ malloc / free / mmap                │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**pymalloc 小对象分配器**：
- **Arena**：256KB，向 OS 申请的大块内存
- **Pool**：4KB（一个内存页），按固定大小的 Block 分配
- **Block**：8~512 bytes，用于分配小对象

```python
import sys

# 查看对象内存占用
sys.getsizeof(42)          # 28 bytes
sys.getsizeof("")          # 49 bytes
sys.getsizeof([])          # 56 bytes
sys.getsizeof({})          # 64 bytes

# 注意：sys.getsizeof 不递归计算引用对象的大小
lst = [1, 2, 3]
sys.getsizeof(lst)         # 只计算列表容器本身，不含元素
```

---

## 2. 引用计数的工作原理和局限性？

**回答：**

每个 Python 对象内部都有一个引用计数器 `ob_refcnt`，记录有多少引用指向该对象。

```python
import sys

a = []             # 创建列表，refcount = 1
b = a              # refcount = 2
c = [a]            # refcount = 3
print(sys.getrefcount(a))  # 4（getrefcount本身也会+1）

del b              # refcount - 1
c.pop()            # refcount - 1
del a              # refcount → 0 → 立即回收
```

```
┌──────── 引用计数变化时机 ────────┐
│                                 │
│  增加 (+1):                      │
│  • 赋值 a = obj                  │
│  • 传参 func(obj)                │
│  • 添加到容器 lst.append(obj)    │
│  • 属性引用 self.x = obj         │
│                                 │
│  减少 (-1):                      │
│  • del 语句                      │
│  • 变量超出作用域                 │
│  • 从容器移除                    │
│  • 变量重新赋值                  │
│                                 │
│  归零 → 立即释放内存              │
└─────────────────────────────────┘
```

**引用计数的局限性**：无法处理**循环引用**。

```python
# 循环引用示例
class Node:
    def __init__(self):
        self.ref = None

a = Node()
b = Node()
a.ref = b   # a 引用 b
b.ref = a   # b 引用 a

del a        # a 的refcount从2变为1（b.ref仍指向它）
del b        # b 的refcount从2变为1（a.ref仍指向它）
# 两个对象都无法被访问，但refcount不为0，无法回收！
# → 需要分代垃圾回收器来处理
```

---

## 3. 分代垃圾回收(Generational GC)如何工作？

**回答：**

CPython 使用**分代回收**处理循环引用，将对象按存活时间分为三代：

```
┌──────────── 分代垃圾回收 ────────────┐
│                                      │
│  第0代 (Generation 0):                │
│  ┌────────────────────────┐          │
│  │ 新创建的对象            │          │
│  │ GC频率最高（阈值700）    │          │
│  │ 大多数对象在此被回收     │          │
│  └──────────┬─────────────┘          │
│             │ 存活                    │
│  第1代 (Generation 1):                │
│  ┌──────────▼─────────────┐          │
│  │ 经历1次GC存活的对象     │          │
│  │ GC频率中等（阈值10）    │          │
│  └──────────┬─────────────┘          │
│             │ 存活                    │
│  第2代 (Generation 2):                │
│  ┌──────────▼─────────────┐          │
│  │ 长期存活的对象           │          │
│  │ GC频率最低（阈值10）     │          │
│  └────────────────────────┘          │
└──────────────────────────────────────┘
```

**GC 触发条件**：当某一代的对象分配数减去释放数超过阈值时触发该代的 GC。

```python
import gc

# 查看和设置阈值
print(gc.get_threshold())   # (700, 10, 10)
gc.set_threshold(800, 15, 15)

# 查看各代对象计数
print(gc.get_count())       # (245, 3, 1)

# 手动触发GC
gc.collect()                # 执行全量GC，返回回收的对象数
gc.collect(generation=0)    # 只回收第0代

# 禁用/启用自动GC
gc.disable()
gc.enable()

# 查看无法回收的循环引用
gc.set_debug(gc.DEBUG_SAVEALL)
gc.collect()
print(gc.garbage)  # 有 __del__ 方法的循环引用对象
```

**标记-清除算法**：
1. 从根对象出发，标记所有可达的对象
2. 清除未被标记的对象（即不可达的循环引用组）
3. 仅对容器对象（list/dict/set/tuple等）执行，非容器对象不参与

---

## 4. gc模块的调优和使用技巧？

**回答：**

```python
import gc

# 场景1：性能关键场景，暂停GC
gc.disable()
# ... 执行性能敏感代码 ...
gc.enable()
gc.collect()  # 手动在合适时机收集

# 场景2：调试内存泄漏
gc.set_debug(gc.DEBUG_LEAK)  # 开启泄漏检测
gc.collect()
# 查看无法回收的对象
for obj in gc.garbage:
    print(type(obj), obj)

# 场景3：查看对象的引用关系
gc.get_referrers(obj)   # 谁引用了obj
gc.get_referents(obj)   # obj引用了谁

# 场景4：弱引用避免循环引用
import weakref

class Cache:
    def __init__(self):
        self._cache = weakref.WeakValueDictionary()

    def get(self, key):
        return self._cache.get(key)

    def set(self, key, value):
        self._cache[key] = value
        # 当value没有其他强引用时，自动从缓存中移除
```

```
┌──────── GC 调优建议 ────────┐
│                              │
│ 1. 避免循环引用               │
│    - 使用 weakref            │
│    - 避免 __del__ + 循环引用  │
│                              │
│ 2. 性能优化                  │
│    - 批量操作时临时disable GC │
│    - 调高阈值减少GC频率       │
│                              │
│ 3. 调试内存问题               │
│    - gc.set_debug()          │
│    - objgraph 第三方工具      │
│    - tracemalloc 追踪分配     │
└──────────────────────────────┘
```

---

## 5. Python的内存池(Memory Pool)机制？

**回答：**

CPython 对频繁使用的小对象实现了**对象缓存池**，避免重复的 malloc/free。

```
┌──────── 对象缓存机制 ────────┐
│                              │
│ 小整数池:                     │
│  [-5, 256] 预先创建并缓存     │
│  a = 100; b = 100            │
│  a is b → True               │
│                              │
│ 字符串驻留:                   │
│  简单字符串自动缓存            │
│  "hello" is "hello" → True   │
│  (仅限字母数字下划线)         │
│                              │
│ 空元组/空字符串:               │
│  () is () → True（单例）      │
│  "" is "" → True（单例）      │
│                              │
│ float自由列表:                │
│  释放的float对象放入缓存       │
│  下次创建float优先从缓存取     │
│                              │
│ list/dict/tuple自由列表:      │
│  空容器释放后保留结构          │
│  下次创建时复用，减少malloc    │
└──────────────────────────────┘
```

```python
# 验证小整数池
a, b = 256, 256
print(a is b)   # True

a, b = 257, 257
print(a is b)   # 取决于上下文（交互模式False，同一代码块可能True）

# 字符串驻留
import sys
a = sys.intern("a long string that we want to intern")
b = sys.intern("a long string that we want to intern")
print(a is b)   # True（手动驻留）

# pymalloc 分配器管理 ≤512 bytes 的小对象
# 超过 512 bytes 直接使用 malloc
```

---

## 6. __slots__ 如何减少内存消耗？

**回答：**

默认情况下，每个实例有一个 `__dict__` 字典存储属性，字典的开销很大。`__slots__` 用固定的描述符替代 `__dict__`。

```python
import sys

class WithDict:
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z

class WithSlots:
    __slots__ = ('x', 'y', 'z')
    def __init__(self, x, y, z):
        self.x = x
        self.y = y
        self.z = z

obj1 = WithDict(1, 2, 3)
obj2 = WithSlots(1, 2, 3)

# 单个实例的内存差异
print(sys.getsizeof(obj1) + sys.getsizeof(obj1.__dict__))  # ~200 bytes
print(sys.getsizeof(obj2))  # ~64 bytes

# 大量实例时效果显著
# 1百万个对象：WithDict ~200MB vs WithSlots ~64MB
```

```
┌──────── 内存布局对比 ────────┐
│                              │
│ 有 __dict__:                 │
│ ┌──────────┐  ┌───────────┐ │
│ │ PyObject │→ │ __dict__  │ │
│ │ header   │  │ {x:1,y:2} │ │
│ │ (16 B)   │  │ (~200 B)  │ │
│ └──────────┘  └───────────┘ │
│                              │
│ 有 __slots__:                │
│ ┌──────────────────┐        │
│ │ PyObject header  │        │
│ │ slot_x = 1       │        │
│ │ slot_y = 2       │        │
│ │ slot_z = 3       │        │
│ │ (~64 B)          │        │
│ └──────────────────┘        │
└──────────────────────────────┘
```

**适用场景**：创建大量实例的数据类（如 ORM 行对象、坐标点、树节点）。

---

## 7. 弱引用(weak reference)的原理和使用场景？

**回答：**

弱引用不增加对象的引用计数，当对象只剩弱引用时会被 GC 回收。

```python
import weakref

class ExpensiveObject:
    def __init__(self, name):
        self.name = name
    def __repr__(self):
        return f"ExpensiveObject({self.name})"

# 创建弱引用
obj = ExpensiveObject("data")
weak = weakref.ref(obj)

print(weak())   # ExpensiveObject(data)（解引用）
del obj
print(weak())   # None（对象已被回收）

# 弱引用回调
def callback(ref):
    print(f"对象被回收了: {ref}")

obj = ExpensiveObject("data")
weak = weakref.ref(obj, callback)
del obj  # 触发回调

# WeakValueDictionary - 缓存场景
class ObjectCache:
    def __init__(self):
        self._cache = weakref.WeakValueDictionary()

    def get_or_create(self, key, factory):
        obj = self._cache.get(key)
        if obj is None:
            obj = factory(key)
            self._cache[key] = obj
        return obj

# WeakSet - 观察者模式
class EventEmitter:
    def __init__(self):
        self._listeners = weakref.WeakSet()

    def add_listener(self, listener):
        self._listeners.add(listener)

    def emit(self, event):
        for listener in self._listeners:
            listener.handle(event)
    # listener 被删除后自动从集合中移除
```

**注意**：`int`、`str`、`tuple`、`None` 等不可变基本类型不支持弱引用。

---

## 8. tracemalloc如何追踪内存分配？

**回答：**

`tracemalloc` 是 Python 3.4+ 内置的内存分配追踪工具。

```python
import tracemalloc

# 开始追踪
tracemalloc.start()

# 执行需要分析的代码
data = [list(range(1000)) for _ in range(100)]
more_data = {str(i): list(range(100)) for i in range(1000)}

# 获取当前内存快照
snapshot = tracemalloc.take_snapshot()

# 按文件统计内存分配
top_stats = snapshot.statistics('filename')
print("[ Top 5 内存消耗 ]")
for stat in top_stats[:5]:
    print(stat)

# 按行统计
top_stats = snapshot.statistics('lineno')
for stat in top_stats[:10]:
    print(stat)

# 对比两个快照（检测内存泄漏）
snapshot1 = tracemalloc.take_snapshot()
# ... 执行一些操作 ...
snapshot2 = tracemalloc.take_snapshot()

diff = snapshot2.compare_to(snapshot1, 'lineno')
print("[ 内存变化 ]")
for stat in diff[:10]:
    print(stat)

# 查看当前内存使用
current, peak = tracemalloc.get_traced_memory()
print(f"当前: {current/1024/1024:.1f}MB, 峰值: {peak/1024/1024:.1f}MB")

tracemalloc.stop()
```

```
┌──────── 内存分析工具 ────────┐
│                              │
│ 内置:                         │
│ • sys.getsizeof()  对象大小  │
│ • tracemalloc      分配追踪  │
│ • gc               GC调试    │
│                              │
│ 第三方:                       │
│ • memory_profiler   逐行分析 │
│ • objgraph          引用关系 │
│ • pympler           详细统计 │
│ • guppy/heapy       堆分析  │
└──────────────────────────────┘
```

---

## 9. 常见的内存泄漏场景和排查方法？

**回答：**

```python
# 场景1：循环引用 + __del__
class Leaky:
    def __init__(self):
        self.ref = None
    def __del__(self):
        print("del")  # 有 __del__ 的循环引用在 Python 3.4 前无法回收
                       # Python 3.4+ 已修复（PEP 442）

a, b = Leaky(), Leaky()
a.ref = b
b.ref = a

# 场景2：全局变量/类变量无限增长
class BadCache:
    _cache = {}  # 类变量，永远不清理
    @classmethod
    def add(cls, key, value):
        cls._cache[key] = value  # 不断增长

# 场景3：闭包持有大对象引用
def process():
    huge_data = load_huge_data()
    def callback():
        return len(huge_data)  # 闭包持有huge_data，无法释放
    register_callback(callback)

# 场景4：未关闭的资源
# 文件、数据库连接、网络连接未正确关闭

# 排查方法
import gc
import tracemalloc
import objgraph  # pip install objgraph

# 方法1：objgraph 查看对象增长
objgraph.show_growth(limit=10)       # 显示对象数量增长
objgraph.show_most_common_types(20)  # 最常见类型
objgraph.show_backrefs(obj)          # 反向引用图

# 方法2：gc 查找不可达对象
gc.collect()
gc.set_debug(gc.DEBUG_SAVEALL)
gc.collect()
print(len(gc.garbage))

# 方法3：tracemalloc 对比快照
# （见上一题）
```

```
┌──────── 防止内存泄漏的实践 ────────┐
│                                    │
│ 1. 使用 with 管理资源               │
│ 2. 使用 weakref 打破循环引用        │
│ 3. 缓存使用 LRU/TTL 限制大小       │
│ 4. 避免在全局/类变量中存储大量数据  │
│ 5. 注意闭包对外部变量的引用         │
│ 6. 定期检查 gc.garbage              │
│ 7. 使用 __slots__ 减少对象内存占用  │
└────────────────────────────────────┘
```

---

## 10. 内存管理与GC面试速答？

**回答：**

```
Q: Python用什么垃圾回收策略？
A: 以引用计数为主（实时回收），分代垃圾回收为辅（处理循环引用），使用标记-清除算法。

Q: 引用计数归零后对象何时回收？
A: 立即回收。这是引用计数的优势——低延迟、实时释放。

Q: 什么是循环引用？如何避免？
A: 两个或多个对象相互引用形成环。使用weakref弱引用、手动断开引用，或依赖分代GC自动处理。

Q: Python的三代GC各有什么特点？
A: 第0代频率最高（新对象），第1代中频，第2代最低（长寿对象）。阈值默认(700,10,10)。

Q: sys.getsizeof和实际内存占用的区别？
A: getsizeof只返回对象本身大小，不含引用的子对象。要算总大小需递归计算或用pympler。

Q: __del__方法和垃圾回收的关系？
A: __del__是析构器，对象被回收前调用。Python 3.4+即使有__del__的循环引用也能回收。

Q: 什么是内存池？
A: CPython的pymalloc分配器为≤512bytes的小对象维护Arena-Pool-Block三级内存池，避免频繁调用malloc。

Q: 如何查看对象的引用计数？
A: sys.getrefcount(obj)，注意返回值比实际多1（函数参数本身增加了一次引用）。

Q: 什么时候需要手动调用gc.collect()？
A: 批量删除大量对象后、内存敏感场景需要及时回收时、或关闭自动GC后手动管理时。

Q: Python的小整数池范围是多少？
A: CPython缓存[-5, 256]的整数对象，这个范围内的整数是单例的。
```
