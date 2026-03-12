# AWS 核心计算服务

---

## 1. EC2 实例类型和选型？

**回答：**

```
EC2 实例命名规则: m5a.2xlarge
  m:   实例家族 (通用型)
  5:   代次 (第 5 代)
  a:   处理器变体 (AMD, g=Graviton)
  2xlarge: 规格大小

实例家族:
  ┌──────────┬────────┬──────────────────┬──────────────────┐
  │ 家族      │ 前缀    │ 特点             │ 适用场景          │
  ├──────────┼────────┼──────────────────┼──────────────────┤
  │ 通用型    │ t3/m5  │ 均衡 CPU/内存     │ Web, 微服务       │
  │ 计算优化  │ c5/c6g │ 高性能 CPU        │ 批处理, 编码      │
  │ 内存优化  │ r5/x1  │ 大内存            │ 数据库, 缓存      │
  │ 存储优化  │ i3/d2  │ 高 IOPS/大存储    │ 数仓, HDFS       │
  │ 加速计算  │ p4/g4  │ GPU              │ ML, 渲染         │
  │ 高性能计算│ hpc6a  │ 高吞吐网络        │ 科学计算          │
  └──────────┴────────┴──────────────────┴──────────────────┘

t3 Burstable (突发性能):
  基准 CPU 性能 + CPU 积分
  空闲时积累积分, 突发时消耗
  适合: 低 CPU 用量但偶尔需要高性能
  注意: 积分耗尽→被限制到基准 (unlimited 模式除外)

Graviton (ARM):
  m6g/c6g/r6g → AWS 自研 ARM 处理器
  比对应 x86 实例便宜约 20%, 性能相当或更好
  兼容: Java, Go, Python, Node.js 等无需修改
  注意: 部分 C/C++ 编译的软件需要 ARM 版本

规格选型建议:
  Web API:     t3.medium/m5.large (通用)
  Java 应用:    r5.large (内存优化, JVM 堆)
  CI/CD:       c5.xlarge (计算密集)
  数据库:      r5.xlarge + io1 EBS
  Redis 缓存:  r5.large (大内存)
  ML 推理:     g4dn.xlarge (GPU)
```

---

## 2. EC2 购买方式和成本对比？

**回答：**

```
购买方式:
  ┌──────────────────┬────────────┬───────────┬──────────────┐
  │ 方式              │ 承诺       │ 节省      │ 适用场景      │
  ├──────────────────┼────────────┼───────────┼──────────────┤
  │ On-Demand 按需    │ 无         │ 0%        │ 短期/不可预测 │
  │ Reserved 预留     │ 1-3年      │ 30-72%    │ 稳定基线负载  │
  │ Savings Plans    │ $/hour 承诺 │ ~66%      │ 灵活承诺      │
  │ Spot 竞价        │ 无         │ 60-90%    │ 容错型工作    │
  │ Dedicated Host   │ 可选       │ 取决于方式 │ 合规/BYOL    │
  └──────────────────┴────────────┴───────────┴──────────────┘

Reserved Instance 选项:
  付款方式:
    全预付 (All Upfront): 折扣最大
    部分预付 (Partial):   中等折扣
    无预付 (No Upfront):  折扣最小

  Standard RI: 固定实例类型, 折扣大
  Convertible RI: 可更换实例类型, 折扣小

Savings Plans:
  Compute SP: 最灵活, 承诺 $/hour, 可用于任何实例/Fargate/Lambda
  EC2 Instance SP: 限定实例家族和 Region, 折扣更大

Spot Instance 策略:
  适合: CI/CD, 批处理, 大数据, 无状态 Web
  不适合: 数据库, 有状态服务
  最佳实践:
    ✓ 使用多种实例类型分散中断风险
    ✓ 设置 Spot Fleet 自动选择最优实例
    ✓ 处理 2 分钟中断通知 (metadata endpoint)
    ✓ 配合 Auto Scaling 混合使用 On-Demand + Spot

成本优化组合 (推荐):
  基线负载: RI / Savings Plans (70% 固定)
  弹性负载: On-Demand + Auto Scaling (20%)
  容错负载: Spot (10%)
```

---

## 3. EBS 存储类型？

**回答：**

```
EBS (Elastic Block Store) 块存储:

  ┌─────────────┬──────────┬────────────┬──────────────────┐
  │ 类型         │ 代号      │ IOPS       │ 适用场景          │
  ├─────────────┼──────────┼────────────┼──────────────────┤
  │ 通用 SSD    │ gp3      │ 3000-16000 │ 大多数工作负载     │
  │ 通用 SSD    │ gp2      │ 100-16000  │ 通用 (与容量挂钩)  │
  │ 预配 SSD    │ io2      │ 最高 256000│ 数据库 (高 IOPS)  │
  │ 吞吐优化 HDD│ st1      │ 500 IOPS   │ 大数据, 日志      │
  │ 冷存储 HDD  │ sc1      │ 250 IOPS   │ 不常访问的归档    │
  └─────────────┴──────────┴────────────┴──────────────────┘

gp3 vs gp2:
  gp3: 基础 3000 IOPS + 125 MB/s, IOPS 和吞吐量可独立配置
  gp2: IOPS = 卷大小 × 3 (最小 100, 最大 16000)
  gp3 通常比 gp2 便宜 20%, 且性能可预测

EBS 快照:
  增量备份, 存储在 S3
  可跨 AZ/Region 复制
  用于: 备份, 迁移, 创建 AMI

EBS 多挂载 (Multi-Attach):
  io1/io2 支持挂载到多个 EC2 (同 AZ)
  适用: 集群化应用

EBS vs 实例存储:
  EBS: 持久化, 独立于实例生命周期, 可做快照
  实例存储: 临时, 高性能, 实例终止数据丢失
  实例存储适用: 缓存, 临时文件, shuffle 数据
```

---

## 4. AMI 和启动流程？

**回答：**

```
AMI (Amazon Machine Image) 镜像:
  包含: OS + 软件 + 配置 + EBS 快照

  AMI 类型:
    AWS 官方: Amazon Linux, Ubuntu, Windows
    社区 AMI: 社区共享
    Marketplace: 商业软件预装
    自定义 AMI: 自己创建

创建自定义 AMI:
  1. 启动基础 EC2 实例
  2. 安装和配置软件
  3. 创建 AMI (自动创建 EBS 快照)
  4. 用 AMI 启动新实例

  注意:
    ✓ AMI 区域绑定, 跨 Region 需复制
    ✓ 定期更新 AMI (安全补丁)
    ✓ 使用 Packer 自动化 AMI 构建

EC2 启动流程:
  选择 AMI
    → 选择实例类型
    → 配置: VPC/子网/IAM Role/User Data
    → 配置存储 (EBS)
    → 配置安全组
    → 选择/创建 Key Pair
    → 启动

User Data (用户数据):
  实例首次启动时执行的脚本
```

```bash
#!/bin/bash
# User Data 示例
yum update -y
yum install -y httpd
systemctl start httpd
systemctl enable httpd
echo "<h1>Hello from $(hostname)</h1>" > /var/www/html/index.html
```

```
Launch Template (启动模板):
  预定义实例配置, 用于:
    Auto Scaling Group
    Spot Fleet
    批量启动

  版本化管理, 可设置默认版本
```

---

## 5. Auto Scaling 详解？

**回答：**

```
Auto Scaling Group (ASG):

  组成:
    ┌──────────────────┐
    │ Launch Template   │ → 定义实例配置
    ├──────────────────┤
    │ Auto Scaling Group│ → 管理实例集群
    │  min: 2           │    最少 2 台
    │  desired: 4       │    期望 4 台
    │  max: 10          │    最多 10 台
    ├──────────────────┤
    │ Scaling Policy    │ → 何时扩缩
    └──────────────────┘

扩缩策略:
  ┌──────────────────┬─────────────────────────────────────┐
  │ 类型              │ 说明                                │
  ├──────────────────┼─────────────────────────────────────┤
  │ Target Tracking  │ 维持目标值                           │
  │                  │ 例: CPU 保持 60%                     │
  │                  │ ASG 自动增减实例数                    │
  ├──────────────────┼─────────────────────────────────────┤
  │ Step Scaling     │ 阶梯式                              │
  │                  │ CPU>60% +1, CPU>80% +3, CPU>95% +5  │
  ├──────────────────┼─────────────────────────────────────┤
  │ Scheduled        │ 定时                                │
  │                  │ 工作日 9:00 扩到 10 台                │
  │                  │ 晚上 22:00 缩到 2 台                 │
  ├──────────────────┼─────────────────────────────────────┤
  │ Predictive       │ 预测式 (ML)                         │
  │                  │ 基于历史模式预测流量                   │
  └──────────────────┴─────────────────────────────────────┘

  推荐: Target Tracking (最简单有效)

生命周期钩子 (Lifecycle Hooks):
  Launch:    实例启动后 → 执行初始化 → 放入服务
  Terminate: 实例终止前 → 执行清理 → 终止

  用途: 注册/注销服务发现, 日志导出, 数据备份

与 ELB 集成:
  ASG → 注册到 ALB Target Group
  新实例自动加入, 终止实例自动移除
  Health Check: ELB 健康检查失败 → ASG 替换实例

混合实例策略:
  同一 ASG 使用多种实例类型
  On-Demand base + Spot 扩展
```

---

## 6. ELB 负载均衡类型？

**回答：**

```
ELB (Elastic Load Balancer) 三种类型:

  ┌─────────────┬───────────┬───────────┬───────────────────┐
  │ 类型         │ 层级      │ 协议      │ 适用场景            │
  ├─────────────┼───────────┼───────────┼───────────────────┤
  │ ALB         │ L7        │ HTTP/HTTPS│ Web API, 微服务     │
  │ (Application│           │ gRPC      │ 基于路径/主机路由    │
  │  Load       │           │ WebSocket │                    │
  │  Balancer)  │           │           │                    │
  ├─────────────┼───────────┼───────────┼───────────────────┤
  │ NLB         │ L4        │ TCP/UDP   │ 极高性能            │
  │ (Network    │           │ TLS       │ 游戏, IoT          │
  │  Load       │           │           │ 固定 IP            │
  │  Balancer)  │           │           │                    │
  ├─────────────┼───────────┼───────────┼───────────────────┤
  │ GWLB        │ L3        │ IP        │ 防火墙/IDS 等      │
  │ (Gateway    │           │ GENEVE    │ 安全设备集成         │
  │  Load       │           │           │                    │
  │  Balancer)  │           │           │                    │
  └─────────────┴───────────┴───────────┴───────────────────┘

ALB 核心功能:
  Host-based 路由: api.example.com → API Target Group
  Path-based 路由: /api/* → API, /web/* → Web
  Header/Query 路由: 自定义条件
  固定响应: 直接返回 200/404
  重定向: HTTP → HTTPS
  认证: 集成 Cognito/OIDC
  Sticky Sessions: Cookie 粘滞

NLB vs ALB:
  NLB: 百万级 RPS, 超低延迟, 静态 IP/Elastic IP
  ALB: 功能丰富, L7 路由, 性能稍低

Target Group:
  Instances: EC2 实例
  IP addresses: 任何可达 IP (跨 VPC, 本地)
  Lambda: 无服务器函数
  ALB: NLB → ALB 链式部署

健康检查:
  协议: HTTP/HTTPS/TCP
  路径: /health
  阈值: Healthy/Unhealthy threshold
  间隔: 10-300 秒
  
  不健康的 target 自动从 LB 移除
```

---

## 7. Lambda 无服务器计算？

**回答：**

```
Lambda 核心概念:
  事件驱动的无服务器计算
  只在被触发时运行, 按调用次数和执行时间计费
  自动扩展, 无需管理服务器

触发源 (Event Sources):
  ┌─────────────────┬──────────────────────────┐
  │ 触发源           │ 场景                     │
  ├─────────────────┼──────────────────────────┤
  │ API Gateway     │ HTTP API                  │
  │ S3 Events       │ 文件上传处理 (缩略图等)    │
  │ SQS             │ 消息队列消费              │
  │ SNS             │ 通知触发                  │
  │ DynamoDB Streams│ 数据变更处理              │
  │ CloudWatch Events│ 定时任务 (cron)          │
  │ EventBridge     │ 事件总线                  │
  │ Kinesis         │ 流数据处理                │
  │ ALB             │ HTTP 负载均衡             │
  └─────────────────┴──────────────────────────┘

限制:
  执行超时:   最大 15 分钟
  内存:       128 MB ~ 10 GB (CPU 按内存比例分配)
  部署包:     50 MB 直接 / 250 MB via S3
  /tmp:       512 MB ~ 10 GB
  并发:       默认 1000/Region (可提升)
  环境变量:   4 KB

冷启动 (Cold Start):
  首次调用: 下载代码 → 初始化运行时 → 执行
  后续调用: 直接执行 (复用容器)

  冷启动时间:
    Python/Node.js: 100-500ms
    Java: 1-5s (JVM 启动慢)
    .NET: 500ms-2s

  优化冷启动:
    ✓ Provisioned Concurrency (预置并发)
    ✓ 减小部署包大小
    ✓ 使用 Lambda Layers 复用公共依赖
    ✓ 选择 Node.js/Python (启动快)
    ✓ 使用 SnapStart (Java)

Lambda@Edge / CloudFront Functions:
  在 CDN 边缘执行代码
  用于: URL 重写, 认证, A/B 测试, 动态内容
```

---

## 8. ECS 容器服务？

**回答：**

```
ECS (Elastic Container Service):

  核心概念:
    Cluster:  逻辑容器分组
    Service:  长期运行的任务, 自动恢复, 关联 LB
    Task:     一组容器的运行实例 (类似 K8s Pod)
    Task Definition: 任务定义 (类似 K8s Deployment YAML)

  启动类型:
    EC2:     自管理 EC2 实例作为容器主机
    Fargate: 无服务器容器, 无需管理实例

    EC2 vs Fargate:
    ┌──────────┬──────────────────┬──────────────────┐
    │ 维度      │ EC2 启动类型      │ Fargate          │
    ├──────────┼──────────────────┼──────────────────┤
    │ 管理      │ 管理 EC2 + 容器   │ 只管理容器        │
    │ 成本      │ 可利用 RI/Spot    │ 按任务 CPU/内存   │
    │ 控制      │ 完全控制主机      │ 无法访问主机      │
    │ GPU       │ ✓                │ 不支持 (受限)     │
    │ 大规模    │ 需管理集群        │ 自动扩展          │
    └──────────┴──────────────────┴──────────────────┘
```

```json
// Task Definition 示例
{
  "family": "my-api",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "256",
  "memory": "512",
  "containerDefinitions": [
    {
      "name": "api",
      "image": "123456789.dkr.ecr.us-east-1.amazonaws.com/my-api:latest",
      "portMappings": [
        {"containerPort": 8080, "protocol": "tcp"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/my-api",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "environment": [
        {"name": "DB_HOST", "value": "mydb.cluster-xxx.us-east-1.rds.amazonaws.com"}
      ],
      "secrets": [
        {"name": "DB_PASSWORD", "valueFrom": "arn:aws:ssm:us-east-1:123456789:parameter/db-password"}
      ]
    }
  ]
}
```

```
ECS vs EKS:
  ┌──────────┬────────────────┬────────────────┐
  │ 维度      │ ECS            │ EKS            │
  ├──────────┼────────────────┼────────────────┤
  │ 编排引擎  │ AWS 自研        │ Kubernetes     │
  │ 学习曲线  │ 低              │ 高             │
  │ 可移植性  │ AWS 锁定        │ 多云兼容       │
  │ 生态      │ AWS 原生集成    │ K8s 庞大生态   │
  │ 控制面费  │ 免费            │ $0.10/h        │
  │ 选择建议  │ 纯 AWS + 简单   │ 多云 + K8s 生态│
  └──────────┴────────────────┴────────────────┘
```

---

## 9. ECR 容器镜像仓库？

**回答：**

```
ECR (Elastic Container Registry):
  AWS 托管的 Docker 镜像仓库
  与 ECS/EKS 深度集成

基本操作:
```

```bash
# 登录 ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com

# 创建仓库
aws ecr create-repository --repository-name my-api

# 构建并推送
docker build -t my-api .
docker tag my-api:latest 123456789.dkr.ecr.us-east-1.amazonaws.com/my-api:latest
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/my-api:latest

# 列出镜像
aws ecr describe-images --repository-name my-api
```

```
特性:
  镜像扫描: 自动漏洞扫描 (CVE)
  生命周期策略: 自动清理旧镜像
  跨 Region 复制: 多区域部署
  不可变标签: 防止覆盖
  加密: 默认 AES-256 / 可选 KMS

生命周期策略示例:
  保留最近 10 个带 tag 的镜像
  删除 30 天以上的 untagged 镜像

ECR Public:
  公开仓库 (类似 Docker Hub)
  gallery.ecr.aws

与 CI/CD 集成:
  CodeBuild → 构建镜像 → 推送 ECR → ECS 部署
  GitHub Actions → docker/login-action → ECR push
```

---

## 10. 计算服务选型指南？

**回答：**

```
计算服务决策树:

  需要完全控制 OS?
    是 → EC2
    否 ↓

  是容器化应用?
    是 → 需要 K8s 生态?
         是 → EKS
         否 → 不想管服务器? → Fargate
              否 → ECS on EC2
    否 ↓

  是短时任务/事件驱动?
    是 → Lambda
    否 ↓

  是 Web 应用直接部署?
    是 → Elastic Beanstalk / App Runner
    否 → 评估具体需求

各服务定位:
  ┌──────────────────┬──────────────────────────────┐
  │ 服务              │ 适用场景                     │
  ├──────────────────┼──────────────────────────────┤
  │ EC2              │ 完全控制, 传统应用, GPU/HPC   │
  │ ECS (Fargate)    │ 容器化微服务, 纯 AWS          │
  │ EKS              │ K8s 工作负载, 多云兼容        │
  │ Lambda           │ 事件驱动, 短任务, API         │
  │ Fargate          │ 无服务器容器, 不想管节点       │
  │ App Runner       │ 简单 Web 应用快速部署         │
  │ Elastic Beanstalk│ 传统 Web 应用 PaaS           │
  │ Batch            │ 批处理作业                    │
  │ Lightsail        │ 简单 VPS, 固定价格            │
  └──────────────────┴──────────────────────────────┘

面试回答模板:
  "对于 XX 场景, 我会选择 YY, 因为:
   1. [性能/成本/运维 考量]
   2. [与其他方案的对比优势]
   3. [生产验证/最佳实践]"
```
