# CDQ 分治

> CDQ 分治用于处理多维偏序问题：将问题分成左右两半，先递归处理各半，再计算左半对右半的跨区间贡献。

---

## 1. 核心思想与可视化

```
CDQ 分治 (陈丹琦分治):
  处理形如 "满足 a[i]<a[j] 且 b[i]<b[j] 且 c[i]<c[j] 的 (i,j) 对数" 的问题

经典应用: 三维偏序
  给定 n 个元素, 每个有 (a, b, c) 三个属性
  对每个元素 i, 求满足 a[j]≤a[i], b[j]≤b[i], c[j]≤c[i] 的 j 的个数

分治思路:
  ┌──────────────────────────────────────────┐
  │ 第一维 a: 预排序                         │
  │ 第二维 b: CDQ 分治过程中归并排序          │
  │ 第三维 c: 树状数组                       │
  └──────────────────────────────────────────┘

  cdq(l, r):
    if l == r: return
    mid = (l + r) // 2
    cdq(l, mid)          ← 递归处理左半
    cdq(mid+1, r)        ← 递归处理右半
    计算左半对右半的贡献  ← 关键步骤
    归并排序 [l, r]

可视化:
  原序列 (按 a 排序): [1,2,3,4,5,6,7,8]
  
  分治过程:
         [1,2,3,4,5,6,7,8]
        /                  \
    [1,2,3,4]          [5,6,7,8]     ← 左半的 a 值都 ≤ 右半
   /        \          /        \
  [1,2]    [3,4]    [5,6]    [7,8]
  
  合并时: 左半所有元素的 a 值 ≤ 右半
         ⚠️ 第一维约束已天然满足
         → 只需处理 b 和 c 两维

  cross_contribution(l, mid, r):
    左半按 b 排序, 右半按 b 排序 (归并)
    双指针: 当 left.b ≤ right.b 时:
      把 left.c 加入树状数组
    然后查询树状数组得到 ≤ right.c 的个数
```

---

## 2. 二维偏序：归并排序求逆序对

```
在学 CDQ 之前，先理解二维偏序:
  给定 n 个元素 (i, a[i])
  求满足 i < j 且 a[i] > a[j] 的逆序对数

  第一维 i: 天然有序
  第二维 a: 归并排序处理
  → 就是经典的"归并排序求逆序对"
```

```python
def count_inversions(nums):
    """归并排序求逆序对数"""
    def merge_sort(arr, l, r):
        if l >= r:
            return 0
        mid = (l + r) // 2
        count = merge_sort(arr, l, mid) + merge_sort(arr, mid + 1, r)
        
        # 计算跨区间逆序对
        temp = []
        i, j = l, mid + 1
        while i <= mid and j <= r:
            if arr[i] <= arr[j]:
                temp.append(arr[i])
                i += 1
            else:
                # ⚠️ arr[i] > arr[j]: 左半 i~mid 都与 arr[j] 构成逆序对
                count += mid - i + 1
                temp.append(arr[j])
                j += 1
        while i <= mid:
            temp.append(arr[i]); i += 1
        while j <= r:
            temp.append(arr[j]); j += 1
        arr[l:r+1] = temp
        return count

    arr = nums[:]
    return merge_sort(arr, 0, len(arr) - 1)
```

### LeetCode 315 - 计算右侧小于当前元素的个数

```
题意: 给定 nums, 对每个 i 求 j > i 且 nums[j] < nums[i] 的个数

分析: 
  就是 "每个元素右边有多少个比它小的" = 逆序对的局部版本
  
  方法: 归并排序 + 记录每个元素的原始索引
```

```python
def countSmaller(nums):
    n = len(nums)
    result = [0] * n
    # ⚠️ 携带原始索引: (值, 原始下标)
    indexed = list(range(n))

    def merge_sort(arr, l, r):
        if l >= r:
            return
        mid = (l + r) // 2
        merge_sort(arr, l, mid)
        merge_sort(arr, mid + 1, r)

        temp = []
        i, j = l, mid + 1
        while i <= mid and j <= r:
            if nums[arr[i]] <= nums[arr[j]]:
                # ⚠️ arr[i] 对应的值 ≤ arr[j]
                # j 之前已经有 (j - mid - 1) 个右半元素被放入 temp
                # 这些都是比 arr[i] 小的
                result[arr[i]] += j - (mid + 1)
                temp.append(arr[i])
                i += 1
            else:
                temp.append(arr[j])
                j += 1

        # ⚠️ 左半剩余元素：右半所有元素都比它们小
        while i <= mid:
            result[arr[i]] += j - (mid + 1)
            temp.append(arr[i])
            i += 1
        while j <= r:
            temp.append(arr[j])
            j += 1
        arr[l:r+1] = temp

    merge_sort(indexed, 0, n - 1)
    return result
```

### ⚠️ 易错点

```
1. 稳定性:
   ⚠️ 归并排序中 arr[i] <= arr[j] 用 <=（不是 <）
   等值时先放左边元素，保持稳定性

2. 计数时机:
   ⚠️ 当左半元素 arr[i] 放入 temp 时才计数
   count = j - (mid + 1)  ← 右半已经放入 temp 的个数

3. 左半剩余:
   ⚠️ while i <= mid 循环里也要计数
   此时右半所有元素都已放入 temp

4. 索引间接排序:
   ⚠️ 排序的是索引数组 indexed，不是 nums 本身
   比较时用 nums[arr[i]] vs nums[arr[j]]
   记录结果时用 result[arr[i]]
```

---

## 3. 三维偏序：CDQ 分治 + 树状数组

```python
class BIT:
    def __init__(self, n):
        self.n = n
        self.tree = [0] * (n + 2)

    def update(self, i, delta=1):
        while i <= self.n:
            self.tree[i] += delta
            i += i & (-i)

    def query(self, i):
        s = 0
        while i > 0:
            s += self.tree[i]
            i -= i & (-i)
        return s

    def clear(self, i):
        """⚠️ 清除而不是全部重置，只清用过的位置"""
        while i <= self.n:
            if self.tree[i] == 0:
                break
            self.tree[i] = 0
            i += i & (-i)


def cdq_3d_partial_order(elements):
    """
    elements: [(a, b, c), ...] 三维偏序
    返回: ans[i] = 满足 a[j]≤a[i], b[j]≤b[i], c[j]≤c[i] 的 j 的个数
    
    ⚠️ 注意: 需要先去重统计重复元素
    """
    n = len(elements)
    
    # 第一维: 按 a 排序（a 相同按 b, 再按 c）
    indexed = sorted(range(n), key=lambda i: elements[i])
    
    max_c = max(c for _, _, c in elements)
    bit = BIT(max_c)
    ans = [0] * n

    def cdq(arr, l, r):
        """arr: 索引数组, 处理 arr[l..r]"""
        if l >= r:
            return
        mid = (l + r) // 2
        cdq(arr, l, mid)
        cdq(arr, mid + 1, r)

        # 计算左半对右半的贡献
        # ⚠️ 此时左半和右半各自已按 b 排序（归并过程保证）
        i = l
        for j in range(mid + 1, r + 1):
            # 把左半中 b 值 ≤ arr[j] 的 b 值的元素加入 BIT
            while i <= mid and elements[arr[i]][1] <= elements[arr[j]][1]:
                bit.update(elements[arr[i]][2], 1)  # 按 c 值添加
                i += 1
            # 查询 BIT 中 c 值 ≤ elements[arr[j]][2] 的个数
            ans[arr[j]] += bit.query(elements[arr[j]][2])

        # ⚠️ 清除 BIT (不能用全部清零,太慢)
        for k in range(l, i):
            bit.clear(elements[arr[k]][2])

        # 归并排序（按 b 排序）
        temp = []
        p, q = l, mid + 1
        while p <= mid and q <= r:
            if elements[arr[p]][1] <= elements[arr[q]][1]:
                temp.append(arr[p]); p += 1
            else:
                temp.append(arr[q]); q += 1
        while p <= mid: temp.append(arr[p]); p += 1
        while q <= r: temp.append(arr[q]); q += 1
        arr[l:r+1] = temp

    cdq(indexed, 0, n - 1)
    return ans
```

### ⚠️ CDQ 关键细节

```
1. 三维分工:
   a: 排序 (预处理)
   b: 归并排序 (CDQ 过程中)
   c: 树状数组 (计算贡献时)

2. BIT 清除:
   ⚠️ 不能每次 cdq 调用后 bit = BIT(max_c) 重建
   → 只清除本次用过的位置: bit.clear(c_value)
   → 或用全局时间戳标记

3. 归并排序 + 贡献计算:
   ⚠️ 不能先归并再算贡献！
   → 必须在归并之前（或归并过程中）计算跨区间贡献
   → 因为归并后左右半会混在一起, 无法区分

4. 去重:
   ⚠️ 如果有完全相同的元素 (a,b,c) 相同
   → 需要先去重并记录每个不同元素的出现次数
   → 去重后每个元素的 ans 还要加上自身重复的个数 - 1

5. 坐标范围:
   ⚠️ BIT 下标从 1 开始, c 值需要 ≥ 1
   → 如果 c 可能为 0, 所有 c 值 + 1
```

---

## 4. CDQ 与其他方法对比

```
多维偏序问题的解法:

┌──────────┬──────────────────────────────────────┐
│ 维度     │ 方法                                  │
├──────────┼──────────────────────────────────────┤
│ 一维     │ 排序                                  │
│ 二维     │ 排序 + BIT / 归并排序                  │
│ 三维     │ CDQ + BIT / 树套树                    │
│ 四维     │ CDQ 嵌套 CDQ + BIT (很少考)           │
└──────────┴──────────────────────────────────────┘

CDQ 优点:
  - 时间 O(n log²n), 空间 O(n)
  - 比树套树空间更优
  - 代码相对简洁

CDQ 缺点:
  - 只能离线
  - 不能处理强制在线的查询
```

---

## 5. 例题：LeetCode 493 - 翻转对

```
题意: 
  翻转对 = (i, j) 满足 i < j 且 nums[i] > 2 * nums[j]
  求翻转对的个数

分析:
  这是二维偏序的变形
  第一维: i < j (下标顺序)
  第二维: nums[i] > 2 * nums[j]
  → 归并排序处理
```

```python
def reversePairs(nums):
    def merge_sort(arr, l, r):
        if l >= r:
            return 0
        mid = (l + r) // 2
        count = merge_sort(arr, l, mid) + merge_sort(arr, mid + 1, r)

        # ⚠️ 先统计翻转对（在归并之前）
        j = mid + 1
        for i in range(l, mid + 1):
            while j <= r and arr[i] > 2 * arr[j]:
                j += 1
            count += j - (mid + 1)

        # 再归并排序
        temp = []
        p, q = l, mid + 1
        while p <= mid and q <= r:
            if arr[p] <= arr[q]:
                temp.append(arr[p]); p += 1
            else:
                temp.append(arr[q]); q += 1
        while p <= mid: temp.append(arr[p]); p += 1
        while q <= r: temp.append(arr[q]); q += 1
        arr[l:r+1] = temp

        return count

    return merge_sort(nums[:], 0, len(nums) - 1)
```

### ⚠️ 与逆序对的区别

```
逆序对: nums[i] > nums[j]     → 归并过程中直接统计
翻转对: nums[i] > 2*nums[j]   → 归并前单独统计，再归并

⚠️ 翻转对不能在归并过程中统计！
   因为归并的比较条件 (arr[p] <= arr[q]) 和
   翻转对的条件 (arr[i] > 2*arr[j]) 不一致
   → 必须分两步: 先统计，再归并
```

---

## 推荐题目

| 难度 | 题目 | 来源 | 考点 |
|------|------|------|------|
| Hard | 计算右侧小于当前元素的个数 | LC 315 | 归并排序/BIT |
| Hard | 翻转对 | LC 493 | 归并排序变形 |
| Hard | 区间和的个数 | LC 327 | 归并排序 |
| — | 三维偏序（陌上花开） | 洛谷 P3810 | 经典CDQ |

---

## 本节要点速查

```
✅ CDQ分治: 第一维排序, 第二维归并, 第三维BIT
✅ 二维偏序 = 归并排序求逆序对 (经典面试题)
✅ 左半对右半贡献: 在归并之前or过程中计算
✅ BIT 清除: 只清用过的位置, 不要全部重建
✅ 稳定性: 归并时等值先放左边 (<=)
✅ 索引间接排序: 排序索引数组, 用原数组比较
✅ 翻转对 vs 逆序对: 条件不同则统计和归并必须分开
✅ 复杂度: 二维 O(nlogn), 三维 O(nlog²n)
```
