# 区间 DP

> 区间 DP 的核心：枚举区间长度 → 枚举左端点 → 枚举分割点。掌握模板后，各种变体都能套用。

---

## 1. 区间 DP 通用模板

```
区间 DP 适用场景:
  给定一个序列, 将其分割/合并成若干段
  每次操作涉及一个连续区间, 求最优值

核心思路:
  dp[i][j] = 区间 [i, j] 上的最优值
  枚举分割点 k, 将 [i,j] 分成 [i,k] 和 [k+1,j]

三层循环:
  外层: 区间长度 len (从小到大)
  中层: 左端点 i
  内层: 分割点 k (i ≤ k < j)

       i         k  k+1        j
       ├─────────┤  ├──────────┤
       dp[i][k]      dp[k+1][j]
       └──────────────────────┘
              dp[i][j]

⚠️ 必须从小区间到大区间:
   先算 len=2, 再算 len=3, ...
   因为大区间的值依赖小区间
```

```python
# 区间 DP 通用模板
def interval_dp(n, cost):
    dp = [[0] * n for _ in range(n)]
    # base case: dp[i][i] = ...
    
    for length in range(2, n + 1):           # ⚠️ 从 2 开始
        for i in range(n - length + 1):       # 左端点
            j = i + length - 1                # ⚠️ 右端点 = i+len-1
            dp[i][j] = float('inf')           # 求最小则 inf
            for k in range(i, j):            # ⚠️ 分割点: i ≤ k < j
                dp[i][j] = min(
                    dp[i][j],
                    dp[i][k] + dp[k+1][j] + cost(i, j)
                )
    
    return dp[0][n-1]

# ⚠️ 分割点范围: range(i, j), 不含 j
#    因为 k 是左半区间的右端点，k+1 是右半区间的左端点
#    k=j 时右半区间为空
```

---

## 2. LeetCode 312: 戳气球 ⭐

```
题目: 一排气球, nums[i] 是气球 i 的金币数
     戳破气球 i 获得 nums[left]*nums[i]*nums[right] 金币
     (left, right 是 i 的相邻未戳破气球)
     全戳完, 求最大金币

关键思路: 反向思考
  不是 "最先戳谁", 而是 "最后戳谁"
  
  在区间 (i, j) 开区间中, 最后戳第 k 个
  此时 i 和 j 没被戳 → 获得 nums[i]*nums[k]*nums[j]
  加上左右子区间的贡献

⚠️ 两端加哨兵: nums = [1] + nums + [1]
   开区间 (i, j), 即 i 和 j 不会被戳

dp[i][j] = 开区间 (i,j) 中戳完所有气球的最大金币
转移: dp[i][j] = max(dp[i][k] + dp[k][j] + nums[i]*nums[k]*nums[j])
     k 在 (i,j) 开区间中, 即 i+1 ≤ k ≤ j-1
```

```python
def maxCoins(nums):
    nums = [1] + nums + [1]   # ⚠️ 加哨兵
    n = len(nums)
    dp = [[0] * n for _ in range(n)]
    
    # ⚠️ 区间长度从 3 开始 (开区间至少需要 3 个端点)
    for length in range(3, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            for k in range(i + 1, j):    # ⚠️ k 是 (i,j) 开区间
                dp[i][j] = max(
                    dp[i][j],
                    dp[i][k] + dp[k][j] + nums[i] * nums[k] * nums[j]
                )
    
    return dp[0][n-1]

# 模拟: nums = [3,1,5,8]
# 加哨兵: [1, 3, 1, 5, 8, 1]
# dp[0][5] 就是答案
# 
# ⚠️ 这里的 dp[i][k] 和 dp[k][j] 都是开区间
#    dp[i][k] = (i,k) 中戳完的最优, dp[k][j] = (k,j) 中戳完的最优
#    k 是最后戳的, 所以 k 对左右子区间来说还没戳 → 开区间
```

---

## 3. LeetCode 1039: 多边形三角剖分

```
题目: n 边形, 切成三角形, 每个三角形的分数 = 三个顶点值之积
     求最小总分数

思路: 固定边 (i, j), 枚举第三个顶点 k
     和戳气球类似的结构

dp[i][j] = 从顶点 i 到顶点 j 的多边形的最小三角剖分分数
转移: dp[i][j] = min(dp[i][k] + dp[k][j] + v[i]*v[k]*v[j])
     k 在 i+1 到 j-1
```

```python
def minScoreTriangulation(values):
    n = len(values)
    dp = [[0] * n for _ in range(n)]
    
    for length in range(3, n + 1):           # ⚠️ 至少 3 个顶点
        for i in range(n - length + 1):
            j = i + length - 1
            dp[i][j] = float('inf')
            for k in range(i + 1, j):       # ⚠️ 第三个顶点
                dp[i][j] = min(
                    dp[i][j],
                    dp[i][k] + dp[k][j] + values[i] * values[k] * values[j]
                )
    
    return dp[0][n-1]

# ⚠️ 结构和戳气球几乎一样:
#    戳气球: 求 max, 加了哨兵
#    三角剖分: 求 min, 不需要哨兵 (多边形自成闭环)
```

---

## 4. 记忆化搜索写法

```python
from functools import cache

# 戳气球 - 记忆化搜索
def maxCoins_memo(nums):
    nums = [1] + nums + [1]
    n = len(nums)
    
    @cache
    def dfs(i, j):
        if j - i < 2:     # ⚠️ 开区间 (i,j) 中没有气球
            return 0
        res = 0
        for k in range(i + 1, j):
            res = max(res, dfs(i, k) + dfs(k, j) + nums[i]*nums[k]*nums[j])
        return res
    
    return dfs(0, n - 1)

# ⚠️ 记忆化搜索更直观:
#    dfs(i, j) = 开区间 (i,j) 戳完所有气球的最大值
#    j-i < 2: 区间内没有气球了 → return 0
```

---

## 5. LeetCode 877: 石子游戏

```
题目: 两人轮流从两端取石子, 每次只能取最左或最右一堆
     先手拿到更多石子的人赢
     返回先手是否能赢

dp[i][j] = 当前玩家从 piles[i..j] 中能拿到的 最大净分差

转移:
  取左端: piles[i] - dp[i+1][j]
  取右端: piles[j] - dp[i][j-1]
  取 max

⚠️ 减去 dp[...] 是因为对手也会最优操作
   dp[i+1][j] 是对手的最大净分差
   自己拿了 piles[i], 净分差变成 piles[i] - dp[i+1][j]
```

```python
def stoneGame(piles):
    n = len(piles)
    dp = [[0] * n for _ in range(n)]
    
    for i in range(n):
        dp[i][i] = piles[i]   # ⚠️ 只剩一堆，当前玩家全拿
    
    for length in range(2, n + 1):
        for i in range(n - length + 1):
            j = i + length - 1
            dp[i][j] = max(
                piles[i] - dp[i+1][j],   # 取左
                piles[j] - dp[i][j-1]    # 取右
            )
    
    return dp[0][n-1] > 0

# ⚠️ dp[0][n-1] > 0 表示先手净分差为正 → 先手赢
#    数学上可以证明先手必赢 (偶数堆石子的情况)
```

---

## 6. 区间 DP vs 其他 DP

```
┌────────────┬──────────────────────────────────────┐
│ 特征        │ 说明                                 │
├────────────┼──────────────────────────────────────┤
│ 状态        │ dp[i][j] = 区间 [i,j] 上的最优值     │
│ 转移        │ 枚举分割点 k                          │
│ 循环        │ 按区间长度从小到大, 或 i 从大到小      │
│ 复杂度      │ O(n³) (三层循环) 或 O(n²)            │
│ 适用场景    │ 合并/分割序列, 博弈, 回文              │
└────────────┴──────────────────────────────────────┘

⚠️ 区间 DP 的分割点范围:
   闭区间 [i,j]: k ∈ [i, j-1], 左 [i,k] 右 [k+1,j]
   开区间 (i,j): k ∈ [i+1, j-1], 左 (i,k) 右 (k,j)
   不要混淆!
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Hard | 戳气球 | 312 | 开区间+分割点 |
| Med | 多边形三角剖分 | 1039 | 类戳气球 |
| Med | 石子游戏 | 877 | 博弈净分差 |
| Med | 不同的二叉搜索树 | 96 | 卡特兰数 |
| Hard | 合并石头的最低成本 | 1000 | 分组合并 |

---

## 本节要点速查

```
✅ 三层循环: 长度 → 左端点 → 分割点
✅ j = i + length - 1 (右端点)
✅ 分割点 k: 闭区间 [i,j-1], 开区间 [i+1,j-1]
✅ 戳气球: 开区间, 加哨兵, 最后戳的是 k
✅ 博弈: dp[i][j] = max(a[i]-dp[i+1][j], a[j]-dp[i][j-1])
✅ 复杂度通常 O(n³)
✅ 先写记忆化搜索验证正确性
```
