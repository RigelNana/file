# 划分型 DP

> 将序列划分成若干段，涵盖判定划分、最优划分、约束划分个数三类。

---

## 1. 划分型 DP 概述

```
划分型 DP: 把序列 s[0..n-1] 分成若干段
每段满足某个条件，求方案数/最小代价/...

三种子类型:
  ① 判定能否划分 → dp[i] = bool
  ② 最优划分     → dp[i] = 最小/最大值  
  ③ 约束划分个数 → dp[i][k] = 分成 k 段的最优值

通用思路:
  dp[i] = 前 i 个字符的最优解
  枚举最后一段的起点 j:
    dp[i] = 最优(dp[j] + cost(j, i))  for valid j

  ┌─────────────┬──────────┐
  │  dp[j]      │ cost(j,i)│   → dp[i]
  │ 0..j-1 已分  │ j..i-1   │
  └─────────────┴──────────┘
```

---

## 2. 判定能否划分: LC 139 单词拆分

```
题目: s 能否拆分为字典中的单词
示例: s="leetcode", wordDict=["leet","code"] → True

dp[i] = s[:i] 能否被拆分
dp[i] = any(dp[j] and s[j:i] in wordSet for j in range(i))

⚠️ dp[0] = True (空串可以拆分)
```

```python
def wordBreak(s, wordDict):
    words = set(wordDict)
    n = len(s)
    dp = [False] * (n + 1)
    dp[0] = True         # ⚠️ 空串
    
    for i in range(1, n + 1):
        for j in range(i):
            if dp[j] and s[j:i] in words:
                dp[i] = True
                break    # ⚠️ 找到一个就够了
    
    return dp[n]

# 优化: 只检查字典中存在的长度
def wordBreak_opt(s, wordDict):
    words = set(wordDict)
    lens = set(len(w) for w in wordDict)   # 可能的单词长度
    n = len(s)
    dp = [False] * (n + 1)
    dp[0] = True
    
    for i in range(1, n + 1):
        for l in lens:
            if l <= i and dp[i-l] and s[i-l:i] in words:
                dp[i] = True
                break
    
    return dp[n]

# ⚠️ 只枚举可能的长度, 避免 O(n) 内层循环
```

---

## 3. 判定能否划分: LC 2369 检查分区

```
题目: 数组是否存在有效划分
     有效: 每段是 2个相同/3个相同/3个连续递增

dp[i] = nums[:i] 能否有效划分
转移:
  dp[i] |= dp[i-2] if nums[i-2]==nums[i-1]          (两个相同)
  dp[i] |= dp[i-3] if nums[i-3]==nums[i-2]==nums[i-1] (三个相同)
  dp[i] |= dp[i-3] if nums[i-3]+1==nums[i-2]==nums[i-1]-1 (三个递增)
```

```python
def validPartition(nums):
    n = len(nums)
    dp = [False] * (n + 1)
    dp[0] = True
    
    for i in range(2, n + 1):
        # ⚠️ 检查最后 2 个
        if nums[i-2] == nums[i-1]:
            dp[i] = dp[i] or dp[i-2]
        # ⚠️ 检查最后 3 个 (需要 i >= 3)
        if i >= 3:
            if nums[i-3] == nums[i-2] == nums[i-1]:
                dp[i] = dp[i] or dp[i-3]
            if nums[i-3] + 1 == nums[i-2] and nums[i-2] + 1 == nums[i-1]:
                dp[i] = dp[i] or dp[i-3]
    
    return dp[n]

# ⚠️ i >= 3 的判断不要忘! 否则 i-3 下标越界
```

---

## 4. 最优划分: LC 132 分割回文串 II

```
题目: 把字符串切成若干段, 每段都是回文, 最少切几刀
示例: "aab" → "aa" + "b" → 1 刀

两步:
  Step 1: 预处理 is_pal[i][j] = s[i..j] 是否回文
  Step 2: dp[i] = s[:i+1] 的最少切割数

dp[i] = min(dp[j] + 1) for j in [0, i-1] where is_pal[j+1][i]
特别地: 如果 s[0..i] 整个是回文, dp[i] = 0
```

```python
def minCut(s):
    n = len(s)
    
    # Step 1: 预处理回文
    is_pal = [[False] * n for _ in range(n)]
    for i in range(n - 1, -1, -1):
        for j in range(i, n):
            # ⚠️ 条件: s[i]==s[j] 且 (长度≤3 或内部也是回文)
            is_pal[i][j] = s[i] == s[j] and (j - i <= 2 or is_pal[i+1][j-1])
    
    # Step 2: DP
    dp = list(range(n))   # ⚠️ 初始化: 最坏每个字符一刀, dp[i]=i
    
    for i in range(1, n):
        if is_pal[0][i]:
            dp[i] = 0      # ⚠️ 整个是回文, 不需要切
            continue
        for j in range(i):
            if is_pal[j+1][i]:
                dp[i] = min(dp[i], dp[j] + 1)
    
    return dp[n-1]

# ⚠️ dp 初始化为 range(n):
#    dp[0]=0 (单字符不需要切)
#    dp[i]=i (最坏: 每个字符单独一段, 需要 i 刀)
#
# ⚠️ is_pal 的预处理: i 从大到小
#    因为 is_pal[i][j] 依赖 is_pal[i+1][j-1]
```

---

## 5. 最优划分: LC 1335 工作计划的最低难度

```
题目: n 个工作分成 d 天, 每天至少做 1 个
     每天的难度 = 当天工作中的最大难度
     最小化总难度

dp[i][j] = 前 i 个工作分 j 天的最小难度
```

```python
def minDifficulty(jobDifficulty, d):
    n = len(jobDifficulty)
    if n < d:
        return -1       # ⚠️ 工作数 < 天数, 不可能
    
    dp = [[float('inf')] * (d + 1) for _ in range(n + 1)]
    dp[0][0] = 0
    
    for i in range(1, n + 1):
        for j in range(1, min(i, d) + 1):   # ⚠️ 天数 ≤ 工作数
            # 枚举最后一天的起点 m+1
            max_d = 0
            for m in range(i - 1, j - 2, -1):   # ⚠️ 至少留 j-1 个给前 j-1 天
                max_d = max(max_d, jobDifficulty[m])
                dp[i][j] = min(dp[i][j], dp[m][j-1] + max_d)
    
    return dp[n][d]

# ⚠️ 枚举最后一天从第 m+1 个工作开始
#    m 的范围: j-1 到 i-1 (留至少 j-1 个工作给前面的天)
#    max_d 从右往左累加当天的最大难度
```

---

## 6. 约束划分个数: LC 410 分割数组的最大值

```
题目: 数组分成 k 段, 使段和的最大值最小

方法1: DP
  dp[i][j] = 前 i 个数分 j 段, 最大段和的最小值
  dp[i][j] = min(max(dp[m][j-1], sum(m+1..i)))  for valid m

方法2: 二分答案 (更高效 ⭐)
  二分最大段和, check 是否能分成 ≤ k 段
```

```python
# 方法1: DP O(n²k)
def splitArray_dp(nums, k):
    n = len(nums)
    pre = [0] * (n + 1)
    for i in range(n):
        pre[i+1] = pre[i] + nums[i]
    
    dp = [[float('inf')] * (k + 1) for _ in range(n + 1)]
    dp[0][0] = 0
    
    for i in range(1, n + 1):
        for j in range(1, min(i, k) + 1):
            for m in range(j - 1, i):
                seg_sum = pre[i] - pre[m]   # ⚠️ 前缀和求区间和
                dp[i][j] = min(dp[i][j], max(dp[m][j-1], seg_sum))
    
    return dp[n][k]

# 方法2: 二分答案 O(n log S) ⭐
def splitArray(nums, k):
    def check(max_sum):
        """max_sum 为段和上限, 能否分成 ≤ k 段"""
        count = 1
        cur = 0
        for x in nums:
            if cur + x > max_sum:
                count += 1
                cur = 0
            cur += x
        return count <= k
    
    lo = max(nums)        # ⚠️ 下界: 最大元素 (每段至少含它)
    hi = sum(nums)        # ⚠️ 上界: 不分割
    while lo < hi:
        mid = (lo + hi) // 2
        if check(mid):
            hi = mid       # 可以, 尝试更小
        else:
            lo = mid + 1   # 不行, 需要更大
    
    return lo

# ⚠️ 二分法更常用, O(n log S), S = sum(nums)
#    DP 方法 O(n²k), 当 n 大时较慢
```

---

## 7. 划分型 DP 总结

```
┌──────────────┬────────────────────┬────────────────┐
│ 类型          │ dp 定义             │ 转移            │
├──────────────┼────────────────────┼────────────────┤
│ 判定能否划分  │ dp[i] = bool        │ or              │
│ 最优划分      │ dp[i] = 最优值       │ min/max         │
│ 约束个数      │ dp[i][k] = 最优值    │ 枚举最后段起点  │
└──────────────┴────────────────────┴────────────────┘

通用模式:
  for i in range(1, n+1):
      for j in range(i):        # 枚举最后一段起点
          if valid(j, i):
              dp[i] = 最优(dp[i], dp[j] + cost(j, i))

⚠️ 约束个数时多一维 k, 且要保证 m ≥ k-1
   (前 m 个元素至少需要 k-1 段)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 单词拆分 | 139 | 判定划分 |
| Med | 有效划分 | 2369 | 判定划分 |
| Hard | 分割回文串 II | 132 | 最优划分 |
| Hard | 分割数组的最大值 | 410 | 约束个数+二分 |
| Hard | 工作计划最低难度 | 1335 | 约束个数 |

---

## 本节要点速查

```
✅ 划分型 DP: 枚举最后一段的起点
✅ 判定: dp[i] = or(dp[j] and valid(j,i))
✅ 最优: dp[i] = min(dp[j] + cost(j,i))
✅ 约束个数: dp[i][k], m 至少留 k-1 个
✅ 分割数组最大值: 二分答案更高效
✅ 分割回文串: 预处理 is_pal + DP
✅ dp[0] = True/0 (空前缀)
```
