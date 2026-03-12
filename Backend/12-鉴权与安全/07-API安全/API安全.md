# API安全

---

## 1. API安全威胁？

**回答：**

```
  OWASP API Security Top 10 (2023)：
  ┌──────────────────────┬──────────────────────────┐
  │ 威胁                  │ 说明                     │
  ├──────────────────────┼──────────────────────────┤
  │ 对象级授权失效        │ 越权访问他人数据         │
  │ 认证失效              │ 令牌泄露/弱密码          │
  │ 对象属性级授权失效    │ 可修改不应修改的字段     │
  │ 资源消耗不受限        │ 无限流/大量请求          │
  │ 功能级授权失效        │ 越权调用管理接口         │
  │ 敏感业务流不受限      │ 自动化攻击业务逻辑      │
  │ SSRF                  │ 伪造服务端请求           │
  │ 安全配置错误          │ 默认配置/调试开启       │
  │ 库存管理不当          │ 旧版API/影子API暴露     │
  │ API使用不安全         │ 信任第三方API返回       │
  └──────────────────────┴──────────────────────────┘

  最常见问题：越权(BOLA) + 认证不当
```

---

## 2. API认证与授权？

**回答：**

```
  认证方案：
  1. API Key → 简单 适合内部/低安全
  2. JWT Bearer Token → 推荐 前后端分离
  3. OAuth2 → 第三方接入
  4. mTLS → 服务间调用

  多层认证+授权：
  func APIHandler(w http.ResponseWriter, r *http.Request) {
      // 1. 认证：解析JWT获取用户
      claims, err := parseJWT(r.Header.Get("Authorization"))
      if err != nil {
          http.Error(w, "unauthorized", 401)
          return
      }
      
      // 2. 功能授权：检查是否有权限调用此API
      if !hasPermission(claims.UserID, "orders", "read") {
          http.Error(w, "forbidden", 403)
          return
      }
      
      // 3. 数据授权：只返回用户有权访问的数据
      orderID := r.PathValue("id")
      order, err := getOrder(orderID)
      if order.UserID != claims.UserID && claims.Role != "admin" {
          http.Error(w, "forbidden", 403) // 越权检查
          return
      }
  }

  401 vs 403：
  401 Unauthorized = 未认证（身份不明）
  403 Forbidden = 已认证但无权限
```

---

## 3. 输入校验？

**回答：**

```
  所有输入都不可信 必须校验

  Go 参数校验（validator库）：
  import "github.com/go-playground/validator/v10"
  
  type CreateOrderReq struct {
      UserID  int64   `json:"user_id" validate:"required,gt=0"`
      Amount  float64 `json:"amount" validate:"required,gt=0,lte=1000000"`
      Address string  `json:"address" validate:"required,max=200"`
      Phone   string  `json:"phone" validate:"required,len=11"`
      Email   string  `json:"email" validate:"omitempty,email"`
  }
  
  var validate = validator.New()
  
  func HandleCreateOrder(w http.ResponseWriter, r *http.Request) {
      var req CreateOrderReq
      json.NewDecoder(r.Body).Decode(&req)
      
      if err := validate.Struct(req); err != nil {
          http.Error(w, "invalid params: "+err.Error(), 400)
          return
      }
      // 业务逻辑...
  }

  SQL注入防护：
  // 错误 → SQL注入
  query := "SELECT * FROM users WHERE name = '" + name + "'" 
  
  // 正确 → 参数化查询
  db.Query("SELECT * FROM users WHERE name = ?", name)
  
  // ORM也安全
  db.Where("name = ?", name).Find(&users)

  XSS防护：
  输出HTML时转义
  template.HTMLEscapeString(userInput)
  Content-Type: application/json（API默认安全）
```

---

## 4. API限流？

**回答：**

```
  限流维度：
  全局限流：总QPS不超过阈值
  用户限流：每用户每分钟N次
  IP限流：每IP每分钟N次
  接口限流：特定接口单独限流

Go限流中间件：
  func RateLimitByUser(rdb *redis.Client, limit int, window time.Duration) func(http.Handler) http.Handler {
      return func(next http.Handler) http.Handler {
          return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
              userID := getUserID(r.Context())
              key := fmt.Sprintf("rate:%s:%d", r.URL.Path, userID)
              
              count, _ := rdb.Incr(r.Context(), key).Result()
              if count == 1 {
                  rdb.Expire(r.Context(), key, window)
              }
              
              // 设置限流相关Header
              w.Header().Set("X-RateLimit-Limit", strconv.Itoa(limit))
              remaining := limit - int(count)
              if remaining < 0 { remaining = 0 }
              w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
              
              if int(count) > limit {
                  w.Header().Set("Retry-After", "60")
                  http.Error(w, "Too Many Requests", 429)
                  return
              }
              next.ServeHTTP(w, r)
          })
      }
  }

  敏感接口限流（登录/注册/重置密码）：
  更严格 eg: 每IP每分钟5次
  失败后递增等待时间
```

---

## 5. HTTPS与传输安全？

**回答：**

```
  HTTPS = HTTP + TLS

  TLS1.3握手（1-RTT）：
  Client → ServerHello + KeyShare
  Server → ServerHello + KeyShare + 证书 + Finished
  Client → Finished
  → 开始加密通信

  Go启用HTTPS：
  // 自动证书（Let's Encrypt）
  import "golang.org/x/crypto/acme/autocert"
  
  m := &autocert.Manager{
      Prompt:     autocert.AcceptTOS,
      Cache:      autocert.DirCache("/var/certs"),
      HostPolicy: autocert.HostWhitelist("api.example.com"),
  }
  
  srv := &http.Server{
      Addr:      ":443",
      Handler:   mux,
      TLSConfig: m.TLSConfig(),
  }
  srv.ListenAndServeTLS("", "")

  安全Header：
  func SecurityHeaders(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          w.Header().Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
          w.Header().Set("X-Content-Type-Options", "nosniff")
          w.Header().Set("X-Frame-Options", "DENY")
          w.Header().Set("Content-Security-Policy", "default-src 'self'")
          w.Header().Set("X-XSS-Protection", "1; mode=block")
          next.ServeHTTP(w, r)
      })
  }

  HSTS：强制浏览器使用HTTPS
  浏览器记住该域名必须用HTTPS
```

---

## 6. API签名与防篡改？

**回答：**

```
  API签名 = 防止请求被篡改

  签名流程：
  1. 将所有参数按字典序排列
  2. 拼接成字符串
  3. 加上密钥和时间戳
  4. 计算HMAC-SHA256签名
  5. 请求携带签名和时间戳

  防重放：
  时间戳：请求时间和服务器时间差>5分钟→拒绝
  Nonce：一次性随机数 Redis去重

Go签名验证：
  func VerifySign(r *http.Request, secretKey string) bool {
      timestamp := r.Header.Get("X-Timestamp")
      nonce := r.Header.Get("X-Nonce")
      sign := r.Header.Get("X-Sign")
      
      // 1. 验证时间戳（5分钟内）
      ts, _ := strconv.ParseInt(timestamp, 10, 64)
      if time.Now().Unix()-ts > 300 {
          return false
      }
      
      // 2. 验证Nonce（防重放）
      if !rdb.SetNX(ctx, "nonce:"+nonce, "1", 5*time.Minute).Val() {
          return false // 已使用
      }
      
      // 3. 验证签名
      params := sortAndConcat(r.URL.Query())
      message := r.Method + r.URL.Path + params + timestamp + nonce
      h := hmac.New(sha256.New, []byte(secretKey))
      h.Write([]byte(message))
      expected := hex.EncodeToString(h.Sum(nil))
      
      return hmac.Equal([]byte(sign), []byte(expected))
  }
```

---

## 7. CORS安全配置？

**回答：**

```
  CORS = Cross-Origin Resource Sharing

  浏览器跨域请求时 先发OPTIONS预检
  服务端通过响应头控制是否允许

  Go CORS配置：
  func CORSMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          origin := r.Header.Get("Origin")
          
          // 严格白名单（不要用*）
          allowedOrigins := map[string]bool{
              "https://app.example.com":  true,
              "https://admin.example.com": true,
          }
          
          if allowedOrigins[origin] {
              w.Header().Set("Access-Control-Allow-Origin", origin)
              w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")
              w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
              w.Header().Set("Access-Control-Allow-Credentials", "true")
              w.Header().Set("Access-Control-Max-Age", "86400")
          }
          
          if r.Method == "OPTIONS" {
              w.WriteHeader(204)
              return
          }
          next.ServeHTTP(w, r)
      })
  }

  安全原则：
  ✗ Access-Control-Allow-Origin: *（不安全）
  ✗ 动态反射请求的Origin（等于*）
  ✓ 白名单精确匹配
  ✓ 只开放必要的Method和Header
```

---

## 8. 敏感数据保护？

**回答：**

```
  1. 传输加密：HTTPS
  2. 存储加密：AES-256-GCM
  3. 日志脱敏：不打印密码/Token/身份证
  4. 返回脱敏：手机号138****8888

Go AES加密：
  func Encrypt(plaintext []byte, key []byte) ([]byte, error) {
      block, _ := aes.NewCipher(key)
      gcm, _ := cipher.NewGCM(block)
      nonce := make([]byte, gcm.NonceSize())
      io.ReadFull(rand.Reader, nonce)
      return gcm.Seal(nonce, nonce, plaintext, nil), nil
  }

  func Decrypt(ciphertext []byte, key []byte) ([]byte, error) {
      block, _ := aes.NewCipher(key)
      gcm, _ := cipher.NewGCM(block)
      nonceSize := gcm.NonceSize()
      nonce, ct := ciphertext[:nonceSize], ciphertext[nonceSize:]
      return gcm.Open(nil, nonce, ct, nil)
  }

日志脱敏：
  func MaskPhone(phone string) string {
      if len(phone) != 11 { return "***" }
      return phone[:3] + "****" + phone[7:]
  }
  
  func MaskEmail(email string) string {
      parts := strings.Split(email, "@")
      if len(parts) != 2 { return "***" }
      name := parts[0]
      if len(name) > 1 {
          name = name[:1] + "***"
      }
      return name + "@" + parts[1]
  }

  密钥管理：
  不硬编码密钥
  使用环境变量/Vault/KMS
  定期轮换密钥
```

---

## 9. API安全检查清单？

**回答：**

```
  认证：
  □ 所有API需要认证（白名单除外）
  □ JWT短过期+Refresh Token
  □ 敏感操作MFA/二次验证

  授权：
  □ 接口级授权（RBAC）
  □ 数据级授权（防越权BOLA）
  □ 字段级授权（不可修改的字段）

  输入：
  □ 参数校验（类型/长度/范围）
  □ SQL注入防护（参数化查询）
  □ XSS防护（输出转义）

  传输：
  □ HTTPS强制
  □ HSTS头
  □ CORS白名单配置

  限流：
  □ 全局/用户/IP/接口限流
  □ 登录接口严格限流
  □ 429响应+Retry-After

  日志：
  □ 关键操作审计日志
  □ 日志不含敏感信息
  □ 异常行为告警

  数据：
  □ 敏感数据加密存储
  □ API返回脱敏
  □ 密钥安全管理
```

---

## 10. API安全面试速答？

**回答：**

```
Q: API最常见的安全问题？
A: 越权(BOLA)访问他人数据
   认证不当(Token泄露/弱密码)

Q: 怎么防SQL注入？
A: 参数化查询/ORM
   永远不拼接用户输入到SQL

Q: 怎么防XSS？
A: 输出转义 CSP头
   API返回JSON天然防XSS

Q: 401和403区别？
A: 401=未认证(身份不明)
   403=已认证但无权限

Q: CORS怎么配？
A: 白名单匹配Origin 不用*
   配合Credentials需指定具体Origin

Q: API签名防什么？
A: 防篡改(HMAC签名)+防重放(时间戳+Nonce)
   开放API常用

Q: 敏感数据怎么保护？
A: 传输HTTPS+存储AES加密
   日志脱敏+返回脱敏

Q: 怎么做API限流？
A: 多维度：用户/IP/接口/全局
   返回429+X-RateLimit头
```
