# Terraform 生产实践

---

## 1. 生产环境 State 管理？

**回答：**

```hcl
# S3 + DynamoDB Backend (AWS 标准方案)
terraform {
  backend "s3" {
    bucket         = "company-terraform-state"
    key            = "production/app/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-locks"
    encrypt        = true
    # 可选: 使用 KMS 加密
    kms_key_id     = "arn:aws:kms:us-east-1:123456789012:key/xxx"
  }
}
```

```
State 安全检查清单:
  □ 远程存储 (S3/GCS/Azure Blob), 不提交 Git
  □ 加密 (SSE-S3 / SSE-KMS / 客户端加密)
  □ 锁定 (DynamoDB / GCS / Consul)
  □ 版本控制 (S3 Versioning → 可回退)
  □ 访问控制 (IAM Policy 限制读写)
  □ 备份策略 (跨区域复制)
  □ State 文件中可能含敏感数据 (密码/密钥)

State 分离策略:
  按环境:   s3://bucket/dev/terraform.tfstate
            s3://bucket/prod/terraform.tfstate
  按组件:   s3://bucket/prod/vpc/terraform.tfstate
            s3://bucket/prod/app/terraform.tfstate
            s3://bucket/prod/rds/terraform.tfstate
  好处: 爆炸半径小, 执行速度快, 权限隔离
```

---

## 2. 资源命名与标签规范？

**回答：**

```hcl
# 标签规范 (locals 统一定义)
locals {
  common_tags = {
    Environment = var.environment
    Project     = var.project_name
    Team        = var.team
    Owner       = var.owner
    ManagedBy   = "terraform"
    Repository  = "github.com/org/infra"
    CostCenter  = var.cost_center
  }
}

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  tags = merge(local.common_tags, {
    Name = "${var.environment}-${var.project_name}-web"
    Role = "web-server"
  })
}

# 通过 default_tags 全局设置 (AWS Provider 3.x+)
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}
```

```
命名规范:
  资源名:     snake_case (aws_instance.web_server)
  标签 Name:  {env}-{project}-{role}-{index}
  示例:       prod-myapp-web-01
  
  S3:         {company}-{env}-{purpose}-{region}
  RDS:        {env}-{project}-{type}
  SG:         {env}-{project}-{role}-sg
  IAM Role:   {env}-{project}-{service}-role
```

---

## 3. 敏感数据管理？

**回答：**

```hcl
# 1. sensitive 标记
variable "db_password" {
  type      = string
  sensitive = true                  # Plan/Apply 输出中隐藏
}

output "db_endpoint" {
  value     = aws_db_instance.main.endpoint
  sensitive = true
}

# 2. 从外部获取敏感数据
# AWS Secrets Manager
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "production/db-password"
}

resource "aws_db_instance" "main" {
  password = data.aws_secretsmanager_secret_version.db_password.secret_string
}

# AWS SSM Parameter Store
data "aws_ssm_parameter" "api_key" {
  name            = "/production/api-key"
  with_decryption = true
}

# HashiCorp Vault
data "vault_generic_secret" "db" {
  path = "secret/data/production/db"
}

resource "aws_db_instance" "main" {
  password = data.vault_generic_secret.db.data["password"]
}

# 3. 随机密码生成
resource "random_password" "db" {
  length  = 32
  special = true
}

resource "aws_db_instance" "main" {
  password = random_password.db.result
}

# 存入 Secrets Manager
resource "aws_secretsmanager_secret_version" "db" {
  secret_id     = aws_secretsmanager_secret.db.id
  secret_string = random_password.db.result
}
```

```
注意:
  ✗ State 中仍然包含明文密码 (即使 sensitive=true)
  ✓ State 必须加密存储
  ✗ 不要在 .tfvars 中写密码提交 Git
  ✓ 使用外部密钥管理器 (Secrets Manager / Vault)
```

---

## 4. import 与迁移已有资源？

**回答：**

```bash
# 传统 import (需先写配置)
# 1. 先写资源配置
# main.tf:
# resource "aws_instance" "legacy" {
#   ami           = "ami-xxx"
#   instance_type = "t3.micro"
# }

# 2. 执行 import
terraform import aws_instance.legacy i-1234567890abcdef0

# 3. terraform plan → 调整配置使 plan 显示 "No changes"
```

```hcl
# import block (Terraform 1.5+ 推荐)
import {
  to = aws_instance.legacy
  id = "i-1234567890abcdef0"
}

import {
  to = aws_s3_bucket.data
  id = "my-existing-bucket"
}

# 自动生成配置 (Terraform 1.5+)
# terraform plan -generate-config-out=generated.tf
# → 自动生成资源配置文件
```

```
迁移步骤:
  1. 识别要导入的资源
  2. 编写 import block 或手写 resource 配置
  3. terraform plan -generate-config-out=generated.tf
  4. 调整生成的配置
  5. terraform plan → 确认 "No changes"
  6. 提交代码

批量导入工具:
  terraformer → 从云平台导出为 Terraform 代码
  terraforming → AWS 专用 (已停止维护)

terraform state mv:
  terraform state mv aws_instance.old aws_instance.new  # 重命名
  terraform state mv 'module.old' 'module.new'          # 移动到模块
```

---

## 5. 漂移检测 (Drift Detection)？

**回答：**

```
漂移 = 实际资源与 State/代码不一致
原因:
  手动修改 (Console 操作)
  其他工具修改
  外部事件 (Auto Scaling)
```

```bash
# 检测漂移
terraform plan                # 显示差异
terraform plan -refresh-only  # 只刷新 State, 不生成变更 (Terraform 1.1+)
terraform apply -refresh-only # 更新 State 到实际状态

# 定期漂移检测 (CI/CD 定时任务)
# .gitlab-ci.yml
drift_detection:
  stage: monitor
  script:
    - terraform init -input=false
    - terraform plan -detailed-exitcode -input=false
    # exit code: 0=无变更, 1=错误, 2=有变更(漂移)
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"   # 定时触发
  allow_failure: true
```

```hcl
# Terraform Cloud 原生漂移检测
# Workspace Settings → Health → Drift Detection
# 自动定期 plan, 检测到漂移时通知

# check block (Terraform 1.5+)
check "s3_not_public" {
  data "aws_s3_bucket_policy" "app" {
    bucket = aws_s3_bucket.app.id
  }

  assert {
    condition     = !contains(data.aws_s3_bucket_policy.app.policy, "\"*\"")
    error_message = "S3 bucket policy should not allow public access!"
  }
}
```

---

## 6. Terraform 测试？

**回答：**

```hcl
# terraform test (Terraform 1.6+)
# tests/main.tftest.hcl

variables {
  environment = "test"
  instance_type = "t3.micro"
}

run "validate_vpc" {
  command = plan

  assert {
    condition     = aws_vpc.main.cidr_block == "10.0.0.0/16"
    error_message = "VPC CIDR block is incorrect"
  }
}

run "validate_instance_type" {
  command = plan

  assert {
    condition     = aws_instance.web.instance_type == "t3.micro"
    error_message = "Instance type must be t3.micro in test"
  }
}

run "create_and_verify" {
  command = apply

  assert {
    condition     = output.vpc_id != ""
    error_message = "VPC ID should not be empty"
  }
}
```

```bash
# 执行测试
terraform test
terraform test -verbose
terraform test -filter=tests/vpc.tftest.hcl

# Terratest (Go 测试框架)
# test/vpc_test.go
```

```go
// Terratest 示例
package test

import (
    "testing"
    "github.com/gruntwork-io/terratest/modules/terraform"
    "github.com/stretchr/testify/assert"
)

func TestVPC(t *testing.T) {
    opts := &terraform.Options{
        TerraformDir: "../environments/test",
        Vars: map[string]interface{}{
            "environment": "test",
        },
    }
    defer terraform.Destroy(t, opts)
    terraform.InitAndApply(t, opts)

    vpcID := terraform.Output(t, opts, "vpc_id")
    assert.NotEmpty(t, vpcID)
}
```

---

## 7. 大规模 Terraform 管理？

**回答：**

```
State 拆分:
  单体 State → 多个小 State
  
  拆分维度:
    按环境: dev / staging / production
    按组件: networking / compute / database / monitoring
    按团队: platform / app-team-a / app-team-b

  好处:
    爆炸半径小 (一个 State 出错不影响其他)
    执行速度快 (资源少 → plan/apply 快)
    权限隔离 (不同团队管理不同 State)
    并行开发 (减少锁冲突)

Module Registry:
  私有 Registry (Terraform Cloud / Artifactory)
  版本管理: 语义化版本 (v1.0.0)

  module "vpc" {
    source  = "app.terraform.io/my-org/vpc/aws"
    version = "~> 2.0"
  }
```

```
组织架构:
  Platform Team:
    管理: networking, IAM, shared-services
    提供: Module, 标准化模板

  App Team:
    使用: Platform Team 的 Module
    管理: 应用相关资源 (EC2, ECS, Lambda)

  Security Team:
    管理: OPA/Sentinel 策略
    审查: terraform plan 变更
```

---

## 8. 常用命令速查与技巧？

**回答：**

```bash
# 初始化
terraform init                     # 初始化
terraform init -upgrade            # 升级 Provider
terraform init -migrate-state      # 迁移 Backend
terraform init -reconfigure        # 重新配置 Backend

# 计划
terraform plan                     # 预览
terraform plan -out=plan.out       # 保存计划
terraform plan -target=aws_instance.web  # 只针对特定资源
terraform plan -refresh=false      # 不刷新 State
terraform plan -destroy            # 预览销毁

# 执行
terraform apply                    # 执行
terraform apply plan.out           # 执行保存的计划
terraform apply -auto-approve      # 跳过确认 (CI/CD)
terraform apply -replace=aws_instance.web  # 强制重建资源

# 销毁
terraform destroy                  # 销毁全部
terraform destroy -target=aws_instance.web  # 销毁特定

# State
terraform state list               # 列出资源
terraform state show aws_instance.web  # 资源详情
terraform state mv old new         # 重命名
terraform state rm resource        # 移除 (不删实际资源)
terraform state pull > state.json  # 导出
terraform state push state.json    # 导入

# 格式化与验证
terraform fmt -recursive           # 格式化
terraform fmt -check               # 检查格式 (CI)
terraform validate                 # 语法验证

# 其他
terraform output                   # 查看输出
terraform output -json             # JSON 格式
terraform graph | dot -Tpng > graph.png  # 依赖图
terraform console                  # 交互式控制台
terraform force-unlock LOCK_ID     # 强制解锁
terraform taint aws_instance.web   # 标记重建 (已废弃)
terraform untaint aws_instance.web # 取消标记
```

---

## 9. .gitignore 与版本控制？

**回答：**

```gitignore
# .gitignore
# Terraform
.terraform/                    # Provider 插件目录
*.tfstate                      # State 文件
*.tfstate.*                    # State 备份
crash.log                      # 崩溃日志
crash.*.log
*.tfvars                       # 可能含敏感数据
*.tfvars.json
override.tf                    # 本地覆盖
override.tf.json
*_override.tf
*_override.tf.json

# 是否提交 .terraform.lock.hcl?
# ✓ 推荐提交 → 确保团队使用相同 Provider 版本
# .terraform.lock.hcl           # 不加入 .gitignore

# Plan 文件
*.out
plan.out
```

```
版本控制最佳实践:
  ✓ 提交: *.tf, .terraform.lock.hcl, README.md
  ✗ 不提交: .terraform/, *.tfstate, *.tfvars (含密码)
  ✓ 提交: terraform.tfvars.example (模板)
  ✓ 使用 pre-commit hooks:

# .pre-commit-config.yaml
repos:
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.88.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
      - id: terraform_tflint
      - id: terraform_docs        # 自动生成文档
```

---

## 10. 面试高频实战题总结？

**回答：**

```
Q: terraform plan 和 apply 有什么区别？
A: plan 只预览变更 (dry-run), 不修改任何资源
   apply 实际执行变更
   最佳: plan -out=file → review → apply file

Q: State 文件丢失怎么办？
A: 1. 从 S3 版本控制恢复
   2. terraform import 重新导入资源
   3. terraformer 从云平台反向生成
   预防: 远程 State + 版本控制 + 备份

Q: 两个人同时 apply 怎么办？
A: State 锁定 (DynamoDB):
   第一个人 apply → 获取锁
   第二个人 apply → 报错 "state locked"
   第一个完成 → 释放锁 → 第二个重试
   异常: terraform force-unlock LOCK_ID

Q: 如何回滚?
A: Terraform 不原生支持回滚
   方案:
   1. Git revert 代码 → terraform apply (推荐)
   2. S3 版本控制恢复旧 State (危险)
   3. 对于蓝绿部署, 切回旧环境

Q: 资源被手动修改了怎么办?
A: 1. terraform plan → 显示漂移
   2. 选择: 保留手动修改 → terraform apply -refresh-only
   3. 选择: 恢复代码定义 → terraform apply
   预防: 禁止 Console 手动操作, 只通过 Terraform

Q: count 和 for_each 选哪个?
A: for_each (推荐):
   - 删除中间元素不影响其他
   - key 有语义 (可读性)
   count:
   - 只在简单场景 (N 个相同资源)

Q: Module 版本怎么管理?
A: 1. Git Tag (v1.0.0)
   2. Terraform Registry (version = "~> 2.0")
   3. 环境晋升: dev 先用新版本, 稳定后升 prod
   4. 锁定 .terraform.lock.hcl

Q: Terraform 和 Kubernetes 怎么配合?
A: Terraform 创建 K8s 集群 (EKS/GKE/AKS)
   Terraform 可管理 K8s 资源 (kubernetes provider)
   推荐: Terraform 创建集群 → Helm/ArgoCD 管理应用
```
