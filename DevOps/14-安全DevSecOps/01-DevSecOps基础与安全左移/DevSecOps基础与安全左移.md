# DevSecOps 基础与安全左移

---

## 1. 什么是 DevSecOps？

**回答：**

```
DevSecOps = Development + Security + Operations

核心理念: 将安全融入 DevOps 全生命周期, 而非事后补救

传统模式:
  开发 → 测试 → 安全审查(最后阶段) → 部署
                      ↑ 成本高, 修复难

DevSecOps 模式:
  Plan → Code → Build → Test → Release → Deploy → Operate → Monitor
   ↑       ↑      ↑       ↑       ↑         ↑        ↑         ↑
  威胁    代码   依赖    DAST   合规      镜像    运行时    安全
  建模    扫描   扫描           检查      扫描    安全      监控
  (SAST)  (SCA)         (签名)

三大支柱:
  1. 文化:  安全是所有人的责任 (共同责任模型)
  2. 自动化: 在 CI/CD 中嵌入安全检查
  3. 持续:  安全不是一次性动作, 持续改进

DevSecOps ≠ "在 pipeline 里加个扫描工具"
DevSecOps = 安全思维贯穿设计、编码、部署、运维全流程
```

---

## 2. 安全左移 (Shift Left Security) 是什么？

**回答：**

```
安全左移: 把安全工作从右边 (发布/运维) 移到左边 (设计/编码)

时间轴 (左 → 右):
  设计 → 编码 → 构建 → 测试 → 部署 → 运维
  ←── 左移安全

为什么左移?
  越早发现漏洞, 修复成本越低:

  阶段         修复成本 (相对)
  ──────────   ──────────────
  设计阶段      1x
  编码阶段      5x
  测试阶段      10x
  生产环境      100x

  IBM 研究: 生产环境修复安全漏洞的成本是设计阶段的 100 倍

左移实践:
  ┌──────────────────┬──────────────────────────────┐
  │ 阶段              │ 安全实践                      │
  ├──────────────────┼──────────────────────────────┤
  │ 需求 / 设计       │ 威胁建模 (STRIDE)              │
  │ 编码              │ 安全编码规范 + IDE 插件        │
  │ 提交              │ Pre-commit Hook (gitleaks)    │
  │ PR / MR           │ 代码审查 (安全 Checklist)      │
  │ CI 构建           │ SAST + SCA 扫描               │
  │ 测试              │ DAST + 渗透测试               │
  │ 部署              │ 镜像扫描 + 合规检查            │
  │ 运行时            │ WAF + 入侵检测                │
  └──────────────────┴──────────────────────────────┘
```

---

## 3. 威胁建模 (Threat Modeling) 怎么做？

**回答：**

```
威胁建模: 系统设计阶段识别潜在安全威胁

常用方法: STRIDE 模型 (微软提出)

  ┌──────────────────┬──────────────────────────────┐
  │ 威胁              │ 说明                          │
  ├──────────────────┼──────────────────────────────┤
  │ S - Spoofing     │ 仿冒身份                      │
  │ T - Tampering    │ 篡改数据                      │
  │ R - Repudiation  │ 否认操作                      │
  │ I - Info Disclosure │ 信息泄露                   │
  │ D - Denial of Service │ 拒绝服务               │
  │ E - Elevation of Privilege │ 权限提升           │
  └──────────────────┴──────────────────────────────┘

威胁建模步骤:
  1. 画数据流图 (DFD)
     - 识别外部实体、进程、数据存储、数据流
  2. 识别威胁
     - 对每个组件用 STRIDE 分析
  3. 评估风险
     - 严重程度 × 可能性 = 风险等级
  4. 制定缓解措施
     - 对高风险威胁制定对策
  5. 验证
     - 验证缓解措施是否有效

示例: Web 应用威胁建模
  ┌─────────┐     HTTPS     ┌──────────┐     SQL      ┌──────────┐
  │ 用户     │ ──────────→  │ Web 服务  │ ─────────→  │ 数据库   │
  └─────────┘              └──────────┘              └──────────┘

  威胁分析:
  - S: 用户身份仿冒 → MFA + JWT
  - T: 请求篡改      → HTTPS + 请求签名
  - R: 操作否认      → 审计日志
  - I: 数据泄露      → 加密 + 脱敏
  - D: DDoS 攻击     → 限流 + WAF
  - E: 权限提升      → RBAC + 最小权限

工具:
  Microsoft Threat Modeling Tool
  OWASP Threat Dragon (开源)
  IriusRisk
```

---

## 4. DevSecOps 成熟度模型？

**回答：**

```
成熟度级别 (从低到高):

Level 0 - 无安全 (Ad Hoc)
  没有安全流程
  安全靠运气
  漏洞靠用户发现

Level 1 - 反应式 (Reactive)
  出事了才修
  手动安全测试
  安全团队孤立

Level 2 - 主动式 (Proactive)
  CI/CD 集成安全扫描
  定期渗透测试
  安全意识培训

Level 3 - 自动化 (Automated)
  安全门禁自动化 (阻断式)
  策略即代码 (OPA)
  自动漏洞管理

Level 4 - 持续优化 (Optimized)
  安全指标度量 (MTTR, 漏洞密度)
  威胁情报驱动
  全员安全文化

评估维度:
  ┌──────────────────┬───────────────────────────────┐
  │ 维度              │ 评估指标                       │
  ├──────────────────┼───────────────────────────────┤
  │ 代码安全          │ SAST 覆盖率, 代码审查率         │
  │ 依赖安全          │ SCA 扫描率, 漏洞修复 SLA        │
  │ 基础设施安全      │ IaC 扫描率, 配置合规率           │
  │ 运行时安全        │ 容器扫描率, 运行时检测           │
  │ 响应能力          │ MTTR, 事件响应时间              │
  │ 安全文化          │ 培训完成率, 安全意识             │
  └──────────────────┴───────────────────────────────┘
```

---

## 5. DevSecOps 工具链全景？

**回答：**

```
完整工具链 (按阶段):

Plan (计划):
  威胁建模:    OWASP Threat Dragon, Microsoft TMT
  安全需求:    OWASP ASVS (应用安全验证标准)

Code (编码):
  IDE 安全插件: SonarLint, Semgrep, Snyk IDE
  密钥检测:    gitleaks, git-secrets, TruffleHog
  Pre-commit:  pre-commit hooks (lint + 密钥扫描)

Build (构建):
  SAST:       SonarQube, Semgrep, CodeQL, Checkmarx
  SCA:        Snyk, Dependabot, OWASP Dependency-Check
  License:    FOSSA, Black Duck (许可证合规)

Test (测试):
  DAST:       OWASP ZAP, Burp Suite, Nuclei
  IAST:       Contrast Security, Hdiv
  渗透测试:   手动 + 自动化

Release (发布):
  镜像签名:   Cosign, Notary
  SBOM:       Syft, CycloneDX (软件物料清单)
  合规检查:   OPA, Checkov

Deploy (部署):
  镜像扫描:   Trivy, Snyk Container, Clair
  IaC 扫描:   Checkov, tfsec, Terrascan
  K8s 策略:   Kyverno, OPA Gatekeeper

Operate (运维):
  运行时安全:  Falco, Sysdig, Aqua
  WAF:        AWS WAF, Cloudflare WAF, ModSecurity
  
Monitor (监控):
  SIEM:       Splunk, ELK + Security, AWS Security Hub
  漏洞管理:   DefectDojo, Archery
  告警:       PagerDuty, OpsGenie
```

---

## 6. CI/CD 安全门禁 (Security Gates) 怎么设计？

**回答：**

```yaml
# 安全门禁设计: 根据严重程度决定是否阻断

# GitLab CI 示例
stages:
  - code-quality
  - security-scan
  - security-gate     # 安全门禁
  - test
  - deploy

# SAST 扫描
sast:
  stage: security-scan
  image: sonarsource/sonar-scanner-cli
  script:
    - sonar-scanner ...
  artifacts:
    reports:
      sast: gl-sast-report.json

# SCA 依赖扫描
sca:
  stage: security-scan
  script:
    - trivy fs --format json --output trivy-report.json .
  artifacts:
    paths:
      - trivy-report.json

# 安全门禁: 根据策略决定是否放行
security_gate:
  stage: security-gate
  script:
    - |
      # 策略: CRITICAL 直接阻断, HIGH 需审批
      CRITICAL=$(cat trivy-report.json | jq '[.Results[].Vulnerabilities[] | select(.Severity=="CRITICAL")] | length')
      HIGH=$(cat trivy-report.json | jq '[.Results[].Vulnerabilities[] | select(.Severity=="HIGH")] | length')
      
      echo "Critical: $CRITICAL, High: $HIGH"
      
      if [ "$CRITICAL" -gt 0 ]; then
        echo "❌ CRITICAL vulnerabilities found. Blocking deployment."
        exit 1
      fi
      
      if [ "$HIGH" -gt 5 ]; then
        echo "⚠️ Too many HIGH vulnerabilities. Needs review."
        exit 1
      fi
      
      echo "✅ Security gate passed."
```

```
门禁策略矩阵:
  ┌──────────────┬────────┬────────┬─────────┬─────────┐
  │ 严重程度      │ 开发    │ 预发    │ 生产     │ 处理    │
  ├──────────────┼────────┼────────┼─────────┼─────────┤
  │ CRITICAL     │ 警告    │ 阻断    │ 阻断     │ 24h 修复│
  │ HIGH         │ 警告    │ 审批    │ 阻断     │ 7d 修复 │
  │ MEDIUM       │ 通过    │ 警告    │ 审批     │ 30d 修复│
  │ LOW          │ 通过    │ 通过    │ 警告     │ 下版本  │
  └──────────────┴────────┴────────┴─────────┴─────────┘
```

---

## 7. 供应链安全 (Supply Chain Security)？

**回答：**

```
供应链攻击: 通过第三方依赖/工具注入恶意代码

典型事件:
  SolarWinds (2020):  构建系统被篡改, 影响 18000 客户
  Log4Shell (2021):   Log4j 远程代码执行, 影响全球
  event-stream:       npm 包被劫持, 窃取加密货币
  codecov (2021):     CI 工具被篡改, 窃取环境变量

防护措施:
  1. SBOM (Software Bill of Materials) — 软件物料清单
     记录所有依赖及版本
     工具: Syft, CycloneDX, SPDX
     
     # 生成 SBOM
     syft packages ./my-app -o cyclonedx-json > sbom.json

  2. 依赖锁定
     package-lock.json / yarn.lock / go.sum
     pip freeze > requirements.txt
     确保构建可重现

  3. 签名验证
     镜像签名: cosign sign / cosign verify
     包签名:   npm audit signatures
     Git 签名: git commit -S (GPG 签名)

  4. 私有仓库
     内部 registry (Nexus, Artifactory)
     只允许审核过的依赖
     镜像白名单

  5. SLSA 框架 (Supply-chain Levels for Software Artifacts)
     Level 1: 构建有记录
     Level 2: 使用托管构建服务
     Level 3: 构建平台可审计
     Level 4: 完全可重现构建

  6. Sigstore — 开源签名基础设施
     cosign: 容器镜像签名
     fulcio: 无密钥签名 (Keyless)
     rekor:  透明日志 (Transparency Log)
```

---

## 8. 安全即代码 (Security as Code)？

**回答：**

```
安全即代码: 用代码定义安全策略, 版本控制 + 自动执行

1. 策略即代码 (Policy as Code) — OPA/Rego
```

```rego
# OPA Rego 策略: 禁止容器以 root 运行
package kubernetes.admission

deny[msg] {
    input.request.kind.kind == "Pod"
    container := input.request.object.spec.containers[_]
    not container.securityContext.runAsNonRoot
    msg := sprintf("Container '%v' must set runAsNonRoot=true", [container.name])
}

# 策略: 镜像必须来自内部 registry
deny[msg] {
    container := input.request.object.spec.containers[_]
    not startswith(container.image, "registry.internal.com/")
    msg := sprintf("Image '%v' must be from internal registry", [container.image])
}
```

```
2. 合规即代码 (Compliance as Code) — Checkov/InSpec

   # Checkov 扫描 Terraform
   checkov -d ./terraform/ --framework terraform
   
   # InSpec 合规检查
   inspec exec linux-baseline

3. 基础设施安全扫描

   # tfsec: Terraform 安全扫描  
   tfsec ./terraform/

   # Checkov: 多框架支持
   checkov -d . --framework terraform,kubernetes,dockerfile

4. Kubernetes 安全策略
```

```yaml
# Kyverno 策略: 强制使用资源限制
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: require-resource-limits
spec:
  validationFailureAction: Enforce
  rules:
  - name: check-limits
    match:
      any:
      - resources:
          kinds:
          - Pod
    validate:
      message: "All containers must have resource limits."
      pattern:
        spec:
          containers:
          - resources:
              limits:
                memory: "?*"
                cpu: "?*"
```

---

## 9. 安全指标与度量？

**回答：**

```
核心安全指标:

  ┌──────────────────────┬──────────────────────────────┐
  │ 指标                  │ 说明                          │
  ├──────────────────────┼──────────────────────────────┤
  │ MTTR (修复时间)       │ 从发现到修复漏洞的平均时间     │
  │ 漏洞密度              │ 每千行代码的漏洞数             │
  │ 扫描覆盖率            │ 被安全扫描覆盖的代码/镜像比例  │
  │ 门禁通过率            │ 一次通过安全门禁的比例          │
  │ 开放漏洞数            │ 未修复漏洞数量 (按严重程度)     │
  │ 漏洞修复 SLA 达标率   │ 在规定时间内修复的比例          │
  │ 第三方组件漏洞率      │ 依赖中含已知漏洞的比例          │
  │ 安全事件数            │ 安全事件的发生频率              │
  └──────────────────────┴──────────────────────────────┘

漏洞修复 SLA:
  Critical: 24 小时
  High:     7 天
  Medium:   30 天
  Low:      下个迭代

Dashboard 示例 (Grafana):
  Panel 1: 开放漏洞数趋势 (按严重程度)
  Panel 2: MTTR 趋势 (越低越好)
  Panel 3: 安全门禁通过率 (目标 >90%)
  Panel 4: 各项目扫描覆盖率
  Panel 5: 漏洞 SLA 达标率

成熟度追踪:
  月度安全报告 → 季度趋势分析 → 年度目标设定
  关键: 量化进步, 而非仅仅追求零漏洞
```

---

## 10. DevSecOps 面试速答？

**回答：**

```
Q: DevSecOps 和传统安全的区别?
A: 传统安全在发布前审查, DevSecOps 全流程嵌入安全
   关键词: 安全左移, 自动化, 全员责任

Q: 安全左移是什么意思?
A: 将安全工作从发布/运维阶段提前到设计/编码阶段
   越早发现漏洞, 修复成本越低 (设计阶段 vs 生产 = 1x vs 100x)

Q: CI/CD 中怎么集成安全?
A: Code → Pre-commit (gitleaks 密钥检测)
   Build → SAST (SonarQube) + SCA (Snyk/Trivy)
   Test  → DAST (OWASP ZAP)
   Deploy → 镜像扫描 (Trivy) + IaC 扫描 (Checkov)
   安全门禁: CRITICAL 阻断, HIGH 审批

Q: 什么是威胁建模?
A: 设计阶段识别安全威胁, 常用 STRIDE 模型
   S 仿冒 / T 篡改 / R 否认 / I 泄露 / D 拒绝服务 / E 提权
   步骤: 画 DFD → STRIDE 分析 → 评估风险 → 制定缓解

Q: 供应链安全怎么做?
A: SBOM (Syft) + 依赖锁定 + 签名验证 (Cosign)
   + 私有 Registry + SLSA 框架
   典型案例: Log4Shell, SolarWinds

Q: 策略即代码是什么?
A: 用代码定义安全策略, 自动执行
   OPA/Rego 定义准入策略 (禁 root, 镜像白名单)
   Kyverno K8s 原生策略引擎s
   好处: 版本控制, 自动化, 可审计
```
