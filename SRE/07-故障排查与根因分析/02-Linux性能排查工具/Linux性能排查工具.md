# Linux 性能排查工具八股文

---

## 一、核心工具集

### 1. Linux 性能排查工具全景图？

**答：**

```
Brendan Gregg 的 Linux 性能工具图谱：

┌─────────────────────────────────────────────┐
│                    应用层                     │
│  strace / ltrace / gdb / perf / flamegraph  │
├─────────────────────────────────────────────┤
│  CPU          │ 内存         │ 网络          │
│  top/htop     │ free         │ ss/netstat    │
│  mpstat       │ vmstat       │ iftop         │
│  pidstat      │ slabtop      │ tcpdump       │
│  perf top     │ pmap         │ nstat         │
│  sar -u       │ sar -r       │ sar -n        │
├───────────────┼──────────────┼───────────────┤
│  磁盘 IO      │ 文件系统      │ 综合          │
│  iostat       │ df/du        │ dmesg         │
│  iotop        │ lsof         │ sar           │
│  blktrace     │ fio          │ sysctl        │
│  sar -d       │ filefrag     │ /proc         │
└───────────────┴──────────────┴───────────────┘

排查优先级（USE 方法）：
  1. CPU → top, mpstat, pidstat
  2. Memory → free, vmstat
  3. Disk → iostat, iotop
  4. Network → ss, iftop
  5. 综合 → sar, dmesg
```

### 2. top/htop 的关键指标如何解读？

**答：**

```
top 输出解读：

top - 10:30:00 up 30 days, load average: 4.5, 3.2, 2.8
Tasks: 256 total, 3 running, 253 sleeping
%Cpu(s): 75.0 us, 10.0 sy, 0.0 ni, 12.0 id, 2.0 wa, 0.0 hi, 1.0 si
MiB Mem:  16384.0 total,  1024.0 free, 12288.0 used,  3072.0 buff/cache
MiB Swap:  4096.0 total,  3500.0 free,   596.0 used, 3500.0 avail Mem

关键字段解读：
  load average: 4.5, 3.2, 2.8
  → 1/5/15 分钟平均负载
  → 对比 CPU 核心数（如 4 核则 4.5 表示轻微过载）

  %Cpu:
  us=75%  → 用户态 CPU 高，应用忙
  sy=10%  → 内核态，系统调用多
  wa=2%   → IO 等待
  si=1%   → 软中断（网络处理）

红灯信号：
  load > CPU核心数 × 2  → 系统过载
  us + sy > 90%         → CPU 瓶颈
  wa > 20%              → IO 瓶颈
  swap used 持续增长     → 内存不足
```

### 3. vmstat 和 iostat 如何使用？

**答：**

```bash
# vmstat 每秒采样
$ vmstat 1 5
procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 3  0      0 102400  51200 204800    0    0     5   100 1500 3000 65 10 23  2  0
 5  1      0 100000  51200 204800    0    0     2  2000 2000 5000 80 12  5  3  0

关键列：
  r (run queue)   : 等待运行的进程数，> CPU核数说明 CPU 饱和
  b (blocked)     : 等待 IO 的进程数，> 0 说明有 IO 瓶颈
  si/so (swap)    : Swap 换入换出，> 0 说明内存不足
  bi/bo (block IO): 磁盘读写 blocks/s
  cs (context sw) : 上下文切换次数，过高说明进程竞争

# iostat 磁盘详情
$ iostat -xz 1
Device r/s  w/s  rkB/s  wkB/s  rrqm/s wrqm/s %rrqm %wrqm r_await w_await aqu-sz %util
sda    50   200  400    1600   5      20     9.1   9.1  1.5     5.0    1.2   85.0

关键列：
  r_await / w_await : 读/写平均等待时间(ms)，> 10ms 需关注
  aqu-sz           : 平均队列长度，> 1 说明磁盘繁忙
  %util            : 磁盘利用率，> 80% 需关注
```

---

## 二、进阶工具

### 4. strace 如何排查应用问题？

**答：**

```bash
# 跟踪进程的系统调用
strace -p <PID> -c  # 统计系统调用摘要

% time     seconds  usecs/call     calls    errors syscall
------ ----------- ----------- --------- --------- --------
 85.00    5.100000       51000       100           poll    ← 大量 poll 等待
  8.00    0.480000         480      1000           write
  5.00    0.300000          30     10000           read
  2.00    0.120000          12     10000           recvfrom

# 按时间跟踪
strace -p <PID> -T -e trace=network
# -T 显示每个调用耗时
# -e trace=network 只看网络调用

# 常见发现：
# 1. 大量 futex 调用 → 锁竞争
# 2. connect 超时 → 连接后端失败
# 3. read 返回 EAGAIN → 非阻塞IO繁忙
# 4. open 文件不存在 → 配置路径错误
```

### 5. perf 和火焰图如何定位 CPU 问题？

**答：**

```bash
# 采样 CPU 热点（30秒）
perf record -g -p <PID> -- sleep 30

# 查看报告
perf report

# 生成火焰图
perf script | stackcollapse-perf.pl | flamegraph.pl > cpu.svg

# 火焰图解读：
#
#   ┌─────────────────────────────┐
#   │    json.Marshal (30%)       │  ← 顶层 = 实际消耗 CPU
#   ├──────────┬──────────────────┤
#   │ handler  │  db.Query (25%) │  ← 调用链路
#   ├──────────┴──────────────────┤
#   │        http.Serve           │  ← 底层 = 入口函数
#   └─────────────────────────────┘
#
#   宽度 = CPU 占比
#   高度 = 调用栈深度
#   看最宽的"平顶" = CPU 瓶颈

# 常见发现：
# 1. JSON 序列化占比高 → 考虑换序列化库
# 2. GC 占比高 → 减少内存分配
# 3. syscall 占比高 → 减少系统调用
# 4. 锁等待占比高 → 优化并发
```

---

## 三、面试

### 6. 面试题：服务器 CPU 100%，如何排查？

**答：**

```
CPU 100% 排查步骤：

1. 确认哪个进程
   top -c  # 按 CPU 排序
   → 找到占用最高的进程 PID

2. 确认 CPU 使用模式
   mpstat -P ALL 1
   → us 高: 应用代码问题
   → sy 高: 系统调用频繁（锁/IO）
   → wa 高: 其实是 IO 问题

3. 如果是应用代码（us 高）
   # Java
   jstack <PID> → 查看线程栈
   # Go
   curl localhost:6060/debug/pprof/goroutine
   # 通用
   perf record -g -p <PID> -- sleep 30
   → 火焰图定位热点函数

4. 如果是系统调用（sy 高）
   strace -p <PID> -c
   → 看哪类系统调用最多
   → futex = 锁竞争
   → epoll_wait = 事件循环正常
   → mmap/brk = 频繁申请内存

5. 常见根因：
   - 死循环 / 正则回溯
   - GC 频繁（堆太小）
   - 锁竞争激烈
   - 连接风暴
```

### 7. 面试题：如何快速判断是 CPU/内存/IO/网络瓶颈？

**答：**

```
一分钟快速判断法：

uptime        → load average 高？
dmesg | tail  → 内核报错？OOM？
vmstat 1 3    → r 高(CPU)? b 高(IO)? si/so(内存)?
mpstat -P ALL → 哪个 CPU 核高? 均匀还是偏斜?
pidstat 1 3   → 哪个进程占资源?
iostat -xz 1  → %util 高(磁盘)? await 高?
free -m       → 内存够不够? Swap 使用?
sar -n DEV 1  → 网卡带宽打满?
ss -s         → 连接数异常? TIME_WAIT 多?
top           → 综合确认

结论矩阵：
  症状                    → 瓶颈
  us/sy CPU 高            → CPU
  free 低 + swap 高       → 内存
  wa 高 + %util 高        → 磁盘 IO
  网卡带宽满 / 丢包       → 网络
  load 高但 CPU 低        → IO 等待
```
