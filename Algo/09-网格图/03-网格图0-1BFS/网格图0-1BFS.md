# 网格图 0-1 BFS

> 当边权只有 0 和 1 时，用双端队列实现 0-1 BFS，比 Dijkstra 更高效。

---

## 1. 为什么需要 0-1 BFS

```
普通 BFS: 每步代价相同 (都是 1)
  → 一层一层扩展 = 最短路

但如果某些移动代价为 0, 某些为 1:
  普通 BFS 不保证最优 (0 代价的应该优先处理)
  Dijkstra 可以, 但 O(E·logV) 多了一个 log

0-1 BFS: 用双端队列
  代价 0 → 加入队首 (appendleft)   ← 优先处理
  代价 1 → 加入队尾 (append)        ← 正常排队

这样队列始终按"距离递增"有序, O(V+E) 复杂度
```

---

## 2. 模板

```python
from collections import deque

def zero_one_bfs(grid):
    rows, cols = len(grid), len(grid[0])
    dist = [[float('inf')] * cols for _ in range(rows)]
    dist[0][0] = 0
    dq = deque([(0, 0)])
    dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    
    while dq:
        r, c = dq.popleft()
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols:
                w = grid[nr][nc]          # ⚠️ 边权 0 或 1
                new_dist = dist[r][c] + w
                if new_dist < dist[nr][nc]:
                    dist[nr][nc] = new_dist
                    if w == 0:
                        dq.appendleft((nr, nc))  # ⚠️ 0 代价: 队首
                    else:
                        dq.append((nr, nc))       # ⚠️ 1 代价: 队尾
    
    return dist[rows-1][cols-1]

# ⚠️ 核心: 0 加队首, 1 加队尾
#    这保证队列内按距离递增
#    类似 Dijkstra 的"取最小距离", 但无需堆
#
# ⚠️ 不用 visited 集合:
#    用 dist[nr][nc] < +inf 来判断"是否值得更新"
#    if new_dist < dist[nr][nc] → 如果能缩短距离才处理
#
# ⚠️ 和 Dijkstra 的区别:
#    0-1 BFS: O(V+E), 双端队列, 只适用于权 0/1
#    Dijkstra: O(E·logV), 优先队列, 适用于非负权
```

---

## 3. 使网格图至少有一条有效路径的最小代价

### LeetCode 1368

```
网格图每个格子有方向 (1=右, 2=左, 3=下, 4=上)
顺方向走代价 0, 改方向走代价 1
求从 (0,0) 到 (m-1,n-1) 的最小代价

这就是 0-1 BFS:
  顺方向 → 代价 0 → 加队首
  逆方向 → 代价 1 → 加队尾
```

```python
from collections import deque

def minCost(grid):
    m, n = len(grid), len(grid[0])
    # 方向 1=右(0,1), 2=左(0,-1), 3=下(1,0), 4=上(-1,0)
    dir_map = {1: (0,1), 2: (0,-1), 3: (1,0), 4: (-1,0)}
    all_dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    
    dist = [[float('inf')] * n for _ in range(m)]
    dist[0][0] = 0
    dq = deque([(0, 0)])
    
    while dq:
        r, c = dq.popleft()
        for dr, dc in all_dirs:
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n:
                # ⚠️ 判断是否沿当前格子的指向
                w = 0 if dir_map[grid[r][c]] == (dr, dc) else 1
                new_dist = dist[r][c] + w
                if new_dist < dist[nr][nc]:
                    dist[nr][nc] = new_dist
                    if w == 0:
                        dq.appendleft((nr, nc))
                    else:
                        dq.append((nr, nc))
    
    return dist[m-1][n-1]

# ⚠️ grid[r][c] 表示 (r,c) 格子的"方向标志"
#    沿方向走 → 0 代价
#    其他三个方向 → 1 代价
```

---

## 4. 到达角落需要移除的最小障碍物

### LeetCode 2290

```
0 = 空地, 1 = 障碍物
从 (0,0) 到 (m-1,n-1), 移除障碍物 = 代价 1

0-1 BFS:
  走空地 → 代价 0
  破墙 → 代价 1
```

```python
from collections import deque

def minimumObstacles(grid):
    m, n = len(grid), len(grid[0])
    dist = [[float('inf')] * n for _ in range(m)]
    dist[0][0] = 0
    dq = deque([(0, 0)])
    dirs = [(0,1), (0,-1), (1,0), (-1,0)]
    
    while dq:
        r, c = dq.popleft()
        for dr, dc in dirs:
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n:
                w = grid[nr][nc]          # ⚠️ 0=空地(代价0), 1=障碍(代价1)
                new_dist = dist[r][c] + w
                if new_dist < dist[nr][nc]:
                    dist[nr][nc] = new_dist
                    if w == 0:
                        dq.appendleft((nr, nc))
                    else:
                        dq.append((nr, nc))
    
    return dist[m-1][n-1]

# ⚠️ 和模板完全一样!
#    grid[nr][nc] 本身就是边权 (0或1)
#    非常简洁
```

---

## 5. 0-1 BFS vs 其他最短路

```
┌──────────────┬───────────┬────────────┬──────────────────┐
│ 算法         │ 时间复杂度 │ 适用场景   │ 数据结构         │
├──────────────┼───────────┼────────────┼──────────────────┤
│ BFS          │ O(V+E)    │ 无权图     │ 队列             │
│ 0-1 BFS      │ O(V+E)    │ 权0或1     │ 双端队列         │
│ Dijkstra     │ O(ElogV)  │ 非负权     │ 最小堆(优先队列) │
│ Bellman-Ford │ O(VE)     │ 有负权     │ 数组             │
└──────────────┴───────────┴────────────┴──────────────────┘

⚠️ 如何判断是否可以用 0-1 BFS:
   看边权是否只有两种值且其中一个为 0
   "顺方向免费, 改方向收费" → 0-1 BFS
   "空地免费, 破墙收费" → 0-1 BFS
   "同色不用涂, 异色要涂" → 0-1 BFS
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 使网格图有效路径的最小代价 | 1368 | 方向+0-1 BFS |
| Med | 移除最小障碍物 | 2290 | 破墙+0-1 BFS |
| Med | 从0翻转到目标 | 2812 | 变体 |

---

## 本节要点速查

```
✅ 0-1 BFS: 权0加队首(appendleft), 权1加队尾(append)
✅ 保证队列按距离递增, 复杂度 O(V+E)
✅ 判断标准: 边权只有 0 和 1 两种
✅ 用 dist 矩阵而非 visited 集合
✅ 比 Dijkstra 快一个 log 因子
```
