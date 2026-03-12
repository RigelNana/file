# TopK问题

> Top-K 是堆的最经典应用，包括第K大元素、前K频率、对顶堆求中位数。

---

## 1. 第 K 大元素

### LeetCode 215

```
找数组中第 k 大的元素

方法:
  1. 排序 O(n log n)
  2. 最小堆 O(n log k) ← 面试常考
  3. 快速选择 O(n) 平均 (不稳定)

最小堆法:
  维护大小为 k 的最小堆
  堆中始终是最大的 k 个元素
  堆顶就是第 k 大

  [3, 2, 1, 5, 6, 4], k = 2

  ┌────────────────────────────────────┐
  │ 元素  堆状态        动作           │
  ├────────────────────────────────────┤
  │  3   [3]           push           │
  │  2   [2, 3]        push (堆满k)   │
  │  1   [2, 3]        1<堆顶2, 跳过  │
  │  5   [3, 5]        pop2, push5    │
  │  6   [5, 6]        pop3, push6    │
  │  4   [5, 6]        4<堆顶5, 跳过  │
  └────────────────────────────────────┘
  答案: 堆顶 = 5
```

```python
import heapq

def findKthLargest(nums, k):
    heap = []
    for x in nums:
        heapq.heappush(heap, x)
        if len(heap) > k:
            heapq.heappop(heap)        # ⚠️ 弹出最小的, 保留最大的k个
    return heap[0]                     # ⚠️ 堆顶就是第k大

# 更简洁的写法:
def findKthLargest_v2(nums, k):
    return heapq.nlargest(k, nums)[-1]

# ⚠️ 为什么用最小堆而非最大堆?
#    最小堆保留最大的 k 个元素
#    超过 k 个时弹出最小的 (不需要的)
#    堆顶是 k 个中最小的 = 第 k 大
#
# ⚠️ 时间: O(n log k), 空间: O(k)
#    如果 k << n, 比排序 O(n log n) 快
```

---

## 2. 前 K 个高频元素

### LeetCode 347

```
给定数组, 返回出现频率最高的 k 个元素

方法: 统计频率 → 堆取 Top-K
```

```python
import heapq
from collections import Counter

def topKFrequent(nums, k):
    count = Counter(nums)
    # 方法1: nlargest
    return heapq.nlargest(k, count.keys(), key=count.get)
    
    # 方法2: 最小堆
    # heap = []
    # for num, freq in count.items():
    #     heapq.heappush(heap, (freq, num))
    #     if len(heap) > k:
    #         heapq.heappop(heap)
    # return [num for freq, num in heap]

# ⚠️ nlargest 的 key 参数:
#    key=count.get → 按频率排序
#    返回的是 keys (即数字本身)
```

---

## 3. 数据流的中位数 (对顶堆)

### LeetCode 295

```
设计数据结构, 支持:
  addNum(num): 添加数
  findMedian(): 返回中位数

对顶堆:
  small: 最大堆 ← 较小的一半 (存负数)
  large: 最小堆 ← 较大的一半

  维护: len(small) == len(large) 或 len(small) == len(large) + 1

  中位数:
    奇数: -small[0]
    偶数: (-small[0] + large[0]) / 2

  可视化:
    small (最大堆, 存负)    large (最小堆)
        ┌──5──┐               ┌──6──┐
        │     │               │     │
       3      4              8      9

    中位数 = (5 + 6) / 2 = 5.5
```

```python
import heapq

class MedianFinder:
    def __init__(self):
        self.small = []          # ⚠️ 最大堆 (存负数), 较小一半
        self.large = []          # ⚠️ 最小堆, 较大一半
    
    def addNum(self, num):
        # 1. 先 push 到 small
        heapq.heappush(self.small, -num)
        
        # 2. small 最大移到 large (保证 small 所有 ≤ large 所有)
        heapq.heappush(self.large, -heapq.heappop(self.small))
        
        # 3. 如果 large 更长, 移一个回 small
        if len(self.large) > len(self.small):
            heapq.heappush(self.small, -heapq.heappop(self.large))
    
    def findMedian(self):
        if len(self.small) > len(self.large):
            return -self.small[0]
        return (-self.small[0] + self.large[0]) / 2

# ⚠️ addNum 三步操作:
#    step1: 无条件入 small
#    step2: small最大 → large (维持有序)
#    step3: 平衡大小 (small ≥ large)
#
# ⚠️ 为什么不直接判断放哪边?
#    三步法更简洁, 不需要分类讨论
#    自动维护: small所有 ≤ large所有 + 大小平衡
#
# ⚠️ 时间: addNum O(log n), findMedian O(1)
```

---

## 4. LeetCode 1046: 最后一块石头的重量

```
每次取最重的两块石头碰撞
如果重量相同, 两块都碎
如果不同, 较轻的碎, 较重的变成差值
返回最后剩下石头的重量 (没有返回 0)
```

```python
import heapq

def lastStoneWeight(stones):
    heap = [-s for s in stones]        # ⚠️ 最大堆
    heapq.heapify(heap)
    
    while len(heap) > 1:
        a = -heapq.heappop(heap)       # 最大
        b = -heapq.heappop(heap)       # 次大
        if a != b:
            heapq.heappush(heap, -(a - b))  # ⚠️ 差值放回
    
    return -heap[0] if heap else 0

# ⚠️ 简单的最大堆应用
#    每次取两个最大, 处理后放回
```

---

## 5. Top-K 模式总结

```
┌────────────────────┬──────────────┬─────────────────┐
│ 问题               │ 堆类型       │ 堆大小           │
├────────────────────┼──────────────┼─────────────────┤
│ 第 K 大            │ 最小堆       │ k               │
│ 第 K 小            │ 最大堆       │ k               │
│ 前 K 大            │ 最小堆       │ k               │
│ 前 K 小            │ 最大堆       │ k               │
│ 中位数             │ 对顶堆       │ n/2 + n/2       │
│ 数据流最值         │ 对应堆       │ n               │
└────────────────────┴──────────────┴─────────────────┘

⚠️ 第K大用最小堆 (反直觉!):
   维护最大的k个, 堆顶=k个中最小=第k大
   堆大小k, 每次操作 O(log k) 很快

⚠️ 对顶堆:
   两个堆互相喂, 自动维护有序
   small 保证最大, large 保证最小
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 数组中第K大元素 | 215 | 最小堆TopK |
| Med | 前K个高频元素 | 347 | 计数+堆 |
| Hard | 数据流的中位数 | 295 | 对顶堆 |
| Easy | 最后一块石头重量 | 1046 | 最大堆基础 |
| Med | K closest points | 973 | 最大堆TopK |

---

## 本节要点速查

```
✅ 第K大: 最小堆, 大小k, 堆顶=答案
✅ len(heap)>k 时 heappop 弹最小的
✅ 对顶堆: small(最大堆存负)+large(最小堆)
✅ addNum 三步: push small → 移 large → 平衡
✅ 中位数: 奇数-small[0], 偶数(-small[0]+large[0])/2
✅ 时间: push/pop O(log k), peek O(1)
```
