# 网格图 DFS

> 网格图 DFS（洪水填充）是处理连通块、岛屿问题的核心方法。

---

## 1. 网格图基础概念

```
网格图 = 二维矩阵，每个格子可以向 上下左右 四个方向移动

  1 1 0 0 0
  1 1 0 0 0       1 = 陆地, 0 = 水
  0 0 1 0 0       相连的 1 组成一个"岛屿"
  0 0 0 1 1       这个图有 3 个岛屿

方向数组 (四方向):
  dirs = [(0,1), (0,-1), (1,0), (-1,0)]
          右      左      下      上

八方向 (含对角线):
  dirs = [(0,1),(0,-1),(1,0),(-1,0),(1,1),(1,-1),(-1,1),(-1,-1)]

DFS 洪水填充 (Flood Fill):
  从一个格子出发, 递归访问所有相连的同类格子
  把访问过的格子标记, 避免重复访问
```

---

## 2. DFS 模板

```python
def dfs(grid, r, c, rows, cols):
    # ⚠️ 越界检查 + 条件检查 (是否可访问)
    if r < 0 or r >= rows or c < 0 or c >= cols:
        return
    if grid[r][c] != '1':       # 不是目标格子
        return
    
    grid[r][c] = '0'            # ⚠️ 标记已访问 (原地修改)
    
    # 四个方向递归
    dfs(grid, r + 1, c, rows, cols)  # 下
    dfs(grid, r - 1, c, rows, cols)  # 上
    dfs(grid, r, c + 1, rows, cols)  # 右
    dfs(grid, r, c - 1, rows, cols)  # 左

# ⚠️ 标记方式有两种:
#    1. 原地修改: grid[r][c] = '0' (改变原数组)
#    2. visited 集合: visited.add((r, c))
#    原地修改更省空间, 但会改变输入
#
# ⚠️ 递归顺序不影响正确性
#    上下左右任意顺序都可以
#
# ⚠️ 方向数组写法:
#    for dr, dc in [(0,1),(0,-1),(1,0),(-1,0)]:
#        dfs(grid, r+dr, c+dc, rows, cols)
#    更简洁, 也更容易扩展到八方向
```

---

## 3. 岛屿数量

### LeetCode 200

```
给定 '1'(陆地) 和 '0'(水) 组成的二维网格
计算岛屿数量 (相连的陆地算一个岛屿)

思路: 遍历每个格子, 遇到 '1' 就 DFS 把整个岛标记
     每次启动 DFS = 发现一个新岛屿

  1 1 0 0 0         第1次 DFS (从[0,0]):
  1 1 0 0 0         标记左上角 4 个 1
  0 0 1 0 0         islands = 1
  0 0 0 1 1
                    第2次 DFS (从[2,2]):
                    标记中间的 1
                    islands = 2

                    第3次 DFS (从[3,3]):
                    标记右下角 2 个 1
                    islands = 3
```

```python
def numIslands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    count = 0
    
    def dfs(r, c):
        if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] != '1':
            return                       # ⚠️ 越界或非陆地
        grid[r][c] = '0'                 # ⚠️ 标记已访问
        dfs(r + 1, c)
        dfs(r - 1, c)
        dfs(r, c + 1)
        dfs(r, c - 1)
    
    for i in range(rows):
        for j in range(cols):
            if grid[i][j] == '1':
                dfs(i, j)                # ⚠️ 把整个岛淹掉
                count += 1
    
    return count

# ⚠️ grid[r][c] != '1': 注意是字符 '1' 不是数字 1
#    题目给的是字符串矩阵
#
# ⚠️ 标记为 '0' 的意义: "淹掉"这块陆地
#    后续遍历不会再把它当作新岛屿
```

---

## 4. 岛屿的最大面积

### LeetCode 695

```
返回最大岛屿的面积 (格子数)

思路: DFS 返回面积
  每个格子贡献面积 1
  总面积 = 1 + 上下左右四个方向的面积之和
```

```python
def maxAreaOfIsland(grid):
    rows, cols = len(grid), len(grid[0])
    
    def dfs(r, c):
        if r < 0 or r >= rows or c < 0 or c >= cols or grid[r][c] != 1:
            return 0                     # ⚠️ 返回 0, 不是 return
        grid[r][c] = 0
        return 1 + dfs(r+1,c) + dfs(r-1,c) + dfs(r,c+1) + dfs(r,c-1)
        # ⚠️ 1(自己) + 四个方向的面积
    
    return max((dfs(i, j) for i in range(rows) 
                for j in range(cols) if grid[i][j] == 1), default=0)

# ⚠️ 这里是数字 1 不是字符 '1' (看题目)
# ⚠️ default=0: 没有岛屿时 max 不报错
# ⚠️ DFS 返回值: 岛屿数量(200)返回None, 面积(695)返回int
```

---

## 5. 被围绕的区域

### LeetCode 130

```
把所有被 'X' 包围的 'O' 变成 'X'
但边界上的 'O' 及其连通的 'O' 不变

反向思维:
  1. 从边界的 'O' 开始 DFS, 标记为 'S' (安全)
  2. 遍历整个矩阵:
     'O' → 'X' (被包围的)
     'S' → 'O' (恢复安全的)

为什么反向?
  直接找被包围的 O 很难定义"被包围"
  但"连通到边界"很容易: 从边界出发 DFS
  不连通到边界 = 被包围
```

```python
def solve(board):
    if not board:
        return
    rows, cols = len(board), len(board[0])
    
    def dfs(r, c):
        if r < 0 or r >= rows or c < 0 or c >= cols or board[r][c] != 'O':
            return
        board[r][c] = 'S'               # ⚠️ 标记为安全
        dfs(r+1, c); dfs(r-1, c); dfs(r, c+1); dfs(r, c-1)
    
    # 第1步: 从四条边界出发
    for i in range(rows):
        dfs(i, 0)                        # ⚠️ 左边界
        dfs(i, cols - 1)                 # ⚠️ 右边界
    for j in range(cols):
        dfs(0, j)                        # ⚠️ 上边界
        dfs(rows - 1, j)                 # ⚠️ 下边界
    
    # 第2步: 替换
    for i in range(rows):
        for j in range(cols):
            if board[i][j] == 'O':
                board[i][j] = 'X'        # ⚠️ 被包围
            elif board[i][j] == 'S':
                board[i][j] = 'O'        # ⚠️ 恢复

# ⚠️ 两步替换的顺序不能乱
#    先标 S, 再统一替换
#    如果边标边替换, 会出错
```

---

## 6. 太平洋大西洋水流

### LeetCode 417

```
太平洋在左上, 大西洋在右下
水可以往低处或等高处流
找到能同时流向两个大洋的格子

反向思维: 从海洋出发, 反向 DFS (往高处走)
  从太平洋边界 DFS → pacific 集合
  从大西洋边界 DFS → atlantic 集合
  答案 = pacific ∩ atlantic
```

```python
def pacificAtlantic(heights):
    if not heights:
        return []
    rows, cols = len(heights), len(heights[0])
    pacific = set()
    atlantic = set()
    
    def dfs(r, c, visited):
        visited.add((r, c))
        for dr, dc in [(0,1),(0,-1),(1,0),(-1,0)]:
            nr, nc = r + dr, c + dc
            if (0 <= nr < rows and 0 <= nc < cols 
                    and (nr, nc) not in visited
                    and heights[nr][nc] >= heights[r][c]):  # ⚠️ 反向: 往高处
                dfs(nr, nc, visited)
    
    for i in range(rows):
        dfs(i, 0, pacific)               # ⚠️ 太平洋左边界
        dfs(i, cols - 1, atlantic)       # ⚠️ 大西洋右边界
    for j in range(cols):
        dfs(0, j, pacific)               # ⚠️ 太平洋上边界
        dfs(rows - 1, j, atlantic)       # ⚠️ 大西洋下边界
    
    return list(pacific & atlantic)      # ⚠️ 交集

# ⚠️ 反向 DFS 的关键: heights[nr][nc] >= heights[r][c]
#    正向是"往低处流", 反向是"往高处走"
#    >= 包含等高 (题目说等高也能流)
#
# ⚠️ 两个 visited 集合: pacific 和 atlantic 分别追踪
```

---

## 7. 递归深度问题

```
⚠️ 网格图 DFS 的递归深度 = 网格中最长的连通路径
   最坏 O(m*n), 可能栈溢出!

   解决方案:
   1. sys.setrecursionlimit(m*n + 10)
   2. 改用 BFS (迭代, 无栈溢出)
   3. 改用迭代 DFS (手动栈)

   迭代 DFS:
```

```python
def numIslands_iterative(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    count = 0
    
    for i in range(rows):
        for j in range(cols):
            if grid[i][j] == '1':
                count += 1
                stack = [(i, j)]
                grid[i][j] = '0'         # ⚠️ 入栈时就标记
                while stack:
                    r, c = stack.pop()
                    for dr, dc in [(0,1),(0,-1),(1,0),(-1,0)]:
                        nr, nc = r + dr, c + dc
                        if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == '1':
                            grid[nr][nc] = '0'  # ⚠️ 入栈时标记, 不是出栈时!
                            stack.append((nr, nc))
    
    return count

# ⚠️ 入栈时标记 vs 出栈时标记:
#    入栈时标记: 避免重复入栈, 更高效
#    出栈时标记: 可能同一个格子被多次入栈
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 岛屿数量 | 200 | DFS洪水填充 |
| Med | 岛屿的最大面积 | 695 | DFS返回面积 |
| Med | 被围绕的区域 | 130 | 反向DFS从边界 |
| Med | 太平洋大西洋水流 | 417 | 双DFS+交集 |
| Easy | 图像渲染 | 733 | 基础Flood Fill |

---

## 本节要点速查

```
✅ 方向数组: dirs = [(0,1),(0,-1),(1,0),(-1,0)]
✅ DFS模板: 越界检查→条件检查→标记→递归四方向
✅ 标记时机: 访问时立即标记, 防止重复
✅ 反向DFS: 从边界出发, 找"不被包围"的
✅ 大网格: 改用迭代DFS或BFS避免栈溢出
✅ 入栈/入队时标记, 不是出栈/出队时
```
