# 自底向上 DFS（后序遍历思维）

> 自底向上 = 先递归子树拿到结果，再在当前节点做计算。信息从叶子往根"传上去"。是二叉树最核心的递归模式。

---

## 1. 核心思维模式

### 理解与可视化

```
自底向上 = 后序遍历思维 = "先问孩子, 再算自己"

  模板:
    def dfs(node):
        if not node:
            return 基础值               # 空节点返回什么?
        left = dfs(node.left)           # 先拿到左子树的答案
        right = dfs(node.right)         # 再拿到右子树的答案
        ★ return 利用 left, right 计算  # 后序位置: 合成答案

  特点:
    - 利用子问题的答案推导当前问题
    - 自然而然地利用递归返回值
    - 比自顶向下更简洁（不需要全局变量或参数传递）

  ⚠️ 确定三件事:
    1. 函数返回什么? （一般: 深度、节点数、布尔值......）
    2. 空节点返回什么? （一般: 0、None、True......）
    3. 怎么用左右子树的结果算出当前结果?
```

---

## 2. 最大深度（自底向上版）⭐

### LeetCode 104

```python
def maxDepth(root):
    if not root:
        return 0                        # 空节点深度 = 0
    left = maxDepth(root.left)          # 左子树深度
    right = maxDepth(root.right)        # 右子树深度
    return max(left, right) + 1         # 当前深度 = max(左,右) + 1

# ⚠️ 更简洁的一行写法:
# maxDepth = lambda r: 0 if not r else max(maxDepth(r.left), maxDepth(r.right)) + 1
```

```
执行过程（自底向上, 从叶子开始算）:

         1         max(2,1)+1 = 3 ✓
        / \
       2   3       max(1,1)+1 = 2     max(0,0)+1 = 1
      / \
     4   5         max(0,0)+1 = 1     max(0,0)+1 = 1

  叶子(4): left=0, right=0 → return 1
  叶子(5): left=0, right=0 → return 1
  节点(2): left=1, right=1 → return 2
  叶子(3): left=0, right=0 → return 1
  根  (1): left=2, right=1 → return 3
```

---

## 3. 判断平衡二叉树 ⭐

### LeetCode 110

```
平衡二叉树: 任意节点的左右子树高度差 ≤ 1

思路: 自底向上求高度, 发现不平衡就提前返回 -1

         1         |2-1| = 1 ≤ 1 ✓ 平衡
        / \
       2   3       |1-1| = 0 ≤ 1 ✓
      / \
     4   5         高度 1

  不平衡例子:
         1         |3-1| = 2 > 1 ✗
        / \
       2   3
      /
     4
    /
   5
```

```python
def isBalanced(root):
    def height(node):
        if not node:
            return 0
        left = height(node.left)
        if left == -1:                # ⚠️ 左子树不平衡, 直接返回 -1
            return -1
        right = height(node.right)
        if right == -1:               # ⚠️ 右子树不平衡, 直接返回 -1
            return -1
        if abs(left - right) > 1:     # ⚠️ 当前节点不平衡
            return -1
        return max(left, right) + 1   # 正常返回高度
    
    return height(root) != -1

# ⚠️ 用 -1 作为"不平衡"的标记
#   正常高度 ≥ 0, 只要看到 -1 就知道子树已经不平衡了
#   一路往上传 -1, 避免不必要的递归
#
# ⚠️ 效率提升:
#   不用 -1 优化: 每个节点都要算完高度, O(n²)
#   用 -1 优化: 一旦发现不平衡就剪枝, O(n)
```

---

## 4. 翻转二叉树

### LeetCode 226

```python
def invertTree(root):
    if not root:
        return None
    # 先翻转左右子树, 再交换
    root.left, root.right = invertTree(root.right), invertTree(root.left)
    return root

# ⚠️ 也可以先交换再递归（先序）:
def invertTree_v2(root):
    if not root:
        return None
    root.left, root.right = root.right, root.left  # 先交换
    invertTree_v2(root.left)                         # 再递归
    invertTree_v2(root.right)
    return root

# ⚠️ 两种都对! 但不能用中序!
#   中序: 左→交换→右, 但交换后原来的 right 变成了 left
#   再递归 right 实际上递归的是原来的 left → 被翻转了两次!
```

```
可视化:
  原始:        翻转后:
       4          4
      / \        / \
     2   7      7   2
    / \ / \    / \ / \
   1  3 6  9  9  6 3  1
```

---

## 5. 二叉树的直径 ⭐

### LeetCode 543

```
直径 = 树中任意两个节点之间最长路径的边数

关键洞察: 经过某个节点的最长路径 = 该节点的左子树深度 + 右子树深度

  ⚠️ 答案不一定经过根! 可能在某个子树里
  所以需要在递归中维护全局最大值
```

```python
def diameterOfBinaryTree(root):
    ans = 0
    def depth(node):
        nonlocal ans
        if not node:
            return 0
        left = depth(node.left)
        right = depth(node.right)
        ans = max(ans, left + right)  # ⚠️ 经过当前节点的直径 = left+right
        return max(left, right) + 1   # ⚠️ 返回的是深度, 不是直径!
    depth(root)
    return ans

# ⚠️ 函数返回的是"深度"(给父节点用), 但过程中更新的是"直径"(全局答案)
#   这就是后序遍历+全局变量的经典套路
#
# ⚠️ 直径 = 边数, 不是节点数
#   left + right = 经过当前节点的路径边数 ✓
```

```
         1         left=2, right=1 → 径=3, 深度=3
        / \
       2   3       left=1, right=1 → 径=2, 深度=2
      / \
     4   5         深度=1           深度=1

  节点2的直径: 4→2→5 = 2
  节点1的直径: 4→2→1→3 = 3
  全局最大: 3 ✓
```

---

## 6. 最大路径和

### LeetCode 124 (Hard)

```
路径: 任意节点到任意节点, 不必经过根, 不必到叶子
路径和: 路径上所有节点值的总和

和直径类似, 但改成求最大和, 且值可以是负数
```

```python
def maxPathSum(root):
    ans = float('-inf')               # ⚠️ 初始化为负无穷! 节点值可以是负的
    
    def dfs(node):
        nonlocal ans
        if not node:
            return 0
        left = max(0, dfs(node.left))   # ⚠️ max(0, ...) 如果子树贡献为负就不要
        right = max(0, dfs(node.right))
        ans = max(ans, left + right + node.val)  # 经过当前节点的最大路径和
        return max(left, right) + node.val       # 返回给父节点的最大贡献
    
    dfs(root)
    return ans

# ⚠️ max(0, dfs(子树)):
#   子树贡献为负数时, 不如不要这个子树 → 值为 0
#   这就是"剪掉负贡献"的关键
#
# ⚠️ 返回值 vs 更新答案:
#   返回: max(left, right) + node.val → 只能选一边（路径不能分叉）
#   更新: left + right + node.val → 可以两边都选（经过当前节点）
#
# ⚠️ 注意: ans 初始为 -inf, 不能初始为 0
#   因为所有节点值可能都是负数, 答案可能是负数
```

---

## 7. 合并二叉树

### LeetCode 617

```python
def mergeTrees(t1, t2):
    if not t1:
        return t2                     # ⚠️ 一边空就返回另一边
    if not t2:
        return t1
    t1.val += t2.val                  # 值相加
    t1.left = mergeTrees(t1.left, t2.left)
    t1.right = mergeTrees(t1.right, t2.right)
    return t1                         # ⚠️ 修改了 t1, 返回 t1

# ⚠️ 修改了 t1!  如果不想修改原树:
def mergeTrees_new(t1, t2):
    if not t1 and not t2:
        return None
    v1 = t1.val if t1 else 0
    v2 = t2.val if t2 else 0
    node = TreeNode(v1 + v2)
    node.left = mergeTrees_new(t1 and t1.left, t2 and t2.left)
    node.right = mergeTrees_new(t1 and t1.right, t2 and t2.right)
    return node
```

---

## 8. 子树判断

### LeetCode 572

```python
def isSubtree(root, subRoot):
    if not root:
        return False
    if isSameTree(root, subRoot):     # 当前节点为根, 判断是否相同
        return True
    return (isSubtree(root.left, subRoot) or  # 在左子树找
            isSubtree(root.right, subRoot))    # 在右子树找

def isSameTree(p, q):
    if not p and not q:
        return True
    if not p or not q:
        return False
    return (p.val == q.val and
            isSameTree(p.left, q.left) and
            isSameTree(p.right, q.right))

# ⚠️ 时间: O(m*n), m 和 n 是两棵树的节点数
# ⚠️ 对每个节点都可能调用 isSameTree, O(n) × O(m)
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Easy | 二叉树的最大深度 | 104 | 最经典的自底向上 |
| Easy | 翻转二叉树 | 226 | 先序/后序都行, 中序不行 |
| Easy | 平衡二叉树 | 110 | -1 标记剪枝 |
| Easy | 二叉树的直径 | 543 | 返回深度, 更新直径 |
| Easy | 合并二叉树 | 617 | 双树递归 |
| Easy | 另一棵树的子树 | 572 | isSame + 遍历 |
| Hard | 二叉树中的最大路径和 | 124 | max(0,子树) 剪负贡献 |

---

## 本节要点速查

```
✅ 自底向上: 先递归左右, 再用子问题结果算当前答案
✅ 三问: 返回什么? 空节点返回什么? 怎么合成?
✅ 平衡判断: 用 -1 标记不平衡, 一路剪枝
✅ 直径: 函数返回深度, 过程中更新 left+right 全局最大
✅ 最大路径和: max(0,子树) 剪掉负贡献; 返回单边, 更新双边
✅ 翻转: 不能用中序遍历! (交换后左右颠倒)
✅ 全局最大值: 通常用 nonlocal + 在后序位置更新
```
