# 镜像原理与 Dockerfile

---

## 1. Docker 镜像的分层存储原理？

**回答：**

```
Docker 镜像 = 多个只读层 (Layer) 叠加
每条 Dockerfile 指令创建一个新层

┌──────────────────────────┐
│  Container Layer (R/W)   │ ← 运行时可写层（容器独有）
├──────────────────────────┤
│  Layer 5: CMD            │ ← metadata 层（不增加大小）
├──────────────────────────┤
│  Layer 4: COPY app/ .    │ ← 应用代码（~5MB）
├──────────────────────────┤
│  Layer 3: RUN pip install│ ← 安装依赖（~50MB）
├──────────────────────────┤
│  Layer 2: RUN apt-get    │ ← 系统包（~30MB）
├──────────────────────────┤
│  Layer 1: python:3.11    │ ← 基础镜像（~120MB）
└──────────────────────────┘

核心机制:
  1. 内容寻址: 每层用 SHA256 哈希标识
  2. 层共享: 多个镜像共享相同的底层
  3. 写时复制 (CoW): 容器修改文件时，才从只读层拷贝到可写层
  4. 联合挂载: overlay2 将多层合并为统一视图
```

### overlay2 存储驱动

```
overlay2 运作:

  merged (统一视图)  ← 容器看到的文件系统
    ↑
  upper (可写层)     ← 容器运行时的修改
    ↑
  lower (只读层)     ← 镜像各层叠加

文件操作:
  读 → 从 merged 视图读取（上层优先）
  改 → 从 lower 拷贝到 upper，再修改（CoW）
  删 → 在 upper 创建 whiteout 文件遮蔽
  建 → 直接在 upper 层创建
```

```bash
# 查看存储驱动
docker info | grep "Storage Driver"

# 查看镜像层
docker inspect --format='{{.RootFS.Layers}}' nginx

# 查看各层大小
docker history nginx

# 底层存储位置
ls /var/lib/docker/overlay2/
```

---

## 2. Dockerfile 指令详解？

**回答：**

### 构建相关指令

```dockerfile
# FROM — 指定基础镜像（必须是第一条指令）
FROM python:3.11-slim
FROM python:3.11-slim AS builder       # 多阶段构建命名
FROM scratch                           # 空白基础（用于静态二进制）

# ARG — 构建时参数（仅在构建时有效）
ARG VERSION=1.0
ARG ENVIRONMENT
# docker build --build-arg VERSION=2.0

# RUN — 构建时执行命令
RUN apt-get update && apt-get install -y curl    # Shell 形式
RUN ["apt-get", "install", "-y", "curl"]         # Exec 形式

# COPY — 从构建上下文复制文件到镜像
COPY . /app                     # 复制当前目录到 /app
COPY --chown=app:app . /app     # 复制并设置属主
COPY --from=builder /app/bin /usr/local/bin/  # 从其他阶段复制

# ADD — 类似 COPY，但支持 URL 和自动解压 tar
ADD app.tar.gz /app             # 自动解压
# 注意: 推荐用 COPY，只在需要自动解压时用 ADD

# WORKDIR — 设置工作目录
WORKDIR /app                    # 不存在会自动创建
```

### 运行时相关指令

```dockerfile
# ENV — 设置环境变量（构建时和运行时都有效）
ENV NODE_ENV=production
ENV APP_HOME=/app \
    APP_PORT=8080

# EXPOSE — 声明容器监听端口（文档用途，不实际映射）
EXPOSE 8080
EXPOSE 8080/tcp 9090/udp

# USER — 设置后续命令和容器启动时的用户
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# VOLUME — 声明匿名卷挂载点
VOLUME /data
VOLUME ["/data", "/logs"]

# LABEL — 元数据标签
LABEL maintainer="dev@example.com"
LABEL version="1.0"
LABEL description="My application"

# HEALTHCHECK — 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
HEALTHCHECK NONE    # 禁用从基础镜像继承的健康检查

# STOPSIGNAL — 容器停止信号
STOPSIGNAL SIGTERM

# SHELL — 设置默认 Shell
SHELL ["/bin/bash", "-c"]
```

### CMD vs ENTRYPOINT

```dockerfile
# CMD — 容器默认命令（可被 docker run 参数覆盖）
CMD ["python", "app.py"]                # Exec 形式（推荐）
CMD python app.py                       # Shell 形式
CMD ["--port", "8080"]                  # 作为 ENTRYPOINT 的默认参数

# ENTRYPOINT — 容器入口点（不易被覆盖）
ENTRYPOINT ["python", "app.py"]         # Exec 形式
ENTRYPOINT python app.py                # Shell 形式（不推荐，不接收信号）

# 最佳组合:
ENTRYPOINT ["python"]                   # 固定主程序
CMD ["app.py"]                          # 默认参数（可被覆盖）
# docker run myimage        → python app.py
# docker run myimage test.py → python test.py
```

| 场景 | ENTRYPOINT | CMD | docker run myimage arg | 执行结果 |
|------|------------|-----|------------------------|---------|
| 只有 CMD | - | ["cmd"] | arg | arg |
| 只有 ENTRYPOINT | ["entry"] | - | arg | entry arg |
| 组合使用 | ["entry"] | ["cmd"] | arg | entry arg |
| 组合使用 | ["entry"] | ["cmd"] | (无) | entry cmd |

---

## 3. 多阶段构建（Multi-stage Build）？

**回答：**

```dockerfile
# 问题: 构建工具和依赖会导致最终镜像很大
# 解决: 多阶段构建 — 构建环境和运行环境分离

# ===== Go 项目示例 =====
# 阶段 1: 构建（~1GB）
FROM golang:1.22 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o server .

# 阶段 2: 运行（~10MB）
FROM alpine:3.19
RUN apk --no-cache add ca-certificates
COPY --from=builder /app/server /usr/local/bin/
EXPOSE 8080
CMD ["server"]

# ===== Node.js 项目示例 =====
# 阶段 1: 安装依赖和构建
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# 阶段 2: 运行
FROM node:20-alpine
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]

# ===== Java 项目示例 =====
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:resolve
COPY src ./src
RUN mvn package -DskipTests

FROM eclipse-temurin:21-jre-alpine
COPY --from=builder /app/target/app.jar /app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app.jar"]
```

### 效果对比

```
单阶段构建:
  Go app  → ~1.2GB (含 Go SDK + 源码)
  Node app → ~900MB (含所有 devDependencies)
  Java app → ~600MB (含 Maven + JDK)

多阶段构建:
  Go app  → ~10MB  (只含 Alpine + 静态二进制)
  Node app → ~150MB (只含运行时依赖)
  Java app → ~200MB (只含 JRE + JAR)

减少 80-99% 镜像体积!
```

---

## 4. Dockerfile 构建缓存机制？

**回答：**

```
构建缓存规则:
  1. 从上到下逐层检查是否可复用缓存
  2. 某一层缓存失效 → 后续所有层都重新构建
  3. 缓存失效条件:
     - RUN: 命令字符串变化
     - COPY/ADD: 文件内容哈希变化
     - ARG: 参数值变化

关键优化: 把变化频率低的指令放前面!
```

```dockerfile
# ❌ 错误示范 — 每次代码改动都重新安装依赖
FROM python:3.11-slim
WORKDIR /app
COPY . .                          # 代码一变，后面全部失效
RUN pip install -r requirements.txt
CMD ["python", "app.py"]

# ✅ 正确示范 — 利用缓存
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .           # 只复制依赖文件（很少变化）
RUN pip install -r requirements.txt  # 依赖不变时命中缓存
COPY . .                          # 代码最后复制（频繁变化）
CMD ["python", "app.py"]
```

### BuildKit 高级缓存

```dockerfile
# 使用 BuildKit 挂载缓存
# syntax=docker/dockerfile:1

FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .

# 缓存 pip 下载，即使 requirements.txt 变了也能复用已下载的包
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

COPY . .
CMD ["python", "app.py"]
```

```bash
# 启用 BuildKit
export DOCKER_BUILDKIT=1
docker build .

# 或在 daemon.json 中全局启用
# { "features": { "buildkit": true } }

# BuildKit 高级功能:
docker build --cache-from=myapp:cache .  # 从特定镜像作为缓存源
docker build --cache-to=type=local,dest=./cache . # 导出缓存
```

---

## 5. 镜像体积优化技巧？

**回答：**

### 1. 选择小基础镜像

```
镜像大小对比:
  ubuntu:22.04      → 77MB
  debian:bookworm   → 117MB
  debian:bookworm-slim → 74MB
  alpine:3.19       → 7MB
  distroless        → 2-20MB
  scratch           → 0MB

推荐选择:
  通用: alpine 或 *-slim 变体
  安全敏感: distroless (Google)
  静态二进制: scratch
  兼容性: debian-slim
```

### 2. 合并 RUN 指令

```dockerfile
# ❌ 每个 RUN 一层
RUN apt-get update
RUN apt-get install -y curl wget
RUN rm -rf /var/lib/apt/lists/*    # 删除缓存，但前面的层已保存了

# ✅ 合并为一层
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    rm -rf /var/lib/apt/lists/*
```

### 3. 使用 .dockerignore

```
# .dockerignore
.git
.gitignore
node_modules
*.md
docker-compose*.yml
.env*
__pycache__
*.pyc
.pytest_cache
coverage/
.idea/
.vscode/
```

### 4. 清理技巧

```dockerfile
# Python
RUN pip install --no-cache-dir -r requirements.txt

# Node.js
RUN npm ci --only=production && npm cache clean --force

# Alpine
RUN apk add --no-cache curl

# apt
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg && \
    apt-get purge -y --auto-remove && \
    rm -rf /var/lib/apt/lists/*
```

### 5. 使用 docker-slim / dive 分析

```bash
# dive — 分析镜像各层大小
dive myapp:latest
# 交互式界面，查看每层添加/修改/删除了哪些文件

# docker-slim — 自动精简镜像
docker-slim build myapp:latest
# 自动分析运行时需要的文件，生成最小镜像
```

---

## 6. .dockerignore 文件？

**回答：**

```
.dockerignore 作用:
  构建镜像时排除不需要的文件
  减少构建上下文大小 → 加速构建
  避免将敏感信息放入镜像

语法与 .gitignore 类似:
  *         匹配任意字符
  ?         匹配单个字符
  **        匹配多级目录
  !         取反（不排除）
  #         注释
```

```
# .dockerignore

# 版本控制
.git
.gitignore
.svn

# 依赖目录（在构建中重新安装）
node_modules
vendor
venv
__pycache__

# IDE 配置
.idea
.vscode
*.swp
*.swo

# 文档
*.md
LICENSE
docs/

# Docker 和 CI 配置
Dockerfile*
docker-compose*
.dockerignore
.github
.gitlab-ci.yml
Jenkinsfile

# 环境和密钥
.env
.env.*
*.pem
*.key
secrets/

# 测试和覆盖率
tests/
test/
coverage/
.pytest_cache
.nyc_output

# 构建产物（多阶段构建中重新生成）
dist/
build/
*.tar.gz

# 例外：保留特定文件
!.env.example
```

---

## 7. ARG 和 ENV 的区别与使用场景？

**回答：**

```dockerfile
# ARG — 构建时变量（只在构建阶段可用）
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine    # 可在 FROM 前使用

ARG APP_VERSION=1.0
RUN echo "Building version: ${APP_VERSION}"
# 构建后不存在于镜像中

# ENV — 环境变量（构建时和运行时都可用）
ENV NODE_ENV=production
RUN echo $NODE_ENV                 # 构建时可用
# docker exec container env        # 运行时也可用
```

| 特性 | ARG | ENV |
|------|-----|-----|
| 可用阶段 | 仅构建时 | 构建时 + 运行时 |
| 持久化 | 不持久（不在镜像中） | 持久（嵌入镜像） |
| 覆盖方式 | `--build-arg` | `-e` 或 `--env` |
| 用 FROM 前 | ✅ 可以 | ❌ 不可以 |
| 每阶段重置 | ✅ 每个 FROM 后重置 | ❌ 不重置 |
| 缓存影响 | 值变化触发缓存失效 | 值变化触发缓存失效 |

```dockerfile
# 常见组合模式: ARG → ENV
ARG APP_VERSION=1.0
ENV APP_VERSION=${APP_VERSION}
# 构建时用 --build-arg 传入，运行时也能读取

# 注意: ARG 的值会出现在 docker history 中
# 不要用 ARG 传递密钥!
# 正确做法: docker run -e SECRET=xxx 或使用 Docker Secrets
```

---

## 8. HEALTHCHECK 指令详解？

**回答：**

```dockerfile
# 语法
HEALTHCHECK [OPTIONS] CMD command
HEALTHCHECK NONE  # 禁用继承的健康检查

# OPTIONS:
#   --interval=30s     检查间隔（默认 30s）
#   --timeout=30s      超时时间（默认 30s）
#   --start-period=0s  启动宽限期（默认 0s）
#   --start-interval=5s 启动期间的检查间隔（Docker 25+）
#   --retries=3        连续失败次数判定为 unhealthy

# 返回值:
#   0 = healthy
#   1 = unhealthy
#   2 = reserved（不使用）
```

### 各场景示例

```dockerfile
# Web 应用
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# 无 curl 的轻量镜像（使用 wget）
HEALTHCHECK CMD wget -qO- http://localhost:8080/health || exit 1

# 数据库
HEALTHCHECK CMD pg_isready -U postgres || exit 1
HEALTHCHECK CMD mysqladmin ping -h localhost || exit 1

# Redis
HEALTHCHECK CMD redis-cli ping | grep -q PONG || exit 1

# 通用: 检查端口
HEALTHCHECK CMD nc -z localhost 8080 || exit 1

# 自定义脚本
COPY healthcheck.sh /usr/local/bin/
HEALTHCHECK CMD /usr/local/bin/healthcheck.sh
```

```bash
# 查看健康状态
docker ps    # STATUS 列显示 (healthy)/(unhealthy)/(starting)

docker inspect --format='{{json .State.Health}}' myapp
# 返回: status, FailingStreak, Log (最近5次检查结果)
```

---

## 9. 构建上下文（Build Context）？

**回答：**

```
构建上下文 = docker build 命令发送给 Docker Daemon 的文件集合

docker build -t myapp .
                      ^
                      构建上下文目录

流程:
  1. Docker CLI 将构建上下文打包为 tar
  2. 发送给 Docker Daemon
  3. Daemon 在上下文中查找 COPY/ADD 引用的文件
  4. .dockerignore 中的文件不会被发送
```

```bash
# 指定构建上下文
docker build .                        # 当前目录
docker build -f Dockerfile.prod .     # 指定 Dockerfile
docker build -f ../Dockerfile ..      # 父目录作为上下文
docker build - < Dockerfile           # stdin（无上下文，不能 COPY）
docker build https://github.com/user/repo.git  # Git 仓库

# 构建上下文大小查看
docker build . 2>&1 | head -1
# "Sending build context to Docker daemon  25.6MB"

# 优化:
#   1. 使用 .dockerignore 排除不需要的文件
#   2. 将 Dockerfile 放在干净的目录
#   3. 不要在根目录 / 构建
```

---

## 10. BuildKit 的高级功能？

**回答：**

```bash
# BuildKit 是 Docker 的下一代构建引擎
# Docker 23.0+ 默认启用

# 主要优势:
#   1. 并行构建无依赖的阶段
#   2. 更好的缓存机制
#   3. Secret 安全传递
#   4. SSH 代理转发
#   5. 更好的输出格式
```

### Secret Mount（安全传递密钥）

```dockerfile
# syntax=docker/dockerfile:1
FROM python:3.11-slim
RUN --mount=type=secret,id=pip_conf,target=/etc/pip.conf \
    pip install -r requirements.txt
# 密钥不会保存在镜像层中!

# 构建时传入
docker build --secret id=pip_conf,src=./pip.conf .
```

### SSH Mount（SSH 代理转发）

```dockerfile
# syntax=docker/dockerfile:1
FROM alpine
RUN --mount=type=ssh \
    git clone git@github.com:private/repo.git
# 使用宿主机 SSH Agent，私钥不进入镜像

# 构建时
docker build --ssh default .
```

### Cache Mount（缓存挂载）

```dockerfile
# syntax=docker/dockerfile:1
# 包管理器缓存持久化（跨构建复用）
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install -r requirements.txt

RUN --mount=type=cache,target=/root/.npm \
    npm ci

RUN --mount=type=cache,target=/root/.m2 \
    mvn package

RUN --mount=type=cache,target=/root/.cache/go-build \
    --mount=type=cache,target=/go/pkg/mod \
    go build -o /app/server .
```

### Bind Mount（构建时挂载）

```dockerfile
# 只在 RUN 期间挂载文件，不复制到镜像
RUN --mount=type=bind,source=package.json,target=/app/package.json \
    --mount=type=bind,source=package-lock.json,target=/app/package-lock.json \
    npm ci
```

### 多平台构建

```bash
# 创建多平台 builder
docker buildx create --name multiarch --use

# 构建多平台镜像
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t myapp:latest \
  --push .

# 查看 builder
docker buildx ls
```
