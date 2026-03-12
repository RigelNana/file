# 其他状态机 DP

> 粉刷房子、删除并获得点数等经典状态机问题，以及前后缀分解和跳跃游戏。

---

## 1. 状态机 DP 通用思路

```
任何 "当前行为受之前状态约束" 的问题 → 状态机 DP

模式:
  每个位置有若干可能的状态
  从一个状态到另一个状态有转移条件
  dp[i][state] = 到第 i 个元素, 处于 state 的最优值

例: 粉刷房子 → 3 个状态 (红/蓝/绿)
例: 删除并获得 → 2 个状态 (选/不选上一个值)
例: 元音序列计数 → 5 个状态 (5 种元音)

   state_A → state_B → state_C
      ↕          ↕          ↕
   受限转移 (不能所有状态都到所有状态)
```

---

## 2. LC 256: 粉刷房子

```
题目: n 个房子, 每个涂红/蓝/绿
     相邻房子不能同色
     costs[i][c] = 第 i 个房子涂颜色 c 的花费
     求最小总花费

状态: dp[i][c] = 前 i 个房子, 第 i 个涂颜色 c 的最小花费
转移: dp[i][c] = costs[i][c] + min(dp[i-1][其他颜色])
```

```python
def minCost(costs):
    if not costs:
        return 0
    dp = list(costs[0])   # dp = [红, 蓝, 绿]
    
    for i in range(1, len(costs)):
        new_dp = [
            costs[i][0] + min(dp[1], dp[2]),   # ⚠️ 涂红→前一个不能红
            costs[i][1] + min(dp[0], dp[2]),   # ⚠️ 涂蓝→前一个不能蓝
            costs[i][2] + min(dp[0], dp[1]),   # ⚠️ 涂绿→前一个不能绿
        ]
        dp = new_dp   # ⚠️ 用 new_dp 避免覆盖
    
    return min(dp)

# ⚠️ 最终答案是 min(dp), 不是 dp[0] 或 dp[-1]
#    因为最后一个房子可以是任意颜色
```

---

## 3. LC 740: 删除并获得点数

```
题目: 选择 x 获得 x 分, 但必须删除所有 x-1 和 x+1
     求最大分数

转化: 统计每个值的总分, 变成打家劫舍!
     points[x] = x 出现 k 次 → points[x] = x * k
     选了 x 就不能选 x-1 和 x+1 → 相邻不能选 → 打家劫舍
```

```python
def deleteAndEarn(nums):
    if not nums:
        return 0
    mx = max(nums)
    points = [0] * (mx + 1)
    for x in nums:
        points[x] += x       # ⚠️ 加 x, 不是加 1
    
    # 打家劫舍
    prev, curr = 0, 0
    for i in range(1, mx + 1):
        prev, curr = curr, max(curr, prev + points[i])
    
    return curr

# ⚠️ points[x] += x:
#    nums=[3,3,3] → points[3] = 9 (选3得到3分, 有3个)
#    不是 points[3] = 3 (出现次数)
```

---

## 4. LC 1220: 统计元音字母序列的数目

```
题目: 长度为 n 的字符串, 只含 aeiou
     转移规则: a→e, e→a或i, i→四个非i, o→i或u, u→a
     返回合法序列数量

5 个状态, 矩阵转移
```

```python
def countVowelPermutation(n):
    MOD = 10**9 + 7
    # dp = [a, e, i, o, u] 的方案数
    a = e = i = o = u = 1
    
    for _ in range(n - 1):
        # ⚠️ 根据转移规则: 谁能转到谁
        new_a = (e + i + u) % MOD        # e→a, i→a, u→a
        new_e = (a + i) % MOD            # a→e, i→e
        new_i = (e + o) % MOD            # e→i, o→i
        new_o = i % MOD                  # i→o
        new_u = (i + o) % MOD            # i→u, o→u
        a, e, i, o, u = new_a, new_e, new_i, new_o, new_u
    
    return (a + e + i + o + u) % MOD

# ⚠️ 转移规则要反过来想:
#    "a 后面只能跟 e" → new_e += a
#    "谁能到达 a" → e,i,u 能到 a → new_a = e+i+u
```

---

## 5. 前后缀分解

```
将答案拆成 "前缀部分" 和 "后缀部分" 分别维护

经典: 接雨水 (LC 42)
  每个位置接水量 = min(左边最高, 右边最高) - height[i]
  前缀: left_max[i]  = max(height[0..i])
  后缀: right_max[i] = max(height[i..n-1])

经典: 除自身以外数组乘积 (LC 238)
  answer[i] = prefix[i] * suffix[i]
  prefix[i] = nums[0]*...*nums[i-1]
  suffix[i] = nums[i+1]*...*nums[n-1]
```

```python
# LC 42 接雨水
def trap(height):
    n = len(height)
    if n == 0:
        return 0
    
    left_max = [0] * n
    right_max = [0] * n
    
    left_max[0] = height[0]
    for i in range(1, n):
        left_max[i] = max(left_max[i-1], height[i])
    
    right_max[n-1] = height[n-1]
    for i in range(n-2, -1, -1):
        right_max[i] = max(right_max[i+1], height[i])
    
    # ⚠️ 每个位置接水 = min(左最高, 右最高) - 自身高度
    return sum(min(left_max[i], right_max[i]) - height[i] for i in range(n))

# 空间优化: 双指针 O(1)
def trap_opt(height):
    left, right = 0, len(height) - 1
    left_max = right_max = 0
    ans = 0
    while left < right:
        left_max = max(left_max, height[left])
        right_max = max(right_max, height[right])
        if left_max < right_max:
            ans += left_max - height[left]
            left += 1
        else:
            ans += right_max - height[right]
            right -= 1
    return ans

# LC 238 除自身以外的乘积
def productExceptSelf(nums):
    n = len(nums)
    ans = [1] * n
    # 前缀积
    prefix = 1
    for i in range(n):
        ans[i] = prefix
        prefix *= nums[i]
    # 后缀积
    suffix = 1
    for i in range(n-1, -1, -1):
        ans[i] *= suffix
        suffix *= nums[i]
    return ans

# ⚠️ LC 238 要求不能用除法, 所以用前后缀分解
```

---

## 6. 跳跃游戏系列

```
LC 55: 能否到达终点 → 贪心
LC 45: 最少跳几次 → 贪心 (BFS思想)
```

```python
# LC 55 跳跃游戏
def canJump(nums):
    farthest = 0
    for i in range(len(nums)):
        if i > farthest:
            return False   # ⚠️ 当前位置超过能到达的最远 → 不可达
        farthest = max(farthest, i + nums[i])
    return True

# ⚠️ 贪心: 维护能到达的最远位置
#    如果某个位置 i > farthest, 说明到不了 i

# LC 45 跳跃游戏 II
def jump(nums):
    jumps = 0
    cur_end = 0       # 当前跳跃能到达的最远边界
    farthest = 0      # 下一次跳跃能到达的最远
    
    for i in range(len(nums) - 1):   # ⚠️ 不遍历最后一个!
        farthest = max(farthest, i + nums[i])
        if i == cur_end:
            jumps += 1
            cur_end = farthest
    
    return jumps

# ⚠️ range(len(nums)-1): 不包含最后一个位置
#    因为如果 cur_end 刚好 == n-1, 不需要再跳
#    如果遍历到 n-1 会多跳一次
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 粉刷房子 | 256 | 相邻约束 |
| Med | 删除并获得点数 | 740 | 转化打家劫舍 |
| Med | 元音字母序列 | 1220 | 矩阵转移 |
| Hard | 接雨水 | 42 | 前后缀/双指针 |
| Med | 除自身以外乘积 | 238 | 前后缀积 |
| Med | 跳跃游戏 | 55 | 贪心 |
| Med | 跳跃游戏 II | 45 | 分层BFS |

---

## 本节要点速查

```
✅ 状态机 DP: 约束条件决定状态转移图
✅ 粉刷房子: dp[c] = cost[c] + min(其他颜色dp)
✅ 删除并获得: points[x]+=x, 然后打家劫舍
✅ 元音序列: 反过来想 "谁能到达这个状态"
✅ 接雨水: min(左max, 右max) - height[i]
✅ 跳跃游戏II: 遍历到 n-2 (不含最后一个)
✅ 前后缀分解: 不能用除法时的乘积技巧
```
