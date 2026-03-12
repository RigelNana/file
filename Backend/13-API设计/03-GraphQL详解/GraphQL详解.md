# GraphQL详解

---

## 1. GraphQL核心概念？

**回答：**

```
  GraphQL = 查询语言 + 运行时

  核心特点：
  1. 按需查询 → 客户端精确指定需要的字段
  2. 单端点 → POST /graphql
  3. 强类型 → Schema定义所有类型
  4. 自描述 → 内省查询Schema

  三种操作：
  ┌──────────────┬──────────────────────────────┐
  │ 操作          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ Query         │ 查询（只读）                 │
  │ Mutation      │ 修改（增删改）               │
  │ Subscription  │ 订阅（WebSocket推送）        │
  └──────────────┴──────────────────────────────┘

  查询示例：
  # 请求
  query {
    user(id: "123") {
      name
      email
      orders(first: 5) {
        id
        total
        items { name price }
      }
    }
  }
  
  # 响应（结构完全匹配请求）
  {
    "data": {
      "user": {
        "name": "张三",
        "email": "zhang@test.com",
        "orders": [
          {
            "id": "1",
            "total": 199.0,
            "items": [{"name": "Go书", "price": 99.0}]
          }
        ]
      }
    }
  }
```

---

## 2. Schema定义与类型系统？

**回答：**

```
  Schema Definition Language (SDL)：
  # 标量类型
  scalar DateTime
  
  # 枚举
  enum Role { ADMIN USER GUEST }
  
  # 对象类型
  type User {
    id: ID!                    # !表示非空
    name: String!
    email: String
    role: Role!
    orders: [Order!]!          # 非空数组 元素也非空
    createdAt: DateTime!
  }
  
  type Order {
    id: ID!
    total: Float!
    status: String!
    user: User!
    items: [OrderItem!]!
  }
  
  # 输入类型（用于Mutation参数）
  input CreateUserInput {
    name: String!
    email: String!
    role: Role = USER          # 默认值
  }
  
  # 根类型
  type Query {
    user(id: ID!): User
    users(page: Int, limit: Int): [User!]!
  }
  
  type Mutation {
    createUser(input: CreateUserInput!): User!
    updateUser(id: ID!, input: UpdateUserInput!): User!
    deleteUser(id: ID!): Boolean!
  }

  接口与联合类型：
  interface Node { id: ID! }
  type User implements Node { id: ID! name: String! }
  
  union SearchResult = User | Order | Product
```

---

## 3. Go GraphQL实现？

**回答：**

```
  推荐框架：gqlgen（代码生成 类型安全）

  项目结构：
  ├── graph/
  │   ├── schema.graphqls     # Schema定义
  │   ├── schema.resolvers.go # Resolver实现
  │   ├── model/models_gen.go # 生成的模型
  │   └── generated.go        # 生成的代码
  └── gqlgen.yml              # 配置

  Resolver实现：
  // schema.resolvers.go
  type queryResolver struct{ *Resolver }
  
  func (r *queryResolver) User(ctx context.Context, id string) (*model.User, error) {
      return r.UserService.GetByID(ctx, id)
  }
  
  func (r *queryResolver) Users(ctx context.Context, page *int, limit *int) ([]*model.User, error) {
      p, l := 1, 20
      if page != nil { p = *page }
      if limit != nil { l = *limit }
      return r.UserService.List(ctx, p, l)
  }
  
  type mutationResolver struct{ *Resolver }
  
  func (r *mutationResolver) CreateUser(ctx context.Context, input model.CreateUserInput) (*model.User, error) {
      return r.UserService.Create(ctx, input)
  }

  启动服务：
  srv := handler.NewDefaultServer(
      generated.NewExecutableSchema(generated.Config{
          Resolvers: &graph.Resolver{
              UserService: userSvc,
          },
      }),
  )
  http.Handle("/graphql", srv)
  http.Handle("/", playground.Handler("GraphQL", "/graphql"))
```

---

## 4. N+1问题与DataLoader？

**回答：**

```
  N+1问题：
  查询用户列表 → 1次查询
  每个用户查订单 → N次查询
  总共N+1次数据库查询

  DataLoader解决：
  收集同一批次的所有ID → 批量查询

  Go DataLoader（graph/dataloader）：
  import "github.com/graph-gophers/dataloader/v7"
  
  func NewUserLoader(db *sql.DB) *dataloader.Loader[string, *model.User] {
      return dataloader.NewBatchedLoader(
          func(ctx context.Context, keys []string) []*dataloader.Result[*model.User] {
              // 批量查询
              users, _ := db.GetUsersByIDs(ctx, keys)
              
              userMap := make(map[string]*model.User)
              for _, u := range users {
                  userMap[u.ID] = u
              }
              
              results := make([]*dataloader.Result[*model.User], len(keys))
              for i, key := range keys {
                  results[i] = &dataloader.Result[*model.User]{
                      Data: userMap[key],
                  }
              }
              return results
          },
      )
  }
  
  // Resolver中使用
  func (r *orderResolver) User(ctx context.Context, obj *model.Order) (*model.User, error) {
      return r.UserLoader.Load(ctx, obj.UserID)()
  }

  DataLoader原理：
  同一请求中的所有Load调用
  → 在事件循环末尾批量执行
  → 1次SQL替代N次SQL
```

---

## 5. 查询复杂度与安全？

**回答：**

```
  GraphQL安全风险：
  1. 深度嵌套攻击
     { user { orders { items { product { reviews { ... } } } } } }
  
  2. 宽度攻击
     { users(limit: 10000) { ... } }
  
  3. 批量查询
     { a: user(id:"1"){...} b: user(id:"2"){...} ... }

  防护措施：
  1. 查询深度限制
  srv := handler.NewDefaultServer(schema)
  srv.Use(extension.FixedComplexityLimit(100))

  2. 复杂度计算
  type Query {
    users(limit: Int): [User!]! @cost(complexity: 10, multipliers: ["limit"])
  }

  3. 超时控制
  srv.SetQueryCache(lru.New(1000))
  srv.SetRecoverFunc(func(ctx context.Context, err interface{}) error {
      return fmt.Errorf("internal error")
  })

  4. 查询白名单（Persisted Queries）
  只允许预注册的查询
  客户端发送查询Hash而非查询文本
  
  POST /graphql
  { "extensions": { "persistedQuery": { "sha256Hash": "abc123" } } }

  5. 认证与授权
  // Directive实现权限控制
  type Query {
    adminUsers: [User!]! @hasRole(role: ADMIN)
  }

  6. 限流
  按用户/IP限制每分钟查询次数
  复杂查询消耗更多配额
```

---

## 6. Mutation设计模式？

**回答：**

```
  输入类型约定：
  input CreateUserInput {
    name: String!
    email: String!
  }
  
  type CreateUserPayload {
    user: User
    errors: [UserError!]
  }
  
  type UserError {
    field: String!
    message: String!
  }
  
  type Mutation {
    createUser(input: CreateUserInput!): CreateUserPayload!
  }

  好处：
  1. Input类型可扩展不破坏兼容
  2. Payload包含errors → 业务错误和数据一起返回
  3. 统一模式 所有Mutation风格一致

  批量操作：
  type Mutation {
    createUsers(inputs: [CreateUserInput!]!): CreateUsersPayload!
    deleteUsers(ids: [ID!]!): DeleteUsersPayload!
  }
  
  type CreateUsersPayload {
    users: [User!]
    errors: [BatchError!]
  }
  
  type BatchError {
    index: Int!        # 哪条记录出错
    field: String
    message: String!
  }

  乐观更新（前端）：
  客户端Mutation后立即更新UI
  服务端确认后同步最终结果
  失败则回滚UI
```

---

## 7. Subscription实时通信？

**回答：**

```
  Subscription = GraphQL + WebSocket

  Schema定义：
  type Subscription {
    messageAdded(channelID: ID!): Message!
    orderStatusChanged(orderID: ID!): Order!
  }

  gqlgen实现：
  func (r *subscriptionResolver) MessageAdded(
      ctx context.Context, channelID string,
  ) (<-chan *model.Message, error) {
      ch := make(chan *model.Message, 1)
      
      // 注册订阅
      id := r.PubSub.Subscribe(channelID, func(msg *model.Message) {
          select {
          case ch <- msg:
          default: // 防阻塞
          }
      })
      
      // 客户端断开时清理
      go func() {
          <-ctx.Done()
          r.PubSub.Unsubscribe(id)
          close(ch)
      }()
      
      return ch, nil
  }

  WebSocket配置：
  srv := handler.NewDefaultServer(schema)
  srv.AddTransport(&transport.Websocket{
      KeepAlivePingInterval: 10 * time.Second,
      Upgrader: websocket.Upgrader{
          CheckOrigin: func(r *http.Request) bool {
              return isAllowedOrigin(r.Header.Get("Origin"))
          },
      },
  })

  Subscription vs 轮询：
  实时性要求高 → Subscription
  简单场景 → 轮询
  大规模 → 考虑SSE + GraphQL查询
```

---

## 8. GraphQL vs REST选型？

**回答：**

```
  ┌──────────────────┬────────────────┬────────────────┐
  │ 维度              │ REST            │ GraphQL         │
  ├──────────────────┼────────────────┼────────────────┤
  │ 端点              │ 多个            │ 单个            │
  │ 数据获取          │ 固定结构         │ 按需查询        │
  │ Over-fetching    │ 常见            │ 无              │
  │ Under-fetching   │ 常见            │ 无              │
  │ 缓存              │ HTTP缓存友好    │ 需额外配置      │
  │ 文件上传          │ 原生支持         │ 需multipart扩展 │
  │ 学习曲线          │ 低              │ 中              │
  │ 类型安全          │ 需OpenAPI       │ 内置Schema      │
  │ 监控              │ URL级别         │ 需解析查询      │
  └──────────────────┴────────────────┴────────────────┘

  选REST：
  - 简单CRUD
  - 公开API第三方调用
  - 微服务间通信
  - 缓存重要
  - 文件上传/下载

  选GraphQL：
  - 多端（Web/Mobile/小程序）
  - 前端频繁变化需求
  - 复杂数据关系
  - 聚合多个后端服务（BFF）
  - 减少网络请求次数

  混合使用：
  外部API用REST + 内部BFF用GraphQL
  写操作REST + 复杂读操作GraphQL
```

---

## 9. GraphQL最佳实践？

**回答：**

```
  Schema设计：
  1. 用业务语义命名（不用数据库字段名）
  2. ID类型用ID! 不用Int!
  3. 分页用Connection模式
  
  type UserConnection {
    edges: [UserEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }
  type UserEdge {
    node: User!
    cursor: String!
  }
  type PageInfo {
    hasNextPage: Boolean!
    endCursor: String
  }

  错误处理：
  业务错误 → Payload.errors（200状态码）
  系统错误 → GraphQL errors数组
  
  {
    "data": { "createUser": { "user": null, "errors": [...] } },
    "errors": null  // 没有系统错误
  }

  性能优化：
  1. DataLoader批量查询（解决N+1）
  2. 查询持久化（减少传输）
  3. @defer/@stream（渐进式传输）
  4. 查询缓存（相同查询复用结果）

  工具链：
  Go: gqlgen（推荐 代码生成）
  Schema检查: graphql-inspector
  文档: GraphQL Playground/Apollo Studio
  监控: Apollo Studio/自建
```

---

## 10. GraphQL面试速答？

**回答：**

```
Q: GraphQL和REST区别？
A: GraphQL单端点按需查询
   REST多端点固定结构
   GraphQL解决Over/Under-fetching

Q: 什么是N+1问题？
A: 列表查询1次+每条关联查询N次
   DataLoader批量聚合解决

Q: GraphQL安全问题？
A: 深度嵌套/宽度攻击/批量查询
   限深度+复杂度计算+查询白名单

Q: Mutation怎么设计？
A: Input+Payload模式
   Payload包含data+errors

Q: Schema怎么演进？
A: 只增不删+@deprecated标记
   不需要版本号

Q: Subscription原理？
A: WebSocket长连接
   服务端推送数据变更

Q: 什么场景选GraphQL？
A: 多端按需查询/复杂数据关系/BFF聚合
   简单CRUD/公开API/文件上传选REST

Q: gqlgen优势？
A: 代码生成+类型安全+性能好
   Schema First开发方式
```
