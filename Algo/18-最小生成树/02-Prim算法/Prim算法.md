# Prim算法

> 基于贪心和最小堆的 MST 算法，从一个点出发不断扩展，适合稠密图。

---

## 1. 核心思想

```
Prim 算法:
  类似 Dijkstra 的"局部扩展"

  1. 任选一个起点, 加入已选集合 S
  2. 找连接 S 和 非S 的最小权边
  3. 把这条边的另一端加入 S
  4. 重复直到 S 包含所有节点

  用最小堆维护候选边
  时间: O(E log V)  堆优化
  
  vs Dijkstra:
    Dijkstra: 堆中存 (到源的距离, 节点)
    Prim:     堆中存 (边权, 节点)        ← 不是累积距离!
```

---

## 2. 算法过程可视化

```
例:
       1       3
   0 ───── 1 ───── 3
   │             ▲
   │4            │2
   ▼      2      │
   2 ────────────┘

   已选 S = {0}

   Step 1: 0 的边 → (1,1), (4,2)
     堆弹出 (1,1) → 选边 0-1, S = {0,1}

   Step 2: 加入 1 的边 → (3,3)
     堆: [(3,3), (4,2)]
     弹出 (3,3) → 选边 1-3, S = {0,1,3}

   Step 3: 加入 3 的边 → 无新边
     堆: [(4,2)]
     弹出 (4,2) → 选边 0-2, S = {0,1,2,3}

   总权重 = 1 + 3 + 4 = 8

   ⚠️ 注意: 堆中可能有过期边（指向已选节点）
      弹出时检查, 已选就跳过
```

---

## 3. 代码模板

```python
import heapq
from collections import defaultdict

def prim(n, edges):
    """
    n:     节点数 (0-indexed)
    edges: [(u, v, w), ...] 无向边
    返回:  MST 总权重, 或 -1 (不连通)
    """
    graph = defaultdict(list)
    for u, v, w in edges:
        graph[u].append((v, w))
        graph[v].append((u, w))        # ⚠️ 无向图双向
    
    visited = [False] * n
    heap = [(0, 0)]                    # ⚠️ (边权, 节点), 起点权0
    mst_weight = 0
    mst_count = 0
    
    while heap and mst_count < n:
        w, u = heapq.heappop(heap)
        if visited[u]:                 # ⚠️ 已选, 跳过
            continue
        visited[u] = True
        mst_weight += w
        mst_count += 1
        
        for v, weight in graph[u]:
            if not visited[v]:
                heapq.heappush(heap, (weight, v))
    
    return mst_weight if mst_count == n else -1

# ⚠️ 与 Dijkstra 的区别:
#    Dijkstra: heappush(dist[u]+w, v) → 到源的累积距离
#    Prim:     heappush(w, v)         → 只看边权本身
#
# ⚠️ visited 判断:
#    弹出时检查, 而非入堆时
#    同一个节点可能入堆多次, 只有第一次弹出有效
```

---

## 4. LeetCode 1584: 连接所有点的最小费用 (Prim解法)

```python
import heapq

def minCostConnectPoints(points):
    n = len(points)
    visited = [False] * n
    heap = [(0, 0)]                    # 从点0开始
    total = 0
    count = 0
    
    while heap and count < n:
        cost, u = heapq.heappop(heap)
        if visited[u]:
            continue
        visited[u] = True
        total += cost
        count += 1
        
        for v in range(n):
            if not visited[v]:
                dist = abs(points[u][0] - points[v][0]) + \
                       abs(points[u][1] - points[v][1])
                heapq.heappush(heap, (dist, v))
    
    return total

# ⚠️ 完全图的 Prim:
#    不需要预先建所有边
#    每次选定一个节点后, 动态计算到所有未选节点的距离
#    堆中会有 O(n²) 个元素, 但实际处理 n 个节点后就停
#
# ⚠️ Prim vs Kruskal 完全图比较:
#    Kruskal: O(n² log n²) = O(n² log n)  排序主导
#    Prim:    O(n² log n)                  堆操作主导
#    两者差不多, Prim 不需要预存所有边
```

---

## 5. 邻接矩阵 Prim (O(V²), 无堆)

```python
def prim_matrix(n, cost_matrix):
    """
    cost_matrix[i][j] = i到j的边权, inf表示不相邻
    适合稠密图, O(V²) 不需要堆
    """
    INF = float('inf')
    visited = [False] * n
    min_cost = [INF] * n               # ⚠️ 到已选集合的最小边权
    min_cost[0] = 0
    total = 0
    
    for _ in range(n):
        # 找未选中的最小 min_cost
        u = -1
        for v in range(n):
            if not visited[v] and (u == -1 or min_cost[v] < min_cost[u]):
                u = v
        
        if min_cost[u] == INF:
            return -1                  # 不连通
        
        visited[u] = True
        total += min_cost[u]
        
        # 更新邻居
        for v in range(n):
            if not visited[v] and cost_matrix[u][v] < min_cost[v]:
                min_cost[v] = cost_matrix[u][v]
    
    return total

# ⚠️ O(V²) Prim:
#    不用堆, 线性扫描找最小
#    稠密图 (E ≈ V²) 时比堆优化更快
#    因为 O(V²) < O(V² log V)
```

---

## 6. Kruskal vs Prim 对比

```
┌────────────────┬───────────────────┬───────────────────┐
│                │ Kruskal           │ Prim              │
├────────────────┼───────────────────┼───────────────────┤
│ 策略           │ 全局边排序        │ 局部节点扩展      │
│ 数据结构       │ 并查集            │ 最小堆/扫描       │
│ 时间(稀疏图)   │ O(E log E) ✓     │ O(E log V)        │
│ 时间(稠密图)   │ O(E log E)        │ O(V²) ✓          │
│ 适合场景       │ 边数少, 边列表    │ 稠密图, 邻接矩阵  │
│ 代码简洁度     │ ✓✓               │ ✓                 │
│ 面试推荐       │ ✓✓✓ 更常考       │ ✓✓               │
└────────────────┴───────────────────┴───────────────────┘

⚠️ 面试中 Kruskal 更常考 (代码更简洁)
⚠️ 完全图选 Prim (不用预存 n² 条边)
⚠️ 两者结果一定相同 (MST 唯一, 如果边权不同)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 连接所有点的最小费用 | 1584 | Prim/Kruskal 对比 |
| Hard | 水资源分配优化 | 1168 | 虚拟节点+MST |
| Med | 最低成本联通所有城市 | 1135 | Kruskal 模板 |

---

## 本节要点速查

```
✅ Prim: 局部扩展, 堆存(边权,节点), O(E log V)
✅ 与 Dijkstra 区别: 堆存边权而非累积距离
✅ 弹出时判 visited, 已选跳过
✅ 稠密图用 O(V²) 无堆版本
✅ 面试: Kruskal 更常考, 完全图选 Prim
```
