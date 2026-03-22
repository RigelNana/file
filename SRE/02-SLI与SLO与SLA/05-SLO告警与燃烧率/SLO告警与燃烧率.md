# SLO 告警与燃烧率八股文

---

## 一、SLO 告警基础

### 1. 为什么传统阈值告警不适合 SLO？

**答：**

```
传统告警：错误率 > 1% → 告警
问题：
  - 短暂的 1 分钟尖峰就告警 → 噪音太多
  - 持续的 0.5% 错误不告警   → 但会慢慢消耗完预算

SLO 需要的告警：
  - 能检测"会耗尽错误预算"的错误
  - 不会因为短暂尖峰误报
  - 能区分快速和慢速的预算消耗
```

### 2. SLO 告警的核心原则是什么？

**答：**

| 原则 | 描述 |
|------|------|
| **精确** | 告警时确实有问题（低误报） |
| **及时** | 问题足够严重时尽快通知 |
| **可操作** | 收到告警后知道该做什么 |
| **预算关联** | 告警条件与错误预算消耗挂钩 |

---

## 二、燃烧率（Burn Rate）告警

### 3. 什么是燃烧率？如何计算？

**答：**

```
燃烧率(Burn Rate) = 实际错误率 / SLO 允许错误率

SLO = 99.9%，允许错误率 = 0.1%

当前错误率 = 0.5%
Burn Rate = 0.5% / 0.1% = 5x

含义：以 5 倍正常速度消耗错误预算
30 天预算在 30/5 = 6 天 内耗尽
```

### 4. 如何基于燃烧率设计告警？

**答：** Google SRE Workbook 推荐的燃烧率告警策略：

| 燃烧率 | 窗口 | 耗尽时间 | 告警级别 | 操作 |
|--------|------|----------|----------|------|
| 14.4x | 1 小时 | ~2 天 | Page（紧急） | 立即响应 |
| 6x | 6 小时 | ~5 天 | Page（紧急） | 尽快处理 |
| 3x | 1 天 | ~10 天 | Ticket（工单） | 工作时间处理 |
| 1x | 3 天 | ~30 天 | Ticket（工单） | 纳入迭代计划 |

**Prometheus 告警规则示例**：

```yaml
groups:
  - name: slo-burn-rate
    rules:
      # 快速燃烧 - 紧急
      - alert: SLO_HighBurnRate_Critical
        expr: |
          (
            job:sli_errors:ratio_rate1h > (14.4 * 0.001)
            and
            job:sli_errors:ratio_rate5m > (14.4 * 0.001)
          )
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "高燃烧率告警：1小时燃烧率 14.4x"
          
      # 中速燃烧 - 紧急  
      - alert: SLO_HighBurnRate_Warning
        expr: |
          (
            job:sli_errors:ratio_rate6h > (6 * 0.001)
            and
            job:sli_errors:ratio_rate30m > (6 * 0.001)
          )
        for: 5m
        labels:
          severity: warning
```

### 5. 单窗口燃烧率告警有什么缺陷？

**答：**

```
问题：只看一个时间窗口容易产生误报或漏报

场景1：瞬间尖峰
  1小时窗口内有 5 分钟的高错误率
  → 1小时平均燃烧率可能 > 14.4x → 告警
  → 但问题已经自愈了 → 误报！

场景2：缓慢泄漏
  持续的低错误率（2x 燃烧）
  → 1小时窗口看不出问题 → 不告警
  → 但 15 天后预算耗尽 → 漏报！
```

**解决方案**：多窗口多燃烧率告警。

---

## 三、多窗口燃烧率告警

### 6. 什么是多窗口多燃烧率告警？

**答：** 同时使用**长窗口**和**短窗口**来确认告警，减少误报。

```
告警条件 = 长窗口燃烧率 > 阈值 AND 短窗口燃烧率 > 阈值

长窗口：确认问题持续存在
短窗口：确认问题当前还在发生

检测规则：
┌─────────────────────────────────────────┐
│ 严重级别    │ 长窗口     │ 短窗口       │
├─────────────────────────────────────────┤
│ P1 Critical │ 1h > 14.4x │ 5m > 14.4x  │
│ P1 Warning  │ 6h > 6x    │ 30m > 6x    │
│ P2 Ticket   │ 24h > 3x   │ 2h > 3x    │
│ P3 Ticket   │ 72h > 1x   │ 6h > 1x    │
└─────────────────────────────────────────┘
```

### 7. 多窗口告警为什么能减少误报？

**答：**

```
场景：5 分钟的错误尖峰后恢复

单窗口（1小时）：
  1h 平均含 5 分钟高错误 → 可能触发告警 ✗ 误报

多窗口（1小时 + 5分钟）：
  1h 看到异常 → 但 5m 窗口已经恢复正常
  AND 条件不满足 → 不告警 ✓ 正确！
```

```
场景：缓慢持续的错误泄漏

多窗口（72小时 + 6小时）：
  72h 燃烧率 = 1.5x → 超过 1x 阈值 ✓
  6h 燃烧率 = 1.5x  → 超过 1x 阈值 ✓
  AND 条件满足 → 触发工单 ✓
```

### 8. 如何用 Prometheus 实现多窗口告警？

**答：**

```yaml
# Recording Rules：预计算不同窗口的错误率
groups:
  - name: slo-recording
    rules:
      - record: job:sli_errors:ratio_rate5m
        expr: sum(rate(http_errors_total[5m])) / sum(rate(http_requests_total[5m]))
      
      - record: job:sli_errors:ratio_rate30m
        expr: sum(rate(http_errors_total[30m])) / sum(rate(http_requests_total[30m]))
      
      - record: job:sli_errors:ratio_rate1h
        expr: sum(rate(http_errors_total[1h])) / sum(rate(http_requests_total[1h]))
  
      - record: job:sli_errors:ratio_rate6h
        expr: sum(rate(http_errors_total[6h])) / sum(rate(http_requests_total[6h]))

# 多窗口告警
  - name: slo-alerts
    rules:
      - alert: SLO_BurnRate_Critical
        expr: |
          job:sli_errors:ratio_rate1h > (14.4 * 0.001)
          and
          job:sli_errors:ratio_rate5m > (14.4 * 0.001)
        labels:
          severity: page
        annotations:
          summary: "SLO 快速消耗：1h 燃烧率 > 14.4x"
```

---

## 四、告警调优

### 9. SLO 告警的检测时间和重置时间如何权衡？

**答：**

| 指标 | 定义 | 权衡 |
|------|------|------|
| **检测时间** | 问题发生到收到告警的时间 | 越短越好（但可能误报） |
| **重置时间** | 问题恢复后告警消除的时间 | 越短越好（但可能反复触发） |

```
14.4x + 1h 窗口：
  检测时间：~2 分钟 （快速检测）
  重置时间：~1 小时 （需要整个窗口恢复才取消）

6x + 6h 窗口：
  检测时间：~30 分钟  （较慢）
  重置时间：~6 小时   （漫长）
```

### 10. 面试题：设计一个服务的 SLO 告警体系

**答：**

```
SLO：可用性 ≥ 99.9%（30天滚动）
错误预算：0.1% = 43.2 分钟/月

告警层次：
┌────────────────────────────────────────────┐
│ Level │ 条件              │ 通知方式       │
├────────────────────────────────────────────┤
│ P0    │ 1h>14.4x AND 5m>14.4x │ PagerDuty 电话│
│ P1    │ 6h>6x AND 30m>6x      │ Slack + 短信  │
│ P2    │ 24h>3x AND 2h>3x      │ 工单系统      │
│ P3    │ 72h>1x AND 6h>1x      │ 邮件通知      │
└────────────────────────────────────────────┘

同时配置：
- 错误预算仪表盘（Grafana）
- 每日预算消耗报告
- 月度 SLO 回顾会议
```
