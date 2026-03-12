# 安全与 RBAC

---

## 1. K8s 安全架构？

**回答：**

```
K8s API 请求安全流程:

  客户端 (kubectl / Pod / 外部)
      │
      ▼
  ① 认证 (Authentication) — "你是谁?"
      │   X.509 证书
      │   Bearer Token
      │   OIDC (OpenID Connect)
      │   ServiceAccount Token
      ▼
  ② 授权 (Authorization) — "你能做什么?"
      │   RBAC (最常用)
      │   ABAC
      │   Webhook
      │   Node
      ▼
  ③ 准入控制 (Admission Control) — "请求是否合规?"
      │   Mutating Admission Webhook  — 可修改请求
      │   Validating Admission Webhook — 只校验不修改
      │   内置准入控制器:
      │     LimitRanger, ResourceQuota, PodSecurity
      ▼
  ④ API Server 处理请求
      │
      ▼
  ⑤ etcd 存储

安全层次:
  集群安全  — API Server 安全, etcd 加密, 网络策略
  Node 安全 — kubelet 认证, 容器运行时安全
  Pod 安全  — SecurityContext, PodSecurity Standards
  网络安全  — NetworkPolicy, mTLS (Service Mesh)
  镜像安全  — 镜像扫描, 签名验证
  秘钥安全  — Secret 加密, 外部密钥管理
```

---

## 2. RBAC 详解？

**回答：**

```
RBAC (Role-Based Access Control) 基于角色的访问控制

核心概念:
  Subject (主体)     — User / Group / ServiceAccount
  Role (角色)        — 权限集合 (命名空间级 / 集群级)
  Binding (绑定)     — 将 Subject 绑定到 Role

  Subject ──── RoleBinding ──── Role          (命名空间级)
  Subject ──── ClusterRoleBinding ──── ClusterRole  (集群级)

  也可以:
  Subject ──── RoleBinding ──── ClusterRole   (在特定 Namespace 使用 ClusterRole)
```

### Role 与 ClusterRole

```yaml
# Role — 命名空间级权限
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
  - apiGroups: [""]              # "" 表示 core API group
    resources: ["pods", "pods/log", "pods/status"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["services"]
    verbs: ["get", "list"]
  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch"]

# ClusterRole — 集群级权限
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-reader
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["namespaces"]
    verbs: ["get", "list"]
  - nonResourceURLs: ["/healthz", "/metrics"]
    verbs: ["get"]

# verbs 列表:
#   get, list, watch        — 读操作
#   create                  — 创建
#   update, patch           — 修改
#   delete, deletecollection — 删除
#   *                       — 所有操作

# 限制特定资源名称:
rules:
  - apiGroups: [""]
    resources: ["configmaps"]
    resourceNames: ["myapp-config"]    # 只能操作特定 ConfigMap
    verbs: ["get", "update"]
```

### RoleBinding 与 ClusterRoleBinding

```yaml
# RoleBinding — 命名空间级绑定
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: production
subjects:
  - kind: User
    name: alice
    apiGroup: rbac.authorization.k8s.io
  - kind: Group
    name: dev-team
    apiGroup: rbac.authorization.k8s.io
  - kind: ServiceAccount
    name: monitoring-sa
    namespace: monitoring
roleRef:
  kind: Role                    # 或 ClusterRole
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io

# ClusterRoleBinding — 集群级绑定
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: cluster-admin-binding
subjects:
  - kind: User
    name: admin
    apiGroup: rbac.authorization.k8s.io
roleRef:
  kind: ClusterRole
  name: cluster-admin            # 内置, 最高权限
  apiGroup: rbac.authorization.k8s.io
```

### 内置 ClusterRole

```
admin        — Namespace 管理员 (几乎所有资源的所有操作)
edit         — 读写大部分资源 (不能修改 Role/RoleBinding)
view         — 只读 (不能查看 Secret)
cluster-admin — 超级管理员 (所有资源所有操作)
```

---

## 3. ServiceAccount 详解？

**回答：**

```
ServiceAccount (SA) 是 Pod 在 K8s 中的身份
每个 Namespace 自动创建 default SA
Pod 通过 SA 访问 API Server
```

```yaml
# 创建 ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: myapp-sa
  namespace: production
  annotations:
    # AWS IRSA (IAM Roles for Service Accounts)
    eks.amazonaws.com/role-arn: arn:aws:iam::123456789:role/myapp-role
automountServiceAccountToken: false   # 不自动挂载 Token

---
# Pod 使用 SA
spec:
  serviceAccountName: myapp-sa
  automountServiceAccountToken: true  # 按需挂载

# Token 挂载路径:
#   /var/run/secrets/kubernetes.io/serviceaccount/
#     token      — JWT Token
#     ca.crt     — API Server CA 证书
#     namespace  — 当前命名空间
```

### Bound Service Account Token (K8s 1.22+)

```yaml
# 旧方式: Secret 中的永久 Token (不安全)
# 新方式: TokenRequest API 签发有时效的 Token

# 投射 Token (projected volume)
spec:
  containers:
    - name: app
      volumeMounts:
        - name: token
          mountPath: /var/run/secrets/tokens
  volumes:
    - name: token
      projected:
        sources:
          - serviceAccountToken:
              path: api-token
              expirationSeconds: 3600    # 1小时过期
              audience: api              # Token 受众
```

```bash
# 手动创建 Token
kubectl create token myapp-sa --duration=1h

# 查看 SA
kubectl get sa -n production
kubectl describe sa myapp-sa -n production
```

---

## 4. Pod Security Standards 与 Pod Security Admission？

**回答：**

```
Pod Security Standards (PSS) 定义三种安全级别:

级别          描述                允许的操作
────────────  ──────────────────  ──────────────────────
Privileged    不限制              所有 (system namespace)
Baseline      最基本限制          禁止: 特权容器、hostPath、
                                       hostNetwork、hostPID
Restricted    严格限制            + 必须: 非 root、只读 rootFS、
                                       drop ALL capabilities、
                                       Seccomp profile

Pod Security Admission (PSA) — K8s 1.25+ GA (替代 PodSecurityPolicy)
  通过 Namespace label 启用
```

```yaml
# 通过 Namespace label 配置
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    # enforce — 违反直接拒绝
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest

    # warn — 违反只告警
    pod-security.kubernetes.io/warn: restricted
    pod-security.kubernetes.io/warn-version: latest

    # audit — 违反记录审计日志
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/audit-version: latest
```

```yaml
# 满足 Restricted 级别的 Pod
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        readOnlyRootFilesystem: true
        runAsUser: 1000
        runAsGroup: 3000
```

---

## 5. SecurityContext 详解？

**回答：**

```yaml
# Pod 级别 SecurityContext
spec:
  securityContext:
    runAsUser: 1000            # UID
    runAsGroup: 3000           # GID
    fsGroup: 2000              # Volume 文件组
    runAsNonRoot: true         # 禁止 root
    supplementalGroups:        # 补充组
      - 4000
    seccompProfile:            # Seccomp 策略
      type: RuntimeDefault
    sysctls:                   # 安全 sysctl
      - name: net.core.somaxconn
        value: "1024"

  # Container 级别 SecurityContext (优先于 Pod 级别)
  containers:
    - name: app
      securityContext:
        runAsUser: 1000
        runAsNonRoot: true
        readOnlyRootFilesystem: true  # 只读根文件系统
        allowPrivilegeEscalation: false  # 禁止提权
        privileged: false              # 禁止特权模式
        capabilities:
          drop: ["ALL"]                # 丢弃所有 capabilities
          add: ["NET_BIND_SERVICE"]    # 按需添加
        seccompProfile:
          type: RuntimeDefault
```

```
capabilities 常见值:
  NET_BIND_SERVICE — 绑定 <1024 端口
  NET_RAW          — 原始网络包
  SYS_TIME         — 修改系统时间
  SYS_PTRACE       — 进程跟踪
  CHOWN            — 修改文件所有者
  DAC_OVERRIDE     — 绕过文件权限检查
  SETUID/SETGID    — 修改进程 UID/GID

安全最佳实践:
  drop: ["ALL"] 然后按需 add
```

---

## 6. 网络安全 — mTLS 与 Service Mesh？

**回答：**

```
默认情况下, K8s Pod 间通信是明文的

mTLS (Mutual TLS):
  双向 TLS 认证, 所有服务间通信加密
  通常由 Service Mesh 自动管理

实现方式:
  1. Istio
     自动注入 Envoy Sidecar
     所有流量经 Envoy 代理, 自动 mTLS
     PeerAuthentication 配置 mTLS 模式

  2. Linkerd
     轻量级, 自动 mTLS
     无需额外配置

  3. Cilium
     基于 eBPF, 无 Sidecar
     WireGuard 加密

  4. NetworkPolicy
     网络层隔离, 但不加密
```

```yaml
# Istio PeerAuthentication
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: production
spec:
  mtls:
    mode: STRICT              # PERMISSIVE / STRICT / DISABLE

# Istio AuthorizationPolicy
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: allow-frontend
  namespace: production
spec:
  selector:
    matchLabels:
      app: backend
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/production/sa/frontend-sa"]
      to:
        - operation:
            methods: ["GET", "POST"]
            paths: ["/api/*"]
```

---

## 7. Admission Controller 与 Webhook？

**回答：**

```
Admission Controller 在请求被持久化到 etcd 之前拦截和处理

两种类型:
  Mutating Admission Webhook
    可以修改请求对象
    例: 自动注入 Sidecar、设置默认值

  Validating Admission Webhook
    只能接受或拒绝请求
    例: 检查镜像是否来自可信 Registry、禁止 latest 标签

执行顺序:
  API 请求 → Mutating Webhooks → Validating Webhooks → 持久化
```

```yaml
# ValidatingWebhookConfiguration 示例
apiVersion: admissionregistration.k8s.io/v1
kind: ValidatingWebhookConfiguration
metadata:
  name: image-policy
webhooks:
  - name: validate-image.example.com
    rules:
      - apiGroups: [""]
        apiVersions: ["v1"]
        operations: ["CREATE", "UPDATE"]
        resources: ["pods"]
    clientConfig:
      service:
        name: image-validator
        namespace: security
        path: /validate
      caBundle: <base64-ca>
    admissionReviewVersions: ["v1"]
    sideEffects: None
    failurePolicy: Fail          # Fail / Ignore
    namespaceSelector:
      matchExpressions:
        - key: environment
          operator: In
          values: ["production"]
```

```
常用 Admission Controller (Policy Engine):
  OPA/Gatekeeper  — 通用策略引擎, Rego 语言
  Kyverno         — K8s 原生策略引擎, YAML 声明式
  
  常见策略:
    - 禁止使用 latest 镜像标签
    - 必须设置 resources requests/limits
    - 必须包含特定 labels
    - 禁止特权容器
    - 镜像只能来自可信 Registry
```

---

## 8. Audit 审计日志？

**回答：**

```
K8s 审计日志记录所有 API 请求

审计级别:
  None      — 不记录
  Metadata  — 记录请求元数据 (用户、时间、资源、操作)
  Request   — 记录元数据 + 请求体
  RequestResponse — 记录元数据 + 请求体 + 响应体
```

```yaml
# 审计策略 /etc/kubernetes/audit-policy.yaml
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  # 不审计健康检查
  - level: None
    users: ["system:kube-proxy"]
    resources:
      - group: ""
        resources: ["endpoints", "services"]

  # Secret 操作记录元数据
  - level: Metadata
    resources:
      - group: ""
        resources: ["secrets"]

  # 其他写操作记录请求体
  - level: Request
    verbs: ["create", "update", "patch", "delete"]
    resources:
      - group: ""
      - group: "apps"

  # 默认记录元数据
  - level: Metadata

# kube-apiserver 配置
# --audit-policy-file=/etc/kubernetes/audit-policy.yaml
# --audit-log-path=/var/log/kubernetes/audit.log
# --audit-log-maxage=30
# --audit-log-maxbackup=10
# --audit-log-maxsize=100
```

---

## 9. 镜像安全与供应链安全？

**回答：**

```
镜像安全措施:

1. 镜像扫描
   CI 中扫描 → 阻止有漏洞的镜像部署
   工具: Trivy, Grype, Snyk

2. 镜像签名
   Cosign 签名 → 验证镜像完整性
   Sigstore / Notary v2

3. 准入控制
   只允许来自可信 Registry 的镜像
   验证镜像签名

4. 最小权限镜像
   distroless / scratch 基础镜像
   不安装不需要的工具
```

```yaml
# Kyverno 策略: 只允许可信 Registry
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-image-registries
spec:
  validationFailureAction: Enforce
  rules:
    - name: validate-registries
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Images must be from trusted registries"
        pattern:
          spec:
            containers:
              - image: "registry.example.com/* | gcr.io/myproject/*"

# Kyverno 策略: 禁止 latest 标签
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
    - name: validate-image-tag
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Using 'latest' tag is not allowed"
        pattern:
          spec:
            containers:
              - image: "!*:latest"
```

---

## 10. K8s 安全最佳实践清单？

**回答：**

```
[ API Server ]
  □ 启用 RBAC
  □ 禁用匿名访问
  □ 启用审计日志
  □ 启用 Admission Controller (Pod Security Admission)
  □ API Server 仅内网暴露
  □ 启用 etcd 加密

[ 认证与授权 ]
  □ 最小权限原则
  □ 每个应用使用独立 ServiceAccount
  □ 不使用 default ServiceAccount
  □ automountServiceAccountToken: false (按需挂载)
  □ 定期审查 RBAC 权限
  □ 禁用 system:anonymous 绑定

[ Pod 安全 ]
  □ runAsNonRoot: true
  □ readOnlyRootFilesystem: true
  □ allowPrivilegeEscalation: false
  □ capabilities: drop ALL, 按需添加
  □ seccompProfile: RuntimeDefault
  □ 不使用 hostNetwork/hostPID/hostIPC
  □ 设置 resources requests/limits

[ 网络安全 ]
  □ 默认拒绝 NetworkPolicy
  □ 只开放必要端口
  □ 启用 mTLS (Service Mesh)
  □ Ingress TLS 终止

[ 镜像安全 ]
  □ 使用最小基础镜像
  □ 镜像扫描 (CI 集成)
  □ 镜像签名验证
  □ 只允许可信 Registry
  □ 不使用 latest 标签

[ Secret 管理 ]
  □ 启用 etcd 加密
  □ 使用外部密钥管理
  □ RBAC 限制 Secret 访问
  □ Secret 不存入 Git

[ 运维安全 ]
  □ 集群版本及时更新
  □ 节点系统安全加固
  □ 网络分段
  □ 监控异常行为 (Falco)
  □ 定期 CIS Benchmark 检查
```
