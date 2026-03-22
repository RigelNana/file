# Linux 系统与性能调优八股文

---

## 一、性能分析方法论

### 1. USE 方法是什么？如何应用？

**答：** USE 方法由 Brendan Gregg 提出，针对**每种资源**检查三个维度：

- **U**tilization（利用率）：资源忙碌的时间比例
- **S**aturation（饱和度）：资源的排队/等待程度
- **E**rrors（错误）：错误事件的数量

| 资源 | 利用率 | 饱和度 | 错误 |
|------|--------|--------|------|
| **CPU** | `mpstat`（%usr+%sys） | 运行队列长度（`vmstat r`） | `perf stat` 硬件错误 |
| **内存** | `free`（used/total） | 交换活动（`vmstat si/so`） | `dmesg` OOM 错误 |
| **磁盘** | `iostat`（%util） | 等待队列（`avgqu-sz`） | `/sys/` 设备错误 |
| **网络** | `sar -n DEV`（带宽） | 重传/丢包 | `ifconfig` 错误计数 |

### 2. RED 方法是什么？适用于什么场景？

**答：** RED 方法面向**请求驱动型服务**（微服务）：

- **R**ate：每秒请求数（QPS）
- **E**rrors：每秒错误数
- **D**uration：请求耗时分布（P50/P95/P99）

USE vs RED：
- USE → 面向**资源**（CPU、内存、磁盘、网络）
- RED → 面向**服务**（API、微服务）

---

## 二、CPU 与内存

### 3. CPU 性能分析的步骤是什么？

**答：**

```
1. uptime           → 查看负载均值（1/5/15分钟）
2. mpstat -P ALL 1  → 各核 CPU 使用率分布
3. pidstat 1        → 各进程 CPU 使用明细
4. perf top         → 实时查看热点函数
5. perf record/report → 采样分析 CPU 火焰图
```

**CPU 使用率高的常见原因：**
- 用户态高（%usr）→ 应用逻辑问题、死循环
- 内核态高（%sys）→ 系统调用频繁、锁竞争
- IO 等待高（%iowait）→ 磁盘 IO 瓶颈
- 软中断高（%soft）→ 网络包处理量大

### 4. 内存管理中 Page Cache 和 Buffer Cache 的区别？

**答：**

| 缓存 | 对象 | 说明 |
|------|------|------|
| **Page Cache** | 文件内容 | 缓存文件数据，加速读操作 |
| **Buffer Cache** | 磁盘块 | 缓存原始磁盘块数据 |

`free -h` 输出：
- **used**：实际使用的内存
- **buff/cache**：Buffer + Page Cache
- **available**：可供新进程使用的内存（包含可回收的缓存）

---

## 三、高级追踪

### 5. 什么是 eBPF？SRE 如何使用 eBPF？

**答：** eBPF（extended Berkeley Packet Filter）是 Linux 内核中的**可编程虚拟机**，允许在不修改内核源码的情况下在内核中运行自定义代码。

| 工具集 | 说明 | 典型工具 |
|--------|------|----------|
| **BCC** | Python 前端的 eBPF 工具集 | `execsnoop`, `opensnoop`, `tcplife` |
| **bpftrace** | 高级追踪语言 | 类似 awk 的 eBPF 脚本 |
| **libbpf** | C 语言库 | 高性能 eBPF 程序 |

**SRE 常用场景：**
- `execsnoop`：追踪新进程创建
- `tcplife`：追踪 TCP 连接生命周期
- `biolatency`：磁盘 IO 延迟分布
- `runqlat`：CPU 运行队列延迟
- 自定义探针：追踪特定应用函数调用
