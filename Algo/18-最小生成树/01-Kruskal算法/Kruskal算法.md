# Kruskal算法

> 基于贪心和并查集的最小生成树算法，按边权从小到大选边，不成环就加入。

---

## 1. 核心思想

```
最小生成树 (MST):
  连接所有 n 个节点的树 (n-1 条边)
  总边权最小
  前提: 无向连通加权图

Kruskal:
  1. 所有边按权重排序
  2. 从小到大依次考虑每条边
  3. 如果边的两端不在同一连通分量 → 加入 MST
  4. 如果已连通 → 跳过（加入会成环）
  5. 选够 n-1 条边后停止

  判断是否连通 → 并查集 (Union-Find)

  时间: O(E log E)  排序主导
  空间: O(V)  并查集
```

---

## 2. 算法过程可视化

```
例: 5个节点, 7条边

    1     3     2
  0───1───2───3
  │ ╲     │   │
  │4  2   5   1
  │   ╲   │   │
  └────4──┘───┘

  边按权重排序:
  ┌────────────────────────────────────────┐
  │ 权重  边       动作           已选边数 │
  ├────────────────────────────────────────┤
  │  1   (2,3)   2,3不连通 → 选   1      │
  │  1   (0,1)   0,1不连通 → 选   2      │
  │  2   (0,4)   0,4不连通 → 选   3      │
  │  2   (2,4)   2,4不连通 → 选   4=n-1  │
  │              ──── 停止 ────           │
  │  3   (1,2)   跳过 (1,2已连通)         │
  │  4   (0,4)   跳过                      │
  │  5   (2,4)   跳过                      │
  └────────────────────────────────────────┘
  
  MST 总权重 = 1 + 1 + 2 + 2 = 6
```

---

## 3. 并查集模板

```python
class UnionFind:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.components = n            # ⚠️ 连通分量数
    
    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]  # ⚠️ 路径压缩
            x = self.parent[x]
        return x
    
    def union(self, x, y):
        rx, ry = self.find(x), self.find(y)
        if rx == ry:
            return False               # ⚠️ 已连通, 返回 False
        # 按秩合并
        if self.rank[rx] < self.rank[ry]:
            rx, ry = ry, rx
        self.parent[ry] = rx
        if self.rank[rx] == self.rank[ry]:
            self.rank[rx] += 1
        self.components -= 1
        return True                    # ⚠️ 合并成功, 返回 True

# ⚠️ 路径压缩 + 按秩合并:
#    find 和 union 近乎 O(1) (反 Ackermann 函数)
#
# ⚠️ union 返回值:
#    True = 成功合并 (之前不连通)
#    False = 已连通 (不需要合并)
#    Kruskal 中: True → 选这条边
```

---

## 4. Kruskal 代码模板

```python
def kruskal(n, edges):
    """
    n:     节点数 (0-indexed)
    edges: [(u, v, w), ...]
    返回:  MST 总权重, 或 -1 (图不连通)
    """
    edges.sort(key=lambda x: x[2])     # ⚠️ 按权重排序
    uf = UnionFind(n)
    mst_weight = 0
    mst_edges = 0
    
    for u, v, w in edges:
        if uf.union(u, v):             # ⚠️ 不连通才选
            mst_weight += w
            mst_edges += 1
            if mst_edges == n - 1:     # ⚠️ 选够 n-1 条边
                break
    
    if mst_edges < n - 1:
        return -1                      # 图不连通, 无 MST
    return mst_weight

# ⚠️ 关键点:
#   1. 排序: O(E log E), 是瓶颈
#   2. n-1 条边提前终止: 选够就停
#   3. 不连通判断: mst_edges < n-1
```

---

## 5. LeetCode 1584: 连接所有点的最小费用

```
给定 n 个坐标点 points[i] = [xi, yi]
连接两点的费用 = |xi-xj| + |yi-yj| (曼哈顿距离)
返回连接所有点的最小费用

本质: 完全图的 MST
边数 = n*(n-1)/2
```

```python
def minCostConnectPoints(points):
    n = len(points)
    edges = []
    
    for i in range(n):
        for j in range(i + 1, n):
            dist = abs(points[i][0] - points[j][0]) + \
                   abs(points[i][1] - points[j][1])
            edges.append((i, j, dist))
    
    edges.sort(key=lambda x: x[2])
    
    uf = UnionFind(n)
    total = 0
    count = 0
    
    for u, v, w in edges:
        if uf.union(u, v):
            total += w
            count += 1
            if count == n - 1:
                break
    
    return total

# ⚠️ 完全图: n*(n-1)/2 条边
#    n=1000 → 约 50万条边, Kruskal 可以处理
#    n=10000 → 约 5000万条边, 建边就很慢
#    → 大 n 时考虑 Prim 或优化建边
```

---

## 6. LeetCode 1489: 找到最小生成树里的关键边和伪关键边

```
关键边: 删除后 MST 权重增大 (或不连通)
伪关键边: 在某个 MST 中, 但不是关键边

方法:
  先求原始 MST 权重 W
  对每条边:
    1. 删除它, 求 MST → 权重 > W 或不连通 → 关键边
    2. 强制选它, 求 MST → 权重 == W → 伪关键边
```

```python
def findCriticalAndPseudoCriticalEdges(n, edges):
    # 给边编号
    indexed_edges = [(u, v, w, i) for i, (u, v, w) in enumerate(edges)]
    indexed_edges.sort(key=lambda x: x[2])
    
    # 求 MST 权重
    def get_mst_weight(n, edges, skip=-1, force=-1):
        uf = UnionFind(n)
        weight = 0
        count = 0
        
        if force >= 0:                  # ⚠️ 强制选某边
            u, v, w, _ = edges[force]
            uf.union(u, v)
            weight += w
            count += 1
        
        for i, (u, v, w, _) in enumerate(edges):
            if i == skip:               # ⚠️ 跳过某边
                continue
            if uf.union(u, v):
                weight += w
                count += 1
                if count == n - 1:
                    break
        
        return weight if count == n - 1 else float('inf')
    
    base_weight = get_mst_weight(n, indexed_edges)
    
    critical = []
    pseudo = []
    
    for i in range(len(indexed_edges)):
        idx = indexed_edges[i][3]       # 原始编号
        
        # 删除这条边
        if get_mst_weight(n, indexed_edges, skip=i) > base_weight:
            critical.append(idx)
        # 强制选这条边
        elif get_mst_weight(n, indexed_edges, force=i) == base_weight:
            pseudo.append(idx)
    
    return [critical, pseudo]

# ⚠️ 时间: O(E² × α(V))
#    每条边要做两次 MST, 每次 O(E)
#    E ≤ 200 时可以接受
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 连接所有点的最小费用 | 1584 | Kruskal 模板 |
| Hard | 最小生成树的关键边和伪关键边 | 1489 | 删边/强制选边 |
| Med | 以图判树 | 261 | 并查集判连通+无环 |

---

## 本节要点速查

```
✅ Kruskal: 排序 + 并查集, O(E log E)
✅ 按权重排序, 不连通就选, 选 n-1 条
✅ 并查集: 路径压缩 + 按秩合并 ≈ O(1)
✅ union 返回 False = 已连通 = 会成环
✅ mst_edges < n-1 → 图不连通
✅ 关键边: 删除后权重增大
✅ 伪关键边: 强制选后权重不变
```
