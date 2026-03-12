# Bellman-Ford与SPFA

> 允许负权边的单源最短路算法，Bellman-Ford 是基础，SPFA 是其队列优化版本。

---

## 1. Bellman-Ford 核心思想

```
Bellman-Ford 算法:
  解决: 单源最短路（允许负权边）
  方法: 做 n-1 轮松弛
  每轮遍历所有边, 尝试更新 dist

  为什么 n-1 轮?
  最短路最多经过 n-1 条边（n个节点不重复）
  每轮至少确定一个节点的最短距离
  n-1 轮后所有节点都确定

  负环检测:
  第 n 轮还能松弛 → 存在负环
  （负环可以无限转, 距离趋于 -∞）

  时间: O(V × E)
  空间: O(V)
```

---

## 2. 算法过程可视化

```
例: 从 0 出发, 有负权边

     1       -2
  0 ──▶ 1 ──▶ 2
  │           ▲
  │5          │
  ▼     3     │
  3 ──────────┘

  edges = [(0,1,1), (0,3,5), (1,2,-2), (3,2,3)]

  初始: dist = [0, ∞, ∞, ∞]

  第1轮 (遍历所有边):
    (0,1,1): dist[1] = min(∞, 0+1) = 1
    (0,3,5): dist[3] = min(∞, 0+5) = 5
    (1,2,-2): dist[2] = min(∞, 1-2) = -1    ← 负权边！
    (3,2,3): dist[2] = min(-1, 5+3) = -1
    dist = [0, 1, -1, 5]

  第2轮:
    无变化 → 提前结束

  第3轮 (第n轮, 负环检测):
    无变化 → 无负环 ✓

  结果: dist = [0, 1, -1, 5]
```

---

## 3. Bellman-Ford 代码模板

```python
def bellman_ford(n, edges, start):
    """
    n:     节点数 (0-indexed)
    edges: [(u, v, w), ...] 边列表
    start: 源点
    返回:  dist 数组, 或 None (有负环)
    """
    dist = [float('inf')] * n
    dist[start] = 0
    
    # n-1 轮松弛
    for i in range(n - 1):             # ⚠️ 恰好 n-1 轮
        updated = False
        for u, v, w in edges:
            if dist[u] != float('inf') and dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                updated = True
        if not updated:                # ⚠️ 提前终止优化
            break
    
    # 第 n 轮: 负环检测
    for u, v, w in edges:
        if dist[u] != float('inf') and dist[u] + w < dist[v]:
            return None                # ⚠️ 存在负环
    
    return dist

# ⚠️ 关键点:
#   1. dist[u] != inf 的判断不可少
#      否则 inf + 负数 可能产生错误更新
#
#   2. 提前终止: 某轮没有更新 → 已收敛
#      最好情况 O(E), 最坏仍 O(VE)
#
#   3. 负环检测: 第 n 轮还能松弛 → 有负环
```

---

## 4. SPFA 算法

```
SPFA (Shortest Path Faster Algorithm):
  Bellman-Ford 的队列优化

  核心优化: 只有 dist 被更新的节点, 其邻居才可能继续更新
  用队列维护"被更新过的节点"

  平均时间: O(E)
  最坏时间: O(VE) ── 被特殊图卡

  ⚠️ SPFA 在竞赛中有争议:
     容易被构造数据卡成 O(VE)
     面试中 Dijkstra 更常用
     但 SPFA 能处理负权边, Dijkstra 不能

  负环检测:
     记录每个节点入队次数
     入队次数 ≥ n → 存在负环
```

### 代码模板

```python
from collections import deque, defaultdict

def spfa(graph, start, n):
    """
    graph: 邻接表, graph[u] = [(v, w), ...]
    返回:  dist 数组, 或 None (有负环)
    """
    dist = [float('inf')] * n
    dist[start] = 0
    in_queue = [False] * n             # ⚠️ 是否在队列中
    count = [0] * n                    # ⚠️ 入队次数
    
    queue = deque([start])
    in_queue[start] = True
    count[start] = 1
    
    while queue:
        u = queue.popleft()
        in_queue[u] = False            # ⚠️ 出队时标记
        
        for v, w in graph[u]:
            if dist[u] + w < dist[v]:
                dist[v] = dist[u] + w
                if not in_queue[v]:    # ⚠️ 不在队列中才入队
                    queue.append(v)
                    in_queue[v] = True
                    count[v] += 1
                    if count[v] >= n:  # ⚠️ 入队 n 次 → 负环
                        return None
    
    return dist

# ⚠️ in_queue 的作用:
#    避免同一节点重复入队
#    节点可以多次入队, 但同一时间最多在队列中一次
#
# ⚠️ 与 BFS 的区别:
#    BFS 每个节点只入队一次 (visited)
#    SPFA 节点可以反复入队 (距离可能被多次更新)
```

---

## 5. LeetCode 787: K站中转内最便宜的航班

```
n 个城市, flights[i] = [from, to, price]
从 src 到 dst, 最多中转 k 次
返回最便宜的价格, 不存在返回 -1

关键: 限制中转次数 → 用 Bellman-Ford 做 k+1 轮松弛
     (k 次中转 = k+1 条边)
```

```python
def findCheapestPrice(n, flights, src, dst, k):
    dist = [float('inf')] * n
    dist[src] = 0
    
    for _ in range(k + 1):             # ⚠️ k+1 轮 (k次中转=k+1条边)
        prev = dist[:]                 # ⚠️ 必须用上轮的值！
        for u, v, w in flights:
            if prev[u] != float('inf') and prev[u] + w < dist[v]:
                dist[v] = prev[u] + w  # ⚠️ 用 prev[u] 而非 dist[u]
    
    return dist[dst] if dist[dst] != float('inf') else -1

# ⚠️ 为什么需要 prev 拷贝?
#    如果直接用 dist[u], 可能用到"本轮刚更新的值"
#    导致实际走了更多步 (超过 k+1 条边)
#
#    prev = dist[:] 保证每轮只用上轮的结果
#    每轮最多多走一步
#
# ⚠️ 时间: O((k+1) × E)
#    E = flights 个数
```

---

## 6. 带限制的最短路场景

```
场景:                     适用算法
────────────────────────────────────────────
无负权, 无限制            Dijkstra
有负权, 无限制            Bellman-Ford / SPFA
限制步数/中转次数         Bellman-Ford (k轮)
限制步数 + 无负权         分层图 Dijkstra
检测负环                  Bellman-Ford 第n轮
```

---

## 7. Bellman-Ford vs SPFA vs Dijkstra

```
┌────────────┬─────────────┬────────────┬─────────────┐
│            │ Dijkstra    │ B-F        │ SPFA        │
├────────────┼─────────────┼────────────┼─────────────┤
│ 负权边     │ ✗           │ ✓          │ ✓           │
│ 负环检测   │ ✗           │ ✓          │ ✓           │
│ 时间       │ O(E log V)  │ O(VE)      │ 平均O(E)    │
│ 最坏时间   │ O(E log V)  │ O(VE)      │ O(VE)       │
│ 步数限制   │ 需改造      │ 天然支持   │ 需改造      │
│ 面试推荐   │ ✓✓✓        │ ✓✓         │ ✓           │
└────────────┴─────────────┴────────────┴─────────────┘
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | K站中转最便宜航班 | 787 | BF+步数限制+prev |
| Med | 网络延迟时间 | 743 | 对比BF和Dijkstra |
| Hard | 按公因数计算图连通 | - | SPFA+负权 |

---

## 本节要点速查

```
✅ Bellman-Ford: n-1轮松弛, O(VE), 允许负权
✅ 第n轮还能更新 → 负环
✅ dist[u] != inf 的判断不可少
✅ 限制步数: k+1轮 + prev拷贝
✅ SPFA: BF队列优化, 平均O(E), 可被卡
✅ in_queue 避免重复入队, count≥n 检测负环
✅ prev = dist[:] 防止用本轮已更新的值
```
