# Chaos Monkey 与 Netflix 实践八股文

---

## 一、Netflix 混沌工程起源

### 1. Netflix 混沌工程的起源和背景是什么？

**答：**

```
2010 年，Netflix 迁移至 AWS 云平台
面临新挑战：云环境中实例随时可能失败

核心理念：
  "如果无法避免故障，那就拥抱故障"
  "与其害怕故障，不如天天制造故障"

发展时间线：
  2010 - Chaos Monkey 诞生（随机 Kill 实例）
  2012 - Simian Army 系列工具发布
  2014 - Chaos Kong（模拟整个区域故障）
  2015 - FIT（故障注入测试框架）
  2017 - ChAP（混沌自动化平台）
  2019 - 开源社区蓬勃发展
```

### 2. Simian Army（猿猴军团）包含哪些工具？

**答：**

| 名称 | 功能 | 模拟的故障 |
|------|------|-----------|
| **Chaos Monkey** | 随机终止实例 | 单实例故障 |
| **Chaos Gorilla** | 模拟 AZ 故障 | 可用区失效 |
| **Chaos Kong** | 模拟 Region 故障 | 整个区域失效 |
| **Latency Monkey** | 注入网络延迟 | 网络劣化 |
| **Doctor Monkey** | 健康检查 | 检测不健康实例 |
| **Janitor Monkey** | 清理无用资源 | 资源管理 |
| **Conformity Monkey** | 合规检查 | 配置不合规 |

### 3. Chaos Monkey 的工作原理是什么？

**答：**

```
Chaos Monkey 工作流程：

 工作日 9:00-15:00（工作时间内）
       │
       ▼
 随机选择一个 ASG (Auto Scaling Group)
       │
       ▼
 随机选择该 ASG 中的一个实例
       │
       ▼
 终止该实例
       │
       ▼
 ASG 自动拉起新实例
       │
       ▼
 验证服务恢复

关键设计决策：
  ┌──────────────────────────────────────┐
  │ 1. 只在工作日工作时间运行            │
  │    → 确保有人可以响应                │
  │ 2. 随机选择目标                      │
  │    → 没有团队可以"作弊"             │
  │ 3. 默认开启                          │
  │    → Opt-out 而非 Opt-in            │
  │ 4. 只 Kill 单个实例                  │
  │    → 最小化爆炸半径                  │
  └──────────────────────────────────────┘
```

---

## 二、Netflix 实践深入

### 4. Netflix 的 ChAP 平台是什么？

**答：**

```
ChAP = Chaos Automation Platform（混沌自动化平台）

ChAP 的工作原理：

  ┌──────────────────────────┐
  │   正常流量              │
  │   ┌──────┐  ┌──────┐    │
  │   │ 对照组 │  │ 实验组 │  │
  │   │ (无故障)│ │(有故障) │  │
  │   └───┬──┘  └───┬──┘    │
  │       │         │        │
  │   ┌───▼─────────▼───┐   │
  │   │  对比分析引擎    │   │
  │   │ (SLI/SLO 差异)  │   │
  │   └──────────────────┘   │
  └──────────────────────────┘

ChAP 优势：
  1. A/B 测试式的实验
     - 对照组：正常流量
     - 实验组：注入故障的流量
     - 自动对比两组的 SLI

  2. 自动化程度高
     - 自动选择实验范围
     - 自动注入故障
     - 自动分析结果
     - 自动停止（安全阈值）

  3. 持续运行
     - 与 CI/CD 集成
     - 每次部署自动验证
```

### 5. Netflix 的混沌工程最佳实践有哪些？

**答：**

```
Netflix 关键实践：

1. 默认参与（Opt-out）
   所有服务默认参与混沌实验
   除非有特殊原因申请豁免

2. 工作时间实验
   只在有人值班时运行
   避免半夜无人响应

3. 从小到大
   Single Instance → AZ → Region
   Chaos Monkey → Chaos Gorilla → Chaos Kong

4. 真实生产流量
   不用模拟流量
   用真实用户流量做 A/B 对比

5. 文化驱动
   混沌工程是工程文化一部分
   不是惩罚，是学习

6. 自动化优先
   人工 GameDay 是补充
   主力是自动化混沌平台
```

---

## 三、开源 Chaos Monkey 使用

### 6. 如何使用开源 Chaos Monkey？

**答：**

```
Spinnaker Chaos Monkey 配置：

# chaos-monkey.properties
# 启用 Chaos Monkey
chaos.monkey.enabled=true

# 仅在工作日运行
chaos.monkey.schedule.enabled=true
chaos.monkey.schedule.calendar.openHour=9
chaos.monkey.schedule.calendar.closeHour=15
chaos.monkey.schedule.calendar.timezone=America/Los_Angeles

# 终止概率（每天检查每个 ASG）
chaos.monkey.probability=1.0

# 按 ASG 分组
chaos.monkey.grouping.type=ASG
```

```yaml
# Kubernetes 上的替代方案：kube-monkey
apiVersion: v1
kind: ConfigMap
metadata:
  name: kube-monkey-config
data:
  config.toml: |
    [kubemonkey]
    run_hour = 8
    start_hour = 10
    end_hour = 16
    grace_period_sec = 5
    cluster_dns_name = "cluster.local"
    whitelisted_namespaces = ["production"]
    
    [debug]
    enabled = true
    schedule_immediate_kill = false
```

### 7. 面试题：为什么 Netflix 选择在生产环境运行 Chaos Monkey？

**答：**

```
原因：

1. 测试环境 ≠ 生产环境
   ├── 流量模式不同
   ├── 数据规模不同
   ├── 配置可能不同
   └── 网络拓扑不同

2. 只有生产才能发现真实问题
   ├── 依赖服务的真实行为
   ├── 真实的故障传播路径
   └── 真实的用户影响

3. 安全措施保障
   ├── 只 Kill 单个实例
   ├── 有自动停止机制
   ├── 只在工作时间
   └── ASG 会自动恢复

关键引用：
  "We found that the best defense against 
   major unexpected failures is to fail 
   often. By constantly causing failures, 
   we force our services to be built in a 
   way that is more resilient."
   — Netflix Tech Blog
```
