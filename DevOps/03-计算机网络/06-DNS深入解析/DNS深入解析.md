# DNS 深入解析

---

## 1. DNS 解析的完整过程？递归查询和迭代查询？

**回答：**

### 完整解析过程

```
用户在浏览器输入 www.example.com

1. 浏览器 DNS 缓存
   └→ 命中则直接使用（Chrome: chrome://net-internals/#dns）

2. 操作系统 DNS 缓存
   └→ /etc/hosts 文件（优先）
   └→ nscd / systemd-resolved 缓存

3. 本地 DNS 服务器（递归解析器，如运营商DNS/8.8.8.8）
   └→ 缓存命中则返回
   └→ 未命中则代替客户端进行迭代查询：

4.   → 根域名服务器（.）
       返回 ".com 的 NS 记录" → 指向 .com 顶级域服务器

5.   → .com 顶级域服务器（TLD）
       返回 "example.com 的 NS 记录" → 指向权威 DNS

6.   → example.com 权威 DNS 服务器
       返回 "www.example.com 的 A 记录: 93.184.216.34"

7. 本地 DNS 缓存结果（TTL 时间内有效）
8. 返回 IP 给客户端
```

### 递归 vs 迭代

```
递归查询（Recursive）：
  客户端 → 本地 DNS："帮我查 www.example.com"
  本地 DNS 自己跑完全部查询，返回最终结果
  → 客户端只需要一次请求

  客户端 ←→ 本地DNS ←→ 根 ←→ TLD ←→ 权威
  (递归)   (迭代查询链)

迭代查询（Iterative）：
  本地 DNS → 根服务器："www.example.com?"
  根服务器 → 本地 DNS："去问 .com 服务器"
  本地 DNS → .com 服务器："www.example.com?"
  .com → 本地 DNS："去问 example.com 的权威NS"
  ...

  通常：客户端到本地DNS是递归，本地DNS到各级DNS是迭代
```

---

## 2. 常见的 DNS 记录类型及应用场景？

**回答：**

| 记录类型 | 说明 | 格式示例 | 应用场景 |
|---------|------|---------|---------|
| A | 域名→IPv4 | `example.com. IN A 1.2.3.4` | 最基本的域名解析 |
| AAAA | 域名→IPv6 | `example.com. IN AAAA 2001:db8::1` | IPv6 地址解析 |
| CNAME | 域名别名→另一个域名 | `www. CNAME example.com.` | CDN、别名 |
| MX | 邮件交换 | `example.com. MX 10 mail.example.com.` | 邮件路由 |
| NS | 域名服务器 | `example.com. NS ns1.example.com.` | 委派子域名 |
| TXT | 文本记录 | `example.com. TXT "v=spf1 ..."` | SPF/DKIM/域名验证 |
| SRV | 服务发现 | `_http._tcp. SRV 10 60 80 web.` | 服务定位 |
| PTR | IP→域名（反向） | `4.3.2.1.in-addr.arpa. PTR example.com.` | 反向DNS、邮件反垃圾 |
| SOA | 起始授权 | `example.com. SOA ns1. admin. ...` | 区域主信息 |
| CAA | 证书授权 | `example.com. CAA 0 issue "letsencrypt.org"` | 限制可签发证书的CA |

### CNAME 使用注意事项

```
CNAME 限制：
  1. CNAME 不能和其他记录共存于同一域名
     example.com.  CNAME  other.com.     ← 不行！根域有 MX/NS/SOA
     www.example.com.  CNAME  other.com. ← 可以！

  2. CNAME 会产生额外 DNS 查询（CNAME 链）
     www → cdn.example.com → edge.cdn.net → 1.2.3.4

  替代方案：
     ALIAS/ANAME 记录（非标准，部分 DNS 提供商支持）
     → 在 DNS 服务器端直接解析 CNAME 为 A 记录返回
```

### TXT 记录的常见用途

```bash
# SPF（发件人策略框架）
example.com.  TXT  "v=spf1 include:_spf.google.com ~all"
# 指定哪些 IP/邮件服务器可以代表此域名发邮件

# DKIM（域名密钥识别邮件）
selector._domainkey.example.com.  TXT  "v=DKIM1; k=rsa; p=MIGfMA0..."
# 用于邮件签名验证

# 域名所有权验证
example.com.  TXT  "google-site-verification=xxxx"    # Google
example.com.  TXT  "MS=ms12345678"                     # Microsoft

# Let's Encrypt DNS 验证
_acme-challenge.example.com.  TXT  "xxxx"
```

---

## 3. DNS TTL 是什么？如何合理设置？

**回答：**

### TTL（Time To Live）

```
TTL = DNS 记录在缓存中的有效时间（秒）

example.com.  3600  IN  A  1.2.3.4
              ↑ TTL = 3600 秒 = 1 小时

含义：任何 DNS 缓存（递归解析器）查到这条记录后，可以缓存 1 小时
1 小时后再次查询时必须重新去权威 DNS 获取
```

### TTL 策略

| 场景 | 推荐 TTL | 理由 |
|------|---------|------|
| 稳定服务 | 3600-86400 (1小时-1天) | 减少 DNS 查询量 |
| CDN / 负载均衡 | 60-300 (1-5分钟) | 快速切换后端 |
| 故障转移 | 30-60 (30-60秒) | 快速切换到备份 |
| 即将迁移 | 60-300 | 迁移前降低 TTL |
| 正常迁移后 | 恢复 3600+ | 迁移完成稳定后 |

### 迁移时的 TTL 策略

```
DNS 迁移最佳实践（如更换服务器 IP）：

1.提前 24-48 小时：
  将 TTL 从 3600 降低到 60
  等待旧 TTL 过期（最多等原 TTL 时长）

2.执行迁移：
  修改 A 记录指向新 IP
  → 最多 60 秒后所有客户端指向新 IP

3.验证稳定后：
  将 TTL 恢复为 3600

注意：
  TTL 降低需要等待旧 TTL 过期才生效！
  如果原 TTL 是 24 小时，提前 1 小时降低是不够的
```

---

## 4. 什么是 DNS 负载均衡？有哪些实现方式？

**回答：**

### DNS 轮询（Round Robin）

```
example.com.  A  1.1.1.1
example.com.  A  2.2.2.2
example.com.  A  3.3.3.3

DNS 服务器每次以不同顺序返回 A 记录
客户端通常使用第一个 → 实现简单的负载分配

优点：简单，不需要额外设备
缺点：
  - 不考虑服务器负载
  - 不考虑客户端地理位置
  - 无法健康检查（挂了的服务器仍在记录中）
  - 受客户端 DNS 缓存影响
```

### 智能 DNS / 地理 DNS

```
根据客户端位置返回最近的服务器 IP

北京用户 → 查询 example.com → 返回北京机房 IP
上海用户 → 查询 example.com → 返回上海机房 IP

实现方式：
  1. 基于客户端 IP 地理位置
  2. 基于延迟测量
  3. EDNS Client Subnet (ECS)
     → DNS 查询携带客户端子网信息
     → 权威 DNS 根据子网返回最优 IP

服务商：
  - AWS Route 53 (地理位置/延迟/故障转移/加权路由)
  - Cloudflare DNS
  - 阿里云 DNS (分地域解析)
```

### AWS Route 53 路由策略

| 策略 | 说明 |
|------|------|
| Simple | 轮询多个 IP |
| Weighted | 按权重分配流量（灰度发布） |
| Latency-based | 返回延迟最低的区域 |
| Geolocation | 按地理位置路由 |
| Failover | 主备切换（健康检查） |
| Multivalue | 轮询 + 健康检查 |

---

## 5. DNS 安全：DNS 劫持、DNS 污染、DNSSEC？

**回答：**

### DNS 劫持

```
攻击者控制了 DNS 服务器或中间节点，篡改 DNS 响应

方式：
  1. 路由器 DNS 劫持（修改路由器的 DNS 配置）
  2. 本地 DNS 劫持（修改 /etc/resolv.conf 或 hosts）
  3. 运营商 DNS 劫持（ISP 篡改 DNS 响应插入广告）
  4. ARP 欺骗 + DNS 劫持（中间人攻击）

防御：
  - 使用可信的 DNS（8.8.8.8, 1.1.1.1）
  - 使用 DNS over HTTPS (DoH) 或 DNS over TLS (DoT)
  - DNSSEC
```

### DNS 污染（DNS Cache Poisoning）

```
攻击者向 DNS 缓存注入伪造记录

原理：
  DNS 使用 UDP → 无连接验证
  攻击者伪造 DNS 响应包（猜对 Transaction ID）
  → 如果伪造的响应先到达 → 被缓存 → 所有用户受影响

防御：
  - DNSSEC（数字签名验证）
  - 端口随机化（增加猜测难度）
  - 0x20 encoding（大小写随机化）
```

### DNSSEC

```
DNSSEC = DNS Security Extensions
给 DNS 记录加数字签名，防止伪造和篡改

新增的记录类型：
  RRSIG  — 记录的数字签名
  DNSKEY — 用于验证签名的公钥
  DS     — 子域名的密钥摘要（信任链）
  NSEC/NSEC3 — 证明某条记录不存在

验证链：
  根域 DS → .com DNSKEY 验证 → .com DS → example.com DNSKEY 验证

查询 DNSSEC：
  dig +dnssec example.com
  # 看到 RRSIG 记录 → DNSSEC 已启用
  # 响应标志中有 'ad' → 验证通过

局限：
  - 只保证完整性和真实性，不加密（DNS 查询内容仍可见）
  - 部署率不高（配置复杂）
  - 需要 DoH/DoT 才能同时实现加密
```

---

## 6. DNS over HTTPS (DoH) 和 DNS over TLS (DoT)？

**回答：**

### 对比

| 特性 | 传统 DNS | DoT | DoH |
|------|---------|-----|-----|
| 协议 | UDP/TCP | TLS | HTTPS |
| 端口 | 53 | 853 | 443 |
| 加密 | 无 | TLS | TLS |
| 可被识别和封锁 | 是 | 是（端口 853） | 难（混在 HTTPS 中） |
| 隐私 | 差 | 好 | 最好 |

### 为什么需要？

```
传统 DNS 问题：
  1. 明文传输 → ISP/中间人可以看到你访问的域名
  2. 无认证 → DNS 响应可被篡改
  3. 隐私泄露 → DNS 服务商知道你的所有访问记录

DoT/DoH 解决：
  → 加密 DNS 查询和响应
  → 防止中间人窃听和篡改
  → DoH 伪装成普通 HTTPS 流量，更难被封锁
```

### 配置

```bash
# Linux 启用 DoT（systemd-resolved）
# /etc/systemd/resolved.conf
[Resolve]
DNS=1.1.1.1#cloudflare-dns.com 8.8.8.8#dns.google
DNSOverTLS=yes

systemctl restart systemd-resolved

# 使用 Cloudflare DoH 代理（cloudflared）
cloudflared proxy-dns --port 5053 --upstream https://1.1.1.1/dns-query
# 然后将系统 DNS 指向 127.0.0.1:5053

# Docker 中使用
docker run -d --name cloudflared \
  -p 5053:5053/udp \
  cloudflare/cloudflared:latest proxy-dns \
  --address 0.0.0.0 --port 5053
```

---

## 7. 什么是内部 DNS？企业内部 DNS 架构？

**回答：**

### 内部 DNS（Split-horizon DNS）

```
同一个域名对内对外解析到不同 IP：

外部用户 → 公网 DNS → api.example.com → 1.2.3.4 (公网 IP/CDN)
内部员工 → 内部 DNS → api.example.com → 10.0.1.100 (内网 IP)

内部额外域名：
  gitlab.internal.example.com → 10.0.2.50
  jenkins.internal.example.com → 10.0.2.60
  k8s.internal.example.com → 10.0.3.100

这些域名在公网 DNS 中不存在
```

### 企业 DNS 架构

```
┌──────────────────────────────────────────────────┐
│                     互联网                        │
│              外部 DNS (Route 53 等)               │
└───────────────────────┬──────────────────────────┘
                        │
                   ┌────┴────┐
                   │ 防火墙   │
                   └────┬────┘
                        │
              ┌─────────┴─────────┐
              │  内部 DNS 主服务器  │ ← BIND / CoreDNS / Windows DNS
              │  (Primary)        │
              └─────────┬─────────┘
                        │ 区域传送
              ┌─────────┴─────────┐
              │  内部 DNS 从服务器  │ ← 高可用
              │  (Secondary)      │
              └───────────────────┘
                   ↑      ↑
            ┌──────┘      └──────┐
         办公网络              数据中心
      (员工电脑)          (服务器/容器)
```

### Kubernetes 中的 DNS（CoreDNS）

```yaml
# Kubernetes 内部 DNS 解析格式：
# <service>.<namespace>.svc.cluster.local

# Service DNS:
my-service.default.svc.cluster.local → ClusterIP

# Pod DNS:
10-244-0-5.default.pod.cluster.local → Pod IP

# Headless Service (无 ClusterIP):
# 直接返回各 Pod IP（用于 StatefulSet）
pod-0.my-service.default.svc.cluster.local → Pod-0 IP
pod-1.my-service.default.svc.cluster.local → Pod-1 IP
```

---

## 8. DNS 常用排障命令详解？

**回答：**

### dig（推荐）

```bash
# 基本查询
dig example.com                    # 查 A 记录
dig example.com AAAA               # 查 IPv6
dig example.com MX                 # 查邮件记录
dig example.com ANY                # 查所有记录

# 简洁输出
dig +short example.com             # 只输出 IP
dig +short example.com MX          # 只输出 MX 记录

# 指定 DNS 服务器
dig @8.8.8.8 example.com          # 用 Google DNS
dig @1.1.1.1 example.com          # 用 Cloudflare DNS

# 跟踪完整解析过程（从根开始）
dig +trace example.com
# → 显示每一步访问了哪个 DNS 服务器，返回了什么

# 查看详细信息
dig +noall +answer example.com     # 只显示回答部分
dig +noall +authority example.com  # 只显示授权部分

# 反向 DNS
dig -x 8.8.8.8

# 查 DNSSEC 信息
dig +dnssec example.com

# 查看 NS 记录（权威 DNS）
dig example.com NS +short
```

### nslookup

```bash
# 基本查询
nslookup example.com
nslookup example.com 8.8.8.8       # 指定 DNS

# 查特定记录
nslookup -type=mx example.com
nslookup -type=txt example.com
nslookup -type=ns example.com

# 交互模式
nslookup
> server 8.8.8.8
> set type=MX
> example.com
```

### host

```bash
# 简洁查询
host example.com
host -t MX example.com
host -t CNAME www.example.com

# 反向查询
host 8.8.8.8
```

### 排障流程

```bash
# 1. 检查本地 DNS 配置
cat /etc/resolv.conf
resolvectl status

# 2. 查缓存
# systemd-resolved 缓存统计
resolvectl statistics

# 3. 对比不同 DNS 服务器
dig @8.8.8.8 example.com +short
dig @1.1.1.1 example.com +short
dig @$(cat /etc/resolv.conf | grep nameserver | head -1 | awk '{print $2}') example.com +short

# 4. 如果结果不一致 → 可能 DNS 劫持/污染/配置错误

# 5. 检查权威 DNS
dig example.com NS +short
dig @ns1.example.com example.com +short

# 6. 检查 TTL 和传播
dig example.com +noall +answer
# 观察 TTL 值，判断缓存状态
```

---

## 9. DNS 区域传送（Zone Transfer）是什么？安全问题？

**回答：**

### 区域传送

```
主 DNS 服务器将所有记录同步给从 DNS 服务器

AXFR：完全区域传送（全量）
IXFR：增量区域传送（只传变化的记录）

正常用途：主从 DNS 数据同步

安全问题：
  如果区域传送未做限制 → 任何人可以获取所有 DNS 记录
  → 泄露内网拓扑、服务器 IP、子域名
```

### 检测和防护

```bash
# 测试是否允许区域传送
dig @ns1.example.com example.com AXFR

# 如果返回了所有记录 → 安全漏洞！

# BIND 限制区域传送
# /etc/named.conf
zone "example.com" {
    type master;
    file "example.com.zone";
    allow-transfer { 10.0.0.2; 10.0.0.3; };  # 只允许从服务器
    also-notify { 10.0.0.2; 10.0.0.3; };
};
```

---

## 10. 什么是 DNS 预解析（DNS Prefetch）和预连接？

**回答：**

### DNS Prefetch

```html
<!-- 浏览器提前解析将要用到的域名 -->
<link rel="dns-prefetch" href="//cdn.example.com">
<link rel="dns-prefetch" href="//api.example.com">
<link rel="dns-prefetch" href="//fonts.googleapis.com">

效果：浏览器在空闲时提前做 DNS 解析
→ 后续请求这些域名时省去 DNS 查询时间
```

### Preconnect

```html
<!-- 提前建立 TCP + TLS 连接 -->
<link rel="preconnect" href="https://cdn.example.com">

效果：提前完成 DNS + TCP 握手 + TLS 握手
→ 省去 2-3 RTT 的延迟

适用：确定会用到的跨域资源
```

### 性能优化

```
DNS 解析耗时通常 20-120ms，跨国可能 200ms+

优化手段：
  1. DNS Prefetch（提前解析）
  2. 减少域名数量（减少 DNS 查询次数）
  3. 使用短 TTL 的 DNS 记录时确保有足够缓存
  4. HTTP/2 多路复用减少域名需求
  5. CDN 边缘节点就近解析

DevOps 实践：
  监控 DNS 解析时间
  dig example.com | grep "Query time"
```

---

## 11. CoreDNS / BIND 的基本配置？

**回答：**

### CoreDNS（Kubernetes 默认 DNS）

```
# Corefile（CoreDNS 配置文件）
.:53 {
    errors                          # 错误日志
    health {
        lameduck 5s                 # 健康检查
    }
    ready                           # 就绪探针（/ready）

    kubernetes cluster.local in-addr.arpa ip6.arpa {
        pods insecure                # Pod DNS 记录
        fallthrough in-addr.arpa ip6.arpa
        ttl 30
    }

    prometheus :9153                # Prometheus 指标

    forward . /etc/resolv.conf {    # 外部域名转发
        max_concurrent 1000
    }

    cache 30                        # 缓存 30 秒
    loop                            # 检测转发循环
    reload                          # 配置热加载
    loadbalance                     # 轮询负载均衡
}

# 自定义域名解析
example.local:53 {
    file /etc/coredns/example.local.zone
}
```

```bash
# Kubernetes 查看 CoreDNS 配置
kubectl -n kube-system get configmap coredns -o yaml

# 测试 DNS 解析（从 Pod 内）
kubectl run -it --rm debug --image=busybox -- nslookup kubernetes.default.svc.cluster.local

# CoreDNS 日志
kubectl -n kube-system logs -l k8s-app=kube-dns
```

### BIND（传统权威 DNS）

```bash
# /etc/named.conf 主配置
options {
    listen-on port 53 { any; };
    directory "/var/named";
    allow-query { any; };
    allow-transfer { 10.0.0.2; };    # 限制区域传送
    recursion no;                     # 权威服务器关闭递归
    dnssec-enable yes;
    dnssec-validation yes;
};

zone "example.com" IN {
    type master;
    file "example.com.zone";
};

# /var/named/example.com.zone 区域文件
$TTL 3600
@  IN  SOA  ns1.example.com. admin.example.com. (
    2024010101  ; Serial
    3600        ; Refresh
    1800        ; Retry
    604800      ; Expire
    86400       ; Minimum TTL
)
@     IN  NS    ns1.example.com.
@     IN  NS    ns2.example.com.
@     IN  A     93.184.216.34
www   IN  CNAME @
mail  IN  A     93.184.216.35
@     IN  MX 10 mail.example.com.
```
