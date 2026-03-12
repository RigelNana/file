# Dijkstra算法

> Dijkstra 是最经典的单源最短路算法，适用于无负权边的图，贪心思想 + 最小堆优化。

---

## 1. 核心思想

```
Dijkstra 算法:
  解决: 从一个源点到所有其他节点的最短路径
  前提: 所有边权 ≥ 0 (无负权边)

  贪心: 每次从"未确定"节点中选距离最小的
       这个距离就是它的最终最短距离
       然后用它去更新邻居

  为什么贪心正确?
  因为没有负权边, 后续不可能找到更短的路径到这个节点
  (如果有负权边, 可能绕远路走负权边反而更短 → 贪心失效)
```

---

## 2. 算法过程可视化

```
例: 从节点 0 出发

      1       3
  0 ────▶ 1 ────▶ 3
  │             ▲
  │4            │1
  ▼      2      │
  2 ────────────┘

  邻接表:
    0 → [(1,1), (2,4)]
    1 → [(3,3)]
    2 → [(3,2)]

  过程:
  ┌──────────────────────────────────────────────┐
  │ 初始: dist = [0, ∞, ∞, ∞]                   │
  │       heap = [(0, 0)]                        │
  │                                              │
  │ 弹出 (0, 0):                                 │
  │   → 更新 1: 0+1=1 < ∞  → dist[1]=1         │
  │   → 更新 2: 0+4=4 < ∞  → dist[2]=4         │
  │   heap = [(1,1), (4,2)]                      │
  │                                              │
  │ 弹出 (1, 1):                                 │
  │   → 更新 3: 1+3=4 < ∞  → dist[3]=4         │
  │   heap = [(4,2), (4,3)]                      │
  │                                              │
  │ 弹出 (4, 2):                                 │
  │   → 更新 3: 4+2=6 > 4  → 不更新            │
  │   heap = [(4,3)]                             │
  │                                              │
  │ 弹出 (4, 3): 3 的邻居都已处理               │
  │                                              │
  │ 结果: dist = [0, 1, 4, 4]                    │
  └──────────────────────────────────────────────┘

  时间复杂度: O(E log V)  (堆优化)
  空间复杂度: O(V + E)
```

---

## 3. 代码模板

```python
import heapq
from collections import defaultdict

def dijkstra(graph, start, n):
    """
    graph: 邻接表, graph[u] = [(v, w), ...]
    start: 源点
    n:     节点数
    返回:  dist 数组, dist[i] = start 到 i 的最短距离
    """
    dist = [float('inf')] * n
    dist[start] = 0
    heap = [(0, start)]               # ⚠️ (距离, 节点)
    
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:               # ⚠️ 关键剪枝: 已有更短路径, 跳过
            continue
        for v, w in graph[u]:
            new_dist = dist[u] + w
            if new_dist < dist[v]:    # ⚠️ 严格小于才更新
                dist[v] = new_dist
                heapq.heappush(heap, (new_dist, v))
    
    return dist

# ⚠️ 关键点:
#   1. d > dist[u] 的剪枝很重要!
#      同一个节点可能入堆多次, 只有最小的那次有效
#      没有这个判断也能得到正确结果, 但大幅影响性能
#
#   2. 不能用 visited 集合替代!
#      visited 集合只在弹出时标记, 等价于 d > dist[u]
#      但 d > dist[u] 比 visited 更简洁
#
#   3. 严格小于 (<) 才入堆
#      等于时入堆不影响正确性, 但会增加堆操作
```

---

## 4. LeetCode 743: 网络延迟时间

```
给定 n 个节点的有向加权图 times
times[i] = (ui, vi, wi): 从 ui 到 vi 耗时 wi
从节点 k 发出信号, 返回所有节点收到信号的最短时间
如果有节点无法到达, 返回 -1

本质: 从 k 出发的单源最短路, 取 max
```

```python
import heapq
from collections import defaultdict

def networkDelayTime(times, n, k):
    graph = defaultdict(list)
    for u, v, w in times:
        graph[u].append((v, w))
    
    dist = [float('inf')] * (n + 1)   # ⚠️ 1-indexed, 不用 dist[0]
    dist[k] = 0
    heap = [(0, k)]
    
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                heapq.heappush(heap, (dist[v], v))
    
    ans = max(dist[1:])               # ⚠️ 从 1 开始, 跳过 dist[0]
    return ans if ans < float('inf') else -1

# ⚠️ 1-indexed 节点:
#    dist 大小 n+1
#    dist[0] 不使用
#    取 max 时从 dist[1:] 开始
```

---

## 5. LeetCode 1514: 概率最大的路径

```
无向加权图, 边权是概率 (0~1)
求从 start 到 end 的最大概率路径

关键转换:
  概率最大 → 概率取负 → 最短路 (Dijkstra)
  或者: 直接改 Dijkstra 为最大化
```

```python
import heapq
from collections import defaultdict

def maxProbability(n, edges, succProb, start, end):
    graph = defaultdict(list)
    for i, (u, v) in enumerate(edges):
        p = succProb[i]
        graph[u].append((v, p))
        graph[v].append((u, p))           # ⚠️ 无向图
    
    dist = [0.0] * n                       # ⚠️ 概率初始化 0
    dist[start] = 1.0                      # ⚠️ 起点概率 1
    heap = [(-1.0, start)]                 # ⚠️ 取负 → 最小堆变最大堆
    
    while heap:
        neg_prob, u = heapq.heappop(heap)
        prob = -neg_prob
        if prob < dist[u]:                 # ⚠️ 已有更大概率, 跳过
            continue
        if u == end:                       # ⚠️ 提前终止
            return prob
        for v, p in graph[u]:
            new_prob = prob * p            # ⚠️ 概率相乘
            if new_prob > dist[v]:         # ⚠️ 大于才更新 (最大化)
                dist[v] = new_prob
                heapq.heappush(heap, (-new_prob, v))
    
    return 0.0

# ⚠️ 求最大 → 取负变最短路:
#    概率: 初始0, 起点1, 相乘, 大于更新
#    距离: 初始∞, 起点0, 相加, 小于更新
#    完全对称, 只需取负或反转比较方向
```

---

## 6. LeetCode 1631: 最小体力消耗路径

```
m×n 格子图, 每格有高度
体力消耗 = 路径上相邻格子的最大高度差
求从左上到右下的最小体力消耗

关键: Dijkstra 中 dist[v] 的含义改为路径上的 max 差
```

```python
import heapq

def minimumEffortPath(heights):
    m, n = len(heights), len(heights[0])
    dist = [[float('inf')] * n for _ in range(m)]
    dist[0][0] = 0
    heap = [(0, 0, 0)]                    # (effort, row, col)
    
    while heap:
        effort, r, c = heapq.heappop(heap)
        if effort > dist[r][c]:
            continue
        if r == m - 1 and c == n - 1:     # ⚠️ 提前终止
            return effort
        for dr, dc in [(-1,0),(1,0),(0,-1),(0,1)]:
            nr, nc = r + dr, c + dc
            if 0 <= nr < m and 0 <= nc < n:
                new_effort = max(effort, abs(heights[nr][nc] - heights[r][c]))
                if new_effort < dist[nr][nc]:     # ⚠️ 这里是 max 而非 sum
                    dist[nr][nc] = new_effort
                    heapq.heappush(heap, (new_effort, nr, nc))
    
    return dist[m-1][n-1]

# ⚠️ Dijkstra 变体:
#    普通: new_dist = dist[u] + weight    (累加)
#    本题: new_dist = max(dist[u], diff)  (取最大)
#    贪心依然成立: 拓展最小的, 保证不会更优
#
# ⚠️ 提前终止: 弹出终点时就是答案
#    因为贪心保证第一次弹出就是最优
```

---

## 7. 0-1 BFS

```
当边权只有 0 和 1 时, 用双端队列代替堆
权为 0 的边 → 加入队首
权为 1 的边 → 加入队尾

时间: O(V + E) ── 比 Dijkstra 更快
```

```python
from collections import deque

def zero_one_bfs(graph, start, n):
    """graph[u] = [(v, w)] 其中 w 是 0 或 1"""
    dist = [float('inf')] * n
    dist[start] = 0
    dq = deque([start])
    
    while dq:
        u = dq.popleft()
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if w == 0:
                    dq.appendleft(v)   # ⚠️ 权0 → 队首 (优先处理)
                else:
                    dq.append(v)       # ⚠️ 权1 → 队尾
    
    return dist

# ⚠️ 为什么正确:
#    队列始终保持: 前面的 dist ≤ 后面的 dist
#    权0加队首不增加距离, 权1加队尾增加1
#    类似于 Dijkstra 的贪心, 但用 deque 代替 heap
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 网络延迟时间 | 743 | Dijkstra 模板 |
| Med | 概率最大的路径 | 1514 | 最大化变体 |
| Med | 最小体力消耗路径 | 1631 | 网格图+max变体 |
| Med | 到达目的地的方式数 | 1976 | Dijkstra+计数 |
| Med | 使网格图至少有一条有效路径 | 1368 | 0-1 BFS |

---

## 本节要点速查

```
✅ Dijkstra: 无负权边单源最短路, O(E log V)
✅ 核心剪枝: d > dist[u] → continue
✅ 严格 < 才更新和入堆
✅ 取负可转最大化问题
✅ max 变体: new = max(dist[u], diff) 贪心仍成立
✅ 0-1 BFS: 权0|1 → deque 代替 heap, O(V+E)
✅ 提前终止: 弹出终点时即为最优解
```
