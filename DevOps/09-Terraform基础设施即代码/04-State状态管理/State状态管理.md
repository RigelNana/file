# State 状态管理

---

## 1. Terraform State 是什么？为什么重要？

**回答：**

State 文件 (`terraform.tfstate`) 是 Terraform 的核心，记录代码中定义的资源与实际云资源之间的映射关系。

```
State 的作用:
  资源映射     → 知道 aws_instance.web 对应哪个 EC2 (i-xxx)
  差异计算     → 对比 State 和 .tf 配置, 计算需要的变更
  性能优化     → 缓存资源属性, 减少 API 调用
  依赖追踪     → 记录资源间的依赖关系
  元数据存储   → Provider 配置, 资源 ID 等

State 文件内容 (JSON):
  {
    "version": 4,
    "terraform_version": "1.7.0",
    "resources": [
      {
        "type": "aws_instance",
        "name": "web",
        "provider": "provider[\"registry.terraform.io/hashicorp/aws\"]",
        "instances": [
          {
            "attributes": {
              "id": "i-1234567890abcdef0",
              "ami": "ami-xxx",
              "public_ip": "54.x.x.x",
              ...
            }
          }
        ]
      }
    ]
  }

风险:
  State 可能包含敏感信息 (密码, 密钥)
  State 损坏 = 灾难性后果
  并发修改 State = 数据不一致
```

---

## 2. 本地 State vs 远程 State？

**回答：**

```
本地 State (默认):
  文件: ./terraform.tfstate
  适用: 个人学习, 单人项目
  问题:
    ✗ 无法团队协作 (多人同时修改)
    ✗ 无状态锁 (并发冲突)
    ✗ 提交 Git = 泄露敏感信息
    ✗ 本地丢失 = 状态丢失

远程 State (推荐):
  存储: S3, GCS, Azure Blob, Terraform Cloud
  优势:
    ✓ 团队共享 State
    ✓ 状态锁定 (DynamoDB)
    ✓ 加密存储
    ✓ 版本控制 (S3 versioning)
    ✓ 自动备份
```

---

## 3. S3 远程 Backend 配置？

**回答：**

```hcl
# 步骤 1: 创建 S3 Bucket 和 DynamoDB (手动或单独 Terraform)
resource "aws_s3_bucket" "terraform_state" {
  bucket = "mycompany-terraform-state"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"                    # 版本控制 (可恢复旧 State)
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"           # 加密
    }
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket                  = aws_s3_bucket.terraform_state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_dynamodb_table" "terraform_locks" {
  name         = "terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# 步骤 2: 配置 Backend
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "production/networking/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-locks"     # 状态锁
    encrypt        = true
  }
}
```

```bash
# 迁移本地 State 到远程
terraform init -migrate-state

# 重新配置 Backend
terraform init -reconfigure
```

---

## 4. 状态锁定 (State Locking)？

**回答：**

```
作用:
  防止多人同时执行 terraform apply
  使用 DynamoDB (AWS) / GCS (GCP) 实现分布式锁

流程:
  1. terraform apply 开始
  2. 尝试获取锁 (写入 DynamoDB)
  3. 成功 → 继续执行
  4. 失败 → 提示 "Error acquiring the state lock"
  5. 执行完成 → 释放锁

手动解锁 (谨慎):
  terraform force-unlock <LOCK_ID>
  # 只在锁未自动释放时使用 (如执行中断)
```

```
并发场景:
  用户A: terraform apply → 获取锁 → 执行中
  用户B: terraform apply → 等待锁 → 超时失败
  用户A: 完成 → 释放锁
  用户B: 重试 → 获取锁 → 执行

CI/CD 中:
  同一环境的 apply 不应并行
  使用 CI/CD 锁或串行队列
```

---

## 5. State 常用操作命令？

**回答：**

```bash
# 列出所有资源
terraform state list
# aws_instance.web
# aws_vpc.main
# module.networking.aws_subnet.public[0]

# 查看资源详情
terraform state show aws_instance.web
# id = "i-1234567890"
# ami = "ami-xxx"
# instance_type = "t3.micro"
# public_ip = "54.x.x.x"

# 资源重命名 (State 中)
terraform state mv aws_instance.web aws_instance.app

# 模块内移动
terraform state mv aws_instance.web module.compute.aws_instance.web

# 从 State 移除 (不删除实际资源)
terraform state rm aws_instance.web
# 场景: 不再由 Terraform 管理, 但保留资源

# 拉取远程 State 到本地
terraform state pull > state.json

# 推送本地 State 到远程 (危险)
terraform state push state.json

# 替换 Provider
terraform state replace-provider hashicorp/aws registry.custom.com/aws

# 刷新 State (同步实际状态)
terraform apply -refresh-only
# Terraform 1.5 之前: terraform refresh (已废弃)
```

---

## 6. 资源导入到 State (import)？

**回答：**

```bash
# 场景: 手动创建的资源要纳入 Terraform 管理

# 传统方式
# 1. 写资源定义
resource "aws_instance" "legacy" {
  ami           = "ami-xxx"
  instance_type = "t3.micro"
}

# 2. 导入
terraform import aws_instance.legacy i-1234567890abcdef0

# 3. 检查匹配
terraform plan   # 应该无变更

# 常见资源导入 ID 格式
terraform import aws_vpc.main vpc-xxx
terraform import aws_subnet.public subnet-xxx
terraform import aws_security_group.web sg-xxx
terraform import aws_s3_bucket.data my-bucket-name
terraform import aws_iam_role.app my-role-name
terraform import aws_rds_instance.db my-database
terraform import aws_route53_record.www Z123_example.com_A  # zone_id_name_type
```

```hcl
# Terraform 1.5+ 声明式导入
import {
  to = aws_instance.legacy
  id = "i-1234567890abcdef0"
}

# 自动生成配置
# terraform plan -generate-config-out=imported.tf
```

---

## 7. State 隔离策略？

**回答：**

```
方式 1: 文件路径隔离 (推荐)

  s3://terraform-state/
  ├── networking/terraform.tfstate       # 网络层
  ├── database/terraform.tfstate         # 数据库层
  ├── application/terraform.tfstate      # 应用层
  ├── dev/terraform.tfstate              # 开发环境
  ├── staging/terraform.tfstate          # 预发布
  └── production/terraform.tfstate       # 生产环境

  backend "s3" {
    key = "production/networking/terraform.tfstate"
  }

方式 2: Workspace 隔离

  terraform workspace new dev
  terraform workspace new production
  # State: env:/dev/terraform.tfstate
  # State: env:/production/terraform.tfstate

方式 3: 独立 Backend (高隔离)

  不同环境用不同 S3 Bucket
  不同环境用不同 AWS Account
  最高安全隔离

推荐:
  小项目: Workspace
  中项目: 同 Bucket 不同 Key
  大项目: 不同 Account + 不同 Bucket
```

---

## 8. 跨 State 引用 (terraform_remote_state)？

**回答：**

```hcl
# 场景: 网络层和应用层分开管理, 应用层需要引用网络层的 VPC ID

# 网络层 (networking/)
output "vpc_id" {
  value = aws_vpc.main.id
}

output "public_subnet_ids" {
  value = aws_subnet.public[*].id
}

# 应用层 (application/)
data "terraform_remote_state" "networking" {
  backend = "s3"
  config = {
    bucket = "mycompany-terraform-state"
    key    = "production/networking/terraform.tfstate"
    region = "us-east-1"
  }
}

resource "aws_instance" "web" {
  subnet_id = data.terraform_remote_state.networking.outputs.public_subnet_ids[0]
  vpc_security_group_ids = [aws_security_group.web.id]
}

resource "aws_security_group" "web" {
  vpc_id = data.terraform_remote_state.networking.outputs.vpc_id
}
```

```
terraform_remote_state 的替代:
  Data Source 直接查询:
    data "aws_vpc" "main" {
      filter {
        name   = "tag:Name"
        values = ["production-vpc"]
      }
    }
  
  优点: 不依赖 State 文件位置
  缺点: 需要唯一标识 (tag 等)
```

---

## 9. State 灾难恢复？

**回答：**

```
预防措施:
  ✓ S3 版本控制 (恢复旧 State)
  ✓ DynamoDB 锁 (防止并发)
  ✓ 定期备份 State
  ✓ State 变更前手动备份

恢复场景:

场景 1: State 文件损坏
  方案: 从 S3 版本历史恢复
  aws s3api list-object-versions --bucket my-state-bucket --prefix production/
  aws s3api get-object --bucket my-state-bucket --key production/terraform.tfstate --version-id xxx restored.tfstate

场景 2: State 与实际不一致
  方案: terraform apply -refresh-only
  刷新 State 使其与实际资源同步

场景 3: State 丢失
  方案: 重新导入所有资源
  terraform import aws_vpc.main vpc-xxx
  terraform import aws_instance.web i-xxx
  (最坏情况, 逐个导入)

场景 4: 误删资源 (terraform destroy)
  方案: 从备份恢复 State + 从快照恢复资源
  或: 重新 terraform apply (如果代码还在)
```

---

## 10. State 管理最佳实践？

**回答：**

```
存储:
  ✓ 远程 Backend (S3/GCS/Azure Blob)
  ✓ 启用加密 (SSE-KMS)
  ✓ 启用版本控制
  ✓ 启用状态锁 (DynamoDB)
  ✗ 不要提交 State 到 Git
  ✗ 不要手动编辑 State 文件

.gitignore:
  *.tfstate
  *.tfstate.*
  .terraform/

隔离:
  ✓ 不同环境不同 State
  ✓ 不同层级不同 State (网络/数据库/应用)
  ✓ 大项目拆分为多个小项目

安全:
  ✓ State 访问权限最小化 (IAM)
  ✓ 加密存储
  ✓ 审计访问日志 (CloudTrail)
  ✓ sensitive 输出标记敏感数据

操作:
  ✓ 使用 terraform state mv 替代删除重建
  ✓ 使用 moved block 代码化重构
  ✓ 使用 -refresh-only 同步状态
  ✓ 重要操作前 terraform state pull 备份
  ✗ 避免 terraform state push (除非恢复)
  ✗ 避免 force-unlock (除非确认无其他执行)
```
