# Kubernetes 安全

---

## 1. Kubernetes 安全架构？

**回答：**

```
K8s 安全的 4C 模型:

  ┌─────────────────────────────────────────┐
  │              Cloud (云层)                │
  │  ┌───────────────────────────────────┐  │
  │  │          Cluster (集群层)          │  │
  │  │  ┌─────────────────────────────┐  │  │
  │  │  │      Container (容器层)      │  │  │
  │  │  │  ┌───────────────────────┐  │  │  │
  │  │  │  │     Code (代码层)      │  │  │  │
  │  │  │  └───────────────────────┘  │  │  │
  │  │  └─────────────────────────────┘  │  │
  │  └───────────────────────────────────┘  │
  └─────────────────────────────────────────┘

各层安全要点:
  Cloud:     网络隔离, IAM, 节点安全组, 加密
  Cluster:   API Server 认证, RBAC, NetworkPolicy, 审计
  Container: 镜像安全, SecurityContext, 运行时检测
  Code:      SAST, 依赖扫描, 安全编码

K8s API 请求流程:
  用户/ServiceAccount → API Server
    1. 认证 (Authentication): 你是谁？
       → 证书 / Token / OIDC
    2. 授权 (Authorization): 你能干什么？
       → RBAC / ABAC / Webhook
    3. 准入控制 (Admission Control): 是否允许？
       → Validating / Mutating Webhook
    4. 执行请求
```

---

## 2. RBAC 详解？

**回答：**

```
RBAC = Role-Based Access Control

四个核心对象:
  Role:              命名空间级角色 (定义权限)
  ClusterRole:       集群级角色
  RoleBinding:       将 Role 绑定到用户/ServiceAccount
  ClusterRoleBinding: 将 ClusterRole 绑定到用户/ServiceAccount
```

```yaml
# 1. 定义 Role (只能看 Pod)
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]

---
# 2. 绑定 Role 到 ServiceAccount
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  namespace: production
  name: read-pods
subjects:
- kind: ServiceAccount
  name: monitoring-sa
  namespace: production
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io

---
# 3. ClusterRole 示例 (集群级)
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: secret-reader
rules:
- apiGroups: [""]
  resources: ["secrets"]
  verbs: ["get"]         # 只读, 不能 list/watch

---
# 4. 聚合 ClusterRole
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring
  labels:
    rbac.authorization.k8s.io/aggregate-to-view: "true"
rules:
- apiGroups: ["monitoring.coreos.com"]
  resources: ["prometheuses", "alertmanagers"]
  verbs: ["get", "list", "watch"]
```

```
RBAC 最佳实践:
  ✅ 最小权限原则 (只给需要的权限)
  ✅ 使用 ServiceAccount (不用默认 SA)
  ✅ 避免使用 cluster-admin
  ✅ 避免通配符 (*) 权限
  ✅ 定期审查 RBAC (rbac-lookup / kubectl-who-can)
  ✅ 使用 namespace 隔离团队

危险权限组合:
  ❌ pods/exec: 可以 exec 进容器
  ❌ secrets: get/list: 可以获取所有密钥
  ❌ * on *: 等于集群管理员
  ❌ create pods: 可以创建特权容器
```

---

## 3. Pod 安全标准 (PSS/PSA)？

**回答：**

```
Pod Security Standards (PSS): 替代已废弃的 PodSecurityPolicy

三个安全级别:
  ┌────────────────┬──────────────────────────────────┐
  │ 级别            │ 说明                              │
  ├────────────────┼──────────────────────────────────┤
  │ Privileged     │ 无限制 (系统组件使用)               │
  │ Baseline       │ 基础限制 (阻止已知提权手段)          │
  │ Restricted     │ 严格限制 (最佳安全实践)             │
  └────────────────┴──────────────────────────────────┘

Pod Security Admission (PSA) 模式:
  enforce: 违反 → 拒绝创建
  audit:   违反 → 记录审计日志
  warn:    违反 → 返回警告信息
```

```yaml
# 在 namespace 上启用 PSA
apiVersion: v1
kind: Namespace
metadata:
  name: production
  labels:
    # 强制执行 restricted 级别
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    # 审计 restricted 违规
    pod-security.kubernetes.io/audit: restricted
    # 警告 restricted 违规
    pod-security.kubernetes.io/warn: restricted

---
# Restricted 级别要求的 Pod 配置
apiVersion: v1
kind: Pod
metadata:
  name: secure-pod
  namespace: production
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
    seccompProfile:
      type: RuntimeDefault
  containers:
  - name: app
    image: myapp:1.0
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    resources:
      limits:
        cpu: "500m"
        memory: "256Mi"
      requests:
        cpu: "100m"
        memory: "128Mi"
```

```
Restricted 级别检查清单:
  ✅ runAsNonRoot: true
  ✅ allowPrivilegeEscalation: false
  ✅ capabilities.drop: ["ALL"]
  ✅ 不使用 hostNetwork/hostPID/hostIPC
  ✅ 不使用 hostPath volumes
  ✅ 不使用 privileged: true
  ✅ seccompProfile: RuntimeDefault
  ✅ 不使用不安全的 sysctls
```

---

## 4. NetworkPolicy 网络策略？

**回答：**

```yaml
# 1. 默认拒绝所有入站流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
  namespace: production
spec:
  podSelector: {}       # 选择所有 Pod
  policyTypes:
  - Ingress             # 默认拒绝所有入站
  # 没有 ingress 规则 = 全部拒绝

---
# 2. 只允许特定流量
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend       # 目标: backend Pod
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend   # 来源: 只有 frontend Pod
    ports:
    - port: 8080
      protocol: TCP

---
# 3. 限制出站 (只允许访问数据库和 DNS)
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: restrict-egress
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Egress
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - port: 3306
  - to:                   # 允许 DNS
    - namespaceSelector: {}
    ports:
    - port: 53
      protocol: UDP
    - port: 53
      protocol: TCP
```

```
NetworkPolicy 要点:
  ✅ 需要 CNI 支持 (Calico, Cilium, Weave — 不支持: Flannel)
  ✅ 默认: 没有 NetworkPolicy = 全部允许
  ✅ 最佳实践: 先默认拒绝, 再显式允许
  ✅ 不能跨集群 (只在集群内生效)
  ✅ DNS 出站别忘开放 (否则域名解析失败)

  Calico vs Cilium:
    Calico:  iptables 实现, 成熟稳定
    Cilium:  eBPF 实现, 高性能, L7 策略 (HTTP/gRPC)
```

---

## 5. Kubernetes Secret 安全？

**回答：**

```
K8s Secret 默认问题:
  ❌ 默认只是 Base64 编码 (不是加密!)
  ❌ 存储在 etcd 中 (明文)
  ❌ 任何有 get secret 权限的人都能读

解决方案:

  1. etcd 加密 (Encryption at Rest)
```

```yaml
# /etc/kubernetes/encryption-config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
    - secrets
    providers:
    - aescbc:
        keys:
        - name: key1
          secret: <base64-encoded-32-byte-key>
    - identity: {}   # 回退到未加密 (读旧数据)
```

```
  2. External Secrets Operator
     将外部密钥管理系统同步到 K8s Secret
     支持: AWS Secrets Manager, Vault, Azure KV, GCP SM
```

```yaml
# External Secrets Operator 示例
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: db-credentials
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secretsmanager
    kind: ClusterSecretStore
  target:
    name: db-credentials    # 生成的 K8s Secret 名称
  data:
  - secretKey: password
    remoteRef:
      key: /production/db/password
```

```
  3. Sealed Secrets (GitOps 友好)
     加密 Secret → 可以安全存入 Git
     集群内 Controller 解密 → 生成 K8s Secret

  4. CSI Secret Store Driver
     直接将 Vault/云密钥挂载为 Volume
     不创建 K8s Secret 对象

Secret 最佳实践:
  ✅ etcd 静态加密
  ✅ RBAC 限制 Secret 访问
  ✅ 使用 External Secrets Operator 或 Vault
  ✅ 定期轮换 Secret
  ✅ 不要在 Pod spec 的 env 中直接写入 Secret 值
  ✅ 审计 Secret 访问日志
```

---

## 6. K8s 审计日志？

**回答：**

```yaml
# 审计策略 (/etc/kubernetes/audit-policy.yaml)
apiVersion: audit.k8s.io/v1
kind: Policy
rules:
  # 不记录健康检查
  - level: None
    users: ["system:kube-proxy"]
    verbs: ["watch"]
    resources:
    - group: ""
      resources: ["endpoints", "services"]

  # Secret 操作记录元数据 (不记录内容)
  - level: Metadata
    resources:
    - group: ""
      resources: ["secrets", "configmaps"]

  # 认证失败记录详细信息
  - level: RequestResponse
    users: ["system:anonymous"]

  # 其他操作记录请求体
  - level: Request
    resources:
    - group: ""
      resources: ["pods", "deployments", "services"]
    verbs: ["create", "update", "patch", "delete"]

  # 默认记录元数据
  - level: Metadata
    omitStages:
    - RequestReceived
```

```
审计级别:
  None:            不记录
  Metadata:        记录请求元数据 (用户/时间/资源/动作)
  Request:         记录元数据 + 请求体
  RequestResponse: 记录元数据 + 请求体 + 响应体

审计日志输出:
  文件:    --audit-log-path=/var/log/kubernetes/audit.log
  Webhook: 发送到外部日志系统 (ELK/Splunk)

关键审计事件:
  ✅ Secret 的创建/修改/删除
  ✅ RBAC 权限变更
  ✅ 特权 Pod 创建
  ✅ exec 进入容器
  ✅ 认证失败
  ✅ 跨命名空间访问
```

---

## 7. 准入控制器？

**回答：**

```
Admission Controller: API请求 → 认证 → 授权 → [准入控制] → 执行

两种类型:
  Mutating:   修改请求 (注入 sidecar, 添加默认值)
  Validating: 验证请求 (拒绝不合规配置)

执行顺序: Mutating → Validating → 持久化

常见内置准入控制器:
  LimitRanger:     强制资源限制
  ResourceQuota:   命名空间资源配额
  PodSecurity:     Pod 安全标准 (PSA)
  NodeRestriction: 限制 kubelet 权限

自定义策略引擎:
  OPA/Gatekeeper:  通用策略引擎 (Rego 语言)
  Kyverno:         K8s 原生策略  (YAML 编写)
```

```yaml
# Kyverno 策略: 禁止特权容器
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-privileged
spec:
  validationFailureAction: Enforce
  rules:
  - name: deny-privileged
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "Privileged containers are not allowed"
      pattern:
        spec:
          containers:
          - securityContext:
              privileged: "false"

---
# Kyverno 策略: 强制镜像来自可信仓库
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
          kinds:
          - Pod
    validate:
      message: "Images must be from trusted registries"
      pattern:
        spec:
          containers:
          - image: "registry.company.com/*"
```

```
OPA vs Kyverno:
  ┌────────────┬──────────────────┬──────────────────┐
  │ 特性        │ OPA/Gatekeeper    │ Kyverno          │
  ├────────────┼──────────────────┼──────────────────┤
  │ 策略语言    │ Rego (学习曲线高)  │ YAML (K8s 原生)  │
  │ 生成/变更   │ 主要验证          │ 验证 + 变更 + 生成│
  │ 通用性     │ 通用 (不限 K8s)    │ K8s 专用          │
  │ 社区       │ CNCF 毕业          │ CNCF 孵化         │
  │ 适合       │ 复杂策略/多平台    │ K8s 快速上手       │
  └────────────┴──────────────────┴──────────────────┘
```

---

## 8. K8s 集群安全加固检查？

**回答：**

```
CIS Kubernetes Benchmark:
  行业标准安全配置检查清单

  kube-bench: 自动化 CIS 检查工具
```

```bash
# 运行 kube-bench
# Master 节点
kube-bench run --targets master

# Worker 节点
kube-bench run --targets node

# 输出示例:
# [PASS] 1.1.1 Ensure API server pod spec permissions are set to 644
# [FAIL] 1.2.6 Ensure --kubelet-certificate-authority is set
# [WARN] 1.2.10 Ensure admission control plugin EventRateLimit is set

# K8s 中运行
kubectl apply -f https://raw.githubusercontent.com/aquasecurity/kube-bench/main/job.yaml
kubectl logs job/kube-bench
```

```
安全加固检查清单:

  API Server:
    ✅ 禁用匿名认证 (--anonymous-auth=false)
    ✅ 启用 RBAC (--authorization-mode=RBAC)
    ✅ 启用审计日志
    ✅ 启用准入控制器
    ✅ TLS 加密 (证书不过期)

  etcd:
    ✅ 加密通信 (peer TLS + client TLS)
    ✅ 访问控制 (只允许 API Server)
    ✅ 静态加密 Secret

  Kubelet:
    ✅ 禁用匿名访问
    ✅ 启用认证 (--authentication-token-webhook)
    ✅ 启用授权 (--authorization-mode=Webhook)
    ✅ 保护证书文件权限

  网络:
    ✅ NetworkPolicy 默认拒绝
    ✅ 不使用 hostNetwork
    ✅ 限制 NodePort 范围
    ✅ 启用 Pod 间 mTLS (Service Mesh)

  工作负载:
    ✅ Pod Security Standards (Restricted)
    ✅ 资源限制 (limits)
    ✅ 镜像来源限制
    ✅ 不使用 default ServiceAccount
```

---

## 9. Service Mesh 安全 (Istio)？

**回答：**

```
Service Mesh 安全能力:
  mTLS:     服务间双向 TLS (自动证书管理)
  认证:     请求级身份认证 (JWT)
  授权:     细粒度访问控制
  可观测性: 安全相关指标和日志

Istio mTLS:
  自动为所有 Pod 注入 Envoy Sidecar
  Pod A ← mTLS → Envoy ← mTLS → Envoy ← mTLS → Pod B
  证书由 Istio CA 自动签发和轮换
```

```yaml
# 严格 mTLS 模式 (所有流量加密)
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default
  namespace: istio-system   # 全局生效
spec:
  mtls:
    mode: STRICT             # STRICT | PERMISSIVE | DISABLE

---
# 授权策略: 只允许 frontend 访问 backend
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: backend-policy
  namespace: production
spec:
  selector:
    matchLabels:
      app: backend
  action: ALLOW
  rules:
  - from:
    - source:
        principals: ["cluster.local/ns/production/sa/frontend"]
    to:
    - operation:
        methods: ["GET", "POST"]
        paths: ["/api/*"]

---
# JWT 认证
apiVersion: security.istio.io/v1beta1
kind: RequestAuthentication
metadata:
  name: jwt-auth
spec:
  selector:
    matchLabels:
      app: backend
  jwtRules:
  - issuer: "https://auth.example.com"
    jwksUri: "https://auth.example.com/.well-known/jwks.json"
```

```
零信任网络 (Zero Trust):
  原则: "永不信任, 始终验证"
  
  传统: 网络边界 = 信任边界 (进来就信任)
  零信任: 每个请求都验证身份和权限
  
  Service Mesh 实现零信任:
    ✅ 每个服务都有身份 (SPIFFE ID)
    ✅ 所有通信加密 (mTLS)
    ✅ 每个请求都授权 (AuthorizationPolicy)
    ✅ 每个连接都审计
```

---

## 10. Kubernetes 安全面试速答？

**回答：**

```
Q: K8s RBAC 怎么用?
A: Role (命名空间) / ClusterRole (集群) 定义权限
   RoleBinding / ClusterRoleBinding 绑定到用户/SA
   最小权限原则, 避免 cluster-admin 和通配符

Q: K8s Secret 安全吗?
A: 默认不安全 (Base64, etcd 明文)
   加固: etcd 加密 + RBAC + External Secrets Operator
   最佳: Vault CSI Driver 直接挂载

Q: NetworkPolicy 怎么用?
A: 先默认拒绝所有 → 再显式允许需要的流量
   需要支持的 CNI (Calico/Cilium)
   别忘开放 DNS (53端口)

Q: PodSecurityPolicy 为什么废弃了?
A: PodSecurityPolicy 在 K8s 1.25 移除
   替代: Pod Security Standards + Pod Security Admission
   三级: Privileged / Baseline / Restricted
   通过 Namespace Label 启用

Q: 什么是准入控制器?
A: API 请求通过认证和授权后, 执行准入控制
   Mutating: 修改请求 (注入 sidecar)
   Validating: 验证请求 (拒绝不合规)
   自定义: Kyverno (YAML) / OPA Gatekeeper (Rego)

Q: K8s 安全合规怎么检查?
A: kube-bench: CIS Benchmark 自动检查
   kube-hunter: 集群渗透测试
   Polaris: 工作负载最佳实践检查
   kubeaudit: 审计工具

Q: Istio 安全功能?
A: mTLS (自动证书轮换), 零信任网络
   AuthorizationPolicy (细粒度授权)
   RequestAuthentication (JWT 认证)
```
