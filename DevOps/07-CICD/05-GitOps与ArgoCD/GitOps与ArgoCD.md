# GitOps 与 ArgoCD

---

## 1. 什么是 GitOps？核心原则？

**回答：**

GitOps 是以 Git 仓库作为**唯一事实来源 (Single Source of Truth)** 的运维模式。

```
四大原则:
  1. 声明式          所有系统状态以声明式方式定义 (YAML/HCL)
  2. 版本化不可变     所有配置存储在 Git, 有完整审计追踪
  3. 自动拉取        Agent 自动将实际状态与 Git 期望状态同步
  4. 持续协调        持续检测并修复配置漂移 (Configuration Drift)
```

### Push vs Pull 模式

```
Push Model (传统 CI/CD):
  Developer → Git Push → CI Pipeline → kubectl apply → Cluster
  问题:
    CI 需要集群凭证 (安全风险)
    单向推送, 无法感知实际状态
    配置漂移后无法自动修复

Pull Model (GitOps):
  Developer → Git Push → Git Repo ←── Agent (集群内) → Cluster
  优势:
    Agent 运行在集群内, 不暴露凭证
    双向: 检测到漂移自动修复
    Git 历史 = 完整审计日志

                    ┌──────────┐
  Developer ──push──▶│ Git Repo  │
                    └─────┬────┘
                          │ poll/webhook
                    ┌─────▼────┐
                    │  ArgoCD  │ (集群内)
                    └─────┬────┘
                    diff  │ sync
                    ┌─────▼────┐
                    │ K8s 集群  │
                    └──────────┘
```

---

## 2. ArgoCD 架构与核心概念？

**回答：**

```
ArgoCD 架构:

┌──────────────────────────────────────────────┐
│                   ArgoCD                      │
│  ┌──────────────┐  ┌───────────────────────┐ │
│  │ API Server   │  │ Application Controller│ │
│  │ (Web UI/CLI) │  │ (Reconciliation Loop) │ │
│  └──────────────┘  └───────────────────────┘ │
│  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Repo Server  │  │ ApplicationSet        │ │
│  │ (Git Ops)    │  │ Controller            │ │
│  └──────────────┘  └───────────────────────┘ │
│  ┌──────────────┐  ┌───────────────────────┐ │
│  │ Dex (SSO)    │  │ Redis (Cache)         │ │
│  └──────────────┘  └───────────────────────┘ │
└──────────────────────────────────────────────┘

核心概念:
  Application      → 一个部署单元 (Git Repo + K8s Namespace)
  Project          → 应用分组, 权限控制
  Sync             → 将 Git 状态同步到集群
  Sync Status      → Synced / OutOfSync
  Health Status    → Healthy / Degraded / Progressing / Missing
  Refresh          → 从 Git 拉取最新配置
  Prune            → 删除 Git 中不存在的资源
  Self-Heal        → 自动修复手动变更 (配置漂移)
```

---

## 3. ArgoCD Application 配置详解？

**回答：**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
  labels:
    team: backend
  finalizers:
    - resources-finalizer.argocd.argoproj.io   # 删除 App 时清理资源
spec:
  project: default

  # 源仓库配置
  source:
    repoURL: https://github.com/org/k8s-manifests.git
    targetRevision: main                # 分支/Tag/commit
    path: apps/myapp/overlays/production

    # Kustomize 配置
    kustomize:
      images:
        - myapp=registry.example.com/myapp:v1.2.3

  # Helm Chart 源
  # source:
  #   repoURL: https://charts.bitnami.com/bitnami
  #   chart: nginx
  #   targetRevision: 15.0.0
  #   helm:
  #     releaseName: myapp
  #     values: |
  #       replicaCount: 3
  #     parameters:
  #       - name: image.tag
  #         value: v1.2.3

  # 目标集群
  destination:
    server: https://kubernetes.default.svc   # 当前集群
    # server: https://remote-cluster:6443    # 远程集群
    namespace: production

  # 同步策略
  syncPolicy:
    automated:
      prune: true           # 自动删除 Git 中不存在的资源
      selfHeal: true         # 自动修复手动变更
      allowEmpty: false      # 不允许同步空资源
    syncOptions:
      - CreateNamespace=true
      - PrunePropagationPolicy=foreground
      - PruneLast=true       # 先创建新资源再删除旧资源
      - ApplyOutOfSyncOnly=true   # 只同步有差异的资源
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m

  # 忽略差异 (避免频繁同步)
  ignoreDifferences:
    - group: apps
      kind: Deployment
      jsonPointers:
        - /spec/replicas          # 忽略 HPA 修改的副本数
    - group: ""
      kind: ConfigMap
      jqPathExpressions:
        - '.data["generated-field"]'
```

---

## 4. ArgoCD CLI 与日常操作？

**回答：**

```bash
# ===== 登录 =====
argocd login argocd.example.com --grpc-web
argocd account update-password

# ===== 应用管理 =====
argocd app list
argocd app get myapp                    # 详细信息
argocd app get myapp --refresh          # 强制刷新

# 同步
argocd app sync myapp
argocd app sync myapp --prune           # 同步并删除多余资源
argocd app sync myapp --dry-run         # 预览
argocd app sync myapp --resource apps:Deployment:myapp  # 同步特定资源

# 差异对比
argocd app diff myapp
argocd app diff myapp --local ./k8s/    # 与本地目录对比

# 历史与回滚
argocd app history myapp
argocd app rollback myapp 3              # 回滚到版本 3

# 删除
argocd app delete myapp
argocd app delete myapp --cascade=false  # 不删除 K8s 资源

# ===== 仓库管理 =====
argocd repo add https://github.com/org/repo.git --username user --password token
argocd repo add https://charts.bitnami.com/bitnami --type helm --name bitnami
argocd repo list

# ===== 集群管理 =====
argocd cluster add staging-context       # 添加集群
argocd cluster list

# ===== 项目管理 =====
argocd proj create backend \
  --src https://github.com/org/* \
  --dest https://kubernetes.default.svc,production \
  --dest https://kubernetes.default.svc,staging
```

---

## 5. ApplicationSet 批量管理？

**回答：**

ApplicationSet 根据模板自动生成多个 Application。

```yaml
# 场景: 多环境部署同一个应用
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: myapp-envs
  namespace: argocd
spec:
  generators:
    - list:
        elements:
          - env: staging
            cluster: https://kubernetes.default.svc
            revision: develop
          - env: production
            cluster: https://kubernetes.default.svc
            revision: main
  template:
    metadata:
      name: 'myapp-{{env}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/org/k8s-manifests.git
        targetRevision: '{{revision}}'
        path: 'apps/myapp/overlays/{{env}}'
      destination:
        server: '{{cluster}}'
        namespace: '{{env}}'
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

```yaml
# 场景: Git 目录生成器 — 每个子目录一个应用
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: all-apps
  namespace: argocd
spec:
  generators:
    - git:
        repoURL: https://github.com/org/k8s-manifests.git
        revision: main
        directories:
          - path: apps/*
  template:
    metadata:
      name: '{{path.basename}}'
    spec:
      project: default
      source:
        repoURL: https://github.com/org/k8s-manifests.git
        targetRevision: main
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
        namespace: '{{path.basename}}'
```

### Generator 类型

```
Generator         说明                     场景
───────────      ───────────             ──────────
List              静态列表                  少量固定环境
Cluster           已注册的集群              多集群部署
Git Directory     Git 仓库目录结构          Monorepo 多应用
Git File          Git 中的 JSON/YAML 文件   配置驱动
Matrix            Generator 组合 (笛卡尔积)  多维组合
Merge             Generator 合并             覆盖默认值
Pull Request      PR/MR                     预览环境
SCM Provider      GitHub/GitLab Org          组织级别自动发现
```

---

## 6. ArgoCD 与 Helm 集成？

**回答：**

```yaml
# 方式 1: Helm Chart 仓库
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: prometheus
  namespace: argocd
spec:
  source:
    repoURL: https://prometheus-community.github.io/helm-charts
    chart: kube-prometheus-stack
    targetRevision: 56.0.0
    helm:
      releaseName: prometheus
      values: |
        grafana:
          enabled: true
          adminPassword: admin
        prometheus:
          prometheusSpec:
            retention: 30d
            storageSpec:
              volumeClaimTemplate:
                spec:
                  storageClassName: gp3
                  resources:
                    requests:
                      storage: 50Gi
  destination:
    server: https://kubernetes.default.svc
    namespace: monitoring

# 方式 2: Git 仓库中的 Helm Chart
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
spec:
  source:
    repoURL: https://github.com/org/helm-charts.git
    targetRevision: main
    path: charts/myapp
    helm:
      valueFiles:
        - values.yaml
        - values-production.yaml
      parameters:
        - name: image.tag
          value: v1.2.3
  destination:
    server: https://kubernetes.default.svc
    namespace: production
```

---

## 7. ArgoCD 多集群管理？

**回答：**

```bash
# 添加远程集群 (需要当前 kubeconfig 有目标集群 context)
argocd cluster add staging-context --name staging
argocd cluster add production-context --name production
argocd cluster list
```

```yaml
# ApplicationSet 多集群部署
apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: myapp-multicluster
  namespace: argocd
spec:
  generators:
    - clusters:
        selector:
          matchLabels:
            env: production
  template:
    metadata:
      name: 'myapp-{{name}}'
    spec:
      source:
        repoURL: https://github.com/org/k8s-manifests.git
        path: apps/myapp/overlays/production
        targetRevision: main
      destination:
        server: '{{server}}'
        namespace: production
```

```
多集群架构:

  ┌─────────────┐
  │   ArgoCD    │ (管理集群)
  │   Hub       │
  └──┬──┬──┬────┘
     │  │  │
┌────▼┐ │ ┌▼────┐
│US-E │ │ │EU-W │ (工作负载集群)
│Prod │ │ │Prod │
└─────┘ │ └─────┘
   ┌────▼────┐
   │ AP-SE   │
   │ Prod    │
   └─────────┘
```

---

## 8. ArgoCD Notifications 通知？

**回答：**

```yaml
# ConfigMap — 通知模板
apiVersion: v1
kind: ConfigMap
metadata:
  name: argocd-notifications-cm
  namespace: argocd
data:
  # Slack 集成
  service.slack: |
    token: $slack-token

  # 通知模板
  template.app-sync-succeeded: |
    message: |
      Application {{.app.metadata.name}} sync succeeded.
      Revision: {{.app.status.sync.revision}}
    slack:
      attachments: |
        [{
          "color": "#18be52",
          "title": "{{.app.metadata.name}} synced",
          "fields": [{
            "title": "Repo",
            "value": "{{.app.spec.source.repoURL}}",
            "short": true
          }]
        }]

  template.app-health-degraded: |
    message: |
      ⚠️ Application {{.app.metadata.name}} is DEGRADED!
    slack:
      attachments: |
        [{"color": "#f4c030", "title": "{{.app.metadata.name}} degraded"}]

  # 触发器
  trigger.on-sync-succeeded: |
    - when: app.status.operationState.phase in ['Succeeded']
      send: [app-sync-succeeded]

  trigger.on-health-degraded: |
    - when: app.status.health.status == 'Degraded'
      send: [app-health-degraded]
```

```yaml
# Application 添加通知注解
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  annotations:
    notifications.argoproj.io/subscribe.on-sync-succeeded.slack: "#deployments"
    notifications.argoproj.io/subscribe.on-health-degraded.slack: "#alerts"
```

---

## 9. ArgoCD 安全最佳实践？

**回答：**

```
领域              实践
──────────       ──────────────────────────────────
认证/SSO          Dex 集成 OIDC/LDAP/SAML, 禁用 admin 本地账户
RBAC              项目级别权限控制, 限制谁能同步/删除
仓库凭证           SSH Key 或 Deploy Token, 不用个人 Token
集群凭证           ServiceAccount + RBAC, 最小权限
密钥管理           Git 不存明文 Secret → 使用 Sealed Secrets / ESO
网络              ArgoCD UI HTTPS + Ingress, 限制 API 访问
审计              启用 Audit Logging
资源限制           ArgoCD 项目限制可部署的资源类型和 Namespace
```

```yaml
# ArgoCD Project RBAC
apiVersion: argoproj.io/v1alpha1
kind: AppProject
metadata:
  name: backend
  namespace: argocd
spec:
  description: Backend team project
  sourceRepos:
    - 'https://github.com/org/backend-*'     # 限制源仓库
  destinations:
    - namespace: 'backend-*'
      server: https://kubernetes.default.svc  # 限制目标
  clusterResourceWhitelist:
    - group: ''
      kind: Namespace                         # 允许创建的集群资源
  namespaceResourceBlacklist:
    - group: ''
      kind: ResourceQuota                     # 禁止修改的资源
  roles:
    - name: developer
      policies:
        - p, proj:backend:developer, applications, get, backend/*, allow
        - p, proj:backend:developer, applications, sync, backend/*, allow
      groups:
        - backend-team                        # OIDC 组映射
```

---

## 10. ArgoCD vs FluxCD 对比？

**回答：**

| 维度 | ArgoCD | FluxCD v2 |
|------|--------|-----------|
| 架构 | 中心化 Server (API + UI) | 分布式 Controllers (Toolkit) |
| UI | 丰富 Web UI + 资源树 + Diff | 无内置 UI (可用 Weave GitOps) |
| CLI | argocd CLI | flux CLI |
| 配置方式 | Application CRD | Kustomization + HelmRelease CRD |
| 多集群 | 原生支持 (argocd cluster add) | 需 Remote Kustomization |
| Helm 支持 | Application source | HelmRelease Controller |
| SSO | 内置 Dex 集成 | 无 (依赖外部) |
| 通知 | ArgoCD Notifications | Flux Notification Controller |
| Image 自动更新 | Argo CD Image Updater | Flux Image Automation |
| ApplicationSet | 批量管理 | 无原生等价物 |
| 社区 | CNCF 毕业项目 | CNCF 毕业项目 |
| 适用 | 需要 UI, 多集群, 团队协作 | 轻量, 纯 GitOps, 嵌入式 |

### 选型建议

```
需要 Web UI 和可视化            → ArgoCD
多集群管理                      → ArgoCD
团队协作 + RBAC                 → ArgoCD
轻量级 + 纯声明式               → FluxCD
不需要中心化 Server             → FluxCD
已深度使用 Kustomize/Helm       → 两者都可
大型团队 + 审计需求              → ArgoCD
```
