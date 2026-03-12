# HTTPS 与安全配置

---

## 1. HTTPS 工作原理？

**回答：**

```
HTTPS = HTTP + TLS (Transport Layer Security)

TLS 握手流程 (TLS 1.2):

  Client                              Server
    │                                    │
    ├── ClientHello ──────────────────→  │  (支持的密码套件, 随机数)
    │                                    │
    │  ←──────────────── ServerHello ──┤  (选择密码套件, 随机数)
    │  ←────────────── Certificate ────┤  (服务端证书)
    │  ←────────── ServerKeyExchange ──┤  (DH 参数)
    │  ←────────── ServerHelloDone ────┤
    │                                    │
    │── ClientKeyExchange ────────────→  │  (客户端 DH 公钥)
    │── ChangeCipherSpec ─────────────→  │  (切换到加密通信)
    │── Finished ─────────────────────→  │
    │                                    │
    │  ←──────── ChangeCipherSpec ─────┤
    │  ←──────── Finished ─────────────┤
    │                                    │
    ├── 加密数据传输 ←────────────────→ ──┤
    
TLS 1.3 改进:
  • 握手从 2-RTT 减少到 1-RTT
  • 0-RTT (Session Resumption)
  • 移除不安全算法 (RSA 密钥交换, RC4, SHA-1 等)
  • 更少的密码套件选择

证书链:
  Root CA (根证书, 内置于浏览器/OS)
    └─ Intermediate CA (中间证书)
        └─ Server Certificate (服务器证书)
  
  fullchain.pem = 服务器证书 + 中间证书
  privkey.pem   = 私钥
```

---

## 2. Nginx HTTPS 完整配置？

**回答：**

```nginx
# ============ HTTP → HTTPS 重定向 ============
server {
    listen 80;
    listen [::]:80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

# ============ HTTPS 配置 ============
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name example.com www.example.com;

    # ============ 证书文件 ============
    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;

    # ============ SSL 协议版本 ============
    ssl_protocols TLSv1.2 TLSv1.3;
    # 不要启用 TLSv1.0 和 TLSv1.1 (已废弃, 不安全)

    # ============ 密码套件 ============
    # TLS 1.2 密码套件 (安全优先)
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305;
    # TLS 1.3 密码套件由协议自动选择, 不受此指令影响
    ssl_prefer_server_ciphers off;
    # TLS 1.3+ 建议 off (客户端通常选择更佳)

    # ============ DH 参数 ============
    ssl_dhparam /etc/nginx/ssl/dhparam.pem;
    # 生成: openssl dhparam -out dhparam.pem 2048

    # ============ ECDH 曲线 ============
    ssl_ecdh_curve X25519:secp384r1;

    # ============ Session 缓存 ============
    ssl_session_cache shared:SSL:10m;   # 10MB 共享缓存 (~40,000 sessions)
    ssl_session_timeout 1d;             # 会话有效期 1 天
    ssl_session_tickets off;            # 关闭 Session Tickets (前向保密)

    # ============ 安全头 ============
    # HSTS (强制 HTTPS)
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

    # ============ OCSP Stapling ============
    ssl_stapling on;
    ssl_stapling_verify on;
    ssl_trusted_certificate /etc/letsencrypt/live/example.com/chain.pem;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;

    root /var/www/html;
    index index.html;
}
```

---

## 3. Let's Encrypt 免费证书管理？

**回答：**

```bash
# ============ Certbot 安装 ============
# Ubuntu/Debian
apt install certbot python3-certbot-nginx

# CentOS/RHEL
yum install certbot python3-certbot-nginx

# ============ 获取证书 ============

# 方式 1: Nginx 插件 (自动配置)
certbot --nginx -d example.com -d www.example.com

# 方式 2: Standalone 模式 (需要停 Nginx 80 端口)
certbot certonly --standalone -d example.com

# 方式 3: Webroot 模式 (不中断服务)
certbot certonly --webroot -w /var/www/html -d example.com
```

```nginx
# Webroot 验证需要的 Nginx 配置
server {
    listen 80;
    server_name example.com;

    # Let's Encrypt 验证路径
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

```bash
# ============ 自动续期 ============
# Certbot 自动创建 systemd timer 或 cron job

# 手动测试续期
certbot renew --dry-run

# 续期后自动 reload Nginx
# /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
#!/bin/bash
nginx -t && systemctl reload nginx

# ============ 证书文件位置 ============
# /etc/letsencrypt/live/example.com/
#   ├── fullchain.pem   # 服务器证书 + 中间证书
#   ├── privkey.pem     # 私钥
#   ├── cert.pem        # 服务器证书
#   └── chain.pem       # 中间证书 (OCSP Stapling 用)

# ============ 通配符证书 ============
# 需要 DNS 验证 (自动化需要 DNS API)
certbot certonly --manual --preferred-challenges dns \
    -d "*.example.com" -d example.com
```

---

## 4. SSL/TLS 安全最佳实践？

**回答：**

```
安全等级检测: https://www.ssllabs.com/ssltest/

A+ 评级要求:
  ✓ TLS 1.2 + 1.3
  ✓ 安全密码套件 (ECDHE + AES-GCM / CHACHA20)
  ✓ HSTS (max-age > 6个月)
  ✓ 无已知漏洞 (BEAST, POODLE, Heartbleed 等)
  ✓ OCSP Stapling
  ✓ CAA DNS 记录
```

```nginx
# ============ 安全配置清单 ============

# 1. 只启用安全协议
ssl_protocols TLSv1.2 TLSv1.3;

# 2. 只使用安全密码套件
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;

# 3. HSTS (HTTP Strict Transport Security)
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;

# 4. 禁用 Session Tickets (保证前向保密)
ssl_session_tickets off;

# 5. OCSP Stapling (加速证书验证)
ssl_stapling on;
ssl_stapling_verify on;

# 6. 安全 HTTP 头
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'" always;
add_header Permissions-Policy "geolocation=(), camera=(), microphone=()" always;

# 7. 隐藏版本信息
server_tokens off;
```

---

## 5. mTLS 双向认证？

**回答：**

```nginx
# ============ 双向 TLS (Mutual TLS) ============
# 服务端验证客户端证书, 常用于:
#   • 微服务间通信 (Service Mesh)
#   • API 安全认证
#   • 零信任网络

server {
    listen 443 ssl http2;
    server_name api.internal.com;

    # 服务端证书 (正常)
    ssl_certificate     /etc/ssl/server.pem;
    ssl_certificate_key /etc/ssl/server.key;

    # 客户端证书验证 (mTLS 关键配置)
    ssl_client_certificate /etc/ssl/ca.pem;   # 签发客户端证书的 CA
    ssl_verify_client on;                      # 强制验证
    # ssl_verify_client optional;              # 可选验证
    ssl_verify_depth 2;                        # 证书链验证深度

    location / {
        # 将客户端证书信息传递给后端
        proxy_set_header X-SSL-Client-CN $ssl_client_s_dn;
        proxy_set_header X-SSL-Client-Verify $ssl_client_verify;
        proxy_pass http://backend;
    }

    # 客户端证书验证失败
    error_page 495 496 = @ssl_error;
    location @ssl_error {
        return 403 '{"error":"client certificate required"}';
    }
}

# ============ 相关变量 ============
# $ssl_client_verify   → SUCCESS / FAILED:reason / NONE
# $ssl_client_s_dn     → 客户端证书 Subject DN
# $ssl_client_i_dn     → 客户端证书 Issuer DN
# $ssl_client_serial   → 客户端证书序列号
# $ssl_client_fingerprint → 客户端证书指纹
```

---

## 6. HTTP/2 与 HTTP/3 配置？

**回答：**

```nginx
# ============ HTTP/2 ============
server {
    listen 443 ssl http2;
    # http2 参数启用 HTTP/2 支持

    # HTTP/2 Server Push (主动推送资源)
    location / {
        http2_push /css/style.css;
        http2_push /js/app.js;
        # 注: HTTP/2 Push 已被 Chrome 废弃, 不建议使用
    }
}

# HTTP/2 优势:
#   • 多路复用 (一个连接传输多个请求)
#   • 头部压缩 (HPACK)
#   • 二进制协议 (解析更高效)
#   • 服务端推送 (已废弃)

# HTTP/2 配置参数:
http2_max_concurrent_streams 128;    # 单连接最大并发流
http2_max_field_size 4k;             # 头部字段最大值
http2_max_header_size 16k;           # 请求头总大小

# ============ HTTP/3 (QUIC) ============
# Nginx 1.25+ 支持 HTTP/3
server {
    listen 443 ssl;
    listen 443 quic reuseport;   # HTTP/3 使用 UDP

    http2 on;
    http3 on;

    # 告诉浏览器支持 HTTP/3
    add_header Alt-Svc 'h3=":443"; ma=86400' always;

    ssl_certificate     /etc/ssl/example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/example.com/privkey.pem;

    # QUIC 需要 TLS 1.3
    ssl_protocols TLSv1.2 TLSv1.3;

    # 0-RTT (快速重连)
    ssl_early_data on;
    # 注意: 0-RTT 存在重放攻击风险, 仅用于幂等请求
    proxy_set_header Early-Data $ssl_early_data;
}

# HTTP/3 优势:
#   • 基于 UDP (QUIC 协议)
#   • 0-RTT 快速连接
#   • 无队头阻塞
#   • 连接迁移 (切换网络不断连)
```

---

## 7. 访问控制与认证？

**回答：**

```nginx
# ============ IP 访问控制 ============
location /admin/ {
    allow 10.0.0.0/8;
    allow 192.168.0.0/16;
    deny all;
}

# ============ HTTP Basic Auth ============
location /admin/ {
    auth_basic "Administrator Login";
    auth_basic_user_file /etc/nginx/.htpasswd;
}

# 创建密码文件:
# htpasswd -c /etc/nginx/.htpasswd admin
# 或: echo "admin:$(openssl passwd -apr1 'password')" > /etc/nginx/.htpasswd

# ============ 外部认证 (auth_request) ============
# 将认证逻辑委托给外部服务

location /protected/ {
    auth_request /auth;
    auth_request_set $auth_user $upstream_http_x_auth_user;
    
    proxy_set_header X-Auth-User $auth_user;
    proxy_pass http://backend;
}

location = /auth {
    internal;
    proxy_pass http://auth-service:8080/verify;
    proxy_pass_request_body off;
    proxy_set_header Content-Length "";
    proxy_set_header X-Original-URI $request_uri;
    proxy_set_header X-Original-Method $request_method;
    # auth-service 返回 200 → 允许访问
    # auth-service 返回 401/403 → 拒绝
}

# ============ JWT 验证 (njs 模块) ============
# 使用 Nginx JavaScript 模块验证 JWT
# js_import jwt from conf.d/jwt.js;
# js_set $jwt_valid jwt.validate;
#
# location /api/ {
#     if ($jwt_valid != "1") {
#         return 401;
#     }
#     proxy_pass http://backend;
# }

# ============ 请求方法限制 ============
location /api/ {
    # 只允许特定方法
    limit_except GET POST {
        deny all;
    }
    proxy_pass http://backend;
}
```

---

## 8. WAF (Web 应用防火墙)？

**回答：**

```nginx
# ============ ModSecurity + Nginx ============
# ModSecurity 是开源 WAF, 可作为 Nginx 模块

# 安装 (需要编译 nginx-modsecurity 模块)
# 或使用 modsecurity-nginx connector

# 配置:
load_module modules/ngx_http_modsecurity_module.so;

http {
    modsecurity on;
    modsecurity_rules_file /etc/nginx/modsecurity/main.conf;
}

server {
    location / {
        modsecurity on;
        modsecurity_rules '
            SecRuleEngine On
            SecRule ARGS "@detectSQLi" "id:1,phase:2,deny,status:403,msg:SQL Injection"
            SecRule ARGS "@detectXSS" "id:2,phase:2,deny,status:403,msg:XSS Attack"
        ';
        proxy_pass http://backend;
    }
}

# OWASP CRS (Core Rule Set):
# 预定义的安全规则集, 防护:
#   • SQL 注入
#   • XSS 跨站脚本
#   • 命令注入
#   • 路径遍历
#   • 文件包含
```

```nginx
# ============ 简单安全规则 (不用 ModSecurity) ============

# 阻止常见攻击路径
location ~* /(\.git|\.env|\.htaccess|wp-admin|phpmyadmin) {
    deny all;
    return 404;
}

# 阻止可疑 User-Agent
if ($http_user_agent ~* (curl|wget|python|scrapy|nikto|sqlmap)) {
    return 403;
}

# 限制请求大小 (防止大 payload 攻击)
client_max_body_size 10m;
client_body_buffer_size 16k;
client_header_buffer_size 1k;
large_client_header_buffers 4 8k;

# 防止目录遍历
location ~ /\. {
    deny all;
    access_log off;
    log_not_found off;
}
```

---

## 9. CORS 跨域配置详解？

**回答：**

```nginx
# ============ 完整 CORS 配置 ============

map $http_origin $cors_origin {
    default "";
    "https://app.example.com"  $http_origin;
    "https://admin.example.com" $http_origin;
    ~^https://.*\.example\.com$ $http_origin;
}

server {
    location /api/ {
        # 预检请求 (OPTIONS)
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin $cors_origin;
            add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, PATCH, OPTIONS";
            add_header Access-Control-Allow-Headers "Content-Type, Authorization, X-Requested-With";
            add_header Access-Control-Allow-Credentials "true";
            add_header Access-Control-Max-Age 86400;    # 预检结果缓存 24h
            add_header Content-Length 0;
            return 204;
        }

        # 正常请求
        add_header Access-Control-Allow-Origin $cors_origin always;
        add_header Access-Control-Allow-Credentials "true" always;
        add_header Access-Control-Expose-Headers "Content-Range, X-Total-Count" always;

        proxy_pass http://backend;
    }
}

# ============ 安全注意 ============
# 
# ✗ 不要用: Access-Control-Allow-Origin: * + Credentials: true
#   浏览器会拒绝! 带凭证请求必须指定具体 Origin
#
# ✗ 不要直接反射所有 Origin:
#   add_header Access-Control-Allow-Origin $http_origin;
#   这等于 *, 有安全风险
#
# ✓ 用 map 白名单验证 Origin (如上面的示例)
```

---

## 10. 限流与 DDoS 防护？

**回答：**

```nginx
# ============ 请求速率限制 (limit_req) ============

# 定义限流区域 (http 块中)
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
# $binary_remote_addr: 按客户端 IP 限流
# zone=api:10m:        名为 api 的 10MB 共享内存区
# rate=10r/s:          每秒 10 个请求

# 应用限流
location /api/ {
    limit_req zone=api burst=20 nodelay;
    # burst=20:  允许突发 20 个请求
    # nodelay:   突发请求不延迟, 立即处理
    #            超过 burst 后直接拒绝
    
    # 自定义错误码 (默认 503)
    limit_req_status 429;
    
    proxy_pass http://backend;
}

# ============ 并发连接限制 (limit_conn) ============

limit_conn_zone $binary_remote_addr zone=addr:10m;

location / {
    limit_conn addr 100;         # 每 IP 最多 100 个并发连接
    limit_conn_status 429;       # 超限返回 429
}

# ============ 带宽限制 ============
location /download/ {
    limit_rate 1m;               # 每连接限速 1MB/s
    limit_rate_after 10m;        # 前 10MB 不限速
}

# ============ 分层限流 ============
# 全局 + 特定路径不同限速

limit_req_zone $binary_remote_addr zone=general:10m rate=30r/s;
limit_req_zone $binary_remote_addr zone=login:10m rate=3r/s;
limit_req_zone $binary_remote_addr zone=search:10m rate=5r/s;

location / {
    limit_req zone=general burst=50 nodelay;
    proxy_pass http://backend;
}

location /api/login {
    limit_req zone=login burst=5 nodelay;     # 登录接口严格限流
    proxy_pass http://backend;
}

location /api/search {
    limit_req zone=search burst=10 nodelay;   # 搜索接口中等限流
    proxy_pass http://backend;
}

# ============ DDoS 缓解 ============

# 1. 连接速率限制
limit_conn_zone $binary_remote_addr zone=perip:10m;
limit_conn perip 50;

# 2. 请求体大小限制
client_max_body_size 10m;
client_body_buffer_size 16k;

# 3. 超时设置 (防慢速攻击)
client_header_timeout 5s;
client_body_timeout 5s;
send_timeout 5s;

# 4. 关闭慢连接
reset_timedout_connection on;

# 5. 拒绝无效请求
if ($request_method !~ ^(GET|HEAD|POST|PUT|DELETE|PATCH)$) {
    return 405;
}

# 6. 封禁恶意 IP (配合 fail2ban)
# deny 1.2.3.4;
# include /etc/nginx/blocklist.conf;
```
