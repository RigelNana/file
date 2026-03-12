# 网格图 BFS

> BFS 在网格图中的核心用途是求最短路径，一层一层扩展，第一次到达即是最短。

---

## 1. BFS 求最短路

```
从起点开始, 一层一层向外扩展 (像水波纹):

  S . . . .          S 0 1 2 3
  # # . # .    →     # # 2 # 4     数字 = 到 S 的距离
  . . . . .          4 3 3 4 5
  . # # # .          5 # # # 6
  . . . . E          6 7 8 7 E=8

BFS 保证第一次到达某个格子时, 距离就是最短的
(前提: 每步代价相同, 即边权为 1)
```

---

## 2. 单源 BFS 模板

```python
from collections import deque

def shortest_path(grid, start, end):
    rows, cols = len(grid), len(grid[0])
    sr, sc = start
    er, ec = end
    
    queue = deque([(sr, sc, 0)])         # ⚠️ (行, 列, 距离)
    visited = {(sr, sc)}                  # ⚠️ 入队时标记
    dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    
    while queue:
        r, c, d = queue.popleft()
        if (r, c) == (er, ec):
            return d                      # ⚠️ 第一次到达 = 最短
        
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if (0 <= nr < rows and 0 <= nc < cols 
                    and (nr, nc) not in visited 
                    and grid[nr][nc] != 1):  # 1 = 障碍物
                visited.add((nr, nc))     # ⚠️ 入队时标记
                queue.append((nr, nc, d + 1))
    
    return -1                             # 不可达

# ⚠️ 入队时标记 vs 出队时标记:
#    入队时: 同一格子不会被多次入队, 效率高
#    出队时: 可能被多次入队, 浪费空间和时间
#
# ⚠️ BFS 不能处理有不同权重的边
#    如果边权不同, 用 Dijkstra 或 0-1 BFS
```

---

## 3. 多源 BFS

```
"多个起点同时开始 BFS"
把所有起点一开始就放入队列, 然后正常 BFS

经典场景:
  - 腐烂的橘子: 所有腐烂橘子同时开始腐蚀
  - 01矩阵: 所有0同时开始向外扩展
  - 地图中的最高点: 所有水域同时向外扩展

技巧: 不需要建"超级源点"
     直接把所有源点入队即可
```

### LeetCode 994: 腐烂的橘子

```
每分钟, 腐烂的橘子向四方向腐蚀新鲜橘子
返回所有橘子腐烂的最小分钟数, 或 -1

思路: 多源 BFS
  初始: 所有腐烂橘子入队
  每一层 = 1 分钟
  BFS 完看是否还有新鲜橘子

  2 1 1         2 2 1         2 2 2         2 2 2
  1 1 0    →    2 1 0    →    2 2 0    →    2 2 0
  0 1 1         0 1 1         0 2 1         0 2 2
  t=0           t=1           t=2           t=3 ✓

  但 t=3 多算了一轮空操作, 答案 = 层数 - 1，或用初始不计时的方式
```

```python
from collections import deque

def orangesRotting(grid):
    rows, cols = len(grid), len(grid[0])
    queue = deque()
    fresh = 0
    
    # 初始化: 所有腐烂橘子入队, 统计新鲜数
    for i in range(rows):
        for j in range(cols):
            if grid[i][j] == 2:
                queue.append((i, j))
            elif grid[i][j] == 1:
                fresh += 1
    
    if fresh == 0:
        return 0                          # ⚠️ 一开始就没有新鲜的
    
    minutes = 0
    dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    
    while queue:
        minutes += 1
        for _ in range(len(queue)):       # ⚠️ 一层一层处理
            r, c = queue.popleft()
            for dr, dc in dirs:
                nr, nc = r + dr, c + dc
                if (0 <= nr < rows and 0 <= nc < cols 
                        and grid[nr][nc] == 1):
                    grid[nr][nc] = 2      # ⚠️ 腐蚀
                    fresh -= 1
                    queue.append((nr, nc))
    
    return minutes - 1 if fresh == 0 else -1

# ⚠️ minutes - 1: 最后一轮扩展后 queue 为空但 minutes 已+1
#    也可以初始 minutes = -1
#
# ⚠️ fresh 计数: 判断最终是否全部腐烂
#    不需要再遍历一次网格
#
# ⚠️ 不用 visited: grid[nr][nc] 改为 2 就是标记
```

---

## 4. 01 矩阵

### LeetCode 542

```
给定 01 矩阵, 求每个格子到最近的 0 的距离

多源 BFS: 所有 0 作为源点, 同时向外扩展
  第一次到达某个 1 时, 该距离就是最短距离

  0 0 0         0 0 0
  0 1 0    →    0 1 0
  1 1 1         1 2 1
```

```python
from collections import deque

def updateMatrix(mat):
    rows, cols = len(mat), len(mat[0])
    queue = deque()
    
    for i in range(rows):
        for j in range(cols):
            if mat[i][j] == 0:
                queue.append((i, j))
            else:
                mat[i][j] = float('inf')  # ⚠️ 先设为∞
    
    dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    while queue:
        r, c = queue.popleft()
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if (0 <= nr < rows and 0 <= nc < cols 
                    and mat[nr][nc] > mat[r][c] + 1):
                mat[nr][nc] = mat[r][c] + 1    # ⚠️ 更新距离
                queue.append((nr, nc))
    
    return mat

# ⚠️ 判断条件 mat[nr][nc] > mat[r][c] + 1:
#    只有能缩短距离才更新
#    等效于 visited: inf 的格子 = 未访问
#
# ⚠️ 0 的格子距离为 0, 不需要更新
#    只有 1 的格子需要被更新
```

---

## 5. 迷宫问题

### LeetCode 1926: 迷宫中离入口最近的出口

```python
from collections import deque

def nearestExit(maze, entrance):
    rows, cols = len(maze), len(maze[0])
    er, ec = entrance
    
    queue = deque([(er, ec, 0)])
    maze[er][ec] = '+'                    # ⚠️ 标记入口为墙
    dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    
    while queue:
        r, c, d = queue.popleft()
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and maze[nr][nc] == '.':
                # ⚠️ 判断是否是边界 = 出口
                if nr == 0 or nr == rows-1 or nc == 0 or nc == cols-1:
                    return d + 1
                maze[nr][nc] = '+'
                queue.append((nr, nc, d + 1))
    
    return -1

# ⚠️ 入口也在边界, 但不算出口
#    提前把入口标记为墙
#
# ⚠️ 边界判断: 行 == 0 或 rows-1, 列 == 0 或 cols-1
```

---

## 6. 分层 BFS vs 距离 BFS

```
两种写法, 结果相同:

方式1: 分层 (for _ in range(len(queue)))
  while queue:
      for _ in range(len(queue)):
          r, c = queue.popleft()
          ...
      layer += 1

方式2: 带距离 ((r, c, d) 三元组)
  while queue:
      r, c, d = queue.popleft()
      ...
      queue.append((nr, nc, d + 1))

⚠️ 分层写法: 每轮处理一整层, 适合需要"层号"的场景
   距离写法: 每个节点自带距离, 适合需要"具体距离"的场景
   两者都可以, 选自己习惯的
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 腐烂的橘子 | 994 | 多源BFS+计时 |
| Med | 01矩阵 | 542 | 多源BFS+距离 |
| Med | 最近出口 | 1926 | 单源BFS+边界 |
| Med | 地图中的最高点 | 1765 | 多源BFS |
| Med | 飞地的数量 | 1020 | 边界BFS+统计 |

---

## 本节要点速查

```
✅ BFS求最短路: 第一次到达 = 最短距离 (边权为1)
✅ 多源BFS: 所有源点一开始就入队
✅ 入队时标记, 不是出队时
✅ 分层 vs 距离: 两种写法都可以
✅ 不可达返回 -1
✅ 多源BFS计时: minutes-1 或初始-1
```
