# Pod 详解

---

## 1. Pod 是什么？为什么不直接运行容器？

**回答：**

```
Pod 是 K8s 中最小的可部署和可调度单元
一个 Pod 包含一个或多个紧密耦合的容器

为什么需要 Pod（而不是直接管理容器）:

1. 共享网络命名空间
   同一 Pod 内所有容器共享同一个 IP 和端口空间
   容器间通过 localhost 通信
   → 类似传统部署中同一台机器上的进程

2. 共享存储
   Pod 内的容器可以挂载相同的 Volume
   → Sidecar 模式: 主容器写日志, 日志容器读取并转发

3. 共享进程命名空间（可选）
   shareProcessNamespace: true
   → 容器间可以看到彼此的进程

4. 调度的原子单位
   Pod 内的容器总是在同一个 Node 上
   → 确保紧耦合的容器在一起

Pod 内部结构:
  ┌─────────────────────────────────────┐
  │ Pod                                 │
  │  ┌───────────┐  Pause Container     │
  │  │  pause    │  (infra container)   │
  │  │ 持有网络  │  持有网络命名空间    │
  │  │ 命名空间  │                      │
  │  └───────────┘                      │
  │  ┌───────────┐  ┌───────────┐       │
  │  │ Container │  │ Container │       │
  │  │   (app)   │  │ (sidecar) │       │
  │  └───────────┘  └───────────┘       │
  │  ┌─────────────────────────┐        │
  │  │  Shared Volume          │        │
  │  └─────────────────────────┘        │
  └─────────────────────────────────────┘
```

---

## 2. Pod 的生命周期？

**回答：**

```
Pod Phase (阶段):

  Pending → Running → Succeeded/Failed
                ↓
            Unknown (Node 失联)

阶段      含义
────────  ──────────────────────────────────
Pending   Pod 已创建但容器还未运行
          (可能是: 调度中/拉取镜像/等待 Volume)
Running   Pod 已绑定到 Node, 至少一个容器正在运行
Succeeded 所有容器正常退出 (exit 0), 不会重启
Failed    至少一个容器非正常退出
Unknown   无法获取 Pod 状态 (通常 Node 失联)
```

### Pod 详细状态 (Status Conditions)

```yaml
status:
  phase: Running
  conditions:
    - type: PodScheduled       # 是否已调度
      status: "True"
    - type: Initialized        # Init Container 是否完成
      status: "True"
    - type: ContainersReady    # 所有容器是否就绪
      status: "True"
    - type: Ready              # Pod 是否就绪(可接收流量)
      status: "True"
```

### 常见 Pod 状态排查

```
状态                  原因                          排查
────────────────────  ──────────────────────────    ────────────────────
Pending               调度失败/资源不足             describe pod 看 Events
ContainerCreating     拉取镜像/挂载 Volume         describe pod
ImagePullBackOff      镜像名错误/认证失败          检查镜像名和 imagePullSecrets
ErrImagePull          Registry 不可达              检查网络和 Registry
CrashLoopBackOff      容器反复崩溃重启             logs --previous 看上次日志
Running               正常运行                      -
OOMKilled             内存超限被杀                  增加 memory limits
Evicted               Node 资源不足被驱逐          检查 Node 资源/清理
Error                 容器启动命令错误             检查 CMD/ENTRYPOINT
Terminating           正在终止(可能卡住)           检查 PreStop/finalizer
```

---

## 3. Pod 的完整 YAML 规范？

**回答：**

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: myapp
  namespace: production
  labels:
    app: myapp
    version: "1.0"
  annotations:
    prometheus.io/scrape: "true"
spec:
  # ===== 调度相关 =====
  nodeSelector:                    # 简单节点选择
    disk-type: ssd
  affinity:                        # 高级亲和性（见调度章节）
    nodeAffinity: ...
    podAffinity: ...
    podAntiAffinity: ...
  tolerations:                     # 容忍污点
    - key: "dedicated"
      operator: "Equal"
      value: "gpu"
      effect: "NoSchedule"
  topologySpreadConstraints:       # 拓扑分布约束
    - maxSkew: 1
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfied: DoNotSchedule
      labelSelector:
        matchLabels:
          app: myapp

  # ===== 安全相关 =====
  serviceAccountName: myapp-sa     # 使用的 ServiceAccount
  securityContext:                 # Pod 级别安全上下文
    runAsUser: 1000
    runAsGroup: 3000
    fsGroup: 2000
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault

  # ===== 容器相关 =====
  initContainers:                  # 初始化容器（按顺序执行）
    - name: wait-for-db
      image: busybox:1.36
      command: ['sh', '-c', 'until nc -z db-svc 5432; do sleep 2; done']

  containers:
    - name: app
      image: myapp:1.0
      imagePullPolicy: IfNotPresent  # Always / IfNotPresent / Never
      ports:
        - name: http
          containerPort: 8080
          protocol: TCP
      env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: myapp-config
              key: db_host
      envFrom:
        - configMapRef:
            name: myapp-config
      resources:
        requests:
          cpu: "250m"
          memory: "256Mi"
        limits:
          cpu: "500m"
          memory: "512Mi"
      volumeMounts:
        - name: data
          mountPath: /data
        - name: config
          mountPath: /etc/config
          readOnly: true
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
        initialDelaySeconds: 5
        periodSeconds: 5
      startupProbe:
        httpGet:
          path: /health
          port: 8080
        failureThreshold: 30
        periodSeconds: 10
      securityContext:              # 容器级别安全
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
        readOnlyRootFilesystem: true
      lifecycle:
        postStart:
          exec:
            command: ["/bin/sh", "-c", "echo started"]
        preStop:
          exec:
            command: ["/bin/sh", "-c", "sleep 5"]

  # ===== 存储 =====
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: myapp-data
    - name: config
      configMap:
        name: myapp-config
    - name: secrets
      secret:
        secretName: myapp-secret
    - name: temp
      emptyDir: {}

  # ===== 其他 =====
  restartPolicy: Always            # Always / OnFailure / Never
  terminationGracePeriodSeconds: 30
  dnsPolicy: ClusterFirst
  imagePullSecrets:
    - name: registry-secret
```

---

## 4. Init Container 详解？

**回答：**

```
Init Container 特点:
  1. 在所有普通容器启动前运行
  2. 按定义顺序逐个执行
  3. 每个必须成功完成才启动下一个
  4. 任何一个失败 → Pod 重启(根据 restartPolicy)
  5. 不支持 readinessProbe（只需运行完成即可）

执行顺序:
  initContainer[0] → initContainer[1] → ... → containers (并行启动)
```

### 常见使用场景

```yaml
# 场景 1: 等待依赖服务就绪
initContainers:
  - name: wait-for-db
    image: busybox:1.36
    command:
      - sh
      - -c
      - |
        until nc -z postgres-svc 5432; do
          echo "Waiting for PostgreSQL..."
          sleep 2
        done

# 场景 2: 等待其他 Pod 就绪
  - name: wait-for-api
    image: busybox:1.36
    command:
      - sh
      - -c
      - |
        until wget -qO- http://api-svc:8080/health; do
          sleep 2
        done

# 场景 3: 下载配置/数据
  - name: download-config
    image: busybox:1.36
    command: ['wget', '-O', '/config/app.conf', 'http://config-server/myapp']
    volumeMounts:
      - name: config
        mountPath: /config

# 场景 4: 数据库迁移
  - name: db-migrate
    image: myapp:1.0
    command: ['python', 'manage.py', 'migrate']
    env:
      - name: DATABASE_URL
        valueFrom:
          secretKeyRef:
            name: db-secret
            key: url

# 场景 5: 设置文件权限
  - name: fix-permissions
    image: busybox:1.36
    command: ['sh', '-c', 'chown -R 1000:1000 /data']
    volumeMounts:
      - name: data
        mountPath: /data
    securityContext:
      runAsUser: 0
```

---

## 5. Sidecar Container 详解？

**回答：**

```
Sidecar 模式: 辅助容器与主容器一起运行, 提供增强功能

K8s 1.28+ 原生 Sidecar (restartPolicy: Always 的 initContainer):
  - 在普通容器之前启动
  - 在普通容器之后关闭
  - 支持 readinessProbe
  - Pod 终止时才停止

传统 Sidecar:
  直接在 containers 中定义多个容器
```

### 常见 Sidecar 模式

```yaml
# 1. 日志收集 Sidecar
spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
    - name: log-forwarder
      image: fluent/fluent-bit:latest
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
          readOnly: true
        - name: fluent-config
          mountPath: /fluent-bit/etc
  volumes:
    - name: logs
      emptyDir: {}

# 2. 代理 Sidecar (Envoy/Nginx)
spec:
  containers:
    - name: app
      image: myapp:1.0
      ports:
        - containerPort: 8080
    - name: envoy-proxy
      image: envoyproxy/envoy:v1.28
      ports:
        - containerPort: 9901    # admin
        - containerPort: 10000   # listener
      volumeMounts:
        - name: envoy-config
          mountPath: /etc/envoy

# 3. K8s 1.28+ 原生 Sidecar
spec:
  initContainers:
    - name: log-collector
      image: fluent/fluent-bit:latest
      restartPolicy: Always       # 关键: 声明为原生 Sidecar
      volumeMounts:
        - name: logs
          mountPath: /var/log/app
  containers:
    - name: app
      image: myapp:1.0
```

```
常见 Sidecar 用途:
  日志收集     — Fluent Bit, Filebeat
  代理/网关    — Envoy, Nginx (服务网格)
  监控指标     — Prometheus exporter
  安全         — Vault Agent (注入 Secret)
  同步         — git-sync (同步 Git 仓库)
  适配器       — 格式转换, 协议转换
```

---

## 6. 三种探针详解？

**回答：**

```
探针        检查什么           失败动作              检查时机
──────────  ─────────────────  ──────────────────    ───────────
liveness    容器是否存活       重启容器              容器运行期间
readiness   容器是否就绪       从 Service 摘除       容器运行期间
startup     应用是否已启动     重启容器(禁用其他探针) 启动阶段

启动顺序:
  startup 探针成功 → 启用 liveness + readiness 探针
  (如果没有 startup 探针, 直接启用 liveness + readiness)
```

### 探针配置参数

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 8080
    httpHeaders:                    # 可选 HTTP 头
      - name: X-Custom-Header
        value: probe
  initialDelaySeconds: 30          # 首次探测前等待
  periodSeconds: 10                # 探测间隔
  timeoutSeconds: 3                # 超时时间
  successThreshold: 1              # 连续成功几次算成功(liveness只能是1)
  failureThreshold: 3              # 连续失败几次算失败
  terminationGracePeriodSeconds: 30 # liveness 失败后优雅关闭时间
```

### 四种探测方式

```yaml
# 1. HTTP GET — 最常用
livenessProbe:
  httpGet:
    path: /health
    port: 8080
    scheme: HTTP       # HTTP 或 HTTPS

# 2. TCP Socket — 数据库、缓存
readinessProbe:
  tcpSocket:
    port: 3306

# 3. Exec — 自定义命令
livenessProbe:
  exec:
    command:
      - cat
      - /tmp/healthy
  # exit 0 = 成功, 非0 = 失败

# 4. gRPC — gRPC 服务
livenessProbe:
  grpc:
    port: 50051
    service: ""        # 可选, gRPC health 服务名
```

### 最佳实践

```yaml
# 启动慢的应用 → 使用 startup 探针
startupProbe:
  httpGet:
    path: /health
    port: 8080
  failureThreshold: 30     # 30 * 10s = 最多等 5 分钟启动
  periodSeconds: 10

livenessProbe:
  httpGet:
    path: /health
    port: 8080
  periodSeconds: 10
  failureThreshold: 3
  # 没有 initialDelaySeconds, 由 startup 保护

readinessProbe:
  httpGet:
    path: /ready           # 可以与 /health 不同
    port: 8080
  periodSeconds: 5
  failureThreshold: 3

# 注意:
#   /health → 检查进程是否存活(简单)
#   /ready  → 检查是否能处理请求(可检查依赖)
#   liveness 不要检查外部依赖（否则依赖故障会导致所有 Pod 重启）
```

---

## 7. Pod 的优雅终止流程？

**回答：**

```
kubectl delete pod myapp
    │
    ▼
① API Server 标记 Pod 为 Terminating
    │ Pod 从 Service Endpoints 中移除
    │ 设置 deletionTimestamp
    ▼
② kubelet 检测到 Terminating
    │
    ├─ 执行 PreStop Hook（如果定义了）
    │    等待 PreStop 完成
    │
    ├─ 发送 SIGTERM 给容器主进程 (PID 1)
    │    应用应捕获 SIGTERM 并开始优雅关闭:
    │    - 停止接收新请求
    │    - 完成正在处理的请求
    │    - 关闭连接和释放资源
    │
    ▼
③ 等待 terminationGracePeriodSeconds（默认 30s）
    │
    ├─ 容器自行退出 → 完成 ✓
    │
    ├─ 超时 → 发送 SIGKILL 强制杀死
    │
    ▼
④ 容器被删除, 清理资源
```

```yaml
spec:
  terminationGracePeriodSeconds: 60  # 延长宽限期
  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command:
              - sh
              - -c
              - |
                # 1. 通知应用开始优雅关闭
                curl -s http://localhost:8080/shutdown
                # 2. 等待已有连接完成
                sleep 15

# 常见问题:
#   ❌ 容器收不到 SIGTERM
#      原因: shell 形式的 CMD 用 /bin/sh 包装, PID 1 是 sh 而不是应用
#      解决: 使用 exec 形式 CMD ["app"] 或用 tini 作为 init 进程
#
#   ❌ 请求被中断
#      原因: Pod 从 Service 摘除和 SIGTERM 几乎同时发生
#      解决: preStop 加 sleep 5-10s, 让 kube-proxy 先更新规则
```

---

## 8. Pod QoS 等级？

**回答：**

```
K8s 根据 resources 配置自动为 Pod 分配 QoS 等级
当 Node 资源不足时, 按 QoS 优先级驱逐 Pod

QoS 等级        条件                              驱逐优先级
──────────────  ──────────────────────────────    ────────────
Guaranteed      所有容器都设置了 requests=limits   最后被驱逐
                (cpu 和 memory 都设置且相等)
Burstable       至少一个容器设置了 requests        中间
                (但不满足 Guaranteed 条件)
BestEffort      没有任何容器设置 resources          最先被驱逐
```

```yaml
# Guaranteed — 生产关键服务
containers:
  - resources:
      requests:
        cpu: "500m"
        memory: "512Mi"
      limits:
        cpu: "500m"         # requests = limits
        memory: "512Mi"     # requests = limits

# Burstable — 一般服务
containers:
  - resources:
      requests:
        cpu: "250m"
        memory: "256Mi"
      limits:
        cpu: "1000m"        # limits > requests
        memory: "1Gi"

# BestEffort — 无所谓的任务
containers:
  - name: task
    image: task:1.0
    # 没有 resources 配置
```

```
驱逐顺序:
  1. BestEffort Pod（无保证，最先驱逐）
  2. Burstable Pod（超过 requests 的先驱逐）
  3. Guaranteed Pod（最后驱逐）

建议:
  生产关键服务 → Guaranteed (requests = limits)
  一般服务     → Burstable (设置合理的 requests 和 limits)
  批处理任务   → 可以 BestEffort（但建议至少设置 requests）
```

---

## 9. Pod 的 DNS 与网络？

**回答：**

```
每个 Pod 获得一个唯一的 IP 地址
Pod 内容器共享网络命名空间(同一 IP)

DNS 配置:
  /etc/resolv.conf:
    nameserver 10.96.0.10          # CoreDNS Service ClusterIP
    search default.svc.cluster.local svc.cluster.local cluster.local
    options ndots:5

DNS 解析规则:
  <service>                        → <service>.default.svc.cluster.local
  <service>.<namespace>            → <service>.<namespace>.svc.cluster.local
  <service>.<namespace>.svc        → <service>.<namespace>.svc.cluster.local

  Pod DNS (仅 StatefulSet):
  <pod-name>.<headless-service>.<namespace>.svc.cluster.local
```

```yaml
# DNS 策略
spec:
  dnsPolicy: ClusterFirst       # 默认, 使用集群 DNS
  # dnsPolicy: Default          # 使用 Node 的 DNS
  # dnsPolicy: None             # 完全自定义

  # 自定义 DNS
  dnsConfig:
    nameservers:
      - 8.8.8.8
    searches:
      - my.domain.com
    options:
      - name: ndots
        value: "2"              # 减少 DNS 查询次数

# Pod 间通信:
#   同一 Pod 内: localhost:<port>
#   同一 Namespace: <service-name>:<port>
#   跨 Namespace: <service-name>.<namespace>:<port>
#   Pod IP 直连: <pod-ip>:<port> (不推荐, IP 会变)
```

---

## 10. Static Pod 与 Ephemeral Container？

**回答：**

### Static Pod

```
Static Pod 由 kubelet 直接管理, 不通过 API Server

存放路径: /etc/kubernetes/manifests/
kubelet 自动监控此目录, 有变更就创建/更新/删除 Pod

用途:
  K8s 控制面自己就是以 Static Pod 运行的:
  - kube-apiserver
  - kube-controller-manager
  - kube-scheduler
  - etcd

特点:
  - kubelet 自动管理, 无需 API Server
  - API Server 可以看到(镜像 Pod), 但无法控制
  - 不受 Deployment/ReplicaSet 管理
  - Node 故障时无法迁移
```

```bash
# 查看 Static Pod 清单
ls /etc/kubernetes/manifests/
# etcd.yaml
# kube-apiserver.yaml
# kube-controller-manager.yaml
# kube-scheduler.yaml

# 修改 Static Pod
# 直接编辑文件, kubelet 自动应用
vim /etc/kubernetes/manifests/kube-apiserver.yaml
```

### Ephemeral Container (临时容器)

```bash
# 用于调试正在运行的 Pod（不能修改已运行 Pod 的 spec）
# 临时容器不重启, 没有端口和探针

# 在 Pod 中注入调试容器
kubectl debug -it myapp --image=busybox -- sh

# 使用 netshoot 排查网络
kubectl debug -it myapp --image=nicolaka/netshoot -- bash

# 复制 Pod 并调试（不影响原 Pod）
kubectl debug myapp -it --copy-to=myapp-debug --container=app -- sh

# 复制并修改命令
kubectl debug myapp -it --copy-to=myapp-debug \
  --container=app \
  --image=myapp:debug \
  -- sh

# 调试 Node
kubectl debug node/node1 -it --image=ubuntu
# 宿主机文件系统挂载在 /host
```
