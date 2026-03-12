# Shell基础与执行环境八股文

---

## 一、Shell 概述

### 1. 什么是 Shell？它在系统中的位置？

**答：**

```
Shell 在系统中的位置:

┌────────────────────────────────────────────┐
│              用户 (User)                   │
│    键入命令 / 执行脚本                       │
└────────────────┬───────────────────────────┘
                 │
┌────────────────▼───────────────────────────┐
│         Shell (命令行解释器)                 │
│  ┌─────────────────────────────────────┐    │
│  │ 1. 读取输入 (Read)                   │    │
│  │ 2. 词法分析/语法解析 (Parse)          │    │
│  │ 3. 展开 (Expand): 变量/通配/命令替换  │    │
│  │ 4. 执行 (Execute): 内建/外部命令      │    │
│  │ 5. 等待/返回 (Wait/Return)           │    │
│  └─────────────────────────────────────┘    │
│  - 内建命令: cd, echo, export, alias...     │
│  - 外部命令: ls, grep → fork+exec          │
└────────────────┬───────────────────────────┘
                 │ 系统调用 (syscall)
┌────────────────▼───────────────────────────┐
│             内核 (Kernel)                   │
│     进程管理 / 文件系统 / 网络 / 驱动       │
└────────────────────────────────────────────┘

Shell 本身就是一个用户空间程序（/bin/bash 等）
它是用户与内核之间的"壳"（shell = 外壳）
```

### 2. 常见 Shell 的区别和选择？

**答：**

| Shell | 路径 | 特点 | 适用场景 |
|-------|------|------|---------|
| sh (POSIX Shell) | /bin/sh | 最基本，POSIX 标准 | 可移植脚本 |
| bash | /bin/bash | 最常用，Linux 默认，功能丰富 | 日常使用、脚本 |
| dash | /bin/dash | 轻量快速，POSIX 兼容 | Debian/Ubuntu 系统脚本 |
| zsh | /bin/zsh | 功能最强，插件生态好 | macOS 默认，个人交互使用 |
| fish | /usr/bin/fish | 友好语法，自动建议 | 新手交互使用 |
| ksh | /bin/ksh | 商业 Unix 传统 Shell | 企业 AIX/HP-UX |

```bash
# 查看当前 Shell
echo $SHELL                      # 登录 Shell
echo $0                          # 当前 Shell
ps -p $$                         # 当前 Shell 进程

# 查看系统可用 Shell
cat /etc/shells

# 切换默认 Shell
chsh -s /bin/zsh                 # 当前用户
chsh -s /bin/bash username       # 指定用户（root）
usermod -s /bin/bash username    # 等价

# Bash 版本（功能支持很重要）
bash --version
# Bash 3.x: 不支持关联数组
# Bash 4.0+: 支持关联数组、mapfile、coproc
# Bash 4.4+: 支持 ${var@Q} 引用、mapfile -d
# Bash 5.0+: 支持 $EPOCHSECONDS、BASH_ARGV0
```

### 3. sh 和 bash 的区别？脚本中 `#!/bin/sh` 和 `#!/bin/bash` 有什么不同？

**答：**

```bash
# #!/bin/sh  → 以 POSIX sh 模式运行（更严格，功能少）
# #!/bin/bash → 以 bash 模式运行（支持所有 bash 特性）

# 在 Debian/Ubuntu 中:
ls -la /bin/sh
# /bin/sh -> dash   （不是 bash！）

# 在 RHEL/CentOS 中:
ls -la /bin/sh
# /bin/sh -> bash   （bash 的 POSIX 兼容模式）

# bash 独有特性（sh/dash 不支持）:
# 1. [[ ]] 双方括号
# 2. (( )) 算术表达式
# 3. 数组 arr=(a b c)
# 4. 关联数组 declare -A
# 5. 字符串操作 ${var//old/new}
# 6. 进程替换 <()
# 7. 花括号展开 {1..10}
# 8. here string <<<
# 9. 正则匹配 =~
# 10. select 语句

# 建议:
# - 需要可移植性: #!/bin/sh + POSIX 语法
# - 交互脚本/复杂脚本: #!/bin/bash
# - 最佳实践: #!/usr/bin/env bash （环境自适应）
```

---

## 二、Shell 执行机制

### 4. Shell 脚本的执行方式有什么区别？

**答：**

```bash
# ===== 方式一: 直接执行 (子Shell) =====
chmod +x script.sh
./script.sh                      # 当前目录
/opt/scripts/script.sh            # 绝对路径

# 创建子 Shell 进程 (fork + exec)
# 脚本中的变量、cd 等不影响父 Shell
# 使用 Shebang 行指定的解释器

# ===== 方式二: 解释器执行 (子Shell) =====
bash script.sh                    # 不需要执行权限
sh script.sh                     # 以 sh 模式执行（忽略 Shebang）

# ===== 方式三: source / . (当前Shell) =====
source script.sh
. script.sh

# 在当前 Shell 进程中执行
# 变量、函数、cd 等会影响当前环境
# 常用于: 加载配置、加载函数库

# ===== 方式四: exec =====
exec ./script.sh
# 替换当前 Shell 进程（不创建新进程）
# 执行后原 Shell 消失
# 常用于: 容器 entrypoint 中

# ===== 对比表 =====
# ┌──────────────────┬──────────┬──────────┬──────────┐
# │ 方式              │ 新进程？  │ 变量影响？│ 需要x？  │
# ├──────────────────┼──────────┼──────────┼──────────┤
# │ ./script.sh      │ 是       │ 不影响    │ 需要     │
# │ bash script.sh   │ 是       │ 不影响    │ 不需要   │
# │ source script.sh │ 否       │ 影响     │ 不需要   │
# │ exec script.sh   │ 替换     │ N/A      │ 需要     │
# └──────────────────┴──────────┴──────────┴──────────┘
```

### 5. Shebang (#!) 的工作原理？

**答：**

```bash
# Shebang 是脚本文件的第一行，格式: #!解释器路径 [参数]

#!/bin/bash              # 使用 /bin/bash 解释
#!/usr/bin/env bash      # 从 PATH 中查找 bash（推荐，更便携）
#!/usr/bin/python3       # Python 脚本
#!/usr/bin/env python3   # 推荐写法
#!/usr/bin/awk -f        # awk 脚本

# 工作原理:
# 1. 用户执行 ./script.sh
# 2. 内核读取文件前两个字节 "#!"
# 3. 内核解析 Shebang 行得到解释器路径
# 4. 内核实际执行: /bin/bash ./script.sh

# 为什么推荐 #!/usr/bin/env bash ?
# - /bin/bash 路径在不同系统可能不同
# - env 会从 PATH 中搜索 bash
# - 特别适合 Python/Ruby 等可能装在不同位置的语言

# 注意事项:
# - Shebang 必须在文件 第一行第一列
# - 前面不能有空格或空行
# - 最多两个参数（内核限制）
# - Windows 编辑的文件需要注意 BOM 和 \r\n
```

### 6. 子Shell 和子进程的区别？

**答：**

```bash
# 子Shell (Subshell): 当前 Shell 的副本
# - 继承: 变量、函数、别名、选项
# - 不影响父 Shell 的变量
# - 创建方式:

# 1. 小括号
(cd /tmp; echo $PWD)         # 当前目录不变
echo $PWD                     # 仍在原目录

# 2. 管道（管道右边在子Shell中执行）
count=0
echo "a b c" | while read word; do
    ((count++))
done
echo $count    # 输出 0！（子Shell中的修改不影响父Shell）

# 3. 命令替换
result=$(echo "hello")       # $() 内是子Shell

# 4. 后台执行
command &                    # 后台子Shell

# 解决管道子Shell变量丢失问题:
# 方法1: Here String + while
count=0
while read word; do
    ((count++))
done <<< "a b c"
echo $count    # 3

# 方法2: 进程替换
count=0
while read line; do
    ((count++))
done < <(cat file.txt)
echo $count    # 正确值

# 方法3: lastpipe (Bash 4.2+)
shopt -s lastpipe
count=0
echo "a b c" | while read word; do
    ((count++))
done
echo $count    # 3（管道最后一个命令在当前Shell执行）
```

---

## 三、Shell 配置文件

### 7. Bash 配置文件的加载顺序？

**答：**

```
登录 Shell (Login Shell) vs 非登录 Shell:

登录 Shell: ssh 登录、su - 、login 命令
非登录 Shell: 打开终端窗口、执行脚本、su (无 -)

交互式 vs 非交互式:
交互式: 有提示符，等待用户输入
非交互式: 执行脚本

配置文件加载顺序:

=== 登录交互式 Shell ===
1. /etc/profile                  (所有用户，系统级)
2. /etc/profile.d/*.sh           (profile 会 source 这些)
3. 按顺序找到第一个就停:
   ~/.bash_profile               (用户级，最常用)
   ~/.bash_login
   ~/.profile
4. ~/.bashrc                     (通常被 bash_profile source)
   └→ /etc/bashrc               (被 .bashrc source)

退出时: ~/.bash_logout

=== 非登录交互式 Shell ===
1. ~/.bashrc
   └→ /etc/bashrc

=== 非交互式 Shell (脚本执行) ===
只加载 $BASH_ENV 指定的文件（如果设置了的话）
```

```bash
# 判断当前 Shell 类型
# 登录 Shell？
shopt -q login_shell && echo "login" || echo "non-login"

# 交互式？
[[ $- == *i* ]] && echo "interactive" || echo "non-interactive"

# 最佳实践:
# ~/.bash_profile 内容通常是:
if [ -f ~/.bashrc ]; then
    source ~/.bashrc
fi

# ~/.bashrc 放日常配置: 别名、函数、提示符、PATH
export PATH="$HOME/bin:$PATH"
alias ll='ls -la'

# /etc/profile.d/custom.sh 放全局配置
```

### 8. 环境变量和 Shell 变量的区别？

**答：**

```bash
# Shell 变量: 只在当前 Shell 中可见
my_var="hello"

# 环境变量: 会被子进程继承
export MY_ENV_VAR="world"

# 区别演示
shell_var="local"
export env_var="inherited"

bash -c 'echo "shell_var=$shell_var"'    # 空
bash -c 'echo "env_var=$env_var"'        # inherited

# 查看
set              # 所有 Shell 变量和函数
env              # 所有环境变量
export -p        # 所有 export 的变量
printenv         # 等同 env
declare -p       # 带类型信息

# 常见环境变量
echo $HOME           # 用户家目录
echo $USER           # 当前用户
echo $SHELL          # 默认 Shell
echo $PATH           # 命令搜索路径
echo $PWD            # 当前目录
echo $OLDPWD         # 上一个目录 (cd -)
echo $HOSTNAME       # 主机名
echo $LANG           # 语言/编码
echo $TERM           # 终端类型
echo $EDITOR         # 默认编辑器
echo $HISTSIZE       # 历史命令数量
echo $HISTFILE       # 历史命令文件
echo $PS1            # 主提示符
echo $PS2            # 续行提示符
echo $IFS            # 内部字段分隔符
echo $RANDOM         # 随机数 (0-32767)
echo $SECONDS        # Shell 启动后的秒数
echo $LINENO         # 当前行号
echo $BASH_VERSION   # Bash 版本
```

---

## 四、命令执行机制

### 9. Shell 命令查找的顺序？

**答：**

```bash
# Shell 收到一个命令后，按以下顺序查找:
# 1. 别名 (alias)
# 2. 函数 (function)
# 3. 内建命令 (builtin)
# 4. 外部命令 (hash表 → PATH 搜索)

# 查看命令类型
type ls               # ls is aliased to `ls --color=auto'
type cd               # cd is a shell builtin
type grep             # grep is /usr/bin/grep
type -a echo           # 列出所有（builtin + /usr/bin/echo）

# which 只查找外部命令
which ls               # /usr/bin/ls

# 命令查找缓存 (hash)
hash                   # 查看缓存
hash -r                # 清除缓存
# 当移动或重新安装命令后可能需要 hash -r

# 强制使用特定类型
builtin echo "hello"   # 使用内建 echo（忽略别名和函数）
command ls             # 使用命令（忽略别名和函数）
\ls                    # 跳过别名（常用于绕过 ls 的颜色别名）
/usr/bin/ls            # 直接指定路径
```

### 10. Shell 展开 (Expansion) 的顺序？

**答：**

```bash
# Shell 在执行命令前会进行多种展开，顺序如下:
# 1. 花括号展开 (Brace Expansion)
# 2. 波浪号展开 (Tilde Expansion)
# 3. 参数和变量展开 (Parameter/Variable Expansion)
# 4. 命令替换 (Command Substitution)
# 5. 算术展开 (Arithmetic Expansion)
# 6. 词分割 (Word Splitting)
# 7. 文件名展开/通配符 (Pathname Expansion / Globbing)

# === 花括号展开 ===
echo {a,b,c}           # a b c
echo file.{txt,log}    # file.txt file.log
echo {1..10}           # 1 2 3 ... 10
echo {01..10}          # 01 02 03 ... 10
echo {a..z}            # a b c ... z
echo {1..10..2}        # 1 3 5 7 9 (步长)
mkdir -p project/{src,test,docs}/{v1,v2}  # 批量创建

# === 波浪号展开 ===
echo ~                 # /home/user
echo ~root             # /root
echo ~+               # $PWD
echo ~-               # $OLDPWD

# === 变量展开 ===
name="world"
echo "Hello $name"     # Hello world
echo "Hello ${name}"   # Hello world

# === 命令替换 ===
echo "Today: $(date +%F)"
echo "Files: $(ls | wc -l)"

# === 算术展开 ===
echo $((2 + 3))        # 5
echo $((10 / 3))       # 3 (整数除法)
echo $((2 ** 10))      # 1024

# === 通配符 (Globbing) ===
echo *.txt             # 当前目录所有 .txt 文件
echo ???.log           # 三个字符名的 .log 文件
echo [abc]*.sh         # a/b/c 开头的 .sh 文件
echo [!0-9]*           # 非数字开头的文件

# === 扩展通配 (Bash 4+) ===
shopt -s extglob
echo !(*.log)          # 排除 .log 文件
echo +(*.txt|*.md)     # .txt 或 .md 文件
echo ?(prefix)*        # 可选前缀
```

### 11. 引号的作用和区别？

**答：**

```bash
# 三种引号对比:

name="world"

# 双引号 "": 弱引用
# - 保留 $ ` \ ! 的特殊含义
# - 防止词分割和通配符展开
echo "Hello $name"          # Hello world
echo "Now: $(date)"         # Now: Mon Jan 1 ...
echo "Path: $HOME"          # Path: /home/user

# 单引号 '': 强引用
# - 所有字符都是字面值
# - 没有任何特殊字符
echo 'Hello $name'          # Hello $name
echo 'Now: $(date)'         # Now: $(date)

# 反引号 ``: 命令替换（旧语法）
echo "Files: `ls | wc -l`"  # 等价于 $(ls | wc -l)
# 不推荐: 不能嵌套，转义混乱

# $'' ANSI-C 引用
echo $'tab:\there'           # 解释转义序列 \t \n \\ \'
echo $'\x41'                 # A (十六进制)

# $"" 本地化引用
echo $"Hello"                # 国际化翻译（很少用）

# 引号中嵌套引号
echo "He said 'hello'"      # 双引号中可以有单引号
echo 'He said "hello"'      # 单引号中可以有双引号
echo "He said \"hello\""    # 双引号中转义双引号

# ⚠️ 最常见的坑
file="my file.txt"
cat $file                    # 错！被分割为 "my" 和 "file.txt"
cat "$file"                  # 对！作为一个参数

# 数组中也要加引号
files=("file 1.txt" "file 2.txt")
for f in "${files[@]}"; do   # 必须加引号
    echo "$f"
done
```

---

## 五、命令行编辑与历史

### 12. Bash 快捷键和命令行编辑？

**答：**

```bash
# ===== 光标移动 =====
Ctrl+A          # 行首
Ctrl+E          # 行尾
Ctrl+F / →      # 前进一个字符
Ctrl+B / ←      # 后退一个字符
Alt+F           # 前进一个词
Alt+B           # 后退一个词
Ctrl+XX         # 在行首和当前位置之间跳转

# ===== 删除/剪切 =====
Ctrl+D          # 删除光标下字符（空行时退出）
Ctrl+H          # 删除光标前字符 (Backspace)
Ctrl+W          # 删除光标前一个词
Ctrl+K          # 删除到行尾
Ctrl+U          # 删除到行首
Alt+D           # 删除到词尾

# ===== 粘贴/撤销 =====
Ctrl+Y          # 粘贴 (yank) 上次删除的内容
Ctrl+_          # 撤销

# ===== 历史命令 =====
Ctrl+R          # 反向搜索历史
Ctrl+S          # 正向搜索历史
Ctrl+P / ↑      # 上一条命令
Ctrl+N / ↓      # 下一条命令
!!              # 上一条命令
!$              # 上一条命令的最后一个参数
!^              # 上一条命令的第一个参数
!*              # 上一条命令的所有参数
!n              # 历史中第 n 条命令
!-n             # 倒数第 n 条命令
!string         # 最近以 string 开头的命令
^old^new        # 替换上一条命令中的 old 为 new

# ===== 其他 =====
Ctrl+L          # 清屏
Ctrl+C          # 中断当前命令
Ctrl+Z          # 暂停当前命令（fg 恢复）
Ctrl+D          # 退出 Shell（空行时）
Tab             # 自动补全
Tab Tab         # 列出所有补全选项
```

### 13. 历史命令管理？

**答：**

```bash
# 历史记录配置
export HISTSIZE=10000          # 内存中的历史数
export HISTFILESIZE=20000      # 文件中的历史数
export HISTFILE=~/.bash_history
export HISTTIMEFORMAT="%F %T " # 时间戳格式
export HISTCONTROL=ignoreboth  # 忽略重复和空格开头的命令
# ignoredups:  忽略连续重复
# ignorespace: 忽略空格开头
# ignoreboth:  以上两者
# erasedups:   删除所有重复

export HISTIGNORE="ls:cd:pwd:exit:history"  # 忽略这些命令

# 历史命令操作
history                        # 显示历史
history 20                     # 最近 20 条
history -c                     # 清除内存中的历史
history -w                     # 写入文件
history -r                     # 从文件读取
history -d 100                 # 删除第 100 条

# 安全: 立即记录（防止丢失）
export PROMPT_COMMAND='history -a'
# 或多终端共享
export PROMPT_COMMAND='history -a; history -n'

# 防止敏感命令被记录
# 命令前加空格（需要 HISTCONTROL=ignorespace）
 export SECRET_KEY="abc123"    # 前面有空格，不记录
```
