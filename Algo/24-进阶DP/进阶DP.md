# 进阶 DP

> 进阶 DP 包括状态压缩 DP、数位 DP、树形 DP 进阶以及 DP 优化技巧。这些方法处理更复杂的约束和更大的规模。

---

## 1. 状态压缩 DP ⭐

### 理解与可视化

```
状压 DP: 用二进制位表示"选了哪些元素"的状态

  n 个元素 → 状态空间 2^n

  例: n=4, mask=0b1010 表示选了第 1 和第 3 个元素

  经典: 旅行商问题 (TSP)
    dp[mask][i] = 已经访问了 mask 中的城市, 当前在城市 i 的最短路径
    转移: dp[mask | (1<<j)][j] = min(dp[mask][i] + dist[i][j])
    
  位操作速查:
    检查第 i 位:   mask >> i & 1
    设置第 i 位:   mask | (1 << i)
    清除第 i 位:   mask & ~(1 << i)
    枚举子集:      sub = mask; while sub: sub = (sub-1) & mask
```

### 代码模板

```python
# 旅行商问题 (TSP) —— 最短哈密顿路径
def tsp(dist):
    n = len(dist)
    dp = [[float('inf')] * n for _ in range(1 << n)]
    dp[1][0] = 0  # 从城市 0 出发

    for mask in range(1 << n):
        for u in range(n):
            if dp[mask][u] == float('inf'):
                continue
            for v in range(n):
                if mask >> v & 1:
                    continue  # v 已访问
                new_mask = mask | (1 << v)
                dp[new_mask][v] = min(dp[new_mask][v], dp[mask][u] + dist[u][v])

    full = (1 << n) - 1
    return min(dp[full][i] + dist[i][0] for i in range(n))

# 最短超级串（状压 + 拼接）
def shortest_superstring(words):
    n = len(words)
    # 预处理: overlap[i][j] = words[i] 后缀与 words[j] 前缀的最大重叠
    overlap = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            for k in range(min(len(words[i]), len(words[j])), 0, -1):
                if words[i].endswith(words[j][:k]):
                    overlap[i][j] = k
                    break

    dp = [[0] * n for _ in range(1 << n)]
    parent = [[-1] * n for _ in range(1 << n)]

    for mask in range(1 << n):
        for i in range(n):
            if not (mask >> i & 1):
                continue
            prev = mask ^ (1 << i)
            if prev == 0:
                continue
            for j in range(n):
                if not (prev >> j & 1):
                    continue
                val = dp[prev][j] + overlap[j][i]
                if val > dp[mask][i]:
                    dp[mask][i] = val
                    parent[mask][i] = j

    # 回溯重建
    full = (1 << n) - 1
    last = max(range(n), key=lambda i: dp[full][i])
    # 重建路径并拼接...
    return dp[full][last]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 最短超级串 | 943 |
| Medium | 每个人戴不同帽子的方案数 | 1434 |
| Hard | 最小的必要团队 | 1125 |
| Medium | 并行课程 II | 1494 |

---

## 2. 数位 DP ⭐

### 理解与可视化

```
数位 DP: 统计 [0, n] 中满足某条件的数的数量

  逐位确定每一位可以填什么数字
  关键状态: is_limit (当前位是否受上界限制), is_num (前面是否已填数字)

  例: 统计 [1, 100] 中不含数字 4 的数有多少

  数位 DP 通用模板 (记忆化搜索):
    def f(i, mask, is_limit, is_num):
      i: 当前填第几位
      mask: 已使用的数字集合（或其他状态）
      is_limit: 当前位能填的上界是否受 n 的限制
      is_num: 前面是否已经选了数字（处理前导零）
```

### 代码模板

```python
from functools import cache

# 数位 DP 通用模板
def count_special_numbers(n):
    """统计 [1, n] 中各位数字都不同的数的数量"""
    s = str(n)

    @cache
    def dp(i, mask, is_limit, is_num):
        if i == len(s):
            return 1 if is_num else 0
        res = 0
        if not is_num:
            res = dp(i + 1, mask, False, False)  # 跳过（前导零）

        lo = 0 if is_num else 1
        hi = int(s[i]) if is_limit else 9
        for d in range(lo, hi + 1):
            if mask >> d & 1:
                continue  # 数字 d 已使用
            res += dp(i + 1, mask | (1 << d), is_limit and d == hi, True)
        return res

    return dp(0, 0, True, False)

# 至少有 1 位重复的数字
def num_dup_digits_at_most_n(n):
    return n - count_special_numbers(n)
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 统计特殊整数 | 2376 |
| Hard | 至少有 1 位重复的数字 | 1012 |
| Hard | 不含连续1的非负整数 | 600 |

---

## 3. 树形 DP 进阶

### 代码模板

```python
# 监控二叉树 (贪心树形DP)
# 状态: 0=未覆盖, 1=已设摄像头, 2=已被覆盖
def min_camera_cover(root):
    cameras = 0
    def dfs(node):
        nonlocal cameras
        if not node:
            return 2  # null 视为已覆盖
        left = dfs(node.left)
        right = dfs(node.right)
        if left == 0 or right == 0:
            cameras += 1
            return 1  # 放摄像头
        if left == 1 or right == 1:
            return 2  # 被子节点覆盖
        return 0      # 未覆盖，等父节点
    if dfs(root) == 0:
        cameras += 1
    return cameras
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 监控二叉树 | 968 |
| Hard | 二叉树中的最大路径和 | 124 |

---

## 4. DP 优化技巧

### 理解与可视化

```
常见 DP 优化:

  1. 空间优化 (滚动数组)
     dp[i] 只依赖 dp[i-1] → 用两行/一行代替
     2D → 1D, 3D → 2D

  2. 单调队列优化
     dp[i] = min(dp[j] + cost) for j in [i-k, i-1]
     → 用单调队列 O(1) 维护窗口最值

  3. 斜率优化 (李超线段树/凸包)
     dp[i] = min(dp[j] + f(i,j)) 其中 f 可拆为只含 i/j 的项

  4. 矩阵快速幂
     线性递推 dp[i] = a*dp[i-1] + b*dp[i-2] + ...
     → 构造转移矩阵, 用快速幂 O(k³ log n) 求解
```

### 代码模板

```python
# 矩阵快速幂求斐波那契
def matrix_mult(A, B, mod=10**9+7):
    n = len(A)
    m = len(B[0])
    k = len(B)
    C = [[0]*m for _ in range(n)]
    for i in range(n):
        for j in range(m):
            for p in range(k):
                C[i][j] = (C[i][j] + A[i][p] * B[p][j]) % mod
    return C

def matrix_pow(M, exp, mod=10**9+7):
    n = len(M)
    result = [[1 if i == j else 0 for j in range(n)] for i in range(n)]
    while exp:
        if exp & 1:
            result = matrix_mult(result, M, mod)
        M = matrix_mult(M, M, mod)
        exp >>= 1
    return result

def fib_fast(n, mod=10**9+7):
    if n <= 1:
        return n
    M = [[1, 1], [1, 0]]
    return matrix_pow(M, n - 1, mod)[0][0]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 斐波那契数 | 509 |
| Hard | 学生出勤记录 II | 552 |
