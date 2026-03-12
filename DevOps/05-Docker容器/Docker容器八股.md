# Docker 容器八股文

---

## 一、Docker 基础概念

### 1. Docker 是什么？它解决了什么问题？

**答：** Docker 是一个开源的**应用容器引擎**，基于 Linux 容器（LXC）技术，将应用及其依赖打包到一个可移植的容器中。

**解决的问题：**
- **环境一致性**："在我机器上能跑"的问题 → 容器包含完整运行环境
- **资源隔离**：应用之间相互隔离，互不影响
- **快速部署**：秒级启动，相比虚拟机分钟级启动
- **资源利用率**：共享宿主机内核，开销远小于虚拟机

### 2. Docker 和虚拟机有什么区别？

**答：**

| 特性 | Docker 容器 | 虚拟机 |
|------|-----------|--------|
| 虚拟化层次 | 操作系统级虚拟化 | 硬件级虚拟化 |
| 内核 | 共享宿主机内核 | 独立的操作系统内核 |
| 启动速度 | 秒级 | 分钟级 |
| 镜像大小 | MB 级别 | GB 级别 |
| 性能 | 接近原生 | 有虚拟化开销 |
| 隔离性 | 进程级隔离（较弱） | 完全隔离（强） |
| 资源占用 | 少 | 多 |
| 密度 | 单机可运行数百容器 | 通常数十个 |

### 3. Docker 的架构是怎样的？

**答：** Docker 采用 **C/S 架构**：

```
Docker Client (docker CLI)
    ↕ REST API
Docker Daemon (dockerd)
    ├── 镜像管理
    ├── 容器管理
    ├── 网络管理
    └── 存储管理
        ↕
Container Runtime (containerd → runc)
    ↕
Linux Kernel (Namespace + Cgroup)
```

**核心组件：**
- **Docker Client**：命令行工具，发送请求给 Docker Daemon
- **Docker Daemon (dockerd)**：后台守护进程，管理镜像、容器等
- **containerd**：容器运行时，管理容器生命周期
- **runc**：OCI 容器运行时规范的实现，实际创建和运行容器

### 4. Docker 底层依赖哪些 Linux 技术？

**答：**

| 技术 | 作用 |
|------|------|
| **Namespace** | 资源隔离 |
| - PID Namespace | 进程ID隔离，容器内PID从1开始 |
| - Network Namespace | 网络隔离，独立网络栈 |
| - Mount Namespace | 文件系统挂载隔离 |
| - UTS Namespace | 主机名隔离 |
| - IPC Namespace | 进程间通信隔离 |
| - User Namespace | 用户和组隔离 |
| **Cgroup** | 资源限制（CPU、内存、I/O等） |
| **UnionFS** | 联合文件系统（镜像分层存储） |

---

## 二、镜像 (Image)

### 5. Docker 镜像的分层结构是怎样的？

**答：** Docker 镜像由多个**只读层 (layer)** 组成，使用联合文件系统 (UnionFS) 叠加。

```
┌─────────────────────┐
│   可写层 (Container) │  ← 容器运行时创建，可读写
├─────────────────────┤
│   Layer 4: CMD      │  ← 只读
├─────────────────────┤
│   Layer 3: COPY app │  ← 只读
├─────────────────────┤
│   Layer 2: RUN apt  │  ← 只读
├─────────────────────┤
│   Layer 1: Base OS  │  ← 只读（基础镜像）
└─────────────────────┘
```

**优点：**
- 层可以被多个镜像共享，节省存储空间
- 构建时只需重建变化的层，加速构建
- 拉取镜像时只需下载缺少的层

### 6. Dockerfile 常用指令有哪些？

**答：**

| 指令 | 说明 | 示例 |
|------|------|------|
| FROM | 基础镜像 | `FROM python:3.11-slim` |
| RUN | 构建时执行命令 | `RUN apt-get update && apt-get install -y curl` |
| COPY | 复制文件到镜像 | `COPY . /app` |
| ADD | 复制文件（支持URL和自动解压） | `ADD app.tar.gz /app` |
| WORKDIR | 设置工作目录 | `WORKDIR /app` |
| ENV | 设置环境变量 | `ENV NODE_ENV=production` |
| ARG | 构建参数（仅构建时可用） | `ARG VERSION=1.0` |
| EXPOSE | 声明端口（文档目的） | `EXPOSE 8080` |
| CMD | 容器启动命令（可被覆盖） | `CMD ["python", "app.py"]` |
| ENTRYPOINT | 容器入口点（不易被覆盖） | `ENTRYPOINT ["python"]` |
| VOLUME | 声明挂载点 | `VOLUME /data` |
| USER | 指定运行用户 | `USER appuser` |
| HEALTHCHECK | 健康检查 | `HEALTHCHECK CMD curl -f http://localhost/` |
| LABEL | 元数据标签 | `LABEL maintainer="dev@example.com"` |

### 7. CMD 和 ENTRYPOINT 的区别？

**答：**

| 特性 | CMD | ENTRYPOINT |
|------|-----|------------|
| 作用 | 容器的默认命令 | 容器的入口程序 |
| 可覆盖性 | `docker run` 后面的命令会覆盖 CMD | 需要 `--entrypoint` 才能覆盖 |
| 组合使用 | 当与 ENTRYPOINT 一起使用时，CMD 提供默认参数 | 定义主命令 |

```dockerfile
# 示例 1：只用 CMD
CMD ["python", "app.py"]
# docker run myimage             → python app.py
# docker run myimage bash        → bash（CMD被覆盖）

# 示例 2：只用 ENTRYPOINT
ENTRYPOINT ["python", "app.py"]
# docker run myimage             → python app.py
# docker run myimage --debug     → python app.py --debug（参数追加）

# 示例 3：组合使用（最佳实践）
ENTRYPOINT ["python"]
CMD ["app.py"]
# docker run myimage             → python app.py
# docker run myimage test.py     → python test.py（CMD被覆盖）
```

### 8. 如何编写高效的 Dockerfile？（镜像优化）

**答：**

```dockerfile
# ==================== 最佳实践 ====================

# 1. 使用小体积基础镜像
FROM python:3.11-slim          # 而不是 python:3.11

# 2. 多阶段构建（Multi-stage Build）
FROM golang:1.21 AS builder
WORKDIR /app
COPY . .
RUN go build -o /app/server

FROM alpine:3.18
COPY --from=builder /app/server /usr/local/bin/
CMD ["server"]

# 3. 合并 RUN 指令减少层数
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        wget && \
    rm -rf /var/lib/apt/lists/*    # 清理缓存

# 4. 利用构建缓存 — 把变化频率低的放前面
COPY requirements.txt .
RUN pip install -r requirements.txt    # 依赖不变时使用缓存
COPY . .                                # 代码经常变，放最后

# 5. 使用 .dockerignore 排除不需要的文件
# .dockerignore 内容：
# .git
# node_modules
# *.md
# docker-compose*.yml

# 6. 不以 root 运行
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# 7. 使用 HEALTHCHECK
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1
```

### 9. 镜像常用操作命令？

**答：**

```bash
# 构建镜像
docker build -t myapp:1.0 .               # 从当前目录 Dockerfile 构建
docker build -t myapp:1.0 -f Dockerfile.prod .  # 指定 Dockerfile
docker build --no-cache -t myapp:1.0 .     # 不使用缓存

# 查看镜像
docker images                              # 列出镜像
docker image ls                            # 同上
docker image inspect myapp:1.0             # 查看镜像详情
docker history myapp:1.0                   # 查看镜像层历史

# 标签和推送
docker tag myapp:1.0 registry.example.com/myapp:1.0
docker push registry.example.com/myapp:1.0
docker pull registry.example.com/myapp:1.0

# 清理
docker image prune                         # 删除悬空镜像（dangling）
docker image prune -a                      # 删除所有未使用的镜像
docker system prune -a                     # 清理所有未使用资源

# 导出和导入
docker save -o myapp.tar myapp:1.0         # 导出镜像为 tar
docker load -i myapp.tar                   # 导入镜像
```

---

## 三、容器 (Container)

### 10. 容器的生命周期和常用命令？

**答：**

```
Created → Running → Paused → Running → Stopped → Removed
```

```bash
# 创建和运行
docker run -d --name myapp -p 8080:80 nginx    # 后台运行
docker run -it ubuntu bash                      # 交互式运行
docker run --rm alpine echo "hello"             # 运行后自动删除

# 常用 run 参数
-d              # 后台运行（detach）
-it             # 交互式终端
--name          # 容器名称
-p 8080:80      # 端口映射 (宿主:容器)
-v /host:/cont  # 卷挂载
-e KEY=VALUE    # 环境变量
--restart=always # 自动重启策略
--memory=512m   # 内存限制
--cpus=1.5      # CPU 限制
--network=mynet # 指定网络

# 管理容器
docker ps                    # 列出运行中的容器
docker ps -a                 # 列出所有容器
docker stop myapp            # 优雅停止（SIGTERM → SIGKILL）
docker start myapp           # 启动已停止的容器
docker restart myapp         # 重启
docker kill myapp            # 强制停止（SIGKILL）
docker rm myapp              # 删除容器
docker rm -f myapp           # 强制删除运行中的容器

# 进入容器
docker exec -it myapp bash         # 执行命令（推荐）
docker exec -it myapp sh           # 如果没有 bash
docker attach myapp                # 附加到容器（Ctrl+P+Q断开）

# 查看信息
docker logs myapp                  # 查看日志
docker logs -f myapp               # 实时跟踪日志
docker logs --tail 100 myapp       # 最后100行
docker inspect myapp               # 查看容器详情
docker stats                       # 实时资源使用统计
docker top myapp                   # 查看容器内进程

# 文件操作
docker cp myapp:/app/log.txt .     # 从容器复制文件
docker cp file.txt myapp:/app/     # 复制文件到容器
```

### 11. 容器的重启策略有哪些？

**答：**

| 策略 | 说明 |
|------|------|
| `no` | 默认，不自动重启 |
| `on-failure[:N]` | 非正常退出时重启（可设置最大次数） |
| `always` | 总是重启（Docker daemon启动时也会启动） |
| `unless-stopped` | 总是重启，除非手动停止 |

```bash
docker run -d --restart=unless-stopped --name myapp nginx
docker update --restart=always myapp    # 更新重启策略
```

---

## 四、Docker 网络

### 12. Docker 的网络模式有哪些？

**答：**

| 网络模式 | 说明 | 使用场景 |
|---------|------|---------|
| bridge | 默认模式，容器通过 docker0 虚拟网桥通信 | 单机容器互联 |
| host | 容器直接使用宿主机网络栈 | 需要最高网络性能 |
| none | 没有网络，完全隔离 | 安全敏感场景 |
| overlay | 跨主机容器通信（Swarm/K8s） | 多主机集群 |
| macvlan | 容器拥有独立 MAC 地址，直连物理网络 | 需要容器在物理网络中可见 |

```bash
# 创建自定义网络
docker network create mynet
docker network create --driver bridge --subnet 172.20.0.0/16 mynet

# 运行容器加入网络
docker run -d --network mynet --name app1 nginx
docker run -d --network mynet --name app2 nginx
# app1 和 app2 可通过容器名互相访问（内建DNS）

# 查看和管理
docker network ls
docker network inspect mynet
docker network connect mynet container1    # 将容器加入网络
docker network disconnect mynet container1 # 从网络断开
```

### 13. 容器间如何通信？

**答：**

```bash
# 1. 同一自定义网络中 → 使用容器名作为域名（推荐）
docker network create mynet
docker run -d --network mynet --name db mysql
docker run -d --network mynet --name app myapp
# 在 app 容器中可以用 "db" 作为主机名连接 MySQL

# 2. 默认 bridge 网络 → 使用 --link（已过时）
docker run -d --name db mysql
docker run -d --link db:database --name app myapp

# 3. 端口映射 → 通过宿主机端口
docker run -d -p 3306:3306 --name db mysql
# 通过 宿主机IP:3306 访问
```

---

## 五、Docker 存储

### 14. Docker 的存储方式有哪些？

**答：**

| 类型 | 说明 | 命令 |
|------|------|------|
| Volume | Docker管理的数据卷，存储在 `/var/lib/docker/volumes/` | `-v mydata:/data` |
| Bind Mount | 挂载宿主机目录到容器 | `-v /host/path:/container/path` |
| tmpfs | 内存中的临时存储 | `--tmpfs /tmp` |

```bash
# Volume（推荐）
docker volume create mydata
docker run -d -v mydata:/app/data myapp
docker volume ls
docker volume inspect mydata
docker volume rm mydata
docker volume prune              # 删除未使用的卷

# Bind Mount
docker run -d -v /opt/config:/app/config:ro myapp  # :ro 只读
docker run -d -v $(pwd):/app myapp                  # 挂载当前目录

# tmpfs
docker run -d --tmpfs /tmp:size=100m myapp
```

### 15. Volume 和 Bind Mount 的区别？

**答：**

| 特性 | Volume | Bind Mount |
|------|--------|------------|
| 管理方式 | Docker 管理 | 用户管理 |
| 存储位置 | `/var/lib/docker/volumes/` | 宿主机任意路径 |
| 可移植性 | 好（Docker 管理，不依赖宿主机目录结构） | 依赖宿主机目录 |
| 权限 | Docker 自动处理 | 可能有权限问题 |
| 备份 | 通过 Docker 命令 | 直接操作文件 |
| 推荐场景 | 生产环境数据持久化 | 开发环境、配置文件 |

---

## 六、Docker Compose

### 16. Docker Compose 是什么？基本语法？

**答：** Docker Compose 是一个定义和运行多容器 Docker 应用的工具，使用 YAML 文件配置应用服务。

```yaml
# docker-compose.yml
version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    image: myapp:latest
    ports:
      - "8080:80"
    environment:
      - DATABASE_URL=postgresql://db:5432/mydb
    volumes:
      - ./app:/app
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - app-net
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - db-data:/var/lib/postgresql/data
    networks:
      - app-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    networks:
      - app-net

volumes:
  db-data:

networks:
  app-net:
    driver: bridge

secrets:
  db_password:
    file: ./secrets/db_password.txt
```

### 17. Docker Compose 常用命令？

**答：**

```bash
docker compose up -d              # 后台启动所有服务
docker compose up -d --build      # 重新构建并启动
docker compose down               # 停止并删除容器、网络
docker compose down -v            # 同时删除卷
docker compose ps                 # 查看服务状态
docker compose logs -f            # 查看所有日志
docker compose logs -f web        # 查看特定服务日志
docker compose exec web bash      # 进入服务容器
docker compose restart web        # 重启服务
docker compose scale web=3        # 扩缩容（旧语法）
docker compose up -d --scale web=3  # 扩缩容（新语法）
docker compose config             # 验证和查看配置
docker compose pull               # 拉取所有服务镜像
```

---

## 七、Docker 安全

### 18. Docker 安全最佳实践有哪些？

**答：**

1. **不以 root 运行容器**
```dockerfile
RUN adduser --disabled-password appuser
USER appuser
```

2. **使用只读文件系统**
```bash
docker run --read-only --tmpfs /tmp myapp
```

3. **限制资源**
```bash
docker run --memory=512m --cpus=1 --pids-limit=100 myapp
```

4. **最小权限原则**
```bash
docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE myapp
```

5. **扫描镜像漏洞**
```bash
docker scout cves myapp:latest
trivy image myapp:latest
```

6. **使用可信基础镜像**
```dockerfile
FROM docker.io/library/python:3.11-slim   # 官方镜像
```

7. **不在镜像中存储密钥**
```bash
# 使用环境变量或 Docker secrets
docker run -e DB_PASSWORD_FILE=/run/secrets/db_pass myapp
```

8. **限制网络访问**
```bash
docker run --network=internal myapp   # 只允许内部通信
```

### 19. Docker 中容器和宿主机的隔离性如何？有什么风险？

**答：**

**隔离机制：**
- Namespace 提供进程、网络、文件系统等隔离
- Cgroup 限制资源使用

**潜在风险：**
- 容器共享宿主机内核 → 内核漏洞可能导致逃逸
- 以 root 运行的容器 → 可能通过漏洞获得宿主机 root 权限
- 特权容器 (`--privileged`) → 几乎无隔离
- 挂载宿主机敏感目录 → 信息泄露

**增强隔离的方案：**
- 使用 rootless Docker
- 使用 gVisor 或 Kata Containers（更强的隔离）
- 开启 AppArmor/SELinux
- 使用 `--security-opt no-new-privileges`

---

## 八、Docker Registry

### 20. 什么是 Docker Registry？如何搭建私有仓库？

**答：** Docker Registry 是存储和分发 Docker 镜像的服务。

**公共 Registry：** Docker Hub、GitHub Container Registry (ghcr.io)、Quay.io

**私有 Registry 搭建：**

```yaml
# docker-compose.yml
version: '3.8'
services:
  registry:
    image: registry:2
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry
    environment:
      REGISTRY_STORAGE_DELETE_ENABLED: "true"

volumes:
  registry-data:
```

```bash
# 推送镜像到私有仓库
docker tag myapp:1.0 localhost:5000/myapp:1.0
docker push localhost:5000/myapp:1.0

# 拉取
docker pull localhost:5000/myapp:1.0

# 企业级方案：Harbor（推荐）
# 支持镜像签名、漏洞扫描、RBAC、镜像复制等
```

---

## 九、生产实践

### 21. Docker 日志管理方案？

**答：**

```bash
# 查看日志驱动
docker info | grep "Logging Driver"

# 配置日志驱动（/etc/docker/daemon.json）
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    }
}

# 常用日志驱动
# json-file  : 默认，JSON格式存储（适合开发）
# syslog     : 发送到 syslog
# journald   : 发送到 systemd journal
# fluentd    : 发送到 Fluentd
# awslogs    : 发送到 AWS CloudWatch
# gelf       : 发送到 Graylog
```

### 22. Docker 在生产环境中的注意事项？

**答：**

1. **镜像管理**：使用固定 tag（不用 latest）、定期扫描漏洞、清理未使用镜像
2. **资源限制**：始终设置 memory 和 CPU 限制
3. **健康检查**：配置 HEALTHCHECK
4. **日志管理**：配置日志大小限制和轮转
5. **数据持久化**：重要数据使用 Volume，定期备份
6. **网络安全**：使用自定义网络，最小化端口暴露
7. **监控**：使用 cAdvisor + Prometheus 监控容器
8. **不在容器中运行多个进程**：一个容器一个进程
9. **使用 docker compose 或 K8s 编排**：不要手动管理容器
10. **配置 daemon.json**：设置存储驱动、日志轮转、镜像加速器等

```json
// /etc/docker/daemon.json 示例
{
    "storage-driver": "overlay2",
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "default-ulimits": {
        "nofile": {
            "Name": "nofile",
            "Hard": 65535,
            "Soft": 65535
        }
    },
    "live-restore": true
}
```
