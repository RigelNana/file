# 自动化修复 Auto-remediation 八股文

---

## 一、Auto-remediation 概念

### 1. 什么是自动化修复（Auto-remediation）？

**答：**

```
Auto-remediation 定义：
  当系统检测到已知问题模式时，
  自动触发预定义的修复动作，
  无需人工介入即可恢复服务。

与自运维的区别：
  自运维 = 更广义的概念（包含自动化修复）
  Auto-remediation = 专注"检测问题→自动修复"的闭环

修复触发链：
  Alert → Webhook → 修复引擎 → 执行 Runbook → 验证 → 关闭告警
                                    │
                                    ├── 成功 → 记录日志
                                    └── 失败 → 升级给人

常见分类：
  ┌──────────────┬─────────────────────┐
  │ 类别         │ 示例                 │
  ├──────────────┼─────────────────────┤
  │ 重启类       │ 重启服务/Pod/容器    │
  │ 扩缩容类     │ 增减副本/实例        │
  │ 清理类       │ 清理磁盘/连接池      │
  │ 切换类       │ DNS 切换/主从切换    │
  │ 回滚类       │ 版本回滚/配置回滚    │
  │ 隔离类       │ 摘除节点/熔断        │
  └──────────────┴─────────────────────┘
```

### 2. Auto-remediation 有哪些实现方案？

**答：**

| 方案 | 原理 | 适用场景 |
|------|------|----------|
| PagerDuty Rundeck | 告警触发 Runbook 自动执行 | 企业级复杂修复 |
| Stackstorm | 事件驱动自动化 (IFTTT for Ops) | 事件编排 |
| Kubernetes Operator | CRD + Controller 自定义逻辑 | K8s 原生修复 |
| AWS Systems Manager | 自动化文档 + RunCommand | AWS 环境 |
| Prometheus + Alertmanager + Webhook | 告警 → Webhook → 修复脚本 | 轻量方案 |
| Ansible + AWX/Tower | 告警触发 Ansible Playbook | Ansible 生态 |

---

## 二、修复工作流设计

### 3. 如何设计安全的 Auto-remediation 工作流？

**答：**

```
安全工作流设计：

1. 预检（Pre-check）
   - 确认告警有效（非误报）
   - 检查当前是否在变更窗口
   - 检查修复次数是否超限

2. 锁定（Acquire Lock）
   - 分布式锁防止并发修复
   - 同一问题同一时间只执行一次修复

3. 执行（Execute）
   - 执行修复操作
   - 设置超时时间
   - 记录详细日志

4. 验证（Verify）
   - 等待冷却期
   - 检查问题是否解决
   - 验证没有引入新问题

5. 收尾（Post-action）
   - 成功：关闭告警，记录日志
   - 失败：升级给人，保留现场

流程图：
  告警触发
    │
    ▼
  ┌─────────┐  NN──→ 忽略
  │ 是有效？ ├────→ 
  └────┬────┘
       │Y
       ▼
  ┌──────────┐  N
  │ 修复次数  ├────→ 升级给人
  │ 未超限？  │
  └────┬─────┘
       │Y
       ▼
  获取分布式锁
       │
       ▼
  执行 Runbook
       │
       ▼
  ┌──────────┐  N
  │ 验证成功？├────→ 回滚+升级
  └────┬─────┘
       │Y
       ▼
  记录日志，释放锁
```

### 4. 如何用 Prometheus + Webhook 实现自动修复？

**答：**

```yaml
# Alertmanager 配置触发修复
route:
  receiver: 'auto-remediation'
  routes:
    - match:
        severity: auto-fixable
      receiver: 'auto-remediation'
      repeat_interval: 15m

receivers:
  - name: 'auto-remediation'
    webhook_configs:
      - url: 'http://remediation-service:8080/api/fix'
        send_resolved: true
        max_alerts: 10
```

```python
# 修复服务示例
from flask import Flask, request
import subprocess
import logging

app = Flask(__name__)
logger = logging.getLogger(__name__)

REMEDIATION_MAP = {
    "HighMemoryUsage": restart_pod,
    "DiskSpaceLow": cleanup_disk,
    "HighErrorRate": rollback_deployment,
    "PodCrashLooping": scale_and_restart,
}

@app.route('/api/fix', methods=['POST'])
def handle_alert():
    alerts = request.json.get('alerts', [])
    for alert in alerts:
        alert_name = alert['labels'].get('alertname')
        handler = REMEDIATION_MAP.get(alert_name)
        if handler:
            try:
                handler(alert)
                logger.info(f"Auto-fixed: {alert_name}")
            except Exception as e:
                logger.error(f"Fix failed: {alert_name}: {e}")
                escalate_to_human(alert)
    return 'OK', 200
```

---

## 三、Runbook 自动化

### 5. 什么是 Runbook？如何自动化 Runbook？

**答：**

```
Runbook = 运维操作手册
  传统：人按文档执行步骤
  自动化：代码执行 Runbook 步骤

Runbook 自动化分级：
  Level 0: 纯文档（wiki/confluence）
  Level 1: 脚本化（脚本+人触发）
  Level 2: 半自动（告警触发+人确认）
  Level 3: 全自动（告警触发+自动执行+人审核）

Runbook 模板结构：
  ┌─────────────────────────────────┐
  │ Runbook: 磁盘空间不足修复       │
  ├─────────────────────────────────┤
  │ 触发条件: disk_usage > 85%      │
  │ 影响范围: 单节点               │
  │ 风险等级: LOW                   │
  │ 自动化: YES                    │
  ├─────────────────────────────────┤
  │ Step 1: 检查磁盘使用详情        │
  │ Step 2: 清理超过7天的日志        │
  │ Step 3: 清理已退出的容器镜像     │
  │ Step 4: 验证磁盘空间恢复        │
  │ Step 5: 磁盘空间仍不足→升级      │
  └─────────────────────────────────┘
```

### 6. StackStorm 如何实现事件驱动自动化？

**答：**

```
StackStorm 核心模型：
  Trigger → Rule → Action → Result

组件说明：
  Sensor:  感知外部事件(webhook/MQ/cron)
  Trigger: 事件抽象
  Rule:    when trigger match condition do action
  Action:  具体操作（脚本/API/Workflow）
  Pack:    功能包（类似插件）

示例 Rule（磁盘清理）：
```

```yaml
# rules/disk_cleanup.yaml
name: "disk_cleanup_rule"
trigger:
  type: "prometheus.alert"
  parameters:
    alertname: "DiskSpaceLow"
criteria:
  trigger.labels.severity:
    type: "equals"
    pattern: "warning"
action:
  ref: "linux.cleanup_disk"
  parameters:
    host: "{{ trigger.labels.instance }}"
    days: 7
    paths:
      - "/var/log"
      - "/tmp"
```

---

## 四、面试高频题

### 7. 面试题：Auto-remediation 的限制和风险？

**答：**

```
限制：
  1. 只能处理已知问题模式
     - 未遇到过的问题无法自动修复
     - 需要持续积累修复知识库

  2. 复杂问题难以自动化
     - 多服务级联故障
     - 数据一致性问题
     - 需要业务判断的问题

  3. 上下文理解不足
     - 高峰期重启 vs 低峰期重启策略不同
     - 自动化难以理解业务上下文

风险及缓解：
  ┌──────────────────┬───────────────────┐
  │ 风险             │ 缓解措施           │
  ├──────────────────┼───────────────────┤
  │ 误修复           │ 多条件验证+确认    │
  │ 修复风暴         │ 频率限制+冷却期    │
  │ 掩盖真实问题     │ 修复后创建工单     │
  │ 修复引入新问题   │ 修复后验证         │
  │ 权限滥用         │ 最小权限+审计      │
  └──────────────────┴───────────────────┘
```

### 8. 面试题：如何衡量 Auto-remediation 的效果？

**答：**

| 指标 | 含义 | 目标 |
|------|------|------|
| MTTR（平均修复时间） | 从发现问题到修复 | < 5 分钟 |
| 自动修复率 | 自动修复 / 总修复次数 | > 60% |
| 修复成功率 | 成功修复 / 自动修复尝试 | > 95% |
| 误修复率 | 误判触发修复 / 总修复次数 | < 5% |
| Toil 减少量 | 减少的人工操作时间 | 持续下降 |
| 升级率 | 自动修复失败升级给人 | < 10% |
