# IP 网络与路由

---

## 1. IPv4 地址分类和私有地址？

**回答：**

### 传统 IP 地址分类

| 类别 | 首字节范围 | 网络位 | 主机位 | 默认掩码 | 可用主机数 |
|------|----------|--------|--------|---------|-----------|
| A 类 | 1-126 | 8 | 24 | /8 (255.0.0.0) | 16,777,214 |
| B 类 | 128-191 | 16 | 16 | /16 (255.255.0.0) | 65,534 |
| C 类 | 192-223 | 24 | 8 | /24 (255.255.255.0) | 254 |
| D 类 | 224-239 | — | — | — | 多播地址 |
| E 类 | 240-255 | — | — | — | 保留/实验 |

### 私有地址范围（RFC 1918）

| 类别 | 范围 | CIDR | 用途 |
|------|------|------|------|
| A 类 | 10.0.0.0 - 10.255.255.255 | 10.0.0.0/8 | 大型企业、云VPC |
| B 类 | 172.16.0.0 - 172.31.255.255 | 172.16.0.0/12 | 中型网络 |
| C 类 | 192.168.0.0 - 192.168.255.255 | 192.168.0.0/16 | 家庭/小型办公 |

### 特殊地址

| 地址 | 用途 |
|------|------|
| 127.0.0.0/8 | 环回地址（localhost） |
| 0.0.0.0 | 本机所有地址（监听用） |
| 255.255.255.255 | 本地广播 |
| 169.254.0.0/16 | 链路本地（DHCP 获取失败） |
| 100.64.0.0/10 | 运营商级 NAT (CGN) |

---

## 2. CIDR 子网划分怎么算？

**回答：**

### CIDR（无类别域间路由）

```
CIDR 不再使用 A/B/C 类固定划分
用 /前缀长度 灵活指定网络部分

IP 地址: 192.168.1.100/24
         11000000.10101000.00000001.01100100
         ├────── 24位网络 ──────┤├─8位主机─┤

子网掩码: 255.255.255.0
         11111111.11111111.11111111.00000000
```

### 子网计算

```
给定：192.168.1.0/24
  网络地址：192.168.1.0      (主机位全0)
  广播地址：192.168.1.255    (主机位全1)
  可用主机：192.168.1.1 ~ 192.168.1.254
  主机数量：2^8 - 2 = 254

给定：192.168.1.0/26
  子网掩码：255.255.255.192
  每个子网主机数：2^6 - 2 = 62
  
  子网 1: 192.168.1.0/26    (可用: .1 ~ .62)
  子网 2: 192.168.1.64/26   (可用: .65 ~ .126)
  子网 3: 192.168.1.128/26  (可用: .129 ~ .190)
  子网 4: 192.168.1.192/26  (可用: .193 ~ .254)

计算口诀：
  /24 = 256个地址 = 254主机
  /25 = 128个地址 = 126主机
  /26 = 64个地址 = 62主机
  /27 = 32个地址 = 30主机
  /28 = 16个地址 = 14主机
  /29 = 8个地址 = 6主机
  /30 = 4个地址 = 2主机（点对点链路常用）
  /31 = 2个地址 = RFC 3021 点对点链路
  /32 = 1个地址 = 主机路由
```

### 超网/CIDR 聚合

```
路由聚合（Summarization）：
将多个小网络合并为一个大网络

  192.168.0.0/24
  192.168.1.0/24
  192.168.2.0/24
  192.168.3.0/24
  → 聚合为 192.168.0.0/22（减少路由条目）
```

---

## 3. VLAN 是什么？Trunk 和 Access 端口？

**回答：**

### VLAN 基本概念

```
VLAN（Virtual LAN）= 在交换机上逻辑划分的广播域

物理上在同一交换机 → 逻辑上隔离为不同网络
不同 VLAN 的设备不能直接通信（需要路由器/三层交换机）

用途：
  - 安全隔离（办公网 vs 服务器网 vs 管理网）
  - 减少广播域大小
  - 灵活管理（不受物理位置限制）
```

### 端口类型

```
Access 端口：
  - 只属于一个 VLAN
  - 连接终端设备（PC、服务器）
  - 进出帧不带 VLAN Tag

Trunk 端口：
  - 承载多个 VLAN 的流量
  - 连接交换机之间、或交换机到路由器
  - 帧带 802.1Q VLAN Tag（4字节）

  ┌──────────┐  Trunk (多VLAN)  ┌──────────┐
  │ Switch A │══════════════════│ Switch B │
  └──────────┘                  └──────────┘
   VLAN 10  VLAN 20             VLAN 10  VLAN 20
   (Access) (Access)            (Access) (Access)
    │  │     │  │                │  │     │  │
   PC PC    PC  PC              PC  PC   PC  PC
```

### 802.1Q Tag

```
Ethernet 帧 + VLAN Tag:
┌──────┬──────┬──────────┬──────┬─────────┬─────┐
│ DMAC │ SMAC │ 802.1Q   │ Type │ Payload │ FCS │
│ 6B   │ 6B   │ 4B       │ 2B   │         │ 4B  │
└──────┴──────┴──────────┴──────┴─────────┴─────┘
                ↓
       ┌──────┬───┬────────┐
       │ TPID │PRI│ VID    │
       │0x8100│3b │ 12bit  │
       └──────┴───┴────────┘
       VID: VLAN ID (0-4095)，可用 1-4094
```

---

## 4. NAT 的类型和工作原理？

**回答：**

### NAT 类型

| 类型 | 说明 | 转换 |
|------|------|------|
| SNAT | 源地址转换 | 内网 IP → 公网 IP（出站流量） |
| DNAT | 目的地址转换 | 公网 IP:Port → 内网 IP:Port（入站流量） |
| NAPT/PAT | 端口地址转换 | 多个内网 IP → 一个公网 IP（通过端口区分） |
| MASQUERADE | 自动 SNAT | 自动使用出口 IP（动态 IP 场景） |

### NAPT 工作原理

```
内网主机 A: 192.168.1.10:50000 → 访问 google.com:443
内网主机 B: 192.168.1.20:50000 → 访问 google.com:443

NAT 网关 (公网IP: 1.2.3.4):

NAT 表：
  内网地址              →  外网地址
  192.168.1.10:50000   →  1.2.3.4:40001
  192.168.1.20:50000   →  1.2.3.4:40002

去程：192.168.1.10:50000 → 1.2.3.4:40001 → google.com:443
回程：google.com:443 → 1.2.3.4:40001 → 192.168.1.10:50000

同一个公网 IP 通过不同端口区分不同的内网主机
```

### Linux iptables NAT 配置

```bash
# 开启 IP 转发
echo 1 > /proc/sys/net/ipv4/ip_forward
# 或持久化
sysctl -w net.ipv4.ip_forward=1

# SNAT / MASQUERADE（出站流量）
# 内网 192.168.1.0/24 通过 eth0 上网
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j MASQUERADE
# 或用 SNAT（指定固定公网 IP）
iptables -t nat -A POSTROUTING -s 192.168.1.0/24 -o eth0 -j SNAT --to-source 1.2.3.4

# DNAT（端口转发，入站流量）
# 公网 80 → 内网 192.168.1.100:8080
iptables -t nat -A PREROUTING -p tcp -i eth0 --dport 80 -j DNAT --to-destination 192.168.1.100:8080
# 同时需要 FORWARD 允许
iptables -A FORWARD -p tcp -d 192.168.1.100 --dport 8080 -j ACCEPT

# 查看 NAT 规则
iptables -t nat -L -n -v

# 查看连接跟踪表
conntrack -L
cat /proc/net/nf_conntrack
```

---

## 5. 路由的基本概念？静态路由和动态路由？

**回答：**

### 路由表

```bash
# 查看路由表
ip route show
# 或
route -n

# 输出示例：
default via 192.168.1.1 dev eth0        # 默认路由
10.0.0.0/8 via 10.0.0.1 dev tun0        # VPN 路由
192.168.1.0/24 dev eth0 scope link       # 直连路由
172.17.0.0/16 dev docker0               # Docker 路由

路由匹配原则：最长前缀匹配
  目的 IP = 10.0.1.100
  10.0.0.0/8  → 匹配
  10.0.1.0/24 → 也匹配
  → 选择 /24（前缀更长，更精确）
```

### 静态路由

```bash
# 添加静态路由
ip route add 10.0.0.0/8 via 192.168.1.1 dev eth0
ip route add 172.16.0.0/12 via 10.0.0.1

# 添加默认路由
ip route add default via 192.168.1.1

# 删除路由
ip route del 10.0.0.0/8

# 持久化（不同发行版方式不同）
# CentOS/RHEL: /etc/sysconfig/network-scripts/route-eth0
# Ubuntu: /etc/netplan/xxx.yaml 中 routes 配置
```

### 动态路由协议

| 协议 | 类型 | 算法 | 适用场景 |
|------|------|------|---------|
| RIP | 距离向量 | 跳数（最大15） | 小型网络（已过时） |
| OSPF | 链路状态 | 最短路径（Dijkstra） | 中大型企业/ISP内部 |
| BGP | 路径向量 | 策略路由 | 互联网骨干（AS之间） |
| IS-IS | 链路状态 | SPF | 大型ISP内部 |
| EIGRP | 混合 | DUAL | Cisco 专有网络 |

### BGP 简介

```
BGP（Border Gateway Protocol）= 互联网的路由协议

自治系统（AS, Autonomous System）：
  一个 ISP 或大型企业的网络 = 一个 AS
  每个 AS 有唯一编号（ASN）

eBGP: 不同 AS 之间的路由交换
iBGP: 同一 AS 内部的路由同步

BGP 做路由决策基于：
  - AS 路径长度
  - 本地偏好
  - 网络前缀
  - 策略（可手动配置）

DevOps 视角：
  云上 VPC 间互联（VPC Peering, Transit Gateway）底层用 BGP
  多云/混合云网络也涉及 BGP
```

---

## 6. Linux 网络配置管理？

**回答：**

### IP 地址管理

```bash
# 查看所有网卡信息
ip addr show
ip -4 addr show          # 只看 IPv4
ip -br addr show         # 简洁格式

# 添加/删除 IP 地址
ip addr add 192.168.1.100/24 dev eth0
ip addr del 192.168.1.100/24 dev eth0

# 启用/禁用网卡
ip link set eth0 up
ip link set eth0 down

# 修改 MTU
ip link set eth0 mtu 9000
```

### 网络配置持久化

```bash
# ===== Ubuntu (Netplan) =====
# /etc/netplan/01-config.yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    eth0:
      addresses:
        - 192.168.1.100/24
      gateway4: 192.168.1.1
      nameservers:
        addresses: [8.8.8.8, 1.1.1.1]
      routes:
        - to: 10.0.0.0/8
          via: 192.168.1.254

# 应用
netplan apply

# ===== CentOS/RHEL (NetworkManager) =====
# /etc/sysconfig/network-scripts/ifcfg-eth0
TYPE=Ethernet
BOOTPROTO=static
IPADDR=192.168.1.100
NETMASK=255.255.255.0
GATEWAY=192.168.1.1
DNS1=8.8.8.8
ONBOOT=yes

# 使用 nmcli
nmcli con mod eth0 ipv4.addresses "192.168.1.100/24"
nmcli con mod eth0 ipv4.gateway "192.168.1.1"
nmcli con mod eth0 ipv4.dns "8.8.8.8"
nmcli con mod eth0 ipv4.method manual
nmcli con up eth0
```

---

## 7. IPv6 基础知识？

**回答：**

### IPv4 vs IPv6

| 特性 | IPv4 | IPv6 |
|------|------|------|
| 地址长度 | 32 位 | 128 位 |
| 地址数量 | ~43 亿 | ~3.4×10^38 |
| 表示法 | 十进制点分 | 十六进制冒号分 |
| NAT | 广泛使用 | 不再需要 |
| 头部 | 可变长度 | 固定 40 字节 |
| ARP | 有 | NDP 替代 |
| 广播 | 有 | 多播替代 |
| 自动配置 | DHCP | SLAAC + DHCPv6 |
| IPSec | 可选 | 内置 |

### IPv6 地址表示

```
完整形式: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
缩写形式: 2001:db8:85a3::8a2e:370:7334
  规则: 每段前导 0 可省略，连续全 0 段可用 :: 缩写（只能出现一次）

特殊地址:
  ::1            = 回环地址（127.0.0.1）
  ::             = 未指定地址（0.0.0.0）
  fe80::/10      = 链路本地地址（自动分配）
  fc00::/7       = 唯一本地地址（类似私有 IP）
  2000::/3       = 全球单播地址（公网）
  ff00::/8       = 多播地址
```

### DevOps 中的 IPv6

```bash
# 查看 IPv6 地址
ip -6 addr show

# 测试 IPv6 连通性
ping6 ::1
ping6 2001:4860:4860::8888    # Google IPv6 DNS

# 双栈配置（同时运行 IPv4 和 IPv6）
# 大多数现代操作系统和应用默认支持

# Docker IPv6
# /etc/docker/daemon.json
{
  "ipv6": true,
  "fixed-cidr-v6": "2001:db8:1::/64"
}

# Kubernetes IPv6 双栈
# 在 kube-apiserver 启用 IPv6DualStack 特性
```

---

## 8. Linux 防火墙：iptables 和 nftables？

**回答：**

### iptables 基础

```
iptables 四表五链：

表（Table）：
  raw      → 连接跟踪前的规则
  mangle   → 修改数据包（TTL, TOS 等）
  nat      → 地址转换（SNAT, DNAT）
  filter   → 过滤（默认表）

链（Chain）：
  PREROUTING  → 路由前处理（DNAT）
  INPUT       → 进入本机的包
  FORWARD     → 转发的包（不进入本机）
  OUTPUT      → 本机发出的包
  POSTROUTING → 路由后处理（SNAT）

数据包流向：
  入站: PREROUTING → [路由决策] → INPUT → 本机进程
  转发: PREROUTING → [路由决策] → FORWARD → POSTROUTING → 出去
  出站: 本机进程 → OUTPUT → [路由决策] → POSTROUTING → 出去
```

### iptables 常用命令

```bash
# 查看规则
iptables -L -n -v               # 查看 filter 表
iptables -t nat -L -n -v        # 查看 nat 表

# 基本规则
iptables -A INPUT -p tcp --dport 22 -j ACCEPT       # 允许 SSH
iptables -A INPUT -p tcp --dport 80 -j ACCEPT       # 允许 HTTP
iptables -A INPUT -p tcp --dport 443 -j ACCEPT      # 允许 HTTPS
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT  # 允许已建立的连接
iptables -A INPUT -i lo -j ACCEPT                    # 允许回环
iptables -P INPUT DROP                               # 默认拒绝入站

# 限制连接速率
iptables -A INPUT -p tcp --dport 22 -m connlimit --connlimit-above 3 -j REJECT
iptables -A INPUT -p tcp --syn -m limit --limit 10/s --limit-burst 20 -j ACCEPT

# 删除规则
iptables -D INPUT 3              # 删除第 3 条规则
iptables -F                      # 清空所有规则

# 保存规则
iptables-save > /etc/iptables/rules.v4
iptables-restore < /etc/iptables/rules.v4
```

### nftables（iptables 的继任者）

```bash
# nftables 语法更简洁，性能更好

# 查看规则
nft list ruleset

# 创建表和链
nft add table inet myfilter
nft add chain inet myfilter input { type filter hook input priority 0 \; policy drop \; }

# 添加规则
nft add rule inet myfilter input tcp dport 22 accept
nft add rule inet myfilter input tcp dport {80, 443} accept
nft add rule inet myfilter input ct state established,related accept

# firewalld（CentOS/RHEL，底层用 nftables）
firewall-cmd --zone=public --add-service=http --permanent
firewall-cmd --zone=public --add-port=8080/tcp --permanent
firewall-cmd --reload
firewall-cmd --list-all
```

---

## 9. 什么是 VXLAN？什么是 Overlay 网络？

**回答：**

### 问题背景

```
传统 VLAN 的限制：
  - VLAN ID 只有 12 位 → 最多 4094 个 VLAN
  - 无法跨三层网络（不同数据中心）
  - 不适合大规模云计算/容器网络

Overlay 网络：
  在现有物理网络（Underlay）之上建立虚拟网络
  逻辑上的连通，不依赖物理拓扑
```

### VXLAN（Virtual eXtensible LAN）

```
VXLAN 封装格式：
┌──────────┬──────────┬──────────┬──────────┐
│ 外层帧头  │  外层 IP  │ 外层 UDP  │ VXLAN头  │
│ (DMAC)   │  (VTEP)  │ (dst:4789)│ (VNI)    │
├──────────┴──────────┴──────────┴──────────┤
│       原始以太网帧（完整保留）                │
│ ┌────────┬────────┬──────────┬─────┐       │
│ │ DMAC   │ SMAC   │ EtherType│ ... │       │
│ └────────┴────────┴──────────┴─────┘       │
└───────────────────────────────────────────┘

VNI (VXLAN Network Identifier): 24位 → 支持 ~1600万个网络
VTEP (VXLAN Tunnel Endpoint): 封装/解封装的端点

    Host A                              Host B
    ┌──────┐                            ┌──────┐
    │ VM-1 │                            │ VM-2 │
    │10.0.1│                            │10.0.1│
    └──┬───┘                            └──┬───┘
       │                                   │
    ┌──┴───┐  VXLAN隧道(UDP 4789)      ┌──┴───┐
    │ VTEP │════════════════════════════│ VTEP │
    │192.168│    (走物理 IP 网络)       │192.168│
    └──────┘                            └──────┘
```

### DevOps 中的 Overlay

```
Kubernetes 网络插件：
  Flannel VXLAN 模式：
    Pod → veth → cni0(bridge) → flannel.1(VTEP) → UDP封装 → 物理网络

  Calico VXLAN 模式：
    类似，但也支持 BGP 直接路由（无封装开销）

Docker Overlay 网络：
  docker network create -d overlay my-overlay
  → 跨主机容器通信

注意 MTU：
  VXLAN 增加 50 字节开销
  物理 MTU=1500 → 内层 MTU 需要设为 1450
  MTU 不匹配是容器网络常见问题！
```

---

## 10. VPN 的类型和原理？

**回答：**

### VPN 类型

| 类型 | 工作层 | 协议 | 特点 |
|------|--------|------|------|
| L2TP/IPSec | L2 | L2TP+IPSec | 传统企业VPN |
| IPSec | L3 | ESP/AH | 站点到站点VPN |
| SSL VPN | L4-L7 | TLS | 无需客户端（Web VPN） |
| OpenVPN | L3-L4 | TLS/UDP | 开源，灵活 |
| WireGuard | L3 | Noise协议 | 现代，极简高效 |

### IPSec VPN

```
两种模式：
  传输模式（Transport）：只加密 IP 包的载荷（端到端）
  隧道模式（Tunnel）：加密整个原始 IP 包 + 新 IP 头（网关到网关）

两个协议：
  ESP：加密 + 认证（常用）
  AH：只认证不加密（少用）

两个阶段：
  Phase 1 (IKE SA)：协商加密参数，认证对方身份
  Phase 2 (IPSec SA)：协商数据加密参数，建立隧道

场景：AWS Site-to-Site VPN, 混合云网络
```

### WireGuard

```bash
# WireGuard：现代 VPN，极简设计

# 安装
apt install wireguard

# 生成密钥对
wg genkey | tee privatekey | wg pubkey > publickey

# 服务器配置 /etc/wireguard/wg0.conf
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <server_private_key>

[Peer]
PublicKey = <client_public_key>
AllowedIPs = 10.0.0.2/32

# 启动
wg-quick up wg0
systemctl enable wg-quick@wg0

# 客户端配置
[Interface]
Address = 10.0.0.2/24
PrivateKey = <client_private_key>

[Peer]
PublicKey = <server_public_key>
Endpoint = server_ip:51820
AllowedIPs = 0.0.0.0/0    # 全部流量走 VPN
PersistentKeepalive = 25

优势：
  - 代码量极小（~4000行 vs OpenVPN 10万行）
  - 性能远超 OpenVPN 和 IPSec
  - 配置简洁
  - 内核级实现（Linux 5.6+内置）
```

---

## 11. 什么是 SDN（软件定义网络）？

**回答：**

```
SDN 核心思想：将网络的控制平面和数据平面分离

传统网络：
  每个交换机/路由器 = 控制平面 + 数据平面
  分散式管理，配置复杂

SDN 网络：
  控制平面：集中到 SDN 控制器（软件）
  数据平面：交换机只负责按规则转发
  → 控制器通过 OpenFlow 等协议下发转发规则

架构：
  ┌──────────────────────────────────────┐
  │           SDN 应用层                  │
  │  (网络监控, 负载均衡, 安全策略)       │
  ├──────────────────────────────────────┤
  │           SDN 控制层                  │
  │  (控制器: OpenDaylight, ONOS, Floodlight)│
  ├──────────────────────────────────────┤
  │           数据转发层                  │
  │  (OpenFlow 交换机, OVS)              │
  └──────────────────────────────────────┘

DevOps 中的 SDN：
  - 云网络（AWS VPC, Azure VNet）本质是 SDN
  - Kubernetes CNI 插件（Calico, Cilium）
  - OpenStack Neutron
  - Open vSwitch (OVS)
  - eBPF (Cilium 用的高性能数据路径)
```
