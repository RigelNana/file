# LitmusChaos 与 K8s 混沌八股文

---

## 一、LitmusChaos 概述

### 1. 什么是 LitmusChaos？

**答：**

```
LitmusChaos 是一个开源的云原生混沌工程平台，
专为 Kubernetes 环境设计，是 CNCF 孵化项目。

核心特点：
  ┌──────────────────────────────────────┐
  │ 1. K8s 原生：CRD 驱动               │
  │ 2. 丰富的实验库（ChaosHub）          │
  │ 3. 声明式实验定义                    │
  │ 4. 内置安全防护                      │
  │ 5. 可视化控制台                      │
  └──────────────────────────────────────┘

架构组件：
  ┌─────────────┐
  │ Litmus Portal│ ← Web UI
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │ Chaos Center│ ← 控制平面
  └──────┬──────┘
         ▼
  ┌─────────────┐     ┌───────────────┐
  │ Chaos Agent │ ──→ │ ChaosEngine   │
  │ (per cluster)│    │ ChaosExperiment│
  └─────────────┘     │ ChaosResult   │
                      └───────────────┘
```

### 2. LitmusChaos 的核心 CRD 有哪些？

**答：**

| CRD | 作用 | 说明 |
|-----|------|------|
| **ChaosEngine** | 实验触发器 | 绑定应用和实验 |
| **ChaosExperiment** | 实验定义 | 定义故障注入方式 |
| **ChaosResult** | 实验结果 | 记录实验输出 |

```yaml
# ChaosEngine 示例：对 payment 服务注入 Pod Kill
apiVersion: litmuschaos.io/v1alpha1
kind: ChaosEngine
metadata:
  name: payment-chaos
  namespace: production
spec:
  appinfo:
    appns: production
    applabel: "app=payment-api"
    appkind: deployment
  chaosServiceAccount: litmus-admin
  experiments:
    - name: pod-delete
      spec:
        components:
          env:
            - name: TOTAL_CHAOS_DURATION
              value: "30"         # 持续30秒
            - name: CHAOS_INTERVAL
              value: "10"         # 每10秒Kill一次
            - name: FORCE
              value: "false"      # 优雅终止
        probe:
          - name: "check-payment-health"
            type: httpProbe
            httpProbe/inputs:
              url: "http://payment-api:8080/health"
              expectedResponseCode: "200"
            mode: Continuous
            runProperties:
              probeTimeout: 5
              interval: 5
              retry: 3
```

### 3. LitmusChaos 常用实验有哪些？

**答：**

```
LitmusChaos 实验分类：

Pod 级别：
  ├── pod-delete         随机删除 Pod
  ├── pod-cpu-hog        Pod CPU 压力
  ├── pod-memory-hog     Pod 内存压力
  ├── pod-io-stress      Pod 磁盘 IO 压力
  └── container-kill     杀死容器

Node 级别：
  ├── node-drain         节点驱逐
  ├── node-taint         节点打污点
  ├── node-cpu-hog       节点 CPU 压力
  ├── node-memory-hog    节点内存压力
  └── node-io-stress     节点 IO 压力

网络级别：
  ├── pod-network-loss    网络丢包
  ├── pod-network-latency 网络延迟
  ├── pod-network-corruption 网络包损坏
  └── pod-network-duplication 网络包重复

AWS 集成：
  ├── ec2-terminate       终止 EC2 实例
  ├── ebs-loss            EBS 卷脱离
  └── aws-az-chaos        AZ 故障模拟
```

---

## 二、K8s 混沌实践

### 4. 如何在 K8s 集群中系统化开展混沌实验？

**答：**

```
K8s 混沌实验路径：

Phase 1: Pod 韧性验证
  ├── 单 Pod 删除 → 验证 ReplicaSet 自愈
  ├── 多 Pod 同时删除 → 验证 PDB 保护
  ├── Pod CPU/Memory Hog → 验证 Resource Limit
  └── 容器 OOM → 验证重启策略

Phase 2: Node 韧性验证
  ├── Node Drain → 验证 Pod 调度
  ├── Node 网络隔离 → 验证跨节点通信
  └── Node 资源压力 → 验证驱逐策略

Phase 3: 网络韧性验证
  ├── 服务间网络延迟 → 验证超时配置
  ├── DNS 故障 → 验证 DNS 缓存
  └── 服务间丢包 → 验证重试机制

Phase 4: 依赖韧性验证
  ├── DB 连接中断 → 验证连接池和重连
  ├── Redis 不可用 → 验证降级缓存
  └── MQ 积压 → 验证背压处理
```

### 5. 如何保证混沌实验在 K8s 中的安全性？

**答：**

```yaml
# PodDisruptionBudget 保护关键服务
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: payment-pdb
spec:
  minAvailable: 2        # 至少保留2个Pod
  selector:
    matchLabels:
      app: payment-api

---
# RBAC 限制混沌实验权限
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: chaos-runner
  namespace: production
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "delete"]
  - apiGroups: [""]
    resources: ["pods/exec"]
    verbs: ["create"]    # 故障注入需要
```

```
安全防护清单：
  ├── PDB 保护最小可用 Pod 数
  ├── RBAC 限制混沌实验的权限范围
  ├── Namespace 隔离实验范围
  ├── Label 选择器精确锁定目标
  ├── 探针 (Probe) 持续验证业务健康
  └── 超时机制自动终止实验
```

---

## 三、面试高频题

### 6. 面试题：如何在 K8s 中验证高可用设计？

**答：**

```
混沌实验验证矩阵：

高可用设计             混沌实验              期望结果
──────────          ──────────            ──────────
Pod 多副本       ← pod-delete          → 服务无中断
跨 AZ 部署       ← node-drain          → 流量自动切换
健康检查         ← pod-cpu-hog         → 不健康Pod被剔除
自动扩容         ← pod-memory-hog      → HPA 触发扩容
优雅关闭         ← pod-delete(SIGTERM) → 请求无丢失
连接池重连       ← pod-network-loss    → 连接自动恢复
限流保护         ← 流量注入             → 限流生效
降级开关         ← 依赖故障注入         → 平滑降级
```

### 7. 面试题：LitmusChaos 和 Chaos Mesh 怎么选？

**答：**

| 维度 | LitmusChaos | Chaos Mesh |
|------|------------|------------|
| 发起者 | LitmusChaos 社区 | PingCAP |
| CNCF | 孵化项目 | 孵化项目 |
| 安装方式 | Helm / Operator | Helm / Operator |
| 实验类型 | 丰富（含云厂商） | K8s 原生为主 |
| UI 控制台 | 有（Litmus Portal）| 有（Dashboard）|
| 编排能力 | Workflow 支持 | Workflow 支持 |
| 社区活跃度 | 高 | 高 |
| **侧重点** | 端到端混沌平台 | 精细化故障注入 |

```
选型建议：
  多云/混合云 → LitmusChaos（云厂商支持好）
  纯 K8s 环境 → Chaos Mesh（K8s 集成深）
  需要 Workflow → 两者都支持
  需要精细网络控制 → Chaos Mesh（基于 eBPF）
```
