# API版本与演进

---

## 1. API版本管理方案？

**回答：**

```
  ┌──────────────────┬──────────────────┬──────────────────┐
  │ 方案              │ 优点              │ 缺点             │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ URL路径           │ 简单直观 缓存友好 │ URL变化           │
  │ /v1/users        │                   │                  │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ Query参数         │ 默认版本方便      │ 容易被忽略        │
  │ ?version=1       │                   │                  │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ Header           │ URL不变 语义正确  │ 不直观 调试麻烦   │
  │ Accept: v1       │                   │                  │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ 无版本            │ URL简洁          │ 必须永远兼容      │
  │ 只保持兼容       │                   │                  │
  └──────────────────┴──────────────────┴──────────────────┘

  推荐：URL路径版本（/v1/users）
  简单、直观、所有工具都支持

  Go路由实现：
  // 版本路由
  v1 := mux.PathPrefix("/v1").Subrouter()
  v1.HandleFunc("/users", v1handlers.ListUsers)
  
  v2 := mux.PathPrefix("/v2").Subrouter()
  v2.HandleFunc("/users", v2handlers.ListUsers)

  版本号规则：
  主版本号（v1→v2）：破坏性变更
  不用次版本号 内部用API修订版
```

---

## 2. 向后兼容性设计？

**回答：**

```
  兼容性变更（不需要新版本）：
  ✅ 新增可选请求字段
  ✅ 新增响应字段
  ✅ 新增端点
  ✅ 新增枚举值（如果客户端能忽略未知值）
  ✅ 放宽已有参数的约束

  非兼容变更（必须新版本）：
  ❌ 删除/重命名字段
  ❌ 修改字段类型
  ❌ 改变字段语义
  ❌ 删除端点
  ❌ 添加必填参数
  ❌ 收紧约束（如缩短字符串长度）

  Robustness原则：
  发送时保守 接收时宽容
  客户端忽略未知字段
  服务端忽略多余字段

  Go兼容性设计：
  // V1 Response
  type UserV1 struct {
      ID    int    `json:"id"`
      Name  string `json:"name"`
      Email string `json:"email"`
  }
  
  // V1.1 新增字段（兼容）
  type UserV1Updated struct {
      ID     int     `json:"id"`
      Name   string  `json:"name"`
      Email  string  `json:"email"`
      Avatar string  `json:"avatar,omitempty"` // 新增 可选
      Phone  *string `json:"phone,omitempty"`  // 新增 可选
  }
  // 旧客户端忽略avatar和phone → 兼容
```

---

## 3. API废弃与迁移策略？

**回答：**

```
  废弃流程：
  1. 宣布废弃（Deprecation）
     Deprecation: true
     Sunset: Sat, 01 Jul 2025 00:00:00 GMT
  
  2. 过渡期（至少6个月）
     新旧版本并行运行
     文档标注废弃
  
  3. 引导迁移
     提供迁移指南
     监控旧版本使用量
  
  4. 下线
     返回410 Gone

  Go实现废弃警告：
  func DeprecationMiddleware(sunset time.Time, alternative string) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              w.Header().Set("Deprecation", "true")
              w.Header().Set("Sunset", sunset.Format(http.TimeFormat))
              w.Header().Set("Link", fmt.Sprintf(`<%s>; rel="successor-version"`, alternative))
              next.ServeHTTP(w, r)
          })
      }
  }
  
  // 使用
  v1Router.Use(DeprecationMiddleware(
      time.Date(2025, 7, 1, 0, 0, 0, 0, time.UTC),
      "/v2/users",
  ))

  API变更日志：
  每次变更记录在CHANGELOG
  通知订阅者（邮件/Webhook）
```

---

## 4. API网关中的版本路由？

**回答：**

```
  网关层版本路由：
  客户端 → API网关 → 路由到不同版本服务

  方案1：URL路由
  /v1/* → service-v1:8080
  /v2/* → service-v2:8080

  方案2：Header路由
  Api-Version: 1 → service-v1
  Api-Version: 2 → service-v2

  方案3：灰度切换
  90%流量 → v1  
  10%流量 → v2（灰度验证）

  Go API网关版本路由：
  func VersionRouter(w http.ResponseWriter, r *http.Request) {
      // 解析版本
      version := extractVersion(r.URL.Path) // /v1/... → "v1"
      
      backends := map[string]string{
          "v1": "http://svc-v1:8080",
          "v2": "http://svc-v2:8080",
      }
      
      backend, ok := backends[version]
      if !ok {
          http.Error(w, "unsupported version", 400)
          return
      }
      
      // 代理请求
      target, _ := url.Parse(backend)
      proxy := httputil.NewSingleHostReverseProxy(target)
      proxy.ServeHTTP(w, r)
  }

  多版本代码组织：
  方案A：独立服务部署（推荐大改）
  方案B：同服务内路由（推荐小改）
  方案C：适配器模式（v2转换为v1调用）
```

---

## 5. 字段演进与Schema管理？

**回答：**

```
  字段重命名：
  不直接重命名 → 新增字段 + 旧字段保留
  
  // Phase 1: 新增字段 两个都返回
  {
    "user_name": "张三",    // 旧（保留）
    "display_name": "张三"  // 新
  }
  
  // Phase 2: 旧字段废弃通知
  // Phase 3: 下一个大版本移除旧字段

  字段类型变更：
  string → object 怎么办？
  // V1
  { "address": "北京市海淀区" }
  
  // V2 用新字段名
  {
    "address": "北京市海淀区",        // 保留
    "address_detail": {               // 新增
      "province": "北京",
      "city": "北京",
      "district": "海淀"
    }
  }

  JSON Schema验证：
  定义请求/响应的JSON Schema
  CI中自动验证Schema兼容性

  Protobuf天然兼容：
  字段编号保持不变
  新增字段用新编号
  删除字段保留编号（reserved）
  
  message User {
    int32 id = 1;
    string name = 2;
    // string old_field = 3; // 已删除
    reserved 3;              // 预留编号
    string email = 4;        // 新增
  }
```

---

## 6. API稳定性保障？

**回答：**

```
  契约测试（Consumer-Driven Contract）：
  消费者定义期望 → 提供者验证满足

  Pact测试流程：
  Consumer定义期望交互
  → 生成Contract文件
  → Provider验证Contract
  → 通过 = 兼容

  Go集成测试验证兼容性：
  func TestAPICompatibility(t *testing.T) {
      // 旧版本请求仍然能正常工作
      resp, err := http.Get(server.URL + "/v1/users/1")
      assert.NoError(t, err)
      assert.Equal(t, 200, resp.StatusCode)
      
      var body map[string]interface{}
      json.NewDecoder(resp.Body).Decode(&body)
      
      // 旧字段仍然存在
      assert.Contains(t, body, "id")
      assert.Contains(t, body, "name")
      assert.Contains(t, body, "email")
  }

  兼容性检查清单：
  ✓ 新字段有默认值
  ✓ 旧端点仍可用
  ✓ 旧字段仍返回
  ✓ 状态码含义不变
  ✓ 错误格式不变
  ✓ 枚举值不减少

  API SLA（服务等级协议）：
  可用性：99.9%
  延迟：P99 < 200ms
  变更通知：提前30天
  废弃过渡期：6个月
```

---

## 7. SDK与客户端库设计？

**回答：**

```
  SDK设计原则：
  1. 语言惯用（Idiomatic）
  2. 自动重试+退避
  3. 版本与API版本对应
  4. 错误类型清晰

  从OpenAPI生成SDK：
  openapi-generator generate \
    -i openapi.yaml \
    -g go \
    -o sdk/go

  手写SDK示例：
  type Client struct {
      baseURL    string
      httpClient *http.Client
      apiKey     string
  }
  
  func NewClient(baseURL, apiKey string) *Client {
      return &Client{
          baseURL:    baseURL,
          httpClient: &http.Client{Timeout: 10 * time.Second},
          apiKey:     apiKey,
      }
  }
  
  func (c *Client) GetUser(ctx context.Context, id string) (*User, error) {
      req, _ := http.NewRequestWithContext(ctx, "GET",
          fmt.Sprintf("%s/v1/users/%s", c.baseURL, id), nil)
      req.Header.Set("Authorization", "Bearer "+c.apiKey)
      
      resp, err := c.httpClient.Do(req)
      if err != nil { return nil, err }
      defer resp.Body.Close()
      
      if resp.StatusCode != 200 {
          return nil, parseError(resp)
      }
      
      var user User
      json.NewDecoder(resp.Body).Decode(&user)
      return &user, nil
  }

  SDK版本策略：
  SDK v1.x → 对应 API v1
  SDK v2.x → 对应 API v2
  语义化版本（SemVer）
```

---

## 8. GraphQL Schema演进？

**回答：**

```
  GraphQL不需要版本号：
  Schema可以渐进演进
  客户端只查询需要的字段

  安全演进规则：
  ✅ 新增类型/字段/查询
  ✅ 添加可选参数
  ❌ 删除/重命名字段
  ❌ 修改字段类型
  ❌ 必选参数变更

  废弃字段：
  type User {
    id: ID!
    name: String!
    userName: String @deprecated(reason: "Use name instead")
  }

  Schema变更检测：
  # 对比Schema差异
  graphql-inspector diff old.graphql new.graphql
  
  # CI中检查破坏性变更
  graphql-inspector validate schema.graphql queries/*.graphql

  演进 vs 版本化：
  REST: 版本化（/v1 → /v2）
  GraphQL: 演进（同端点持续更新）
  gRPC: 编号保留（reserved字段）

  GraphQL适合：
  多端（Web/Mobile/小程序）各取所需
  快速迭代 字段频繁变化
  不适合简单CRUD / 文件上传
```

---

## 9. API变更管理流程？

**回答：**

```
  变更流程：
  1. 提案（RFC/API Design Review）
     描述变更内容/影响/替代方案
  
  2. 评审
     API设计组review
     消费者团队参与
  
  3. 实现
     向后兼容则直接上线
     不兼容则新版本
  
  4. 文档更新
     更新OpenAPI/Swagger
     更新变更日志
  
  5. 通知
     邮件/Slack通知消费者
     SDK更新

  变更日志格式：
  ## [v2] - 2024-06-01
  ### 新增
  - 用户接口增加avatar字段
  - 新增批量创建订单接口
  ### 变更
  - 用户列表默认分页大小从50改为20
  ### 废弃
  - /v1/users 将于 2025-01-01 下线
  ### 修复
  - 修复排序字段大小写不敏感问题

  API设计审查检查项：
  ✓ URL命名规范
  ✓ HTTP方法语义正确
  ✓ 请求/响应格式统一
  ✓ 错误处理规范
  ✓ 安全考虑（认证/授权/输入校验）
  ✓ 性能考虑（分页/缓存/限流）
  ✓ 向后兼容性
```

---

## 10. API版本面试速答？

**回答：**

```
Q: API版本管理推荐什么方案？
A: URL路径（/v1/users）最简单直观
   缓存友好 工具都支持

Q: 什么变更需要新版本？
A: 删除/重命名字段、改类型、改语义
   新增可选字段不需要

Q: 怎么保持向后兼容？
A: 只增不删 新字段给默认值
   客户端忽略未知字段

Q: 旧版本怎么下线？
A: 标记Deprecation+Sunset Header
   过渡期至少6个月后返回410

Q: GraphQL需要版本吗？
A: 不需要 用@deprecated渐进演进
   客户端只查需要的字段

Q: 怎么保障API稳定？
A: 契约测试+兼容性集成测试
   API设计审查+变更日志

Q: Protobuf怎么演进？
A: 字段编号不变不复用
   删除字段用reserved保留编号

Q: 多版本代码怎么组织？
A: 小改→同服务路由
   大改→独立服务部署
   适配器模式复用逻辑
```
