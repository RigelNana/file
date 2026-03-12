# IaC 与云自动化

---

## 1. IaC (基础设施即代码) 概念？

**回答：**

```
IaC: 用代码定义和管理基础设施

  传统方式: 控制台点击 / 手动操作 → 难以复现, 易出错
  IaC:      代码定义 → 版本控制 → 自动化部署 → 可重复

核心价值:
  ✓ 可重复: 一键创建相同环境 (dev/staging/prod)
  ✓ 版本控制: Git 管理, 代码审查, 变更历史
  ✓ 自动化: CI/CD 集成
  ✓ 一致性: 消除环境差异 (snowflake server)
  ✓ 文档化: 代码就是文档

声明式 vs 命令式:
  声明式 (Declarative): 定义期望状态
    → Terraform, CloudFormation, K8s YAML
    "我想要 3 台 EC2, 1 个 RDS"
    引擎自动计算如何达到目标

  命令式 (Imperative): 定义操作步骤
    → AWS CLI, Ansible, Shell Script
    "创建 EC2, 然后创建 RDS, 然后..."
    按步骤执行

  推荐: 声明式 (更安全, 幂等)

IaC 工具全景:
  ┌──────────────────┬──────────────┬──────────────────┐
  │ 工具              │ 类型         │ 特点              │
  ├──────────────────┼──────────────┼──────────────────┤
  │ Terraform        │ 声明式, HCL  │ 多云, 最流行       │
  │ CloudFormation   │ 声明式, YAML │ AWS 原生           │
  │ CDK              │ 命令式→声明式│ 编程语言写 IaC     │
  │ Pulumi           │ 编程语言     │ 多云, Type-safe    │
  │ Ansible          │ 命令式       │ 配置管理, SSH      │
  │ Crossplane       │ 声明式, K8s  │ K8s 原生, 多云     │
  └──────────────────┴──────────────┴──────────────────┘
```

---

## 2. Terraform 核心概念？

**回答：**

```
Terraform: HashiCorp 出品的多云 IaC 工具

核心概念:
  Provider:  云服务商插件 (AWS, Azure, GCP, K8s...)
  Resource:  基础设施资源 (EC2, S3, RDS...)
  Data Source: 查询已有资源
  Variable:  输入变量
  Output:    输出值
  Module:    可复用的资源组合
  State:     状态文件 (记录实际资源)

工作流:
  terraform init    → 初始化 (下载 Provider)
  terraform plan    → 预览变更 (Dry Run)
  terraform apply   → 执行变更
  terraform destroy → 销毁资源
```

```hcl
# main.tf — 基本示例
terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "prod/terraform.tfstate"
    region = "us-east-1"
    dynamodb_table = "terraform-lock"
    encrypt = true
  }
}

provider "aws" {
  region = var.region
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  tags = { Name = "${var.env}-vpc" }
}

# EC2
resource "aws_instance" "web" {
  count         = var.instance_count
  ami           = data.aws_ami.amazon_linux.id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.public[count.index].id
  
  tags = { Name = "${var.env}-web-${count.index}" }
}

# 查询最新 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]
  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }
}
```

```hcl
# variables.tf
variable "region" {
  type    = string
  default = "us-east-1"
}

variable "env" {
  type = string
}

variable "instance_type" {
  type    = string
  default = "t3.medium"
}

variable "instance_count" {
  type    = number
  default = 2
}

# outputs.tf
output "vpc_id" {
  value = aws_vpc.main.id
}

output "instance_ips" {
  value = aws_instance.web[*].public_ip
}
```

---

## 3. Terraform State 管理？

**回答：**

```
State 文件: 记录 Terraform 管理的实际资源

  作用:
    映射: HCL 代码 ←→ 实际资源 ID
    性能: 避免每次 plan 都调用 API 查询
    依赖: 记录资源间依赖关系

Remote State (远程状态):
  ✗ 本地 State: 不能团队协作, 易丢失
  ✓ 远程 State: S3 + DynamoDB (推荐)

  S3:  存储 tfstate 文件 (加密, 版本控制)
  DynamoDB: 状态锁 (防止并发修改)

State 常用操作:
```

```bash
# 查看 State 中的资源
terraform state list

# 查看某个资源详情
terraform state show aws_instance.web[0]

# 从 State 中移除 (不删除实际资源)
terraform state rm aws_instance.legacy

# 导入已有资源到 State
terraform import aws_instance.web i-1234567890

# 移动资源 (重命名)
terraform state mv aws_instance.old aws_instance.new

# 强制解锁 (谨慎)
terraform force-unlock LOCK_ID
```

```
State 最佳实践:
  ✓ 使用远程 State (S3 + DynamoDB)
  ✓ 启用加密 (encrypt = true)
  ✓ 启用版本控制 (S3 versioning)
  ✓ 状态文件按环境/项目分离
  ✓ 不要手动编辑 State 文件
  ✓ 使用 workspace 或目录分离环境

State 分离模式:
  方式 1: 目录分离 (推荐)
    environments/
    ├── prod/main.tf   → state: s3://state/prod/
    ├── staging/main.tf→ state: s3://state/staging/
    └── dev/main.tf    → state: s3://state/dev/

  方式 2: Workspace
    terraform workspace new prod
    terraform workspace select prod
    同一目录, 不同 State
```

---

## 4. Terraform Module？

**回答：**

```
Module: 可复用的 Terraform 配置包

目录结构:
  modules/
  └── vpc/
      ├── main.tf         # 资源定义
      ├── variables.tf    # 输入变量
      ├── outputs.tf      # 输出值
      └── README.md       # 文档

使用 Module:
```

```hcl
# 调用自定义 Module
module "vpc" {
  source = "./modules/vpc"
  
  vpc_cidr     = "10.0.0.0/16"
  environment  = "prod"
  azs          = ["us-east-1a", "us-east-1b", "us-east-1c"]
}

# 使用 Module 输出
resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnet_ids[0]
}

# 使用 Terraform Registry Module
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"
  
  name = "prod-vpc"
  cidr = "10.0.0.0/16"
  
  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  
  enable_nat_gateway = true
  single_nat_gateway = false  # 每 AZ 一个 NAT (HA)
}
```

```
常用社区 Module (terraform-aws-modules):
  vpc:              VPC + 子网 + NAT
  eks:              EKS 集群
  rds:              RDS 数据库
  security-group:   安全组
  alb:              应用负载均衡
  s3-bucket:        S3 桶
  iam:              IAM 角色/策略

Module 最佳实践:
  ✓ 模块化组织 (网络/计算/数据库分离)
  ✓ 使用版本锁定 (version = "~> 5.0")
  ✓ 变量有描述和类型约束
  ✓ 输出需要的值供其他模块使用
  ✓ 写 README 文档
  ✗ 模块不要太大 (保持单一职责)
```

---

## 5. CloudFormation？

**回答：**

```
CloudFormation: AWS 原生 IaC 服务

  优势: AWS 深度集成, 免费, 无需管理 State
  劣势: 只支持 AWS, YAML/JSON 冗长

核心概念:
  Stack:     一组资源的集合
  Template:  YAML/JSON 模板
  Change Set: 变更预览 (类似 terraform plan)
  StackSet:  多账号/多 Region 部署
  Nested Stack: 嵌套栈 (模块化)
```

```yaml
# CloudFormation 模板
AWSTemplateFormatVersion: '2010-09-09'
Description: Web Application Stack

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
  InstanceType:
    Type: String
    Default: t3.medium

Mappings:
  RegionAMI:
    us-east-1:
      AMI: ami-0abcdef1234567890

Resources:
  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Web SG
      VpcId: !Ref VPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0

  WebInstance:
    Type: AWS::EC2::Instance
    Properties:
      InstanceType: !Ref InstanceType
      ImageId: !FindInMap [RegionAMI, !Ref 'AWS::Region', AMI]
      SecurityGroupIds:
        - !Ref WebSecurityGroup
      Tags:
        - Key: Name
          Value: !Sub '${Environment}-web'

Outputs:
  InstanceId:
    Value: !Ref WebInstance
  PublicIP:
    Value: !GetAtt WebInstance.PublicIp
```

```
Terraform vs CloudFormation:
  ┌──────────────────┬──────────────┬──────────────┐
  │ 特性              │ Terraform    │ CloudFormation│
  ├──────────────────┼──────────────┼──────────────┤
  │ 云支持            │ 多云         │ AWS only     │
  │ 语言              │ HCL         │ YAML/JSON    │
  │ State             │ 自管理      │ AWS 管理     │
  │ Plan              │ terraform plan│ Change Set │
  │ 模块              │ Module       │ Nested Stack │
  │ 社区              │ 庞大         │ 中等         │
  │ 学习曲线          │ 中等         │ 中等         │
  │ 导入已有资源      │ ✓           │ ✓ (较新)     │
  │ Drift 检测        │ plan        │ 内置         │
  └──────────────────┴──────────────┴──────────────┘

  推荐: 多云/开源偏好 → Terraform | 纯 AWS → 两者皆可
```

---

## 6. AWS CDK？

**回答：**

```
CDK (Cloud Development Kit):
  用编程语言 (TypeScript/Python/Java/C#/Go) 编写 IaC
  编译生成 CloudFormation 模板

优势:
  ✓ 编程语言的全部能力 (循环/条件/类/继承)
  ✓ IDE 支持 (自动补全, 类型检查)
  ✓ L2/L3 Construct: 高级抽象 (合理默认值)
  ✓ 单元测试

Construct 层次:
  L1: 与 CloudFormation 1:1 映射 (CfnXxx)
  L2: 带合理默认值的高级封装 (推荐)
  L3: 完整架构模式 (如 ECS Patterns)
```

```typescript
// CDK 示例 (TypeScript)
import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as patterns from 'aws-cdk-lib/aws-ecs-patterns';

export class MyStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    // L2: VPC (自动创建公有/私有子网, NAT)
    const vpc = new ec2.Vpc(this, 'VPC', {
      maxAzs: 3,
    });

    // L3: ECS + ALB (一行代码搞定)
    new patterns.ApplicationLoadBalancedFargateService(this, 'API', {
      vpc,
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry('my-api:latest'),
      },
      desiredCount: 2,
      publicLoadBalancer: true,
    });
  }
}
```

```bash
# CDK CLI
cdk init app --language typescript  # 初始化
cdk synth                           # 生成 CFN 模板
cdk diff                            # 对比差异
cdk deploy                          # 部署
cdk destroy                         # 销毁
```

---

## 7. Terraform CI/CD 最佳实践？

**回答：**

```
GitOps 工作流:

  Developer → Git PR → Plan (CI) → Review → Merge → Apply (CD)

  ┌──────────┐  PR  ┌──────────┐ Merge ┌──────────┐
  │ Feature  │ ──→  │ Plan &   │ ──→   │ Apply    │
  │ Branch   │      │ Review   │       │ (main)   │
  └──────────┘      └──────────┘       └──────────┘

CI Pipeline:
```

```yaml
# GitHub Actions — Terraform CI/CD
name: Terraform
on:
  pull_request:
    paths: ['terraform/**']
  push:
    branches: [main]
    paths: ['terraform/**']

jobs:
  plan:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      
      - name: Terraform Init
        run: terraform init
        working-directory: terraform/
      
      - name: Terraform Format Check
        run: terraform fmt -check
        working-directory: terraform/
      
      - name: Terraform Validate
        run: terraform validate
        working-directory: terraform/
      
      - name: Terraform Plan
        run: terraform plan -no-color -out=tfplan
        working-directory: terraform/
      
      - name: Comment Plan on PR
        uses: actions/github-script@v7
        with:
          script: |
            // Post plan output as PR comment

  apply:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    environment: production  # 需要审批
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - run: terraform init && terraform apply -auto-approve
        working-directory: terraform/
```

```
安全最佳实践:
  ✓ PR 必须 Plan 通过才能 Merge
  ✓ Plan 结果作为 PR Comment
  ✓ Apply 需要审批 (Environment Protection)
  ✓ 使用 OIDC 认证 (不存储长期凭证)
  ✓ Terraform 版本锁定
  ✓ 敏感变量用 Secrets Manager

工具:
  Atlantis:    自托管 Terraform PR 自动化
  Spacelift:   SaaS Terraform 平台
  Terraform Cloud: HashiCorp 官方 SaaS
  Infracost:   成本预估 (PR 中显示成本变化)
  tfsec/trivy: 安全扫描
  checkov:     合规检查
```

---

## 8. Ansible 配置管理？

**回答：**

```
Ansible: 无代理配置管理工具 (SSH)

  Terraform vs Ansible:
    Terraform: 创建基础设施 (VPC, EC2, RDS)
    Ansible:   配置基础设施 (安装软件, 修改配置)
    通常配合使用

核心概念:
  Inventory:  主机清单
  Playbook:   任务剧本 (YAML)
  Module:     操作模块 (apt, copy, service...)
  Role:       可复用的任务集合
  Task:       单个操作
```

```yaml
# inventory.yml
all:
  children:
    webservers:
      hosts:
        web1: { ansible_host: 10.0.1.101 }
        web2: { ansible_host: 10.0.1.102 }
    databases:
      hosts:
        db1: { ansible_host: 10.0.2.101 }
```

```yaml
# playbook.yml
- name: Configure Web Servers
  hosts: webservers
  become: yes   # sudo
  vars:
    app_version: "1.2.3"
  
  tasks:
    - name: Install Nginx
      apt:
        name: nginx
        state: present
        update_cache: yes
    
    - name: Copy Nginx config
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: Restart Nginx
    
    - name: Ensure Nginx is running
      service:
        name: nginx
        state: started
        enabled: yes
  
  handlers:
    - name: Restart Nginx
      service:
        name: nginx
        state: restarted
```

```
Terraform + Ansible 协作:
  Terraform: 创建 EC2, VPC, SG
  → 输出实例 IP
  → Ansible: 配置实例 (安装软件)
  
  或: Terraform provisioner 调用 Ansible (不推荐)
  推荐: Packer 构建 AMI (Ansible 预装) + Terraform 部署
```

---

## 9. Packer 镜像构建？

**回答：**

```
Packer: HashiCorp 自动化镜像构建工具

  流程:
    Packer 配置 → 启动临时实例 → 执行 Provisioner
    → 创建镜像 (AMI) → 终止临时实例

  适用: Golden AMI, Docker 基础镜像, Vagrant Box
```

```hcl
# aws-ami.pkr.hcl
packer {
  required_plugins {
    amazon = {
      version = ">= 1.2.0"
      source  = "github.com/hashicorp/amazon"
    }
  }
}

source "amazon-ebs" "web" {
  ami_name      = "web-server-{{timestamp}}"
  instance_type = "t3.medium"
  region        = "us-east-1"
  
  source_ami_filter {
    filters = {
      name                = "al2023-ami-*-x86_64"
      root-device-type    = "ebs"
      virtualization-type = "hvm"
    }
    owners      = ["amazon"]
    most_recent = true
  }
  
  ssh_username = "ec2-user"
  
  tags = {
    Name    = "Web Server AMI"
    Builder = "Packer"
  }
}

build {
  sources = ["source.amazon-ebs.web"]
  
  provisioner "shell" {
    inline = [
      "sudo yum update -y",
      "sudo yum install -y nginx",
      "sudo systemctl enable nginx"
    ]
  }
  
  provisioner "ansible" {
    playbook_file = "ansible/web.yml"
  }
}
```

```bash
# Packer 命令
packer init .        # 初始化插件
packer validate .    # 验证配置
packer build .       # 构建镜像

# CI/CD 集成
# Git Push → Packer Build → AMI → Terraform Deploy
```

```
不可变基础设施 (Immutable Infrastructure):
  传统:   EC2 实例 → SSH → 安装/更新软件 (Mutable)
  不可变: Packer 构建新 AMI → Terraform 替换实例

  优势:
    ✓ 一致性: 所有实例来自同一 AMI
    ✓ 回滚: 切回旧 AMI
    ✓ 安全: 不需要 SSH 访问
    ✓ 可复现: 构建过程版本化
```

---

## 10. IaC 面试题？

**回答：**

```
Q: Terraform 和 CloudFormation 怎么选?
A: 多云/已有 Terraform 经验 → Terraform
   纯 AWS/CDK 偏好/不想管 State → CloudFormation/CDK
   Terraform 社区更大, 多云支持, 更灵活
   CloudFormation 无需管理 State, AWS 深度集成

Q: Terraform State 丢了怎么办?
A: 1. 从 S3 版本控制恢复
   2. terraform import 逐个导入资源
   3. terraformer 批量导入 (工具)
   预防: 远程 State + 版本控制 + 备份

Q: 如何管理多环境?
A: 1. 目录分离 (推荐): env/dev/ env/prod/
   2. Workspace: 同代码不同 State
   3. Terragrunt: 减少重复代码
   关键: 变量文件区分环境 (dev.tfvars, prod.tfvars)

Q: Terraform 如何处理 Drift (漂移)?
A: terraform plan 会检测 State vs 实际资源差异
   处理: apply 使实际资源匹配代码
   或: terraform refresh 更新 State
   预防: 不允许手动修改 IaC 管理的资源

Q: 如何安全管理 Terraform 中的密钥?
A: ✗ 明文写在 .tf 文件
   ✓ 环境变量 (TF_VAR_xxx)
   ✓ AWS Secrets Manager + data source
   ✓ Terraform Cloud Variables (Sensitive)
   ✓ SOPS + terraform-provider-sops

Q: IaC 和 GitOps 的关系?
A: GitOps: Git 作为唯一事实来源
   IaC 是 GitOps 的基础:
     代码 → Git → CI/CD → 自动部署
   K8s GitOps: ArgoCD/Flux 监听 Git → 自动同步

Q: CDK 和 Terraform 怎么选?
A: CDK: 喜欢编程语言, 纯 AWS, L3 Patterns 快速搭建
   Terraform: 多云, HCL 简洁, 生态丰富
```
