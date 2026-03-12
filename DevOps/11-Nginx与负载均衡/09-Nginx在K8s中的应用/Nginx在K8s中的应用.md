# Nginx 在 Kubernetes 中的应用

---

## 1. Kubernetes Ingress 是什么？

**回答：**

```
Ingress 概念:

  Ingress = K8s 中管理集群外部访问的 API 对象
  定义了 HTTP/HTTPS 路由规则

  没有 Ingress 时:
    Client → NodePort/LoadBalancer → Service → Pod
    每个服务需要独立的 LB (成本高)

  有 Ingress 时:
    Client → LoadBalancer → Ingress Controller (Nginx)
                              ├→ /app    → Service A → Pod
                              ├→ /api    → Service B → Pod
                              └→ /admin  → Service C → Pod
    一个 LB 入口, 按规则路由到不同服务

关键组件:
  ┌──────────────────┬──────────────────────────────┐
  │ 组件              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ Ingress 资源      │ YAML 定义路由规则             │
  │ Ingress Controller│ 实现路由的实际组件 (Nginx Pod)│
  │ IngressClass     │ 指定使用哪个 Controller       │
  └──────────────────┴──────────────────────────────┘

Ingress Controller 对比:
  ┌──────────────────┬──────────────────────────────┐
  │ Controller        │ 特点                          │
  ├──────────────────┼──────────────────────────────┤
  │ Nginx Ingress    │ 最常用, 社区维护 (K8s官方)    │
  │ Nginx Inc Ingress│ Nginx 公司维护 (商业+开源)    │
  │ Traefik          │ 自动发现, 动态配置            │
  │ HAProxy Ingress  │ HAProxy 内核, 高性能          │
  │ Istio Gateway    │ 服务网格集成                  │
  │ Kong Ingress     │ API Gateway 功能              │
  │ AWS ALB Ingress  │ AWS 原生 ALB                  │
  └──────────────────┴──────────────────────────────┘
```

---

## 2. Nginx Ingress Controller 部署？

**回答：**

```bash
# ============ Helm 安装 (推荐) ============
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.replicaCount=2 \
  --set controller.resources.requests.cpu=100m \
  --set controller.resources.requests.memory=256Mi \
  --set controller.metrics.enabled=true \
  --set controller.metrics.serviceMonitor.enabled=true
```

```yaml
# ============ 自定义 values.yaml ============
controller:
  replicaCount: 2
  
  # 资源限制
  resources:
    requests:
      cpu: 200m
      memory: 256Mi
    limits:
      cpu: 1
      memory: 1Gi
  
  # Pod 反亲和性 (分散到不同节点)
  affinity:
    podAntiAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app.kubernetes.io/name: ingress-nginx
            topologyKey: kubernetes.io/hostname
  
  # 性能优化
  config:
    worker-processes: "auto"
    worker-connections: "65535"
    use-gzip: "true"
    enable-brotli: "true"
    log-format-upstream: >-
      {"time":"$time_iso8601","remote_addr":"$remote_addr",
       "request":"$request","status":$status,
       "request_time":$request_time,
       "upstream_response_time":"$upstream_response_time"}
  
  # Prometheus 监控
  metrics:
    enabled: true
    serviceMonitor:
      enabled: true
  
  # 服务类型
  service:
    type: LoadBalancer
    # annotations:
    #   service.beta.kubernetes.io/aws-load-balancer-type: nlb
```

---

## 3. Ingress 资源配置？

**回答：**

```yaml
# ============ 基础 Ingress ============
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  namespace: default
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend-service
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls-secret

---
# ============ 多域名 Ingress ============
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: multi-host-ingress
spec:
  ingressClassName: nginx
  rules:
    - host: web.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web-service
                port:
                  number: 80
    - host: api.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api-service
                port:
                  number: 8080

---
# ============ pathType 说明 ============
# Prefix:        前缀匹配 /api → /api, /api/, /api/users
# Exact:         精确匹配 /api → 只匹配 /api
# ImplementationSpecific: 由 IngressClass 决定
```

---

## 4. Nginx Ingress 常用注解 (Annotations)？

**回答：**

```yaml
metadata:
  annotations:
    # ============ 路由与重写 ============
    nginx.ingress.kubernetes.io/rewrite-target: /$2
    # 配合正则: path: /api(/|$)(.*)
    # /api/users → /users (发送到后端)

    nginx.ingress.kubernetes.io/use-regex: "true"
    # 启用正则路径匹配

    nginx.ingress.kubernetes.io/app-root: /dashboard
    # 访问 / 时重定向到 /dashboard

    # ============ SSL/TLS ============
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    
    # ============ 代理设置 ============
    nginx.ingress.kubernetes.io/proxy-body-size: "100m"
    nginx.ingress.kubernetes.io/proxy-connect-timeout: "5"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "60"
    nginx.ingress.kubernetes.io/proxy-buffer-size: "8k"
    
    # ============ 限流 ============
    nginx.ingress.kubernetes.io/limit-rps: "10"
    nginx.ingress.kubernetes.io/limit-connections: "5"
    nginx.ingress.kubernetes.io/limit-rpm: "300"
    
    # ============ CORS ============
    nginx.ingress.kubernetes.io/enable-cors: "true"
    nginx.ingress.kubernetes.io/cors-allow-origin: "https://app.example.com"
    nginx.ingress.kubernetes.io/cors-allow-methods: "GET, POST, PUT, DELETE"
    nginx.ingress.kubernetes.io/cors-allow-headers: "Content-Type, Authorization"
    
    # ============ WebSocket ============
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    # WebSocket 需要长超时
    
    # ============ 认证 ============
    nginx.ingress.kubernetes.io/auth-type: basic
    nginx.ingress.kubernetes.io/auth-secret: basic-auth-secret
    nginx.ingress.kubernetes.io/auth-realm: "Authentication Required"
    
    # 外部认证
    nginx.ingress.kubernetes.io/auth-url: "http://auth-service.default.svc.cluster.local/verify"
    nginx.ingress.kubernetes.io/auth-signin: "https://login.example.com"
    
    # ============ 自定义 Nginx 配置 ============
    nginx.ingress.kubernetes.io/configuration-snippet: |
      more_set_headers "X-Custom-Header: value";
    
    nginx.ingress.kubernetes.io/server-snippet: |
      location /custom {
          return 200 "custom response";
      }

    # ============ 灰度发布 (Canary) ============
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
    # 10% 流量到 canary 版本
    
    nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    # Header X-Canary: always → 100% 到 canary
    
    nginx.ingress.kubernetes.io/canary-by-cookie: "canary"
    # Cookie canary=always → 到 canary
```

---

## 5. Ingress TLS 配置？

**回答：**

```bash
# ============ 手动创建 TLS Secret ============
kubectl create secret tls app-tls-secret \
  --cert=fullchain.pem \
  --key=privkey.pem \
  -n default
```

```yaml
# ============ Ingress 引用 TLS Secret ============
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
        - api.example.com
      secretName: app-tls-secret
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80

---
# ============ cert-manager 自动管理证书 ============
# 安装 cert-manager
# helm install cert-manager jetstack/cert-manager \
#   --namespace cert-manager --create-namespace \
#   --set crds.enabled=true

# ClusterIssuer (Let's Encrypt)
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@example.com
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx

---
# Ingress 使用 cert-manager 自动申请证书
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls-auto    # cert-manager 自动创建
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
```

---

## 6. Ingress Canary 灰度发布？

**回答：**

```yaml
# ============ 主 Ingress (Stable 版本) ============
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-stable
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-stable
                port:
                  number: 80

---
# ============ Canary Ingress (金丝雀版本) ============
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    
    # 方式 1: 按权重 (10% 流量到 canary)
    nginx.ingress.kubernetes.io/canary-weight: "10"
    
    # 方式 2: 按 Header
    # nginx.ingress.kubernetes.io/canary-by-header: "X-Canary"
    # nginx.ingress.kubernetes.io/canary-by-header-value: "true"
    
    # 方式 3: 按 Cookie
    # nginx.ingress.kubernetes.io/canary-by-cookie: "canary"
spec:
  ingressClassName: nginx
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-canary
                port:
                  number: 80

# ============ 灰度发布流程 ============
# 1. 部署 canary Deployment + Service
# 2. 创建 canary Ingress (weight=5%)
# 3. 监控 canary 指标 (错误率, 延迟)
# 4. 逐步增加权重 (10% → 25% → 50% → 100%)
# 5. 全量后更新 stable Deployment, 删除 canary

# 优先级: Header > Cookie > Weight
```

---

## 7. Nginx Ingress 性能调优？

**回答：**

```yaml
# ============ ConfigMap 全局配置 ============
apiVersion: v1
kind: ConfigMap
metadata:
  name: ingress-nginx-controller
  namespace: ingress-nginx
data:
  # Worker 进程
  worker-processes: "auto"
  worker-connections: "65535"
  
  # Keep-Alive
  keep-alive: "75"
  keep-alive-requests: "10000"
  upstream-keepalive-connections: "320"
  upstream-keepalive-timeout: "60"
  upstream-keepalive-requests: "10000"
  
  # 缓冲
  proxy-buffer-size: "8k"
  proxy-buffers-number: "4"
  
  # 压缩
  use-gzip: "true"
  gzip-level: "6"
  gzip-min-length: "1000"
  gzip-types: "application/json application/javascript text/css text/plain"
  
  # 超时
  proxy-connect-timeout: "5"
  proxy-read-timeout: "60"
  proxy-send-timeout: "60"
  
  # 限流
  limit-req-status-code: "429"
  
  # 日志
  log-format-upstream: >-
    {"time":"$time_iso8601","remote_addr":"$remote_addr",
     "host":"$host","request":"$request","status":$status,
     "request_time":$request_time,
     "upstream_response_time":"$upstream_response_time",
     "upstream_addr":"$upstream_addr"}
  
  # SSL
  ssl-protocols: "TLSv1.2 TLSv1.3"
  ssl-redirect: "true"
  hsts: "true"
  hsts-max-age: "63072000"
  
  # 安全
  server-tokens: "false"
  hide-headers: "X-Powered-By,Server"

# ============ HPA 自动扩缩 ============
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ingress-nginx
  namespace: ingress-nginx
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ingress-nginx-controller
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

---

## 8. Nginx Ingress 监控？

**回答：**

```yaml
# ============ 启用 Prometheus 指标 ============
# Helm values:
controller:
  metrics:
    enabled: true
    serviceMonitor:
      enabled: true
      namespace: monitoring

# 指标端点: :10254/metrics

# ============ 关键指标 ============
# 
# 请求相关:
#   nginx_ingress_controller_requests
#     labels: host, path, method, status
#     → 请求数 (按状态码, 域名, 路径分组)
#
#   nginx_ingress_controller_request_duration_seconds
#     → 请求延迟直方图
#
#   nginx_ingress_controller_response_size
#     → 响应大小
#
# 连接相关:
#   nginx_ingress_controller_nginx_process_connections
#     labels: state (active, reading, writing, waiting)
#
# 后端相关:
#   nginx_ingress_controller_upstream_latency_seconds
#     → 后端响应延迟
```

```
# ============ Grafana Dashboard ============
# 推荐 Dashboard ID: 9614 (NGINX Ingress Controller)

# ============ 常用告警规则 ============

# 高错误率
- alert: NginxIngress5xxRate
  expr: |
    sum(rate(nginx_ingress_controller_requests{status=~"5.."}[5m]))
    / sum(rate(nginx_ingress_controller_requests[5m])) > 0.05
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Ingress 5xx 错误率超过 5%"

# 高延迟
- alert: NginxIngressHighLatency
  expr: |
    histogram_quantile(0.99,
      sum(rate(nginx_ingress_controller_request_duration_seconds_bucket[5m]))
      by (le, host)
    ) > 5
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "Ingress P99 延迟超过 5 秒"

# 证书即将过期
- alert: NginxIngressCertExpiring
  expr: |
    nginx_ingress_controller_ssl_expire_time_seconds - time() < 7*24*3600
  labels:
    severity: warning
  annotations:
    summary: "SSL 证书将在 7 天内过期"
```

---

## 9. Gateway API vs Ingress？

**回答：**

```
Ingress 的局限:
  • 功能有限 (基本路由, 无流量拆分)
  • 依赖 annotations 扩展 (不可移植)
  • 不支持 TCP/UDP 路由
  • 权限模型单一
  • 不同 Controller annotations 不兼容

Gateway API (K8s 新标准):
  更丰富, 更标准化, 最终将替代 Ingress
```

```yaml
# ============ Gateway API 资源 ============

# 1. GatewayClass (集群级, 类似 IngressClass)
apiVersion: gateway.networking.k8s.io/v1
kind: GatewayClass
metadata:
  name: nginx
spec:
  controllerName: gateway.nginx.org/nginx-gateway-controller

---
# 2. Gateway (基础设施团队管理)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: main-gateway
  namespace: infra
spec:
  gatewayClassName: nginx
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "*.example.com"
      tls:
        mode: Terminate
        certificateRefs:
          - name: wildcard-cert

---
# 3. HTTPRoute (应用团队管理)
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
  namespace: app-ns
spec:
  parentRefs:
    - name: main-gateway
      namespace: infra
  hostnames:
    - "app.example.com"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-service
          port: 8080
          weight: 90
        - name: api-canary
          port: 8080
          weight: 10     # 内置流量拆分!

# Gateway API 优势:
#   ✓ 标准化 (无需 annotations)
#   ✓ 角色分离 (基础设施 vs 应用)
#   ✓ 内置流量拆分/灰度
#   ✓ 支持 TCP/UDP (TCPRoute, UDPRoute)
#   ✓ Header 修改, 请求镜像等
#   ✓ 跨 Controller 可移植
```

---

## 10. Nginx 在 K8s 中的常见问题？

**回答：**

```
Q: 413 Request Entity Too Large?
A: 添加注解:
   nginx.ingress.kubernetes.io/proxy-body-size: "100m"

Q: 502 Bad Gateway?
A: 检查:
   1. 后端 Pod 是否 Running
   2. Service selector 是否正确
   3. 端口是否匹配 (containerPort vs service port)
   4. Pod readinessProbe 是否通过
   5. kubectl logs ingress-nginx-controller-xxx

Q: WebSocket 断开?
A: 设置超时:
   nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
   nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"

Q: Ingress 不生效?
A: 排查步骤:
   1. kubectl get ingress → 确认 ADDRESS 有值
   2. kubectl describe ingress → 看 Events
   3. 确认 IngressClass 正确
   4. 确认域名 DNS 解析到 Ingress LB
   5. kubectl logs -n ingress-nginx <controller-pod>

Q: 多个 Ingress Controller 共存?
A: 使用 IngressClass:
   spec.ingressClassName: nginx       # 指定使用哪个
   spec.ingressClassName: traefik     # 另一个

Q: 如何查看 Nginx 生成的配置?
A: kubectl exec -n ingress-nginx <pod> -- cat /etc/nginx/nginx.conf
   kubectl exec -n ingress-nginx <pod> -- nginx -T

Q: 如何实现蓝绿部署?
A: 两种方式:
   1. 修改 Service selector 切换 Deployment
   2. 使用 Canary Ingress, weight=0 或 100

Q: 性能瓶颈排查?
A: 1. 检查 Ingress Controller CPU/Memory 使用
   2. upstream_response_time vs request_time
   3. 连接数 (nginx_process_connections)
   4. HPA 扩缩是否及时
   5. 考虑 keep-alive 优化
```
