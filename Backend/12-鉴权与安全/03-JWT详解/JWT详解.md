# JWT详解

---

## 1. JWT结构？

**回答：**

```
  JWT = Header.Payload.Signature

  Header（算法+类型）：
  {
    "alg": "HS256",  // 签名算法
    "typ": "JWT"     // 类型
  }

  Payload（声明）：
  {
    "iss": "myapp",           // 签发者
    "sub": "user123",         // 主题(用户ID)
    "aud": "api.myapp.com",   // 受众
    "exp": 1700000000,        // 过期时间
    "iat": 1699996400,        // 签发时间
    "jti": "unique-id",       // JWT唯一ID
    "role": "admin",          // 自定义声明
    "name": "张三"
  }

  Signature：
  HMACSHA256(
      base64UrlEncode(header) + "." + base64UrlEncode(payload),
      secret
  )

  最终格式：
  eyJhbGci...  ← Base64(Header)
  .
  eyJzdWIi...  ← Base64(Payload)
  .
  SflKxwRJ...  ← Signature

  注意：Header和Payload只是Base64编码 不是加密
  → 不要在Payload中放敏感数据（密码/银行卡）
```

---

## 2. JWT签名算法？

**回答：**

```
  对称签名（HMAC）：
  HS256/HS384/HS512
  签发和验证使用同一密钥
  简单高效 适合单服务/服务间信任

  非对称签名（RSA/ECDSA）：
  RS256/RS384/RS512
  ES256/ES384/ES512
  私钥签发 公钥验证
  适合分布式系统（公钥可公开给所有服务验证）

  ┌──────────┬──────────┬──────────┬──────────┐
  │ 算法      │ 密钥      │ 速度     │ 适用     │
  ├──────────┼──────────┼──────────┼──────────┤
  │ HS256     │ 对称密钥  │ 快       │ 单服务   │
  │ RS256     │ RSA密钥对 │ 较慢     │ 分布式   │
  │ ES256     │ ECDSA密钥│ 快+短签名│ 推荐     │
  └──────────┴──────────┴──────────┴──────────┘

  推荐：
  单体应用 → HS256 简单
  微服务 → RS256 或 ES256（公钥分发验证）
  
  ES256优势：
  签名短（64字节 vs RSA 256字节）
  性能好 安全性相当
```

---

## 3. Go JWT实现？

**回答：**

```
Go JWT库：github.com/golang-jwt/jwt/v5

签发Token：
  type Claims struct {
      UserID int64  `json:"user_id"`
      Role   string `json:"role"`
      jwt.RegisteredClaims
  }
  
  func GenerateToken(userID int64, role string) (string, error) {
      claims := Claims{
          UserID: userID,
          Role:   role,
          RegisteredClaims: jwt.RegisteredClaims{
              ExpiresAt: jwt.NewNumericDate(time.Now().Add(15 * time.Minute)),
              IssuedAt:  jwt.NewNumericDate(time.Now()),
              Issuer:    "myapp",
              ID:        uuid.New().String(), // JTI
          },
      }
      token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
      return token.SignedString([]byte(secretKey))
  }

解析验证：
  func ParseToken(tokenString string) (*Claims, error) {
      token, err := jwt.ParseWithClaims(tokenString, &Claims{},
          func(token *jwt.Token) (interface{}, error) {
              if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
                  return nil, fmt.Errorf("unexpected signing method: %v",
                      token.Header["alg"])
              }
              return []byte(secretKey), nil
          })
      if err != nil {
          return nil, err
      }
      claims, ok := token.Claims.(*Claims)
      if !ok || !token.Valid {
          return nil, errors.New("invalid token")
      }
      return claims, nil
  }

  注意：
  验证签名算法（防alg替换攻击）
  验证过期时间
  验证签发者(iss)和受众(aud)
```

---

## 4. Access Token + Refresh Token？

**回答：**

```
  双Token机制：
  Access Token：短有效期（15min）携带访问
  Refresh Token：长有效期（7天）刷新Access

  ┌────────┐  AccessToken  ┌──────────┐
  │ Client │──────────────→│ API      │ 正常访问
  └────────┘               └──────────┘
  
  AccessToken过期 →
  ┌────────┐ RefreshToken  ┌──────────┐
  │ Client │──────────────→│ Auth     │ 刷新Token
  │        │←─ 新Access+   │ Server   │
  │        │  新Refresh    │          │
  └────────┘               └──────────┘

Go实现：
  func RefreshTokenHandler(w http.ResponseWriter, r *http.Request) {
      refreshToken := r.FormValue("refresh_token")
      
      // 1. 验证Refresh Token（存在Redis中）
      userID, err := rdb.Get(ctx, "refresh:"+refreshToken).Result()
      if err != nil {
          http.Error(w, "invalid refresh token", 401)
          return
      }
      
      // 2. 删除旧的Refresh Token（轮换）
      rdb.Del(ctx, "refresh:"+refreshToken)
      
      // 3. 签发新的Token对
      newAccess := generateAccessToken(userID)
      newRefresh := generateRefreshToken()
      
      // 4. 存储新Refresh Token
      rdb.Set(ctx, "refresh:"+newRefresh, userID, 7*24*time.Hour)
      
      json.NewEncoder(w).Encode(map[string]string{
          "access_token":  newAccess,
          "refresh_token": newRefresh,
      })
  }

  Refresh Token轮换：
  每次刷新都签发新的Refresh Token
  旧的立即失效
  如果旧Token被使用 → 可能泄露 → 吊销所有Token
```

---

## 5. JWT安全问题？

**回答：**

```
  1. alg=none攻击
     攻击者将Header的alg设为none → 不需签名
     防御：验证时强制指定算法 不接受none

  2. 密钥混淆攻击
     用RS256的公钥当HS256密钥
     防御：验证时检查算法类型匹配

  3. JWT信息泄露
     Payload是Base64 不是加密
     防御：不存敏感信息 或使用JWE加密

  4. Token被盗
     XSS窃取localStorage中的Token
     防御：HttpOnly Cookie存储 + CSP

  5. 过长有效期
     Token有效期太长 被盗后长期有效
     防御：15min短过期 + Refresh Token

  6. 无法主动失效
     JWT签发后无法撤销
     防御：黑名单(Redis) / Token版本号

  安全检查清单：
  □ 强制验证签名算法
  □ 验证exp/iss/aud
  □ 不在Payload存敏感数据
  □ 短过期时间（15min）
  □ 支持Token吊销（黑名单）
  □ HTTPS传输
  □ HttpOnly Cookie存储
```

---

## 6. JWT vs Session对比？

**回答：**

```
  ┌──────────────┬──────────────────┬──────────────────┐
  │ 维度          │ JWT              │ Session          │
  ├──────────────┼──────────────────┼──────────────────┤
  │ 状态          │ 无状态           │ 有状态           │
  │ 服务端存储    │ 不需要           │ 需要(内存/Redis) │
  │ 扩展性        │ 好(无需共享)     │ 需共享Session    │
  │ 主动失效      │ 困难             │ 容易(删除即可)   │
  │ 大小          │ 较大(含信息)     │ 小(只有ID)       │
  │ 跨域          │ 方便(Header)     │ Cookie受限       │
  │ 移动端        │ 友好             │ Cookie不便       │
  │ 性能          │ 每次验签(CPU)    │ 每次查存储(IO)   │
  └──────────────┴──────────────────┴──────────────────┘

  选择建议：
  前后端分离/微服务/移动端 → JWT
  传统SSR/需要即时注销 → Session
  高安全场景 → JWT短过期+黑名单
```

---

## 7. JWT Payload设计？

**回答：**

```
  标准声明（Registered Claims）：
  iss：签发者
  sub：主题（通常是用户ID）
  aud：受众（哪个客户端可用）
  exp：过期时间
  iat：签发时间
  nbf：生效时间
  jti：JWT唯一标识（用于黑名单/防重放）

  自定义声明：
  {
    "sub": "user123",
    "role": "admin",
    "permissions": ["users:read", "orders:write"],
    "org_id": "org456"
  }

  设计原则：
  1. 精简：只放必要信息 减小Token体积
  2. 不放敏感信息：密码/手机号/身份证号
  3. 放授权信息：角色/权限 减少DB查询
  4. 用户可变信息少放：修改后Token不会同步

  Token体积控制：
  Header + Payload + Signature
  过大 → 每次HTTP请求都携带 增加带宽
  建议Payload < 1KB

  好的设计：
  {
    "sub": "12345",           // 用户ID
    "role": "admin",          // 角色
    "exp": 1700000000,        // 过期
    "jti": "abc-def-ghi"      // 唯一ID
  }
  → 简洁 够用 约200字节
```

---

## 8. JWE加密Token？

**回答：**

```
  JWT = 签名但不加密（Payload可见）
  JWE = 加密Token（Payload不可见）

  JWE格式：
  Header.EncryptedKey.IV.Ciphertext.Tag

  使用场景：
  Token中需要携带敏感信息
  不希望中间人看到Token内容

  实际中更常见的做法：
  JWT不放敏感信息 → 不需要JWE
  需要敏感信息 → 查数据库 不放Token里

  JWS vs JWE：
  ┌──────┬──────────────┬──────────────────┐
  │      │ JWS(JWT)      │ JWE              │
  ├──────┼──────────────┼──────────────────┤
  │ 保密性│ 无(Base64)   │ 有(加密)         │
  │ 完整性│ 有(签名)     │ 有(AEAD)         │
  │ 大小  │ 小           │ 大               │
  │ 性能  │ 快           │ 慢               │
  └──────┴──────────────┴──────────────────┘

  推荐：99%场景用JWT(JWS)即可
  Payload不放敏感信息 → 不需要加密
```

---

## 9. JWT在微服务中的应用？

**回答：**

```
  架构：
  ┌────────┐ JWT  ┌─────────┐  JWT  ┌──────────┐
  │ Client │─────→│ Gateway │──────→│ Service  │
  └────────┘      │ 验证JWT │      │ 解析JWT  │
                  │ 统一鉴权│      │ 获取用户 │
                  └─────────┘      └──────────┘

  方案一：Gateway统一验证
  Gateway验证JWT → 提取用户信息 → Header转发
  后端服务只读Header 不需要密钥

  方案二：各服务独立验证
  每个服务都有公钥 独立验证JWT
  适合RS256/ES256非对称签名

  服务间调用传递身份：
  func CallService(ctx context.Context, url string) (*http.Response, error) {
      req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
      
      // 从context取JWT继续传递
      token := ctx.Value("jwt_token").(string)
      req.Header.Set("Authorization", "Bearer "+token)
      
      return http.DefaultClient.Do(req)
  }

  Token降权：
  Gateway签发内部Token → 权限范围缩小
  外部Token → scope=full
  内部Token → scope=read:orders（仅订单微服务需要的权限）
```

---

## 10. JWT面试速答？

**回答：**

```
Q: JWT由什么组成？
A: Header.Payload.Signature 三部分
   Base64编码 用点号连接

Q: JWT和Session区别？
A: JWT无状态不需服务端存储 适合分布式
   Session有状态需共享存储 可主动失效

Q: JWT不能主动失效怎么办？
A: 短过期(15min)+RefreshToken轮换
   配合Redis黑名单吊销

Q: JWT安全注意什么？
A: 强制验证算法(防alg=none)
   不存敏感信息 HTTPS传输

Q: HS256和RS256区别？
A: HS256对称密钥 签发验证同一密钥
   RS256非对称 私钥签发公钥验证

Q: Access和Refresh Token？
A: Access短过期(15min)携带访问
   Refresh长过期(7天)用来刷新Access

Q: JWT放什么信息？
A: 用户ID+角色+过期时间+JTI
   不放密码等敏感信息 控制体积<1KB

Q: 微服务JWT怎么用？
A: Gateway统一验证 Header转发用户信息
   或RS256公钥分发 各服务独立验证
```
