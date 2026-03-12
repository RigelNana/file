# 状态机 DP

> 状态机 DP 的核心：用有限个状态描述当前所处的「阶段」，通过状态转移实现复杂决策。最经典的应用是买卖股票系列。

---

## 1. 买卖股票系列 ⭐⭐

### 理解与可视化

```
状态机思想: 在每一天，我们处于以下某个状态 ──

  ┌──────────┐   买入   ┌──────────┐
  │  未持有   │ ───────▶ │   持有    │
  │ (可以买)  │ ◀─────── │ (可以卖)  │
  └──────────┘   卖出   └──────────┘

  两个状态之间可以互相转移（受限于交易次数等约束）

───────────────────────────────────────
股票问题统一框架:

  dp[i][k][0] = 第 i 天结束，最多还能交易 k 次，NOT 持股的最大利润
  dp[i][k][1] = 第 i 天结束，最多还能交易 k 次，持股的最大利润

  转移:
    dp[i][k][0] = max(dp[i-1][k][0],           -- 不操作
                      dp[i-1][k][1] + price[i]) -- 卖出
    dp[i][k][1] = max(dp[i-1][k][1],           -- 不操作
                      dp[i-1][k-1][0] - price[i]) -- 买入(消耗一次交易)

  不同题目对应不同的 k 值和附加条件:
    k=1        → 121. 买卖股票的最佳时机
    k=∞        → 122. 买卖股票的最佳时机 II
    k=∞ + 冷冻  → 309. 最佳买卖股票时机含冷冻期
    k=∞ + 手续费 → 714. 买卖股票的最佳时机含手续费
    k=2        → 123. 买卖股票的最佳时机 III
    k=任意      → 188. 买卖股票的最佳时机 IV
```

### 代码模板

```python
# ————————————————————————————
# 121. 最多交易 1 次
def max_profit_1(prices):
    min_price = float('inf')
    max_profit = 0
    for p in prices:
        min_price = min(min_price, p)
        max_profit = max(max_profit, p - min_price)
    return max_profit

# ————————————————————————————
# 122. 不限交易次数
def max_profit_inf(prices):
    profit = 0
    for i in range(1, len(prices)):
        if prices[i] > prices[i-1]:
            profit += prices[i] - prices[i-1]
    return profit

# ————————————————————————————
# 309. 不限次数 + 冷冻期（卖出后下一天不能买）
# 状态: hold, not_hold, cooldown
def max_profit_cooldown(prices):
    hold = -prices[0]    # 持有
    not_hold = 0         # 不持有，非冷冻
    cooldown = 0         # 冷冻期
    for i in range(1, len(prices)):
        new_hold = max(hold, not_hold - prices[i])
        new_not_hold = max(not_hold, cooldown)
        new_cooldown = hold + prices[i]         # 卖出 → 进入冷冻
        hold, not_hold, cooldown = new_hold, new_not_hold, new_cooldown
    return max(not_hold, cooldown)

# ————————————————————————————
# 714. 不限次数 + 手续费
def max_profit_fee(prices, fee):
    hold = -prices[0]
    not_hold = 0
    for i in range(1, len(prices)):
        new_hold = max(hold, not_hold - prices[i])
        new_not_hold = max(not_hold, hold + prices[i] - fee)
        hold, not_hold = new_hold, new_not_hold
    return not_hold

# ————————————————————————————
# 188. 最多交易 k 次（通用版）
def max_profit_k(k, prices):
    n = len(prices)
    if k >= n // 2:
        return sum(max(prices[i+1] - prices[i], 0) for i in range(n - 1))
    # dp[j][0/1] = 最多完成 j 笔交易时的最大利润
    dp = [[0, -float('inf')] for _ in range(k + 1)]
    for price in prices:
        for j in range(k, 0, -1):
            dp[j][0] = max(dp[j][0], dp[j][1] + price)
            dp[j][1] = max(dp[j][1], dp[j-1][0] - price)
    return dp[k][0]

# ————————————————————————————
# 123. 最多交易 2 次（k=2 特化版）
def max_profit_2(prices):
    buy1 = buy2 = -float('inf')
    sell1 = sell2 = 0
    for p in prices:
        buy1 = max(buy1, -p)
        sell1 = max(sell1, buy1 + p)
        buy2 = max(buy2, sell1 - p)
        sell2 = max(sell2, buy2 + p)
    return sell2
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Easy | 买卖股票的最佳时机 | 121 |
| Medium | 买卖股票的最佳时机 II | 122 |
| Hard | 买卖股票的最佳时机 III | 123 |
| Hard | 买卖股票的最佳时机 IV | 188 |
| Medium | 最佳买卖股票时机含冷冻期 | 309 |
| Medium | 买卖股票的最佳时机含手续费 | 714 |

---

## 2. 其他状态机 DP

### 理解与可视化

```
任何「当前行为受之前状态约束」的问题都可以建模为状态机 DP

例: 粉刷房子
  每个房子涂红/蓝/绿，相邻房子不能同色

  状态: dp[i][c] = 前 i 个房子，第 i 个涂颜色 c 的最小花费
  转移: dp[i][c] = costs[i][c] + min(dp[i-1][其他颜色])

      第 i-1 个    第 i 个
         红 ──────▶ 蓝
         红 ──────▶ 绿
         蓝 ──────▶ 红
         蓝 ──────▶ 绿
         绿 ──────▶ 红
         绿 ──────▶ 蓝

例: 删除并获得点数
  选了 x 就不能选 x-1 和 x+1 → 打家劫舍变形
```

### 代码模板

```python
# 粉刷房子 (LeetCode 256)
def min_cost_paint(costs):
    if not costs:
        return 0
    dp = list(costs[0])
    for i in range(1, len(costs)):
        new_dp = [
            costs[i][0] + min(dp[1], dp[2]),
            costs[i][1] + min(dp[0], dp[2]),
            costs[i][2] + min(dp[0], dp[1]),
        ]
        dp = new_dp
    return min(dp)

# 删除并获得点数
def delete_and_earn(nums):
    if not nums:
        return 0
    mx = max(nums)
    points = [0] * (mx + 1)
    for x in nums:
        points[x] += x
    # 变成打家劫舍问题
    prev, curr = 0, 0
    for i in range(1, mx + 1):
        prev, curr = curr, max(curr, prev + points[i])
    return curr
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 粉刷房子 | 256 |
| Medium | 删除并获得点数 | 740 |
| Medium | 统计元音字母序列的数目 | 1220 |

---

## 3. DP 专题：前后缀分解

### 理解与可视化

```
前后缀分解: 将答案拆成「左半部分」和「右半部分」分别计算

例: 除自身以外数组的乘积
  answer[i] = 左边所有元素之积 × 右边所有元素之积

  前缀积: prefix[i] = nums[0] * nums[1] * ... * nums[i-1]
  后缀积: suffix[i] = nums[i+1] * ... * nums[n-1]
  answer[i] = prefix[i] * suffix[i]

例: 接雨水
  每个位置能接的水 = min(左边最高, 右边最高) - 当前高度
  左边最高可以前缀 max 维护, 右边最高可以后缀 max 维护
```

### 代码模板

```python
# 接雨水（前后缀分解解法）
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
    return sum(min(left_max[i], right_max[i]) - height[i] for i in range(n))
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Hard | 接雨水 | 42 |
| Medium | 除自身以外数组的乘积 | 238 |
| Hard | 使数组严格递增 | 1187 |

---

## 4. 跳跃游戏系列

### 代码模板

```python
# 跳跃游戏（能否到达终点）
def can_jump(nums):
    farthest = 0
    for i in range(len(nums)):
        if i > farthest:
            return False
        farthest = max(farthest, i + nums[i])
    return True

# 跳跃游戏 II（最少跳跃次数）
def jump(nums):
    jumps = 0
    cur_end = 0
    farthest = 0
    for i in range(len(nums) - 1):
        farthest = max(farthest, i + nums[i])
        if i == cur_end:
            jumps += 1
            cur_end = farthest
    return jumps
```

### 推荐题目

| 难度 | 题目 | LeetCode |
|------|------|----------|
| Medium | 跳跃游戏 | 55 |
| Medium | 跳跃游戏 II | 45 |
