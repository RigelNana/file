# SLO 实践案例与面试八股文

---

## 一、行业 SLO 实践案例

### 1. Google 的 SLO 实践是怎样的？

**答：**

**Google 的 SLO 体系特点**：

| 特点 | 描述 |
|------|------|
| **CUJ 驱动** | 以用户旅程定义 SLO，不是按服务 |
| **多级 SLO** | 区分全球级/区域级/实例级 |
| **自动化** | SLO 监控、告警、报告全自动化 |
| **文化** | 错误预算策略全公司认可 |
| **工具链** | Monarch 监控 + 内部 SLO 平台 |

```
Google SLO 文档结构：
1. 服务简介
2. SLI 定义（精确的 PromQL/Monarch 查询）
3. SLO 目标（含时间窗口）
4. 错误预算策略（签字确认）
5. 告警配置
6. 责任人和审批链
```

### 2. Netflix 的 SLO 实践案例

**答：**

```
Netflix 关键 SLI/SLO：

核心用户旅程：播放一个视频
  SLI：播放启动成功率
  SLO：≥ 99.97%（非常高，因为是核心体验）

  SLI：播放启动延迟
  SLO：P50 < 2s, P99 < 5s

  SLI：播放中断率
  SLO：< 0.01%

Netflix 的特殊做法：
  - 按设备类型拆分 SLO（TV/Mobile/Web）
  - 按地区拆分 SLO（不同 CDN 覆盖）
  - 用混沌工程持续验证 SLO
```

### 3. 中小公司如何落地 SLO？

**答：**

**阶段化落地**：

```
阶段一（第1月）：选择 1 个核心服务
  ├── 定义 2-3 个 SLI
  ├── 设定初始 SLO（基于 2 周历史数据）
  └── 用 Prometheus + Grafana 展示

阶段二（第2-3月）：建立反馈循环
  ├── 配置燃烧率告警
  ├── 制定错误预算策略（简版）
  └── 每周回顾 SLO 状态

阶段三（第4-6月）：扩展
  ├── 覆盖 3-5 个核心服务
  ├── 建立 CUJ 到 SLO 的映射
  └── 与发布流程集成

阶段四（6月+）：成熟
  ├── 全部服务有 SLO
  ├── SLO 驱动优先级排序
  └── 持续优化和改进
```

---

## 二、SLO 工具和框架

### 4. 有哪些开源 SLO 工具？

**答：**

| 工具 | 类型 | 特点 |
|------|------|------|
| **Sloth** | SLO 生成器 | YAML 定义 SLO → 自动生成 PrometheusRule |
| **Pyrra** | SLO 平台 | Web UI + Prometheus 集成 |
| **OpenSLO** | SLO 标准 | YAML 标准格式，厂商无关 |
| **Grafana SLO** | 内置功能 | Grafana Cloud 原生 SLO 支持 |
| **Nobl9** | 商业平台 | 企业级 SLO 管理平台 |

**Sloth 示例配置**：

```yaml
# sloth.yaml
version: "prometheus/v1"
service: "order-service"
labels:
  owner: "sre-team"
slos:
  - name: "availability"
    objective: 99.9
    description: "订单服务可用性"
    sli:
      events:
        error_query: sum(rate(http_requests_total{code=~"5.."}[{{.window}}]))
        total_query: sum(rate(http_requests_total[{{.window}}]))
    alerting:
      name: OrderServiceAvailability
      page_alert:
        labels:
          severity: critical
      ticket_alert:
        labels:
          severity: warning
```

### 5. OpenSLO 标准格式是什么？

**答：**

```yaml
# openslo.yaml
apiVersion: openslo/v1
kind: SLO
metadata:
  name: order-availability
  displayName: 订单服务可用性
spec:
  service: order-service
  description: 衡量订单服务的可用性
  budgetingMethod: Occurrences
  objectives:
    - displayName: 可用性目标
      target: 0.999
      ratioMetrics:
        good:
          source: prometheus
          queryType: promql
          query: sum(rate(http_requests_total{code!~"5.."}[{{.window}}]))
        total:
          source: prometheus
          queryType: promql
          query: sum(rate(http_requests_total[{{.window}}]))
  timeWindow:
    - duration: 30d
      isRolling: true
```

---

## 三、SLO 面试高频题

### 6. 面试题：你在之前的公司是如何实践 SLO 的？

**答：** 使用 STAR 方法回答：

```
Situation：
  公司有 20+ 微服务，但没有统一的可靠性度量
  每次故障后不知道影响范围，PM 和 Dev 无法就优先级达成一致

Task：
  建立 SLO 体系，用数据驱动可靠性决策

Action：
  1. 选择 Top 3 核心服务，定义 CUJ 和 SLI
  2. 收集 4 周历史数据，设定初始 SLO
  3. 用 Prometheus + Grafana 建立 SLO 仪表盘
  4. 配置多窗口燃烧率告警
  5. 制定错误预算策略并让各方签字
  6. 每周 SLO 回顾会议

Result：
  - 6 个月内将 MTTR 从 45 分钟降至 15 分钟
  - 错误预算策略解决了 Dev/PM/SRE 的优先级冲突
  - 重复事故减少 60%
```

### 7. 面试题：如何处理 SLO "不公平"的问题？

**答：** 常见的"不公平"情况：

```
场景1：第三方故障消耗了我的预算
  处理：在 SLI 计算中标记第三方故障，
       错误预算策略中区分内因和外因

场景2：另一个团队的变更导致我违约
  处理：Postmortem 中明确责任归因，
       预算只从责任方扣除

场景3：新服务 SLO 不可能和老服务一样高
  处理：新服务可以有更低的初始 SLO，
       随成熟度逐步提高
```

### 8. 面试题：SLO 相关的常见计算题

**答：**

**题目1**：SLO = 99.9%，30天窗口，已消耗 20 分钟，还能承受多少？
```
错误预算 = 43200 × 0.001 = 43.2 分钟
已消耗 = 20 分钟
剩余 = 43.2 - 20 = 23.2 分钟
剩余百分比 = 23.2/43.2 = 53.7%
```

**题目2**：服务链 A→B→C，可用性分别 99.9%、99.95%、99.99%，端到端可用性？
```
端到端 = 0.999 × 0.9995 × 0.9999
       = 0.9984
       ≈ 99.84%
```

**题目3**：当前 1 小时燃烧率 10x，SLO = 99.9%，多久耗尽 30 天预算？
```
正常 30 天耗尽
10x 消耗 → 30/10 = 3 天
```

### 9. 面试题：描述一个 SLO 失败的案例和教训

**答：**

```
案例：SLO 设定后没人关注

背景：
  团队定义了完整的 SLO 体系
  仪表盘做得很漂亮
  但 6 个月后...

问题：
  - SLO 从未被回顾或调整
  - 错误预算耗尽了也没人行动
  - 告警疲劳导致所有告警被忽略
  - SLO 变成了"墙上的装饰"

教训：
  1. SLO 需要制度保障（定期回顾会议）
  2. 错误预算策略必须有人执行（管理层支持）
  3. 告警必须精确（宁少勿多）
  4. SLO 要与实际决策挂钩（不能只是数字）
```

### 10. 面试题：SLO 体系的成功指标是什么？

**答：**

| 指标 | 怎么衡量 | 目标 |
|------|----------|------|
| SLO 覆盖率 | 有 SLO 的服务 / 总服务 | > 90% |
| SLO 达标率 | 达标窗口数 / 总窗口数 | > 95% |
| 预算利用率 | 平均预算消耗 | 30%-70% |
| 决策采纳率 | 基于 SLO 做的决策数 | 持续增长 |
| MTTR 改善 | 故障恢复时间趋势 | 持续下降 |
| 用户满意度 | NPS 或投诉率 | 持续改善 |
