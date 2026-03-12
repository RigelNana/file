# K8s 生产实践与进阶

---

## 1. Helm 包管理器详解？

**回答：**

Helm 是 Kubernetes 的包管理器，用 Chart 定义、安装和管理应用。

```bash
# ===== 常用命令 =====
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo nginx
helm search hub nginx                  # Artifact Hub

# 安装
helm install myapp bitnami/nginx
helm install myapp bitnami/nginx -f values.yaml
helm install myapp bitnami/nginx --set replicaCount=3
helm install myapp bitnami/nginx -n production --create-namespace

# 升级与回滚
helm upgrade myapp bitnami/nginx -f values-v2.yaml
helm rollback myapp 1                  # 回滚到版本 1
helm history myapp                     # 查看历史

# 查看与删除
helm list -A
helm status myapp
helm get values myapp                  # 查看当前 values
helm get manifest myapp                # 查看渲染后的 YAML
helm uninstall myapp
```

### Chart 目录结构

```
mychart/
├── Chart.yaml              # Chart 元数据 (name, version, appVersion)
├── values.yaml             # 默认配置
├── charts/                 # 依赖 Chart
├── templates/              # K8s 清单模板
│   ├── deployment.yaml
│   ├── service.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── _helpers.tpl        # 模板函数
│   ├── NOTES.txt           # 安装后提示
│   └── tests/
│       └── test-connection.yaml
└── .helmignore
```

### 模板语法

```yaml
# templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "mychart.fullname" . }}
  labels:
    {{- include "mychart.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "mychart.selectorLabels" . | nindent 6 }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
          ports:
            - containerPort: {{ .Values.service.port }}
          {{- if .Values.resources }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
          {{- end }}

# values.yaml
replicaCount: 2
image:
  repository: nginx
  tag: "1.25"
service:
  port: 80
resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 200m
    memory: 256Mi
```

---

## 2. GitOps 与 ArgoCD？

**回答：**

```
GitOps 理念:
  Git 仓库 = 唯一事实来源 (Single Source of Truth)
  所有变更通过 Git PR/MR
  自动化工具将 Git 状态同步到集群

Push Model (传统 CI/CD):
  CI/CD Pipeline → kubectl apply → Cluster
  问题: 需要集群凭证; 单向, 不知道实际状态

Pull Model (GitOps):
  Git Repo ← Agent (集群内) → Cluster
  优势: 集群内运行, 不暴露凭证; 自动检测偏差并修复
```

### ArgoCD

```yaml
# Application CRD
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/k8s-manifests.git
    targetRevision: main
    path: apps/myapp/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true           # 删除 Git 中不存在的资源
      selfHeal: true         # 自动修复偏差
    syncOptions:
      - CreateNamespace=true

# 常用命令
argocd app list
argocd app get myapp
argocd app sync myapp
argocd app diff myapp
argocd app history myapp
argocd app rollback myapp <revision>
```

| 对比 | ArgoCD | FluxCD |
|------|--------|--------|
| 架构 | 中心化 Server + UI | 分布式 Controller |
| UI | 丰富的 Web UI | 无内置 UI (可用 Weave GitOps) |
| 多集群 | 原生支持 | 需要额外配置 |
| 应用定义 | Application CRD | Kustomization/HelmRelease CRD |
| SSO | 内置 Dex 集成 | 无 |
| 社区 | CNCF 孵化项目 | CNCF 孵化项目 |

---

## 3. 蓝绿/金丝雀发布？

**回答：**

```
发布策略对比:

滚动更新 (Rolling Update):
  旧 ████████░░░░
  新 ░░░░████████
  → Deployment 原生支持, 逐步替换

蓝绿 (Blue-Green):
  蓝 ████████████ (当前生产)
  绿 ████████████ (新版本)
  → 切换 Service selector, 秒级切换/回滚

金丝雀 (Canary):
  旧 ██████████░░ (90%)
  新 ██░░░░░░░░░░ (10%)
  → 逐步增加新版本流量比例
```

### Argo Rollouts

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp
spec:
  replicas: 10
  strategy:
    canary:
      steps:
        - setWeight: 10         # 10% 流量到新版本
        - pause: { duration: 5m }
        - setWeight: 30
        - pause: { duration: 5m }
        - setWeight: 60
        - pause: { duration: 5m }
        - setWeight: 100
      canaryService: myapp-canary
      stableService: myapp-stable
      trafficRouting:
        nginx:
          stableIngress: myapp-ingress
  selector:
    matchLabels:
      app: myapp
  template:
    metadata:
      labels:
        app: myapp
    spec:
      containers:
        - name: myapp
          image: myapp:v2
```

---

## 4. Operator 与 CRD？

**回答：**

```
Operator 模式:
  CRD (自定义资源)
   + Controller (自定义控制循环)
   = Operator

将运维知识编码为软件, 自动管理有状态应用

示例:
  PostgreSQL Operator → 自动创建集群、备份、恢复、高可用
  Prometheus Operator → 自动管理 Prometheus 配置
  Cert-Manager → 自动签发和续期 TLS 证书
```

### CRD 定义

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: databases.myapp.example.com
spec:
  group: myapp.example.com
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                engine:
                  type: string
                  enum: ["postgres", "mysql"]
                version:
                  type: string
                replicas:
                  type: integer
                  minimum: 1
                storage:
                  type: string
  scope: Namespaced
  names:
    plural: databases
    singular: database
    kind: Database
    shortNames:
      - db

---
# 自定义资源实例
apiVersion: myapp.example.com/v1
kind: Database
metadata:
  name: my-postgres
spec:
  engine: postgres
  version: "16"
  replicas: 3
  storage: 100Gi
```

### 常用 Operator

```
类别                 Operator
────────────────     ──────────────────────────
数据库               CloudNativePG, Percona, Zalando Postgres
消息队列             Strimzi (Kafka), RabbitMQ Cluster
监控                 Prometheus Operator (kube-prometheus-stack)
证书                 cert-manager
存储                 Rook (Ceph)
弹性搜索             ECK (Elastic Cloud on K8s)
Redis                Redis Operator (Spotahome)

发现 Operator:
  OperatorHub.io
  Artifact Hub
```

---

## 5. 多集群管理？

**回答：**

```
场景:
  高可用 → 跨区域部署
  合规 → 数据主权要求
  环境隔离 → dev/staging/prod 各一个集群
  团队隔离 → 不同团队独立集群

方案对比:

工具             适用场景                   核心特性
───────────     ─────────────────────     ─────────────
kubefed         联邦部署                    资源跨集群分发
Rancher         企业管理                    统一 UI, RBAC, 应用商店
ArgoCD          GitOps 多集群部署           Application CRD + 多集群
Loft / vCluster 虚拟集群                    一个物理集群切分多个虚拟集群
Karmada         多集群调度                   CNCF, 兼容 K8s API
Submariner      跨集群网络                   Service 跨集群互通

# kubeconfig 多集群管理
kubectl config get-contexts
kubectl config use-context prod-cluster
kubectl --context=staging-cluster get pods
```

---

## 6. 高可用集群架构？

**回答：**

```
高可用 Control Plane:

                    ┌─────────────┐
                    │  Load       │
                    │  Balancer   │ (HAProxy / Cloud LB)
                    │  :6443      │
                    └──────┬──────┘
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Master 1 │ │ Master 2 │ │ Master 3 │
        │ API Srv  │ │ API Srv  │ │ API Srv  │
        │ Sched    │ │ Sched    │ │ Sched    │ (leader)
        │ CM       │ │ CM       │ │ CM       │ (leader)
        │ etcd     │ │ etcd     │ │ etcd     │
        └──────────┘ └──────────┘ └──────────┘

关键点:
  etcd:           奇数节点 (3 或 5), Raft 共识
  API Server:     无状态, 可多副本, LB 负载
  Scheduler:      Leader 选举, 一个活跃
  Controller Mgr: Leader 选举, 一个活跃

拓扑模式:
  Stacked etcd:   etcd 与 Master 同节点 (简单, 资源耦合)
  External etcd:  etcd 独立部署 (更稳定, 需额外节点)

etcd 节点数量与容错:
  3 节点 → 容忍 1 个故障 (多数 = 2)
  5 节点 → 容忍 2 个故障 (多数 = 3)
  7 节点 → 容忍 3 个故障 (一般不需要)
```

---

## 7. 备份与灾备 (Velero)？

**回答：**

```bash
# Velero: K8s 集群备份和恢复工具
# 支持: AWS S3, GCS, Azure Blob, MinIO

# 安装
velero install \
  --provider aws \
  --plugins velero/velero-plugin-for-aws:v1.8.0 \
  --bucket velero-backups \
  --backup-location-config region=us-east-1 \
  --snapshot-location-config region=us-east-1 \
  --secret-file ./credentials

# 备份 (全集群)
velero backup create full-backup

# 备份 (指定 Namespace)
velero backup create prod-backup --include-namespaces production

# 备份 (按 Label)
velero backup create app-backup --selector app=myapp

# 定时备份
velero schedule create daily-backup \
  --schedule="0 2 * * *" \
  --include-namespaces production \
  --ttl 720h                            # 保留 30 天

# 查看备份
velero backup get
velero backup describe full-backup
velero backup logs full-backup

# 恢复
velero restore create --from-backup full-backup
velero restore create --from-backup full-backup --include-namespaces production

# 集群迁移
# 源集群备份 → 对象存储 → 目标集群安装 Velero (同一存储) → 恢复

# 备份内容:
#   所有 K8s 资源 (YAML)
#   PV 数据 (通过 CSI 快照或 Restic/Kopia)
```

---

## 8. 成本优化？

**回答：**

```
策略                   方法
────────────────      ──────────────────────────────────
资源 requests 优化     使用 VPA 推荐值, 避免过度申请
Spot/竞价实例          非关键工作负载使用 Spot, 配合 tolerations
节点自动伸缩           Cluster Autoscaler / Karpenter 按需扩缩
Pod 自动伸缩           HPA 按负载扩缩, 低谷缩容
资源配额               ResourceQuota 防止单 Namespace 过度使用
空闲资源回收           LimitRange 设置默认 limits; 清理闲置资源
多租户共享             Namespace 隔离, 共享集群
右尺寸 Right-Sizing    VPA 分析历史数据推荐 requests/limits
工具                  kubecost, opencost → 监控成本分配

# 关键实践:
# 1. 设置合理的 requests (不过高)
# 2. 设置 limits 防止单 Pod 占用过多
# 3. 非生产环境缩容或定时关停
# 4. 使用 Spot + On-Demand 混合
# 5. 定期检查未使用的 PVC、LB、IP
```

---

## 9. 从 Docker Compose 迁移到 K8s？

**回答：**

```
迁移步骤:

1. 分析 docker-compose.yaml
   - 服务列表
   - 环境变量 → ConfigMap/Secret
   - 数据卷 → PVC
   - 端口映射 → Service
   - 依赖关系 → Init Container / readinessProbe

2. 为每个服务创建:
   - Deployment (无状态) / StatefulSet (有状态)
   - Service (ClusterIP 内部, NodePort/Ingress 外部)
   - ConfigMap / Secret
   - PVC (持久化数据)

3. 工具辅助:
   - Kompose: docker-compose → K8s 清单
     kompose convert -f docker-compose.yaml
```

### 对照示例

```yaml
# docker-compose.yaml
services:
  web:
    image: myapp:v1
    ports: ["8080:80"]
    environment:
      DB_HOST: db
    depends_on: [db]
  db:
    image: postgres:16
    volumes: ["pgdata:/var/lib/postgresql/data"]
    environment:
      POSTGRES_PASSWORD: secret

# 对应的 K8s 清单:
# 1. db-secret.yaml (Secret)
# 2. db-statefulset.yaml (StatefulSet + PVC)
# 3. db-service.yaml (Headless Service)
# 4. web-configmap.yaml (ConfigMap: DB_HOST=db)
# 5. web-deployment.yaml (Deployment)
# 6. web-service.yaml (Service / Ingress)
```

```
注意事项:
  depends_on    → K8s 无此机制, 用 Init Container 等待依赖
  build         → 需要单独 CI 构建镜像推送到 Registry
  volumes       → 需要选择合适的 StorageClass
  network       → K8s 每个 Pod 有独立 IP, Service 做服务发现
  .env 文件     → 转为 ConfigMap/Secret
```

---

## 10. K8s 生产环境检查清单？

**回答：**

```
===== 安全 =====
□ RBAC 最小权限
□ Pod Security Standards 启用
□ ServiceAccount Token 自动挂载关闭 (不需要时)
□ NetworkPolicy 默认拒绝
□ Secret 加密存储 (etcd encryption)
□ 镜像只用受信 Registry
□ 容器非 root 运行
□ 只读根文件系统

===== 可靠性 =====
□ 所有 Deployment replicas ≥ 2
□ Pod Anti-Affinity (分散到不同 Node)
□ PDB 设置 (minAvailable / maxUnavailable)
□ readinessProbe + livenessProbe 配置
□ resources requests & limits 设置
□ Topology Spread Constraints
□ 优雅终止 (preStop + terminationGracePeriodSeconds)

===== 运维 =====
□ etcd 定时备份
□ 集群备份 (Velero)
□ 监控 (Prometheus + Grafana)
□ 日志 (Fluent Bit + Loki/ES)
□ 告警 (AlertManager)
□ 集群升级计划
□ 灾备演练

===== 网络 =====
□ Ingress TLS 配置
□ cert-manager 自动续期
□ DNS 配置正确
□ 外部服务使用 ExternalName 或 Endpoints

===== 资源管理 =====
□ Namespace 隔离
□ ResourceQuota 配置
□ LimitRange 配置
□ HPA / VPA 配置
□ Cluster Autoscaler / Karpenter

===== CI/CD =====
□ GitOps (ArgoCD / FluxCD)
□ 镜像版本用具体 tag, 不用 latest
□ Helm Chart 版本管理
□ 金丝雀/蓝绿发布策略
```
