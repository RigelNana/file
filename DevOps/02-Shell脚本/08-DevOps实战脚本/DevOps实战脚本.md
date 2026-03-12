# DevOps 实战脚本

---

## 1. 如何编写一个标准的自动化部署脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# ============= 配置 =============
readonly APP_NAME="myapp"
readonly DEPLOY_DIR="/opt/$APP_NAME"
readonly BACKUP_DIR="/opt/backups/$APP_NAME"
readonly LOG_FILE="/var/log/${APP_NAME}-deploy.log"
readonly HEALTH_URL="http://localhost:8080/health"
readonly HEALTH_TIMEOUT=60
readonly ROLLBACK_ON_FAIL=true

# ============= 日志 =============
log() { printf "[%s] [%s] %s\n" "$(date '+%F %T')" "$1" "$2" | tee -a "$LOG_FILE" >&2; }
log_info()  { log "INFO" "$*"; }
log_error() { log "ERROR" "$*"; }
log_fatal() { log "FATAL" "$*"; exit 1; }

# ============= 部署 =============
pre_check() {
    log_info "前置检查..."
    command -v docker >/dev/null || log_fatal "Docker 未安装"
    [ -n "${VERSION:-}" ] || log_fatal "VERSION 未设置"
    [ -f "$DEPLOY_DIR/docker-compose.yml" ] || log_fatal "docker-compose.yml 不存在"
}

backup() {
    log_info "备份当前版本..."
    local backup_name="${APP_NAME}_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    cp -r "$DEPLOY_DIR" "$BACKUP_DIR/$backup_name"
    echo "$backup_name" > "$BACKUP_DIR/latest"
    log_info "备份完成: $backup_name"
}

deploy() {
    log_info "部署版本 $VERSION..."
    cd "$DEPLOY_DIR"

    # 更新镜像标签
    sed -i "s|image:.*${APP_NAME}:.*|image: registry.example.com/${APP_NAME}:${VERSION}|" docker-compose.yml

    # 拉取镜像
    docker compose pull

    # 滚动更新
    docker compose up -d --remove-orphans

    log_info "容器启动完成"
}

health_check() {
    log_info "健康检查 (超时: ${HEALTH_TIMEOUT}s)..."
    local elapsed=0
    while ! curl -sf "$HEALTH_URL" > /dev/null 2>&1; do
        if (( elapsed >= HEALTH_TIMEOUT )); then
            log_error "健康检查超时！"
            return 1
        fi
        sleep 2
        (( elapsed += 2 ))
    done
    log_info "健康检查通过 (${elapsed}s)"
}

rollback() {
    log_error "部署失败，执行回滚..."
    local latest
    latest=$(cat "$BACKUP_DIR/latest" 2>/dev/null) || log_fatal "无可用备份"
    cp -r "$BACKUP_DIR/$latest/." "$DEPLOY_DIR/"
    cd "$DEPLOY_DIR"
    docker compose up -d --remove-orphans
    log_info "回滚完成: $latest"
}

main() {
    log_info "====== 开始部署 $APP_NAME v${VERSION:-unknown} ======"

    pre_check
    backup
    deploy

    if ! health_check; then
        if $ROLLBACK_ON_FAIL; then
            rollback
            log_fatal "部署失败，已回滚"
        else
            log_fatal "部署失败"
        fi
    fi

    log_info "====== 部署成功 ======"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
```

---

## 2. 如何编写服务健康检查和监控脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# ============= 配置 =============
declare -A SERVICES=(
    [nginx]="http://localhost:80"
    [api]="http://localhost:8080/health"
    [mysql]="tcp://localhost:3306"
    [redis]="tcp://localhost:6379"
)

ALERT_WEBHOOK="${ALERT_WEBHOOK:-}"
CHECK_INTERVAL=30
FAIL_THRESHOLD=3     # 连续失败 N 次才告警
STATE_DIR="/var/lib/healthcheck"

mkdir -p "$STATE_DIR"

# ============= 检查函数 =============
check_http() {
    local url=$1
    curl -sf --max-time 5 "$url" > /dev/null 2>&1
}

check_tcp() {
    local host=$1 port=$2
    timeout 5 bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null
}

check_service() {
    local name=$1
    local endpoint=$2

    case "$endpoint" in
        http://*|https://*)
            check_http "$endpoint"
            ;;
        tcp://*)
            local addr="${endpoint#tcp://}"
            local host="${addr%%:*}"
            local port="${addr##*:}"
            check_tcp "$host" "$port"
            ;;
        *)
            systemctl is-active --quiet "$endpoint"
            ;;
    esac
}

# ============= 告警 =============
send_alert() {
    local level=$1 title=$2 message=$3
    echo "[$(date '+%F %T')] [$level] $title: $message" >&2

    if [ -n "$ALERT_WEBHOOK" ]; then
        curl -sf -X POST "$ALERT_WEBHOOK" \
            -H "Content-Type: application/json" \
            -d "{\"level\":\"$level\",\"title\":\"$title\",\"message\":\"$message\"}" \
            > /dev/null 2>&1 || true
    fi
}

# ============= 状态管理 =============
get_fail_count() {
    local name=$1
    cat "$STATE_DIR/${name}.fails" 2>/dev/null || echo 0
}

set_fail_count() {
    local name=$1 count=$2
    echo "$count" > "$STATE_DIR/${name}.fails"
}

# ============= 主循环 =============
check_all() {
    local report=""
    local has_failure=false

    for name in "${!SERVICES[@]}"; do
        local endpoint="${SERVICES[$name]}"
        local status="OK"

        if check_service "$name" "$endpoint"; then
            # 恢复：如果之前是故障状态
            local prev_fails
            prev_fails=$(get_fail_count "$name")
            if (( prev_fails >= FAIL_THRESHOLD )); then
                send_alert "RECOVERY" "$name 已恢复" "服务 $name 恢复正常"
            fi
            set_fail_count "$name" 0
        else
            status="FAIL"
            has_failure=true
            local fails
            fails=$(get_fail_count "$name")
            (( fails++ ))
            set_fail_count "$name" "$fails"

            if (( fails == FAIL_THRESHOLD )); then
                send_alert "CRITICAL" "$name 不可用" "连续 $fails 次检查失败"
            fi
        fi

        report+="  $name: $status\n"
    done

    printf "[%s] 健康检查报告:\n%b" "$(date '+%F %T')" "$report"
}

main() {
    echo "健康检查启动 (间隔: ${CHECK_INTERVAL}s)"
    while true; do
        check_all
        sleep "$CHECK_INTERVAL"
    done
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
```

---

## 3. 如何编写数据库备份脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# ============= 配置 =============
DB_TYPE="${DB_TYPE:-mysql}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-root}"
DB_PASS="${DB_PASS:-}"           # 从环境变量或密钥管理获取
DB_NAMES="${DB_NAMES:-all}"      # 逗号分隔的数据库名或 all

BACKUP_DIR="/opt/backups/db"
RETENTION_DAYS=7
COMPRESS=true
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ============= 函数 =============
log() { printf "[%s] %s\n" "$(date '+%F %T')" "$*" >&2; }

backup_mysql() {
    local db=$1
    local output="$BACKUP_DIR/mysql_${db}_${TIMESTAMP}.sql"

    log "备份 MySQL 数据库: $db"

    mysqldump \
        -h "$DB_HOST" \
        -P "$DB_PORT" \
        -u "$DB_USER" \
        ${DB_PASS:+-p"$DB_PASS"} \
        --single-transaction \
        --routines \
        --triggers \
        --events \
        "$db" > "$output"

    if $COMPRESS; then
        gzip "$output"
        output="${output}.gz"
    fi

    log "完成: $output ($(du -h "$output" | cut -f1))"
}

backup_postgresql() {
    local db=$1
    local output="$BACKUP_DIR/pg_${db}_${TIMESTAMP}.sql"

    log "备份 PostgreSQL 数据库: $db"

    PGPASSWORD="$DB_PASS" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -Fc \
        "$db" > "$output"

    log "完成: $output ($(du -h "$output" | cut -f1))"
}

get_databases() {
    if [ "$DB_NAMES" != "all" ]; then
        tr ',' '\n' <<< "$DB_NAMES"
        return
    fi

    case "$DB_TYPE" in
        mysql)
            mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" \
                ${DB_PASS:+-p"$DB_PASS"} -N -e \
                "SHOW DATABASES" | grep -vE '^(information_schema|performance_schema|sys|mysql)$'
            ;;
        postgresql)
            PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" \
                -U "$DB_USER" -t -c \
                "SELECT datname FROM pg_database WHERE datistemplate = false AND datname != 'postgres'"
            ;;
    esac
}

cleanup_old() {
    log "清理 ${RETENTION_DAYS} 天前的备份..."
    find "$BACKUP_DIR" -name "*.sql*" -mtime +"$RETENTION_DAYS" -delete
    local remaining
    remaining=$(find "$BACKUP_DIR" -name "*.sql*" | wc -l)
    log "剩余备份文件数: $remaining"
}

main() {
    mkdir -p "$BACKUP_DIR"
    log "====== 数据库备份开始 ======"
    log "类型=$DB_TYPE 主机=$DB_HOST 保留=${RETENTION_DAYS}天"

    local success=0 fail=0

    while IFS= read -r db; do
        db=$(echo "$db" | xargs)  # trim
        [ -z "$db" ] && continue

        if case "$DB_TYPE" in
            mysql) backup_mysql "$db" ;;
            postgresql) backup_postgresql "$db" ;;
            *) log "不支持的数据库类型: $DB_TYPE"; false ;;
        esac; then
            (( success++ ))
        else
            (( fail++ ))
            log "备份失败: $db"
        fi
    done < <(get_databases)

    cleanup_old

    log "====== 备份完成: 成功=$success 失败=$fail ======"

    (( fail > 0 )) && exit 1
    exit 0
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
```

---

## 4. 如何编写日志分析和报告脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# Nginx Access Log 分析
LOG_FILE="${1:-/var/log/nginx/access.log}"
[ -f "$LOG_FILE" ] || { echo "文件不存在: $LOG_FILE" >&2; exit 1; }

echo "======================================"
echo "  Nginx 日志分析报告"
echo "  文件: $LOG_FILE"
echo "  时间: $(date '+%F %T')"
echo "======================================"

# 总请求数
total=$(wc -l < "$LOG_FILE")
echo ""
echo "📊 概览"
echo "  总请求数: $total"

# 时间范围
first_time=$(head -1 "$LOG_FILE" | grep -oP '\[.*?\]' | tr -d '[]')
last_time=$(tail -1 "$LOG_FILE" | grep -oP '\[.*?\]' | tr -d '[]')
echo "  时间范围: $first_time ~ $last_time"

# Top 10 IP
echo ""
echo "🔝 Top 10 IP 地址"
awk '{print $1}' "$LOG_FILE" | sort | uniq -c | sort -rn | head -10 | \
    awk '{printf "  %-6d %s\n", $1, $2}'

# HTTP 状态码分布
echo ""
echo "📈 HTTP 状态码分布"
awk '{print $9}' "$LOG_FILE" | grep -E '^[0-9]{3}$' | sort | uniq -c | sort -rn | \
    awk -v total="$total" '{
        pct = ($1/total)*100
        printf "  %s: %-8d (%.1f%%)\n", $2, $1, pct
    }'

# Top 10 请求路径
echo ""
echo "🔗 Top 10 请求路径"
awk '{print $7}' "$LOG_FILE" | sort | uniq -c | sort -rn | head -10 | \
    awk '{printf "  %-6d %s\n", $1, $2}'

# 错误请求（4xx/5xx）
errors=$(awk '$9 ~ /^[45][0-9]{2}$/' "$LOG_FILE" | wc -l)
error_pct=$(awk "BEGIN {printf \"%.2f\", ($errors/$total)*100}")
echo ""
echo "⚠️  错误统计"
echo "  4xx/5xx 错误: $errors ($error_pct%)"

# 4xx 详情
echo "  4xx 详情:"
awk '$9 ~ /^4[0-9]{2}$/ {print $9, $7}' "$LOG_FILE" | sort | uniq -c | sort -rn | head -5 | \
    awk '{printf "    %-6d %s %s\n", $1, $2, $3}'

# 5xx 详情
echo "  5xx 详情:"
awk '$9 ~ /^5[0-9]{2}$/ {print $9, $7}' "$LOG_FILE" | sort | uniq -c | sort -rn | head -5 | \
    awk '{printf "    %-6d %s %s\n", $1, $2, $3}'

# 每小时请求分布
echo ""
echo "⏰ 每小时请求分布"
awk -F'[/: ]' '{print $5":00"}' "$LOG_FILE" | sort | uniq -c | \
    awk '{printf "  %s  %-6d ", $2, $1; for(i=0;i<$1/100;i++) printf "█"; printf "\n"}'

# 流量统计
echo ""
echo "📦 流量统计"
total_bytes=$(awk '{sum += $10} END {print sum}' "$LOG_FILE")
if (( total_bytes > 1073741824 )); then
    echo "  总流量: $(awk "BEGIN {printf \"%.2f GB\", $total_bytes/1073741824}")"
elif (( total_bytes > 1048576 )); then
    echo "  总流量: $(awk "BEGIN {printf \"%.2f MB\", $total_bytes/1048576}")"
else
    echo "  总流量: $(awk "BEGIN {printf \"%.2f KB\", $total_bytes/1024}")"
fi
```

---

## 5. 如何编写批量服务器操作脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# ============= 配置 =============
SERVERS_FILE="${SERVERS_FILE:-servers.txt}"
SSH_USER="${SSH_USER:-deploy}"
SSH_OPTS="-o StrictHostKeyChecking=accept-new -o ConnectTimeout=10"
PARALLEL=${PARALLEL:-5}
LOG_DIR="/tmp/batch_$(date +%Y%m%d_%H%M%S)"

mkdir -p "$LOG_DIR"

# ============= 核心函数 =============
run_on_host() {
    local host=$1
    shift
    local cmd="$*"
    local log_file="$LOG_DIR/${host}.log"

    {
        echo "=== $host ==="
        echo "命令: $cmd"
        echo "时间: $(date '+%F %T')"
        echo "---"
    } > "$log_file"

    if ssh $SSH_OPTS "$SSH_USER@$host" "$cmd" >> "$log_file" 2>&1; then
        echo "✓ $host"
        return 0
    else
        echo "✗ $host (退出码: $?)"
        return 1
    fi
}

# 串行执行
run_serial() {
    local cmd="$1"
    local success=0 fail=0

    while IFS= read -r host; do
        host=$(echo "$host" | xargs)
        [[ -z "$host" || "$host" == \#* ]] && continue

        if run_on_host "$host" "$cmd"; then
            (( success++ ))
        else
            (( fail++ ))
        fi
    done < "$SERVERS_FILE"

    echo "结果: 成功=$success 失败=$fail"
}

# 并行执行
run_parallel() {
    local cmd="$1"
    local pids=()
    local hosts=()
    local running=0

    while IFS= read -r host; do
        host=$(echo "$host" | xargs)
        [[ -z "$host" || "$host" == \#* ]] && continue

        # 控制并发数
        while (( running >= PARALLEL )); do
            wait -n 2>/dev/null || true
            (( running-- ))
        done

        run_on_host "$host" "$cmd" &
        pids+=($!)
        hosts+=("$host")
        (( running++ ))
    done < "$SERVERS_FILE"

    # 等待所有完成
    local success=0 fail=0
    for pid in "${pids[@]}"; do
        if wait "$pid"; then
            (( success++ ))
        else
            (( fail++ ))
        fi
    done

    echo "结果: 成功=$success 失败=$fail"
}

# ============= 预置操作 =============
cmd_uptime() {
    run_parallel "uptime"
}

cmd_disk() {
    run_parallel "df -h | grep -E '/$|/home$|/data$'"
}

cmd_deploy() {
    local version=$1
    run_serial "cd /opt/app && git fetch && git checkout $version && ./restart.sh"
}

# ============= 入口 =============
usage() {
    cat <<EOF
用法: $0 <command> [args]

命令:
    exec <cmd>     在所有服务器执行命令
    uptime         检查运行时间
    disk           检查磁盘使用
    deploy <ver>   部署指定版本

选项:
    SERVERS_FILE   服务器列表文件（默认: servers.txt）
    PARALLEL       并行数（默认: 5）
    SSH_USER       SSH 用户名（默认: deploy）

服务器列表格式（servers.txt）:
    192.168.1.10
    192.168.1.11
    # 注释行会被忽略
EOF
}

main() {
    [ -f "$SERVERS_FILE" ] || { echo "服务器列表不存在: $SERVERS_FILE" >&2; exit 1; }

    case "${1:-}" in
        exec)    shift; run_parallel "$*" ;;
        uptime)  cmd_uptime ;;
        disk)    cmd_disk ;;
        deploy)  cmd_deploy "${2:?缺少版本号}" ;;
        *)       usage; exit 1 ;;
    esac

    echo "详细日志: $LOG_DIR/"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
```

---

## 6. 如何编写系统初始化/基线配置脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# 系统初始化脚本（CentOS/RHEL）
[ "$(id -u)" -eq 0 ] || { echo "需要 root 权限" >&2; exit 1; }

log() { echo "[$(date '+%F %T')] $*"; }

# ============= 基础配置 =============
configure_hostname() {
    local hostname=${1:-$(curl -sf http://169.254.169.254/latest/meta-data/hostname || hostname)}
    hostnamectl set-hostname "$hostname"
    log "主机名: $hostname"
}

configure_timezone() {
    timedatectl set-timezone Asia/Shanghai
    timedatectl set-ntp yes
    log "时区: Asia/Shanghai, NTP: 已启用"
}

configure_limits() {
    cat > /etc/security/limits.d/99-custom.conf <<'EOF'
*    soft    nofile    65535
*    hard    nofile    65535
*    soft    nproc     65535
*    hard    nproc     65535
EOF
    log "系统限制已配置"
}

configure_sysctl() {
    cat > /etc/sysctl.d/99-custom.conf <<'EOF'
# 网络优化
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
net.ipv4.tcp_tw_reuse = 1
net.ipv4.tcp_fin_timeout = 10
net.ipv4.tcp_keepalive_time = 600
net.core.netdev_max_backlog = 65535

# 内存
vm.swappiness = 10
vm.overcommit_memory = 1

# 文件
fs.file-max = 2097152
fs.inotify.max_user_watches = 524288
EOF
    sysctl --system > /dev/null 2>&1
    log "内核参数已优化"
}

# ============= 安全加固 =============
configure_ssh() {
    local sshd_config="/etc/ssh/sshd_config"
    cp "$sshd_config" "${sshd_config}.bak"

    sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin prohibit-password/' "$sshd_config"
    sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' "$sshd_config"
    sed -i 's/^#\?MaxAuthTries.*/MaxAuthTries 3/' "$sshd_config"
    sed -i 's/^#\?ClientAliveInterval.*/ClientAliveInterval 300/' "$sshd_config"
    sed -i 's/^#\?ClientAliveCountMax.*/ClientAliveCountMax 2/' "$sshd_config"

    systemctl restart sshd
    log "SSH 安全加固完成"
}

install_packages() {
    yum install -y \
        vim wget curl git \
        htop iotop iftop \
        net-tools lsof strace \
        jq tree tmux \
        > /dev/null 2>&1
    log "基础软件包已安装"
}

create_deploy_user() {
    if ! id deploy > /dev/null 2>&1; then
        useradd -m -s /bin/bash deploy
        mkdir -p /home/deploy/.ssh
        chmod 700 /home/deploy/.ssh
        chown -R deploy:deploy /home/deploy/.ssh
        echo "deploy ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/deploy
        log "deploy 用户已创建"
    else
        log "deploy 用户已存在"
    fi
}

# ============= 主流程 =============
main() {
    log "====== 系统初始化开始 ======"

    configure_hostname "${1:-}"
    configure_timezone
    install_packages
    configure_limits
    configure_sysctl
    configure_ssh
    create_deploy_user

    log "====== 系统初始化完成 ======"
    log "建议重新登录使限制生效"
}

[[ "${BASH_SOURCE[0]}" == "${0}" ]] && main "$@"
```

---

## 7. 如何编写 CI/CD Pipeline 中常用的 Shell 脚本？

**回答：**

### Docker 镜像构建与推送

```bash
#!/bin/bash
set -euo pipefail

# 通常由 CI 系统设置这些环境变量
REGISTRY="${REGISTRY:-registry.example.com}"
IMAGE_NAME="${IMAGE_NAME:-myapp}"
GIT_SHA=$(git rev-parse --short HEAD)
GIT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
VERSION="${VERSION:-${GIT_SHA}}"

# 标签策略
TAGS=("${REGISTRY}/${IMAGE_NAME}:${VERSION}")
TAGS+=("${REGISTRY}/${IMAGE_NAME}:${GIT_SHA}")

if [ "$GIT_BRANCH" = "main" ]; then
    TAGS+=("${REGISTRY}/${IMAGE_NAME}:latest")
fi

# 构建参数
BUILD_ARGS=(
    --build-arg "BUILD_DATE=$BUILD_DATE"
    --build-arg "VERSION=$VERSION"
    --build-arg "GIT_SHA=$GIT_SHA"
)

# 标签参数
TAG_ARGS=()
for tag in "${TAGS[@]}"; do
    TAG_ARGS+=(-t "$tag")
done

echo "构建镜像..."
docker build \
    "${BUILD_ARGS[@]}" \
    "${TAG_ARGS[@]}" \
    --file Dockerfile \
    .

echo "推送镜像..."
for tag in "${TAGS[@]}"; do
    docker push "$tag"
    echo "  已推送: $tag"
done
```

### 版本号管理

```bash
#!/bin/bash
set -euo pipefail

VERSION_FILE="VERSION"
current=$(cat "$VERSION_FILE" 2>/dev/null || echo "0.0.0")

IFS='.' read -r major minor patch <<< "$current"

case "${1:-patch}" in
    major) (( major++ )); minor=0; patch=0 ;;
    minor) (( minor++ )); patch=0 ;;
    patch) (( patch++ )) ;;
    *) echo "用法: $0 {major|minor|patch}" >&2; exit 1 ;;
esac

new_version="${major}.${minor}.${patch}"
echo "$new_version" > "$VERSION_FILE"

git add "$VERSION_FILE"
git commit -m "Bump version to $new_version"
git tag -a "v${new_version}" -m "Release v${new_version}"

echo "版本: $current → $new_version"
```

### 测试运行与覆盖率检查

```bash
#!/bin/bash
set -euo pipefail

MIN_COVERAGE=${MIN_COVERAGE:-80}

echo "运行测试..."
go test -v -race -coverprofile=coverage.out ./... 2>&1 | tee test-output.txt

# 检查测试结果
if grep -q "^FAIL" test-output.txt; then
    echo "❌ 测试失败"
    exit 1
fi

# 覆盖率检查
coverage=$(go tool cover -func=coverage.out | grep total | awk '{print $3}' | tr -d '%')
echo "测试覆盖率: ${coverage}%"

if (( $(echo "$coverage < $MIN_COVERAGE" | bc -l) )); then
    echo "❌ 覆盖率 ${coverage}% 低于最低要求 ${MIN_COVERAGE}%"
    exit 1
fi

echo "✅ 测试通过，覆盖率达标"
```

---

## 8. 如何编写文件同步和备份轮转脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# ============= rsync 增量同步 =============
sync_files() {
    local src=$1
    local dest=$2
    local exclude_file=${3:-}

    local rsync_opts=(
        -avz                    # 归档、详细、压缩
        --delete                # 删除目标多余文件
        --progress              # 显示进度
        --stats                 # 统计信息
        --timeout=300           # 超时
        --human-readable        # 人类可读大小
    )

    if [ -n "$exclude_file" ] && [ -f "$exclude_file" ]; then
        rsync_opts+=(--exclude-from="$exclude_file")
    fi

    rsync "${rsync_opts[@]}" "$src" "$dest"
}

# ============= 备份轮转 =============
# 祖父-父亲-儿子 (GFS) 轮转策略
backup_rotate() {
    local backup_dir=$1
    local daily_keep=${2:-7}
    local weekly_keep=${3:-4}
    local monthly_keep=${4:-6}

    echo "备份轮转策略: 日保留=${daily_keep} 周保留=${weekly_keep} 月保留=${monthly_keep}"

    # 删除过期日备份
    find "$backup_dir/daily" -maxdepth 1 -mtime +"$daily_keep" -exec rm -rf {} + 2>/dev/null || true

    # 每周日的备份升级为周备份
    if [ "$(date +%u)" = "7" ]; then
        local today="$backup_dir/daily/$(date +%Y%m%d)"
        if [ -d "$today" ]; then
            cp -al "$today" "$backup_dir/weekly/$(date +%Y%m%d)"
        fi
    fi
    find "$backup_dir/weekly" -maxdepth 1 -mtime +$((weekly_keep * 7)) -exec rm -rf {} + 2>/dev/null || true

    # 每月1号的备份升级为月备份
    if [ "$(date +%d)" = "01" ]; then
        local today="$backup_dir/daily/$(date +%Y%m%d)"
        if [ -d "$today" ]; then
            cp -al "$today" "$backup_dir/monthly/$(date +%Y%m)"
        fi
    fi
    find "$backup_dir/monthly" -maxdepth 1 -mtime +$((monthly_keep * 30)) -exec rm -rf {} + 2>/dev/null || true

    # 报告
    echo "备份统计:"
    echo "  日备份: $(find "$backup_dir/daily" -maxdepth 1 -mindepth 1 2>/dev/null | wc -l) 份"
    echo "  周备份: $(find "$backup_dir/weekly" -maxdepth 1 -mindepth 1 2>/dev/null | wc -l) 份"
    echo "  月备份: $(find "$backup_dir/monthly" -maxdepth 1 -mindepth 1 2>/dev/null | wc -l) 份"
}
```

---

## 9. 如何编写证书管理和过期监控脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# 检查 SSL 证书过期时间
check_cert_expiry() {
    local host=$1
    local port=${2:-443}
    local warn_days=${3:-30}

    local expiry
    expiry=$(echo | openssl s_client -servername "$host" -connect "$host:$port" 2>/dev/null | \
             openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)

    if [ -z "$expiry" ]; then
        echo "UNKNOWN|$host|无法获取证书"
        return 2
    fi

    local expiry_epoch
    expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$expiry" +%s)
    local now_epoch
    now_epoch=$(date +%s)
    local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

    if (( days_left < 0 )); then
        echo "EXPIRED|$host|已过期 ${days_left#-} 天|$expiry"
        return 1
    elif (( days_left <= warn_days )); then
        echo "WARNING|$host|${days_left} 天后过期|$expiry"
        return 1
    else
        echo "OK|$host|${days_left} 天后过期|$expiry"
        return 0
    fi
}

# 批量检查
check_all_certs() {
    local domains=(
        "example.com"
        "api.example.com"
        "admin.example.com"
    )

    printf "%-30s %-10s %-20s %s\n" "域名" "状态" "剩余天数" "过期时间"
    printf "%s\n" "$(printf '=%.0s' {1..80})"

    local has_warning=false

    for domain in "${domains[@]}"; do
        local result
        result=$(check_cert_expiry "$domain" 443 30) || true

        IFS='|' read -r status host info expiry <<< "$result"
        printf "%-30s %-10s %-20s %s\n" "$host" "$status" "$info" "${expiry:-}"

        if [[ "$status" != "OK" ]]; then
            has_warning=true
        fi
    done

    $has_warning && return 1
    return 0
}

check_all_certs
```

---

## 10. 如何编写环境变量管理和配置渲染脚本？

**回答：**

```bash
#!/bin/bash
set -euo pipefail

# ============= .env 文件加载 =============
load_env() {
    local env_file=$1
    [ -f "$env_file" ] || { echo "文件不存在: $env_file" >&2; return 1; }

    while IFS= read -r line; do
        # 跳过空行和注释
        [[ -z "$line" || "$line" == \#* ]] && continue
        # 跳过格式不正确的行
        [[ "$line" == *=* ]] || continue

        local key="${line%%=*}"
        local value="${line#*=}"
        # 去除引号
        value="${value#\"}"
        value="${value%\"}"
        value="${value#\'}"
        value="${value%\'}"

        export "$key=$value"
    done < "$env_file"
}

# ============= 模板渲染 =============
# 将模板中的 ${VAR} 和 $VAR 替换为环境变量值
render_template() {
    local template=$1
    local output=$2

    # 使用 envsubst（更安全）
    if command -v envsubst > /dev/null; then
        envsubst < "$template" > "$output"
    else
        # 备选：使用 sed
        local content
        content=$(cat "$template")

        # 替换 ${VAR} 格式
        while [[ "$content" =~ \$\{([a-zA-Z_][a-zA-Z_0-9]*)\} ]]; do
            local var_name="${BASH_REMATCH[1]}"
            local var_value="${!var_name:-}"
            content="${content//\$\{$var_name\}/$var_value}"
        done

        echo "$content" > "$output"
    fi

    echo "已渲染: $template → $output"
}

# ============= 使用示例 =============
# load_env ".env.production"
# render_template "templates/nginx.conf.tpl" "/etc/nginx/conf.d/app.conf"
# render_template "templates/docker-compose.tpl" "docker-compose.yml"

# 模板示例 (nginx.conf.tpl):
# server {
#     listen ${NGINX_PORT};
#     server_name ${SERVER_NAME};
#     location / {
#         proxy_pass http://127.0.0.1:${APP_PORT};
#     }
# }

# 多环境配置管理
configure_env() {
    local env=${1:-dev}
    local base_env=".env"
    local env_file=".env.${env}"

    [ -f "$base_env" ] && load_env "$base_env"
    [ -f "$env_file" ] && load_env "$env_file"  # 覆盖基础配置

    echo "环境: $env"
    echo "有效配置:"
    env | grep -E '^(APP_|DB_|REDIS_|NGINX_)' | sort
}
```
