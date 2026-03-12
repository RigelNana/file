# CI/CD 安全

---

## 1. CI/CD 安全 (DevSecOps) 概览？

**回答：**

```
DevSecOps = 将安全融入 CI/CD 每个阶段

传统: Dev → Ops → Security (最后环节安全审查)
DevSecOps: Dev+Sec+Ops (安全左移, 每个阶段都有安全)

           安全左移 (Shift Left)
  ←───────────────────────────────────
  开发阶段     构建阶段     部署阶段     运行阶段
  IDE插件      SAST        镜像扫描     RASP
  Pre-commit   SCA         签名验证     WAF
  代码审查     单元测试     准入控制     监控
              密钥检测     审批流程     审计
```

```
CI/CD 安全威胁:
  1. 代码注入        → 恶意代码通过 PR 进入
  2. 依赖投毒        → 恶意第三方包
  3. 密钥泄露        → 凭证暴露在代码/日志/环境变量中
  4. Pipeline 滥用    → 恶意 PR 触发流水线窃取 Secrets
  5. 供应链攻击       → 恶意 Action/Plugin/Base Image
  6. Runner 逃逸     → 从 CI 容器突破到宿主机
  7. 制品篡改        → 镜像/包被篡改
```

---

## 2. SAST (静态应用安全测试)？

**回答：**

```
SAST = 分析源代码, 不运行程序, 发现安全漏洞

工具                 语言支持               特点
──────────          ─────────────         ──────────
SonarQube            多语言                 代码质量 + 安全
Semgrep              多语言                 自定义规则, 轻量, 快速
Checkmarx            多语言                 商业, 企业级
CodeQL               多语言                 GitHub 原生, 深度分析
Bandit               Python                Python 安全 Linter
Brakeman             Ruby                  Rails 安全扫描
gosec                Go                    Go 安全扫描
```

```yaml
# GitHub Actions — CodeQL
- name: Initialize CodeQL
  uses: github/codeql-action/init@v3
  with:
    languages: python, javascript

- name: Perform CodeQL Analysis
  uses: github/codeql-action/analyze@v3

# Semgrep
- name: Semgrep Scan
  uses: returntocorp/semgrep-action@v1
  with:
    config: >-
      p/security-audit
      p/secrets
      p/owasp-top-ten
```

```yaml
# GitLab CI — 内置 SAST
include:
  - template: Security/SAST.gitlab-ci.yml

# 自动扫描, 结果在 MR 中展示
```

---

## 3. SCA (软件成分分析) 与依赖扫描？

**回答：**

```
SCA = 扫描第三方依赖中的已知漏洞

工具                 特点
──────────          ──────────────────────
Dependabot           GitHub 原生, 自动 PR 升级依赖
Snyk                 多语言, 修复建议, 商业
Trivy                开源, 快速, 多格式
OWASP Dependency-Check  开源, Java 生态
Renovate             自动依赖更新 (功能比 Dependabot 丰富)
```

```yaml
# Dependabot 配置 (.github/dependabot.yml)
version: 2
updates:
  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"            # Actions 版本也需要更新
```

```yaml
# Trivy 依赖扫描
- name: Trivy FS Scan
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'fs'
    scan-ref: '.'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'
```

---

## 4. 密钥检测 (Secret Detection)？

**回答：**

```
防止密钥泄露到 Git 仓库

工具                 特点
──────────          ──────────────────────
gitleaks             开源, Pre-commit/CI
truffleHog           开源, 正则 + 熵检测
detect-secrets       Yelp 开源
GitHub Secret Scanning  GitHub 原生 (公共仓库自动)
GitLab Secret Detection  内置模板
```

```yaml
# Pre-commit hook (开发阶段拦截)
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

# CI 集成 (GitHub Actions)
- name: Gitleaks Scan
  uses: gitleaks/gitleaks-action@v2
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# GitLab CI
include:
  - template: Security/Secret-Detection.gitlab-ci.yml
```

```bash
# gitleaks 手动扫描
gitleaks detect --source . --verbose
gitleaks detect --source . --log-opts="--all"  # 扫描所有 Git 历史

# 发现泄露后:
# 1. 立即轮换密钥
# 2. 从 Git 历史中清除 (git filter-branch / BFG)
# 3. 添加到 .gitleaks.toml 白名单 (误报)
```

---

## 5. 容器镜像安全？

**回答：**

```
镜像安全扫描:
  Trivy           → 推荐, 快速, CI 友好
  Grype           → Anchore 开源
  Snyk Container  → 商业, 修复建议
  Harbor 内置      → 推镜像时自动扫描

扫描内容:
  OS 包漏洞            dpkg, apk, rpm 中的 CVE
  语言依赖漏洞          npm, pip, maven 的 CVE
  Dockerfile 最佳实践   以 root 运行, 无 HEALTHCHECK 等
  嵌入的密钥            镜像中的 API key, 密码
```

```yaml
# CI 中的镜像扫描门控
- name: Build Image
  run: docker build -t myapp:${{ github.sha }} .

- name: Trivy Scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'myapp:${{ github.sha }}'
    exit-code: '1'
    severity: 'CRITICAL'
    # CRITICAL 漏洞 → 阻止部署

- name: Push Image
  if: success()     # 扫描通过才推送
  run: docker push myapp:${{ github.sha }}
```

```
Dockerfile 安全最佳实践:
  □ 使用最小基础镜像 (alpine, distroless)
  □ 固定基础镜像版本 + 摘要 (digest)
  □ 非 root 用户运行 (USER 1000)
  □ 只读根文件系统
  □ 不 COPY 密钥/凭证到镜像
  □ 多阶段构建 (不包含编译工具)
  □ 不安装不必要的包
  □ HEALTHCHECK 指令
```

---

## 6. 供应链安全 (Supply Chain Security)？

**回答：**

```
供应链攻击向量:
  1. 恶意依赖包 (typosquatting, 依赖混淆)
  2. 被入侵的 CI/CD Action/Plugin
  3. 被篡改的基础镜像
  4. 被入侵的构建工具
  5. 被篡改的制品 (镜像/包)

防护:
  SBOM       → 软件物料清单 (知道用了什么)
  签名/验证   → 确保制品未被篡改
  来源证明    → SLSA 框架
  依赖锁定    → lock 文件固定版本
  可信源      → 只使用经过审查的 Registry/源
```

### SBOM (Software Bill of Materials)

```bash
# 生成 SBOM
trivy image --format spdx-json -o sbom.json myapp:v1
syft myapp:v1 -o spdx-json > sbom.json

# 扫描 SBOM 中的漏洞
trivy sbom sbom.json
grype sbom:sbom.json
```

### SLSA (Supply-chain Levels for Software Artifacts)

```
Level 0: 无保障
Level 1: 构建过程有文档
Level 2: 构建服务有防篡改保护
Level 3: 构建平台有安全加固
Level 4: 两人审查 + 密封构建

GitHub Actions SLSA:
  - uses: slsa-framework/slsa-github-generator/.github/workflows/generator_container_slsa3.yml
```

---

## 7. CI/CD Pipeline 安全加固？

**回答：**

```
威胁             防护措施
──────────      ──────────────────────────────
恶意 PR          Fork PR 不自动运行敏感 Job
                 需要审批才能运行 CI
                 PR Pipeline 无法访问 Secrets

密钥泄露          Secrets 只在需要的 Job 中注入
                 日志自动掩码
                 环境级 Secrets 隔离

Runner 逃逸       使用容器/VM 隔离的 Runner
                 不在 Runner 上缓存凭证
                 短命 Runner (用完即销)

依赖下载          使用 lock 文件 (npm ci 而非 npm install)
                 私有 Registry 代理/镜像

Action/Plugin     Pin 到具体 SHA 而非 Tag
                 定期审查使用的 Actions
```

```yaml
# GitHub Actions 安全加固示例
jobs:
  build:
    permissions:
      contents: read            # 最小权限
      packages: write
    runs-on: ubuntu-latest
    steps:
      # Pin Action 到 SHA (防止 Tag 被篡改)
      - uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11  # v4.1.1

      # 不在 Fork PR 中运行敏感步骤
      - name: Deploy
        if: github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository
        run: kubectl apply -f k8s/
```

---

## 8. K8s 准入控制与镜像策略？

**回答：**

```yaml
# Kyverno — 只允许可信 Registry
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: restrict-image-registries
spec:
  validationFailureAction: Enforce
  rules:
    - name: validate-registries
      match:
        any:
          - resources:
              kinds: [Pod]
      validate:
        message: "Images must be from approved registries"
        pattern:
          spec:
            containers:
              - image: "harbor.example.com/* | gcr.io/myorg/*"

---
# 禁止使用 latest Tag
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: disallow-latest-tag
spec:
  validationFailureAction: Enforce
  rules:
    - name: validate-image-tag
      match:
        any:
          - resources:
              kinds: [Pod]
      validate:
        message: "Image tag 'latest' is not allowed"
        pattern:
          spec:
            containers:
              - image: "!*:latest"

---
# OPA Gatekeeper 策略 (替代方案)
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sAllowedRepos
metadata:
  name: allowed-repos
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
  parameters:
    repos:
      - "harbor.example.com/"
      - "gcr.io/myorg/"
```

---

## 9. 审计与合规？

**回答：**

```
审计要素:
  谁 (Who)       → 哪个用户/系统触发
  什么 (What)     → 构建/部署/变更了什么
  何时 (When)     → 时间戳
  哪里 (Where)    → 哪个环境/集群
  结果 (Result)   → 成功/失败

审计来源:
  Git 历史                → 代码/配置变更记录
  CI/CD Pipeline 日志      → 构建/部署执行记录
  Container Registry 日志  → 镜像推送/拉取记录
  K8s Audit Log           → API 操作记录
  ArgoCD 历史             → 同步/部署历史

合规框架:
  SOC 2    → 变更管理, 访问控制, 审计日志
  PCI DSS  → 安全部署, 漏洞管理
  HIPAA    → 数据保护, 访问审计
  ISO 27001 → 信息安全管理
```

```
GitOps 对审计的天然优势:
  Git 仓库 = 完整变更日志
  每次部署 = Git Commit (谁, 什么, 何时)
  代码审查 = 变更审批
  签名提交 = 不可否认性
```

---

## 10. CI/CD 安全最佳实践清单？

**回答：**

```
===== 代码安全 =====
□ Pre-commit hook 密钥检测 (gitleaks)
□ SAST 静态安全扫描 (CodeQL/Semgrep)
□ SCA 依赖漏洞扫描 (Dependabot/Snyk)
□ 代码审查 (至少 1 人 Approve)
□ 签名 Git 提交 (GPG/SSH)

===== 构建安全 =====
□ 使用 lock 文件固定依赖版本
□ 私有 Registry 代理公共包
□ 最小基础镜像 (alpine/distroless)
□ 多阶段构建 (不包含构建工具)
□ 镜像漏洞扫描 (Trivy)

===== Pipeline 安全 =====
□ Secrets 使用 CI/CD 平台管理
□ 最小权限原则 (permissions)
□ Fork PR 不自动运行敏感 Job
□ Action/Plugin Pin 到 SHA
□ Runner 使用容器隔离

===== 部署安全 =====
□ 镜像签名与验证 (Cosign)
□ K8s 准入策略 (Kyverno/OPA)
□ 只允许可信 Registry
□ 禁止 latest Tag
□ 生产部署需审批

===== 运维安全 =====
□ 审计日志完整
□ 密钥定期轮换
□ Runner/Agent 定期更新
□ SBOM 生成与维护
□ 安全事件响应流程
```
