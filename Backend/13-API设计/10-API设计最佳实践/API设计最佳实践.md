# API设计最佳实践

---

## 1. API设计原则？

**回答：**

```
  核心原则：
  ┌──────────────────┬──────────────────────────────┐
  │ 原则              │ 说明                         │
  ├──────────────────┼──────────────────────────────┤
  │ 一致性            │ 命名/格式/错误处理全局统一   │
  │ 简洁性            │ 接口语义清晰 参数最小化      │
  │ 可预测性          │ 开发者能猜到接口怎么用       │
  │ 安全性            │ 认证+授权+校验+加密          │
  │ 可演进性          │ 向后兼容 不频繁大改          │
  │ 幂等性            │ 写操作可安全重试             │
  │ 可观测性          │ 日志+指标+追踪               │
  └──────────────────┴──────────────────────────────┘

  KISS原则在API中：
  ❌ POST /api/v2/user-management/users/create-new-user
  ✅ POST /v1/users

  ❌ 一个接口做5件事（God API）
  ✅ 每个接口做一件事

  ❌ 返回整个数据库表的所有字段
  ✅ 只返回必要字段

  API设计三问：
  1. 消费者是谁？（前端/第三方/内部服务）
  2. 用例是什么？（CRUD/批量/实时）
  3. 数据边界在哪？（哪些字段/多少条/什么权限）
```

---

## 2. 命名规范最佳实践？

**回答：**

```
  URL命名：
  ✅ 名词复数: /users /orders /products
  ✅ 小写: /user-profiles (连字符)
  ✅ 层级: /users/123/orders
  ❌ 驼峰: /userProfiles
  ❌ 下划线: /user_profiles
  ❌ 动词: /getUsers /createOrder

  JSON字段命名：
  选一种 全项目统一
  snake_case: user_name (推荐 Go/Python)
  camelCase: userName (前端友好)

  枚举值命名：
  ✅ SCREAMING_SNAKE_CASE: "ORDER_PENDING"
  ✅ kebab-case: "order-pending"
  ❌ 数字: 1, 2, 3（无语义）

  API端点命名：
  // 标准CRUD
  GET    /users           列表
  GET    /users/123       详情
  POST   /users           创建
  PUT    /users/123       全量更新
  PATCH  /users/123       部分更新
  DELETE /users/123       删除
  
  // 特殊操作
  POST   /users/123/activate       激活
  POST   /orders/123/cancel        取消
  POST   /users/search             复杂搜索
  GET    /users/me                 当前用户

  查询参数命名：
  ?page=1&page_size=20
  ?sort=created_at&order=desc
  ?status=active&role=admin
  ?fields=id,name,email
```

---

## 3. 请求响应设计最佳实践？

**回答：**

```
  请求设计：
  1. 最小化参数
     只要求必需参数 可选参数给默认值
  
  2. 合理使用HTTP方法
     GET: Query参数
     POST/PUT/PATCH: Body
     DELETE: 无Body或简单Body
  
  3. 批量操作
     POST /users/batch  body: { "items": [...] }
     限制单次数量 支持部分成功

  响应设计（信封模式）：
  // 单个对象
  { "data": { "id": 1, "name": "张三" } }
  
  // 列表
  {
    "data": [...],
    "pagination": { "total": 100, "page": 1, "page_size": 20 }
  }
  
  // 错误
  { "error": { "code": "NOT_FOUND", "message": "..." } }

  还是扁平模式？
  // 单个对象直接返回
  { "id": 1, "name": "张三" }
  
  // 列表
  [{ "id": 1 }, { "id": 2 }]

  推荐信封模式（便于扩展meta信息）

  空值处理：
  null vs 缺失 → 语义不同
  PATCH: null=清空 缺失=不修改
  GET: omitempty → 零值不返回
```

---

## 4. 安全最佳实践？

**回答：**

```
  API安全清单：
  1. 认证
     ✅ 统一认证（JWT/OAuth2）
     ✅ 公开接口白名单机制
     ❌ URL中传Token

  2. 授权
     ✅ 接口级RBAC
     ✅ 数据级权限（只能看自己的）
     ❌ 仅前端控制权限

  3. 输入校验
     ✅ 所有参数校验类型/长度/格式
     ✅ 参数化查询（防SQL注入）
     ❌ 信任客户端输入

  4. 传输安全
     ✅ HTTPS + HSTS
     ✅ 安全Header(CSP/X-Frame-Options)

  5. 限流
     ✅ IP+用户+API多维度
     ✅ 429 + Retry-After
     
  6. 日志审计
     ✅ 记录敏感操作
     ✅ 包含request_id
     ❌ 记录密码/Token

  7. 数据保护
     ✅ 敏感字段脱敏（手机/身份证）
     ✅ 响应只返回必要字段
     ❌ 返回数据库所有字段

  Go安全中间件链：
  handler := chain(
      recoveryMiddleware,     // 1. panic恢复
      requestIDMiddleware,    // 2. 请求ID
      loggingMiddleware,      // 3. 访问日志
      securityHeadersMiddleware, // 4. 安全Header
      corsMiddleware,         // 5. CORS
      rateLimitMiddleware,    // 6. 限流
      authMiddleware,         // 7. 认证
      router,                 // 8. 路由
  )
```

---

## 5. 性能最佳实践？

**回答：**

```
  API性能优化：
  1. 减少数据量
     分页（限制page_size上限）
     字段选择（?fields=id,name）
     压缩（gzip/brotli）
  
  2. 缓存
     HTTP缓存（ETag/Cache-Control）
     服务端缓存（Redis）
     CDN缓存（静态资源）
  
  3. 批量化
     batch接口减少请求次数
     GraphQL一次查询多个资源
  
  4. 异步处理
     耗时操作返回202 Accepted
     轮询/WebSocket获取结果
     POST /reports → 202 + Location: /reports/123
     GET /reports/123 → 200 (completed) / 202 (processing)
  
  5. 连接复用
     HTTP/2多路复用
     Keep-Alive
     连接池

  Go性能中间件：
  // 响应压缩
  func GzipMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
              next.ServeHTTP(w, r)
              return
          }
          
          gz := gzip.NewWriter(w)
          defer gz.Close()
          
          w.Header().Set("Content-Encoding", "gzip")
          next.ServeHTTP(&gzipResponseWriter{ResponseWriter: w, Writer: gz}, r)
      })
  }
```

---

## 6. 文档最佳实践？

**回答：**

```
  好文档的标准：
  1. 完整性
     所有接口都有文档
     包含请求/响应/错误示例
  
  2. 准确性
     代码和文档同步
     CI自动生成
  
  3. 可交互
     可以直接在文档中测试
     Swagger UI / Postman
  
  4. 可发现
     统一入口（/docs）
     搜索功能

  文档必须包含：
  ✅ 接口说明（做什么）
  ✅ 请求参数（类型/必选/默认值）
  ✅ 响应结构（字段说明）
  ✅ 错误码列表
  ✅ 认证方式
  ✅ 速率限制
  ✅ 完整示例（curl/SDK）
  ✅ 变更日志

  自动化文档流程：
  代码注释 → swag init → CI构建
  → 发布到文档站 → 自动通知变更

  API文档站推荐：
  Swagger UI（交互式）
  Redoc（美观）
  Docusaurus（综合文档站）
```

---

## 7. 测试最佳实践？

**回答：**

```
  API测试金字塔：
  ┌─────────────────┐
  │    E2E测试       │ 少量 关键流程
  ├─────────────────┤
  │   集成测试       │ API级别 中等数量
  ├─────────────────┤
  │   单元测试       │ 大量 函数级别
  └─────────────────┘

  Go API集成测试：
  func TestCreateUser(t *testing.T) {
      srv := httptest.NewServer(NewRouter())
      defer srv.Close()
      
      body := `{"name":"张三","email":"zhang@test.com"}`
      resp, err := http.Post(srv.URL+"/v1/users",
          "application/json", strings.NewReader(body))
      
      assert.NoError(t, err)
      assert.Equal(t, 201, resp.StatusCode)
      
      var result struct {
          Data struct {
              ID    int    `json:"id"`
              Name  string `json:"name"`
              Email string `json:"email"`
          } `json:"data"`
      }
      json.NewDecoder(resp.Body).Decode(&result)
      assert.Equal(t, "张三", result.Data.Name)
  }

  表格驱动测试：
  tests := []struct {
      name       string
      method     string
      path       string
      body       string
      wantStatus int
      wantCode   string
  }{
      {"正常创建", "POST", "/users", `{"name":"a","email":"a@b.com"}`, 201, ""},
      {"缺少name", "POST", "/users", `{"email":"a@b.com"}`, 400, "VALIDATION_ERROR"},
      {"不存在", "GET", "/users/999", "", 404, "NOT_FOUND"},
  }

  覆盖场景：
  ✅ 正常路径（Happy Path）
  ✅ 参数校验（各种边界）
  ✅ 认证失败（401）
  ✅ 权限不足（403）
  ✅ 资源不存在（404）
  ✅ 并发场景（竞态条件）
```

---

## 8. 向后兼容最佳实践？

**回答：**

```
  兼容性规则：
  可以做（不破坏兼容）：
  ✅ 新增端点
  ✅ 新增可选请求参数（有默认值）
  ✅ 新增响应字段
  ✅ 放宽校验规则

  不能做（需要新版本）：
  ❌ 删除端点
  ❌ 删除响应字段
  ❌ 修改字段类型
  ❌ 添加必填参数
  ❌ 修改状态码含义
  ❌ 修改错误码

  CI兼容性检查：
  # 检查OpenAPI变更是否兼容
  oasdiff breaking api/v1/openapi.yaml api/v1/openapi-new.yaml
  
  # 不兼容变更 → CI失败

  Protobuf兼容性：
  buf breaking --against .git#branch=main
  # 字段编号变更/删除 → CI失败

  过渡期操作：
  1. 新字段并行返回
  2. Deprecation Header
  3. 监控旧接口使用量
  4. 使用量为0后下线
```

---

## 9. 微服务API设计？

**回答：**

```
  内部API vs 外部API：
  ┌──────────────┬──────────────────┬──────────────────┐
  │ 维度          │ 内部API           │ 外部API          │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 协议          │ gRPC              │ REST + JSON      │
  │ 认证          │ mTLS              │ JWT / API Key    │
  │ 版本          │ Protobuf编号      │ URL版本          │
  │ 文档          │ .proto文件        │ OpenAPI          │
  │ 容错          │ 重试+熔断         │ 限流+降级        │
  └──────────────┴──────────────────┴──────────────────┘

  BFF模式（Backend For Frontend）：
  Web端 → Web BFF → 微服务
  App端 → App BFF → 微服务
  BFF聚合多个服务 适配前端需求

  服务间通信原则：
  1. 接口契约先行（Proto/OpenAPI）
  2. 超时必设
  3. 重试+幂等
  4. 熔断保护
  5. 链路追踪

  事件驱动：
  同步请求 → gRPC/REST
  异步通知 → 消息队列（Kafka/NATS）
  不是所有通信都要同步API
```

---

## 10. API设计面试速答？

**回答：**

```
Q: API设计最重要的原则？
A: 一致性+简洁性+安全性
   全项目统一风格 接口语义清晰

Q: RESTful URL怎么设计？
A: 名词复数+小写+连字符
   嵌套不超2层 动作用POST子资源

Q: 分页推荐什么方案？
A: 游标分页（性能稳定）
   偏移分页简单但深页慢

Q: 错误怎么设计？
A: 正确HTTP状态码+统一错误格式
   code+message+details+request_id

Q: 怎么保证幂等？
A: Idempotency-Key/数据库唯一约束/状态机
   Redis SETNX最简单

Q: 内部API用什么？
A: gRPC + Protobuf
   高性能+强类型+流式通信

Q: 怎么保证向后兼容？
A: 只增不删 新字段给默认值
   CI检查破坏性变更

Q: API安全怎么做？
A: 认证+授权+校验+限流+加密
   不信任客户端 不暴露内部信息
```
