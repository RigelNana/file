# HTTP协议详解

---

## 1. HTTP 报文格式？

**回答：**

```
请求报文：
  ┌─────────────────────────┐
  │ GET /api/users HTTP/1.1 │  请求行（方法 路径 版本）
  ├─────────────────────────┤
  │ Host: example.com       │  请求头
  │ Content-Type: app/json  │
  │ Authorization: Bearer xx│
  ├─────────────────────────┤
  │                         │  空行
  ├─────────────────────────┤
  │ { "name": "test" }      │  请求体（GET 通常没有）
  └─────────────────────────┘

响应报文：
  ┌─────────────────────────┐
  │ HTTP/1.1 200 OK         │  状态行（版本 状态码 原因）
  ├─────────────────────────┤
  │ Content-Type: app/json  │  响应头
  │ Content-Length: 27      │
  ├─────────────────────────┤
  │                         │  空行
  ├─────────────────────────┤
  │ {"id":1,"name":"test"}  │  响应体
  └─────────────────────────┘

常见请求头：
  Host / User-Agent / Accept / Content-Type
  Authorization / Cookie / Cache-Control
  Connection / Accept-Encoding

常见响应头：
  Content-Type / Content-Length / Set-Cookie
  Cache-Control / ETag / Location / Server
```

---

## 2. HTTP 方法语义？

**回答：**

```
  ┌──────────┬──────────┬──────────┬──────────────────┐
  │ 方法      │ 幂等      │ 安全      │ 用途              │
  ├──────────┼──────────┼──────────┼──────────────────┤
  │ GET      │ 是        │ 是        │ 获取资源          │
  │ POST     │ 否        │ 否        │ 创建资源          │
  │ PUT      │ 是        │ 否        │ 全量更新/替换     │
  │ PATCH    │ 否        │ 否        │ 部分更新          │
  │ DELETE   │ 是        │ 否        │ 删除资源          │
  │ HEAD     │ 是        │ 是        │ 获取头部（无body）│
  │ OPTIONS  │ 是        │ 是        │ 查询支持的方法    │
  └──────────┴──────────┴──────────┴──────────────────┘

  安全：不修改服务器状态
  幂等：多次请求效果相同

  GET vs POST：
  GET：参数在 URL，可缓存，有长度限制，幂等安全
  POST：参数在 Body，不缓存，无长度限制，非幂等

  PUT vs PATCH：
  PUT：全量替换（不传字段会被清空）
  PATCH：部分更新（只更新传入字段）
```

---

## 3. HTTP 状态码详解？

**回答：**

```
  ┌──────┬──────────────────────────────────────┐
  │ 1xx  │ 信息性                                │
  │ 100  │ Continue（继续发送请求体）             │
  │ 101  │ Switching Protocols（升级WebSocket）   │
  ├──────┼──────────────────────────────────────┤
  │ 2xx  │ 成功                                  │
  │ 200  │ OK                                    │
  │ 201  │ Created（资源已创建）                  │
  │ 204  │ No Content（成功但无返回体）           │
  ├──────┼──────────────────────────────────────┤
  │ 3xx  │ 重定向                                │
  │ 301  │ Moved Permanently（永久重定向）        │
  │ 302  │ Found（临时重定向）                    │
  │ 304  │ Not Modified（缓存有效）               │
  ├──────┼──────────────────────────────────────┤
  │ 4xx  │ 客户端错误                             │
  │ 400  │ Bad Request（参数错误）                │
  │ 401  │ Unauthorized（未认证）                 │
  │ 403  │ Forbidden（无权限）                    │
  │ 404  │ Not Found（资源不存在）                │
  │ 405  │ Method Not Allowed                    │
  │ 429  │ Too Many Requests（限流）              │
  ├──────┼──────────────────────────────────────┤
  │ 5xx  │ 服务器错误                             │
  │ 500  │ Internal Server Error                 │
  │ 502  │ Bad Gateway（上游无响应）              │
  │ 503  │ Service Unavailable（服务不可用）      │
  │ 504  │ Gateway Timeout（上游超时）            │
  └──────┴──────────────────────────────────────┘

  面试重点：
  401 vs 403：401 未认证（未登录），403 已认证无权限
  502 vs 504：502 网关收到上游无效响应，504 上游超时
  301 vs 302：301 浏览器缓存重定向，302 不缓存
```

---

## 4. HTTP 缓存机制？

**回答：**

```
强缓存（直接用本地缓存，不请求服务器）：
  Cache-Control: max-age=3600  （优先级高）
  Expires: Wed, 21 Oct 2025 07:28:00 GMT

  Cache-Control 指令：
  max-age=N      缓存 N 秒
  no-cache       需要协商验证
  no-store       禁止缓存
  public         可被代理缓存
  private        仅浏览器缓存

协商缓存（向服务器验证是否过期）：
  方式一：Last-Modified / If-Modified-Since
    精度秒级，可能误判

  方式二：ETag / If-None-Match
    精确，基于内容哈希

  流程：
  ┌──────────┐                      ┌──────────┐
  │ 客户端    │ If-None-Match: "abc"│ 服务器    │
  │          │──────────────────→  │          │
  │          │                      │ 比对ETag │
  │          │ 304 Not Modified    │ 未变化   │
  │          │←──────────────────  │          │
  │ 用本地缓存│                      │          │
  └──────────┘                      └──────────┘

  304 ≠ 不请求，而是请求了但服务器说没变
```

---

## 5. HTTP/2 特性？

**回答：**

```
HTTP/2 核心特性：

  1. 二进制帧：
     HTTP/1.1 文本协议 → HTTP/2 二进制帧
     帧类型：HEADERS/DATA/SETTINGS/PUSH_PROMISE/...

  2. 多路复用：
     一个 TCP 连接上多个流（Stream）并行
     HTTP/1.1               HTTP/2
     ┌──┐ ┌──┐ ┌──┐       ┌──────────────┐
     │连│ │连│ │连│       │ 一个TCP连接   │
     │接│ │接│ │接│       │ ┌──┐┌──┐┌──┐ │
     │1 │ │2 │ │3 │       │ │流││流││流│ │
     └──┘ └──┘ └──┘       │ │1 ││2 ││3 │ │
                           │ └──┘└──┘└──┘ │
                           └──────────────┘

  3. 头部压缩（HPACK）：
     静态表（61个常用头部）+ 动态表
     重复头部用索引号代替

  4. 服务器推送：
     服务器主动推送资源（如推送 CSS/JS）
     实际使用不多，Chrome 已移除支持

  5. 流优先级：
     不同资源设置不同优先级

局限：
  仍基于 TCP → TCP 层队头阻塞仍存在
  一个包丢失 → 所有流都等待重传
  → HTTP/3 用 QUIC(UDP) 解决
```

---

## 6. Cookie 与 Session？

**回答：**

```
Cookie：
  服务器通过 Set-Cookie 设置
  浏览器自动携带在请求头

  Set-Cookie: session_id=abc123;
    Path=/;               → 作用路径
    Domain=.example.com;  → 作用域名
    Max-Age=3600;         → 有效期
    HttpOnly;             → JS 不可访问（防 XSS）
    Secure;               → 仅 HTTPS
    SameSite=Strict;      → 防 CSRF

Session：
  会话状态存储在服务端
  客户端只存 Session ID（通过 Cookie）

  ┌──────────┐  Cookie: sid=xxx   ┌──────────┐
  │ 浏览器    │──────────────────→│ 服务器    │
  │          │                    │ sid→数据  │
  │          │                    │ 内存/Redis│
  └──────────┘                    └──────────┘

Cookie vs Session vs Token：
  Cookie：浏览器存储，自动发送，有安全限制
  Session：服务端存储，有状态，难以横向扩展
  Token(JWT)：自包含，无状态，易于分布式
```

---

## 7. 跨域与 CORS？

**回答：**

```
同源策略：
  协议 + 域名 + 端口 相同才是同源
  不同源 → 浏览器阻止 Ajax 请求

CORS（跨域资源共享）：
  服务器设置响应头允许跨域

  简单请求（GET/POST 且 Content-Type 为基本类型）：
  → 直接发请求，服务器返回 CORS 头

  预检请求（PUT/DELETE 或自定义头等）：
  → 先发 OPTIONS 请求询问
  → 服务器返回允许的方法和头
  → 再发实际请求

  OPTIONS /api/data HTTP/1.1
  Origin: http://localhost:3000
  Access-Control-Request-Method: PUT

  HTTP/1.1 200 OK
  Access-Control-Allow-Origin: http://localhost:3000
  Access-Control-Allow-Methods: GET, PUT, POST, DELETE
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Max-Age: 86400  （预检缓存时间）
```

```go
// Go CORS 中间件
func corsMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Access-Control-Allow-Origin", "https://example.com")
        w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE")
        w.Header().Set("Access-Control-Allow-Headers", "Content-Type,Authorization")
        if r.Method == "OPTIONS" {
            w.WriteHeader(http.StatusNoContent)
            return
        }
        next.ServeHTTP(w, r)
    })
}
```

---

## 8. HTTP 长连接与短连接？

**回答：**

```
短连接（HTTP/1.0 默认）：
  每次请求新建 TCP 连接
  请求完毕立即关闭
  → 频繁握手/挥手开销大

长连接（HTTP/1.1 默认）：
  Connection: keep-alive
  一个 TCP 连接复用多次请求
  超时或达到最大请求数关闭

  Keep-Alive: timeout=30, max=100

Pipeline（HTTP/1.1 管线化）：
  连续发多个请求不等响应
  但响应必须按序返回 → 队头阻塞
  实际很少使用

WebSocket：
  HTTP Upgrade 升级为全双工
  服务器可主动推送
  适合实时场景（聊天/行情/协作编辑）

SSE（Server-Sent Events）：
  服务器单向推送
  基于 HTTP/1.1 长连接
  Content-Type: text/event-stream
  比 WebSocket 简单，但只能单向

对比：
  短连接 → 简单场景，低频请求
  长连接 → 一般 Web 应用
  WebSocket → 双向实时
  SSE → 单向推送（通知/行情）
```

---

## 9. Content-Type 与编码？

**回答：**

```
常见 Content-Type：
  ┌──────────────────────────┬──────────────────────┐
  │ Content-Type              │ 用途                  │
  ├──────────────────────────┼──────────────────────┤
  │ application/json          │ JSON 数据（最常用）   │
  │ application/x-www-form    │ 表单数据              │
  │ multipart/form-data       │ 文件上传              │
  │ text/html                 │ HTML 页面             │
  │ text/plain                │ 纯文本                │
  │ application/octet-stream  │ 二进制流              │
  │ application/protobuf      │ Protobuf（gRPC）     │
  └──────────────────────────┴──────────────────────┘

传输编码：
  Transfer-Encoding: chunked
    分块传输，不需要预知 Content-Length
    流式响应/大文件传输

  Content-Encoding: gzip
    数据压缩（gzip/br/deflate）
    Accept-Encoding: gzip, br 协商

字符编码：
  Content-Type: text/html; charset=utf-8
  UTF-8 是 Web 标准字符编码
```

---

## 10. HTTP协议面试速答？

**回答：**

```
Q: GET 和 POST 区别？
A: GET 参数在URL，幂等安全可缓存
   POST 参数在Body，非幂等不缓存

Q: HTTP/1.1 vs HTTP/2？
A: HTTP/2：二进制帧、多路复用、头压缩、服务器推送
   解决了HTTP层队头阻塞

Q: 301 和 302？
A: 301 永久重定向（浏览器缓存）
   302 临时重定向（不缓存）

Q: 401 和 403？
A: 401 未认证（没登录）
   403 已认证但无权限

Q: 强缓存 vs 协商缓存？
A: 强缓存：Cache-Control 直接用本地
   协商缓存：ETag/Last-Modified 问服务器

Q: Cookie 安全设置？
A: HttpOnly（防XSS）
   Secure（仅HTTPS）
   SameSite（防CSRF）

Q: CORS 怎么解决跨域？
A: 服务器设置 Access-Control-Allow-Origin
   预检 OPTIONS 请求确认允许

Q: WebSocket 和 HTTP？
A: HTTP 请求响应模式
   WebSocket 全双工，升级自 HTTP
   适合实时通信
```
