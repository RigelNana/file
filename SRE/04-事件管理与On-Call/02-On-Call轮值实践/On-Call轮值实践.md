# On-Call 轮值实践八股文

---

## 一、On-Call 基础概念

### 1. 什么是 On-Call？SRE 的 On-Call 与传统运维值班有什么区别？

**答：**

| 维度 | 传统运维值班 | SRE On-Call |
|------|-------------|-------------|
| 响应方式 | 手动处理所有告警 | 只响应 Actionable 告警 |
| 工具 | 电话/邮件 | PagerDuty/OpsGenie + ChatOps |
| 工作量 | 可能整晚都在处理 | 有严格的负载上限 |
| 后续 | 处理完就完了 | 必须有 Postmortem 和改进 |
| 目标 | 维持运行 | 持续提升可靠性 |
| 补偿 | 加班费（可能没有） | 明确的 On-Call 补偿制度 |

### 2. On-Call 的核心原则是什么？

**答：**

```
Google SRE On-Call 原则：

1. 工程师至少 50% 的时间做工程工作（非 On-Call）
2. 每次 On-Call 轮值最多 2 个事件/12小时 shift
3. 如果超负荷 → 增加人手，不是加班
4. 每个事件必须有后续行动（Action Item）
5. On-Call 必须有明确的升级链
6. 新人必须经过 shadow 培训才能独立 On-Call

On-Call 负载公式：
  每月 On-Call 事件数 = 告警数 × 可操作率
  
  健康标准：
  ┌──────────────────────────────┐
  │ 每 12h shift ≤ 2 个事件      │
  │ 每月 On-Call ≤ 1-2 个周期    │
  │ 每次 On-Call 不超过 1-2 天   │
  └──────────────────────────────┘
```

### 3. On-Call 轮值的常见排班方式有哪些？

**答：**

```
方式一：周轮值（最常见）
  周一 08:00 UTC 交接
  ┌── 第1周: Alice ──┬── 第2周: Bob ──┬── 第3周: Carol ──┐
  └─────────────────┴───────────────┴──────────────────┘

方式二：日夜分班（跨时区团队）
  ├── 白班 (09:00-21:00): US 团队 ──┤
  ├── 夜班 (21:00-09:00): Asia 团队 ─┤
  实现 "Follow the Sun"

方式三：双层（Primary + Secondary）
  Primary On-Call:  直接负责响应
  Secondary On-Call: 升级备份
  
  告警 → Primary (5min) → Secondary (10min) → Manager

方式四：按服务分组
  Payment On-Call:  支付团队
  Infra On-Call:    基础设施团队
  Data On-Call:     数据平台团队
```

---

## 二、On-Call 实践要素

### 4. On-Call 交接应该包含哪些内容？

**答：**

```yaml
# On-Call 交接清单
handoff:
  outgoing: "Alice"
  incoming: "Bob"
  date: "2024-01-15 09:00 UTC"

  # 当前状态
  active_incidents: []
  ongoing_issues:
    - "Redis 集群内存使用率 85%，密切关注"
    - "v3.2 灰度中（10%），如有异常立即回滚"

  # 运行手册更新
  runbook_changes:
    - "新增：支付网关超时处理 SOP"
  
  # 变更计划
  upcoming_changes:
    - "周三 DB 升级维护窗口 02:00-04:00 UTC"
  
  # 上周 On-Call 总结
  last_shift_summary:
    incidents: 1
    pages: 3
    false_alarms: 1
    action_items:
      - "INC-041: 已创建 JIRA，等待排期"
```

### 5. On-Call Runbook 应该怎么写？

**答：**

```markdown
# Runbook: 支付服务 5xx 错误率高

## 告警条件
- 支付服务 5xx 率 > 1% 持续 5 分钟

## 影响
- 用户无法完成支付

## 排查步骤

### Step 1: 确认影响范围
  $ kubectl get pods -n payment
  $ promql: rate(http_requests_total{service="payment",code=~"5.."}[5m])
  
### Step 2: 检查近期变更
  $ kubectl rollout history deploy/payment-api
  如果最近有发布 → 考虑回滚

### Step 3: 检查依赖服务
  $ promql: probe_success{job="payment-deps"}
  重点检查：数据库、Redis、第三方支付网关

### Step 4: 检查资源
  $ kubectl top pods -n payment
  CPU/内存是否接近 limit？

## 恢复操作

### 回滚
  $ kubectl rollout undo deploy/payment-api

### 扩容
  $ kubectl scale deploy/payment-api --replicas=10

### 降级
  修改 ConfigMap 开启降级开关

## 升级条件
- 15 分钟内无法缓解 → 呼叫 Secondary
- 影响 > 50% 用户 → 升级为 P0
```

### 6. 如何做好 On-Call Shadow（影子训练）？

**答：**

```
On-Call 培训路径：

阶段一：学习（1-2 周）
  ├── 阅读所有 Runbook
  ├── 熟悉监控仪表盘
  ├── 了解服务架构和依赖
  └── 完成"Wheel of Misfortune"故障模拟

阶段二：Shadow（1-2 个 On-Call 周期）
  ├── 与 Primary On-Call 一起收到告警
  ├── 新人先尝试诊断，老人指导
  ├── 新人记录学习笔记
  └── 不独立做决策

阶段三：Reverse Shadow（1 个周期）
  ├── 新人作为 Primary 响应
  ├── 老人作为 Shadow 监督
  ├── 老人随时可以接管
  └── 事后 Review 新人的处理

阶段四：独立 On-Call
  ├── 首次独立但有强力 Secondary
  ├── 鼓励积极求助
  └── 完成后复盘
```

---

## 三、On-Call 质量管理

### 7. 如何减轻 On-Call 负担？

**答：**

| 策略 | 做法 | 效果 |
|------|------|------|
| **减少告警** | 定期 Review 告警，删除无效告警 | 减少 30-50% 噪音 |
| **自动修复** | 自动扩容、自动重启 | 无需人工介入 |
| **改进 Runbook** | 每次事件后更新 Runbook | 缩短排查时间 |
| **轮值人数** | 保证 ≥ 8 人轮值池 | 每人每月 ≤ 1 次 |
| **补偿制度** | On-Call 津贴 + 调休 | 可持续性 |
| **工程改进** | 修复反复出现的问题 | 从根本减少事件 |

**On-Call 负载追踪仪表盘**：
```promql
# 每周 On-Call 页面数
sum(increase(pagerduty_incidents_total[7d])) by (team)

# On-Call 中断睡眠次数（夜间 23:00-07:00 的告警）
sum(increase(pagerduty_incidents_total{
  hour_of_day=~"23|0[0-6]"
}[7d])) by (team)
```

### 8. On-Call 补偿制度如何设计？

**答：**

```
补偿模式对比：

模式 A：固定津贴
  工作日 On-Call：$100/天
  节假日 On-Call：$200/天
  实际被叫响应：$50/次

模式 B：工资百分比
  On-Call 待命：基本工资 10%
  实际响应：额外按小时算

模式 C：调休制度
  每 On-Call 一周 → 获得 1 天调休
  夜间被叫：次日可晚到/休息半天

最佳实践：
  ┌────────────────────────────────┐
  │ 1. 补偿必须明确写入政策        │
  │ 2. 夜间和节假日有额外补偿      │
  │ 3. 不应让同一人连续 On-Call     │
  │ 4. 被叫次数多应有工程改进      │
  └────────────────────────────────┘
```

---

## 四、面试高频题

### 9. 面试题：你如何评价一个好的 On-Call 体系？

**答：**

```
评价维度：

✅ 可持续性
  - 每人每月 On-Call ≤ 1 次
  - 不应该影响正常工作效率
  
✅ 公平性
  - 轮值平均分配
  - 考虑时区和个人情况
  
✅ 有效性
  - 可操作告警率 > 80%
  - 平均响应时间 < 5 分钟
  
✅ 持续改进
  - 每周 On-Call Review
  - 常见问题有自动修复
  - Runbook 持续更新
  
✅ 文化支持
  - 管理层重视 On-Call 质量
  - 有明确补偿
  - 鼓励分享经验
```

### 10. 面试题：如果 On-Call 告警太多你会怎么办？

**答：**

```
系统性解决方案：

Step 1: 量化问题
  - 统计过去 4 周告警数量
  - 分类：Actionable vs Non-Actionable
  - 找出 Top 10 高频告警

Step 2: 短期改善
  - 静默（Silence）已知问题的重复告警
  - 合并相关告警（Alert Grouping）
  - 调整阈值消除误报

Step 3: 中期改进
  - Top 5 告警的工程修复
  - 编写自动修复脚本
  - 完善 Runbook

Step 4: 长期治理
  - 建立告警 Review 机制
  - 新告警必须审批（告警即代码）
  - On-Call 负载月度报告
  - 设定目标：每 shift ≤ 2 事件

预期效果：
  Before: 每周 50+ 告警 → After: 每周 < 10 告警
```
