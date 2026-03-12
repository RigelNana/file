# 文本处理与Shell工具八股文

---

## 一、正则表达式基础

### 1. 基本正则 (BRE) 和扩展正则 (ERE) 的区别？

**答：**

| 元字符 | BRE (grep) | ERE (grep -E / egrep) | 含义 |
|--------|------------|----------------------|------|
| `.` | `.` | `.` | 匹配任意单字符 |
| `*` | `*` | `*` | 前一个字符出现 0 次或多次 |
| `+` | `\+` | `+` | 前一个字符出现 1 次或多次 |
| `?` | `\?` | `?` | 前一个字符出现 0 次或 1 次 |
| `{n,m}` | `\{n,m\}` | `{n,m}` | 前一个字符出现 n 到 m 次 |
| `()` | `\(\)` | `()` | 分组 |
| `\|` | `\|` | `\|` | 或 |
| `^` | `^` | `^` | 行首 |
| `$` | `$` | `$` | 行尾 |
| `[abc]` | `[abc]` | `[abc]` | 字符类 |
| `[^abc]` | `[^abc]` | `[^abc]` | 排除字符类 |

```bash
# BRE 需要转义
grep 'error\|warning' file.log
grep 'line\{2,5\}' file

# ERE 不需要转义
grep -E 'error|warning' file.log
grep -E 'line{2,5}' file

# PCRE (Perl Compatible Regular Expressions)
grep -P '\d+\.\d+\.\d+\.\d+' file     # \d 数字
grep -P '(?<=User:)\s*\w+' file        # 前瞻/后顾
```

### 2. 常用正则表达式模式？

**答：**

```bash
# IP 地址
grep -E '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b'

# 邮箱
grep -E '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

# URL
grep -E 'https?://[a-zA-Z0-9./?=_%&#-]+'

# 日期 (YYYY-MM-DD)
grep -E '[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])'

# 空行
grep -E '^$'
grep -c '^$' file              # 统计空行数

# 非空行
grep -v '^$'

# 注释行（# 开头）
grep -E '^\s*#'

# 非注释非空行
grep -vE '^\s*#|^\s*$'
```

---

## 二、grep 详解

### 3. grep 命令常用参数？

**答：**

```bash
# 基本搜索
grep 'pattern' file             # 在文件中搜索
grep 'pattern' file1 file2      # 多文件搜索
grep -r 'pattern' /path/        # 递归搜索目录
grep -rn 'pattern' /path/       # 递归搜索 + 显示行号

# 常用选项
-i          # 忽略大小写
-v          # 反向匹配（不包含）
-n          # 显示行号
-c          # 只统计匹配行数
-l          # 只显示包含匹配的文件名
-L          # 只显示不包含匹配的文件名
-w          # 全词匹配
-x          # 整行匹配
-o          # 只输出匹配部分
-m N        # 最多匹配 N 行
-q          # 安静模式（用于脚本判断）
-A N        # 显示匹配行后 N 行
-B N        # 显示匹配行前 N 行
-C N        # 显示匹配行前后各 N 行
-E          # 使用扩展正则
-P          # 使用 Perl 正则
-f file     # 从文件读取模式
--include   # 只搜索匹配的文件
--exclude   # 排除匹配的文件

# 实用示例
# 搜索日志中的错误
grep -inE 'error|fatal|critical' /var/log/syslog

# 搜索代码（排除 .git）
grep -rn --exclude-dir=.git 'TODO' ./

# 搜索 Go/Python 文件中的函数定义
grep -rn --include='*.go' 'func ' ./
grep -rn --include='*.py' 'def ' ./

# 统计每个日志等级的数量
grep -c 'ERROR' app.log
grep -c 'WARN' app.log

# 提取 IP
grep -oE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' access.log | sort | uniq -c | sort -rn

# 在脚本中判断
if grep -q 'pattern' file; then
    echo "Found"
fi
```

---

## 三、sed 详解

### 4. sed 基本用法和常见操作？

**答：**

```bash
# sed = Stream EDitor（流编辑器）
# 语法: sed [选项] '地址/命令' 文件

# ===== 替换 (s) =====
sed 's/old/new/' file              # 替换每行第一个匹配
sed 's/old/new/g' file             # 全局替换
sed 's/old/new/gI' file            # 全局替换（忽略大小写）
sed 's/old/new/2' file             # 替换每行第 2 个匹配
sed -i 's/old/new/g' file          # 原地修改文件
sed -i.bak 's/old/new/g' file     # 原地修改并备份

# 分隔符可以换（遇到路径时方便）
sed 's|/usr/local|/opt|g' file
sed 's#/usr/local#/opt#g' file

# ===== 删除 (d) =====
sed '3d' file                      # 删除第 3 行
sed '2,5d' file                    # 删除第 2-5 行
sed '$d' file                      # 删除最后一行
sed '/pattern/d' file              # 删除包含 pattern 的行
sed '/^$/d' file                   # 删除空行
sed '/^#/d' file                   # 删除注释行
sed '/^#/d; /^$/d' file           # 删除注释和空行

# ===== 插入 (i) 和追加 (a) =====
sed '3i\new line' file             # 在第 3 行前插入
sed '3a\new line' file             # 在第 3 行后追加
sed '/pattern/i\new line' file     # 在匹配行前插入
sed '/pattern/a\new line' file     # 在匹配行后追加

# ===== 地址范围 =====
sed '2,5s/old/new/g' file         # 只在 2-5 行替换
sed '2,$s/old/new/g' file         # 从第 2 行到末尾
sed '/start/,/end/d' file         # 删除 start 到 end 之间的行
sed '0~2d' file                   # 删除偶数行
sed '1~2d' file                   # 删除奇数行

# ===== 打印 (p) =====
sed -n '5p' file                   # 只打印第 5 行
sed -n '5,10p' file                # 打印 5-10 行
sed -n '/pattern/p' file           # 打印匹配行（类似 grep）

# ===== 高级用法 =====
# 引用匹配内容
sed 's/\(.*\)/【\1】/' file       # 用 \1 引用分组
sed -E 's/(.*)/【\1】/' file      # ERE 模式

# 多命令
sed -e 's/a/A/g' -e 's/b/B/g' file
sed 's/a/A/g; s/b/B/g' file

# 提取特定字段
echo "name=John" | sed 's/.*=//'    # 输出: John
```

### 5. sed 实战示例?

**答：**

```bash
# 修改配置文件
sed -i 's/^#Port 22/Port 2222/' /etc/ssh/sshd_config
sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config

# 批量替换目录下所有文件
find . -name '*.conf' -exec sed -i 's/old_host/new_host/g' {} +

# 在文件头部添加内容
sed -i '1i\#!/bin/bash' script.sh

# 在文件尾部添加内容
sed -i '$a\# End of file' config

# 提取两个标记之间的内容
sed -n '/BEGIN/,/END/p' file

# 删除行首行尾空格
sed 's/^[[:space:]]*//; s/[[:space:]]*$//' file

# 将多行合并为一行
sed ':a;N;$!ba;s/\n/ /g' file

# CSV 字段替换（第二字段）
sed 's/^\([^,]*\),\([^,]*\)/\1,NEW_VALUE/' file.csv
```

---

## 四、awk 详解

### 6. awk 基本语法和内置变量？

**答：**

```bash
# awk 工作流程:
# 1. 读取一行
# 2. 按分隔符切分为字段 ($1, $2, ...)
# 3. 执行匹配的 pattern {action}
# 4. 重复直到文件结束

# 语法
awk 'pattern {action}' file
awk -F: '{print $1}' /etc/passwd         # -F 指定分隔符

# 内置变量
$0          # 整行
$1,$2...$NF # 各字段
NF          # 当前行字段数 (Number of Fields)
NR          # 当前行号 (Number of Records)
FNR         # 当前文件中的行号（多文件时）
FS          # 输入字段分隔符（默认空格/Tab）
OFS         # 输出字段分隔符（默认空格）
RS          # 输入记录分隔符（默认换行）
ORS         # 输出记录分隔符（默认换行）
FILENAME    # 当前文件名
```

### 7. awk 常用模式和操作？

**答：**

```bash
# ===== 打印 =====
awk '{print $1}' file                  # 打印第一列
awk '{print $1, $3}' file              # 打印多列（逗号=OFS）
awk '{print $NF}' file                 # 打印最后一列
awk '{print $(NF-1)}' file            # 打印倒数第二列
awk -F: '{print $1":"$3}' /etc/passwd  # 自定义输出格式
awk -F: -v OFS='\t' '{print $1,$3}' /etc/passwd  # Tab 分隔输出

# ===== 条件 =====
awk '$3 > 1000 {print $1}' /etc/passwd            # 字段比较
awk '/ERROR/ {print}' log.txt                      # 正则匹配（grep 功能）
awk '!/^#/ && !/^$/' file                          # 非注释非空行
awk 'NR >= 10 && NR <= 20' file                    # 打印 10-20 行
awk 'length > 80' file                             # 长度超过 80 的行

# ===== BEGIN / END =====
awk 'BEGIN {print "Header"} {print} END {print "Footer"}' file
awk 'BEGIN {FS=":"} {print $1}' /etc/passwd

# ===== 计算 =====
# 求和
awk '{sum += $1} END {print sum}' data.txt

# 平均值
awk '{sum += $1; count++} END {print sum/count}' data.txt

# 最大/最小值
awk 'BEGIN{max=0} $1>max{max=$1} END{print max}' data.txt

# 统计行数
awk 'END {print NR}' file

# ===== 字符串函数 =====
awk '{print length($0)}' file                  # 字符串长度
awk '{print toupper($1)}' file                 # 转大写
awk '{print tolower($1)}' file                 # 转小写
awk '{sub(/old/, "new"); print}' file          # 替换第一个
awk '{gsub(/old/, "new"); print}' file         # 全局替换
awk '{print substr($0, 1, 10)}' file           # 子串
awk -F: '{split($0, a, ":"); print a[1]}' file # 分割
awk '{if(match($0, /[0-9]+/)) print substr($0, RSTART, RLENGTH)}' file  # 正则提取
```

### 8. awk 实战示例？

**答：**

```bash
# 统计 access.log 各 IP 访问次数（Top 10）
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10

# 统计 HTTP 状态码分布
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# 统计每小时请求数
awk -F'[/:]' '{print $4}' access.log | sort | uniq -c

# 计算平均响应时间（假设最后一列是响应时间）
awk '{sum+=$NF; count++} END {printf "Avg: %.2fms\n", sum/count}' access.log

# 处理 /etc/passwd
# 列出所有可登录用户
awk -F: '$7 !~ /nologin|false/ {print $1, $7}' /etc/passwd

# 列出 UID >= 1000 的用户
awk -F: '$3 >= 1000 {print $1, $3}' /etc/passwd

# 进程分析（ps 输出）
# 内存使用 Top 10
ps aux | awk 'NR>1 {print $4, $11}' | sort -rn | head -10

# 按用户统计进程数
ps aux | awk 'NR>1 {users[$1]++} END {for(u in users) print u, users[u]}' | sort -k2 -rn

# 统计 TCP 连接状态
ss -tn | awk 'NR>1 {state[$1]++} END {for(s in state) print s, state[s]}'

# 多文件对比（join 效果）
# file1: id name    file2: id score
awk 'NR==FNR{a[$1]=$2; next} $1 in a {print $1, a[$1], $2}' file1 file2

# 格式化输出
awk 'BEGIN {printf "%-20s %-10s %-10s\n", "Name", "Size", "Type"}'
df -h | awk 'NR>1 {printf "%-20s %-10s %-10s\n", $1, $2, $6}'

# 关联数组统计
cat access.log | awk '{
    ip[$1]++
    bytes[$1] += $10
}
END {
    for (i in ip) {
        printf "%-20s %8d reqs  %12d bytes\n", i, ip[i], bytes[i]
    }
}' | sort -k2 -rn | head -20
```

---

## 五、find 命令详解

### 9. find 命令常用用法？

**答：**

```bash
# 基本语法: find [路径] [条件] [动作]

# ===== 按名称 =====
find / -name "*.log"                # 精确匹配（大小写敏感）
find / -iname "*.log"               # 忽略大小写
find / -name "*.log" -o -name "*.txt"  # 或

# ===== 按类型 =====
find / -type f                      # 普通文件
find / -type d                      # 目录
find / -type l                      # 符号链接
find / -type s                      # Socket

# ===== 按大小 =====
find / -size +100M                  # 大于 100MB
find / -size -1k                    # 小于 1KB
find / -size 0                     # 空文件
find / -empty                       # 空文件或空目录

# ===== 按时间 =====
find / -mtime -7                    # 7 天内修改过
find / -mtime +30                   # 30 天前修改的
find / -mmin -60                    # 60 分钟内修改
find / -newer reference.txt         # 比 reference.txt 更新

# ===== 按权限和用户 =====
find / -perm 644                    # 精确权限
find / -perm -u+x                   # 至少有用户执行权限
find / -perm /u+x,g+x              # 用户或组可执行
find / -user root                   # 属于 root
find / -group www                   # 属于 www 组
find / -nouser                      # 无主文件
find / -perm -4000                  # SUID 文件

# ===== 按深度 =====
find / -maxdepth 2 -name "*.conf"   # 最多 2 层
find / -mindepth 1 -maxdepth 1      # 只看当前目录

# ===== 动作 =====
find . -name "*.tmp" -delete        # 删除
find . -name "*.sh" -exec chmod +x {} \;     # 对每个文件执行
find . -name "*.sh" -exec chmod +x {} +      # 批量执行（更高效）
find . -name "*.log" -exec ls -lh {} +       # 列出详情
find . -name "*.bak" -exec rm -i {} \;       # 交互删除

# ===== 实用场景 =====
# 清理 30 天前的日志
find /var/log -name "*.log" -mtime +30 -delete

# 查找大文件
find / -type f -size +500M -exec ls -lh {} + 2>/dev/null

# 查找修改过的配置文件（最近24小时）
find /etc -name "*.conf" -mtime -1

# 查找 SUID/SGID 文件（安全审计）
find / -perm -4000 -o -perm -2000 2>/dev/null

# 统计目录大小排序
find / -maxdepth 1 -type d -exec du -sh {} + 2>/dev/null | sort -rh

# 查找重复文件（按 md5）
find . -type f -exec md5sum {} + | sort | uniq -w32 -d
```

---

## 六、sort/uniq/wc/cut/tr 等工具

### 10. 文本处理常用工具？

**答：**

```bash
# ===== sort (排序) =====
sort file                           # 字典序排序
sort -n file                        # 数值排序
sort -r file                        # 逆序
sort -k2 file                       # 按第 2 列排序
sort -k2,2n file                    # 第 2 列数值排序
sort -t: -k3 -n /etc/passwd         # 指定分隔符排序
sort -u file                        # 排序并去重
sort -h file                        # 人类可读数值 (1K, 2M, 3G)

# ===== uniq (去重，需先排序) =====
sort file | uniq                    # 去重
sort file | uniq -c                 # 去重并计数
sort file | uniq -d                 # 只显示重复行
sort file | uniq -u                 # 只显示不重复行
sort file | uniq -c | sort -rn     # 按频率降序

# ===== wc (统计) =====
wc -l file                          # 行数
wc -w file                          # 单词数
wc -c file                          # 字节数
wc -m file                          # 字符数
cat file | wc -l                     # 管道用法

# ===== cut (按列切割) =====
cut -d: -f1 /etc/passwd             # 按 : 分割，取第 1 列
cut -d: -f1,3 /etc/passwd           # 第 1 和第 3 列
cut -d: -f1-3 /etc/passwd           # 第 1 到第 3 列
cut -c1-10 file                     # 第 1-10 个字符
echo "hello" | cut -c2-4            # 输出: ell

# ===== tr (字符转换) =====
echo "hello" | tr 'a-z' 'A-Z'      # 小写转大写
echo "hello" | tr -d 'l'           # 删除字符 l → heo
echo "aa  bb" | tr -s ' '          # 压缩连续空格 → "aa bb"
echo "hello123" | tr -d '0-9'      # 删除数字 → hello
tr '\r' '' < win.txt > unix.txt    # 去除 Windows 换行

# ===== paste (横向合并) =====
paste file1 file2                   # 按行合并（Tab 分隔）
paste -d, file1 file2              # 逗号分隔

# ===== head / tail =====
head -20 file                       # 前 20 行
tail -20 file                       # 后 20 行
tail -f file                        # 实时跟踪
tail -F file                        # 跟踪（文件轮转后重新打开）
tail -f file | grep --line-buffered 'ERROR'  # 实时过滤

# ===== tee (同时输出到屏幕和文件) =====
command | tee output.log            # 覆盖写
command | tee -a output.log         # 追加写
command 2>&1 | tee output.log       # 包含 stderr
```

---

## 七、xargs 详解

### 11. xargs 的用法和注意事项？

**答：**

```bash
# xargs 将标准输入转为命令参数

# 基本用法
echo "file1 file2 file3" | xargs rm           # 等价于 rm file1 file2 file3
find . -name "*.tmp" | xargs rm               # 删除找到的文件

# 常用参数
-n N         # 每次传递 N 个参数
-I {}        # 替换字符串（一次处理一个）
-d '\n'      # 指定分隔符
-0           # 以 null 分隔（配合 find -print0）
-P N         # 并行执行 N 个进程
-t           # 打印将要执行的命令
-p           # 交互确认

# 处理含空格文件名
find . -name "*.log" -print0 | xargs -0 rm    # -print0 + -0 配合

# 每次传一个参数
echo "a b c" | xargs -n1 echo
# echo a
# echo b
# echo c

# 使用占位符
find . -name "*.bak" | xargs -I {} mv {} {}.old
ls *.jpg | xargs -I {} convert {} -resize 50% small_{}

# 并行执行
find . -name "*.gz" | xargs -P 4 -I {} gunzip {}  # 4 个并行解压

# 实用示例
# 批量 kill 进程
ps aux | grep 'pattern' | awk '{print $2}' | xargs kill

# 批量修改文件权限
find /web -name "*.html" | xargs chmod 644
find /web -name "*.cgi" | xargs chmod 755

# git: 查找并删除已合并的分支
git branch --merged | grep -v main | xargs git branch -d
```

---

## 八、管道组合技巧

### 12. 常见的管道组合模式？

**答：**

```bash
# ===== 日志分析 =====
# Top 10 访问 IP
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10

# Top 10 请求 URL
awk '{print $7}' access.log | sort | uniq -c | sort -rn | head -10

# 按小时统计请求量
awk '{print substr($4,14,2)}' access.log | sort | uniq -c | sort -k2

# 4xx/5xx 错误统计
awk '$9 >= 400 {print $9, $7}' access.log | sort | uniq -c | sort -rn

# ===== 系统分析 =====
# 统计目录下文件类型分布
find . -type f | sed 's/.*\.//' | sort | uniq -c | sort -rn

# 最近修改的 10 个文件
find . -type f -printf '%T@ %p\n' | sort -rn | head -10 | cut -d' ' -f2-

# 查看占用磁盘最大的 10 个目录
du -ah /var | sort -rh | head -10

# 统计代码行数
find . -name "*.py" | xargs wc -l | sort -rn | head

# ===== 文本处理 =====
# CSV 字段提取和过滤
cut -d, -f2,5 data.csv | grep 'pattern' | sort -t, -k2 -n

# JSON 简单提取（无 jq 时）
grep -o '"key":"[^"]*"' data.json | cut -d'"' -f4

# 合并多行为逗号分隔
cat list.txt | paste -sd,

# 横转竖
echo "a b c" | tr ' ' '\n'

# 竖转横
cat list.txt | tr '\n' ' '

# ===== 监控告警 =====
# 实时监控日志并告警
tail -f /var/log/syslog | grep --line-buffered 'ERROR' | while read line; do
    echo "$line" | mail -s "Alert" admin@example.com
done

# 监控磁盘使用率
df -h | awk 'NR>1 && $5+0 > 80 {print "警告: " $6 " 使用率 " $5}'

# 监控连接数
while true; do
    echo "$(date): $(ss -tn | wc -l) connections"
    sleep 5
done
```

### 13. 进程替换和命令替换？

**答：**

```bash
# 命令替换 $() 或 ``
# 将命令的输出作为字符串
files=$(find . -name "*.log")
today=$(date +%Y-%m-%d)
count=$(wc -l < file.txt)

# 进程替换 <() 和 >()
# 将命令的输出作为文件
# <(command) → 创建一个临时文件描述符供读取

# diff 两个命令的输出
diff <(ls dir1) <(ls dir2)

# 比较排序后的文件
diff <(sort file1) <(sort file2)

# 同时处理多个输入
paste <(cut -d: -f1 /etc/passwd) <(cut -d: -f3 /etc/passwd)

# join 两个排序后的文件
join <(sort -k1 file1) <(sort -k1 file2)

# 管道与进程替换的区别
# 管道: command1 | command2    → command2 在子 shell 执行
# 进程替换: command2 <(command1) → command2 在当前 shell 执行

# 管道中变量丢失问题
count=0
cat file | while read line; do
    ((count++))
done
echo $count    # 输出 0！（子 shell 中的变量）

# 解决方案：进程替换
count=0
while read line; do
    ((count++))
done < <(cat file)
echo $count    # 正确值
```

---

## 九、jq - JSON处理

### 14. jq 常用操作？

**答：**

```bash
# jq = JSON 查询和处理工具

# 格式化
echo '{"a":1,"b":2}' | jq '.'

# 提取字段
echo '{"name":"John","age":30}' | jq '.name'        # "John"
echo '{"name":"John","age":30}' | jq -r '.name'     # John (去引号)

# 数组操作
echo '[1,2,3]' | jq '.[0]'                           # 1
echo '[1,2,3]' | jq '.[-1]'                          # 3
echo '[1,2,3]' | jq '.[1:3]'                         # [2,3]
echo '[1,2,3]' | jq '.[]'                            # 遍历每个元素

# 嵌套访问
echo '{"a":{"b":{"c":1}}}' | jq '.a.b.c'            # 1

# 过滤
echo '[{"name":"a","age":20},{"name":"b","age":30}]' | \
  jq '.[] | select(.age > 25)'

# 映射/转换
echo '[1,2,3]' | jq 'map(. * 2)'                    # [2,4,6]
echo '[{"a":1},{"a":2}]' | jq 'map(.a)'             # [1,2]

# 构造新对象
echo '{"first":"John","last":"Doe","age":30}' | \
  jq '{fullName: (.first + " " + .last), age: .age}'

# 排序/去重/长度
echo '[3,1,2]' | jq 'sort'                           # [1,2,3]
echo '[1,1,2]' | jq 'unique'                         # [1,2]
echo '[1,2,3]' | jq 'length'                         # 3

# 实用示例
# 解析 Docker inspect
docker inspect container | jq '.[0].NetworkSettings.IPAddress'

# 解析 Kubernetes 资源
kubectl get pods -o json | jq '.items[] | {name: .metadata.name, status: .status.phase}'

# 解析 API 响应
curl -s https://api.github.com/repos/torvalds/linux | jq '{stars: .stargazers_count, forks: .forks_count}'

# 统计 JSON 数组
echo '[{"status":"ok"},{"status":"fail"},{"status":"ok"}]' | \
  jq 'group_by(.status) | map({status: .[0].status, count: length})'
```

---

## 十、综合实战

### 15. 快速处理日志的常见套路？

**答：**

```bash
# ===== Nginx access.log 分析 =====
# 日志格式: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"

# 1. 请求量统计
wc -l access.log                                    # 总请求数
awk '{print substr($4,2,11)}' access.log | sort | uniq -c  # 每日请求

# 2. 状态码分析
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# 3. 慢请求（响应时间 > 2 秒，假设最后字段是响应时间）
awk '$NF > 2.0 {print $7, $NF}' access.log | sort -k2 -rn | head -20

# 4. 流量统计
awk '{sum += $10} END {printf "Total: %.2f GB\n", sum/1024/1024/1024}' access.log

# 5. 并发连接分析（按分钟）
awk '{print substr($4,2,17)}' access.log | sort | uniq -c | sort -rn | head

# ===== 系统日志分析 =====
# 登录失败统计
grep "Failed password" /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn

# 最近的错误
journalctl -p err --since "1 hour ago" --no-pager

# ===== 应用日志分析 =====
# 异常统计
grep -c 'Exception' app.log
grep 'Exception' app.log | sed 's/.*Exception: //' | sort | uniq -c | sort -rn

# 按时间段切分日志
awk '$0 >= "2024-01-01 10:00" && $0 <= "2024-01-01 11:00"' app.log
sed -n '/2024-01-01 10:00/,/2024-01-01 11:00/p' app.log
```

### 16. 如何用 Shell 工具快速做数据清洗？

**答：**

```bash
# 1. 去除 BOM
sed -i '1s/^\xEF\xBB\xBF//' file.csv

# 2. 统一换行符
dos2unix file.csv                       # CRLF → LF
# 或
sed -i 's/\r$//' file.csv

# 3. 去除前后空格
sed 's/^[[:space:]]*//;s/[[:space:]]*$//' file.csv

# 4. 去除空行
sed -i '/^$/d' file.csv

# 5. 提取特定列并去重
awk -F, '{print $3}' data.csv | sort -u > unique_values.txt

# 6. 过滤特定行
awk -F, 'NR==1 || $3 > 100' data.csv > filtered.csv  # 保留表头 + 过滤

# 7. 列转换（添加新列）
awk -F, -v OFS=',' '{$NF=$NF","($3+$4); print}' data.csv

# 8. 合并文件（纵向）
head -1 file1.csv > merged.csv          # 取表头
tail -n +2 file1.csv >> merged.csv      # 去表头追加
tail -n +2 file2.csv >> merged.csv

# 9. 大文件采样
shuf -n 1000 bigfile.csv > sample.csv   # 随机采样 1000 行
awk 'NR==1 || NR%100==0' bigfile.csv    # 每 100 行取一行

# 10. 简单的数据验证
awk -F, 'NF != 5 {print NR": "$0}' data.csv  # 找出列数不是5的异常行
```
