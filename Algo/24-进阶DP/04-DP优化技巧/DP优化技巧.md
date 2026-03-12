# DP优化技巧

> 通过滚动数组、单调队列、矩阵快速幂等手段，压缩空间或加速DP转移。

---

## 1. 空间优化 — 滚动数组

```
原理: dp[i] 只依赖 dp[i-1] → 不需要保留所有行

  2D → 1D 滚动:
    原:  dp[i][j] = f(dp[i-1][...])
    优:  dp[j] = f(old_dp[...])    用两行轮换
    或:  dp[j] 就地更新 (注意遍历方向)

  经典案例: 0-1背包
    原: dp[i][w] = max(dp[i-1][w], dp[i-1][w-wi] + vi)
    优: dp[w] = max(dp[w], dp[w-wi] + vi)

  ⚠️ 0-1背包: 内层倒序遍历 → for w in range(W, wi-1, -1)
     完全背包: 内层正序遍历 → for w in range(wi, W+1)
     原因: 倒序 → 每件物品只用一次
           正序 → 同一物品可用多次
```

```python
# 0-1 背包 空间优化
def knapsack_01(weights, values, W):
    dp = [0] * (W + 1)
    for i in range(len(weights)):
        wi, vi = weights[i], values[i]
        for w in range(W, wi - 1, -1):      # ⚠️ 倒序!
            dp[w] = max(dp[w], dp[w - wi] + vi)
    return dp[W]

# 完全背包 空间优化  
def knapsack_complete(weights, values, W):
    dp = [0] * (W + 1)
    for i in range(len(weights)):
        wi, vi = weights[i], values[i]
        for w in range(wi, W + 1):           # ⚠️ 正序!
            dp[w] = max(dp[w], dp[w - wi] + vi)
    return dp[W]

# 2D DP → 两行交替
def min_path_sum(grid):
    m, n = len(grid), len(grid[0])
    prev = [0] * n
    prev[0] = grid[0][0]
    for j in range(1, n):
        prev[j] = prev[j-1] + grid[0][j]
    
    for i in range(1, m):
        curr = [0] * n
        curr[0] = prev[0] + grid[i][0]
        for j in range(1, n):
            curr[j] = min(prev[j], curr[j-1]) + grid[i][j]
        prev = curr                          # ⚠️ 交替
    
    return prev[n-1]

# ⚠️ 单行就地更新 (更省空间, 但要注意覆盖顺序):
#    如果 dp[i][j] 依赖 dp[i-1][j] 和 dp[i][j-1]:
#    从左到右更新, dp[j-1]已是当前行, dp[j]还是上一行 → 正确
#
#    如果 dp[i][j] 依赖 dp[i-1][j] 和 dp[i-1][j-1]:
#    需要保存 dp[j-1] 的旧值 → 用临时变量 or 倒序
```

---

## 2. 单调队列优化DP

```
场景: dp[i] = min/max(dp[j] + cost(j)) for j in [i-k, i-1]
      窗口大小 k, 暴力 O(nk) → 单调队列 O(n)

原理:
  维护一个递增/递减的双端队列
  队首保存窗口内的最优值
  新元素入队时弹出不如它的元素
  窗口左端超出范围时弹出队首

  ⚠️ 和"滑动窗口最大值"的单调队列完全一样
     只是这里窗口里存的是 dp[j]
```

```python
from collections import deque

# 跳跃游戏 变体: 每次最多跳 k 步, 每格有分数, 求最大得分
# dp[i] = max(dp[j] for j in [i-k, i-1]) + score[i]
def max_score_jump(score, k):
    n = len(score)
    dp = [0] * n
    dp[0] = score[0]
    dq = deque([0])                        # ⚠️ 存下标
    
    for i in range(1, n):
        # 移除超出窗口的队首
        while dq and dq[0] < i - k:       # ⚠️ < i-k, 不是 <= 
            dq.popleft()
        
        dp[i] = dp[dq[0]] + score[i]      # 队首是窗口最大值的下标
        
        # 维护递减队列
        while dq and dp[dq[-1]] <= dp[i]:  # ⚠️ <= 保证严格递减
            dq.pop()
        dq.append(i)
    
    return dp[n - 1]

# ⚠️ 单调队列存下标, 不存值!
#    因为需要判断是否超出窗口范围
#    取值时用 dp[dq[0]]
```

---

## 3. 矩阵快速幂

```
适用: 线性递推关系
  f(n) = a1*f(n-1) + a2*f(n-2) + ... + ak*f(n-k)

  构造转移矩阵 M (k×k):
    [f(n)  ]   [a1 a2 ... ak] [f(n-1)]
    [f(n-1)] = [1  0  ...  0] [f(n-2)]
    [f(n-2)]   [0  1  ...  0] [f(n-3)]
    [  ...  ]   [.. ..  ..  .] [ ...  ]
    [f(n-k+1)] [0  0  ... 0 ] [f(n-k)]

  [f(n), f(n-1), ...] = M^(n-k) × [f(k), f(k-1), ...]

  时间: O(k³ log n)
  
  例: 斐波那契 f(n) = f(n-1) + f(n-2)
      M = [[1,1],[1,0]]
      [f(n), f(n-1)] = M^(n-1) × [f(1), f(0)] = M^(n-1) × [1, 0]
```

```python
def matrix_mult(A, B, mod=10**9 + 7):
    """矩阵乘法 A × B"""
    n, m, k = len(A), len(B[0]), len(B)
    C = [[0] * m for _ in range(n)]
    for i in range(n):
        for j in range(m):
            for p in range(k):
                C[i][j] = (C[i][j] + A[i][p] * B[p][j]) % mod
    return C

def matrix_pow(M, exp, mod=10**9 + 7):
    """矩阵快速幂 M^exp"""
    n = len(M)
    # 单位矩阵
    result = [[1 if i == j else 0 for j in range(n)] for i in range(n)]
    while exp:
        if exp & 1:
            result = matrix_mult(result, M, mod)
        M = matrix_mult(M, M, mod)
        exp >>= 1
    return result

# ⚠️ 快速幂: 和整数快速幂一样, 只是乘法换成了矩阵乘法
#    exp & 1: 检查最低位
#    exp >>= 1: 右移
#    O(k³ log n)

# 斐波那契 O(log n)
def fib(n, mod=10**9 + 7):
    if n <= 1:
        return n
    M = [[1, 1], [1, 0]]
    res = matrix_pow(M, n - 1, mod)
    return res[0][0]                       # ⚠️ M^(n-1) 的 [0][0]
```

---

## 4. LeetCode 552: 学生出勤记录 II

```
n 天的出勤记录, 每天 P(出勤)/A(缺勤)/L(迟到)
合法: A最多1次, L不能连续3次
求合法记录数

状态: (A的总次数, 末尾连续L的次数)
  A: 0 或 1 (2种)
  L: 0, 1, 2 (3种)
  共 6 个状态

转移矩阵 6×6:
  下一天选P: L归零, A不变
  下一天选L: L+1 (L<3), A不变
  下一天选A: L归零, A+1 (A<2)
```

```python
def checkRecord(n):
    MOD = 10**9 + 7
    
    # 状态编号: (a, l) → a*3 + l
    # (0,0)=0, (0,1)=1, (0,2)=2, (1,0)=3, (1,1)=4, (1,2)=5
    
    # 构造转移矩阵
    M = [[0]*6 for _ in range(6)]
    for a in range(2):
        for l in range(3):
            s = a * 3 + l
            # 选 P: → (a, 0)
            M[a * 3 + 0][s] += 1
            # 选 L: → (a, l+1) if l+1 < 3
            if l + 1 < 3:
                M[a * 3 + l + 1][s] += 1
            # 选 A: → (a+1, 0) if a+1 < 2
            if a + 1 < 2:
                M[(a+1) * 3 + 0][s] += 1
    
    res = matrix_pow(M, n, MOD)
    
    # 初始状态 (0,0) → 第 0 列
    # 答案 = sum(res[s][0] for all valid s)
    ans = 0
    for s in range(6):
        ans = (ans + res[s][0]) % MOD
    return ans

# ⚠️ 转移矩阵 M[new_state][old_state] = 从old到new的转移次数
#    M^n × 初始向量 = n步后的状态分布
#    初始向量: 只有状态(0,0)为1
```

---

## 5. 优化技巧总结

```
┌─────────────────┬───────────────────────────────┬──────────┐
│ 技巧            │ 适用场景                      │ 复杂度   │
├─────────────────┼───────────────────────────────┼──────────┤
│ 滚动数组        │ dp[i]只依赖dp[i-1]            │ 空间÷n   │
│ 单调队列        │ dp[i]=extremum(dp[j]) j∈窗口  │ O(n)     │
│ 矩阵快速幂      │ 线性递推 f(n)=Σai*f(n-i)     │ O(k³logn)│
│ 斜率优化        │ 转移方程可拆成kx+b形式        │ O(n)     │
│ 四边形不等式    │ 区间DP满足单调性              │ O(n²)    │
│ 数据结构优化    │ 转移需要区间查询              │ O(nlogn) │
└─────────────────┴───────────────────────────────┴──────────┘

选择策略:
  - 空间大 → 先试滚动数组
  - 窗口min/max → 单调队列
  - n 极大(10^18) + 线性递推 → 矩阵快速幂
  - 1D/1D DP + 斜率 → 凸包优化
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 斐波那契数 | 509 | 矩阵快速幂入门 |
| Hard | 学生出勤记录 II | 552 | 6状态矩阵快速幂 |
| Med | 丑数 II | 264 | 多路归并+DP |
| Hard | 粉刷房子 II | 265 | 常数优化 |
| Hard | 跳跃游戏 V | 1340 | 排序+DP |

---

## 本节要点速查

```
✅ 滚动数组: 0-1背包倒序, 完全背包正序
✅ 两行交替: prev/curr 轮换
✅ 单调队列: 存下标, 队首超范围弹出, 队尾维护单调性
✅ 矩阵快速幂: 线性递推 → 构造转移矩阵 → M^n × 初始向量
✅ 斐波那契: M=[[1,1],[1,0]], M^(n-1)[0][0]
✅ 552出勤: 6状态(a×3+l), 构造6×6转移矩阵
```
