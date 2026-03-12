# BIT经典应用

> 树状数组在逆序对计数、区间修改+区间查询、二维前缀和等场景中的典型用法。

---

## 1. 逆序对计数

```
逆序对: i < j 但 a[i] > a[j]

方法: 从右到左扫描, 用 BIT 统计"已出现的比当前小的数有多少个"

  ⚠️ 需要离散化: 将值映射到 [1, n] 的排名
     因为 BIT 下标代表值, 值域太大需要压缩

  例: nums = [5, 2, 6, 1]
  排名:       2  1  3  0  (错, 应从1开始)
  离散化: 排序去重 [1,2,5,6] → {1:1, 2:2, 5:3, 6:4}
  
  从右到左:
    处理 1 (rank=1): query(0) = 0 个比它小 → 逆序对 0
    处理 6 (rank=4): query(3) = 1 个比它小 → 逆序对 1
    处理 2 (rank=2): query(1) = 1 个比它小 → 逆序对 1
    处理 5 (rank=3): query(2) = 2 个比它小 → 逆序对 2 (不是逆序)
    等等... (实际从右往左看的是"右边比自己小的")
    但这求的是"右边比自己小的", 不是逆序对
    
  正确方法: 从右到左, 每次 count += query(rank[x] - 1)
    这是右边已插入的 比 x 小的数的个数
    
  ⚠️ 也可以从左到右, 每次 count += (已插入数量 - query(rank[x]))
     即左边已插入的 比 x 大的数的个数
```

```python
def count_inversions(nums):
    # 离散化
    sorted_unique = sorted(set(nums))
    rank = {v: i + 1 for i, v in enumerate(sorted_unique)}
    # ⚠️ rank 从 1 开始 (BIT 是 1-indexed)
    
    bit = BIT(len(sorted_unique))
    count = 0
    
    for x in reversed(nums):              # ⚠️ 从右到左
        count += bit.query(rank[x] - 1)   # ⚠️ 右边比 x 小的个数
        bit.update(rank[x], 1)            # ⚠️ 标记 x 出现
    
    return count

# 时间 O(n log n), 空间 O(n)
```

---

## 2. LeetCode 315: 计算右侧小于当前元素的个数

```python
def countSmaller(nums):
    sorted_unique = sorted(set(nums))
    rank = {v: i + 1 for i, v in enumerate(sorted_unique)}
    
    bit = BIT(len(sorted_unique))
    result = []
    
    for x in reversed(nums):
        result.append(bit.query(rank[x] - 1))  # ⚠️ 右边比 x 小的个数
        bit.update(rank[x], 1)
    
    result.reverse()                       # ⚠️ 反转! 因为是从右到左处理的
    return result

# ⚠️ 和逆序对计数几乎一样
#    区别: 逆序对求总和, 这里求每个位置的值
```

---

## 3. 区间修改 + 区间查询 (双BIT)

```
目标: 区间 [l,r] 加 val + 查询区间 [l,r] 的和

用两个 BIT: b1 维护差分, b2 维护 i×d[i]

prefix_sum(i) = b1.query(i) × i - b2.query(i)

区间加 [l,r] val:
  b1.update(l, val),    b1.update(r+1, -val)
  b2.update(l, val*(l-1)), b2.update(r+1, -val*r)
```

```python
class BIT_RangeRange:
    """区间修改 + 区间查询"""
    def __init__(self, n):
        self.n = n
        self.b1 = BIT(n)                   # 维护差分
        self.b2 = BIT(n)                   # 维护 i × d[i]
    
    def range_add(self, l, r, val):
        """[l, r] 区间加 val"""
        self.b1.update(l, val)
        self.b1.update(r + 1, -val)
        self.b2.update(l, val * (l - 1))   # ⚠️ l-1, 不是 l
        self.b2.update(r + 1, -val * r)    # ⚠️ -val * r
    
    def prefix_sum(self, i):
        """前缀和 sum(a[1..i])"""
        return self.b1.query(i) * i - self.b2.query(i)
    
    def range_sum(self, l, r):
        """区间和 sum(a[l..r])"""
        return self.prefix_sum(r) - self.prefix_sum(l - 1)

# ⚠️ 推导:
#  a[i] = Σd[j] (j=1..i)
#  prefix_sum(i) = Σa[k] = Σ(k=1..i) Σ(j=1..k) d[j]
#                = Σ(j=1..i) d[j] × (i-j+1)
#                = (i+1)×Σd[j] - Σj×d[j]
#  用 b1 维护 Σd[j], b2 维护 Σj×d[j]
```

---

## 4. 二维树状数组

```python
class BIT2D:
    """二维树状数组: 单点修改 + 矩形区域和"""
    def __init__(self, m, n):
        self.m, self.n = m, n
        self.tree = [[0] * (n + 1) for _ in range(m + 1)]
    
    def update(self, x, y, delta):
        i = x
        while i <= self.m:
            j = y
            while j <= self.n:
                self.tree[i][j] += delta
                j += j & (-j)
            i += i & (-i)
    
    def query(self, x, y):
        """sum(a[1..x][1..y])"""
        s = 0
        i = x
        while i > 0:
            j = y
            while j > 0:
                s += self.tree[i][j]
                j -= j & (-j)
            i -= i & (-i)
        return s
    
    def range_query(self, x1, y1, x2, y2):
        """sum(a[x1..x2][y1..y2])"""
        return (self.query(x2, y2) 
                - self.query(x1-1, y2) 
                - self.query(x2, y1-1) 
                + self.query(x1-1, y1-1))  # ⚠️ 二维前缀和容斥
```

---

## 5. BIT 求第 k 小

```python
def kth_smallest(bit, k):
    """在 BIT 中找前缀和 >= k 的最小下标"""
    n = bit.n
    pos = 0
    bit_len = n.bit_length()               # ⚠️ 最高位
    
    for i in range(bit_len, -1, -1):
        nxt = pos + (1 << i)
        if nxt <= n and bit.tree[nxt] < k:
            k -= bit.tree[nxt]
            pos = nxt
    
    return pos + 1                         # ⚠️ 1-indexed

# ⚠️ 类似二分, 但利用了 BIT 的树结构
#    从最高位到最低位逐位确定
#    时间 O(log n)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Hard | 计算右侧小于当前元素 | 315 | 离散化+BIT |
| Hard | 逆序对 | 剑指51 | 从右到左+BIT |
| Med | 区域和检索-可修改 | 307 | 基础应用 |
| Hard | 二维区域和检索-可修改 | 308 | 二维BIT |

---

## 本节要点速查

```
✅ 逆序对: 离散化→从右到左→query(rank-1)→update(rank,1)
✅ 315: 同逆序对, 记录每个位置的结果, 最后反转
✅ 区间改+区间查: 双BIT, b1管差分, b2管i×d[i]
✅ 二维BIT: 嵌套两层 while, 容斥求矩形和
✅ 第k小: 从高位到低位逐位确定, O(log n)
✅ 离散化: sorted(set(nums)) → rank 字典
```
