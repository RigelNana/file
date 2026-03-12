# Service 与网络

---

## 1. Service 四种类型详解？

**回答：**

```
Service 为一组 Pod 提供稳定的网络端点和负载均衡

       外部流量
          │
    ┌─────▼─────┐
    │LoadBalancer│ ← 云厂商 LB
    │  NodePort  │ ← Node IP:30000-32767
    │  ClusterIP │ ← 集群内部虚拟 IP
    └─────┬─────┘
          │ kube-proxy (iptables/IPVS)
    ┌─────▼─────┐
    │  Pod  Pod  │
    │  Pod  Pod  │
    └────────────┘
```

### ClusterIP (默认)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
spec:
  type: ClusterIP               # 默认, 可省略
  selector:
    app: myapp
  ports:
    - name: http
      port: 80                  # Service 端口
      targetPort: 8080          # Pod 端口
      protocol: TCP
    - name: grpc
      port: 9090
      targetPort: 9090

# 访问方式:
#   集群内: myapp-svc:80 或 myapp-svc.namespace.svc.cluster.local:80
#   集群外: 不可达

# Headless Service (clusterIP: None)
# 不分配 ClusterIP, DNS 直接返回 Pod IP
# 用于 StatefulSet
spec:
  clusterIP: None
  selector:
    app: mysql
```

### NodePort

```yaml
spec:
  type: NodePort
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080            # 30000-32767, 不指定则随机

# 访问方式:
#   集群内: myapp-svc:80
#   集群外: <任意Node-IP>:30080 → Service → Pod
```

### LoadBalancer

```yaml
spec:
  type: LoadBalancer
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080
  # 云厂商自动创建 LB
  # status.loadBalancer.ingress[0].ip → LB 的外部 IP

# 注解控制云 LB 行为 (以 AWS 为例):
metadata:
  annotations:
    service.beta.kubernetes.io/aws-load-balancer-type: nlb
    service.beta.kubernetes.io/aws-load-balancer-scheme: internet-facing
```

### ExternalName

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-db
spec:
  type: ExternalName
  externalName: db.example.com   # CNAME 映射

# 访问 external-db → DNS 返回 db.example.com
# 用途: 引用集群外部服务, 方便迁移
```

---

## 2. kube-proxy 工作原理？

**回答：**

```
kube-proxy 运行在每个 Node 上, 维护 Service → Pod 的转发规则

三种模式:

1. iptables 模式 (默认):
   ┌────────┐     iptables DNAT      ┌──────┐
   │ Client │ ──→ ClusterIP:Port ──→ │ Pod1 │
   │        │     随机选择           │ Pod2 │
   └────────┘                        │ Pod3 │
                                     └──────┘
   原理:
     kube-proxy Watch Service/Endpoints 变化
     为每个 Service 创建 iptables 规则
     DNAT 将 ClusterIP 转换为随机 Pod IP
   
   优点: 内核态转发, 不经过用户空间
   缺点: 规则多时性能下降, 不支持高级负载均衡
         O(n) 规则匹配

2. IPVS 模式:
   使用 Linux IPVS 内核模块
   
   优点:
     O(1) 查找, 大规模集群性能好
     支持多种负载均衡算法:
       rr    — 轮询
       lc    — 最少连接
       dh    — 目的地址哈希
       sh    — 源地址哈希
       sed   — 最短期望延迟
       nq    — 不排队
   
   启用:
     kube-proxy --proxy-mode=ipvs

3. nftables 模式 (K8s 1.29+ alpha):
   使用 nftables 替代 iptables
   性能更好, 规则更简洁's
```

```bash
# 查看 kube-proxy 模式
kubectl get configmap kube-proxy -n kube-system -o yaml | grep mode

# 查看 iptables 规则
iptables -t nat -L KUBE-SERVICES -n
iptables -t nat -L KUBE-SVC-xxxx -n

# 查看 IPVS 规则
ipvsadm -Ln
```

---

## 3. Ingress 详解？

**回答：**

```
Ingress 提供七层(HTTP/HTTPS)负载均衡和路由

组件:
  Ingress 资源      — 定义路由规则(YAML)
  Ingress Controller — 实际执行路由的组件(需单独安装)

流量路径:
  Client → LB → Ingress Controller → Service → Pod

常用 Ingress Controller:
  控制器          特点
  ──────────────  ──────────────────────────
  Nginx Ingress   最流行, 功能全面
  Traefik         自动发现, Let's Encrypt
  HAProxy         高性能
  Istio Gateway   服务网格集成
  Contour         基于 Envoy
  Kong            API 网关功能
```

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: myapp-ingress
  annotations:
    # Nginx Ingress 常用注解
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/rate-limit-rps: "100"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://example.com"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - myapp.example.com
        - api.example.com
      secretName: tls-secret       # 包含 tls.crt 和 tls.key

  rules:
    # 基于域名路由
    - host: myapp.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-svc
                port:
                  number: 80
          - path: /api(/|$)(.*)
            pathType: ImplementationSpecific
            backend:
              service:
                name: api-svc
                port:
                  number: 80

    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-svc
                port:
                  number: 80

  # 默认后端(无匹配规则时)
  defaultBackend:
    service:
      name: default-svc
      port:
        number: 80
```

### pathType

```
Exact:
  /foo  → 仅匹配 /foo (不匹配 /foo/ 或 /foo/bar)

Prefix:
  /foo  → 匹配 /foo, /foo/, /foo/bar
  /     → 匹配所有路径

ImplementationSpecific:
  由 Ingress Controller 决定匹配方式
  Nginx 支持正则表达式
```

---

## 4. K8s DNS (CoreDNS) 详解？

**回答：**

```
CoreDNS 是 K8s 默认的 DNS 服务, 以 Deployment 运行在 kube-system 命名空间

DNS 记录:

类型      记录格式                                         示例
────────  ───────────────────────────────────────────────  ──────────────────────
Service   <svc>.<ns>.svc.cluster.local                    myapp.default.svc.cluster.local
Pod       <pod-ip-dashed>.<ns>.pod.cluster.local          10-244-1-5.default.pod.cluster.local
Headless  <pod-name>.<svc>.<ns>.svc.cluster.local         mysql-0.mysql-headless.db.svc.cluster.local

简写规则 (基于 /etc/resolv.conf search):
  同 Namespace:  myapp-svc       → myapp-svc.default.svc.cluster.local
  跨 Namespace:  myapp-svc.prod  → myapp-svc.prod.svc.cluster.local
```

```yaml
# CoreDNS ConfigMap
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        errors
        health {
            lazystart
        }
        ready
        kubernetes cluster.local in-addr.arpa ip6.arpa {
            pods insecure
            fallthrough in-addr.arpa ip6.arpa
        }
        prometheus :9153
        forward . /etc/resolv.conf {
            max_concurrent 1000
        }
        cache 30
        loop
        reload
        loadbalance
    }
```

```bash
# DNS 排查
# 使用 dnsutils Pod
kubectl run dnsutils --image=registry.k8s.io/e2e-test-images/jessie-dnsutils \
  --restart=Never -- sleep 3600
kubectl exec dnsutils -- nslookup myapp-svc
kubectl exec dnsutils -- nslookup myapp-svc.production.svc.cluster.local

# 检查 CoreDNS 是否运行
kubectl get pods -n kube-system -l k8s-app=kube-dns

# 检查 Pod 的 DNS 配置
kubectl exec myapp -- cat /etc/resolv.conf
```

---

## 5. NetworkPolicy 详解？

**回答：**

```
NetworkPolicy 控制 Pod 之间和 Pod 与外部的网络流量
类似防火墙规则, 默认 Pod 之间全互通(无 NetworkPolicy 时)

前提: CNI 插件需支持 NetworkPolicy (Calico, Cilium, Weave 支持; Flannel 不支持)

规则逻辑:
  - 没有任何 NetworkPolicy → Pod 全互通
  - 有 NetworkPolicy 选中 Pod → 只允许策略明确声明的流量
  - Ingress 规则控制入站, Egress 规则控制出站
  - 同一 Pod 被多个 NetworkPolicy 选中 → 取并集(所有规则合并)
```

```yaml
# 1. 默认拒绝所有入站
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
  namespace: production
spec:
  podSelector: {}           # 选中所有 Pod
  policyTypes:
    - Ingress
  ingress: []               # 空 = 拒绝所有

# 2. 默认拒绝所有出站
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-egress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Egress
  egress:
    - to: []                # 只允许 DNS
      ports:
        - port: 53
          protocol: UDP
        - port: 53
          protocol: TCP

# 3. 允许特定 Pod 访问
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
        - namespaceSelector:       # 允许 monitoring 命名空间访问
            matchLabels:
              name: monitoring
      ports:
        - port: 8080
          protocol: TCP

# 4. 允许特定 CIDR
  ingress:
    - from:
        - ipBlock:
            cidr: 10.0.0.0/8
            except:
              - 10.0.1.0/24
```

---

## 6. CNI 插件对比？

**回答：**

```
CNI (Container Network Interface) 负责 Pod 网络配置

主流 CNI 插件对比:

插件      网络模式        NetworkPolicy  性能    特点
────────  ──────────────  ────────────   ──────  ──────────────────
Calico    BGP/VXLAN/IPIP  ✅ 强大       高      最流行, 功能全面
Cilium    eBPF/VXLAN      ✅ L3-L7      很高    eBPF 高性能, 可观测性
Flannel   VXLAN/host-gw   ❌            中      简单, 适合小集群
Weave     VXLAN+加密      ✅ 基础       中      简单, 支持加密
Antrea    OVS/Geneve      ✅            高      VMware 支持

选型建议:
  小型集群/学习     → Flannel (简单)
  通用生产环境      → Calico (最成熟)
  高性能/可观测     → Cilium (eBPF, 推荐新集群)
  需要加密          → Weave / Cilium (WireGuard)
```

### Calico 网络模式

```
BGP 模式 (默认):
  Pod IP 通过 BGP 协议通告到网络
  无封装开销, 性能最好
  需要网络支持 BGP

IPIP 模式:
  IP-in-IP 封装
  跨子网通信
  有些封装开销

VXLAN 模式:
  VXLAN 封装
  兼容性最好
  开销较大

CrossSubnet:
  同子网用 BGP, 跨子网用 IPIP/VXLAN
  性能和兼容性平衡
```

---

## 7. Service Mesh 服务网格？

**回答：**

```
Service Mesh 在每个 Pod 中注入 Sidecar 代理, 处理服务间通信

架构:
  ┌──────────────────────────┐
  │    Control Plane         │
  │  (Istiod / Linkerd)      │
  │  配置下发, 证书管理       │
  └────────────┬─────────────┘
               │
  ┌────────────▼─────────────┐
  │    Data Plane            │
  │  ┌──────┐  ┌──────┐     │
  │  │ App  │  │Envoy │ ←── │ Sidecar 自动注入
  │  │      │──│Proxy │     │
  │  └──────┘  └──┬───┘     │
  │               │         │
  │  ┌──────┐  ┌──▼───┐     │
  │  │ App  │  │Envoy │     │
  │  │      │──│Proxy │     │
  │  └──────┘  └──────┘     │
  └──────────────────────────┘

功能:
  流量管理    — 金丝雀发布, 流量镜像, 超时/重试, 熔断
  安全        — mTLS 自动加密, 授权策略
  可观测性    — 分布式追踪, 指标, 访问日志

主流方案:
  Istio    — 功能最全, 复杂, 基于 Envoy
  Linkerd  — 轻量, 简单, Rust 实现
  Consul   — HashiCorp, 跨平台
```

---

## 8. Gateway API (Ingress 的继任者)？

**回答：**

```
Gateway API 是 K8s 网络 API 的下一代标准, 替代 Ingress

Ingress vs Gateway API:
  特性          Ingress          Gateway API
  ──────────    ──────────────   ──────────────────
  协议支持      HTTP/HTTPS       HTTP/HTTPS/TCP/UDP/gRPC/TLS
  角色分离      单一资源         GatewayClass/Gateway/Route 分离
  扩展性        Annotations      原生, 类型安全
  跨 Namespace  有限             原生支持
  状态          GA               GA (v1.0+)
```

```yaml
# GatewayClass — 基础设施提供者定义
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: nginx.org/gateway-controller

# Gateway — 集群管理员配置
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gateway
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      protocol: HTTP
      port: 80
    - name: https
      protocol: HTTPS
      port: 443
      tls:
        certificateRefs:
          - name: tls-secret

# HTTPRoute — 开发者配置路由
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-route
spec:
  parentRefs:
    - name: main-gateway
  hostnames:
    - "myapp.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-svc
          port: 80
          weight: 90
        - name: api-svc-canary
          port: 80
          weight: 10             # 金丝雀 10% 流量
```

---

## 9. Service 的会话保持与高级特性？

**回答：**

```yaml
# 会话保持 (Session Affinity)
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
spec:
  sessionAffinity: ClientIP       # None (默认) / ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 10800       # 会话超时 (3小时)
  selector:
    app: myapp
  ports:
    - port: 80
      targetPort: 8080

# externalTrafficPolicy
spec:
  type: NodePort                  # 或 LoadBalancer
  externalTrafficPolicy: Local    # Cluster(默认) / Local

# Cluster: 流量可能跨 Node 转发, 源 IP 会被 SNAT
# Local:   流量只发到本 Node 的 Pod, 保留源 IP
#          如果本 Node 没有 Pod → 丢弃

# internalTrafficPolicy (K8s 1.26+)
spec:
  internalTrafficPolicy: Local    # 集群内部流量优先本 Node

# topologyKeys (已废弃, 用 topology-aware hints 替代)
# Topology Aware Routing
metadata:
  annotations:
    service.kubernetes.io/topology-mode: Auto
# 优先路由到同一 Zone 的 Pod
```

---

## 10. K8s 网络排查？

**回答：**

```bash
# ===== 1. Pod 网络 =====
# 查看 Pod IP
kubectl get pods -o wide

# 测试 Pod 间连通性
kubectl exec pod-a -- ping <pod-b-ip>
kubectl exec pod-a -- curl http://<pod-b-ip>:8080

# ===== 2. Service 排查 =====
# 检查 Service
kubectl get svc myapp-svc
kubectl describe svc myapp-svc

# 检查 Endpoints (Service 是否关联到 Pod)
kubectl get endpoints myapp-svc
# 如果 ENDPOINTS 为空 → selector 没匹配到 Pod
# 检查 Pod labels 是否与 Service selector 一致

# 检查 EndpointSlice (新版)
kubectl get endpointslices -l kubernetes.io/service-name=myapp-svc

# ===== 3. DNS 排查 =====
kubectl run tmp --rm -it --image=busybox -- nslookup myapp-svc
# Server:    10.96.0.10 (CoreDNS)
# Name:      myapp-svc.default.svc.cluster.local
# Address:   10.96.xxx.xxx

# DNS 失败排查:
kubectl get pods -n kube-system -l k8s-app=kube-dns
kubectl logs -n kube-system -l k8s-app=kube-dns

# ===== 4. Ingress 排查 =====
kubectl describe ingress myapp-ingress
# 检查 Rules, TLS, Default Backend
kubectl logs -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx

# ===== 5. 网络策略排查 =====
kubectl get networkpolicy -A
kubectl describe networkpolicy <name>

# ===== 6. 使用 netshoot 全面排查 =====
kubectl run netshoot --rm -it --image=nicolaka/netshoot -- bash
# 工具: tcpdump, dig, nslookup, curl, iperf, ss, ip, traceroute

# ===== 常见问题 =====
# Pod 无法访问 Service
#   → 检查 Endpoints 是否为空
#   → 检查 Pod readiness (未 Ready 的 Pod 不在 Endpoints 中)
#   → 检查 NetworkPolicy
#
# 外部无法访问
#   → 检查 NodePort 端口是否开放
#   → 检查 Ingress Controller 是否运行
#   → 检查云 LB 安全组/防火墙
```
