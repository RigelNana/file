# Location 匹配与 URL 处理

---

## 1. location 匹配规则与优先级？

**回答：**

```nginx
# ============ 匹配修饰符 ============

# 1. 精确匹配 (最高优先级)
location = /exact {
    # 只匹配 /exact, 不匹配 /exact/ 或 /exact/more
}

# 2. 优先前缀匹配 (匹配后不再检查正则)
location ^~ /static/ {
    # 匹配 /static/ 开头的 URI
    # 找到后直接使用, 不再检查正则
}

# 3. 正则匹配 - 区分大小写
location ~ \.php$ {
    # 匹配以 .php 结尾的 URI
}

# 4. 正则匹配 - 不区分大小写
location ~* \.(jpg|jpeg|png|gif|ico)$ {
    # 匹配图片文件
}

# 5. 普通前缀匹配 (最低优先级)
location / {
    # 默认匹配所有
}

# 6. 命名 location (仅用于内部跳转)
location @fallback {
    proxy_pass http://backend;
}
```

```
匹配流程图:

  请求 URI
    │
    ▼
  检查精确匹配 (=)
    ├── 命中 → 直接使用, 停止搜索
    │
    ▼
  搜索所有前缀匹配, 记录最长匹配
    ├── 最长匹配有 ^~ → 直接使用, 停止搜索
    │
    ▼
  按配置文件顺序检查正则 (~, ~*)
    ├── 第一个命中的正则 → 使用该正则, 停止搜索
    │
    ▼
  使用之前记录的最长前缀匹配

  简记: = > ^~ > ~/~* (按顺序) > 最长前缀
```

---

## 2. location 匹配实战案例？

**回答：**

```nginx
# ============ 典型网站配置 ============

server {
    listen 80;
    server_name example.com;

    # 精确匹配首页 (高频路径优化)
    location = / {
        index index.html;
    }

    # 精确匹配 favicon
    location = /favicon.ico {
        log_not_found off;
        access_log off;
    }

    # 静态资源 (^~ 避免被正则覆盖)
    location ^~ /static/ {
        root /var/www;
        expires 30d;
    }

    # API 反向代理
    location /api/ {
        proxy_pass http://backend;
    }

    # PHP 处理
    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php-fpm.sock;
        include fastcgi_params;
    }

    # 图片等静态文件
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|woff2)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    # SPA 前端 (兜底)
    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ============ 匹配测试 ============
# GET /                → = /             (精确)
# GET /favicon.ico     → = /favicon.ico  (精确)
# GET /static/logo.png → ^~ /static/     (优先前缀)
# GET /api/users       → /api/           (前缀 → 正则无匹配)
# GET /index.php       → ~ \.php$        (正则)
# GET /img/photo.jpg   → ~* \.(jpg|...)  (正则)
# GET /about           → / (try_files)   (最长前缀兜底)
```

---

## 3. rewrite 指令详解？

**回答：**

```nginx
# 语法: rewrite regex replacement [flag];

# ============ flag 说明 ============
# last      → 停止当前 rewrite, 重新匹配 location
# break     → 停止 rewrite, 在当前 location 继续执行
# redirect  → 302 临时重定向
# permanent → 301 永久重定向

# ============ 常见用法 ============

# 1. 强制 HTTPS
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
    # 注意: 简单重定向用 return 比 rewrite 更高效
}

# 2. 去除 www
server {
    server_name www.example.com;
    return 301 $scheme://example.com$request_uri;
}

# 3. 路径重写 (客户端可见, 301)
location /old-blog/ {
    rewrite ^/old-blog/(.*)$ /blog/$1 permanent;
}

# 4. 内部重写 (客户端无感知)
location /api/v1/ {
    rewrite ^/api/v1/(.*)$ /api/v2/$1 break;
    proxy_pass http://backend;
}

# 5. 正则捕获组
rewrite ^/user/(\d+)/profile$ /profile?uid=$1 last;
# /user/123/profile → /profile?uid=123

# 6. 多重 rewrite
location / {
    rewrite ^/docs/(.*)$   /documentation/$1 last;
    rewrite ^/images/(.*)$ /static/img/$1 last;
    rewrite ^/old/(.*)$    /new/$1 last;
}

# ============ last vs break ============
# 
# last:
#   rewrite 后重新进入 location 匹配
#   可能匹配到其他 location
#   适用于 server 块
#
# break:
#   rewrite 后在当前 location 继续
#   不会重新匹配 location
#   适用于 proxy_pass 场景

location /api/ {
    # break: 重写后继续用 proxy_pass 转发
    rewrite ^/api/(.*)$ /$1 break;
    proxy_pass http://backend;
}

location /page/ {
    # last: 重写后重新匹配 (可能匹配到其他 location)
    rewrite ^/page/(.*)$ /new-page/$1 last;
}
```

---

## 4. try_files 指令详解？

**回答：**

```nginx
# 语法: try_files file1 file2 ... fallback;
# 按顺序尝试文件/目录, 找到就返回, 否则使用最后一个参数

# ============ SPA 单页应用 (最常见) ============
location / {
    root /var/www/html;
    try_files $uri $uri/ /index.html;
    # 1. 尝试 $uri (如 /about → /var/www/html/about)
    # 2. 尝试 $uri/ (目录, 如 /about/)
    # 3. 都没有 → /index.html (SPA 路由交给前端)
}

# ============ 静态文件 + 后端兜底 ============
location / {
    try_files $uri $uri/ @backend;
}

location @backend {
    proxy_pass http://backend;
}
# 静态文件存在就直接返回, 否则转发到后端

# ============ 多目录查找 ============
location /theme/ {
    try_files /custom$uri /default$uri =404;
    # 1. 先查自定义主题: /custom/theme/style.css
    # 2. 再查默认主题: /default/theme/style.css
    # 3. 都没有 → 404
}

# ============ 维护页面 ============
location / {
    try_files /maintenance.html $uri $uri/ /index.html;
    # 如果 maintenance.html 存在, 所有请求返回维护页面
}

# ============ 与 proxy_pass 配合 ============
# 注意: try_files 和 proxy_pass 不能直接在同一 location 中
# 需要通过命名 location 配合

location / {
    try_files $uri @proxy;
}

location @proxy {
    proxy_pass http://backend;
    proxy_set_header Host $host;
}
```

---

## 5. return 指令用法？

**回答：**

```nginx
# 语法: return code [text|URL];

# ============ 常见用法 ============

# 301 永久重定向
server {
    listen 80;
    return 301 https://$host$request_uri;
}

# 302 临时重定向
location /temp {
    return 302 /new-location;
}

# 直接返回文本
location /health {
    return 200 "OK\n";
    add_header Content-Type text/plain;
}

# 返回 JSON
location /api/status {
    default_type application/json;
    return 200 '{"status":"healthy","version":"1.0"}';
}

# 返回 204 (无内容, 用于 CORS preflight)
if ($request_method = OPTIONS) {
    return 204;
}

# 拒绝请求
location /admin {
    return 403;
}

# 444 (Nginx 特有: 直接关闭连接, 不返回任何内容)
server {
    listen 80 default_server;
    return 444;   # 未匹配域名直接断开
}

# ============ return vs rewrite ============
# return: 更快, 适合简单的重定向/固定响应
# rewrite: 更灵活, 支持正则替换 URI
```

---

## 6. 正则表达式在 Nginx 中的使用？

**回答：**

```nginx
# Nginx 使用 PCRE (Perl 兼容正则表达式)

# ============ 常用正则语法 ============
# .      匹配任意字符
# *      前一个字符 0 次或多次
# +      前一个字符 1 次或多次
# ?      前一个字符 0 次或 1 次
# ^      字符串开头
# $      字符串结尾
# ()     捕获组 → $1, $2, ...
# []     字符类
# |      或
# \d     数字
# \w     字母数字下划线
# (?:)   非捕获组 (不占用 $N)
# (?i)   不区分大小写

# ============ location 正则示例 ============

# 匹配 PHP 文件
location ~ \.php$ { }

# 匹配静态资源 (不区分大小写)
location ~* \.(jpg|jpeg|png|gif|webp|svg|ico|css|js|woff2?)$ { }

# 匹配版本化 API
location ~ ^/api/v(\d+)/(.+)$ {
    # $1 = 版本号, $2 = 路径
    proxy_pass http://api_v$1/$2;
}

# ============ rewrite 正则示例 ============

# 捕获并重组
rewrite ^/product/(\d+)/(\w+)$ /shop?id=$1&name=$2 last;
# /product/123/shirt → /shop?id=123&name=shirt

# 非捕获组
rewrite ^/(?:en|zh|ja)/(.*)$ /$1 last;
# /en/about → /about
# /zh/about → /about

# ============ map 正则 ============
map $uri $new_uri {
    ~^/old-(.+)$    /new-$1;        # 前缀替换
    ~^/(\d{4})/     /archive/$1;    # 年份归档
    default         $uri;
}

# ============ 性能注意 ============
# 1. 正则匹配比精确匹配慢, 频繁路径用 = 或 ^~
# 2. 避免复杂的回溯正则 (可能导致 ReDoS)
# 3. 正则 location 按配置文件顺序匹配, 常用的放前面
```

---

## 7. 路径处理中 proxy_pass 尾部斜杠问题？

**回答：**

```nginx
# ============ 这是 Nginx 最常见的坑之一 ============

# 场景: location /api/ { proxy_pass http://backend??? }

# 情况 1: proxy_pass 不带路径 (不带 /)
location /api/ {
    proxy_pass http://backend;
}
# GET /api/users → 转发到 http://backend/api/users
# URI 保持原样

# 情况 2: proxy_pass 带路径 (带 /)
location /api/ {
    proxy_pass http://backend/;
}
# GET /api/users → 转发到 http://backend/users
# /api/ 被替换为 /

# 情况 3: proxy_pass 带路径 (带子路径)
location /api/ {
    proxy_pass http://backend/v2/;
}
# GET /api/users → 转发到 http://backend/v2/users
# /api/ 被替换为 /v2/

# ============ 总结规则 ============
# proxy_pass 有路径 (含 /) → 替换 location 匹配的部分
# proxy_pass 无路径         → 保留完整 URI

# ============ 正则 location + proxy_pass ============
# 正则 location 中 proxy_pass 不能有 URI 路径
# 需要用 rewrite 处理

location ~ ^/api/v(\d+)/(.+)$ {
    # ✗ 错误: proxy_pass http://backend/$2;
    # ✓ 正确:
    rewrite ^/api/v\d+/(.+)$ /$1 break;
    proxy_pass http://backend;
}
```

---

## 8. URL 编码与特殊字符处理？

**回答：**

```nginx
# ============ URI 编码问题 ============

# Nginx 默认会对 proxy_pass 的 URI 进行解码
# 如果后端需要编码后的 URI, 需要手动处理

# 保持原始编码
location /files/ {
    proxy_pass http://backend$request_uri;
    # $request_uri 保持原始编码
}

# ============ 中文路径 ============
location /文件/ {
    # 实际匹配 URL 编码后的路径:
    # /文件/ → /%E6%96%87%E4%BB%B6/
    alias /var/www/files/;
    charset utf-8;
}

# ============ root vs alias ============

# root: 追加 location 路径
location /images/ {
    root /var/www;
    # GET /images/logo.png → /var/www/images/logo.png
}

# alias: 替换 location 路径
location /images/ {
    alias /var/www/static/img/;
    # GET /images/logo.png → /var/www/static/img/logo.png
    # 注意: alias 路径末尾必须有 /
}

# alias + 正则
location ~ ^/download/(.+)$ {
    alias /var/www/files/$1;
    # 正则中 alias 使用捕获组
}

# ============ 常见陷阱 ============

# 陷阱 1: alias 末尾缺少 /
location /img/ {
    alias /var/www/images;    # ✗ 错误! 结果: /var/www/imageslogo.png
    alias /var/www/images/;   # ✓ 正确
}

# 陷阱 2: root 与 location 路径重复
location /app/ {
    root /var/www/app/;       # ✗ 结果: /var/www/app/app/xxx
    root /var/www/;           # ✓ 结果: /var/www/app/xxx
}
```

---

## 9. 错误页面与自定义响应？

**回答：**

```nginx
# ============ 自定义错误页面 ============

server {
    # 静态错误页面
    error_page 404 /404.html;
    error_page 500 502 503 504 /50x.html;

    location = /404.html {
        root /var/www/errors;
        internal;   # 只能内部访问, 不能直接请求
    }

    location = /50x.html {
        root /var/www/errors;
        internal;
    }

    # 重定向到其他 URL
    error_page 404 = /404-handler;

    location /404-handler {
        internal;
        default_type application/json;
        return 404 '{"error":"not found","code":404}';
    }
}

# ============ 后端错误拦截 ============

location /api/ {
    proxy_pass http://backend;
    
    # 拦截后端的错误响应, 使用 Nginx 的 error_page
    proxy_intercept_errors on;
    
    error_page 502 503 = @fallback;
}

location @fallback {
    default_type application/json;
    return 503 '{"error":"service unavailable","retry_after":30}';
}

# ============ 维护模式 ============
# 创建 /var/www/maintenance.html 文件即可启用

set $maintenance 0;
if (-f /var/www/maintenance.html) {
    set $maintenance 1;
}

# 排除健康检查
if ($request_uri = /health) {
    set $maintenance 0;
}

if ($maintenance = 1) {
    return 503;
}

error_page 503 @maintenance;
location @maintenance {
    root /var/www;
    rewrite ^(.*)$ /maintenance.html break;
}
```

---

## 10. 多站点配置实战？

**回答：**

```nginx
# ============ 完整多站点配置示例 ============

# /etc/nginx/nginx.conf
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /run/nginx.pid;

events {
    worker_connections 65535;
    use epoll;
    multi_accept on;
}

http {
    include       mime.types;
    default_type  application/octet-stream;

    # JSON 日志
    log_format json escape=json '{'
        '"time":"$time_iso8601",'
        '"status":$status,'
        '"method":"$request_method",'
        '"uri":"$uri",'
        '"host":"$host",'
        '"remote_addr":"$remote_addr",'
        '"request_time":$request_time'
    '}';

    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    include conf.d/*.conf;
}

# /etc/nginx/conf.d/frontend.conf
server {
    listen 80;
    server_name app.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name app.example.com;

    ssl_certificate     /etc/ssl/app.example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/app.example.com/privkey.pem;
    include snippets/ssl-params.conf;

    root /var/www/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    access_log /var/log/nginx/frontend.log json;
}

# /etc/nginx/conf.d/api.conf
upstream backend_api {
    least_conn;
    server 10.0.1.101:8080 max_fails=3 fail_timeout=30s;
    server 10.0.1.102:8080 max_fails=3 fail_timeout=30s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    ssl_certificate     /etc/ssl/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/ssl/api.example.com/privkey.pem;
    include snippets/ssl-params.conf;

    location / {
        proxy_pass http://backend_api;
        include snippets/proxy-headers.conf;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    location /health {
        return 200 "OK";
        access_log off;
    }

    access_log /var/log/nginx/api.log json;
}
```
