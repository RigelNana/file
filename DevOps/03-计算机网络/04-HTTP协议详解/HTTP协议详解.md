# HTTP 协议详解

---

## 1. HTTP 协议的基本概念？请求和响应的报文结构？

**回答：**

### HTTP 基本特点

```
HTTP（HyperText Transfer Protocol）超文本传输协议
  - 应用层协议，基于 TCP（HTTP/3 基于 QUIC/UDP）
  - 无状态（每个请求独立，服务器不记住之前的请求）
  - 请求-响应模型（客户端发起请求，服务器返回响应）
  - 文本协议（HTTP/1.x），二进制协议（HTTP/2+）
```

### 请求报文

```
┌─────────────────────────────────────────────────┐
│  请求行:  GET /api/users?page=1 HTTP/1.1        │
├─────────────────────────────────────────────────┤
│  请求头:  Host: api.example.com                 │
│          Accept: application/json               │
│          Authorization: Bearer <token>          │
│          User-Agent: curl/7.68.0                │
│          Content-Type: application/json         │
│          Connection: keep-alive                 │
├─────────────────────────────────────────────────┤
│  空行 (\r\n)                                    │
├─────────────────────────────────────────────────┤
│  请求体:  {"name": "test", "email": "..."}     │
│  (GET 通常无请求体)                              │
└─────────────────────────────────────────────────┘
```

### 响应报文

```
┌─────────────────────────────────────────────────┐
│  状态行:  HTTP/1.1 200 OK                       │
├─────────────────────────────────────────────────┤
│  响应头:  Content-Type: application/json        │
│          Content-Length: 256                     │
│          Cache-Control: max-age=3600            │
│          Set-Cookie: session=abc123             │
│          Server: nginx/1.24.0                   │
├─────────────────────────────────────────────────┤
│  空行 (\r\n)                                    │
├─────────────────────────────────────────────────┤
│  响应体:  {"users":[...], "total": 100}        │
└─────────────────────────────────────────────────┘
```

---

## 2. HTTP 常见请求方法的区别和语义？

**回答：**

| 方法 | 语义 | 幂等 | 安全 | 请求体 | 典型用途 |
|------|------|------|------|--------|---------|
| GET | 获取资源 | ✓ | ✓ | 不应有 | 查询数据 |
| POST | 提交数据/创建资源 | ✗ | ✗ | 有 | 表单提交、创建 |
| PUT | 全量替换资源 | ✓ | ✗ | 有 | 更新整个资源 |
| PATCH | 部分更新资源 | ✗ | ✗ | 有 | 更新部分字段 |
| DELETE | 删除资源 | ✓ | ✗ | 可选 | 删除资源 |
| HEAD | 同 GET，但不返回 body | ✓ | ✓ | 不应有 | 检查资源是否存在 |
| OPTIONS | 查询支持的方法 | ✓ | ✓ | 不应有 | CORS 预检请求 |
| TRACE | 回显请求（诊断） | ✓ | ✓ | 无 | 调试（通常禁用） |

### 关键概念

```
安全（Safe）：
  不会修改服务器数据的方法
  GET, HEAD, OPTIONS 是安全的

幂等（Idempotent）：
  多次执行效果与一次相同
  GET, PUT, DELETE 是幂等的
  POST 不是幂等的（每次提交可能创建新资源）

GET vs POST 面试重点：
  GET：参数在 URL，可缓存，有长度限制，可做书签
  POST：参数在 body，不缓存，无长度限制
  本质区别是语义而非技术限制
```

---

## 3. HTTP 常见状态码详解？

**回答：**

### 1xx 信息

| 状态码 | 名称 | 说明 |
|--------|------|------|
| 100 | Continue | 客户端应继续发送请求体（Expect: 100-continue） |
| 101 | Switching Protocols | 协议升级（WebSocket 握手） |

### 2xx 成功

| 状态码 | 名称 | 说明 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功（POST 创建后应返回） |
| 204 | No Content | 成功但无返回内容（DELETE 后常用） |
| 206 | Partial Content | 范围请求成功（断点续传） |

### 3xx 重定向

| 状态码 | 名称 | 说明 | 缓存 |
|--------|------|------|------|
| 301 | Moved Permanently | 永久重定向 | 浏览器缓存 |
| 302 | Found | 临时重定向 | 不缓存 |
| 304 | Not Modified | 协商缓存命中，使用本地缓存 | — |
| 307 | Temporary Redirect | 临时重定向，保持请求方法 | 不缓存 |
| 308 | Permanent Redirect | 永久重定向，保持请求方法 | 缓存 |

```
301 vs 302：
  301 → 浏览器下次直接访问新地址（永久）
  302 → 浏览器下次仍请求原地址（临时）

301/302 vs 307/308：
  301/302：浏览器可能将 POST 改为 GET（历史问题）
  307/308：严格保持原始请求方法
```

### 4xx 客户端错误

| 状态码 | 名称 | 说明 |
|--------|------|------|
| 400 | Bad Request | 请求语法/参数错误 |
| 401 | Unauthorized | 未认证（应该叫 Unauthenticated） |
| 403 | Forbidden | 已认证但无权限 |
| 404 | Not Found | 资源不存在 |
| 405 | Method Not Allowed | HTTP 方法不允许 |
| 408 | Request Timeout | 请求超时 |
| 413 | Payload Too Large | 请求体过大 |
| 429 | Too Many Requests | 限流（Retry-After 指示何时重试） |

### 5xx 服务端错误

| 状态码 | 名称 | 说明 | DevOps 关注 |
|--------|------|------|------------|
| 500 | Internal Server Error | 服务器内部错误 | 查看应用日志 |
| 502 | Bad Gateway | 网关/代理收到上游无效响应 | 后端服务挂了 |
| 503 | Service Unavailable | 服务暂时不可用 | 过载/维护中 |
| 504 | Gateway Timeout | 网关/代理超时 | 后端处理太慢 |

```
502 vs 504（Nginx 常见）：
  502：Nginx 连上了后端，但收到异常响应（后端崩溃、返回垃圾数据）
  504：Nginx 连不上后端/等待超时（proxy_read_timeout 到了）
```

---

## 4. HTTP 的缓存机制？强缓存和协商缓存？

**回答：**

### 缓存判断流程

```
浏览器请求资源
    ↓
检查强缓存（不发请求）
    ├── Cache-Control: max-age 未过期？→ 200 (from cache)
    └── Expires 未过期？→ 200 (from cache)
    ↓ 过期了
协商缓存（发请求验证）
    ├── If-None-Match (ETag) → 服务器比较 → 一致 → 304
    └── If-Modified-Since (Last-Modified) → 服务器比较 → 未修改 → 304
    ↓ 有更新
返回 200 + 新资源
```

### 强缓存

```
Cache-Control（HTTP/1.1，优先级高）：
  max-age=3600        资源在 3600 秒内有效
  no-cache            不用强缓存，每次都协商
  no-store            完全不缓存（敏感数据）
  public              可被任何缓存（CDN、代理）
  private             只能被浏览器缓存
  s-maxage=3600       共享缓存（CDN）的最大缓存时间
  must-revalidate     过期后必须重新验证

Expires（HTTP/1.0，已过时）：
  Expires: Thu, 01 Dec 2025 16:00:00 GMT
  绝对时间，受客户端时钟影响 → 不推荐
```

### 协商缓存

```
ETag / If-None-Match（优先级高）：
  服务器返回：ETag: "abc123"
  浏览器下次：If-None-Match: "abc123"
  服务器比较：
    相同 → 304 Not Modified
    不同 → 200 + 新资源 + 新 ETag

Last-Modified / If-Modified-Since：
  服务器返回：Last-Modified: Wed, 21 Oct 2020 07:28:00 GMT
  浏览器下次：If-Modified-Since: Wed, 21 Oct 2020 07:28:00 GMT
  服务器比较：
    未修改 → 304
    已修改 → 200 + 新资源

ETag 优于 Last-Modified：
  - Last-Modified 精度只到秒（1 秒内多次修改感知不到）
  - 文件定期重新生成但内容不变时 Last-Modified 会变
```

### Nginx 缓存配置

```nginx
# 静态资源强缓存
location ~* \.(js|css|png|jpg|gif|svg|woff2)$ {
    expires 1y;                     # 等价于 Cache-Control: max-age=31536000
    add_header Cache-Control "public, immutable";
}

# HTML 不缓存
location ~* \.html$ {
    add_header Cache-Control "no-cache";
}

# API 不缓存
location /api/ {
    add_header Cache-Control "no-store";
}
```

---

## 5. HTTP/1.0、HTTP/1.1、HTTP/2、HTTP/3 的区别和演进？

**回答：**

### 演进对比

| 特性 | HTTP/1.0 | HTTP/1.1 | HTTP/2 | HTTP/3 |
|------|----------|----------|--------|--------|
| 年份 | 1996 | 1997 | 2015 | 2022 |
| 传输层 | TCP | TCP | TCP | QUIC (UDP) |
| 连接 | 短连接 | 长连接（默认） | 多路复用 | 多路复用 |
| 请求模式 | 串行 | 管道化（有缺陷） | 二进制帧，并发流 | 流独立，无队头阻塞 |
| 头部 | 文本 | 文本 | HPACK 压缩 | QPACK 压缩 |
| 服务端推送 | ✗ | ✗ | ✓ | ✓ |
| 加密 | 可选 | 可选 | 事实上必须 TLS | 内置 TLS 1.3 |

### HTTP/1.1 的关键改进

```
1. 默认长连接（Connection: keep-alive）
   → 一个 TCP 连接可以发多个请求
   → HTTP/1.0 每个请求都要重新建连

2. 管道化（Pipelining）
   → 可以同时发多个请求，不用等上一个响应
   → 但响应必须按顺序返回 → 队头阻塞!
   → 实际很少使用

3. Host 头部（必须）
   → 一个 IP 可以托管多个域名（虚拟主机）

4. 分块传输编码（chunked）
   → Transfer-Encoding: chunked
   → 不需要提前知道响应长度

5. 范围请求（Range）
   → 断点续传
```

### HTTP/2 的核心特性

```
1. 二进制帧（Binary Framing）
   HTTP/1.x: 文本协议（人可读）
   HTTP/2:   二进制帧（机器高效解析）

2. 多路复用（Multiplexing）
   一个 TCP 连接上并发多个独立的"流"
   每个流有独立的 ID，帧可以交错发送

   HTTP/1.1: ──请求1──响应1──请求2──响应2──（串行）
   HTTP/2:   ──帧1a─帧2a─帧1b─帧2b─帧1c──（交错并发）

3. 头部压缩（HPACK）
   建立头部字段表，用索引代替文本
   重复的头部只发索引（如 Host, Content-Type）
   减少 ~90% 头部大小

4. 服务器推送（Server Push）
   服务器主动推送关联资源
   客户端请求 HTML → 服务器同时推送 CSS/JS
   → 减少客户端发起的请求数

5. 流优先级（Stream Priority）
   客户端可以指定流的优先级和依赖关系
```

### HTTP/3 解决了什么？

```
HTTP/2 的问题：依然基于 TCP
  → TCP 层的队头阻塞：一个包丢了，所有流都等
  → TCP 握手 + TLS 握手 延迟

HTTP/3 (QUIC)：
  → 基于 UDP，无 TCP 队头阻塞
  → 内置 TLS 1.3，减少握手延迟
  → 0-RTT 恢复连接
  → 连接迁移（Wi-Fi ↔ 4G 不断连）
```

---

## 6. HTTP 长连接、短连接和 WebSocket？

**回答：**

### 长连接 vs 短连接

```
短连接（HTTP/1.0 默认）：
  建立连接 → 发请求 → 收响应 → 关闭连接
  每次请求都要三次握手 + 四次挥手

长连接（HTTP/1.1 默认，Connection: keep-alive）：
  建立连接 → 请求1 → 响应1 → 请求2 → 响应2 → ... → 关闭
  复用 TCP 连接发多个请求

  Nginx 长连接配置：
  keepalive_timeout 65;     # 空闲超时
  keepalive_requests 1000;  # 一个连接最多处理的请求数
```

### WebSocket

```
WebSocket：全双工通信协议

HTTP：  客户端发请求 → 服务器返响应（单向发起）
WebSocket：建立连接后，双方可以随时发消息（双向通信）

握手过程（HTTP Upgrade）：
  客户端：
    GET /ws HTTP/1.1
    Upgrade: websocket
    Connection: Upgrade
    Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==

  服务器：
    HTTP/1.1 101 Switching Protocols
    Upgrade: websocket
    Connection: Upgrade
    Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=

  之后：双向传输二进制帧

适用场景：
  - 实时聊天
  - 股票行情推送
  - 多人协作编辑
  - 游戏
  - 监控看板实时数据
```

### SSE（Server-Sent Events）

```
SSE：服务器单向推送

HTTP + SSE：
  客户端发一个请求 → 服务器持续推送事件（text/event-stream）
  单向：只能服务器 → 客户端

  场景：日志流、通知推送、状态更新
  优势：比 WebSocket 简单，基于 HTTP，自动重连

  WebSocket vs SSE：
    需要双向通信 → WebSocket
    只需服务器推送 → SSE（更简单）
```

---

## 7. HTTP 的 Cookie 和 Session 机制？

**回答：**

### Cookie

```
Cookie：存储在客户端浏览器的小型数据（最大约 4KB/个）

设置 Cookie（服务器 → 客户端）：
  HTTP/1.1 200 OK
  Set-Cookie: session_id=abc123; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=3600

浏览器自动携带（客户端 → 服务器）：
  GET /api/data HTTP/1.1
  Cookie: session_id=abc123; theme=dark

Cookie 属性：
  Domain     作用域名（默认当前域名）
  Path       作用路径
  Max-Age    存活秒数（0=删除）
  Expires    过期时间（绝对时间）
  HttpOnly   JS 不可访问（防 XSS 窃取）
  Secure     只通过 HTTPS 传输
  SameSite   跨站策略（Strict/Lax/None，防 CSRF）
```

### Session

```
Session：存储在服务器端的用户状态

工作流程：
  1. 用户登录 → 服务器创建 Session，生成 SessionID
  2. 服务器返回 Set-Cookie: session_id=xxx
  3. 后续请求浏览器自动带上 Cookie: session_id=xxx
  4. 服务器用 SessionID 查找对应的 Session 数据

Session 存储方式：
  - 内存（单机，进程重启丢失）
  - 文件（单机）
  - 数据库
  - Redis/Memcached（分布式环境推荐）

分布式 Session 方案：
  1. Session 粘性（Sticky Session）→ 负载均衡绑定用户到同一服务器
  2. Session 复制 → 各服务器间同步 Session（开销大）
  3. 集中存储 → Redis 统一存储 Session（推荐）
  4. JWT Token → 无状态，不需要服务端存 Session
```

### Cookie vs Session vs Token

| 特性 | Cookie | Session | JWT Token |
|------|--------|---------|-----------|
| 存储位置 | 客户端 | 服务器 | 客户端 |
| 大小限制 | ~4KB | 无限制 | 无限制（但不宜太大） |
| 安全性 | 较低 | 较高 | 取决于实现 |
| 跨域 | 受限 | 受限 | 灵活 |
| 服务器开销 | 无 | 有（内存/存储） | 无（无状态） |
| 扩展性 | — | 需分布式方案 | 天然分布式 |

---

## 8. HTTP 的跨域问题和 CORS？

**回答：**

### 同源策略

```
同源 = 协议 + 域名 + 端口 完全相同

http://a.com:80/api  vs  http://a.com:80/other  → 同源 ✓
http://a.com:80      vs  https://a.com:443       → 不同源 ✗（协议不同）
http://a.com         vs  http://b.com            → 不同源 ✗（域名不同）
http://a.com:80      vs  http://a.com:8080       → 不同源 ✗（端口不同）
```

### CORS（Cross-Origin Resource Sharing）

```
浏览器发跨域请求时的处理：

简单请求（GET/HEAD/POST + 简单头部）：
  浏览器直接发送，带上 Origin 头
  服务器返回 Access-Control-Allow-Origin
  浏览器检查：匹配 → 放行，不匹配 → 拦截

预检请求（复杂请求先发 OPTIONS）：
  1. 浏览器发 OPTIONS 预检请求
     Origin: http://frontend.com
     Access-Control-Request-Method: PUT
     Access-Control-Request-Headers: X-Custom-Header

  2. 服务器返回允许的规则
     Access-Control-Allow-Origin: http://frontend.com
     Access-Control-Allow-Methods: GET, POST, PUT, DELETE
     Access-Control-Allow-Headers: X-Custom-Header
     Access-Control-Max-Age: 86400     # 预检结果缓存时间

  3. 预检通过 → 发送实际请求
```

### Nginx CORS 配置

```nginx
location /api/ {
    add_header Access-Control-Allow-Origin $http_origin;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
    add_header Access-Control-Allow-Headers "Authorization, Content-Type";
    add_header Access-Control-Allow-Credentials true;
    add_header Access-Control-Max-Age 86400;

    if ($request_method = 'OPTIONS') {
        return 204;
    }

    proxy_pass http://backend;
}
```

---

## 9. HTTP 的内容协商和编码？

**回答：**

### 内容协商

```
客户端通过请求头告知服务器偏好：

内容类型协商：
  Accept: text/html, application/json;q=0.9, */*;q=0.1
  → 服务器根据 Accept 返回最合适的格式
  → 响应头：Content-Type: application/json

语言协商：
  Accept-Language: zh-CN,zh;q=0.9,en;q=0.8
  → 响应头：Content-Language: zh-CN

编码协商：
  Accept-Encoding: gzip, deflate, br
  → 响应头：Content-Encoding: gzip

q 值（权重）：0-1，默认 1，越大优先级越高
```

### 压缩编码

```
gzip：最广泛支持的压缩算法
deflate：较少使用
br（Brotli）：Google 开发，压缩率比 gzip 高 ~20%

Nginx 压缩配置：
  gzip on;
  gzip_min_length 1024;              # 小于 1KB 不压缩
  gzip_comp_level 5;                  # 压缩级别 1-9
  gzip_types text/plain text/css application/json
             application/javascript text/xml;
  gzip_vary on;                       # 添加 Vary: Accept-Encoding

注意：
  - 图片/视频已经是压缩格式，不要再 gzip
  - gzip_comp_level 5-6 是性价比最高的
  - 启用 Vary 防止代理缓存给不支持 gzip 的客户端返回压缩内容
```

### 分块传输

```
Transfer-Encoding: chunked

用于：
  - 响应体大小未知（流式传输）
  - 边生成边发送

格式：
  [块大小（十六进制）]\r\n
  [块内容]\r\n
  ...
  0\r\n
  \r\n    ← 最终块（大小为0）

与 Content-Length 互斥：
  知道长度 → 用 Content-Length
  不知道 → 用 chunked
```

---

## 10. 什么是 RESTful API？设计规范？

**回答：**

### REST 原则

```
REST (Representational State Transfer) 表征状态转移

核心约束：
  1. 统一接口（URI 标识资源，HTTP 方法标识操作）
  2. 无状态（每个请求包含所有必要信息）
  3. 可缓存（响应应标明是否可缓存）
  4. 客户端-服务器分离
  5. 分层系统（客户端不知道是否直连服务器）
```

### URL 设计

```
✓ 好的设计：
  GET    /api/v1/users           获取用户列表
  GET    /api/v1/users/123       获取用户 123
  POST   /api/v1/users           创建用户
  PUT    /api/v1/users/123       更新用户 123（全量）
  PATCH  /api/v1/users/123       更新用户 123（部分）
  DELETE /api/v1/users/123       删除用户 123
  GET    /api/v1/users/123/orders  获取用户 123 的订单

✗ 不好的设计：
  GET    /api/getUser?id=123     ← 动词放 URL 里
  POST   /api/deleteUser         ← 用 POST 做删除
  GET    /api/user_list          ← 用下划线
```

### 规范要点

```
1. URL 用名词复数：/users, /orders, /products
2. 用 HTTP 方法表示动作：GET/POST/PUT/DELETE
3. 版本号：/api/v1/... 或 Header: API-Version: 1
4. 过滤/排序/分页用查询参数：
   /users?status=active&sort=-created_at&page=1&size=20
5. 状态码语义正确：201 创建成功，204 删除成功
6. 错误响应统一格式：
   {
     "error": {
       "code": "VALIDATION_ERROR",
       "message": "邮箱格式不正确",
       "details": [...]
     }
   }
7. HATEOAS（可选）：响应中包含相关链接
```

---

## 11. HTTP 代理和反向代理？

**回答：**

### 正向代理 vs 反向代理

```
正向代理（Forward Proxy）：
  客户端 → 代理服务器 → 目标服务器
  客户端知道代理的存在，配置代理地址
  目标服务器不知道真正的客户端

  用途：翻墙、访问控制、缓存、隐藏客户端
  例子：Squid, Shadowsocks, V2Ray

反向代理（Reverse Proxy）：
  客户端 → 反向代理 → 后端服务器群
  客户端不知道代理的存在，以为在和真实服务器通信
  后端服务器可以看到代理的 IP

  用途：负载均衡、SSL 终止、缓存、安全防护、灰度发布
  例子：Nginx, HAProxy, Envoy, Traefik

┌──────┐     ┌──────────┐     ┌──────────┐
│客户端│ ──→ │ 正向代理  │ ──→ │ 目标服务 │
└──────┘     └──────────┘     └──────────┘
   ↑ 客户端配置                  看不到客户端

┌──────┐     ┌──────────┐     ┌──────────┐
│客户端│ ──→ │ 反向代理  │ ──→ │ 后端服务 │
└──────┘     └──────────┘     └──────────┘
   ↑ 不知道代理                  看不到客户端
```

### Nginx 反向代理配置

```nginx
upstream backend {
    server 10.0.0.1:8080 weight=3;
    server 10.0.0.2:8080 weight=2;
    server 10.0.0.3:8080 backup;
    keepalive 32;            # 与后端的长连接数
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
    }
}
```

---

## 12. 浏览器输入 URL 到页面显示的全过程？

**回答：**

```
1. URL 解析
   输入 https://www.example.com/path?q=hello
   浏览器解析出：协议=HTTPS, 域名=www.example.com, 端口=443, 路径=/path

2. DNS 解析 (域名 → IP)
   浏览器缓存 → OS缓存(/etc/hosts) → 本地DNS → 根DNS → .com DNS → 权威DNS
   得到 IP: 93.184.216.34

3. TCP 三次握手
   SYN → SYN+ACK → ACK (1 RTT)

4. TLS 握手 (HTTPS)
   ClientHello → ServerHello+证书 → 密钥交换 → Finished (1-2 RTT)

5. 发送 HTTP 请求
   GET /path?q=hello HTTP/1.1
   Host: www.example.com
   ...

6. 服务器处理
   Nginx(反向代理) → 应用服务器(处理业务) → 数据库(查询)
   → 生成 HTML 响应

7. 返回 HTTP 响应
   HTTP/1.1 200 OK
   Content-Type: text/html
   ...
   <html>...</html>

8. 浏览器渲染
   解析 HTML → 构建 DOM 树
   解析 CSS → 构建 CSSOM 树
   DOM + CSSOM → 渲染树 → 布局 → 绘制
   遇到 <script> → 下载并执行 JS（可能修改 DOM）
   遇到 <img> → 并行下载图片

9. 连接管理
   HTTP/1.1: Keep-Alive 保持连接
   空闲超时后四次挥手关闭
```
