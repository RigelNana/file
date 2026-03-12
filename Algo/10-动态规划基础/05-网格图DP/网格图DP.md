# 网格图 DP

> 网格图 DP 是二维 DP 的入门，从左上到右下的路径计数、最优路径等。

---

## 1. 不同路径

### LeetCode 62

```
m×n 网格, 从左上角到右下角, 只能向右或向下
有多少条不同路径?

每个格子只能从上面或左面到达:
  dp[i][j] = dp[i-1][j] + dp[i][j-1]

  1  1  1  1
  1  2  3  4
  1  3  6  10    答案: dp[2][3] = 10

  第一行: 全是 1 (只能一直往右)
  第一列: 全是 1 (只能一直往下)
```

```python
def uniquePaths(m, n):
    dp = [[1] * n for _ in range(m)]     # ⚠️ 全初始化为1
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = dp[i-1][j] + dp[i][j-1]
    return dp[m-1][n-1]

# 空间优化: 一维滚动数组
def uniquePaths_opt(m, n):
    dp = [1] * n
    for i in range(1, m):
        for j in range(1, n):
            dp[j] += dp[j-1]            # ⚠️ dp[j] 已经是上一行的值
    return dp[n-1]

# ⚠️ dp = [[1] * n ...]: 第一行第一列全1
#    因为只有一条路可以到达第一行和第一列的每个格子
#
# ⚠️ 滚动数组: dp[j] += dp[j-1]
#    dp[j] 在更新前 = dp[i-1][j] (上一行)
#    dp[j-1] 在更新后 = dp[i][j-1] (同行左边, 已更新)
#    所以 dp[j] += dp[j-1] = dp[i-1][j] + dp[i][j-1] ✓
```

---

## 2. 不同路径 II (有障碍)

### LeetCode 63

```
grid 中 1 = 障碍物, 0 = 可通行
障碍物格子路径数 = 0
```

```python
def uniquePathsWithObstacles(obstacleGrid):
    m, n = len(obstacleGrid), len(obstacleGrid[0])
    if obstacleGrid[0][0] == 1:
        return 0                         # ⚠️ 起点就是障碍
    
    dp = [[0] * n for _ in range(m)]
    dp[0][0] = 1
    
    for i in range(m):
        for j in range(n):
            if obstacleGrid[i][j] == 1:
                dp[i][j] = 0             # ⚠️ 障碍物 = 0
            else:
                if i > 0: dp[i][j] += dp[i-1][j]
                if j > 0: dp[i][j] += dp[i][j-1]
    
    return dp[m-1][n-1]

# ⚠️ 第一行/第一列: 遇到障碍物后, 后面全是 0
#    不用特判: 上面的代码自动处理了
#    因为障碍物 dp=0, 后面格子加上 0 就不变了
```

---

## 3. 最小路径和

### LeetCode 64

```
m×n 网格, 每个格子有非负数, 找从左上到右下的最小路径和

dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + grid[i][j]

  1  3  1           1  4  5
  1  5  1    →      2  7  6       答案 = 7
  4  2  1           6  8  7       路径: 1→3→1→1→1

⚠️ 第一行: dp[0][j] = dp[0][j-1] + grid[0][j] (只能从左来)
   第一列: dp[i][0] = dp[i-1][0] + grid[i][0] (只能从上来)
```

```python
def minPathSum(grid):
    m, n = len(grid), len(grid[0])
    dp = [[0] * n for _ in range(m)]
    dp[0][0] = grid[0][0]
    
    # ⚠️ 初始化第一行
    for j in range(1, n):
        dp[0][j] = dp[0][j-1] + grid[0][j]
    # ⚠️ 初始化第一列
    for i in range(1, m):
        dp[i][0] = dp[i-1][0] + grid[i][0]
    
    for i in range(1, m):
        for j in range(1, n):
            dp[i][j] = min(dp[i-1][j], dp[i][j-1]) + grid[i][j]
    
    return dp[m-1][n-1]

# 空间优化
def minPathSum_opt(grid):
    m, n = len(grid), len(grid[0])
    dp = [0] * n
    dp[0] = grid[0][0]
    for j in range(1, n):
        dp[j] = dp[j-1] + grid[0][j]
    
    for i in range(1, m):
        dp[0] += grid[i][0]             # ⚠️ 第一列单独处理
        for j in range(1, n):
            dp[j] = min(dp[j], dp[j-1]) + grid[i][j]
    
    return dp[n-1]
```

---

## 4. 三角形最小路径和

### LeetCode 120

```
三角形从顶到底, 每步可以向下或右下

    2
   3 4          自底向上 DP:
  6 5 7         dp[j] = min(dp[j], dp[j+1]) + triangle[i][j]
 4 1 8 3

自底向上:
  初始 dp = [4, 1, 8, 3]
  i=2: dp[0] = min(4,1)+6=7
       dp[1] = min(1,8)+5=6
       dp[2] = min(8,3)+7=10     → dp = [7, 6, 10, 3]
  i=1: dp[0] = min(7,6)+3=9
       dp[1] = min(6,10)+4=10    → dp = [9, 10, 10, 3]
  i=0: dp[0] = min(9,10)+2=11   → 答案 = 11
```

```python
def minimumTotal(triangle):
    n = len(triangle)
    dp = triangle[-1][:]              # ⚠️ 拷贝最后一行
    
    for i in range(n - 2, -1, -1):    # ⚠️ 倒数第二行到第一行
        for j in range(i + 1):        # ⚠️ 第 i 行有 i+1 个元素
            dp[j] = min(dp[j], dp[j+1]) + triangle[i][j]
    
    return dp[0]

# ⚠️ 为什么自底向上?
#    自顶向下: 最后需要 min(dp[-1]) 取整行最小值
#    自底向上: 最后只有 dp[0] 一个值, 直接就是答案
#    更简洁!
#
# ⚠️ range(i + 1): 三角形第 i 行有 i+1 个元素
#    j 的范围: 0 到 i
```

---

## 5. 地下城游戏

### LeetCode 174 (Hard)

```
从左上到右下, 每个格子加/减生命值
任何时刻生命值 > 0
求初始至少需要多少生命值

反向DP: 从右下到左上
  dp[i][j] = 从 (i,j) 出发需要的最少生命值

dp[i][j] = max(1, min(dp[i+1][j], dp[i][j+1]) - dungeon[i][j])
```

```python
def calculateMinimumHP(dungeon):
    m, n = len(dungeon), len(dungeon[0])
    dp = [[float('inf')] * (n + 1) for _ in range(m + 1)]
    dp[m][n-1] = dp[m-1][n] = 1         # ⚠️ 终点右边和下面设为1
    
    for i in range(m - 1, -1, -1):
        for j in range(n - 1, -1, -1):
            dp[i][j] = max(1, min(dp[i+1][j], dp[i][j+1]) - dungeon[i][j])
    
    return dp[0][0]

# ⚠️ max(1, ...): 生命值至少为 1
#    即使格子给加血, 到达前也要至少有 1 点
#
# ⚠️ 为什么反向? 
#    正向不知道后面需要多少血, 无法做局部最优决策
#    反向可以: 知道终点需要1点, 逐步反推
#
# ⚠️ dp[m][n-1] = dp[m-1][n] = 1:
#    终点的"右边"和"下边"需要 1 点血 (到达终点后存活)
#    其余边界设为 inf (不可到达)
```

---

## 6. 网格图 DP 模式

```
┌──────────────┬───────────────────────────────┐
│ 类型         │ 转移                          │
├──────────────┼───────────────────────────────┤
│ 路径计数     │ dp[i][j] = dp[i-1][j]+dp[i][j-1] │
│ 最小路径和   │ dp[i][j] = min(上,左)+grid      │
│ 最大路径和   │ dp[i][j] = max(上,左)+grid      │
│ 有障碍物     │ 障碍格 dp=0                    │
│ 正反向都可走 │ 需要 Dijkstra/BFS             │
│ 反向DP       │ 从右下到左上 (地下城)         │
└──────────────┴───────────────────────────────┘

⚠️ "只能向右或向下" → DP
   "可以四方向移动" → BFS/DFS (不是DP!)
   DP 需要拓扑序: 右下方向天然是拓扑序
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 不同路径 | 62 | 基础网格DP |
| Med | 不同路径II | 63 | 障碍物处理 |
| Med | 最小路径和 | 64 | 路径+最优 |
| Med | 三角形最小路径和 | 120 | 自底向上 |
| Hard | 地下城游戏 | 174 | 反向DP |

---

## 本节要点速查

```
✅ 路径数: dp[i][j] = 上+左, 初始行列全1
✅ 最优路径: dp[i][j] = min/max(上,左) + 当前
✅ 障碍物: dp=0
✅ 三角形: 自底向上更简洁
✅ 反向DP: 终点往起点推 (生命值类)
✅ 空间优化: 一维滚动数组
✅ 只能→↓才用DP, 四方向用BFS!
```
