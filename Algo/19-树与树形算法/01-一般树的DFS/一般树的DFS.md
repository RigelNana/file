# 一般树的DFS

> 非二叉树（一般树）使用邻接表表示，通过 parent 避免走回头路，是树上算法的基础。

---

## 1. 一般树 vs 二叉树

```
二叉树: 每个节点最多 2 个子节点, 有 left/right
一般树: 每个节点任意多个子节点, 用邻接表表示

区别:
  二叉树: 直接 node.left, node.right, 天然有方向
  一般树: graph[u] 包含所有邻居 (含父节点!)
         需要 parent 参数避免往回走

  表示方式:
    edges = [(0,1), (0,2), (1,3), (1,4), (2,5)]

         0
        / \
       1   2
      / \   \
     3   4   5

    邻接表:
      0 → [1, 2]
      1 → [0, 3, 4]     ← 包含父节点 0
      2 → [0, 5]
      3 → [1]
      4 → [1]
      5 → [2]
```

---

## 2. DFS 模板

```python
from collections import defaultdict

def build_tree(n, edges):
    """建邻接表"""
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)             # ⚠️ 无向边
    return graph

# 模板1: 基础 DFS (parent 去重)
def tree_dfs(graph, root):
    def dfs(node, parent):
        # 前序处理 (进入节点时)
        for child in graph[node]:
            if child != parent:        # ⚠️ 跳过父节点
                dfs(child, node)       # ⚠️ 当前节点变成子节点的 parent
        # 后序处理 (离开节点时)
    
    dfs(root, -1)                      # ⚠️ 根节点没有父, 用 -1

# ⚠️ 为什么不用 visited?
#    树无环, 只需避免走回父节点
#    parent 比 visited 更高效 (不需要额外集合)
#    如果图可能有环 → 才需要 visited
```

### 模板2: 返回值 DFS

```python
def tree_dfs_return(graph, root):
    def dfs(node, parent):
        result = 0                     # 当前节点的结果
        for child in graph[node]:
            if child != parent:
                child_result = dfs(child, node)
                result = ...           # 合并子树结果
        return result
    
    return dfs(root, -1)
```

### 模板3: 计算子树大小

```python
def subtree_size(graph, root, n):
    size = [1] * n                     # ⚠️ 每个节点初始大小 1 (自己)
    
    def dfs(node, parent):
        for child in graph[node]:
            if child != parent:
                dfs(child, node)
                size[node] += size[child]  # ⚠️ 后序: 累加子树大小
    
    dfs(root, -1)
    return size
```

---

## 3. 树的直径

```
树的直径 = 树上最长的简单路径
两种方法:
  1. 两次 BFS/DFS
  2. 一次 DFS (后序)

方法1: 两次 BFS
  第1次: 从任意点出发, 找最远点 A
  第2次: 从 A 出发, 找最远点 B
  A→B 的距离就是直径

  正确性: 从任意点出发的最远点一定是直径端点

方法2: 一次 DFS
  对每个节点, 维护最长和次长子树深度
  直径 = max(最长 + 次长) (枚举所有拐点)
```

```python
from collections import deque, defaultdict

# 方法1: 两次 BFS
def tree_diameter_bfs(n, edges):
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    
    def bfs(start):
        dist = [-1] * n
        dist[start] = 0
        queue = deque([start])
        farthest = start
        while queue:
            node = queue.popleft()
            for nei in graph[node]:
                if dist[nei] == -1:
                    dist[nei] = dist[node] + 1
                    queue.append(nei)
                    if dist[nei] > dist[farthest]:
                        farthest = nei
        return farthest, dist[farthest]
    
    far1, _ = bfs(0)                   # 第1次: 找最远点
    far2, diameter = bfs(far1)         # 第2次: 从最远点出发
    return diameter

# ⚠️ 两次 BFS 更直观, 代码简单

# 方法2: 一次 DFS (后序)
def tree_diameter_dfs(n, edges):
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    
    ans = 0
    
    def dfs(node, parent):
        nonlocal ans
        max1 = max2 = 0               # ⚠️ 最长和次长子树深度
        for child in graph[node]:
            if child == parent:
                continue
            d = dfs(child, node) + 1   # ⚠️ +1 是当前边
            if d >= max1:
                max2, max1 = max1, d   # ⚠️ 更新最长和次长
            elif d > max2:
                max2 = d
        ans = max(ans, max1 + max2)    # ⚠️ 经过当前节点的最长路径
        return max1                    # ⚠️ 返回最深子树深度
    
    dfs(0, -1)
    return ans

# ⚠️ max1 + max2 = 经过当前节点的最长路径
#    最长路径可能不经过根, 所以用全局 ans 记录
#
# ⚠️ d >= max1 (不是 >):
#    相等时也要更新, 否则 max2 没有正确维护
```

---

## 4. 树的重心

```
树的重心: 删除该节点后, 最大子树最小的节点

  性质: 以重心为根, 所有子树大小 ≤ n/2
  应用: 点分治的基础

         0
        / \
       1   2
      / \   \
     3   4   5

  删除 0: 子树 [1,3,4] 大小3, [2,5] 大小2 → max=3
  删除 1: 子树 [3] 大小1, [4] 大小1, [0,2,5] 大小3 → max=3
  删除 2: 子树 [5] 大小1, [0,1,3,4] 大小4 → max=4
  重心 = 0 或 1 (都是 max=3)
```

```python
def find_centroid(n, edges):
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    
    size = [1] * n
    min_max_sub = float('inf')
    centroid = -1
    
    def dfs(node, parent):
        nonlocal min_max_sub, centroid
        max_sub = 0                    # ⚠️ 最大子树大小
        for child in graph[node]:
            if child == parent:
                continue
            dfs(child, node)
            size[node] += size[child]
            max_sub = max(max_sub, size[child])
        
        # ⚠️ "向上"的部分也算一棵子树
        max_sub = max(max_sub, n - size[node])
        
        if max_sub < min_max_sub:
            min_max_sub = max_sub
            centroid = node
    
    dfs(0, -1)
    return centroid

# ⚠️ n - size[node]:
#    删除 node 后, 除了向下的子树
#    还有"向上"的部分 (包含 node 的父节点和其他兄弟子树)
#    大小 = n - size[node]
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 树的直径 | 1245 | 两次BFS/一次DFS |
| Med | 找到最终安全状态 | 802 | 图上DFS |
| Med | 统计子树中的节点数 | - | 子树大小 |
| Med | 树的重心 | - | 点分治基础 |

---

## 本节要点速查

```
✅ 一般树: 邻接表 + parent 去重
✅ dfs(node, parent), root 的 parent = -1
✅ 子树大小: 后序累加 size[node] += size[child]
✅ 直径: 两次BFS 或 一次DFS(max1+max2)
✅ 重心: 删除后最大子树最小, 含"向上"部分 n-size[node]
✅ d >= max1 更新最长/次长, 不是 >
```
