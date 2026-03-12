# OAuth2与OIDC

---

## 1. OAuth2核心概念？

**回答：**

```
  OAuth2 = 授权框架 允许第三方应用访问资源

  四个角色：
  Resource Owner：用户（资源所有者）
  Client：第三方应用
  Authorization Server：授权服务器（签发Token）
  Resource Server：资源服务器（存放用户数据）

  ┌──────────────┐                    ┌───────────────┐
  │ Resource     │   Authorization    │ Authorization │
  │ Owner(用户)  │──────Grant────────→│ Server        │
  └──────────────┘                    └───────┬───────┘
                                              │
  ┌──────────────┐    Access Token    ┌───────▼───────┐
  │ Client       │←──────────────────│               │
  │ (第三方应用)  │                    └───────────────┘
  │              │    Access Token    ┌───────────────┐
  │              │──────────────────→│ Resource      │
  │              │←── Protected Data │ Server        │
  └──────────────┘                    └───────────────┘

  核心Token：
  Access Token：访问资源的凭证 有效期短
  Refresh Token：刷新Access Token 有效期长
  Authorization Code：一次性授权码 换取Token
```

---

## 2. 授权码模式详解？

**回答：**

```
  最安全的OAuth2模式 适合有后端的Web应用

  流程：
  1. 用户点击"GitHub登录"
  2. 跳转到GitHub授权页面
  3. 用户同意授权
  4. GitHub回调应用 携带code
  5. 应用后端用code换access_token（服务端间通信）
  6. 用access_token获取用户信息

  安全关键：
  code→token在服务端完成（不暴露给前端）
  state参数防CSRF
  code一次性使用 有效期短

  请求示例：
  # 1. 跳转授权
  GET https://auth.example.com/authorize?
      response_type=code&
      client_id=xxx&
      redirect_uri=https://app.com/callback&
      scope=openid profile email&
      state=random_csrf_token

  # 2. 回调
  GET https://app.com/callback?code=AUTH_CODE&state=random_csrf_token

  # 3. 换Token
  POST https://auth.example.com/token
      grant_type=authorization_code&
      code=AUTH_CODE&
      client_id=xxx&
      client_secret=xxx&
      redirect_uri=https://app.com/callback

  # 4. 响应
  {
    "access_token": "eyJ...",
    "token_type": "Bearer",
    "expires_in": 3600,
    "refresh_token": "dGhp..."
  }
```

---

## 3. PKCE扩展？

**回答：**

```
  PKCE = Proof Key for Code Exchange
  防止授权码劫持（SPA/移动端无法保密client_secret）

  原理：
  1. Client生成随机code_verifier
  2. 计算code_challenge = SHA256(code_verifier)
  3. 授权请求带code_challenge
  4. 换Token时带code_verifier
  5. 授权服务器验证SHA256(code_verifier)==code_challenge

  即使code被截获 没有code_verifier也无法换Token

Go PKCE实现：
  func generatePKCE() (verifier, challenge string) {
      // 生成随机verifier
      buf := make([]byte, 32)
      rand.Read(buf)
      verifier = base64.RawURLEncoding.EncodeToString(buf)
      
      // 计算challenge
      h := sha256.Sum256([]byte(verifier))
      challenge = base64.RawURLEncoding.EncodeToString(h[:])
      return
  }

  // 授权请求
  // GET /authorize?code_challenge=xxx&code_challenge_method=S256&...

  // 换Token时
  // POST /token  code_verifier=original_verifier&...

  推荐：
  所有公开客户端（SPA/移动端/桌面）必须使用PKCE
  OAuth2.1已将PKCE设为强制要求
```

---

## 4. OAuth2其他模式？

**回答：**

```
  客户端凭证模式（Client Credentials）：
  服务间调用 无用户参与
  POST /token
      grant_type=client_credentials&
      client_id=xxx&
      client_secret=xxx&
      scope=api:read

  适用：微服务间调用/后台任务/系统集成

  密码模式（Resource Owner Password）：
  用户直接将密码给Client
  POST /token
      grant_type=password&
      username=user&
      password=pass&
      client_id=xxx

  风险高 仅限高度信任的第一方应用
  OAuth2.1已移除此模式

  设备授权模式（Device Authorization）：
  智能电视/IoT设备登录
  设备显示code → 用户在手机上输入code授权

  Refresh Token：
  POST /token
      grant_type=refresh_token&
      refresh_token=dGhp...&
      client_id=xxx

  Refresh Token安全策略：
  绑定客户端
  轮换（每次刷新签发新的Refresh Token）
  支持吊销
```

---

## 5. OIDC原理？

**回答：**

```
  OIDC = OpenID Connect = OAuth2 + 身份认证

  OAuth2只做授权 OIDC在其上添加认证层

  新增概念：
  ID Token：JWT格式 包含用户身份信息
  UserInfo Endpoint：获取用户详细信息
  Discovery：/.well-known/openid-configuration

  ID Token示例（JWT Payload）：
  {
    "iss": "https://auth.example.com",  // 签发者
    "sub": "user123",                    // 用户唯一ID
    "aud": "client_app",                 // 受众
    "exp": 1700000000,                   // 过期时间
    "iat": 1699996400,                   // 签发时间
    "nonce": "abc123",                   // 防重放
    "email": "user@example.com",
    "name": "张三"
  }

  OIDC vs OAuth2：
  ┌──────────┬──────────────┬──────────────────┐
  │          │ OAuth2        │ OIDC             │
  ├──────────┼──────────────┼──────────────────┤
  │ 目的      │ 授权          │ 认证+授权        │
  │ Token    │ Access Token │ Access+ID Token  │
  │ 用户信息  │ 无标准       │ UserInfo标准端点 │
  │ 发现     │ 无           │ Discovery端点    │
  └──────────┴──────────────┴──────────────────┘

  OIDC Provider：
  Google/Microsoft/Apple/Auth0/Keycloak
```

---

## 6. OAuth2安全最佳实践？

**回答：**

```
  必须做：
  1. 强制使用HTTPS
  2. state参数防CSRF
  3. PKCE防授权码劫持
  4. redirect_uri严格匹配（不允许通配符）
  5. Access Token短过期（15min-1h）
  6. Refresh Token绑定客户端+可吊销
  7. client_secret不暴露给前端

  不要做：
  ✗ 在URL中传递Access Token
  ✗ 使用隐式模式（Implicit）
  ✗ 使用密码模式
  ✗ 在前端存储client_secret
  ✗ 信任redirect_uri参数（需注册验证）

  Token存储位置：
  Web应用后端 → 服务端Session/内存
  SPA → HttpOnly Cookie（BFF模式）
  移动端 → 安全存储（Keychain/Keystore）

  BFF模式（推荐SPA）：
  ┌────────┐   Cookie  ┌──────┐   Token  ┌─────────┐
  │  SPA   │──────────→│ BFF  │─────────→│ API     │
  │ 前端   │           │Server│          │ Server  │
  └────────┘           └──────┘          └─────────┘
  Token只在BFF和API间传递 前端只用Cookie
```

---

## 7. OAuth2授权服务器实现？

**回答：**

```
  自建 vs 使用现成方案：

  现成方案（推荐）：
  ┌──────────────┬──────────────────────────────┐
  │ 方案          │ 特点                         │
  ├──────────────┼──────────────────────────────┤
  │ Keycloak      │ 开源 功能齐全 Java           │
  │ Auth0         │ SaaS 快速集成 收费           │
  │ Casdoor       │ 开源 Go实现 国产             │
  │ Hydra         │ 开源 Go实现 只做OAuth2       │
  │ Authelia      │ 开源 轻量 适合自托管         │
  └──────────────┴──────────────────────────────┘

  Go接入OAuth2（客户端侧）：
  import "golang.org/x/oauth2"
  
  var oauthConfig = &oauth2.Config{
      ClientID:     "client-id",
      ClientSecret: "client-secret",
      Endpoint: oauth2.Endpoint{
          AuthURL:  "https://auth.example.com/authorize",
          TokenURL: "https://auth.example.com/token",
      },
      RedirectURL: "https://app.com/callback",
      Scopes:      []string{"openid", "profile", "email"},
  }
  
  // 跳转授权
  func handleLogin(w http.ResponseWriter, r *http.Request) {
      state := generateState()
      url := oauthConfig.AuthCodeURL(state)
      http.Redirect(w, r, url, http.StatusTemporaryRedirect)
  }
  
  // 回调换Token
  func handleCallback(w http.ResponseWriter, r *http.Request) {
      code := r.URL.Query().Get("code")
      token, _ := oauthConfig.Exchange(r.Context(), code)
      // token.AccessToken / token.RefreshToken
  }
```

---

## 8. Scope与权限？

**回答：**

```
  Scope = 限定Token的访问范围

  常见Scope：
  openid          → 基本身份信息
  profile         → 用户名/头像
  email           → 邮箱
  read:user       → 读用户信息
  write:repo      → 写仓库
  admin           → 管理员权限

  Scope粒度设计：
  resource:action 格式
  eg: users:read  orders:write  reports:export

  权限检查：
  func RequireScope(required string) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              claims := r.Context().Value("user").(*Claims)
              if !contains(claims.Scopes, required) {
                  http.Error(w, "insufficient scope", 403)
                  return
              }
              next.ServeHTTP(w, r)
          })
      }
  }
  
  // 路由注册
  mux.Handle("/api/admin/users",
      RequireScope("admin:users")(adminHandler))

  最小权限原则：
  请求最少必要的Scope
  不同客户端可以有不同的允许Scope
```

---

## 9. Token吊销与注销？

**回答：**

```
  Token吊销场景：
  用户登出
  密码修改后所有Token失效
  检测到账号异常
  Refresh Token泄露

  吊销方式：
  1. Token黑名单（Redis）
     用户登出 → Token JTI加入黑名单
     验证时检查黑名单

  func RevokeToken(tokenJTI string, expiry time.Duration) error {
      return rdb.Set(ctx, "revoked:"+tokenJTI, "1", expiry).Err()
  }
  
  func IsRevoked(tokenJTI string) bool {
      return rdb.Exists(ctx, "revoked:"+tokenJTI).Val() > 0
  }

  2. Token版本号
     用户表存token_version 修改密码时+1
     JWT中包含version 验证时比对

  3. Refresh Token吊销
     Refresh Token存DB/Redis
     吊销时直接删除
     Access Token短过期自然失效

  OAuth2 Revocation Endpoint：
  POST /revoke
      token=xxx&
      token_type_hint=refresh_token&
      client_id=xxx&
      client_secret=xxx
```

---

## 10. OAuth2与OIDC面试速答？

**回答：**

```
Q: OAuth2的四个角色？
A: Resource Owner(用户) Client(三方应用)
   Authorization Server(授权) Resource Server(资源)

Q: 授权码模式流程？
A: 跳转授权→用户同意→回调带code
   →后端code换token→token访问资源

Q: PKCE解决什么问题？
A: 防授权码劫持 SPA/移动端必用
   Client生成verifier 授权时带challenge

Q: OIDC和OAuth2的关系？
A: OIDC=OAuth2+认证层
   新增ID Token(JWT)+UserInfo端点

Q: Token存在哪里最安全？
A: Web→HttpOnly Cookie（BFF模式）
   移动端→Keychain/Keystore

Q: 怎么吊销JWT？
A: 短过期+Refresh Token+黑名单
   黑名单存Redis 验证时检查

Q: Scope是什么？
A: Token的访问范围限定
   resource:action格式 最小权限原则

Q: 推荐什么认证服务？
A: 自建→Keycloak/Casdoor/Hydra
   SaaS→Auth0 Go接入用oauth2库
```
