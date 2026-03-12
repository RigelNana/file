# Nginx 与负载均衡八股文

---

## 一、Nginx 基础

### 1. Nginx 是什么？有什么特点？

**答：** Nginx 是一个高性能的 HTTP 和反向代理服务器，也可用作邮件代理和通用 TCP/UDP 代理。

**核心特点：**
- **高并发**：基于事件驱动的异步非阻塞架构，支持数万并发连接
- **低内存消耗**：静态文件服务只需约 2.5MB 内存/连接
- **反向代理**：支持 HTTP、HTTPS、WebSocket 等协议
- **负载均衡**：内置多种负载均衡算法
- **热部署**：支持不停机重载配置和升级

### 2. Nginx 的进程模型是怎样的？

**答：**

```
Master Process (主进程)
  ├── 读取配置文件
  ├── 管理 Worker 进程
  └── 不处理请求

Worker Process 1 (工作进程)  ← 实际处理请求
Worker Process 2
Worker Process N              ← 通常设置为 CPU 核心数
```

- **Master 进程**：管理 Worker，处理信号（reload、stop）
- **Worker 进程**：处理实际请求，使用 epoll/kqueue 事件驱动模型
- 每个 Worker 是单线程的，通过事件循环处理多个连接

### 3. Nginx 和 Apache 的区别？

**答：**

| 特性 | Nginx | Apache |
|------|-------|--------|
| 架构 | 事件驱动，异步非阻塞 | 进程/线程模型（prefork/worker） |
| 并发性能 | 高（C10K）| 中等 |
| 内存消耗 | 低 | 高 |
| 静态文件 | 极高性能 | 好 |
| 动态内容 | 需要转发（FastCGI/反向代理）| 内置模块处理（mod_php） |
| 配置方式 | 集中配置 | .htaccess 分布式配置 |
| 模块加载 | 编译时静态加载（新版支持动态） | 运行时动态加载 |

---

## 二、Nginx 配置

### 4. Nginx 配置文件的结构？

**答：**

```nginx
# 全局块
user nginx;
worker_processes auto;
pid /run/nginx.pid;
error_log /var/log/nginx/error.log warn;

# Events 块
events {
    worker_connections 1024;     # 每个 Worker 的最大连接数
    use epoll;                   # Linux 下使用 epoll
    multi_accept on;             # 一次接受多个连接
}

# HTTP 块
http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] '
                    '"$request" $status $body_bytes_sent '
                    '"$http_referer" "$http_user_agent" '
                    '$request_time $upstream_response_time';

    access_log /var/log/nginx/access.log main;

    # 性能优化
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    gzip on;

    # 包含其他配置文件
    include /etc/nginx/conf.d/*.conf;

    # Server 块（虚拟主机）
    server {
        listen 80;
        server_name example.com;
        root /var/www/html;

        # Location 块
        location / {
            index index.html;
        }

        location /api {
            proxy_pass http://backend;
        }
    }
}
```

### 5. Nginx 的 location 匹配规则和优先级？

**答：**

| 修饰符 | 含义 | 优先级 |
|--------|------|--------|
| `=`  | 精确匹配 | 最高 (1) |
| `^~` | 前缀匹配（匹配到就不再检查正则） | 高 (2) |
| `~`  | 正则匹配（区分大小写） | 中 (3) |
| `~*` | 正则匹配（不区分大小写） | 中 (3) |
| `/`  | 普通前缀匹配 | 低 (4) |

```nginx
# 匹配优先级示例
location = /exact           { }   # 1. 精确匹配 /exact
location ^~ /static/        { }   # 2. 前缀匹配 /static/ 开头
location ~  \.php$           { }   # 3. 正则匹配 .php 结尾
location ~* \.(jpg|png|gif)$ { }   # 3. 正则匹配图片（不区分大小写）
location /                   { }   # 4. 默认匹配
```

**匹配流程：**
1. 先检查精确匹配 `=`，命中则直接返回
2. 检查前缀匹配 `^~`，找到最长匹配
3. 检查正则匹配 `~` 和 `~*`，按配置文件中的顺序，第一个命中的生效
4. 如果没有正则命中，使用步骤2中找到的最长前缀匹配

---

## 三、反向代理

### 6. 正向代理和反向代理的区别？

**答：**

| 特性 | 正向代理 | 反向代理 |
|------|---------|---------|
| 代理对象 | 客户端 | 服务端 |
| 位置 | 客户端侧 | 服务端侧 |
| 用途 | 翻墙、缓存、访问控制 | 负载均衡、安全防护、SSL终止 |
| 客户端感知 | 知道代理的存在 | 不知道代理的存在 |

```
正向代理：Client → [Proxy] → Internet → Server
反向代理：Client → Internet → [Reverse Proxy] → Backend Servers
```

### 7. Nginx 反向代理配置？

**答：**

```nginx
upstream backend {
    server 192.168.1.101:8080;
    server 192.168.1.102:8080;
    server 192.168.1.103:8080;
}

server {
    listen 80;
    server_name api.example.com;

    location / {
        proxy_pass http://backend;

        # 传递真实客户端信息
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # 缓冲
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
    }

    # WebSocket 代理
    location /ws {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## 四、负载均衡

### 8. Nginx 支持哪些负载均衡算法？

**答：**

| 算法 | 说明 | 适用场景 |
|------|------|---------|
| **轮询 (Round Robin)** | 默认，按顺序分发 | 服务器性能相近 |
| **加权轮询 (Weighted)** | 按权重分发 | 服务器性能不同 |
| **IP Hash** | 根据客户端IP哈希 | 需要会话保持 |
| **Least Connections** | 分发到连接数最少的服务器 | 请求处理时间差异大 |
| **Random** | 随机分发 | 通用 |
| **Hash** | 自定义哈希键 | 缓存场景 |

```nginx
# 轮询（默认）
upstream backend {
    server 192.168.1.101:8080;
    server 192.168.1.102:8080;
}

# 加权轮询
upstream backend {
    server 192.168.1.101:8080 weight=3;    # 分配更多请求
    server 192.168.1.102:8080 weight=1;
}

# IP Hash
upstream backend {
    ip_hash;
    server 192.168.1.101:8080;
    server 192.168.1.102:8080;
}

# 最少连接
upstream backend {
    least_conn;
    server 192.168.1.101:8080;
    server 192.168.1.102:8080;
}

# 服务器参数
upstream backend {
    server 192.168.1.101:8080 weight=3 max_fails=3 fail_timeout=30s;
    server 192.168.1.102:8080 backup;      # 备用服务器
    server 192.168.1.103:8080 down;        # 标记为不可用
}
```

### 9. 四层负载均衡和七层负载均衡的区别？

**答：**

| 特性 | 四层 (L4) | 七层 (L7) |
|------|----------|----------|
| 工作层次 | 传输层 (TCP/UDP) | 应用层 (HTTP/HTTPS) |
| 转发依据 | IP + 端口 | URL、Header、Cookie 等 |
| 性能 | 高（直接转发） | 相对低（需要解析应用层） |
| 功能 | 简单 | 丰富（路由、改写、缓存等） |
| 工具 | LVS, HAProxy, Nginx Stream | Nginx, HAProxy, Envoy |

```nginx
# Nginx 四层负载均衡（stream 模块）
stream {
    upstream mysql_backend {
        server 192.168.1.101:3306;
        server 192.168.1.102:3306;
    }

    server {
        listen 3306;
        proxy_pass mysql_backend;
    }
}
```

---

## 五、HTTPS 配置

### 10. Nginx 如何配置 HTTPS？

**答：**

```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;    # HTTP 重定向到 HTTPS
}

server {
    listen 443 ssl http2;
    server_name example.com;

    # SSL 证书
    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    # SSL 安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # SSL 会话缓存
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;

    location / {
        root /var/www/html;
    }
}
```

---

## 六、性能优化

### 11. Nginx 性能优化有哪些方面？

**答：**

```nginx
# 1. Worker 进程优化
worker_processes auto;           # 设为 CPU 核心数
worker_rlimit_nofile 65535;      # 文件描述符限制

events {
    worker_connections 65535;     # 每个 Worker 的最大连接数
    use epoll;
    multi_accept on;
}

# 2. 缓冲和超时
http {
    sendfile on;                 # 零拷贝传输文件
    tcp_nopush on;               # 减少网络包数量
    tcp_nodelay on;              # 禁用 Nagle 算法

    keepalive_timeout 65;        # 保持连接超时
    keepalive_requests 1000;     # 每个连接最大请求数

    client_body_timeout 10s;
    client_header_timeout 10s;
    send_timeout 10s;
}

# 3. Gzip 压缩
gzip on;
gzip_min_length 1000;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript text/xml;
gzip_vary on;

# 4. 静态文件缓存
location ~* \.(jpg|jpeg|png|gif|ico|css|js)$ {
    expires 30d;
    add_header Cache-Control "public, immutable";
}

# 5. 连接池（反向代理）
upstream backend {
    server 192.168.1.101:8080;
    keepalive 32;                # 保持空闲连接
}

location / {
    proxy_pass http://backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";   # 启用 keepalive
}

# 6. 限流
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;

location /api/ {
    limit_req zone=api burst=20 nodelay;
}

# 7. 连接数限制
limit_conn_zone $binary_remote_addr zone=addr:10m;

location / {
    limit_conn addr 100;          # 每个 IP 最多 100 个连接
}
```

---

## 七、常见场景配置

### 12. Nginx 常见运维操作？

**答：**

```bash
# 测试配置文件
nginx -t

# 平滑重载（不中断服务）
nginx -s reload

# 优雅停止
nginx -s quit

# 查看编译参数
nginx -V

# 日志切割
mv /var/log/nginx/access.log /var/log/nginx/access.log.bak
kill -USR1 $(cat /var/run/nginx.pid)    # 重新打开日志文件
```

### 13. 如何配置跨域 (CORS)？

**答：**

```nginx
location /api/ {
    # CORS 头
    add_header Access-Control-Allow-Origin $http_origin;
    add_header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type, Authorization";
    add_header Access-Control-Allow-Credentials true;

    # 预检请求
    if ($request_method = OPTIONS) {
        add_header Access-Control-Max-Age 86400;
        add_header Content-Length 0;
        return 204;
    }

    proxy_pass http://backend;
}
```

### 14. 如何配置 URL 重写？

**答：**

```nginx
# rewrite 指令
server {
    # 去掉 www
    server_name www.example.com;
    return 301 $scheme://example.com$request_uri;
}

# 路径重写
location /old-path {
    rewrite ^/old-path(.*)$ /new-path$1 permanent;   # 301
}

# 内部重写（客户端无感知）
location /api/v1/ {
    rewrite ^/api/v1/(.*)$ /api/v2/$1 break;
    proxy_pass http://backend;
}

# try_files（按顺序尝试）
location / {
    try_files $uri $uri/ /index.html;   # SPA 单页应用
}
```
