# TCP协议深入

---

## 1. TCP 三次握手详解？

**回答：**

```
三次握手过程：

  客户端                     服务端
  CLOSED                     LISTEN
    │                          │
    │──── SYN(seq=x) ────────→│
    │     SYN_SENT             │ SYN_RCVD
    │                          │
    │←── SYN+ACK(seq=y,ack=x+1)│
    │     ESTABLISHED          │
    │                          │
    │──── ACK(ack=y+1) ──────→│
    │                          │ ESTABLISHED
    │      数据传输              │

为什么三次而非两次？
  防止已失效的 SYN 请求到达服务端
  如果两次：服务端收到旧 SYN 就建立连接 → 浪费资源
  三次：客户端不会确认过期的 SYN-ACK → 服务端不会建连

半连接队列 vs 全连接队列：
  SYN 队列（半连接）：收到 SYN 后放入，大小 tcp_max_syn_backlog
  Accept 队列（全连接）：三次握手完成后放入，大小 somaxconn
  队列满 → 丢弃新连接请求

SYN Flood 攻击：
  大量伪造 IP 发 SYN → 半连接队列满 → 正常连接无法建立
  防御：SYN Cookie（不存半连接状态）
```

---

## 2. TCP 四次挥手详解？

**回答：**

```
四次挥手过程：

  主动方（客户端）           被动方（服务端）
  ESTABLISHED               ESTABLISHED
    │                          │
    │──── FIN(seq=u) ────────→│
    │     FIN_WAIT_1           │ CLOSE_WAIT
    │                          │
    │←── ACK(ack=u+1) ────────│
    │     FIN_WAIT_2           │ （可能继续发数据）
    │                          │
    │←── FIN(seq=v) ──────────│
    │     TIME_WAIT            │ LAST_ACK
    │                          │
    │──── ACK(ack=v+1) ──────→│
    │     等待 2MSL             │ CLOSED
    │     CLOSED               │

为什么是四次？
  TCP 全双工，每个方向独立关闭
  收到 FIN 只关闭一个方向（半关闭）
  被动方可能还有数据要发

TIME_WAIT 为什么等 2MSL？
  1. 确保最后一个 ACK 到达对方
     若丢失，对方重发 FIN 还能处理
  2. 等旧连接的包都过期
     避免新连接收到旧包

TIME_WAIT 过多的影响：
  每个连接占 ~3.5KB 内存 + 一个端口
  解决：tcp_tw_reuse / 连接池 / 长连接
```

---

## 3. TCP 滑动窗口与流量控制？

**回答：**

```
滑动窗口：
  发送方维护发送窗口，接收方通告接收窗口

  ┌──已确认──┬──已发未确认──┬──可发未发──┬──不可发──┐
  │ acked    │ sent        │ sendable  │ blocked │
  └──────────┴─────────────┴───────────┴─────────┘
              ├──────────────────────────┤
                   发送窗口 (swnd)

  swnd = min(cwnd, rwnd)
  cwnd：拥塞窗口（发送方估计的网络容量）
  rwnd：接收窗口（接收方通告的可用缓冲区）

流量控制：
  接收方在 ACK 中通告 rwnd（窗口大小）
  rwnd=0 → 发送方停止发送（零窗口探测）

  零窗口探测：
  收到 rwnd=0 后，定时发小探测包
  等接收方窗口恢复后继续传输

Nagle 算法：
  小包合并发送（减少网络中小包数量）
  与延迟确认配合可能导致延迟
  低延迟场景关闭：TCP_NODELAY = 1
```

---

## 4. TCP 拥塞控制算法？

**回答：**

```
传统拥塞控制（基于丢包）：

  cwnd
   ^
   |         /\
   |        /  \     /\
   |       /    \   /  \
   |      /      \ /    \
   |     /        
   |    / 慢启动    拥塞避免
   |   /
   └──────────────────────→ 时间

  1. 慢启动：cwnd=1 → 每 RTT 翻倍（指数增长）
     → 达到 ssthresh 进入拥塞避免
  2. 拥塞避免：每 RTT cwnd+1（线性增长）
  3. 快重传：3 个重复 ACK → 立即重传
  4. 快恢复：ssthresh = cwnd/2，cwnd = ssthresh+3

BBR 算法（Google）：
  基于带宽（Bandwidth）和 RTT 估计
  不等丢包就调整发送速率
  在高带宽高延迟网络表现远优于 Cubic

  开启 BBR：
  sysctl net.ipv4.tcp_congestion_control=bbr
  sysctl net.core.default_qdisc=fq

Cubic vs BBR：
  Cubic：Linux 默认，基于丢包，高延迟链路满载慢
  BBR：估测带宽，不受丢包影响，但可能不公平
```

---

## 5. TCP 重传机制？

**回答：**

```
超时重传（RTO）：
  发送数据后启动定时器
  超时未收到 ACK → 重传
  RTO = SRTT + 4 * RTTVAR（动态计算）
  每次超时 RTO 翻倍（指数退避）

快速重传：
  不等超时，收到 3 个重复 ACK 立即重传
  比超时重传更快（减少等待时间）

  发送 1,2,3,4,5
  ACK 1 ✓
  ACK 2 ✓
  3 丢失
  ACK 2 (重复1) ← 收到4
  ACK 2 (重复2) ← 收到5
  ACK 2 (重复3) → 立即重传 3

选择性确认 SACK：
  标准 ACK 只确认连续收到的最大序号
  SACK 扩展：告知发送方具体收到哪些段
  → 只重传真正丢失的段，避免不必要重传

  TCP Header Option:
  SACK: 收到 [1001-2000], [3001-5000]
  → 发送方知道只需重传 [2001-3000]
```

---

## 6. TCP 连接异常处理？

**回答：**

```
常见异常场景：

  对端崩溃（进程退出）：
  OS 代发 FIN → 正常四次挥手
  如果主机直接断电 → 需要 Keep-Alive 检测

  网络中断：
  发送方：重传多次后超时，报 ETIMEDOUT
  接收方：无感知，等 Keep-Alive 超时或应用超时

  RST (Reset) 发送场景：
  - 连接不存在的端口
  - 半打开连接（一端重启）
  - 收到不合法的数据包
  - 应用设置 SO_LINGER l_onoff=1,l_linger=0 关闭

TCP Keep-Alive：
  长时间无数据 → 发探测包检测连接存活
  默认配置：
    tcp_keepalive_time = 7200（2小时无数据开始探测）
    tcp_keepalive_intvl = 75（探测间隔75秒）
    tcp_keepalive_probes = 9（9次无响应判定断开）

应用层心跳 vs TCP Keep-Alive：
  TCP Keep-Alive 间隔太长（默认2小时）
  应用层心跳更灵活，可以检测应用级故障
  推荐：应用层心跳 + 合理 TCP Keep-Alive
```

---

## 7. TCP 粘包拆包？

**回答：**

```
TCP 是字节流协议，没有消息边界

粘包：多个消息合并成一次接收
拆包：一个消息拆成多次接收

原因：
  发送方：Nagle 算法合并小包
  接收方：接收缓冲区攒多个包一起读
  TCP 分段：消息 > MSS 会分段

解决方案：
  ┌──────────────┬──────────────────────────────┐
  │ 方案          │ 说明                          │
  ├──────────────┼──────────────────────────────┤
  │ 固定长度      │ 每条消息固定 N 字节            │
  │ 分隔符        │ \r\n 或特殊字符分隔            │
  │ 长度前缀      │ 前 4 字节表示消息长度（推荐）  │
  │ 自描述协议    │ protobuf/JSON 等              │
  └──────────────┴──────────────────────────────┘
```

```go
// 长度前缀协议示例
func sendMsg(conn net.Conn, data []byte) error {
    // 4 字节长度头 + 消息体
    length := uint32(len(data))
    buf := make([]byte, 4+len(data))
    binary.BigEndian.PutUint32(buf[:4], length)
    copy(buf[4:], data)
    _, err := conn.Write(buf)
    return err
}

func recvMsg(conn net.Conn) ([]byte, error) {
    // 先读 4 字节长度
    header := make([]byte, 4)
    if _, err := io.ReadFull(conn, header); err != nil {
        return nil, err
    }
    length := binary.BigEndian.Uint32(header)
    // 再读消息体
    data := make([]byte, length)
    _, err := io.ReadFull(conn, data)
    return data, err
}
```

---

## 8. TCP 性能优化？

**回答：**

```
连接优化：
  tcp_tw_reuse = 1       → TIME_WAIT 复用
  tcp_max_syn_backlog     → 增大半连接队列
  somaxconn               → 增大全连接队列
  tcp_fastopen = 3        → TFO 0-RTT 建连

传输优化：
  tcp_nodelay = 1         → 禁用 Nagle（低延迟）
  tcp_window_scaling = 1  → 窗口缩放（大带宽）
  tcp_rmem/tcp_wmem       → 调大缓冲区
  tcp_sack = 1            → 选择性确认

拥塞控制：
  tcp_congestion_control = bbr → BBR 算法
  net.core.default_qdisc = fq  → fair queueing

Keep-Alive：
  tcp_keepalive_time = 600
  tcp_keepalive_intvl = 15
  tcp_keepalive_probes = 5

应用层优化：
  - 连接池复用 TCP 连接
  - HTTP/2 多路复用
  - 长连接替代短连接
  - 批量发送减少交互次数
  - 考虑 gRPC 替代 HTTP/1.1
```

---

## 9. TCP 状态机？

**回答：**

```
TCP 状态转换完整图：

  ┌──────────┐
  │  CLOSED  │
  └──┬───┬───┘
  主动│   │被动
  打开│   │打开
     ↓   ↓
  ┌──────┐ ┌──────┐
  │SYN   │ │LISTEN│
  │SENT  │ └──┬───┘
  └──┬───┘    │收到SYN
  收到│       │发SYN+ACK
  SYN+ACK     ↓
  发ACK  ┌────────┐
     │   │SYN     │
     │   │RECEIVED│
     │   └──┬─────┘
     ↓      │收到ACK
  ┌──────────────┐
  │ ESTABLISHED  │
  └──┬──────┬────┘
  主动│     │被动
  关闭│     │收到FIN
  发FIN     │发ACK
     ↓      ↓
  ┌──────┐ ┌──────────┐
  │FIN   │ │CLOSE     │
  │WAIT_1│ │WAIT      │
  └──┬───┘ └──┬───────┘
  收到│       │发FIN
  ACK │       ↓
     ↓   ┌──────┐
  ┌──────┐│LAST  │
  │FIN   ││ACK   │
  │WAIT_2││      │
  └──┬───┘└──┬───┘
  收到│    收到│ACK
  FIN │       ↓
  发ACK   ┌──────┐
     ↓   │CLOSED│
  ┌──────┐└──────┘
  │TIME  │
  │WAIT  │等2MSL
  └──┬───┘
     ↓
  ┌──────┐
  │CLOSED│
  └──────┘

查看状态分布：
  ss -ant | awk '{print $1}' | sort | uniq -c | sort -rn
```

---

## 10. TCP面试速答？

**回答：**

```
Q: 三次握手为什么不是两次？
A: 防止已失效的旧 SYN 到达服务端
   导致错误建连浪费资源

Q: 四次挥手为什么不是三次？
A: TCP 全双工，每个方向独立关闭
   被动方收到 FIN 可能还有数据要发

Q: TIME_WAIT 作用？
A: 确保最后 ACK 到达对方
   等旧连接包过期（2MSL=60s）

Q: SYN Flood 防御？
A: SYN Cookie：不存半连接状态
   增大 backlog / 超时缩短

Q: 粘包怎么解决？
A: 长度前缀最常用
   前4字节标识消息长度

Q: 拥塞控制四阶段？
A: 慢启动(指数)→拥塞避免(线性)
   →快重传(3重复ACK)→快恢复

Q: BBR 和 Cubic 区别？
A: Cubic 基于丢包，高延迟场景慢
   BBR 基于带宽和RTT估计，更优

Q: TCP Keep-Alive 默认参数？
A: 2小时无数据开始探测
   75秒间隔，9次无响应断开
   建议应用层自己做心跳
```
