# TCP 协议深入

---

## 1. TCP 和 UDP 的核心区别？各自的适用场景？

**回答：**

| 特性 | TCP | UDP |
|------|-----|-----|
| 连接方式 | 面向连接（三次握手） | 无连接 |
| 可靠性 | 可靠（确认、重传、排序、校验） | 不可靠，尽最大努力交付 |
| 传输方式 | 字节流（无消息边界） | 数据报（保留消息边界） |
| 有序性 | 保证有序 | 不保证 |
| 速度 | 较慢（有握手和确认开销） | 较快（无额外开销） |
| 拥塞控制 | 有 | 无 |
| 头部大小 | 20-60 字节 | 8 字节固定 |
| 一对多 | 不支持（点对点） | 支持广播/多播 |
| 流量控制 | 滑动窗口 | 无 |

### 适用场景

```
TCP 适用：
  ✓ Web (HTTP/HTTPS)
  ✓ 文件传输 (FTP, SCP)
  ✓ 远程登录 (SSH, Telnet)
  ✓ 邮件 (SMTP, POP3, IMAP)
  ✓ 数据库连接

UDP 适用：
  ✓ DNS 查询（小包，快速）
  ✓ 视频/音频流（实时性优先）
  ✓ 游戏通信（低延迟）
  ✓ DHCP（客户端无 IP 时无法建 TCP）
  ✓ SNMP、NTP
  ✓ QUIC 协议（在 UDP 上实现可靠传输）
```

---

## 2. TCP 三次握手的详细过程？为什么不是两次或四次？

**回答：**

### 详细过程

```
客户端 (CLOSED)                         服务器 (LISTEN)
    |                                       |
    |  1. SYN                               |
    |── SYN=1, seq=x ──────────────────────>|
    |  客户端 → SYN_SENT                     |  服务器 → SYN_RCVD
    |                                       |
    |  2. SYN+ACK                           |
    |<────────────── SYN=1, ACK=1 ─────────|
    |                seq=y, ack=x+1         |
    |                                       |
    |  3. ACK                               |
    |── ACK=1, seq=x+1, ack=y+1 ──────────>|
    |  客户端 → ESTABLISHED                  |  服务器 → ESTABLISHED
    |                                       |
    |  === 可以开始传输数据 ===              |
```

### 各步骤携带的关键信息

| 步骤 | 方向 | 标志位 | 序列号 | 确认号 | 附加信息 |
|------|------|--------|--------|--------|---------|
| 1 | C→S | SYN | ISN_C (x) | — | MSS, 窗口大小, SACK支持 |
| 2 | S→C | SYN+ACK | ISN_S (y) | x+1 | MSS, 窗口大小, SACK支持 |
| 3 | C→S | ACK | x+1 | y+1 | 可携带数据 |

### 为什么不是两次？

```
场景：旧的 SYN 延迟到达
1. 客户端发 SYN_old（超时，客户端已放弃）
2. 客户端发 SYN_new → 建立连接 → 关闭
3. SYN_old 到达服务器 → 服务器回 SYN+ACK
若两次握手：服务器以为连接建立了，但客户端不会发数据
→ 服务器白白占用资源

三次握手中，服务器等待客户端第三个 ACK，收不到就知道是无效连接
```

### 为什么不是四次？

```
三次已经足够确认双方的收发能力：
  第 1 步确认：客户端发送能力正常
  第 2 步确认：服务器发送和接收能力正常
  第 3 步确认：客户端接收能力正常
四次是冗余的
```

---

## 3. TCP 四次挥手的详细过程？TIME_WAIT 的意义？

**回答：**

### 详细过程

```
客户端 (ESTABLISHED)                    服务器 (ESTABLISHED)
    |                                       |
    |  1. FIN                               |
    |── FIN=1, seq=u ──────────────────────>|
    |  客户端 → FIN_WAIT_1                   |  服务器 → CLOSE_WAIT
    |                                       |
    |  2. ACK                               |
    |<────────────── ACK=1, ack=u+1 ───────|
    |  客户端 → FIN_WAIT_2                   |
    |                                       |
    |  (服务器可能还有数据要发送...)          |
    |<────────────── 数据 ─────────────────|
    |                                       |
    |  3. FIN                               |
    |<────────────── FIN=1, seq=w ─────────|
    |                                       |  服务器 → LAST_ACK
    |  4. ACK                               |
    |── ACK=1, ack=w+1 ───────────────────>|
    |  客户端 → TIME_WAIT                    |  服务器 → CLOSED
    |                                       |
    |  等待 2MSL (通常 60 秒)                |
    |  客户端 → CLOSED                       |
```

### 为什么是四次？

```
TCP 全双工 → 每个方向需要独立关闭

第 1 步：客户端说 "我发完了"（关闭发送方向）
第 2 步：服务器说 "收到，但我可能还没发完"
         → 此时客户端仍可以接收数据
第 3 步：服务器说 "我也发完了"（关闭发送方向）
第 4 步：客户端说 "收到"

merge: 如果服务器收到 FIN 时恰好也没有数据要发了
       可以合并第 2、3 步 → SYN+ACK → 变成三次挥手（延迟确认）
```

### TIME_WAIT 状态

```
持续时间：2 × MSL（Maximum Segment Lifetime，Linux 默认 60 秒）

两个目的：
1. 确保最后一个 ACK 到达服务器
   如果 ACK 丢失 → 服务器超时重发 FIN → 客户端在 TIME_WAIT 可以重发 ACK

2. 让本次连接的所有报文从网络中消失
   防止旧连接的延迟报文被新连接（相同四元组）误收
```

### TIME_WAIT 过多的问题及解决

```bash
# 查看 TIME_WAIT 数量
ss -tan state time-wait | wc -l

# 问题：高并发短连接场景下 TIME_WAIT 大量积压，耗尽端口（65535 限制）

# 解决方案（Linux 内核参数）：
# 1. 允许 TIME_WAIT 端口重用（推荐）
net.ipv4.tcp_tw_reuse = 1

# 2. 增大临时端口范围
net.ipv4.ip_local_port_range = 1024 65535

# 3. 减少 TIME_WAIT 超时（不推荐修改）
net.ipv4.tcp_fin_timeout = 30

# 4. 使用长连接避免频繁建立/关闭（根本解决方案）
# HTTP Keep-Alive, 连接池
```

---

## 4. TCP 的状态机有哪些状态？状态转换流程？

**回答：**

### TCP 11 种状态

| 状态 | 说明 |
|------|------|
| CLOSED | 初始/关闭状态 |
| LISTEN | 服务器监听，等待连接 |
| SYN_SENT | 客户端已发 SYN，等待 SYN+ACK |
| SYN_RCVD | 服务器收到 SYN，已回 SYN+ACK |
| ESTABLISHED | 连接已建立，可以传输数据 |
| FIN_WAIT_1 | 主动关闭方已发 FIN |
| FIN_WAIT_2 | 主动关闭方收到对方 ACK |
| CLOSE_WAIT | 被动关闭方收到 FIN，已回 ACK |
| LAST_ACK | 被动关闭方已发 FIN，等待最终 ACK |
| TIME_WAIT | 主动关闭方收到对方 FIN，等 2MSL |
| CLOSING | 双方同时关闭（罕见） |

### 状态转换图

```
                              ┌──────────┐
              主动打开(connect) │  CLOSED  │  被动打开(listen)
              发送 SYN         │          │
         ┌───────────────────│          │──────────────────┐
         ↓                    └──────────┘                  ↓
    ┌──────────┐                                      ┌──────────┐
    │ SYN_SENT │                                      │  LISTEN  │
    └──────────┘                                      └──────────┘
         │ 收到 SYN+ACK                                     │ 收到 SYN
         │ 发送 ACK                                         │ 发送 SYN+ACK
         ↓                                                  ↓
    ┌───────────────┐                               ┌──────────┐
    │  ESTABLISHED  │←────── 收到 ACK ──────────────│ SYN_RCVD │
    └───────────────┘                               └──────────┘
         │                                                │
    主动关闭                                           被动关闭
    发送 FIN                                        收到 FIN，发 ACK
         ↓                                                ↓
    ┌──────────┐                                    ┌───────────┐
    │FIN_WAIT_1│                                    │CLOSE_WAIT │
    └──────────┘                                    └───────────┘
         │ 收到 ACK                                       │ 发 FIN
         ↓                                                ↓
    ┌──────────┐                                    ┌──────────┐
    │FIN_WAIT_2│── 收到 FIN ──→ TIME_WAIT           │ LAST_ACK │
    └──────────┘    发 ACK     (2MSL→CLOSED)        └──────────┘
                                                         │ 收到 ACK
                                                         ↓ CLOSED
```

### 监控命令

```bash
# 查看各状态连接数
ss -tan | awk '{print $1}' | sort | uniq -c | sort -rn

# 输出示例：
#   120 ESTAB
#    35 TIME-WAIT
#    12 CLOSE-WAIT
#     5 FIN-WAIT-2
#     1 LISTEN
```

---

## 5. TCP 的可靠传输是如何实现的？

**回答：**

### 五大核心机制

```
1. 序列号 + 确认号
   - 每个字节都有序列号
   - 接收方用 ACK 告知 "我已收到这些字节，期望下一个"
   - 保证有序和不重复

2. 超时重传（Timeout Retransmission）
   - 发送数据后启动定时器
   - 超时未收到 ACK → 重传
   - RTO（Retransmission Timeout）动态计算
     RTO 基于 RTT（Round-Trip Time）的采样
     Jacobson 算法: SRTT, RTTVAR → 计算 RTO

3. 快速重传（Fast Retransmit）
   - 收到 3 个重复 ACK → 立即重传，不等超时
   - 比超时重传更快地发现丢包

4. 校验和（Checksum）
   - TCP 头部的校验和字段覆盖头部+数据
   - 检测传输中的比特错误
   - 校验失败 → 丢弃（不发 ACK → 触发重传）

5. 滑动窗口（Sliding Window）
   - 控制发送速率，不需要逐包确认
   - 发送窗口 = min(拥塞窗口 cwnd, 接收窗口 rwnd)
```

### 滑动窗口详解

```
发送方视角：

已确认  │  已发送未确认  │  可以发送  │  不能发送
────────┼──────────────┼──────────┼──────────
   ✓    │    →发送窗口←  │          │
────────┴──────────────┴──────────┴──────────
        ↑               ↑
      SND.UNA        SND.NXT

接收方视角：

已收到已确认 │  接收窗口（可接收） │  不能接收
────────────┼──────────────────┼──────────
            ↑                  ↑
          RCV.NXT         RCV.NXT + RCV.WND
```

### SACK（选择性确认）

```
常规 ACK：只告诉发送方 "我收到了连续到第 X 字节"
  → 如果中间丢了一个包，后面收到的包也要重传

SACK：告诉发送方 "我收到了 1-100, 200-300, 400-500"
  → 发送方只需重传 101-199, 301-399
  → 大大提高重传效率

# 开启 SACK（Linux 默认开启）
net.ipv4.tcp_sack = 1
```

---

## 6. TCP 的拥塞控制算法详解？

**回答：**

### 四个阶段

```
                cwnd（拥塞窗口）
                 │
                 │        拥塞避免（线性增长）
                 │       /
ssthresh ───────│──────/──────── 快速恢复
(慢启动阈值)     │    /            ↓ cwnd减半
                 │   /          丢包检测
                 │  /  ←慢启动    (3个重复ACK)
                 │ / (指数增长)
                 │/
                 └──────────────────────────── 时间
```

### 1. 慢启动（Slow Start）

```
初始 cwnd = 1 MSS (或 initcwnd，Linux 默认 10)
每收到 1 个 ACK → cwnd += 1 MSS
每个 RTT → cwnd 翻倍（指数增长）

RTT 1: cwnd = 1  → 发 1 个段
RTT 2: cwnd = 2  → 发 2 个段
RTT 3: cwnd = 4  → 发 4 个段
RTT 4: cwnd = 8  → 发 8 个段
...
直到 cwnd >= ssthresh → 进入拥塞避免
```

### 2. 拥塞避免（Congestion Avoidance）

```
每个 RTT → cwnd += 1 MSS（线性增长）
目标：谨慎探测可用带宽

cwnd = 16: RTT → cwnd = 17
cwnd = 17: RTT → cwnd = 18
...
直到检测到丢包
```

### 3. 快速重传 + 快速恢复（Fast Retransmit + Fast Recovery）

```
收到 3 个重复 ACK：
  1. ssthresh = cwnd / 2
  2. 立即重传丢失的段（快速重传）
  3. cwnd = ssthresh + 3（快速恢复，不进入慢启动）
  4. 进入拥塞避免

超时重传：
  1. ssthresh = cwnd / 2
  2. cwnd = 1 MSS（从头开始慢启动）
  3. 重新进入慢启动
```

### 现代拥塞控制算法

| 算法 | 特点 | 适用场景 |
|------|------|---------|
| Reno | 经典算法，FastRetransmit+FastRecovery | 传统网络 |
| Cubic | Linux 默认，三次函数增长 | 高带宽长延迟（BDP大） |
| BBR | Google 提出，基于带宽和延迟模型 | 高丢包率网络、CDN |

```bash
# 查看当前拥塞控制算法
sysctl net.ipv4.tcp_congestion_control
# cubic

# 可用算法
sysctl net.ipv4.tcp_available_congestion_control

# 切换为 BBR
sysctl -w net.ipv4.tcp_congestion_control=bbr
sysctl -w net.core.default_qdisc=fq
```

---

## 7. 什么是 TCP 粘包/拆包？如何解决？

**回答：**

### 产生原因

```
TCP 是字节流协议，没有消息边界的概念。

发送方发送了两个数据包：
  包1: [AAAAAA]
  包2: [BBBBBB]

接收方可能收到：
  情况1（正常）:   [AAAAAA] [BBBBBB]
  情况2（粘包）:   [AAAAAABBBBBB]        ← 两个包合成一个
  情况3（拆包）:   [AAAA] [AABBBBBB]     ← 第一个包被拆开
  情况4（混合）:   [AAAAAABB] [BBBB]     ← 粘包+拆包
```

### 原因分析

```
粘包原因：
  1. Nagle 算法：小包合并发送（减少网络开销）
  2. 接收方缓冲区：多次 send 的数据在接收方一次 recv

拆包原因：
  1. 数据超过 MSS → TCP 分段
  2. 数据超过发送缓冲区剩余空间
```

### 解决方案

```
方案1：固定长度
  每个消息固定为 N 字节，不足补 \0
  优点：简单
  缺点：浪费带宽

方案2：分隔符
  用特殊字符分隔消息（如 \r\n, \0）
  优点：灵活
  缺点：数据中不能包含分隔符（或需要转义）

方案3：长度前缀（最常用）
  消息格式：[4字节长度][数据]
  ┌────────┬──────────────────────┐
  │ Length  │      Payload         │
  │ 4 bytes │    Length bytes       │
  └────────┴──────────────────────┘
  接收方先读 4 字节得到长度，再读对应长度的数据

方案4：使用应用层协议
  HTTP: Content-Length 或 Transfer-Encoding: chunked
  gRPC: Protocol Buffers 自带长度前缀
  WebSocket: 帧格式自带长度
```

---

## 8. TCP 的 Keep-Alive 机制？

**回答：**

### 原理

```
TCP 连接空闲时，Keep-Alive 机制定期发送探测包
检查对方是否还在线

空闲超时后开始探测：
  → 发送 Keep-Alive 探测包（内容为空，seq=snd.nxt-1）
  → 对方存活 → 回复 ACK → 继续保持连接
  → 对方死亡/不可达 → 无回复 → 重试 N 次
  → N 次都无回复 → 判定连接死亡 → 关闭
```

### Linux 参数

```bash
# 查看默认值
sysctl net.ipv4.tcp_keepalive_time      # 7200 (秒) = 2小时空闲后探测
sysctl net.ipv4.tcp_keepalive_intvl     # 75 (秒) = 探测间隔
sysctl net.ipv4.tcp_keepalive_probes    # 9 (次) = 探测次数

# 默认行为：连接空闲 2 小时后，每 75 秒发一次探测，共 9 次
# 总计：2h + 75s × 9 ≈ 2h11m 后判定死亡

# 调优（适合 DevOps 场景）
sysctl -w net.ipv4.tcp_keepalive_time=600    # 10 分钟
sysctl -w net.ipv4.tcp_keepalive_intvl=30    # 30 秒
sysctl -w net.ipv4.tcp_keepalive_probes=3    # 3 次
# 总计：10m + 30s × 3 = 11.5 分钟判定死亡
```

### TCP Keep-Alive vs HTTP Keep-Alive

```
TCP Keep-Alive:
  - 传输层机制
  - 目的是检测死连接
  - 默认关闭，需要应用层或系统开启

HTTP Keep-Alive (Connection: keep-alive):
  - 应用层机制
  - 目的是复用 TCP 连接发多个 HTTP 请求
  - HTTP/1.1 默认开启

它们是完全不同的概念！
```

---

## 9. TCP 的 Nagle 算法和延迟确认（Delayed ACK）？

**回答：**

### Nagle 算法

```
目的：减少小包数量（Silly Window Syndrome）

规则：
  若有未确认的数据在网络中
    → 缓冲小数据（< MSS），等待 ACK 到来后再发
  若没有未确认的数据
    → 立即发送

效果：小数据被合并成大包发送，减少头部开销
代价：增加延迟（对交互式应用不友好）
```

### 延迟确认（Delayed ACK）

```
目的：减少纯 ACK 包数量

规则：
  收到数据后不立即发 ACK
  等最多 200ms（Linux 40ms）看有没有数据要发
  如果有 → 搭载 ACK 在数据包中一起发（捎带确认）
  如果没有 → 超时后发纯 ACK

或者：连续收到 2 个全尺寸段 → 立即 ACK
```

### Nagle + Delayed ACK 的冲突

```
问题场景：应用层分两次发小包
  1. 客户端 send("HE")  → TCP 立即发送（无未确认数据）
  2. 客户端 send("LLO") → TCP 等待（Nagle：有未确认数据）
  3. 服务器收到 "HE" → 延迟 ACK（等 200ms 看有没有响应数据）
  
  → 客户端等服务器 ACK 才发 "LLO"
  → 服务器等处理结果才发 ACK
  → 死锁般等待 200ms！

解决：
  1. 一次性发送（send("HELLO")）
  2. 关闭 Nagle: setsockopt(TCP_NODELAY)（适合交互场景、RPC）
  3. 使用 writev()/sendmsg() 合并发送（适合应用层解决）
```

```bash
# Nginx 中通常开启 TCP_NODELAY
# nginx.conf
tcp_nodelay on;   # 默认 on
```

---

## 10. TCP 的 SYN Flood 攻击原理和防御？

**回答：**

### 攻击原理

```
正常三次握手：
  1. C→S: SYN          → 服务器分配资源，放入半连接队列
  2. S→C: SYN+ACK      → 等待客户端 ACK
  3. C→S: ACK          → 移入全连接队列（accept()取走）

SYN Flood 攻击：
  攻击者发送大量 SYN（伪造源 IP）
  → 服务器回 SYN+ACK 到伪造 IP（无人回复）
  → 半连接队列被填满
  → 正常连接无法建立
```

### 相关队列

```
                SYN 到达
                   ↓
            ┌─────────────┐
            │  半连接队列   │ ← SYN 包占用（SYN_RCVD 状态）
            │ (SYN Queue)  │    大小: tcp_max_syn_backlog
            └──────┬──────┘
                   │ 收到 ACK
                   ↓
            ┌─────────────┐
            │  全连接队列   │ ← 三次握手完成（ESTABLISHED）
            │(Accept Queue)│    大小: min(somaxconn, backlog)
            └──────┬──────┘
                   │ accept()
                   ↓
              应用程序处理
```

### 防御措施

```bash
# 1. SYN Cookie（最有效）
# 不在半连接队列中保存状态，用加密计算验证 ACK 的合法性
sysctl -w net.ipv4.tcp_syncookies=1

# 2. 增大半连接队列
sysctl -w net.ipv4.tcp_max_syn_backlog=8192

# 3. 减少 SYN+ACK 重试次数
sysctl -w net.ipv4.tcp_synack_retries=2    # 默认 5

# 4. 增大全连接队列
sysctl -w net.core.somaxconn=65535

# 5. 开启 SYN 回收（在溢出时回收 TIME_WAIT）
sysctl -w net.ipv4.tcp_tw_reuse=1

# 6. iptables 限速
iptables -A INPUT -p tcp --syn -m limit --limit 100/s --limit-burst 200 -j ACCEPT
iptables -A INPUT -p tcp --syn -j DROP
```

---

## 11. TCP 的常用内核参数调优？

**回答：**

```bash
# ===== 连接管理 =====

# 半连接队列大小（防 SYN Flood）
net.ipv4.tcp_max_syn_backlog = 8192

# 全连接队列大小
net.core.somaxconn = 65535

# 启用 SYN Cookie
net.ipv4.tcp_syncookies = 1

# SYN 重试次数（客户端）
net.ipv4.tcp_syn_retries = 3

# SYN+ACK 重试次数（服务器）
net.ipv4.tcp_synack_retries = 2

# ===== 连接复用 =====

# TIME_WAIT 状态重用
net.ipv4.tcp_tw_reuse = 1

# FIN_TIMEOUT（FIN_WAIT_2 超时）
net.ipv4.tcp_fin_timeout = 15

# 本地端口范围
net.ipv4.ip_local_port_range = 1024 65535

# ===== Keep-Alive =====

net.ipv4.tcp_keepalive_time = 600
net.ipv4.tcp_keepalive_intvl = 30
net.ipv4.tcp_keepalive_probes = 3

# ===== 缓冲区 =====

# TCP 读缓冲区（最小、默认、最大，字节）
net.ipv4.tcp_rmem = 4096 87380 16777216

# TCP 写缓冲区
net.ipv4.tcp_wmem = 4096 65536 16777216

# 自动调整缓冲区大小
net.ipv4.tcp_moderate_rcvbuf = 1

# 总 TCP 内存（页面数）
net.ipv4.tcp_mem = 786432 1048576 1572864

# ===== 拥塞控制 =====

net.ipv4.tcp_congestion_control = bbr
net.core.default_qdisc = fq

# ===== 最大连接数 =====

# 全系统最大文件描述符
fs.file-max = 1048576

# 系统级最大连接跟踪数（有 NAT/防火墙时重要）
net.nf_conntrack_max = 1048576
```

---

## 12. 什么是 TCP Fast Open (TFO)？

**回答：**

### 问题

```
标准 TCP：每次新建连接都要 1-RTT 的三次握手
在高延迟网络中，握手开销显著

特别是 HTTP 短连接场景：
  握手 1-RTT + 请求 1-RTT = 至少 2-RTT 才能收到第一个字节
```

### TFO 原理

```
首次连接（正常三次握手 + 获取 Cookie）：
  1. C→S: SYN + 请求 TFO Cookie
  2. S→C: SYN+ACK + TFO Cookie (加密令牌)
  3. C→S: ACK
  客户端缓存 Cookie

后续连接（0-RTT，SYN 中携带数据）：
  1. C→S: SYN + TFO Cookie + HTTP请求数据  ← 关键！
  2. S→C: SYN+ACK + HTTP响应数据
  3. C→S: ACK

  → 省去了一个 RTT！首个 SYN 包就带上了请求数据
```

### 配置

```bash
# Linux 开启 TFO
# 0=禁用, 1=客户端, 2=服务器, 3=客户端+服务器
sysctl -w net.ipv4.tcp_fastopen=3

# Nginx 配置
listen 80 fastopen=256;    # 256 是 TFO 队列大小
```

---

## 13. CLOSE_WAIT 过多说明什么？如何排查？

**回答：**

### 含义

```
CLOSE_WAIT 状态 = 对方已经关闭了连接（发了 FIN），
                   但本方还没有调用 close()

大量 CLOSE_WAIT → 应用程序的 bug：没有正确关闭 Socket
```

### 排查步骤

```bash
# 1. 查看 CLOSE_WAIT 连接数和对端
ss -tanp state close-wait

# 2. 找到相关进程
ss -tanp state close-wait | awk '{print $NF}' | sort | uniq -c | sort -rn
# 输出示例：150 users:(("java",pid=1234,fd=56))

# 3. 查看进程的文件描述符数
ls /proc/1234/fd | wc -l

# 4. 常见原因
# - HTTP 客户端未关闭响应体
# - 数据库连接池未正确回收
# - 异常处理中缺少 finally { socket.close() }
# - HttpClient 未正确配置连接管理器

# 5. 代码层面排查
# Java: try-with-resources
# Go: defer conn.Close()
# Python: with 语句
```

### 解决

```
根本解决：修复代码，确保连接在使用后正确关闭

临时缓解：
  - 如果进程可以重启 → 重启进程
  - 使用连接池并配置空闲超时
  - 配置 TCP Keep-Alive 检测死连接
```
