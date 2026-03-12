# CI/CD 基础概念与原则

---

## 1. 什么是 CI/CD？三者有何区别？

**回答：**

| 概念 | 全称 | 定义 | 目标 |
|------|------|------|------|
| **CI** | Continuous Integration | 开发人员频繁合并代码到主分支，每次合并自动触发构建和测试 | 尽早发现集成错误 |
| **CD (Delivery)** | Continuous Delivery | CI 基础上，自动部署到预发布环境，生产发布需手动审批 | 随时可以发布 |
| **CD (Deployment)** | Continuous Deployment | 在 Delivery 基础上，自动部署到生产，无需人工干预 | 每次变更自动上线 |

```
代码提交 → 构建 → 单元测试 → 集成测试 → 部署预发布 → [手动审批] → 部署生产
|__________ CI ___________|________________ CD (Delivery) _____|
|__________ CI ___________|__________________ CD (Deployment) ________________|
```

### 持续集成的前提条件

```
1. 版本控制系统 (Git)
2. 自动化构建脚本
3. 自动化测试套件
4. CI 服务器 (Jenkins/GitLab CI/GitHub Actions)
5. 团队纪律: 频繁提交, 保持构建通过
```

---

## 2. CI/CD 的核心原则？

**回答：**

```
原则                    说明                                     实践
────────────────       ──────────────────────────────────       ──────────────
频繁提交                至少每天提交一次                            小批量, 增量变更
自动化构建              每次提交自动触发构建                        Webhook 触发
自动化测试              构建后自动运行测试                          单元/集成/E2E
快速反馈                构建测试尽快完成                            目标 < 10 分钟
保持主干可部署           主分支始终处于可发布状态                     不提交破坏性代码
环境一致性              开发/测试/生产环境配置一致                   容器化 + IaC
版本化一切              代码/配置/基础设施都纳入版本控制              Git 管理一切
可重复构建              相同输入产生相同输出                         固定依赖版本
快速回滚                出问题能马上回退                             蓝绿/金丝雀
```

### 反模式（应避免）

```
反模式                          问题
──────────────────             ──────────────────────────
长期分支 (Long-lived branches)  合并冲突多, 集成困难
手动构建部署                    耗时易错, 不可重复
跳过测试                        技术债务, 生产事故
配置硬编码                      环境差异, 安全风险
流水线过长                      反馈慢, 开发效率低
忽略失败的构建                  "broken window" 效应
只在本地测试                    环境差异导致生产问题
```

---

## 3. 常见 CI/CD 工具对比？

**回答：**

| 工具 | 类型 | 语言/配置 | 特点 | 适用场景 |
|------|------|-----------|------|----------|
| **Jenkins** | 自托管 | Groovy (Jenkinsfile) | 插件丰富(1800+), 高度可定制 | 企业级, 复杂流水线 |
| **GitLab CI** | SaaS/自托管 | YAML (.gitlab-ci.yml) | 与 GitLab 深度集成 | GitLab 用户 |
| **GitHub Actions** | SaaS | YAML (workflows/) | Marketplace 丰富, 社区活跃 | GitHub 用户, 开源项目 |
| **ArgoCD** | GitOps CD | YAML (Application CRD) | K8s 原生, 声明式 | K8s 持续部署 |
| **Tekton** | K8s 原生 CI | YAML (Task/Pipeline CRD) | Cloud Native, 可组合 | K8s 生态 |
| **CircleCI** | SaaS | YAML (config.yml) | 速度快, Docker层缓存 | 中小团队 |
| **Drone CI** | 自托管 | YAML (.drone.yml) | 轻量, 容器原生 | 轻量级需求 |
| **Azure DevOps** | SaaS | YAML (azure-pipelines.yml) | 微软生态集成 | Azure/微软技术栈 |

### 选型建议

```
已用 GitHub          → GitHub Actions (免费额度充足)
已用 GitLab          → GitLab CI (开箱即用)
K8s 生态 + GitOps     → ArgoCD + GitHub Actions/GitLab CI
企业复杂流水线         → Jenkins (灵活但维护成本高)
追求轻量              → Drone CI
微软/Azure 生态        → Azure DevOps
```

---

## 4. CI/CD Pipeline 的基本流程？

**回答：**

```
┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
│  Source  │──▶│  Build  │──▶│  Test   │──▶│ Package │──▶│ Deploy  │
│  Stage   │   │  Stage  │   │  Stage  │   │  Stage  │   │  Stage  │
└─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
   Git          编译           测试           制品           发布
   Webhook      依赖安装       单元测试       Docker镜像     Staging
   代码检出      代码生成       集成测试       Helm Chart     Production
                              覆盖率报告      NPM包
```

### 各阶段详解

```
1. Source (代码检出)
   - Git clone/checkout
   - 分支/Tag/PR 触发
   - Submodule 初始化

2. Build (构建)
   - 安装依赖 (npm install, pip install, mvn dependency)
   - 编译 (javac, go build, tsc)
   - 代码生成 (protobuf, swagger)
   - 构建 Docker 镜像

3. Test (测试)
   - Lint (代码风格)
   - 单元测试 (Unit Test)
   - 集成测试 (Integration Test)
   - 安全扫描 (SAST/DAST)
   - 覆盖率报告

4. Package (打包/推送制品)
   - Docker push 到 Registry
   - 制品上传 (Nexus, Artifactory, npm registry)
   - 版本标记

5. Deploy (部署)
   - Staging 自动部署
   - 验收测试 (Smoke Test / E2E)
   - Production 部署 (手动审批或自动)
   - 回滚准备
```

---

## 5. Webhook 与 CI/CD 触发机制？

**回答：**

```
触发方式              说明                              场景
──────────────       ────────────────────────         ──────────
Webhook              Git 事件 → HTTP POST → CI 服务器   最常用
轮询 (Polling)        CI 定时检查 Git 变更                Jenkins SCM Poll
定时 (Cron)           按时间表触发                        定时安全扫描
手动 (Manual)         人工点击触发                        生产部署
API 调用              通过 REST API 触发                  外部系统集成
管道链接              上游流水线完成触发下游                微服务联动
```

### Webhook 工作流

```
Developer → git push → GitHub/GitLab
                           │
                           ▼
                    Webhook (HTTP POST)
                    payload: {
                      ref: "refs/heads/main",
                      commits: [...],
                      repository: {...}
                    }
                           │
                           ▼
                    CI Server (Jenkins/GitLab Runner)
                           │
                           ▼
                    触发 Pipeline
```

---

## 6. 分支策略与 CI/CD 的关系？

**回答：**

```
分支策略              CI/CD 配置                         适用
──────────────       ─────────────────────────         ──────────
Git Flow             main/develop/feature/release/      大型项目, 复杂发布
                     hotfix 各有不同流水线

GitHub Flow          main 始终可部署                     持续部署, 小团队
                     feature branch → PR → merge

Trunk-Based          直接提交到 main (或短命分支)          CI/CD 最佳实践
                     Feature Flags 控制功能开关

GitLab Flow          main + environment branches        环境管理
                     (staging/production)
```

### 常见触发规则

```yaml
# GitHub Actions 示例
on:
  push:
    branches: [main]           # main 推送时触发
  pull_request:
    branches: [main]           # PR 到 main 时触发
    types: [opened, synchronize]

# GitLab CI 示例
rules:
  - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  - if: '$CI_COMMIT_BRANCH == "main"'
```

---

## 7. 什么是流水线即代码 (Pipeline as Code)？

**回答：**

将 CI/CD 流水线定义为代码文件，纳入版本控制。

```
优势:
  版本控制    → 变更可追踪, 可回滚
  代码审查    → PR 审查流水线变更
  可复制     → 新项目快速复用
  一致性     → 多项目统一标准
  自文档化   → 流水线定义即文档

各工具对应的配置文件:
  Jenkins       → Jenkinsfile
  GitLab CI     → .gitlab-ci.yml
  GitHub Actions → .github/workflows/*.yml
  Tekton        → Task/Pipeline YAML (K8s CRD)
  CircleCI      → .circleci/config.yml
  Drone CI      → .drone.yml
  Azure DevOps  → azure-pipelines.yml
```

---

## 8. 环境管理？开发/测试/预发布/生产如何隔离？

**回答：**

```
环境            用途              部署方式          触发条件
─────────      ────────         ─────────        ──────────
Development    日常开发           自动              Push 到 feature 分支
Testing/QA     集成测试           自动              PR 创建/更新
Staging        预发布验证         自动              合并到 main
Production     正式生产           手动审批/自动       Tag 或审批后
```

### 环境变量管理

```yaml
# GitHub Actions
jobs:
  deploy-staging:
    environment: staging                    # 关联环境
    env:
      DB_HOST: ${{ secrets.STAGING_DB }}    # 环境级 Secret

  deploy-prod:
    environment: production
    env:
      DB_HOST: ${{ secrets.PROD_DB }}

# GitLab CI
deploy-staging:
  environment:
    name: staging
    url: https://staging.example.com
  variables:
    DB_HOST: $STAGING_DB_HOST

deploy-production:
  environment:
    name: production
    url: https://example.com
  when: manual
```

---

## 9. CI/CD 中的测试策略？

**回答：**

```
测试金字塔:

        ╱ ╲
       ╱ E2E╲         少量, 慢, 昂贵
      ╱───────╲
     ╱集成测试  ╲       适量, 较快
    ╱───────────╲
   ╱  单元测试    ╲     大量, 快速, 便宜
  ╱───────────────╲
```

```
测试类型          CI 阶段            工具                      耗时
──────────       ──────────        ──────────               ──────
Lint/格式        Build             ESLint, Flake8, golint    秒级
单元测试         Test              JUnit, pytest, Jest       秒~分钟
集成测试         Test              TestContainers, Cypress   分钟
安全扫描 SAST    Test              SonarQube, Semgrep        分钟
依赖扫描         Test              Snyk, Dependabot          秒~分钟
镜像扫描         Package           Trivy, Grype              秒~分钟
冒烟测试         Deploy Staging    curl, Postman             秒
E2E 测试        Deploy Staging    Selenium, Playwright       分钟~小时
性能测试         Deploy Staging    k6, JMeter, Locust        分钟~小时
```

### 测试并行化

```yaml
# GitHub Actions 矩阵策略
jobs:
  test:
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']
        os: [ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
      - run: pytest tests/
```

---

## 10. CI/CD 中如何管理密钥和敏感信息？

**回答：**

```
❌ 错误做法:
  - 密钥硬编码在代码中
  - 密钥写在配置文件中提交到 Git
  - 流水线日志中打印密钥

✅ 正确做法:
  1. 使用 CI/CD 平台的 Secrets 管理
  2. 使用外部密钥管理服务
  3. 最小权限原则
  4. 定期轮换密钥
```

### 各平台密钥管理

```bash
# GitHub Actions
# Settings → Secrets → Actions → New repository secret
# 使用: ${{ secrets.MY_SECRET }}
# 层级: Organization > Repository > Environment

# GitLab CI
# Settings → CI/CD → Variables
# 使用: $MY_SECRET
# 选项: Mask (日志掩码), Protect (仅保护分支), Environment scope

# Jenkins
# Credentials 插件
# 类型: Username+Password, Secret text, SSH key, Certificate
# 使用: withCredentials([...]) { }
```

### 外部密钥管理

```
工具                      集成方式
────────────────         ──────────────────────
HashiCorp Vault           CI/CD 插件 / API 调用
AWS Secrets Manager       IAM Role / SDK
Azure Key Vault           Service Principal
GCP Secret Manager        Service Account
```
