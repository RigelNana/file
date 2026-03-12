# Nginx 配置文件详解

---

## 1. Nginx 配置文件的整体结构？

**回答：**

```
配置文件层次:

  nginx.conf (主配置文件)
  ┌─────────────────────────────────────────┐
  │ main (全局块)                             │
  │   user, worker_processes, pid, error_log │
  │                                          │
  │ events { }                               │
  │   worker_connections, use, multi_accept   │
  │                                          │
  │ http { }                                 │
  │   ├─ 全局 http 设置                      │
  │   │   include, log_format, gzip, etc.    │
  │   │                                      │
  │   ├─ upstream { }                        │
  │   │   后端服务器组                        │
  │   │                                      │
  │   ├─ server { }  ← 虚拟主机              │
  │   │   ├─ listen, server_name             │
  │   │   ├─ location { }  ← 请求匹配       │
  │   │   │   proxy_pass, root, etc.         │
  │   │   └─ location { }                    │
  │   │                                      │
  │   └─ server { }                          │
  │                                          │
  │ stream { }   ← 四层代理 (可选)           │
  │   server { }                             │
  └─────────────────────────────────────────┘

指令继承规则:
  指令在外层定义 → 内层继承
  内层重新定义 → 覆盖外层
  但 add_header 例外: 内部定义会完全覆盖外部 (不是追加!)
```

---

## 2. 全局块 (main context) 常用指令？

**回答：**

```nginx
# ============ 全局块 ============

# 运行用户和组
user nginx nginx;

# Worker 进程数 (auto = CPU 核心数)
worker_processes auto;

# Worker CPU 亲和性 (绑定 CPU 核心)
worker_cpu_affinity auto;

# Worker 优先级 (-20 到 19, 越小优先级越高)
worker_priority -5;

# Worker 能打开的最大文件描述符数
worker_rlimit_nofile 65535;

# PID 文件
pid /var/run/nginx.pid;

# 错误日志 (级别: debug info notice warn error crit alert emerg)
error_log /var/log/nginx/error.log warn;

# 引入其他配置文件
include /etc/nginx/modules-enabled/*.conf;

# Worker 进程的最大 core dump 大小
worker_rlimit_core 500M;
working_directory /var/crash/nginx;

# 锁文件 (accept_mutex 使用)
lock_file /var/lock/nginx.lock;
```

---

## 3. events 块详解？

**回答：**

```nginx
events {
    # 每个 Worker 的最大连接数 (包含与后端的连接)
    worker_connections 65535;

    # I/O 多路复用模型
    # Linux: epoll (推荐)
    # FreeBSD: kqueue
    # Solaris: eventport
    use epoll;

    # 一次尽可能接受多个连接
    # on: Worker 一次接受所有等待连接
    # off: Worker 一次只接受一个连接
    multi_accept on;

    # 接受互斥锁
    # on: Worker 轮流接受连接 (低并发适用)
    # off: 所有 Worker 竞争 (高并发推荐)
    accept_mutex off;

    # accept_mutex 锁的延迟时间
    accept_mutex_delay 500ms;
}

计算最大并发:
  最大连接 = worker_processes × worker_connections
  反向代理场景: 有效并发 = 上面的值 / 2
  (因为每个请求需要 client→nginx 和 nginx→backend 两个连接)

  示例:
    worker_processes 4;
    worker_connections 65535;
    最大连接: 4 × 65535 = 262,140
    反向代理有效并发: ~131,070
```

---

## 4. http 块全局指令详解？

**回答：**

```nginx
http {
    # ============ 基础设置 ============
    
    # MIME 类型
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # 字符集
    charset utf-8;

    # ============ 日志 ============
    
    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    '$request_time $upstream_response_time';

    # JSON 格式日志 (便于 ELK/Loki 解析)
    log_format json_log escape=json
        '{'
            '"time":"$time_iso8601",'
            '"remote_addr":"$remote_addr",'
            '"request":"$request",'
            '"status":$status,'
            '"body_bytes_sent":$body_bytes_sent,'
            '"request_time":$request_time,'
            '"upstream_response_time":"$upstream_response_time",'
            '"upstream_addr":"$upstream_addr",'
            '"http_referer":"$http_referer",'
            '"http_user_agent":"$http_user_agent"'
        '}';

    access_log /var/log/nginx/access.log json_log;
    
    # 条件日志 (排除健康检查)
    map $request_uri $loggable {
        ~*healthz  0;
        default    1;
    }
    access_log /var/log/nginx/access.log main if=$loggable;

    # ============ 传输优化 ============
    
    sendfile on;         # 零拷贝 (内核直接发送文件)
    tcp_nopush on;       # sendfile 时合并数据包
    tcp_nodelay on;      # 禁用 Nagle 算法, 小包立即发送
    
    # ============ 连接 ============
    
    keepalive_timeout 65;      # Keep-Alive 超时
    keepalive_requests 1000;   # 单连接最大请求数
    
    # 客户端超时
    client_header_timeout 10s;
    client_body_timeout 10s;
    send_timeout 10s;
    
    # 请求体大小限制
    client_max_body_size 100m;   # 最大上传大小
    
    # ============ 引入 ============
    include /etc/nginx/conf.d/*.conf;
    include /etc/nginx/sites-enabled/*;
}
```

---

## 5. server 块 (虚拟主机) 配置？

**回答：**

```nginx
# ============ 基于域名的虚拟主机 ============
server {
    listen 80;
    server_name example.com www.example.com;
    root /var/www/example;
    index index.html;
}

server {
    listen 80;
    server_name api.example.com;
    location / {
        proxy_pass http://backend_api;
    }
}

# ============ 基于端口 ============
server {
    listen 8080;
    server_name _;
    root /var/www/app;
}

# ============ 基于 IP ============
server {
    listen 192.168.1.100:80;
    server_name _;
    root /var/www/site1;
}

# ============ 默认服务器 ============
server {
    listen 80 default_server;
    server_name _;
    return 444;   # 直接关闭连接 (防恶意请求)
}

# ============ server_name 匹配优先级 ============
# 1. 精确匹配:     server_name example.com;
# 2. 前缀通配符:   server_name *.example.com;
# 3. 后缀通配符:   server_name www.example.*;
# 4. 正则匹配:     server_name ~^(?<sub>.+)\.example\.com$;
# 5. default_server

# 正则捕获 → 用于变量
server {
    server_name ~^(?<subdomain>.+)\.example\.com$;
    root /var/www/$subdomain;
}
```

---

## 6. Nginx 变量系统？

**回答：**

```nginx
# ============ 内置变量 ============

# 请求相关
$request          → "GET /path?query HTTP/1.1" (完整请求行)
$request_method   → GET, POST, PUT, DELETE
$request_uri      → /path?query (原始 URI, 含参数)
$uri              → /path (当前 URI, rewrite 后可能变化)
$args             → query (查询参数)
$arg_name         → 获取指定参数 (?name=value → $arg_name)
$is_args          → 有参数时为 "?", 否则为空
$scheme           → http 或 https
$host             → 请求的 Host 头 (不含端口)

# 客户端相关
$remote_addr            → 客户端 IP
$remote_port            → 客户端端口
$http_user_agent        → User-Agent 头
$http_referer           → Referer 头
$http_cookie            → Cookie 头
$http_x_forwarded_for   → X-Forwarded-For 头

# 响应相关
$status              → 响应状态码
$body_bytes_sent     → 发送的响应体大小
$request_time        → 请求处理时间 (秒, 毫秒精度)
$upstream_response_time → 后端响应时间

# 服务器相关
$server_name         → 当前 server_name
$server_addr         → 服务器 IP
$server_port         → 服务器端口
$nginx_version       → Nginx 版本

# ============ 自定义变量 ============

# set 指令
set $backend "http://api.internal";
proxy_pass $backend;

# map 指令 (高效条件映射)
map $http_user_agent $is_mobile {
    default       0;
    ~*mobile      1;
    ~*android     1;
    ~*iphone      1;
}

# geo 指令 (基于 IP 映射)
geo $geo_country {
    default        unknown;
    10.0.0.0/8     internal;
    192.168.0.0/16 internal;
}
```

---

## 7. include 与配置文件组织？

**回答：**

```
推荐的配置文件组织:

/etc/nginx/
  ├── nginx.conf              # 主配置文件
  ├── mime.types               # MIME 类型定义
  ├── conf.d/                  # 通用配置
  │   ├── gzip.conf            # 压缩配置
  │   ├── security.conf        # 安全头
  │   ├── proxy_params.conf    # 反向代理通用参数
  │   └── ssl_params.conf      # SSL 通用参数
  ├── sites-available/         # 所有站点配置
  │   ├── example.com.conf
  │   └── api.example.com.conf
  ├── sites-enabled/           # 启用的站点 (软链接)
  │   └── example.com.conf → ../sites-available/example.com.conf
  ├── upstream/                # 上游服务定义
  │   ├── backend_api.conf
  │   └── backend_web.conf
  └── snippets/                # 可复用配置片段
      ├── ssl-params.conf
      └── proxy-headers.conf
```

```nginx
# ===== snippets/proxy-headers.conf =====
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# ===== 在 server 中引入 =====
server {
    listen 80;
    server_name example.com;

    location /api {
        include snippets/proxy-headers.conf;
        proxy_pass http://backend_api;
    }
}

# include 支持通配符
include /etc/nginx/conf.d/*.conf;
include /etc/nginx/sites-enabled/*;
```

---

## 8. 配置文件中的条件判断？

**回答：**

```nginx
# ============ if 指令 (谨慎使用!) ============

# if 可用在 server 和 location 中
# 官方建议: if is evil (尽量用 map/try_files 代替)

# 检查变量
if ($request_method = POST) {
    return 405;
}

# 正则匹配
if ($http_user_agent ~* "bot|spider|crawler") {
    return 403;
}

# 检查文件存在
if (-f $request_filename) {
    break;
}

# 检查目录存在
if (-d $request_filename) {
    rewrite ^(.*)$ $1/index.html break;
}

# ============ 为什么说 if is evil? ============
# 
# if 在 location 中会创建隐式的新 location
# 其他指令 (如 proxy_pass, add_header) 可能不如预期工作
#
# 安全的 if 用法:
#   1. return ...
#   2. rewrite ... last/break
#
# 不安全:
#   if (...) { proxy_pass ...; }  # 可能出问题

# ============ 推荐替代方案 ============

# 用 map 替代多重 if
map $request_uri $rate_limit_zone {
    ~^/api/     api;
    ~^/upload/  upload;
    default     general;
}

# 用 try_files 替代文件检查
location / {
    try_files $uri $uri/ /index.html;
}

# 用 geo 替代 IP 判断
geo $is_allowed {
    default        0;
    192.168.0.0/16 1;
    10.0.0.0/8     1;
}
```

---

## 9. 配置文件验证与调试？

**回答：**

```bash
# ============ 配置验证 ============

# 测试配置文件语法
nginx -t
# nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
# nginx: configuration file /etc/nginx/nginx.conf test is successful

# 测试并打印完整配置 (含 include 展开)
nginx -T

# 指定配置文件测试
nginx -t -c /path/to/nginx.conf

# 查看编译参数和模块
nginx -V

# ============ 调试日志 ============

# 开启 debug 日志 (需编译 --with-debug)
error_log /var/log/nginx/error.log debug;

# 针对特定 IP 开启 debug
events {
    debug_connection 192.168.1.100;
    debug_connection 10.0.0.0/24;
}

# ============ stub_status 状态监控 ============
server {
    listen 8080;
    location /nginx_status {
        stub_status;
        allow 10.0.0.0/8;
        deny all;
    }
}

# 输出示例:
# Active connections: 291
# server accepts handled requests
#  16630948 16630948 31070465
# Reading: 6 Writing: 179 Waiting: 106

# 含义:
#   Active connections: 当前活跃连接数
#   accepts:  已接受的连接总数
#   handled:  已处理的连接总数 (= accepts 说明无丢弃)
#   requests: 已处理的请求总数
#   Reading:  正在读取请求头的连接数
#   Writing:  正在发送响应的连接数
#   Waiting:  Keep-Alive 等待中的连接数
```

---

## 10. 环境变量与动态配置？

**回答：**

```nginx
# ============ envsubst 模板 (Docker 常用) ============

# 模板文件: default.conf.template
server {
    listen ${NGINX_PORT};
    server_name ${NGINX_HOST};
    
    location / {
        proxy_pass ${BACKEND_URL};
    }
}

# Dockerfile
FROM nginx:1.25-alpine
COPY default.conf.template /etc/nginx/templates/default.conf.template
# Nginx 官方 Docker 镜像自动执行 envsubst

# 或手动执行
# envsubst '$NGINX_PORT $NGINX_HOST $BACKEND_URL' \
#   < /etc/nginx/templates/default.conf.template \
#   > /etc/nginx/conf.d/default.conf
```

```bash
# ============ Docker Compose 示例 ============
# docker-compose.yml
services:
  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
    environment:
      - NGINX_PORT=80
      - NGINX_HOST=example.com
      - BACKEND_URL=http://backend:8080
    volumes:
      - ./templates:/etc/nginx/templates
```

```nginx
# ============ Lua 动态配置 (OpenResty) ============
# 运行时从 Redis/Consul 获取配置

location /api {
    access_by_lua_block {
        local redis = require "resty.redis"
        local red = redis:new()
        red:connect("127.0.0.1", 6379)
        local backend = red:get("backend:api")
        ngx.var.backend_url = backend
    }
    proxy_pass $backend_url;
}

# ============ Nginx Plus API (商业版) ============
# 通过 API 动态添加/删除上游服务器
# POST /api/6/http/upstreams/backend/servers
# {"server": "192.168.1.104:8080", "weight": 1}
```
