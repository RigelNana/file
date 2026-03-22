# ChatOps 与运维协作八股文

---

## 一、ChatOps 基础

### 1. 什么是 ChatOps？

**答：**

```
ChatOps 定义：
  将运维操作集成到聊天工具中，
  通过对话式交互执行运维任务，
  实现操作透明化和协作化。

核心理念：
  Conversation-Driven Operations
  "把运维搬进聊天室"

ChatOps 工作流：
  ┌──────────┐    命令     ┌──────────┐
  │ 用户在   │──────────→│ Chat Bot  │
  │ Slack    │           │ (Hubot/   │
  │ 输入命令 │           │  自定义)   │
  └──────────┘           └─────┬─────┘
                               │ 调用
                               ▼
                        ┌──────────────┐
                        │ 后端系统      │
                        │ K8s/Jenkins/  │
                        │ Terraform     │
                        └──────┬───────┘
                               │ 结果
                               ▼
                        ┌──────────────┐
                        │ 结果回复到    │
                        │ 聊天频道      │
                        │ 所有人可见    │
                        └──────────────┘

ChatOps 优势：
  1. 操作透明：所有操作在频道可见
  2. 知识共享：新人能看到操作过程
  3. 审计日志：天然的操作记录
  4. 降低门槛：不需要登录各种系统
  5. 协作高效：讨论+操作在同一个地方
```

### 2. ChatOps 常用工具有哪些？

**答：**

| 工具 | 类型 | 特点 |
|------|------|------|
| Slack + Bolt | 聊天+框架 | 最流行的 ChatOps 平台 |
| Microsoft Teams + Bot Framework | 聊天+框架 | 企业级 |
| Hubot | Bot 框架 | GitHub 开源，元老级 |
| Errbot | Bot 框架 | Python，插件丰富 |
| Mattermost | 聊天 | 开源 Slack 替代品 |
| PagerDuty + Slack | 事件管理 | 告警+响应集成 |
| Opsgenie | 事件管理 | 告警协作 |
| Atlantis | IaC ChatOps | Terraform PR 自动化 |

---

## 二、ChatOps 实践

### 3. 如何设计 ChatOps 命令体系？

**答：**

```
命令设计原则：
  1. 直观易记：/deploy app prod
  2. 安全分级：危险操作需确认
  3. 帮助完善：/help 列出所有命令
  4. 权限控制：不同角色不同命令

命令体系示例：
  ┌──────────────┬──────────────────────┬────────┐
  │ 命令         │ 功能                  │ 权限   │
  ├──────────────┼──────────────────────┼────────┤
  │ /status app  │ 查看服务状态          │ 所有人 │
  │ /logs app    │ 查看最近日志          │ 开发者 │
  │ /deploy app  │ 部署到指定环境        │ SRE    │
  │ /rollback    │ 回滚到上一版本        │ SRE    │
  │ /scale app 5 │ 扩容到 5 个副本       │ SRE    │
  │ /incident    │ 创建事件             │ 所有人 │
  │ /oncall      │ 查看当前 On-Call      │ 所有人 │
  │ /silence     │ 静默告警             │ SRE    │
  │ /tf plan     │ Terraform Plan       │ SRE    │
  │ /restart     │ 重启服务             │ SRE    │
  └──────────────┴──────────────────────┴────────┘

危险操作确认机制：
  用户: /restart payment-service prod
  Bot:  ⚠️ 即将重启生产环境 payment-service
        当前副本数: 5
        预计影响: ~30s 部分请求失败
        确认请输入: /confirm restart-a3f2
  用户: /confirm restart-a3f2
  Bot:  ✅ payment-service 重启成功
```

### 4. 如何基于 Slack 实现 ChatOps？

**答：**

```python
# Slack Bolt 实现 ChatOps Bot 示例
from slack_bolt import App
import subprocess
import logging

app = App(token="xoxb-...", signing_secret="...")
logger = logging.getLogger(__name__)

# 查看服务状态
@app.command("/status")
def handle_status(ack, say, command):
    ack()
    service = command['text'].strip()
    if not service:
        say("用法: /status <service-name>")
        return
    # 查询 K8s 获取 Pod 状态
    pods = get_pod_status(service)
    say(f"📊 *{service}* 状态:\n"
        f"Running: {pods['running']}\n"
        f"Pending: {pods['pending']}\n"
        f"Failed: {pods['failed']}")

# 部署（需要权限检查）
@app.command("/deploy")
def handle_deploy(ack, say, command):
    ack()
    user = command['user_id']
    if not has_permission(user, 'deploy'):
        say("❌ 你没有部署权限")
        return
    
    args = command['text'].split()
    service, env = args[0], args[1]
    
    # 生产环境需要确认
    if env == 'prod':
        token = generate_confirm_token()
        say(f"⚠️ 生产部署确认\n"
            f"服务: {service}\n"
            f"请输入: /confirm {token}")
        return
    
    # 非生产直接部署
    trigger_deployment(service, env, user)
    say(f"🚀 {service} 部署到 {env} 已触发")
```

---

## 三、告警协作

### 5. 如何在聊天工具中实现告警协作？

**答：**

```
告警协作流程：

1. 告警推送到专用频道
   #alerts-critical: P1/P2 告警
   #alerts-warning:  P3/P4 告警
   #incidents:       事件处理频道

2. 告警消息格式
   ┌─────────────────────────────────┐
   │ 🔴 P1 告警: 支付服务错误率突升   │
   ├─────────────────────────────────┤
   │ 服务: payment-api               │
   │ 错误率: 15.2% (阈值: 1%)       │
   │ 开始时间: 14:23 UTC             │
   │ Grafana: [查看面板]              │
   │ Runbook: [处理手册]              │
   ├─────────────────────────────────┤
   │ [认领] [静默] [升级]             │
   └─────────────────────────────────┘

3. 交互按钮操作
   [认领] → 记录处理人，通知团队
   [静默] → 静默告警 30 分钟
   [升级] → 通知更高级别 On-Call

4. 事件处理线程
   在告警消息下创建 Thread
   所有讨论、排查过程在 Thread 中
   自动记录时间线
```

### 6. Atlantis 如何实现 Terraform ChatOps？

**答：**

```
Atlantis 工作流：

1. 开发者提交 Terraform PR
2. Atlantis 自动运行 plan
3. Plan 结果作为 PR Comment
4. 团队 Review 代码和 Plan
5. 评论 "atlantis apply" 执行

流程图：
  PR 创建
    │
    ▼
  Atlantis 检测到 .tf 文件变更
    │
    ▼
  自动运行 terraform plan
    │
    ▼
  Plan 结果发布到 PR Comment
    │
    ▼
  Code Review + Plan Review
    │
    ▼
  评论 "atlantis apply"
    │
    ▼
  Atlantis 执行 terraform apply
    │
    ▼
  结果发布到 PR Comment

Atlantis 配置（atlantis.yaml）：
  version: 3
  projects:
    - dir: infrastructure/prod
      workspace: prod
      autoplan:
        when_modified: ["*.tf"]
        enabled: true
      apply_requirements: [approved, mergeable]
    - dir: infrastructure/staging
      workspace: staging
      autoplan:
        enabled: true

优势：
  1. PR 即变更记录
  2. Plan 可见可审核
  3. 自动锁定防并发
  4. Git 即审计日志
```

---

## 四、面试高频题

### 7. 面试题：ChatOps 的安全风险？

**答：**

```
安全风险及应对：

1. 权限控制
   风险：任何人都能执行危险命令
   应对：RBAC + Slack 用户组映射

2. 凭据泄露
   风险：Bot Token 泄露
   应对：Token 轮转 + 最小权限

3. 命令注入
   风险：用户输入恶意参数
   应对：输入白名单校验 + 参数化

4. 信息泄露
   风险：敏感信息显示在频道
   应对：脱敏 + Ephemeral 消息

5. 审计缺失
   风险：无法追溯谁执行了什么
   应对：所有操作记录日志

安全最佳实践：
  ┌──────────────────────────────┐
  │ 1. 所有参数做白名单校验       │
  │ 2. 危险操作需要二次确认       │
  │ 3. 生产操作需要双人审批       │
  │ 4. Bot 使用最小权限 Token     │
  │ 5. 敏感信息用 Ephemeral 消息  │
  │ 6. 完整的操作审计日志         │
  └──────────────────────────────┘
```

### 8. 面试题：事件响应中 ChatOps 怎么用？

**答：**

```
事件响应 ChatOps 流程：

1. 事件触发
   Alertmanager → Slack #incidents 频道
   自动创建事件频道 #inc-20240115-payment

2. 自动化操作
   /incident create "支付服务异常" severity=P1
   → 自动创建事件频道
   → 自动拉入 On-Call 人员
   → 自动创建 Jira Ticket
   → 自动开始计时

3. 排查协作
   /status payment-api     → 查看服务状态
   /logs payment-api -n 50 → 查看最近日志
   /graph latency          → 查看延迟图表

4. 修复操作
   /rollback payment-api   → 回滚上一版本
   /scale payment-api 10   → 紧急扩容

5. 事件关闭
   /incident resolve "回滚版本 v2.3.1 修复"
   → 自动停止计时
   → 自动生成时间线
   → 自动创建 PostMortem 模板
   → 通知相关人员

时间线自动记录：
  14:23 🔴 告警触发
  14:25 👤 张三认领事件
  14:28 💬 "查看日志发现 DB 连接超时"
  14:35 🔧 执行 /rollback payment-api
  14:38 ✅ 服务恢复正常
  14:40 📝 事件关闭，总耗时 17 分钟
```
