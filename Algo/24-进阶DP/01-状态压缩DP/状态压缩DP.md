# 状态压缩DP

> 用二进制位表示集合状态，适用于元素数量较小（≤20）的组合优化问题。

---

## 1. 核心思想

```
状态压缩: 用一个整数的二进制位表示集合

  例: n=4 个元素 {0,1,2,3}
    mask = 0b1010 = 10 → 集合 {1, 3}
    mask = 0b1111 = 15 → 集合 {0,1,2,3}
    mask = 0b0001 = 1  → 集合 {0}

  基本操作:
    判断第i位: (mask >> i) & 1
    设置第i位: mask | (1 << i)
    清除第i位: mask & ~(1 << i)
    翻转第i位: mask ^ (1 << i)
    
  枚举 mask 的子集:
    sub = mask
    while sub > 0:
        # 处理子集 sub
        sub = (sub - 1) & mask

  状压DP: dp[mask] = 选了 mask 中的元素后的最优值
  转移: 枚举下一个选哪个 / 枚举子集如何划分

  ⚠️ 元素数量通常 ≤ 20
     2^20 = 100万, 可以接受
     2^25 = 3300万, 勉强
     2^30 = 10亿, 太多
```

---

## 2. 旅行商问题 (TSP)

```
n 个城市, dist[i][j] = i到j的距离
从城市 0 出发, 访问所有城市恰好一次, 回到0
求最短路径

dp[mask][i] = 已访问集合为 mask, 当前在城市 i 的最短距离
转移: dp[mask | (1<<j)][j] = min(dp[mask][i] + dist[i][j])
     (从 i 走到未访问的 j)
```

```python
def tsp(dist):
    n = len(dist)
    INF = float('inf')
    dp = [[INF] * n for _ in range(1 << n)]
    dp[1][0] = 0                       # ⚠️ 起点在0, mask=0b1 (访问了0)
    
    for mask in range(1 << n):
        for i in range(n):
            if dp[mask][i] == INF:
                continue
            if not (mask >> i) & 1:    # ⚠️ i 不在 mask 中, 跳过
                continue
            for j in range(n):
                if (mask >> j) & 1:    # ⚠️ j 已访问, 跳过
                    continue
                new_mask = mask | (1 << j)
                dp[new_mask][j] = min(dp[new_mask][j], 
                                      dp[mask][i] + dist[i][j])
    
    # 回到起点 0
    full = (1 << n) - 1
    ans = INF
    for i in range(n):
        ans = min(ans, dp[full][i] + dist[i][0])
    
    return ans

# ⚠️ 状态: dp[mask][i], mask是已访问集合, i是当前位置
#    转移: 从 i 走到未访问的 j
#    最终: 所有都访问 (full) + 回到0
#
# ⚠️ 时间: O(2^n × n²), 空间: O(2^n × n)
#    n=15 → 2^15 × 15² = 7.4M 可以
#    n=20 → 2^20 × 20² = 4.2亿 困难
```

---

## 3. LeetCode 943: 最短超级串

```
给定字符串数组 words
找最短的字符串, 使得 words 中每个字符串都是它的子串

方法: TSP 变体
  预处理 overlap[i][j]: words[i] 后缀和 words[j] 前缀的最长重叠
  目标: 按某种顺序拼接所有 words, 重叠最大 = 长度最短
```

```python
def shortestSuperstring(words):
    n = len(words)
    
    # 预处理重叠
    overlap = [[0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j: continue
            for k in range(min(len(words[i]), len(words[j])), 0, -1):
                if words[i].endswith(words[j][:k]):
                    overlap[i][j] = k
                    break
    
    # 状压DP
    INF = float('inf')
    dp = [[0] * n for _ in range(1 << n)]
    parent = [[-1] * n for _ in range(1 << n)]
    
    for mask in range(1 << n):
        for i in range(n):
            if not (mask >> i) & 1:
                continue
            for j in range(n):
                if (mask >> j) & 1:
                    continue
                new_mask = mask | (1 << j)
                val = dp[mask][i] + overlap[i][j]
                if val > dp[new_mask][j]:  # ⚠️ 最大化重叠
                    dp[new_mask][j] = val
                    parent[new_mask][j] = i
    
    # 回溯路径
    full = (1 << n) - 1
    last = max(range(n), key=lambda i: dp[full][i])
    
    path = []
    mask = full
    while last != -1:
        path.append(last)
        prev = parent[mask][last]
        mask ^= (1 << last)
        last = prev
    path.reverse()
    
    # 拼接
    result = words[path[0]]
    for k in range(1, len(path)):
        i, j = path[k-1], path[k]
        result += words[j][overlap[i][j]:]
    
    return result

# ⚠️ 关键: 最大化总重叠 = 最小化总长度
```

---

## 4. LeetCode 1494: 并行课程 II

```
n 门课, 先修关系, 每学期最多选 k 门
选课必须前置课都修完
求最少几个学期修完

dp[mask] = 修完 mask 中课程的最少学期数
枚举当前可选的课 → 枚举子集选 ≤k 门
```

---

## 5. 状压DP模式总结

```
┌─────────────────────┬─────────────────────────────┐
│ 问题                │ 状态设计                    │
├─────────────────────┼─────────────────────────────┤
│ TSP 旅行商          │ dp[mask][i]: 访问mask, 在i  │
│ 最短超级串          │ dp[mask][i]: 拼完mask, 末尾i│
│ 并行课程            │ dp[mask]: 修完mask的学期数  │
│ 键盘行覆盖          │ dp[mask][row]: 覆盖mask行   │
│ 小美分糖果          │ dp[mask]: 分给mask人的方案  │
└─────────────────────┴─────────────────────────────┘

通用模板:
  1. 枚举 mask (0 到 2^n - 1)
  2. 对 mask 中的每个元素 i 尝试转移
  3. 或枚举 mask 的子集进行划分
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Hard | 最短超级串 | 943 | TSP+重叠+路径恢复 |
| Hard | 并行课程 II | 1494 | 子集枚举+先修约束 |
| Med | 每个人戴不同帽子 | 1434 | 角色互换状压 |
| Hard | 最小不兼容性 | 1681 | 子集划分 |

---

## 本节要点速查

```
✅ 状压: 整数二进制表示集合, n≤20
✅ 判断: (mask>>i)&1, 设置: mask|(1<<i)
✅ 枚举子集: sub=(sub-1)&mask
✅ TSP: dp[mask][i], O(2^n × n²)
✅ 最大化重叠 = 最小化超级串长度
✅ 路径恢复: parent 数组回溯
```
