# Floyd-Warshall算法

> 多源最短路算法，三层循环 DP，适合节点数较小（n ≤ 400）的稠密图。

---

## 1. 核心思想

```
Floyd-Warshall:
  解决: 所有节点对之间的最短路
  方法: DP, 枚举"中转点"

  状态: dist[i][j] = 从 i 到 j 的最短距离
  转移: dist[i][j] = min(dist[i][j], dist[i][k] + dist[k][j])
        "i到j 直接走" vs "i到j 经过k中转"

  枚举顺序: k 在最外层!
    第 k 轮: 考虑能否通过节点 k 来缩短 i→j 的路

  为什么 k 在最外层?
    类似背包: 每轮"加入一个新的中转点"
    k=0: 只用节点0做中转
    k=1: 用节点0,1做中转
    ...
    k=n-1: 用所有节点做中转

  时间: O(n³)
  空间: O(n²)
```

---

## 2. 算法过程可视化

```
例: 4 个节点

  初始 dist (邻接矩阵):
       0    1    2    3
  0 [  0,   3,   ∞,   7 ]
  1 [  ∞,   0,   2,   ∞ ]
  2 [  ∞,   ∞,   0,   1 ]
  3 [  6,   ∞,   ∞,   0 ]

  k=0 (用节点0中转):
    dist[3][1] = min(∞, dist[3][0]+dist[0][1]) = min(∞, 6+3) = 9
    dist[3][2] 无改善

  k=1 (用节点0,1中转):
    dist[0][2] = min(∞, dist[0][1]+dist[1][2]) = min(∞, 3+2) = 5

  k=2 (用节点0,1,2中转):
    dist[0][3] = min(7, dist[0][2]+dist[2][3]) = min(7, 5+1) = 6
    dist[1][3] = min(∞, dist[1][2]+dist[2][3]) = min(∞, 2+1) = 3

  k=3 (用所有节点中转):
    dist[1][0] = min(∞, dist[1][3]+dist[3][0]) = min(∞, 3+6) = 9
    dist[2][0] = min(∞, dist[2][3]+dist[3][0]) = min(∞, 1+6) = 7

  最终:
       0    1    2    3
  0 [  0,   3,   5,   6 ]
  1 [  9,   0,   2,   3 ]
  2 [  7,  10,   0,   1 ]
  3 [  6,   9,  11,   0 ]
```

---

## 3. 代码模板

```python
def floyd_warshall(n, edges):
    """
    n:     节点数 (0-indexed)
    edges: [(u, v, w), ...] 
    返回:  dist[i][j] = i到j的最短距离
    """
    INF = float('inf')
    dist = [[INF] * n for _ in range(n)]
    
    # 初始化
    for i in range(n):
        dist[i][i] = 0                 # ⚠️ 自己到自己=0
    for u, v, w in edges:
        dist[u][v] = min(dist[u][v], w)  # ⚠️ 处理重边取最小
        # dist[v][u] = min(dist[v][u], w)  # 无向图加这行
    
    # Floyd 三层循环
    for k in range(n):                 # ⚠️ k 在最外层!!
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
    
    return dist

# ⚠️ 常见错误:
#   1. k 没放在最外层 → 错误答案
#      必须是 k-i-j 顺序, 不能是 i-j-k 或 i-k-j
#
#   2. 忘记 dist[i][i] = 0
#      否则自环可能得到非零值
#
#   3. 重边: 取 min(旧值, 新权重)
#      否则只保留最后一条边
#
#   4. 负环检测: dist[i][i] < 0 → 存在负环
```

---

## 4. LeetCode 1334: 阈值距离内邻居最少的城市

```
n 个城市, 无向加权边
给定距离阈值 distanceThreshold
找到这样的城市: 在阈值距离内能到达的城市数最少
如果多个城市并列, 返回编号最大的

思路: Floyd + 统计每个城市在阈值内的邻居数
```

```python
def findTheCity(n, edges, distanceThreshold):
    INF = float('inf')
    dist = [[INF] * n for _ in range(n)]
    
    for i in range(n):
        dist[i][i] = 0
    for u, v, w in edges:
        dist[u][v] = w
        dist[v][u] = w                 # ⚠️ 无向图
    
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
    
    min_count = INF
    result = -1
    for i in range(n):
        count = sum(1 for j in range(n) if j != i and dist[i][j] <= distanceThreshold)
        if count <= min_count:         # ⚠️ <= 而非 <, 保证取编号最大
            min_count = count
            result = i
    
    return result

# ⚠️ count <= min_count:
#    并列时取编号最大 → 因为 i 递增遍历
#    用 <= 保证后面的覆盖前面的
```

---

## 5. 路径恢复

```python
def floyd_with_path(n, edges):
    INF = float('inf')
    dist = [[INF] * n for _ in range(n)]
    nxt = [[None] * n for _ in range(n)]   # ⚠️ nxt[i][j]=从i到j的下一跳
    
    for i in range(n):
        dist[i][i] = 0
    for u, v, w in edges:
        dist[u][v] = w
        nxt[u][v] = v                       # ⚠️ 直连, 下一跳就是v
    
    for k in range(n):
        for i in range(n):
            for j in range(n):
                if dist[i][k] + dist[k][j] < dist[i][j]:
                    dist[i][j] = dist[i][k] + dist[k][j]
                    nxt[i][j] = nxt[i][k]   # ⚠️ 经过k, 下一跳和到k一样
    
    # 恢复路径
    def get_path(u, v):
        if nxt[u][v] is None:
            return []                       # 不可达
        path = [u]
        while u != v:
            u = nxt[u][v]
            path.append(u)
        return path
    
    return dist, get_path

# ⚠️ nxt[i][j] 记录从 i 到 j 路径的第一步
#    沿着 nxt 不断跳转, 可以恢复完整路径
```

---

## 6. 最短路算法选择总结

```
┌─────────────────┬──────────────┬───────────┬───────────────┐
│ 场景            │ 推荐算法     │ 时间      │ 备注          │
├─────────────────┼──────────────┼───────────┼───────────────┤
│ 无权图          │ BFS          │ O(V+E)    │               │
│ 权0/1           │ 0-1 BFS      │ O(V+E)    │ deque         │
│ 无负权,单源     │ Dijkstra     │ O(ElogV)  │ 最常用        │
│ 有负权,单源     │ Bellman-Ford │ O(VE)     │ 能检测负环    │
│ 有负权,要优化   │ SPFA         │ 平均O(E)  │ 可被卡        │
│ 限制步数        │ BF (k轮)     │ O(kE)     │ prev拷贝      │
│ 多源, n≤400     │ Floyd        │ O(n³)     │ 三层循环      │
│ 多源, n很大     │ 多次Dijkstra │ O(VElogV) │               │
└─────────────────┴──────────────┴───────────┴───────────────┘

⚠️ n ≤ 400 用 Floyd, n ≤ 10⁵ 用 Dijkstra
⚠️ 有负权 → 不能用 Dijkstra
⚠️ 多源且 n 小 → Floyd 代码最简洁
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 阈值距离内邻居最少的城市 | 1334 | Floyd 模板 |
| Med | 课程表IV (传递闭包) | 1462 | Floyd 判断可达性 |
| Med | 网络延迟时间 | 743 | 对比 Floyd/Dijkstra |

---

## 本节要点速查

```
✅ Floyd: 多源最短路, O(n³), n≤400
✅ k在最外层! k-i-j 顺序不能变
✅ dist[i][i] = 0 初始化
✅ 重边取 min
✅ 负环: dist[i][i] < 0
✅ 路径恢复: nxt[i][j] 记录下一跳
✅ <= distanceThreshold 统计邻居, <= 取最大编号
```
