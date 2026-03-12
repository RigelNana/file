# Manacher算法

> O(n) 求所有回文子串/最长回文子串，通过利用已知回文的对称性避免重复计算。

---

## 1. 核心思想

```
预处理: 在字符间插入 '#', 统一奇偶长度

  s = "abba"  →  t = "#a#b#b#a#"
  s = "aba"   →  t = "#a#b#a#"

  这样所有回文都变成奇数长度, 用统一方式处理

p[i]: 以 t[i] 为中心的最长回文半径 (不含自身)

  t = # a # b # b # a #
  p = 0 1 0 1 4 1 0 1 0

  p[4]=4: 以 t[4]='#' 为中心, 回文 "#a#b#b#a#" 半径4
  对应原串 "abba"

  ⚠️ 原串中的回文长度 = p[i]
     原串中的起始位置 = (i - p[i]) / 2

利用对称性加速:
  ┌───────────────────────────────────────────┐
  │ 维护已知的最远右边界 r 和对应中心 c        │
  │                                           │
  │ 如果 i < r:                                │
  │   j = 2*c - i  (i 关于 c 的对称点)         │
  │   p[i] = min(r-i, p[j])  (初始值)          │
  │   然后继续扩展                              │
  │                                           │
  │ 如果 i >= r:                               │
  │   p[i] = 0, 暴力扩展                       │
  └───────────────────────────────────────────┘

  ⚠️ p[j] 的信息可以直接复用
     但不能超过 r-i (右边界的限制)
```

---

## 2. 代码模板

```python
def manacher(s):
    """返回每个中心的回文半径数组"""
    # 预处理: 插入 #
    t = '#' + '#'.join(s) + '#'
    n = len(t)
    p = [0] * n
    c = r = 0                              # ⚠️ 最远回文的中心和右边界
    
    for i in range(n):
        if i < r:
            p[i] = min(r - i, p[2 * c - i])  # ⚠️ 对称点的值, 但不超过右边界
        
        # 暴力扩展
        while (i - p[i] - 1 >= 0 and 
               i + p[i] + 1 < n and
               t[i - p[i] - 1] == t[i + p[i] + 1]):
            p[i] += 1
        
        # 更新最远右边界
        if i + p[i] > r:
            c, r = i, i + p[i]             # ⚠️ r 是开区间右端
    
    return p, t

# ⚠️ 时间 O(n): r 只增不减, 暴力扩展的总量 O(n)
# ⚠️ p[i] 的含义: 从 t[i] 向两边扩展 p[i] 个字符
#    回文为 t[i-p[i] ... i+p[i]]
```

---

## 3. LeetCode 5: 最长回文子串

```python
def longestPalindrome(s):
    t = '#' + '#'.join(s) + '#'
    n = len(t)
    p = [0] * n
    c = r = 0
    max_len = 0
    center = 0
    
    for i in range(n):
        if i < r:
            p[i] = min(r - i, p[2 * c - i])
        
        while (i - p[i] - 1 >= 0 and 
               i + p[i] + 1 < n and
               t[i - p[i] - 1] == t[i + p[i] + 1]):
            p[i] += 1
        
        if i + p[i] > r:
            c, r = i, i + p[i]
        
        if p[i] > max_len:                 # ⚠️ 记录最长
            max_len = p[i]
            center = i
    
    # 还原到原串
    start = (center - max_len) // 2        # ⚠️ 原串起始位置
    return s[start : start + max_len]      # ⚠️ max_len = 原串回文长度

# ⚠️ 为什么 start = (center - max_len) // 2?
#    t 中位置 center 对应原串位置 center//2
#    回文在 t 中是 [center-max_len, center+max_len]
#    对应原串 [(center-max_len)//2, (center+max_len)//2)
#    长度 = max_len

# 对比中心扩展法: O(n²) 但实现简单
def longestPalindrome_expand(s):
    def expand(l, r):
        while l >= 0 and r < len(s) and s[l] == s[r]:
            l -= 1
            r += 1
        return s[l+1:r]
    
    result = ""
    for i in range(len(s)):
        odd = expand(i, i)                 # 奇数长度
        even = expand(i, i+1)              # 偶数长度
        result = max(result, odd, even, key=len)
    return result
```

---

## 4. LeetCode 214: 最短回文串 (Manacher 解法)

```python
def shortestPalindrome(s):
    """在 s 前面加最少字符使其成为回文"""
    if not s:
        return ""
    
    t = '#' + '#'.join(s) + '#'
    n = len(t)
    p = [0] * n
    c = r = 0
    
    for i in range(n):
        if i < r:
            p[i] = min(r - i, p[2 * c - i])
        while (i - p[i] - 1 >= 0 and 
               i + p[i] + 1 < n and
               t[i - p[i] - 1] == t[i + p[i] + 1]):
            p[i] += 1
        if i + p[i] > r:
            c, r = i, i + p[i]
    
    # 找从位置 0 开始的最长回文 (回文前缀)
    # 即 p[i] == i 的最大 i
    max_prefix = 0
    for i in range(n):
        if p[i] == i:                      # ⚠️ 回文延伸到字符串开头
            max_prefix = p[i]
    
    # max_prefix 就是最长回文前缀的长度
    suffix = s[max_prefix:]                # ⚠️ 不属于回文前缀的尾部
    return suffix[::-1] + s
```

---

## 5. 回文计数

```python
def count_palindromes(s):
    """统计 s 中回文子串的个数"""
    t = '#' + '#'.join(s) + '#'
    n = len(t)
    p = [0] * n
    c = r = 0
    
    for i in range(n):
        if i < r:
            p[i] = min(r - i, p[2 * c - i])
        while (i - p[i] - 1 >= 0 and 
               i + p[i] + 1 < n and
               t[i - p[i] - 1] == t[i + p[i] + 1]):
            p[i] += 1
        if i + p[i] > r:
            c, r = i, i + p[i]
    
    # 每个中心 i 贡献的回文数:
    # 原字符位置 (i 为奇数): (p[i]+1)//2 个  (半径 1,3,5,...)
    # 间隔位置 (i 为偶数):   p[i]//2 个      (半径 2,4,6,...)
    count = 0
    for i in range(n):
        count += (p[i] + 1) // 2 if i % 2 == 1 else p[i] // 2
    
    return count

# LC 647: 回文子串个数 → count_palindromes(s)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 最长回文子串 | 5 | Manacher 基础 |
| Hard | 最短回文串 | 214 | 最长回文前缀 |
| Med | 回文子串 | 647 | 回文计数 |
| Hard | 最长回文子序列 | 516 | DP (非Manacher) |

---

## 本节要点速查

```
✅ 预处理: 插入 '#' 统一奇偶, t = "#a#b#a#"
✅ p[i]: 以 t[i] 为中心的回文半径
✅ 对称优化: p[i] = min(r-i, p[2*c-i])
✅ 原串回文长度 = p[i], 起始 = (i-p[i])//2
✅ 回文前缀: p[i]==i 的最大 i
✅ O(n) 时间, r 只增不减保证线性
```
