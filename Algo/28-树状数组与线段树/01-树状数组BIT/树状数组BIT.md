# 树状数组BIT

> 树状数组 (Binary Indexed Tree / Fenwick Tree): O(log n) 单点修改 + 前缀和查询，实现简洁高效。

---

## 1. 核心思想

```
lowbit(x) = x & (-x): 取最低位的 1

  lowbit(6)  = lowbit(110₂)  = 010₂ = 2
  lowbit(12) = lowbit(1100₂) = 100₂ = 4
  lowbit(8)  = lowbit(1000₂) = 1000₂ = 8

树状数组结构 (1-indexed):
  tree[i] 管理原数组 a[i-lowbit(i)+1 ... i] 的和

  下标:  1     2      3     4         5     6      7     8
  管理: [1]  [1,2]  [3]  [1,2,3,4] [5]  [5,6]  [7]  [1..8]

  查询 prefix_sum(6):
    路径: 6 → 6-lowbit(6)=4 → 4-lowbit(4)=0 (停)
    sum = tree[6] + tree[4]

  修改 update(3, +5):
    路径: 3 → 3+lowbit(3)=4 → 4+lowbit(4)=8 → >n (停)
    更新 tree[3], tree[4], tree[8]

  ⚠️ 1-indexed! 下标从 1 开始
     原数组 nums[0..n-1] → BIT 用下标 1..n
  ⚠️ 查询: 减 lowbit, 向左走
     修改: 加 lowbit, 向右走
```

---

## 2. 代码模板

```python
class BIT:
    """树状数组 (1-indexed)"""
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 1)          # ⚠️ 大小 n+1, 下标 1..n
    
    def update(self, i, delta):
        """a[i] += delta"""
        while i <= self.n:                 # ⚠️ <= n, 不是 < n
            self.tree[i] += delta
            i += i & (-i)                  # ⚠️ 加 lowbit, 向右
    
    def query(self, i):
        """返回 sum(a[1..i])"""
        s = 0
        while i > 0:                      # ⚠️ > 0, 不是 >= 0
            s += self.tree[i]
            i -= i & (-i)                  # ⚠️ 减 lowbit, 向左
        return s
    
    def range_query(self, l, r):
        """返回 sum(a[l..r])"""
        return self.query(r) - self.query(l - 1)  # ⚠️ l-1

# ⚠️ 时间: 每次操作 O(log n)
# ⚠️ 空间: O(n)
# ⚠️ 不支持区间修改 (需要差分BIT)
```

---

## 3. 从数组构建

```python
# 方法1: 逐个 update, O(n log n)
def build_bit(nums):
    n = len(nums)
    bit = BIT(n)
    for i, x in enumerate(nums):
        bit.update(i + 1, x)               # ⚠️ 下标 +1 (1-indexed)
    return bit

# 方法2: O(n) 构建
def build_bit_fast(nums):
    n = len(nums)
    bit = BIT(n)
    for i in range(1, n + 1):
        bit.tree[i] += nums[i - 1]
        j = i + (i & (-i))
        if j <= n:
            bit.tree[j] += bit.tree[i]
    return bit
```

---

## 4. LeetCode 307: 区域和检索 - 数组可修改

```python
class NumArray:
    def __init__(self, nums):
        self.nums = nums[:]
        self.n = len(nums)
        self.bit = BIT(self.n)
        for i, x in enumerate(nums):
            self.bit.update(i + 1, x)
    
    def update(self, index, val):
        delta = val - self.nums[index]     # ⚠️ 差值, 不是直接赋值
        self.nums[index] = val
        self.bit.update(index + 1, delta)  # ⚠️ index+1 (1-indexed)
    
    def sumRange(self, left, right):
        return self.bit.range_query(left + 1, right + 1)
        # ⚠️ 题目用 0-indexed, BIT 用 1-indexed

# ⚠️ update 是赋值操作, 需要算差值 delta
```

---

## 5. 差分BIT (区间修改 + 单点查询)

```
对区间 [l, r] 加 val:
  差分: d[l] += val, d[r+1] -= val
  a[i] = sum(d[1..i]) = prefix_sum(d, i)

用 BIT 维护差分数组 d:
  区间加 [l,r] val → update(l, val) + update(r+1, -val)
  单点查询 a[i]   → query(i)
```

```python
class BIT_Diff:
    """差分树状数组: 区间修改 + 单点查询"""
    def __init__(self, n):
        self.bit = BIT(n)
    
    def range_add(self, l, r, val):
        """[l, r] 区间加 val"""
        self.bit.update(l, val)
        self.bit.update(r + 1, -val)       # ⚠️ r+1 减 val
    
    def point_query(self, i):
        """查询 a[i] 的值"""
        return self.bit.query(i)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 区域和检索-数组可修改 | 307 | 基础BIT |
| Hard | 计算右侧小于当前元素 | 315 | 离散化+BIT |
| Hard | 逆序对 | 剑指51 | 离散化+BIT |

---

## 本节要点速查

```
✅ lowbit(x) = x & (-x): 最低位的 1
✅ 1-indexed! 下标从 1 开始
✅ 查询 prefix_sum: 减 lowbit 向左, while i > 0
✅ 修改 update: 加 lowbit 向右, while i <= n
✅ range_sum(l,r) = query(r) - query(l-1)
✅ 差分BIT: 区间加→update两点, 单点查→query前缀和
✅ 赋值操作要算 delta = new_val - old_val
```
