# Kadane 算法

> Kadane 算法是求最大子数组和的 O(n) 经典算法，变体应用广泛。

---

## 1. 最大子数组和

### LeetCode 53

```
找到和最大的连续子数组

nums = [-2, 1, -3, 4, -1, 2, 1, -5, 4]

核心思想: 以第 i 个元素结尾的最大子数组和
  dp[i] = max(nums[i], dp[i-1] + nums[i])
  含义: 要么自己单独开始, 要么接在前面后面

  i:     0   1   2   3   4   5   6   7   8
  num:  -2   1  -3   4  -1   2   1  -5   4
  dp:   -2   1  -2   4   3   5   6   1   5
              ↑       ↑               ↑
         max(1,-2+1) max(4,-2+4)  max(ans)=6

  最大子数组: [4, -1, 2, 1], 和 = 6

⚠️ 关键决策: 在每个位置
  如果 dp[i-1] > 0 → 接上有利 → dp[i] = dp[i-1] + nums[i]
  如果 dp[i-1] <= 0 → 接上无利 → dp[i] = nums[i] (重新开始)
```

```python
def maxSubArray(nums):
    dp = ans = nums[0]
    for x in nums[1:]:
        dp = max(x, dp + x)           # ⚠️ 重新开始 or 接上
        ans = max(ans, dp)
    return ans

# ⚠️ dp 是"以当前元素结尾的最大子数组和"
#    ans 是"全局最大子数组和"
#    两者不同! dp 在过程中可能变小, ans 只增不减
#
# ⚠️ 时间 O(n), 空间 O(1)
#    dp 只是一个变量, 不是数组
#
# ⚠️ 数组全为负数时:
#    答案 = 最大的那个负数 (单元素子数组)
#    算法自然处理: dp = max(x, dp+x) 会选择单独的 x
```

---

## 2. 返回子数组本身

```python
def maxSubArrayDetail(nums):
    best_sum = cur_sum = nums[0]
    best_start = best_end = cur_start = 0
    
    for i in range(1, len(nums)):
        if cur_sum + nums[i] < nums[i]:
            cur_sum = nums[i]
            cur_start = i              # ⚠️ 重新开始的位置
        else:
            cur_sum += nums[i]
        
        if cur_sum > best_sum:
            best_sum = cur_sum
            best_start = cur_start     # ⚠️ 更新最优起始
            best_end = i               # ⚠️ 更新最优结束
    
    return best_sum, nums[best_start:best_end + 1]

# ⚠️ cur_start: 当前子数组的起始位置
#    重新开始时更新为 i
#    cur_sum 更新 best_sum 时, 同步更新 best_start/best_end
```

---

## 3. 环形子数组最大和

### LeetCode 918

```
数组首尾相连 (环形), 求最大子数组和

两种情况:
  情况1: 最大子数组在中间 (不跨越边界)
         → 普通 Kadane

  情况2: 最大子数组跨越了 首尾
         → 中间的部分是"最小子数组"
         → 最大和 = 总和 - 最小子数组和

  ┌─────────────────────┐
  │ [====]               │  情况1: 中间连续段
  │                      │
  │ [===]         [===]  │  情况2: 首+尾 = 全部-中间最小
  └─────────────────────┘

  答案 = max(max_kadane, total - min_kadane)

  ⚠️ 特殊: 全为负数时 total - min_kadane = 0 (不合法)
     此时答案 = max_kadane (最大的负数)
```

```python
def maxSubarraySumCircular(nums):
    max_sum = cur_max = nums[0]
    min_sum = cur_min = nums[0]
    total = nums[0]
    
    for x in nums[1:]:
        cur_max = max(x, cur_max + x)
        max_sum = max(max_sum, cur_max)
        cur_min = min(x, cur_min + x)
        min_sum = min(min_sum, cur_min)
        total += x
    
    # ⚠️ 全为负数: total == min_sum, 此时 total - min_sum = 0 不合法
    if total == min_sum:
        return max_sum
    return max(max_sum, total - min_sum)

# ⚠️ 同时做两个 Kadane:
#    max Kadane → 情况1
#    min Kadane → 用于计算情况2
#
# ⚠️ total == min_sum: 意味着最小子数组 = 整个数组
#    即所有元素都是负数
#    此时 total - min_sum = 0 (空数组), 不合法
```

---

## 4. 乘积最大子数组

### LeetCode 152

```
找到乘积最大的连续子数组

麻烦: 负数乘负数 = 正数!
  所以不能只维护最大, 还要维护最小

dp_max[i] = 以 i 结尾的最大乘积
dp_min[i] = 以 i 结尾的最小乘积

转移:
  dp_max[i] = max(nums[i], dp_max[i-1]*nums[i], dp_min[i-1]*nums[i])
  dp_min[i] = min(nums[i], dp_max[i-1]*nums[i], dp_min[i-1]*nums[i])

nums = [2, 3, -2, 4]
  i=0: max=2,  min=2
  i=1: max=6,  min=3   (2*3=6, 单独3)
  i=2: max=-2, min=-12 (6*-2=-12, 但max=max(−2,−12,−2)=−2)
  i=3: max=4,  min=-48 (max(-48,-8,4)=4)
  答案 = 6
```

```python
def maxProduct(nums):
    max_prod = min_prod = ans = nums[0]
    
    for x in nums[1:]:
        # ⚠️ 需要临时变量! 因为 max_prod 更新后会影响 min_prod
        candidates = (x, max_prod * x, min_prod * x)
        max_prod = max(candidates)
        min_prod = min(candidates)
        ans = max(ans, max_prod)
    
    return ans

# ⚠️ 为什么要维护 min:
#    [-2, 3, -4] → min 在第二步是 -6
#    第三步 -6 * -4 = 24 → 成为最大值!
#    如果只维护 max, 就丢失了这个信息
#
# ⚠️ 0 的影响: 乘以0后, max和min都变成0
#    相当于重新开始 (和 Kadane 的"负数重新开始"类似)
#
# ⚠️ candidates 必须同时计算:
#    不能先更新 max_prod 再用新的 max_prod 算 min_prod
#    要用更新前的 max_prod 和 min_prod
```

---

## 5. Kadane 变体总结

```
┌──────────────────┬──────────────────────────────┐
│ 变体             │ 关键改动                     │
├──────────────────┼──────────────────────────────┤
│ 最大子数组和     │ dp = max(x, dp+x)            │
│ 最小子数组和     │ dp = min(x, dp+x)            │
│ 环形最大和       │ max(max_kadane, total-min)    │
│ 最大乘积         │ 同时维护 max_prod 和 min_prod │
│ 最长递增子数组   │ dp = dp+1 if 递增 else 1     │
└──────────────────┴──────────────────────────────┘

⚠️ Kadane 的核心: "以 i 结尾的最优 = max(单独, 接上前面)"
```

---

## 推荐题目

| 难度 | 题目 | LeetCode | 练习重点 |
|------|------|----------|----------|
| Med | 最大子数组和 | 53 | 基础Kadane |
| Med | 环形子数组最大和 | 918 | max+min两个Kadane |
| Med | 乘积最大子数组 | 152 | 同维max和min |
| Easy | 最长连续递增序列 | 674 | Kadane变体 |

---

## 本节要点速查

```
✅ Kadane: dp = max(x, dp+x), ans = max(ans, dp)
✅ dp ≠ ans: dp是"以i结尾的", ans是"全局的"
✅ 环形: max(max_kadane, total - min_kadane)
✅ 全负数: total == min_sum 时只取 max_kadane
✅ 乘积: 同时维护 max_prod 和 min_prod
✅ 时间 O(n) 空间 O(1)
```
