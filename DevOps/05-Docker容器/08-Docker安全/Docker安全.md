# Docker 安全

---

## 1. Docker 安全威胁模型？

**回答：**

```
Docker 安全的攻击面:

┌────────────────────────────────────────────┐
│                应用层                       │
│  应用漏洞、依赖漏洞、注入攻击               │
├────────────────────────────────────────────┤
│                镜像层                       │
│  恶意镜像、过时基础镜像、嵌入密钥            │
├────────────────────────────────────────────┤
│                容器运行时                    │
│  特权容器、容器逃逸、资源滥用               │
├────────────────────────────────────────────┤
│                Docker Daemon                │
│  Docker API 暴露、root 权限                 │
├────────────────────────────────────────────┤
│                宿主机/内核                   │
│  内核漏洞、宿主机配置不当                   │
└────────────────────────────────────────────┘

核心风险:
  1. 容器逃逸 → 攻击者从容器突破到宿主机
  2. 镜像投毒 → 使用了包含恶意代码的镜像
  3. 密钥泄露 → 密码/密钥写入了镜像层
  4. 特权提升 → 容器内提权到 root
  5. 资源耗尽 → 容器占用所有 CPU/内存/磁盘
```

---

## 2. 容器运行时安全配置？

**回答：**

```bash
# ===== 最小权限运行 =====
docker run -d \
  --user 1000:1000 \                  # 非 root 用户
  --read-only \                       # 只读文件系统
  --tmpfs /tmp:size=100m \            # 可写的临时目录
  --cap-drop ALL \                    # 去除所有 capabilities
  --cap-add NET_BIND_SERVICE \        # 只添加需要的能力
  --security-opt no-new-privileges \  # 禁止提权
  --security-opt apparmor=docker-default \  # AppArmor 策略
  --pids-limit 100 \                  # 限制进程数
  --memory 512m \                     # 限制内存
  --cpus 1 \                          # 限制 CPU
  myapp
```

### Linux Capabilities

```
传统: root 有所有权限, 非 root 没有
Capabilities: 将 root 权限拆分为细粒度单元

Docker 默认保留的 capabilities:
  CHOWN, DAC_OVERRIDE, FOWNER, FSETID, KILL,
  SETGID, SETUID, SETPCAP, NET_BIND_SERVICE,
  NET_RAW, SYS_CHROOT, MKNOD, AUDIT_WRITE, SETFCAP

安全做法: 去除所有，只添加需要的
  --cap-drop ALL
  --cap-add NET_BIND_SERVICE   # 绑定 <1024 端口
  --cap-add SYS_PTRACE         # 调试用（慎用）

危险的 capabilities:
  SYS_ADMIN    → 几乎等于 root
  SYS_PTRACE   → 可调试其他进程
  NET_ADMIN    → 修改网络配置
  DAC_READ_SEARCH → 绕过文件权限
```

---

## 3. 不以 root 运行容器？

**回答：**

```dockerfile
# ===== Dockerfile 中配置非 root 用户 =====

# Debian/Ubuntu
FROM python:3.11-slim
RUN groupadd -r appgroup && \
    useradd -r -g appgroup -d /app -s /sbin/nologin appuser
WORKDIR /app
COPY --chown=appuser:appgroup . .
USER appuser
CMD ["python", "app.py"]

# Alpine
FROM node:20-alpine
RUN addgroup -S appgroup && \
    adduser -S appuser -G appgroup
WORKDIR /app
COPY --chown=appuser:appgroup . .
USER appuser
CMD ["node", "app.js"]

# distroless（自带非 root 用户）
FROM gcr.io/distroless/python3
COPY . /app
USER nonroot
CMD ["app.py"]
```

```bash
# 运行时指定用户
docker run -u 1000:1000 myapp
docker run -u nobody myapp

# 验证
docker exec myapp whoami
docker exec myapp id
```

```
为什么不用 root？
  1. 容器内 root = 宿主机 root（未开启 User Namespace 时）
  2. 如果容器逃逸，攻击者直接获得宿主机 root
  3. root 可以修改容器内所有文件
  4. root 保留更多 capabilities

注意: 一些操作需要 root:
  绑定 <1024 端口 → 用 NET_BIND_SERVICE capability 替代
  安装系统包     → 在构建阶段 (RUN) 用 root，运行时切换
```

---

## 4. Docker 特权模式的危险？

**回答：**

```bash
# --privileged = 容器获得宿主机几乎所有权限
docker run --privileged myapp

# 特权容器拥有:
#   所有 capabilities
#   所有设备访问 (/dev/*)
#   可以修改宿主机内核参数
#   可以挂载宿主机文件系统
#   AppArmor/SELinux 策略被禁用
```

```bash
# 特权容器逃逸示例（绝对不要在生产使用!）
docker run --privileged -it alpine sh
# 容器内:
mkdir /mnt/host
mount /dev/sda1 /mnt/host    # 挂载宿主机磁盘
chroot /mnt/host              # 切换到宿主机文件系统
# 现在你就是宿主机的 root!
```

```
替代特权模式的方案:

需要访问设备:
  --device /dev/fuse           # 只暴露需要的设备

需要特定内核功能:
  --cap-add SYS_ADMIN           # 只添加需要的 capability

需要修改网络:
  --cap-add NET_ADMIN

Docker-in-Docker (DinD):
  ❌ --privileged
  ✅ 使用 Docker Socket 挂载（也有风险）
  ✅ 使用 Sysbox（安全的容器嵌套运行时）
  ✅ 使用 Kaniko/Buildah（不需要 Docker daemon）
```

---

## 5. Docker Daemon 安全？

**回答：**

```
Docker Daemon 以 root 运行
  → 控制 Docker Daemon = 控制宿主机

保护 Docker Daemon:

1. 不要暴露 TCP API（或必须配置 TLS）
   ❌ dockerd -H tcp://0.0.0.0:2375     # 任何人可控制
   ✅ dockerd -H tcp://0.0.0.0:2376 \
        --tlsverify \
        --tlscacert=ca.pem \
        --tlscert=server-cert.pem \
        --tlskey=server-key.pem

2. Docker Socket 安全
   /var/run/docker.sock → 谁能访问就能控制所有容器
   
   ❌ docker run -v /var/run/docker.sock:/var/run/docker.sock myapp
   # 容器可以创建新的特权容器，实现逃逸
   
   # 如果必须挂载:
   ✅ 使用只读: -v /var/run/docker.sock:/var/run/docker.sock:ro
   ✅ 使用 Docker Socket Proxy 限制 API

3. Docker 用户组
   docker 组的用户 = 等同于 root
   限制谁能加入 docker 组

4. Rootless Docker
   Docker Daemon 以非 root 运行
   即使被攻击也不会影响宿主机
```

### Rootless Docker

```bash
# 安装 Rootless Docker
dockerd-rootless-setuptool.sh install

# 特点:
#   Docker Daemon 以普通用户运行
#   使用 User Namespace（容器 root = 宿主机普通用户）
#   不需要 sudo

# 限制:
#   不支持某些存储驱动
#   端口 < 1024 需要额外配置
#   性能略有影响
```

---

## 6. 安全策略: Seccomp、AppArmor、SELinux？

**回答：**

### Seccomp（系统调用过滤）

```json
// 自定义 Seccomp 配置
{
  "defaultAction": "SCMP_ACT_ERRNO",
  "architectures": ["SCMP_ARCH_X86_64"],
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "fstat",
                "mmap", "mprotect", "munmap", "brk", "exit_group"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}
```

```bash
# Docker 默认启用 Seccomp，禁止约 44 个危险系统调用
# 禁止的包括: mount, reboot, sethostname, init_module 等

# 使用自定义 Seccomp 配置
docker run --security-opt seccomp=custom.json myapp

# 禁用 Seccomp（不推荐）
docker run --security-opt seccomp=unconfined myapp
```

### AppArmor

```bash
# Docker 默认使用 docker-default AppArmor 配置
# 限制: 文件访问、网络、挂载、信号等

# 查看当前配置
docker inspect -f '{{.AppArmorProfile}}' myapp

# 使用自定义配置
docker run --security-opt apparmor=my-custom-profile myapp

# 生成配置模板
aa-genprof /usr/bin/my-app
```

### SELinux

```bash
# CentOS/RHEL 上使用 SELinux
docker run --security-opt label=type:svirt_apache_t myapp

# Volume 标签
docker run -v /data:/data:z myapp     # 共享标签
docker run -v /data:/data:Z myapp     # 私有标签
```

---

## 7. 镜像安全最佳实践？

**回答：**

```dockerfile
# ===== 安全 Dockerfile 模板 =====

# 1. 使用官方/可信基础镜像
FROM python:3.11-slim
# 或更安全: gcr.io/distroless/python3

# 2. 固定版本（不用 latest）
# ✅ python:3.11.8-slim-bookworm
# ❌ python:latest

# 3. 使用摘要锁定（最安全）
# FROM python@sha256:abc123...

# 4. 扫描基础镜像漏洞
# trivy image python:3.11-slim

# 5. 最小化安装
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        curl && \
    rm -rf /var/lib/apt/lists/*

# 6. 不在镜像中存储密钥
# ❌ COPY .env /app/
# ❌ ENV DB_PASSWORD=secret123
# ❌ RUN echo "password" > /app/config
# ✅ 运行时注入: docker run -e DB_PASSWORD=xxx
# ✅ 使用 Docker Secrets

# 7. 使用 BuildKit Secret Mount
# RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci

# 8. 设置非 root 用户
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# 9. 标签声明
LABEL org.opencontainers.image.source="https://github.com/org/repo"
LABEL org.opencontainers.image.description="My secure app"
```

### 检测密钥泄露

```bash
# 检查镜像历史（密钥可能在中间层）
docker history --no-trunc myapp:latest

# 使用工具扫描
trivy image myapp:latest                    # 漏洞 + 密钥
gitleaks detect --source .                  # 源码中的密钥
docker scout cves myapp:latest              # Docker Scout

# CI/CD 中自动扫描
# GitHub Actions: trivy-action
# GitLab CI: container_scanning
```

---

## 8. Docker Secrets？

**回答：**

```yaml
# Docker Secrets = 安全的密钥管理

# Docker Compose 中使用 Secrets
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

  web:
    image: myapp
    secrets:
      - source: api_key
        target: /run/secrets/api_key
        uid: '1000'
        gid: '1000'
        mode: 0400

secrets:
  db_password:
    file: ./secrets/db_password.txt            # 从文件
  api_key:
    environment: API_KEY_ENV                    # 从环境变量
```

```
Secrets 工作原理:
  1. Secret 内容挂载到容器的 /run/secrets/<name>
  2. 以 tmpfs 方式挂载（内存中，不写入磁盘）
  3. 只有指定的容器可以访问

Docker Swarm 的 Secrets:
  → 加密存储在 Raft 日志中
  → 通过 TLS 传输到节点
  → 以 tmpfs 挂载到容器

Compose 的 Secrets:
  → 简化版，从文件或环境变量读取
  → 以 bind mount 挂载到容器

应用需要支持 *_FILE 模式:
  POSTGRES_PASSWORD_FILE=/run/secrets/db_password
  → Postgres 官方镜像支持
  → 自定义应用需要自己实现
```

---

## 9. 容器逃逸及防护？

**回答：**

```
容器逃逸 = 攻击者从容器内部突破到宿主机

常见逃逸路径:

1. 特权容器
   --privileged → 挂载宿主机设备 → chroot
   防护: 不使用 --privileged

2. 危险挂载
   -v /:/host → 直接访问宿主机文件系统
   -v /var/run/docker.sock → 控制 Docker
   防护: 最小化挂载, 只读

3. 内核漏洞
   共享内核 → 内核漏洞可导致逃逸
   CVE-2019-5736 (runc 漏洞)
   CVE-2020-15257 (containerd 漏洞)
   防护: 及时更新内核和 Docker

4. 危险 capabilities
   SYS_ADMIN → 可以 mount
   SYS_PTRACE → 可以注入其他进程
   防护: cap-drop ALL

5. 信息泄露
   /proc, /sys 暴露宿主机信息
   防护: 合适的 AppArmor/Seccomp 策略
```

### 防护措施汇总

```bash
# 运行时防护
docker run -d \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --cap-add NET_BIND_SERVICE \
  --security-opt no-new-privileges \
  --security-opt apparmor=docker-default \
  --security-opt seccomp=default \
  --pids-limit 100 \
  --memory 512m \
  --cpus 1 \
  --network mynet \
  myapp

# 宿主机防护
# 1. 使用 Rootless Docker
# 2. 启用 User Namespace Remapping
# 3. 保持 Docker/内核更新
# 4. 使用 gVisor/Kata Containers（强隔离）

# 策略执行
# OPA/Gatekeeper → K8s 策略
# Kyverno → K8s 策略
# Falco → 运行时安全监控
```

---

## 10. Docker 安全扫描与合规？

**回答：**

### CIS Docker Benchmark

```bash
# CIS (Center for Internet Security) Docker 安全基准

# 使用 Docker Bench for Security 自动检查
docker run --rm --net host --pid host \
  --userns host --cap-add audit_control \
  -v /etc:/etc:ro \
  -v /var/lib:/var/lib:ro \
  -v /var/run/docker.sock:/var/run/docker.sock:ro \
  docker/docker-bench-security

# 检查项目包括:
#   1. 宿主机配置
#   2. Docker Daemon 配置
#   3. Docker Daemon 配置文件
#   4. 容器镜像和构建
#   5. 容器运行时
#   6. Docker 安全操作
#   7. Docker Swarm 配置
```

### 运行时安全监控

```bash
# Falco (CNCF) — 运行时异常检测
# 基于系统调用监控容器行为

# 检测规则示例:
#   容器内执行 shell
#   敏感文件被读取 (/etc/shadow)
#   网络连接到异常地址
#   文件系统改变
#   权限提升

# 安装
helm install falco falcosecurity/falco \
  --set falcosidekick.enabled=true

# 告警输出: Slack, PagerDuty, Kafka, Elasticsearch
```

### 安全扫描工具链

```
开发阶段:
  Hadolint       → Dockerfile lint
  Trivy config   → IaC 扫描
  pre-commit     → 密钥检测 (gitleaks)

构建阶段:
  Trivy/Grype    → 镜像漏洞扫描
  Docker Scout   → 镜像分析
  Cosign         → 镜像签名

部署阶段:
  OPA/Kyverno    → 准入策略
  Notary/Cosign  → 签名验证

运行时:
  Falco          → 异常检测
  Sysdig         → 监控
  Aqua/Prisma    → 商业方案 (全生命周期)
```
