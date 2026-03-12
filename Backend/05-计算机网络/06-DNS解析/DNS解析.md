# DNS解析

---

## 1. DNS 解析完整流程？

**回答：**

```
访问 www.example.com 的解析流程：

  1. 浏览器 DNS 缓存
  2. 操作系统 DNS 缓存
  3. hosts 文件（/etc/hosts）
  4. 本地 DNS 服务器（递归查询）
     ↓ 缓存未命中
  5. 根域名服务器（.）→ 返回 .com 的 NS
  6. 顶级域名服务器（.com）→ 返回 example.com 的 NS
  7. 权威域名服务器（example.com）→ 返回 IP

  ┌────────┐    ┌──────────┐     ┌──────┐
  │ 客户端  │──→│ 本地DNS  │────→│ 根DNS │
  │        │   │ (递归)   │←───│ .     │
  │        │   │         │────→│.com NS│
  │        │   │         │←───│      │
  │        │   │         │────→│权威DNS│
  │  IP ←──│   │ 缓存结果 │←───│ A记录 │
  └────────┘    └──────────┘     └──────┘

  客户端→本地DNS：递归查询（本地DNS负责全程查找）
  本地DNS→各级DNS：迭代查询（逐级引导）
```

---

## 2. DNS 记录类型？

**回答：**

```
  ┌──────┬──────────────────────────────────────┐
  │ 类型  │ 说明                                  │
  ├──────┼──────────────────────────────────────┤
  │ A    │ 域名 → IPv4 地址                      │
  │ AAAA │ 域名 → IPv6 地址                      │
  │ CNAME│ 域名 → 另一个域名（别名）              │
  │ MX   │ 邮件交换记录                           │
  │ NS   │ 指定域名的 DNS 服务器                   │
  │ TXT  │ 文本记录（SPF/DKIM/验证）              │
  │ SRV  │ 服务发现（_service._proto.name）       │
  │ PTR  │ IP → 域名（反向解析）                   │
  │ SOA  │ 权威信息（主DNS/刷新间隔）              │
  │ CAA  │ 授权 CA 签发证书                        │
  └──────┴──────────────────────────────────────┘

  示例：
  example.com.    A     93.184.216.34
  www.example.com CNAME example.com
  example.com.    MX    10 mail.example.com
  example.com.    NS    ns1.example.com
  example.com.    TXT   "v=spf1 include:_spf.google.com ~all"

  CNAME 注意：
  根域名（example.com）不能设 CNAME
  CNAME 不能和其他记录共存（同名）
```

---

## 3. DNS 缓存与 TTL？

**回答：**

```
DNS 缓存层次：
  浏览器缓存 → 操作系统缓存 → 本地 DNS 缓存

TTL（Time To Live）：
  DNS 记录的缓存有效时间（秒）
  TTL=300 → 缓存 5 分钟
  TTL=86400 → 缓存 1 天

TTL 设置策略：
  较长 TTL（1天+）：稳定服务，减少 DNS 查询
  较短 TTL（60s）：需要快速切换（故障转移）
  迁移前降低 TTL → 迁移 → 恢复 TTL

清除 DNS 缓存：
  # Linux
  systemd-resolve --flush-caches

  # macOS
  sudo dscacheutil -flushcache

  # Windows
  ipconfig /flushdns

  # Chrome 浏览器
  chrome://net-internals/#dns → Clear host cache

DNS 预取优化：
  <link rel="dns-prefetch" href="//api.example.com">
  提前解析域名，减少首次请求延迟
```

---

## 4. DNS 负载均衡？

**回答：**

```
DNS 轮询：
  同一域名配置多个 A 记录
  DNS 服务器轮流返回不同 IP

  example.com  A  1.1.1.1
  example.com  A  2.2.2.2
  example.com  A  3.3.3.3

  优点：简单，无需额外设备
  缺点：
  - 不感知服务器负载和健康
  - 缓存导致分配不均
  - 切换慢（受 TTL 限制）

智能 DNS（GeoDNS）：
  根据用户地理位置返回最近的 IP
  用于 CDN 调度

  北京用户 → 解析到北京节点 IP
  上海用户 → 解析到上海节点 IP

DNS + 健康检查（AWS Route53/CloudFlare）：
  主动检测后端健康
  故障自动切换 IP
  加权轮询（不同服务器不同权重）
  Failover（主备切换）
```

---

## 5. DNS 安全？

**回答：**

```
DNS 攻击类型：
  ┌──────────────┬──────────────────────────────┐
  │ 攻击          │ 说明                          │
  ├──────────────┼──────────────────────────────┤
  │ DNS 劫持      │ 篡改 DNS 响应返回恶意 IP      │
  │ DNS 缓存投毒  │ 向 DNS 缓存注入虚假记录       │
  │ DNS 放大攻击  │ 利用 DNS 放大 DDoS 流量       │
  │ DNS 隧道      │ 通过 DNS 协议传输隐蔽数据     │
  └──────────────┴──────────────────────────────┘

防御措施：
  DNSSEC：对 DNS 响应进行数字签名
    验证记录来源和完整性
    防止缓存投毒和劫持

  DoH（DNS over HTTPS）：
    DNS 查询通过 HTTPS 加密传输
    防止明文窃听和篡改

  DoT（DNS over TLS）：
    DNS 查询通过 TLS 加密
    与 DoH 类似但独立端口（853）

  DNS 防火墙：
    过滤恶意域名查询
    阻止 DNS 隧道

公共 DNS：
  8.8.8.8 / 8.8.4.4（Google）
  1.1.1.1（Cloudflare）
  223.5.5.5（阿里）
  114.114.114.114
```

---

## 6. 内部 DNS 与服务发现？

**回答：**

```
CoreDNS（Kubernetes 内部 DNS）：
  K8s 集群内服务发现
  Service 自动注册 DNS 记录

  <svc>.<namespace>.svc.cluster.local
  例：mysql.default.svc.cluster.local

  Pod DNS：
  <pod-ip-dashed>.<namespace>.pod.cluster.local

Consul DNS：
  HashiCorp Consul 提供服务发现
  <service>.service.consul
  支持健康检查和权重

自建 DNS 方案：
  BIND/PowerDNS → 大型企业内网
  dnsmasq → 轻量级本地 DNS 缓存
  CoreDNS → 云原生环境

DNS 服务发现 vs 注册中心：
  ┌──────────────┬──────────────┬──────────────┐
  │ 对比          │ DNS 发现      │ 注册中心      │
  ├──────────────┼──────────────┼──────────────┤
  │ 实时性        │ 受 TTL 限制  │ 实时推送      │
  │ 健康检查      │ 有限         │ 主动检查      │
  │ 负载均衡      │ 简单轮询     │ 策略灵活      │
  │ 元数据        │ 有限         │ 丰富          │
  │ 客户端        │ 无需 SDK     │ 需要 SDK      │
  └──────────────┴──────────────┴──────────────┘
```

---

## 7. dig/nslookup 使用？

**回答：**

```
dig 命令（推荐）：
  dig example.com              # 查 A 记录
  dig example.com AAAA         # 查 IPv6
  dig example.com MX           # 查邮件记录
  dig example.com NS           # 查 DNS 服务器
  dig example.com +short       # 简洁输出
  dig example.com +trace       # 追踪完整解析过程
  dig @8.8.8.8 example.com    # 指定 DNS 服务器
  dig -x 93.184.216.34        # 反向解析

dig 输出解读：
  ;; QUESTION SECTION:
  ;example.com.        IN    A

  ;; ANSWER SECTION:
  example.com.   3600  IN    A    93.184.216.34
  ──────────── ─────  ──  ───  ──────────────
  域名          TTL   类  类型  值

  ;; Query time: 23 msec    ← 查询耗时
  ;; SERVER: 8.8.8.8#53     ← 使用的DNS服务器

nslookup 命令：
  nslookup example.com
  nslookup -type=MX example.com
  nslookup example.com 8.8.8.8
```

---

## 8. DNS 优化实践？

**回答：**

```
应用层 DNS 优化：

  1. DNS 预解析
     浏览器：<link rel="dns-prefetch">
     应用：启动时预热 DNS 缓存

  2. 本地 DNS 缓存
     Go net.Resolver + 自定义缓存
     减少重复 DNS 查询

  3. 合理 TTL 设置
     稳定服务 TTL 大（减少查询）
     需要快速切换时 TTL 小

  4. HTTP Keep-Alive
     长连接复用减少 DNS 查询频次

  5. 连接池
     缓存已解析的 IP 和连接

Go DNS 注意事项：
  默认 cgo resolver：用系统 DNS
  纯 Go resolver：不依赖 cgo
  GODEBUG=netdns=go  强制纯 Go
  GODEBUG=netdns=cgo 强制 cgo

  DNS 超时设置：
  net.Resolver.Dial 自定义超时
  避免 DNS 慢影响服务启动
```

---

## 9. DNS 故障排查？

**回答：**

```
常见 DNS 问题：

  1. 域名无法解析
     dig example.com +trace   # 追踪哪一级出问题
     dig @8.8.8.8 example.com # 换 DNS 服务器测试
     cat /etc/resolv.conf     # 检查 DNS 配置

  2. DNS 解析慢
     dig example.com          # 看 Query time
     ping 本地 DNS 服务器      # 检查网络延迟
     考虑换公共 DNS 或本地缓存

  3. DNS 解析错误
     dig +trace 追踪完整路径
     检查 CDN/DNS 厂商配置
     DNSPod/Route53 管理面板

  4. K8s 内 DNS 问题
     kubectl exec -it pod -- nslookup kubernetes
     kubectl logs -n kube-system coredns-xxx
     检查 CoreDNS ConfigMap

  5. 容器 DNS 配置
     cat /etc/resolv.conf
     nameserver 10.96.0.10  ← kube-dns ClusterIP
     search default.svc.cluster.local svc.cluster.local

  6. ndots 问题
     K8s 默认 ndots:5
     查询 example.com 会先尝试：
       example.com.default.svc.cluster.local
       example.com.svc.cluster.local
       example.com.cluster.local
       example.com
     外部域名解析慢 → 设置 ndots:2 或 FQDN 带点
```

---

## 10. DNS面试速答？

**回答：**

```
Q: DNS 解析过程？
A: 浏览器缓存→系统缓存→hosts→本地DNS
   →根DNS→顶级DNS→权威DNS→返回IP

Q: 递归查询 vs 迭代查询？
A: 递归：客户端→本地DNS（本地DNS全权负责）
   迭代：本地DNS→各级DNS（逐级引导查找）

Q: 常见DNS记录？
A: A(IPv4) AAAA(IPv6) CNAME(别名)
   MX(邮件) NS(DNS服务器) TXT(文本)

Q: DNS 用 TCP 还是 UDP？
A: 通常 UDP（快，数据小）
   响应>512字节或区域传输用 TCP

Q: DNS 劫持防御？
A: DNSSEC(签名验证)
   DoH/DoT(加密传输)

Q: K8s 内部 DNS？
A: CoreDNS 提供
   格式：svc.namespace.svc.cluster.local

Q: DNS 负载均衡？
A: 多个 A 记录轮询
   GeoDNS 按地理位置解析
   缺点：不感知健康、受TTL限制

Q: TTL 怎么设？
A: 稳定服务：长TTL(1天)减少查询
   需快速切换：短TTL(60s)
   迁移前先降TTL
```
