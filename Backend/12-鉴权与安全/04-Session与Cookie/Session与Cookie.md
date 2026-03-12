# Session与Cookie

---

## 1. Cookie原理？

**回答：**

```
  Cookie = 服务端通过Set-Cookie响应头设置到客户端浏览器的小数据

  流程：
  1. 服务端响应：Set-Cookie: session_id=abc123; Path=/; HttpOnly
  2. 浏览器保存Cookie
  3. 后续请求自动携带：Cookie: session_id=abc123

  Cookie属性：
  ┌──────────────┬──────────────────────────────┐
  │ 属性          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ Name=Value    │ 名称和值                     │
  │ Domain        │ 生效域名                     │
  │ Path          │ 生效路径                     │
  │ Expires       │ 过期时间(绝对时间)           │
  │ Max-Age       │ 过期时间(秒数)               │
  │ Secure        │ 仅HTTPS传输                  │
  │ HttpOnly      │ JS无法访问(防XSS)            │
  │ SameSite      │ 跨站限制(防CSRF)             │
  └──────────────┴──────────────────────────────┘

  SameSite值：
  Strict：完全禁止跨站发送
  Lax（默认）：导航跳转GET可以 POST不行
  None：允许跨站（必须配合Secure）

Go设置Cookie：
  http.SetCookie(w, &http.Cookie{
      Name:     "session_id",
      Value:    sessionID,
      Path:     "/",
      HttpOnly: true,
      Secure:   true,
      SameSite: http.SameSiteLaxMode,
      MaxAge:   86400, // 1天
  })
```

---

## 2. Session原理？

**回答：**

```
  Session = 服务端存储的用户会话数据

  ┌────────┐ Cookie:sid=abc ┌──────────┐ sid→data ┌──────────┐
  │ 浏览器  │───────────────→│ 服务端    │─────────→│ Session  │
  │        │                │          │         │ Store    │
  └────────┘                └──────────┘         └──────────┘

  Session存储方式：
  ┌──────────────┬──────────────────────────────┐
  │ 存储          │ 特点                         │
  ├──────────────┼──────────────────────────────┤
  │ 内存          │ 最快 进程重启丢失 不可共享   │
  │ 文件          │ 简单 IO慢                    │
  │ Redis         │ 推荐 快+可共享+可过期        │
  │ 数据库        │ 可靠 但慢                    │
  └──────────────┴──────────────────────────────┘

Go Session实现（Redis）：
  type SessionStore struct {
      rdb *redis.Client
      ttl time.Duration
  }
  
  func (s *SessionStore) Create(userID string) (string, error) {
      sid := generateSessionID() // 随机32字节
      data, _ := json.Marshal(SessionData{UserID: userID})
      s.rdb.Set(ctx, "session:"+sid, data, s.ttl)
      return sid, nil
  }
  
  func (s *SessionStore) Get(sid string) (*SessionData, error) {
      data, err := s.rdb.Get(ctx, "session:"+sid).Bytes()
      if err != nil {
          return nil, errors.New("session not found")
      }
      var session SessionData
      json.Unmarshal(data, &session)
      return &session, nil
  }
  
  func (s *SessionStore) Destroy(sid string) error {
      return s.rdb.Del(ctx, "session:"+sid).Err()
  }
```

---

## 3. Session安全？

**回答：**

```
  1. Session固定攻击(Session Fixation)
     攻击者设一个Session ID给用户
     用户登录后 攻击者用同一个ID访问
     防御：登录成功后重新生成Session ID

  2. Session劫持
     窃取Session ID（XSS/中间人/日志泄露）
     防御：HttpOnly+Secure Cookie + HTTPS

  3. Session重放
     防御：绑定IP/UA + 短过期 + 活动检测

  登录安全流程：
  func HandleLogin(w http.ResponseWriter, r *http.Request) {
      // 1. 验证用户名密码
      user, err := authenticate(r.FormValue("username"), r.FormValue("password"))
      if err != nil {
          http.Error(w, "unauthorized", 401)
          return
      }
      
      // 2. 销毁旧Session（防Session固定）
      if oldSid, err := r.Cookie("session_id"); err == nil {
          sessionStore.Destroy(oldSid.Value)
      }
      
      // 3. 创建新Session
      sid, _ := sessionStore.Create(user.ID)
      
      // 4. 设置安全Cookie
      http.SetCookie(w, &http.Cookie{
          Name:     "session_id",
          Value:    sid,
          HttpOnly: true,
          Secure:   true,
          SameSite: http.SameSiteLaxMode,
          MaxAge:   3600,
      })
  }
```

---

## 4. 分布式Session？

**回答：**

```
  问题：多实例部署时 Session在哪？

  方案：
  1. Session粘滞(Sticky Session)
     Nginx ip_hash → 同一用户固定到同一实例
     问题：实例挂了Session丢失

  2. Session共享(Redis)
     所有实例读写同一个Redis
     推荐方案

  3. Session复制
     Tomcat Session集群 实例间同步
     网络开销大 不推荐

  4. 无状态(JWT替代)
     考虑用JWT替代Session
     适合前后端分离

  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ Instance1│  │ Instance2│  │ Instance3│
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │             │             │
       └──────────┬──┴─────────────┘
            ┌─────▼─────┐
            │   Redis   │ 共享Session存储
            └───────────┘

  Redis Session配置要点：
  过期时间与Cookie Max-Age一致
  Redis高可用（Sentinel/Cluster）
  Session数据序列化（JSON/Protobuf）
  定期清理过期Session
```

---

## 5. Cookie限制与替代？

**回答：**

```
  Cookie限制：
  大小限制：单个Cookie 4KB 每域名最多约50个
  跨域限制：SameSite限制跨站发送
  移动端：原生App不自动处理Cookie
  隐私法规：GDPR要求用户同意

  替代方案：
  ┌────────────────┬──────────────────────────────┐
  │ 方案            │ 适用                         │
  ├────────────────┼──────────────────────────────┤
  │ Authorization Header │ API/移动端（Bearer Token）│
  │ localStorage    │ SPA（有XSS风险）             │
  │ sessionStorage  │ 标签页级别                   │
  │ IndexedDB       │ 大量数据                     │
  └────────────────┴──────────────────────────────┘

  Token存储建议：
  最安全：HttpOnly Cookie（浏览器自动管理 防XSS）
  
  SPA场景：
  方案A：BFF + HttpOnly Cookie（推荐）
  方案B：内存变量 + Refresh Token Cookie
  方案C：localStorage（有XSS风险 不推荐）

  移动端：
  iOS → Keychain
  Android → EncryptedSharedPreferences
  → 系统级安全存储 应用隔离
```

---

## 6. CSRF防护？

**回答：**

```
  CSRF = Cross-Site Request Forgery 跨站请求伪造
  
  攻击场景：
  用户已登录A站 → 访问恶意B站 → B站伪造请求到A站
  浏览器自动带上A站Cookie → A站认为是用户操作

  防御方式：
  1. CSRF Token
     表单中嵌入随机Token → 提交时验证
     
  2. SameSite Cookie（推荐）
     SameSite=Lax 或 Strict
     跨站请求不携带Cookie
     
  3. 双重Cookie验证
     Cookie中一份Token + Header/Body中一份
     跨站无法读取Cookie值

Go CSRF Token中间件：
  func CSRFMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          if r.Method == "GET" {
              // GET请求生成Token
              token := generateCSRFToken()
              http.SetCookie(w, &http.Cookie{
                  Name: "csrf_token", Value: token, HttpOnly: false,
              })
              ctx := context.WithValue(r.Context(), "csrf", token)
              next.ServeHTTP(w, r.WithContext(ctx))
              return
          }
          
          // POST等请求验证Token
          cookieToken, _ := r.Cookie("csrf_token")
          headerToken := r.Header.Get("X-CSRF-Token")
          if cookieToken == nil || cookieToken.Value != headerToken {
              http.Error(w, "CSRF validation failed", 403)
              return
          }
          next.ServeHTTP(w, r)
      })
  }

  最简单防御：SameSite=Lax + JSON API
  JSON Content-Type不会被表单/img触发
```

---

## 7. Cookie跨域与同域共享？

**回答：**

```
  同域共享：
  Domain=.example.com → a.example.com和b.example.com共享
  可用于同域SSO

  跨域Cookie（第三方Cookie）：
  浏览器逐步禁止第三方Cookie
  Chrome 2024+ 默认阻止
  影响：跨站跟踪/广告/嵌入式登录

  CORS与Cookie：
  // 后端设置
  Access-Control-Allow-Origin: https://app.example.com  // 不能用*
  Access-Control-Allow-Credentials: true

  // 前端设置
  fetch(url, { credentials: 'include' })

  Same-Site vs Cross-Site：
  same-site = 注册域名相同（eTLD+1）
  a.example.com 和 b.example.com → same site
  a.com 和 b.com → cross site

  代理解决跨域：
  ┌────────┐      ┌─────────┐      ┌──────────┐
  │  SPA   │ ───→ │  Nginx  │ ───→ │   API    │
  │ :3000  │      │  /api   │      │  :8080   │
  └────────┘      └─────────┘      └──────────┘
  同源请求 → 不存在跨域问题 → Cookie正常工作
```

---

## 8. Session过期策略？

**回答：**

```
  过期方式：
  1. 绝对过期：创建后固定时间过期（如24h）
  2. 滑动过期：每次访问重置过期时间（如30min不活动）
  3. 混合：滑动过期 + 绝对上限

Go 滑动过期：
  func SessionMiddleware(store *SessionStore) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              cookie, err := r.Cookie("session_id")
              if err != nil {
                  http.Error(w, "unauthorized", 401)
                  return
              }
              
              session, err := store.Get(cookie.Value)
              if err != nil {
                  http.Error(w, "session expired", 401)
                  return
              }
              
              // 滑动续期
              store.Refresh(cookie.Value, 30*time.Minute)
              
              ctx := context.WithValue(r.Context(), "session", session)
              next.ServeHTTP(w, r.WithContext(ctx))
          })
      }
  }

  安全考量：
  敏感操作Session短过期（支付→5min）
  普通浏览Session长过期（→24h）
  "记住我"功能：长期Token + 短期Session
  定期清理过期Session（Redis自动过期）
```

---

## 9. 登出设计？

**回答：**

```
  Session登出：
  销毁服务端Session + 清除Cookie

  func HandleLogout(w http.ResponseWriter, r *http.Request) {
      cookie, err := r.Cookie("session_id")
      if err == nil {
          // 销毁Session
          sessionStore.Destroy(cookie.Value)
      }
      
      // 清除Cookie
      http.SetCookie(w, &http.Cookie{
          Name:     "session_id",
          Value:    "",
          MaxAge:   -1, // 立即过期
          HttpOnly: true,
          Secure:   true,
      })
  }

  JWT登出：
  JWT无法主动失效 → 加入黑名单

  func HandleJWTLogout(w http.ResponseWriter, r *http.Request) {
      claims := r.Context().Value("user").(*Claims)
      
      // Token剩余时间
      ttl := time.Until(claims.ExpiresAt.Time)
      
      // 加入黑名单（过期后自动清除）
      rdb.Set(ctx, "blacklist:"+claims.ID, "1", ttl)
  }

  全设备登出：
  修改用户的token_version → 所有Token失效
  或删除所有Refresh Token
  或Session方式：删除该用户所有Session
```

---

## 10. Session与Cookie面试速答？

**回答：**

```
Q: Cookie和Session区别？
A: Cookie存客户端(浏览器) Session存服务端
   Cookie通过Set-Cookie/Cookie头传递

Q: Cookie有哪些安全属性？
A: HttpOnly(防XSS) Secure(仅HTTPS)
   SameSite(防CSRF) 三个必设

Q: 分布式Session怎么解决？
A: Redis共享Session 所有实例读写同一Redis
   或考虑JWT替代Session

Q: CSRF怎么防？
A: SameSite Cookie最简单
   加CSRF Token 双重Cookie验证

Q: Session固定攻击？
A: 攻击者预设SessionID等用户登录
   防御：登录后重新生成SessionID

Q: Session过期策略？
A: 滑动过期(活跃续期)+绝对上限
   每次请求刷新TTL

Q: 怎么实现登出？
A: Session→销毁Session+清Cookie
   JWT→加入Redis黑名单

Q: Token存哪里最安全？
A: HttpOnly Cookie最安全
   不要用localStorage(XSS风险)
```
