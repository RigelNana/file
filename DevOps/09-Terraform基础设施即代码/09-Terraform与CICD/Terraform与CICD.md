# Terraform 与 CI/CD

---

## 1. Terraform 在 CI/CD 中的流程？

**回答：**

```
标准流程:
  PR 创建 / 代码推送
    → CI: terraform fmt -check      (格式检查)
    → CI: terraform validate        (语法检查)
    → CI: terraform plan            (预览变更)
    → PR 审查 (Review plan 输出)
    → 合并到 main
    → CD: terraform apply           (执行变更)

环境流转:
  PR → dev apply (自动) → staging apply (自动) → production apply (手动审批)

安全原则:
  ✓ plan 在 PR 中自动执行, 输出为 comment
  ✓ apply 只在 main/release 分支
  ✓ production apply 需要人工审批
  ✓ 使用 -out=plan.out 确保 apply 的是 review 过的 plan
```

---

## 2. GitLab CI 集成？

**回答：**

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - plan
  - apply

variables:
  TF_ROOT: "environments/${CI_ENVIRONMENT_NAME}"

.terraform_base:
  image: hashicorp/terraform:1.7
  before_script:
    - cd ${TF_ROOT}
    - terraform init -input=false

# 验证阶段
validate:
  extends: .terraform_base
  stage: validate
  variables:
    CI_ENVIRONMENT_NAME: dev
  script:
    - terraform fmt -check -recursive
    - terraform validate
  rules:
    - if: $CI_MERGE_REQUEST_ID

# Plan (在 MR 中展示)
plan:dev:
  extends: .terraform_base
  stage: plan
  variables:
    CI_ENVIRONMENT_NAME: dev
  script:
    - terraform plan -out=plan.out -input=false
    - terraform show -no-color plan.out > plan.txt
  artifacts:
    paths:
      - ${TF_ROOT}/plan.out
      - ${TF_ROOT}/plan.txt
    reports:
      terraform: ${TF_ROOT}/plan.json
  rules:
    - if: $CI_MERGE_REQUEST_ID
    - if: $CI_COMMIT_BRANCH == "main"

# Apply
apply:dev:
  extends: .terraform_base
  stage: apply
  variables:
    CI_ENVIRONMENT_NAME: dev
  environment:
    name: dev
  script:
    - terraform apply -input=false plan.out
  dependencies:
    - plan:dev
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  when: manual   # 手动触发

apply:production:
  extends: .terraform_base
  stage: apply
  variables:
    CI_ENVIRONMENT_NAME: production
  environment:
    name: production
  script:
    - terraform apply -input=false plan.out
  dependencies:
    - plan:production
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  when: manual
  allow_failure: false
```

---

## 3. GitHub Actions 集成？

**回答：**

```yaml
# .github/workflows/terraform.yml
name: Terraform

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read
  pull-requests: write      # 评论 PR

env:
  TF_VERSION: "1.7.0"
  AWS_REGION: "us-east-1"

jobs:
  terraform:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: environments/dev

    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: ${{ env.TF_VERSION }}

      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Terraform Init
        run: terraform init -input=false

      - name: Terraform Format
        run: terraform fmt -check -recursive
        continue-on-error: true

      - name: Terraform Validate
        run: terraform validate

      - name: Terraform Plan
        id: plan
        run: terraform plan -no-color -input=false -out=plan.out
        continue-on-error: true

      # PR 中展示 Plan 结果
      - name: Comment Plan on PR
        uses: actions/github-script@v7
        if: github.event_name == 'pull_request'
        with:
          script: |
            const output = `#### Terraform Plan 📖
            \`\`\`
            ${{ steps.plan.outputs.stdout }}
            \`\`\`
            *Pushed by: @${{ github.actor }}*`;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: output
            })

      - name: Terraform Apply
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        run: terraform apply -input=false plan.out
```

---

## 4. Atlantis — Terraform Pull Request 自动化？

**回答：**

```
Atlantis = 开源的 Terraform PR 自动化工具
功能:
  自动 plan → PR 中评论展示
  PR 通过后 → 评论 "atlantis apply" 执行
  锁定机制 → 同一目录只能一个 PR 操作
  支持多仓库/多目录
```

```yaml
# atlantis.yaml (仓库根目录)
version: 3
projects:
  - name: dev
    dir: environments/dev
    workspace: default
    autoplan:
      when_modified:
        - "*.tf"
        - "*.tfvars"
        - "../../modules/**/*.tf"
      enabled: true
    apply_requirements:
      - approved         # 需要 PR approved
      - mergeable        # 需要可合并 (无冲突)

  - name: production
    dir: environments/production
    workspace: default
    autoplan:
      when_modified:
        - "*.tf"
        - "*.tfvars"
        - "../../modules/**/*.tf"
      enabled: true
    apply_requirements:
      - approved
      - mergeable
    workflow: production

workflows:
  production:
    plan:
      steps:
        - init
        - plan:
            extra_args: ["-var-file", "production.tfvars"]
    apply:
      steps:
        - apply
```

```
PR 中的操作:
  推送代码 → Atlantis 自动 plan → PR 评论展示结果
  Review 通过后:
    评论 "atlantis apply" → 执行 apply
    评论 "atlantis apply -p production" → 指定项目

优势:
  ✓ Plan 结果直接在 PR 中看到
  ✓ Apply 需要 PR 审批
  ✓ 防止并发修改 (锁定)
  ✓ 完整审计日志
```

---

## 5. Terraform Cloud / Enterprise？

**回答：**

```
Terraform Cloud (TFC) = HashiCorp 官方 SaaS 平台
Terraform Enterprise (TFE) = 私有部署版本

功能:
  远程执行     → Plan/Apply 在云端执行 (非本地)
  状态管理     → 内置远程 State + 锁定
  VCS 集成     → GitHub/GitLab 集成, PR 自动 plan
  Policy as Code → Sentinel/OPA 策略检查
  私有 Registry → 内部 Module/Provider 仓库
  团队管理     → RBAC, SSO
  Cost Estimation → 成本预估
```

```hcl
# Terraform Cloud 配置
terraform {
  cloud {
    organization = "my-org"
    workspaces {
      name = "my-app-production"
      # 或 tags 匹配多个 workspace
      # tags = ["app:my-app"]
    }
  }
}

# 或使用 remote backend
terraform {
  backend "remote" {
    organization = "my-org"
    workspaces {
      prefix = "my-app-"     # my-app-dev, my-app-prod
    }
  }
}
```

---

## 6. 凭据管理 — CI/CD 中如何传递 AWS/云凭据？

**回答：**

```yaml
# 方式 1: 环境变量 (CI/CD Secret)
# GitLab CI
variables:
  AWS_ACCESS_KEY_ID: $AWS_ACCESS_KEY_ID         # CI/CD Variable
  AWS_SECRET_ACCESS_KEY: $AWS_SECRET_ACCESS_KEY

# GitHub Actions
env:
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

# 方式 2: OIDC (推荐 — 无需长期凭据)
# GitHub Actions + AWS OIDC
- uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::123456789012:role/github-actions-role
    aws-region: us-east-1
    # 通过 OIDC 获取临时凭据, 无需 Access Key

# 方式 3: Vault
- name: Get credentials from Vault
  uses: hashicorp/vault-action@v2
  with:
    url: https://vault.example.com
    method: jwt
    path: github
    secrets: |
      aws/creds/terraform access_key | AWS_ACCESS_KEY_ID ;
      aws/creds/terraform secret_key | AWS_SECRET_ACCESS_KEY ;
      aws/creds/terraform security_token | AWS_SESSION_TOKEN
```

```
安全最佳实践:
  ✓ 使用 OIDC 替代长期凭据 (无 Secret Key 泄露风险)
  ✓ 最小权限 IAM 角色
  ✓ 凭据轮换自动化
  ✗ 不要在代码中硬编码凭据
  ✗ 不要用 root 账号的 Access Key
```

---

## 7. Plan 文件与安全执行？

**回答：**

```bash
# 保存 Plan (确保 apply 的是 review 过的内容)
terraform plan -out=plan.out -input=false

# 查看 Plan (存为文本给 PR 审查)
terraform show -no-color plan.out > plan.txt

# 导出 JSON (自动化分析)
terraform show -json plan.out > plan.json

# Apply 保存的 Plan (不会再次提示确认)
terraform apply plan.out
```

```
为什么用 Plan 文件:
  时间差问题:
    10:00 terraform plan → 显示创建 2 个资源
    10:30 别人修改了基础设施
    11:00 terraform apply → 可能创建不同的!

  使用 plan.out:
    10:00 terraform plan -out=plan.out → 锁定变更
    11:00 terraform apply plan.out → 精确执行 10:00 的计划

  CI/CD 中:
    Plan Job → 保存 plan.out 为 artifact
    Apply Job → 使用同一个 plan.out
```

---

## 8. terraform fmt 与 tflint？

**回答：**

```bash
# terraform fmt — 内置格式化
terraform fmt                # 格式化当前目录
terraform fmt -recursive     # 递归格式化
terraform fmt -check         # 检查格式 (CI 中用, 不格式化)
terraform fmt -diff          # 显示差异

# tflint — 第三方 Lint 工具
# 安装: brew install tflint / choco install tflint
tflint --init                # 初始化插件
tflint                       # 检查当前目录
tflint --recursive           # 递归
tflint --format json         # JSON 输出 (CI)
```

```hcl
# .tflint.hcl — 配置文件
config {
  format = "compact"
  module = true
}

plugin "aws" {
  enabled = true
  version = "0.30.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
}

plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

rule "terraform_naming_convention" {
  enabled = true
  format  = "snake_case"
}

rule "terraform_documented_variables" {
  enabled = true
}
```

```
tflint 检查内容:
  AWS 规则 → 无效实例类型, 过时的 AMI, 安全组问题
  命名规范 → snake_case
  变量文档 → description 是否存在
  废弃语法 → 已弃用的参数
  模块最佳实践 → 输入输出规范
```

---

## 9. Sentinel / OPA 策略即代码？

**回答：**

```
Policy as Code = 用代码定义合规策略, 自动检查

Sentinel → HashiCorp 官方 (Terraform Cloud/Enterprise)
OPA (Open Policy Agent) → 开源通用

用途:
  限制实例类型 (不允许 m5.24xlarge)
  强制 Tag 标签 (必须有 Environment, Owner)
  限制特定 Region (不允许在中国区创建资源)
  预算控制 (单次变更不超过 $1000)
  安全规则 (S3 不允许 public)
```

```python
# Sentinel 策略示例
# policies/enforce-tags.sentinel
import "tfplan/v2" as tfplan

required_tags = ["Environment", "Owner", "Team"]

main = rule {
  all tfplan.resource_changes as _, rc {
    rc.type is "aws_instance" and
    rc.change.after.tags is not null and
    all required_tags as tag {
      tag in keys(rc.change.after.tags)
    }
  }
}
```

```rego
# OPA 策略 (Rego 语言)
# policies/enforce-tags.rego
package terraform

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_instance"
  not resource.change.after.tags.Environment
  msg := sprintf("Instance %s must have Environment tag", [resource.address])
}

deny[msg] {
  resource := input.resource_changes[_]
  resource.type == "aws_instance"
  resource.change.after.instance_type == "m5.24xlarge"
  msg := sprintf("Instance %s: m5.24xlarge is not allowed", [resource.address])
}
```

```bash
# OPA 在 CI 中使用
terraform plan -out=plan.out
terraform show -json plan.out > plan.json
opa eval --input plan.json --data policies/ "data.terraform.deny"
```

---

## 10. CI/CD 集成最佳实践？

**回答：**

```
流程设计:
  ✓ PR → fmt + validate + plan (自动)
  ✓ Plan 输出作为 PR 评论
  ✓ Apply 只在主分支, 用 plan.out 文件
  ✓ Production 需要手动审批
  ✓ 使用 OIDC 替代长期凭据

安全:
  ✓ State 加密存储 (S3 SSE)
  ✓ State 锁定 (DynamoDB)
  ✓ 最小权限 IAM
  ✓ Sentinel / OPA 策略
  ✓ 敏感变量用 CI Secret, 不提交 .tfvars

可靠性:
  ✓ plan -out=plan.out → apply plan.out
  ✓ -input=false (非交互)
  ✓ 锁定 Provider 版本 (.terraform.lock.hcl)
  ✓ 定期 terraform plan 检测漂移 (drift)

工具选型:
  轻量: GitHub Actions / GitLab CI
  专业: Atlantis (PR 自动化)
  企业: Terraform Cloud / Spacelift / env0

检查清单:
  □ terraform fmt -check 通过
  □ terraform validate 通过
  □ tflint 通过
  □ OPA/Sentinel 策略通过
  □ Plan 已 Review
  □ Apply 使用保存的 Plan 文件
  □ State 锁定已启用
  □ 凭据通过 OIDC / Secret 管理
```
