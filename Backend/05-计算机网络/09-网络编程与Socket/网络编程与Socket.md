# 网络编程与Socket

---

## 1. Socket 编程模型？

**回答：**

```
Socket = IP + 端口 + 协议
网络通信的端点抽象

TCP Socket 流程：
  服务端                    客户端
  socket() → fd             socket() → fd
  bind(addr)                
  listen(backlog)           
  accept() ← 三次握手 →    connect(addr)
  read()   ← 数据传输 →    write()
  write()  → 数据传输 →    read()
  close()  ← 四次挥手 →    close()

Socket 类型：
  SOCK_STREAM → TCP（字节流）
  SOCK_DGRAM  → UDP（数据报）
  SOCK_RAW    → 原始套接字（自定义协议）

地址族：
  AF_INET   → IPv4
  AF_INET6  → IPv6
  AF_UNIX   → Unix 域套接字（本机进程间）
```

---

## 2. IO 多路复用模型？

**回答：**

```
select / poll / epoll 对比：

  ┌──────────────┬────────┬────────┬──────────┐
  │ 对比          │ select │ poll   │ epoll    │
  ├──────────────┼────────┼────────┼──────────┤
  │ fd 数量限制   │ 1024   │ 无限制 │ 无限制   │
  │ 数据结构      │ bitmap │ 链表   │ 红黑树   │
  │ 内核到用户    │ 全量拷贝│全量拷贝│回调通知  │
  │ 时间复杂度    │ O(n)   │ O(n)   │ O(1)     │
  │ 触发方式      │ LT     │ LT     │ LT/ET    │
  └──────────────┴────────┴────────┴──────────┘

epoll 核心 API：
  epoll_create() → 创建 epoll 实例
  epoll_ctl()    → 注册/修改/删除 fd
  epoll_wait()   → 等待就绪事件

epoll 为什么快：
  1. 红黑树管理 fd → O(logN) 增删
  2. 就绪链表 → 只返回就绪的 fd
  3. mmap 共享内存 → 减少拷贝
  4. 事件回调 → 不遍历全部 fd

ET(边缘触发) vs LT(水平触发)：
  LT：就绪就通知（可能重复通知）→ 编程简单
  ET：状态变化才通知（只通知一次）→ 性能高
  ET 必须：非阻塞 fd + 一次性读/写完
```

---

## 3. Reactor 模式？

**回答：**

```
Reactor：事件驱动的网络编程模式

  单 Reactor 单线程（Redis）：
  ┌──────────────────────┐
  │ Reactor              │
  │  epoll_wait()        │
  │  → 连接事件 → accept │
  │  → 读事件 → 处理+回复│
  └──────────────────────┘

  单 Reactor 多线程：
  ┌──────────────────────┐
  │ Reactor              │
  │  epoll_wait()        │
  │  → 读事件 → 线程池处理│
  └──────────────────────┘

  主从 Reactor（Nginx/Netty）：
  ┌─────────────┐
  │ Main Reactor │ → accept 连接
  └──────┬──────┘
    ┌────┴────┬────────┐
  ┌─┴──┐  ┌──┴──┐  ┌──┴──┐
  │Sub  │  │Sub  │  │Sub  │ → 读写处理
  │React│  │React│  │React│
  └─────┘  └─────┘  └─────┘

Go 的网络模型：
  netpoll（基于 epoll）+ goroutine per connection
  每个连接一个 goroutine → 同步编程风格
  底层 runtime 用 epoll 管理 → 异步 IO
  → 兼具编程简洁和高性能
```

---

## 4. Go 网络编程实践？

**回答：**

```go
// TCP 服务端（goroutine per connection）
func main() {
    ln, _ := net.Listen("tcp", ":8080")
    defer ln.Close()

    for {
        conn, err := ln.Accept()
        if err != nil {
            continue
        }
        go handleConn(conn) // 每连接一个 goroutine
    }
}

func handleConn(conn net.Conn) {
    defer conn.Close()
    // 设置超时
    conn.SetDeadline(time.Now().Add(30 * time.Second))

    scanner := bufio.NewScanner(conn)
    for scanner.Scan() {
        line := scanner.Text()
        conn.Write([]byte("Echo: " + line + "\n"))
        // 重置超时
        conn.SetDeadline(time.Now().Add(30 * time.Second))
    }
}
```

```go
// HTTP 服务端
func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("/api/hello", func(w http.ResponseWriter,
        r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        json.NewEncoder(w).Encode(map[string]string{
            "message": "hello",
        })
    })

    server := &http.Server{
        Addr:         ":8080",
        Handler:      mux,
        ReadTimeout:  10 * time.Second,
        WriteTimeout: 10 * time.Second,
        IdleTimeout:  60 * time.Second,
    }
    server.ListenAndServe()
}
```

---

## 5. 连接池设计？

**回答：**

```
连接池：复用 TCP 连接，避免频繁创建销毁

  ┌──────────┐    获取连接     ┌──────────┐
  │ 应用代码  │──────────────→│ 连接池    │
  │          │←──────────────│ [conn1]  │
  │ 使用连接  │                │ [conn2]  │
  │          │──归还连接────→│ [conn3]  │
  └──────────┘                └──────────┘

关键参数：
  MaxOpen：最大连接数
  MaxIdle：最大空闲连接数
  IdleTimeout：空闲连接超时
  MaxLifetime：连接最大生命周期
```

```go
// Go 数据库连接池
db, _ := sql.Open("mysql", dsn)
db.SetMaxOpenConns(100)     // 最大连接
db.SetMaxIdleConns(20)      // 最大空闲
db.SetConnMaxLifetime(time.Hour)    // 最大生命周期
db.SetConnMaxIdleTime(10 * time.Minute) // 空闲超时

// HTTP 连接池
transport := &http.Transport{
    MaxIdleConns:        100,
    MaxIdleConnsPerHost: 20,
    IdleConnTimeout:     90 * time.Second,
}
client := &http.Client{Transport: transport}
```

```
连接池常见问题：
  连接泄漏：忘记归还 → defer conn.Close()
  连接过期：服务端关闭了 → 健康检查/MaxLifetime
  池耗尽：获取连接阻塞 → 监控等待时间
```

---

## 6. 优雅关机？

**回答：**

```go
// Go HTTP 优雅关机
func main() {
    server := &http.Server{Addr: ":8080", Handler: mux}

    // 后台启动服务
    go func() {
        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    // 等待中断信号
    quit := make(chan os.Signal, 1)
    signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
    <-quit

    log.Println("Shutting down...")

    // 给在途请求最多 30 秒完成
    ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Fatal("Forced shutdown:", err)
    }

    log.Println("Server exited")
}
```

```
优雅关机流程：
  1. 收到 SIGTERM 信号
  2. 停止接受新连接
  3. 等待在途请求完成（设超时）
  4. 关闭数据库连接/消息队列等
  5. 退出进程

K8s 中的优雅关机：
  preStop Hook → SIGTERM → terminationGracePeriodSeconds → SIGKILL
  默认 30 秒宽限期
  应用需在 30 秒内完成清理
```

---

## 7. 超时与重试？

**回答：**

```
超时设置三要素：
  连接超时（Dial Timeout）：建立 TCP 连接
  读超时（Read Timeout）：等待响应
  写超时（Write Timeout）：发送请求

  总超时 = 连接 + 发送 + 等待 + 接收
```

```go
// Go HTTP 客户端超时
client := &http.Client{
    Timeout: 10 * time.Second, // 总超时
    Transport: &http.Transport{
        DialContext: (&net.Dialer{
            Timeout: 3 * time.Second, // 连接超时
        }).DialContext,
        ResponseHeaderTimeout: 5 * time.Second, // 等响应头
        TLSHandshakeTimeout:   3 * time.Second,
    },
}

// 使用 context 控制单次请求
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()
req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
resp, err := client.Do(req)
```

```
重试策略：
  指数退避：100ms → 200ms → 400ms → 800ms
  加随机抖动：避免惊群效应
  最大重试次数：3-5 次
  可重试条件：5xx / 网络错误 / 超时
  不可重试：4xx（客户端错误）
  幂等性：非幂等操作慎重重试
```

---

## 8. 高性能网络框架？

**回答：**

```
Go 网络框架对比：
  ┌──────────────┬──────────────────────────────┐
  │ 框架          │ 特点                          │
  ├──────────────┼──────────────────────────────┤
  │ net/http     │ 标准库，够用，goroutine模型   │
  │ Gin          │ 高性能HTTP框架，路由树         │
  │ gRPC-Go      │ RPC框架，HTTP/2+Protobuf     │
  │ gnet         │ 事件驱动，非阻塞，超高性能    │
  │ fasthttp     │ 极致HTTP性能，零分配          │
  └──────────────┴──────────────────────────────┘

网络性能优化方向：
  IO 层面：
    epoll/io_uring
    零拷贝（sendfile/splice）
    SO_REUSEPORT 多核并行 accept

  协议层面：
    连接复用（Keep-Alive/连接池）
    HTTP/2 多路复用
    gRPC 流式通信
    Protocol Buffers 替代 JSON

  应用层面：
    批量处理（减少系统调用）
    对象复用（sync.Pool）
    减少内存分配
    合理的 buffer 大小
```

---

## 9. 网络调试工具？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 工具          │ 用途                          │
  ├──────────────┼──────────────────────────────┤
  │ curl         │ HTTP 请求调试                 │
  │ httpie       │ 更友好的 HTTP 客户端          │
  │ tcpdump      │ 命令行抓包                    │
  │ Wireshark    │ 图形界面抓包分析              │
  │ nc (netcat)  │ 任意 TCP/UDP 连接测试         │
  │ telnet       │ 端口连通性测试                │
  │ ss / netstat │ 连接状态查看                  │
  │ lsof -i      │ 查看端口占用                  │
  │ mtr          │ 持续路径追踪                  │
  │ iperf3       │ 带宽测试                      │
  │ wrk / hey    │ HTTP 性能压测                 │
  │ grpcurl      │ gRPC 调试工具                 │
  └──────────────┴──────────────────────────────┘

常用调试命令：
  # HTTP 调试
  curl -v https://api.example.com/users
  curl -X POST -H "Content-Type: application/json" \
    -d '{"name":"test"}' http://localhost:8080/api

  # 抓包
  tcpdump -i eth0 port 8080 -A    # 文本显示
  tcpdump -i lo port 6379 -w redis.pcap

  # 压测
  wrk -t4 -c100 -d30s http://localhost:8080/api
  hey -n 10000 -c 100 http://localhost:8080/api
```

---

## 10. 网络编程面试速答？

**回答：**

```
Q: epoll 为什么快？
A: 红黑树管理fd O(logN)
   只返回就绪fd（回调机制）
   mmap 减少内核用户空间拷贝

Q: ET 和 LT 区别？
A: LT 就绪就通知（默认，简单）
   ET 变化才通知（高性能，需非阻塞+读完）

Q: Go 网络模型？
A: 底层 epoll + goroutine per connection
   用同步编程风格获得异步性能

Q: Reactor 模式？
A: 事件驱动：epoll 监听→分发→处理
   主从 Reactor：主线程 accept，子线程读写

Q: 连接池作用？
A: 复用 TCP 连接，避免频繁握手
   关键参数：MaxOpen/MaxIdle/Timeout

Q: 优雅关机怎么做？
A: 收到 SIGTERM→停止新连接→等在途请求
   →关闭资源→退出

Q: 超时怎么设置？
A: 连接超时 + 读写超时 + 总超时
   用 context.WithTimeout 控制

Q: HTTP 压测工具？
A: wrk / hey / ab
   关注 QPS/延迟P99/错误率
```
