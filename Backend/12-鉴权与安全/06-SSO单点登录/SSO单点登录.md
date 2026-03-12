# SSO单点登录

---

## 1. SSO核心原理？

**回答：**

```
  SSO = Single Sign-On 一次登录多系统通用

  ┌──────┐   ┌──────┐   ┌──────┐
  │ App1 │   │ App2 │   │ App3 │  子系统
  └──┬───┘   └──┬───┘   └──┬───┘
     │          │          │
     └──────────┼──────────┘
                │
         ┌──────▼──────┐
         │ SSO Server  │  统一认证中心
         │ (IdP)       │
         └─────────────┘

  流程：
  1. 用户访问App1 → 未登录 → 跳转SSO Server
  2. SSO Server登录 → 创建全局Session
  3. 回调App1 携带凭证 → App1创建局部Session
  4. 用户访问App2 → 未登录 → 跳转SSO Server
  5. SSO Server已有全局Session → 直接回调App2
  6. App2创建局部Session → 无需再次登录
```

---

## 2. CAS协议？

**回答：**

```
  CAS = Central Authentication Service

  ┌────────┐  1.访问App   ┌──────────┐
  │ 用户    │────────────→│  App     │
  └────────┘              └────┬─────┘
       │                       │ 2.未登录 302重定向
       │  3.登录页面            ▼
       ├──────────────→ ┌──────────────┐
       │  4.输入账号密码  │  CAS Server  │
       ├──────────────→ │              │
       │                 │5.生成ST     │
       │  6.302回调+ST    │(Service     │
       ├←────────────── │ Ticket)     │
       │                 └──────┬──────┘
       │  7.携带ST访问App        │
  ┌────▼────┐                   │
  │  App    │ 8.验证ST ────────→│
  │         │←── 用户信息 ──────│
  │  9.创建  │
  │  Session │
  └─────────┘

  CAS核心概念：
  TGT(Ticket Granting Ticket)：全局票据 SSO Session
  TGC(Ticket Granting Cookie)：存TGT的Cookie
  ST(Service Ticket)：一次性票据 换取用户信息

  CAS特点：
  简单 成熟 适合企业内部
  不如OIDC灵活
```

---

## 3. 基于OIDC的SSO？

**回答：**

```
  现代SSO推荐基于OIDC实现

  OIDC SSO = OAuth2授权码模式 + ID Token

  流程与OAuth2授权码相同
  SSO Server就是OIDC Provider(IdP)
  
  优势：
  标准协议 跨平台
  ID Token(JWT)携带用户信息
  支持第三方IdP（Google/Azure AD）

  Go接入Keycloak SSO示例：
  var oidcConfig = &oauth2.Config{
      ClientID:     "my-app",
      ClientSecret: "secret",
      Endpoint: oauth2.Endpoint{
          AuthURL:  "https://sso.example.com/auth",
          TokenURL: "https://sso.example.com/token",
      },
      RedirectURL: "https://app.com/callback",
      Scopes:      []string{"openid", "profile", "email"},
  }

  // 登录跳转
  func handleLogin(w http.ResponseWriter, r *http.Request) {
      state := generateState()
      url := oidcConfig.AuthCodeURL(state)
      http.Redirect(w, r, url, 302)
  }

  // 回调处理
  func handleCallback(w http.ResponseWriter, r *http.Request) {
      token, _ := oidcConfig.Exchange(r.Context(), r.URL.Query().Get("code"))
      // 解析ID Token获取用户信息
      idToken := token.Extra("id_token").(string)
      // 验证+解析JWT → 获取用户信息
      // 创建本地Session
  }
```

---

## 4. SSO登出？

**回答：**

```
  单点登出 = 一处登出 所有系统都登出

  方案一：前端跳转登出（简单）
  App → 跳转SSO /logout → SSO清除全局Session
  → 重定向回App → App清除本地Session
  问题：只能登出当前App 其他App不知道

  方案二：后端通知登出（推荐）
  SSO Server通知所有已登录的App
  
  ┌──────────┐  通知登出  ┌──────┐
  │SSO Server│───────────→│ App1 │ 清除Session
  │ 清除全局  │───────────→│ App2 │ 清除Session
  │ Session  │───────────→│ App3 │ 清除Session
  └──────────┘            └──────┘

  OIDC标准登出：
  Back-Channel Logout：
  SSO后端调用各App的logout URL
  POST /backchannel-logout
  Body: logout_token=JWT（包含用户ID和Session ID）

  Front-Channel Logout：
  SSO页面中嵌入各App的登出iframe
  <iframe src="https://app1.com/logout">
  <iframe src="https://app2.com/logout">

  实际建议：
  Back-Channel（后端通知）更可靠
  配合短Session过期 兜底保证
```

---

## 5. 跨域SSO？

**回答：**

```
  同域SSO：
  *.example.com → 共享Cookie(Domain=.example.com)
  简单直接 Cookie自动传递

  跨域SSO（不同域名）：
  app1.com / app2.com / sso.com
  Cookie不能跨域 → 需要其他方式

  方案一：CAS/OIDC重定向
  最标准的方式
  通过302重定向到SSO → SSO检查已登录
  → 302回调App携带code/ticket
  用户无感知 只是快速跳转

  方案二：Token传递
  SSO登录后 → 通过URL参数传Token到各子系统
  各子系统验证Token并创建本地Session

  方案三：LocalStorage + postMessage
  两个域名的页面通过iframe+postMessage通信
  SSO页面存Token → postMessage传给子系统
  复杂且依赖前端

  推荐：OIDC/CAS重定向方式
  标准、安全、不依赖Cookie跨域
```

---

## 6. SSO安全设计？

**回答：**

```
  SSO安全要点：

  1. Ticket/Code安全
     一次性使用 用后即删
     有效期短（5分钟内）
     绑定IP和Client
  
  2. 回调URL验证
     严格匹配注册的redirect_uri
     不允许通配符/开放重定向
     防止钓鱼攻击
  
  3. CSRF防护
     state参数（随机值 Session绑定）
     PKCE（SPA/移动端）
  
  4. Token安全
     HTTPS传输
     短过期时间
     支持吊销
  
  5. 暴力破解防护
     SSO登录页限流
     验证码/MFA
     账号锁定
  
  6. 审计日志
     记录所有登录/登出事件
     异常检测（异地登录/频繁失败）

  安全检查清单：
  □ HTTPS强制
  □ redirect_uri白名单
  □ state/PKCE防CSRF
  □ Ticket/Code一次性+短过期
  □ MFA支持
  □ 登录日志+异常告警
```

---

## 7. SSO方案选型？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 方案          │ 特点                         │
  ├──────────────┼──────────────────────────────┤
  │ Keycloak      │ 功能齐全 OIDC/SAML 开源     │
  │ Casdoor       │ Go实现 国产 轻量             │
  │ Auth0         │ SaaS 快速集成 免运维         │
  │ Azure AD      │ 微软生态 企业首选            │
  │ Authing       │ 国产SaaS 对标Auth0          │
  │ 自建CAS       │ 简单场景可考虑               │
  └──────────────┴──────────────────────────────┘

  选型建议：
  中小项目 → Casdoor / 自建JWT SSO
  企业级 → Keycloak（开源）/ Auth0（SaaS）
  微软体系 → Azure AD
  
  Keycloak功能：
  OIDC/SAML/CAS
  用户管理/角色管理
  社交登录（Google/GitHub）
  MFA/密码策略
  管理控制台
```

---

## 8. 多租户SSO？

**回答：**

```
  多租户SSO = 不同组织有独立的SSO配置

  场景：SaaS产品 每个客户可配置自己的SSO

  方案：
  1. 多IdP支持
     企业A → Azure AD SSO
     企业B → Okta SSO
     企业C → 本地账号密码

  2. 租户识别
     通过子域名：tenant-a.app.com
     通过邮箱域名：@company-a.com → 对应IdP
     通过登录页选择

  流程：
  func HandleLogin(w http.ResponseWriter, r *http.Request) {
      email := r.FormValue("email")
      domain := strings.Split(email, "@")[1]
      
      // 查找租户的SSO配置
      ssoConfig, err := getSSOConfigByDomain(domain)
      if err != nil {
          // 无SSO配置 → 普通账号密码登录
          handlePasswordLogin(w, r)
          return
      }
      
      // 有SSO配置 → 跳转到对应IdP
      state := generateState()
      url := ssoConfig.OAuthConfig.AuthCodeURL(state)
      http.Redirect(w, r, url, 302)
  }

  数据库设计：
  CREATE TABLE tenant_sso_configs (
      tenant_id    BIGINT PRIMARY KEY,
      provider     VARCHAR(32),  -- oidc/saml
      client_id    VARCHAR(128),
      client_secret VARCHAR(256), -- 加密存储
      issuer_url   VARCHAR(256),
      enabled      BOOLEAN
  );
```

---

## 9. SSO与零信任？

**回答：**

```
  零信任 = Never Trust, Always Verify
  不信任网络位置 每次访问都验证

  SSO在零信任中的角色：
  SSO是身份验证的入口
  但不是"登录一次就信任"

  零信任增强：
  1. 持续验证
     不只登录时验证 每次访问都评估
     设备状态+网络位置+行为分析

  2. 最小权限
     SSO签发最小权限Token
     动态调整权限

  3. 设备信任
     只允许受管设备访问
     设备证书+MDM状态检查

  4. 条件访问
     高风险操作 → 额外MFA
     异常位置 → 拦截+告警
     新设备 → 强制二次验证

  ┌────────┐   ┌──────┐   ┌──────────┐   ┌──────────┐
  │ 用户    │──→│ SSO  │──→│ 策略引擎 │──→│ 应用     │
  │+设备   │   │ 认证  │   │ 风险评估 │   │ 授权访问 │
  └────────┘   └──────┘   └──────────┘   └──────────┘

  BeyondCorp模型（Google）：
  不依赖VPN 通过身份代理访问内部系统
  每次请求都经过认证+授权+设备检查
```

---

## 10. SSO面试速答？

**回答：**

```
Q: SSO是什么？
A: 单点登录 一次认证多系统通用
   统一认证中心签发凭证

Q: SSO实现方案？
A: CAS(Ticket) OIDC(OAuth2+IDToken)
   推荐OIDC 标准跨平台

Q: 跨域SSO怎么做？
A: 302重定向到SSO Server
   SSO已登录→直接回调带code
   不依赖Cookie跨域

Q: 单点登出怎么实现？
A: Back-Channel后端通知各App清Session
   配合短Session过期兜底

Q: SSO和OAuth2区别？
A: SSO=多系统共享认证状态
   OAuth2=授权框架 SSO常基于OIDC实现

Q: SSO安全要注意什么？
A: redirect_uri白名单 state防CSRF
   Ticket一次性短过期 HTTPS强制

Q: 推荐什么SSO产品？
A: 开源→Keycloak/Casdoor
   SaaS→Auth0/Azure AD

Q: 零信任和SSO关系？
A: SSO是零信任的身份入口
   零信任还要持续验证+设备信任+最小权限
```
