# 自顶向下 DFS（先序遍历思维）

> 自顶向下 DFS = 把信息从根"带下去"给子节点。先处理当前节点，再递归孩子。参数携带上下文信息。

---

## 1. 核心思维模式

### 理解与可视化

```
自顶向下 = 先序遍历思维 = "带着信息往下走"

  模板:
    def dfs(node, 上层传下来的参数):
        if not node:
            return
        ★ 在这里处理当前节点（用参数做决策或更新答案）
        dfs(node.left, 更新后的参数)
        dfs(node.right, 更新后的参数)

  特点:
    - 参数从父节点传到子节点
    - 走到叶子时可能更新全局答案
    - 适合"从根到叶子的路径"类问题

  典型场景:
    ┌────────────────────────────────────────┐
    │ 求最大深度（带 depth 参数向下传）       │
    │ 路径总和（带目标值向下传）              │
    │ 记录所有路径（带当前路径向下传）         │
    │ 判断对称/相同（带两个节点向下传）        │
    │ 求每层最左/最右（带层号向下传）          │
    └────────────────────────────────────────┘
```

---

## 2. 最大深度（自顶向下版）

### LeetCode 104

```python
def maxDepth(root):
    ans = 0
    def dfs(node, depth):
        nonlocal ans
        if not node:
            return
        ans = max(ans, depth)         # ⚠️ 到达每个节点时更新最大深度
        dfs(node.left, depth + 1)     # 左子树深度 +1
        dfs(node.right, depth + 1)    # 右子树深度 +1
    dfs(root, 1)                      # ⚠️ 根节点深度从 1 开始
    return ans

# ⚠️ 对比自底向上版:
#   自顶向下: 带 depth 参数, 用 nonlocal ans 更新全局
#   自底向上: return max(left, right) + 1（更简洁）
#   这道题自底向上更简单, 但自顶向下思路更通用
```

```
执行过程:
         1         dfs(1, depth=1)    ans=1
        / \
       2   3       dfs(2, depth=2)    ans=2
      / \          dfs(3, depth=2)    ans=2
     4   5         dfs(4, depth=3)    ans=3
                   dfs(5, depth=3)    ans=3
  最终 ans=3 ✓
```

---

## 3. 路径总和

### LeetCode 112 (判断是否存在)

```python
def hasPathSum(root, targetSum):
    if not root:
        return False
    if not root.left and not root.right:  # ⚠️ 叶子节点
        return root.val == targetSum      # ⚠️ 判断值是否刚好等于剩余目标
    return (hasPathSum(root.left, targetSum - root.val) or  # ⚠️ 目标减去当前值
            hasPathSum(root.right, targetSum - root.val))

# ⚠️ 必须到叶子节点才判断! 不是到 None 判断!
#   树: [1,2] target=1
#   如果到 None 判断: dfs(None, 0) → True? ❌ 1→左→None, 路径=1, 但不是叶子
#   正确: dfs(2, -1) → 叶子, val≠target → False; 2没有左右 → dfs右=None → False
#   结果: False ✓
```

### LeetCode 113 (找出所有路径)

```python
def pathSum(root, targetSum):
    res = []
    def dfs(node, target, path):
        if not node:
            return
        path.append(node.val)
        
        if not node.left and not node.right and node.val == target:
            res.append(path[:])       # ⚠️ path[:] 拷贝! 不能直接 append(path)
        
        dfs(node.left, target - node.val, path)
        dfs(node.right, target - node.val, path)
        path.pop()                    # ⚠️ 回溯! 离开时恢复 path
    
    dfs(root, targetSum, [])
    return res

# ⚠️ path[:] 是浅拷贝:
#   如果直接 res.append(path), 所有结果会指向同一个 path 对象
#   后续 path 变了, res 里的也会变
#
# ⚠️ path.pop() 回溯:
#   进入节点时 append, 离开节点时 pop
#   保证 path 始终记录"当前从根到当前节点的路径"
```

```
可视化回溯过程:
         5
        / \
       4   8
      /   / \
     11  13  4
    / \     / \
   7   2   5   1
target=22

  dfs(5, 22, [])
    path=[5]
    dfs(4, 17, [5])
      path=[5,4]
      dfs(11, 13, [5,4])
        path=[5,4,11]
        dfs(7, 2, [5,4,11])
          path=[5,4,11,7]
          叶子, 7≠2 → 不记录
          pop → path=[5,4,11]      ← 回溯!
        dfs(2, 2, [5,4,11])
          path=[5,4,11,2]
          叶子, 2==2 → res.append([5,4,11,2]) ✓
          pop → path=[5,4,11]
        pop → path=[5,4]
      pop → path=[5]
    ...
```

---

## 4. 所有路径

### LeetCode 257

```python
def binaryTreePaths(root):
    res = []
    def dfs(node, path):
        if not node:
            return
        path.append(str(node.val))
        if not node.left and not node.right:
            res.append("->".join(path))  # ⚠️ 到叶子时记录
        else:
            dfs(node.left, path)
            dfs(node.right, path)
        path.pop()                        # ⚠️ 回溯
    dfs(root, [])
    return res

# ⚠️ 也可以用字符串传递（不需要回溯, 但效率更低）:
def binaryTreePaths_v2(root):
    res = []
    def dfs(node, path_str):
        if not node:
            return
        path_str += str(node.val)
        if not node.left and not node.right:
            res.append(path_str)
        else:
            dfs(node.left, path_str + "->")   # 字符串是不可变的, 自动"回溯"
            dfs(node.right, path_str + "->")
    dfs(root, "")
    return res

# ⚠️ 字符串版不需要手动回溯, 因为字符串不可变
#   每次 path_str + "->" 创建新字符串, 不影响原字符串
#   但创建新字符串有开销, 大数据量时列表版更快
```

---

## 5. 对称二叉树

### LeetCode 101

```python
def isSymmetric(root):
    def dfs(left, right):
        if not left and not right:    # 两边都空 → 对称
            return True
        if not left or not right:     # 只有一边空 → 不对称
            return False
        return (left.val == right.val and          # ⚠️ 值相等
                dfs(left.left, right.right) and    # ⚠️ 外侧对称
                dfs(left.right, right.left))       # ⚠️ 内侧对称
    return dfs(root.left, root.right) if root else True

# ⚠️ left.left ↔ right.right (外侧)
#    left.right ↔ right.left (内侧)
#    不是 left.left ↔ right.left!
```

```
可视化:
         1
        / \
       2   2       ← 值相等 ✓
      / \ / \
     3  4 4  3     ← 外侧3=3✓, 内侧4=4✓

  dfs(左2, 右2): 
    val相等 ✓
    dfs(左3, 右3): 外侧 ✓
    dfs(左4, 右4): 内侧 ✓
  结果: True ✓
```

---

## 6. 相同的树

### LeetCode 100

```python
def isSameTree(p, q):
    if not p and not q:
        return True
    if not p or not q:
        return False
    return (p.val == q.val and
            isSameTree(p.left, q.left) and
            isSameTree(p.right, q.right))

# ⚠️ 和对称二叉树的区别:
#   相同: 左左↔右左, 左右↔右右 (同侧比较)
#   对称: 左左↔右右, 左右↔右左 (交叉比较)
```

---

## 7. 自顶向下的通用模式

```python
# ━━━━ 带层号的 DFS（很多 BFS 题也可以这样做）━━━━
def dfs_with_level(root):
    res = []
    def dfs(node, level):
        if not node:
            return
        if level == len(res):         # ⚠️ 第一次到达这一层
            res.append([])
        res[level].append(node.val)   # 把当前节点加入对应层
        dfs(node.left, level + 1)
        dfs(node.right, level + 1)
    dfs(root, 0)
    return res

# ⚠️ 这其实就是用 DFS 实现层序遍历!
#   level 从 0 开始
#   level == len(res) 说明这是该层第一个节点, 新建列表
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Easy | 二叉树的最大深度 | 104 | 带深度参数 |
| Easy | 路径总和 | 112 | 目标值递减 |
| Medium | 路径总和 II | 113 | 路径记录+回溯 |
| Easy | 二叉树的所有路径 | 257 | 字符串/列表路径 |
| Easy | 对称二叉树 | 101 | 双节点递归 |
| Easy | 相同的树 | 100 | 双树比较 |
| Medium | 左叶子之和 | 404 | 带父信息 |

---

## 本节要点速查

```
✅ 自顶向下 = 先序位置处理 = 把信息带下去
✅ 模式: dfs(node, 参数) → 处理 → dfs(左, 更新参数) + dfs(右, 更新参数)
✅ 路径总和: target 一路减, 到叶子时判断 == 0 (或 == node.val)
✅ 记录路径: path.append → 递归 → path.pop (回溯)
✅ 拷贝路径: res.append(path[:]), 不能 res.append(path)
✅ 对称 vs 相同: 对称交叉比较, 相同同侧比较
✅ 字符串参数不需要回溯(不可变), 列表参数需要回溯(可变)
```
