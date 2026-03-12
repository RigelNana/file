# Nginx 架构与基础原理

---

## 1. Nginx 是什么？核心定位？

**回答：**

```
Nginx (Engine X):
  高性能 HTTP 服务器 + 反向代理 + 负载均衡器 + 邮件代理

核心能力:
  ┌──────────────────────────────────────────┐
  │ 1. Web Server    → 静态文件服务           │
  │ 2. Reverse Proxy → 反向代理 + 负载均衡    │
  │ 3. API Gateway   → 路由 + 限流 + 鉴权     │
  │ 4. Stream Proxy  → TCP/UDP 四层代理       │
  │ 5. Mail Proxy    → SMTP/IMAP/POP3 代理    │
  └──────────────────────────────────────────┘

版本对比:
  ┌────────────────┬──────────────┬──────────────────┐
  │ 版本            │ 许可证        │ 特点              │
  ├────────────────┼──────────────┼──────────────────┤
  │ Nginx OSS      │ BSD-2-Clause │ 社区开源版         │
  │ Nginx Plus     │ 商业许可      │ 企业级, 高级LB等   │
  │ OpenResty      │ BSD          │ Nginx + LuaJIT    │
  │ Tengine        │ BSD          │ 淘宝定制分支       │
  │ APISIX         │ Apache 2.0   │ 基于 OpenResty    │
  └────────────────┴──────────────┴──────────────────┘
```

---

## 2. Nginx 的进程模型详解？

**回答：**

```
进程架构:

  ┌─────────────────────────────────────────────────┐
  │                  Master Process                   │
  │  PID 1 (root)                                     │
  │  ┌─────────────────────────────────────────────┐   │
  │  │ • 读取/验证配置文件                           │   │
  │  │ • 创建/管理 Worker 进程                       │   │
  │  │ • 处理信号 (reload/stop/reopen)               │   │
  │  │ • 不处理任何客户端请求                         │   │
  │  └─────────────────────────────────────────────┘   │
  │        │              │              │              │
  │   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐         │
  │   │ Worker 1│   │ Worker 2│   │ Worker N│         │
  │   │ (nobody)│   │ (nobody)│   │ (nobody)│         │
  │   │ 单线程  │   │ 单线程  │   │ 单线程  │         │
  │   │ 事件循环│   │ 事件循环│   │ 事件循环│         │
  │   └─────────┘   └─────────┘   └─────────┘         │
  │        │              │              │              │
  │   ┌────▼──────────────▼──────────────▼────┐        │
  │   │          共享内存区域 (Shared Memory)    │        │
  │   │  • 限流计数器 (limit_req_zone)          │        │
  │   │  • 连接计数器 (limit_conn_zone)         │        │
  │   │  • SSL 会话缓存 (ssl_session_cache)     │        │
  │   │  • 缓存元数据 (proxy_cache)             │        │
  │   └───────────────────────────────────────┘        │
  └─────────────────────────────────────────────────┘

Worker 进程数设置:
  worker_processes auto;   # 自动 = CPU 核心数
  worker_cpu_affinity auto; # 绑定 CPU, 减少上下文切换

信号管理:
  SIGHUP   → reload 配置 (平滑重载)
  SIGQUIT  → 优雅停止 (处理完当前请求)
  SIGTERM  → 快速停止
  SIGUSR1  → 重新打开日志文件
  SIGUSR2  → 平滑升级二进制
```

---

## 3. 事件驱动模型原理？

**回答：**

```
传统模型 vs 事件驱动模型:

  传统 (Apache prefork):
    每个连接 → 一个进程/线程
    1000 连接 → 1000 进程 → 大量内存 + 上下文切换

  事件驱动 (Nginx):
    一个 Worker → 事件循环 → 处理数千连接
    非阻塞 I/O → 不等待, 处理其他事件

Worker 事件循环:
  while (true) {
      events = epoll_wait(epfd, ...);  // 等待事件
      for (event in events) {
          if (event == 新连接)
              accept() → 加入 epoll 监听
          if (event == 可读)
              read() → 解析请求 → 生成响应
          if (event == 可写)
              write() → 发送响应
          if (event == 超时)
              清理连接
      }
  }

I/O 多路复用机制:
  ┌──────────────┬──────────────┬──────────────────┐
  │ 机制          │ 平台          │ 特点              │
  ├──────────────┼──────────────┼──────────────────┤
  │ select       │ 跨平台        │ FD 上限 1024      │
  │ poll         │ Linux         │ 无上限, 线性扫描   │
  │ epoll        │ Linux (推荐)  │ O(1), 高性能      │
  │ kqueue       │ FreeBSD/macOS │ 类似 epoll        │
  └──────────────┴──────────────┴──────────────────┘

epoll 优势:
  1. O(1) 复杂度 — 不随连接数增加而变慢
  2. 只返回就绪的 FD, 不需要遍历所有
  3. 边缘触发 (ET) + 水平触发 (LT) 模式
```

---

## 4. Nginx 请求处理的 11 个阶段？

**回答：**

```
HTTP 请求处理阶段 (按顺序执行):

  Phase 1:  POST_READ         → 读取请求头后 (realip 模块)
  Phase 2:  SERVER_REWRITE    → server 块中的 rewrite
  Phase 3:  FIND_CONFIG       → 匹配 location (内部阶段)
  Phase 4:  REWRITE           → location 块中的 rewrite
  Phase 5:  POST_REWRITE      → rewrite 后检查 (内部阶段)
  Phase 6:  PREACCESS         → 访问前检查 (limit_req, limit_conn)
  Phase 7:  ACCESS            → 访问控制 (auth_basic, access)
  Phase 8:  POST_ACCESS       → 访问检查后 (satisfy)
  Phase 9:  PRECONTENT        → 生成内容前 (try_files, mirror)
  Phase 10: CONTENT           → 生成响应 (proxy_pass, fastcgi, static)
  Phase 11: LOG               → 记录日志 (access_log)

常用模块对应阶段:
  ngx_http_realip_module       → POST_READ
  ngx_http_rewrite_module      → REWRITE
  ngx_http_limit_req_module    → PREACCESS
  ngx_http_limit_conn_module   → PREACCESS
  ngx_http_auth_basic_module   → ACCESS
  ngx_http_access_module       → ACCESS
  ngx_http_try_files_module    → PRECONTENT
  ngx_http_proxy_module        → CONTENT
  ngx_http_fastcgi_module      → CONTENT
  ngx_http_log_module          → LOG
```

---

## 5. Nginx 与 Apache 深入对比？

**回答：**

```
架构对比:

  Apache (prefork MPM):
    Master
      ├─ Child Process 1 → 处理 1 个请求 → 阻塞等待
      ├─ Child Process 2 → 处理 1 个请求
      └─ Child Process N → 内存线性增长

  Apache (worker MPM):
    Master
      ├─ Child Process 1
      │    ├─ Thread 1 → 处理请求
      │    └─ Thread N
      └─ Child Process M

  Nginx:
    Master
      ├─ Worker 1 → 事件循环 → 处理数千个请求
      └─ Worker N → 内存使用恒定

性能对比:
  ┌──────────────────┬───────────┬───────────┐
  │ 指标              │ Nginx     │ Apache    │
  ├──────────────────┼───────────┼───────────┤
  │ 并发连接数        │ 10K+      │ ~256      │
  │ 静态文件 (QPS)    │ 50K+      │ ~5K       │
  │ 内存/连接         │ ~2.5 KB   │ ~10 MB    │
  │ CPU 使用          │ 低        │ 高        │
  │ C10K              │ 轻松      │ 困难      │
  └──────────────────┴───────────┴───────────┘

各自优势:
  Nginx:
    ✓ 静态文件性能极高
    ✓ 反向代理/负载均衡
    ✓ 低内存消耗
    ✓ 集中式配置, 易于管理
    ✗ 动态模块支持有限 (需编译)
    ✗ 没有 .htaccess

  Apache:
    ✓ .htaccess 分布式配置
    ✓ 模块生态丰富 (mod_php, mod_rewrite)
    ✓ 运行时动态加载模块
    ✓ 文档详尽
    ✗ 高并发能力弱
    ✗ 内存消耗大
```

---

## 6. Nginx 与其他 Web 服务器/代理对比？

**回答：**

```
现代 Web 服务器 / 代理对比:

  ┌──────────────┬────────────┬────────────┬────────────────┐
  │ 特性          │ Nginx      │ Envoy      │ HAProxy        │
  ├──────────────┼────────────┼────────────┼────────────────┤
  │ 核心定位      │ Web Server │ Service    │ 负载均衡器      │
  │              │ + 反向代理  │ Proxy      │                │
  │ 语言          │ C          │ C++        │ C              │
  │ 配置方式      │ 静态文件    │ xDS API    │ 静态文件        │
  │ 动态配置      │ reload     │ 热更新     │ reload/API     │
  │ L4 支持       │ stream     │ 原生       │ 原生            │
  │ gRPC         │ 基础支持    │ 原生支持   │ 基础支持        │
  │ 服务网格      │ -          │ Istio 数据面│ -              │
  │ 可观测性      │ 基础日志    │ 丰富指标   │ 详细统计        │
  │ K8s 集成      │ Ingress    │ Gateway API│ Ingress        │
  │ 社区          │ 最大       │ CNCF       │ 稳定            │
  └──────────────┴────────────┴────────────┴────────────────┘

选型建议:
  Web 静态服务 + 反向代理 → Nginx
  云原生/服务网格         → Envoy
  纯 TCP 负载均衡        → HAProxy
  API 网关 (Lua 扩展)    → OpenResty / APISIX
```

---

## 7. Nginx 模块体系？

**回答：**

```
模块分类:

  核心模块 (Core):
    ngx_core_module        → 进程管理, 基础配置
    ngx_events_module      → 事件处理
    ngx_http_module        → HTTP 框架

  HTTP 模块:
    ┌─────────────────────────────┬──────────────────┐
    │ 模块                         │ 功能              │
    ├─────────────────────────────┼──────────────────┤
    │ ngx_http_proxy_module       │ 反向代理          │
    │ ngx_http_upstream_module    │ 负载均衡          │
    │ ngx_http_fastcgi_module     │ FastCGI 代理      │
    │ ngx_http_ssl_module         │ HTTPS             │
    │ ngx_http_rewrite_module     │ URL 重写          │
    │ ngx_http_gzip_module        │ Gzip 压缩         │
    │ ngx_http_access_module      │ IP 访问控制       │
    │ ngx_http_auth_basic_module  │ HTTP Basic 认证   │
    │ ngx_http_limit_req_module   │ 请求限流          │
    │ ngx_http_limit_conn_module  │ 连接数限制        │
    │ ngx_http_realip_module      │ 获取真实 IP       │
    │ ngx_http_log_module         │ 访问日志          │
    │ ngx_http_stub_status_module │ 状态监控          │
    └─────────────────────────────┴──────────────────┘

  Stream 模块 (L4):
    ngx_stream_proxy_module   → TCP/UDP 代理
    ngx_stream_upstream_module → TCP 负载均衡
    ngx_stream_ssl_module     → TCP SSL

模块编译方式:
  静态编译: ./configure --with-http_ssl_module
  动态加载: load_module modules/ngx_http_geoip_module.so;

第三方模块:
  lua-nginx-module    → Lua 脚本扩展 (OpenResty)
  headers-more        → 灵活修改 Header
  njs                 → Nginx JavaScript
  ModSecurity         → WAF (Web 应用防火墙)
  VTS                 → 虚拟主机流量统计
```

---

## 8. Nginx 连接处理与资源限制？

**回答：**

```
连接数计算:
  最大连接数 = worker_processes × worker_connections
  
  例: 4 Worker × 65535 = 262,140 连接
  
  注意: 反向代理模式下每个客户端请求占用 2 个连接
    (客户端→Nginx + Nginx→后端)
  实际可服务连接 = worker_processes × worker_connections / 2

系统层优化:
  # 文件描述符限制
  # /etc/security/limits.conf
  nginx soft nofile 65535
  nginx hard nofile 65535

  # 内核参数
  # /etc/sysctl.conf
  net.core.somaxconn = 65535            # 监听队列最大长度
  net.core.netdev_max_backlog = 65535   # 网络设备接收队列
  net.ipv4.tcp_max_syn_backlog = 65535  # SYN 队列
  net.ipv4.tcp_tw_reuse = 1            # TIME_WAIT 重用
  net.ipv4.tcp_fin_timeout = 15        # FIN 超时
  net.ipv4.ip_local_port_range = 1024 65535  # 端口范围

Nginx 层配置:
  worker_rlimit_nofile 65535;           # Worker 文件描述符

  events {
      worker_connections 65535;
      use epoll;
      multi_accept on;
      accept_mutex off;   # 高并发场景关闭互斥锁
  }
```

---

## 9. Nginx 平滑重载与热升级原理？

**回答：**

```
平滑重载 (reload):

  nginx -s reload 过程:

  1. Master 收到 SIGHUP 信号
  2. Master 验证新配置文件语法
  3. 验证通过 → 创建新 Worker 进程 (使用新配置)
  4. 旧 Worker 进程停止接受新连接
  5. 旧 Worker 处理完当前连接后退出
  6. 整个过程零停机

  时间线:
    t=0:  [Master] → [Old Worker 1] [Old Worker 2]
    t=1:  nginx -s reload
    t=2:  [Master] → [Old Worker 1*] [Old Worker 2*]  (* = 不再接受新连接)
                    → [New Worker A]  [New Worker B]   (使用新配置)
    t=3:  Old Worker 处理完 → 退出

热升级 (Binary Upgrade):

  1. 备份旧二进制: cp /usr/sbin/nginx /usr/sbin/nginx.old
  2. 替换新二进制: cp new_nginx /usr/sbin/nginx
  3. 发送 USR2 信号: kill -USR2 $(cat /run/nginx.pid)
  4. 旧 Master fork 新 Master (使用新二进制)
  5. 新 Master 创建新 Worker
  6. 发送 WINCH 信号: kill -WINCH $(cat /run/nginx.pid.oldbin)
  7. 旧 Worker 优雅退出
  8. 确认新版本正常 → kill -QUIT 旧 Master
  9. 或者回滚 → kill -HUP 旧 Master, kill -QUIT 新 Master

  过程:
    旧 Master (PID 100, nginx.pid.oldbin)
      └─ 旧 Worker ...  (优雅退出)
    新 Master (PID 200, nginx.pid)
      └─ 新 Worker ...  (处理新请求)
```

---

## 10. Nginx 在生产环境中的常见部署模式？

**回答：**

```
部署模式:

模式 1: 前端静态 + 后端代理
  Client → Nginx (静态文件 + 反向代理)
                  ├→ /          → 静态文件 (SPA)
                  └→ /api       → 后端服务

模式 2: 多级代理
  Client → CDN → Nginx (边缘LB)
                   └→ Nginx (应用LB)
                        ├→ Service A
                        └→ Service B

模式 3: Kubernetes Ingress
  Client → Cloud LB → Nginx Ingress Controller
                        ├→ Service A (ClusterIP)
                        └→ Service B (ClusterIP)

模式 4: 全栈网关
  Client → Nginx (SSL终止 + WAF + 限流 + 路由)
            ├→ 微服务 A
            ├→ 微服务 B
            └→ 微服务 C

容器化部署:
  # Dockerfile
  FROM nginx:1.25-alpine
  COPY nginx.conf /etc/nginx/nginx.conf
  COPY dist/ /usr/share/nginx/html/
  EXPOSE 80
  CMD ["nginx", "-g", "daemon off;"]

  # 不以 daemon 模式运行, 保持前台 (容器要求)
  # alpine 版本更小 (~40MB vs ~140MB)

配置管理最佳实践:
  ✓ 配置文件纳入版本控制 (Git)
  ✓ 拆分为多个文件 (include conf.d/*.conf)
  ✓ 环境变量替换 (envsubst 或 Helm template)
  ✓ 部署前 nginx -t 验证
  ✓ CI/CD 自动化部署
```
