# 树形DP

> 在树上做 DP，利用子树的答案推出父节点的答案，包括自底向上和换根 DP 两种模式。

---

## 1. 树形 DP 核心模式

```
模式1: 自底向上 (最常见)
  dfs 返回子树的信息
  在回溯时合并子树结果
  
  特征: return 子树答案

模式2: 换根 DP
  第1遍 dfs: 以某点为根, 求子树信息
  第2遍 dfs: 把答案从父节点转移到子节点
  O(n) 求所有节点为根的答案

  特征: 需要知道以每个节点为根的答案

模式3: 选/不选 (类背包)
  每个节点有两个状态: 选 / 不选
  子节点的状态约束父节点的状态

  特征: 独立集, 匹配, 覆盖
```

---

## 2. 打家劫舍 III (自底向上)

### LeetCode 337

```
二叉树, 每个节点有权值
不能同时抢相邻节点 (父子)
求最大抢劫金额

每个节点两个状态:
  rob:  选当前节点 → 子节点必须不选
  skip: 不选当前 → 子节点可选可不选
```

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

def rob(root):
    def dfs(node):
        if not node:
            return 0, 0               # ⚠️ (选当前, 不选当前)
        
        l_rob, l_skip = dfs(node.left)
        r_rob, r_skip = dfs(node.right)
        
        rob = node.val + l_skip + r_skip   # ⚠️ 选当前 → 子必须不选
        skip = max(l_rob, l_skip) + max(r_rob, r_skip)  # ⚠️ 不选 → 子随意
        
        return rob, skip
    
    return max(dfs(root))

# ⚠️ 返回元组 (选, 不选):
#    rob = val + 左不选 + 右不选
#    skip = max(左选,左不选) + max(右选,右不选)
#    最终答案 = max(root选, root不选)
#
# ⚠️ 时间 O(n), 每个节点访问一次
```

---

## 3. 换根 DP

### 理解换根

```
问题: 求以每个节点为根时的某个值
  暴力: 对每个节点做一次 DFS → O(n²)
  换根: 先求一个根, 然后 O(1) 转移 → O(n)

核心思想:
  以 0 为根, 求出答案
  从 0 换到子节点 child:
    child 的子树"变近"了 (距离各减 1)
    其他节点"变远"了 (距离各加 1)

  可视化:
    以 0 为根:          以 1 为根:
        0                    1
       / \                  / \
      1   2                0   3
     / \                    \
    3   4                    2

    换根 0→1 时:
    节点 3,4 从 depth 2 → depth 1 (更近)
    节点 0,2 从 depth 0,1 → depth 1,2 (更远)
```

### LeetCode 834: 所有节点到其他节点的距离之和

```
树有 n 个节点
求 dist[i] = 节点 i 到所有其他节点的距离之和
```

```python
from collections import defaultdict

def sumOfDistancesInTree(n, edges):
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
        graph[v].append(u)
    
    count = [1] * n                    # ⚠️ 子树大小 (含自身)
    dist = [0] * n                     # ⚠️ dist[i] = i到所有其他节点距离和
    
    # 第1遍 DFS: 以 0 为根, 求子树大小和距离和
    def dfs1(node, parent):
        for child in graph[node]:
            if child != parent:
                dfs1(child, node)
                count[node] += count[child]
                dist[node] += dist[child] + count[child]
                # ⚠️ dist[child] = child子树内的距离和
                # + count[child] = child子树每个节点到node多走1步
    
    # 第2遍 DFS: 换根
    def dfs2(node, parent):
        for child in graph[node]:
            if child != parent:
                # ⚠️ 从 node 换到 child:
                dist[child] = dist[node] + (n - count[child]) - count[child]
                # n - count[child] 个节点变远1步: +
                # count[child] 个节点变近1步: -
                # 合并: dist[node] + n - 2*count[child]
                dfs2(child, node)
    
    dfs1(0, -1)
    dfs2(0, -1)
    return dist

# ⚠️ 换根公式推导:
#    dist[child] = dist[node] + (n - count[child]) - count[child]
#                = dist[node] + n - 2 * count[child]
#
#    n - count[child] 个节点在 child 子树外 → 到 child 比到 node 多1步
#    count[child] 个节点在 child 子树内 → 到 child 比到 node 少1步
#
# ⚠️ dfs1 用后序 (先递归子节点, 再更新当前)
#    dfs2 用前序 (先更新当前, 再递归子节点)
```

---

## 4. 最大二叉树 (分治+树形)

### LeetCode 654

```
给定数组, 用最大元素为根, 左右分别递归建树

nums = [3, 2, 1, 6, 0, 5]
最大值 6 (index=3) 为根
左子树: [3,2,1], 右子树: [0,5]
```

```python
def constructMaximumBinaryTree(nums):
    def build(left, right):
        if left > right:
            return None
        
        # 找最大值
        max_idx = left
        for i in range(left + 1, right + 1):
            if nums[i] > nums[max_idx]:
                max_idx = i
        
        node = TreeNode(nums[max_idx])
        node.left = build(left, max_idx - 1)    # ⚠️ 不含 max_idx
        node.right = build(max_idx + 1, right)  # ⚠️ 不含 max_idx
        return node
    
    return build(0, len(nums) - 1)

# ⚠️ 时间: 最坏 O(n²), 平均 O(n log n)
#    类似快排, 如果每次最大值在中间 → O(n log n)
```

---

## 5. 树形 DP 在一般树上

### LeetCode 2246: 子树中的最长路径

```
一般树 (非二叉树)
每个节点有字符
求最长路径, 路径上相邻节点字符不同
```

```python
def longestPath(parent, s):
    n = len(parent)
    children = defaultdict(list)
    for i in range(1, n):
        children[parent[i]].append(i)
    
    ans = 1
    
    def dfs(node):
        nonlocal ans
        max1 = max2 = 0               # 最长和次长子树路径
        
        for child in children[node]:
            child_len = dfs(child)
            if s[child] == s[node]:    # ⚠️ 相同字符, 不能连接
                continue
            if child_len >= max1:
                max2, max1 = max1, child_len
            elif child_len > max2:
                max2 = child_len
        
        ans = max(ans, max1 + max2 + 1)  # ⚠️ +1 是当前节点
        return max1 + 1
    
    dfs(0)
    return ans

# ⚠️ 结构与树的直径完全一样!
#    唯一区别: 相同字符时不连接 (child_len 不计入)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 打家劫舍III | 337 | 选/不选 树形DP |
| Hard | 所有节点距离之和 | 834 | 换根DP模板 |
| Med | 最大二叉树 | 654 | 分治建树 |
| Hard | 子树中的最长路径 | 2246 | 一般树+直径变体 |

---

## 本节要点速查

```
✅ 自底向上: dfs 返回子树信息, 后序合并
✅ 选/不选: 返回(rob, skip), 约束子节点状态
✅ 换根DP: 两遍DFS, 第1遍后序求子树, 第2遍前序转移
✅ 换根公式: dist[child] = dist[node] + n - 2*count[child]
✅ 一般树直径/最长路径: max1+max2+1
✅ d >= max1 更新最长次长 (不是 >)
```
