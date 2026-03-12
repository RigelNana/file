# 其他线性 DP

> 线性 DP 的更多经典问题：不同的子序列、最长回文子串、解码方法、最长公共子数组等。

---

## 1. LeetCode 115: 不同的子序列

```
题目: s 中有多少个子序列等于 t
示例: s="rabbbit", t="rabbit" → 3

状态: dp[i][j] = s[:i] 中有几个子序列等于 t[:j]

转移:
  s[i-1] == t[j-1]:
    dp[i][j] = dp[i-1][j-1] + dp[i-1][j]
    ① dp[i-1][j-1]: 用 s[i-1] 匹配 t[j-1]
    ② dp[i-1][j]:   不用 s[i-1] (跳过)
  
  s[i-1] != t[j-1]:
    dp[i][j] = dp[i-1][j]    只能跳过 s[i-1]

Base case:
  dp[i][0] = 1   (t 为空，有 1 种方案：空子序列)
  dp[0][j] = 0   (s 为空但 t 不为空，0 种)  (j>0)

⚠️ 注意: dp[0][0] = 1  (都为空，1 种)
```

```python
def numDistinct(s, t):
    m, n = len(s), len(t)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    # ⚠️ base case: dp[i][0] = 1
    for i in range(m + 1):
        dp[i][0] = 1
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            dp[i][j] = dp[i-1][j]   # 不用 s[i-1]
            if s[i-1] == t[j-1]:
                dp[i][j] += dp[i-1][j-1]  # 用 s[i-1]
    
    return dp[m][n]

# 模拟: s="rab", t="ab"
#       ""  a  b
#  ""    1  0  0
#  r     1  0  0      r≠a,b
#  a     1  1  0      a==a → dp[1][0]+dp[2][1] = 1+0 = 1
#  b     1  1  1      b==b → dp[2][1]+dp[3][2] = 1+0 = 1
# dp[3][2] = 1 ✓

# ⚠️ 空间优化: 倒序遍历 j
def numDistinct_opt(s, t):
    n = len(t)
    dp = [0] * (n + 1)
    dp[0] = 1
    for c in s:
        for j in range(n, 0, -1):  # ⚠️ 倒序! 防止覆盖
            if c == t[j-1]:
                dp[j] += dp[j-1]
    return dp[n]
```

---

## 2. LeetCode 5: 最长回文子串

```
题目: 返回最长回文子串
示例: "babad" → "bab" 或 "aba"

方法1: 中心扩展 O(n²) (更推荐)
  从每个位置向两边扩展
  奇数长度: 中心是 1 个字符
  偶数长度: 中心是 2 个字符

方法2: 区间 DP O(n²)
  dp[i][j] = s[i..j] 是否是回文
  dp[i][j] = (s[i]==s[j]) and (j-i<3 or dp[i+1][j-1])
  
⚠️ j-i < 3: 
   长度 1 (i==j) 或长度 2 (j==i+1) 或长度 3 (j==i+2)
   这些只要 s[i]==s[j] 就是回文
```

```python
# 方法1: 中心扩展 (推荐)
def longestPalindrome(s):
    n = len(s)
    start, max_len = 0, 1
    
    def expand(l, r):
        nonlocal start, max_len
        while l >= 0 and r < n and s[l] == s[r]:
            if r - l + 1 > max_len:
                start = l
                max_len = r - l + 1
            l -= 1
            r += 1
    
    for i in range(n):
        expand(i, i)      # 奇数长度
        expand(i, i + 1)   # 偶数长度
    
    return s[start:start + max_len]

# ⚠️ expand(i, i): 奇数回文 "aba"
#    expand(i, i+1): 偶数回文 "abba"
#    两种都要检查!

# 方法2: 区间 DP
def longestPalindrome_dp(s):
    n = len(s)
    dp = [[False] * n for _ in range(n)]
    start, max_len = 0, 1
    
    # ⚠️ 单个字符是回文
    for i in range(n):
        dp[i][i] = True
    
    # ⚠️ 按长度从小到大枚举
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            if s[i] == s[j]:
                # ⚠️ 长度 ≤ 3: s[i]==s[j] → 回文
                dp[i][j] = (length <= 3) or dp[i+1][j-1]
            if dp[i][j] and length > max_len:
                start, max_len = i, length
    
    return s[start:start + max_len]
```

---

## 3. LeetCode 516: 最长回文子序列

```
题目: 返回最长回文子序列的长度 (子序列可不连续)
示例: "bbbab" → "bbbb"，长度 4

状态: dp[i][j] = s[i..j] 的最长回文子序列长度

转移:
  s[i] == s[j]: dp[i][j] = dp[i+1][j-1] + 2
  s[i] != s[j]: dp[i][j] = max(dp[i+1][j], dp[i][j-1])

Base: dp[i][i] = 1

⚠️ 回文子串 vs 回文子序列:
   子串: dp[i][j] = bool (是否是回文)
   子序列: dp[i][j] = int (最长长度)
```

```python
def longestPalindromeSubseq(s):
    n = len(s)
    dp = [[0] * n for _ in range(n)]
    
    for i in range(n):
        dp[i][i] = 1
    
    # ⚠️ i 从大到小! 因为 dp[i] 依赖 dp[i+1]
    for i in range(n - 2, -1, -1):
        for j in range(i + 1, n):
            if s[i] == s[j]:
                dp[i][j] = dp[i+1][j-1] + 2
            else:
                dp[i][j] = max(dp[i+1][j], dp[i][j-1])
    
    return dp[0][n-1]

# ⚠️ 循环方向: i 从 n-2 到 0 (从下往上)
#              j 从 i+1 到 n-1 (从左往右)
#    因为 dp[i][j] 依赖 dp[i+1][...] (下面的行)
```

---

## 4. LeetCode 91: 解码方法

```
题目: 数字字符串 "12" → 可以解码为 "AB" 或 "L"
     返回解码方法总数

映射: 'A'=1, 'B'=2, ..., 'Z'=26

状态: dp[i] = s[:i] 的解码方案数

转移:
  ① 最后取 1 位: s[i-1] != '0' → dp[i] += dp[i-1]
  ② 最后取 2 位: 10 ≤ int(s[i-2:i]) ≤ 26 → dp[i] += dp[i-2]

⚠️ '0' 不能单独解码！'01' 也无效
   所以只有 s[i-1] != '0' 时才能取 1 位
   只有 10~26 范围才能取 2 位
```

```python
def numDecodings(s):
    if not s or s[0] == '0':   # ⚠️ 以 0 开头无法解码
        return 0
    
    n = len(s)
    dp = [0] * (n + 1)
    dp[0] = 1    # ⚠️ 空串 = 1 种 (base case)
    dp[1] = 1    # s[0] != '0' (已检查)
    
    for i in range(2, n + 1):
        # 取最后 1 位
        if s[i-1] != '0':           # ⚠️ 不是 '0' 才有效
            dp[i] += dp[i-1]
        # 取最后 2 位
        two = int(s[i-2:i])
        if 10 <= two <= 26:          # ⚠️ 10~26 范围
            dp[i] += dp[i-2]
    
    return dp[n]

# 模拟: s = "226"
# dp[0]=1, dp[1]=1
# i=2: s[1]='2'≠'0' → dp[2]+=dp[1]=1
#       "22" → 22 ∈ [10,26] → dp[2]+=dp[0]=1 → dp[2]=2
# i=3: s[2]='6'≠'0' → dp[3]+=dp[2]=2
#       "26" → 26 ∈ [10,26] → dp[3]+=dp[1]=1 → dp[3]=3
# 答案: 3 ("BZ", "VF", "BBF" ... 实际是 "2|2|6", "22|6", "2|26")

# 空间优化: 只需 dp[i-1] 和 dp[i-2]
def numDecodings_opt(s):
    if not s or s[0] == '0':
        return 0
    a, b = 1, 1  # dp[i-2], dp[i-1]
    for i in range(2, len(s) + 1):
        c = 0
        if s[i-1] != '0':
            c += b
        two = int(s[i-2:i])
        if 10 <= two <= 26:
            c += a
        a, b = b, c
    return b
```

---

## 5. LeetCode 718: 最长重复子数组 (公共子数组)

```
题目: 两个数组的最长公共子数组 (连续!)
示例: nums1=[1,2,3,2,1], nums2=[3,2,1,4,7] → [3,2,1] → 3

⚠️ LCS (子序列) vs 这题 (子数组):
   LCS: 不匹配时 dp[i][j] = max(dp[i-1][j], dp[i][j-1])
   子数组: 不匹配时 dp[i][j] = 0 (断了)
   子数组答案 = max(所有 dp[i][j]), 不是 dp[m][n]
```

```python
def findLength(nums1, nums2):
    m, n = len(nums1), len(nums2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    ans = 0
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if nums1[i-1] == nums2[j-1]:
                dp[i][j] = dp[i-1][j-1] + 1
                ans = max(ans, dp[i][j])  # ⚠️ 随时更新 ans
            # ⚠️ 不匹配时 dp[i][j] = 0 (默认值, 不需要写)
    
    return ans  # ⚠️ 不是 dp[m][n]!

# 空间优化:
def findLength_opt(nums1, nums2):
    m, n = len(nums1), len(nums2)
    dp = [0] * (n + 1)
    ans = 0
    for i in range(1, m + 1):
        # ⚠️ 倒序! 类似 0-1 背包, 避免覆盖
        for j in range(n, 0, -1):
            if nums1[i-1] == nums2[j-1]:
                dp[j] = dp[j-1] + 1
                ans = max(ans, dp[j])
            else:
                dp[j] = 0  # ⚠️ 必须重置为 0! 不能省略
    return ans
```

---

## 6. LeetCode 97: 交错字符串

```
题目: s3 是否由 s1 和 s2 交错组成
示例: s1="aab", s2="axy", s3="aaxaby"
     a|a|x|a|b|y → s1 提供 a,a,b; s2 提供 a,x,y ✓

状态: dp[i][j] = s1[:i] 和 s2[:j] 能否交错组成 s3[:i+j]

⚠️ 前提: len(s1) + len(s2) == len(s3)，否则直接 False
```

```python
def isInterleave(s1, s2, s3):
    m, n = len(s1), len(s2)
    if m + n != len(s3):           # ⚠️ 长度不对直接 False
        return False
    
    dp = [[False] * (n + 1) for _ in range(m + 1)]
    dp[0][0] = True
    
    # ⚠️ base case: 只用 s1 或只用 s2
    for i in range(1, m + 1):
        dp[i][0] = dp[i-1][0] and s1[i-1] == s3[i-1]
    for j in range(1, n + 1):
        dp[0][j] = dp[0][j-1] and s2[j-1] == s3[j-1]
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            k = i + j - 1   # ⚠️ s3 的当前位置
            dp[i][j] = (dp[i-1][j] and s1[i-1] == s3[k]) or \
                       (dp[i][j-1] and s2[j-1] == s3[k])
    
    return dp[m][n]
```

---

## 7. LeetCode 96: 不同的二叉搜索树

```
题目: 1~n 节点能形成几种不同的 BST
示例: n=3 → 5 种

状态: dp[n] = n 个节点的 BST 个数 (卡特兰数)

转移: 枚举根节点 i (1~n)
     左子树 i-1 个节点, 右子树 n-i 个节点
     dp[n] = sum(dp[i-1] * dp[n-i] for i in 1..n)

⚠️ 这是卡特兰数: C(n) = C(2n,n)/(n+1)
```

```python
def numTrees(n):
    dp = [0] * (n + 1)
    dp[0] = 1   # ⚠️ 空树也算 1 种
    dp[1] = 1
    
    for i in range(2, n + 1):
        for j in range(1, i + 1):
            dp[i] += dp[j-1] * dp[i-j]
    
    return dp[n]

# dp[3] = dp[0]*dp[2] + dp[1]*dp[1] + dp[2]*dp[0]
#        = 1*2 + 1*1 + 2*1 = 5
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Hard | 不同的子序列 | 115 | 匹配计数 |
| Med | 最长回文子串 | 5 | 中心扩展/区间DP |
| Med | 最长回文子序列 | 516 | 区间DP |
| Med | 解码方法 | 91 | 条件转移 |
| Med | 最长重复子数组 | 718 | 连续 vs 子序列 |
| Med | 交错字符串 | 97 | 二维 bool DP |
| Med | 不同的二叉搜索树 | 96 | 卡特兰数 |

---

## 本节要点速查

```
✅ 不同的子序列: 匹配时 dp[i-1][j-1]+dp[i-1][j]
✅ 回文子串: 中心扩展更直观; 区间DP按长度枚举
✅ 回文子序列: i 从大到小, 因为依赖 dp[i+1]
✅ 解码方法: '0' 不能单独解码, 两位需在 10~26
✅ 公共子数组: 不匹配 dp=0, 答案是全局 max
✅ 交错字符串: k=i+j-1, 从 s1 或 s2 选
✅ BST 计数 = 卡特兰数, dp[0]=1
```
