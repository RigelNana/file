# Linux常用命令

---

## 1. 文件与目录操作？

**回答：**

```
基础命令：
  ┌──────────────┬──────────────────────────────┐
  │ 命令          │ 用途                          │
  ├──────────────┼──────────────────────────────┤
  │ ls -la       │ 列出文件（含隐藏和详情）      │
  │ cd / pwd     │ 切换/显示目录                 │
  │ cp -r        │ 复制（递归目录）              │
  │ mv           │ 移动/重命名                   │
  │ rm -rf       │ 删除（递归+强制）             │
  │ mkdir -p     │ 创建目录（含父目录）          │
  │ find         │ 查找文件                      │
  │ ln -s        │ 创建软链接                    │
  │ chmod/chown  │ 修改权限/属主                 │
  │ du -sh       │ 查看目录大小                  │
  │ df -h        │ 查看磁盘空间                  │
  │ tree         │ 树形显示目录                  │
  └──────────────┴──────────────────────────────┘

find 常用：
  find / -name "*.log" -mtime +7 -delete  # 删7天前日志
  find . -type f -size +100M              # 找大文件
  find . -name "*.go" -exec grep "TODO" {} +

文件权限：
  rwxr-xr-- → 754
  r=4 w=2 x=1
  chmod 755 file   # rwxr-xr-x
  chmod u+x file   # 给属主加执行权限
```

---

## 2. 文本处理三剑客？

**回答：**

```
grep — 文本搜索：
  grep -r "error" /var/log/    # 递归搜索
  grep -n "pattern" file       # 显示行号
  grep -i "error" file         # 忽略大小写
  grep -v "debug" file         # 反向过滤
  grep -c "error" file         # 计数
  grep -E "err|warn" file      # 扩展正则

sed — 流编辑器：
  sed 's/old/new/g' file       # 替换
  sed -i 's/old/new/g' file    # 原地修改
  sed -n '10,20p' file         # 打印10-20行
  sed '/pattern/d' file        # 删除匹配行
  sed '3a\new line' file       # 第3行后插入

awk — 文本分析：
  awk '{print $1, $3}' file    # 打印第1,3列
  awk -F: '{print $1}' /etc/passwd  # 指定分隔符
  awk '$3 > 100' file          # 条件过滤
  awk '{sum+=$1} END {print sum}' file  # 求和
  awk 'NR==5' file             # 第5行

组合使用：
  # 统计 Nginx 访问 Top10 IP
  awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -10
```

---

## 3. 进程管理命令？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 命令          │ 用途                          │
  ├──────────────┼──────────────────────────────┤
  │ ps aux       │ 查看所有进程                  │
  │ ps -ef       │ 完整格式显示进程              │
  │ top / htop   │ 实时进程监控                  │
  │ kill -9 PID  │ 强制杀进程                    │
  │ kill -15 PID │ 优雅终止进程                  │
  │ killall name │ 按名杀进程                    │
  │ pgrep name   │ 按名查 PID                    │
  │ nohup cmd &  │ 后台运行（断开终端不退出）    │
  │ jobs / fg/bg │ 作业控制                      │
  │ & / disown   │ 后台运行 / 脱离终端           │
  │ lsof -i:8080 │ 查看端口被谁占用              │
  │ strace -p PID│ 追踪系统调用                  │
  └──────────────┴──────────────────────────────┘

进程状态含义（ps STAT列）：
  R：运行中   S：可中断睡眠
  D：不可中断  Z：僵尸进程
  T：暂停      <：高优先级
  N：低优先级  s：会话Leader
  l：多线程    +：前台进程组

# 查找并杀死某进程
ps aux | grep myapp | grep -v grep | awk '{print $2}' | xargs kill -15
# 或更简洁
pkill -f myapp
```

---

## 4. 网络相关命令？

**回答：**

```
  ┌──────────────┬──────────────────────────────┐
  │ 命令          │ 用途                          │
  ├──────────────┼──────────────────────────────┤
  │ ip addr      │ 查看 IP 地址                  │
  │ ip route     │ 查看路由表                    │
  │ ss -tlnp     │ 查看监听端口（替代 netstat）  │
  │ ss -s        │ 连接统计摘要                  │
  │ ping         │ 连通性测试                    │
  │ traceroute   │ 路径追踪                      │
  │ curl -v      │ HTTP 请求调试                 │
  │ wget         │ 文件下载                      │
  │ dig / nslookup│ DNS 查询                     │
  │ tcpdump      │ 抓包                          │
  │ iptables -L  │ 查看防火墙规则                │
  │ nmap         │ 端口扫描                      │
  │ mtr          │ 持续追踪路由                  │
  └──────────────┴──────────────────────────────┘

tcpdump 常用：
  tcpdump -i eth0 port 80              # 抓 80 端口
  tcpdump -i eth0 host 10.0.0.1        # 抓指定主机
  tcpdump -i eth0 -w cap.pcap          # 保存为文件
  tcpdump -i eth0 'tcp[tcpflags] & tcp-syn != 0'  # SYN 包

ss 常用：
  ss -tlnp         # TCP 监听端口+进程
  ss -t state established  # 已建立连接
  ss -t state time-wait | wc -l  # TIME_WAIT 数量
```

---

## 5. 系统监控命令？

**回答：**

```
CPU 监控：
  top -1           # 看每个 CPU 核心
  mpstat -P ALL 1  # 每秒每 CPU 统计
  pidstat -u 1     # 进程级 CPU 使用

内存监控：
  free -h          # 内存概览
  vmstat 1         # 每秒系统统计
  pidstat -r 1     # 进程级内存使用
  cat /proc/meminfo # 详细内存信息

磁盘 IO：
  iostat -x 1      # 每秒磁盘 IO 统计
  iotop            # IO 版 top
  pidstat -d 1     # 进程级 IO 统计

综合工具：
  sar -u 1 5       # CPU 历史（5秒采样5次）
  sar -r 1         # 内存历史
  sar -n DEV 1     # 网络历史
  dstat            # vmstat+iostat+netstat

关键指标解读：
  top:
    us：用户态 CPU    sy：内核态 CPU
    wa：IO 等待       id：空闲

  vmstat:
    r：运行队列       b：不可中断进程
    si/so：swap in/out → 非零说明内存不足
    cs：上下文切换/秒

  iostat:
    %util：磁盘利用率 → >80% 说明 IO 繁忙
    await：IO 等待时间 → >10ms 需关注
```

---

## 6. 日志查看与分析？

**回答：**

```
日志查看命令：
  tail -f /var/log/syslog      # 实时追踪
  tail -100 app.log            # 最后100行
  head -50 app.log             # 前50行
  less app.log                 # 分页查看
  cat app.log | more           # 分页

  journalctl -u nginx -f       # systemd 日志
  journalctl --since "1 hour ago"
  journalctl -p err            # 只看错误

日志分析：
  # 统计错误数
  grep -c "ERROR" app.log

  # 统计每小时错误数
  grep "ERROR" app.log | awk '{print $2}' | cut -d: -f1 | uniq -c

  # 找出最近异常
  grep -A5 "Exception" app.log | tail -30

  # 实时过滤
  tail -f app.log | grep --line-buffered "ERROR"

  # 多文件搜索
  zgrep "error" /var/log/syslog*.gz  # 搜索压缩日志

重要日志位置：
  /var/log/syslog     → 系统日志
  /var/log/auth.log   → 认证日志
  /var/log/kern.log   → 内核日志
  /var/log/nginx/     → Nginx 日志
  /var/log/messages   → 通用消息
```

---

## 7. 磁盘与存储管理？

**回答：**

```
磁盘管理：
  lsblk               # 列出块设备
  fdisk -l             # 查看分区表
  df -h                # 文件系统使用情况
  du -sh /path         # 目录大小
  du -h --max-depth=1  # 一级子目录大小

  # 找大文件
  find / -type f -size +100M -exec ls -lh {} +
  du -a /var | sort -rn | head -20

LVM 管理：
  pvcreate /dev/sdb    # 创建物理卷
  vgcreate myvg /dev/sdb  # 创建卷组
  lvcreate -L 50G -n mylv myvg  # 创建逻辑卷
  lvextend -L +10G /dev/myvg/mylv  # 扩容

文件系统：
  mkfs.ext4 /dev/sdb1  # 格式化
  mount /dev/sdb1 /mnt # 挂载
  /etc/fstab           # 开机自动挂载

  # 检查修复文件系统
  fsck /dev/sdb1

RAID 级别：
  RAID0：条带化，性能好，无冗余
  RAID1：镜像，100%冗余，容量减半
  RAID5：条带+奇偶校验，允许坏1块盘
  RAID10：镜像+条带，性能+冗余
```

---

## 8. 用户与权限管理？

**回答：**

```
用户管理：
  useradd -m username   # 创建用户（含主目录）
  userdel -r username   # 删除用户
  passwd username        # 设置密码
  usermod -aG group user # 添加到组
  id username            # 查看用户信息

  /etc/passwd  → 用户信息
  /etc/shadow  → 密码哈希
  /etc/group   → 组信息

权限管理：
  chmod 755 file         # 数字方式
  chmod u+x,g-w file     # 符号方式
  chown user:group file  # 修改属主
  chgrp group file       # 修改属组

特殊权限：
  SUID (4xxx)：以文件属主身份执行
    chmod u+s /usr/bin/passwd
  SGID (2xxx)：以文件属组身份执行
    chmod g+s /shared/
  Sticky (1xxx)：只有属主能删除文件
    chmod +t /tmp/

sudo 配置：
  visudo  # 编辑 /etc/sudoers
  user ALL=(ALL) NOPASSWD: ALL
  %group ALL=(ALL) ALL

SSH 密钥管理：
  ssh-keygen -t ed25519
  ssh-copy-id user@host
  ~/.ssh/authorized_keys
```

---

## 9. systemd 服务管理？

**回答：**

```
systemctl 命令：
  systemctl start nginx       # 启动
  systemctl stop nginx        # 停止
  systemctl restart nginx     # 重启
  systemctl reload nginx      # 重载配置
  systemctl status nginx      # 查看状态
  systemctl enable nginx      # 开机自启
  systemctl disable nginx     # 取消自启
  systemctl is-active nginx   # 是否运行
  systemctl list-units --type=service  # 列出服务

自定义服务文件 /etc/systemd/system/myapp.service：
  [Unit]
  Description=My Application
  After=network.target

  [Service]
  Type=simple
  User=appuser
  WorkingDirectory=/opt/myapp
  ExecStart=/opt/myapp/bin/myapp
  ExecReload=/bin/kill -HUP $MAINPID
  Restart=on-failure
  RestartSec=5
  LimitNOFILE=65535

  [Install]
  WantedBy=multi-user.target

Type 类型：
  simple：默认，主进程即服务进程
  forking：fork 后台进程（传统 daemon）
  oneshot：执行一次性任务
  notify：启动完成后通知 systemd

重载服务文件：
  systemctl daemon-reload
```

---

## 10. Linux命令面试速答？

**回答：**

```
Q: 怎么查看端口占用？
A: ss -tlnp | grep 8080
   或 lsof -i:8080

Q: 怎么找大文件？
A: find / -type f -size +100M
   du -a / | sort -rn | head -20

Q: 统计文件行数？
A: wc -l file
   find . -name "*.go" | xargs wc -l

Q: 实时查看日志？
A: tail -f app.log
   journalctl -u nginx -f

Q: 怎么后台运行程序？
A: nohup ./app > app.log 2>&1 &
   或 systemd 服务

Q: 查看 CPU/内存/IO？
A: top / free -h / iostat -x 1
   综合：vmstat 1 / dstat

Q: 查看 TCP 连接状态分布？
A: ss -ant | awk '{print $1}' | sort | uniq -c

Q: 怎么排查进程 CPU 高？
A: top -Hp PID（看线程）
   perf top -p PID（看函数）
   strace -p PID（看系统调用）

Q: 文件权限 755 含义？
A: 属主 rwx / 属组 r-x / 其他 r-x

Q: grep/sed/awk 各用在什么场景？
A: grep 搜索 / sed 替换 / awk 列处理与统计
```
