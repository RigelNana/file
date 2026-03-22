# Grafana 可视化与仪表盘八股文

---

## 一、Grafana 基础

### 1. Grafana 的核心概念有哪些？

**答：**

| 概念 | 描述 |
|------|------|
| **Dashboard** | 仪表盘，包含多个面板 |
| **Panel** | 面板，单个可视化组件 |
| **Data Source** | 数据源连接（Prometheus/ES/Loki） |
| **Variable** | 模板变量，实现动态筛选 |
| **Annotation** | 事件标注（发布/事故） |
| **Alert** | Grafana 内置告警 |
| **Folder** | 仪表盘目录组织 |

### 2. Grafana 支持哪些面板类型？各自适用场景？

**答：**

| 面板类型 | 适用场景 | 典型用例 |
|----------|----------|----------|
| **Time Series** | 时序趋势 | QPS、延迟趋势线 |
| **Stat** | 单值展示 | 当前错误率、SLO 状态 |
| **Gauge** | 仪表盘形 | 预算剩余百分比 |
| **Bar Gauge** | 条形仪表 | 各服务资源使用对比 |
| **Table** | 表格 | Top N 慢查询 |
| **Heatmap** | 热力图 | 延迟分布随时间变化 |
| **Pie Chart** | 饼图 | 错误类型分布 |
| **State Timeline** | 状态时间线 | 服务健康状态变化 |
| **Logs** | 日志面板 | Loki 日志展示 |
| **Traces** | 追踪面板 | Tempo 链路展示 |

### 3. Grafana 的模板变量（Variables）如何使用？

**答：**

```
变量类型：
  Query：从数据源动态获取（如所有服务名）
  Custom：自定义固定值列表
  Interval：时间间隔（$__interval）
  Datasource：数据源选择器

配置示例：
  变量名：service
  类型：Query
  查询：label_values(http_requests_total, service)

面板查询中使用：
  rate(http_requests_total{service="$service"}[$__rate_interval])

效果：下拉菜单选择不同服务，面板自动刷新
```

---

## 二、仪表盘设计

### 4. SRE 团队常用的仪表盘有哪些？

**答：**

| 仪表盘 | 受众 | 核心内容 |
|--------|------|----------|
| **SLO 概览** | 管理层/全团队 | SLO 状态、错误预算 |
| **服务黄金信号** | SRE/Dev | 延迟/流量/错误/饱和度 |
| **基础设施** | SRE/Ops | 节点 CPU/Mem/Disk/Net |
| **K8s 集群** | SRE | Pod/Node/Deployment 状态 |
| **On-Call** | 值班工程师 | 告警概览/快速定位 |
| **容量规划** | SRE Manager | 资源趋势/预测 |

### 5. 如何设计高效的 On-Call 仪表盘？

**答：**

```
On-Call 仪表盘设计原则：
  - 打开后 5 秒内判断系统状态
  - 30 秒内定位问题服务
  - 提供下钻链接到详细面板

布局：
┌──────────────────────────────────────┐
│ Row 1：全局状态（红绿灯）              │
│ 🟢API  🟡订单  🟢支付  🟢搜索  🔴推荐  │
├──────────────────────────────────────┤
│ Row 2：活跃告警列表                    │
│  [P1] 推荐服务 P99 延迟 > 2s  10m前   │
├───────────────────┬──────────────────┤
│ Row 3：流量和错误  │ 延迟趋势          │
│ [时序图]          │ [时序图]          │
├───────────────────┴──────────────────┤
│ Row 4：最近变更/发布                   │
│ 10:15 推荐服务 v3.2.1 发布             │
│ 09:30 搜索服务配置更新                 │
└──────────────────────────────────────┘
```

---

## 三、Grafana 高级功能

### 6. Grafana 的 Alerting 和 Prometheus Alertmanager 怎么选？

**答：**

| 对比 | Grafana Alerting | Prometheus Alertmanager |
|------|-----------------|----------------------|
| 数据源 | 支持多种数据源 | 仅 Prometheus |
| 配置方式 | Web UI | YAML 配置文件 |
| 可视化 | 直接在面板上配置 | 需要单独管理 |
| 功能 | 基础告警 | 完善（路由/抑制/静默） |
| 推荐 | 简单场景、多数据源 | 生产级 SLO 告警 |

### 7. 如何用 Grafana 实现 Metrics → Traces → Logs 的关联跳转？

**答：**

```
配置步骤：

1. 配置 Exemplar（Prometheus → Jaeger）
   Prometheus 数据源设置中配置 Exemplar：
   Internal link → Jaeger 数据源
   Label name: trace_id

2. 配置 Traces → Logs 关联
   Jaeger 数据源设置中配置：
   Trace to logs → Loki 数据源
   Tags: service.name → service

3. 使用流程：
   Metrics 面板看到异常点
     → 点击 Exemplar 标记
     → 跳转到 Jaeger Trace 视图
     → 点击某个 Span 的 Logs 按钮
     → 跳转到 Loki 查看详细日志
```

### 8. Grafana 仪表盘如何做版本管理？

**答：**

| 方案 | 描述 | 推荐度 |
|------|------|--------|
| **Grafana 内置** | 自动保存历史版本 | 基础 |
| **Grafonnet** | Jsonnet 编写，Git 管理 | ✅ 推荐 |
| **Grafana Terraform** | Terraform provider | 大规模 |
| **API 导出** | 脚本定期导出 JSON | 简单 |

```jsonnet
// Grafonnet 示例 (dashboard.jsonnet)
local grafana = import 'grafonnet/grafana.libsonnet';
local dashboard = grafana.dashboard;
local prometheus = grafana.prometheus;

dashboard.new(
  'Order Service',
  schemaVersion=27,
)
.addPanel(
  grafana.graphPanel.new(
    'Request Rate',
    datasource='Prometheus',
  ).addTarget(
    prometheus.target(
      'sum(rate(http_requests_total{service="order"}[5m]))',
      legendFormat='{{method}}',
    )
  ),
  gridPos={x: 0, y: 0, w: 12, h: 8},
)
```

---

## 四、面试高频题

### 9. 面试题：如何设计一个好的仪表盘？

**答：**

| 原则 | 描述 |
|------|------|
| **目标明确** | 每个仪表盘服务一个特定受众和目的 |
| **层次分明** | 从上到下：概览 → 趋势 → 详情 |
| **颜色有意义** | 红色=问题，黄色=警告，绿色=正常 |
| **少即是多** | 每个面板只展示一个观点 |
| **可操作** | 看到问题后能知道下一步做什么 |
| **有上下文** | 标注发布、事故等事件 |

### 10. 面试题：Grafana 性能优化有哪些手段？

**答：**

```
问题：仪表盘加载很慢

排查和优化：
1. 查询优化
   - 使用 Recording Rules 预计算
   - 减少 PromQL 复杂度
   - 避免高基数查询

2. 面板优化
   - 单个仪表盘不超过 20 个面板
   - 使用适当的刷新间隔（不低于 30s）
   - 大时间范围使用低分辨率

3. 数据源优化
   - 使用 $__rate_interval 代替固定间隔
   - 利用 max_source_resolution

4. 浏览器优化
   - 折叠不常看的 Row
   - 使用懒加载
```
