# 云原生与 Kubernetes 运维八股文

---

## 一、云原生基础

### 1. 什么是云原生（Cloud Native）？核心技术有哪些？

**答：** 云原生是一套利用云计算优势构建和运行应用的方法论，由 CNCF 定义。

**云原生四大核心技术：**

| 技术 | 说明 | 代表工具 |
|------|------|----------|
| **容器化** | 应用打包和运行标准化 | Docker, containerd |
| **微服务** | 应用拆分为独立服务 | gRPC, REST API |
| **服务网格** | 服务间通信治理 | Istio, Linkerd |
| **声明式 API** | 描述期望状态而非操作步骤 | Kubernetes, Terraform |

---

## 二、Kubernetes 架构

### 2. Kubernetes 的核心架构是怎样的？

**答：**

```
┌─────── Control Plane ────────┐     ┌────── Worker Node ──────┐
│  API Server                   │     │  kubelet                 │
│  etcd                         │     │  kube-proxy              │
│  Scheduler                    │     │  Container Runtime       │
│  Controller Manager           │     │  Pod [Container(s)]      │
└──────────────────────────────┘     └─────────────────────────┘
```

| 组件 | 职责 |
|------|------|
| **API Server** | 集群的唯一入口，所有操作都通过它 |
| **etcd** | 分布式 KV 存储，保存集群所有状态 |
| **Scheduler** | 将 Pod 调度到合适的 Node |
| **Controller Manager** | 管理各种控制器（Deployment、ReplicaSet 等） |
| **kubelet** | Node 上的代理，管理 Pod 生命周期 |
| **kube-proxy** | 维护网络规则，实现 Service 负载均衡 |

### 3. Pod 的生命周期和常见状态有哪些？

**答：**

| 状态 | 说明 | 常见原因 |
|------|------|----------|
| **Pending** | 等待调度或拉取镜像 | 资源不足、镜像拉取慢 |
| **Running** | 至少一个容器在运行 | 正常状态 |
| **Succeeded** | 所有容器成功终止 | Job 正常完成 |
| **Failed** | 至少一个容器异常退出 | 应用错误、OOM |
| **CrashLoopBackOff** | 容器反复崩溃重启 | 应用启动失败 |
| **ImagePullBackOff** | 无法拉取镜像 | 镜像不存在、认证失败 |
| **Evicted** | Pod 被驱逐 | 节点资源不足 |

---

## 三、K8s 运维

### 4. K8s 常见故障排查思路？

**答：**

```
1. kubectl get pods             → 查看 Pod 状态
2. kubectl describe pod <name>  → 查看事件和详情
3. kubectl logs <pod>           → 查看容器日志
4. kubectl exec -it <pod> -- sh → 进入容器排查
5. kubectl top pod/node         → 查看资源使用
6. kubectl get events           → 查看集群事件
```

**按问题类型排查：**

| 问题 | 排查方向 |
|------|----------|
| Pod 起不来 | describe → Events → 资源/镜像/配置 |
| 服务不通 | Service → Endpoint → kube-proxy → 网络策略 |
| 性能差 | Resource Limits → HPA → Node 容量 |
| 节点异常 | Node Conditions → kubelet 日志 → 系统资源 |

### 5. K8s 中如何做资源管理（Requests/Limits）？

**答：**

| 参数 | 含义 | 影响 |
|------|------|------|
| **Requests** | 容器最低资源需求 | 调度依据，保证最少可用资源 |
| **Limits** | 容器最高资源上限 | 超出 CPU 会被限流，超出内存会被 OOM Kill |

**QoS 等级（Quality of Service）：**

| 等级 | 条件 | 驱逐优先级 |
|------|------|-----------|
| **Guaranteed** | requests = limits | 最后被驱逐 |
| **Burstable** | requests < limits | 中等 |
| **BestEffort** | 无 requests/limits | 最先被驱逐 |
