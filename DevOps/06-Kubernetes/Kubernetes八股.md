# Kubernetes 八股文

---

## 一、K8s 基础概念

### 1. Kubernetes 是什么？为什么需要它？

**答：** Kubernetes（K8s）是 Google 开源的**容器编排平台**，用于自动化部署、扩缩容和管理容器化应用。

**解决的问题：**
- **服务发现与负载均衡**：自动为容器分配 DNS 和 IP
- **自动扩缩容**：根据负载自动调整副本数
- **自我修复**：自动重启失败容器、替换和杀死不健康的容器
- **滚动更新与回滚**：零停机部署，支持回滚到任意版本
- **配置与密钥管理**：安全管理配置和敏感信息
- **存储编排**：自动挂载存储系统

### 2. K8s 的整体架构是怎样的？

**答：**

```
┌─────────────────────────────────────────────────────────────┐
│                     Control Plane (Master)                   │
│  ┌──────────┐ ┌───────────────┐ ┌───────────────────────┐   │
│  │ API Server│ │ Scheduler     │ │ Controller Manager    │   │
│  └──────────┘ └───────────────┘ └───────────────────────┘   │
│  ┌──────────┐ ┌───────────────┐                             │
│  │  etcd    │ │ Cloud Controller│ (可选)          │
│  └──────────┘ └───────────────┘                             │
└─────────────────────────────────────────────────────────────┘
                          ↕ API
┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐
│   Worker Node 1  │  │   Worker Node 2  │  │  Worker Node 3 │
│  ┌────────────┐  │  │  ┌────────────┐  │  │  ┌──────────┐  │
│  │  kubelet   │  │  │  │  kubelet   │  │  │  │ kubelet  │  │
│  │  kube-proxy│  │  │  │  kube-proxy│  │  │  │kube-proxy│  │
│  │  Container │  │  │  │  Container │  │  │  │Container │  │
│  │  Runtime   │  │  │  │  Runtime   │  │  │  │Runtime   │  │
│  │ ┌───┐┌───┐│  │  │  │ ┌───┐┌───┐ │  │  │  │┌───┐     │  │
│  │ │Pod││Pod││  │  │  │ │Pod││Pod│ │  │  │  ││Pod│     │  │
│  │ └───┘└───┘│  │  │  │ └───┘└───┘ │  │  │  │└───┘     │  │
│  └────────────┘  │  │  └────────────┘  │  │  └──────────┘  │
└──────────────────┘  └──────────────────┘  └────────────────┘
```

### 3. 各组件的作用是什么？

**答：**

**Control Plane 组件：**

| 组件 | 作用 |
|------|------|
| **API Server** | K8s 的入口，所有操作都通过它（RESTful API），负责认证、授权、准入 |
| **etcd** | 分布式 KV 存储，保存集群所有状态数据 |
| **Scheduler** | 调度 Pod 到合适的 Node（考虑资源、亲和性、污点等） |
| **Controller Manager** | 运行各种控制器（Deployment、ReplicaSet、Node 等） |
| **Cloud Controller Manager** | 与云平台交互（可选） |

**Node 组件：**

| 组件 | 作用 |
|------|------|
| **kubelet** | 每个 Node 上的代理，管理 Pod 生命周期 |
| **kube-proxy** | 维护网络规则，实现 Service 的负载均衡 |
| **Container Runtime** | 容器运行时（containerd、CRI-O） |

---

## 二、核心资源对象

### 4. Pod 是什么？为什么不直接运行容器？

**答：** Pod 是 K8s 中最小的可部署单元，包含一个或多个紧密耦合的容器。

**为什么需要 Pod：**
- 共享网络命名空间（同一 Pod 内容器共享 IP 和端口）
- 共享存储卷
- 共享进程命名空间（可选）
- 通过 Pause 容器维持网络命名空间

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp
  labels:
    app: myapp
spec:
  containers:
    - name: app
      image: myapp:1.0
      ports:
        - containerPort: 8080
      resources:
        requests:
          memory: "128Mi"
          cpu: "250m"
        limits:
          memory: "256Mi"
          cpu: "500m"
      livenessProbe:
        httpGet:
          path: /health
          port: 8080
        initialDelaySeconds: 15
        periodSeconds: 10
      readinessProbe:
        httpGet:
          path: /ready
          port: 8080
        initialDelaySeconds: 5
        periodSeconds: 5
```

### 5. Pod 的生命周期和状态有哪些？

**答：**

| 阶段 (Phase) | 说明 |
|-------------|------|
| Pending | Pod 已被创建，但容器还未运行（拉取镜像、调度中） |
| Running | Pod 已绑定到节点，至少一个容器正在运行 |
| Succeeded | 所有容器正常退出（常见于 Job） |
| Failed | 至少一个容器非正常退出 |
| Unknown | 无法获取 Pod 状态（通常是 Node 通信失败） |

**常见 Pod 状态（Status）：**

| 状态 | 说明 |
|------|------|
| ContainerCreating | 容器创建中 |
| Running | 运行中 |
| CrashLoopBackOff | 容器不断崩溃和重启 |
| ImagePullBackOff | 镜像拉取失败 |
| ErrImagePull | 镜像拉取错误 |
| OOMKilled | 内存不足被杀死 |
| Evicted | 被驱逐（节点资源不足） |
| Terminating | 正在终止 |

### 6. Init Container 和 Sidecar Container 是什么？

**答：**

**Init Container（初始化容器）：**
- 在主容器启动前运行，按顺序逐个执行
- 常用于：等待依赖服务就绪、下载配置文件、数据库迁移

```yaml
spec:
  initContainers:
    - name: wait-for-db
      image: busybox
      command: ['sh', '-c', 'until nc -z db-service 5432; do sleep 2; done']
  containers:
    - name: app
      image: myapp:1.0
```

**Sidecar Container（边车容器）：**
- 与主容器一起运行，提供辅助功能
- 常用于：日志收集、代理、监控、服务网格

```yaml
spec:
  containers:
    - name: app
      image: myapp:1.0
    - name: log-agent       # Sidecar
      image: fluentd
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
```

### 7. Deployment、ReplicaSet、DaemonSet、StatefulSet 的区别？

**答：**

| 控制器 | 作用 | 适用场景 |
|-------|------|---------|
| **Deployment** | 管理无状态应用的声明式更新，控制 ReplicaSet | Web 应用、API 服务 |
| **ReplicaSet** | 维持指定数量的 Pod 副本（通常由 Deployment 管理） | 一般不直接使用 |
| **DaemonSet** | 在每个（或指定）Node 上运行一个 Pod | 日志收集、监控 Agent |
| **StatefulSet** | 管理有状态应用，提供稳定的网络标识和持久存储 | 数据库、ZooKeeper、Kafka |
| **Job** | 运行一次性任务 | 数据处理、迁移 |
| **CronJob** | 定时运行任务 | 定时备份、清理 |

### 8. Deployment 的 YAML 完整示例？

**答：**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
  namespace: production
  labels:
    app: myapp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1            # 更新时最多多出1个Pod
      maxUnavailable: 0      # 更新时不允许不可用
  template:
    metadata:
      labels:
        app: myapp
        version: "1.0"
    spec:
      containers:
        - name: myapp
          image: myapp:1.0
          ports:
            - containerPort: 8080
          env:
            - name: DB_HOST
              valueFrom:
                configMapKeyRef:
                  name: myapp-config
                  key: db_host
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: myapp-secret
                  key: db_password
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 5
```

---

## 三、Service 与网络

### 9. Service 的类型有哪些？

**答：**

| 类型 | 说明 | 使用场景 |
|------|------|---------|
| **ClusterIP** | 默认类型，集群内部虚拟IP | 集群内部服务通信 |
| **NodePort** | 在每个 Node 上开放端口（30000-32767） | 开发测试、简单暴露 |
| **LoadBalancer** | 使用云厂商负载均衡器 | 云环境生产暴露 |
| **ExternalName** | 将 Service 映射到外部 DNS 名称 | 引用集群外部服务 |

```yaml
# ClusterIP
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
spec:
  type: ClusterIP
  selector:
    app: myapp
  ports:
    - port: 80          # Service 端口
      targetPort: 8080  # Pod 端口
      protocol: TCP

# NodePort
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080   # Node 端口

# LoadBalancer
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
```

### 10. Ingress 是什么？和 Service 的关系？

**答：** Ingress 是管理集群外部访问的 API 对象，提供 HTTP/HTTPS 路由，通常充当七层负载均衡和反向代理。

```
外部流量 → Ingress Controller (Nginx/Traefik) → Ingress 规则 → Service → Pod
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - myapp.example.com
      secretName: tls-secret
  rules:
    - host: myapp.example.com
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 80
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 80
```

### 11. K8s 网络模型的要求是什么？

**答：** K8s 网络模型要求：

1. **Pod 间通信**：所有 Pod 可以直接通信，不需要 NAT
2. **Node 与 Pod 通信**：Node 可以直接与所有 Pod 通信
3. **Pod 看到的自身IP**：与其他 Pod 看到的一致

**常见 CNI 插件：**

| 插件 | 特点 |
|------|------|
| Calico | 支持网络策略、BGP、高性能 |
| Flannel | 简单、适合小集群 |
| Cilium | 基于 eBPF、高性能、可观测性强 |
| Weave | 简单、支持加密 |

### 12. NetworkPolicy 网络策略是什么？

**答：** NetworkPolicy 用于控制 Pod 之间以及 Pod 与外部的网络流量。

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
  namespace: production
spec:
  podSelector: {}         # 选择所有 Pod
  policyTypes:
    - Ingress
  ingress: []             # 空 = 拒绝所有入站

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
spec:
  podSelector:
    matchLabels:
      app: backend
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - port: 8080
```

---

## 四、配置管理

### 13. ConfigMap 和 Secret 的区别和用法？

**答：**

| 特性 | ConfigMap | Secret |
|------|-----------|--------|
| 用途 | 非敏感配置数据 | 敏感数据（密码、密钥等） |
| 存储 | 明文存储在 etcd | Base64 编码存储（可加密） |
| 大小限制 | 1MB | 1MB |

```yaml
# ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: myapp-config
data:
  db_host: "db.example.com"
  db_port: "5432"
  app.properties: |
    server.port=8080
    log.level=INFO

# Secret
apiVersion: v1
kind: Secret
metadata:
  name: myapp-secret
type: Opaque
data:
  db_password: cGFzc3dvcmQxMjM=    # base64 编码
stringData:
  api_key: "my-api-key"             # 自动 base64 编码

# 使用方式
spec:
  containers:
    - name: app
      # 环境变量方式
      env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: myapp-config
              key: db_host
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: myapp-secret
              key: db_password
      # 文件挂载方式
      volumeMounts:
        - name: config
          mountPath: /etc/config
  volumes:
    - name: config
      configMap:
        name: myapp-config
```

---

## 五、存储

### 14. PV、PVC、StorageClass 的关系？

**答：**

```
StorageClass（存储类）
    ↓ 动态创建
PV（PersistentVolume，持久卷）←── 管理员手动创建（静态）
    ↕ 绑定
PVC（PersistentVolumeClaim，持久卷声明）
    ↕ 使用
Pod
```

```yaml
# StorageClass（定义存储类型）
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
provisioner: kubernetes.io/aws-ebs
parameters:
  type: gp3
reclaimPolicy: Retain       # Delete / Retain / Recycle
volumeBindingMode: WaitForFirstConsumer

# PVC（申请存储）
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: myapp-data
spec:
  accessModes:
    - ReadWriteOnce          # RWO: 单节点读写
  storageClassName: fast-ssd
  resources:
    requests:
      storage: 10Gi

# Pod 使用 PVC
spec:
  containers:
    - name: app
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: myapp-data
```

**Access Modes：**
| 模式 | 简写 | 说明 |
|------|------|------|
| ReadWriteOnce | RWO | 单节点读写 |
| ReadOnlyMany | ROX | 多节点只读 |
| ReadWriteMany | RWX | 多节点读写 |

---

## 六、调度

### 15. K8s 调度器是如何工作的？

**答：** 调度器为未调度的 Pod 选择最合适的 Node：

1. **过滤（Predicate）**：排除不满足条件的 Node
   - 资源是否充足
   - 端口是否冲突
   - 是否有污点（Taint）
   - 节点亲和性是否满足

2. **打分（Priority）**：为剩余 Node 打分
   - 资源均衡性
   - 镜像是否已存在
   - 亲和性权重

3. **绑定（Bind）**：选择得分最高的 Node

### 16. 什么是 Taint 和 Toleration？

**答：** Taint（污点）标记在 Node 上，阻止 Pod 调度到该 Node。Toleration（容忍）标记在 Pod 上，允许 Pod 调度到有特定 Taint 的 Node。

```bash
# 给 Node 添加污点
kubectl taint nodes node1 key=value:NoSchedule
kubectl taint nodes node1 key=value:NoExecute      # 已运行的Pod也会被驱逐
kubectl taint nodes node1 key=value:PreferNoSchedule

# 删除污点
kubectl taint nodes node1 key=value:NoSchedule-
```

```yaml
# Pod 添加容忍
spec:
  tolerations:
    - key: "key"
      operator: "Equal"
      value: "value"
      effect: "NoSchedule"
```

### 17. 什么是 Node Affinity 和 Pod Affinity？

**答：**

```yaml
# Node Affinity：Pod 调度到特定 Node
spec:
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:    # 硬要求
        nodeSelectorTerms:
          - matchExpressions:
              - key: disk-type
                operator: In
                values: ["ssd"]
      preferredDuringSchedulingIgnoredDuringExecution:   # 软偏好
        - weight: 1
          preference:
            matchExpressions:
              - key: zone
                operator: In
                values: ["us-east-1a"]

# Pod Affinity：Pod 与特定 Pod 调度到同一节点/区域
    podAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values: ["cache"]
          topologyKey: "kubernetes.io/hostname"

# Pod Anti-Affinity：Pod 避开特定 Pod（常用于分散部署）
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app
                operator: In
                values: ["myapp"]
          topologyKey: "kubernetes.io/hostname"
```

---

## 七、健康检查与自愈

### 18. K8s 的三种探针有什么区别？

**答：**

| 探针 | 作用 | 失败结果 |
|------|------|---------|
| **livenessProbe** | 检查容器是否存活 | 重启容器 |
| **readinessProbe** | 检查容器是否就绪（能接收流量） | 从 Service 端点移除 |
| **startupProbe** | 检查应用是否启动完成 | 重启容器（启动慢的应用用） |

```yaml
# 检查方式
# 1. HTTP GET
livenessProbe:
  httpGet:
    path: /health
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 3
  failureThreshold: 3

# 2. TCP Socket
readinessProbe:
  tcpSocket:
    port: 3306

# 3. Exec Command
livenessProbe:
  exec:
    command:
      - cat
      - /tmp/healthy

# 4. gRPC
livenessProbe:
  grpc:
    port: 50051
```

---

## 八、滚动更新与回滚

### 19. Deployment 的更新策略有哪些？

**答：**

| 策略 | 说明 |
|------|------|
| **RollingUpdate**（默认） | 逐步替换旧版本 Pod（零停机） |
| **Recreate** | 先删除所有旧 Pod，再创建新 Pod（有停机时间） |

```bash
# 更新镜像
kubectl set image deployment/myapp myapp=myapp:2.0

# 查看更新状态
kubectl rollout status deployment/myapp

# 查看更新历史
kubectl rollout history deployment/myapp

# 回滚到上一版本
kubectl rollout undo deployment/myapp

# 回滚到指定版本
kubectl rollout undo deployment/myapp --to-revision=2

# 暂停/恢复更新
kubectl rollout pause deployment/myapp
kubectl rollout resume deployment/myapp
```

---

## 九、RBAC 权限管理

### 20. K8s 的 RBAC 模型是怎样的？

**答：**

```
User/Group/ServiceAccount  ←─ RoleBinding ──→  Role (namespace级)
                           ←─ ClusterRoleBinding ──→  ClusterRole (集群级)
```

```yaml
# Role（命名空间级别权限）
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  namespace: production
  name: pod-reader
rules:
  - apiGroups: [""]
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]

# RoleBinding
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: read-pods
  namespace: production
subjects:
  - kind: User
    name: developer
    apiGroup: rbac.authorization.k8s.io
  - kind: ServiceAccount
    name: monitoring
    namespace: monitoring
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

---

## 十、常用 kubectl 命令

### 21. kubectl 速查表？

**答：**

```bash
# 集群信息
kubectl cluster-info
kubectl get nodes -o wide
kubectl top nodes
kubectl api-resources

# Pod 操作
kubectl get pods -n production -o wide
kubectl describe pod myapp-xxx
kubectl logs myapp-xxx -f --tail=100
kubectl logs myapp-xxx -c sidecar        # 指定容器
kubectl exec -it myapp-xxx -- bash
kubectl port-forward myapp-xxx 8080:80
kubectl top pods

# 资源管理
kubectl apply -f deployment.yaml        # 声明式（推荐）
kubectl create -f deployment.yaml       # 命令式
kubectl delete -f deployment.yaml
kubectl edit deployment myapp
kubectl scale deployment myapp --replicas=5

# 调试
kubectl get events --sort-by='.lastTimestamp'
kubectl describe node node1
kubectl get pods --field-selector=status.phase=Failed

# 查看和切换上下文
kubectl config get-contexts
kubectl config use-context production
kubectl config set-context --current --namespace=default
```

### 22. 如何排查 Pod 启动失败？

**答：**

```bash
# 1. 查看 Pod 状态
kubectl get pod myapp -o wide

# 2. 查看 Pod 事件
kubectl describe pod myapp
# 重点看 Events 部分：调度失败、镜像拉取失败、探针失败等

# 3. 查看容器日志
kubectl logs myapp
kubectl logs myapp --previous     # 上一个容器的日志（CrashLoopBackOff时）

# 4. 进入容器调试
kubectl exec -it myapp -- sh

# 5. 临时调试容器（ephemeral container）
kubectl debug -it myapp --image=busybox

# 常见问题排查：
# ImagePullBackOff → 检查镜像名、Registry 认证
# CrashLoopBackOff → 查看日志，检查启动命令和配置
# Pending → 检查资源不足、调度限制
# OOMKilled → 增加 memory limit
# Evicted → 节点资源不足
```

---

## 十一、HPA 自动扩缩容

### 23. HPA 是什么？如何配置？

**答：** HPA（Horizontal Pod Autoscaler）根据 CPU/内存使用率或自定义指标自动调整 Pod 副本数。

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: myapp-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: myapp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300    # 缩容稳定窗口
```

**前提条件：** Pod 必须设置 `resources.requests`，集群需要安装 Metrics Server。

---

## 十二、Helm

### 24. Helm 是什么？常用命令？

**答：** Helm 是 K8s 的包管理器，使用 Chart 定义、安装和管理 K8s 应用。

```bash
# 仓库管理
helm repo add bitnami https://charts.bitnami.com/bitnami
helm repo update
helm search repo nginx

# 安装
helm install my-nginx bitnami/nginx
helm install my-nginx bitnami/nginx -f values.yaml
helm install my-nginx bitnami/nginx --set replicaCount=3

# 管理
helm list
helm status my-nginx
helm upgrade my-nginx bitnami/nginx -f values.yaml
helm rollback my-nginx 1
helm uninstall my-nginx

# Chart 开发
helm create mychart
helm template mychart
helm lint mychart
helm package mychart
```
