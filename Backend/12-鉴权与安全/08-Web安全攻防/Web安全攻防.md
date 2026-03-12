# Web安全攻防

---

## 1. XSS攻击与防御？

**回答：**

```
  XSS = Cross-Site Scripting 跨站脚本攻击

  三种类型：
  ┌──────────────┬──────────────────────────────┐
  │ 类型          │ 说明                         │
  ├──────────────┼──────────────────────────────┤
  │ 反射型        │ URL参数注入 诱导用户点击     │
  │ 存储型        │ 恶意脚本存入DB 影响所有用户  │
  │ DOM型         │ 前端JS直接操作DOM注入        │
  └──────────────┴──────────────────────────────┘

  存储型XSS最危险：评论/帖子中注入脚本
  所有浏览该内容的用户都会执行

  防御：
  1. 输出转义（最重要）
     HTML: &lt; &gt; &amp; &quot;
     Go: template.HTMLEscapeString(input)
  
  2. CSP（内容安全策略）
     Content-Security-Policy: default-src 'self'; script-src 'self'
     禁止内联脚本和外部脚本
  
  3. HttpOnly Cookie
     JS无法读取Cookie → 窃取Cookie失败
  
  4. 输入过滤
     富文本用白名单（bluemonday库）
     import "github.com/microcosm-cc/bluemonday"
     p := bluemonday.UGCPolicy()
     safe := p.Sanitize(userInput)

  API返回JSON → Content-Type: application/json
  浏览器不会执行JSON中的脚本 → 天然防XSS
```

---

## 2. CSRF攻击与防御？

**回答：**

```
  CSRF = 跨站请求伪造

  攻击场景：
  用户已登录银行A → 访问恶意网站B
  B页面：<img src="https://bank.com/transfer?to=hacker&amount=1000">
  浏览器自动带上bank.com的Cookie → 转账成功

  防御三件套：
  1. SameSite Cookie（推荐 简单有效）
     Set-Cookie: session=xxx; SameSite=Lax
     跨站请求不带Cookie
  
  2. CSRF Token
     服务端生成随机Token → 表单隐藏字段
     提交时验证Token
  
  3. 检查Referer/Origin
     验证请求来源是否合法
     辅助手段 不能单独依赖

  JSON API天然防御部分CSRF：
  <form>和<img>无法发送JSON Content-Type
  但仍需SameSite Cookie保护

  双重提交Cookie：
  Cookie中一份CSRF Token
  请求Header中一份（X-CSRF-Token）
  攻击者无法读取目标站Cookie → 无法伪造Header
```

---

## 3. SQL注入？

**回答：**

```
  SQL注入 = 通过用户输入篡改SQL语句

  攻击示例：
  输入: ' OR '1'='1
  拼接: SELECT * FROM users WHERE name='' OR '1'='1'
  → 返回所有用户

  防御方法：
  1. 参数化查询（最有效）
     db.Query("SELECT * FROM users WHERE name = ?", name)
     参数和SQL分离 无法注入

  2. ORM框架
     db.Where("name = ?", name).Find(&users)
     框架内部使用参数化查询

  3. 输入验证
     验证类型/长度/格式
     白名单 > 黑名单

  Go安全查询示例：
  // 安全
  rows, err := db.QueryContext(ctx,
      "SELECT id, name FROM users WHERE id = ? AND status = ?",
      userID, "active")
  
  // 动态条件也要安全
  func BuildQuery(filters map[string]string) (string, []interface{}) {
      query := "SELECT * FROM orders WHERE 1=1"
      args := make([]interface{}, 0)
      
      if v, ok := filters["status"]; ok {
          query += " AND status = ?"
          args = append(args, v)
      }
      if v, ok := filters["user_id"]; ok {
          query += " AND user_id = ?"
          args = append(args, v)
      }
      return query, args
  }
```

---

## 4. SSRF攻击与防御？

**回答：**

```
  SSRF = Server-Side Request Forgery 服务端请求伪造

  攻击者通过应用程序向内网发请求：
  /api/fetch?url=http://169.254.169.254/metadata  ← 云元数据
  /api/fetch?url=http://localhost:6379/            ← 内网Redis

  防御：
  1. URL白名单
     只允许访问指定域名/IP段

  2. 禁止内网地址
  func isInternalIP(ip net.IP) bool {
      privateRanges := []struct{ start, end net.IP }{
          {net.ParseIP("10.0.0.0"), net.ParseIP("10.255.255.255")},
          {net.ParseIP("172.16.0.0"), net.ParseIP("172.31.255.255")},
          {net.ParseIP("192.168.0.0"), net.ParseIP("192.168.255.255")},
          {net.ParseIP("127.0.0.0"), net.ParseIP("127.255.255.255")},
          {net.ParseIP("169.254.0.0"), net.ParseIP("169.254.255.255")},
      }
      for _, r := range privateRanges {
          if bytesInRange(ip, r.start, r.end) { return true }
      }
      return false
  }

  3. DNS重绑定防护
     先解析域名获取IP → 检查IP → 再请求
     不要直接请求用户提供的URL

  4. 限制协议
     只允许http/https
     禁止file:// gopher:// dict://
  
  5. 使用代理
     所有外部请求通过专用代理
     代理层做白名单和安全过滤
```

---

## 5. 越权漏洞？

**回答：**

```
  水平越权：同级用户间越权
  eg: 用户A看到用户B的订单
  GET /api/orders/12345  ← 12345是B的订单

  垂直越权：普通用户调用管理接口
  eg: 普通用户调用 DELETE /api/admin/users/1

  防御：
  1. 数据级权限检查（防水平越权）
  func GetOrder(w http.ResponseWriter, r *http.Request) {
      userID := getUserID(r.Context())
      orderID := r.PathValue("id")
      
      order, err := db.GetOrder(orderID)
      if err != nil {
          http.Error(w, "not found", 404)
          return
      }
      
      // 关键：检查数据归属
      if order.UserID != userID {
          http.Error(w, "forbidden", 403)
          return
      }
  }

  2. 接口级权限检查（防垂直越权）
  // 统一中间件 管理接口必须admin角色
  adminGroup := mux.Group("/api/admin/")
  adminGroup.Use(RequireRole("admin"))

  3. 避免可猜测的ID
  用UUID替代自增ID
  攻击者无法遍历

  4. 统一鉴权中间件
  所有接口都经过权限检查
  不依赖前端隐藏按钮
```

---

## 6. 文件上传安全？

**回答：**

```
  风险：上传恶意文件（WebShell/病毒）

  防御措施：
  1. 文件类型白名单
  allowedTypes := map[string]bool{
      "image/jpeg": true,
      "image/png":  true,
      "image/gif":  true,
      "application/pdf": true,
  }
  
  func HandleUpload(w http.ResponseWriter, r *http.Request) {
      r.ParseMultipartForm(10 << 20) // 10MB限制
      file, header, _ := r.FormFile("file")
      
      // 1. 检查Content-Type
      ct := header.Header.Get("Content-Type")
      if !allowedTypes[ct] {
          http.Error(w, "file type not allowed", 400)
          return
      }
      
      // 2. 检查文件头（Magic Number）
      buf := make([]byte, 512)
      file.Read(buf)
      detectedType := http.DetectContentType(buf)
      if !allowedTypes[detectedType] {
          http.Error(w, "invalid file", 400)
          return
      }
      file.Seek(0, 0)
      
      // 3. 重命名文件（防路径穿越）
      ext := filepath.Ext(header.Filename)
      newName := uuid.New().String() + ext
      
      // 4. 存储到独立目录（不在Web根目录）
      savePath := filepath.Join("/data/uploads", newName)
  }

  其他措施：
  文件大小限制
  存储到对象存储（S3/MinIO）而非本地
  图片做处理（去除EXIF/重新编码）
  病毒扫描
```

---

## 7. 安全Header？

**回答：**

```
  HTTP安全响应头：
  ┌──────────────────────────┬──────────────────────────┐
  │ Header                    │ 作用                     │
  ├──────────────────────────┼──────────────────────────┤
  │ Strict-Transport-Security│ 强制HTTPS                │
  │ Content-Security-Policy  │ 控制资源加载(防XSS)      │
  │ X-Content-Type-Options   │ 防MIME嗅探               │
  │ X-Frame-Options          │ 防点击劫持               │
  │ X-XSS-Protection         │ 浏览器XSS过滤            │
  │ Referrer-Policy          │ 控制Referer信息          │
  │ Permissions-Policy       │ 控制浏览器功能权限       │
  └──────────────────────────┴──────────────────────────┘

Go设置所有安全Header：
  func SecurityHeadersMiddleware(next http.Handler) http.Handler {
      return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
          h := w.Header()
          h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
          h.Set("Content-Security-Policy", "default-src 'self'; script-src 'self'")
          h.Set("X-Content-Type-Options", "nosniff")
          h.Set("X-Frame-Options", "DENY")
          h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
          h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
          next.ServeHTTP(w, r)
      })
  }
```

---

## 8. DDoS防护？

**回答：**

```
  DDoS = 分布式拒绝服务攻击

  防护层次：
  ┌──────────────┬──────────────────────────────┐
  │ 层次          │ 方案                         │
  ├──────────────┼──────────────────────────────┤
  │ 网络层(L3/L4)│ 云厂商DDoS防护/CDN           │
  │ 应用层(L7)   │ WAF/限流/验证码              │
  │ 业务层       │ 人机验证/行为分析            │
  └──────────────┴──────────────────────────────┘

  应用层防护：
  1. 限流（Rate Limiting）
     IP维度 + 用户维度
  
  2. 验证码
     频繁请求 → 触发验证码
     滑块/图形验证码
  
  3. CDN/WAF
     Cloudflare/阿里云WAF
     过滤恶意流量
  
  4. 连接限制
     单IP最大连接数
     连接超时设置

  Go基本防护：
  srv := &http.Server{
      ReadTimeout:    10 * time.Second,
      WriteTimeout:   10 * time.Second,
      IdleTimeout:    60 * time.Second,
      MaxHeaderBytes: 1 << 20, // 1MB Header限制
  }

  实际建议：
  DDoS防护交给云厂商（CDN/Anti-DDoS）
  应用层做好限流即可
```

---

## 9. 安全开发实践？

**回答：**

```
  DevSecOps = 安全左移 开发阶段就考虑安全

  1. 依赖安全
     定期检查依赖漏洞
     go: govulncheck ./...
     npm: npm audit

  2. 代码安全扫描
     SAST: gosec（Go静态分析）
     go install github.com/securego/gosec/v2/cmd/gosec@latest
     gosec ./...

  3. 密钥管理
     不在代码中硬编码密钥
     使用Vault/环境变量/KMS
     .gitignore排除配置文件

  4. 最小权限
     数据库账号：只给必要权限
     Pod：非root运行
     IAM：最小权限策略

  5. 安全日志
     记录认证事件（登录/登出/失败）
     记录授权拒绝
     记录敏感操作（删除/修改权限）
     不记录密码/Token

  6. CI/CD集成安全检查
     PR门禁：gosec + govulncheck
     镜像扫描：Trivy
     合规检查：OPA/Kyverno
```

---

## 10. Web安全面试速答？

**回答：**

```
Q: XSS怎么防？
A: 输出转义+CSP+HttpOnly Cookie
   API返回JSON天然防XSS

Q: CSRF怎么防？
A: SameSite Cookie(最简单)
   CSRF Token/双重Cookie验证

Q: SQL注入怎么防？
A: 参数化查询/ORM
   永远不拼接用户输入到SQL

Q: SSRF怎么防？
A: URL白名单+禁止内网IP
   DNS重绑定防护+限制协议

Q: 越权漏洞怎么防？
A: 水平越权→检查数据归属
   垂直越权→统一鉴权中间件

Q: 文件上传安全？
A: 白名单类型+检查文件头+重命名
   存对象存储 不存Web目录

Q: DDoS怎么防？
A: 网络层→云厂商/CDN
   应用层→限流+WAF+验证码

Q: 安全开发要做什么？
A: SAST扫描(gosec)+依赖检查(govulncheck)
   密钥管理(Vault)+最小权限+安全日志
```
