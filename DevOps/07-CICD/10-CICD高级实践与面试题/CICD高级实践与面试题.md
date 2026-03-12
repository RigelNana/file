# CI/CD 高级实践与面试题

---

## 1. 如何设计一个从零开始的 CI/CD 系统？

**回答：**

```
Step 1: 评估需求
  - 团队规模? (10人 vs 100人)
  - 技术栈? (Java/Python/Go/Node)
  - 代码托管? (GitHub/GitLab/自建)
  - 部署目标? (K8s/VM/Serverless)
  - 合规要求? (SOC2/PCI)

Step 2: 选择工具链
  Git 托管     → GitHub / GitLab
  CI/CD       → GitHub Actions / GitLab CI / Jenkins
  制品仓库     → Harbor / ECR / GHCR
  CD (K8s)    → ArgoCD (GitOps)
  监控        → Prometheus + Grafana
  日志        → Loki / ELK

Step 3: 设计流水线
  PR Pipeline:   lint → unit test → SAST → 覆盖率
  Main Pipeline: build → test → scan → push → deploy staging
  Release:       tag → deploy production (审批)

Step 4: 基础设施
  K8s 集群 (dev/staging/prod)
  CI Runner (K8s Pod / Self-hosted)
  Registry (Harbor / ECR)

Step 5: 安全
  Secrets 管理 → CI/CD Variables + Vault
  镜像扫描 → Trivy
  准入控制 → Kyverno
  RBAC → ArgoCD Project

Step 6: 标准化
  流水线模板 (Shared Library / Reusable Workflow)
  Dockerfile 模板
  Helm Chart 模板
  文档和培训
```

---

## 2. CI/CD 面试常见场景题：流水线执行太慢怎么办？

**回答：**

```
诊断步骤:
  1. 分析 Pipeline 各阶段耗时
  2. 找到瓶颈阶段

常见瓶颈与解决:

依赖安装慢 (npm install / pip install / mvn download)
  → 缓存 (cache: paths: node_modules/)
  → 使用 npm ci (比 npm install 快)
  → 私有 Registry 代理

Docker 构建慢
  → 多阶段构建
  → 缓存层 (先 COPY 依赖文件再 COPY 源码)
  → BuildKit 并行构建
  → --cache-from 远程缓存

测试慢
  → 并行化 (matrix / sharding)
  → 只运行受影响的测试
  → 单元测试和集成测试分离

串行执行
  → parallel stages (无依赖的阶段并行)
  → needs/DAG 模式 (不等整个 Stage)

Runner 排队
  → 增加 Runner 数量
  → K8s 动态 Agent (按需创建)
  → 优化资源分配

镜像拉取慢
  → 使用轻量基础镜像
  → 本地镜像缓存
  → 预热 Runner 常用镜像

不必要的执行
  → paths/changes 过滤 (只构建变更的模块)
  → 跳过未修改模块 (Monorepo)
```

---

## 3. 如何实现零停机部署？请描述完整流程。

**回答：**

```
完整流程:

1. CI 阶段
   代码提交 → lint → test → build Docker image → push → 漏洞扫描

2. CD 阶段 (ArgoCD GitOps)
   更新 Git 中的 image tag → ArgoCD 检测变更 → 同步到集群

3. K8s 滚动更新
   Deployment 配置:
     maxSurge: 1
     maxUnavailable: 0     ← 关键: 始终保持足够副本

4. 探针保障
   readinessProbe: 新 Pod Ready 才接收流量
   livenessProbe: 异常容器自动重启

5. 优雅终止
   preStop: sleep 10       ← 等待 Endpoints 更新
   SIGTERM 处理: 完成在途请求
   terminationGracePeriodSeconds: 60

6. PDB 保障
   minAvailable: 2         ← 至少 2 个 Pod 可用

7. 验证
   自动冒烟测试 → 监控指标 → 告警

8. 回滚准备
   kubectl rollout undo 或 Git Revert → ArgoCD 自动同步
```

---

## 4. 如何处理数据库迁移和代码部署的协调？

**回答：**

```
核心原则: 向后兼容 (Backward Compatible)

滚动更新期间, v1 和 v2 代码同时运行
  → 数据库 Schema 必须同时兼容 v1 和 v2

示例 — 添加列:
  Phase 1: 添加列 (nullable / 有默认值)
  Phase 2: 部署新代码 (读写新列)
  Phase 3: 迁移旧数据
  Phase 4: (可选) 添加 NOT NULL 约束

示例 — 重命名列:
  Phase 1: 添加新列 + 双写触发器
  Phase 2: 迁移旧数据到新列
  Phase 3: 部署新代码 (读新列)
  Phase 4: 删除旧列

示例 — 删除列:
  Phase 1: 部署新代码 (不再使用该列)
  Phase 2: 删除列

CI/CD 中的实现:
  方式 1: Init Container 运行迁移
  方式 2: CI Pipeline 单独 Stage 运行迁移
  方式 3: K8s Job 运行迁移 (ArgoCD Sync Wave)

关键: 迁移和部署分开, 迁移先于部署
```

---

## 5. 微服务架构下的 CI/CD 设计？

**回答：**

```
挑战:
  - 多个服务独立部署
  - 服务间依赖
  - 共享库变更影响多个服务
  - 环境一致性

仓库策略:
  Monorepo:  所有服务在一个仓库
    优势: 原子变更, 共享工具, 统一 CI
    挑战: CI 需按变更路径触发

  Polyrepo:  每个服务一个仓库
    优势: 独立部署, 权限隔离
    挑战: 共享代码管理, 跨服务变更

CI/CD 架构:
  ┌─────────────┐
  │ user-service │ → CI Pipeline → Docker Image → Git Manifest
  ├─────────────┤                                     │
  │ order-service│ → CI Pipeline → Docker Image → Git Manifest
  ├─────────────┤                                     │
  │ pay-service  │ → CI Pipeline → Docker Image → Git Manifest
  └─────────────┘                                     │
                                                      ▼
                                              ┌──────────────┐
                                              │ K8s Manifests │
                                              │ GitOps Repo   │
                                              └──────┬───────┘
                                                     │
                                              ┌──────▼───────┐
                                              │   ArgoCD      │
                                              └──────────────┘

关键实践:
  每个服务独立 Pipeline (独立部署)
  共享 CI 模板 (标准化)
  GitOps 仓库集中管理 K8s 清单
  ArgoCD ApplicationSet 批量管理
  契约测试 (Pact) 验证服务间接口
```

---

## 6. 面试题：如何保证 CI/CD 的高可用？

**回答：**

```
组件              HA 方案
──────────       ──────────────────────────
CI Server
  Jenkins        Active-Passive + 共享存储
  GitLab CI      GitLab HA (多节点)
  GitHub Actions SaaS (GitHub 保障)

Runner/Agent
  Jenkins Agent  K8s Plugin (动态创建)
  GitLab Runner  多 Runner, K8s Executor
  GH Actions     多 Self-hosted Runner + Label

Git 仓库
  GitLab         多节点 Gitaly
  GitHub         SaaS HA

制品仓库
  Harbor         Harbor HA (多副本 + 共享存储)
  ECR/GHCR       云服务 HA

ArgoCD
  多副本 (≥2 Application Controller)
  Redis HA
  PostgreSQL (替代 Redis 做状态存储)

关键:
  避免单点故障 (SPOF)
  Runner 弹性伸缩
  制品仓库异地备份
  监控 CI/CD 系统本身
```

---

## 7. 面试题：Git 分支策略如何与 CI/CD 配合？

**回答：**

```
Trunk-Based (推荐, 适合 CI/CD):
  main 分支始终可发布
  短命 feature 分支 (< 1天)
  Feature Flags 控制未完成功能
  CI: 每次 push 构建测试
  CD: main 自动部署到 staging, 手动发布到 prod

GitHub Flow (简单):
  main + feature branches
  PR 触发 CI
  合并到 main 自动部署

Git Flow (复杂):
  main + develop + feature + release + hotfix
  不推荐用于持续部署 (分支太多, 集成周期长)

对应 CI/CD 配置:
  feature/* → PR CI (lint + test)
  main      → 全量 CI + 部署 staging
  tag v*    → 部署 production
  hotfix/*  → PR CI + 快速路径部署
```

---

## 8. 面试题：CI/CD 中遇到的最大挑战是什么？

**回答：**

```
常见挑战与解决方案:

挑战 1: 测试不稳定 (Flaky Tests)
  问题: 测试时过时不过, 开发者忽略失败
  解决: 标记 flaky test, 隔离修复, 重试机制, 定期清理

挑战 2: 构建时间过长
  问题: 30+ 分钟的 Pipeline → 开发效率低
  解决: 并行化, 缓存, 增量构建, 分层测试

挑战 3: 环境不一致
  问题: 本地通过 CI 失败, staging 通过 prod 失败
  解决: Docker 容器化, IaC 管理环境, 相同的基础镜像

挑战 4: 密钥管理
  问题: 密钥分散在各个系统
  解决: 集中化 (Vault), CI/CD 平台 Secrets, 定期轮换

挑战 5: 微服务部署协调
  问题: 服务间依赖, 部署顺序
  解决: 向后兼容 API, 契约测试, 独立部署

挑战 6: 团队采纳
  问题: 开发者不愿改变工作流
  解决: 模板化降低门槛, 文档培训, 渐进式推广
```

---

## 9. 面试题：描述你做过的 CI/CD 项目？

**回答：**

```
回答框架 (STAR):

Situation:
  团队规模, 技术栈, 原有流程
  "20人团队, Java 微服务, 之前手动部署频繁出错"

Task:
  目标和要求
  "搭建自动化 CI/CD, 实现零停机部署, 提升交付效率"

Action:
  1. 工具选型
     GitLab CI + ArgoCD + Harbor + K8s
  2. 流水线设计
     构建 → 测试 → SAST → 镜像扫描 → 推送 → GitOps 部署
  3. 标准化
     CI 模板项目, Dockerfile 模板, Helm Chart 模板
  4. 安全加固
     镜像签名, 准入控制, 密钥管理
  5. 监控
     Pipeline 指标 + DORA 指标

Result:
  量化效果:
  - 部署频率: 每周 1 次 → 每天 5+ 次
  - 变更前置时间: 2 周 → 2 小时
  - 变更失败率: 15% → 3%
  - 服务恢复时间: 4 小时 → 10 分钟
```

---

## 10. CI/CD 发展趋势？

**回答：**

```
趋势                    说明
────────────────       ──────────────────────────────
GitOps                  Git 作为唯一事实来源, ArgoCD/FluxCD 主流化
Platform Engineering    内部开发者平台 (IDP), 自助式 CI/CD
AI/ML Pipeline          MLOps, 模型训练/部署自动化
Supply Chain Security   SBOM, SLSA, Sigstore 成为标配
Policy as Code          OPA/Kyverno, 安全策略自动化
Ephemeral Environments  PR 预览环境, 用完即销
Multi-Cloud CD          跨云部署, 统一管理
Serverless CI/CD        按使用付费 (GitHub Actions, CloudBuild)
eBPF 观测               运行时安全和性能观测
Green CI/CD             优化资源使用, 减少碳排放

核心方向:
  更快 → 减少反馈周期
  更安全 → 安全左移, 供应链安全
  更自动 → 减少人工干预
  更可观测 → DORA 指标, Pipeline 分析
  更标准化 → 平台工程, 开发者自助
```
