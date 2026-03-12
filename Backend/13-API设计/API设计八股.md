# API设计八股文

## 一、API风格与规范

### 1. RESTful API的核心原则是什么？

**答：** REST（表征状态转移）核心原则：资源导向（URI表示资源），动词约束（GET/POST/PUT/DELETE映射CRUD），无状态（每次请求包含所有信息），统一接口。URL用名词复数（/users），层级表示关系（/users/1/orders），HTTP方法表语义，状态码表结果。

### 2. 如何设计良好的RESTful URL？

**答：** URL一律小写、用连字符分隔、名词复数，资源嵌套不超过2层：`/users/{id}/orders`。过滤用Query参数（?status=active&page=1），避免URL中含动词（不用/getUser），版本号放URL（/v1/users）或Header（Accept: application/vnd.api+json;version=1）。

### 3. GraphQL和REST的区别？

**答：** REST多端点固定数据结构，GraphQL单端点按需查询。GraphQL优势：避免Over-fetching/Under-fetching，客户端精确指定需要的字段，强类型Schema，适合前端复杂查询。REST优势：缓存友好（HTTP缓存），简单直观，生态成熟。后台管理/多端聚合场景适合GraphQL，简单CRUD和公开API适合REST。

### 4. gRPC和REST的区别？

**答：** gRPC基于HTTP/2 + Protobuf，高性能二进制序列化，原生支持双向流式通信，强类型IDL定义接口，适合微服务内部通信。REST基于HTTP/1.1 + JSON，人类可读，浏览器友好，适合对外API。性能上gRPC比REST快5-10倍，但调试不如REST直观。

## 二、版本与演进

### 5. API版本管理有哪些方案？

**答：** ①URL路径版本（/v1/users）：简单直观，推荐；②Query参数（?version=1）：可选但容易遗漏；③Header版本（Accept: application/vnd.api.v1+json）：语义正确但不直观；④无版本（保持向后兼容）：适合内部API。新增字段不改版本，删除/修改字段需新版本，旧版本至少维护6个月。

### 6. 如何保证API的向后兼容性？

**答：** 只新增不删除字段，新增字段给默认值，枚举值只增不减，响应中新增字段客户端应忽略未知字段。破坏性变更（改字段类型/删字段/改语义）必须发新版本。使用Deprecation Header标记即将废弃的接口。

## 三、接口设计

### 7. 接口幂等性怎么设计？

**答：** GET/DELETE天然幂等。POST创建用唯一请求ID（Idempotency-Key Header），服务端去重。PUT全量替换天然幂等。实现方案：①去重表（唯一键+请求ID）；②状态机（只允许合法状态流转）；③Token机制（先获取Token，使用后失效）。Redis SETNX（带TTL）是最简单的幂等实现。

### 8. API错误处理和状态码怎么设计？

**答：** 2xx成功（200 OK，201 Created，204 No Content），4xx客户端错误（400参数错，401未认证，403无权限，404不存在，409冲突，422校验失败，429限流），5xx服务端错误（500内部错误，502网关错，503不可用）。错误响应统一结构：`{"code":"INVALID_PARAM","message":"邮箱格式错误","details":[...]}`。

### 9. API限流和降级怎么做？

**答：** 限流维度：IP、用户、API粒度。算法：令牌桶（平滑限流）、滑动窗口（精确计数）。响应：429状态码 + `Retry-After` Header + `X-RateLimit-Remaining`。降级：非核心接口返回缓存/默认值，核心接口保障可用。API网关层统一限流 + 业务层细粒度限流。

## 四、网关与文档

### 10. API网关的职责？

**答：** 统一入口：路由转发、协议转换（HTTP→gRPC）；安全：认证鉴权、限流、IP黑名单；可观测：请求日志、链路追踪、监控指标；流量管理：灰度发布、AB测试、负载均衡；其他：请求/响应改写、缓存、CORS。常用方案：Kong、APISIX、自研（Go net/http/httputil.ReverseProxy）。

### 11. API文档管理最佳实践？

**答：** 使用OpenAPI/Swagger规范定义API，代码注释生成文档（swag工具），CI自动更新文档，文档和代码同步。Protobuf天然是gRPC的文档。好的文档包括：接口说明、请求/响应示例、错误码列表、认证说明、变更日志。

## 五、进阶实践

### 12. 如何设计批量操作API？

**答：** 批量创建：POST /users/batch 请求体为数组；批量删除：DELETE /users?ids=1,2,3 或 POST /users/batch-delete；部分成功处理：返回每条结果的成功/失败状态，HTTP状态码用207 Multi-Status。限制单次批量上限（如100条），支持异步处理大批量。

### 13. 分页和排序怎么设计？

**答：** 游标分页（推荐）：`?cursor=xxx&limit=20`，性能稳定，适合无限滚动；偏移分页：`?page=1&page_size=20`，简单直观但深页性能差。响应包含总数/下一页信息。排序：`?sort=created_at&order=desc`，多字段`?sort=status,-created_at`（-表示降序）。

### 14. 如何做好API安全设计？

**答：** 认证（JWT/OAuth2）、授权（RBAC）、输入校验（参数验证+SQL注入防护）、传输加密（HTTPS）、限流防刷、签名防篡改（HMAC）、敏感数据脱敏、CORS白名单、安全Header（CSP/HSTS）、审计日志。对外API额外：API Key + IP白名单 + 签名验签。
