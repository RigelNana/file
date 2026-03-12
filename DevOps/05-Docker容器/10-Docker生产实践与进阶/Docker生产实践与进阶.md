# Docker 生产实践与进阶

---

## 1. CI/CD 中如何使用 Docker？

**回答：**

### GitHub Actions

```yaml
# .github/workflows/build.yml
name: Build and Push
on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - uses: docker/setup-buildx-action@v3

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ghcr.io/${{ github.repository }}:${{ github.sha }}
            ghcr.io/${{ github.repository }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

### GitLab CI

```yaml
# .gitlab-ci.yml
build:
  image: docker:24
  services:
    - docker:24-dind
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
```

### 镜像标签策略

```
main 分支  → latest, v1.2.3
dev 分支   → dev-<commit-sha>
PR 构建    → pr-<number>
Release    → v1.2.3, v1.2, v1

# 不要只用 latest:
#   1. 无法确定具体版本
#   2. 不同节点可能拉取不同镜像
#   3. 无法回滚到确定版本
```

---

## 2. Docker in Docker（DinD）与 Docker out of Docker（DooD）？

**回答：**

```
DinD (Docker in Docker):
  在容器内运行完整的 Docker Daemon

  方式:                         适用场景:
  docker run --privileged       CI/CD 构建环境
    docker:dind                 完全隔离的构建环境

  优点: 完全隔离
  缺点: 需要特权模式(安全风险), 性能差, 缓存不共享

DooD (Docker out of Docker):
  容器挂载宿主机的 Docker Socket

  方式:                         适用场景:
  docker run -v                 CI/CD Runner
    /var/run/docker.sock:       自动化工具
    /var/run/docker.sock        小型编排

  优点: 性能好, 共享镜像缓存
  缺点: 安全风险(可控制宿主机Docker)
       容器内构建的路径映射问题
```

```yaml
# DinD 示例 (Compose)
services:
  dind:
    image: docker:24-dind
    privileged: true
    environment:
      DOCKER_TLS_CERTDIR: /certs
    volumes:
      - docker-certs-ca:/certs/ca
      - docker-certs-client:/certs/client

  builder:
    image: docker:24
    environment:
      DOCKER_HOST: tcp://dind:2376
      DOCKER_TLS_VERIFY: "1"
      DOCKER_CERT_PATH: /certs/client
    volumes:
      - docker-certs-client:/certs/client:ro

# DooD 示例
services:
  runner:
    image: my-ci-runner
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    group_add:
      - "${DOCKER_GID}"    # 宿主机 docker 组的 GID
```

```
替代方案:
  Kaniko   → 无需 Docker Daemon, 用户空间构建
  Buildah  → 无守护进程, rootless 构建
  Podman   → 无守护进程, 兼容 Docker CLI
```

---

## 3. 容器化改造最佳实践？

**回答：**

```
12-Factor App 与容器化:

 因素           容器化实践
 ─────────────  ───────────────────────────
 代码库         一个代码库 → 一个镜像
 依赖           Dockerfile 中声明所有依赖
 配置           环境变量注入, 不硬编码
 后端服务       通过环境变量连接
 构建/发布/运行 CI 构建镜像 → Registry → 运行
 进程           容器=无状态进程, 数据用 Volume
 端口绑定       EXPOSE + 端口映射
 并发           容器编排横向扩展
 快速启停       容器秒级启停
 环境一致       镜像保证, Dev=Staging=Prod
 日志           输出到 stdout/stderr
 管理进程       docker exec 执行一次性任务
```

### 改造步骤

```
1. 评估 → 梳理应用依赖、配置、状态
2. Dockerfile → 编写并优化
3. 存储 → 识别有状态组件, 规划 Volume
4. 网络 → 服务发现, DNS, 端口规划
5. 配置 → 外部化(环境变量/ConfigMap)
6. 日志 → 输出到 stdout, 集中收集
7. 健康检查 → HEALTHCHECK / Probe
8. 优雅关闭 → 处理 SIGTERM
9. CI/CD → 自动构建/推送/部署
10. 监控 → 暴露 metrics, 集成告警
```

---

## 4. Docker Daemon 调优？

**回答：**

```json
// /etc/docker/daemon.json — 生产环境推荐配置
{
  "storage-driver": "overlay2",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5",
    "compress": "true"
  },
  "live-restore": true,
  "default-ulimits": {
    "nofile": {
      "Name": "nofile",
      "Soft": 65536,
      "Hard": 65536
    }
  },
  "max-concurrent-downloads": 10,
  "max-concurrent-uploads": 5,
  "default-runtime": "runc",
  "default-shm-size": "128M",
  "registry-mirrors": [
    "https://mirror.example.com"
  ],
  "insecure-registries": [],
  "debug": false,
  "metrics-addr": "127.0.0.1:9323",
  "experimental": false,
  "features": {
    "buildkit": true
  }
}
```

```bash
# 宿主机内核参数优化
cat >> /etc/sysctl.conf <<EOF
# 网络
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-iptables = 1
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.netfilter.nf_conntrack_max = 1048576

# 文件描述符
fs.file-max = 1000000
fs.inotify.max_user_watches = 524288

# 内存
vm.overcommit_memory = 1
vm.max_map_count = 262144
EOF
sysctl -p

# systemd 优化 Docker 服务
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/override.conf <<EOF
[Service]
LimitNOFILE=1048576
LimitNPROC=infinity
LimitCORE=infinity
TasksMax=infinity
EOF
systemctl daemon-reload
systemctl restart docker
```

---

## 5. 多架构镜像构建？

**回答：**

```bash
# 使用 buildx 构建多架构镜像
# 1. 创建构建器
docker buildx create --name mybuilder --use
docker buildx inspect --bootstrap

# 2. 构建并推送多架构镜像
docker buildx build \
  --platform linux/amd64,linux/arm64,linux/arm/v7 \
  -t registry.example.com/myapp:latest \
  --push .

# 3. 查看多架构清单
docker manifest inspect registry.example.com/myapp:latest
```

```dockerfile
# Dockerfile 中处理架构差异
FROM --platform=$BUILDPLATFORM golang:1.22 AS builder

ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

# 交叉编译
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -o /app/server .

FROM alpine:3.19
COPY --from=builder /app/server /usr/local/bin/
```

```
常见架构:
  linux/amd64   → x86_64, Intel/AMD 服务器
  linux/arm64   → ARM 64-bit, AWS Graviton / Apple M 系列
  linux/arm/v7  → ARM 32-bit, 树莓派

注意:
  1. 某些包可能不支持所有架构
  2. 基础镜像需支持目标架构
  3. 交叉编译比 QEMU 模拟快得多
  4. CI 中 QEMU 构建较慢, 考虑原生构建节点
```

---

## 6. Docker Swarm？

**回答：**

```
Docker Swarm 是 Docker 内置的容器编排工具

Swarm vs Kubernetes:
  维度        Swarm                 Kubernetes
  ──────────  ────────────────────  ──────────────────────
  复杂度      简单, 快速上手        复杂, 学习曲线陡
  扩展性      中小规模 (<100节点)   大规模 (数千节点)
  生态        Docker 原生           CNCF, 生态丰富
  社区        活跃度下降            非常活跃
  适用场景    小团队, 简单编排      企业级, 微服务

现状:
  Docker Swarm 已不再积极开发
  生产环境建议使用 Kubernetes
  小型项目可用 Docker Compose + 单机部署
```

```bash
# Swarm 基本操作
docker swarm init --advertise-addr <manager-ip>
docker swarm join --token <token> <manager-ip>:2377

# 创建服务
docker service create \
  --name web \
  --replicas 3 \
  --publish 80:80 \
  --update-delay 10s \
  --update-parallelism 1 \
  nginx:latest

# 管理
docker service ls
docker service scale web=5
docker service update --image nginx:1.25 web
docker node ls
```

---

## 7. 容器运行时选型？

**回答：**

```
容器运行时生态:

高级运行时 (Container Engine):
  ┌──────────────────────────────────────────────┐
  │  Docker Engine (dockerd + containerd)         │
  │  Podman (无守护进程, rootless)                │
  │  CRI-O (K8s 专用, 轻量)                      │
  ├──────────────────────────────────────────────┤
  │  containerd (工业标准, K8s 默认)              │
  ├──────────────────────────────────────────────┤
  │  低级运行时: runc / crun / gVisor / Kata      │
  └──────────────────────────────────────────────┘

对比:
  运行时      特点                     适用
  ──────────  ───────────────────────  ──────────
  Docker      功能完整, 开发友好       开发/测试
  containerd  轻量, K8s 默认           生产 K8s
  CRI-O       K8s 专用, 最小化         纯 K8s
  Podman      无 daemon, rootless      安全敏感
  gVisor      内核级隔离, 系统调用拦截  多租户
  Kata        VM 级隔离, 硬件虚拟化    强隔离需求
```

---

## 8. 从 Docker 迁移到 Kubernetes？

**回答：**

```
迁移路径:

Docker Compose → Kubernetes

1. 工具转换:
   kompose convert -f docker-compose.yml
   → 生成 Deployment, Service, PVC 等 YAML

2. 概念映射:
   Docker Compose          Kubernetes
   ─────────────           ──────────────
   docker-compose.yml      Deployment + Service
   services                Pod (Deployment)
   ports                   Service (ClusterIP/NodePort/LB)
   volumes                 PVC + StorageClass
   networks                NetworkPolicy
   environment             ConfigMap / Secret
   depends_on              initContainers / readiness
   deploy.replicas         spec.replicas + HPA
   healthcheck             livenessProbe / readinessProbe
   restart: always         restartPolicy: Always
   logging                 Fluentd DaemonSet

3. 需要额外配置:
   - Ingress (替代端口映射)
   - RBAC (替代 Docker 用户权限)
   - ResourceQuota / LimitRange
   - Horizontal Pod Autoscaler (HPA)
   - Pod Disruption Budget (PDB)

4. 镜像变化:
   不需要修改镜像, K8s 使用相同的 OCI 镜像
```

---

## 9. Rootless Docker 与 Podman 生产使用？

**回答：**

### Rootless Docker

```bash
# 安装
curl -fsSL https://get.docker.com/rootless | sh

# 配置环境
export PATH=$HOME/bin:$PATH
export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/docker.sock

# 限制:
#   不能绑定 <1024 端口 (可用 sysctl 允许)
#   某些存储驱动不支持
#   不支持某些网络功能
#   AppArmor/SELinux 可能需要调整

# 允许低端口:
sudo sysctl net.ipv4.ip_unprivileged_port_start=80
```

### Podman

```bash
# Podman 命令兼容 Docker
alias docker=podman

podman run -d --name web -p 8080:80 nginx
podman ps
podman logs web

# Podman Compose
pip install podman-compose
podman-compose up -d

# Podman 生成 systemd 服务
podman generate systemd --new --name web > ~/.config/systemd/user/web.service
systemctl --user enable --now web

# Podman 生成 Kubernetes YAML
podman generate kube web > web.yaml
podman play kube web.yaml

# Podman vs Docker:
#   ✅ 无守护进程 (每个容器独立进程)
#   ✅ 默认 rootless
#   ✅ 兼容 Docker CLI
#   ✅ 支持 Pod (类 Kubernetes)
#   ❌ Docker Compose 兼容性不完美
#   ❌ 某些 CI/CD 工具不原生支持
```

---

## 10. Docker 生产部署检查清单？

**回答：**

```
Docker 生产环境 Checklist:

[ 基础设施 ]
  □ 使用 overlay2 存储驱动
  □ 独立磁盘挂载 /var/lib/docker
  □ 文件系统使用 xfs (ftype=1) 或 ext4
  □ 配置内核参数 (ip_forward, conntrack)
  □ 限制 Docker 守护进程远程访问
  □ 启用 live-restore

[ 镜像 ]
  □ 使用固定标签 (不用 latest)
  □ 最小化基础镜像 (alpine/distroless)
  □ 多阶段构建
  □ 镜像安全扫描 (Trivy/Scout)
  □ 镜像签名
  □ 私有 Registry + 访问控制

[ 容器运行 ]
  □ 非 root 用户运行
  □ 只读根文件系统 --read-only
  □ 不使用 --privileged
  □ 限制 Capabilities (drop ALL, add 需要的)
  □ 资源限制 (--memory, --cpus)
  □ 健康检查
  □ 优雅关闭 (处理 SIGTERM)
  □ 重启策略 (unless-stopped)

[ 网络 ]
  □ 自定义网络 (不用默认 bridge)
  □ 只暴露必要端口
  □ 禁用 ICC (--icc=false) 非必要
  □ 配置 DOCKER-USER iptables 链

[ 存储 ]
  □ Volume 用于持久数据
  □ 定期备份 Volume
  □ 配置日志轮转 (max-size, max-file)
  □ 定期清理 (docker system prune)

[ 监控 ]
  □ 容器资源监控 (cAdvisor/Prometheus)
  □ 日志集中收集 (EFK/Loki)
  □ Docker 事件告警
  □ 磁盘空间告警

[ CI/CD ]
  □ 自动构建 + 推送
  □ 镜像测试 (container-structure-test)
  □ 滚动更新策略
  □ 回滚方案
```
