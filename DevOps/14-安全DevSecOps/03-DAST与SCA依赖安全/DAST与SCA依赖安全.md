# DAST 与 SCA 依赖安全

---

## 1. 什么是 DAST？

**回答：**

```
DAST = Dynamic Application Security Testing (动态应用安全测试)

原理: 在应用运行时, 从外部发送请求探测漏洞
      模拟攻击者行为, 黑盒测试

特点:
  ✅ 黑盒测试: 不需要源代码
  ✅ 真实漏洞: 发现的都是可利用的运行时漏洞
  ✅ 低误报:   比 SAST 误报率低
  ✅ 语言无关: 不关心用什么语言开发
  ❌ 覆盖率低: 只能测试可访问的 URL/端点
  ❌ 发现晚:   需要部署后才能测试
  ❌ 速度慢:   需要实际发请求, 时间长
  ❌ 无法定位: 不能精确到代码行

DAST vs SAST:
  ┌──────────┬──────────────┬──────────────┐
  │          │ SAST          │ DAST          │
  ├──────────┼──────────────┼──────────────┤
  │ 测试方式  │ 白盒 (源代码) │ 黑盒 (运行时) │
  │ 扫描阶段  │ 编码/构建     │ 测试/预发     │
  │ 误报率    │ 高            │ 低            │
  │ 覆盖率    │ 高            │ 低            │
  │ 速度      │ 快            │ 慢            │
  │ 定位精度  │ 代码行        │ URL/端点      │
  │ 语言依赖  │ 是            │ 否            │
  └──────────┴──────────────┴──────────────┘

最佳组合: SAST (CI 阶段) + DAST (测试环境) = 互补
```

---

## 2. OWASP ZAP 怎么使用？

**回答：**

```bash
# OWASP ZAP: 最流行的开源 DAST 工具

# Docker 运行基线扫描 (快速, 适合 CI)
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t https://staging.example.com \
  -r report.html

# 完整扫描 (深度, 耗时长)
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable \
  zap-full-scan.py \
  -t https://staging.example.com \
  -r full-report.html

# API 扫描 (针对 REST API)
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py \
  -t https://staging.example.com/openapi.json \
  -f openapi \
  -r api-report.html

# 自定义扫描策略
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py \
  -t https://staging.example.com \
  -c zap-config.conf \
  -I    # 忽略警告, 只报错误
```

```yaml
# GitLab CI 集成 ZAP
dast_scan:
  stage: test
  image: ghcr.io/zaproxy/zaproxy:stable
  script:
    - mkdir -p /zap/wrk/
    - zap-baseline.py
        -t https://$STAGING_URL
        -r report.html
        -J report.json
        -I  # 非阻断模式 (初期)
  artifacts:
    paths:
      - report.html
      - report.json
  only:
    - main
```

```
ZAP 扫描模式:
  Baseline:  快速 (1-2 分钟), 被动扫描, 适合 CI
  Full:      深度 (30-60 分钟), 主动+被动, 适合定期
  API:       针对 API 端点, 支持 OpenAPI/GraphQL

ZAP 能检测:
  SQL 注入           XSS (反射/存储)
  CSRF               目录遍历
  信息泄露           不安全的 Cookie
  安全头缺失         SSL/TLS 配置问题
```

---

## 3. 什么是 SCA？

**回答：**

```
SCA = Software Composition Analysis (软件组成分析)

原理: 扫描项目的第三方依赖, 检查已知漏洞
      对比 CVE 数据库 (NVD, GitHub Advisory, OSV)

为什么重要:
  现代应用 70-90% 代码来自开源组件
  Log4Shell (CVE-2021-44228): 一个依赖漏洞影响全球
  依赖数量庞大: node_modules 动辄几百个包

SCA 检查内容:
  1. 已知漏洞 (CVE):  依赖是否有已知安全漏洞
  2. 许可证合规:      是否使用了不兼容的许可证
  3. 过期依赖:        是否使用了不再维护的版本
  4. 传递依赖:        间接依赖是否有问题

漏洞严重程度 (CVSS):
  ┌──────────────┬────────────┬──────────────┐
  │ 级别          │ CVSS 分数  │ 处理          │
  ├──────────────┼────────────┼──────────────┤
  │ Critical     │ 9.0 - 10.0 │ 24h 修复     │
  │ High         │ 7.0 - 8.9  │ 7 天修复     │
  │ Medium       │ 4.0 - 6.9  │ 30 天修复    │
  │ Low          │ 0.1 - 3.9  │ 下个版本     │
  └──────────────┴────────────┴──────────────┘
```

---

## 4. 常用 SCA 工具？

**回答：**

```
┌──────────────┬────────┬──────────────────────────────┐
│ 工具          │ 类型   │ 特点                          │
├──────────────┼────────┼──────────────────────────────┤
│ Trivy        │ 开源   │ 多功能 (依赖+镜像+IaC), 快    │
│ Snyk         │ 商业   │ 功能全面, 修复建议好, IDE 集成  │
│ Dependabot   │ 免费   │ GitHub 内置, 自动创建 PR 更新  │
│ Renovate     │ 开源   │ 多平台, 高度可定制             │
│ OWASP DC     │ 开源   │ OWASP Dependency-Check        │
│ npm audit    │ 内置   │ Node.js 内置                  │
│ pip-audit    │ 开源   │ Python 专用                   │
│ safety       │ 开源   │ Python 专用, PyUp.io 数据库   │
│ Black Duck   │ 商业   │ 企业级, 许可证合规强           │
└──────────────┴────────┴──────────────────────────────┘
```

```bash
# Trivy 扫描依赖
trivy fs --scanners vuln .
trivy fs --severity HIGH,CRITICAL --exit-code 1 .

# Snyk 扫描
snyk test                    # 扫描依赖漏洞
snyk test --severity-threshold=high  # 只报高危

# npm audit
npm audit
npm audit fix               # 自动修复

# pip-audit (Python)
pip-audit
pip-audit -r requirements.txt

# OWASP Dependency-Check
dependency-check --project myapp --scan .
```

```yaml
# Dependabot 配置 (.github/dependabot.yml)
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
    reviewers:
      - "security-team"

  - package-ecosystem: "pip"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "docker"
    directory: "/"
    schedule:
      interval: "weekly"

  - package-ecosystem: "github-actions"
    directory: "/"
    schedule:
      interval: "weekly"
```

---

## 5. Trivy 全面使用？

**回答：**

```bash
# Trivy: 一站式安全扫描工具 (Aqua Security)

# 安装
brew install trivy       # macOS
apt install trivy        # Debian/Ubuntu

# 1. 文件系统扫描 (依赖漏洞)
trivy fs .
trivy fs --scanners vuln,secret,misconfig .

# 2. 容器镜像扫描
trivy image nginx:latest
trivy image --severity CRITICAL myapp:v1.0

# 3. Git 仓库扫描
trivy repo https://github.com/org/repo

# 4. Kubernetes 扫描
trivy k8s --report summary cluster

# 5. IaC 扫描 (Terraform/CloudFormation/Dockerfile)
trivy config ./terraform/
trivy config ./Dockerfile

# CI 集成: 有 Critical 漏洞则构建失败
trivy fs --exit-code 1 --severity CRITICAL .
trivy image --exit-code 1 --severity HIGH,CRITICAL $IMAGE
```

```yaml
# GitHub Actions 集成 Trivy
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@master
  with:
    scan-type: 'fs'
    scan-ref: '.'
    severity: 'CRITICAL,HIGH'
    exit-code: '1'
    format: 'sarif'
    output: 'trivy-results.sarif'

- name: Upload Trivy scan results
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: 'trivy-results.sarif'
```

```
Trivy 扫描能力:
  ┌──────────────────┬──────────────────────────────┐
  │ 扫描类型          │ 检测内容                      │
  ├──────────────────┼──────────────────────────────┤
  │ vuln             │ 依赖漏洞 (CVE)                │
  │ secret           │ 硬编码密钥/密码                │
  │ misconfig        │ Dockerfile/K8s/Terraform 配置 │
  │ license          │ 开源许可证                     │
  │ image            │ OS 包 + 应用依赖漏洞           │
  └──────────────────┴──────────────────────────────┘
```

---

## 6. IAST 是什么？

**回答：**

```
IAST = Interactive Application Security Testing (交互式安全测试)

原理: 在应用运行时通过插桩 (Agent) 监控数据流
      结合 SAST (代码可见) + DAST (运行时) 的优点

工作方式:
  应用启动时注入 Agent (如 Java Agent)
  监控请求处理过程中的数据流
  当用户输入流入危险 API 时报告漏洞

  请求 → Web 框架 → 业务逻辑 → 数据库
         ↑ Agent 监控整个数据流路径

对比:
  ┌──────────┬──────┬──────┬──────┐
  │          │ SAST │ DAST │ IAST │
  ├──────────┼──────┼──────┼──────┤
  │ 需要源码  │ 是   │ 否   │ 否   │
  │ 需要运行  │ 否   │ 是   │ 是   │
  │ 误报率    │ 高   │ 中   │ 低   │
  │ 覆盖率    │ 高   │ 低   │ 中   │
  │ 定位精度  │ 高   │ 低   │ 高   │
  │ 性能影响  │ 无   │ 无   │ 有   │
  └──────────┴──────┴──────┴──────┘

工具:
  Contrast Security
  Hdiv Security
  Seeker (Synopsys)

适用场景:
  测试环境中运行, 配合功能测试一起使用
  比 DAST 精确定位, 比 SAST 低误报
  缺点: 需要插桩, 有一定性能开销 (约 3-5%)
```

---

## 7. SBOM 软件物料清单？

**回答：**

```
SBOM = Software Bill of Materials (软件物料清单)

定义: 列出软件产品中所有组件、依赖、版本的清单
      类比: 食品配料表

为什么需要:
  Log4Shell 事件: "我的系统有没有用 log4j?"
  没有 SBOM → 花数天排查
  有 SBOM → 秒级查询

SBOM 标准:
  CycloneDX: OWASP 出品, 轻量, 安全导向
  SPDX:      Linux Foundation, ISO 标准, 许可证导向
```

```bash
# Syft: 生成 SBOM (Anchore)
syft packages ./my-app -o cyclonedx-json > sbom.json
syft packages myapp:v1.0 -o spdx-json > sbom-spdx.json

# Trivy 生成 SBOM
trivy fs --format cyclonedx --output sbom.json .
trivy image --format cyclonedx myapp:v1.0

# 使用 Grype 扫描 SBOM 中的漏洞
grype sbom:./sbom.json
```

```
SBOM 内容示例:
  {
    "bomFormat": "CycloneDX",
    "components": [
      {
        "name": "express",
        "version": "4.18.2",
        "type": "library",
        "purl": "pkg:npm/express@4.18.2",
        "licenses": [{"id": "MIT"}]
      },
      {
        "name": "lodash",
        "version": "4.17.21",
        "type": "library",
        "purl": "pkg:npm/lodash@4.17.21"
      }
    ]
  }

SBOM 最佳实践:
  1. 每次构建自动生成 SBOM
  2. SBOM 随制品一起存储
  3. 定期用 SBOM 检查新发现的漏洞
  4. 美国政府 EO 14028: 供应商必须提供 SBOM
```

---

## 8. 依赖更新策略？

**回答：**

```
依赖更新挑战:
  不更新 → 积累漏洞和技术债
  盲目更新 → 可能引入 breaking changes

策略:
  ┌──────────────────┬──────────────────────────────┐
  │ 更新类型          │ 策略                          │
  ├──────────────────┼──────────────────────────────┤
  │ 安全补丁 (patch)  │ 自动合并 (有 CI 测试通过)     │
  │ 次版本 (minor)    │ 自动创建 PR, 人工审查         │
  │ 主版本 (major)    │ 手动评估, 计划迁移             │
  └──────────────────┴──────────────────────────────┘

Renovate 高级配置:
```

```json
// renovate.json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],
  "packageRules": [
    {
      "description": "安全补丁自动合并",
      "matchUpdateTypes": ["patch"],
      "automerge": true,
      "automergeType": "pr"
    },
    {
      "description": "次版本人工审查",
      "matchUpdateTypes": ["minor"],
      "automerge": false,
      "reviewers": ["team:backend"]
    },
    {
      "description": "主版本单独 PR + 安全审查",
      "matchUpdateTypes": ["major"],
      "automerge": false,
      "labels": ["breaking-change"],
      "reviewers": ["team:backend", "team:security"]
    },
    {
      "description": "安全漏洞优先处理",
      "matchCategories": ["security"],
      "automerge": true,
      "priorityPR": true
    }
  ],
  "vulnerabilityAlerts": {
    "enabled": true,
    "labels": ["security"]
  }
}
```

```
自动化流程:
  Dependabot/Renovate 创建 PR
    → CI 自动测试 (单元测试 + 集成测试)
    → SCA 扫描 (检查新版本是否引入新漏洞)
    → 安全补丁自动合并 / 其他人工审查
    → 合并后自动部署到 staging 验证
```

---

## 9. 许可证合规？

**回答：**

```
开源许可证分类:

  宽松 (Permissive) — 商业友好:
    MIT:        几乎无限制, 最宽松
    Apache 2.0: 宽松 + 专利授权
    BSD:        宽松, 类似 MIT

  弱 Copyleft — 需注意:
    LGPL:       动态链接可以, 修改需开源
    MPL 2.0:    修改的文件需开源, 其他不影响

  强 Copyleft — 传染性:
    GPL v2/v3:  衍生作品必须开源 (传染性)
    AGPL v3:    即使 SaaS 也需要开源 (最严格)

风险矩阵:
  ┌──────────────┬──────┬──────┬──────┐
  │ 许可证        │ 内部 │ SaaS │ 分发 │
  ├──────────────┼──────┼──────┼──────┤
  │ MIT/Apache   │ ✅   │ ✅   │ ✅   │
  │ LGPL         │ ✅   │ ✅   │ ⚠️   │
  │ GPL          │ ✅   │ ✅   │ ❌   │
  │ AGPL         │ ✅   │ ❌   │ ❌   │
  │ 无许可证      │ ❌   │ ❌   │ ❌   │
  └──────────────┴──────┴──────┴──────┘
  ⚠️ = 需法律评估   ❌ = 可能违规

检查工具:
  FOSSA: 商业, 全面许可证合规
  license_finder: 开源, Ruby gem
  trivy --scanners license .
  npm license-checker
```

---

## 10. DAST/SCA 面试速答？

**回答：**

```
Q: DAST 是什么?
A: 动态安全测试, 在运行时从外部探测漏洞
   黑盒测试, 不需要源代码
   工具: OWASP ZAP, Burp Suite

Q: SAST/DAST/SCA 该怎么组合?
A: 三者互补:
   编码阶段 → SAST (SonarQube/Semgrep)
   构建阶段 → SCA (Trivy/Snyk 依赖扫描)
   测试阶段 → DAST (ZAP 运行时扫描)
   CI 集成 + 安全门禁自动化

Q: SCA 为什么重要?
A: 应用 70-90% 代码来自开源依赖
   Log4Shell 证明一个依赖漏洞可以影响全球
   SCA 自动扫描依赖中的已知漏洞 (CVE)

Q: 什么是 SBOM?
A: 软件物料清单, 列出所有组件/依赖/版本
   类比食品配料表
   出事时快速排查 (如 Log4Shell → 几秒查到)
   工具: Syft, CycloneDX

Q: 依赖更新怎么管理?
A: Dependabot/Renovate 自动创建更新 PR
   安全补丁: 自动合并 (CI 通过)
   次版本: 人工审查
   主版本: 计划迁移

Q: Trivy 能做什么?
A: 一站式扫描: 依赖漏洞 + 镜像 + IaC + 密钥 + 许可证
   CI 集成: --exit-code 1 --severity CRITICAL
   支持 fs / image / repo / k8s / config 多种扫描
```
