# 区间与划分型 DP

> 区间 DP 处理「区间上的最优化」问题，划分型 DP 处理「将序列分段」的问题。

---

## 1. 最长回文子序列

### 理解与可视化

```
问题: 找最长的回文子序列（可以不连续）

  s = "bbbab"
  最长回文子序列: "bbbb"，长度=4

状态: dp[i][j] = s[i..j] 中最长回文子序列的长度

转移:
  s[i] == s[j]:  dp[i][j] = dp[i+1][j-1] + 2
  s[i] != s[j]:  dp[i][j] = max(dp[i+1][j], dp[i][j-1])

  从短区间到长区间递推
```

### 代码模板

```python
# 最长回文子序列
def longest_palindrome_subseq(s):
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    for i in range(n):
        dp[i][i] = 1
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            if s[i] == s[j]:
                dp[i][j] = dp[i+1][j-1] + 2
            else:
                dp[i][j] = max(dp[i+1][j], dp[i][j-1])
    return dp[0][n-1]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 最长回文子序列 | 516 |
| Medium | 回文子串 | 647 |

---

## 2. 区间 DP ⭐

### 理解与可视化

```
区间 DP: 在区间 [i, j] 上，通过枚举分割点 k 来合并子区间

经典: 戳气球
  区间 [i,j] 上最后戳第 k 个气球
  dp[i][j] = max(dp[i][k] + dp[k][j] + nums[i]*nums[k]*nums[j])

经典: 合并石子
  合并相邻两堆石子，总代价最小
  dp[i][j] = min(dp[i][k] + dp[k+1][j]) + sum(i,j)
             for k in [i, j-1]

模板:
  ┌─────────────────────────────────────┐
  │ 枚举区间长度 len: 2→n               │
  │   枚举左端点 i                       │
  │     j = i + len - 1                 │
  │     枚举分割点 k: i→j-1             │
  │       dp[i][j] = 最优(子区间合并)    │
  └─────────────────────────────────────┘
```

### 代码模板

```python
# 区间 DP 通用模板
def interval_dp(nums):
    n = len(nums)
    dp = [[0] * n for _ in range(n)]
    # base: dp[i][i] = ...

    for length in range(2, n + 1):       # 枚举区间长度
        for i in range(n - length + 1):  # 枚举左端点
            j = i + length - 1           # 右端点
            dp[i][j] = float('inf')
            for k in range(i, j):        # 枚举分割点
                dp[i][j] = min(dp[i][j], dp[i][k] + dp[k+1][j] + cost(i, j))
    return dp[0][n-1]

# 戳气球
def max_coins(nums):
    nums = [1] + nums + [1]
    n = len(nums)
    dp = [[0] * n for _ in range(n)]
    for length in range(3, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            for k in range(i + 1, j):
                dp[i][j] = max(dp[i][j],
                    dp[i][k] + dp[k][j] + nums[i] * nums[k] * nums[j])
    return dp[0][n-1]

# 多边形三角剖分的最低得分
def min_score_triangulation(values):
    n = len(values)
    dp = [[0] * n for _ in range(n)]
    for length in range(3, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            dp[i][j] = float('inf')
            for k in range(i + 1, j):
                dp[i][j] = min(dp[i][j],
                    dp[i][k] + dp[k][j] + values[i] * values[k] * values[j])
    return dp[0][n-1]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 戳气球 | 312 |
| Medium | 多边形三角剖分的最低得分 | 1039 |
| Medium | 不同的二叉搜索树 | 96 |
| Medium | 石子游戏 | 877 |

---

## 3. 划分型 DP：判定能否划分

### 理解与可视化

```
判定能否将字符串/数组分成若干段，每段满足某条件

例: 单词拆分
  s = "leetcode", wordDict = ["leet", "code"]
  可以拆成 "leet" + "code" → True

  dp[i] = s[0..i-1] 能否被拆分
  dp[i] = True if 存在 j 使得 dp[j]=True 且 s[j..i-1] 在字典中
```

### 代码模板

```python
# 判定划分（单词拆分，已在背包 DP 出现）
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

---

## 4. 划分型 DP：最优划分

### 代码模板

```python
# 分割回文串 II（最少切割次数）
def min_cut(s):
    n = len(s)
    # 预处理回文判断
    is_pal = [[False] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            is_pal[i][j] = s[i] == s[j] and (j - i <= 2 or is_pal[i+1][j-1])

    dp = list(range(n))  # dp[i] = s[0..i] 的最少切割次数
    for i in range(1, n):
        if is_pal[0][i]:
            dp[i] = 0
            continue
        for j in range(i):
            if is_pal[j+1][i]:
                dp[i] = min(dp[i], dp[j] + 1)
    return dp[n-1]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 分割回文串 II | 132 |
| Medium | 完美平方数 | 279 |

---

## 5. 划分型 DP：约束划分个数

### 代码模板

```python
# 分割数组的最大值（分成 k 段，最小化最大段和）
# 方法1: DP
def split_array(nums, k):
    n = len(nums)
    pre = [0] * (n + 1)
    for i in range(n):
        pre[i+1] = pre[i] + nums[i]

    dp = [[float('inf')] * (k + 1) for _ in range(n + 1)]
    dp[0][0] = 0
    for i in range(1, n + 1):
        for j in range(1, min(i, k) + 1):
            for m in range(j - 1, i):
                dp[i][j] = min(dp[i][j], max(dp[m][j-1], pre[i] - pre[m]))
    return dp[n][k]

# 方法2: 二分答案（更高效）
def split_array_bs(nums, k):
    def check(max_sum):
        count = 1
        cur = 0
        for x in nums:
            if cur + x > max_sum:
                count += 1
                cur = 0
            cur += x
        return count <= k
    lo, hi = max(nums), sum(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if check(mid):
            hi = mid
        else:
            lo = mid + 1
    return lo
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 分割数组的最大值 | 410 |
| Hard | 书影有声 | 1231 |
