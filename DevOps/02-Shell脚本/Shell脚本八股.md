# Shell 脚本八股文

---

## 一、Shell 基础

### 1. 什么是 Shell？常见的 Shell 有哪些？

**答：** Shell 是用户与操作系统内核之间的命令行解释器，接收用户输入的命令并将其转换为系统调用。

| Shell | 特点 |
|-------|------|
| sh (Bourne Shell) | 最早的 Shell，所有 Unix 系统都有 |
| bash (Bourne Again Shell) | 最常用，Linux 默认 Shell |
| zsh (Z Shell) | 功能丰富，macOS 默认 Shell |
| fish | 用户友好，自动补全强大 |
| dash | 轻量级，Debian/Ubuntu 中 /bin/sh 指向 dash |
| ksh (Korn Shell) | 商业 Unix 系统中常见 |

```bash
# 查看当前 Shell
echo $SHELL
echo $0

# 查看系统支持的 Shell
cat /etc/shells

# 切换默认 Shell
chsh -s /bin/zsh
```

### 2. Shell 脚本的基本结构是什么？

**答：**

```bash
#!/bin/bash
# Shebang 行指定解释器

# 脚本描述注释
# Author: xxx
# Date: 2024-01-01
# Description: 示例脚本

# 设置严格模式（推荐）
set -euo pipefail

# 变量定义
NAME="DevOps"

# 函数定义
greet() {
    echo "Hello, $1!"
}

# 主逻辑
greet "$NAME"

# 退出码
exit 0
```

**`set -euo pipefail` 详解：**
- `-e`：遇到错误立即退出
- `-u`：使用未定义变量时报错
- `-o pipefail`：管道中任一命令失败则整个管道失败

### 3. 如何执行 Shell 脚本？有什么区别？

**答：**

```bash
# 方式一：直接执行（需要执行权限）
chmod +x script.sh
./script.sh

# 方式二：指定解释器执行（不需要执行权限）
bash script.sh
sh script.sh

# 方式三：source 执行（在当前 Shell 环境中执行）
source script.sh
. script.sh
```

**关键区别：**
- `./script.sh` 和 `bash script.sh`：启动子 Shell 执行，脚本中的变量和环境变更不影响父 Shell
- `source script.sh`：在当前 Shell 中执行，变量和环境变更会保留（常用于加载配置文件）

---

## 二、变量

### 4. Shell 变量有哪些类型？

**答：**

```bash
# 1. 局部变量（当前 Shell）
name="DevOps"
echo $name
echo ${name}     # 推荐使用花括号

# 2. 环境变量（子进程可继承）
export MY_VAR="value"
env              # 查看所有环境变量

# 3. 特殊变量
$0      # 脚本名称
$1-$9   # 位置参数
$#      # 参数个数
$@      # 所有参数（分别引用）
$*      # 所有参数（整体引用）
$?      # 上一条命令的退出码（0成功，非0失败）
$$      # 当前进程 PID
$!      # 最近一个后台进程的 PID

# 4. 只读变量
readonly PI=3.14
PI=3.15  # 报错

# 5. 删除变量
unset name
```

### 5. `$@` 和 `$*` 的区别？

**答：**

```bash
#!/bin/bash
# 假设调用方式: ./test.sh "hello world" foo bar

# 不加引号时，$@ 和 $* 效果相同，都按空格分割
for arg in $@; do echo "$arg"; done
# hello world foo bar 每个词独立

# 加引号时区别明显：
for arg in "$@"; do echo "$arg"; done
# "hello world" "foo" "bar" —— 保持原始参数边界

for arg in "$*"; do echo "$arg"; done
# "hello world foo bar" —— 所有参数合并为一个字符串
```

**结论：** 遍历参数时始终使用 `"$@"`。

### 6. Shell 的字符串操作有哪些？

**答：**

```bash
str="Hello, DevOps World!"

# 获取长度
echo ${#str}               # 20

# 截取子串
echo ${str:7:6}            # DevOps（从位置7开始，取6个字符）

# 删除匹配（从左边）
echo ${str#*,}             # " DevOps World!"（删除到第一个逗号）
echo ${str##*o}            # "rld!"（贪婪匹配，删除到最后一个o）

# 删除匹配（从右边）
echo ${str%o*}             # "Hello, DevOps W"（从右边删除到第一个o）
echo ${str%%o*}            # "Hell"（贪婪匹配）

# 替换
echo ${str/DevOps/SRE}     # "Hello, SRE World!"（替换第一个）
echo ${str//o/O}           # "HellO, DevOps WOrld!"（替换所有）

# 默认值
echo ${undefined:-default}  # 变量未定义时使用默认值
echo ${undefined:=default}  # 变量未定义时赋默认值并使用
echo ${undefined:?error}    # 变量未定义时报错退出
```

---

## 三、流程控制

### 7. if 条件判断的写法？

**答：**

```bash
# 基本语法
if [ condition ]; then
    commands
elif [ condition ]; then
    commands
else
    commands
fi

# [[ ]] 是增强版，支持正则和逻辑运算符
if [[ "$str" =~ ^[0-9]+$ ]]; then
    echo "是数字"
fi
```

**常用条件判断：**

```bash
# 字符串比较
[ "$a" = "$b" ]        # 等于
[ "$a" != "$b" ]       # 不等于
[ -z "$a" ]            # 字符串为空
[ -n "$a" ]            # 字符串非空

# 数值比较
[ "$a" -eq "$b" ]      # 等于
[ "$a" -ne "$b" ]      # 不等于
[ "$a" -gt "$b" ]      # 大于
[ "$a" -ge "$b" ]      # 大于等于
[ "$a" -lt "$b" ]      # 小于
[ "$a" -le "$b" ]      # 小于等于

# 文件判断
[ -f file ]            # 是普通文件
[ -d dir ]             # 是目录
[ -e path ]            # 存在
[ -r file ]            # 可读
[ -w file ]            # 可写
[ -x file ]            # 可执行
[ -s file ]            # 文件大小大于0
[ file1 -nt file2 ]   # file1 比 file2 新

# 逻辑运算
[ cond1 ] && [ cond2 ]  # 与
[ cond1 ] || [ cond2 ]  # 或
[ ! condition ]          # 非
[[ cond1 && cond2 ]]    # [[ ]] 中可以直接用 && ||
```

### 8. 循环语句有哪些？

**答：**

```bash
# for 循环
for i in 1 2 3 4 5; do
    echo "$i"
done

# C 风格 for 循环
for ((i=0; i<10; i++)); do
    echo "$i"
done

# 遍历文件
for file in /var/log/*.log; do
    echo "Processing: $file"
done

# 遍历命令输出
for user in $(cat /etc/passwd | cut -d: -f1); do
    echo "$user"
done

# while 循环
count=0
while [ $count -lt 5 ]; do
    echo "$count"
    ((count++))
done

# 逐行读取文件（推荐方式）
while IFS= read -r line; do
    echo "$line"
done < file.txt

# until 循环（条件为假时执行）
until [ $count -ge 5 ]; do
    echo "$count"
    ((count++))
done

# 循环控制
break       # 跳出循环
continue    # 跳过当前迭代
```

### 9. case 语句怎么写？

**答：**

```bash
case "$1" in
    start)
        echo "Starting service..."
        ;;
    stop)
        echo "Stopping service..."
        ;;
    restart|reload)
        echo "Restarting service..."
        ;;
    status)
        echo "Service status..."
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
        ;;
esac
```

---

## 四、函数

### 10. Shell 函数如何定义和调用？

**答：**

```bash
# 定义方式一
function greet() {
    local name="$1"    # local 声明局部变量
    echo "Hello, $name!"
    return 0           # 返回值只能是 0-255 的整数
}

# 定义方式二
greet() {
    local name="$1"
    echo "Hello, $name!"
}

# 调用
greet "DevOps"

# 获取返回值
greet "World"
echo $?         # 获取退出码

# 获取函数输出
result=$(greet "World")
echo "$result"   # "Hello, World!"
```

### 11. 局部变量和全局变量？

**答：**

```bash
global_var="I'm global"

my_func() {
    local local_var="I'm local"     # 只在函数内可见
    global_var="Modified in func"    # 修改全局变量
    echo "$local_var"
}

my_func
echo "$global_var"    # "Modified in func"
echo "$local_var"     # 空（函数外不可见）
```

**最佳实践：** 函数内部的变量尽量用 `local` 声明，避免意外修改全局变量。

---

## 五、输入输出与重定向

### 12. 重定向操作符有哪些？

**答：**

```bash
# 标准流
# stdin  (0) - 标准输入
# stdout (1) - 标准输出
# stderr (2) - 标准错误

# 输出重定向
command > file          # stdout 写入文件（覆盖）
command >> file         # stdout 追加到文件
command 2> file         # stderr 写入文件
command 2>> file        # stderr 追加到文件
command &> file         # stdout 和 stderr 都写入文件
command > file 2>&1     # 同上（兼容性更好）
command > /dev/null 2>&1  # 丢弃所有输出

# 输入重定向
command < file          # 从文件读取输入

# Here Document
cat <<EOF
Hello, $USER
Today is $(date)
EOF

# Here String
grep "pattern" <<< "$string"

# 管道
command1 | command2     # 前一个命令的 stdout 作为后一个的 stdin
command1 |& command2    # stdout 和 stderr 都传给下一个命令

# tee（同时输出到屏幕和文件）
command | tee file          # 覆盖写入
command | tee -a file       # 追加写入
```

### 13. 什么是进程替换？

**答：**

```bash
# 进程替换：将命令输出当作文件使用
diff <(ls dir1) <(ls dir2)          # 比较两个目录的文件列表
comm <(sort file1) <(sort file2)    # 比较两个排序后的文件

# 等价于
ls dir1 > /tmp/list1
ls dir2 > /tmp/list2
diff /tmp/list1 /tmp/list2
```

---

## 六、数组和关联数组

### 14. Shell 数组操作？

**答：**

```bash
# 普通数组（索引从0开始）
arr=(apple banana cherry)
arr[3]="date"

echo ${arr[0]}              # apple
echo ${arr[@]}              # 所有元素
echo ${#arr[@]}             # 数组长度
echo ${!arr[@]}             # 所有索引

# 遍历
for item in "${arr[@]}"; do
    echo "$item"
done

# 切片
echo ${arr[@]:1:2}          # banana cherry

# 删除元素
unset arr[1]

# 关联数组（Bash 4+）
declare -A map
map[name]="DevOps"
map[role]="engineer"

echo ${map[name]}
echo ${!map[@]}             # 所有键
echo ${map[@]}              # 所有值

for key in "${!map[@]}"; do
    echo "$key: ${map[$key]}"
done
```

---

## 七、常用 DevOps 脚本模式

### 15. 日志函数封装？

**答：**

```bash
#!/bin/bash

# 日志级别颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') $*" >&2
}

# 使用
log_info "Deployment started"
log_warn "Disk usage above 80%"
log_error "Service failed to start"
```

### 16. 参数解析脚本模式？

**答：**

```bash
#!/bin/bash
set -euo pipefail

# 默认值
ENVIRONMENT="staging"
VERSION=""
DRY_RUN=false

usage() {
    cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Options:
    -e, --env ENV        Target environment (default: staging)
    -v, --version VER    Version to deploy (required)
    -d, --dry-run        Dry run mode
    -h, --help           Show this help message
EOF
    exit 1
}

# 参数解析
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--env)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# 参数校验
if [[ -z "$VERSION" ]]; then
    echo "Error: --version is required"
    usage
fi

echo "Deploying version $VERSION to $ENVIRONMENT (dry_run=$DRY_RUN)"
```

### 17. 健康检查脚本？

**答：**

```bash
#!/bin/bash
set -euo pipefail

check_service() {
    local service="$1"
    if systemctl is-active --quiet "$service"; then
        echo "✅ $service is running"
        return 0
    else
        echo "❌ $service is NOT running"
        return 1
    fi
}

check_port() {
    local host="$1"
    local port="$2"
    if timeout 3 bash -c "echo > /dev/tcp/$host/$port" 2>/dev/null; then
        echo "✅ $host:$port is reachable"
        return 0
    else
        echo "❌ $host:$port is NOT reachable"
        return 1
    fi
}

check_disk() {
    local threshold="${1:-80}"
    local alert=0
    while IFS= read -r line; do
        usage=$(echo "$line" | awk '{print $5}' | tr -d '%')
        mount=$(echo "$line" | awk '{print $6}')
        if [[ $usage -ge $threshold ]]; then
            echo "⚠️  Disk $mount usage: ${usage}%"
            alert=1
        fi
    done < <(df -h | tail -n +2)
    return $alert
}

# 执行检查
echo "=== Service Health Check ==="
check_service nginx
check_service docker

echo ""
echo "=== Port Check ==="
check_port localhost 80
check_port localhost 443

echo ""
echo "=== Disk Check ==="
check_disk 80
```

### 18. 自动备份脚本？

**答：**

```bash
#!/bin/bash
set -euo pipefail

# 配置
BACKUP_DIR="/backup"
SOURCE_DIRS=("/etc" "/opt/app/config")
RETAIN_DAYS=30
DATE=$(date '+%Y%m%d_%H%M%S')
HOSTNAME=$(hostname)
BACKUP_FILE="${BACKUP_DIR}/${HOSTNAME}_${DATE}.tar.gz"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 创建备份
echo "Starting backup at $(date)"
tar -czf "$BACKUP_FILE" "${SOURCE_DIRS[@]}" 2>/dev/null

# 验证备份
if [[ -f "$BACKUP_FILE" ]]; then
    size=$(du -h "$BACKUP_FILE" | awk '{print $1}')
    echo "Backup created: $BACKUP_FILE ($size)"
else
    echo "ERROR: Backup failed!"
    exit 1
fi

# 清理旧备份
echo "Cleaning backups older than ${RETAIN_DAYS} days..."
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +"$RETAIN_DAYS" -delete

echo "Backup completed at $(date)"
```

---

## 八、调试技巧

### 19. 如何调试 Shell 脚本？

**答：**

```bash
# 1. 使用 set 选项
set -x        # 打印每条命令（调试模式）
set +x        # 关闭调试
set -v        # 打印输入行
set -e        # 遇到错误退出
set -u        # 使用未定义变量时报错

# 2. 执行时开启调试
bash -x script.sh       # 调试模式运行
bash -n script.sh       # 语法检查（不执行）

# 3. 部分调试
set -x
# 需要调试的代码段
set +x

# 4. 陷阱调试（trap）
trap 'echo "Line $LINENO: $BASH_COMMAND failed with exit code $?"' ERR

# 5. 使用 PS4 自定义调试前缀
export PS4='+${BASH_SOURCE}:${LINENO}:${FUNCNAME[0]:+${FUNCNAME[0]}():} '
set -x

# 6. ShellCheck 静态分析
# 安装: apt install shellcheck
shellcheck script.sh
```

### 20. trap 命令的用法？

**答：** trap 用于捕获信号和脚本退出，常用于清理临时资源。

```bash
#!/bin/bash

# 创建临时文件
TMPFILE=$(mktemp)

# 脚本退出时自动清理
cleanup() {
    echo "Cleaning up..."
    rm -f "$TMPFILE"
}
trap cleanup EXIT          # EXIT 信号：脚本退出时执行
trap cleanup INT TERM      # 捕获 Ctrl+C 和 kill

# 错误处理
on_error() {
    echo "Error on line $1"
    exit 1
}
trap 'on_error $LINENO' ERR

# 主逻辑
echo "Working with $TMPFILE"
# ... 执行操作 ...
# 无论正常退出还是异常退出，cleanup 都会执行
```

---

## 九、文本处理进阶

### 21. awk 进阶用法？

**答：**

```bash
# 基本结构：awk 'BEGIN{} pattern{action} END{}'

# 统计日志中各状态码数量
awk '{count[$9]++} END {for (code in count) print code, count[code]}' access.log

# 计算平均响应时间
awk '{sum+=$NF; count++} END {print "avg:", sum/count, "ms"}' access.log

# 多字段输出格式化
awk -F: 'BEGIN{printf "%-20s %-10s %s\n", "User", "UID", "Shell"}
         {printf "%-20s %-10s %s\n", $1, $3, $7}' /etc/passwd

# 条件过滤和处理
awk -F: '$3 >= 1000 && $7 != "/sbin/nologin" {print $1, $3}' /etc/passwd

# 内建变量
# NR: 当前行号  NF: 当前行字段数  FS: 输入字段分隔符  OFS: 输出字段分隔符
awk 'NR>1 && NR<=10 {print NR": "$0}' file     # 打印2-10行带行号
```

### 22. sed 进阶用法？

**答：**

```bash
# 多条命令
sed -e 's/foo/bar/g' -e 's/baz/qux/g' file

# 只在匹配行上执行替换
sed '/^server/s/80/8080/g' nginx.conf

# 在指定行前后插入
sed '3i\Insert before line 3' file    # 在第3行前插入
sed '3a\Append after line 3' file     # 在第3行后追加

# 删除空白行
sed '/^$/d' file

# 提取两个模式之间的内容
sed -n '/BEGIN/,/END/p' file

# 备份并修改
sed -i.bak 's/old/new/g' file   # 创建 file.bak 备份

# 修改配置文件
sed -i 's/^#Port 22/Port 2222/' /etc/ssh/sshd_config
```

---

## 十、最佳实践

### 23. Shell 脚本编写最佳实践有哪些？

**答：**

1. **始终使用 Shebang**：`#!/bin/bash` 或 `#!/usr/bin/env bash`
2. **开启严格模式**：`set -euo pipefail`
3. **变量加引号**：`"$var"` 防止字符串分割和通配符展开
4. **使用 `[[ ]]` 代替 `[ ]`**：功能更强，避免意外
5. **使用函数组织代码**：提高可读性和可维护性
6. **局部变量用 `local`**：避免全局污染
7. **使用 `$(command)` 代替反引号** `` `command` ``：可嵌套，更清晰
8. **使用 `trap` 做清理**：确保临时文件等资源被释放
9. **使用 `mktemp` 创建临时文件**：安全创建唯一临时文件
10. **使用 `shellcheck` 做静态分析**：检测常见错误
11. **数值计算用 `$(( ))`**：`result=$((a + b))`
12. **遍历参数用 `"$@"`**：保持参数边界
13. **避免解析 `ls` 输出**：使用 glob 模式 `for f in *.txt`
14. **避免使用 `eval`**：安全隐患
15. **日志输出格式统一**：包含时间戳和级别
