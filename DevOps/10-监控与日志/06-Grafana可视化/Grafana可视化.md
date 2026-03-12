# Grafana 可视化

---

## 1. Grafana 核心功能和架构？

**回答：**

```
Grafana: 开源可观测性和数据可视化平台

核心功能:
  ┌─────────────────────┬─────────────────────────────────────┐
  │ 功能                 │ 说明                                │
  ├─────────────────────┼─────────────────────────────────────┤
  │ 多数据源支持          │ Prometheus, ES, Loki, MySQL, PG 等  │
  │ Dashboard (仪表盘)   │ 可视化面板, JSON 导入导出             │
  │ 告警                 │ Grafana Alerting (Unified Alerting)  │
  │ 变量 (Variables)     │ Dashboard 参数化, 动态切换            │
  │ 注解 (Annotations)   │ 在图表上标注事件 (部署/事故)          │
  │ 面板插件              │ 丰富的社区插件                       │
  │ 权限管理              │ 组织/团队/文件夹/Dashboard 级权限     │
  │ Provisioning         │ 通过文件/API 自动化配置               │
  └─────────────────────┴─────────────────────────────────────┘

架构:
  Data Sources → Grafana Server → Browser
                    │
                    ├── SQLite / MySQL / PostgreSQL (配置存储)
                    ├── Dashboard JSON
                    └── Plugins
```

---

## 2. 常用面板类型？

**回答：**

```
可视化面板类型:
  ┌─────────────────┬──────────────────────────────────────┐
  │ 面板类型         │ 使用场景                              │
  ├─────────────────┼──────────────────────────────────────┤
  │ Time series     │ 时间序列折线图 (QPS, CPU, 延迟)       │
  │ Stat            │ 单值展示 (当前 QPS, 在线实例数)        │
  │ Gauge           │ 仪表盘 (CPU%, 内存%, 磁盘%)          │
  │ Bar gauge       │ 条状仪表 (多实例对比)                  │
  │ Table           │ 表格 (告警列表, 资源列表)              │
  │ Heatmap         │ 热力图 (延迟分布, 请求时间分布)        │
  │ Bar chart       │ 柱状图 (按天/小时统计)                 │
  │ Pie chart       │ 饼图 (比例分布)                       │
  │ Logs            │ 日志面板 (Loki/ES 日志)                │
  │ Node graph      │ 拓扑图 (服务依赖)                      │
  │ Geomap          │ 地理分布图                             │
  │ Alert list      │ 告警列表面板                           │
  │ Text            │ Markdown 文字说明                      │
  └─────────────────┴──────────────────────────────────────┘

常用 Dashboard 模板 (Grafana.com):
  ID 1860:  Node Exporter Full
  ID 6417:  Kubernetes Cluster
  ID 12006: Kubernetes Deployments
  ID 315:   Kubernetes Cluster Monitoring
  ID 179:   Docker & Host Monitoring
  ID 9614:  Nginx
  ID 763:   Redis
  ID 7362:  MySQL Overview
```

---

## 3. Dashboard 变量 (Variables) 怎么用？

**回答：**

```
变量: 让 Dashboard 支持动态切换 (下拉选择)

变量类型:
  ┌──────────────────┬──────────────────────────────────┐
  │ 类型              │ 说明                             │
  ├──────────────────┼──────────────────────────────────┤
  │ Query            │ 从数据源查询值 (最常用)            │
  │ Custom           │ 手动定义固定值列表                 │
  │ Text box         │ 自由输入文本                      │
  │ Constant         │ 常量 (隐藏, Dashboard link 传递)  │
  │ Data source      │ 动态选择数据源                    │
  │ Interval         │ 自动/手动选择时间间隔              │
  │ Ad hoc filters   │ 自动创建键值对过滤器              │
  └──────────────────┴──────────────────────────────────┘
```

```
Query 变量示例 (Prometheus 数据源):

变量名: namespace
Query: label_values(kube_pod_info, namespace)
→ 自动列出所有 namespace 值

变量名: pod
Query: label_values(kube_pod_info{namespace="$namespace"}, pod)
→ 根据选择的 namespace 联动显示 pod 列表 (级联变量)

变量名: instance
Query: label_values(up{job="node"}, instance)
→ 列出 node job 的所有 instance

在 PromQL 中使用:
  rate(http_requests_total{namespace="$namespace", pod="$pod"}[5m])

多选:
  配置: Multi-value = On, Include All = On
  PromQL: rate(http_requests_total{namespace=~"$namespace"}[5m])
  → 正则匹配多选值

Interval 变量:
  变量名: interval
  Values: 1m,5m,15m,30m,1h
  Auto: On (根据时间范围自动调整)
  使用: rate(metric[$interval])
```

---

## 4. Dashboard Provisioning (自动化配置)？

**回答：**

```yaml
# Grafana Provisioning 目录结构
/etc/grafana/provisioning/
├── datasources/
│   └── datasource.yml
├── dashboards/
│   └── dashboard.yml
├── notifiers/           # (旧版告警渠道)
├── alerting/            # (新版 Unified Alerting)
└── plugins/
```

```yaml
# datasource.yml — 自动配置数据源
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
    jsonData:
      timeInterval: '15s'
      httpMethod: POST

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    jsonData:
      derivedFields:
        - datasourceUid: tempo
          matcherRegex: "traceID=(\\w+)"
          name: TraceID
          url: "$${__value.raw}"

  - name: Tempo
    type: tempo
    access: proxy
    url: http://tempo:3200
```

```yaml
# dashboard.yml — 自动加载 Dashboard
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: 'Provisioned'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

```bash
# Dashboard JSON 导出/导入
# 导出: Dashboard Settings → JSON Model → Copy
# 导入: + → Import → Upload JSON

# Grafana API 导出
curl -H "Authorization: Bearer $GRAFANA_TOKEN" \
  http://grafana:3000/api/dashboards/uid/xxx

# Grafana API 导入
curl -X POST -H "Authorization: Bearer $GRAFANA_TOKEN" \
  -H "Content-Type: application/json" \
  -d @dashboard.json \
  http://grafana:3000/api/dashboards/db
```

---

## 5. Grafana Alerting (统一告警)？

**回答：**

```
Grafana Unified Alerting (Grafana 8+):
  Grafana 自带的告警引擎, 可替代/补充 Alertmanager

组件:
  Alert Rule       → 定义告警条件
  Contact Point    → 通知渠道 (Slack, Email, PagerDuty)
  Notification Policy → 路由和分组 (类似 Alertmanager route)
  Silence/Mute     → 静默

与 Prometheus Alerting 对比:
  ┌──────────────────┬──────────────────┬──────────────────┐
  │ 维度              │ Prometheus Alert │ Grafana Alert    │
  ├──────────────────┼──────────────────┼──────────────────┤
  │ 规则定义          │ YAML 文件         │ UI 或 Provisioning │
  │ 数据源            │ 只能 Prometheus   │ 多数据源          │
  │ 通知管理          │ Alertmanager      │ 内置 + AM 兼容    │
  │ 适用场景          │ 纯 Prometheus     │ 混合数据源环境     │
  └──────────────────┴──────────────────┴──────────────────┘

最佳实践:
  纯 Prometheus + K8s 环境 → 用 Prometheus Alert + Alertmanager
  多数据源 / 非 K8s 环境 → Grafana Alerting 也可以
  两者可以共存
```

---

## 6. Grafana 与多数据源关联？

**回答：**

```
Exemplar (范例):
  Metrics → Traces 的关联
  在 Prometheus 指标上附加 traceID
  Grafana 点击 Exemplar 跳转到 Tempo/Jaeger 查看链路

配置 Exemplar:
  Prometheus 数据源 → Settings → Exemplars
  → Internal link → Data source: Tempo
  → Label name: traceID

混合面板 (Mixed Datasource):
  同一个面板展示多个数据源的数据
  Panel → Data source → Mixed
  → Query A: Prometheus (CPU)
  → Query B: Elasticsearch (Error Logs)

关联跳转:
  Metrics (Prometheus) → Logs (Loki):
    Loki 数据源配置 Derived Fields
    从日志中提取 traceID → 跳转到 Traces
  
  Metrics → Logs:
    Dashboard 变量传递 (instance, namespace)
    Data Link: 跳转到 Loki Explore

完整关联链路 (Grafana Stack):
  ┌────────────┐    ┌────────────┐    ┌────────────┐
  │ Prometheus │ ←→ │   Loki     │ ←→ │   Tempo    │
  │ (Metrics)  │    │  (Logs)    │    │  (Traces)  │
  └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
        │                 │                  │
        └─────────────────┴──────────────────┘
                    Grafana (统一视图)
  
  关联方式:
    Exemplar:     Metrics → Traces (traceID)
    Derived Field: Logs → Traces (traceID)
    Log Context:   Loki → 按标签关联 Metrics
```

---

## 7. Grafana as Code (Dashboard 代码化)？

**回答：**

```
方案 1: Grafonnet (Jsonnet 库)
  用 Jsonnet 语言生成 Dashboard JSON

  // dashboard.jsonnet
  local grafana = import 'grafonnet/grafana.libsonnet';
  local dashboard = grafana.dashboard;
  local prometheus = grafana.prometheus;
  local graphPanel = grafana.graphPanel;

  dashboard.new(
    'My Dashboard',
    time_from='now-6h',
  )
  .addPanel(
    graphPanel.new(
      'Request Rate',
      datasource='Prometheus',
    ).addTarget(
      prometheus.target(
        'sum(rate(http_requests_total[5m]))',
        legendFormat='QPS',
      )
    ), gridPos={x: 0, y: 0, w: 12, h: 8}
  )


方案 2: Terraform Grafana Provider
  用 Terraform 管理 Grafana 资源
```

```hcl
# Terraform 管理 Grafana
provider "grafana" {
  url  = "http://grafana:3000"
  auth = var.grafana_api_key
}

resource "grafana_dashboard" "my_dashboard" {
  config_json = file("dashboards/my-dashboard.json")
  folder      = grafana_folder.monitoring.id
}

resource "grafana_folder" "monitoring" {
  title = "Monitoring"
}

resource "grafana_data_source" "prometheus" {
  type = "prometheus"
  name = "Prometheus"
  url  = "http://prometheus:9090"
}
```

```
方案 3: Grafana API + CI/CD
  Dashboard JSON 存 Git
  CI 自动导入到 Grafana

  # CI Pipeline
  stages:
    - deploy-dashboards:
        script:
          - for f in dashboards/*.json; do
              curl -X POST -H "Authorization: Bearer $TOKEN" \
                -H "Content-Type: application/json" \
                -d "{\"dashboard\": $(cat $f), \"overwrite\": true}" \
                $GRAFANA_URL/api/dashboards/db
            done
```

---

## 8. Grafana 权限管理？

**回答：**

```
权限层次:
  Organization (组织)
    └── Team (团队)
        └── User (用户)
            └── Role (角色): Admin / Editor / Viewer

Dashboard 权限:
  Folder 级权限 (推荐):
    /Production/ → 只有 Ops Team 可编辑
    /Development/ → Dev Team 可编辑
    /Public/ → 所有人可查看

  Dashboard 级权限:
    继承 Folder 权限, 可覆盖

角色说明:
  ┌──────────┬──────────────────────────────────┐
  │ 角色      │ 权限                             │
  ├──────────┼──────────────────────────────────┤
  │ Viewer   │ 查看 Dashboard                    │
  │ Editor   │ 编辑 Dashboard, 查看 Explore      │
  │ Admin    │ 管理数据源, 用户, 组织设置          │
  └──────────┴──────────────────────────────────┘

RBAC (Enterprise/Cloud):
  更细粒度的权限控制
  自定义角色和权限

认证集成:
  LDAP, OAuth (GitHub, Google, Okta, Azure AD)
  SAML (Enterprise)
  
# grafana.ini
[auth.github]
enabled = true
client_id = xxx
client_secret = xxx
allowed_organizations = my-org
```

---

## 9. Grafana 性能优化？

**回答：**

```
Dashboard 性能优化:

1. 减少面板数量
   ✗ 一个 Dashboard 50+ 面板 → 加载慢
   ✓ 按主题拆分为多个 Dashboard
   ✓ 使用 Row 折叠不常看的面板

2. 优化查询
   ✓ 使用 Recording Rules 预计算
   ✓ 避免在 Dashboard 中写复杂 PromQL
   ✓ 设置 Min step / Resolution

3. 查询缓存
   ✓ Grafana 内置缓存
   ✓ Prometheus 侧:
     --query.lookback-delta (减少回看)
     --storage.tsdb.min-block-duration

4. 时间范围
   ✓ 默认展示 6h/12h, 不要默认 7d/30d
   ✓ 使用 $__rate_interval 自动适配

5. 变量优化
   ✓ 变量查询加过滤条件
   ✗ label_values(metric)           → 全量扫描
   ✓ label_values(up{job="x"}, instance)  → 有条件

6. 刷新间隔
   ✓ Auto refresh: 30s-1m (生产)
   ✗ 5s 刷新 → 压力大
```

---

## 10. Grafana 部署和运维？

**回答：**

```yaml
# Docker Compose 部署
services:
  grafana:
    image: grafana/grafana:10.2.0
    ports:
      - "3000:3000"
    environment:
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: ${ADMIN_PASSWORD}
      GF_INSTALL_PLUGINS: grafana-piechart-panel
      GF_DATABASE_TYPE: mysql
      GF_DATABASE_HOST: mysql:3306
      GF_DATABASE_NAME: grafana
      GF_DATABASE_USER: grafana
      GF_DATABASE_PASSWORD: ${DB_PASSWORD}
    volumes:
      - grafana-data:/var/lib/grafana
      - ./provisioning:/etc/grafana/provisioning
      - ./dashboards:/var/lib/grafana/dashboards

# Kubernetes Helm 部署
# helm install grafana grafana/grafana \
#   --set persistence.enabled=true \
#   --set adminPassword=$PASSWORD \
#   -f values.yaml
```

```
运维检查清单:
  □ 外部数据库 (MySQL/PostgreSQL) 而非 SQLite
  □ 持久化存储 (PVC / EBS)
  □ Provisioning 管理数据源和 Dashboard
  □ Dashboard JSON 版本控制 (Git)
  □ HTTPS + OAuth 认证
  □ 备份策略 (数据库 + Dashboard)
  □ 告警通道测试 (Test Contact Point)
  □ 资源限制 (CPU/内存)

高可用:
  多副本 + 外部数据库 + Session 共享
  使用 MySQL/PostgreSQL 存储配置
  多实例前面加 LB (Nginx/Ingress)
```
