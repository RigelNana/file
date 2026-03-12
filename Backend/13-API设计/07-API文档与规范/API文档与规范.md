# API文档与规范

---

## 1. OpenAPI/Swagger规范？

**回答：**

```
  OpenAPI = API描述标准（原Swagger规范）
  当前版本：OpenAPI 3.1

  基本结构（YAML）：
  openapi: "3.1.0"
  info:
    title: 用户服务API
    version: "1.0.0"
    description: 用户管理相关接口
  
  servers:
    - url: https://api.example.com/v1
  
  paths:
    /users:
      get:
        summary: 获取用户列表
        parameters:
          - name: page
            in: query
            schema: { type: integer, default: 1 }
          - name: limit
            in: query
            schema: { type: integer, default: 20, maximum: 100 }
        responses:
          "200":
            description: 成功
            content:
              application/json:
                schema:
                  $ref: "#/components/schemas/UserList"
      post:
        summary: 创建用户
        requestBody:
          required: true
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/CreateUserInput"
        responses:
          "201":
            description: 创建成功

  组件定义：
  components:
    schemas:
      User:
        type: object
        properties:
          id: { type: integer }
          name: { type: string }
          email: { type: string, format: email }
        required: [id, name, email]
    securitySchemes:
      bearerAuth:
        type: http
        scheme: bearer
        bearerFormat: JWT
```

---

## 2. Go自动生成API文档？

**回答：**

```
  swag工具：从代码注释生成OpenAPI文档

  安装：
  go install github.com/swaggo/swag/cmd/swag@latest

  代码注释：
  // @Summary      获取用户详情
  // @Description  根据ID获取用户信息
  // @Tags         用户
  // @Accept       json
  // @Produce      json
  // @Param        id   path      int  true  "用户ID"
  // @Success      200  {object}  Response{data=User}
  // @Failure      404  {object}  ErrorResponse
  // @Router       /users/{id} [get]
  // @Security     BearerAuth
  func GetUser(w http.ResponseWriter, r *http.Request) {
      // ...
  }
  
  // @Summary      创建用户
  // @Tags         用户
  // @Accept       json
  // @Produce      json
  // @Param        body  body      CreateUserInput  true  "用户信息"
  // @Success      201   {object}  Response{data=User}
  // @Failure      400   {object}  ErrorResponse
  // @Router       /users [post]
  func CreateUser(w http.ResponseWriter, r *http.Request) {
      // ...
  }

  生成文档：
  swag init -g cmd/server/main.go -o docs

  集成Swagger UI：
  import httpSwagger "github.com/swaggo/http-swagger"
  import _ "myapp/docs"
  
  mux.Handle("/swagger/", httpSwagger.WrapHandler)
  // 访问 http://localhost:8080/swagger/
```

---

## 3. API设计规范文档？

**回答：**

```
  API规范应包含：
  1. URL命名规范
     复数名词 小写 连字符分隔
  
  2. HTTP方法使用
     GET查 POST创建 PUT全量更新 PATCH部分更新 DELETE删除
  
  3. 请求格式
     Content-Type: application/json
     日期：RFC3339
     分页：cursor+limit
  
  4. 响应格式
     统一结构：
     {
       "data": {},
       "error": { "code": "", "message": "" },
       "pagination": {}
     }
  
  5. 状态码使用
     200成功 201创建 204无内容
     400参数错 401未认证 403无权限
     404不存在 409冲突 422验证失败 429限流
     500服务错误
  
  6. 错误码规范
     INVALID_PARAM / NOT_FOUND / UNAUTHORIZED
     业务错误码：USER_ALREADY_EXISTS
  
  7. 认证方式
     Bearer Token（JWT）
     API Key（第三方）
  
  8. 版本策略
     URL路径版本 /v1/

  规范文档模板：
  Markdown编写 → 放在项目README或Wiki
  CI检查API是否符合规范
```

---

## 4. Protobuf作为API文档？

**回答：**

```
  .proto文件天然是接口文档：
  强类型 + 注释 = 完整的API描述

  加注释的proto：
  // 用户服务
  // 提供用户CRUD和认证功能
  service UserService {
    // 获取用户详情
    // 返回指定ID的用户信息
    rpc GetUser(GetUserRequest) returns (GetUserResponse);
    
    // 创建用户
    // 需要管理员权限
    rpc CreateUser(CreateUserRequest) returns (CreateUserResponse);
  }
  
  // 用户信息
  message User {
    // 用户唯一标识
    int64 id = 1;
    // 用户名 2-32个字符
    string name = 2;
    // 邮箱地址 必须是合法格式
    string email = 3;
    // 用户角色
    Role role = 4;
  }

  生成文档：
  # protoc-gen-doc
  protoc --doc_out=./docs --doc_opt=markdown,api.md *.proto

  buf工具链（推荐）：
  # buf.yaml
  version: v2
  lint:
    use:
      - DEFAULT     # 命名规范检查
  breaking:
    use:
      - FILE        # 兼容性检查
  
  # 检查规范
  buf lint
  # 检查破坏性变更
  buf breaking --against .git#branch=main
```

---

## 5. API Mock与测试？

**回答：**

```
  Mock服务：前后端并行开发

  基于OpenAPI的Mock：
  # Prism（推荐）
  prism mock openapi.yaml
  # 自动生成示例数据 响应Mock

  Go Mock Server：
  func MockServer() http.Handler {
      mux := http.NewServeMux()
      
      mux.HandleFunc("GET /users/{id}", func(w http.ResponseWriter, r *http.Request) {
          w.Header().Set("Content-Type", "application/json")
          json.NewEncoder(w).Encode(map[string]interface{}{
              "data": map[string]interface{}{
                  "id":    1,
                  "name":  "Mock用户",
                  "email": "mock@test.com",
              },
          })
      })
      
      return mux
  }

  API测试：
  func TestGetUser(t *testing.T) {
      // 创建测试服务
      srv := httptest.NewServer(NewRouter())
      defer srv.Close()
      
      // 发送请求
      resp, err := http.Get(srv.URL + "/v1/users/1")
      assert.NoError(t, err)
      assert.Equal(t, 200, resp.StatusCode)
      
      // 验证响应
      var body Response
      json.NewDecoder(resp.Body).Decode(&body)
      assert.NotNil(t, body.Data)
  }

  契约测试：
  确保API变更不破坏消费者
  Pact / Spring Cloud Contract
  CI中自动运行
```

---

## 6. 错误码设计？

**回答：**

```
  错误码分类：
  ┌──────────────────┬──────────────────────────────┐
  │ 类别              │ 示例                         │
  ├──────────────────┼──────────────────────────────┤
  │ 通用错误          │ INVALID_PARAM / NOT_FOUND    │
  │ 认证错误          │ TOKEN_EXPIRED / UNAUTHORIZED │
  │ 权限错误          │ FORBIDDEN / INSUFFICIENT_ROLE│
  │ 业务错误          │ ORDER_ALREADY_PAID           │
  │ 系统错误          │ INTERNAL_ERROR / DB_ERROR    │
  │ 限流错误          │ RATE_LIMITED                 │
  └──────────────────┴──────────────────────────────┘

  Go错误码定义：
  type AppError struct {
      HTTPStatus int    `json:"-"`
      Code       string `json:"code"`
      Message    string `json:"message"`
  }
  
  func (e *AppError) Error() string { return e.Message }
  
  var (
      ErrNotFound      = &AppError{404, "NOT_FOUND", "资源不存在"}
      ErrInvalidParam  = &AppError{400, "INVALID_PARAM", "参数错误"}
      ErrUnauthorized  = &AppError{401, "UNAUTHORIZED", "未认证"}
      ErrForbidden     = &AppError{403, "FORBIDDEN", "无权限"}
      ErrAlreadyExists = &AppError{409, "ALREADY_EXISTS", "资源已存在"}
      ErrRateLimited   = &AppError{429, "RATE_LIMITED", "请求过于频繁"}
      ErrInternal      = &AppError{500, "INTERNAL_ERROR", "服务内部错误"}
  )
  
  // 业务错误
  var (
      ErrOrderPaid = &AppError{409, "ORDER_ALREADY_PAID", "订单已支付"}
      ErrBalanceInsufficient = &AppError{400, "BALANCE_INSUFFICIENT", "余额不足"}
  )

  统一错误处理中间件：
  func ErrorHandler(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          // 从context或panic中捕获错误
          // 统一转换为JSON错误响应
      })
  }
```

---

## 7. API变更通知？

**回答：**

```
  变更日志（CHANGELOG）：
  # API Changelog
  
  ## 2024-06-01 v1.5
  ### Added
  - POST /users/batch 批量创建用户
  - 用户响应新增 avatar 字段
  ### Changed
  - 列表接口默认分页改为20条
  ### Deprecated
  - GET /users/search 将于 2024-12 下线
    替代: POST /users/search

  通知渠道：
  1. API响应Header
     Deprecation: true
     Sunset: Sat, 01 Jan 2025 00:00:00 GMT
  
  2. 文档标注
     Swagger中标记deprecated
  
  3. 邮件通知
     发送给API Key持有者
  
  4. 开发者门户
     Developer Portal公告

  Go文档版本管理：
  每次API变更：
  1. 更新代码注释（swag注释）
  2. 重新生成文档（swag init）
  3. 更新CHANGELOG
  4. CI自动发布文档

  API差异检查（CI）：
  # 检查OpenAPI变更
  oasdiff breaking old.yaml new.yaml
  # 破坏性变更 → CI失败
```

---

## 8. API风格指南对比？

**回答：**

```
  各大厂API风格：
  ┌──────────────┬──────────────────────────────┐
  │ 公司          │ 特点                         │
  ├──────────────┼──────────────────────────────┤
  │ Google        │ 资源导向 面向资源的设计       │
  │ Stripe        │ 版本化URL 超强文档           │
  │ GitHub        │ REST + GraphQL 双API         │
  │ Twitter       │ 标准REST 游标分页            │
  │ 微信          │ JSON API 签名认证            │
  └──────────────┴──────────────────────────────┘

  Google API Design Guide要点：
  1. 面向资源：标准方法(List/Get/Create/Update/Delete)
  2. 自定义方法：POST /resource:customVerb
  3. 错误模型：统一错误结构
  4. 命名：camelCase字段名

  Stripe API优秀之处：
  1. 版本钉死（创建Key时确定版本）
  2. 文档含真实可运行示例
  3. 幂等Key标准化
  4. 展开（expand）减少请求

  建议：
  内部制定统一的API风格指南
  参考Google/Stripe的最佳实践
  用linter自动检查规范
```

---

## 9. 开发者体验（DX）？

**回答：**

```
  好的API文档 = 好的开发者体验

  DX要素：
  1. 快速上手
     5分钟能跑通第一个API调用
     curl示例 + SDK示例
  
  2. 交互式文档
     Swagger UI / Redoc
     Try it out 在线测试
  
  3. 完整示例
     每个接口都有请求和响应示例
     错误场景也有示例
  
  4. SDK支持
     主流语言SDK自动生成
     SDK文档和API文档同步
  
  5. 沙箱环境
     测试环境免费使用
     测试数据不影响生产

  Go开发者门户：
  mux.Handle("/", http.FileServer(http.Dir("docs/portal")))
  mux.Handle("/swagger/", httpSwagger.WrapHandler)
  mux.HandleFunc("/graphql", playground.Handler("GraphQL", "/query"))
  
  // API Key管理
  mux.HandleFunc("POST /developer/keys", CreateAPIKey)
  mux.HandleFunc("GET /developer/usage", GetAPIUsage)

  文档工具：
  Swagger UI：交互式REST文档
  Redoc：美观的静态文档
  Stoplight：可视化API设计
  Postman：API测试+文档
```

---

## 10. API文档面试速答？

**回答：**

```
Q: API文档用什么规范？
A: OpenAPI 3.x（原Swagger）
   YAML/JSON描述 工具生态丰富

Q: Go怎么生成API文档？
A: swag工具 从代码注释生成
   swag init → Swagger UI展示

Q: gRPC怎么做文档？
A: .proto文件本身就是文档
   protoc-gen-doc生成Markdown/HTML

Q: 错误码怎么设计？
A: 有意义的字符串(NOT_FOUND)
   分类：通用/认证/业务/系统

Q: 怎么管理API变更？
A: CHANGELOG记录变更
   CI检查破坏性变更(oasdiff)

Q: API Mock怎么用？
A: Prism基于OpenAPI自动Mock
   前后端并行开发

Q: 怎么做好开发者体验？
A: 交互式文档+完整示例+SDK
   5分钟能跑通第一个调用

Q: 怎么保证文档和代码同步？
A: 代码注释生成文档
   CI自动重新生成并发布
```
