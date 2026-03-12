# DFS拓扑排序

> 除了Kahn算法（BFS），拓扑排序也可以用DFS实现：后序遍历的逆序即为拓扑排序。

---

## 1. 核心思想

```
DFS 拓扑排序:
  对每个节点做 DFS, 回溯时(后序)加入结果
  最后反转结果

直觉:
  先处理完所有依赖(子节点), 再处理自己
  = 后序遍历
  反转后 = 自己在依赖之前 = 拓扑排序

  0 → 1 → 3
  0 → 2 → 3

  DFS(0):
    DFS(1):
      DFS(3): 后序加入 → [3]
    后序加入 → [3, 1]
    DFS(2):
      DFS(3): 已访问跳过
    后序加入 → [3, 1, 2]
  后序加入 → [3, 1, 2, 0]

  反转 → [0, 2, 1, 3] (一种合法拓扑排序)
```

---

## 2. 代码模板

```python
from collections import defaultdict

def topo_sort_dfs(n, edges):
    graph = defaultdict(list)
    for u, v in edges:
        graph[u].append(v)
    
    color = [0] * n           # ⚠️ 0=白, 1=灰, 2=黑
    order = []
    has_cycle = False
    
    def dfs(node):
        nonlocal has_cycle
        color[node] = 1       # ⚠️ 进入: 标灰
        
        for nei in graph[node]:
            if color[nei] == 1:
                has_cycle = True    # ⚠️ 遇灰 = 有环
                return
            if color[nei] == 0:
                dfs(nei)
                if has_cycle:
                    return
        
        color[node] = 2       # ⚠️ 离开: 标黑
        order.append(node)    # ⚠️ 后序: 回溯时加入
    
    for i in range(n):
        if color[i] == 0:
            dfs(i)
            if has_cycle:
                return []
    
    order.reverse()           # ⚠️ 反转!
    return order

# ⚠️ 后序加入 + 反转 = 拓扑排序
#    不反转的话是"反拓扑排序" (所有依赖在前面)
#
# ⚠️ 三色标记同时检测环:
#    灰 = 在当前DFS路径上, 再次遇到 = 回边 = 环
```

---

## 3. Kahn vs DFS 拓扑排序

```
┌──────────────┬──────────────────┬──────────────────┐
│              │ Kahn (BFS)       │ DFS              │
├──────────────┼──────────────────┼──────────────────┤
│ 基本操作     │ 入度 + 队列      │ 后序 + 反转      │
│ 环检测       │ len(order) < n   │ 三色灰色检测     │
│ 字典序最小   │ 用最小堆代替队列 │ 不方便           │
│ 代码复杂度   │ 简单直观         │ 需要递归         │
│ 常用场景     │ 工程首选         │ 学术/理论        │
│ 拓扑排序     │ 正向             │ 后序反转         │
└──────────────┴──────────────────┴──────────────────┘

⚠️ 面试推荐用 Kahn 算法:
   更直观, 更容易调试, 扩展性更好
   DFS 版本作为补充理解
```

---

## 4. 实际应用

```python
# 用 DFS 拓扑排序解决课程安排
def findOrder(numCourses, prerequisites):
    graph = defaultdict(list)
    for course, pre in prerequisites:
        graph[pre].append(course)
    
    color = [0] * numCourses
    order = []
    
    def dfs(node):
        color[node] = 1
        for nei in graph[node]:
            if color[nei] == 1:
                return False           # ⚠️ 有环
            if color[nei] == 0 and not dfs(nei):
                return False
        color[node] = 2
        order.append(node)
        return True
    
    for i in range(numCourses):
        if color[i] == 0 and not dfs(i):
            return []
    
    return order[::-1]                 # ⚠️ 反转

# ⚠️ 和 Kahn 的结果可能不同 (拓扑排序不唯一)
#    但都是合法的拓扑排序
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 课程表 II | 210 | DFS拓扑排序 |
| Med | 课程表 | 207 | 环检测 |
| Hard | 外星文字典 | 269 | 建图+拓扑排序 |

---

## 本节要点速查

```
✅ DFS拓扑: 后序append + 最后reverse
✅ 三色标记: 白(未访问)灰(路径上)黑(完成)
✅ 遇灰=环, 遇黑=跳过, 遇白=继续DFS
✅ 面试推荐Kahn(BFS), DFS作备用
```
