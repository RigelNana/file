# Docker 基础概念与架构

---

## 1. Docker 是什么？它解决了什么问题？

**回答：**

```
Docker = 基于 Linux 容器技术的应用容器引擎
本质: 将应用及其完整运行环境打包成轻量级、可移植的容器

解决的核心问题:
  1. "在我机器上能跑" → 容器包含完整运行环境，消除环境差异
  2. 资源浪费          → 共享宿主内核，比虚拟机开销小 10-100 倍
  3. 部署效率低        → 秒级启动，镜像即部署单元
  4. 隔离性差          → 进程/网络/文件系统 命名空间隔离
  5. 扩展困难          → 快速水平扩展，一个镜像生成 N 个容器

传统部署 vs 容器部署对比:
  传统: 代码 → 手动配环境 → 部署到不同服务器 → 环境不一致
  容器: 代码 → 构建镜像 → 任何地方 docker run → 一致运行
```

---

## 2. Docker 与虚拟机的区别？

**回答：**

```
┌──────────────────────────────┐  ┌──────────────────────────────┐
│        虚拟机架构             │  │        容器架构               │
├──────────────────────────────┤  ├──────────────────────────────┤
│  App A  │  App B  │  App C  │  │  App A  │  App B  │  App C  │
│  Bins   │  Bins   │  Bins   │  │  Bins   │  Bins   │  Bins   │
│  Libs   │  Libs   │  Libs   │  │  Libs   │  Libs   │  Libs   │
├─────────┼─────────┼─────────┤  ├─────────┴─────────┴─────────┤
│ Guest OS│Guest OS │Guest OS │  │       Container Engine       │
├─────────┴─────────┴─────────┤  ├──────────────────────────────┤
│        Hypervisor           │  │         Host OS              │
├──────────────────────────────┤  ├──────────────────────────────┤
│        Hardware             │  │         Hardware             │
└──────────────────────────────┘  └──────────────────────────────┘
```

| 维度 | Docker 容器 | 虚拟机 |
|------|------------|--------|
| 虚拟化级别 | OS 级（共享内核） | 硬件级（独立内核） |
| 启动速度 | 秒级（<1s） | 分钟级 |
| 镜像大小 | MB 级（10-200MB） | GB 级（1-40GB） |
| 性能 | 接近原生（~98%） | 有虚拟化开销（~70-90%） |
| 隔离性 | 进程级（较弱） | 系统级（强） |
| 密度 | 单机数百个 | 单机数十个 |
| 安全性 | 共享内核有攻击面 | 强隔离更安全 |
| 适用场景 | 微服务、CI/CD、快速部署 | 强隔离、不同OS、遗留系统 |

```
关键面试点:
  容器不是轻量版虚拟机!
  容器 = 受限的进程（使用 Namespace 隔离 + Cgroup 限制资源）
  虚拟机 = 模拟完整硬件，运行独立 OS
```

---

## 3. Docker 的整体架构？

**回答：**

```
Docker 采用 C/S（Client-Server）架构:

                    Docker Client
                   (docker CLI / API)
                         │
                    REST API (Unix Socket / TCP)
                         │
                    Docker Daemon (dockerd)
                    ├── Image Service (镜像管理)
                    ├── Container Service (容器管理)
                    ├── Network Service (网络管理)
                    ├── Volume Service (存储管理)
                    └── Plugin Service (插件管理)
                         │
                    containerd (容器运行时守护进程)
                    ├── 管理容器生命周期
                    ├── 镜像拉取和存储
                    └── 快照管理 (snapshotter)
                         │
                    containerd-shim (每个容器一个)
                    ├── 保持容器运行（即使 containerd 重启）
                    ├── 收集容器退出状态
                    └── 管理 stdin/stdout
                         │
                      runc (OCI 运行时)
                    ├── 创建 Namespace
                    ├── 配置 Cgroup
                    ├── 设置 rootfs
                    └── 启动容器进程
                         │
                    Container Process (容器内 PID 1)
```

### 组件职责详解

| 组件 | 职责 | 进程 |
|------|------|------|
| Docker CLI | 用户接口，发送命令 | docker |
| Docker Daemon | 核心守护进程，管理所有资源 | dockerd |
| containerd | 高级容器运行时，管理生命周期 | containerd |
| containerd-shim | 容器的父进程，使容器脱离 daemon | containerd-shim-runc-v2 |
| runc | 底层容器运行时，创建和启动容器 | 短暂运行后退出 |

```bash
# 验证进程关系
ps aux | grep -E "dockerd|containerd|shim"
# dockerd → containerd → containerd-shim → 容器进程

# runc 只在创建容器时短暂运行
# 容器创建完成后，容器进程的父进程是 containerd-shim
```

---

## 4. Docker 底层的 Linux 技术？

**回答：**

### Namespace（命名空间 — 资源隔离）

```
Linux Namespace 为容器提供隔离视图:

┌──────────────────────────────────────────────────────┐
│ Namespace        │ 隔离的资源           │ 系统调用标志   │
├──────────────────┼───────────────────── ┼──────────────┤
│ PID Namespace    │ 进程 ID              │ CLONE_NEWPID │
│ Network NS       │ 网络栈(IP/端口/路由)  │ CLONE_NEWNET │
│ Mount NS         │ 文件系统挂载点        │ CLONE_NEWNS  │
│ UTS NS           │ 主机名和域名         │ CLONE_NEWUTS │
│ IPC NS           │ 进程间通信           │ CLONE_NEWIPC │
│ User NS          │ 用户和组 ID          │ CLONE_NEWUSER│
│ Cgroup NS        │ Cgroup 根目录视图    │ CLONE_NEWCGR │
│ Time NS (5.6+)   │ 系统时钟             │ CLONE_NEWTIME│
└──────────────────────────────────────────────────────┘
```

```bash
# 查看容器的 Namespace
ls -la /proc/<container-pid>/ns/

# 进入容器的 Namespace
nsenter --target <pid> --mount --uts --ipc --net --pid bash

# 示例: PID Namespace 隔离
# 容器内: PID 1 = 应用进程
# 宿主机: PID 12345 = 同一个进程
```

### Cgroup（控制组 — 资源限制）

```
Cgroup v1 vs v2:
  v1: 每种资源一个层级树（/sys/fs/cgroup/cpu/, /sys/fs/cgroup/memory/）
  v2: 统一层级树（/sys/fs/cgroup/，推荐）

Cgroup 控制的资源:
  ├── cpu       → CPU 使用时间和调度
  ├── cpuset    → 绑定到特定 CPU 核心
  ├── memory    → 内存使用限制（含 OOM 处理）
  ├── blkio/io  → 块设备 I/O 限制
  ├── pids      → 进程数量限制
  ├── net_cls   → 网络流量分类
  └── devices   → 设备访问控制
```

```bash
# Docker 资源限制 → 底层使用 Cgroup 实现
docker run --memory=512m --cpus=1.5 --pids-limit=100 myapp

# 对应 Cgroup v2:
cat /sys/fs/cgroup/docker/<container-id>/memory.max    # 536870912
cat /sys/fs/cgroup/docker/<container-id>/cpu.max       # 150000 100000
cat /sys/fs/cgroup/docker/<container-id>/pids.max      # 100
```

### UnionFS（联合文件系统 — 镜像分层）

```
Docker 使用 UnionFS 实现镜像分层:

当前默认存储驱动: overlay2

overlay2 工作原理:
  ┌─────────────┐
  │ merged view  │  ← 容器看到的统一视图
  ├─────────────┤
  │ upper layer  │  ← 可写层（容器运行时变更）
  ├─────────────┤
  │ lower layers │  ← 只读层（镜像各层叠加）
  └─────────────┘

写时复制 (Copy-on-Write):
  读: 从上往下查找，返回最上层找到的文件
  写: 将 lower 层文件复制到 upper 层，然后修改
  删: 在 upper 层创建 "whiteout" 标记文件
```

---

## 5. OCI 规范？容器运行时的分类？

**回答：**

```
OCI = Open Container Initiative（开放容器倡议）
由 Docker 公司和 CoreOS 于 2015 年成立
目标: 制定容器格式和运行时的开放标准

OCI 三大规范:
  1. Runtime Specification (runtime-spec)
     → 定义如何运行容器（配置文件 config.json）
  2. Image Specification (image-spec)
     → 定义镜像格式（manifest/config/layers）
  3. Distribution Specification (distribution-spec)
     → 定义镜像分发 API（Registry HTTP API）
```

### 容器运行时分层

```
高级运行时 (Container Manager):
  ├── containerd (Docker/K8s 默认)
  ├── CRI-O (K8s 专用, Red Hat)
  └── Podman (无 daemon, Red Hat)

低级运行时 (OCI Runtime):
  ├── runc (默认, Go 实现)
  ├── crun (C 实现, 更快更轻)
  ├── youki (Rust 实现)
  ├── gVisor/runsc (Google, 应用内核沙箱)
  └── Kata Containers (轻量级 VM)

CRI (Container Runtime Interface):
  K8s 与容器运行时的标准接口
  K8s → CRI → containerd/CRI-O → OCI Runtime → 容器

Docker 已移除 dockershim (K8s 1.24):
  旧: K8s → dockershim → Docker → containerd → runc
  新: K8s → CRI → containerd → runc (更短的调用链)
```

---

## 6. Docker 的发展历史与生态？

**回答：**

```
时间线:
  2013    Docker 开源，基于 LXC
  2014    Docker 1.0，引入 libcontainer（替代 LXC）
  2015    OCI 成立，runc 开源
  2016    Docker 1.12 引入 Swarm Mode
  2017    Docker CE/EE 分离，Moby 项目
  2017    containerd 捐赠给 CNCF
  2019    Docker 公司出售企业业务给 Mirantis
  2020    K8s 宣布弃用 dockershim
  2022    Docker Desktop 收费（大企业）
  2023    Docker Scout（镜像安全分析）
  2024    Docker Build Cloud, Docker Debug

Docker 生态全景:
  ┌──────────────────────────────────────────┐
  │              Docker Desktop              │
  │  ┌────────────────────────────────────┐  │
  │  │  Docker Engine                     │  │
  │  │  ├── Docker CLI                    │  │
  │  │  ├── Docker Daemon (dockerd)       │  │
  │  │  ├── Docker Compose                │  │
  │  │  └── Docker BuildKit               │  │
  │  └────────────────────────────────────┘  │
  │  Docker Scout / Docker Init / Debug      │
  └──────────────────────────────────────────┘
  
  外部生态:
    Registry → Docker Hub / Harbor / GHCR / ECR / ACR
    编排     → Kubernetes / Docker Swarm
    替代方案 → Podman / nerdctl / Buildah / Skopeo
```

---

## 7. Docker 的替代方案？Podman vs Docker？

**回答：**

```
┌──────────────┬──────────────────────┬──────────────────────┐
│              │ Docker               │ Podman               │
├──────────────┼──────────────────────┼──────────────────────┤
│ 架构         │ C/S（需要 daemon）   │ 无 daemon（fork/exec）│
│ 运行方式     │ 以 root 运行 daemon  │ Rootless 默认        │
│ 安全性       │ daemon 是攻击面      │ 更安全               │
│ Systemd 集成 │ 手动配置             │ 原生支持 (generate)  │
│ K8s 兼容     │ 需要 CRI 适配       │ 支持生成 K8s YAML    │
│ Compose      │ docker compose       │ podman-compose       │
│ 命令兼容     │ -                    │ alias docker=podman  │
│ 镜像兼容     │ OCI                  │ OCI（完全兼容）      │
│ Swarm        │ ✅ 支持              │ ❌ 不支持            │
│ GUI          │ Docker Desktop       │ Podman Desktop       │
└──────────────┴──────────────────────┴──────────────────────┘
```

```bash
# Podman 常用命令（与 Docker 几乎一致）
podman run -d --name web nginx
podman ps
podman images

# Podman 特有功能
podman generate kube mypod > pod.yaml   # 生成 K8s YAML
podman play kube pod.yaml               # 从 K8s YAML 创建
podman generate systemd --new myapp     # 生成 systemd 服务

# 其他工具
buildah   → 专注于构建 OCI 镜像（不需要 Dockerfile）
skopeo    → 镜像仓库操作（复制、检查、签名）
nerdctl   → containerd 的 Docker 兼容 CLI
```

---

## 8. Docker 的安装与配置？

**回答：**

```bash
# ===== Linux (Ubuntu/Debian) =====
# 添加 Docker 官方源
sudo apt-get update
sudo apt-get install ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list

sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# ===== CentOS/RHEL =====
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo \
  https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install docker-ce docker-ce-cli containerd.io

# 启动
sudo systemctl start docker
sudo systemctl enable docker

# 非 root 用户使用 Docker
sudo usermod -aG docker $USER
newgrp docker
```

### daemon.json 配置

```json
// /etc/docker/daemon.json
{
  "storage-driver": "overlay2",
  "data-root": "/data/docker",
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "registry-mirrors": [
    "https://mirror.example.com"
  ],
  "insecure-registries": ["registry.internal:5000"],
  "default-address-pools": [
    {"base": "172.17.0.0/16", "size": 24}
  ],
  "live-restore": true,
  "userland-proxy": false,
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65535, "Soft": 65535 }
  },
  "exec-opts": ["native.cgroupdriver=systemd"]
}
```

```bash
# 重载配置
sudo systemctl daemon-reload
sudo systemctl restart docker

# 验证
docker info
docker version
```

---

## 9. Docker 的工作流程？从 docker run 到容器启动？

**回答：**

```
docker run nginx 完整流程:

1. Docker CLI 解析命令
   → 构造 API 请求

2. 发送 REST API 到 Docker Daemon
   → POST /containers/create
   → POST /containers/{id}/start

3. Docker Daemon 处理:
   a. 检查本地是否有 nginx 镜像
   b. 没有 → 从 Registry 拉取 (docker pull)
   c. 创建容器配置 (config.json)
   d. 调用 containerd 创建容器

4. containerd:
   a. 创建容器的元数据
   b. 准备 rootfs（基于镜像 snapshot）
   c. 启动 containerd-shim

5. containerd-shim:
   a. 调用 runc create（创建容器）
   b. runc 设置 Namespace/Cgroup/rootfs
   c. runc 启动容器进程后退出
   d. shim 成为容器进程的父进程

6. 容器进程运行
   → nginx master process (PID 1 in container)
   → 持续运行直到停止

关键点:
  runc 只在创建时运行，之后退出
  containerd-shim 保持存在，管理容器 I/O 和退出状态
  即使 Docker Daemon 重启，容器也不受影响（live-restore）
```

---

## 10. Docker Context 与远程管理？

**回答：**

```bash
# Docker Context = 管理多个 Docker 环境的连接配置

# 查看当前 Context
docker context ls

# 创建远程 Context（SSH）
docker context create prod \
  --docker "host=ssh://user@prod-server"

# 创建远程 Context（TCP + TLS）
docker context create staging \
  --docker "host=tcp://staging:2376,ca=ca.pem,cert=cert.pem,key=key.pem"

# 切换 Context
docker context use prod

# 在指定 Context 执行命令
docker --context prod ps

# 删除 Context
docker context rm staging
```

```
使用场景:
  开发者本地管理多个远程 Docker 主机
  ├── default → 本地 Docker
  ├── dev     → 开发服务器
  ├── staging → 预发布环境
  └── prod    → 生产环境

安全注意:
  SSH 方式最安全（推荐）
  TCP 必须配置 TLS 双向认证
  不要暴露未加密的 Docker API (tcp://0.0.0.0:2375)
```
