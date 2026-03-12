# 拓扑排序 (Kahn算法)

> 拓扑排序将DAG的节点排成线性序列，使得每条边 u→v 中 u 排在 v 前面。Kahn算法基于BFS，是最常用的实现。

---

## 1. 核心思想

```
Kahn 算法 (BFS 拓扑排序):

  1. 计算所有节点的入度
  2. 入度为0的节点入队 (没有前置依赖)
  3. 出队节点加入结果, 将其邻居入度-1
  4. 邻居入度变0 → 入队
  5. 重复直到队空

  如果结果长度 < n → 有环!

可视化:
  课程依赖:
    0 → 1 → 3
    0 → 2 → 3

  入度: {0:0, 1:1, 2:1, 3:2}

  Step 1: 入度0 → 队列[0]
  Step 2: 弹0, 1入度→0, 2入度→0 → 队列[1,2], 结果[0]
  Step 3: 弹1, 3入度→1 → 队列[2], 结果[0,1]
  Step 4: 弹2, 3入度→0 → 队列[3], 结果[0,1,2]
  Step 5: 弹3 → 队列[], 结果[0,1,2,3]

  len(result)=4=n → 无环, 拓扑排序成功
```

---

## 2. 拓扑排序模板

```python
from collections import deque, defaultdict

def topo_sort(n, edges):
    graph = defaultdict(list)
    in_degree = [0] * n
    
    for u, v in edges:
        graph[u].append(v)
        in_degree[v] += 1              # ⚠️ 统计入度
    
    # 入度为0的节点入队
    queue = deque(i for i in range(n) if in_degree[i] == 0)
    order = []
    
    while queue:
        node = queue.popleft()
        order.append(node)
        for nei in graph[node]:
            in_degree[nei] -= 1        # ⚠️ 邻居入度-1
            if in_degree[nei] == 0:    # ⚠️ 入度变0 → 所有前置完成
                queue.append(nei)
    
    return order if len(order) == n else []  # ⚠️ 空=有环

# ⚠️ len(order) < n 说明有环:
#    环中的节点入度永远不会变0, 无法入队
#
# ⚠️ 拓扑排序不唯一:
#    入度为0的节点可能有多个, 出队顺序影响结果
#    如果用最小堆代替队列 → 字典序最小的拓扑排序
```

---

## 3. 课程表

### LeetCode 207

```
numCourses 门课, prerequisites[i] = [a, b] 表示学a必须先学b
判断能否完成所有课程 (= 判断有无环)
```

```python
from collections import deque, defaultdict

def canFinish(numCourses, prerequisites):
    graph = defaultdict(list)
    in_degree = [0] * numCourses
    
    for course, pre in prerequisites:
        graph[pre].append(course)     # ⚠️ pre → course
        in_degree[course] += 1
    
    queue = deque(i for i in range(numCourses) if in_degree[i] == 0)
    count = 0
    
    while queue:
        node = queue.popleft()
        count += 1                     # ⚠️ 只需要计数, 不需要完整排序
        for nei in graph[node]:
            in_degree[nei] -= 1
            if in_degree[nei] == 0:
                queue.append(nei)
    
    return count == numCourses         # ⚠️ 全部入队 = 无环

# ⚠️ [course, pre] 的边方向:
#    pre → course (先修 → 后修)
#    graph[pre].append(course)
#    in_degree[course] += 1
```

### LeetCode 210: 课程表 II

```
返回拓扑排序结果 (学习顺序), 无解返回空
```

```python
def findOrder(numCourses, prerequisites):
    graph = defaultdict(list)
    in_degree = [0] * numCourses
    
    for course, pre in prerequisites:
        graph[pre].append(course)
        in_degree[course] += 1
    
    queue = deque(i for i in range(numCourses) if in_degree[i] == 0)
    order = []
    
    while queue:
        node = queue.popleft()
        order.append(node)             # ⚠️ 记录顺序
        for nei in graph[node]:
            in_degree[nei] -= 1
            if in_degree[nei] == 0:
                queue.append(nei)
    
    return order if len(order) == numCourses else []
```

---

## 4. 课程表IV: 先修关系查询

### LeetCode 1462

```
queries[i] = [u, v], 问 u 是否是 v 的先修课(直接或间接)

方法: 拓扑排序 + 传递闭包
  对每个节点, 记录它的所有先修课集合
```

```python
def checkIfPrerequisite(numCourses, prerequisites, queries):
    graph = defaultdict(list)
    in_degree = [0] * numCourses
    # 每个节点的所有先修课
    prereqs = [set() for _ in range(numCourses)]
    
    for u, v in prerequisites:
        graph[u].append(v)
        in_degree[v] += 1
        prereqs[v].add(u)             # ⚠️ 直接先修
    
    queue = deque(i for i in range(numCourses) if in_degree[i] == 0)
    
    while queue:
        node = queue.popleft()
        for nei in graph[node]:
            prereqs[nei] |= prereqs[node]  # ⚠️ 传递: 继承node的所有先修
            in_degree[nei] -= 1
            if in_degree[nei] == 0:
                queue.append(nei)
    
    return [u in prereqs[v] for u, v in queries]

# ⚠️ prereqs[nei] |= prereqs[node]:
#    nei 的先修 = 自己的直接先修 ∪ node 的所有先修
#    因为 node → nei, 所以 node 的先修也是 nei 的先修
```

---

## 5. 外星文字典

### LeetCode 269 (Hard)

```
给定外星语言的字典序排列, 推导字母顺序

words = ["wrt","wrf","er","ett","rftt"]
比较相邻单词:
  "wrt" vs "wrf" → t > f (第3位不同)
  "wrf" vs "er" → w > e (第1位不同)
  "er" vs "ett" → r > t (第2位不同)
  "ett" vs "rftt" → e > r (第1位不同)

建图: t→f, w→e, r→t, e→r
拓扑排序: w→e→r→t→f → "wertf"
```

```python
def alienOrder(words):
    # 1. 收集所有字符
    graph = defaultdict(set)
    in_degree = {c: 0 for word in words for c in word}
    
    # 2. 比较相邻单词, 建边
    for i in range(len(words) - 1):
        w1, w2 = words[i], words[i + 1]
        # ⚠️ 检查非法: "abc" 在 "ab" 前面 → 无解
        if len(w1) > len(w2) and w1[:len(w2)] == w2:
            return ""
        for c1, c2 in zip(w1, w2):
            if c1 != c2:
                if c2 not in graph[c1]:     # ⚠️ 防重复边
                    graph[c1].add(c2)
                    in_degree[c2] += 1
                break                        # ⚠️ 只看第一个不同的字符
    
    # 3. 拓扑排序
    queue = deque(c for c in in_degree if in_degree[c] == 0)
    order = []
    while queue:
        c = queue.popleft()
        order.append(c)
        for nei in graph[c]:
            in_degree[nei] -= 1
            if in_degree[nei] == 0:
                queue.append(nei)
    
    return ''.join(order) if len(order) == len(in_degree) else ""

# ⚠️ 只比较第一个不同的字符:
#    后续字符无法确定顺序
#    一定要 break!
#
# ⚠️ 非法情况: "abc" 排在 "ab" 前面
#    如果 w1 是 w2 的前缀且 w1 更长 → 矛盾
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 课程表 | 207 | 环检测 |
| Med | 课程表 II | 210 | 拓扑排序模板 |
| Med | 课程表 IV | 1462 | 传递闭包 |
| Hard | 外星文字典 | 269 | 建图+拓扑 |
| Med | 并行课程 | 1136 | 拓扑+层数 |

---

## 本节要点速查

```
✅ Kahn: 入度0入队, 出队减邻居入度, 变0入队
✅ len(order)<n → 有环
✅ 课程表: [course, pre] → graph[pre].append(course)
✅ 外星字典: 相邻单词第一个不同字符建边, break!
✅ 拓扑排序不唯一, 用堆可得字典序最小
```
