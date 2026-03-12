# Alertmanager 告警管理

---

## 1. Alertmanager 架构和工作流程？

**回答：**

```
告警流程:
  Prometheus (evaluation_interval)
    → 评估 alert rules
    → 条件满足 → 触发告警 (pending → firing)
    → 发送到 Alertmanager
    → 分组 (Grouping)
    → 抑制 (Inhibition)
    → 静默 (Silence)
    → 路由 (Routing)
    → 通知 (Notification)
    → Email / Slack / PagerDuty / Webhook / DingTalk

告警状态:
  inactive → pending → firing
                ↑         ↓
                └── resolved

  inactive: 条件不满足
  pending:  条件满足, 等待 for 时间
  firing:   条件持续满足 ≥ for 时间, 已发送告警
  resolved: 从 firing 恢复到正常
```

```
Alertmanager 核心功能:
  ┌────────────┬─────────────────────────────────────────┐
  │ 功能        │ 说明                                    │
  ├────────────┼─────────────────────────────────────────┤
  │ Grouping   │ 将相关告警合并, 避免告警风暴              │
  │ Inhibition │ 高级别告警抑制低级别告警                   │
  │ Silencing  │ 临时静默告警 (维护窗口)                   │
  │ Routing    │ 按标签路由到不同接收者                     │
  │ Dedup      │ 去重, 相同告警不重复发送                   │
  │ Throttling │ 控制通知频率 (repeat_interval)            │
  └────────────┴─────────────────────────────────────────┘
```

---

## 2. 告警规则 (Alert Rules) 怎么写？

**回答：**

```yaml
# alert_rules.yml
groups:
  - name: instance_alerts
    rules:
      # 实例宕机
      - alert: InstanceDown
        expr: up == 0
        for: 5m                      # 持续 5 分钟才触发
        labels:
          severity: critical          # 自定义标签
        annotations:
          summary: "Instance {{ $labels.instance }} is down"
          description: "{{ $labels.instance }} of job {{ $labels.job }} has been down for more than 5 minutes."
          runbook_url: "https://wiki.example.com/runbook/instance-down"

      # CPU 高
      - alert: HighCPUUsage
        expr: |
          100 - (avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "High CPU on {{ $labels.instance }}"
          description: "CPU usage is {{ printf \"%.1f\" $value }}%"

      # 内存高
      - alert: HighMemoryUsage
        expr: |
          (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 85
        for: 5m
        labels:
          severity: warning

  - name: application_alerts
    rules:
      # 错误率高
      - alert: HighErrorRate
        expr: |
          sum by(job)(rate(http_requests_total{status=~"5.."}[5m]))
          / sum by(job)(rate(http_requests_total[5m])) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate for {{ $labels.job }}"
          description: "Error rate is {{ printf \"%.2f\" $value | mulf 100 }}%"

      # P99 延迟高
      - alert: HighLatencyP99
        expr: |
          histogram_quantile(0.99, sum by(job,le)(rate(http_request_duration_seconds_bucket[5m]))) > 1
        for: 10m
        labels:
          severity: warning
```

```
for 参数:
  for: 0m  → 条件满足立即 firing (不建议)
  for: 5m  → 持续 5 分钟才 firing (避免瞬时抖动)
  
  最佳实践:
    Critical: for: 3m-5m
    Warning:  for: 5m-15m
    Info:     for: 15m-30m
```

---

## 3. alertmanager.yml 完整配置？

**回答：**

```yaml
# alertmanager.yml
global:
  resolve_timeout: 5m               # 告警恢复后多久发送 resolved 通知
  smtp_from: 'alertmanager@example.com'
  smtp_smarthost: 'smtp.example.com:587'
  smtp_auth_username: 'alertmanager@example.com'
  smtp_auth_password: 'password'
  smtp_require_tls: true
  slack_api_url: 'https://hooks.slack.com/services/xxx'

# 通知模板
templates:
  - '/etc/alertmanager/templates/*.tmpl'

# 路由树
route:
  receiver: 'default-receiver'       # 默认接收器
  group_by: ['alertname', 'cluster', 'service']
  group_wait: 30s                    # 新告警等待分组时间
  group_interval: 5m                 # 已有分组的发送间隔
  repeat_interval: 4h                # 重复通知间隔
  
  routes:
    # Critical → PagerDuty + Slack
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
      repeat_interval: 1h
      continue: false                # 匹配后停止 (默认)
    
    # Warning → Slack
    - match:
        severity: warning
      receiver: 'slack-warnings'
      repeat_interval: 4h
    
    # 按团队路由
    - match_re:
        team: 'backend|api'
      receiver: 'backend-team'
    
    # 数据库告警 → DBA 团队
    - matchers:
        - severity =~ "critical|warning"
        - service = "database"
      receiver: 'dba-team'

# 接收器
receivers:
  - name: 'default-receiver'
    email_configs:
      - to: 'ops-team@example.com'
        send_resolved: true

  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: 'xxx-service-key'
        severity: critical
    slack_configs:
      - channel: '#critical-alerts'
        title: '🚨 {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}\n{{ end }}'
        send_resolved: true

  - name: 'slack-warnings'
    slack_configs:
      - channel: '#warnings'
        title: '⚠️ {{ .GroupLabels.alertname }}'
        text: '{{ range .Alerts }}{{ .Annotations.description }}\n{{ end }}'
        send_resolved: true

  - name: 'backend-team'
    slack_configs:
      - channel: '#backend-alerts'
    email_configs:
      - to: 'backend@example.com'

  - name: 'dba-team'
    email_configs:
      - to: 'dba@example.com'

# 抑制规则
inhibit_rules:
  # Critical 抑制同名 Warning
  - source_matchers:
      - severity = critical
    target_matchers:
      - severity = warning
    equal: ['alertname', 'instance']
  
  # 节点宕机时抑制该节点上的所有告警
  - source_matchers:
      - alertname = InstanceDown
    target_matchers:
      - severity =~ "warning|info"
    equal: ['instance']
```

---

## 4. Grouping（分组）详解？

**回答：**

```
Grouping: 将相关告警合并为一条通知

group_by: ['alertname', 'cluster']
  → 相同 alertname + cluster 的告警合并

场景:
  100 台机器 CPU 高 → 不发 100 条, 合并为 1 条

三个时间参数:

group_wait: 30s
  新告警到达后, 等待 30s 收集同组其他告警
  然后一起发送
  
  ┌────┐     ┌────┐     ┌────┐
  │ A1 │     │ A2 │     │ A3 │  ← 30s 内到达
  └────┘     └────┘     └────┘
  ─────────── 30s ──────────── → 合并发送: [A1, A2, A3]

group_interval: 5m
  同一分组已发送后, 下一次汇总发送的间隔
  5m 内有新告警加入该组 → 等 5m 后再发
  
  [A1,A2,A3] 已发送
    ... 3 分钟后 A4 到达 ...
    ... 再等 2 分钟 ...
  [A1,A2,A3,A4] 再次发送

repeat_interval: 4h
  告警持续未恢复, 重复通知的间隔
  避免告警被遗忘, 但不能太频繁
  Critical: 1h
  Warning:  4h
  Info:     12h

最佳实践:
  group_by: ['alertname', 'namespace']   # 按告警名+命名空间分组
  group_wait: 30s                         # 快速但不太快
  group_interval: 5m                      # 合理的汇总间隔
  repeat_interval: 1h-4h                  # 根据严重程度
```

---

## 5. Inhibition（抑制）和 Silence（静默）？

**回答：**

```
Inhibition (抑制): 自动抑制 — 高级别告警触发时, 自动静默低级别
  规则定义在 alertmanager.yml
  
  示例:
    节点宕机 (Critical) → 自动抑制该节点的 CPU/内存/磁盘告警 (Warning)
    集群不可用 (Critical) → 自动抑制该集群下所有服务告警
```

```yaml
inhibit_rules:
  # 规则: 当 source 告警 firing 时, target 告警被静默
  - source_matchers:
      - severity = critical
    target_matchers:
      - severity = warning
    equal: ['alertname', 'instance']
    # 条件: alertname 和 instance 都相同时才抑制

  # 示例: 节点宕机抑制其上的所有告警
  - source_matchers:
      - alertname = NodeDown
    target_matchers:
      - alertname != NodeDown    # 抑制非 NodeDown 的告警
    equal: ['node']              # 同一节点
```

```
Silence (静默): 手动临时静默 — 维护窗口
  通过 Alertmanager UI 或 API 创建
  设置:
    时间范围: 2024-01-15 02:00 → 2024-01-15 06:00
    匹配条件: instance="node1:9100"
    创建者:   john
    备注:     "计划维护: 更换硬盘"
```

```bash
# 通过 API 创建 Silence
curl -X POST http://alertmanager:9093/api/v2/silences \
  -H 'Content-Type: application/json' \
  -d '{
    "matchers": [
      {"name": "instance", "value": "node1:9100", "isRegex": false}
    ],
    "startsAt": "2024-01-15T02:00:00Z",
    "endsAt": "2024-01-15T06:00:00Z",
    "createdBy": "john",
    "comment": "Planned maintenance: disk replacement"
  }'

# 查看活跃 Silence
curl http://alertmanager:9093/api/v2/silences

# 删除 Silence
curl -X DELETE http://alertmanager:9093/api/v2/silence/{silenceID}
```

---

## 6. 通知模板自定义？

**回答：**

```
Alertmanager 使用 Go template 语法

可用变量:
  .Status        → firing / resolved
  .Alerts        → 告警列表
  .GroupLabels   → 分组标签
  .CommonLabels  → 所有告警共有的标签
  .ExternalURL   → Alertmanager 外部 URL
  
  每个 Alert:
    .Labels       → 标签 map
    .Annotations  → 注解 map
    .StartsAt     → 开始时间
    .EndsAt       → 结束时间
    .Status       → firing / resolved
```

```
# /etc/alertmanager/templates/slack.tmpl
{{ define "slack.custom.title" }}
[{{ .Status | toUpper }}{{ if eq .Status "firing" }}:{{ .Alerts.Firing | len }}{{ end }}] {{ .GroupLabels.SortedPairs.Values | join " " }}
{{ end }}

{{ define "slack.custom.text" }}
{{ range .Alerts }}
*Alert:* {{ .Labels.alertname }}
*Severity:* {{ .Labels.severity }}
*Instance:* {{ .Labels.instance }}
*Summary:* {{ .Annotations.summary }}
*Description:* {{ .Annotations.description }}
{{ if .Annotations.runbook_url }}*Runbook:* {{ .Annotations.runbook_url }}{{ end }}
{{ end }}
{{ end }}
```

```yaml
# alertmanager.yml 中引用模板
templates:
  - '/etc/alertmanager/templates/*.tmpl'

receivers:
  - name: 'slack'
    slack_configs:
      - channel: '#alerts'
        title: '{{ template "slack.custom.title" . }}'
        text: '{{ template "slack.custom.text" . }}'
        send_resolved: true
        color: '{{ if eq .Status "firing" }}danger{{ else }}good{{ end }}'
```

---

## 7. 告警路由树匹配逻辑？

**回答：**

```
路由树是树状结构, 从根向下匹配:

route (root):
  receiver: default
  routes:
    - match: severity=critical     ← 先匹配
      receiver: pagerduty
    - match: severity=warning      ← 再匹配
      receiver: slack
      routes:
        - match: team=dba          ← 嵌套匹配
          receiver: dba-slack

匹配规则:
  1. 从根节点开始
  2. 依次检查子路由
  3. 第一个匹配的子路由处理 (默认 continue: false)
  4. 如果没有匹配, 使用当前节点的 receiver
  5. continue: true → 匹配后继续检查后续路由

continue 的作用:
  ┌──────────────────────────────────────────────┐
  │ continue: false (默认)                        │
  │   Critical 告警 → 匹配第一条 → PagerDuty 处理  │
  │   不再检查后续路由                              │
  │                                               │
  │ continue: true                                │
  │   Critical 告警 → 匹配第一条 → PagerDuty       │
  │   继续匹配 → 也匹配第二条 → Slack              │
  │   同时发送到多个渠道                            │
  └──────────────────────────────────────────────┘
```

```yaml
route:
  receiver: 'default'
  routes:
    # Critical 同时发 PagerDuty 和 Slack
    - matchers:
        - severity = critical
      receiver: 'pagerduty'
      continue: true              # 继续匹配下一条
    
    - matchers:
        - severity =~ "critical|warning"
      receiver: 'slack'
      continue: false
    
    # 特定团队路由
    - matchers:
        - team = frontend
      receiver: 'frontend-slack'
```

---

## 8. Alertmanager 高可用？

**回答：**

```
Alertmanager 集群:
  多实例运行, Gossip 协议通信
  自动去重, 避免重复通知

架构:
  Prometheus → AM-1 ─┐
  Prometheus → AM-2 ─┤ Gossip (mesh)
  Prometheus → AM-3 ─┘
  
  任何一个 AM 收到告警 → 通过 Gossip 通知其他
  由其中一个 AM 发送通知 (去重)

启动配置:
  alertmanager \
    --cluster.listen-address=0.0.0.0:9094 \
    --cluster.peer=am-1:9094 \
    --cluster.peer=am-2:9094 \
    --cluster.peer=am-3:9094

Prometheus 配置多个 AM:
  alerting:
    alertmanagers:
      - static_configs:
          - targets:
              - 'am-1:9093'
              - 'am-2:9093'
              - 'am-3:9093'

K8s 部署:
  使用 Prometheus Operator:
    apiVersion: monitoring.coreos.com/v1
    kind: Alertmanager
    metadata:
      name: main
    spec:
      replicas: 3                # 3 副本 HA
      image: prom/alertmanager:v0.26.0

注意:
  Prometheus 会向所有 AM 发送告警
  AM 集群内部去重, 只发送一次通知
  Silence 和配置在集群间同步
```

---

## 9. Webhook 集成和自定义通知？

**回答：**

```yaml
# Alertmanager Webhook 配置
receivers:
  - name: 'webhook'
    webhook_configs:
      - url: 'http://alert-handler:8080/webhook'
        send_resolved: true
        max_alerts: 10
        http_config:
          basic_auth:
            username: admin
            password: secret
```

```json
// Webhook 接收到的 JSON 格式
{
  "version": "4",
  "groupKey": "{}:{alertname=\"HighCPU\"}",
  "status": "firing",
  "receiver": "webhook",
  "groupLabels": { "alertname": "HighCPU" },
  "commonLabels": { "alertname": "HighCPU", "severity": "warning" },
  "commonAnnotations": { "summary": "High CPU" },
  "externalURL": "http://alertmanager:9093",
  "alerts": [
    {
      "status": "firing",
      "labels": {
        "alertname": "HighCPU",
        "instance": "node1:9100",
        "severity": "warning"
      },
      "annotations": {
        "summary": "High CPU on node1"
      },
      "startsAt": "2024-01-15T10:00:00Z",
      "endsAt": "0001-01-01T00:00:00Z",
      "fingerprint": "abc123"
    }
  ]
}
```

```python
# 自定义 Webhook 处理器 (Python Flask)
from flask import Flask, request, jsonify
import requests

app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def webhook():
    data = request.json
    for alert in data['alerts']:
        name = alert['labels']['alertname']
        status = alert['status']
        instance = alert['labels'].get('instance', 'unknown')
        summary = alert['annotations'].get('summary', '')
        
        # 发送到钉钉
        if alert['labels'].get('severity') == 'critical':
            send_dingtalk(f"[{status.upper()}] {name}\n{summary}\nInstance: {instance}")
        
        # 自动化处理
        if name == 'DiskSpaceFull' and status == 'firing':
            cleanup_disk(instance)
    
    return jsonify({"status": "ok"})

def send_dingtalk(message):
    url = "https://oapi.dingtalk.com/robot/send?access_token=xxx"
    requests.post(url, json={
        "msgtype": "text",
        "text": {"content": f"[告警] {message}"}
    })
```

---

## 10. 告警最佳实践总结？

**回答：**

```
1. 告警必须可操作
   ✗ "CPU is 82%"                    → 然后呢？
   ✓ "CPU > 80% for 10m on node1    → 然后看 runbook
      Runbook: wiki/high-cpu"

2. 设置合理 for 持续时间
   ✗ for: 0s → 瞬时抖动也告警
   ✓ for: 5m → 持续才告警

3. 告警分级
   P0 Critical:  电话 + 短信 + Slack
   P1 Warning:   Slack + Email
   P2 Info:      Dashboard 关注

4. 避免告警疲劳
   统计: 每天 > 20 条 → 团队开始忽略告警
   定期回顾: 删除无效告警, 调整阈值
   
5. 告警收敛
   group_by → 合并同类
   inhibit  → 高抑制低
   silence  → 维护窗口

6. 包含上下文
   annotations:
     summary: 简短描述
     description: 详细信息 (当前值等)
     runbook_url: 处理手册链接
     dashboard_url: 相关 Dashboard

7. 测试告警
   先在 staging 验证
   使用 amtool 测试路由:
   amtool config routes test --config.file=alertmanager.yml severity=critical

8. On-Call 管理
   使用 PagerDuty / OpsGenie 值班轮换
   设置升级策略 (5min 无响应 → 升级)
   Post-mortem 复盘每次事故
```
