# PromQL 查询语言

---

## 1. PromQL 基本概念和数据类型？

**回答：**

```
PromQL (Prometheus Query Language):
  Prometheus 内置的函数式查询语言

四种数据类型:
  1. Instant Vector (瞬时向量):  某一时刻的一组时间序列
     http_requests_total{method="GET"}
     → {method="GET", status="200"} 12345 @timestamp
       {method="GET", status="404"} 50    @timestamp

  2. Range Vector (范围向量): 一段时间范围内的时间序列
     http_requests_total{method="GET"}[5m]
     → {method="GET"} [(t1,100), (t2,105), (t3,110), ...]
     注意: 范围向量不能直接画图, 必须经过函数处理

  3. Scalar (标量): 一个浮点数值
     42
     count(up)  → 返回标量值

  4. String (字符串): 很少使用
     "hello"
```

---

## 2. 选择器和标签匹配？

**回答：**

```promql
# 标签匹配运算符
http_requests_total{method="GET"}         # = 完全匹配
http_requests_total{method!="GET"}        # != 不等于
http_requests_total{status=~"5.."}        # =~ 正则匹配
http_requests_total{status!~"2.."}        # !~ 正则不匹配

# 多标签过滤
http_requests_total{method="GET", status=~"2..", job="api"}

# 特殊标签
up{job="node"}                            # __name__ 和 job 是内置标签
{__name__=~"http_.*"}                     # 通过 __name__ 匹配指标名
{job="api", __name__=~"http_requests_.*"} # 组合

# 时间范围选择器
http_requests_total[5m]    # 最近 5 分钟
http_requests_total[1h]    # 最近 1 小时
http_requests_total[7d]    # 最近 7 天

# 时间单位: s(秒) m(分) h(时) d(天) w(周) y(年)

# 偏移修饰符 (查看历史)
http_requests_total offset 1h        # 1 小时前的值
rate(http_requests_total[5m] offset 1d)  # 昨天同一时刻的速率

# @ 修饰符 (指定时间戳, Prometheus 2.33+)
http_requests_total @ 1609459200     # 指定 Unix 时间戳
http_requests_total @ start()        # 查询开始时间
http_requests_total @ end()          # 查询结束时间
```

---

## 3. rate() 和 irate() 的区别？

**回答：**

```
rate(v range-vector):
  计算范围内的平均每秒增长率
  适用: Counter 类型
  算法: (last - first) / time_range
  特点: 平滑, 适合告警和趋势

irate(v range-vector):
  计算最后两个数据点的瞬时增长率
  适用: Counter 类型
  算法: (last - second_last) / (t_last - t_second_last)
  特点: 灵敏, 适合实时观察

图示:
  数据点:  10  20  15  30  50  80
  
  rate[5m]:   计算所有点的平均斜率 → 平滑曲线
  irate[5m]:  只看最后两点 (50→80) → 尖锐曲线

选择:
  ┌──────────┬─────────────────┬─────────────────┐
  │ 场景      │ rate            │ irate           │
  ├──────────┼─────────────────┼─────────────────┤
  │ 告警      │ ✓ (避免噪音)     │ ✗ (太灵敏)      │
  │ 趋势图    │ ✓               │ ✗               │
  │ 实时面板  │ ✗               │ ✓ (看瞬时变化)   │
  │ Recording │ ✓               │ ✗               │
  └──────────┴─────────────────┴─────────────────┘

Counter 重置处理:
  Counter 重启后会变成 0
  rate() 和 irate() 都会自动处理 Counter Reset
  检测到值减小 → 视为重启 → 自动修正
```

```promql
# 示例
rate(http_requests_total[5m])             # QPS (推荐)
irate(http_requests_total[5m])            # 瞬时 QPS

# increase = rate × 时间范围
increase(http_requests_total[1h])          # 1 小时内总增量
# 等价于 rate(http_requests_total[1h]) * 3600

# resets — 统计 Counter 重置次数
resets(http_requests_total[24h])           # 一天内重启了几次
```

---

## 4. 聚合操作符有哪些？

**回答：**

```promql
# 基本聚合 (作用于瞬时向量)
sum(metric)                  # 求和
avg(metric)                  # 平均值
min(metric)                  # 最小值
max(metric)                  # 最大值
count(metric)                # 计数
stddev(metric)               # 标准差
stdvar(metric)               # 方差
group(metric)                # 分组 (值全为1)

# 特殊聚合
topk(5, metric)              # 前 5 个最大值
bottomk(5, metric)           # 前 5 个最小值
count_values("label", metric) # 按值计数
quantile(0.95, metric)       # 计算分位数

# by 和 without 子句
sum by (method, status)(rate(http_requests_total[5m]))
# 按 method 和 status 分组求和

sum without (instance)(rate(http_requests_total[5m]))
# 移除 instance 标签后聚合 (保留其余所有标签)

# by 和 without 等价:
# sum by (method) == sum without (所有其他标签)
```

```promql
# 实际场景示例

# 1. 每个 Job 的总 QPS
sum by (job)(rate(http_requests_total[5m]))

# 2. 每个节点的 CPU 使用率
100 - avg by (instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100

# 3. 每个 Pod 的内存使用 Top 10
topk(10, container_memory_usage_bytes{namespace="production"})

# 4. 统计各状态码数量
count_values("status", http_response_status)

# 5. 在线实例数
count(up == 1)

# 6. 集群整体平均延迟
avg(rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m]))
```

---

## 5. histogram_quantile() 怎么用？

**回答：**

```promql
# 基本语法
histogram_quantile(φ, rate(histogram_bucket[range]))

# P50 (中位数)
histogram_quantile(0.5, rate(http_request_duration_seconds_bucket[5m]))

# P95
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# P99
histogram_quantile(0.99, rate(http_request_duration_seconds_bucket[5m]))

# 按 job 分组的 P99
histogram_quantile(0.99,
  sum by (job, le)(rate(http_request_duration_seconds_bucket[5m]))
)
# 注意: 必须保留 le 标签！

# 平均延迟 (不用 histogram_quantile)
rate(http_request_duration_seconds_sum[5m])
/
rate(http_request_duration_seconds_count[5m])
```

```
Bucket (桶) 设计:
  默认桶: {.005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10}
  
  自定义桶 (根据业务调整):
    API 接口:  {0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5}
    批处理:    {1, 5, 10, 30, 60, 120, 300}
  
  原则:
    桶边界覆盖 SLO 阈值 (如 SLO = P99 < 200ms, 需要 le=0.2)
    桶数量不宜过多 (增加基数 → 更多时间序列)
    通常 8-15 个桶

注意事项:
  histogram_quantile 是近似值 (线性插值)
  桶越细, 结果越精确
  聚合时必须保留 le 标签
  +Inf 桶是必须的 (总请求数)
```

---

## 6. 二元操作符和向量匹配？

**回答：**

```promql
# 算术操作符: + - * / % ^
http_requests_total / 1000                          # 标量运算
node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes   # 向量运算

# 比较操作符: == != > < >= <=
http_requests_total > 1000                          # 过滤 (返回匹配的序列)
http_requests_total > bool 1000                     # bool 修饰符 (返回 0/1)

# 逻辑操作符: and or unless
up == 1 and on(job) rate(http_requests_total[5m]) > 10
# 同时满足两个条件

metric_a or metric_b                                # 合并 (A 优先)
metric_a unless metric_b                            # 排除 (A 中排除 B 有的)
```

```promql
# 向量匹配 (Vector Matching)

# 一对一匹配 (默认)
# 两边标签完全匹配
metric_a / metric_b
# {method="GET"} / {method="GET"} ✓ 匹配
# {method="GET"} / {method="POST"} ✗ 不匹配

# on() — 只用指定标签匹配
method_request_total / on(method) method_error_total

# ignoring() — 忽略指定标签
metric_a / ignoring(instance) metric_b

# 多对一 / 一对多
# group_left: 左侧多, 右侧一
# group_right: 右侧多, 左侧一

# 示例: 计算每个实例每种方法的错误率
http_errors_total
/ on(instance) group_left(method)
http_requests_total

# group_left 表示左侧 (http_errors) 有更多标签维度
# group_right 反之
```

---

## 7. 常用内置函数？

**回答：**

```promql
# 速率函数
rate(v[range])            # 每秒平均增长率 (Counter)
irate(v[range])           # 瞬时增长率 (Counter)
increase(v[range])        # 范围内总增量 (Counter)
delta(v[range])           # 范围内差值 (Gauge)
deriv(v[range])           # 线性回归导数 (Gauge)
idelta(v[range])          # 最后两点差值 (Gauge)

# 聚合 over time (范围向量 → 瞬时向量)
avg_over_time(v[range])   # 范围内平均值
max_over_time(v[range])   # 范围内最大值
min_over_time(v[range])   # 范围内最小值
sum_over_time(v[range])   # 范围内总和
count_over_time(v[range]) # 范围内样本数
last_over_time(v[range])  # 范围内最后一个值
quantile_over_time(0.95, v[range])  # 范围内 P95

# 数学函数
abs(v)                    # 绝对值
ceil(v)                   # 向上取整
floor(v)                  # 向下取整
round(v, 0.5)             # 四舍五入
clamp(v, min, max)        # 限制范围
clamp_min(v, min)         # 限制最小值
clamp_max(v, max)         # 限制最大值
ln(v)                     # 自然对数
log2(v) / log10(v)        # 对数
exp(v)                    # e 的 v 次方
sqrt(v)                   # 平方根

# 时间函数
time()                    # 当前 Unix 时间戳
timestamp(v)              # 样本时间戳
day_of_week()             # 星期几 (0=Sunday)
hour()                    # 当前小时

# 排序
sort(v)                   # 升序
sort_desc(v)              # 降序

# 标签函数
label_replace(v, "dst", "$1", "src", "regex")
label_join(v, "dst", "-", "src1", "src2")

# 预测
predict_linear(v[range], seconds)   # 基于线性回归预测未来值
# 示例: 预测 4 小时后磁盘是否满
predict_linear(node_filesystem_avail_bytes[6h], 4*3600) < 0
```

---

## 8. 常见告警 PromQL 表达式？

**回答：**

```promql
# ===== 基础设施告警 =====

# 实例宕机
up == 0

# CPU 使用率 > 80%
100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80

# 内存使用率 > 85%
(1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 85

# 磁盘使用率 > 85%
(1 - node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes) * 100 > 85

# 磁盘 4 小时后将满
predict_linear(node_filesystem_avail_bytes{fstype!="tmpfs"}[6h], 4*3600) < 0

# 网络丢包率 > 1%
rate(node_network_receive_drop_total[5m]) / rate(node_network_receive_packets_total[5m]) > 0.01


# ===== 应用告警 =====

# 请求错误率 > 1%
sum by(job)(rate(http_requests_total{status=~"5.."}[5m]))
/
sum by(job)(rate(http_requests_total[5m])) > 0.01

# P99 延迟 > 1 秒
histogram_quantile(0.99, sum by(job,le)(rate(http_request_duration_seconds_bucket[5m]))) > 1

# QPS 突然下降 50%
sum(rate(http_requests_total[5m]))
<
sum(rate(http_requests_total[5m] offset 1h)) * 0.5


# ===== Kubernetes 告警 =====

# Pod 频繁重启 (1 小时内重启 > 3 次)
increase(kube_pod_container_status_restarts_total[1h]) > 3

# Pod 一直 Pending
kube_pod_status_phase{phase="Pending"} > 0

# Deployment 副本不足
kube_deployment_status_replicas_available
<
kube_deployment_spec_replicas

# PVC 使用率 > 80%
kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.8
```

---

## 9. 子查询 (Subquery) 是什么？

**回答：**

```promql
# 子查询语法: <instant_query>[<range>:<resolution>]
# 将瞬时查询在一段时间范围内以指定步长重复计算

# 示例: 过去 1 小时内 5 分钟速率的最大值
max_over_time(rate(http_requests_total[5m])[1h:1m])
# 解读: 每 1 分钟计算一次 rate(5m), 取过去 1 小时的最大值

# 过去 30 分钟 P99 延迟的平均值
avg_over_time(
  histogram_quantile(0.99, sum by(le)(rate(http_request_duration_seconds_bucket[5m])))[30m:1m]
)

# 与 Recording Rules 的关系:
# 子查询: 临时使用, 适合探索
# Recording Rules: 固定规则, 适合生产 Dashboard 和告警

# 注意: 子查询可能消耗大量资源
# 每个步长都要执行一次内部查询
# 建议: 频繁使用的子查询 → 转为 Recording Rule
```

---

## 10. PromQL 常见陷阱和最佳实践？

**回答：**

```
陷阱 1: Counter 直接使用
  ✗ http_requests_total > 1000          # 无意义, Counter 只增
  ✓ rate(http_requests_total[5m]) > 10   # 用 rate() 求速率

陷阱 2: rate 范围太小
  ✗ rate(metric[15s])                    # 可能只有 1 个点, 无法计算
  ✓ rate(metric[5m])                     # 至少 4 × scrape_interval
  规则: range ≥ 4 × scrape_interval

陷阱 3: 聚合后丢失标签
  sum(rate(http_requests_total[5m]))     # 丢失所有标签
  sum by(job)(rate(http_requests_total[5m]))  # 保留 job 标签

陷阱 4: histogram_quantile 丢失 le
  ✗ histogram_quantile(0.99, sum by(job)(rate(bucket[5m])))
  ✓ histogram_quantile(0.99, sum by(job, le)(rate(bucket[5m])))
  # 必须保留 le 标签！

陷阱 5: 除法可能除以 0
  ✗ metric_a / metric_b                  # 可能 NaN
  ✓ metric_a / (metric_b > 0)            # 过滤掉 0
  ✓ metric_a / clamp_min(metric_b, 1)    # 最小值为 1

陷阱 6: 标签值变化导致新序列
  每个唯一标签组合 = 新时间序列
  {version="1.0"} → 升级 → {version="2.0"}
  = 两条不同序列

最佳实践:
  ✓ Counter 用 rate/increase
  ✓ rate 范围 ≥ 4 × scrape_interval
  ✓ 聚合时用 by/without 保留需要的标签
  ✓ histogram 聚合保留 le
  ✓ 除法前检查分母
  ✓ 复杂查询用 Recording Rules 预计算
  ✓ 用 label_replace/label_join 处理标签不一致
```
