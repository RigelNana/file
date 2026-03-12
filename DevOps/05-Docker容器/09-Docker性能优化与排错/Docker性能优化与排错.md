# Docker 性能优化与排错

---

## 1. Docker 性能监控？

**回答：**

```bash
# ===== docker stats — 实时资源监控 =====
docker stats
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"

# 输出:
# NAME     CPU %   MEM USAGE / LIMIT   NET I/O          BLOCK I/O
# web      2.50%   128MiB / 512MiB     1.2kB / 648B     0B / 0B
# db       5.30%   256MiB / 1GiB       2.1kB / 1.3kB    4MB / 12MB

# ===== docker top — 容器内进程 =====
docker top myapp
docker top myapp -eo pid,ppid,user,%cpu,%mem,cmd

# ===== docker inspect — 详细信息 =====
docker inspect -f '{{.State.Pid}}' myapp        # PID
docker inspect -f '{{.HostConfig.Memory}}' myapp # 内存限制
docker inspect -f '{{.State.OOMKilled}}' myapp   # 是否被 OOM Kill
```

### cAdvisor + Prometheus + Grafana

```yaml
# docker-compose.yml — 容器监控栈
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:latest
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin
```

```yaml
# prometheus.yml
scrape_configs:
  - job_name: cadvisor
    scrape_interval: 5s
    static_configs:
      - targets: ['cadvisor:8080']
```

---

## 2. 容器 CPU 性能问题排查？

**回答：**

```bash
# 1. 查看 CPU 使用率
docker stats --format "table {{.Name}}\t{{.CPUPerc}}"

# 2. 容器内详细查看
docker exec myapp top -bn1
docker exec myapp ps aux --sort=-%cpu | head

# 3. 宿主机层面查看
# 容器进程的 PID
PID=$(docker inspect -f '{{.State.Pid}}' myapp)
# 查看进程 CPU 使用
top -p $PID
# 查看进程的线程
top -H -p $PID

# 4. perf 分析（需要 SYS_ADMIN）
docker run --cap-add SYS_PTRACE --security-opt seccomp=unconfined \
  myapp-debug
docker exec myapp perf top

# 5. 检查 CPU 限制是否导致 throttling
# Cgroup v2
cat /sys/fs/cgroup/docker/<container-id>/cpu.stat
# nr_throttled → 被限流的次数
# throttled_time → 被限流的总时间（纳秒）

# 诊断:
#   CPUPerc > 100%  → 使用了多个核心
#   nr_throttled 高 → CPU 限制太紧，考虑增加 --cpus
#   CPU 100% 持续   → 应用可能有死循环或性能问题
```

---

## 3. 容器内存问题排查？

**回答：**

```bash
# 1. 查看内存使用
docker stats --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"

# 2. 检查 OOM Kill
docker inspect -f '{{.State.OOMKilled}}' myapp
# true = 容器因内存不足被杀

# 查看 dmesg 中的 OOM 日志
dmesg | grep -i "oom\|out of memory"

# 3. 容器内内存详情
docker exec myapp cat /proc/meminfo
docker exec myapp cat /sys/fs/cgroup/memory.current     # cgroup v2
docker exec myapp cat /sys/fs/cgroup/memory.max

# 4. 内存泄漏排查
# Java
docker exec myapp jmap -heap <pid>
docker exec myapp jcmd <pid> GC.heap_info

# Node.js
docker exec myapp node --inspect=0.0.0.0:9229 app.js
# 使用 Chrome DevTools 分析内存

# Python
# 使用 memory_profiler, objgraph, tracemalloc

# 5. 内存限制调优
docker update --memory=1g --memory-swap=2g myapp

# 常见内存问题:
#   Java: JVM 不识别容器限制 → 使用 -XX:MaxRAMPercentage=75
#   Node.js: 默认 V8 堆较小 → --max-old-space-size=768
#   内存泄漏 → 使用 profiling 工具定位
```

---

## 4. 容器磁盘和 IO 排查？

**回答：**

```bash
# 1. 查看容器磁盘使用
docker system df
docker system df -v            # 详细

# 2. 容器文件系统变更
docker diff myapp

# 3. 查看容器可写层大小
docker inspect -f '{{.SizeRw}}' myapp

# 4. 容器内磁盘使用
docker exec myapp df -h
docker exec myapp du -sh /app/*

# 5. 查看 IO 统计
docker stats --format "table {{.Name}}\t{{.BlockIO}}"

# 6. 详细 IO 分析
# Cgroup v2
cat /sys/fs/cgroup/docker/<container-id>/io.stat

# 7. overlay2 问题
# 查看 overlay2 使用情况
du -sh /var/lib/docker/overlay2/*
# 清理
docker system prune -a --volumes

# 常见磁盘问题:
#   日志文件持续增长 → 配置 log-opts: max-size, max-file
#   容器可写层过大 → RUN 中清理临时文件
#   Volume 数据堆积 → 定期清理: docker volume prune
#   overlay2 目录过大 → docker system prune
```

---

## 5. 容器网络性能排查？

**回答：**

```bash
# 1. 网络连通性
docker exec myapp ping -c 3 target-host
docker exec myapp curl -v http://service:8080
docker exec myapp nc -zv db 5432

# 2. DNS 排查
docker exec myapp nslookup service-name
docker exec myapp cat /etc/resolv.conf
# DNS 解析慢 → 检查 DNS 服务器配置

# 3. 网络性能测试
# 使用 iperf3
docker run -d --network mynet --name iperf-server networkstatic/iperf3 -s
docker run --rm --network mynet networkstatic/iperf3 -c iperf-server

# 4. 抓包分析
docker exec myapp tcpdump -i eth0 -nn port 80 -c 100
# 或使用 netshoot:
docker run --rm --network container:myapp nicolaka/netshoot \
  tcpdump -i eth0 -nn

# 5. 连接数查看
docker exec myapp ss -s
docker exec myapp ss -tlnp

# 6. conntrack 表满
sysctl net.netfilter.nf_conntrack_count      # 当前
sysctl net.netfilter.nf_conntrack_max        # 最大值
# 如果接近上限:
sysctl -w net.netfilter.nf_conntrack_max=1048576

# 性能优化:
#   bridge 模式 → 禁用 userland-proxy
#   高吞吐 → 使用 host 模式
#   overlay → 注意 VXLAN 开销
```

---

## 6. 构建性能优化？

**回答：**

```dockerfile
# 1. 利用缓存（变化少的层放前面）
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# 2. 合并 RUN 减少层数
RUN apt-get update && \
    apt-get install -y pkg && \
    rm -rf /var/lib/apt/lists/*

# 3. 使用 BuildKit 并行构建
DOCKER_BUILDKIT=1 docker build .

# 4. BuildKit 缓存挂载
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt
RUN --mount=type=cache,target=/root/.npm npm ci

# 5. 使用多阶段构建
FROM golang:1.22 AS builder
RUN go build -o /app/server .
FROM alpine:3.19
COPY --from=builder /app/server /usr/local/bin/

# 6. 使用 .dockerignore
# 排除不需要的文件，减少构建上下文
```

```bash
# 7. 使用远程缓存
docker build \
  --cache-from=registry.example.com/myapp:cache \
  --cache-to=type=registry,ref=registry.example.com/myapp:cache \
  .

# 8. 并行构建多个镜像
docker compose build --parallel

# 9. 使用 Docker Build Cloud
docker buildx build --builder cloud-org-builder .

# 构建耗时分析:
docker build --progress=plain . 2>&1 | tee build.log
# 查看每一步的耗时
```

---

## 7. Docker 常见问题排查？

**回答：**

### 容器无法启动

```bash
# 查看退出原因
docker inspect -f '{{.State.ExitCode}}' myapp
docker inspect -f '{{.State.Error}}' myapp
docker logs myapp

# 常见退出码:
#   0   → 正常退出
#   1   → 应用错误
#   127 → 命令未找到 (CMD/ENTRYPOINT 路径错误)
#   137 → SIGKILL (OOM Kill 或 docker kill)
#   139 → SIGSEGV (段错误)
#   143 → SIGTERM (docker stop)

# 排查步骤:
docker run -it myapp bash              # 交互式启动调试
docker run -it --entrypoint bash myapp # 覆盖 ENTRYPOINT
```

### 容器运行但服务不可用

```bash
# 1. 检查端口映射
docker port myapp

# 2. 检查服务是否监听正确地址
docker exec myapp ss -tlnp
docker exec myapp netstat -tlnp
# 确保监听 0.0.0.0 而不是 127.0.0.1

# 3. 检查健康状态
docker inspect -f '{{json .State.Health}}' myapp | jq

# 4. 检查日志
docker logs -f myapp

# 5. 检查防火墙
iptables -L -n | grep <port>
ufw status
```

### 磁盘空间不足

```bash
# 查看 Docker 磁盘使用
docker system df

# 清理
docker system prune -a --volumes

# 大文件定位
du -sh /var/lib/docker/*
du -sh /var/lib/docker/overlay2/* | sort -rh | head

# 日志文件过大
truncate -s 0 /var/lib/docker/containers/<id>/<id>-json.log
# 根本解决: 配置 log-opts max-size
```

---

## 8. Docker 日志最佳实践？

**回答：**

```
原则: 容器应将日志输出到 stdout/stderr

好处:
  1. docker logs 可直接查看
  2. 日志驱动统一收集
  3. 编排平台（K8s）可自动收集
  4. 无需在容器内配置日志框架

应用配置:
  Nginx  → daemon off; (已默认到 stdout)
  Python → logging 输出到 stderr
  Java   → log4j/logback 输出到 console
  Node.js → console.log (已默认)
```

### 日志收集架构

```
方案 1: EFK/ELK
  容器 stdout → Docker 日志驱动
    → Fluentd/Filebeat
    → Elasticsearch
    → Kibana

方案 2: Loki
  容器 stdout → Docker Loki 驱动
    → Grafana Loki
    → Grafana

方案 3: 文件+Sidecar
  应用 → /var/log/app.log (共享 Volume)
  Filebeat Sidecar → Elasticsearch
```

```json
// 生产日志配置
// /etc/docker/daemon.json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "5",
    "compress": "true",
    "labels": "app,env",
    "tag": "{{.Name}}/{{.ID}}"
  }
}
```

---

## 9. overlay2 存储优化？

**回答：**

```bash
# overlay2 是 Docker 默认存储驱动
# 存储位置: /var/lib/docker/overlay2/

# 查看总大小
du -sh /var/lib/docker/overlay2/

# 查看各层大小（找出大层）
du -sh /var/lib/docker/overlay2/* | sort -rh | head -20

# 优化措施:

# 1. 定期清理
docker system prune -a        # 删除未使用的镜像/容器/网络
docker volume prune            # 删除未使用的卷
docker builder prune           # 删除构建缓存

# 2. 镜像优化（减少层数和大小）
#    多阶段构建, 合并 RUN, 清理缓存

# 3. 修改数据目录（磁盘不够时）
# /etc/docker/daemon.json
{
  "data-root": "/data/docker"
}
# 迁移:
systemctl stop docker
rsync -a /var/lib/docker/ /data/docker/
systemctl start docker

# 4. 文件系统优化
#    推荐 xfs with ftype=1
#    mkfs.xfs -n ftype=1 /dev/sdb1

# 5. Live Restore（重启 Docker 不影响容器）
{
  "live-restore": true
}
```

---

## 10. Docker Debug 工具与技巧？

**回答：**

```bash
# ===== Docker Debug (Docker Desktop 内置) =====
docker debug myapp
# 进入容器的调试 shell（即使容器没有 shell）
# 基于 busybox，带有 vim, curl, htop 等工具

# ===== nsenter (Linux) =====
# 直接进入容器的命名空间
PID=$(docker inspect -f '{{.State.Pid}}' myapp)
nsenter -t $PID -m -u -i -n -p bash
# 即使容器没有 shell 也能进入
# -m mount, -u UTS, -i IPC, -n net, -p pid

# ===== netshoot (网络调试) =====
docker run --rm --network container:myapp nicolaka/netshoot
# 工具包: tcpdump, dig, nslookup, curl, iperf, ss, ip, nmap

# ===== 调试容器 overlay =====
# 查看容器的 overlay 挂载点
docker inspect -f '{{.GraphDriver.Data.MergedDir}}' myapp
ls /var/lib/docker/overlay2/<id>/merged/

# ===== strace 系统调用跟踪 =====
docker run --cap-add SYS_PTRACE myapp-debug
docker exec myapp strace -f -p 1
# 或从宿主机:
strace -f -p $(docker inspect -f '{{.State.Pid}}' myapp)

# ===== 临时调试容器 =====
# 复制容器配置但覆盖入口
docker commit myapp myapp:debug
docker run -it --entrypoint bash myapp:debug

# ===== 检查容器文件系统 =====
# 不启动容器，直接查看镜像内容
docker create --name temp myapp
docker cp temp:/app/config.yml ./
docker rm temp

# ===== Docker events =====
docker events                          # 实时监控 Docker 事件
docker events --filter type=container  # 只看容器事件
docker events --since "2024-01-01"
```
