# Docker 网络

---

## 1. Docker 的网络模式有哪些？

**回答：**

```
Docker 内置 5 种网络驱动:

┌──────────┬────────────────────────────┬────────────────────┐
│ 模式     │ 说明                       │ 适用场景            │
├──────────┼────────────────────────────┼────────────────────┤
│ bridge   │ 默认。通过虚拟网桥互联      │ 单机容器互联         │
│ host     │ 容器直接使用宿主机网络栈     │ 高性能/调试          │
│ none     │ 无网络，完全隔离            │ 安全敏感、离线计算    │
│ overlay  │ 跨主机容器通信（VXLAN）      │ Swarm/K8s 集群      │
│ macvlan  │ 容器有独立 MAC，直连物理网络  │ 需要 L2 可见的场景   │
└──────────┴────────────────────────────┴────────────────────┘

另有第三方插件:
  ipvlan  → 类似 macvlan，共享 MAC
  Calico  → BGP 路由，K8s 常用
  Flannel → 简单的 Overlay，K8s 常用
  Weave   → 去中心化 Overlay
  Cilium  → eBPF 驱动的高性能网络
```

---

## 2. bridge 网络模式？

**回答：**

```
bridge = Docker 默认网络模式
每个容器有独立的 Network Namespace，通过 veth pair 连接到 docker0 网桥

架构:
  ┌─────────────────────────────────────────────┐
  │  宿主机                                      │
  │  ┌─────────┐  ┌─────────┐                   │
  │  │Container│  │Container│                   │
  │  │  eth0   │  │  eth0   │                   │
  │  └──┬──────┘  └──┬──────┘                   │
  │     │ veth pair  │ veth pair                │
  │  ┌──┴────────────┴──┐                       │
  │  │    docker0       │  ← 虚拟网桥 (172.17.0.1)│
  │  └──────┬───────────┘                       │
  │         │ NAT (iptables)                    │
  │  ┌──────┴──────┐                            │
  │  │   eth0      │  ← 宿主机物理网卡           │
  │  └──────┬──────┘                            │
  └─────────┼───────────────────────────────────┘
            │
        外部网络

关键点:
  1. 默认 bridge (docker0): 容器通过 IP 互联，不支持 DNS
  2. 自定义 bridge: 支持容器名 DNS 解析（推荐）
  3. 外部访问: 通过 iptables NAT 和端口映射
```

```bash
# 默认 bridge
docker run -d --name c1 nginx
docker run -d --name c2 nginx
# c1 和 c2 通过 IP 互通，但不能用容器名

# 自定义 bridge（推荐）
docker network create mynet
docker run -d --network mynet --name web nginx
docker run -d --network mynet --name app myapp
# web 和 app 可以通过容器名互通: curl http://web:80
```

---

## 3. host、none、overlay 模式？

**回答：**

### host 模式

```bash
docker run --network host nginx
# 容器直接使用宿主机的网络栈
# 不需要端口映射，nginx 直接监听宿主机 80 端口

# 优点: 网络性能最好（无 NAT 开销）
# 缺点: 端口冲突风险, 隔离性差
# 注意: macOS/Windows 的 Docker Desktop 不支持 host 模式
```

### none 模式

```bash
docker run --network none alpine
# 容器只有 loopback 接口（lo），完全隔离

# 使用场景:
#   安全敏感的计算任务
#   不需要网络的批处理作业
#   手动配置网络的高级场景
```

### overlay 模式

```bash
# overlay = 跨主机容器通信（VXLAN 封装）
# 需要 Docker Swarm 或外部 KV 存储

# Swarm 模式
docker network create --driver overlay --attachable myoverlay

# 架构:
#   Host A                     Host B
#   ┌───────────┐              ┌───────────┐
#   │ Container │              │ Container │
#   │ (10.0.0.2)│              │ (10.0.0.3)│
#   └─────┬─────┘              └─────┬─────┘
#         │ VXLAN 隧道                │
#   ┌─────┴────────────────────────┴─────┐
#   │          Overlay Network           │
#   │         (10.0.0.0/24)              │
#   └────────────────────────────────────┘
```

---

## 4. macvlan 网络？

**回答：**

```bash
# macvlan = 容器拥有独立 MAC 地址，直接接入物理网络
# 容器在外部网络中就像一台独立的物理机

docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 \
  my-macvlan

docker run -d --network my-macvlan --ip=192.168.1.100 nginx
# nginx 直接在 192.168.1.100，局域网其他机器可直接访问
```

```
macvlan 模式:
  bridge  → 容器间可通信, 默认
  private → 容器间隔离
  vepa    → 需要交换机支持
  passthru → 直通单个容器

macvlan vs bridge:
  macvlan → 容器有真实 IP，无 NAT，性能好
  bridge  → 容器私有 IP，通过 NAT 暴露端口

限制:
  1. 宿主机默认不能与 macvlan 容器通信
  2. 部分云平台不允许（每个 MAC 需要注册）
  3. 广播风暴风险
```

---

## 5. 自定义网络与 DNS？

**回答：**

```bash
# Docker 内置 DNS 服务器: 127.0.0.11
# 只在自定义网络中生效，默认 bridge 不支持

# 创建自定义网络
docker network create \
  --driver bridge \
  --subnet 172.20.0.0/16 \
  --ip-range 172.20.240.0/20 \
  --gateway 172.20.0.1 \
  --opt com.docker.network.bridge.name=br-mynet \
  mynet

# DNS 解析示例
docker run -d --network mynet --name db postgres
docker run -d --network mynet --name cache redis
docker run -d --network mynet --name app myapp
# app 容器内:
#   ping db      → 172.20.x.x (自动解析)
#   ping cache   → 172.20.x.x (自动解析)
```

### 网络别名

```bash
# 一个容器可以有多个 DNS 名称
docker run -d --network mynet --name db \
  --network-alias database \
  --network-alias pg \
  postgres
# 可以通过 db, database, pg 三个名称访问

# 多个容器使用同一别名 → 内置负载均衡（DNS 轮询）
docker run -d --network mynet --network-alias api myapp
docker run -d --network mynet --network-alias api myapp
docker run -d --network mynet --network-alias api myapp
# 请求 api → DNS 轮询到三个容器
```

---

## 6. 端口映射原理？

**回答：**

```
端口映射 = 通过 iptables 规则实现 NAT

docker run -p 8080:80 nginx
→ 宿主机:8080 → 容器:80

底层实现:
  iptables -t nat -A DOCKER -p tcp --dport 8080 \
    -j DNAT --to-destination 172.17.0.2:80
  iptables -A FORWARD -d 172.17.0.2/32 -p tcp --dport 80 \
    -j ACCEPT
```

```bash
# 映射方式
-p 8080:80                    # 所有接口 8080 → 容器 80
-p 127.0.0.1:8080:80          # 只绑定 loopback
-p 8080:80/udp                # UDP 端口
-p 8080-8090:80-90            # 端口范围
-P                            # 随机映射所有 EXPOSE 端口

# 查看端口映射
docker port myapp
# 80/tcp → 0.0.0.0:8080

# 查看 iptables 规则
iptables -t nat -L DOCKER -n -v

# 性能注意:
# docker-proxy (userland proxy) 默认启用
# 高性能场景禁用:
# { "userland-proxy": false }  → 纯 iptables 转发
```

---

## 7. 容器间网络隔离与通信？

**回答：**

```
同一网络 = 可通信
不同网络 = 隔离

示例:
  docker network create frontend
  docker network create backend

  docker run -d --network frontend --name web nginx
  docker run -d --network backend --name db postgres
  docker run -d --network frontend --network backend --name app myapp
  # 上面一行不可行，需要:
  docker run -d --network frontend --name app myapp
  docker network connect backend app

  # web ←→ app ✅ (同在 frontend)
  # app ←→ db  ✅ (同在 backend)
  # web ←→ db  ❌ (不同网络，隔离)
```

### 网络连接和断开

```bash
# 将容器连接到额外网络
docker network connect mynet myapp
docker network connect --ip 172.20.0.100 mynet myapp

# 断开网络
docker network disconnect mynet myapp

# 查看容器的网络信息
docker inspect -f '{{json .NetworkSettings.Networks}}' myapp | jq

# 查看网络中的容器
docker network inspect mynet -f '{{range .Containers}}{{.Name}} {{end}}'
```

---

## 8. Docker 网络排错？

**回答：**

```bash
# ===== 基本检查 =====
# 查看容器 IP
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' myapp

# 查看容器 DNS 配置
docker exec myapp cat /etc/resolv.conf

# 查看容器路由
docker exec myapp route -n
docker exec myapp ip route

# ===== 连通性测试 =====
# 从容器内 ping
docker exec myapp ping -c 3 db
docker exec myapp curl -v http://web:80

# 查看网络命名空间
docker exec myapp ip addr
docker exec myapp ss -tlnp

# ===== 使用调试容器 =====
# 很多轻量镜像没有调试工具
# 方案: 使用 nicolaka/netshoot
docker run -it --network container:myapp nicolaka/netshoot
# 共享 myapp 的网络命名空间，但有完整的网络工具:
# tcpdump, curl, dig, nslookup, iperf, ss, ip ...

# 抓包
docker exec myapp tcpdump -i eth0 -nn port 80
# 或
docker run --network container:myapp nicolaka/netshoot tcpdump -i eth0

# ===== 宿主机层面 =====
# 查看 docker 网桥
brctl show
ip link show docker0

# 查看 iptables NAT 规则
iptables -t nat -L -n -v | grep DOCKER

# 查看 veth pair 对应关系
ip link show type veth

# ===== 常见问题 =====
# 1. 容器无法上网
#    → 检查 iptables FORWARD 链是否 DROP
#    → sysctl net.ipv4.ip_forward 是否为 1

# 2. 容器名无法解析
#    → 确认使用自定义网络（默认 bridge 无 DNS）

# 3. 端口映射不通
#    → docker port 确认映射
#    → 防火墙/安全组是否放行
#    → 容器内服务是否绑定 0.0.0.0
```

---

## 9. Docker 网络与 iptables？

**回答：**

```
Docker 大量使用 iptables 规则:

nat 表:
  PREROUTING → DOCKER 链 → 端口映射 (DNAT)
  POSTROUTING → MASQUERADE → 容器访问外网时 SNAT

filter 表:
  FORWARD → DOCKER-USER → 用户自定义规则
  FORWARD → DOCKER → Docker 管理的转发规则
```

```bash
# 查看 Docker 创建的所有 iptables 规则
iptables-save | grep -i docker

# DOCKER-USER 链 — 用户自定义规则（推荐）
# Docker 不会修改此链的规则
iptables -I DOCKER-USER -i eth0 -s 192.168.1.0/24 -j ACCEPT
iptables -I DOCKER-USER -i eth0 -j DROP  # 默认拒绝外部

# 注意事项:
#   1. 不要直接修改 DOCKER 链 — Docker 会重建
#   2. 使用 DOCKER-USER 添加自定义规则
#   3. { "iptables": false } 可禁止 Docker 管理 iptables
#      但需要手动配置所有网络规则
#   4. 防火墙 (ufw/firewalld) 可能与 Docker iptables 冲突

# Docker + UFW 冲突解决:
# Docker 绕过 UFW 直接插入 iptables 规则
# 解决: 修改 /etc/docker/daemon.json
# { "iptables": false }
# 或使用 DOCKER-USER 链限制
```

---

## 10. Docker 网络性能优化？

**回答：**

```
性能对比（相对原生网络）:

  host 模式     → ~100%  (无开销)
  macvlan       → ~98%   (接近原生)
  bridge (默认) → ~90%   (NAT + 用户空间代理)
  overlay       → ~80%   (VXLAN 封装/解封装)

优化策略:

1. 禁用 userland-proxy
   /etc/docker/daemon.json:
   { "userland-proxy": false }
   → 使用纯 iptables 转发，减少一层代理

2. 高性能场景用 host 模式
   docker run --network host myapp
   → 零网络开销

3. MTU 优化
   docker network create --opt com.docker.network.driver.mtu=9000 mynet
   → 支持 Jumbo Frame 的环境

4. Overlay 网络加密控制
   docker network create --driver overlay \
     --opt encrypted myoverlay    # 启用 IPSec 加密
   → 安全但有 ~30% 性能开销
   → 内网环境可不加密

5. DNS 缓存
   → 大量 DNS 解析时，容器内运行 dnsmasq 缓存

6. 连接数优化
   → 调整容器和宿主机的 conntrack 表大小:
   sysctl -w net.netfilter.nf_conntrack_max=1048576
```
