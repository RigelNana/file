# Serverless架构

---

## 1. Serverless 核心概念？

**回答：**

```
Serverless ≠ 没有服务器
Serverless = 开发者不管服务器

  ┌──────────────┬──────────────────────────┐
  │ 组件          │ 说明                     │
  ├──────────────┼──────────────────────────┤
  │ FaaS          │ 函数即服务（运行代码）    │
  │ BaaS          │ 后端即服务（数据库/存储） │
  └──────────────┴──────────────────────────┘

  传统 vs Serverless：
  ┌──────────┬─────────────┬──────────────┐
  │ 维度      │ 传统         │ Serverless   │
  ├──────────┼─────────────┼──────────────┤
  │ 运维      │ 自己管       │ 云厂商管     │
  │ 扩缩容    │ 手动/HPA    │ 自动 0→N    │
  │ 计费      │ 按机器       │ 按调用次数   │
  │ 冷启动    │ 无           │ 有（毫秒-秒）│
  │ 长连接    │ 支持         │ 受限         │
  │ 执行时长  │ 无限制       │ 有上限       │
  └──────────┴─────────────┴──────────────┘

  主流 FaaS 平台：
  AWS Lambda
  阿里云函数计算 FC
  腾讯云 SCF
  Cloudflare Workers（边缘）
  Knative（K8s上自建）
```

---

## 2. FaaS 运行模型？

**回答：**

```
  请求 → 冷启动(如需) → 执行函数 → 返回结果

  ┌──────────────────────────────────────┐
  │ 函数生命周期                          │
  │                                      │
  │ 冷启动：创建容器→加载runtime→初始化   │
  │   ↓                                  │
  │ 热启动：复用已有容器                  │
  │   ↓                                  │
  │ 执行：运行函数代码                    │
  │   ↓                                  │
  │ 空闲：等待下一个请求                  │
  │   ↓                                  │
  │ 回收：长时间空闲→销毁容器             │
  └──────────────────────────────────────┘

Go Lambda 示例：
  package main
  
  import (
      "context"
      "github.com/aws/aws-lambda-go/lambda"
  )
  
  type Request struct {
      Name string `json:"name"`
  }
  
  type Response struct {
      Message string `json:"message"`
  }
  
  func handler(ctx context.Context, req Request) (Response, error) {
      return Response{
          Message: "Hello " + req.Name,
      }, nil
  }
  
  func main() {
      lambda.Start(handler)
  }

触发方式：
  HTTP 请求（API Gateway）
  定时触发（Cron）
  消息队列（SQS/Kafka）
  对象存储事件（上传文件触发）
  数据库变更（DynamoDB Stream）
```

---

## 3. 冷启动问题与优化？

**回答：**

```
冷启动 = 首次调用时初始化环境的延迟

  冷启动耗时组成：
  ┌──────────────┬──────────┐
  │ 阶段          │ 耗时     │
  ├──────────────┼──────────┤
  │ 创建容器/VM   │ 100-500ms│
  │ 加载Runtime  │ 50-200ms │
  │ 初始化代码    │ 变化大   │
  │ 总计          │ 200ms-数秒│
  └──────────────┴──────────┘

  语言影响：
  Go/Rust    → 冷启动快（~100ms）
  Python/JS  → 中等（~300ms）
  Java/C#    → 慢（~1-3s）

优化策略：
  ┌──────────────┬──────────────────────────┐
  │ 策略          │ 做法                     │
  ├──────────────┼──────────────────────────┤
  │ 预留实例      │ Provisioned Concurrency  │
  │ 保持温暖      │ 定时 Ping（不推荐）      │
  │ 减小包体积    │ 精简依赖 用Go编译单文件  │
  │ 懒加载        │ 非必要的初始化延后       │
  │ 全局初始化    │ 数据库连接放init不放handler│
  └──────────────┴──────────────────────────┘

Go 全局初始化：
  var db *sql.DB
  
  func init() {
      // 只在冷启动时执行一次
      db, _ = sql.Open("mysql", dsn)
  }
  
  func handler(ctx context.Context, req Request) (Response, error) {
      // 复用 db 连接
      rows, _ := db.QueryContext(ctx, "...")
      // ...
  }
```

---

## 4. Serverless 适用场景？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 场景          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 事件处理      │ 文件上传→缩略图/转码         │
  │ API 后端      │ 简单CRUD API                 │
  │ 定时任务      │ Cron类任务（报表/清理）       │
  │ Webhook       │ 接收第三方回调               │
  │ 数据变更触发  │ DB变更→同步/通知             │
  │ IoT 数据入口  │ 海量设备数据接入             │
  │ 聊天Bot       │ 接收消息→处理→回复          │
  └──────────────┴──────────────────────────────┘

不适用场景：
  长时间运行（超时限制）
  有状态服务（WebSocket长连接）
  高性能计算（冷启动不可接受）
  复杂业务系统（微服务更合适）

成本分析：
  低流量（< 100万次/月）→ Serverless 便宜
  高流量（> 1000万次/月）→ 容器/虚拟机更划算
  
  突发流量 → Serverless 自动扩展
  稳定流量 → 预留实例更便宜
```

---

## 5. Knative？

**回答：**

```
Knative = K8s 上的 Serverless 平台

  ┌───────────────────────────────────┐
  │ Knative                           │
  │ ┌───────────┐ ┌───────────────┐  │
  │ │ Serving   │ │ Eventing      │  │
  │ │ 请求驱动   │ │ 事件驱动      │  │
  │ │ 自动缩放   │ │ 事件路由      │  │
  │ │ 0→N      │ │ Source/Broker │  │
  │ └───────────┘ └───────────────┘  │
  └───────────────────────────────────┘
        ↓                    ↓
     Kubernetes 集群

Knative Serving：
  自动缩容到 0
  按请求自动扩容
  流量按比例分配（灰度）

  apiVersion: serving.knative.dev/v1
  kind: Service
  metadata:
    name: hello
  spec:
    template:
      spec:
        containers:
        - image: myapp:v1
          resources:
            limits:
              memory: 256Mi

优势：
  不锁定云厂商
  基于 K8s 可私有部署
  支持缩容到 0

劣势：
  运维 K8s 本身的成本
  冷启动比云厂商略慢
```

---

## 6. Serverless 架构模式？

**回答：**

```
1. API + 函数模式：
  API Gateway → Lambda → DynamoDB
  简单 REST API

2. 事件驱动管道：
  S3 Upload → Lambda → SQS → Lambda → DB
  异步处理链

3. 编排模式：
  Step Functions / Durable Functions
  复杂业务流程编排

  ┌────────────────────────────────┐
  │ Step Functions                 │
  │ ┌─────┐ ┌─────┐ ┌─────┐     │
  │ │验证  │→│处理  │→│通知  │     │
  │ └──┬──┘ └──┬──┘ └─────┘     │
  │    │失败    │失败               │
  │    ↓        ↓                   │
  │ ┌─────┐ ┌─────┐               │
  │ │回滚  │ │重试  │               │
  │ └─────┘ └─────┘               │
  └────────────────────────────────┘

4. 边缘计算：
  CDN Edge → Function → Origin
  请求在边缘处理（A/B测试、认证、重写）
  Cloudflare Workers / Lambda@Edge
```

---

## 7. Serverless 与微服务对比？

**回答：**

```
  ┌──────────────┬────────────────┬────────────────┐
  │ 维度          │ 微服务          │ Serverless     │
  ├──────────────┼────────────────┼────────────────┤
  │ 部署单元      │ 服务            │ 函数           │
  │ 运维          │ 自己管          │ 托管           │
  │ 扩缩容        │ HPA/手动        │ 自动0→N       │
  │ 成本          │ 持续计费        │ 按调用计费     │
  │ 冷启动        │ 无              │ 有             │
  │ 状态          │ 可有状态        │ 无状态         │
  │ 复杂度        │ 运维复杂        │ 开发受限       │
  │ 适用规模      │ 中大型系统      │ 事件驱动/小服务│
  └──────────────┴────────────────┴────────────────┘

混合架构：
  核心业务 → 微服务（稳定、可控）
  辅助功能 → Serverless（弹性、省成本）

  例如：
  ┌────────────────────────────────────┐
  │ 电商系统                            │
  │ 微服务：订单/支付/库存（核心）      │
  │ Serverless：图片处理/推送/报表（辅助）│
  └────────────────────────────────────┘
```

---

## 8. Serverless 开发最佳实践？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 实践          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 函数单一职责  │ 一个函数做一件事             │
  │ 减小包体积    │ 依赖精简 Go 静态编译         │
  │ 全局初始化    │ DB连接放 init 不放 handler   │
  │ 超时设置      │ 函数超时 < 触发源超时        │
  │ 幂等设计      │ 重复触发结果相同             │
  │ 环境变量      │ 配置用环境变量 不硬编码      │
  │ 本地测试      │ SAM/serverless framework    │
  └──────────────┴──────────────────────────────┘

Go 函数组织：
  project/
  ├── cmd/
  │   ├── create-order/main.go   # 函数入口
  │   ├── process-payment/main.go
  │   └── send-notification/main.go
  ├── internal/
  │   ├── order/       # 共享业务逻辑
  │   └── common/      # 共享工具
  ├── go.mod
  └── Makefile

Makefile 示例：
  build:
      GOOS=linux GOARCH=amd64 go build \
          -ldflags="-s -w" \
          -o bin/create-order ./cmd/create-order
      zip -j deploy.zip bin/create-order

监控与可观测性：
  CloudWatch Logs/Metrics
  X-Ray 分布式追踪
  自定义Metric上报
```

---

## 9. Serverless 安全？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 风险          │ 应对措施                     │
  ├──────────────┼──────────────────────────────┤
  │ 权限过大      │ 最小权限原则 精细IAM策略     │
  │ 注入攻击      │ 输入验证 参数化查询          │
  │ 密钥泄露      │ Secrets Manager 不放代码里   │
  │ 依赖漏洞      │ 定期扫描 更新依赖            │
  │ 事件注入      │ 验证事件来源                 │
  │ 日志敏感信息  │ 不打印密码/token             │
  └──────────────┴──────────────────────────────┘

最小权限 IAM：
  // 差：给 Lambda 全部 DynamoDB 权限
  "Action": "dynamodb:*"
  
  // 好：只给需要的操作和特定表
  "Action": ["dynamodb:GetItem", "dynamodb:PutItem"]
  "Resource": "arn:aws:dynamodb:*:*:table/orders"

密钥管理：
  // 差：环境变量明文
  DB_PASSWORD=secret123
  
  // 好：运行时从 Secrets Manager 获取
  func getSecret(name string) (string, error) {
      svc := secretsmanager.New(session)
      result, err := svc.GetSecretValue(&secretsmanager.GetSecretValueInput{
          SecretId: aws.String(name),
      })
      return *result.SecretString, err
  }
```

---

## 10. Serverless面试速答？

**回答：**

```
Q: Serverless是什么？
A: 开发者不管服务器 FaaS+BaaS
   自动扩缩 按调用计费

Q: 冷启动怎么优化？
A: 选Go/Rust(快) 减小包体积
   DB连接放init 预留实例

Q: 适合什么场景？
A: 事件处理/定时任务/Webhook
   低频API/突发流量

Q: 不适合什么？
A: 长运行/有状态/高频调用
   复杂业务系统

Q: Knative是什么？
A: K8s上的Serverless平台
   自动缩容到0 不锁定厂商

Q: 和微服务怎么选？
A: 核心业务→微服务 辅助功能→Serverless
   混合架构最常见

Q: Serverless安全要点？
A: 最小权限IAM 密钥用SecretManager
   输入验证 依赖扫描

Q: 按调用计费什么时候不划算？
A: 高频稳定流量(>1000万次/月)
   容器/VM预留更便宜
```
