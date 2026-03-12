# GCD / LCM / 快速幂

> GCD (最大公约数)、LCM (最小公倍数)、快速幂、模逆元是数论中最常用的工具。

---

## 1. GCD (最大公约数)

```
欧几里得算法 (辗转相除法):
  gcd(a, b) = gcd(b, a % b)
  gcd(a, 0) = a

  例: gcd(48, 18)
    = gcd(18, 48%18) = gcd(18, 12)
    = gcd(12, 18%12) = gcd(12, 6)
    = gcd(6, 12%6)   = gcd(6, 0)
    = 6

  时间: O(log(min(a,b)))
```

```python
import math

# Python 内置
math.gcd(48, 18)  # → 6

# 手写 (面试可能需要)
def gcd(a, b):
    while b:
        a, b = b, a % b                   # ⚠️ 同时赋值
    return a

# ⚠️ Python 3.9+ 支持 math.gcd 多参数:
#    math.gcd(12, 18, 24) → 6
# 3.9 以下:
from functools import reduce
def gcd_multi(*args):
    return reduce(math.gcd, args)
```

---

## 2. LCM (最小公倍数)

```
lcm(a, b) = a × b ÷ gcd(a, b)

⚠️ 先除再乘, 防止溢出 (Python不怕, 但好习惯):
   lcm(a, b) = a // gcd(a, b) * b
```

```python
def lcm(a, b):
    return a // math.gcd(a, b) * b         # ⚠️ 先除后乘

# Python 3.9+
math.lcm(12, 18)  # → 36
```

---

## 3. 快速幂

```
计算 base^exp % mod

暴力: 连乘 exp 次 → O(exp)
快速幂: 将 exp 拆成二进制 → O(log exp)

  例: 3^13, 13 = 1101₂
  3^13 = 3^8 × 3^4 × 3^1

  方法: 反复平方
  ┌───────────────────────────────────────┐
  │ exp  base      result                 │
  │ 1101 3         1                      │
  │ 1101 3         1 × 3 = 3    (末位1)   │
  │ 110  9         3            (末位0)   │
  │ 11   81        3 × 81 = 243  (末位1)  │
  │ 1    6561      243 × 6561   (末位1)   │
  └───────────────────────────────────────┘
```

```python
def power(base, exp, mod=10**9 + 7):
    result = 1
    base %= mod                            # ⚠️ 先取模
    while exp > 0:
        if exp & 1:                        # ⚠️ 末位是 1
            result = result * base % mod
        base = base * base % mod           # ⚠️ 平方
        exp >>= 1                          # ⚠️ 右移
    return result

# ⚠️ 每步都取模, 防止中间结果过大
# ⚠️ Python 内置: pow(base, exp, mod) 等效且更快

# LeetCode 50: Pow(x, n)
def myPow(x, n):
    if n < 0:
        x = 1 / x                          # ⚠️ 负指数 → 取倒数
        n = -n
    result = 1.0
    while n > 0:
        if n & 1:
            result *= x
        x *= x
        n >>= 1
    return result
```

---

## 4. 模逆元

```
求 a 的模逆元: 找 x 使得 a × x ≡ 1 (mod p)
即: x = a^(-1) mod p

方法1: 费马小定理 (p 是质数)
  a^(p-1) ≡ 1 (mod p)
  → a^(-1) ≡ a^(p-2) (mod p)
  → 用快速幂求 power(a, p-2, p)

方法2: 扩展欧几里得 (p 不一定是质数, 但 gcd(a,p)=1)
```

```python
def mod_inverse(a, mod=10**9 + 7):
    """费马小定理求逆元, mod 必须是质数"""
    return pow(a, mod - 2, mod)            # ⚠️ a^(mod-2) mod mod

# 应用: 模意义下的除法
# a / b mod p = a × b^(-1) mod p = a × pow(b, p-2, p) mod p

# 例: 组合数 C(n,k) mod p
# C(n,k) = n! / (k! × (n-k)!)
# mod p: C(n,k) = n! × inv(k!) × inv((n-k)!) mod p

# ⚠️ 前提: mod 是质数!
#    如果 mod 不是质数, 需要扩展欧几里得
```

---

## 5. 扩展欧几里得 (exgcd)

```
求 ax + by = gcd(a, b) 的一组解 (x, y)

应用: 求模逆元 (mod 不一定是质数时)
  ax ≡ 1 (mod m) → ax + my = 1 → 用 exgcd 求 x
```

```python
def exgcd(a, b):
    """返回 (g, x, y) 满足 ax + by = g = gcd(a,b)"""
    if b == 0:
        return a, 1, 0
    g, x1, y1 = exgcd(b, a % b)
    return g, y1, x1 - (a // b) * y1

def mod_inverse_exgcd(a, mod):
    """扩展欧几里得求逆元"""
    g, x, _ = exgcd(a, mod)
    if g != 1:
        return -1                          # ⚠️ 逆元不存在
    return x % mod                         # ⚠️ 确保正数
```

---

## 6. LeetCode 69: x 的平方根

```python
# 二分法 (整数)
def mySqrt(x):
    lo, hi = 0, x
    while lo <= hi:
        mid = (lo + hi) // 2
        if mid * mid <= x:                 # ⚠️ <=, 找最大的 mid
            lo = mid + 1
        else:
            hi = mid - 1
    return hi                              # ⚠️ 返回 hi

# 牛顿迭代法
def mySqrt_newton(x):
    if x < 2:
        return x
    r = x
    while r * r > x:
        r = (r + x // r) // 2             # ⚠️ 整数除法
    return r
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | Pow(x, n) | 50 | 快速幂+负指数 |
| Easy | x 的平方根 | 69 | 二分/牛顿 |
| Med | 超级次方 | 372 | 大指数快速幂 |
| Hard | 阶乘后的零 | 172 | 数学分析 |

---

## 本节要点速查

```
✅ GCD: gcd(a,b) = gcd(b, a%b), O(log min(a,b))
✅ LCM: a // gcd(a,b) * b, 先除后乘
✅ 快速幂: O(log exp), 每步取模, Python 用 pow(b,e,m)
✅ 模逆元: a^(p-2) mod p (费马小定理, p是质数)
✅ 负指数: x^(-n) = (1/x)^n
✅ exgcd: 求 ax+by=gcd 的解, mod非质数时求逆元
```
