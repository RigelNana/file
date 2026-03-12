# 数位DP

> 逐位枚举数字的每一位，统计 [0, n] 或 [lo, hi] 中满足特定条件的数的个数。

---

## 1. 核心思想

```
问题: 给定上界 n, 求 [1, n] 中满足某条件的数有多少个

思路: 把 n 转成字符串 s, 从高位到低位逐位确定

  例: n = 234, s = "234"
  
  第 0 位: 可以填 1 或 2
    填 1 → 后面两位可以自由填 (0-9) → 不受限
    填 2 → 后面受限, 第 1 位最多填 3

  关键参数:
  ┌──────────┬──────────────────────────────────┐
  │ is_limit  │ 当前位是否受上界限制              │
  │           │ True → 最多填 s[i]                │
  │           │ False → 可以填 0-9 (自由)         │
  ├──────────┼──────────────────────────────────┤
  │ is_num   │ 前面是否已经选了数字              │
  │           │ False → 可以继续跳过 (前导零)     │
  │           │ True → 必须选一个数字             │
  └──────────┴──────────────────────────────────┘

  ⚠️ is_limit: 只有前面的位都贴着上界时才受限
     一旦某位 d < s[i], 后面就不再受限
  ⚠️ is_num: 用于处理前导零
     没有前导零的简单题可以省略
```

---

## 2. 通用模板

```python
from functools import cache

def digit_dp(n):
    """统计 [1, n] 中满足条件的数"""
    s = str(n)
    
    @cache
    def dfs(i, mask, is_limit, is_num):
        """
        i:        当前填第 i 位 (0-indexed)
        mask:     问题相关的状态 (用过的数字集合/余数/...)
        is_limit: True → 第 i 位最大只能填 int(s[i])
        is_num:   True → 前面已经填了数字
        """
        if i == len(s):
            return 1 if is_num else 0      # ⚠️ 必须是合法数字
        
        res = 0
        
        # 选择跳过 (前导零)
        if not is_num:
            res = dfs(i + 1, mask, False, False)
            # ⚠️ 跳过后 is_limit=False (跳过 = 填了前导0, 不贴上界)
        
        # 确定当前位的范围
        lo = 0 if is_num else 1            # ⚠️ 如果前面没数字, 从1开始
        hi = int(s[i]) if is_limit else 9  # ⚠️ 受限取 s[i], 否则取 9
        
        for d in range(lo, hi + 1):        # ⚠️ hi + 1, 闭区间
            # 根据题意判断 d 是否合法
            # 例: 检查 d 是否在 mask 中  →  if mask >> d & 1: continue
            res += dfs(i + 1, 
                       new_mask,           # 更新状态
                       is_limit and d == hi,  # ⚠️ 仍贴上界: 之前贴+当前也贴
                       True)               # 已选数字
        
        return res
    
    return dfs(0, 0, True, False)          # ⚠️ 初始: 第0位, 受限, 未选数字

# ⚠️ @cache 只对 hashable 参数有效
#    is_limit 和 is_num 是 bool, 如果不受限(False), 后续状态相同可复用
#    关键优化: is_limit=False 的分支会被大量复用
```

---

## 3. LeetCode 2376: 统计特殊整数

```
[1, n] 中各位数字都不同的数有多少个?

状态: mask — 已用过的数字集合 (10 位二进制)
检查: if mask >> d & 1 → d 已用过, 跳过
```

```python
def countSpecialNumbers(n):
    s = str(n)
    
    @cache
    def dfs(i, mask, is_limit, is_num):
        if i == len(s):
            return 1 if is_num else 0
        
        res = 0
        if not is_num:
            res = dfs(i + 1, mask, False, False)
        
        lo = 0 if is_num else 1
        hi = int(s[i]) if is_limit else 9
        
        for d in range(lo, hi + 1):
            if mask >> d & 1:              # ⚠️ d 已用过
                continue
            res += dfs(i + 1, 
                       mask | (1 << d),    # ⚠️ 标记 d
                       is_limit and d == hi, 
                       True)
        return res
    
    return dfs(0, 0, True, False)

# ⚠️ mask 是 10 位二进制 (0-9 共10个数字)
#    mask | (1 << d): 将 d 加入已用集合
#    mask >> d & 1:   检查 d 是否已用
```

---

## 4. LeetCode 1012: 至少有1位重复的数字

```
答案 = n - countSpecialNumbers(n)

利用补集: 至少1位重复 = 总数 - 各位不同
```

```python
def numDupDigitsAtMostN(n):
    return n - countSpecialNumbers(n)
```

---

## 5. LeetCode 600: 不含连续1的非负整数

```
[0, n] 中二进制表示不含连续 1 的数有多少?

关键: 对二进制的每一位做数位 DP
状态: 上一位是否为 1
```

```python
def findIntegers(n):
    s = bin(n)[2:]    # ⚠️ 转二进制字符串, 不含 "0b"
    
    @cache
    def dfs(i, prev_one, is_limit):
        if i == len(s):
            return 1
        
        res = 0
        hi = int(s[i]) if is_limit else 1  # ⚠️ 二进制, 上界是 1
        
        for d in range(0, hi + 1):
            if d == 1 and prev_one:         # ⚠️ 连续两个 1, 不合法
                continue
            res += dfs(i + 1, 
                       d == 1,
                       is_limit and d == hi)
        return res
    
    return dfs(0, False, True)

# ⚠️ 二进制数位DP:
#    s = bin(n)[2:] 转成 "101101" 之类
#    每位只能填 0 或 1
#    不需要 is_num (没有前导零问题, 0 也算有效)
```

---

## 6. 区间查询 [lo, hi]

```
很多题要求 [lo, hi] 中满足条件的数
使用前缀和技巧:

  f(lo, hi) = f(hi) - f(lo - 1)

  或: f(lo, hi) = digit_dp(hi) - digit_dp(lo - 1)

⚠️ 注意 lo-1 可能是 0, 检查边界
```

---

## 7. 常见变种

```
┌────────────────────────────────┬──────────────────────────┐
│ 问题类型                       │ mask/状态设计            │
├────────────────────────────────┼──────────────────────────┤
│ 各位数字都不同                 │ mask: 10位已用数字集合   │
│ 数字和被 k 整除               │ mask: 当前数字和 mod k   │
│ 不含连续1 (二进制)             │ prev_one: 上一位是否为1  │
│ 不含数字 4                     │ 无额外状态, 跳过 d==4   │
│ 数字中 1 的个数               │ cnt: 当前1的个数         │
│ 平衡数 (左力矩=右力矩)        │ moment: 当前力矩值      │
└────────────────────────────────┴──────────────────────────┘
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Hard | 统计特殊整数 | 2376 | 标准模板+mask |
| Hard | 至少有1位重复的数字 | 1012 | 补集思想 |
| Hard | 不含连续1的非负整数 | 600 | 二进制数位DP |
| Med | 最大为 N 的数字组合 | 902 | 受限数字集合 |
| Hard | 范围内的数字计数 | 1067 | 区间前缀和 |

---

## 本节要点速查

```
✅ 数位DP: 逐位枚举, 记忆化搜索
✅ is_limit: 前面位都贴上界时当前位才受限
✅ is_num: 处理前导零 (可选数字, 或继续跳过)
✅ lo = 0 if is_num else 1, hi = s[i] if is_limit else 9
✅ @cache 自动记忆化, is_limit=False 的分支可复用
✅ 区间 [lo,hi] → f(hi) - f(lo-1)
✅ 二进制数位DP: bin(n)[2:], hi=1
```
