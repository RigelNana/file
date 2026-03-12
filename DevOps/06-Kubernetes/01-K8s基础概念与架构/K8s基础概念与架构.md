# K8s 基础概念与架构

---

## 1. Kubernetes 是什么？为什么需要它？

**回答：**

Kubernetes（K8s）是 Google 基于其内部 Borg 系统的经验开源的**容器编排平台**，用于自动化部署、扩缩容和管理容器化应用。2014 年开源，2015 年捐赠给 CNCF。

```
K8s 解决的核心问题:

问题领域        手动管理容器               Kubernetes
──────────────  ─────────────────────────  ──────────────────────
服务发现        手动配置 IP/端口            自动 DNS + Service
负载均衡        手动配置 Nginx/HAProxy      内置 Service + Ingress
扩缩容          手动增减容器实例            HPA/VPA 自动伸缩
自我修复        手动重启失败容器            自动重启/替换/杀死不健康容器
滚动更新        手动逐台替换(有停机风险)    零停机滚动更新 + 一键回滚
配置管理        手动分发配置文件            ConfigMap + Secret
存储编排        手动挂载/管理存储           PV/PVC/StorageClass 动态供给
资源隔离        依赖 Docker 资源限制        Namespace + ResourceQuota + LimitRange
多租户          无原生支持                  Namespace + RBAC + NetworkPolicy
声明式管理      命令式一步步操作            声明期望状态，系统自动趋近
```

```
适用场景:
  ✅ 微服务架构（大量服务需编排）
  ✅ 需要自动伸缩的应用
  ✅ 多环境一致部署（Dev/Staging/Prod）
  ✅ CI/CD 持续交付
  ✅ 混合云/多云部署

不适用场景:
  ❌ 单体应用、几个容器就能搞定
  ❌ 团队规模很小、学习成本不划算
  ❌ 对延迟极端敏感（K8s overlay 网络有开销）
```

---

## 2. K8s 的整体架构？

**回答：**

```
┌─────────────────────────────────────────────────────────────────┐
│                     Control Plane (Master)                       │
│                                                                 │
│  ┌────────────┐  ┌────────────┐  ┌──────────────────────────┐  │
│  │ API Server │  │ Scheduler  │  │ Controller Manager       │  │
│  │            │  │            │  │  ├─ Deployment Controller │  │
│  │ (唯一入口) │  │ (调度决策) │  │  ├─ ReplicaSet Controller│  │
│  │            │  │            │  │  ├─ Node Controller       │  │
│  └──────┬─────┘  └────────────┘  │  ├─ Job Controller       │  │
│         │                        │  └─ Service Controller    │  │
│  ┌──────┴─────┐  ┌────────────┐  └──────────────────────────┘  │
│  │   etcd     │  │ Cloud      │                                 │
│  │ (状态存储) │  │ Controller │ (可选, 云平台集成)              │
│  └────────────┘  └────────────┘                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS (kubelet ↔ API Server)
       ┌─────────────────────┼─────────────────────┐
       ▼                     ▼                     ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Worker Node 1│  │ Worker Node 2│  │ Worker Node 3│
│              │  │              │  │              │
│ ┌──────────┐ │  │ ┌──────────┐ │  │ ┌──────────┐ │
│ │ kubelet  │ │  │ │ kubelet  │ │  │ │ kubelet  │ │
│ │(Pod管理) │ │  │ │(Pod管理) │ │  │ │(Pod管理) │ │
│ ├──────────┤ │  │ ├──────────┤ │  │ ├──────────┤ │
│ │kube-proxy│ │  │ │kube-proxy│ │  │ │kube-proxy│ │
│ │(网络代理)│ │  │ │(网络代理)│ │  │ │(网络代理)│ │
│ ├──────────┤ │  │ ├──────────┤ │  │ ├──────────┤ │
│ │containerd│ │  │ │containerd│ │  │ │containerd│ │
│ │(容器运行)│ │  │ │(容器运行)│ │  │ │(容器运行)│ │
│ ├──────────┤ │  │ ├──────────┤ │  │ ├──────────┤ │
│ │ Pod  Pod │ │  │ │ Pod  Pod │ │  │ │ Pod      │ │
│ └──────────┘ │  │ └──────────┘ │  │ └──────────┘ │
└──────────────┘  └──────────────┘  └──────────────┘
```

### 请求处理流程（以创建 Deployment 为例）

```
kubectl apply -f deploy.yaml
    │
    ▼
① API Server 接收请求
    │ 认证 → 授权 → 准入控制（Admission Controller）
    │ 将 Deployment 对象写入 etcd
    ▼
② Controller Manager 检测到新 Deployment
    │ Deployment Controller 创建 ReplicaSet
    │ ReplicaSet Controller 创建 Pod 对象（Pending状态）
    ▼
③ Scheduler 检测到未调度的 Pod
    │ 过滤 → 打分 → 选择最优 Node
    │ 将调度结果写入 Pod.spec.nodeName
    ▼
④ 目标 Node 上的 kubelet 检测到分配给自己的 Pod
    │ 通过 CRI 调用 containerd 创建容器
    │ 设置网络（CNI）、挂载存储（CSI）
    │ 上报 Pod 状态到 API Server
    ▼
⑤ kube-proxy 更新 iptables/IPVS 规则
    │ Service → Pod 的负载均衡生效
    ▼
⑥ Pod Running，开始接收流量
```

---

## 3. Control Plane 各组件详解？

**回答：**

### API Server (kube-apiserver)

```
职责:
  1. RESTful API 入口 — 所有组件通过它交互
  2. 认证(Authentication) — 证书/Token/OIDC
  3. 授权(Authorization) — RBAC/ABAC/Webhook
  4. 准入控制(Admission Control) — Mutating + Validating Webhook
  5. 数据校验 — 校验资源对象格式
  6. etcd 网关 — 唯一直接与 etcd 通信的组件

特点:
  - 无状态，可水平扩展（多副本 + 负载均衡）
  - 支持 Watch 机制（长连接通知变更）
  - 支持 API 聚合（扩展自定义 API）

常用端口:
  6443 — HTTPS API
  8080 — HTTP (不安全, 生产禁用)
```

### etcd

```
职责:
  分布式键值存储，保存集群所有状态

特点:
  - 使用 Raft 共识算法
  - 强一致性
  - 支持 Watch 变更通知
  - 通常部署奇数节点（3/5/7）保证高可用

数据结构:
  /registry/deployments/default/myapp → Deployment 对象
  /registry/pods/default/myapp-xxx   → Pod 对象
  /registry/services/default/myapp   → Service 对象

运维要点:
  - 定期备份: etcdctl snapshot save backup.db
  - 监控延迟: etcd_disk_wal_fsync_duration_seconds
  - 磁盘性能: 推荐 SSD
  - 数据量: 默认 2GB 上限, 可调整
```

### Scheduler (kube-scheduler)

```
调度流程:
  未调度 Pod → 过滤(Filtering) → 打分(Scoring) → 绑定(Binding)

过滤阶段(排除不满足的 Node):
  - NodeResourcesFit  — 资源是否充足
  - NodePorts         — 端口是否冲突
  - PodToleratesNodeTaints — Taint/Toleration 检查
  - NodeAffinity      — 节点亲和性
  - PodTopologySpread — 拓扑分布约束

打分阶段(给剩余 Node 评分):
  - LeastRequestedPriority — 资源剩余越多分越高
  - BalancedResourceAllocation — CPU/内存使用比例越均匀分越高
  - ImageLocality — 镜像已存在加分
  - InterPodAffinity — Pod 亲和性
  - NodePreferAvoidPods — 避免特定 Node

扩展:
  - 调度框架(Scheduling Framework) 支持插件扩展
  - 可以运行多个调度器
```

### Controller Manager (kube-controller-manager)

```
职责: 运行各种控制器, 通过控制循环确保实际状态 = 期望状态

内置控制器:
  控制器                    职责
  ──────────────────────    ──────────────────────────
  Deployment Controller     管理 Deployment → ReplicaSet
  ReplicaSet Controller     维持 Pod 副本数
  StatefulSet Controller    管理有状态应用
  DaemonSet Controller      确保每个 Node 运行指定 Pod
  Job Controller            管理一次性任务
  CronJob Controller        管理定时任务
  Node Controller           监控 Node 状态, 驱逐不健康 Node 上的 Pod
  Service Controller        管理 LoadBalancer 类型 Service
  Endpoint Controller       维护 Service → Pod 端点映射
  Namespace Controller      管理 Namespace 生命周期
  ServiceAccount Controller 为 Namespace 创建默认 SA

控制循环(Reconciliation Loop):
  for {
    实际状态 = 获取当前状态
    期望状态 = 读取 Spec
    if 实际状态 != 期望状态 {
      执行操作使实际状态趋向期望状态
    }
  }
```

---

## 4. Node 组件详解？

**回答：**

### kubelet

```
职责:
  1. 管理 Pod 生命周期（创建/启动/停止/删除容器）
  2. 通过 CRI(Container Runtime Interface) 调用容器运行时
  3. 执行健康检查（liveness/readiness/startup probe）
  4. 上报 Node 和 Pod 状态到 API Server
  5. 管理 Volume 挂载（通过 CSI）
  6. 管理容器网络（通过 CNI）

工作方式:
  - Watch API Server 获取分配给本 Node 的 Pod
  - 也可读取本地静态 Pod 清单（/etc/kubernetes/manifests/）
  - 定期（默认10s）上报 Node 状态

关键参数:
  --max-pods=110               # 单节点最大 Pod 数
  --pod-max-pids=4096          # 单 Pod 最大进程数
  --eviction-hard=             # 驱逐阈值
    memory.available<100Mi,
    nodefs.available<10%
  --image-gc-high-threshold=85 # 镜像垃圾回收高水位
```

### kube-proxy

```
职责: 维护 Node 上的网络规则, 实现 Service 到 Pod 的流量转发

三种代理模式:

模式          实现方式      性能        适用
────────────  ──────────    ──────────  ──────────
iptables      iptables规则  中等        默认, 中小规模
IPVS          IPVS规则      高          大规模集群(>1000 Service)
userspace     用户空间代理  低          已废弃

iptables 模式:
  Service ClusterIP → iptables DNAT → 随机选择 Pod IP

IPVS 模式:
  Service ClusterIP → IPVS 虚拟服务器 → 负载均衡到 Pod IP
  支持算法: rr(轮询), lc(最少连接), sh(源地址哈希)

启用 IPVS:
  kube-proxy --proxy-mode=ipvs --ipvs-scheduler=rr
```

### Container Runtime

```
K8s 通过 CRI (Container Runtime Interface) 与容器运行时交互

历史演进:
  K8s 1.24 之前: Docker(通过 dockershim) / containerd / CRI-O
  K8s 1.24 起:   移除 dockershim, 仅支持 CRI 兼容运行时

主流运行时:
  运行时        特点
  ──────────    ────────────────────
  containerd    工业标准, K8s 默认, 轻量
  CRI-O         专为 K8s 设计, 最小化
  Docker        需通过 cri-dockerd 适配器

containerd 架构:
  kubelet → CRI → containerd → runc → container
```

---

## 5. K8s 的声明式 API 与控制器模式？

**回答：**

```
声明式(Declarative) vs 命令式(Imperative):

命令式: 告诉系统"做什么"
  kubectl run nginx --image=nginx
  kubectl scale deployment nginx --replicas=3

声明式: 告诉系统"我要什么"
  kubectl apply -f deployment.yaml
  # YAML 中声明 replicas: 3
  # 系统自动调整到 3 个副本

声明式优点:
  1. 版本控制 — YAML 文件可以纳入 Git
  2. 幂等性   — 多次 apply 结果一致
  3. 自愈能力 — 系统持续趋向期望状态
  4. 可审计   — 谁在什么时候改了什么
```

### 控制器模式（Reconciliation Loop）

```
         ┌──────────────────────────────┐
         │        Desired State         │
         │    (YAML / API Server)       │
         └──────────┬───────────────────┘
                    │ 对比
         ┌──────────▼───────────────────┐
         │     Reconciliation Loop      │
         │   (Controller 不断运行)      │
         │                              │
         │  if actual != desired:       │
         │    take action               │
         └──────────┬───────────────────┘
                    │ 执行
         ┌──────────▼───────────────────┐
         │        Actual State          │
         │    (集群中实际状态)          │
         └──────────────────────────────┘

示例:
  Deployment 声明 replicas: 3
  当前只有 2 个 Pod
  → ReplicaSet Controller 检测到差异
  → 创建 1 个新 Pod
  → 实际状态 = 期望状态 ✓
```

---

## 6. K8s 对象的通用结构？

**回答：**

```yaml
apiVersion: apps/v1          # API 版本
kind: Deployment             # 资源类型
metadata:                    # 元数据
  name: myapp                #   名称（必须）
  namespace: production      #   命名空间
  labels:                    #   标签（键值对）
    app: myapp
    env: prod
  annotations:               #   注解（非标识性元数据）
    description: "My application"
spec:                        # 期望状态（Specification）
  replicas: 3
  selector:
    matchLabels:
      app: myapp
  template:
    ...
status:                      # 实际状态（系统维护，只读）
  replicas: 3
  readyReplicas: 3
  conditions:
    - type: Available
      status: "True"
```

### Labels 与 Selectors

```yaml
# Labels — 标识对象的键值对
metadata:
  labels:
    app: myapp
    tier: frontend
    env: production
    version: v1.2.3

# Selector — 基于 Label 选择对象
# 等式选择器
selector:
  matchLabels:
    app: myapp
    env: production

# 集合选择器
selector:
  matchExpressions:
    - key: env
      operator: In            # In, NotIn, Exists, DoesNotExist
      values: ["production", "staging"]
    - key: tier
      operator: NotIn
      values: ["test"]

# kubectl 中使用
kubectl get pods -l app=myapp
kubectl get pods -l 'app=myapp,env!=test'
kubectl get pods -l 'tier in (frontend, backend)'
```

### Annotations

```yaml
# Annotations — 非标识性元数据，存储任意信息
metadata:
  annotations:
    # 部署信息
    kubernetes.io/change-cause: "Update to v1.2.3"
    # Ingress 配置
    nginx.ingress.kubernetes.io/rewrite-target: /
    # 监控
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    # 工具配置
    helm.sh/chart: myapp-1.0.0

# Labels vs Annotations:
#   Labels    → 用于选择和过滤对象
#   Annotations → 存储工具/库使用的非标识信息
```

---

## 7. Namespace 是什么？如何使用？

**回答：**

```
Namespace 是 K8s 中的虚拟集群, 用于资源隔离和多租户

默认 Namespace:
  default          — 默认, 未指定时使用
  kube-system      — K8s 系统组件（API Server, DNS 等）
  kube-public      — 公开可读资源
  kube-node-lease  — Node 心跳租约

Namespace 隔离范围:
  ✅ 隔离: 资源名称、RBAC 权限、ResourceQuota、LimitRange、NetworkPolicy
  ❌ 不隔离: Node、PV、StorageClass、ClusterRole、Namespace 本身
```

```bash
# Namespace 操作
kubectl create namespace production
kubectl get namespaces
kubectl delete namespace test

# 在特定 Namespace 操作
kubectl get pods -n production
kubectl apply -f deploy.yaml -n production

# 设置默认 Namespace
kubectl config set-context --current --namespace=production

# 跨 Namespace 访问 Service
# <service-name>.<namespace>.svc.cluster.local
curl http://myapp.production.svc.cluster.local:8080
```

```yaml
# ResourceQuota — 限制 Namespace 资源总量
apiVersion: v1
kind: ResourceQuota
metadata:
  name: compute-quota
  namespace: production
spec:
  hard:
    requests.cpu: "10"
    requests.memory: 20Gi
    limits.cpu: "20"
    limits.memory: 40Gi
    pods: "50"
    services: "20"
    persistentvolumeclaims: "10"

# LimitRange — 限制单个 Pod/Container 资源
apiVersion: v1
kind: LimitRange
metadata:
  name: resource-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:           # 默认 limits
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:    # 默认 requests
        cpu: "100m"
        memory: "128Mi"
      max:
        cpu: "2"
        memory: "4Gi"
      min:
        cpu: "50m"
        memory: "64Mi"
```

---

## 8. K8s 集群部署方式？

**回答：**

```
部署方式          适用场景           特点
────────────────  ─────────────────  ────────────────────────
kubeadm           生产/学习          官方工具, 手动管理
Managed K8s       生产               EKS/AKS/GKE, 托管控制面
k3s               边缘/IoT/开发     轻量, 单二进制
kind              本地开发/CI        Docker 容器中运行 K8s
minikube          本地学习           单节点, 多驱动支持
kops              AWS 生产           自动化集群生命周期
Rancher/RKE       多集群管理         企业级, 统一管理
```

### kubeadm 部署流程

```bash
# 所有节点: 安装容器运行时 + kubeadm/kubelet/kubectl
# (以 Ubuntu 为例)

# 1. 禁用 swap
swapoff -a
sed -i '/swap/d' /etc/fstab

# 2. 内核参数
cat <<EOF | tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
EOF
sysctl --system

# 3. 安装 containerd
apt-get update && apt-get install -y containerd.io
containerd config default > /etc/containerd/config.toml
# 修改 SystemdCgroup = true
systemctl restart containerd

# 4. 安装 kubeadm
apt-get install -y kubeadm kubelet kubectl
apt-mark hold kubeadm kubelet kubectl

# Master 节点:
kubeadm init \
  --pod-network-cidr=10.244.0.0/16 \
  --apiserver-advertise-address=<master-ip>

mkdir -p $HOME/.kube
cp /etc/kubernetes/admin.conf $HOME/.kube/config

# 安装 CNI (以 Calico 为例)
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml

# Worker 节点:
kubeadm join <master-ip>:6443 --token <token> \
  --discovery-token-ca-cert-hash sha256:<hash>
```

---

## 9. K8s API 版本与资源分组？

**回答：**

```
API 版本演进:
  v1alpha1 → v1beta1 → v1 (GA)

常见 API 组:
  apiVersion          资源
  ──────────────────  ────────────────────────
  v1                  Pod, Service, ConfigMap, Secret, PV, PVC, Namespace
  apps/v1             Deployment, ReplicaSet, StatefulSet, DaemonSet
  batch/v1            Job, CronJob
  networking.k8s.io/v1  Ingress, NetworkPolicy
  rbac.authorization.k8s.io/v1  Role, ClusterRole, RoleBinding
  storage.k8s.io/v1   StorageClass, CSIDriver
  autoscaling/v2      HPA
  policy/v1           PodDisruptionBudget
```

```bash
# 查看所有 API 资源
kubectl api-resources

# 查看特定资源的 API 版本
kubectl api-resources | grep deployment

# 查看资源的详细信息
kubectl explain deployment
kubectl explain deployment.spec.strategy

# 查看 API 组
kubectl api-versions
```

---

## 10. K8s 与 Docker 的关系？K8s 1.24 去 Docker 化？

**回答：**

```
历史关系:
  K8s 早期 → 直接调用 Docker Engine
  K8s 引入 CRI → Docker 不兼容 CRI
  K8s 维护 dockershim → 适配 Docker 到 CRI
  K8s 1.24 → 移除 dockershim

调用链变化:
  旧: kubelet → dockershim → Docker Engine → containerd → runc
  新: kubelet → CRI → containerd → runc
                       (或 CRI-O → runc)

影响:
  ✅ Docker 构建的镜像仍然可用（OCI 标准）
  ✅ Dockerfile 不需要修改
  ✅ docker push/pull 正常工作
  ❌ docker ps 看不到 K8s 容器了
  ❌ 不能在 Node 上用 docker 命令管理 K8s 容器

替代方案:
  - 使用 crictl 替代 docker 命令调试
  - 使用 nerdctl 作为 containerd 的友好 CLI

  命令对照:
    docker ps          → crictl ps
    docker logs        → crictl logs
    docker exec        → crictl exec
    docker images      → crictl images
    docker inspect     → crictl inspect
```
