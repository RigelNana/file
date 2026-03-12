# Python语言八股文

## 一、基础语法与数据类型

### 1. Python中的可变与不可变类型有哪些？区别是什么？

**答：**

**不可变类型**：`int`、`float`、`str`、`tuple`、`frozenset`、`bytes`，对象创建后值不能被修改，修改操作实际上创建了新对象。

**可变类型**：`list`、`dict`、`set`、`bytearray`，对象创建后可以在原地修改内容。

```
┌───────────────────────────────────────────────┐
│            可变 vs 不可变                       │
├──────────────────┬────────────────────────────┤
│   不可变类型      │   可变类型                  │
├──────────────────┼────────────────────────────┤
│  int, float      │   list                     │
│  str, tuple      │   dict, set                │
│  frozenset       │   bytearray                │
├──────────────────┼────────────────────────────┤
│ 修改→创建新对象    │   修改→原地修改             │
│ 可做dict的key     │   不可做dict的key           │
│ 线程安全          │   需要加锁                  │
└──────────────────┴────────────────────────────┘
```

核心区别：不可变对象修改后 `id()` 会变，可变对象修改后 `id()` 不变。不可变类型可以作为字典的 key 和集合的元素，可变类型不行。

### 2. list、tuple、dict、set 各自的特点和使用场景？

**答：**

| 类型 | 有序 | 可变 | 可重复 | 底层结构 | 典型场景 |
|------|------|------|--------|----------|----------|
| list | ✅ | ✅ | ✅ | 动态数组 | 需要增删改的有序集合 |
| tuple | ✅ | ❌ | ✅ | 固定数组 | 不变的记录、做dict key |
| dict | ✅(3.7+) | ✅ | key不可 | 哈希表 | 键值映射、快速查找 |
| set | ❌ | ✅ | ❌ | 哈希表 | 去重、集合运算 |

- **list** 查询 O(1)，插入/删除 O(n)，append O(1) 均摊
- **dict/set** 查找/插入/删除均为 O(1) 平均
- **tuple** 比 list 更省内存，创建速度更快

---

## 二、函数与装饰器

### 3. Python装饰器的原理是什么？如何实现一个带参数的装饰器？

**答：**

装饰器本质上是一个**接受函数作为参数并返回新函数**的高阶函数。`@decorator` 是 `func = decorator(func)` 的语法糖。

```python
import functools

# 带参数的装饰器 = 三层嵌套
def retry(max_retries=3):
    def decorator(func):
        @functools.wraps(func)  # 保留原函数元信息
        def wrapper(*args, **kwargs):
            for i in range(max_retries):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    if i == max_retries - 1:
                        raise
            return None
        return wrapper
    return decorator

@retry(max_retries=5)
def fetch_data(url):
    ...
```

关键点：`functools.wraps` 保留被装饰函数的 `__name__`、`__doc__` 等元信息。

### 4. *args和**kwargs的作用？函数参数的传递顺序是什么？

**答：**

- `*args`：接收任意数量的位置参数，打包为 tuple
- `**kwargs`：接收任意数量的关键字参数，打包为 dict

参数定义顺序：**普通参数 → *args → keyword-only参数 → **kwargs**

```python
def func(a, b, *args, key=None, **kwargs):
    pass

# a, b: 普通位置参数
# *args: 额外位置参数
# key: 仅关键字参数(keyword-only)
# **kwargs: 额外关键字参数
```

Python 是**传对象引用**（既不是传值也不是传引用），可变对象在函数内修改会影响外部，不可变对象不会。

---

## 三、面向对象编程

### 5. Python的MRO（方法解析顺序）是如何工作的？

**答：**

Python 3 使用 **C3线性化算法** 计算 MRO，保证：
1. 子类优先于父类
2. 多个父类按定义顺序排列
3. 满足单调性原则

```python
class A: pass
class B(A): pass
class C(A): pass
class D(B, C): pass

print(D.__mro__)
# (<class 'D'>, <class 'B'>, <class 'C'>, <class 'A'>, <class 'object'>)
```

```
┌─────────────────────────┐
│     MRO: D → B → C → A  │
│                         │
│          D              │
│         / \             │
│        B   C            │
│         \ /             │
│          A              │
│          |              │
│        object           │
└─────────────────────────┘
```

`super()` 沿 MRO 链调用下一个类的方法，而不是直接调用父类。

### 6. 什么是元类(metaclass)？有什么应用场景？

**答：**

元类是**创建类的类**。普通对象是类的实例，类是元类的实例。默认元类是 `type`。

```python
# type 是所有类的元类
class MyMeta(type):
    def __new__(mcs, name, bases, namespace):
        # 在类创建时可以修改类的行为
        namespace['created_by'] = 'MyMeta'
        return super().__new__(mcs, name, bases, namespace)

class MyClass(metaclass=MyMeta):
    pass

print(MyClass.created_by)  # 'MyMeta'
```

应用场景：ORM 框架（Django Model）、单例模式、接口约束检查、自动注册子类。

---

## 四、迭代器与生成器

### 7. 迭代器与生成器的区别？yield的工作原理？

**答：**

**迭代器**：实现 `__iter__()` 和 `__next__()` 方法的对象，遵循迭代器协议。

**生成器**：包含 `yield` 的函数，调用后返回一个生成器对象（特殊的迭代器），自动实现迭代器协议。

```python
# 生成器函数
def fibonacci(n):
    a, b = 0, 1
    for _ in range(n):
        yield a          # 暂停执行，返回值
        a, b = b, a + b  # 下次next()从这里恢复

# 生成器表达式
squares = (x**2 for x in range(10))
```

`yield` 的原理：函数执行到 `yield` 时暂停，保存当前栈帧状态。调用 `next()` 时从上次暂停处恢复执行。生成器是**惰性求值**，节省内存。

---

## 五、并发与异步编程

### 8. GIL是什么？它对Python多线程有什么影响？

**答：**

GIL（Global Interpreter Lock，全局解释器锁）是 CPython 中的互斥锁，**同一时刻只允许一个线程执行 Python 字节码**。

```
┌──────────────────────────────────────────┐
│              GIL 的影响                   │
├────────────────┬─────────────────────────┤
│   CPU密集型     │   I/O密集型             │
├────────────────┼─────────────────────────┤
│ 多线程无法并行   │  多线程有效（等待时释放GIL）│
│ 应使用多进程     │  threading 或 asyncio   │
│ multiprocessing │  concurrent.futures    │
└────────────────┴─────────────────────────┘
```

- **CPU 密集型任务**：GIL 导致多线程无法利用多核，应使用 `multiprocessing` 或 C 扩展
- **I/O 密集型任务**：线程在 I/O 等待时会释放 GIL，多线程仍有效
- Python 3.13 引入了可选的 free-threaded 模式（无 GIL 实验性支持）

### 9. asyncio的事件循环是怎么工作的？

**答：**

`asyncio` 基于**事件循环 + 协程**实现单线程并发：

```python
import asyncio

async def fetch(url):
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as resp:
            return await resp.text()

async def main():
    # 并发执行多个协程
    results = await asyncio.gather(
        fetch("http://api1.com"),
        fetch("http://api2.com"),
    )

asyncio.run(main())
```

事件循环不断从任务队列取出协程执行，遇到 `await` 时挂起当前协程、执行其他就绪的协程，实现 I/O 多路复用。比多线程更轻量，无 GIL 和上下文切换开销。

---

## 六、内存管理与GC

### 10. Python的垃圾回收机制是怎样的？

**答：**

Python 采用**引用计数为主 + 分代回收为辅**的垃圾回收策略：

1. **引用计数**：每个对象维护引用计数器，计数归零立即回收。优点是实时性好，缺点是无法处理循环引用。

2. **分代回收**：将对象分为三代（0/1/2），新创建的对象在第 0 代，经过一次 GC 存活后晋升。高代 GC 频率低。专门处理循环引用。

3. **标记-清除**：对容器对象（list/dict/set等）进行可达性分析，回收不可达的循环引用组。

```python
import gc

gc.get_threshold()    # (700, 10, 10) 各代触发阈值
gc.collect()          # 手动触发全量GC
gc.get_count()        # 查看各代对象计数
```

---

## 七、标准库与常用模块

### 11. collections模块中有哪些常用数据结构？

**答：**

| 类型 | 说明 | 典型用途 |
|------|------|----------|
| `defaultdict` | 带默认值的字典 | 分组统计 |
| `Counter` | 计数器字典 | 词频统计 |
| `OrderedDict` | 有序字典(3.7前) | 需要排序的映射 |
| `deque` | 双端队列 | 滑动窗口、BFS |
| `namedtuple` | 命名元组 | 轻量级数据类 |
| `ChainMap` | 字典链 | 多层配置合并 |

```python
from collections import defaultdict, Counter, deque

# defaultdict 分组
d = defaultdict(list)
for k, v in data:
    d[k].append(v)

# Counter 统计
c = Counter("abracadabra")  # Counter({'a': 5, 'b': 2, ...})

# deque 高效两端操作
q = deque(maxlen=5)  # 固定长度，自动丢弃旧元素
```

---

## 八、Web框架与ORM

### 12. Flask、Django、FastAPI 各自的特点和适用场景？

**答：**

```
┌────────────┬───────────────┬───────────────┬───────────────┐
│   特性      │  Flask        │   Django      │  FastAPI      │
├────────────┼───────────────┼───────────────┼───────────────┤
│  类型       │ 微框架        │  全栈框架      │ 异步API框架    │
│  ORM       │ 需自选        │  内置          │ 需自选         │
│  异步       │ 2.0+支持      │  3.1+支持     │  原生支持      │
│  性能       │ 中等          │  中等         │  高            │
│  学习曲线   │ 低            │  中           │  低            │
│  适用场景   │ 小型项目/API  │  大型全栈项目  │  高性能API     │
│  自动文档   │ 需插件        │  需插件       │  内置OpenAPI   │
└────────────┴───────────────┴───────────────┴───────────────┘
```

- **Flask**：灵活轻量，适合微服务和小型项目
- **Django**：自带 Admin、ORM、认证等，适合快速开发全栈应用
- **FastAPI**：基于类型提示，自动生成文档，异步高性能，适合现代 API 服务

---

## 九、性能优化与调试

### 13. Python有哪些常用的性能分析和优化手段？

**答：**

**性能分析工具**：
- `cProfile`：函数级别 CPU 耗时分析
- `timeit`：微基准测试
- `memory_profiler`：逐行内存分析
- `line_profiler`：逐行时间分析

**常见优化技巧**：
1. 选择合适的数据结构（dict/set 查找 O(1)）
2. 使用列表推导代替 for 循环
3. 避免在循环中做重复计算
4. 使用 `__slots__` 减少内存消耗
5. 利用 `lru_cache` 缓存重复计算
6. 使用 NumPy/Pandas 处理数值计算
7. C 扩展（Cython）或 PyPy 替代 CPython

```python
from functools import lru_cache

@lru_cache(maxsize=128)
def expensive_compute(n):
    ...
```

---

## 十、Python工程实践

### 14. Python项目的标准目录结构是怎样的？

**答：**

```
my_project/
├── src/
│   └── my_package/
│       ├── __init__.py
│       ├── core.py
│       └── utils.py
├── tests/
│   ├── __init__.py
│   ├── test_core.py
│   └── conftest.py
├── docs/
├── pyproject.toml        # 项目配置（推荐）
├── setup.cfg             # 可选
├── requirements.txt      # 依赖清单
├── Makefile
├── .gitignore
└── README.md
```

推荐使用 `pyproject.toml`（PEP 621）统一管理项目元数据、依赖和工具配置。配合 Poetry 或 PDM 进行依赖管理。

### 15. pytest的核心特性和常用技巧？

**答：**

```python
import pytest

# fixture 提供测试依赖
@pytest.fixture
def db_session():
    session = create_session()
    yield session
    session.close()

# 参数化测试
@pytest.mark.parametrize("input,expected", [
    (1, 1), (2, 4), (3, 9),
])
def test_square(input, expected):
    assert input ** 2 == expected

# 异常断言
def test_division_by_zero():
    with pytest.raises(ZeroDivisionError):
        1 / 0
```

核心特性：自动发现测试、fixture 依赖注入、参数化、mark 标记、插件生态（pytest-cov/pytest-asyncio/pytest-mock）。
