# VPC 网络架构

---

## 1. VPC 核心概念和设计？

**回答：**

```
VPC (Virtual Private Cloud):
  云中逻辑隔离的虚拟网络, 完全控制 IP 范围、路由、安全

  ┌── VPC: 10.0.0.0/16 (65536 个 IP) ──────────────┐
  │                                                  │
  │  ┌── AZ-a ──────────────┐ ┌── AZ-b ──────────┐  │
  │  │ Public:  10.0.1.0/24 │ │ Public: 10.0.11.0 │  │
  │  │ Private: 10.0.2.0/24 │ │ Private:10.0.12.0 │  │
  │  │ Data:    10.0.3.0/24 │ │ Data:   10.0.13.0 │  │
  │  └──────────────────────┘ └────────────────────┘  │
  │                                                  │
  │  ┌── AZ-c ──────────────┐                        │
  │  │ Public:  10.0.21.0/24│                        │
  │  │ Private: 10.0.22.0/24│                        │
  │  │ Data:    10.0.23.0/24│                        │
  │  └──────────────────────┘                        │
  │                                                  │
  │  Internet Gateway (IGW)                          │
  │  NAT Gateway (每个 AZ 一个)                       │
  └──────────────────────────────────────────────────┘

子网分层:
  Public Subnet:  有路由到 IGW, 实例可获取公网 IP
    → ALB, Bastion Host, NAT Gateway
  Private Subnet: 通过 NAT Gateway 访问公网
    → 应用服务器, Worker
  Data Subnet:    无公网访问
    → RDS, ElastiCache, 仅内部通信

CIDR 规划建议:
  VPC:     /16 (大) 或 /20 (中)
  子网:    /24 (251 可用 IP, AWS 保留 5 个)
  避免:    与其他 VPC 或本地网络 CIDR 重叠
```

---

## 2. 路由表和网关？

**回答：**

```
路由表 (Route Table):
  决定子网中的流量走向

Public 子网路由表:
  ┌─────────────────────┬────────────────┐
  │ Destination          │ Target         │
  ├─────────────────────┼────────────────┤
  │ 10.0.0.0/16         │ local          │  ← VPC 内部
  │ 0.0.0.0/0           │ igw-xxx        │  ← 公网走 IGW
  └─────────────────────┴────────────────┘

Private 子网路由表:
  ┌─────────────────────┬────────────────┐
  │ Destination          │ Target         │
  ├─────────────────────┼────────────────┤
  │ 10.0.0.0/16         │ local          │  ← VPC 内部
  │ 0.0.0.0/0           │ nat-xxx        │  ← 公网走 NAT
  └─────────────────────┴────────────────┘

Internet Gateway (IGW):
  VPC 连接公网的入口
  水平扩展, 高可用, AWS 管理
  Public 子网实例需要公网 IP + IGW 路由

NAT Gateway:
  让 Private 子网实例访问公网 (出站)
  不允许来自公网的入站连接
  部署在 Public 子网
  高可用: 每个 AZ 部署一个 NAT Gateway

  成本: 按小时 + 数据处理量收费
  替代: NAT Instance (EC2, 便宜但需自管理)

  注意: NAT Gateway 是常见的隐藏成本来源!
    优化: 减少跨 AZ 流量, 使用 VPC Endpoint 替代
```

---

## 3. Security Group vs NACL？

**回答：**

```
两道防火墙:

  流量路径:
    Internet → NACL (子网级) → Security Group (实例级) → 实例

对比:
  ┌──────────────────┬──────────────────┬──────────────────┐
  │ 特性              │ Security Group   │ NACL             │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ 级别              │ 实例级 (ENI)     │ 子网级            │
  │ 状态              │ 有状态           │ 无状态            │
  │ 规则类型          │ 只有 Allow       │ Allow + Deny     │
  │ 规则评估          │ 全部评估         │ 按编号顺序        │
  │ 默认入站          │ 拒绝所有         │ 允许所有          │
  │ 默认出站          │ 允许所有         │ 允许所有          │
  │ 引用其他 SG       │ ✓              │ ✗                │
  │ 返回流量          │ 自动放行         │ 需要配置出站规则   │
  └──────────────────┴──────────────────┴──────────────────┘

Security Group 有状态:
  入站允许 → 返回流量自动放行
  不需要单独配置出站规则

NACL 无状态:
  入站允许 → 仍需出站规则放行返回流量
  需要配置临时端口 (Ephemeral Ports: 1024-65535)

SG 最佳实践:
  ✓ 引用其他 SG 而非 IP
    例: App SG 引用 ALB SG (只允许来自 ALB 的流量)
  ✓ 最小权限 (只开必要端口)
  ✓ 按功能创建 SG (web-sg, app-sg, db-sg)
  ✗ 避免 0.0.0.0/0 (除公开的 LB)

典型 SG 设计:
  ALB-SG:    入站 80/443 from 0.0.0.0/0
  App-SG:    入站 8080 from ALB-SG
  DB-SG:     入站 3306 from App-SG
  Bastion-SG: 入站 22 from 办公室 IP
```

---

## 4. VPC Peering 和 Transit Gateway？

**回答：**

```
VPC 互通方案:

方案 1: VPC Peering (点对点)
  VPC A ←→ VPC B: 直接对等连接
  
  特点:
    ✓ 低延迟, 高带宽
    ✓ 跨 Region 支持
    ✗ 不支持传递路由 (A-B, B-C, A 不能通过 B 到 C)
    ✗ 不能 CIDR 重叠
    ✗ 连接数 O(n²), VPC 多时管理复杂

  适用: 少量 VPC (2-5 个) 互通

方案 2: Transit Gateway (TGW, 星型中心)
  ┌────────┐
  │ VPC A  │──┐
  ├────────┤  │
  │ VPC B  │──┤
  ├────────┤  ├── Transit Gateway (中心) ── VPN/DX → 本地
  │ VPC C  │──┤
  ├────────┤  │
  │ VPC D  │──┘
  └────────┘

  特点:
    ✓ 中心化管理, 星型拓扑
    ✓ 路由表隔离/共享
    ✓ 支持 VPN, Direct Connect
    ✓ 跨 Region Peering
    ✓ 支持多播 (Multicast)
    ✗ 成本: 按挂载 + 数据处理收费

  适用: 大规模多 VPC (5+), 混合云

方案 3: PrivateLink (服务暴露)
  将服务通过 NLB 暴露给其他 VPC/账号
  单向 (消费者-提供者), 不需要 VPC CIDR 不重叠
  适用: SaaS 服务暴露, 跨账号服务调用

对比:
  ┌──────────────┬──────────────┬──────────────┬──────────────┐
  │ 特性          │ Peering      │ TGW          │ PrivateLink  │
  ├──────────────┼──────────────┼──────────────┼──────────────┤
  │ 拓扑          │ 点对点       │ 星型中心      │ 单向暴露      │
  │ 传递路由      │ ✗           │ ✓            │ N/A          │
  │ CIDR 重叠     │ ✗           │ ✗            │ ✓            │
  │ 规模          │ 小 (1-5)    │ 大 (5+)      │ 服务间        │
  │ 成本          │ 免费 (流量)  │ 中 (挂载+流量)│ 中            │
  └──────────────┴──────────────┴──────────────┴──────────────┘
```

---

## 5. VPC Endpoint？

**回答：**

```
VPC Endpoint: 私有访问 AWS 服务 (不经过公网)

  不使用 Endpoint:
    EC2 (Private) → NAT Gateway → Internet → S3
    问题: 流量经过公网, NAT 费用, 延迟高

  使用 Endpoint:
    EC2 (Private) → VPC Endpoint → S3
    优势: 流量不出 VPC, 无 NAT 费用, 低延迟

Endpoint 类型:
  ┌──────────────────┬──────────────────┬──────────────────┐
  │ 类型              │ Gateway Endpoint │ Interface Endpoint│
  ├──────────────────┼──────────────────┼──────────────────┤
  │ 支持服务          │ S3, DynamoDB     │ 大多数 AWS 服务   │
  │ 实现方式          │ 路由表条目       │ ENI + 私有 IP     │
  │ 费用              │ 免费             │ 按小时 + 数据     │
  │ 跨 Region         │ ✗               │ ✗                │
  │ 安全组            │ ✗ (用 Endpoint  │ ✓                │
  │                  │  Policy)         │                  │
  └──────────────────┴──────────────────┴──────────────────┘

Gateway Endpoint (S3 示例):
  创建 Endpoint → 自动添加路由表条目
  路由表: pl-xxx (S3 前缀列表) → vpce-xxx
  免费!

Interface Endpoint (SSM/ECR 等):
  在子网中创建 ENI
  通过私有 DNS 解析到私有 IP
  需要启用 Private DNS

常用 Endpoint:
  Gateway: S3, DynamoDB
  Interface: ECR (dkr + api), CloudWatch Logs,
             SSM, STS, KMS, Secrets Manager

K8s/ECS 常需 Endpoint:
  ✓ ECR (拉取镜像)
  ✓ CloudWatch Logs (日志)
  ✓ S3 (ECR 镜像层)
  ✓ STS (IAM Role)
```

---

## 6. 混合云网络连接？

**回答：**

```
本地数据中心 ←→ AWS 连接方案:

1. Site-to-Site VPN
   本地 ← IPSec VPN 隧道 → AWS VPN Gateway
   
   优点: 快速部署 (分钟级), 成本低
   缺点: 带宽有限 (~1.25 Gbps), 延迟不稳定 (走公网)
   适用: 低流量, 备份通道

2. Direct Connect (DX)
   本地 ← 专线 → Direct Connect Location → AWS
   
   优点: 高带宽 (1/10/100 Gbps), 低延迟, 稳定
   缺点: 部署周期长 (数周-数月), 成本高
   适用: 大数据传输, 低延迟要求

3. DX + VPN (最佳实践)
   主通道: Direct Connect (高速稳定)
   备份:   Site-to-Site VPN (快速恢复)

架构:
  ┌──────────┐   Direct Connect   ┌──────────────────┐
  │ On-Prem  │ ══════════════════ │ AWS              │
  │ DC       │   (10 Gbps 专线)   │ Transit Gateway  │
  │          │ ────────────────── │ → VPC A          │
  │          │   VPN (备份)        │ → VPC B          │
  └──────────┘                    └──────────────────┘

Direct Connect 选项:
  Dedicated Connection: 独占 1/10/100 Gbps 端口
  Hosted Connection:    合作伙伴共享, 50Mbps-10Gbps
  Hosted VIF:           虚拟接口, 最灵活

VIF (Virtual Interface) 类型:
  Private VIF: 连接 VPC (通过 VGW 或 DX Gateway)
  Public VIF:  访问 AWS 公共服务 (S3 等, 不走公网)
  Transit VIF: 连接 Transit Gateway (多 VPC)
```

---

## 7. DNS — Route 53？

**回答：**

```
Route 53: AWS 托管 DNS 服务

路由策略:
  ┌──────────────────┬──────────────────────────────────┐
  │ 策略              │ 说明                             │
  ├──────────────────┼──────────────────────────────────┤
  │ Simple           │ 简单映射 (单个资源)                │
  │ Weighted         │ 加权路由 (流量分配, 金丝雀)        │
  │ Latency-based    │ 延迟最优 (多 Region)              │
  │ Failover         │ 主备切换 (Active-Passive DR)      │
  │ Geolocation      │ 地理位置路由 (合规, 内容本地化)    │
  │ Geoproximity     │ 地理临近度 + 偏移量               │
  │ Multi-value      │ 多值应答 (简单 LB, 最多 8 条)     │
  │ IP-based         │ 基于客户端 IP 路由                │
  └──────────────────┴──────────────────────────────────┘

健康检查:
  HTTP/HTTPS/TCP 健康检查
  失败 → 自动从 DNS 响应中移除
  可监控: Endpoint, CloudWatch Alarm, 其他健康检查

Alias 记录:
  与 AWS 资源集成: ALB, CloudFront, S3, API Gateway
  比 CNAME 优势: 支持 zone apex (example.com), 免费

Hosted Zone:
  Public:  公网 DNS 解析
  Private: VPC 内部 DNS 解析

Private DNS:
  VPC 内部服务发现
  api.internal.example.com → 私有 IP
  enableDnsHostnames + enableDnsSupport = true

Route 53 + 故障转移:
  Primary:   us-east-1 ALB (健康检查)
  Secondary: us-west-2 ALB (备用)
  健康检查失败 → 自动切到 Secondary
```

---

## 8. CDN — CloudFront？

**回答：**

```
CloudFront: AWS 全球 CDN

架构:
  Origin (源站)
    ├── S3 Bucket (静态资源)
    ├── ALB / EC2 (动态内容)
    ├── API Gateway
    └── 自定义源
         ↓
  CloudFront Distribution
    → 全球 400+ Edge Locations
         ↓
  用户 (就近访问 Edge)

核心概念:
  Distribution:    CDN 配置单元
  Origin:          源站 (S3, ALB 等)
  Behavior:        路径模式匹配 + 缓存策略
  Cache Policy:    缓存行为 (TTL, Header, Query String)
  Origin Request Policy: 转发给源站的内容

缓存策略:
  ┌──────────────────┬───────────────────────────┐
  │ 路径              │ 缓存策略                  │
  ├──────────────────┼───────────────────────────┤
  │ /static/*        │ 长缓存 (1 年), 不转发任何  │
  │ /api/*           │ 不缓存, 全部转发到源站     │
  │ /images/*        │ 缓存 1 天, 按 Accept 分   │
  │ Default (*)      │ 缓存 24h                  │
  └──────────────────┴───────────────────────────┘

安全功能:
  OAC (Origin Access Control): S3 仅允许 CloudFront 访问
  WAF:     Web 应用防火墙集成
  Shield:  DDoS 防护
  签名 URL/Cookie: 私有内容访问控制
  地理限制: 按国家允许/阻止

Lambda@Edge / CloudFront Functions:
  在边缘执行代码
  用途: URL 重写, 认证, A/B 测试, 安全头

缓存失效:
  Invalidation: 清除缓存
  推荐: 文件名带版本哈希 (app.abc123.js) 替代 Invalidation
```

---

## 9. 网络安全最佳实践？

**回答：**

```
VPC 网络安全多层防御:

  Layer 1: 边界防护
    ✓ WAF 防护 Web 攻击 (SQL注入/XSS)
    ✓ Shield 防护 DDoS
    ✓ CloudFront 隐藏源站 IP

  Layer 2: 网络隔离
    ✓ 多 VPC 隔离 (生产/开发/安全)
    ✓ 公有/私有/数据子网分层
    ✓ NACL 子网级过滤

  Layer 3: 实例级安全
    ✓ Security Group 最小权限
    ✓ 引用 SG 而非 IP
    ✓ 禁止 SSH 0.0.0.0/0 (用 SSM Session Manager)

  Layer 4: 传输加密
    ✓ HTTPS (ALB TLS 终止)
    ✓ VPC 内通信加密 (TLS)
    ✓ VPN/DX 加密

  Layer 5: 数据加密
    ✓ EBS/S3/RDS 静态加密 (KMS)
    ✓ 传输加密 (TLS)

流量监控:
  VPC Flow Logs: 记录网络流量 (accept/reject)
  → CloudWatch Logs 或 S3 存储
  → 用于: 安全审计, 故障排查, 流量分析

  Traffic Mirroring: 流量镜像 (IDS/IPS)

Zero Trust 网络:
  ✓ SSM Session Manager 替代 Bastion + SSH
  ✓ PrivateLink 替代公网访问
  ✓ IAM 认证替代网络级安全
  ✓ VPC Endpoint 替代 NAT 出公网
```

---

## 10. VPC 设计面试题？

**回答：**

```
Q: 如何设计一个生产级 VPC 架构?

A: 三层六子网架构:
  VPC CIDR: 10.0.0.0/16
  3 个 AZ × 3 层 (公有/私有/数据) = 9 个子网

  公有子网: ALB, NAT Gateway, Bastion (如需要)
  私有子网: 应用服务器, ECS/EKS 节点
  数据子网: RDS, ElastiCache, 仅内部访问

  路由:
    公有: 0.0.0.0/0 → IGW
    私有: 0.0.0.0/0 → NAT Gateway (每 AZ)
    数据: 无默认路由

  安全组: ALB → App → DB 层级引用
  VPC Endpoint: S3 (Gateway), ECR/Logs (Interface)

Q: Security Group 和 NACL 怎么配合?

A: SG 是主要防火墙 (有状态, 易管理)
   NACL 作为额外防线:
   - 阻止已知恶意 IP
   - 子网级别强制规则
   - 合规要求的显式 Deny

Q: 私有子网实例如何访问公网?

A: NAT Gateway (推荐) 或 NAT Instance
   部署在公有子网, 私有子网路由指向 NAT
   每个 AZ 一个 NAT Gateway 保证高可用

Q: 如何节省 NAT Gateway 费用?

A: 1. VPC Endpoint 替代 (S3/DynamoDB/ECR 等)
   2. 减少跨 AZ 流量
   3. 考虑 NAT Instance (小流量)
   4. 审计出站流量, 必要时才走 NAT

Q: 多 VPC 如何互通?

A: <5 VPC: VPC Peering
   ≥5 VPC: Transit Gateway (中心化)
   服务暴露: PrivateLink
```
