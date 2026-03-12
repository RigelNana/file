# 镜像管理与 Registry

---

## 1. 镜像常用操作命令？

**回答：**

```bash
# ===== 查看镜像 =====
docker images                              # 列出本地镜像
docker images -a                           # 显示所有（含中间层）
docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}"  # 格式化
docker images --filter "dangling=true"     # 悬空镜像
docker image ls --digests                  # 显示摘要

# ===== 拉取镜像 =====
docker pull nginx                          # 默认 latest
docker pull nginx:1.25                     # 指定版本
docker pull nginx@sha256:abc123...         # 指定摘要（最安全）
docker pull --platform linux/arm64 nginx   # 指定平台

# ===== 构建镜像 =====
docker build -t myapp:1.0 .
docker build -t myapp:1.0 -f Dockerfile.prod .
docker build --no-cache -t myapp:1.0 .
docker build --target builder -t myapp:builder .   # 指定多阶段目标
docker build --build-arg VERSION=2.0 .

# ===== 标签管理 =====
docker tag myapp:1.0 myapp:latest
docker tag myapp:1.0 registry.example.com/team/myapp:1.0

# ===== 推送镜像 =====
docker push registry.example.com/team/myapp:1.0
docker push --all-tags registry.example.com/team/myapp  # 推送所有标签

# ===== 检查镜像 =====
docker inspect myapp:1.0                   # 完整元数据 (JSON)
docker history myapp:1.0                   # 构建历史和各层大小
docker history --no-trunc myapp:1.0        # 不截断命令

# ===== 导出导入 =====
docker save -o images.tar myapp:1.0 myapp:2.0   # 导出（保留层和标签）
docker load -i images.tar                         # 导入
docker export mycontainer > container.tar          # 导出容器文件系统
docker import container.tar myimage:imported       # 导入为镜像

# save/load vs export/import:
#   save/load  → 操作镜像，保留完整层和元数据
#   export/import → 操作容器，扁平化文件系统，丢失元数据

# ===== 清理 =====
docker image prune                    # 删除悬空镜像（<none>:<none>）
docker image prune -a                 # 删除所有未使用的镜像
docker image prune -a --filter "until=24h"  # 删除 24h 前未使用的
docker rmi myapp:1.0                  # 删除指定镜像
docker system prune -a                # 清理所有未使用资源
```

---

## 2. 镜像命名规范（Image Reference）？

**回答：**

```
完整格式:
  [registry/][namespace/]repository[:tag|@digest]

示例:
  nginx                          → docker.io/library/nginx:latest
  myuser/myapp:v1                → docker.io/myuser/myapp:v1
  ghcr.io/org/app:latest         → ghcr.io/org/app:latest
  registry.cn-hangzhou.aliyuncs.com/ns/app:1.0

各部分说明:
  registry   → 仓库地址 (默认 docker.io)
  namespace  → 命名空间/组织 (Docker Hub 官方为 library)
  repository → 镜像名称
  tag        → 版本标签 (默认 latest)
  digest     → 内容哈希 (sha256:xxxx, 不可变)
```

### 标签策略

```
生产环境标签最佳实践:

❌ 不要使用:
  myapp:latest    → 含义不明确, 可能随时变化

✅ 推荐使用:
  myapp:1.2.3                  → 语义化版本
  myapp:1.2.3-alpine           → 版本+变体
  myapp:20240315-abc1234       → 日期+commit hash
  myapp:v1.2.3-abc1234         → 版本+commit (推荐)

CI/CD 中自动标签:
  myapp:${GIT_COMMIT_SHA:0:7}  → 短 commit hash
  myapp:${BRANCH_NAME}-${BUILD_NUMBER}  → 分支+构建号
```

---

## 3. Docker Hub 与公共 Registry？

**回答：**

```
主流公共 Registry:

┌─────────────────────┬────────────────────────┬─────────────────┐
│ Registry            │ 地址                    │ 特点             │
├─────────────────────┼────────────────────────┼─────────────────┤
│ Docker Hub          │ docker.io              │ 最大, 官方镜像    │
│ GitHub Container    │ ghcr.io                │ 与 GitHub 集成   │
│ Quay.io             │ quay.io                │ Red Hat, 安全扫描 │
│ AWS ECR Public      │ public.ecr.aws         │ AWS 集成         │
│ Google Artifact Reg │ *-docker.pkg.dev       │ GCP 集成         │
│ Azure ACR           │ *.azurecr.io           │ Azure 集成       │
└─────────────────────┴────────────────────────┴─────────────────┘
```

```bash
# Docker Hub 操作
docker login                     # 登录 Docker Hub
docker push myuser/myapp:1.0    # 推送到 Docker Hub

# GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
docker push ghcr.io/org/myapp:1.0

# AWS ECR
aws ecr get-login-password | docker login --username AWS --password-stdin \
  123456789.dkr.ecr.us-east-1.amazonaws.com
docker push 123456789.dkr.ecr.us-east-1.amazonaws.com/myapp:1.0
```

---

## 4. 私有 Registry 搭建？

**回答：**

### Docker Registry (官方)

```yaml
# docker-compose.yml
services:
  registry:
    image: registry:2
    ports:
      - "5000:5000"
    volumes:
      - registry-data:/var/lib/registry
    environment:
      REGISTRY_STORAGE_DELETE_ENABLED: "true"
      REGISTRY_HTTP_HEADERS_Access-Control-Allow-Origin: '["*"]'

volumes:
  registry-data:
```

```bash
# 使用私有 Registry
docker tag myapp:1.0 localhost:5000/myapp:1.0
docker push localhost:5000/myapp:1.0
docker pull localhost:5000/myapp:1.0

# 查看仓库内容（Registry API）
curl http://localhost:5000/v2/_catalog
curl http://localhost:5000/v2/myapp/tags/list

# 配置非 HTTPS（开发用）
# /etc/docker/daemon.json
# { "insecure-registries": ["registry.internal:5000"] }
```

### 配置 TLS

```yaml
services:
  registry:
    image: registry:2
    ports:
      - "443:443"
    volumes:
      - registry-data:/var/lib/registry
      - ./certs:/certs
    environment:
      REGISTRY_HTTP_ADDR: 0.0.0.0:443
      REGISTRY_HTTP_TLS_CERTIFICATE: /certs/domain.crt
      REGISTRY_HTTP_TLS_KEY: /certs/domain.key
```

---

## 5. Harbor 企业级 Registry？

**回答：**

```
Harbor = VMware 开源的企业级容器 Registry

功能:
  ✅ 基于角色的访问控制 (RBAC)
  ✅ 镜像漏洞扫描 (Trivy)
  ✅ 镜像签名 (Cosign/Notary)
  ✅ 镜像复制 (跨数据中心)
  ✅ 垃圾回收
  ✅ LDAP/AD 集成
  ✅ 审计日志
  ✅ Webhook 通知
  ✅ Proxy Cache (代理缓存 Docker Hub)
  ✅ 配额管理
  ✅ Robot Account (自动化账号)
```

```bash
# 安装 Harbor
wget https://github.com/goharbor/harbor/releases/download/v2.10.0/harbor-offline-installer-v2.10.0.tgz
tar xzf harbor-offline-installer-v2.10.0.tgz
cd harbor

# 编辑配置
cp harbor.yml.tmpl harbor.yml
# 修改: hostname, harbor_admin_password, certificate

# 安装
./install.sh --with-trivy --with-notary

# 使用
docker login harbor.example.com
docker push harbor.example.com/myproject/myapp:1.0
```

### Harbor 关键概念

```
项目 (Project):
  公开项目 → 任何人可拉取
  私有项目 → 需要认证

用户角色:
  系统管理员 → 管理所有项目
  项目管理员 → 管理项目成员和配置
  开发者     → 推送和拉取镜像
  访客       → 只能拉取

Robot Account:
  用于 CI/CD 自动化
  有过期时间
  权限可控（只推/只拉）

镜像复制:
  Push-based → Harbor A 推到 Harbor B
  Pull-based → Harbor B 从 Harbor A 拉
  触发方式: 手动/定时/事件(push/delete)
```

---

## 6. 镜像安全扫描？

**回答：**

```bash
# ===== Trivy（最流行，Aqua Security 开源）=====
# 扫描本地镜像
trivy image myapp:latest

# 扫描并过滤严重级别
trivy image --severity HIGH,CRITICAL myapp:latest

# 只显示可修复的漏洞
trivy image --ignore-unfixed myapp:latest

# JSON 输出（CI 集成用）
trivy image -f json -o results.json myapp:latest

# 扫描 Dockerfile（IaC 扫描）
trivy config Dockerfile

# ===== Docker Scout（Docker 官方）=====
docker scout cves myapp:latest
docker scout recommendations myapp:latest
docker scout quickview myapp:latest

# ===== Grype（Anchore 开源）=====
grype myapp:latest

# ===== Snyk =====
snyk container test myapp:latest
```

### CI/CD 中的自动扫描

```yaml
# GitHub Actions
- name: Trivy scan
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    format: sarif
    output: trivy-results.sarif
    severity: CRITICAL,HIGH
    exit-code: '1'    # 发现高危漏洞时失败

- name: Upload results
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: trivy-results.sarif
```

---

## 7. 镜像签名与信任？

**回答：**

```
镜像签名 = 验证镜像来源和完整性

方案对比:
  Docker Content Trust (DCT/Notary) → Docker 原生，较老
  Cosign (Sigstore)                 → 新标准，推荐
  Notation                          → CNCF 项目，OCI 原生
```

### Cosign（推荐）

```bash
# 安装
go install github.com/sigstore/cosign/v2/cmd/cosign@latest

# 生成密钥对
cosign generate-key-pair
# 生成 cosign.key (私钥) 和 cosign.pub (公钥)

# 签名镜像
cosign sign --key cosign.key registry.example.com/myapp:1.0

# 验证签名
cosign verify --key cosign.pub registry.example.com/myapp:1.0

# Keyless 签名（使用 OIDC，CI/CD 推荐）
cosign sign registry.example.com/myapp:1.0
# 通过 Sigstore 的 Fulcio CA 获取短期证书

# K8s 策略执行（Kyverno / OPA Gatekeeper）
# 只允许部署签名过的镜像
```

### Docker Content Trust

```bash
# 启用 DCT
export DOCKER_CONTENT_TRUST=1

# 推送时自动签名
docker push myregistry/myapp:1.0
# 首次会生成 root key 和 targets key

# 拉取时自动验证
docker pull myregistry/myapp:1.0
# 未签名的镜像会被拒绝
```

---

## 8. 镜像分发与加速？

**回答：**

### 镜像加速器

```json
// /etc/docker/daemon.json
{
  "registry-mirrors": [
    "https://mirror.example.com",
    "https://docker.mirrors.ustc.edu.cn"
  ]
}
```

### Proxy Cache（Harbor）

```
Harbor Proxy Cache:
  配置 Harbor 作为 Docker Hub 的代理缓存
  首次拉取 → 从 Docker Hub 下载并缓存
  后续拉取 → 直接从本地 Harbor 提供

优势:
  1. 减少外网带宽
  2. 加速节点拉取
  3. 避免 Docker Hub 限速
```

### P2P 分发

```
大规模集群镜像分发:

Dragonfly (CNCF):
  P2P 镜像分发系统
  节点间互相传输镜像层，减轻 Registry 压力
  适用: 数百节点同时拉取同一镜像

Kraken (Uber):
  P2P 镜像分发
  支持 Docker 和 OCI 镜像

使用场景:
  大规模 K8s 集群滚动更新
  多节点同时部署新版本
  带宽受限的数据中心
```

---

## 9. 镜像多架构构建（Multi-arch）？

**回答：**

```bash
# 为什么需要多架构?
#   x86 服务器: linux/amd64
#   ARM 服务器: linux/arm64 (AWS Graviton / Apple M系列)
#   IoT 设备: linux/arm/v7

# 创建 builder
docker buildx create --name multiarch --driver docker-container --use

# 构建多平台镜像并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t registry.example.com/myapp:1.0 \
  --push .

# 查看多架构 manifest
docker manifest inspect nginx:latest

# 本地测试其他架构
docker run --platform linux/arm64 nginx
# 需要 QEMU 模拟: docker run --privileged multiarch/qemu-user-static --reset -p yes
```

### Dockerfile 中的多架构处理

```dockerfile
FROM --platform=$BUILDPLATFORM golang:1.22 AS builder
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app
COPY . .
RUN GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -o server .

FROM alpine:3.19
COPY --from=builder /app/server /usr/local/bin/
CMD ["server"]

# Docker 自动设置的变量:
#   BUILDPLATFORM → 构建机器的平台 (如 linux/amd64)
#   TARGETPLATFORM → 目标平台 (如 linux/arm64)
#   TARGETOS → 目标 OS (如 linux)
#   TARGETARCH → 目标架构 (如 arm64)
```

---

## 10. skopeo 镜像管理工具？

**回答：**

```bash
# skopeo = 无需 Docker Daemon 的镜像操作工具
# 功能: 复制、检查、签名、同步镜像

# 检查远程镜像信息（不下载）
skopeo inspect docker://nginx:latest
skopeo inspect --raw docker://nginx:latest  # 原始 manifest

# 复制镜像（Registry 到 Registry，不经过本地）
skopeo copy \
  docker://docker.io/nginx:latest \
  docker://harbor.example.com/library/nginx:latest

# 复制到本地目录
skopeo copy docker://nginx:latest dir:/tmp/nginx-image

# 复制到 OCI 布局
skopeo copy docker://nginx:latest oci:/tmp/nginx-oci:latest

# 批量同步（镜像仓库迁移）
skopeo sync --src docker --dest docker \
  registry.source.com/myapp \
  registry.target.com/myapp

# 删除远程镜像标签
skopeo delete docker://registry.example.com/myapp:old

# 登录
skopeo login registry.example.com

# 对比: skopeo vs docker
#   skopeo → 不需要 daemon, 不拉取整个镜像
#   docker → 需要 daemon, pull 后才能操作
#   skopeo 适合 CI/CD 和脚本自动化
```
