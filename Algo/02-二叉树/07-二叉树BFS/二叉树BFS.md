# 二叉树 BFS ⭐

> BFS 使用队列逐层遍历二叉树，是层序遍历的核心方法。掌握分层模板后，各种层序变体题目都能迎刃而解。

---

## 1. 基础层序遍历

### LeetCode 102

### 理解与可视化

```
BFS = 广度优先 = 用队列逐层处理

         1
        / \
       2   3
      / \   \
     4   5   6

  队列变化:
    初始:   queue = [1]
    第1层:  弹1, 加2,3    → queue = [2, 3]       → 结果: [[1]]
    第2层:  弹2加4,5;弹3加6 → queue = [4, 5, 6]   → 结果: [[1],[2,3]]
    第3层:  弹4,5,6        → queue = []            → 结果: [[1],[2,3],[4,5,6]]

  ⚠️ 分层的关键: for _ in range(len(queue))
     在处理当前层之前, 先记录当前层有多少节点
     然后恰好处理这么多, 新加入的属于下一层
```

### 代码模板

```python
from collections import deque

def levelOrder(root):
    if not root:
        return []
    queue = deque([root])
    res = []
    while queue:
        level = []
        for _ in range(len(queue)):   # ⚠️ 先算 len, 处理整层
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        res.append(level)
    return res

# ⚠️ range(len(queue)): 
#   len(queue) 在 for 开始前就计算好了
#   循环中 queue 会变长（加入下一层），但不影响 range
#
# ⚠️ 必须用 deque, 不要用 list
#   list.pop(0) 是 O(n)
#   deque.popleft() 是 O(1)
```

---

## 2. 层序变体题目

### 2.1 自底向上层序 (LC 107)

```python
def levelOrderBottom(root):
    result = levelOrder(root)         # 先正常层序
    return result[::-1]               # ⚠️ 直接反转结果

# ⚠️ 或者用 deque 的 appendleft:
from collections import deque as Deque
def levelOrderBottom_v2(root):
    if not root:
        return []
    queue = deque([root])
    res = Deque()                     # 用 deque 存结果
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        res.appendleft(level)         # ⚠️ 每层加到最前面
    return list(res)
```

### 2.2 锯齿形层序 (LC 103)

```python
def zigzagLevelOrder(root):
    if not root:
        return []
    queue = deque([root])
    res = []
    left_to_right = True
    while queue:
        level = []
        for _ in range(len(queue)):
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        if not left_to_right:
            level.reverse()           # ⚠️ 偶数层反转
        res.append(level)
        left_to_right = not left_to_right
    return res

# ⚠️ 不要改变入队出队顺序!
#   只要在添加到结果时 reverse 就行
#   改队列顺序容易出错
```

### 2.3 右视图 (LC 199)

```python
def rightSideView(root):
    if not root:
        return []
    queue = deque([root])
    res = []
    while queue:
        size = len(queue)
        for i in range(size):
            node = queue.popleft()
            if i == size - 1:         # ⚠️ 每层最后一个就是右视图
                res.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return res

# ⚠️ 也可以用 DFS: 先右后左, 每层第一个被访问的就是右视图
def rightSideView_dfs(root):
    res = []
    def dfs(node, depth):
        if not node:
            return
        if depth == len(res):         # 第一次到达这一层
            res.append(node.val)
        dfs(node.right, depth + 1)    # ⚠️ 先右! 保证右边先被访问
        dfs(node.left, depth + 1)
    dfs(root, 0)
    return res
```

### 2.4 每行最大值 (LC 515)

```python
def largestValues(root):
    if not root:
        return []
    queue = deque([root])
    res = []
    while queue:
        max_val = float('-inf')
        for _ in range(len(queue)):
            node = queue.popleft()
            max_val = max(max_val, node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        res.append(max_val)
    return res
```

---

## 3. 最大/最小深度（BFS 版）

```python
# ━━━━ 最大深度 BFS ━━━━
def maxDepth_bfs(root):
    if not root:
        return 0
    queue = deque([root])
    depth = 0
    while queue:
        depth += 1                    # ⚠️ 每处理一层, 深度+1
        for _ in range(len(queue)):
            node = queue.popleft()
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return depth

# ━━━━ 最小深度 BFS (找第一个叶子) ━━━━
def minDepth_bfs(root):
    if not root:
        return 0
    queue = deque([root])
    depth = 0
    while queue:
        depth += 1
        for _ in range(len(queue)):
            node = queue.popleft()
            if not node.left and not node.right:
                return depth          # ⚠️ 找到第一个叶子就返回!
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return depth

# ⚠️ BFS 求最小深度比 DFS 更好!
#   BFS 遇到第一个叶子就可以返回, 不用遍历全树
#   DFS 必须遍历整棵树才能比较
```

---

## 4. 二叉树的完全性检验

### LeetCode 958

```python
def isCompleteTree(root):
    if not root:
        return True
    queue = deque([root])
    found_null = False
    while queue:
        node = queue.popleft()
        if not node:
            found_null = True         # ⚠️ 遇到空节点, 标记
        else:
            if found_null:            # ⚠️ 空节点之后又遇到非空 → 不完全
                return False
            queue.append(node.left)   # ⚠️ 即使是 None 也要加入队列!
            queue.append(node.right)
    return True

# ⚠️ 完全二叉树: 层序中不应该在空节点后面出现非空节点
#   所以把 None 也加入队列, 遇到 None 后标记
#   之后再遇到非空 → 不完全
```

---

## 5. 二叉树的序列化（BFS 版）

### LeetCode 297

```python
def serialize(root):
    if not root:
        return "[]"
    queue = deque([root])
    res = []
    while queue:
        node = queue.popleft()
        if node:
            res.append(str(node.val))
            queue.append(node.left)
            queue.append(node.right)
        else:
            res.append("null")
    return "[" + ",".join(res) + "]"

def deserialize(data):
    if data == "[]":
        return None
    vals = data[1:-1].split(",")
    root = TreeNode(int(vals[0]))
    queue = deque([root])
    i = 1
    while queue:
        node = queue.popleft()
        if vals[i] != "null":
            node.left = TreeNode(int(vals[i]))
            queue.append(node.left)
        i += 1
        if vals[i] != "null":
            node.right = TreeNode(int(vals[i]))
            queue.append(node.right)
        i += 1
    return root
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Medium | 二叉树的层序遍历 | 102 | BFS 基础模板 |
| Medium | 层序遍历 II | 107 | 结果反转 |
| Medium | 锯齿形层序遍历 | 103 | 奇偶层处理 |
| Medium | 二叉树的右视图 | 199 | 每层最后一个 |
| Medium | 每行的最大值 | 515 | 层内统计 |
| Easy | 二叉树的最小深度 | 111 | 找第一个叶子 |
| Medium | 完全二叉树检验 | 958 | null 后无非空 |
| Hard | 序列化与反序列化 | 297 | BFS 序列化 |

---

## 本节要点速查

```
✅ BFS 分层模板: for _ in range(len(queue)) 是核心
✅ 用 deque 不用 list (popleft O(1) vs pop(0) O(n))
✅ 变体只改层内处理: 反转/取最后/取最大/锯齿
✅ 最小深度: BFS 遇到第一个叶子就返回, 比 DFS 更高效
✅ 完全二叉树: null 加入队列, null 后不能有非空
✅ 右视图: 每层最后一个 (BFS) 或先右后左的 DFS
```
