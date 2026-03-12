# 安全与 DevSecOps 八股文

---

## 一、DevSecOps 基础

### 1. 什么是 DevSecOps？与传统安全有何区别？

**答：**

DevSecOps 是将安全实践集成到 DevOps 流程的每个阶段，实现"安全左移"（Shift Left Security）。

```
传统模式: 开发 → 测试 → 安全审查（最后） → 部署
                                ↑ 发现问题成本高

DevSecOps: [安全贯穿全流程]
  Plan → Code → Build → Test → Release → Deploy → Operate → Monitor
   ↑       ↑      ↑       ↑       ↑         ↑        ↑         ↑
  威胁建模 代码扫描 依赖扫描 DAST  合规检查  镜像扫描  运行时安全 安全监控
```

| 对比 | 传统安全 | DevSecOps |
|------|---------|-----------|
| 介入时机 | 开发完成后 | 全流程 |
| 责任归属 | 安全团队 | 全员（共同责任） |
| 发现问题 | 上线前/后 | 编码阶段即发现 |
| 修复成本 | 高 | 低 |
| 自动化 | 少 | 大量自动化工具 |

---

## 二、代码安全扫描

### 2. SAST 和 DAST 的区别？

**答：**

| 特性 | SAST (静态) | DAST (动态) |
|------|------------|------------|
| 全称 | Static Application Security Testing | Dynamic Application Security Testing |
| 扫描对象 | 源代码/字节码 | 运行中的应用 |
| 扫描阶段 | 编码/构建阶段 | 测试/部署阶段 |
| 优点 | 早期发现、覆盖率高 | 发现运行时漏洞 |
| 缺点 | 误报率高 | 覆盖率有限 |
| 工具 | SonarQube, Semgrep, CodeQL | OWASP ZAP, Burp Suite |

**还有：**
- **SCA (Software Composition Analysis)**：扫描第三方依赖漏洞
  - 工具：Snyk, Dependabot, Trivy
- **IAST (Interactive AST)**：结合 SAST 和 DAST
  - 在运行时通过插桩检测

### 3. 如何在 CI/CD 流水线中集成安全扫描？

**答：**

```yaml
# GitLab CI 安全扫描示例
stages:
  - build
  - security
  - test
  - deploy

# SAST 代码扫描
sast_scan:
  stage: security
  image: sonarsource/sonar-scanner-cli:latest
  script:
    - sonar-scanner
      -Dsonar.projectKey=my-project
      -Dsonar.host.url=$SONAR_URL
      -Dsonar.token=$SONAR_TOKEN
  allow_failure: false

# 依赖漏洞扫描 (SCA)
dependency_scan:
  stage: security
  image: aquasec/trivy:latest
  script:
    - trivy fs --exit-code 1 --severity HIGH,CRITICAL .

# 容器镜像扫描
image_scan:
  stage: security
  image: aquasec/trivy:latest
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

# DAST 动态扫描
dast_scan:
  stage: test
  image: ghcr.io/zaproxy/zaproxy:stable
  script:
    - zap-baseline.py -t https://staging.example.com -r report.html
  artifacts:
    paths:
      - report.html
```

---

## 三、OWASP Top 10

### 4. OWASP Top 10 常见安全漏洞有哪些？

**答：**

| 排名 | 漏洞类型 | 说明 | 防护措施 |
|------|---------|------|---------|
| 1 | **失效的访问控制** | 权限绕过 | RBAC、默认拒绝、API 鉴权 |
| 2 | **加密机制失效** | 敏感数据未加密 | TLS、数据加密、密钥管理 |
| 3 | **注入攻击** | SQL/XSS/命令注入 | 参数化查询、输入验证、转义 |
| 4 | **不安全设计** | 架构层面缺陷 | 威胁建模、安全设计原则 |
| 5 | **安全配置错误** | 默认密码、调试开启 | 安全基线、最小化安装 |
| 6 | **脆弱过时组件** | 使用有漏洞的依赖 | SCA 扫描、及时更新 |
| 7 | **认证和身份验证失效** | 弱密码、无MFA | MFA、密码策略、会话管理 |
| 8 | **软件完整性失败** | 不安全的 CI/CD | 签名验证、供应链安全 |
| 9 | **安全日志监控失效** | 缺乏审计日志 | 集中日志、告警、SIEM |
| 10 | **SSRF** | 服务端请求伪造 | 白名单、网络隔离 |

---

## 四、容器安全

### 5. Docker/容器安全最佳实践？

**答：**

```dockerfile
# 1. 使用最小基础镜像
FROM alpine:3.18              # ✅ 而非 ubuntu
FROM gcr.io/distroless/base   # ✅ 更极致

# 2. 非 root 用户运行
RUN addgroup -S app && adduser -S app -G app
USER app

# 3. 多阶段构建减少攻击面
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN CGO_ENABLED=0 go build -o server .

FROM alpine:3.18
COPY --from=builder /app/server /server
USER nobody
ENTRYPOINT ["/server"]

# 4. 不在镜像中包含敏感信息
# ❌ COPY config.json /app/
# ✅ 使用环境变量或挂载 Secret
```

**安全清单：**

| 层面 | 实践 |
|------|------|
| 镜像 | 最小化基础镜像、定期扫描漏洞、签名验证 |
| 构建 | 不使用 `--privileged`、不暴露 Docker Socket |
| 运行 | 非 root、只读文件系统、资源限制 |
| 网络 | 使用网络策略限制容器间通信 |
| 仓库 | 私有 Registry、镜像签名 (Cosign/Notary) |

### 6. Kubernetes 安全最佳实践？

**答：**

```yaml
# 1. Pod 安全上下文
apiVersion: v1
kind: Pod
spec:
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 2000
  containers:
  - name: app
    securityContext:
      allowPrivilegeEscalation: false
      readOnlyRootFilesystem: true
      capabilities:
        drop: ["ALL"]
    resources:
      limits:
        cpu: "500m"
        memory: "256Mi"

# 2. NetworkPolicy 限制网络
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-all-ingress
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  # 默认拒绝所有入站流量

# 3. RBAC 最小权限
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
rules:
- apiGroups: [""]
  resources: ["pods"]
  verbs: ["get", "list", "watch"]
```

**K8s 安全清单：**
- 启用 RBAC，禁用匿名访问
- 使用 NetworkPolicy 限制 Pod 间通信
- Secret 加密存储 (EncryptionConfiguration)
- 启用审计日志（Audit Policy）
- 定期扫描镜像和集群配置（kube-bench）
- Pod Security Standards (Restricted)

---

## 五、密钥与凭证管理

### 7. 如何安全管理密钥和凭证？

**答：**

| 工具 | 类型 | 适用场景 |
|------|------|---------|
| **HashiCorp Vault** | 专用密钥管理 | 企业级密钥管理、动态凭证 |
| **AWS Secrets Manager** | 云托管 | AWS 环境 |
| **Azure Key Vault** | 云托管 | Azure 环境 |
| **Sealed Secrets** | K8s 加密 Secret | GitOps 场景 |
| **SOPS** | 文件加密 | 配置文件加密 |

**最佳实践：**
- ❌ 绝不在代码中硬编码密钥
- ❌ 绝不将密钥提交到 Git 仓库
- ✅ 使用 `.gitignore` 排除敏感文件
- ✅ 使用 `git-secrets` / `gitleaks` 扫描泄漏
- ✅ 使用环境变量或密钥管理服务
- ✅ 定期轮换密钥

```bash
# gitleaks 扫描 Git 历史中的密钥泄漏
gitleaks detect --source . --report-format json --report-path report.json

# SOPS 加密配置文件
sops --encrypt --kms arn:aws:kms:... secrets.yaml > secrets.enc.yaml
```

---

## 六、网络安全

### 8. 常见的网络攻击和防护？

**答：**

| 攻击类型 | 说明 | 防护 |
|---------|------|------|
| **DDoS** | 分布式拒绝服务 | WAF、CDN、限流、云防护 |
| **SQL 注入** | 恶意 SQL 语句 | 参数化查询、ORM |
| **XSS** | 跨站脚本攻击 | 输入转义、CSP、HttpOnly Cookie |
| **CSRF** | 跨站请求伪造 | CSRF Token、SameSite Cookie |
| **中间人攻击** | 窃听/篡改流量 | HTTPS/TLS、证书校验 |
| **暴力破解** | 穷举密码 | 限速、MFA、账号锁定 |

### 9. SSL/TLS 证书管理？

**答：**

```bash
# Let's Encrypt 免费证书（Certbot）
certbot certonly --nginx -d example.com -d www.example.com

# 自动续期
certbot renew --dry-run

# K8s 中使用 cert-manager 自动管理
```

```yaml
# cert-manager 自动签发证书
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: example-com-tls
spec:
  secretName: example-com-tls
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
  - example.com
  - www.example.com
```

---

## 七、合规与审计

### 10. 常见的安全合规标准？

**答：**

| 标准 | 领域 | 说明 |
|------|------|------|
| **SOC 2** | 通用 | 服务组织控制报告（安全、可用性、保密性等） |
| **ISO 27001** | 通用 | 信息安全管理体系 |
| **PCI DSS** | 支付 | 支付卡数据安全标准 |
| **HIPAA** | 医疗 | 健康信息保护法案 |
| **GDPR** | 隐私 | 欧盟通用数据保护条例 |
| **等保 2.0** | 国内 | 信息安全等级保护 |

### 11. 安全审计和监控如何实施？

**答：**

```
安全监控架构:
  
  收集层: 系统日志 + 应用日志 + 审计日志 + 网络流量
      ↓
  传输层: Filebeat / Fluentd
      ↓
  处理层: Logstash / Kafka
      ↓
  存储层: Elasticsearch / S3
      ↓
  分析层: SIEM (Security Information and Event Management)
      ↓
  响应层: 告警 → 工单 → 应急响应
```

**关键审计项：**
- 用户登录/登出记录
- 权限变更操作
- 敏感数据访问
- 系统配置变更
- 异常行为检测（异地登录、暴力破解等）

**工具：**
| 类型 | 工具 |
|------|------|
| SIEM | Splunk, ELK + Security, AWS Security Hub |
| 入侵检测 | OSSEC, Falco (容器) |
| 配置合规 | Open Policy Agent (OPA), kube-bench |
| 漏洞管理 | Nessus, OpenVAS, Trivy |

---

## 八、应急响应

### 12. 安全事件应急响应流程？

**答：**

```
1. 准备 (Preparation)
   └── 建立应急预案、演练

2. 检测 (Detection)
   └── 监控告警、日志分析、异常发现

3. 遏制 (Containment)
   └── 隔离受影响系统、阻断攻击路径

4. 消除 (Eradication)
   └── 清除恶意程序、修复漏洞

5. 恢复 (Recovery)
   └── 恢复服务、验证安全

6. 复盘 (Lessons Learned)
   └── 事后分析、改进措施、更新预案
```

**DevOps 视角的快速响应：**
- 自动化隔离脚本（一键封禁 IP、隔离 Pod）
- 基础设施即代码快速重建
- 容器不可变基础设施（销毁重建而非修补）
- Git 回滚到安全版本
