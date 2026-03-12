# Docker 存储与数据持久化

---

## 1. Docker 存储的三种方式？

**回答：**

```
┌────────────────────────────────────────────┐
│                  Container                 │
│                                            │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Volume   │  │Bind Mount│  │  tmpfs   │  │
│  │ /data    │  │ /config  │  │  /tmp    │  │
│  └────┬─────┘  └────┬─────┘  └──────────┘  │
└───────┼──────────────┼──────────────────────┘
        │              │
        ↓              ↓
  Docker 管理       宿主机目录
  /var/lib/docker/  /opt/config/
  volumes/mydata/

三种存储方式:
  Volume      → Docker 管理，推荐生产使用
  Bind Mount  → 挂载宿主机目录，开发环境常用
  tmpfs       → 内存中，重启即失
```

| 特性 | Volume | Bind Mount | tmpfs |
|------|--------|------------|-------|
| 存储位置 | Docker 管理 | 宿主机任意路径 | 内存 |
| 持久性 | ✅ 持久 | ✅ 持久 | ❌ 容器停止即失 |
| 跨容器共享 | ✅ | ✅ | ❌ |
| 可移植性 | ✅ 好 | ❌ 依赖宿主机 | ❌ |
| 权限问题 | Docker 处理 | 可能有问题 | 无 |
| 性能 | 好 | 好 | 最好 |
| 备份 | Docker 命令 | 直接文件操作 | 不需要 |
| 驱动支持 | ✅ 支持远程存储 | ❌ | ❌ |

---

## 2. Volume 详解？

**回答：**

```bash
# ===== Volume 管理 =====
docker volume create mydata           # 创建
docker volume ls                      # 列表
docker volume inspect mydata          # 详情
docker volume rm mydata               # 删除
docker volume prune                   # 清理所有未使用的 Volume

# ===== 使用 Volume =====
# 命名卷
docker run -d -v mydata:/app/data myapp
docker run -d --mount source=mydata,target=/app/data myapp

# 匿名卷（不推荐，名称是随机哈希）
docker run -d -v /app/data myapp

# 只读挂载
docker run -d -v mydata:/app/data:ro myapp
docker run -d --mount source=mydata,target=/app/data,readonly myapp
```

### -v vs --mount

```bash
# -v 语法: source:target[:options]
docker run -v mydata:/data:ro myapp

# --mount 语法: type=volume,source=...,target=...,readonly
docker run --mount type=volume,source=mydata,target=/data,readonly myapp

# 区别:
#   -v → 如果 source 不存在会自动创建
#   --mount → 如果 source 不存在会报错
#   --mount 语法更明确，推荐在生产配置中使用
```

### Volume 存储位置

```bash
# 默认存储位置
ls /var/lib/docker/volumes/mydata/_data/

# 修改默认存储位置
# /etc/docker/daemon.json
# { "data-root": "/data/docker" }
# → Volume 位于 /data/docker/volumes/
```

---

## 3. Bind Mount 详解？

**回答：**

```bash
# Bind Mount = 将宿主机目录直接挂载到容器

# -v 语法
docker run -d -v /opt/config:/app/config myapp
docker run -d -v $(pwd):/app myapp             # 挂载当前目录
docker run -d -v /opt/config:/app/config:ro myapp  # 只读

# --mount 语法
docker run -d --mount type=bind,source=/opt/config,target=/app/config myapp

# 挂载单个文件
docker run -d -v /host/nginx.conf:/etc/nginx/nginx.conf:ro nginx
```

### 常见问题

```bash
# 1. 权限问题
docker run -v /host/data:/data myapp
# 容器内用户 UID 可能与宿主机不匹配

# 解决:
docker run -v /host/data:/data -u $(id -u):$(id -g) myapp  # 指定 UID
# 或在 Dockerfile 中:
RUN adduser --uid 1000 appuser
USER appuser

# 2. SELinux 问题 (RHEL/CentOS)
docker run -v /host/data:/data:z myapp    # 共享标签
docker run -v /host/data:/data:Z myapp    # 私有标签

# 3. 空目录覆盖
# 如果挂载到容器内已有内容的目录，容器内容会被隐藏
docker run -v /empty-dir:/usr/share/nginx/html nginx
# nginx 默认页面被空目录覆盖!

# 4. Windows 路径
docker run -v "C:\Users\app:/app" myapp
docker run -v //c/Users/app:/app myapp    # Git Bash
```

---

## 4. tmpfs 存储？

**回答：**

```bash
# tmpfs = 内存中的临时文件系统
# 容器停止后数据消失
# 不写入宿主机文件系统

docker run -d --tmpfs /tmp myapp
docker run -d --tmpfs /tmp:size=100m,noexec myapp

# --mount 语法
docker run -d \
  --mount type=tmpfs,target=/tmp,tmpfs-size=100m,tmpfs-mode=1777 \
  myapp

# 选项:
#   size    → 大小限制（默认无限）
#   mode    → 文件系统权限
#   noexec  → 不允许执行
#   nosuid  → 不允许 setuid
```

```
tmpfs 使用场景:
  1. 敏感数据（密码/密钥）→ 不落盘
  2. 临时缓存            → 高性能
  3. Session 数据        → 不需要持久化
  4. 构建缓存            → 加速

注意:
  容器重启后数据丢失
  不能在容器间共享
  受内存大小限制
```

---

## 5. 存储驱动（Storage Driver）？

**回答：**

```
存储驱动管理镜像层和容器可写层

推荐: overlay2（Docker 默认）

┌──────────────┬──────────────┬────────────┬──────────────┐
│ 存储驱动     │ 后端文件系统 │ 性能       │ 状态          │
├──────────────┼──────────────┼────────────┼──────────────┤
│ overlay2     │ xfs/ext4     │ 好         │ 推荐（默认）  │
│ fuse-overlayfs│ 任意        │ 较好       │ Rootless 用   │
│ btrfs        │ btrfs        │ 好         │ 原生支持      │
│ zfs          │ zfs          │ 好         │ 原生支持      │
│ devicemapper │ 直接lvm      │ 中等       │ 已弃用        │
│ vfs          │ 任意         │ 差（无CoW）│ 测试用        │
│ aufs         │ ext4/xfs     │ 中等       │ 已弃用        │
└──────────────┴──────────────┴────────────┴──────────────┘
```

```bash
# 查看当前存储驱动
docker info | grep "Storage Driver"

# 配置存储驱动
# /etc/docker/daemon.json
{
  "storage-driver": "overlay2",
  "storage-opts": [
    "overlay2.override_kernel_check=true"
  ]
}

# overlay2 对文件系统的要求:
#   推荐 xfs (d_type=true)
#   ext4 也可以
#   检查: xfs_info /var/lib/docker | grep ftype
#   ftype=1 表示支持 d_type
```

---

## 6. Volume 驱动（Volume Driver）？

**回答：**

```
Volume 驱动 = 使用不同后端存储 Volume 数据

默认驱动: local（本地文件系统）

第三方驱动:
  ┌───────────────┬──────────────────────────────┐
  │ 驱动          │ 后端存储                      │
  ├───────────────┼──────────────────────────────┤
  │ local         │ 本地文件系统（默认）            │
  │ nfs           │ NFS 共享存储                   │
  │ rexray        │ AWS EBS/Azure Disk/GCE PD      │
  │ portworx      │ Portworx 分布式存储            │
  │ flocker       │ Flocker 容器数据管理            │
  │ convoy        │ 支持多后端的统一驱动            │
  │ ceph/rbd      │ Ceph 分布式存储                │
  │ glusterfs     │ GlusterFS 分布式文件系统        │
  └───────────────┴──────────────────────────────┘
```

```bash
# 使用 NFS Volume
docker volume create \
  --driver local \
  --opt type=nfs \
  --opt o=addr=192.168.1.100,rw \
  --opt device=:/shared/data \
  nfs-data

docker run -d -v nfs-data:/data myapp

# CIFS/SMB Volume
docker volume create \
  --driver local \
  --opt type=cifs \
  --opt device=//192.168.1.100/share \
  --opt o=username=user,password=pass \
  smb-data
```

---

## 7. 数据备份与恢复？

**回答：**

```bash
# ===== 备份 Volume =====
# 方案 1: 使用临时容器打包
docker run --rm \
  -v mydata:/source:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/mydata-backup.tar.gz -C /source .

# 方案 2: 直接复制 volume 目录
cp -a /var/lib/docker/volumes/mydata/_data/ /backup/

# ===== 恢复 Volume =====
# 创建新 Volume 并恢复
docker volume create mydata-restored

docker run --rm \
  -v mydata-restored:/target \
  -v $(pwd):/backup \
  alpine sh -c "cd /target && tar xzf /backup/mydata-backup.tar.gz"

# ===== 迁移 Volume（跨主机）=====
# 源主机:
docker run --rm -v mydata:/source:ro -v /tmp:/backup \
  alpine tar czf /backup/mydata.tar.gz -C /source .
scp /tmp/mydata.tar.gz target-host:/tmp/

# 目标主机:
docker volume create mydata
docker run --rm -v mydata:/target -v /tmp:/backup \
  alpine sh -c "cd /target && tar xzf /backup/mydata.tar.gz"

# ===== 数据库备份 =====
# PostgreSQL
docker exec db pg_dump -U postgres mydb > backup.sql
docker exec db pg_dumpall -U postgres > all-backup.sql

# MySQL
docker exec db mysqldump -u root -p mydb > backup.sql

# Redis
docker exec redis redis-cli BGSAVE
docker cp redis:/data/dump.rdb ./
```

---

## 8. Docker 数据持久化最佳实践？

**回答：**

```
1. 使用命名 Volume（不用匿名卷）
   ✅ docker run -v mydata:/data
   ❌ docker run -v /data

2. 数据目录统一规划
   /data/docker/volumes/    → Volume 存储
   /data/docker/volumes/mysql/
   /data/docker/volumes/redis/

3. 备份策略
   ├── 数据库: 使用数据库自带的备份工具
   ├── 文件: 定时打包 Volume
   └── 配置: 版本控制管理

4. 敏感数据
   ├── 密码/密钥 → Docker Secrets + tmpfs
   ├── 配置文件 → Bind Mount (只读)
   └── 环境变量 → docker run -e (运行时注入)

5. 开发 vs 生产
   开发:
     Bind Mount + 热重载
     -v $(pwd)/src:/app/src

   生产:
     命名 Volume
     -v app-data:/app/data
     镜像内包含代码（不挂载源码）

6. 不要把什么都放 Volume
   ✅ 持久化的: 数据库数据、用户上传、日志
   ❌ 不需要的: 临时文件、缓存、依赖包
```

---

## 9. Docker 中的数据库持久化？

**回答：**

```yaml
# docker-compose.yml — 典型数据库持久化

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: mydb
      POSTGRES_USER: user
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    volumes:
      - pg-data:/var/lib/postgresql/data       # 数据目录
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql  # 初始化脚本
    secrets:
      - db_password

  mysql:
    image: mysql:8
    environment:
      MYSQL_ROOT_PASSWORD_FILE: /run/secrets/mysql_root_password
      MYSQL_DATABASE: mydb
    volumes:
      - mysql-data:/var/lib/mysql
      - ./my.cnf:/etc/mysql/conf.d/my.cnf:ro

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes      # 开启 AOF 持久化
    volumes:
      - redis-data:/data

  mongodb:
    image: mongo:7
    volumes:
      - mongo-data:/data/db
      - mongo-config:/data/configdb

volumes:
  pg-data:
  mysql-data:
  redis-data:
  mongo-data:
  mongo-config:

secrets:
  db_password:
    file: ./secrets/db_password.txt
  mysql_root_password:
    file: ./secrets/mysql_root_password.txt
```

```
各数据库数据目录:
  PostgreSQL → /var/lib/postgresql/data
  MySQL      → /var/lib/mysql
  Redis      → /data
  MongoDB    → /data/db
  Elasticsearch → /usr/share/elasticsearch/data

注意:
  这些目录必须持久化（Volume），否则容器重建数据全丢!
```

---

## 10. 容器与宿主机的文件权限问题？

**回答：**

```
问题:
  容器内运行用户的 UID/GID 与宿主机的 UID/GID 不匹配
  导致文件读写权限错误

示例:
  容器内 appuser UID=1000
  宿主机 developer UID=1001
  → 容器写入的文件，宿主机用户没有权限
  → 宿主机文件，容器内用户无法读写
```

### 解决方案

```bash
# 方案 1: 指定运行时 UID/GID
docker run -u $(id -u):$(id -g) -v /host/data:/data myapp
# 容器进程以当前宿主机用户运行

# 方案 2: Dockerfile 中创建匹配的用户
RUN groupadd -g 1000 appgroup && \
    useradd -u 1000 -g appgroup appuser
USER appuser

# 方案 3: 修改宿主机目录权限
chown -R 1000:1000 /host/data

# 方案 4: fixuid（开发环境）
# 自动调整容器内用户 UID 匹配宿主机
# https://github.com/boxboat/fixuid

# 方案 5: User Namespace Remapping
# /etc/docker/daemon.json
{
  "userns-remap": "default"
}
# Docker 将容器内 UID 0 映射到宿主机的高位 UID
# 即使容器内是 root，宿主机上也是非特权用户

# 方案 6: 使用 init 脚本动态调整
#!/bin/bash
# entrypoint.sh
if [ "$(id -u)" = "0" ]; then
  usermod -u ${HOST_UID:-1000} appuser
  groupmod -g ${HOST_GID:-1000} appgroup
  exec gosu appuser "$@"
fi
exec "$@"
```
