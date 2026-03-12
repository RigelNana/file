# 背包 DP

> 背包问题是 DP 中最经典的模型。掌握 0-1 背包和完全背包，很多 DP 题都能转化为背包问题。

---

## 1. 0-1 背包 ⭐⭐

### 理解与可视化

```
问题: n 个物品，每个物品有重量 w[i] 和价值 v[i]
     背包容量为 W，每个物品最多选一次，求最大价值

          物品 0: w=2, v=3
          物品 1: w=3, v=4
          物品 2: w=4, v=5
          背包容量 W=5

状态定义: dp[i][j] = 前 i 个物品，容量为 j 时的最大价值

转移: 对于第 i 个物品，选 or 不选
  不选: dp[i][j] = dp[i-1][j]
  选:   dp[i][j] = dp[i-1][j-w[i]] + v[i]  （前提 j ≥ w[i]）
  取 max

填表:
       j:  0  1  2  3  4  5
  i=0:     0  0  3  3  3  3     (物品0: w=2,v=3)
  i=1:     0  0  3  4  4  7     (物品1: w=3,v=4)
  i=2:     0  0  3  4  5  7     (物品2: w=4,v=5)

  答案: dp[2][5] = 7（选物品0和物品1）

空间优化: 只用一维数组，倒序遍历容量
  为什么倒序? 保证每个物品只用一次（不会重复选）
```

### 代码模板

```python
# 0-1 背包（二维）
def knapsack_01(W, weights, values):
    n = len(weights)
    dp = [[0] * (W + 1) for _ in range(n + 1)]
    for i in range(1, n + 1):
        for j in range(W + 1):
            dp[i][j] = dp[i-1][j]  # 不选
            if j >= weights[i-1]:
                dp[i][j] = max(dp[i][j], dp[i-1][j-weights[i-1]] + values[i-1])
    return dp[n][W]

# 0-1 背包（一维优化）⭐ 最常用
def knapsack_01_opt(W, weights, values):
    dp = [0] * (W + 1)
    for i in range(len(weights)):
        for j in range(W, weights[i] - 1, -1):  # 倒序！
            dp[j] = max(dp[j], dp[j - weights[i]] + values[i])
    return dp[W]

# 分割等和子集（经典 0-1 背包变形）
def can_partition(nums):
    total = sum(nums)
    if total % 2:
        return False
    target = total // 2
    dp = [False] * (target + 1)
    dp[0] = True
    for x in nums:
        for j in range(target, x - 1, -1):
            dp[j] = dp[j] or dp[j - x]
    return dp[target]

# 目标和（+/- 分配，转化为背包）
def find_target_sum_ways(nums, target):
    total = sum(nums)
    if (total + target) % 2 or abs(target) > total:
        return 0
    bag = (total + target) // 2
    dp = [0] * (bag + 1)
    dp[0] = 1
    for x in nums:
        for j in range(bag, x - 1, -1):
            dp[j] += dp[j - x]
    return dp[bag]

# 一和零（二维 0-1 背包）
def find_max_form(strs, m, n):
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for s in strs:
        zeros = s.count('0')
        ones = s.count('1')
        for i in range(m, zeros - 1, -1):
            for j in range(n, ones - 1, -1):
                dp[i][j] = max(dp[i][j], dp[i-zeros][j-ones] + 1)
    return dp[m][n]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 分割等和子集 | 416 |
| Medium | 目标和 | 494 |
| Medium | 最后一块石头的重量 II | 1049 |
| Medium | 一和零 | 474 |

---

## 2. 完全背包 ⭐

### 理解与可视化

```
完全背包: 每种物品可以选无限次

和 0-1 背包的唯一区别:
  0-1 背包: 内层倒序遍历 → 每个物品最多用一次
  完全背包: 内层正序遍历 → 每个物品可以用多次

              0-1 背包              完全背包
  内层循环:   for j in range(W, w-1, -1)   for j in range(w, W+1)
              倒序                          正序

典型问题: 零钱兑换
  硬币 [1, 2, 5]，凑出 11
  每种硬币无限使用 → 完全背包

  dp[j] = 凑出金额 j 需要的最少硬币数
  dp[j] = min(dp[j], dp[j - coin] + 1)
```

### 代码模板

```python
# 完全背包模板
def knapsack_complete(W, weights, values):
    dp = [0] * (W + 1)
    for i in range(len(weights)):
        for j in range(weights[i], W + 1):  # 正序！
            dp[j] = max(dp[j], dp[j - weights[i]] + values[i])
    return dp[W]

# 零钱兑换（最少硬币数）⭐
def coin_change(coins, amount):
    dp = [float('inf')] * (amount + 1)
    dp[0] = 0
    for coin in coins:
        for j in range(coin, amount + 1):
            dp[j] = min(dp[j], dp[j - coin] + 1)
    return dp[amount] if dp[amount] != float('inf') else -1

# 零钱兑换 II（组合数）
def change(amount, coins):
    dp = [0] * (amount + 1)
    dp[0] = 1
    for coin in coins:
        for j in range(coin, amount + 1):
            dp[j] += dp[j - coin]
    return dp[amount]

# 完全平方数
def num_squares(n):
    dp = [float('inf')] * (n + 1)
    dp[0] = 0
    for i in range(1, int(n**0.5) + 1):
        sq = i * i
        for j in range(sq, n + 1):
            dp[j] = min(dp[j], dp[j - sq] + 1)
    return dp[n]

# 单词拆分
def word_break(s, word_dict):
    words = set(word_dict)
    n = len(s)
    dp = [False] * (n + 1)
    dp[0] = True
    for i in range(1, n + 1):
        for j in range(i):
            if dp[j] and s[j:i] in words:
                dp[i] = True
                break
    return dp[n]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 零钱兑换 | 322 |
| Medium | 零钱兑换 II | 518 |
| Medium | 完全平方数 | 279 |
| Medium | 单词拆分 | 139 |

---

## 3. 分组背包

### 理解与可视化

```
分组背包: 物品分成若干组，每组最多选一个

  组1: 物品A(w=2,v=3), 物品B(w=3,v=5)
  组2: 物品C(w=1,v=2), 物品D(w=4,v=7)

  每组内部选一个（或不选），求最大价值

转移: 枚举每组中选哪个物品
  dp[j] = max(dp[j], dp[j-w] + v) for each item in group
```

### 代码模板

```python
# 分组背包
def group_knapsack(W, groups):
    """groups[k] = [(w1,v1), (w2,v2), ...] 第k组的物品"""
    dp = [0] * (W + 1)
    for group in groups:
        for j in range(W, -1, -1):  # 倒序（每组最多选一个）
            for w, v in group:
                if j >= w:
                    dp[j] = max(dp[j], dp[j - w] + v)
    return dp[W]
```

---

## 4. 背包问题总结

```
┌───────────────┬────────────────┬──────────────────────┐
│ 类型           │ 特点            │ 内层遍历顺序          │
├───────────────┼────────────────┼──────────────────────┤
│ 0-1 背包       │ 每个物品用一次   │ 倒序 for j in [W..w] │
│ 完全背包       │ 每个物品用无限次 │ 正序 for j in [w..W] │
│ 分组背包       │ 每组选最多一个   │ 倒序，组内枚举物品    │
│ 多重背包       │ 第i个物品用k[i]次│ 二进制优化/单调队列   │
└───────────────┴────────────────┴──────────────────────┘

常见转化:
  "恰好装满"  → dp 初始化 dp[0]=0, 其余 -inf
  "最多装 W"   → dp 初始化全 0
  "方案数"     → dp[j] += dp[j-w]
  "最小值"     → dp[j] = min(dp[j], dp[j-w]+1)
```
