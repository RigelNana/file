# WebSocket与长连接

---

## 1. WebSocket 协议原理？

**回答：**

```
WebSocket：全双工通信协议
  基于 TCP，通过 HTTP Upgrade 建立

  连接建立过程：
  客户端                           服务端
    │                                │
    │── HTTP GET / ──────────────→  │
    │   Upgrade: websocket          │
    │   Connection: Upgrade          │
    │   Sec-WebSocket-Key: xxx       │
    │                                │
    │←── 101 Switching Protocols ──│
    │    Upgrade: websocket          │
    │    Sec-WebSocket-Accept: yyy   │
    │                                │
    │←══ 全双工通信 ════════════════│
    │    客户端和服务端都可主动发消息  │

  HTTP 轮询 vs WebSocket：
  ┌──────────────┬──────────────┬──────────────┐
  │ 对比          │ HTTP 轮询    │ WebSocket    │
  ├──────────────┼──────────────┼──────────────┤
  │ 方向          │ 客户端发起   │ 双向          │
  │ 实时性        │ 取决于间隔   │ 实时          │
  │ 开销          │ 频繁 HTTP 头 │ 帧头 2-14字节│
  │ 连接数        │ 频繁建连     │ 一个长连接    │
  └──────────────┴──────────────┴──────────────┘
```

---

## 2. WebSocket 数据帧？

**回答：**

```
WebSocket 帧格式：
  ┌──────┬────┬──────────┬─────────────────┐
  │ FIN  │OPCODE│Payload  │ Payload Data    │
  │ 1bit │4bit │Length   │                 │
  └──────┴────┴──────────┴─────────────────┘

  FIN：是否是最后一个分片
  OPCODE：
    0x0 → 延续帧
    0x1 → 文本帧 (UTF-8)
    0x2 → 二进制帧
    0x8 → 关闭
    0x9 → Ping
    0xA → Pong

  Payload Length：
    ≤125 → 直接表示长度（1字节）
    126 → 后跟 2 字节表示长度
    127 → 后跟 8 字节表示长度

  Mask：客户端→服务端的帧必须掩码
       服务端→客户端不需要

帧开销非常小：
  文本帧头：2-14 字节
  vs HTTP 每个请求头 200+ 字节
```

---

## 3. Go WebSocket 实现？

**回答：**

```go
// 使用 gorilla/websocket 库
import "github.com/gorilla/websocket"

var upgrader = websocket.Upgrader{
    ReadBufferSize:  1024,
    WriteBufferSize: 1024,
    CheckOrigin: func(r *http.Request) bool {
        // 生产环境应验证 Origin
        return true
    },
}

// WebSocket 处理函数
func wsHandler(w http.ResponseWriter, r *http.Request) {
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer conn.Close()

    for {
        // 读取消息
        msgType, msg, err := conn.ReadMessage()
        if err != nil {
            break
        }
        // 回复消息（echo）
        if err := conn.WriteMessage(msgType, msg); err != nil {
            break
        }
    }
}

func main() {
    http.HandleFunc("/ws", wsHandler)
    http.ListenAndServe(":8080", nil)
}
```

---

## 4. WebSocket 心跳与重连？

**回答：**

```
心跳机制：
  - Ping/Pong 帧（协议内置）
  - 应用层心跳消息

  问题：长连接可能静默断开
  原因：NAT 超时 / 代理超时 / 网络切换

  服务端心跳：
  定时发 Ping → 等待 Pong
  超时未收到 → 关闭连接

  客户端心跳：
  定时发 Ping 或自定义心跳消息
  超时未收到回复 → 尝试重连
```

```go
// 服务端 Ping/Pong 心跳
func wsHandler(conn *websocket.Conn) {
    conn.SetReadDeadline(time.Now().Add(60 * time.Second))
    conn.SetPongHandler(func(string) error {
        conn.SetReadDeadline(time.Now().Add(60 * time.Second))
        return nil
    })

    // 定时发 Ping
    go func() {
        ticker := time.NewTicker(30 * time.Second)
        defer ticker.Stop()
        for range ticker.C {
            if err := conn.WriteControl(
                websocket.PingMessage, nil,
                time.Now().Add(10*time.Second),
            ); err != nil {
                return
            }
        }
    }()
}
```

```
自动重连策略：
  指数退避：1s → 2s → 4s → 8s → ... → 最大值
  防止断连后大量客户端同时重连（惊群）
  加随机抖动（jitter）分散重连时间
```

---

## 5. SSE (Server-Sent Events)？

**回答：**

```
SSE：服务器单向推送
  基于 HTTP/1.1 长连接

  Content-Type: text/event-stream

  数据格式：
  data: 消息内容\n\n
  event: 自定义事件名\n
  data: 消息内容\n\n
  id: 消息ID\n
  retry: 3000\n

  SSE vs WebSocket：
  ┌──────────────┬──────────────┬──────────────┐
  │ 对比          │ SSE          │ WebSocket    │
  ├──────────────┼──────────────┼──────────────┤
  │ 方向          │ 服务器→客户端│ 双向          │
  │ 协议          │ HTTP         │ 独立协议      │
  │ 复杂度        │ 简单         │ 较复杂        │
  │ 自动重连      │ 浏览器内置   │ 需自己实现    │
  │ 二进制数据    │ 不支持       │ 支持          │
  │ 跨域          │ 遵循 CORS    │ 无限制        │
  └──────────────┴──────────────┴──────────────┘

  适用场景：
  实时通知/消息推送
  股票行情（单向推送）
  日志流式输出
  ChatGPT 流式回复
```

---

## 6. 长轮询 (Long Polling)？

**回答：**

```
短轮询 vs 长轮询：

  短轮询：
  客户端每 N 秒发一次请求
  有数据 → 返回数据
  无数据 → 返回空
  缺点：频繁请求浪费资源

  长轮询：
  客户端发请求 → 服务器挂起
  有数据 → 立即返回
  超时 → 返回空 → 客户端重新请求

  ┌──────────┐                 ┌──────────┐
  │ 客户端    │── GET /poll ──→│ 服务端    │
  │          │                 │ hold...  │
  │          │                 │ hold...  │
  │          │←── 数据到达 ───│ 返回数据  │
  │ 处理数据  │                 │          │
  │          │── GET /poll ──→│ 再次hold │
  └──────────┘                 └──────────┘

兼容性好（纯 HTTP）
但每次数据推送需要重建连接
适合低频更新场景
```

---

## 7. gRPC 流式通信？

**回答：**

```
gRPC 四种通信模式：

  1. 一元 RPC（Unary）
     请求 → 响应（普通 RPC）

  2. 服务器流（Server Streaming）
     一个请求 → 多个响应（实时推送）

  3. 客户端流（Client Streaming）
     多个请求 → 一个响应（文件上传）

  4. 双向流（Bidirectional Streaming）
     多请求 ↔ 多响应（实时聊天）

gRPC 底层：
  基于 HTTP/2 流
  二进制帧传输
  多路复用 + 头部压缩
```

```protobuf
// proto 定义
service Chat {
  // 双向流
  rpc ChatStream(stream Message) returns (stream Message);
  // 服务器流
  rpc Subscribe(Topic) returns (stream Event);
}
```

```go
// 服务器流实现
func (s *server) Subscribe(topic *pb.Topic,
    stream pb.Chat_SubscribeServer) error {
    for {
        event := waitForEvent(topic)
        if err := stream.Send(event); err != nil {
            return err
        }
    }
}
```

---

## 8. 长连接管理？

**回答：**

```
百万长连接挑战：

  文件描述符限制：
    ulimit -n 1000000
    fs.file-max = 2000000

  内存优化：
    每连接内存尽量小
    使用 epoll 而非每连接一线程
    Go：goroutine per connection（轻量）

  连接保活：
    应用层心跳（推荐 30s 间隔）
    TCP Keep-Alive（兜底）

  连接路由（多实例部署）：
    用户固定到特定实例
    一致性哈希分配
    Session 信息存 Redis

架构设计：
  ┌──────┐   ┌──────────┐   ┌──────────┐
  │客户端 │─→│ 网关层    │─→│ 业务层    │
  │      │←─│ (WS连接)  │←─│ (MQ推送)  │
  └──────┘   └──────────┘   └──────────┘

  网关层：维护 WebSocket 连接
  业务层：通过消息队列推送到网关
  分离连接管理和业务逻辑
```

---

## 9. 实时通信协议对比？

**回答：**

```
  ┌──────────────┬────────┬────────┬────────┬────────┐
  │ 特性          │WebSocket│ SSE   │长轮询   │gRPC流  │
  ├──────────────┼────────┼────────┼────────┼────────┤
  │ 方向          │双向     │单向   │单向    │双向    │
  │ 协议          │WS       │HTTP   │HTTP    │HTTP/2  │
  │ 实时性        │高       │高     │中      │高      │
  │ 二进制        │支持     │不支持 │不支持  │支持    │
  │ 浏览器支持    │好       │好     │好      │需代理  │
  │ 移动端支持    │好       │一般   │好      │好      │
  │ 后端复杂度    │中       │低     │低      │高      │
  │ 自动重连      │需实现   │内置   │需实现  │需实现  │
  └──────────────┴────────┴────────┴────────┴────────┘

选型建议：
  聊天/协作编辑 → WebSocket
  通知/行情推送 → SSE
  兼容性优先 → 长轮询
  微服务内部 → gRPC 流
  音视频 → WebRTC
```

---

## 10. WebSocket面试速答？

**回答：**

```
Q: WebSocket 和 HTTP 区别？
A: HTTP 请求-响应模式，WebSocket 全双工
   WebSocket 通过 HTTP Upgrade 建立

Q: WebSocket 怎么保持连接？
A: Ping/Pong 心跳帧
   应用层心跳消息
   自动重连（指数退避+抖动）

Q: SSE 和 WebSocket 怎么选？
A: 单向推送用 SSE（简单，自动重连）
   双向通信用 WebSocket

Q: WebSocket 能跨域吗？
A: 可以，不受同源策略限制
   但服务端应检查 Origin 头防 CSRF

Q: 百万长连接怎么实现？
A: 调大文件描述符/epoll 多路复用
   连接网关层+业务层分离
   一致性哈希路由连接

Q: WebSocket 安全？
A: wss:// 加密传输
   验证 Origin 头
   Token 认证（连接建立时）

Q: gRPC 流和 WebSocket 区别？
A: gRPC 基于 HTTP/2，强类型 protobuf
   WebSocket 独立协议，通用灵活
   内部服务用 gRPC，面向浏览器用 WS
```
