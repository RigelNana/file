# IaC 与配置管理八股文

---

## 一、IaC 基础概念

### 1. 什么是基础设施即代码（Infrastructure as Code）？

**答：**

```
IaC 定义：
  通过代码（而非手动操作）来管理和配置
  基础设施资源的实践方法。

核心理念：
  基础设施 = 代码 = 可版本控制 = 可审计 = 可重复

IaC 的价值：
  ┌────────────────┬────────────────────┐
  │ 传统手动操作    │ IaC 方式            │
  ├────────────────┼────────────────────┤
  │ 手工登录控制台  │ 代码声明资源         │
  │ 配置漂移       │ 一致性保证           │
  │ 不可重复       │ 完全可重复           │
  │ 无审计         │ Git 版本历史         │
  │ 速度慢         │ 分钟级批量操作       │
  │ 人为错误多     │ 自动化减少错误       │
  └────────────────┴────────────────────┘

两种方法：
  声明式（Declarative）：描述期望状态
    代表：Terraform, CloudFormation, Pulumi
    优点：幂等性、自动计算差异
    
  命令式（Imperative）：描述执行步骤
    代表：Ansible, Shell 脚本
    优点：灵活、适合复杂逻辑
```

### 2. Terraform 的核心概念有哪些？

**答：**

```
Terraform 核心概念：

1. Provider（提供商）
   连接云平台的插件（AWS/GCP/Azure/K8s）

2. Resource（资源）
   基础设施的基本单元

3. Data Source（数据源）
   查询已有资源信息

4. State（状态）
   记录资源当前状态的文件

5. Plan（计划）
   预览变更内容

6. Apply（应用）
   执行变更

7. Module（模块）
   可复用的资源组合
```

```hcl
# Terraform 示例
provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "web" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.medium"
  
  tags = {
    Name        = "web-server"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

# 模块调用
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.0.0"
  
  name = "production-vpc"
  cidr = "10.0.0.0/16"
}
```

---

## 二、配置管理

### 3. Ansible 的核心概念和工作原理？

**答：**

```
Ansible 核心特点：
  - Agentless（无代理，通过 SSH）
  - 幂等性（多次执行结果一致）
  - YAML 声明式 Playbook
  - 推送模式（Push-based）

核心概念：
  ┌──────────┬─────────────────────────┐
  │ 概念     │ 说明                     │
  ├──────────┼─────────────────────────┤
  │ Inventory│ 主机清单                 │
  │ Playbook │ 任务剧本（YAML）         │
  │ Role     │ 可复用的任务组合         │
  │ Task     │ 单个操作                 │
  │ Module   │ 内置功能模块             │
  │ Handler  │ 条件触发的任务           │
  │ Facts    │ 主机信息收集             │
  │ Vault    │ 加密敏感数据             │
  └──────────┴─────────────────────────┘
```

```yaml
# Ansible Playbook 示例
---
- name: Configure web servers
  hosts: webservers
  become: yes
  vars:
    nginx_port: 80
    
  tasks:
    - name: Install nginx
      apt:
        name: nginx
        state: present
        update_cache: yes
    
    - name: Configure nginx
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      notify: Restart nginx
    
    - name: Ensure nginx is running
      service:
        name: nginx
        state: started
        enabled: yes
    
  handlers:
    - name: Restart nginx
      service:
        name: nginx
        state: restarted
```

### 4. Terraform 和 Ansible 各自的适用场景？

**答：**

| 维度 | Terraform | Ansible |
|------|-----------|---------|
| 定位 | 基础设施编排 | 配置管理 |
| 方法 | 声明式 | 混合（声明+命令） |
| 状态管理 | 有 State 文件 | 无状态 |
| 典型用途 | 创建 VM/VPC/RDS | 安装软件/配置系统 |
| 幂等性 | 原生支持 | 需注意模块选择 |
| 学习曲线 | HCL 语法 | YAML + Jinja2 |
| 最佳配合 | 基础设施层 | 应用配置层 |

```
推荐分工：
  Terraform：创建基础设施
    VM → VPC → 安全组 → 负载均衡 → 数据库
    
  Ansible：配置应用
    安装依赖 → 部署代码 → 配置服务 → 启动应用

组合流程：
  Terraform apply → 输出 IP 列表 → 
  Ansible inventory → Playbook 配置 → 服务就绪
```

---

## 三、IaC 最佳实践

### 5. Terraform State 管理最佳实践？

**答：**

```
State 管理原则：

1. 远程存储（Remote Backend）
   - 团队共享，避免本地 State 冲突
   - S3 + DynamoDB（锁机制）

2. State 加锁
   - 防止多人同时操作
   - DynamoDB / Consul / GCS 锁

3. 环境隔离
   不要把所有环境放一个 State
   
   推荐：
   ├── environments/
   │   ├── dev/
   │   │   └── main.tf     # dev state
   │   ├── staging/
   │   │   └── main.tf     # staging state
   │   └── prod/
   │       └── main.tf     # prod state
   └── modules/
       ├── vpc/
       └── app/
```

```hcl
# Remote Backend 配置
terraform {
  backend "s3" {
    bucket         = "company-tf-state"
    key            = "prod/vpc/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

### 6. IaC 代码的 CI/CD 如何设计？

**答：**

```
IaC CI/CD 流程：

PR 阶段：
  1. terraform fmt -check （格式检查）
  2. terraform validate （语法验证）
  3. tflint （静态分析）
  4. terraform plan （预览变更）
  5. Plan 结果作为 PR Comment
  6. 人工 Review 审批

Merge 阶段：
  7. terraform apply -auto-approve
  8. 运行基础设施测试（Terratest）
  9. 通知相关人员

安全检查集成：
  - tfsec: 安全扫描（公开 S3/宽泛安全组）
  - checkov: 合规检查
  - infracost: 成本预估

流程图：
  PR → lint → validate → plan → review → approve
                                           │
                                     merge to main
                                           │
                                     apply → test → notify
```

---

## 四、面试高频题

### 7. 面试题：配置漂移如何检测和处理？

**答：**

```
配置漂移（Configuration Drift）：
  实际状态与代码定义的期望状态不一致

产生原因：
  1. 有人手动修改了云控制台配置
  2. 自动修复系统修改了配置
  3. 云平台自动更新/维护

检测方法：
  ┌──────────────────────┬──────────────────┐
  │ 方法                 │ 实现              │
  ├──────────────────────┼──────────────────┤
  │ terraform plan       │ 定时运行 plan     │
  │ AWS Config Rules     │ 配置合规检查      │
  │ driftctl             │ 专用漂移检测工具   │
  │ 自定义脚本           │ API 对比实际状态   │
  └──────────────────────┴──────────────────┘

处理策略：
  策略一：自动修复
    检测到漂移 → 自动 terraform apply 修复
    适合：非关键配置

  策略二：告警通知
    检测到漂移 → 通知团队手动处理
    适合：关键配置

  策略三：预防为主
    禁止手动修改（SCP/IAM 限制）
    所有变更必须通过 IaC 流程
```

### 8. 面试题：如何管理多环境的 IaC？

**答：**

```
多环境管理方案：

方案一：目录隔离（推荐小团队）
  ├── dev/
  │   ├── main.tf
  │   └── terraform.tfvars
  ├── staging/
  │   ├── main.tf
  │   └── terraform.tfvars
  └── prod/
      ├── main.tf
      └── terraform.tfvars

方案二：Workspace（Terraform 原生）
  terraform workspace new dev
  terraform workspace new prod
  缺点：共享 Backend，隔离度低

方案三：Terragrunt（推荐大团队）
  terragrunt.hcl 管理多环境配置
  DRY 原则，减少重复代码

原则：
  1. 模块复用：环境共用模块，参数不同
  2. 变量隔离：每个环境独立变量文件
  3. State 隔离：每个环境独立 State
  4. 权限隔离：不同环境不同 IAM 角色
```
