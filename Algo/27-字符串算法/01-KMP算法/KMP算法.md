# KMP算法

> KMP (Knuth-Morris-Pratt) 在文本中查找模式串，利用前缀函数避免重复比较，时间 O(n+m)。

---

## 1. 核心思想

```
暴力匹配: O(n×m)
  text:    A B C A B C A B D
  pattern: A B C A B D
                     ✗  失配 → 回退到 text[1] 重来

KMP 优化: O(n+m)
  失配时不回退 text 指针, 而是用 next 数组跳转 pattern 指针

  next 数组 (前缀函数):
    next[i] = pattern[0..i] 的最长 相等真前后缀 长度

    pattern: A B C A B D
    index:   0 1 2 3 4 5
    next:   [0 0 0 1 2 0]

    next[4]=2: "ABCAB" 的最长相等前后缀是 "AB" (长度2)

  失配时:
    text:     A B C A B C A B D
    pattern:  A B C A B D
                       ↑ 位置5失配

    j = next[5-1] = next[4] = 2
    pattern 跳到位置2继续:

    text:     A B C A B C A B D
    pattern:        A B C A B D
                       ↑ 位置2, text[5]='C' == pattern[2]='C' ✓

  ⚠️ 关键: pattern 已匹配的前缀 "ABCAB"
     其后缀 "AB" == 前缀 "AB"
     所以跳到位置2后, 前面的 "AB" 不需要重新比较
```

---

## 2. 构建 next 数组

```python
def build_next(pattern):
    m = len(pattern)
    nxt = [0] * m
    j = 0                                  # ⚠️ j = 已匹配的前缀长度
    
    for i in range(1, m):                  # ⚠️ i 从 1 开始
        while j > 0 and pattern[i] != pattern[j]:
            j = nxt[j - 1]                # ⚠️ 回退! 不是 j -= 1
        if pattern[i] == pattern[j]:
            j += 1
        nxt[i] = j
    
    return nxt

# ⚠️ 易错点:
#  1. j 的含义: pattern[0..j-1] 是当前位置的最长相等前缀
#  2. 回退: j = nxt[j-1], 不是 j = j-1
#     因为 nxt[j-1] 是更短的相等前后缀长度
#  3. i 从 1 开始, nxt[0] 始终为 0
#
# 时间: O(m), 因为 j 最多增加 m 次, 所以最多减少 m 次
```

---

## 3. KMP 匹配

```python
def kmp_search(text, pattern):
    n, m = len(text), len(pattern)
    if m == 0:
        return [0]                         # ⚠️ 空模式匹配所有位置
    
    nxt = build_next(pattern)
    j = 0                                  # ⚠️ pattern 中的指针
    results = []
    
    for i in range(n):                     # ⚠️ text 指针 i 只前进不后退!
        while j > 0 and text[i] != pattern[j]:
            j = nxt[j - 1]                # ⚠️ 回退 pattern 指针
        if text[i] == pattern[j]:
            j += 1
        if j == m:                         # ⚠️ 完全匹配
            results.append(i - m + 1)      # ⚠️ 匹配起始位置
            j = nxt[j - 1]                 # ⚠️ 继续找下一个匹配
    
    return results

# ⚠️ 时间 O(n + m):
#    text 指针 i 不回退, 每步 O(1) 均摊
#    j 的增减次数总共 O(n)
```

---

## 4. LeetCode 28: 找出字符串中第一个匹配项的下标

```python
def strStr(haystack, needle):
    if not needle:
        return 0
    
    nxt = build_next(needle)
    j = 0
    
    for i in range(len(haystack)):
        while j > 0 and haystack[i] != needle[j]:
            j = nxt[j - 1]
        if haystack[i] == needle[j]:
            j += 1
        if j == len(needle):
            return i - len(needle) + 1     # ⚠️ 第一个匹配 → 直接返回
    
    return -1                              # ⚠️ 未找到
```

---

## 5. LeetCode 459: 重复的子字符串

```
判断 s 是否由某个子串重复多次构成
  "abab" = "ab" × 2 → True
  "abc" → False

KMP 巧解:
  如果 s 有周期 p, 则 len - next[len-1] = p
  s 可以重复 ↔ p 整除 len 且 p < len
```

```python
def repeatedSubstringPattern(s):
    n = len(s)
    nxt = build_next(s)
    period = n - nxt[n - 1]               # ⚠️ 最小周期
    return nxt[n - 1] > 0 and n % period == 0
    # ⚠️ nxt[n-1] > 0: 确保有非空前后缀
    # ⚠️ n % period == 0: 周期整除长度

# 另一巧解 (不用 KMP):
def repeatedSubstringPattern_v2(s):
    return s in (s + s)[1:-1]
    # "abab" + "abab" = "abababab"
    # 去掉首尾: "bababab" → 包含 "abab" → True
```

---

## 6. LeetCode 214: 最短回文串

```
在 s 前面添加最少字符使其成为回文串

思路: 找 s 的最长回文前缀
  s = "aacecaaa"
  最长回文前缀 = "aacecaa" (长度7)
  需要在前面加 s[7:] 的逆序 = "a"
  结果 = "aaacecaaa"

用 KMP:
  构造 s + "#" + reverse(s)
  求 next 数组, 最后一个值 = 最长回文前缀长度
```

```python
def shortestPalindrome(s):
    rev = s[::-1]
    combined = s + "#" + rev               # ⚠️ "#" 分隔, 防止交叉匹配
    nxt = build_next(combined)
    
    longest = nxt[-1]                      # ⚠️ 最长回文前缀长度
    suffix = s[longest:]                   # ⚠️ 不属于回文前缀的尾部
    return suffix[::-1] + s                # ⚠️ 翻转后加到前面
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Easy | 找出字符串中第一个匹配项 | 28 | 基础KMP |
| Easy | 重复的子字符串 | 459 | 周期性判断 |
| Hard | 最短回文串 | 214 | KMP + 回文 |
| Hard | 通过连接子字符串的方式 | 30 | 滑动窗口 |

---

## 本节要点速查

```
✅ next[i] = pattern[0..i] 的最长相等真前后缀长度
✅ 构建 next: j=nxt[j-1] 回退, 不是 j-=1
✅ 匹配: text指针不回退, pattern指针用next跳转
✅ 重复子串: period = n - nxt[n-1], n%period==0
✅ 最短回文: s+"#"+rev(s) 的 next 末尾值
✅ 时间 O(n+m), 空间 O(m)
```
