# Serverless 架构

---

## 1. Serverless 概念和优缺点？

**回答：**

```
Serverless (无服务器):
  不管理服务器, 按使用付费, 自动扩缩

  Serverless 不是没有服务器, 而是:
    ✓ 无需管理/配置服务器
    ✓ 按调用/使用量付费 (不用不收费)
    ✓ 自动弹性伸缩 (0 → ∞)
    ✓ 高可用内置

AWS Serverless 服务:
  ┌────────────────────┬──────────────────────┐
  │ 类别                │ 服务                 │
  ├────────────────────┼──────────────────────┤
  │ 计算                │ Lambda, Fargate      │
  │ API                │ API Gateway          │
  │ 存储                │ S3, DynamoDB         │
  │ 编排                │ Step Functions       │
  │ 事件总线            │ EventBridge          │
  │ 消息队列            │ SQS, SNS            │
  │ 流处理              │ Kinesis Firehose     │
  │ 认证                │ Cognito              │
  │ 数据库              │ Aurora Serverless    │
  └────────────────────┴──────────────────────┘

优势:
  ✓ 无运维负担
  ✓ 成本: 闲时不收费
  ✓ 快速迭代: 专注业务逻辑
  ✓ 自动扩缩: 应对突发流量

劣势:
  ✗ 冷启动延迟 (Lambda)
  ✗ 执行时间限制 (15 分钟)
  ✗ 调试复杂 (分布式)
  ✗ 供应商锁定
  ✗ 本地开发体验欠佳
```

---

## 2. Lambda 深入详解？

**回答：**

```
Lambda 执行模型:

  请求 → API Gateway → Lambda 函数 → 响应

  执行环境生命周期:
    INIT:   下载代码, 初始化运行时, 执行 handler 外代码
    INVOKE: 调用 handler 函数
    SHUTDOWN: 超时后销毁执行环境

    INIT → INVOKE → INVOKE → ... → SHUTDOWN
           ↑ 复用 (Warm Start)

  冷启动 vs 热启动:
    冷启动: INIT + INVOKE (首次或长时间未调用)
    热启动: INVOKE only (复用现有环境)

优化冷启动:
  1. Provisioned Concurrency
     预热 N 个执行环境, 消除冷启动
     成本: 按预热数量 × 时间计费

  2. SnapStart (Java)
     初始化快照, 从快照恢复
     Java 冷启动从秒级降到毫秒级

  3. 代码优化
     ✓ 减小部署包 (移除无用依赖)
     ✓ 使用 Lambda Layers (共享依赖)
     ✓ handler 外初始化 (复用连接)
     ✓ 选择 arm64 (Graviton, 便宜且快)

  4. 运行时选择
     Node.js / Python: 100-500ms 冷启动
     Java / .NET:      1-5s 冷启动 (SnapStart 优化)
```

```python
# Lambda Handler 最佳实践 (Python)
import boto3
import os

# handler 外初始化 → 复用 (Warm Start 时不重复)
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

def handler(event, context):
    """handler 内只放业务逻辑"""
    user_id = event['pathParameters']['id']
    
    response = table.get_item(Key={'id': user_id})
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps(response.get('Item', {}))
    }
```

---

## 3. API Gateway？

**回答：**

```
API Gateway: 托管 API 网关

  类型:
  ┌────────────────┬──────────────────┬──────────────────┐
  │ 类型            │ REST API         │ HTTP API         │
  ├────────────────┼──────────────────┼──────────────────┤
  │ 功能            │ 最全             │ 精简             │
  │ 价格            │ $3.50/百万请求   │ $1.00/百万请求   │
  │ 延迟            │ 较高             │ 较低             │
  │ 认证            │ IAM/Cognito/     │ IAM/Cognito/JWT │
  │                │ Lambda Authorizer│ Lambda Auth     │
  │ WebSocket       │ ✓               │ ✗               │
  │ 缓存            │ ✓               │ ✗               │
  │ WAF             │ ✓               │ ✗               │
  │ 使用计划/APIKey │ ✓               │ ✗               │
  └────────────────┴──────────────────┴──────────────────┘

  选择: 大多数场景用 HTTP API (便宜快速)
        需要缓存/WAF/WebSocket → REST API

架构:
  Client → API Gateway → Lambda / ALB / HTTP Endpoint
              │
              ├── 认证 (Cognito / JWT)
              ├── 限流 (Throttling)
              ├── 缓存 (REST API)
              ├── 请求/响应转换
              └── CORS

Stage (阶段):
  dev / staging / prod
  每个 Stage 独立的 URL 和配置
  Stage Variables: 环境变量

使用计划 (REST API):
  API Key + Usage Plan → 限制调用频率和配额
  适用: 第三方 API 分发

Lambda Authorizer:
  自定义认证逻辑
  Token-based: 验证 JWT/自定义 Token
  Request-based: 基于请求参数

CORS:
  API Gateway 自动处理 OPTIONS 预检
  配置允许的 Origins, Methods, Headers
```

---

## 4. Step Functions 工作流？

**回答：**

```
Step Functions: 可视化工作流编排

  用途: 编排多个 Lambda/服务的执行顺序

  工作流类型:
    Standard: 最长 1 年, 按状态转换计费
    Express:  最长 5 分钟, 按执行次数和时间计费

  状态类型:
    Task:    执行工作 (Lambda, ECS, SQS, SNS...)
    Choice:  条件分支 (if/else)
    Parallel:并行执行
    Map:     循环处理 (for each)
    Wait:    等待
    Pass:    传递/转换数据
    Succeed: 成功结束
    Fail:    失败结束

  错误处理:
    Retry:   重试策略 (指数退避)
    Catch:   捕获错误, 执行备用路径

示例: 订单处理工作流
```

```json
{
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:validate",
      "Next": "CheckInventory",
      "Retry": [{"ErrorEquals": ["States.TaskFailed"], "MaxAttempts": 3}]
    },
    "CheckInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:inventory",
      "Next": "InStock?"
    },
    "InStock?": {
      "Type": "Choice",
      "Choices": [
        {"Variable": "$.inStock", "BooleanEquals": true, "Next": "ProcessPayment"}
      ],
      "Default": "OutOfStock"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:payment",
      "Next": "ShipOrder"
    },
    "ShipOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ship",
      "End": true
    },
    "OutOfStock": {
      "Type": "Fail",
      "Cause": "Item out of stock"
    }
  }
}
```

```
vs 直接 Lambda 调用:
  Lambda → Lambda: 紧耦合, 错误处理复杂
  Step Functions: 可视化, 内置重试/错误处理, 松耦合
```

---

## 5. EventBridge 事件驱动？

**回答：**

```
EventBridge: 无服务器事件总线

  Event Source → Event Bus → Rule → Target

  事件源:
    AWS 服务: EC2/S3/RDS 状态变更
    自定义:   应用发送的业务事件
    SaaS:     Zendesk, Shopify, Datadog 等

  规则 (Rule):
    事件模式匹配 (Event Pattern)
    定时触发 (Schedule)

  目标 (Target):
    Lambda, SQS, SNS, Step Functions,
    ECS Task, Kinesis, CodePipeline,
    API Destination (webhook), 跨账号/跨 Region

事件模式:
```

```json
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["stopped", "terminated"]
  }
}
```

```
自定义事件:
```

```python
import boto3

client = boto3.client('events')
client.put_events(
    Entries=[{
        'Source': 'myapp.orders',
        'DetailType': 'OrderCreated',
        'Detail': '{"orderId": "123", "amount": 99.99}',
        'EventBusName': 'my-event-bus'
    }]
)
```

```
EventBridge vs SNS:
  SNS:         简单发布/订阅, Fan-out
  EventBridge: 内容过滤, 事件转换, SaaS 集成, 归档/重放
  推荐: 新项目使用 EventBridge

EventBridge Scheduler:
  替代 CloudWatch Events 定时任务
  一次性或重复调度
  Rate/Cron 表达式
  比 cron + Lambda 更精确

EventBridge Pipes:
  源 → 过滤 → 转换 → 目标
  源: SQS, DynamoDB Streams, Kinesis, Kafka
  减少 Lambda 胶水代码
```

---

## 6. Cognito 认证服务？

**回答：**

```
Cognito: 用户认证和授权

  User Pool (用户池):
    用户注册/登录/MFA
    社交登录 (Google/Facebook/Apple)
    企业 SAML/OIDC
    返回 JWT Token (ID/Access/Refresh)

  Identity Pool (身份池):
    用 JWT → 获取临时 AWS 凭证
    匿名/认证用户 → 不同 IAM Role
    直接访问 AWS 服务 (S3/DynamoDB)

架构:
  ┌──────────┐   JWT    ┌──────────┐
  │ Client   │ ←──────→ │ Cognito  │
  │ (App)    │          │ User Pool│
  └──────────┘          └──────────┘
       │ JWT
  ┌──────────┐     ┌──────────┐
  │ API      │ ──→ │ Lambda   │
  │ Gateway  │     │ (Backend)│
  │ (JWT验证)│     └──────────┘
  └──────────┘

  或:
  Client → Cognito User Pool → JWT
       → Cognito Identity Pool → AWS 临时凭证
       → 直接访问 S3/DynamoDB (前端直传)

Hosted UI:
  Cognito 提供的托管登录页面
  自定义域名和样式
  快速集成, 无需自建登录页

API Gateway 集成:
  REST API: Cognito Authorizer (直接验证 JWT)
  HTTP API: JWT Authorizer (配置 Issuer + Audience)

Lambda Trigger:
  Pre Sign-up:      注册前验证
  Post Confirmation: 注册后处理 (发欢迎邮件)
  Pre Token Gen:    自定义 Token 内容
  Custom Message:    自定义邮件/短信模板
```

---

## 7. SAM 和 Serverless Framework？

**回答：**

```
SAM (Serverless Application Model):
  AWS 官方 Serverless 框架
  CloudFormation 的扩展语法

  核心概念:
    AWS::Serverless::Function  → Lambda
    AWS::Serverless::Api       → API Gateway
    AWS::Serverless::SimpleTable → DynamoDB
    AWS::Serverless::HttpApi   → HTTP API
```

```yaml
# template.yaml (SAM)
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Globals:
  Function:
    Timeout: 30
    Runtime: python3.12
    Architectures:
      - arm64
    Environment:
      Variables:
        TABLE_NAME: !Ref UsersTable

Resources:
  GetUserFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.handler
      CodeUri: src/
      Events:
        GetUser:
          Type: HttpApi
          Properties:
            Path: /users/{id}
            Method: get
      Policies:
        - DynamoDBReadPolicy:
            TableName: !Ref UsersTable

  UsersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey:
        Name: id
        Type: String
```

```bash
# SAM CLI 常用命令
sam init                  # 初始化项目
sam build                 # 构建
sam local invoke          # 本地执行 Lambda
sam local start-api       # 本地启动 API
sam deploy --guided       # 部署
sam logs -n FunctionName  # 查看日志
sam sync                  # 快速同步 (开发)
```

```
Serverless Framework 对比:
  ┌──────────────┬──────────────┬──────────────┐
  │ 特性          │ SAM          │ Serverless FW│
  ├──────────────┼──────────────┼──────────────┤
  │ 云支持        │ AWS only     │ 多云         │
  │ 语法          │ CFN 扩展     │ serverless.yml│
  │ 本地调试      │ sam local    │ sls offline  │
  │ 社区          │ AWS 官方     │ 社区活跃      │
  │ 插件          │ 少           │ 丰富          │
  └──────────────┴──────────────┴──────────────┘
```

---

## 8. Serverless 设计模式？

**回答：**

```
1. API 微服务
   API Gateway → Lambda → DynamoDB
   每个 API 路径对应一个 Lambda 或一组 Lambda

2. Fan-out (扇出)
   SNS Topic → Lambda 1 (发邮件)
             → Lambda 2 (处理统计)
             → SQS → Lambda 3 (异步处理)

3. Event Processing (事件处理)
   S3 PUT → Lambda (图片缩略图)
   DynamoDB Stream → Lambda (数据同步)
   Kinesis → Lambda (实时分析)

4. Choreography (编排)
   Step Functions:
   验证 → 支付 → 发货 → 通知
   内置重试/错误处理/并行

5. CQRS
   写: API → Lambda → DynamoDB
   读: DynamoDB Stream → Lambda → ElastiCache/ES
   分离读写模型, 优化各自性能

6. Strangler Fig (绞杀者模式)
   逐步将单体应用迁移到 Serverless
   API Gateway: /new/* → Lambda
               /old/* → 旧服务
   逐步迁移路由直到完全迁移

7. Queue-Based Load Leveling
   API → SQS → Lambda (Batch)
   削峰填谷, 保护下游服务

8. Circuit Breaker
   Lambda → 检查熔断状态 (DynamoDB)
         → 正常: 调用下游
         → 熔断: 返回降级响应
```

---

## 9. Serverless 监控和调试？

**回答：**

```
监控:
  CloudWatch Metrics:
    Invocations, Errors, Throttles, Duration
    ConcurrentExecutions, IteratorAge (Stream)

  CloudWatch Logs:
    Lambda 自动写日志到 CloudWatch Logs
    结构化日志 (JSON) + Log Insights 查询

  X-Ray (分布式追踪):
    API Gateway → Lambda → DynamoDB 全链路
    识别延迟瓶颈
    Lambda 启用: Active Tracing

  CloudWatch Lambda Insights:
    增强监控: CPU, Memory, 网络, 冷启动
    Lambda Layer 方式部署

告警:
  Lambda Errors > 0 → 告警
  Duration P99 > SLA → 告警
  Throttles > 0 → 考虑提升并发限制
  IteratorAge > 阈值 → 消费落后告警

本地调试:
  SAM CLI: sam local invoke / start-api
  Docker: 本地模拟 Lambda 运行时
  LocalStack: 模拟 AWS 服务
  
  单元测试: Mock AWS SDK (moto, localstack)
  集成测试: 部署到测试环境测试

Powertools (推荐):
  AWS Lambda Powertools (Python/Java/TypeScript)
  ✓ 结构化日志 (Logger)
  ✓ 追踪 (Tracer, X-Ray)
  ✓ 指标 (Metrics, CloudWatch EMF)
  ✓ 事件解析 (Event Handler)
  ✓ 幂等性 (Idempotency)
  ✓ 批处理 (Batch Processing)
```

---

## 10. Serverless 面试题？

**回答：**

```
Q: Lambda 冷启动怎么解?
A: 1. Provisioned Concurrency (最有效, 有成本)
   2. 减小部署包, 用 Layer 共享依赖
   3. handler 外初始化 (复用连接)
   4. 选 Python/Node.js (启动快)
   5. SnapStart (Java)
   6. 保持 warm (定时 ping, 不推荐)

Q: Lambda 最长执行 15 分钟, 超长任务怎么办?
A: 1. Step Functions 编排多个 Lambda
   2. ECS Fargate 任务 (无时间限制)
   3. Lambda 分片处理 (大文件拆分)
   4. SQS + Lambda 批处理

Q: Serverless 适合什么场景, 不适合什么?
A: 适合:
     API 后端, 事件处理, 定时任务
     不可预测流量, 低频调用
     快速原型, 小团队
   不适合:
     需要长连接 (WebSocket → 用 API Gateway WS)
     极低延迟 (<10ms)
     GPU 计算
     大量持久状态

Q: DynamoDB 和 RDS 怎么选?
A: DynamoDB: Key-Value, 无限扩展, 毫秒延迟, 无 JOIN
   RDS: 关系型, 复杂查询, JOIN, 事务
   Serverless 环境优先 DynamoDB (免连接池管理)

Q: 如何处理 Lambda 并发限制?
A: 默认 1000/Region (可提升到数万)
   Reserved Concurrency: 为关键函数预留并发
   SQS 限流: 控制消费速率
   API Gateway 限流: 前端限速

Q: Serverless 怎么做 CI/CD?
A: SAM Pipeline / CodePipeline:
   Git Push → CodeBuild (build+test)
   → sam deploy (dev) → 测试 → sam deploy (prod)
   或: GitHub Actions + sam deploy
```
