# API网关与流量管理

---

## 1. API 网关的作用和架构？

**回答：**

```
API 网关: 微服务的统一入口, 承接所有外部请求

核心职责:
  ┌─────────────────────────────────────────┐
  │              API Gateway                 │
  │                                          │
  │  1. 路由转发    → 请求路由到对应微服务    │
  │  2. 认证鉴权    → JWT/OAuth2/API Key     │
  │  3. 限流熔断    → 保护后端服务            │
  │  4. 协议转换    → REST ↔ gRPC            │
  │  5. 请求聚合    → 一次请求调用多个服务    │
  │  6. 日志监控    → 请求日志/指标采集       │
  │  7. 灰度发布    → 按比例/Header 路由      │
  │  8. 跨域处理    → CORS                   │
  │  9. 缓存        → 响应缓存               │
  │ 10. 请求改写    → Header/Path 转换        │
  └─────────────────────────────────────────┘

架构位置:
  客户端 → DNS → CDN → LB → API Gateway → 微服务集群
                              │
                         南北向流量入口

与 Service Mesh 的分工:
  API Gateway: 南北向流量 (外部→内部)
  Service Mesh: 东西向流量 (服务→服务)
```

---

## 2. 主流 API 网关对比？

**回答：**

```
  ┌─────────────────┬──────────┬──────────┬──────────────────┐
  │ 网关             │ 技术栈    │ 性能     │ 特点              │
  ├─────────────────┼──────────┼──────────┼──────────────────┤
  │ Kong             │ Nginx+Lua│ 高       │ 插件丰富,社区大    │
  │ APISIX           │ Nginx+Lua│ 极高     │ 国产,动态配置     │
  │ Envoy            │ C++      │ 极高     │ Service Mesh 数据面│
  │ Traefik          │ Go       │ 高       │ 自动发现,K8s友好  │
  │ Spring Cloud GW  │ Java     │ 中       │ Java 生态,响应式  │
  │ AWS API Gateway  │ 托管      │ -        │ Serverless,免运维 │
  │ Nginx Ingress    │ Nginx    │ 高       │ K8s 标配          │
  └─────────────────┴──────────┴──────────┴──────────────────┘

选型建议:
  K8s 环境 + 简单需求      → Nginx Ingress / Traefik
  K8s + 高级流量管理       → APISIX / Kong
  Service Mesh 集成        → Envoy (Istio Gateway)
  Java 微服务              → Spring Cloud Gateway
  Serverless / AWS         → AWS API Gateway
  高性能 + 国产             → APISIX
```

---

## 3. Kong 网关详解？

**回答：**

```
Kong: 基于 OpenResty (Nginx + Lua) 的 API 网关

架构:
  Kong = OpenResty + PostgreSQL/Cassandra + 插件系统
  
  请求流:
    Client → Kong → Plugins (认证/限流/日志...) → Upstream Service

核心概念:
  Service:  后端微服务
  Route:    路由规则 (URL → Service)
  Upstream: 负载均衡目标
  Plugin:   功能插件 (认证/限流/日志)
  Consumer: API 消费者 (用户/应用)
```

```bash
# Kong Admin API 配置示例

# 创建 Service
curl -X POST http://kong:8001/services \
  --data name=user-service \
  --data url=http://user-svc:8080

# 创建 Route
curl -X POST http://kong:8001/services/user-service/routes \
  --data paths[]=/api/users \
  --data methods[]=GET \
  --data methods[]=POST

# 添加限流插件
curl -X POST http://kong:8001/services/user-service/plugins \
  --data name=rate-limiting \
  --data config.minute=100 \
  --data config.policy=redis \
  --data config.redis_host=redis

# 添加 JWT 认证
curl -X POST http://kong:8001/services/user-service/plugins \
  --data name=jwt

# 添加日志插件
curl -X POST http://kong:8001/services/user-service/plugins \
  --data name=http-log \
  --data config.http_endpoint=http://log-collector:9000
```

```
常用插件:
  认证: jwt, key-auth, oauth2, basic-auth, ldap-auth
  安全: cors, ip-restriction, bot-detection, acl
  限流: rate-limiting, request-size-limiting
  日志: http-log, file-log, tcp-log, syslog
  转换: request-transformer, response-transformer
  监控: prometheus, datadog, zipkin
```

---

## 4. APISIX 网关？

**回答：**

```
APISIX: Apache 顶级项目, 高性能云原生 API 网关

vs Kong:
  ┌──────────────┬──────────────┬──────────────┐
  │              │ Kong         │ APISIX       │
  ├──────────────┼──────────────┼──────────────┤
  │ 配置存储      │ PostgreSQL   │ etcd         │
  │ 配置生效      │ 需重载       │ 毫秒级热更新  │
  │ 路由匹配      │ O(n)        │ 前缀树 O(k)  │
  │ 性能          │ 高           │ 更高          │
  │ Dashboard    │ 企业版       │ 免费          │
  │ 生态          │ 更大         │ 快速增长      │
  └──────────────┴──────────────┴──────────────┘
```

```yaml
# APISIX 路由配置
# apisix.yaml (声明式配置)
routes:
  - uri: /api/users/*
    upstream:
      type: roundrobin
      nodes:
        "user-svc:8080": 1
    plugins:
      limit-req:
        rate: 100
        burst: 50
        key: remote_addr
      jwt-auth: {}
      prometheus: {}

  - uri: /api/orders/*
    upstream:
      type: roundrobin
      nodes:
        "order-svc:8080": 3
        "order-svc-v2:8080": 1  # 金丝雀
    plugins:
      traffic-split:
        rules:
          - match:
              - vars: [["http_x_canary", "==", "true"]]
            weighted_upstreams:
              - upstream:
                  nodes:
                    "order-svc-v2:8080": 1
                weight: 1
```

---

## 5. API 网关限流策略？

**回答：**

```
限流算法:
  ┌──────────────────┬──────────────────────────────┐
  │ 算法              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ 固定窗口          │ 每分钟 N 次, 窗口边界突刺问题 │
  │ 滑动窗口          │ 滚动时间窗口, 更平滑          │
  │ 令牌桶            │ 固定速率放令牌, 允许突发       │
  │ 漏桶              │ 固定速率处理, 平滑输出         │
  └──────────────────┴──────────────────────────────┘

令牌桶 (Token Bucket):
  以固定速率向桶中放令牌
  请求到来时取令牌, 取到则放行, 取不到则拒绝
  桶有上限 (burst), 允许一定突发

  速率 = rate (如 100/s)
  突发 = burst (如 150)
  → 平时 100 QPS, 短暂突发可达 150

漏桶 (Leaky Bucket):
  请求进入队列, 以固定速率流出
  → 严格平滑, 不允许突发

限流维度:
  全局限流:    整个 API 总 QPS
  IP 限流:     每个 IP 的 QPS
  用户限流:    每个用户/API Key 的 QPS
  服务限流:    每个后端服务的 QPS
```

```lua
-- Nginx/OpenResty 令牌桶限流 (Lua 示例)
local limit_req = require "resty.limit.req"

-- 创建限流器: 100 req/s, 允许 50 突发
local lim, err = limit_req.new("my_limit_store", 100, 50)

local delay, err = lim:incoming(ngx.var.remote_addr, true)
if not delay then
    if err == "rejected" then
        return ngx.exit(429)  -- Too Many Requests
    end
    return ngx.exit(500)
end

if delay > 0 then
    ngx.sleep(delay)  -- 排队等待
end
```

---

## 6. API 网关认证鉴权？

**回答：**

```
认证方式:
  ┌──────────────┬──────────────────────────────────┐
  │ 方式          │ 说明                              │
  ├──────────────┼──────────────────────────────────┤
  │ API Key      │ 简单, Header/Query 传递            │
  │ JWT          │ 无状态, 自包含用户信息              │
  │ OAuth 2.0    │ 标准授权框架, 第三方登录            │
  │ mTLS         │ 双向 TLS 证书, 服务间认证          │
  │ Basic Auth   │ Base64 编码, 仅内部/测试使用       │
  └──────────────┴──────────────────────────────────┘

JWT 认证流程:
  1. 用户登录 → Auth Service 颁发 JWT
  2. 请求携带: Authorization: Bearer <token>
  3. Gateway 验证 JWT (签名/过期/权限)
  4. 通过 → 转发到后端服务 (附带用户信息 Header)
  5. 失败 → 返回 401

网关层认证 vs 服务层认证:
  网关层: 统一认证/鉴权, 服务无需重复实现
  服务层: 细粒度权限控制 (如字段级权限)
  → 建议: 网关做粗粒度认证, 服务做细粒度鉴权
```

```yaml
# Kong JWT 认证配置
# 1. 创建 Consumer
curl -X POST http://kong:8001/consumers \
  --data username=app-client

# 2. 为 Consumer 创建 JWT 凭证
curl -X POST http://kong:8001/consumers/app-client/jwt \
  --data algorithm=RS256 \
  --data rsa_public_key=@public.pem

# 3. 为 Service 启用 JWT 插件
curl -X POST http://kong:8001/services/user-service/plugins \
  --data name=jwt
```

---

## 7. API 版本管理？

**回答：**

```
版本管理策略:
  ┌──────────────┬──────────────────────────────────┐
  │ 方式          │ 示例                              │
  ├──────────────┼──────────────────────────────────┤
  │ URL 路径      │ /api/v1/users, /api/v2/users     │
  │ Header       │ Accept: application/vnd.api.v2    │
  │ Query Param  │ /api/users?version=2              │
  │ 子域名        │ v1.api.example.com                │
  └──────────────┴──────────────────────────────────┘

推荐: URL 路径 (最直观, 最常用)

网关实现版本路由:
  /api/v1/* → v1 Service (旧版)
  /api/v2/* → v2 Service (新版)

版本管理最佳实践:
  1. 保持向后兼容 (新增字段, 不删旧字段)
  2. 明确废弃计划 (Sunset Header)
  3. 文档标注版本差异
  4. 最多维护 2-3 个版本
  5. 使用 OpenAPI/Swagger 规范
```

---

## 8. 请求聚合 (BFF 模式)？

**回答：**

```
BFF (Backend For Frontend): 
  为不同前端提供定制化的 API 网关

问题:
  移动端: 需要精简数据 (省流量)
  Web 端: 需要完整数据
  → 一个 API 难以满足所有端

BFF 架构:
  Web App    → Web BFF    → 微服务集群
  Mobile App → Mobile BFF → 微服务集群
  小程序      → Mini BFF   → 微服务集群

请求聚合:
  前端一次请求 → BFF 内部并行调用多个服务 → 聚合返回

  Client: GET /api/homepage
    ↓
  BFF:
    并行:
      GET /user-service/profile
      GET /product-service/recommendations
      GET /order-service/recent
    ↓
  聚合响应:
    {
      "user": {...},
      "recommendations": [...],
      "recentOrders": [...]
    }

GraphQL 替代方案:
  GraphQL 天然支持按需查询和聚合
  客户端自行声明需要哪些字段
  减少 over-fetching / under-fetching
```

---

## 9. K8s Ingress 与 Gateway API？

**回答：**

```
K8s 流量入口演进:
  Ingress (传统) → Gateway API (新标准)

Ingress:
  简单的 HTTP 路由规则
  功能有限, 各实现差异大 (annotations)
```

```yaml
# Ingress 示例
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/rate-limit: "100"
spec:
  ingressClassName: nginx
  tls:
  - hosts:
    - api.example.com
    secretName: tls-secret
  rules:
  - host: api.example.com
    http:
      paths:
      - path: /api/users
        pathType: Prefix
        backend:
          service:
            name: user-service
            port:
              number: 80
      - path: /api/orders
        pathType: Prefix
        backend:
          service:
            name: order-service
            port:
              number: 80
```

```yaml
# Gateway API (新标准, 更强大)
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: api-gateway
spec:
  gatewayClassName: istio  # 或 nginx, envoy
  listeners:
  - name: https
    port: 443
    protocol: HTTPS
    tls:
      certificateRefs:
      - name: tls-secret
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: user-route
spec:
  parentRefs:
  - name: api-gateway
  hostnames:
  - api.example.com
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api/users
    backendRefs:
    - name: user-service
      port: 80
      weight: 90
    - name: user-service-v2
      port: 80
      weight: 10  # 金丝雀发布
```

```
Gateway API vs Ingress:
  ┌──────────────┬──────────────┬──────────────┐
  │              │ Ingress      │ Gateway API  │
  ├──────────────┼──────────────┼──────────────┤
  │ 表达能力      │ 有限          │ 丰富         │
  │ 流量分割      │ 不支持        │ 原生支持     │
  │ Header 匹配  │ annotations  │ 原生支持     │
  │ 角色分离      │ 无            │ 基础设施/应用│
  │ 可移植性      │ annotations 不兼容│ 标准化   │
  │ 状态          │ 稳定          │ GA (v1.0+)  │
  └──────────────┴──────────────┴──────────────┘
```

---

## 10. API 网关面试速答？

**回答：**

```
Q: 为什么需要 API 网关?
A: 统一入口, 认证/限流/日志/路由集中管理
   避免每个服务重复实现横切关注点

Q: Kong vs APISIX?
A: Kong: 生态成熟, 插件丰富, PostgreSQL 存储
   APISIX: 性能更高, etcd 存储, 毫秒级热更新
   K8s 场景两者都行, 国内 APISIX 更流行

Q: 网关限流怎么做?
A: 令牌桶 (允许突发) 或 漏桶 (严格平滑)
   按 IP/用户/API 维度限流
   超限返回 429 Too Many Requests

Q: 网关和 Service Mesh 的区别?
A: 网关: 南北向 (客户端→服务)
   Mesh: 东西向 (服务→服务)
   功能有重叠 (限流/熔断), 但关注点不同

Q: 怎么做 API 版本管理?
A: URL 路径 (/v1/users) 最常用
   保持向后兼容, 最多维护 2-3 版本
   网关层路由到不同版本服务

Q: K8s Ingress 和 Gateway API?
A: Ingress: 简单 HTTP 路由, 靠 annotations 扩展
   Gateway API: 新标准, 原生支持流量分割/Header匹配
   趋势是 Gateway API 取代 Ingress
```
