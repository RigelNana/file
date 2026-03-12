# IaC 基础与 Terraform 概述

---

## 1. 什么是基础设施即代码 (IaC)？

**回答：**

IaC 是将基础设施的创建、配置和管理通过代码定义并自动化的实践。

```
核心理念:
  代码即基础设施 → 用代码描述服务器/网络/存储等资源
  版本控制       → Git 管理, 变更可追踪可审计
  可重复性       → 相同代码 → 相同结果 (幂等)
  自动化         → 减少手动操作, 减少人为错误
  自文档化       → 代码即文档, 无需额外维护文档
  协作           → 通过 PR/MR 审查基础设施变更

IaC 工具分类:
  声明式:
    Terraform    → 多云 IaC (HCL 语言)
    CloudFormation → AWS 原生 (JSON/YAML)
    Pulumi       → 通用编程语言 (Python/TypeScript/Go)
    AWS CDK      → 编程语言生成 CloudFormation

  命令式:
    Ansible      → 配置管理 + 编排 (YAML)
    Chef         → 配置管理 (Ruby DSL)
    Puppet       → 配置管理 (Puppet DSL)

  Infrastructure Provisioning vs Configuration Management:
    Terraform/CloudFormation → 创建基础设施 (VM, VPC, LB)
    Ansible/Chef/Puppet      → 配置已有服务器 (安装软件)
```

---

## 2. Terraform 是什么？核心特点？

**回答：**

Terraform 是 HashiCorp 开发的开源 IaC 工具，用于安全高效地构建、变更和版本化基础设施。

```
核心特点:
  多云支持        → AWS, Azure, GCP, K8s, 阿里云... 3000+ Provider
  声明式语法      → 描述期望状态, 自动计算变更
  执行计划        → apply 前可预览变更 (plan)
  状态管理        → tfstate 记录资源映射
  资源图谱        → 自动处理依赖关系, 并行创建
  模块化          → 可复用的配置集合
  不可变基础设施   → 替换而非修改 (immutable)

HCL (HashiCorp Configuration Language):
  Terraform 专用语言, 比 JSON 更可读
  .tf 文件扩展名
  支持变量/表达式/函数/条件/循环
```

---

## 3. Terraform 与其他 IaC 工具对比？

**回答：**

| 特性 | Terraform | CloudFormation | Pulumi | Ansible |
|------|-----------|----------------|--------|---------|
| 类型 | IaC 编排 | IaC 编排 | IaC 编排 | 配置管理 |
| 语言 | HCL | JSON/YAML | Python/TS/Go | YAML |
| 多云 | ✓ 原生支持 | ✗ AWS only | ✓ | ✓ (有限) |
| 状态管理 | tfstate 文件 | AWS 管理 | Pulumi Cloud | 无状态 |
| 学习曲线 | 中 | 低 (AWS用户) | 低 (开发者) | 低 |
| 生态 | 极大 (3000+ Provider) | AWS 资源全覆盖 | 大 | 大 (模块) |
| 计划预览 | terraform plan | Change Set | pulumi preview | --check |
| 回滚 | 手动 (代码回退) | 自动 | 手动 | 手动 |
| 许可证 | BSL 1.1 (1.6+) | 免费 | 开源+商业 | GPL |

```
何时选 Terraform:
  多云/混合云环境
  需要管理非 AWS 资源 (K8s, DNS, Monitoring)
  团队已有 Terraform 经验
  需要灵活的模块化设计

何时选 CloudFormation:
  纯 AWS 环境
  需要自动回滚
  需要与 AWS 服务深度集成

何时用 Terraform + Ansible:
  Terraform → 创建 VM/VPC/RDS
  Ansible   → 配置 VM (安装软件/部署应用)
```

---

## 4. Terraform 架构与工作原理？

**回答：**

```
┌─────────────────────────────────────────────┐
│              Terraform CLI                   │
│                                             │
│  .tf files → HCL Parser → Terraform Core   │
│                              │               │
│              ┌───────────────┼────────────┐  │
│              ▼               ▼            ▼  │
│         ┌──────┐      ┌──────┐     ┌──────┐│
│         │ AWS  │      │Azure │     │ GCP  ││
│         │Plugin│      │Plugin│     │Plugin││
│         └──┬───┘      └──┬───┘     └──┬───┘│
└────────────┼─────────────┼────────────┼─────┘
             ▼             ▼            ▼
        ┌────────┐   ┌─────────┐  ┌────────┐
        │AWS API │   │Azure API│  │GCP API │
        └────────┘   └─────────┘  └────────┘

组件:
  Terraform Core   → 解析 HCL, 构建依赖图, 协调执行
  Provider Plugin  → 与云平台 API 交互的二进制插件
  State File       → 记录实际资源与配置的映射
```

### 执行流程

```
1. terraform init
   → 解析 required_providers
   → 下载 Provider 二进制插件到 .terraform/
   → 初始化 Backend (远程 State)

2. terraform plan
   → 读取 .tf 配置 (期望状态)
   → 读取 State 文件 (已知状态)
   → 通过 Provider 查询实际资源 (refresh)
   → 计算差异 → 生成执行计划
   → 显示: + 创建 / ~ 修改 / - 删除

3. terraform apply
   → 再次 plan (或使用保存的 plan)
   → 用户确认 (或 -auto-approve)
   → 按依赖图顺序执行变更
   → 并行创建无依赖的资源
   → 更新 State 文件

4. terraform destroy
   → 按依赖图逆序销毁所有资源
   → 清空 State
```

---

## 5. Terraform 安装与基本配置？

**回答：**

```bash
# 安装 (Linux)
wget https://releases.hashicorp.com/terraform/1.7.0/terraform_1.7.0_linux_amd64.zip
unzip terraform_1.7.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/
terraform version

# 安装 (macOS)
brew install terraform

# 安装 (Windows)
choco install terraform
# 或 scoop install terraform

# 版本管理 (tfenv)
brew install tfenv
tfenv install 1.7.0
tfenv use 1.7.0
tfenv list
```

```hcl
# terraform 版本约束
terraform {
  required_version = ">= 1.5.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"       # >= 5.0, < 6.0
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.0"
    }
  }
}
```

---

## 6. Terraform 核心工作流命令？

**回答：**

```bash
# 初始化
terraform init               # 下载 Provider, 初始化 Backend
terraform init -upgrade       # 升级 Provider 到最新兼容版本
terraform init -reconfigure   # 重新配置 Backend
terraform init -migrate-state # 迁移 State 到新 Backend

# 规划
terraform plan                  # 预览变更
terraform plan -out=plan.tfplan # 保存计划到文件
terraform plan -target=aws_instance.web  # 只针对特定资源
terraform plan -destroy         # 预览销毁计划

# 执行
terraform apply                 # 执行变更 (需确认)
terraform apply plan.tfplan     # 执行保存的计划
terraform apply -auto-approve   # 跳过确认 (CI/CD)
terraform apply -target=aws_instance.web  # 只变更特定资源
terraform apply -var="env=prod" # 传递变量

# 销毁
terraform destroy               # 销毁所有
terraform destroy -target=aws_instance.web  # 销毁特定资源
terraform destroy -auto-approve  # 跳过确认

# 格式化与校验
terraform fmt                   # 格式化 HCL
terraform fmt -check            # 检查格式 (CI)
terraform fmt -recursive        # 递归格式化
terraform validate              # 语法校验

# 查看
terraform show                  # 当前状态
terraform output                # 所有输出
terraform output vpc_id         # 特定输出
terraform graph                 # DOT 格式依赖图
terraform providers             # 列出使用的 Provider
```

---

## 7. Terraform 版本约束语法？

**回答：**

```hcl
# 版本号格式: MAJOR.MINOR.PATCH

# 精确版本
version = "5.0.0"

# 比较运算符
version = ">= 5.0.0"          # >= 5.0.0
version = "< 6.0.0"           # < 6.0.0
version = ">= 5.0, < 6.0"    # 范围

# 悲观约束 (~>)
version = "~> 5.0"            # >= 5.0, < 6.0 (锁定 MAJOR)
version = "~> 5.0.0"          # >= 5.0.0, < 5.1.0 (锁定 MINOR)

# 实际应用
terraform {
  required_version = "~> 1.5"   # Terraform 1.5.x - 1.x.x

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"       # AWS Provider 5.x.x
    }
  }
}
```

```
锁文件: .terraform.lock.hcl
  记录实际使用的 Provider 版本和 hash
  应提交到 Git (保证团队一致)
  terraform init -upgrade 更新锁文件
```

---

## 8. Terraform 与 OpenTofu？

**回答：**

```
背景:
  2023年8月: HashiCorp 将 Terraform 许可从 MPL 改为 BSL 1.1
  2023年9月: 社区 fork → OpenTofu (Linux Foundation 托管)

OpenTofu:
  开源替代品 (MPL 2.0 许可)
  API 兼容 Terraform (一键迁移)
  命令: tofu init / tofu plan / tofu apply
  由 Linux Foundation 管理

对比:
  Terraform (HashiCorp) → 商业支持, BSL 许可, Terraform Cloud
  OpenTofu (社区)       → 完全开源, MPL 许可, 社区驱动

迁移:
  将 terraform 命令替换为 tofu 即可
  .tf 文件和 State 格式完全兼容
```

---

## 9. Terraform 文件组织约定？

**回答：**

```
单项目文件组织:
  project/
  ├── main.tf           # 主要资源定义
  ├── variables.tf      # 变量声明
  ├── outputs.tf        # 输出值
  ├── providers.tf      # Provider 和 Backend 配置
  ├── data.tf           # Data Source
  ├── locals.tf         # 本地变量
  ├── versions.tf       # 版本约束 (或放 providers.tf)
  ├── terraform.tfvars  # 变量值 (不提交敏感)
  └── .terraform.lock.hcl  # 锁文件 (提交)

Terraform 加载顺序:
  同目录下所有 .tf 文件会被合并
  文件名不影响资源定义
  但按约定分文件提高可读性
  .tf.json 也支持 (JSON 格式)
```

---

## 10. 第一个 Terraform 项目实战？

**回答：**

```hcl
# 创建 AWS EC2 实例

# providers.tf
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "ap-northeast-1"
}

# variables.tf
variable "instance_name" {
  description = "Name tag for the EC2 instance"
  type        = string
  default     = "my-first-instance"
}

# main.tf
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"

  tags = {
    Name = var.instance_name
  }
}

# outputs.tf
output "instance_id" {
  value = aws_instance.web.id
}

output "public_ip" {
  value = aws_instance.web.public_ip
}
```

```bash
# 执行步骤
terraform init          # 下载 AWS Provider
terraform plan          # 预览: 将创建 1 个 EC2 实例
terraform apply         # 确认创建
terraform output        # 查看实例 ID 和 IP
terraform destroy       # 清理资源
```
