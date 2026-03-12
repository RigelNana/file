# Docker Compose 编排

---

## 1. Docker Compose 是什么？核心概念？

**回答：**

```
Docker Compose = 定义和运行多容器 Docker 应用的工具
使用 YAML 文件声明式描述服务、网络、卷

核心概念:
  Service  → 一个容器的配置（镜像、端口、环境变量等）
  Network  → 服务间的网络连接
  Volume   → 数据持久化
  Config   → 配置文件
  Secret   → 敏感数据
  Profile  → 按需启用的服务分组

版本演进:
  docker-compose (Python, V1) → 已弃用
  docker compose (Go, V2)     → 当前标准（Docker CLI 插件）

Compose 文件版本:
  version: '3.8' → 旧语法（仍兼容）
  不写 version   → 新语法（推荐，Compose Spec）
```

---

## 2. docker-compose.yml 完整语法？

**回答：**

```yaml
# docker-compose.yml
services:
  # ===== 服务定义 =====
  web:
    # 镜像或构建
    image: nginx:1.25                    # 使用镜像
    build:                               # 或构建
      context: .
      dockerfile: Dockerfile
      args:
        VERSION: "1.0"
      target: production                 # 多阶段构建目标
      cache_from:
        - myapp:cache
      platforms:
        - linux/amd64
        - linux/arm64

    # 容器配置
    container_name: my-web               # 容器名（不设则自动生成）
    hostname: web-server
    restart: unless-stopped
    init: true                           # 使用 tini

    # 端口映射
    ports:
      - "8080:80"                        # 宿主机:容器
      - "127.0.0.1:8443:443"             # 指定接口
      - "8080-8090:80-90"                # 范围

    # 环境变量
    environment:
      NODE_ENV: production
      DB_HOST: db
    env_file:
      - .env
      - .env.production

    # 挂载
    volumes:
      - app-data:/app/data               # 命名卷
      - ./config:/app/config:ro          # Bind Mount 只读
      - type: tmpfs
        target: /tmp
        tmpfs:
          size: 100000000                # 100MB

    # 网络
    networks:
      frontend:
        aliases:
          - web-service
      backend:

    # 依赖关系
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_started

    # 资源限制
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M

    # 健康检查
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s

    # 日志配置
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

    # 安全配置
    user: "1000:1000"
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    cap_add:
      - NET_BIND_SERVICE

    # 标签
    labels:
      app: myapp
      env: production

# ===== 卷 =====
volumes:
  app-data:
    driver: local
  db-data:
    external: true                       # 使用预先创建的卷

# ===== 网络 =====
networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
    internal: true                       # 不可访问外网

# ===== Secrets =====
secrets:
  db_password:
    file: ./secrets/db_password.txt
```

---

## 3. Docker Compose 常用命令？

**回答：**

```bash
# ===== 生命周期管理 =====
docker compose up                      # 前台启动
docker compose up -d                   # 后台启动
docker compose up -d --build           # 重新构建并启动
docker compose up -d web               # 只启动 web 服务
docker compose up -d --force-recreate  # 强制重建容器
docker compose up -d --no-deps web     # 不启动依赖

docker compose down                    # 停止并删除容器、网络
docker compose down -v                 # 同时删除卷
docker compose down --rmi all          # 同时删除镜像
docker compose down --remove-orphans   # 删除孤儿容器

docker compose stop                    # 停止服务
docker compose start                   # 启动已停止的服务
docker compose restart                 # 重启
docker compose restart web             # 重启单个服务

# ===== 状态和日志 =====
docker compose ps                      # 查看服务状态
docker compose ps -a                   # 包括已停止的
docker compose logs                    # 查看所有日志
docker compose logs -f web             # 实时跟踪 web 日志
docker compose logs --tail 100 web     # 最后 100 行
docker compose top                     # 查看进程

# ===== 执行命令 =====
docker compose exec web bash           # 进入运行中的容器
docker compose exec -u root web bash   # 以 root 进入
docker compose run web npm test        # 创建新容器执行命令
docker compose run --rm web bash       # 执行后删除容器

# ===== 构建和镜像 =====
docker compose build                   # 构建所有服务
docker compose build web               # 构建单个服务
docker compose build --no-cache        # 不使用缓存
docker compose pull                    # 拉取所有镜像
docker compose push                    # 推送所有镜像

# ===== 扩缩容 =====
docker compose up -d --scale web=3     # web 服务扩到 3 实例

# ===== 配置 =====
docker compose config                  # 验证和打印最终配置
docker compose config --services       # 列出所有服务名
docker compose config --volumes        # 列出所有卷
```

---

## 4. 多环境配置（Override）？

**回答：**

```yaml
# docker-compose.yml — 基础配置
services:
  web:
    image: myapp:latest
    ports:
      - "8080:80"
    environment:
      NODE_ENV: production

  db:
    image: postgres:16
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  db-data:
```

```yaml
# docker-compose.override.yml — 开发环境（自动加载）
services:
  web:
    build: .
    volumes:
      - ./src:/app/src     # 挂载源码，热重载
    environment:
      NODE_ENV: development
      DEBUG: "true"
    ports:
      - "9229:9229"        # 调试端口

  db:
    ports:
      - "5432:5432"        # 暴露数据库端口
    environment:
      POSTGRES_PASSWORD: devpassword
```

```yaml
# docker-compose.prod.yml — 生产环境
services:
  web:
    deploy:
      replicas: 3
      resources:
        limits:
          cpus: '2'
          memory: 1G
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"

  db:
    volumes:
      - /data/postgres:/var/lib/postgresql/data  # 生产数据目录
```

```bash
# 使用方式:

# 开发（自动加载 docker-compose.override.yml）
docker compose up -d

# 生产（指定配置文件）
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# 使用环境变量简化
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
docker compose up -d

# .env 文件中设置
# COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

---

## 5. depends_on 与服务依赖？

**回答：**

```yaml
services:
  web:
    depends_on:
      db:
        condition: service_healthy     # 等待健康检查通过
      redis:
        condition: service_started     # 只等待容器启动
      migration:
        condition: service_completed_successfully  # 等待完成

  db:
    image: postgres:16
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7

  migration:
    image: myapp:latest
    command: python manage.py migrate
    depends_on:
      db:
        condition: service_healthy
```

```
depends_on 的三个 condition:

  service_started (默认)
    → 只保证容器启动，不保证服务就绪
    → 最快，但可能连接失败

  service_healthy
    → 等待健康检查通过
    → 推荐，真正保证服务就绪

  service_completed_successfully
    → 等待容器正常退出（exit 0）
    → 适用于初始化/迁移任务

注意: depends_on 只管启动顺序
  不会自动重试连接
  应用层仍应实现连接重试逻辑
```

---

## 6. Compose Profiles？

**回答：**

```yaml
# Profiles = 按需启用的服务分组

services:
  web:
    image: myapp:latest
    # 无 profiles → 始终启动

  db:
    image: postgres:16
    # 无 profiles → 始终启动

  adminer:
    image: adminer
    ports:
      - "8080:8080"
    profiles:
      - debug                            # 只在 debug profile 启动

  mailhog:
    image: mailhog/mailhog
    profiles:
      - debug

  prometheus:
    image: prom/prometheus
    profiles:
      - monitoring

  grafana:
    image: grafana/grafana
    profiles:
      - monitoring
```

```bash
# 只启动默认服务（web + db）
docker compose up -d

# 启动默认 + debug 服务
docker compose --profile debug up -d

# 启动默认 + monitoring 服务
docker compose --profile monitoring up -d

# 启动所有 profiles
docker compose --profile debug --profile monitoring up -d

# 环境变量方式
COMPOSE_PROFILES=debug,monitoring docker compose up -d
```

---

## 7. Compose 变量替换与 .env？

**回答：**

```yaml
# docker-compose.yml 中使用变量
services:
  web:
    image: myapp:${APP_VERSION:-latest}   # 默认值 latest
    ports:
      - "${WEB_PORT:-8080}:80"
    environment:
      DB_HOST: ${DB_HOST:?DB_HOST is required}  # 必填，未设置报错
      NODE_ENV: ${NODE_ENV}
```

```bash
# .env 文件（docker compose 自动加载）
APP_VERSION=1.2.3
WEB_PORT=8080
DB_HOST=db
NODE_ENV=production
COMPOSE_PROJECT_NAME=myproject
```

### 变量优先级

```
优先级从高到低:
  1. Shell 环境变量
  2. .env 文件
  3. Compose 文件中的默认值

示例:
  # .env: APP_VERSION=1.0
  # docker-compose.yml: image: myapp:${APP_VERSION:-latest}

  docker compose up          → myapp:1.0 (来自 .env)
  APP_VERSION=2.0 docker compose up  → myapp:2.0 (Shell 变量覆盖)
```

### 变量语法

```
${VAR}              → 变量值
${VAR:-default}     → 变量未设置或为空时使用 default
${VAR-default}      → 变量未设置时使用 default（空值保留）
${VAR:?error msg}   → 变量未设置或为空时报错
${VAR?error msg}    → 变量未设置时报错
```

---

## 8. Compose Watch（开发热重载）？

**回答：**

```yaml
# Docker Compose Watch (Compose 2.22+)
# 自动同步代码变更或重建镜像

services:
  web:
    build: .
    develop:
      watch:
        # 同步文件变更（不重建）
        - action: sync
          path: ./src
          target: /app/src
          ignore:
            - node_modules/
            - "*.test.js"

        # 同步并重启容器
        - action: sync+restart
          path: ./config
          target: /app/config

        # 文件变更时重建镜像
        - action: rebuild
          path: package.json
```

```bash
# 启动 watch 模式
docker compose watch

# 或后台
docker compose up -d
docker compose watch &

# watch 动作:
#   sync       → 增量同步文件（最快，不重启）
#   sync+restart → 同步文件并重启容器
#   rebuild    → 重新构建镜像并重建容器
```

---

## 9. docker compose run vs exec vs up？

**回答：**

```bash
# docker compose up — 启动服务
docker compose up -d web
# 启动 web 服务及其依赖
# 服务持续运行

# docker compose exec — 在运行中的容器执行命令
docker compose exec web bash
# 容器必须已经在运行
# 不创建新容器

# docker compose run — 创建临时容器执行一次性命令
docker compose run --rm web npm test
docker compose run --rm web python manage.py migrate
# 创建一个新容器实例
# 默认启动依赖服务
# --no-deps 不启动依赖
# --rm 执行完自动删除
```

| 命令 | 用途 | 容器状态 | 依赖服务 |
|------|------|---------|---------|
| up | 启动服务 | 创建并运行 | 自动启动 |
| exec | 在运行容器中执行 | 必须已运行 | 无关 |
| run | 一次性任务 | 创建新容器 | 默认启动 |

```
典型使用场景:
  up   → 启动应用栈
  exec → 调试、进入容器
  run  → 数据库迁移、运行测试、生成文件
```

---

## 10. Compose 生产部署实践？

**回答：**

### 生产配置示例

```yaml
# docker-compose.prod.yml
services:
  web:
    image: registry.example.com/myapp:${VERSION}
    restart: unless-stopped
    init: true
    read_only: true
    security_opt:
      - no-new-privileges:true
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '2'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 256M
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 15s
    logging:
      driver: json-file
      options:
        max-size: "50m"
        max-file: "5"
    tmpfs:
      - /tmp
    networks:
      - frontend
      - backend

  db:
    image: postgres:16
    restart: unless-stopped
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - backend

  nginx:
    image: nginx:1.25
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - certs:/etc/nginx/certs:ro
    depends_on:
      web:
        condition: service_healthy
    networks:
      - frontend

volumes:
  db-data:
  certs:

networks:
  frontend:
  backend:
    internal: true

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 生产部署检查清单

```
✅ 配置
  □ 固定镜像版本（不用 latest）
  □ 使用 restart: unless-stopped
  □ 设置资源限制 (memory/CPU)
  □ 配置日志大小限制
  □ 配置健康检查
  □ 密码使用 secrets（不写环境变量）

✅ 安全
  □ read_only: true + tmpfs
  □ no-new-privileges
  □ cap_drop: ALL + 最小 cap_add
  □ 非 root 用户运行
  □ internal 网络隔离后端

✅ 部署
  □ 蓝绿/滚动部署策略
  □ 数据备份方案
  □ 监控和告警
  □ 日志收集
```
