# RESTful API设计

---

## 1. REST核心概念与约束？

**回答：**

```
  REST = Representational State Transfer 表征状态转移

  六大架构约束：
  ┌──────────────────┬──────────────────────────────┐
  │ 约束              │ 说明                         │
  ├──────────────────┼──────────────────────────────┤
  │ C/S架构           │ 前后端分离                   │
  │ 无状态            │ 每个请求包含完整信息          │
  │ 可缓存            │ 响应可标记缓存策略           │
  │ 统一接口          │ 资源+HTTP方法+表述           │
  │ 分层系统          │ 客户端不知道中间层           │
  │ 按需代码（可选）  │ 服务端可下发可执行代码       │
  └──────────────────┴──────────────────────────────┘

  资源（Resource）：
  一切皆资源 用URI标识
  /users         → 用户集合
  /users/123     → 具体用户
  /users/123/orders → 用户的订单

  表述（Representation）：
  JSON/XML/HTML等不同格式
  Content-Type: application/json
  Accept: application/json

  统一接口四要素：
  1. 资源标识（URI）
  2. 通过表述操作资源
  3. 自描述消息（Content-Type/Accept）
  4. HATEOAS（超媒体驱动）
```

---

## 2. HTTP方法与CRUD映射？

**回答：**

```
  ┌──────────┬──────────┬──────────┬──────────┬───────────┐
  │ 方法      │ 语义      │ 幂等     │ 安全     │ 示例       │
  ├──────────┼──────────┼──────────┼──────────┼───────────┤
  │ GET       │ 查询      │ ✅      │ ✅       │ GET /users │
  │ POST      │ 创建      │ ❌      │ ❌       │ POST /users│
  │ PUT       │ 全量更新  │ ✅      │ ❌       │ PUT /users/1│
  │ PATCH     │ 部分更新  │ ❌      │ ❌       │ PATCH /users/1│
  │ DELETE    │ 删除      │ ✅      │ ❌       │ DELETE /users/1│
  │ HEAD      │ 获取元数据│ ✅      │ ✅       │ HEAD /users│
  │ OPTIONS   │ 支持方法  │ ✅      │ ✅       │ OPTIONS /users│
  └──────────┴──────────┴──────────┴──────────┴───────────┘

  幂等 = 多次执行结果一致
  安全 = 不修改资源

  PUT vs PATCH：
  PUT: 全量替换 必须传完整对象
  PATCH: 部分更新 只传需要修改的字段

  Go路由注册：
  mux := http.NewServeMux()
  mux.HandleFunc("GET /users", ListUsers)
  mux.HandleFunc("GET /users/{id}", GetUser)
  mux.HandleFunc("POST /users", CreateUser)
  mux.HandleFunc("PUT /users/{id}", UpdateUser)
  mux.HandleFunc("PATCH /users/{id}", PatchUser)
  mux.HandleFunc("DELETE /users/{id}", DeleteUser)

  非CRUD操作怎么办？
  方案1：动词子资源
    POST /orders/123/cancel
    POST /users/123/activate
  方案2：将动作建模为资源
    POST /cancellations  body: {order_id: 123}
```

---

## 3. URL设计规范？

**回答：**

```
  URL原则：
  1. 使用名词复数 → /users /orders
  2. 连字符分隔 → /user-profiles（不用下划线）
  3. 全小写
  4. 层级表示从属 → /users/123/orders
  5. 嵌套不超过2层
  6. Query参数做过滤/分页/排序

  规范示例：
  ✅ GET  /users                      获取用户列表
  ✅ GET  /users/123                  获取用户详情
  ✅ GET  /users/123/orders           获取用户的订单
  ✅ GET  /users?status=active&page=1 过滤+分页
  ✅ POST /users/123/orders           创建用户的订单
  
  ❌ GET  /getUsers                   URL中有动词
  ❌ GET  /user/123                   单数
  ❌ GET  /users/123/orders/456/items/789  嵌套太深
  
  深层嵌套的解法：
  /orders/456/items       直接用顶层资源
  /items?order_id=456     查询参数过滤

  版本：
  /v1/users               URL路径版本（推荐）
  /api/v2/users           带api前缀

  特殊操作：
  POST /users/123/change-password  动作子资源
  POST /search                     搜索（复杂条件不适合GET）
```

---

## 4. 请求与响应设计？

**回答：**

```
  请求Body（JSON）：
  POST /users
  {
    "name": "张三",
    "email": "zhang@example.com",
    "role": "admin"
  }

  成功响应：
  创建 → 201 Created + Location Header + 返回完整对象
  HTTP/1.1 201 Created
  Location: /users/123
  {
    "id": 123,
    "name": "张三",
    "email": "zhang@example.com",
    "created_at": "2024-01-01T00:00:00Z"
  }

  列表响应（包含分页信息）：
  {
    "data": [
      {"id": 1, "name": "张三"},
      {"id": 2, "name": "李四"}
    ],
    "pagination": {
      "total": 100,
      "page": 1,
      "page_size": 20,
      "total_pages": 5
    }
  }

  错误响应（统一格式）：
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "请求参数验证失败",
      "details": [
        {"field": "email", "message": "邮箱格式不正确"},
        {"field": "name", "message": "名称不能为空"}
      ]
    }
  }

  Go统一响应结构：
  type Response struct {
      Data       interface{} `json:"data,omitempty"`
      Error      *ErrorInfo  `json:"error,omitempty"`
      Pagination *PageInfo   `json:"pagination,omitempty"`
  }
  
  type ErrorInfo struct {
      Code    string        `json:"code"`
      Message string        `json:"message"`
      Details []FieldError  `json:"details,omitempty"`
  }
```

---

## 5. 分页与排序？

**回答：**

```
  分页方案对比：
  ┌──────────────┬──────────────────┬──────────────────┐
  │ 方案          │ 优点              │ 缺点             │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 偏移分页      │ 简单 可跳页       │ 深页慢 数据漂移  │
  │ 游标分页      │ 性能稳定          │ 不能跳页         │
  │ 键集分页      │ 性能最好          │ 需要排序键       │
  └──────────────┴──────────────────┴──────────────────┘

  偏移分页：
  GET /users?page=1&page_size=20
  → SELECT * FROM users LIMIT 20 OFFSET 0

  游标分页（推荐大数据集）：
  GET /users?cursor=eyJpZCI6MTAwfQ&limit=20
  → SELECT * FROM users WHERE id > 100 LIMIT 20

  Go游标分页实现：
  type CursorPagination struct {
      Cursor string `query:"cursor"`
      Limit  int    `query:"limit"`
  }
  
  func ListUsers(db *sql.DB, cursor string, limit int) (*PageResult, error) {
      var lastID int
      if cursor != "" {
          decoded, _ := base64.StdEncoding.DecodeString(cursor)
          json.Unmarshal(decoded, &lastID)
      }
      
      rows, _ := db.Query(
          "SELECT id, name FROM users WHERE id > ? ORDER BY id LIMIT ?",
          lastID, limit+1) // 多查一条判断是否有下一页
      
      users := make([]User, 0, limit)
      // ... scan rows
      
      hasNext := len(users) > limit
      if hasNext { users = users[:limit] }
      
      var nextCursor string
      if hasNext {
          data, _ := json.Marshal(users[len(users)-1].ID)
          nextCursor = base64.StdEncoding.EncodeToString(data)
      }
      
      return &PageResult{Data: users, NextCursor: nextCursor}, nil
  }

  排序：
  GET /users?sort=created_at&order=desc
  GET /users?sort=-created_at,name  （-表降序）
```

---

## 6. 过滤与搜索？

**回答：**

```
  Query参数过滤：
  GET /users?status=active          等值过滤
  GET /users?role=admin&status=active  多条件AND
  GET /users?age_min=18&age_max=30    范围过滤
  GET /users?name=张                  模糊搜索
  GET /orders?created_after=2024-01-01  时间范围

  Go安全构建过滤：
  func BuildFilter(r *http.Request) (string, []interface{}) {
      where := "1=1"
      args := make([]interface{}, 0)
      
      if v := r.URL.Query().Get("status"); v != "" {
          where += " AND status = ?"
          args = append(args, v)
      }
      if v := r.URL.Query().Get("role"); v != "" {
          where += " AND role = ?"
          args = append(args, v)
      }
      if v := r.URL.Query().Get("name"); v != "" {
          where += " AND name LIKE ?"
          args = append(args, "%"+v+"%")
      }
      return where, args
  }

  复杂搜索：
  POST /users/search
  {
    "filters": [
      {"field": "status", "op": "eq", "value": "active"},
      {"field": "age", "op": "gte", "value": 18}
    ],
    "sort": [{"field": "created_at", "order": "desc"}],
    "page": {"cursor": "xxx", "limit": 20}
  }

  注意：
  复杂查询用POST（GET URL长度受限）
  所有过滤字段用参数化查询（防SQL注入）
  白名单限制可过滤字段
```

---

## 7. 资源关系与嵌套？

**回答：**

```
  关系表达方式：
  1. URL嵌套（强从属关系）
     GET /users/123/orders         用户的所有订单
     POST /users/123/orders        为用户创建订单
  
  2. Query参数（弱关联）
     GET /orders?user_id=123       按用户过滤订单
  
  3. 字段展开（减少请求）
     GET /orders/456?expand=user,items
     响应中内联关联对象

  嵌套深度限制：
  ✅ /users/123/orders                 2层
  ❌ /users/123/orders/456/items/789   3层以上

  解决深嵌套：
  /orders/456         直接访问顶层资源
  /order-items?order_id=456   查询参数

  关联资源操作：
  多对多关系（用户-角色）：
  PUT    /users/123/roles/admin     添加角色
  DELETE /users/123/roles/admin     移除角色
  GET    /users/123/roles           查看角色

  Go Handler处理嵌套：
  // Go 1.22 路由模式
  mux.HandleFunc("GET /users/{userID}/orders", func(w http.ResponseWriter, r *http.Request) {
      userID := r.PathValue("userID")
      orders, _ := db.GetOrdersByUser(userID)
      json.NewEncoder(w).Encode(Response{Data: orders})
  })

  HATEOAS（超媒体链接）：
  {
    "id": 123,
    "name": "张三",
    "_links": {
      "self": "/users/123",
      "orders": "/users/123/orders"
    }
  }
```

---

## 8. 内容协商与序列化？

**回答：**

```
  内容协商：客户端和服务端协商响应格式
  
  Accept Header → 客户端期望的格式
  Content-Type Header → 实际发送的格式

  GET /users/123
  Accept: application/json          → 返回JSON
  Accept: application/xml           → 返回XML
  Accept: text/csv                  → 返回CSV

  Go实现内容协商：
  func GetUser(w http.ResponseWriter, r *http.Request) {
      user := fetchUser(r.PathValue("id"))
      
      accept := r.Header.Get("Accept")
      switch {
      case strings.Contains(accept, "application/xml"):
          w.Header().Set("Content-Type", "application/xml")
          xml.NewEncoder(w).Encode(user)
      case strings.Contains(accept, "text/csv"):
          w.Header().Set("Content-Type", "text/csv")
          fmt.Fprintf(w, "%d,%s,%s\n", user.ID, user.Name, user.Email)
      default:
          w.Header().Set("Content-Type", "application/json")
          json.NewEncoder(w).Encode(user)
      }
  }

  日期格式：
  RFC3339: "2024-01-01T00:00:00Z"（推荐）

  字段命名：
  JSON用snake_case（user_name）或camelCase（userName）
  全项目统一 不要混用

  空值处理：
  Go: omitempty → 零值不输出
  null vs 不存在 → 含义不同
  PATCH时 null表示清空 不存在表示不修改
```

---

## 9. 缓存与性能？

**回答：**

```
  HTTP缓存机制：
  1. 强缓存（不发请求）
     Cache-Control: max-age=3600      缓存1小时
     Cache-Control: no-cache          每次验证
     Cache-Control: no-store          禁止缓存

  2. 协商缓存（条件请求）
     ETag + If-None-Match
     Last-Modified + If-Modified-Since
     → 未修改返回304 Not Modified

  Go实现ETag：
  func GetUser(w http.ResponseWriter, r *http.Request) {
      user := fetchUser(r.PathValue("id"))
      data, _ := json.Marshal(user)
      
      // 生成ETag
      hash := sha256.Sum256(data)
      etag := fmt.Sprintf(`"%x"`, hash[:8])
      
      // 检查条件请求
      if r.Header.Get("If-None-Match") == etag {
          w.WriteHeader(http.StatusNotModified)
          return
      }
      
      w.Header().Set("ETag", etag)
      w.Header().Set("Cache-Control", "max-age=60")
      w.Header().Set("Content-Type", "application/json")
      w.Write(data)
  }

  API性能优化：
  1. 字段选择 → ?fields=id,name,email
  2. 数据压缩 → gzip/brotli
  3. 分页限制 → 单页最多100条
  4. 批量接口 → 减少请求次数
  5. 异步处理 → 大任务返回202 + 轮询

  响应压缩中间件：
  import "compress/gzip"
  // 或使用 github.com/klauspost/compress
```

---

## 10. RESTful API面试速答？

**回答：**

```
Q: REST核心约束？
A: 无状态+统一接口+资源导向
   URI表示资源 HTTP方法表操作

Q: PUT和PATCH区别？
A: PUT全量替换（必须传完整对象）
   PATCH部分更新（只传修改字段）

Q: URL怎么设计？
A: 名词复数+小写+连字符
   嵌套不超2层 过滤用Query参数

Q: 分页怎么做？
A: 推荐游标分页（性能稳定）
   偏移分页简单但深页慢

Q: 错误响应怎么设计？
A: 统一格式 code+message+details
   正确使用HTTP状态码

Q: 幂等性怎么保证？
A: GET/PUT/DELETE天然幂等
   POST用Idempotency-Key去重

Q: 版本怎么管理？
A: URL路径（/v1/users）最简单
   只新增不删字段保持兼容

Q: 如何优化API性能？
A: HTTP缓存(ETag/Cache-Control)
   字段选择+分页限制+gzip压缩
```
