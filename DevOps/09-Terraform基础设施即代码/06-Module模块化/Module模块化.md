# Module 模块化

---

## 1. 什么是 Terraform Module？为什么需要模块？

**回答：**

```
Module 本质:
  一组 .tf 文件所在的目录 = 一个 Module
  根模块 (Root Module): terraform apply 执行的目录
  子模块 (Child Module): 被 module 块调用的模块

为什么需要模块:
  ✓ 代码复用     → 同一模块用于多环境
  ✓ 封装抽象     → 隐藏实现细节, 暴露简洁接口
  ✓ 团队协作     → 模块作为可共享的基础设施组件
  ✓ 一致性       → 标准化基础设施配置
  ✓ 可测试性     → 独立测试每个模块

场景:
  多个项目都需要 VPC + 子网 + 路由
  → 封装为 vpc 模块, 通过参数定制
```

---

## 2. Module 的标准目录结构？

**回答：**

```
modules/vpc/
├── main.tf           # 核心资源定义
├── variables.tf      # 输入变量
├── outputs.tf        # 输出值
├── versions.tf       # Provider 和 Terraform 版本约束
├── README.md         # 文档
├── examples/         # 用法示例
│   └── complete/
│       ├── main.tf
│       └── terraform.tfvars
└── tests/            # 测试 (Terraform 1.6+)
    └── basic.tftest.hcl
```

```hcl
# modules/vpc/variables.tf
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "public_subnet_cidrs" {
  description = "Public subnet CIDR blocks"
  type        = list(string)
  default     = []
}

variable "private_subnet_cidrs" {
  description = "Private subnet CIDR blocks"
  type        = list(string)
  default     = []
}

# modules/vpc/main.tf
resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true

  tags = {
    Name        = "${var.environment}-vpc"
    Environment = var.environment
  }
}

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.this.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.environment}-public-${count.index + 1}"
  }
}

# modules/vpc/outputs.tf
output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}
```

---

## 3. 如何调用 Module？

**回答：**

```hcl
# 调用本地模块
module "vpc" {
  source = "./modules/vpc"

  vpc_cidr             = "10.0.0.0/16"
  environment          = "production"
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnet_cidrs = ["10.0.10.0/24", "10.0.20.0/24"]
}

# 使用模块输出
resource "aws_instance" "web" {
  subnet_id = module.vpc.public_subnet_ids[0]
  # ...
}

# 调用远程模块 (Git)
module "vpc" {
  source = "git::https://github.com/company/terraform-modules.git//modules/vpc?ref=v1.2.0"
  # ...
}

# 调用 Terraform Registry 模块
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "production-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["us-east-1a", "us-east-1b"]
  # ...
}

# 调用 S3 模块
module "vpc" {
  source = "s3::https://s3-eu-west-1.amazonaws.com/my-modules/vpc.zip"
  # ...
}
```

```bash
# 初始化下载模块
terraform init

# 更新模块
terraform init -upgrade

# 查看模块依赖
terraform providers
```

---

## 4. Module 版本管理？

**回答：**

```hcl
# Registry 模块版本约束
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.0"          # 精确版本
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"         # >= 5.0, < 6.0
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = ">= 5.0, < 5.5" # 范围约束
}

# Git 模块版本 (ref)
module "vpc" {
  source = "git::https://github.com/company/modules.git//vpc?ref=v1.2.0"   # tag
}

module "vpc" {
  source = "git::https://github.com/company/modules.git//vpc?ref=main"     # branch
}

module "vpc" {
  source = "git::https://github.com/company/modules.git//vpc?ref=abc1234"  # commit
}
```

```
版本管理最佳实践:
  ✓ 生产环境锁定版本 (精确版本号或 ~>)
  ✓ 使用语义化版本 (SemVer)
  ✓ 更新模块先在 dev 测试
  ✓ .terraform.lock.hcl 提交 Git
  ✗ 不要在生产中使用 branch ref (如 main)
```

---

## 5. Module 输入输出传递？

**回答：**

```hcl
# 父模块 → 子模块 (Input)
module "app" {
  source = "./modules/app"

  vpc_id     = module.vpc.vpc_id               # 从另一个模块的输出传入
  subnet_ids = module.vpc.private_subnet_ids
  db_host    = module.database.endpoint
  environment = var.environment                 # 从根模块变量传入
}

# 子模块 → 父模块 (Output)
# modules/app/outputs.tf
output "app_url" {
  value = "https://${aws_lb.main.dns_name}"
}

# 父模块使用
output "application_url" {
  value = module.app.app_url
}

# 模块间传递链路
# vpc 模块 → outputs → app 模块 inputs → outputs → 根模块 outputs
```

```
数据流:
  根变量 (var.xxx)
    ↓
  模块输入 (module.xxx { input = ... })
    ↓
  模块内部资源
    ↓
  模块输出 (output)
    ↓
  其他模块输入 / 根输出
```

---

## 6. 多次调用同一 Module？

**回答：**

```hcl
# 同一模块, 不同实例名
module "vpc_production" {
  source      = "./modules/vpc"
  vpc_cidr    = "10.0.0.0/16"
  environment = "production"
}

module "vpc_staging" {
  source      = "./modules/vpc"
  vpc_cidr    = "10.1.0.0/16"
  environment = "staging"
}

# 使用 for_each 批量创建
variable "environments" {
  default = {
    dev = {
      cidr = "10.0.0.0/16"
      instance_type = "t3.micro"
    }
    staging = {
      cidr = "10.1.0.0/16"
      instance_type = "t3.small"
    }
    production = {
      cidr = "10.2.0.0/16"
      instance_type = "m5.large"
    }
  }
}

module "vpc" {
  for_each = var.environments
  source   = "./modules/vpc"

  vpc_cidr    = each.value.cidr
  environment = each.key
}

# 访问
module.vpc["production"].vpc_id
module.vpc["dev"].public_subnet_ids
```

---

## 7. 嵌套 Module？

**回答：**

```
目录结构:
  modules/
  ├── platform/                    # 顶层模块
  │   ├── main.tf
  │   ├── modules/
  │   │   ├── networking/          # 子模块
  │   │   │   ├── main.tf
  │   │   │   └── outputs.tf
  │   │   ├── compute/             # 子模块
  │   │   │   ├── main.tf
  │   │   │   └── outputs.tf
  │   │   └── database/            # 子模块
```

```hcl
# modules/platform/main.tf
module "networking" {
  source   = "./modules/networking"
  vpc_cidr = var.vpc_cidr
}

module "compute" {
  source     = "./modules/compute"
  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids
}

module "database" {
  source     = "./modules/database"
  vpc_id     = module.networking.vpc_id
  subnet_ids = module.networking.private_subnet_ids
}

# 根模块调用
module "platform" {
  source   = "./modules/platform"
  vpc_cidr = "10.0.0.0/16"
}
```

```
嵌套注意:
  ✗ 不要超过 3 层嵌套
  ✗ 避免循环依赖
  ✓ 保持模块接口清晰
  ✓ 扁平化优先 (能不嵌套就不嵌套)
```

---

## 8. Terraform Registry 公共模块？

**回答：**

```
Registry 地址: registry.terraform.io

常用官方模块:
  terraform-aws-modules/vpc/aws          # VPC
  terraform-aws-modules/ec2-instance/aws # EC2
  terraform-aws-modules/rds/aws          # RDS
  terraform-aws-modules/s3-bucket/aws    # S3
  terraform-aws-modules/iam/aws          # IAM
  terraform-aws-modules/eks/aws          # EKS
  terraform-aws-modules/alb/aws          # ALB
  terraform-aws-modules/security-group/aws # SG
```

```hcl
# 完整 VPC 示例 (使用 Registry 模块)
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "production"
  cidr = "10.0.0.0/16"

  azs             = ["us-east-1a", "us-east-1b", "us-east-1c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true

  tags = {
    Environment = "production"
  }
}
```

```
评估 Registry 模块:
  ✓ 下载量 / 星标
  ✓ 最近更新时间
  ✓ 维护者 (官方 vs 社区)
  ✓ 文档完整性
  ✓ 子模块列表
  ✗ 避免使用长期未更新的模块
```

---

## 9. 私有 Module Registry？

**回答：**

```
方案 1: Terraform Cloud / Enterprise
  私有 Registry, 版本管理
  组织内共享模块

方案 2: Git 仓库
  source = "git::https://github.com/company/terraform-modules.git//vpc?ref=v1.0.0"
  
  仓库结构:
  terraform-modules/
  ├── vpc/
  │   ├── main.tf
  │   ├── variables.tf
  │   └── outputs.tf
  ├── ec2/
  └── rds/

方案 3: S3 / GCS
  source = "s3::https://s3.amazonaws.com/my-modules/vpc/v1.0.0.zip"
  打包为 zip 上传

方案 4: Artifactory / Nexus
  企业级制品仓库
  可与 CI/CD 集成

方案 5: 自建 Registry
  实现 Terraform Registry Protocol
  https://developer.hashicorp.com/terraform/registry/api-docs
```

```
私有模块发布流程:
  1. 开发模块代码
  2. 编写文档和示例
  3. 编写测试 (terraform test)
  4. 语义化版本 Tag (v1.0.0)
  5. 推送到 Git / Registry
  6. CI/CD 自动验证
```

---

## 10. Module 最佳实践？

**回答：**

```
设计原则:
  ✓ 单一职责 (一个模块做一件事)
  ✓ 合理抽象 (不过度封装)
  ✓ 清晰接口 (变量 + 输出 + 文档)
  ✓ 向后兼容 (新增变量设默认值)
  ✓ 组合优于继承

命名规范:
  Registry: terraform-<PROVIDER>-<NAME>
  内部:     modules/<功能名>
  变量:     snake_case, 描述清晰
  输出:     资源类型_属性名 (vpc_id, subnet_ids)

文档:
  ✓ README.md (用途, 用法, 输入输出表)
  ✓ examples/ (完整可运行示例)
  ✓ CHANGELOG.md (版本变更)
  ✓ 使用 terraform-docs 自动生成

测试:
  ✓ terraform validate
  ✓ terraform plan (dry-run)
  ✓ terraform test (1.6+ 原生测试)
  ✓ Terratest (Go 集成测试)

避免:
  ✗ 在模块中硬编码值
  ✗ 在模块中定义 Provider (让调用者定义)
  ✗ 在模块中使用远程 Backend
  ✗ 过多输入参数 (超过 15 个考虑拆分)
  ✗ 在模块中使用 Provisioner (尽量避免)
```
