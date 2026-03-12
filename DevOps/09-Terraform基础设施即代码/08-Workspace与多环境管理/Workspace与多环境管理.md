# Workspace 与多环境管理

---

## 1. Terraform Workspace 是什么？

**回答：**

Workspace 允许在同一套配置中维护多份独立的 State。

```bash
# 默认 workspace: default

terraform workspace list                # 列出
terraform workspace new dev             # 创建
terraform workspace new staging
terraform workspace new production
terraform workspace select production   # 切换
terraform workspace show                # 查看当前
terraform workspace delete dev          # 删除 (需先 destroy 资源)
```

```hcl
# 在代码中引用当前 workspace
locals {
  environment = terraform.workspace
}

resource "aws_instance" "web" {
  tags = {
    Environment = local.environment      # dev / staging / production
  }
}
```

```
Workspace 原理:
  terraform.tfstate.d/
  ├── dev/
  │   └── terraform.tfstate
  ├── staging/
  │   └── terraform.tfstate
  └── production/
      └── terraform.tfstate

  default workspace → terraform.tfstate (根目录)
  其他 workspace   → terraform.tfstate.d/<name>/terraform.tfstate
```

---

## 2. 基于 Workspace 的多环境配置？

**回答：**

```hcl
# locals.tf — 环境参数映射
locals {
  env = terraform.workspace

  config = {
    dev = {
      instance_type    = "t3.micro"
      instance_count   = 1
      db_instance_class = "db.t3.micro"
      multi_az         = false
      domain           = "dev.example.com"
    }
    staging = {
      instance_type    = "t3.small"
      instance_count   = 2
      db_instance_class = "db.t3.small"
      multi_az         = false
      domain           = "staging.example.com"
    }
    production = {
      instance_type    = "t3.medium"
      instance_count   = 4
      db_instance_class = "db.r6g.large"
      multi_az         = true
      domain           = "example.com"
    }
  }

  current = local.config[local.env]
}

# main.tf
resource "aws_instance" "web" {
  count         = local.current.instance_count
  instance_type = local.current.instance_type
  ami           = data.aws_ami.ubuntu.id

  tags = {
    Name        = "${local.env}-web-${count.index}"
    Environment = local.env
  }
}

resource "aws_db_instance" "main" {
  instance_class = local.current.db_instance_class
  multi_az       = local.current.multi_az
  identifier     = "${local.env}-main-db"
}
```

---

## 3. Workspace 的局限性？何时不用？

**回答：**

```
局限性:
  1. 共享同一份代码  → 不能给不同环境用不同配置文件
  2. 共享同一个 Backend → Provider 凭据相同
  3. 误操作风险      → 忘记切换 workspace 导致操作错环境
  4. 代码审查困难    → 无法在 PR 中区分环境变更
  5. 不支持不同 Provider 版本
  6. 较难实现环境间资源差异大的场景

不推荐 Workspace 的场景:
  ✗ 不同环境需要不同 Provider/Backend
  ✗ 不同环境基础设施差异很大
  ✗ 大团队需要严格的环境权限隔离
  ✗ 需要独立的 CI/CD 流程

推荐 Workspace 的场景:
  ✓ 小团队, 环境差异仅是参数 (实例大小/数量)
  ✓ 功能分支测试环境
  ✓ 快速原型
```

---

## 4. 目录结构方式管理多环境？

**回答：**

```
推荐方式: 按环境拆分目录

terraform-project/
├── modules/                    # 共享模块
│   ├── vpc/
│   ├── ec2/
│   └── rds/
├── environments/
│   ├── dev/
│   │   ├── main.tf            # 引用 modules
│   │   ├── variables.tf
│   │   ├── terraform.tfvars   # dev 参数
│   │   ├── backend.tf         # dev State 路径
│   │   └── providers.tf
│   ├── staging/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── terraform.tfvars
│   │   ├── backend.tf
│   │   └── providers.tf
│   └── production/
│       ├── main.tf
│       ├── variables.tf
│       ├── terraform.tfvars
│       ├── backend.tf
│       └── providers.tf
├── .gitignore
└── README.md
```

```hcl
# environments/dev/backend.tf
terraform {
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

# environments/dev/main.tf
module "vpc" {
  source      = "../../modules/vpc"
  environment = "dev"
  vpc_cidr    = "10.0.0.0/16"
}

module "ec2" {
  source        = "../../modules/ec2"
  environment   = "dev"
  instance_type = "t3.micro"
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = module.vpc.private_subnet_ids
}

# environments/production/main.tf
module "vpc" {
  source      = "../../modules/vpc"
  environment = "production"
  vpc_cidr    = "10.1.0.0/16"
}

module "ec2" {
  source        = "../../modules/ec2"
  environment   = "production"
  instance_type = "t3.medium"
  instance_count = 4
  vpc_id        = module.vpc.vpc_id
  subnet_ids    = module.vpc.private_subnet_ids
}
```

```bash
# 使用
cd environments/dev
terraform init
terraform plan
terraform apply

cd ../production
terraform init
terraform plan
terraform apply
```

---

## 5. Terragrunt 是什么？

**回答：**

Terragrunt 是 Terraform 的瘦封装器 (thin wrapper)，解决多环境管理、DRY 和依赖编排问题。

```
Terragrunt 解决的问题:
  1. DRY Backend — 不同环境自动生成 backend 配置
  2. DRY Provider — 共享 provider 配置
  3. 依赖管理 — 模块间依赖自动处理
  4. 多环境 — 减少重复代码
  5. 执行编排 — run-all 批量执行
```

```hcl
# terragrunt.hcl (根目录)
remote_state {
  backend = "s3"
  generate = {
    path      = "backend.tf"
    if_exists = "overwrite_terragrunt"
  }
  config = {
    bucket         = "company-terraform-state"
    key            = "${path_relative_to_include()}/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"
    encrypt        = true
  }
}

generate "provider" {
  path      = "provider.tf"
  if_exists = "overwrite_terragrunt"
  contents  = <<EOF
provider "aws" {
  region = "us-east-1"
}
EOF
}
```

```
Terragrunt 目录结构:

infrastructure/
├── terragrunt.hcl              # 根配置
├── modules/
│   ├── vpc/
│   ├── ec2/
│   └── rds/
├── dev/
│   ├── terragrunt.hcl          # include root
│   ├── vpc/
│   │   └── terragrunt.hcl
│   ├── ec2/
│   │   └── terragrunt.hcl
│   └── rds/
│       └── terragrunt.hcl
└── production/
    ├── terragrunt.hcl
    ├── vpc/
    │   └── terragrunt.hcl
    └── ...
```

```hcl
# dev/vpc/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/vpc"
}

inputs = {
  environment = "dev"
  vpc_cidr    = "10.0.0.0/16"
}

# dev/ec2/terragrunt.hcl
include "root" {
  path = find_in_parent_folders()
}

terraform {
  source = "../../modules/ec2"
}

dependency "vpc" {
  config_path = "../vpc"
}

inputs = {
  environment   = "dev"
  instance_type = "t3.micro"
  vpc_id        = dependency.vpc.outputs.vpc_id
  subnet_ids    = dependency.vpc.outputs.private_subnet_ids
}
```

```bash
# Terragrunt 命令
terragrunt plan                    # 单模块
terragrunt apply
terragrunt run-all plan            # 所有模块 (自动处理依赖)
terragrunt run-all apply
terragrunt graph-dependencies      # 显示依赖图
```

---

## 6. Workspace vs 目录结构 vs Terragrunt 对比？

**回答：**

```
                Workspace       目录结构         Terragrunt
代码重复度      低 (同一份)     中等 (main.tf)   低 (terragrunt.hcl)
Backend 隔离    自动            手动配置         自动生成
环境差异        变量映射         完全自由         inputs 配置
依赖管理        不支持           手动             dependency 声明
学习曲线        低              低               中
CI/CD 集成      简单            中               丰富
适合规模        小              中               大
权限隔离        弱 (同一 Backend) 强 (独立 Backend) 强

建议:
  个人/小项目         → Workspace
  中等团队            → 目录结构
  大型企业/复杂依赖   → Terragrunt
```

---

## 7. 跨环境引用 State？

**回答：**

```hcl
# terraform_remote_state — 读取其他项目/环境的 State

# 场景: App 项目需要引用 VPC 项目的输出
data "terraform_remote_state" "vpc" {
  backend = "s3"
  config = {
    bucket = "company-terraform-state"
    key    = "shared/vpc/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  subnet_id = data.terraform_remote_state.vpc.outputs.private_subnet_ids[0]
  vpc_security_group_ids = [
    data.terraform_remote_state.vpc.outputs.default_sg_id
  ]
}
```

```
跨 State 引用模式:

项目 A (VPC):
  output "vpc_id" { value = aws_vpc.main.id }
  output "private_subnet_ids" { value = aws_subnet.private[*].id }
  → State 存在 s3://bucket/shared/vpc/terraform.tfstate

项目 B (App):
  data "terraform_remote_state" "vpc" { ... }
  → 读取项目 A 的 outputs

注意:
  只能读取 output, 不能读取 resource 属性
  形成松耦合: 项目 A 只暴露接口 (output)
  项目 A 重构不影响 B (只要 output 不变)
```

---

## 8. .tfvars 文件管理？

**回答：**

```hcl
# terraform.tfvars — 自动加载的变量文件
aws_region    = "us-east-1"
environment   = "dev"
instance_type = "t3.micro"

# dev.tfvars — 手动指定的变量文件
# terraform plan -var-file="dev.tfvars"
aws_region    = "us-east-1"
environment   = "dev"
instance_type = "t3.micro"
instance_count = 1

# production.tfvars
aws_region     = "us-east-1"
environment    = "production"
instance_type  = "t3.medium"
instance_count = 4
multi_az       = true
```

```
变量赋值优先级 (从低到高):
  1. variable 块中的 default
  2. terraform.tfvars / terraform.tfvars.json (自动加载)
  3. *.auto.tfvars / *.auto.tfvars.json (自动加载, 按字母序)
  4. -var-file="xxx.tfvars" (命令行指定)
  5. -var="key=value" (命令行)
  6. TF_VAR_xxx 环境变量

安全:
  ✗ 不要把含密码的 .tfvars 提交 Git
  ✓ 使用 .gitignore 排除敏感 tfvars
  ✓ 敏感变量用环境变量或 Vault
```

---

## 9. 环境一致性验证？

**回答：**

```hcl
# precondition / postcondition (Terraform 1.2+)
resource "aws_instance" "web" {
  instance_type = var.instance_type
  ami           = data.aws_ami.ubuntu.id

  lifecycle {
    precondition {
      condition     = contains(["t3.micro", "t3.small", "t3.medium"], var.instance_type)
      error_message = "Instance type must be t3.micro, t3.small, or t3.medium."
    }

    postcondition {
      condition     = self.public_ip != ""
      error_message = "Instance must have a public IP."
    }
  }
}

# check block (Terraform 1.5+)
check "health_check" {
  data "http" "app_health" {
    url = "https://${aws_lb.main.dns_name}/health"
  }

  assert {
    condition     = data.http.app_health.status_code == 200
    error_message = "Application health check failed!"
  }
}

# variable validation
variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "cidr_block" {
  type = string
  validation {
    condition     = can(cidrhost(var.cidr_block, 0))
    error_message = "Must be a valid CIDR block."
  }
}
```

---

## 10. 多环境管理面试高频题？

**回答：**

```
Q: 如何管理 dev/staging/production 三套环境？
A: 推荐目录结构方式:
   1. modules/ 存放共享模块
   2. environments/{dev,staging,prod}/ 各自引用 modules
   3. 各环境独立 backend.tf (不同 State)
   4. terraform.tfvars 存放环境参数差异
   小团队可用 workspace, 大团队用 Terragrunt

Q: 如何防止误操作 production？
A: 多层防护:
   1. 独立 AWS 账号 (AWS Organizations)
   2. 不同 IAM 角色/权限
   3. CI/CD 中 production apply 需人工审批
   4. terraform plan 输出 Review
   5. prevent_destroy 保护关键资源
   6. S3 Bucket 开启版本控制 (State 可回退)

Q: Workspace 和目录结构各自优缺点？
A: Workspace: 简单, 代码不重复, 但共享 Backend, 误切风险
   目录结构: 完全隔离, 安全, 但 main.tf 有重复
   Terragrunt: 兼顾 DRY 和隔离, 但多一层工具

Q: terraform_remote_state 的替代方案？
A: 1. data source 直接查询 (data "aws_vpc")
   2. SSM Parameter Store 存储输出值
   3. Consul KV
   推荐: 简单场景用 data source, 跨团队用 remote_state

Q: 如何实现环境晋升 (dev → staging → prod)?
A: 1. 相同 module 版本 (tag/version)
   2. 不同 tfvars (参数差异)
   3. CI/CD Pipeline: dev apply → staging plan+review → prod plan+review+approve
   4. Module Registry 管理版本
```
