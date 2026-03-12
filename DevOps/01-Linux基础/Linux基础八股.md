# Linux 基础八股文

---

## 一、Linux 系统基础

### 1. Linux 的启动过程是怎样的？

**答：** Linux 启动过程分为以下几个阶段：

1. **BIOS/UEFI 阶段**：上电自检（POST），检测硬件，找到启动设备
2. **Bootloader 阶段**：GRUB2 加载内核镜像和 initramfs 到内存
3. **内核初始化**：解压内核、初始化硬件驱动、挂载 initramfs 作为临时根文件系统
4. **init/systemd 阶段**：内核启动第一个用户空间进程（PID 1），通常是 systemd
5. **系统初始化**：systemd 根据 target（运行级别）启动各种服务
6. **用户登录**：启动 getty 或 display manager，等待用户登录

### 2. systemd 和 SysVinit 有什么区别？

**答：**

| 特性 | SysVinit | systemd |
|------|----------|---------|
| 启动方式 | 串行启动 | 并行启动，速度更快 |
| 服务管理 | Shell 脚本 (/etc/init.d/) | Unit 文件 (.service) |
| 依赖管理 | 简单的启动顺序 | 声明式依赖关系 |
| 进程监控 | 不自动重启 | 支持自动重启（Restart=always） |
| 日志系统 | syslog | journald（结构化日志） |
| 运行级别 | runlevel 0-6 | target (multi-user.target, graphical.target 等) |
| 配置 | Shell 脚本 | INI 风格的 unit 文件 |

### 3. Linux 的运行级别有哪些？

**答：**

| 运行级别 | systemd target | 说明 |
|----------|---------------|------|
| 0 | poweroff.target | 关机 |
| 1 | rescue.target | 单用户模式（维护） |
| 2 | multi-user.target | 多用户（无NFS） |
| 3 | multi-user.target | 多用户命令行模式 |
| 4 | multi-user.target | 未使用/自定义 |
| 5 | graphical.target | 图形界面模式 |
| 6 | reboot.target | 重启 |

---

## 二、文件系统

### 4. Linux 的目录结构是怎样的？各主要目录的作用？

**答：**

```
/           根目录
├── /bin    基本命令（ls, cp, mv 等），所有用户可用
├── /sbin   系统管理命令（fdisk, iptables 等），通常需要 root
├── /etc    系统配置文件
├── /home   普通用户的家目录
├── /root   root 用户的家目录
├── /var    可变数据（日志、邮件、缓存等）
├── /tmp    临时文件，重启后可能被清空
├── /usr    用户程序和数据（类似 Windows 的 Program Files）
├── /opt    第三方可选软件安装目录
├── /dev    设备文件
├── /proc   虚拟文件系统，内核和进程信息
├── /sys    虚拟文件系统，硬件设备信息
├── /mnt    临时挂载点
├── /media  可移动设备自动挂载点
├── /boot   启动相关文件（内核、GRUB）
└── /lib    共享库文件
```

### 5. 软链接和硬链接有什么区别？

**答：**

| 特性 | 硬链接 (Hard Link) | 软链接 (Symbolic Link) |
|------|-------------------|----------------------|
| 创建命令 | `ln source link` | `ln -s source link` |
| inode | 与源文件共享同一个 inode | 有独立的 inode |
| 能否跨文件系统 | 不能 | 能 |
| 能否链接目录 | 不能（防循环） | 能 |
| 源文件删除后 | 硬链接仍可访问数据 | 软链接失效（悬空链接） |
| 文件大小 | 与源文件相同 | 存储的是路径字符串的大小 |
| 本质 | 同一个文件的不同文件名 | 指向另一个文件路径的快捷方式 |

### 6. 常见的 Linux 文件系统有哪些？它们的区别是什么？

**答：**

| 文件系统 | 特点 | 适用场景 |
|---------|------|---------|
| ext4 | 稳定成熟，支持最大1EB卷、16TB文件，有日志功能 | 通用Linux系统，最常用 |
| XFS | 高性能，擅长处理大文件，支持并行I/O | 大文件、数据库、高性能场景 |
| Btrfs | 支持快照、压缩、RAID、子卷 | 需要快照和高级特性的场景 |
| ZFS | 高级文件系统+卷管理，数据完整性校验 | 存储服务器、NAS |
| tmpfs | 基于内存的文件系统 | /tmp, /run 等临时存储 |

### 7. inode 是什么？

**答：** inode（索引节点）是 Linux 文件系统中用于存储文件元数据的数据结构。每个文件都有一个唯一的 inode 号。

inode 包含的信息：
- 文件类型和权限
- 所有者（UID）和所属组（GID）
- 文件大小
- 时间戳（atime/mtime/ctime）
- 数据块指针（指向实际数据存储位置）
- 硬链接计数

**注意：** inode 不存储文件名。文件名存储在目录项（dentry）中，目录项将文件名映射到 inode 号。

查看 inode 信息：
```bash
ls -i file.txt        # 查看 inode 号
stat file.txt          # 查看详细 inode 信息
df -i                  # 查看 inode 使用情况
```

---

## 三、用户和权限管理

### 8. Linux 文件权限如何表示？

**答：** Linux 使用 UGO（User/Group/Other）模型，每组有读（r=4）、写（w=2）、执行（x=1）权限。

```
-rwxr-xr--  1 user group 4096 Jan 1 00:00 file.txt
│├─┤├─┤├─┤
│ │   │  └── Other 权限：r-- (4)
│ │   └───── Group 权限：r-x (5)
│ └───────── User 权限：rwx (7)
└──────────── 文件类型：- 普通文件, d 目录, l 链接
```

常用命令：
```bash
chmod 755 file.txt             # 数字方式修改权限
chmod u+x,g-w file.txt        # 符号方式修改权限
chown user:group file.txt      # 修改所有者和组
```

### 9. 什么是 SUID、SGID 和 Sticky Bit？

**答：**

| 特殊权限 | 数字 | 作用 | 示例 |
|---------|------|------|------|
| SUID | 4 | 文件执行时以文件所有者身份运行 | `/usr/bin/passwd`（普通用户修改密码） |
| SGID | 2 | 文件执行时以文件所属组运行；目录中新建文件继承目录的组 | 团队共享目录 |
| Sticky Bit | 1 | 目录中的文件只能由所有者或 root 删除 | `/tmp` 目录 |

```bash
chmod 4755 file    # 设置 SUID
chmod 2755 dir     # 设置 SGID
chmod 1777 dir     # 设置 Sticky Bit

ls -la /tmp
# drwxrwxrwt   表示设置了 Sticky Bit（t）
ls -la /usr/bin/passwd
# -rwsr-xr-x   表示设置了 SUID（s）
```

### 10. /etc/passwd 和 /etc/shadow 文件的格式？

**答：**

**/etc/passwd** 格式（所有人可读）：
```
username:x:UID:GID:comment:home_dir:shell
# 示例：
root:x:0:0:root:/root:/bin/bash
```

**/etc/shadow** 格式（仅 root 可读，存储密码哈希）：
```
username:password_hash:lastchange:min:max:warn:inactive:expire:reserved
# 示例：
root:$6$xxxx...:18000:0:99999:7:::
```

- `$6$` 表示 SHA-512 哈希算法
- `$5$` 表示 SHA-256
- `$1$` 表示 MD5（不安全，已弃用）

### 11. 如何管理用户和用户组？

**答：**

```bash
# 用户管理
useradd -m -s /bin/bash -G docker,sudo username   # 创建用户
usermod -aG docker username     # 将用户添加到附加组（-a 追加）
userdel -r username             # 删除用户及其家目录
passwd username                 # 修改密码
id username                     # 查看用户 ID 和组信息

# 用户组管理
groupadd devops                 # 创建组
groupdel devops                 # 删除组
gpasswd -a user group           # 添加用户到组
gpasswd -d user group           # 从组中删除用户
groups username                 # 查看用户所属的组
```

### 12. sudo 和 su 的区别？

**答：**

| 特性 | su | sudo |
|------|-----|------|
| 全称 | Switch User | Super User Do |
| 密码 | 需要目标用户的密码 | 需要当前用户的密码 |
| 权限 | 切换到完整用户环境 | 临时以其他用户身份执行命令 |
| 日志 | 无详细日志 | 记录所有操作到 /var/log/auth.log |
| 配置 | 无需配置 | /etc/sudoers 文件配置 |
| 安全性 | 需要分享 root 密码 | 无需知道 root 密码 |

sudoers 配置示例：
```bash
visudo   # 安全编辑 /etc/sudoers
# 语法：用户/组  主机=(身份)  命令
username ALL=(ALL:ALL) ALL           # 完全 sudo 权限
%devops ALL=(ALL) NOPASSWD: ALL      # devops 组免密码 sudo
```

---

## 四、进程管理

### 13. 进程和线程的区别？

**答：**

| 特性 | 进程 | 线程 |
|------|------|------|
| 定义 | 资源分配的基本单位 | CPU调度的基本单位 |
| 内存空间 | 独立的地址空间 | 共享进程的地址空间 |
| 通信方式 | IPC（管道、信号、共享内存、Socket等） | 直接读写共享数据 |
| 创建开销 | 大（需要复制资源） | 小（共享进程资源） |
| 崩溃影响 | 不影响其他进程 | 一个线程崩溃可能导致整个进程崩溃 |

### 14. 常见进程状态有哪些？

**答：**

| 状态 | 符号 | 说明 |
|------|------|------|
| Running | R | 正在运行或在运行队列中 |
| Sleeping | S | 可中断睡眠，等待事件 |
| Disk Sleep | D | 不可中断睡眠，等待I/O（不响应信号） |
| Stopped | T | 已停止（收到 SIGSTOP 或 Ctrl+Z） |
| Zombie | Z | 已终止但父进程未回收其状态 |
| Dead | X | 已完全退出 |

### 15. 常见信号有哪些？

**答：**

| 信号 | 编号 | 说明 | 能否捕获 |
|------|------|------|---------|
| SIGHUP | 1 | 终端挂起，常用于让进程重新加载配置 | 能 |
| SIGINT | 2 | 中断（Ctrl+C） | 能 |
| SIGQUIT | 3 | 退出并生成 core dump | 能 |
| SIGKILL | 9 | 强制终止，不能被捕获或忽略 | **不能** |
| SIGTERM | 15 | 优雅终止（默认信号） | 能 |
| SIGSTOP | 19 | 暂停进程 | **不能** |
| SIGCONT | 18 | 继续被暂停的进程 | 能 |

```bash
kill PID            # 发送 SIGTERM
kill -9 PID         # 发送 SIGKILL（强制杀死）
kill -HUP PID       # 发送 SIGHUP（重载配置）
killall nginx       # 按进程名杀死
pkill -f "python"   # 按模式杀死
```

### 16. 如何查看和管理进程？

**答：**

```bash
# 查看进程
ps aux                          # 查看所有进程（BSD风格）
ps -ef                          # 查看所有进程（System V风格）
ps -ef | grep nginx             # 过滤特定进程
top                             # 实时查看进程（交互式）
htop                            # 增强版 top
pstree                          # 以树形结构显示进程

# 后台任务管理
command &                       # 后台运行
nohup command &                 # 后台运行且不受终端关闭影响
jobs                            # 查看后台任务
fg %1                           # 将后台任务 1 切换到前台
bg %1                           # 将暂停的任务 1 恢复到后台运行
Ctrl+Z                          # 暂停当前前台进程

# 系统资源
uptime                          # 系统运行时间和负载
free -h                         # 内存使用情况
vmstat 1                        # 虚拟内存统计
iostat -x 1                     # I/O 统计
```

### 17. 什么是僵尸进程？如何处理？

**答：** 僵尸进程是已经终止运行但其父进程尚未调用 `wait()` 系统调用来回收其退出状态的进程。它保留在进程表中占用一个 PID 条目。

**危害：** 大量僵尸进程会耗尽 PID 资源。

**处理方法：**
```bash
# 查找僵尸进程
ps aux | grep 'Z'

# 找到僵尸进程的父进程
ps -o ppid= -p <zombie_pid>

# 杀死父进程（僵尸进程会被 init/systemd 接管并回收）
kill -9 <parent_pid>
```

### 18. 什么是负载（Load Average）？如何判断系统是否过载？

**答：** Load Average 表示单位时间内系统中处于可运行状态（R）和不可中断睡眠状态（D）的进程平均数。

```bash
uptime
# 输出：load average: 1.20, 2.50, 3.10
#                      1分钟  5分钟  15分钟
```

**判断标准：**
- 单核 CPU：负载 > 1 表示过载
- 多核 CPU：负载 > CPU核心数 表示过载
- 例如 4 核 CPU，负载 > 4 就需要关注

```bash
# 查看 CPU 核心数
nproc
cat /proc/cpuinfo | grep "processor" | wc -l
lscpu
```

---

## 五、磁盘和存储管理

### 19. 常用的磁盘管理命令有哪些？

**答：**

```bash
# 磁盘空间
df -h                   # 查看文件系统磁盘空间使用情况
df -i                   # 查看 inode 使用情况
du -sh /var/log         # 查看目录/文件大小
du -sh * | sort -rh     # 按大小排序当前目录下的文件/目录

# 磁盘信息
lsblk                   # 列出块设备
fdisk -l                # 列出磁盘分区
blkid                   # 查看分区 UUID 和文件系统类型

# 挂载管理
mount /dev/sdb1 /mnt    # 挂载分区
umount /mnt             # 卸载
# /etc/fstab 实现开机自动挂载
```

### 20. LVM 是什么？有什么优势？

**答：** LVM（Logical Volume Manager）是 Linux 下的逻辑卷管理器，在物理磁盘和文件系统之间提供了一层抽象。

**核心概念：**
- **PV (Physical Volume)**：物理卷，对应磁盘或分区
- **VG (Volume Group)**：卷组，由多个PV组成的存储池
- **LV (Logical Volume)**：逻辑卷，从VG中划分出来，格式化后使用

**优势：**
- 动态扩展和缩减卷大小，无需停机
- 跨多个物理磁盘创建逻辑卷
- 支持快照功能

```bash
# 创建 LVM
pvcreate /dev/sdb /dev/sdc       # 创建物理卷
vgcreate myvg /dev/sdb /dev/sdc  # 创建卷组
lvcreate -L 50G -n mylv myvg     # 创建逻辑卷
mkfs.ext4 /dev/myvg/mylv         # 格式化

# 扩展
lvextend -L +10G /dev/myvg/mylv  # 扩展逻辑卷
resize2fs /dev/myvg/mylv         # 扩展 ext4 文件系统（在线）
```

### 21. RAID 有哪些常见级别？

**答：**

| RAID级别 | 最少磁盘数 | 数据保护 | 可用空间 | 特点 |
|---------|-----------|---------|---------|------|
| RAID 0 | 2 | 无 | N*磁盘大小 | 条带化，速度快，无冗余 |
| RAID 1 | 2 | 镜像 | N/2*磁盘大小 | 镜像，写性能略低 |
| RAID 5 | 3 | 分布式奇偶校验 | (N-1)*磁盘大小 | 允许1块盘故障 |
| RAID 6 | 4 | 双重奇偶校验 | (N-2)*磁盘大小 | 允许2块盘故障 |
| RAID 10 | 4 | 镜像+条带 | N/2*磁盘大小 | RAID 1+0，性能和冗余都好 |

---

## 六、网络配置

### 22. 常用的网络排查命令有哪些？

**答：**

```bash
# 网络配置
ip addr show                    # 查看 IP 地址（替代 ifconfig）
ip route show                   # 查看路由表
ip link set eth0 up/down        # 启用/禁用网卡

# 连通性测试
ping -c 4 8.8.8.8              # ICMP 连通性测试
traceroute 8.8.8.8             # 路由跟踪
mtr 8.8.8.8                    # 综合 ping 和 traceroute

# 端口和连接
ss -tulnp                       # 查看监听端口（替代 netstat）
ss -s                           # 连接统计
netstat -tunlp                  # 查看监听端口（旧命令）
lsof -i :80                     # 查看使用 80 端口的进程

# DNS
dig example.com                 # DNS 查询
nslookup example.com            # DNS 查询
host example.com                # DNS 查询
cat /etc/resolv.conf            # DNS 配置

# 抓包
tcpdump -i eth0 port 80         # 抓取 eth0 上 80 端口的包
tcpdump -i any -w capture.pcap  # 抓包保存为文件

# 网络测试
curl -v https://example.com     # HTTP 请求（详细输出）
wget https://example.com        # 下载文件
telnet host port                # 测试端口连通性
nc -zv host port                # 测试端口连通性
```

### 23. iptables 和 firewalld 的区别？

**答：**

| 特性 | iptables | firewalld |
|------|----------|-----------|
| 模式 | 静态规则，修改后需重新加载全部规则 | 动态管理，可不中断现有连接 |
| 配置方式 | 命令行规则链 | 区域（zone）和服务概念 |
| 后端 | 直接操作 netfilter | 底层仍使用 iptables/nftables |
| 持久化 | 需要手动保存 | 使用 --permanent 参数 |

```bash
# iptables 示例
iptables -A INPUT -p tcp --dport 80 -j ACCEPT    # 允许 80 端口
iptables -A INPUT -s 10.0.0.0/8 -j DROP          # 拒绝来源
iptables -L -n                                     # 查看规则
iptables-save > /etc/iptables/rules.v4            # 保存规则

# firewalld 示例
firewall-cmd --zone=public --add-port=80/tcp --permanent
firewall-cmd --zone=public --add-service=http --permanent
firewall-cmd --reload
firewall-cmd --list-all
```

### 24. TCP 三次握手和四次挥手的过程？

**答：**

**三次握手（建立连接）：**

```
客户端                     服务器
  |--- SYN (seq=x) ------>|     1. 客户端发送 SYN
  |<-- SYN+ACK (seq=y,    |     2. 服务器回复 SYN+ACK
  |    ack=x+1) ----------|
  |--- ACK (ack=y+1) ---->|     3. 客户端发送 ACK，连接建立
```

**四次挥手（断开连接）：**

```
客户端                     服务器
  |--- FIN (seq=u) ------>|     1. 客户端发送 FIN，请求关闭
  |<-- ACK (ack=u+1) -----|     2. 服务器确认收到
  |<-- FIN (seq=w) --------|     3. 服务器发送 FIN，请求关闭
  |--- ACK (ack=w+1) ---->|     4. 客户端确认，等待 2MSL 后关闭
```

---

## 七、常用命令速查

### 25. 文本处理三剑客 grep、sed、awk

**答：**

```bash
# grep - 文本搜索
grep "error" /var/log/syslog         # 搜索包含 error 的行
grep -i "error" file                  # 忽略大小写
grep -r "TODO" /src                   # 递归搜索目录
grep -c "error" file                  # 统计匹配行数
grep -v "debug" file                  # 排除匹配行
grep -E "error|warning" file          # 正则（扩展）

# sed - 流编辑器
sed 's/old/new/g' file               # 全局替换
sed -i 's/old/new/g' file            # 原地修改
sed -n '5,10p' file                   # 打印第5-10行
sed '/^#/d' file                      # 删除注释行
sed '3a\new line' file                # 在第3行后追加

# awk - 文本分析
awk '{print $1, $3}' file            # 打印第1和第3列
awk -F: '{print $1}' /etc/passwd     # 指定分隔符
awk '$3 > 100 {print $0}' file       # 条件过滤
awk '{sum+=$1} END {print sum}' file # 求和
awk 'NR>=5 && NR<=10' file           # 打印第5-10行
```

### 26. find 命令的常见用法？

**答：**

```bash
find / -name "*.log"                          # 按名称查找
find / -iname "*.LOG"                         # 忽略大小写
find /var -size +100M                         # 大于 100MB 的文件
find /tmp -mtime +7                           # 7天前修改过的文件
find /tmp -mtime +7 -delete                   # 查找并删除
find / -type f -perm 777                      # 权限为 777 的文件
find / -user root -type f                     # root 用户的文件
find /var/log -name "*.log" -exec gzip {} \;  # 查找并压缩
find / -empty                                  # 空文件和空目录
```

### 27. 如何查看系统资源使用情况？

**答：**

```bash
# CPU
top / htop                   # 实时监控
mpstat -P ALL 1              # 每个CPU核心的使用率
sar -u 1 5                   # CPU 使用率统计

# 内存
free -h                      # 内存使用概览
cat /proc/meminfo            # 详细内存信息
vmstat 1                     # 虚拟内存统计

# 磁盘
df -h                        # 磁盘空间使用
iostat -x 1                  # 磁盘 I/O 统计
iotop                        # 按进程查看 I/O

# 网络
iftop                        # 实时网络流量
nethogs                      # 按进程查看网络流量
ss -s                        # 连接统计

# 综合
dstat                        # CPU/内存/磁盘/网络综合监控
sar                          # 系统活动报告
```

---

## 八、系统管理

### 28. crontab 定时任务的格式？

**答：**

```
*    *    *    *    *  command
分   时   日   月   周
(0-59)(0-23)(1-31)(1-12)(0-7, 0和7都是周日)
```

示例：
```bash
# 每天凌晨 2 点执行备份
0 2 * * * /opt/scripts/backup.sh

# 每 5 分钟执行一次
*/5 * * * * /opt/scripts/check.sh

# 每周一到周五 9:30 执行
30 9 * * 1-5 /opt/scripts/report.sh

# 每月 1 号和 15 号凌晨执行
0 0 1,15 * * /opt/scripts/cleanup.sh

# 管理命令
crontab -e               # 编辑当前用户的 crontab
crontab -l               # 列出当前用户的定时任务
crontab -r               # 删除所有定时任务
```

### 29. systemd 服务管理常用命令？

**答：**

```bash
# 服务管理
systemctl start nginx          # 启动服务
systemctl stop nginx           # 停止服务
systemctl restart nginx        # 重启服务
systemctl reload nginx         # 重新加载配置（不中断服务）
systemctl status nginx         # 查看服务状态
systemctl enable nginx         # 开机自启动
systemctl disable nginx        # 取消开机自启动
systemctl is-active nginx      # 是否正在运行
systemctl is-enabled nginx     # 是否开机自启

# 查看日志
journalctl -u nginx            # 查看 nginx 服务日志
journalctl -u nginx -f         # 实时跟踪日志
journalctl -u nginx --since "1 hour ago"  # 最近1小时
journalctl -p err              # 只看错误级别日志

# 系统管理
systemctl list-units --type=service        # 列出所有服务
systemctl list-units --type=service --state=running  # 运行中的服务
systemctl daemon-reload        # 重新加载 unit 文件（修改后需要）
```

### 30. 如何编写一个 systemd 服务文件？

**答：**

创建 `/etc/systemd/system/myapp.service`：

```ini
[Unit]
Description=My Application
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=appuser
Group=appgroup
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/bin/start.sh
ExecStop=/opt/myapp/bin/stop.sh
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5
LimitNOFILE=65535
Environment=ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# 启用并启动
systemctl daemon-reload
systemctl enable --now myapp.service
```

---

## 九、日志管理

### 31. Linux 常见日志文件有哪些？

**答：**

| 日志文件 | 说明 |
|---------|------|
| /var/log/syslog | 系统日志（Debian/Ubuntu） |
| /var/log/messages | 系统日志（RHEL/CentOS） |
| /var/log/auth.log | 认证日志（登录、sudo 等） |
| /var/log/secure | 安全日志（RHEL/CentOS） |
| /var/log/kern.log | 内核日志 |
| /var/log/dmesg | 设备驱动日志 |
| /var/log/boot.log | 启动日志 |
| /var/log/cron | 定时任务日志 |
| /var/log/nginx/ | Nginx 日志 |

### 32. 如何实时查看日志和日志分析？

**答：**

```bash
# 实时查看
tail -f /var/log/syslog                  # 实时跟踪日志
tail -f /var/log/syslog | grep error     # 实时过滤错误
journalctl -f                             # journald 实时日志

# 日志分析
# 统计 HTTP 状态码
awk '{print $9}' access.log | sort | uniq -c | sort -rn

# 统计 IP 访问次数
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head 20

# 查找最近 1 小时的错误
find /var/log -name "*.log" -mmin -60 -exec grep -l "error" {} \;

# 日志轮转配置 /etc/logrotate.d/myapp
/var/log/myapp/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 root root
    postrotate
        systemctl reload myapp
    endscript
}
```

---

## 十、性能调优

### 33. 如何排查 Linux 系统性能问题？

**答：** 遵循 **USE 方法**（Utilization 利用率、Saturation 饱和度、Errors 错误）：

```bash
# 1. 整体情况
uptime                      # 负载
dmesg | tail                # 内核错误
vmstat 1 5                  # 综合状态

# 2. CPU 分析
top -H                      # 按线程查看 CPU
pidstat 1                   # 按进程 CPU 使用率
perf top                    # CPU 性能分析

# 3. 内存分析
free -h                     # 内存使用
slabtop                     # 内核 slab 缓存
cat /proc/meminfo           # 详细内存信息

# 4. 磁盘 I/O 分析
iostat -xz 1                # 磁盘 I/O 详细统计
iotop -o                    # 按进程 I/O（只显示有 I/O 的）

# 5. 网络分析
sar -n DEV 1                # 网络设备统计
sar -n TCP,ETCP 1           # TCP 统计

# 6. 进程分析
strace -p PID               # 系统调用跟踪
ltrace -p PID               # 库调用跟踪
```

### 34. Linux 内核参数调优有哪些常见项？

**答：**

```bash
# /etc/sysctl.conf 或 /etc/sysctl.d/*.conf

# 网络优化
net.core.somaxconn = 65535                       # 监听队列最大长度
net.ipv4.tcp_max_syn_backlog = 65535             # SYN 队列长度
net.ipv4.tcp_tw_reuse = 1                        # 重用 TIME_WAIT 连接
net.ipv4.ip_local_port_range = 1024 65535        # 本地端口范围
net.core.netdev_max_backlog = 65535              # 网络设备积压队列

# 文件描述符
fs.file-max = 2097152                            # 系统最大文件描述符数

# 内存
vm.swappiness = 10                               # 减少使用 swap（0-100）
vm.overcommit_memory = 1                         # 允许内存过量分配

# 应用生效
sysctl -p
```
