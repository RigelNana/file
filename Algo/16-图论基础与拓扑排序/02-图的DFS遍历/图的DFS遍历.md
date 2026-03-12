# 图的DFS遍历

> DFS深度优先遍历是图论最基础的算法，用于连通性判定、环检测、连通分量计数等。

---

## 1. DFS 基本思想

```
DFS: 深度优先, 一条路走到黑再回溯

  0 → 1 → 3
  ↓
  2 → 3 (已访问, 跳过)

  访问顺序: 0 → 1 → 3 → (回溯) → 2

DFS 能解决:
  · 判断连通性 (从某点能否到另一点)
  · 计算连通分量个数
  · 检测环 (有向图用三色, 无向图用父节点)
  · 拓扑排序 (后序反转)
  · 找所有路径
```

---

## 2. DFS 模板

```python
# 图的 DFS 遍历
def dfs_graph(graph, n):
    visited = [False] * n
    
    def dfs(node):
        visited[node] = True
        for nei in graph[node]:
            if not visited[nei]:
                dfs(nei)
    
    # 遍历所有节点 (处理非连通图)
    for i in range(n):
        if not visited[i]:
            dfs(i)

# ⚠️ visited 数组: 防止重复访问
#    图和树不同, 图可能有环
#    不标记 visited → 无限循环
#
# ⚠️ 外层 for: 处理非连通图
#    连通图只需 dfs(0) 一次
```

---

## 3. 连通分量

### LeetCode 547: 省份数量

```
给定邻接矩阵 isConnected, 求连通分量个数

isConnected = [[1,1,0],[1,1,0],[0,0,1]]
  0-1 连通, 2 孤立 → 2 个省份
```

```python
def findCircleNum(isConnected):
    n = len(isConnected)
    visited = [False] * n
    count = 0
    
    def dfs(node):
        visited[node] = True
        for nei in range(n):
            if isConnected[node][nei] == 1 and not visited[nei]:
                dfs(nei)
    
    for i in range(n):
        if not visited[i]:
            dfs(i)
            count += 1               # ⚠️ 每次 DFS 入口 = 一个新分量
    
    return count

# ⚠️ 邻接矩阵: 遍历邻居要 for nei in range(n)
#    邻接表: for nei in graph[node]
#
# ⚠️ count 在 DFS 入口处 +1, 不是在 DFS 内部
```

---

## 4. 有向图环检测 (三色标记)

```
三种状态:
  白(0): 未访问
  灰(1): 正在访问 (在当前 DFS 路径上)
  黑(2): 已完成 (所有后代都访问完)

如果 DFS 中遇到灰色节点 → 存在回边 → 有环!

  0 → 1 → 2 → 0  (回到灰色的0 → 有环)

  DFS 过程:
    0(白→灰) → 1(白→灰) → 2(白→灰) → 0(灰!) → 有环!
```

```python
def hasCycle(graph, n):
    color = [0] * n                  # 0=白, 1=灰, 2=黑
    
    def dfs(node):
        color[node] = 1              # ⚠️ 标记为"访问中"
        for nei in graph[node]:
            if color[nei] == 1:      # ⚠️ 遇到灰色 = 回边 = 环
                return True
            if color[nei] == 0 and dfs(nei):
                return True
        color[node] = 2              # ⚠️ 标记为"已完成"
        return False
    
    return any(color[i] == 0 and dfs(i) for i in range(n))

# ⚠️ 为什么不用 visited?
#    visited 只有两态, 无法区分"在当前路径上"和"之前访问过"
#    三色能区分:
#    灰: 在当前DFS栈上 (遇到=环)
#    黑: 之前DFS完成了 (遇到=跳过, 不是环)
#
# ⚠️ 无向图检测环不用三色:
#    只需 visited + parent (跳过父节点)
```

---

## 5. 无向图环检测

```python
def hasCycleUndirected(graph, n):
    visited = [False] * n
    
    def dfs(node, parent):
        visited[node] = True
        for nei in graph[node]:
            if not visited[nei]:
                if dfs(nei, node):
                    return True
            elif nei != parent:      # ⚠️ 访问过且不是父节点 = 环
                return True
        return False
    
    return any(not visited[i] and dfs(i, -1) for i in range(n))

# ⚠️ nei != parent:
#    无向图 a-b 会有 graph[a]含b, graph[b]含a
#    从 a 到 b 后再看到 a, 不是环, 是来时的路
#    所以要跳过父节点
```

---

## 6. 所有可能的路径

### LeetCode 797

```
DAG 中从 0 到 n-1 的所有路径

DFS + 回溯, DAG 无环所以不需要 visited
```

```python
def allPathsSourceTarget(graph):
    n = len(graph)
    res = []
    
    def dfs(node, path):
        if node == n - 1:
            res.append(path[:])        # ⚠️ 拷贝
            return
        for nei in graph[node]:
            path.append(nei)
            dfs(nei, path)
            path.pop()                 # ⚠️ 回溯
    
    dfs(0, [0])
    return res

# ⚠️ DAG 不需要 visited:
#    没有环, 不会无限循环
#    同一个节点可以在不同路径中被访问
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 省份数量 | 547 | 连通分量 |
| Med | 钥匙和房间 | 841 | 可达性 |
| Med | 所有可能的路径 | 797 | DFS所有路径 |
| Med | 课程表 | 207 | 环检测 |

---

## 本节要点速查

```
✅ DFS: visited数组防环, 外层for处理非连通
✅ 连通分量: DFS入口处count++
✅ 有向图环检测: 三色标记, 遇灰=环
✅ 无向图环检测: visited+parent, nei!=parent时=环
✅ DAG所有路径: 不需visited, DFS+回溯
```
