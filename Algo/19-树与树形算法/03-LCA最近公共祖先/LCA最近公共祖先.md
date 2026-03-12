# LCA最近公共祖先

> 求树上两个节点的最近公共祖先，面试高频考点，包含暴力法和倍增法。

---

## 1. 核心概念

```
LCA (Lowest Common Ancestor):
  给定树上两个节点 u 和 v
  找它们的最近公共祖先

  例:
         0
        / \
       1   2
      / \   \
     3   4   5

  LCA(3, 4) = 1
  LCA(3, 5) = 0
  LCA(1, 4) = 1     ← 自己可以是自己的祖先

方法:
  1. 暴力: 记录路径取交集 O(n)
  2. 倍增: 预处理 O(n log n), 查询 O(log n)
  3. Tarjan 离线: O(n + q) (了解即可)
```

---

## 2. LeetCode 236: 二叉树的最近公共祖先

```
给定二叉树的根和两个节点 p, q
返回它们的 LCA

递归思路:
  从根往下找 p 和 q
  如果当前节点是 p 或 q → 返回当前节点
  左右子树各递归
  如果 p, q 分别在左右子树 → 当前节点就是 LCA
  如果都在一边 → 那边的结果就是 LCA
```

```python
def lowestCommonAncestor(root, p, q):
    if root is None or root == p or root == q:
        return root                    # ⚠️ 找到 p/q 或空节点
    
    left = lowestCommonAncestor(root.left, p, q)
    right = lowestCommonAncestor(root.right, p, q)
    
    if left and right:                 # ⚠️ p, q 分别在左右 → 当前是LCA
        return root
    
    return left if left else right     # ⚠️ 都在一边

# ⚠️ 递归过程:
#    叶子/空: 返回 None
#    遇到 p 或 q: 返回自身
#    左右都非空: p,q 分布两侧 → 当前节点是 LCA
#    只有一边非空: 返回那一边 (p,q 都在那边)
#
# ⚠️ 时间 O(n), 空间 O(h) h=树高
#
# ⚠️ 这个方法假设 p 和 q 都存在于树中!
```

---

## 3. 一般树的 LCA (DFS + 深度法)

```python
from collections import defaultdict

def lca_naive(n, edges, root, queries):
    """
    暴力法: 对齐深度, 然后一起往上走
    预处理 O(n), 每次查询 O(n)
    """
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    
    parent = [-1] * n
    depth = [0] * n
    
    # BFS 求 parent 和 depth
    from collections import deque
    queue = deque([root])
    visited = [False] * n
    visited[root] = True
    
    while queue:
        node = queue.popleft()
        for nei in graph[node]:
            if not visited[nei]:
                visited[nei] = True
                parent[nei] = node
                depth[nei] = depth[node] + 1
                queue.append(nei)
    
    # 查询 LCA(u, v)
    def query(u, v):
        # 1. 对齐深度
        while depth[u] > depth[v]:     # ⚠️ u 更深, u 往上走
            u = parent[u]
        while depth[v] > depth[u]:     # ⚠️ v 更深, v 往上走
            v = parent[v]
        
        # 2. 一起往上走
        while u != v:                  # ⚠️ 直到相遇
            u = parent[u]
            v = parent[v]
        
        return u
    
    return [query(u, v) for u, v in queries]

# ⚠️ 简单但每次查询 O(n)
#    如果查询很多 → 用倍增法
```

---

## 4. 倍增法 LCA

```
倍增: 预处理每个节点的 2^k 级祖先
  up[v][k] = v 的 2^k 级祖先

  up[v][0] = parent[v]               (1级祖先)
  up[v][1] = up[up[v][0]][0]         (2级祖先)
  up[v][2] = up[up[v][1]][1]         (4级祖先)
  ...
  up[v][k] = up[up[v][k-1]][k-1]    (2^k级祖先)

  查询 LCA(u, v):
  1. 对齐深度: 用倍增跳 (二进制分解)
  2. 一起跳: 从大到小尝试 2^k 步
     如果跳后相同 → 不跳 (跳过了)
     如果跳后不同 → 跳 (还没到)
  3. 最后 u 和 v 的父节点就是 LCA
```

```python
import math
from collections import defaultdict, deque

class LCA:
    def __init__(self, n, edges, root=0):
        self.n = n
        self.LOG = max(1, int(math.log2(n)) + 1)
        
        graph = defaultdict(list)
        for u, v in edges:
            graph[u].append(v)
            graph[v].append(u)
        
        self.depth = [0] * n
        self.up = [[-1] * self.LOG for _ in range(n)]
        
        # BFS 求 depth 和 up[v][0]
        visited = [False] * n
        queue = deque([root])
        visited[root] = True
        
        while queue:
            node = queue.popleft()
            for nei in graph[node]:
                if not visited[nei]:
                    visited[nei] = True
                    self.depth[nei] = self.depth[node] + 1
                    self.up[nei][0] = node      # ⚠️ 1级祖先 = 父节点
                    queue.append(nei)
        
        # 预处理倍增表
        for k in range(1, self.LOG):
            for v in range(n):
                if self.up[v][k-1] != -1:
                    self.up[v][k] = self.up[self.up[v][k-1]][k-1]
                    # ⚠️ 2^k 级祖先 = 2^(k-1) 级祖先的 2^(k-1) 级祖先
    
    def query(self, u, v):
        # 1. 保证 u 更深
        if self.depth[u] < self.depth[v]:
            u, v = v, u
        
        # 2. u 往上跳到和 v 同深度
        diff = self.depth[u] - self.depth[v]
        for k in range(self.LOG):
            if (diff >> k) & 1:        # ⚠️ 二进制分解
                u = self.up[u][k]
        
        # 3. 如果已相同, 就是 LCA
        if u == v:
            return u
        
        # 4. 一起往上跳 (从大到小)
        for k in range(self.LOG - 1, -1, -1):
            if self.up[u][k] != self.up[v][k]:   # ⚠️ 不同才跳
                u = self.up[u][k]
                v = self.up[v][k]
        
        return self.up[u][0]           # ⚠️ 再跳一步就是 LCA

# ⚠️ 预处理: O(n log n)
#    查询: O(log n)
#    适合大量查询
#
# ⚠️ 倍增跳的两个阶段:
#    阶段2: 对齐深度 → 二进制分解深度差
#    阶段4: 一起跳 → 从大到小, "不同才跳"
#           为什么"不同才跳"? 
#           因为"相同"可能跳过了LCA
#           最后 up[u][0] 就是 LCA
```

---

## 5. LCA 应用: 树上两点距离

```
dist(u, v) = depth[u] + depth[v] - 2 * depth[LCA(u,v)]

  可视化:
     LCA (depth=d)
     / \
    u   v
   (d+a) (d+b)

  u→LCA: a 步
  LCA→v: b 步
  dist = a + b = (d+a) + (d+b) - 2d
```

```python
# 带 LCA 的树上距离查询
lca = LCA(n, edges, root=0)

def tree_dist(u, v):
    ancestor = lca.query(u, v)
    return lca.depth[u] + lca.depth[v] - 2 * lca.depth[ancestor]
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 二叉树的最近公共祖先 | 236 | 递归法 |
| Med | BST的最近公共祖先 | 235 | 利用BST性质 |
| Hard | LCA查询 | 1483 | 倍增法模板 |
| Med | 树上两点距离 | - | LCA+深度 |

---

## 本节要点速查

```
✅ 二叉树LCA: 递归, 左右都非空→当前是LCA
✅ 暴力LCA: 对齐深度+一起往上走, 每次O(n)
✅ 倍增LCA: up[v][k]=2^k级祖先, 预处理O(nlogn), 查询O(logn)
✅ up[v][k] = up[up[v][k-1]][k-1]
✅ 对齐深度用二进制分解, 一起跳时"不同才跳"
✅ 树上距离 = depth[u]+depth[v]-2*depth[LCA]
```
