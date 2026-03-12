# Kubernetes 监控方案

---

## 1. K8s 监控整体架构？

**回答：**

```
K8s 监控层次:
  ┌─────────────────────────────────────────────────┐
  │  Layer 1: 基础设施层 (Infrastructure)            │
  │  节点: CPU, 内存, 磁盘, 网络                      │
  │  工具: node_exporter, CloudWatch                 │
  ├─────────────────────────────────────────────────┤
  │  Layer 2: 容器/运行时层 (Container Runtime)       │
  │  容器: CPU, 内存, 网络, IO                        │
  │  工具: cAdvisor (kubelet 内置)                    │
  ├─────────────────────────────────────────────────┤
  │  Layer 3: K8s 资源层 (Orchestration)             │
  │  Pod, Deployment, Service, Node 状态             │
  │  工具: kube-state-metrics                        │
  ├─────────────────────────────────────────────────┤
  │  Layer 4: 应用层 (Application)                   │
  │  QPS, 延迟, 错误率, 业务指标                      │
  │  工具: 应用内置 /metrics 端点                     │
  ├─────────────────────────────────────────────────┤
  │  Layer 5: 用户体验层 (User Experience)            │
  │  Synthetic Monitoring, RUM                       │
  │  工具: Blackbox Exporter, 前端监控                │
  └─────────────────────────────────────────────────┘

完整监控栈:
  ┌─────────────────────────────────────────────┐
  │              kube-prometheus-stack            │
  │  ┌─────────────────────────────────────────┐ │
  │  │ Prometheus Operator                     │ │
  │  │ Prometheus (指标采集存储)                │ │
  │  │ Alertmanager (告警管理)                  │ │
  │  │ Grafana (可视化)                         │ │
  │  │ node-exporter (节点指标)                 │ │
  │  │ kube-state-metrics (K8s 资源指标)        │ │
  │  │ 预置告警规则 + Dashboard                 │ │
  │  └─────────────────────────────────────────┘ │
  │  + Loki (日志)  + Tempo (链路追踪)          │
  └─────────────────────────────────────────────┘
```

---

## 2. kube-prometheus-stack 部署和配置？

**回答：**

```bash
# Helm 安装
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

# 安装 (带自定义值)
helm install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  -f values.yaml
```

```yaml
# values.yaml (关键配置)
prometheus:
  prometheusSpec:
    retention: 30d
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: gp3
          accessModes: ["ReadWriteOnce"]
          resources:
            requests:
              storage: 100Gi
    resources:
      requests:
        memory: 2Gi
        cpu: 500m
      limits:
        memory: 4Gi
    additionalScrapeConfigs: []      # 自定义抓取配置
    serviceMonitorSelectorNilUsesHelmValues: false  # 发现所有 ServiceMonitor

alertmanager:
  config:
    route:
      receiver: 'slack'
      group_by: ['alertname', 'namespace']
    receivers:
      - name: 'slack'
        slack_configs:
          - api_url: 'https://hooks.slack.com/services/xxx'
            channel: '#alerts'

grafana:
  adminPassword: "changeme"
  persistence:
    enabled: true
    size: 10Gi
  dashboardProviders:
    dashboardproviders.yaml:
      apiVersion: 1
      providers:
        - name: 'custom'
          folder: 'Custom'
          type: file
          options:
            path: /var/lib/grafana/dashboards/custom

nodeExporter:
  enabled: true

kubeStateMetrics:
  enabled: true

# 默认告警规则
defaultRules:
  create: true
  rules:
    etcd: true
    kubeApiserver: true
    kubeApiserverAvailability: true
    kubeControllerManager: true
    kubeScheduler: true
    node: true
    kubePrometheusNodeRecording: true
```

---

## 3. kube-state-metrics vs cAdvisor vs node-exporter？

**回答：**

```
三者负责不同层面的指标:

┌─────────────────────┬───────────────────────────────────────────────┐
│ 组件                 │ 指标类型                                      │
├─────────────────────┼───────────────────────────────────────────────┤
│ node-exporter       │ 节点硬件和 OS 指标                             │
│                     │ CPU, 内存, 磁盘, 网络, 文件系统                │
│                     │ node_cpu_seconds_total                        │
│                     │ node_memory_MemAvailable_bytes                │
│                     │ node_disk_io_time_seconds_total               │
├─────────────────────┼───────────────────────────────────────────────┤
│ cAdvisor            │ 容器运行时指标 (kubelet 内置)                  │
│                     │ 容器 CPU, 内存, 网络, 文件系统                 │
│                     │ container_cpu_usage_seconds_total             │
│                     │ container_memory_usage_bytes                  │
│                     │ container_network_receive_bytes_total         │
├─────────────────────┼───────────────────────────────────────────────┤
│ kube-state-metrics  │ K8s API 对象状态                               │
│                     │ Deployment, Pod, Node, Job 等的期望/实际状态   │
│                     │ kube_deployment_status_replicas               │
│                     │ kube_pod_status_phase                         │
│                     │ kube_node_status_condition                    │
│                     │ kube_pod_container_status_restarts_total      │
└─────────────────────┴───────────────────────────────────────────────┘

简记:
  node-exporter:      机器怎么样？ (硬件/OS)
  cAdvisor:           容器怎么样？ (资源使用)
  kube-state-metrics: K8s 对象怎么样？ (期望 vs 实际状态)
```

---

## 4. K8s 关键监控指标有哪些？

**回答：**

```
节点级指标:
  # CPU 使用率
  100 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100
  
  # 内存使用率
  (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100
  
  # 磁盘使用率
  (1 - node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes) * 100
  
  # 网络
  rate(node_network_receive_bytes_total[5m])   # 入口流量
  rate(node_network_transmit_bytes_total[5m])  # 出口流量

Pod/容器级指标:
  # Pod CPU 使用 vs 请求
  sum by(namespace, pod)(rate(container_cpu_usage_seconds_total[5m]))
  / sum by(namespace, pod)(kube_pod_container_resource_requests{resource="cpu"})
  
  # Pod 内存使用 vs 限制
  sum by(namespace, pod)(container_memory_usage_bytes)
  / sum by(namespace, pod)(kube_pod_container_resource_limits{resource="memory"})
  
  # OOM Kill 次数
  kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}
  
  # Pod 重启次数
  increase(kube_pod_container_status_restarts_total[1h])

Deployment 级指标:
  # 副本不足
  kube_deployment_status_replicas_available < kube_deployment_spec_replicas
  
  # 更新中
  kube_deployment_status_replicas_updated != kube_deployment_spec_replicas

集群级指标:
  # 节点状态
  kube_node_status_condition{condition="Ready", status="true"}
  
  # Pod 调度失败
  kube_pod_status_phase{phase="Pending"} > 0
  
  # API Server 请求延迟
  histogram_quantile(0.99, rate(apiserver_request_duration_seconds_bucket[5m]))
  
  # etcd 延迟
  histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m]))
```

---

## 5. ServiceMonitor 和 PodMonitor 怎么用？

**回答：**

```yaml
# 应用部署 (暴露 /metrics)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-app
  namespace: production
  labels:
    app: my-app
spec:
  replicas: 3
  template:
    metadata:
      labels:
        app: my-app
    spec:
      containers:
        - name: app
          image: myapp:v1.0
          ports:
            - name: http
              containerPort: 8080
            - name: metrics
              containerPort: 9090

---
# Service
apiVersion: v1
kind: Service
metadata:
  name: my-app
  namespace: production
  labels:
    app: my-app
spec:
  selector:
    app: my-app
  ports:
    - name: http
      port: 8080
    - name: metrics
      port: 9090

---
# ServiceMonitor (告诉 Prometheus 怎么抓)
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: my-app
  namespace: monitoring       # 或 production
  labels:
    release: monitoring       # 匹配 kube-prometheus-stack 的标签选择器
spec:
  namespaceSelector:
    matchNames:
      - production
  selector:
    matchLabels:
      app: my-app
  endpoints:
    - port: metrics           # 匹配 Service 端口名
      path: /metrics
      interval: 15s
      scrapeTimeout: 10s
      # TLS 配置
      # scheme: https
      # tlsConfig:
      #   insecureSkipVerify: true
      # 认证
      # bearerTokenFile: /var/run/secrets/xxx
```

```yaml
# PodMonitor (无需 Service, 直接监控 Pod)
apiVersion: monitoring.coreos.com/v1
kind: PodMonitor
metadata:
  name: my-batch-job
  namespace: monitoring
  labels:
    release: monitoring
spec:
  namespaceSelector:
    matchNames:
      - production
  selector:
    matchLabels:
      app: batch-job
  podMetricsEndpoints:
    - port: metrics
      path: /metrics
      interval: 30s
```

```
排查 ServiceMonitor 不生效:
  1. 检查标签: ServiceMonitor labels 是否匹配 Prometheus 的选择器
     kubectl get prometheus -n monitoring -o yaml | grep serviceMonitorSelector

  2. 检查 namespace: Prometheus 是否有权限发现该 namespace
     spec.serviceMonitorNamespaceSelector
  
  3. 检查 Service selector: ServiceMonitor selector 是否匹配 Service labels

  4. 检查 Targets: Prometheus UI → Status → Targets
  
  5. 检查 /metrics 端点: kubectl port-forward → curl localhost:9090/metrics
```

---

## 6. K8s 组件监控 (Control Plane)？

**回答：**

```
K8s 控制面组件:
  ┌─────────────────────┬───────────────────────────────────────┐
  │ 组件                 │ 关键指标                              │
  ├─────────────────────┼───────────────────────────────────────┤
  │ API Server          │ 请求延迟, 请求量, 错误率, watch 数    │
  │ etcd               │ 磁盘 fsync 延迟, leader 切换次数      │
  │ Scheduler          │ 调度延迟, 调度失败数, 队列深度         │
  │ Controller Manager │ 工作队列深度, 同步延迟                │
  │ CoreDNS            │ 查询量, 延迟, 缓存命中率              │
  │ kubelet            │ Pod 启动延迟, 运行 Pod 数, 容器操作   │
  └─────────────────────┴───────────────────────────────────────┘

API Server 关键指标:
  # 请求延迟 P99
  histogram_quantile(0.99, rate(apiserver_request_duration_seconds_bucket{verb!="WATCH"}[5m]))
  
  # 请求错误率
  sum(rate(apiserver_request_total{code=~"5.."}[5m])) / sum(rate(apiserver_request_total[5m]))
  
  # 活跃 watch 数
  apiserver_registered_watchers

etcd 关键指标:
  # WAL fsync 延迟 (> 10ms 需关注)
  histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m]))
  
  # Leader 切换 (不应频繁)
  increase(etcd_server_leader_changes_seen_total[1h])
  
  # 数据库大小
  etcd_mvcc_db_total_size_in_bytes

CoreDNS 指标:
  # DNS 查询量
  sum(rate(coredns_dns_requests_total[5m]))
  
  # DNS 查询延迟
  histogram_quantile(0.99, rate(coredns_dns_request_duration_seconds_bucket[5m]))
  
  # DNS 错误
  sum(rate(coredns_dns_responses_total{rcode="SERVFAIL"}[5m]))
```

---

## 7. HPA 自定义指标监控？

**回答：**

```yaml
# HPA 基于自定义 Prometheus 指标自动扩缩

# 1. 安装 Prometheus Adapter
helm install prometheus-adapter prometheus-community/prometheus-adapter \
  --namespace monitoring \
  -f adapter-values.yaml
```

```yaml
# adapter-values.yaml
prometheus:
  url: http://prometheus-operated.monitoring.svc
  port: 9090

rules:
  custom:
    - seriesQuery: 'http_requests_total{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace: {resource: "namespace"}
          pod: {resource: "pod"}
      name:
        matches: "^(.*)_total$"
        as: "${1}_per_second"
      metricsQuery: 'sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>)'
    
    - seriesQuery: 'http_request_duration_seconds_bucket{namespace!="",pod!=""}'
      resources:
        overrides:
          namespace: {resource: "namespace"}
          pod: {resource: "pod"}
      name:
        as: "http_request_duration_p99"
      metricsQuery: 'histogram_quantile(0.99, sum(rate(<<.Series>>{<<.LabelMatchers>>}[2m])) by (<<.GroupBy>>, le))'
```

```yaml
# 2. HPA 使用自定义指标
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-app-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-app
  minReplicas: 2
  maxReplicas: 20
  metrics:
    # CPU 指标
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    
    # 自定义指标: 每秒请求数
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"    # 每个 Pod 100 QPS
    
    # 自定义指标: P99 延迟
    - type: Pods
      pods:
        metric:
          name: http_request_duration_p99
        target:
          type: AverageValue
          averageValue: "500m"   # 500ms
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300
```

```bash
# 验证自定义指标 API
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1" | jq .
kubectl get --raw "/apis/custom.metrics.k8s.io/v1beta1/namespaces/production/pods/*/http_requests_per_second"
```

---

## 8. 容器资源监控与 Request/Limit？

**回答：**

```
Resources 设置:
  requests: 调度保证的最小资源量
  limits:   容器使用的最大资源量

  resources:
    requests:
      cpu: 100m        # 0.1 CPU
      memory: 128Mi    # 128 MB
    limits:
      cpu: 500m        # 0.5 CPU
      memory: 256Mi    # 256 MB

监控 requests/limits 使用率:
  # CPU Request 使用率 (是否 requests 设置合理)
  sum by(namespace, pod)(rate(container_cpu_usage_seconds_total{container!=""}[5m]))
  /
  sum by(namespace, pod)(kube_pod_container_resource_requests{resource="cpu"})
  
  理想: 50-80%
  过低: requests 设置过高, 浪费资源
  过高: requests 设置过低, 可能被 throttle

  # Memory Limit 使用率 (是否有 OOM 风险)
  sum by(namespace, pod)(container_memory_usage_bytes{container!=""})
  /
  sum by(namespace, pod)(kube_pod_container_resource_limits{resource="memory"})
  
  > 90%: 有 OOM Kill 风险

CPU Throttling:
  # container_cpu_cfs_throttled_seconds_total
  # CPU 被限流的时间
  rate(container_cpu_cfs_throttled_seconds_total[5m])
  /
  rate(container_cpu_cfs_periods_total[5m])
  
  > 25%: CPU limit 可能太低, 考虑提高

OOM Kill 检测:
  kube_pod_container_status_last_terminated_reason{reason="OOMKilled"}
  增加 memory limit 或优化内存使用

VPA (Vertical Pod Autoscaler) 推荐值:
  VPA 分析历史资源使用, 自动推荐 requests/limits
  kubectl get vpa my-app -o yaml
```

---

## 9. K8s 网络监控？

**回答：**

```
网络层面:
  ┌──────────────────┬─────────────────────────────────────────┐
  │ 层面              │ 监控点                                  │
  ├──────────────────┼─────────────────────────────────────────┤
  │ Pod 网络         │ 入出流量, 丢包率, 连接数                │
  │ Service 网络     │ kube-proxy, ClusterIP 流量              │
  │ Ingress 网络     │ Nginx Ingress 指标                      │
  │ DNS              │ CoreDNS 查询量, 延迟, 错误              │
  │ CNI 插件         │ Calico/Cilium 网络策略, 流量            │
  └──────────────────┴─────────────────────────────────────────┘

Pod 网络指标:
  # 入口流量
  sum by(namespace, pod)(rate(container_network_receive_bytes_total[5m]))
  
  # 出口流量
  sum by(namespace, pod)(rate(container_network_transmit_bytes_total[5m]))
  
  # 接收丢包
  sum by(namespace, pod)(rate(container_network_receive_packets_dropped_total[5m]))
  
  # 发送错误
  sum by(namespace, pod)(rate(container_network_transmit_errors_total[5m]))

Nginx Ingress 监控:
  # Ingress QPS
  sum by(ingress)(rate(nginx_ingress_controller_requests[5m]))
  
  # Ingress 错误率
  sum by(ingress)(rate(nginx_ingress_controller_requests{status=~"5.."}[5m]))
  / sum by(ingress)(rate(nginx_ingress_controller_requests[5m]))
  
  # Ingress P99 延迟
  histogram_quantile(0.99, sum by(le, ingress)(
    rate(nginx_ingress_controller_request_duration_seconds_bucket[5m])
  ))
```

```yaml
# Nginx Ingress ServiceMonitor
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: nginx-ingress
  namespace: monitoring
spec:
  namespaceSelector:
    matchNames: [ingress-nginx]
  selector:
    matchLabels:
      app.kubernetes.io/name: ingress-nginx
  endpoints:
    - port: metrics
      interval: 15s
```

---

## 10. K8s 监控告警规则清单？

**回答：**

```yaml
# 生产环境必备告警规则

# ===== 节点告警 =====
- alert: NodeNotReady
  expr: kube_node_status_condition{condition="Ready",status="true"} == 0
  for: 5m
  labels: { severity: critical }
  annotations: { summary: "Node {{ $labels.node }} is not ready" }

- alert: NodeHighCPU
  expr: |
    100 - avg by(instance)(rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100 > 85
  for: 10m
  labels: { severity: warning }

- alert: NodeHighMemory
  expr: |
    (1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 > 90
  for: 5m
  labels: { severity: warning }

- alert: NodeDiskPressure
  expr: |
    (1 - node_filesystem_avail_bytes{fstype!="tmpfs"} / node_filesystem_size_bytes) * 100 > 85
  for: 5m
  labels: { severity: warning }

# ===== Pod 告警 =====
- alert: PodCrashLooping
  expr: increase(kube_pod_container_status_restarts_total[1h]) > 5
  for: 5m
  labels: { severity: critical }
  annotations: { summary: "Pod {{ $labels.namespace }}/{{ $labels.pod }} crash looping" }

- alert: PodNotReady
  expr: |
    sum by(namespace, pod)(kube_pod_status_phase{phase=~"Pending|Unknown"}) > 0
  for: 15m
  labels: { severity: warning }

- alert: ContainerOOMKilled
  expr: |
    kube_pod_container_status_last_terminated_reason{reason="OOMKilled"} > 0
  for: 0m
  labels: { severity: warning }
  annotations: { summary: "Container {{ $labels.container }} OOM killed" }

# ===== Deployment 告警 =====
- alert: DeploymentReplicaMismatch
  expr: |
    kube_deployment_status_replicas_available != kube_deployment_spec_replicas
  for: 10m
  labels: { severity: warning }

# ===== PVC 告警 =====
- alert: PVCHighUsage
  expr: |
    kubelet_volume_stats_used_bytes / kubelet_volume_stats_capacity_bytes > 0.85
  for: 5m
  labels: { severity: warning }

# ===== 集群告警 =====
- alert: KubeAPIErrorsHigh
  expr: |
    sum(rate(apiserver_request_total{code=~"5.."}[5m]))
    / sum(rate(apiserver_request_total[5m])) > 0.03
  for: 10m
  labels: { severity: critical }

- alert: EtcdHighFsyncDuration
  expr: |
    histogram_quantile(0.99, rate(etcd_disk_wal_fsync_duration_seconds_bucket[5m])) > 0.5
  for: 10m
  labels: { severity: warning }
  annotations: { summary: "etcd WAL fsync is slow" }

# ===== 证书告警 =====
- alert: KubeCertExpiringSoon
  expr: |
    apiserver_client_certificate_expiration_seconds_count > 0
    and histogram_quantile(0.01, rate(apiserver_client_certificate_expiration_seconds_bucket[5m])) < 604800
  for: 0m
  labels: { severity: warning }
  annotations: { summary: "K8s client certificate expiring in less than 7 days" }
```
