# UDP 与传输层进阶

---

## 1. UDP 协议的特点和报文格式？

**回答：**

### UDP 特点

```
User Datagram Protocol（用户数据报协议）
  - 无连接：发送数据前不需要建立连接
  - 不可靠：不保证送达、不保证顺序、不重传
  - 面向数据报：保留消息边界（一次 send = 一次 recv）
  - 头部小：仅 8 字节
  - 高效：没有握手、确认、拥塞控制的开销
  - 支持广播和多播
```

### UDP 报文格式

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
┌───────────────────────────────┬───────────────────────────────┐
│         Source Port           │       Destination Port        │
├───────────────────────────────┼───────────────────────────────┤
│           Length              │          Checksum             │
├───────────────────────────────┴───────────────────────────────┤
│                           Data                                │
└───────────────────────────────────────────────────────────────┘

总共 8 字节头部：
  源端口      (16 bit) - 可选，不需要回复时设为 0
  目的端口    (16 bit) - 必须
  长度        (16 bit) - 头部+数据的总长度（最小 8）
  校验和      (16 bit) - 可选（IPv4），必须（IPv6）
```

### 与 TCP 头部对比

| 字段 | TCP | UDP |
|------|-----|-----|
| 头部大小 | 20-60 字节 | 8 字节固定 |
| 序列号 | 有 | 无 |
| 确认号 | 有 | 无 |
| 标志位 | SYN/ACK/FIN/RST 等 | 无 |
| 窗口大小 | 有 | 无 |
| 选项 | 可变长度 | 无 |

---

## 2. UDP 如何实现可靠传输？（应用层可靠 UDP）

**回答：**

### 为什么需要？

```
某些场景需要 UDP 的低延迟 + 可靠传输：
  - 实时音视频（QUIC）
  - 游戏通信
  - IoT 设备通信

TCP 的缺点：
  - 队头阻塞（一个包丢了，后面的都阻塞）
  - 连接建立慢（1-RTT 握手）
  - 内核实现，不灵活
```

### 常见实现方案

```
方案1：QUIC（Google）
  ✓ 基于 UDP
  ✓ 内置 TLS 1.3
  ✓ 多路复用（无队头阻塞）
  ✓ 连接迁移（更换网络不断连）
  ✓ 0-RTT 握手
  → HTTP/3 的底层协议

方案2：KCP
  ✓ 纯算法协议
  ✓ 比 TCP 更激进的重传策略
  ✓ 以带宽换延迟（适合游戏等实时场景）
  ✓ 用户态实现，灵活可控

方案3：自定义可靠 UDP（基本要素）
  1. 消息编号（seq number）
  2. 确认机制（ACK）
  3. 超时重传
  4. 去重和排序
  5. 流量控制（可选）
```

### 可靠 UDP 的核心思路

```
发送方：
  1. 为每个数据报分配序列号
  2. 发送后放入重传缓冲区
  3. 启动重传计时器
  4. 收到 ACK → 从缓冲区移除
  5. 超时 → 重传

接收方：
  1. 收到数据报 → 检查序列号
  2. 去重（丢弃重复包）
  3. 排序（乱序到达时缓存后排）
  4. 发送 ACK
  5. 有序交付给上层
```

---

## 3. QUIC 协议的核心特性？

**回答：**

### QUIC vs TCP

| 特性 | TCP | QUIC |
|------|-----|------|
| 传输层 | 内核 TCP | 用户态 UDP |
| 握手 | 1-RTT (TCP) + 1-RTT (TLS) | 0/1-RTT（内置TLS） |
| 队头阻塞 | 有（单流有序） | 无（多流独立） |
| 连接迁移 | 不支持（IP变则断） | 支持（Connection ID） |
| 加密 | 可选（TLS 可选） | 强制（内置 TLS 1.3） |
| 拥塞控制 | 内核实现 | 用户态，灵活可定制 |

### QUIC 解决的核心问题

```
1. 队头阻塞
   TCP：流1 的丢包会阻塞流2、流3
   QUIC：流1 丢包只影响流1，其他流不受影响

   TCP:   │ S1 S2 S3 丢包 S4 S5 │ ← 全部阻塞等重传
   QUIC:  │ S1(等重传) │ S2 S3 S4 S5 正常接收 │

2. 连接建立延迟
   TCP + TLS 1.2: 3-RTT
   TCP + TLS 1.3: 2-RTT
   QUIC 首次: 1-RTT
   QUIC 恢复: 0-RTT（之前连接过）

3. 连接迁移
   TCP 用四元组标识连接 → 切换 Wi-Fi/4G 断连
   QUIC 用 Connection ID → 网络切换无感
```

### HTTP/3 = HTTP over QUIC

```
HTTP/1.1: TCP → TLS → HTTP
HTTP/2:   TCP → TLS → HTTP（多路复用，但TCP队头阻塞）
HTTP/3:   UDP → QUIC(含TLS) → HTTP（彻底解决队头阻塞）
```

---

## 4. 什么是多播（Multicast）和广播（Broadcast）？

**回答：**

### 传输方式对比

| 方式 | 说明 | 地址范围 |
|------|------|---------|
| 单播 Unicast | 一对一传输 | 具体主机 IP |
| 广播 Broadcast | 一对所有（同一子网） | x.x.x.255 或 255.255.255.255 |
| 多播 Multicast | 一对多（加入组的成员） | 224.0.0.0 ~ 239.255.255.255 |
| 任播 Anycast | 一对最近一个 | 相同 IP 分配到多个节点 |

### 广播

```bash
# 本地广播：255.255.255.255（不跨路由器）
# 定向广播：192.168.1.255（/24 子网的广播地址）

# 用途：DHCP Discover、ARP Request、Wake-on-LAN

# 注意：广播只能用 UDP（TCP 是点对点协议）
```

### 多播

```bash
# 多播地址：224.0.0.0/4（D 类 IP 地址）
# 常见多播地址：
#   224.0.0.1  - 所有主机
#   224.0.0.2  - 所有路由器
#   224.0.0.5  - OSPF 路由器
#   224.0.0.251 - mDNS
#   239.0.0.0/8 - 本地管理多播（企业内部）

# 协议：IGMP（Internet Group Management Protocol）管理组成员
# 应用：视频直播、股票行情推送、集群心跳

# Linux 查看多播组
netstat -g
ip maddr show
```

---

## 5. 什么是端口复用（SO_REUSEADDR / SO_REUSEPORT）？

**回答：**

### SO_REUSEADDR

```
作用：
  1. 允许绑定处于 TIME_WAIT 状态的地址（最常用）
  2. 允许绑定 0.0.0.0 和具体 IP 不冲突

场景：
  服务器重启时端口被 TIME_WAIT 占用 → "Address already in use"
  开启 SO_REUSEADDR → 可以立即重新绑定

# Nginx 相关配置
server {
    listen 80 reuseport;
}
```

### SO_REUSEPORT

```
作用：
  允许多个 Socket 绑定到相同的 IP:Port 上
  内核在这些 Socket 之间做负载均衡

好处：
  1. 多进程/多线程监听同一端口
  2. 内核级负载均衡，无惊群效应
  3. 提高多核利用率

  传统模型：                     REUSEPORT 模型：
  ┌────────────┐                  ┌──────┐ ┌──────┐ ┌──────┐
  │ Socket(80) │                  │Sock1 │ │Sock2 │ │Sock3 │
  └─────┬──────┘                  │ :80  │ │ :80  │ │ :80  │
  ┌─────┼──────┐                  └──┬───┘ └──┬───┘ └──┬───┘
  │     │      │                     │        │        │
Worker Worker Worker              Worker1  Worker2  Worker3
  (竞争接受)                        (各自独立接受，无竞争)
```

### 惊群效应

```
传统 accept 模式：
  多个 Worker 进程阻塞在同一个 Socket 的 accept()
  新连接到来 → 所有 Worker 被唤醒 → 只有一个能 accept
  → 其他 Worker 白白唤醒 → 浪费 CPU

解决方案：
  1. SO_REUSEPORT（推荐）
  2. Nginx 的 accept_mutex
  3. Linux 4.5+ 的 EPOLLEXCLUSIVE
```

---

## 6. 什么是 TCP/UDP 的校验和？如何计算？

**回答：**

### TCP/UDP 校验和覆盖范围

```
校验和计算覆盖：
  1. 伪头部（Pseudo Header）
     ┌─────────────────┐
     │     源 IP        │  4 字节
     │     目的 IP      │  4 字节
     │  保留 | 协议号   │  2 字节（TCP=6, UDP=17）
     │   TCP/UDP 长度   │  2 字节
     └─────────────────┘
  2. TCP/UDP 头部
  3. 数据

注意：
  - 伪头部不是实际传输的，只参与校验和计算
  - 用于验证 IP 地址没有被篡改
  - UDP 校验和在 IPv4 中是可选的（设为 0 表示未计算）
  - UDP 校验和在 IPv6 中是必须的
```

### 计算方法

```
1. 将数据按 16 位（2 字节）分组
2. 将所有 16 位值相加（二进制反码求和）
3. 如果有溢出（进位），加到低 16 位
4. 取反码 → 得到校验和

验证方：
  将包括校验和在内的所有数据做反码求和
  结果应为全 1（0xFFFF）
```

---

## 7. Socket 编程中 TCP 和 UDP 的 API 有什么不同？

**回答：**

### TCP Socket API 流程

```
服务器端：                          客户端：
socket(AF_INET, SOCK_STREAM, 0)   socket(AF_INET, SOCK_STREAM, 0)
    ↓                                  ↓
bind(addr)                         connect(server_addr)  ← 三次握手
    ↓                                  ↓
listen(backlog)                    send() / recv()       ← 数据传输
    ↓                                  ↓
accept() → 新 socket                close()              ← 四次挥手
    ↓
recv() / send()
    ↓
close()
```

### UDP Socket API 流程

```
服务器端：                          客户端：
socket(AF_INET, SOCK_DGRAM, 0)   socket(AF_INET, SOCK_DGRAM, 0)
    ↓                                  ↓
bind(addr)                         sendto(data, server_addr)
    ↓                                  ↓
recvfrom() → 得到数据和发送方地址    recvfrom()
    ↓                                  ↓
sendto(data, client_addr)          close()
    ↓
close()

注意：
  - UDP 不需要 listen() 和 accept()
  - UDP 用 sendto/recvfrom（需要指定对方地址）
  - UDP 也可以 connect() 后用 send/recv（关联默认对端）
```

### 关键区别

| 特性 | TCP | UDP |
|------|-----|-----|
| Socket 类型 | SOCK_STREAM | SOCK_DGRAM |
| 是否 listen/accept | 是 | 否 |
| 发送/接收 | send/recv | sendto/recvfrom |
| 消息边界 | 无（字节流） | 有（数据报） |
| 空 payload | 不能发空包 | 可以发空数据报（只有头部） |

---

## 8. 什么是 I/O 多路复用？select/poll/epoll 区别？

**回答：**

### 为什么需要 I/O 多路复用？

```
问题：一个服务器需要处理数千个并发连接

方案1：每个连接一个线程 → 线程过多，开销大
方案2：非阻塞轮询 → 浪费 CPU（忙等待）
方案3：I/O 多路复用 → 用一个线程监控多个 fd，有事件才处理
```

### 三种方式对比

| 特性 | select | poll | epoll |
|------|--------|------|-------|
| 最大 fd 数 | 1024 (FD_SETSIZE) | 无限制 | 无限制 |
| 数据结构 | fd_set (bitmap) | pollfd 数组 | 红黑树 + 就绪链表 |
| 内核遍历 | O(n) 每次全量扫描 | O(n) 每次全量扫描 | O(1) 事件驱动 |
| fd 拷贝 | 每次调用拷贝全量 fd | 每次调用拷贝全量 fd | fd 只注册一次 |
| 触发方式 | 水平触发 (LT) | 水平触发 (LT) | 支持 LT 和 ET |
| 平台 | 跨平台 | 跨平台 | Linux 专有 |

### 水平触发 vs 边缘触发

```
水平触发 (Level Triggered, LT)：
  只要 fd 有数据可读 → 每次 epoll_wait 都返回该 fd
  → 简单，但如果不及时处理会重复通知

边缘触发 (Edge Triggered, ET)：
  fd 状态变化（从无数据到有数据）时才通知一次
  → 高效，但必须一次性读完所有数据（用非阻塞 + 循环读）
  → Nginx 使用 ET 模式
```

### epoll 工作流程

```c
// 1. 创建 epoll 实例
int epfd = epoll_create1(0);

// 2. 注册 fd（只需要一次）
struct epoll_event ev;
ev.events = EPOLLIN | EPOLLET;  // 读事件 + 边缘触发
ev.data.fd = sockfd;
epoll_ctl(epfd, EPOLL_CTL_ADD, sockfd, &ev);

// 3. 等待事件（只返回就绪的 fd）
struct epoll_event events[MAX_EVENTS];
int n = epoll_wait(epfd, events, MAX_EVENTS, timeout);
for (int i = 0; i < n; i++) {
    handle(events[i].data.fd);
}
```

### 各 Web 服务器的选择

| 服务器 | I/O 模型 |
|--------|---------|
| Nginx | epoll (Linux), kqueue (BSD) |
| Apache (event MPM) | epoll |
| Node.js (libuv) | epoll (Linux), kqueue (BSD), IOCP (Windows) |
| Redis | epoll |

---

## 9. 什么是零拷贝（Zero Copy）？

**回答：**

### 传统数据传输路径

```
场景：将磁盘文件通过网络发送

传统方式（4 次拷贝 + 4 次上下文切换）：
  磁盘 → 内核缓冲区(Page Cache) → 用户缓冲区 → Socket缓冲区 → 网卡
        DMA拷贝              CPU拷贝        CPU拷贝       DMA拷贝

用户态：     read(fd, buf)     →     write(sockfd, buf)
            用户←→内核切换 ×2          用户←→内核切换 ×2
```

### 零拷贝方案

```
方案1：sendfile（Linux 2.1+）
  磁盘 → 内核缓冲区 → Socket缓冲区 → 网卡
        DMA           CPU           DMA

  只需 2 次上下文切换，3 次数据拷贝
  适用：Nginx 的 sendfile on;

方案2：sendfile + DMA Scatter/Gather（Linux 2.4+）
  磁盘 → 内核缓冲区 ─────────────→ 网卡
        DMA         DMA(只传描述符)  DMA

  只需 2 次上下文切换，2 次 DMA 拷贝，0 次 CPU 拷贝 → 真正的零拷贝

方案3：mmap + write
  磁盘 → 内核缓冲区(映射到用户空间) → Socket缓冲区 → 网卡

  用户空间直接访问内核缓冲区（共享内存映射）
```

### DevOps 实践

```nginx
# Nginx 开启 sendfile
http {
    sendfile on;
    tcp_nopush on;    # 配合 sendfile,优化大文件发送
    tcp_nodelay on;
}
```

```bash
# Kafka 使用零拷贝是其高吞吐的关键之一
# Java: FileChannel.transferTo() → 底层调用 sendfile
```

---

## 10. 什么是连接池？为什么需要？

**回答：**

### 为什么需要连接池？

```
问题：TCP 连接建立开销大
  - 三次握手: 1-RTT
  - TLS 握手: 1-2 RTT
  - 连接关闭: 4 次挥手
  - 频繁创建/销毁耗费系统资源（fd、内存、CPU）

连接池：预先建立一批 TCP 连接，用时取，用完归还
  → 省去建立/关闭连接的开销
  → 控制并发连接数
  → 连接复用
```

### 连接池核心参数

| 参数 | 说明 |
|------|------|
| minIdle | 最小空闲连接数（保底） |
| maxIdle | 最大空闲连接数 |
| maxTotal/maxActive | 最大连接数（上限） |
| maxWaitMillis | 获取连接的最大等待时间 |
| testOnBorrow | 借出时是否验证连接有效 |
| testWhileIdle | 空闲时是否定期验证 |
| timeBetweenEvictionRuns | 驱逐检测间隔 |
| minEvictableIdleTime | 连接最小空闲时间（超过则回收） |

### 各层常见连接池

```
数据库连接池：
  - HikariCP (Java, 最快)
  - Druid (Java, 监控功能强)
  - pgBouncer (PostgreSQL 专用)

HTTP 连接池：
  - Apache HttpClient ConnectionManager
  - OkHttp ConnectionPool
  - Nginx upstream keepalive

Redis 连接池：
  - Jedis Pool
  - Lettuce (Netty-based)

连接池调优关注：
  1. maxActive 设置 = 预期并发数 × 1.2
  2. 避免连接泄漏（忘记 close/release）
  3. 监控活跃连接数、等待时间
  4. 空闲连接的健康检查
```

---

## 11. 什么是带外数据（OOB）和紧急数据？

**回答：**

```
TCP 紧急数据（URG）：
  通过 TCP 头部的 URG 标志和紧急指针字段
  允许发送方标记某些数据为"紧急"
  接收方可以优先处理（不用等待前面的数据）

  实际应用很少：
  - Telnet 的中断信号（Ctrl+C）
  - FTP 的 ABORT 命令
  - 现代应用更倾向使用独立的控制连接

UDP 没有带外数据的概念
  UDP 每个数据报是独立的，本身就没有排队问题
```

---

## 12. TCP/UDP 在 Linux 内核中的缓冲区管理？

**回答：**

```bash
# TCP 缓冲区
# 读缓冲区（接收缓冲区）
net.ipv4.tcp_rmem = 4096 87380 6291456
#                   最小   默认    最大

# 写缓冲区（发送缓冲区）
net.ipv4.tcp_wmem = 4096 16384 4194304

# 自动调整
net.ipv4.tcp_moderate_rcvbuf = 1

# UDP 缓冲区
net.core.rmem_default = 212992    # 默认接收缓冲区
net.core.rmem_max = 16777216      # 最大接收缓冲区
net.core.wmem_default = 212992    # 默认发送缓冲区
net.core.wmem_max = 16777216      # 最大发送缓冲区

# 查看 Socket 缓冲区使用情况
ss -m                             # 显示内存使用
ss -i                             # 显示 TCP 内部信息

# UDP 丢包检测
cat /proc/net/snmp | grep Udp
# UdpInErrors = 接收缓冲区溢出丢包数
# 如果持续增长 → 需要增大 rmem_max 或应用更快消费
```

### 缓冲区溢出

```
发送缓冲区满：
  TCP: send() 阻塞（阻塞模式）或返回 EAGAIN（非阻塞）
  UDP: sendto() 返回 ENOBUFS

接收缓冲区满：
  TCP: 通过窗口机制通知发送方减速（rwnd=0 → 零窗口）
  UDP: 直接丢包！不通知发送方
  → 所以 UDP 丢包排查要关注 UdpInErrors
```
