# Provider 与资源管理

---

## 1. Provider 是什么？如何配置？

**回答：**

Provider 是 Terraform 与云平台/服务交互的插件，负责 API 认证和资源 CRUD。

```hcl
# Provider 声明
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"       # 注册表/组织/名称
      version = "~> 5.0"              # 版本约束
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

# Provider 配置
provider "aws" {
  region = "ap-northeast-1"
  # 认证方式 (按优先级):
  #   1. Provider 参数 (access_key/secret_key) — 不推荐
  #   2. 环境变量 (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)
  #   3. 共享凭证文件 (~/.aws/credentials)
  #   4. IAM Role (EC2/ECS/Lambda)
  #   5. AWS SSO

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Project   = "myapp"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}
```

---

## 2. 多 Provider 配置 (alias)？

**回答：**

```hcl
# 同一 Provider 多个配置 (不同区域/账号)
provider "aws" {
  region = "us-east-1"
  alias  = "us_east"               # 别名
}

provider "aws" {
  region = "eu-west-1"
  alias  = "eu_west"
}

provider "aws" {
  region = "ap-northeast-1"        # 默认 (无 alias)
}

# 使用指定 Provider
resource "aws_instance" "us_server" {
  provider      = aws.us_east       # 使用 us-east-1
  ami           = "ami-xxx"
  instance_type = "t3.micro"
}

resource "aws_instance" "eu_server" {
  provider      = aws.eu_west       # 使用 eu-west-1
  ami           = "ami-yyy"
  instance_type = "t3.micro"
}

resource "aws_instance" "default_server" {
  # 不指定 provider → 使用默认 (ap-northeast-1)
  ami           = "ami-zzz"
  instance_type = "t3.micro"
}

# 跨账号 (assume_role)
provider "aws" {
  alias  = "production"
  region = "us-east-1"
  assume_role {
    role_arn = "arn:aws:iam::123456789012:role/TerraformRole"
  }
}
```

---

## 3. Resource 资源定义？

**回答：**

```hcl
# 资源语法
resource "<PROVIDER>_<TYPE>" "<NAME>" {
  # 必需参数
  argument1 = value1

  # 可选参数
  argument2 = value2

  # 嵌套块
  nested_block {
    key = "value"
  }
}

# AWS EC2 示例
resource "aws_instance" "web" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  subnet_id              = aws_subnet.public[0].id
  vpc_security_group_ids = [aws_security_group.web.id]
  key_name               = aws_key_pair.deploy.key_name

  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }

  user_data = <<-EOF
    #!/bin/bash
    apt-get update -y
    apt-get install -y nginx
  EOF

  tags = {
    Name        = "${var.environment}-web"
    Environment = var.environment
  }
}

# AWS VPC 完整示例
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.environment}-vpc"
  }
}

resource "aws_subnet" "public" {
  count                   = length(var.availability_zones)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(aws_vpc.main.cidr_block, 8, count.index)
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.environment}-public-${count.index + 1}"
    Type = "public"
  }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${var.environment}-igw" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${var.environment}-public-rt" }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
```

---

## 4. Data Source 数据源？

**回答：**

Data Source 从已存在的资源或外部源查询数据，不创建资源。

```hcl
# 查询 AMI
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]     # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# 查询可用区
data "aws_availability_zones" "available" {
  state = "available"
}

# 查询已有 VPC
data "aws_vpc" "existing" {
  filter {
    name   = "tag:Name"
    values = ["production-vpc"]
  }
}

# 查询当前调用者身份
data "aws_caller_identity" "current" {}
# data.aws_caller_identity.current.account_id

# 查询当前区域
data "aws_region" "current" {}
# data.aws_region.current.name

# 读取本地文件
data "local_file" "config" {
  filename = "${path.module}/config.json"
}

# 渲染模板
data "template_file" "user_data" {
  template = file("${path.module}/templates/user_data.sh")
  vars = {
    environment = var.environment
    app_version = var.app_version
  }
}

# 使用 Data Source
resource "aws_instance" "web" {
  ami               = data.aws_ami.ubuntu.id
  instance_type     = "t3.micro"
  availability_zone = data.aws_availability_zones.available.names[0]
}
```

---

## 5. 资源生命周期管理 (lifecycle)？

**回答：**

```hcl
resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = var.instance_type

  lifecycle {
    # 先创建新实例再销毁旧实例 (零停机)
    create_before_destroy = true

    # 防止意外删除 (生产数据库)
    prevent_destroy = true

    # 忽略外部变更 (Auto Scaling 修改的 tags)
    ignore_changes = [
      tags,
      user_data,
      ami,          # AMI 更新不触发重建
    ]

    # 替换触发器 (当关联资源变化时替换)
    replace_triggered_by = [
      aws_security_group.web.id,
      null_resource.app_version,
    ]

    # 前置条件 (apply 前检查)
    precondition {
      condition     = var.instance_type != "t3.nano"
      error_message = "t3.nano is too small for production."
    }

    # 后置条件 (apply 后检查)
    postcondition {
      condition     = self.public_ip != ""
      error_message = "Instance must have a public IP."
    }
  }
}

# prevent_destroy 常见用途
resource "aws_rds_instance" "main" {
  identifier     = "production-db"
  engine         = "postgresql"
  instance_class = "db.r6g.large"

  lifecycle {
    prevent_destroy = true           # 防止 terraform destroy 删除数据库
  }
}
```

---

## 6. Provisioner (置备器)？

**回答：**

```hcl
# Provisioner — 在资源创建/销毁时执行命令 (不推荐, 优先用 user_data)

resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"

  # remote-exec — 在远程主机执行
  provisioner "remote-exec" {
    inline = [
      "sudo apt-get update -y",
      "sudo apt-get install -y nginx",
    ]

    connection {
      type        = "ssh"
      user        = "ubuntu"
      private_key = file("~/.ssh/id_ed25519")
      host        = self.public_ip
    }
  }

  # local-exec — 在本地执行
  provisioner "local-exec" {
    command = "echo ${self.public_ip} >> hosts.txt"
  }

  # 销毁时执行
  provisioner "local-exec" {
    when    = destroy
    command = "echo 'Instance ${self.id} destroyed' >> destroy.log"
  }

  # 失败处理
  provisioner "local-exec" {
    command    = "configure.sh ${self.public_ip}"
    on_failure = continue    # fail (默认) / continue
  }

  # file — 上传文件
  provisioner "file" {
    source      = "app.conf"
    destination = "/tmp/app.conf"

    connection {
      type        = "ssh"
      user        = "ubuntu"
      private_key = file("~/.ssh/id_ed25519")
      host        = self.public_ip
    }
  }
}
```

```
为什么不推荐 Provisioner:
  ✗ 破坏声明式模型
  ✗ 不在 State 中追踪
  ✗ 失败难处理
  ✗ 不支持 plan 预览

替代方案:
  ✓ user_data / cloud-init → 初始化脚本
  ✓ Packer                 → 预构建 AMI
  ✓ Ansible                → 配置管理
  ✓ cloud_init_config      → data source
```

---

## 7. null_resource 与 terraform_data？

**回答：**

```hcl
# null_resource — 不创建实际资源, 用于执行 provisioner 或触发器
resource "null_resource" "run_ansible" {
  triggers = {
    instance_ids = join(",", aws_instance.web[*].id)
    version      = var.app_version
  }

  provisioner "local-exec" {
    command = <<-EOT
      ansible-playbook -i '${join(",", aws_instance.web[*].public_ip)},' \
        -e "version=${var.app_version}" \
        site.yml
    EOT
  }

  depends_on = [aws_instance.web]
}

# terraform_data (Terraform 1.4+) — null_resource 的替代
resource "terraform_data" "app_deploy" {
  input = var.app_version           # triggers_replace 的替代

  triggers_replace = [
    aws_instance.web[0].id,
    var.app_version,
  ]

  provisioner "local-exec" {
    command = "deploy.sh ${self.input}"
  }
}
```

---

## 8. 资源导入 (import)？

**回答：**

```bash
# 将已有云资源纳入 Terraform 管理

# 传统方式: terraform import
# 1. 先写资源定义
resource "aws_instance" "existing" {
  # 占位, 属性稍后填充
}

# 2. 执行导入
terraform import aws_instance.existing i-1234567890abcdef0

# 3. terraform state show aws_instance.existing → 查看属性
# 4. 填充 .tf 文件中的属性值
# 5. terraform plan → 确认无变更
```

```hcl
# Terraform 1.5+ import block (声明式导入)
import {
  to = aws_instance.existing
  id = "i-1234567890abcdef0"
}

import {
  to = aws_s3_bucket.data
  id = "my-data-bucket"
}

# 执行
# terraform plan -generate-config-out=generated.tf
# 自动生成资源配置! (Terraform 1.5+)
# 检查 generated.tf 并调整
# terraform apply
```

```
导入注意事项:
  ✓ 导入前先写好资源块
  ✓ import 只导入 State, 不生成代码 (传统方式)
  ✓ 1.5+ 的 -generate-config-out 可自动生成
  ✓ 导入后必须 terraform plan 验证
  ✓ 某些属性无法导入 (密码等)
```

---

## 9. moved 块 (资源重命名/重构)？

**回答：**

```hcl
# Terraform 1.1+ moved block — 无需销毁重建即可重命名资源

# 场景 1: 资源重命名
# 旧: resource "aws_instance" "web" { ... }
# 新: resource "aws_instance" "app_server" { ... }

moved {
  from = aws_instance.web
  to   = aws_instance.app_server
}

# 场景 2: 移入模块
moved {
  from = aws_instance.web
  to   = module.compute.aws_instance.web
}

# 场景 3: count → for_each 迁移
moved {
  from = aws_instance.web[0]
  to   = aws_instance.web["web-1"]
}
moved {
  from = aws_instance.web[1]
  to   = aws_instance.web["web-2"]
}

# 场景 4: 模块重命名
moved {
  from = module.vpc
  to   = module.networking
}
```

```
moved vs state mv:
  moved block      → 代码化, 可审查, 团队共享
  terraform state mv → 命令式, 只本地生效
  推荐使用 moved block
```

---

## 10. 常用 Provider 速查？

**回答：**

```hcl
# AWS
provider "aws" {
  region  = "us-east-1"
  profile = "production"        # ~/.aws/credentials 中的 profile
}
# 常用资源: aws_instance, aws_vpc, aws_subnet, aws_security_group,
#           aws_s3_bucket, aws_rds_instance, aws_iam_role, aws_lambda_function,
#           aws_ecs_cluster, aws_eks_cluster, aws_alb

# Azure
provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
# 常用资源: azurerm_resource_group, azurerm_virtual_network,
#           azurerm_virtual_machine, azurerm_kubernetes_cluster

# GCP
provider "google" {
  project = var.project_id
  region  = "us-central1"
}
# 常用资源: google_compute_instance, google_container_cluster

# Kubernetes
provider "kubernetes" {
  config_path = "~/.kube/config"
}
# 常用资源: kubernetes_deployment, kubernetes_service, kubernetes_namespace

# Helm
provider "helm" {
  kubernetes {
    config_path = "~/.kube/config"
  }
}
# 常用资源: helm_release

# 常用工具 Provider
# random: random_id, random_password, random_string
# local: local_file, local_sensitive_file
# null: null_resource
# tls: tls_private_key, tls_self_signed_cert
# external: external (执行外部程序获取数据)
```

```
Provider 查找:
  Terraform Registry → registry.terraform.io
  搜索 Provider → 查看文档 → 复制配置
  3000+ 可用 Provider
```
