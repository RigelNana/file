# SAST 静态安全扫描

---

## 1. 什么是 SAST？

**回答：**

```
SAST = Static Application Security Testing (静态应用安全测试)

原理: 不运行代码, 直接分析源代码/字节码/二进制文件
      通过模式匹配、数据流分析、控制流分析发现漏洞

特点:
  ✅ 白盒测试: 能看到源代码
  ✅ 早期发现: 编码/构建阶段即可扫描
  ✅ 覆盖率高: 可以扫描所有代码路径
  ✅ 精确定位: 报告漏洞所在的具体代码行
  ❌ 误报率高: 可能标记安全代码为可疑
  ❌ 无法检测运行时问题: 如配置错误、认证绕过
  ❌ 语言相关: 每种语言需要专门的解析器

扫描内容:
  SQL 注入
  XSS (跨站脚本)
  命令注入
  路径遍历
  硬编码密钥/密码
  不安全的加密使用
  缓冲区溢出 (C/C++)
  空指针引用
  竞态条件
```

---

## 2. 常用 SAST 工具对比？

**回答：**

```
┌────────────────┬────────┬─────────────────────────────┐
│ 工具            │ 类型   │ 特点                         │
├────────────────┼────────┼─────────────────────────────┤
│ SonarQube      │ 开源   │ 代码质量 + 安全, 最流行       │
│ Semgrep        │ 开源   │ 轻量, 自定义规则, 多语言      │
│ CodeQL         │ 开源   │ GitHub 出品, 语义分析强       │
│ Bandit         │ 开源   │ Python 专用                  │
│ Brakeman       │ 开源   │ Ruby on Rails 专用           │
│ ESLint Security│ 开源   │ JavaScript/TypeScript        │
│ gosec          │ 开源   │ Go 专用                     │
│ Checkmarx      │ 商业   │ 企业级, 多语言, 深度分析      │
│ Fortify        │ 商业   │ Micro Focus, 企业常用        │
│ Veracode       │ 商业   │ SaaS, 综合安全平台           │
└────────────────┴────────┴─────────────────────────────┘

选型建议:
  初创/小团队:    Semgrep + SonarQube Community
  中型团队:       SonarQube Developer + Semgrep
  大型企业:       Checkmarx / Fortify + SonarQube
  GitHub 用户:    CodeQL (GitHub 免费开放)
  特定语言:       Bandit (Python) / gosec (Go) 等
```

---

## 3. SonarQube 怎么配置和使用？

**回答：**

```yaml
# Docker Compose 部署 SonarQube
version: '3.8'
services:
  sonarqube:
    image: sonarqube:lts-community
    ports:
      - "9000:9000"
    environment:
      SONAR_JDBC_URL: jdbc:postgresql://db:5432/sonarqube
      SONAR_JDBC_USERNAME: sonar
      SONAR_JDBC_PASSWORD: sonar
    volumes:
      - sonarqube_data:/opt/sonarqube/data
      - sonarqube_extensions:/opt/sonarqube/extensions
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      POSTGRES_USER: sonar
      POSTGRES_PASSWORD: sonar
      POSTGRES_DB: sonarqube
    volumes:
      - postgresql_data:/var/lib/postgresql/data

volumes:
  sonarqube_data:
  sonarqube_extensions:
  postgresql_data:
```

```bash
# 项目中创建 sonar-project.properties
cat > sonar-project.properties << 'EOF'
sonar.projectKey=my-project
sonar.projectName=My Project
sonar.sources=src
sonar.tests=tests
sonar.language=py
sonar.python.coverage.reportPaths=coverage.xml
sonar.qualitygate.wait=true
EOF

# 扫描命令
sonar-scanner \
  -Dsonar.host.url=http://sonarqube:9000 \
  -Dsonar.token=$SONAR_TOKEN
```

```
SonarQube 核心概念:
  Quality Gate:  质量门禁 (通过/不通过)
  Quality Profile: 规则集 (每种语言独立)
  Issue:         发现的问题 (Bug/Vulnerability/Code Smell)
  Severity:      Blocker > Critical > Major > Minor > Info
  Technical Debt: 技术债务 (修复所需时间)

默认 Quality Gate 条件:
  新代码覆盖率 ≥ 80%
  新代码重复率 ≤ 3%
  新代码可维护性评级 = A
  新代码可靠性评级 = A
  新代码安全性评级 = A
  新安全热点审查率 = 100%
```

---

## 4. Semgrep 怎么使用？

**回答：**

```bash
# 安装
pip install semgrep

# 快速扫描 (使用官方规则集)
semgrep --config auto .

# 使用特定规则集
semgrep --config p/owasp-top-ten .
semgrep --config p/python .
semgrep --config p/javascript .

# CI 模式 (JSON 输出)
semgrep --config auto --json --output results.json .
```

```yaml
# 自定义 Semgrep 规则: .semgrep.yml
rules:
  # 检测 SQL 注入
  - id: sql-injection
    patterns:
      - pattern: |
          cursor.execute("..." + $VAR + "...")
    message: |
      Possible SQL injection. Use parameterized queries instead.
    severity: ERROR
    languages: [python]
    metadata:
      cwe: "CWE-89"
      owasp: "A03:2021"

  # 检测硬编码密码
  - id: hardcoded-password
    pattern: |
      password = "..."
    message: |
      Hardcoded password detected. Use environment variables or secret manager.
    severity: WARNING
    languages: [python, javascript, java]

  # 检测不安全的 eval
  - id: dangerous-eval
    pattern: eval($X)
    message: |
      eval() is dangerous. Avoid using it with user input.
    severity: ERROR
    languages: [python, javascript]
    metadata:
      cwe: "CWE-95"
```

```
Semgrep 优势:
  速度快: 比传统 SAST 快 10-100 倍
  规则简单: 接近代码的模式匹配语法
  多语言:  支持 30+ 语言
  CI 友好: 增量扫描, 只报新问题
  社区规则: p/owasp-top-ten, p/python 等
```

---

## 5. CodeQL 怎么使用？

**回答：**

```yaml
# GitHub Actions 中使用 CodeQL
name: CodeQL Analysis
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # 每周一扫描

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      actions: read
      contents: read
      security-events: write
    strategy:
      matrix:
        language: ['python', 'javascript']
    steps:
    - name: Checkout
      uses: actions/checkout@v4

    - name: Initialize CodeQL
      uses: github/codeql-action/init@v3
      with:
        languages: ${{ matrix.language }}
        queries: security-extended  # 扩展安全查询

    - name: Autobuild
      uses: github/codeql-action/autobuild@v3

    - name: Perform CodeQL Analysis
      uses: github/codeql-action/analyze@v3
```

```
CodeQL 特点:
  语义分析:  不仅模式匹配, 还做数据流追踪
  查询语言:  类 SQL 的 QL 语言, 高度可定制
  GitHub 集成: 自动扫描 PR, 结果显示在 Security Tab
  免费:       公开仓库免费, 私有仓库需 GHAS 许可

CodeQL 自定义查询:
  // 查找 SQL 注入
  import python
  import semmle.python.security.dataflow.SqlInjectionQuery

  from SqlInjection::Configuration config, DataFlow::PathNode source, DataFlow::PathNode sink
  where config.hasFlowPath(source, sink)
  select sink, source, sink, "SQL injection from $@.", source, "user input"
```

---

## 6. Pre-commit Hook 安全检查？

**回答：**

```yaml
# .pre-commit-config.yaml
repos:
  # 密钥泄漏检测
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.1
    hooks:
    - id: gitleaks

  # Python 安全扫描
  - repo: https://github.com/PyCQA/bandit
    rev: 1.7.6
    hooks:
    - id: bandit
      args: ['-c', 'bandit.yaml']

  # Semgrep
  - repo: https://github.com/semgrep/semgrep
    rev: v1.50.0
    hooks:
    - id: semgrep
      args: ['--config', 'auto', '--error']

  # Terraform 安全扫描
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.83.6
    hooks:
    - id: terraform_tfsec

  # 通用检查
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
    - id: detect-private-key       # 私钥检测
    - id: check-added-large-files  # 大文件检测
    - id: check-merge-conflict     # 合并冲突
```

```bash
# 安装 pre-commit
pip install pre-commit

# 安装 hooks
pre-commit install

# 手动运行所有检查
pre-commit run --all-files

# 提交时自动触发
git commit -m "feat: add feature"
# → 自动运行 gitleaks + bandit + semgrep
# → 发现问题则阻断提交
```

---

## 7. 密钥泄漏检测？

**回答：**

```bash
# gitleaks: 扫描 Git 历史中的密钥
gitleaks detect --source . --report-format json --report-path report.json

# 只扫描未提交的更改
gitleaks protect --staged

# 扫描结果示例
# {
#   "Description": "AWS Access Key",
#   "File": "config.py",
#   "Line": 15,
#   "Secret": "AKIA**********",
#   "Commit": "abc123"
# }

# TruffleHog: 更深度的密钥检测
trufflehog git file://. --only-verified
trufflehog github --org=myorg --only-verified

# git-secrets: AWS 官方工具
git secrets --install
git secrets --register-aws
git secrets --scan
```

```
常见泄漏类型:
  AWS Access Key:    AKIA...
  GitHub Token:      ghp_...
  Private Key:       -----BEGIN RSA PRIVATE KEY-----
  数据库密码:         password = "xxx"
  API Key:           api_key = "xxx"
  Slack Webhook:     hooks.slack.com/services/...

防护层次:
  1. Pre-commit: 提交前检测 (gitleaks)
  2. CI Pipeline: 构建时扫描 (gitleaks/TruffleHog)
  3. 定时扫描:   定期扫描已有代码和历史
  4. GitHub:     Secret scanning (自动检测已知模式)
  5. 监控:       密钥使用异常告警

泄漏后处理:
  1. 立即轮换泄漏的密钥 (不是删 Git 历史!)
  2. 检查密钥是否被恶意使用 (审计日志)
  3. Git 历史清理 (BFG Repo-Cleaner / git filter-branch)
  4. 通知安全团队
  5. 复盘和改进流程
```

---

## 8. SAST 误报处理？

**回答：**

```
误报率: SAST 工具误报率通常 30-70%

处理策略:
  1. 确认误报 → 标记为误报 (Won't Fix / False Positive)
  2. 调整规则 → 排除不适用的规则
  3. 基线管理 → 只关注新增问题 (增量扫描)

SonarQube 误报处理:
  - 在界面标记为 "False Positive" 或 "Won't Fix"
  - 添加行内注释:
    // NOSONAR
    # noinspection: S1234

Semgrep 抑制:
  # nosemgrep: rule-id
  password = get_secret()  # nosemgrep: hardcoded-password

  # .semgrepignore 文件
  tests/
  docs/
  vendor/

减少误报:
  ┌──────────────────────┬──────────────────────────────┐
  │ 方法                  │ 说明                          │
  ├──────────────────────┼──────────────────────────────┤
  │ 规则调优              │ 禁用不适用的规则               │
  │ 增量扫描              │ 只报新增代码的问题             │
  │ 排除路径              │ 排除测试代码/生成代码          │
  │ 自定义规则            │ 编写适合项目的规则             │
  │ 工具组合              │ 多工具交叉验证, 降低误报       │
  └──────────────────────┴──────────────────────────────┘

度量:
  真阳率 = 真正漏洞 / 所有报告
  目标: 真阳率 > 50% (否则开发者会忽略所有告警)
```

---

## 9. 代码审查安全 Checklist？

**回答：**

```
代码审查 (Code Review) 安全检查清单:

1. 输入验证
   □ 所有外部输入都有验证?
   □ 使用白名单而非黑名单?
   □ 文件上传有类型/大小限制?

2. 认证和授权
   □ API 端点有认证保护?
   □ 权限检查在服务端执行?
   □ 密码使用安全哈希 (bcrypt/argon2)?

3. 数据保护
   □ 敏感数据加密存储?
   □ 日志中不包含敏感信息?
   □ API 响应不泄漏内部信息?

4. SQL 和注入
   □ 使用参数化查询/ORM?
   □ 没有字符串拼接 SQL?
   □ 没有 eval/exec 执行用户输入?

5. 密钥管理
   □ 没有硬编码密码/密钥?
   □ 使用环境变量或密钥管理服务?
   □ .gitignore 排除了敏感文件?

6. 错误处理
   □ 错误消息不暴露技术细节?
   □ 异常被正确捕获和处理?

7. 依赖
   □ 新增依赖是否有已知漏洞?
   □ 锁文件 (lock file) 已更新?

PR 安全标签:
  [security-review-needed] → 涉及认证/授权/加密变更
  [security-approved]      → 安全团队已审查
```

---

## 10. SAST 面试速答？

**回答：**

```
Q: SAST 是什么?
A: 静态应用安全测试, 不运行代码, 直接分析源代码
   发现 SQL 注入/XSS/硬编码密钥等漏洞
   白盒测试, 编码阶段即可使用

Q: SAST 和 DAST 的区别?
A: SAST: 白盒, 分析源码, 早期发现, 误报高
   DAST: 黑盒, 测试运行中的应用, 发现运行时漏洞
   互补关系: CI 用 SAST, 测试环境用 DAST

Q: 常用 SAST 工具?
A: SonarQube (代码质量+安全, 最流行)
   Semgrep (轻量快速, 自定义规则)
   CodeQL (GitHub, 语义分析)
   商业: Checkmarx, Fortify

Q: 怎么处理 SAST 误报?
A: 1. 标记误报 (False Positive)
   2. 调优规则 (禁用不适用的)
   3. 增量扫描 (只报新增问题)
   4. 排除路径 (测试代码/生成代码)
   目标: 真阳率 > 50%

Q: 怎么在 CI 中集成 SAST?
A: 构建阶段运行扫描
   安全门禁: CRITICAL → 阻断, HIGH → 审批
   增量扫描 + PR 评论 + Quality Gate 
   工具: SonarQube Scanner / Semgrep CI / CodeQL Action

Q: Pre-commit 做什么安全检查?
A: gitleaks 密钥泄漏检测
   bandit/gosec 语言级安全扫描
   detect-private-key 私钥检测
   提交前自动运行, 阻断不安全提交
```
