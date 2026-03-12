# Terraform 基础设施即代码 (IaC) 八股文

---

## 一、IaC 基础概念

### 1. 什么是基础设施即代码 (IaC)？

**答：** IaC 是将基础设施的创建、配置和管理通过代码来定义和自动化的实践，而非手动操作。

**优势：**
- **版本控制**：基础设施变更可追踪、可审计
- **可重复**：相同代码在任何环境都产生相同结果
- **自动化**：减少人为错误，提高效率
- **自文档化**：代码即文档
- **协作**：团队可以通过 PR 审查基础设施变更

### 2. Terraform 和 Ansible 的区别？

**答：**

| 特性 | Terraform | Ansible |
|------|-----------|---------|
| 定位 | 基础设施编排（创建/管理资源） | 配置管理（安装/配置软件） |
| 语言 | HCL (HashiCorp Configuration Language) | YAML |
| 状态管理 | 有状态文件（terraform.tfstate） | 无状态 |
| 执行方式 | 声明式，计算差异后执行 | 过程式为主，按顺序执行 |
| 擅长场景 | 创建云资源（VPC、EC2、RDS等） | 服务器配置（软件安装、文件管理） |
| 生命周期 | 管理资源的完整生命周期（创建→更新→销毁） | 主要关注配置和状态 |

**最佳组合：** Terraform 创建基础设施 → Ansible 配置服务器

---

## 二、Terraform 基础

### 3. Terraform 的工作流程是什么？

**答：**

```
terraform init    →  terraform plan    →  terraform apply    →  terraform destroy
 (初始化)           (预览变更)            (执行变更)             (销毁资源)
```

1. **init**：初始化工作目录，下载 Provider 插件
2. **plan**：比较期望状态（代码）和实际状态（state），生成执行计划
3. **apply**：执行变更，创建/修改/删除资源
4. **destroy**：销毁所有管理的资源

### 4. Terraform 的核心概念有哪些？

**答：**

| 概念 | 说明 |
|------|------|
| **Provider** | 与云平台/服务交互的插件（AWS、Azure、GCP等） |
| **Resource** | 要管理的基础设施资源（EC2、VPC、S3等） |
| **Data Source** | 从已有资源中查询数据 |
| **Variable** | 输入变量，参数化配置 |
| **Output** | 输出值，暴露资源属性 |
| **Module** | 可复用的 Terraform 配置集合 |
| **State** | 记录实际资源与配置映射关系的文件 |
| **Backend** | 存储 State 文件的位置（本地、S3 等） |

### 5. Terraform 的配置文件结构？

**答：**

```hcl
# providers.tf - Provider 配置
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

# variables.tf - 变量定义
variable "aws_region" {
  description = "AWS Region"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.micro"
}

variable "environment" {
  description = "Environment name"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

# main.tf - 资源定义
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.environment}-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.environment}-public-${count.index + 1}"
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.environment}-web"
  }
}

# data.tf - 数据源
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]  # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }
}

# outputs.tf - 输出
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "instance_public_ip" {
  description = "Public IP of web instance"
  value       = aws_instance.web.public_ip
}
```

---

## 三、State 状态管理

### 6. Terraform State 是什么？为什么重要？

**答：** State 文件 (`terraform.tfstate`) 记录了 Terraform 管理的资源与实际云资源之间的映射关系。

**重要性：**
- 知道哪些资源是 Terraform 管理的
- 记录资源属性，用于计算变更差异
- 提高性能（无需每次都查询云 API）
- 支持资源依赖关系追踪

**最佳实践：**
- **远程存储**：使用 S3 + DynamoDB 等后端，不要提交到 Git
- **状态锁定**：防止并发修改
- **加密**：State 中可能包含敏感信息

### 7. 远程 State 后端如何配置？

**答：**

```hcl
# S3 后端（AWS）
terraform {
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "env/production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"    # 状态锁
    encrypt        = true
  }
}
```

```bash
# State 常用操作
terraform state list                          # 列出所有资源
terraform state show aws_instance.web         # 查看资源详情
terraform state mv aws_instance.web aws_instance.app  # 重命名
terraform state rm aws_instance.web           # 从 State 移除（不删除实际资源）
terraform state pull                          # 拉取远程 State
terraform import aws_instance.web i-1234567890  # 导入已有资源
```

---

## 四、Modules 模块

### 8. Terraform Module 是什么？如何使用？

**答：** Module 是一组 Terraform 配置文件的集合，用于封装和复用基础设施模式。

```
modules/
└── vpc/
    ├── main.tf
    ├── variables.tf
    ├── outputs.tf
    └── README.md
```

```hcl
# modules/vpc/variables.tf
variable "vpc_cidr" {
  type = string
}
variable "environment" {
  type = string
}

# modules/vpc/main.tf
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  tags = {
    Name = "${var.environment}-vpc"
  }
}

# modules/vpc/outputs.tf
output "vpc_id" {
  value = aws_vpc.this.id
}

# 使用模块
module "vpc" {
  source      = "./modules/vpc"  # 本地模块
  vpc_cidr    = "10.0.0.0/16"
  environment = "production"
}

# 使用远程模块
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"   # Terraform Registry
  version = "5.0.0"

  name = "production-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["us-east-1a", "us-east-1b"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
  enable_nat_gateway = true
}

# 引用模块输出
resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnets[0]
}
```

---

## 五、高级特性

### 9. count 和 for_each 的区别？

**答：**

```hcl
# count：基于索引创建多个资源
resource "aws_instance" "web" {
  count         = 3
  ami           = "ami-12345678"
  instance_type = "t3.micro"
  tags = {
    Name = "web-${count.index}"     # web-0, web-1, web-2
  }
}
# 引用：aws_instance.web[0], aws_instance.web[1]

# for_each：基于 map 或 set 创建（推荐）
variable "instances" {
  default = {
    web1 = { type = "t3.micro", az = "us-east-1a" }
    web2 = { type = "t3.small", az = "us-east-1b" }
  }
}

resource "aws_instance" "web" {
  for_each      = var.instances
  ami           = "ami-12345678"
  instance_type = each.value.type
  availability_zone = each.value.az
  tags = {
    Name = each.key
  }
}
# 引用：aws_instance.web["web1"], aws_instance.web["web2"]
```

**区别：**
- `count` 使用索引，删除中间元素会导致后续资源重建
- `for_each` 使用 key，删除某个元素不影响其他资源（推荐）

### 10. Terraform 的生命周期管理？

**答：**

```hcl
resource "aws_instance" "web" {
  ami           = "ami-12345678"
  instance_type = "t3.micro"

  lifecycle {
    create_before_destroy = true    # 先创建新的再删除旧的
    prevent_destroy       = true    # 防止意外删除
    ignore_changes        = [tags]  # 忽略特定属性的变更

    # 替换触发器
    replace_triggered_by = [
      aws_security_group.web.id
    ]
  }
}
```

### 11. Terraform Workspace 是什么？

**答：** Workspace 用于在同一配置中管理多个环境的 State。

```bash
terraform workspace list                # 列出工作区
terraform workspace new staging         # 创建工作区
terraform workspace select production   # 切换工作区
terraform workspace show                # 当前工作区
```

```hcl
# 根据 workspace 设置变量
locals {
  environment = terraform.workspace

  instance_type = {
    dev        = "t3.micro"
    staging    = "t3.small"
    production = "t3.medium"
  }
}

resource "aws_instance" "web" {
  instance_type = local.instance_type[local.environment]
}
```

**注意：** 对于复杂项目，更推荐使用目录结构或 Terragrunt 来管理多环境。

---

## 六、常用命令与最佳实践

### 12. Terraform 常用命令速查？

**答：**

```bash
# 初始化
terraform init                # 初始化，下载 Provider
terraform init -upgrade       # 升级 Provider

# 计划和执行
terraform plan               # 预览变更
terraform plan -out=plan.out  # 保存计划
terraform apply plan.out      # 执行保存的计划
terraform apply -auto-approve # 自动确认（CI/CD中使用）

# 销毁
terraform destroy            # 销毁所有资源
terraform destroy -target=aws_instance.web  # 销毁特定资源

# 格式化和验证
terraform fmt                # 格式化代码
terraform fmt -check         # 检查格式（CI中使用）
terraform validate           # 验证配置语法

# 查看
terraform show               # 显示当前状态
terraform output             # 查看输出值
terraform graph | dot -Tpng > graph.png  # 生成依赖图
```

### 13. Terraform 最佳实践有哪些？

**答：**

1. **远程 State**：使用 S3/GCS + 锁定（DynamoDB），不提交 State 到 Git
2. **模块化**：复用模块，避免重复代码
3. **变量化**：不硬编码，使用 variables
4. **环境隔离**：不同环境使用不同 State 文件
5. **版本锁定**：锁定 Provider 和 Module 版本
6. **代码审查**：`terraform plan` 的输出要 Review
7. **`.gitignore`**：忽略 `.terraform/`、`*.tfstate`、`*.tfstate.backup`
8. **命名规范**：资源名使用下划线，标签使用一致格式
9. **最小权限**：Terraform 使用的 IAM 角色只赋予必要权限
10. **自动化**：在 CI/CD 中运行 `plan` 和 `apply`

```gitignore
# .gitignore
.terraform/
*.tfstate
*.tfstate.*
*.tfvars       # 可能包含敏感信息
.terraform.lock.hcl  # 根据团队决定是否提交
```

### 14. Terraform 项目的推荐目录结构？

**答：**

```
terraform-project/
├── modules/                    # 可复用模块
│   ├── vpc/
│   ├── ec2/
│   └── rds/
├── environments/               # 按环境划分
│   ├── dev/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   └── backend.tf
│   ├── staging/
│   └── production/
├── .gitignore
└── README.md
```
