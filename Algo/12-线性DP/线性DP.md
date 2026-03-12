# 线性 DP

> 线性 DP 是在序列上做动态规划，包括最长公共子序列 (LCS)、最长递增子序列 (LIS) 等经典问题。

---

## 1. 最长公共子序列 (LCS) ⭐

### 理解与可视化

```
问题: 两个字符串的最长公共子序列（可以不连续）

  s1 = "abcde"
  s2 = "ace"
  LCS = "ace"，长度 = 3

状态: dp[i][j] = s1 前 i 个字符和 s2 前 j 个字符的 LCS 长度

转移:
  s1[i-1] == s2[j-1]:  dp[i][j] = dp[i-1][j-1] + 1
  s1[i-1] != s2[j-1]:  dp[i][j] = max(dp[i-1][j], dp[i][j-1])

填表:
      ""  a  c  e
  ""   0  0  0  0
  a    0  1  1  1
  b    0  1  1  1
  c    0  1  2  2
  d    0  1  2  2
  e    0  1  2  3  ← 答案
```

### 代码模板

```python
# LCS 长度
def longest_common_subsequence(text1, text2):
    m, n = len(text1), len(text2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if text1[i-1] == text2[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
            else:
                dp[i][j] = max(dp[i-1][j], dp[i][j-1])
    return dp[m][n]

# 编辑距离（LCS 变体）⭐
def min_distance(word1, word2):
    m, n = len(word1), len(word2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if word1[i-1] == word2[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]) + 1
    return dp[m][n]
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 最长公共子序列 | 1143 |
| Medium | 编辑距离 | 72 |
| Medium | 不相交的线 | 1035 |
| Medium | 两个字符串的删除操作 | 583 |

---

## 2. 最长递增子序列 (LIS) ⭐⭐

### 理解与可视化

```
问题: 找到最长的严格递增子序列（不要求连续）

  nums = [10, 9, 2, 5, 3, 7, 101, 18]
  LIS = [2, 3, 7, 101] 或 [2, 5, 7, 101]，长度 = 4

方法1: DP O(n²)
  dp[i] = 以 nums[i] 结尾的 LIS 长度
  dp[i] = max(dp[j] + 1) for all j < i where nums[j] < nums[i]

  i:    0    1    2    3    4    5    6    7
  num:  10   9    2    5    3    7   101   18
  dp:   1    1    1    2    2    3    4    4

方法2: 贪心+二分 O(n log n) ⭐
  维护一个 tails 数组，tails[i] = 长度为 i+1 的 LIS 的最小末尾
  tails 始终有序，用二分查找找插入位置

  [10] → [9] → [2] → [2,5] → [2,3] → [2,3,7] → [2,3,7,101] → [2,3,7,18]
  长度 = 4
```

### 代码模板

```python
# LIS O(n²)
def length_of_lis(nums):
    n = len(nums)
    dp = [1] * n
    for i in range(1, n):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp)

# LIS O(n log n) ⭐ 贪心+二分
import bisect

def length_of_lis_fast(nums):
    tails = []
    for x in nums:
        pos = bisect.bisect_left(tails, x)
        if pos == len(tails):
            tails.append(x)
        else:
            tails[pos] = x
    return len(tails)

# 最长递增子序列的个数
def find_number_of_lis(nums):
    n = len(nums)
    dp = [1] * n    # 长度
    cnt = [1] * n   # 方案数
    for i in range(1, n):
        for j in range(i):
            if nums[j] < nums[i]:
                if dp[j] + 1 > dp[i]:
                    dp[i] = dp[j] + 1
                    cnt[i] = cnt[j]
                elif dp[j] + 1 == dp[i]:
                    cnt[i] += cnt[j]
    max_len = max(dp)
    return sum(cnt[i] for i in range(n) if dp[i] == max_len)

# 俄罗斯套娃信封（二维 LIS）
def max_envelopes(envelopes):
    # 按宽度升序，宽度相同按高度降序
    envelopes.sort(key=lambda x: (x[0], -x[1]))
    # 对高度求 LIS
    tails = []
    for _, h in envelopes:
        pos = bisect.bisect_left(tails, h)
        if pos == len(tails):
            tails.append(h)
        else:
            tails[pos] = h
    return len(tails)
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 最长递增子序列 | 300 |
| Medium | 最长递增子序列的个数 | 673 |
| Hard | 俄罗斯套娃信封问题 | 354 |
| Medium | 最长数对链 | 646 |

---

## 3. 其他线性 DP

### 代码模板

```python
# 不同的子序列（s 中有多少个子序列等于 t）
def num_distinct(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(m + 1):
        dp[i][0] = 1
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dp[i][j] = dp[i-1][j]
            if s[i-1] == t[j-1]:
                dp[i][j] += dp[i-1][j-1]
    return dp[m][n]

# 最长回文子串（区间 DP，也可中心扩展）
def longest_palindrome(s):
    n = len(s)
    start, max_len = 0, 1
    dp = [[False] * n for _ in range(n)]
    for i in range(n):
        dp[i][i] = True
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            if s[i] == s[j]:
                dp[i][j] = (length <= 3) or dp[i+1][j-1]
            if dp[i][j] and length > max_len:
                start, max_len = i, length
    return s[start:start + max_len]

# 解码方法
def num_decodings(s):
    if not s or s[0] == '0':
        return 0
    n = len(s)
    dp = [0] * (n + 1)
    dp[0] = dp[1] = 1
    for i in range(2, n + 1):
        if s[i-1] != '0':
            dp[i] += dp[i-1]
        two_digit = int(s[i-2:i])
        if 10 <= two_digit <= 26:
            dp[i] += dp[i-2]
    return dp[n]

# 最长公共子数组（连续）
def find_length(nums1, nums2):
    m, n = len(nums1), len(nums2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    ans = 0
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if nums1[i-1] == nums2[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
                ans = max(ans, dp[i][j])
    return ans
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 不同的子序列 | 115 |
| Medium | 最长回文子串 | 5 |
| Medium | 解码方法 | 91 |
| Medium | 最长重复子数组 | 718 |
| Medium | 交错字符串 | 97 |
| Medium | 不同的二叉搜索树 | 96 |
