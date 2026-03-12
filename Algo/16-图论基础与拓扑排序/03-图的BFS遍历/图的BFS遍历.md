# 图的BFS遍历

> BFS 层序遍历图，天然适合求无权图的最短路径。

---

## 1. BFS 基本思想

```
BFS: 广度优先, 一层一层向外扩展

     0
    / \
   1   2      从0出发:
   |   |        第0层: {0}
   3   4        第1层: {1, 2}
    \ /         第2层: {3, 4}
     5          第3层: {5}

BFS 能解决:
  · 无权图最短路径
  · 层序遍历
  · 多源BFS
  · 拓扑排序 (Kahn算法)
```

---

## 2. BFS 模板

```python
from collections import deque

# 单源 BFS (无权图最短路)
def bfs(graph, start, n):
    dist = [-1] * n                    # ⚠️ -1 表示未访问
    dist[start] = 0
    queue = deque([start])
    
    while queue:
        node = queue.popleft()
        for nei in graph[node]:
            if dist[nei] == -1:        # ⚠️ 未访问才入队
                dist[nei] = dist[node] + 1
                queue.append(nei)
    
    return dist

# ⚠️ 用 dist == -1 代替 visited 数组:
#    dist[i] >= 0 表示已访问, 同时记录距离
#    比额外开 visited 更节省
#
# ⚠️ deque 而不是 list:
#    list.pop(0) 是 O(n)
#    deque.popleft() 是 O(1)
```

---

## 3. 层序 BFS（按层处理）

```python
from collections import deque

def bfs_level(graph, start, n):
    visited = [False] * n
    visited[start] = True
    queue = deque([start])
    level = 0
    
    while queue:
        size = len(queue)              # ⚠️ 当前层的节点数
        for _ in range(size):
            node = queue.popleft()
            # 处理 node (属于第 level 层)
            for nei in graph[node]:
                if not visited[nei]:
                    visited[nei] = True
                    queue.append(nei)
        level += 1

# ⚠️ size = len(queue) 固定当前层大小
#    for 循环内只处理当前层的节点
#    新加入的节点属于下一层
```

---

## 4. 多源 BFS

```
多个起点同时开始 BFS
等价于: 所有起点到超级源的距离为0

应用: 腐烂的橘子 (994), 01矩阵 (542)
```

### LeetCode 994: 腐烂的橘子

```
网格中: 0=空, 1=新鲜, 2=腐烂
每分钟腐烂橘子让相邻新鲜橘子腐烂
求所有橘子腐烂的最短时间, 不可能返回-1

多源BFS: 所有腐烂橘子同时入队
```

```python
from collections import deque

def orangesRotting(grid):
    m, n = len(grid), len(grid[0])
    queue = deque()
    fresh = 0
    
    for i in range(m):
        for j in range(n):
            if grid[i][j] == 2:
                queue.append((i, j))     # ⚠️ 所有腐烂橘子入队
            elif grid[i][j] == 1:
                fresh += 1
    
    if fresh == 0:
        return 0                          # ⚠️ 没有新鲜橘子
    
    minutes = 0
    dirs = [(0,1),(0,-1),(1,0),(-1,0)]
    
    while queue:
        size = len(queue)
        for _ in range(size):
            x, y = queue.popleft()
            for dx, dy in dirs:
                nx, ny = x + dx, y + dy
                if 0 <= nx < m and 0 <= ny < n and grid[nx][ny] == 1:
                    grid[nx][ny] = 2       # ⚠️ 标记腐烂 (同时作为visited)
                    fresh -= 1
                    queue.append((nx, ny))
        minutes += 1
    
    return minutes - 1 if fresh == 0 else -1

# ⚠️ minutes - 1: 最后一轮只是检查不扩展, 多算了1
#    或者改为: 在入队时间=0开始, 新橘子入队时 time+1
#
# ⚠️ 直接修改 grid 作为 visited:
#    grid[nx][ny] = 2 既标记腐烂又防止重复访问
```

---

## 5. 单词接龙

### LeetCode 127

```
beginWord → endWord, 每次变一个字母, 求最短变换序列长度

BFS: 每层变一个字母
  wordList 构建成集合, 逐位枚举26字母
```

```python
from collections import deque

def ladderLength(beginWord, endWord, wordList):
    word_set = set(wordList)
    if endWord not in word_set:
        return 0
    
    queue = deque([(beginWord, 1)])
    visited = {beginWord}
    
    while queue:
        word, length = queue.popleft()
        
        for i in range(len(word)):
            for c in 'abcdefghijklmnopqrstuvwxyz':
                new_word = word[:i] + c + word[i+1:]
                
                if new_word == endWord:
                    return length + 1
                
                if new_word in word_set and new_word not in visited:
                    visited.add(new_word)
                    queue.append((new_word, length + 1))
    
    return 0

# ⚠️ 枚举26字母比对比wordList更快:
#    每个单词长度 L, 枚举 26*L 种变换
#    vs 和 wordList 中每个单词逐位比较 O(N*L)
#    当 N 很大时 26*L 更快
#
# ⚠️ visited 用 set:
#    入队时标记, 不是出队时标记
#    防止同一个词被多次入队
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 腐烂的橘子 | 994 | 多源BFS |
| Med | 01矩阵 | 542 | 多源BFS+距离 |
| Hard | 单词接龙 | 127 | BFS+字母枚举 |
| Med | 网格中的最短路径 | 1293 | BFS+状态 |

---

## 本节要点速查

```
✅ BFS = 层序扩展, 用 deque
✅ dist=-1 同时当 visited
✅ 层序BFS: size=len(queue), for range(size)
✅ 多源BFS: 所有起点同时入队
✅ 入队时标记 visited, 不是出队时
```
