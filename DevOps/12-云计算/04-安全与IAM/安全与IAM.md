# 安全与 IAM

---

## 1. IAM 核心概念？

**回答：**

```
IAM (Identity and Access Management):

  ┌── IAM 体系 ─────────────────────────────────────┐
  │                                                  │
  │  User (用户)       → 个人身份, 长期凭证           │
  │  Group (组)        → 用户逻辑分组, 批量授权        │
  │  Role (角色)       → 临时身份, 无长期凭证          │
  │  Policy (策略)     → JSON 权限文档                │
  │                                                  │
  │  关系:                                           │
  │    User → 加入 Group → 继承 Group 的 Policy       │
  │    User → 直接附加 Policy                         │
  │    Role → 附加 Policy → 被 EC2/Lambda/用户 Assume │
  └──────────────────────────────────────────────────┘

Principal (身份主体):
  AWS Account
  IAM User
  IAM Role
  Federated User (外部身份)
  AWS Service (如 EC2, Lambda)

Root Account:
  ✗ 日常不使用 Root
  ✓ 启用 MFA
  ✓ 仅用于: 首次设置, 修改账单, 关闭账号等特殊操作
  ✓ 创建 IAM Admin 用户替代

IAM User vs IAM Role:
  User: 长期凭证 (Access Key), 人员使用
  Role: 临时凭证 (STS), 服务/跨账号使用
  最佳实践: 优先使用 Role
```

---

## 2. IAM Policy 详解？

**回答：**

```json
// Policy 结构
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3Read",
      "Effect": "Allow",            // Allow 或 Deny
      "Action": [                   // 操作
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [                 // 资源 ARN
        "arn:aws:s3:::my-bucket",
        "arn:aws:s3:::my-bucket/*"
      ],
      "Condition": {                // 条件 (可选)
        "IpAddress": {
          "aws:SourceIp": "10.0.0.0/8"
        }
      }
    }
  ]
}
```

```
Policy 类型:
  ┌──────────────────┬──────────────────────────────────┐
  │ 类型              │ 说明                             │
  ├──────────────────┼──────────────────────────────────┤
  │ AWS Managed      │ AWS 预定义 (如 AdministratorAccess)│
  │ Customer Managed │ 自定义策略                         │
  │ Inline           │ 直接嵌入 User/Group/Role (不推荐)  │
  ├──────────────────┼──────────────────────────────────┤
  │ Identity-based   │ 附加到 User/Group/Role            │
  │ Resource-based   │ 附加到资源 (S3 桶策略, SQS 策略)   │
  │ Permission Boundary│ 权限边界 (限制最大权限)           │
  │ SCP              │ 组织级服务控制策略                  │
  │ Session Policy   │ 临时会话级策略                     │
  └──────────────────┴──────────────────────────────────┘

权限评估逻辑:
  1. 默认拒绝 (Implicit Deny)
  2. 检查 SCP → Deny 优先
  3. 检查 Resource-based Policy
  4. 检查 Permission Boundary
  5. 检查 Identity-based Policy
  6. 任何显式 Deny → 拒绝 (Explicit Deny 最高优先)

  口诀: "Deny 优先, 显式 > 隐式"

常用条件键:
  aws:SourceIp         → 限制来源 IP
  aws:CurrentTime      → 限制时间
  aws:RequestedRegion  → 限制 Region
  aws:PrincipalTag     → 基于标签的控制 (ABAC)
  aws:MultiFactorAuth  → 要求 MFA
```

---

## 3. IAM Role 与跨账号访问？

**回答：**

```
IAM Role 使用场景:

1. EC2 Instance Role
   EC2 → Instance Profile → IAM Role → 访问 S3/DynamoDB
   无需在 EC2 上存储 Access Key
   通过 metadata endpoint 获取临时凭证

2. Lambda Execution Role
   Lambda 函数执行时 assume 的角色
   定义 Lambda 可以访问哪些 AWS 资源

3. ECS Task Role
   每个 Task 可以有独立的 IAM Role
   细粒度权限控制

4. 跨账号访问 (Cross-Account)
   Account A (信任方) → 创建 Role → 信任 Account B
   Account B (请求方) → AssumeRole → 获取临时凭证

   Trust Policy (信任策略):
   {
     "Effect": "Allow",
     "Principal": {
       "AWS": "arn:aws:iam::ACCOUNT_B_ID:root"
     },
     "Action": "sts:AssumeRole",
     "Condition": {
       "StringEquals": {
         "sts:ExternalId": "unique-external-id"
       }
     }
   }

5. 联合身份 (Federation)
   SAML 2.0: 企业 IdP (Okta, AD FS) → AWS
   Web Identity: Google/Facebook → Cognito → AWS
   SSO: AWS IAM Identity Center (推荐)
```

```
STS (Security Token Service):
  AssumeRole:             跨账号/跨服务
  AssumeRoleWithSAML:     SAML 联合身份
  AssumeRoleWithWebIdentity: Web 联合身份
  GetSessionToken:        MFA 临时凭证

  临时凭证包含:
    AccessKeyId
    SecretAccessKey
    SessionToken
    Expiration (1-12 小时)
```

---

## 4. KMS 密钥管理？

**回答：**

```
KMS (Key Management Service):

  密钥层次:
    CMK (Customer Master Key)
      → 用于生成/加密 Data Key
      → 不直接加密数据 (除小于 4KB)
    
    Data Key
      → CMK 生成的数据密钥
      → 用于加密实际数据
      → 信封加密 (Envelope Encryption)

  信封加密流程:
    1. 请求 KMS 生成 Data Key
    2. 收到: 明文 Data Key + 密文 Data Key
    3. 用明文 Data Key 加密数据
    4. 丢弃明文 Data Key
    5. 存储: 加密数据 + 密文 Data Key

    解密:
    1. 将密文 Data Key 发给 KMS 解密
    2. 收到明文 Data Key
    3. 用明文 Data Key 解密数据

CMK 类型:
  AWS Managed: AWS 自动创建管理 (aws/s3, aws/rds)
  Customer Managed: 客户创建, 可自定义策略和轮换
  Custom Key Store: 自有 CloudHSM 硬件

集成服务:
  S3:   SSE-KMS 加密对象
  EBS:  加密卷和快照
  RDS:  加密数据库和备份
  EFS:  加密文件系统
  Secrets Manager: 加密密钥存储
  Lambda: 加密环境变量

Key Policy + IAM Policy:
  Key Policy: 必须, 定义谁可以使用/管理密钥
  IAM Policy: 可选, 进一步限制
  两者需要同时允许才能访问

密钥轮换:
  AWS Managed: 自动 (每年)
  Customer Managed: 可配置自动轮换
  旧密钥保留用于解密, 新密钥用于加密
```

---

## 5. Secrets Manager 和 Parameter Store？

**回答：**

```
对比:
  ┌──────────────────┬──────────────────┬──────────────────┐
  │ 特性              │ Secrets Manager  │ Parameter Store  │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ 用途              │ 密钥/凭证管理    │ 配置/参数管理     │
  │ 自动轮换          │ ✓ (内置 Lambda)  │ ✗               │
  │ 访问控制          │ IAM + Resource   │ IAM              │
  │ 加密              │ 默认 KMS 加密    │ SecureString 加密│
  │ 跨账号共享        │ ✓ (Resource Policy)│ ✗             │
  │ 版本管理          │ ✓               │ ✓               │
  │ 费用              │ $0.40/secret/月  │ Standard 免费    │
  │ 值大小            │ 64 KB           │ 4 KB / 8 KB (Adv)│
  └──────────────────┴──────────────────┴──────────────────┘

使用建议:
  密码/API Key/数据库凭证 → Secrets Manager (自动轮换)
  配置参数/Feature Flag → Parameter Store (免费)
```

```bash
# Secrets Manager 使用
aws secretsmanager create-secret \
  --name prod/db/password \
  --secret-string '{"username":"admin","password":"xxx"}'

aws secretsmanager get-secret-value \
  --secret-id prod/db/password

# Parameter Store 使用
aws ssm put-parameter \
  --name /prod/app/db-host \
  --value "mydb.cluster-xxx.rds.amazonaws.com" \
  --type String

aws ssm put-parameter \
  --name /prod/app/db-password \
  --value "xxx" \
  --type SecureString \
  --key-id alias/my-key

aws ssm get-parameter \
  --name /prod/app/db-password \
  --with-decryption
```

```
ECS/K8s 集成:
  ECS: Task Definition 中引用 Secrets Manager/SSM
    "secrets": [
      {"name": "DB_PASSWORD", "valueFrom": "arn:aws:ssm:..."}
    ]
  
  K8s: External Secrets Operator → 同步到 K8s Secret
    ExternalSecret → Secrets Manager → K8s Secret
```

---

## 6. WAF 和 Shield？

**回答：**

```
AWS WAF (Web Application Firewall):
  在 CloudFront/ALB/API Gateway 前防护 Web 攻击

  Web ACL → 包含多条 Rule
    Rule → 包含多个条件 (Statement)
    Rule 动作: Allow / Block / Count / CAPTCHA

  规则类型:
    AWS Managed Rules: 预定义规则集
      AWSManagedRulesCommonRuleSet     → OWASP Top 10
      AWSManagedRulesSQLiRuleSet       → SQL 注入
      AWSManagedRulesKnownBadInputs    → 已知恶意输入
      AWSManagedRulesLinuxRuleSet      → Linux 漏洞
      AWSManagedRulesBotControlRuleSet → Bot 管理
    
    自定义 Rules:
      IP 白名单/黑名单
      Rate limiting (限流)
      地理限制
      请求匹配 (Header/Body/URI)

AWS Shield:
  Standard: 免费, 自动 L3/L4 DDoS 防护
  Advanced: $3000/月, L7 DDoS 防护 + 响应团队 + 成本保护

安全服务全景:
  边界:     WAF + Shield + CloudFront
  网络:     Security Group + NACL + VPC Flow Logs
  身份:     IAM + Identity Center + MFA
  数据:     KMS + Secrets Manager + Macie (敏感数据发现)
  检测:     GuardDuty (威胁检测) + Inspector (漏洞扫描)
  审计:     CloudTrail + Config + Security Hub
  响应:     EventBridge + Lambda 自动修复
```

---

## 7. CloudTrail 审计？

**回答：**

```
CloudTrail: 记录 AWS API 调用 (谁/何时/做了什么)

  记录内容:
    管理事件 (Management Events): 控制面操作
      CreateInstance, DeleteBucket, AttachPolicy...
    数据事件 (Data Events): 数据面操作
      GetObject, PutObject, InvokeFunction...
    Insights Events: 异常活动检测

  架构:
    AWS API 调用 → CloudTrail → S3 (存储)
                                → CloudWatch Logs (搜索)
                                → EventBridge (实时告警)

最佳实践:
  ✓ 所有 Region 启用 CloudTrail
  ✓ 日志存储到专用安全账号的 S3
  ✓ S3 开启 MFA Delete 和版本控制
  ✓ 日志文件完整性验证
  ✓ CloudTrail Insights 检测异常
  ✓ 关键操作配置 EventBridge 告警
```

```bash
# 查询 CloudTrail 日志
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket \
  --start-time 2024-01-01 \
  --end-time 2024-01-31

# Athena 查询 CloudTrail (大规模)
# CREATE TABLE cloudtrail_logs (...)
# PARTITIONED BY (region string, year string, month string, day string)
# ROW FORMAT SERDE 'org.apache.hive.hcatalog.data.JsonSerDe'
# LOCATION 's3://my-trail-bucket/AWSLogs/...'
```

```
关键告警场景:
  ✓ Root 账号登录
  ✓ IAM 策略变更
  ✓ Security Group 变更
  ✓ CloudTrail 被禁用
  ✓ S3 桶策略变更 (公开访问)
  ✓ 未授权 API 调用 (AccessDenied)
  ✓ Console 登录无 MFA
```

---

## 8. AWS Config 合规？

**回答：**

```
AWS Config: 资源配置记录和合规检查

  功能:
    配置记录: 持续记录资源配置变更历史
    合规规则: 自动检查资源是否符合规则
    修复:     自动/手动修复不合规资源

  Config Rules:
    AWS Managed Rules (预定义):
      s3-bucket-public-read-prohibited  → S3 不公开
      ec2-instance-no-public-ip         → EC2 无公网 IP
      restricted-ssh                     → 不开放 SSH 0.0.0.0/0
      rds-instance-public-access-check  → RDS 不公开
      encrypted-volumes                  → EBS 已加密
      iam-root-access-key-check         → Root 无 Access Key

    Custom Rules (自定义):
      Lambda 函数实现自定义检查逻辑

  修复 (Remediation):
    SSM Automation Document 自动修复
    例: 检测到 S3 公开 → 自动设为私有

  与 Security Hub 集成:
    Security Hub: 安全发现聚合
    来源: Config, GuardDuty, Inspector, IAM Access Analyzer
    标准: CIS Benchmark, PCI DSS, AWS Foundational Security
```

---

## 9. GuardDuty 威胁检测？

**回答：**

```
GuardDuty: 智能威胁检测服务

  数据源:
    CloudTrail Events      → 异常 API 调用
    VPC Flow Logs          → 异常网络行为
    DNS Logs               → 恶意域名查询
    EKS Audit Logs         → K8s 异常
    S3 Data Events         → S3 异常访问
    RDS Login Activity     → 数据库异常登录

  检测类型:
    ┌──────────────────┬──────────────────────────────┐
    │ 类型              │ 示例                         │
    ├──────────────────┼──────────────────────────────┤
    │ Recon            │ 端口扫描, API 探测            │
    │ Unauthorized     │ 异常 EC2 启动, 异常 API 调用  │
    │ Credential       │ 暴力破解, 泄露凭证使用         │
    │ Malware          │ 恶意 IP 通信, 恶意域名        │
    │ CryptoCurrency   │ 挖矿行为检测                 │
    │ Exfiltration     │ 异常数据外传                  │
    └──────────────────┴──────────────────────────────┘

  响应流程:
    GuardDuty 发现 → EventBridge 规则
      → SNS 通知 (邮件/Slack)
      → Lambda 自动修复
      → Step Functions 编排

  自动修复示例:
    检测到暴力破解 → Lambda 自动封禁 IP (NACL/WAF)
    检测到凭证泄露 → Lambda 自动禁用 Access Key
    检测到挖矿     → Lambda 隔离 EC2 (修改 SG)

  一键启用, 无需部署 Agent
  30 天免费试用
  多账号: 使用 AWS Organizations 批量启用
```

---

## 10. IAM 最佳实践和面试题？

**回答：**

```
IAM 最佳实践清单:
  ✓ 启用 Root MFA, 不使用 Root 日常操作
  ✓ 遵循最小权限原则
  ✓ 使用 IAM Role 替代长期 Access Key
  ✓ 使用 IAM Group 管理权限 (不直接附加到用户)
  ✓ 使用 Permission Boundary 限制最大权限
  ✓ 定期审计: IAM Access Analyzer, Credential Report
  ✓ 强制 MFA
  ✓ 密钥轮换 (90 天)
  ✓ 使用 ABAC (基于标签的访问控制)
  ✗ 共享凭证
  ✗ 在代码中硬编码 Access Key
  ✗ 使用通配符 Action: "*", Resource: "*"

面试高频问题:

Q: IAM User 和 IAM Role 的区别?
A: User 有长期凭证 (Access Key), 适合人员
   Role 只有临时凭证 (STS), 适合服务/跨账号
   最佳实践: 优先用 Role

Q: 如何实现跨账号访问?
A: Account A 创建 Role, Trust Policy 信任 Account B
   Account B 的用户 AssumeRole 获取临时凭证
   用 External ID 防止混淆代理攻击

Q: Policy 评估 Deny 优先如何理解?
A: 默认隐式 Deny → 显式 Allow 覆盖 → 显式 Deny 最终优先
   任何一个 Policy 中有 Deny, 则被拒绝
   SCP + Permission Boundary + Identity Policy, 取交集

Q: 如何避免凭证泄露?
A: 1. 使用 IAM Role (EC2/Lambda/ECS)
   2. git-secrets / pre-commit hook 防止提交凭证
   3. AWS Secrets Manager / SSM 管理密钥
   4. GuardDuty 检测泄露的凭证使用
   5. CloudTrail 审计 API 调用

Q: 什么是 ABAC?
A: Attribute-Based Access Control, 基于标签的访问控制
   通过资源标签和主体标签匹配授权
   例: "如果用户 Department=Engineering, 则可以访问 Department=Engineering 的资源"
   优势: 减少 Policy 数量, 自动适应新资源
```
