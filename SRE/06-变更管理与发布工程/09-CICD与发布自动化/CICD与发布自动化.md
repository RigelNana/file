# CI/CD 与发布自动化八股文

---

## 一、CI/CD 基础

### 1. CI/CD 在 SRE 视角下的意义是什么？

**答：**

```
SRE 视角：CI/CD 是减少 Toil 和降低变更风险的核心能力

CI/CD 与 SRE 目标的关系：
  CI（持续集成）→ 早期发现问题 → 降低 MTTD
  CD（持续交付）→ 自动化部署   → 降低 MTTR
  CD（持续部署）→ 自动发布     → 减少人为错误

DORA 四个关键指标：
┌──────────────────┬───────────┬──────────┐
│ 指标              │ 精英团队   │ 低效团队  │
├──────────────────┼───────────┼──────────┤
│ 部署频率          │ 按需/多次  │ 月-半年   │
│ 变更前置时间      │ < 1天      │ 1-6个月   │
│ 变更失败率        │ 0-15%     │ 46-60%    │
│ 故障恢复时间      │ < 1小时    │ 1周-1月   │
└──────────────────┴───────────┴──────────┘

关键认知：
  高频小批量发布 > 低频大批量发布
  自动化验证 > 人工审批
  快速回滚 > 精心规划
```

### 2. 一个成熟的 CI/CD Pipeline 应包含哪些阶段？

**答：**

```
完整的 Pipeline 阶段：

Code → Build → Test → Scan → Stage → Deploy → Verify

详细分解：
┌─────────────────────────────────────────────┐
│ 1. Code Quality                              │
│    ├── Lint / Format Check                   │
│    ├── Commit Message 规范检查               │
│    └── PR Size 检查（< 400 行）              │
├─────────────────────────────────────────────┤
│ 2. Build                                     │
│    ├── 编译                                  │
│    ├── 构建容器镜像                           │
│    └── 生成 SBOM                             │
├─────────────────────────────────────────────┤
│ 3. Test                                      │
│    ├── 单元测试（覆盖率 > 80%）              │
│    ├── 集成测试                              │
│    ├── 契约测试（Pact）                      │
│    └── 端到端测试（关键路径）                 │
├─────────────────────────────────────────────┤
│ 4. Security Scan                             │
│    ├── SAST（静态分析）                      │
│    ├── SCA（依赖漏洞扫描）                   │
│    ├── 容器镜像扫描（Trivy）                 │
│    └── Secret 扫描                           │
├─────────────────────────────────────────────┤
│ 5. Staging Deploy + Verify                   │
│    ├── 部署到 Staging 环境                   │
│    ├── Smoke Test                            │
│    └── 性能回归测试                          │
├─────────────────────────────────────────────┤
│ 6. Production Deploy                         │
│    ├── 金丝雀/蓝绿部署                      │
│    ├── 自动化分析                            │
│    └── 渐进式放量                            │
├─────────────────────────────────────────────┤
│ 7. Post-Deploy Verify                        │
│    ├── Smoke Test                            │
│    ├── SLO 监控                              │
│    └── 业务指标验证                          │
└─────────────────────────────────────────────┘
```

### 3. GitOps 与传统 CI/CD 有什么区别？

**答：**

```
传统 CI/CD:
  CI Pipeline → push 到集群
  Push 模型：CI 系统有集群写权限

GitOps:
  CI Pipeline → push 到 Git Repo
  Git Repo ← pull by Agent → 集群
  Pull 模型：只有集群内 Agent 有写权限

对比：
┌──────────┬───────────────┬──────────────────┐
│ 维度      │ 传统 Push     │ GitOps Pull      │
├──────────┼───────────────┼──────────────────┤
│ 安全性    │ CI 有集群权限  │ CI 无集群权限     │
│ 审计      │ CI 日志       │ Git 历史完整审计  │
│ 漂移检测  │ 无            │ 自动检测和修正    │
│ 回滚      │ 重新部署      │ git revert       │
│ 声明式    │ 部分          │ 完全声明式        │
│ 工具      │ Jenkins等     │ ArgoCD/Flux      │
└──────────┴───────────────┴──────────────────┘
```

---

## 二、发布自动化

### 4. ArgoCD 如何实现 GitOps 发布？

**答：**

```yaml
# ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: payment-api
  namespace: argocd
spec:
  project: production
  
  source:
    repoURL: https://github.com/company/k8s-manifests
    targetRevision: main
    path: apps/payment-api/overlays/production
  
  destination:
    server: https://kubernetes.default.svc
    namespace: payment
  
  syncPolicy:
    automated:
      prune: true           # 删除多余资源
      selfHeal: true         # 自动修复漂移
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 3
      backoff:
        duration: 5s
        maxDuration: 3m
```

```
ArgoCD 工作流：

1. 开发者提交代码 → CI 构建镜像
2. CI 更新 K8s Manifest（镜像 tag）
3. PR 到 k8s-manifests 仓库
4. Code Review → Merge
5. ArgoCD 检测到 Git 变更
6. ArgoCD 同步到集群
7. 验证 Sync 状态

配置管理推荐结构：
  k8s-manifests/
  ├── apps/
  │   └── payment-api/
  │       ├── base/
  │       │   ├── deployment.yaml
  │       │   ├── service.yaml
  │       │   └── kustomization.yaml
  │       └── overlays/
  │           ├── staging/
  │           └── production/
  └── infra/
      ├── monitoring/
      └── ingress/
```

### 5. 如何实现安全的自动化部署？

**答：**

```
安全自动化部署的关键控制点：

1. 镜像安全
   # 只允许签名镜像部署
   cosign verify --key cosign.pub myregistry/myapp:v1.0
   
   # Admission Controller 强制验证
   apiVersion: policy/v1beta1
   kind: ClusterImagePolicy
   spec:
     images:
       - glob: "myregistry/*"
     authorities:
       - key:
           data: <公钥>

2. 环境隔离
   Dev → Staging → Production
   每个环境独立的 K8s 集群或 Namespace
   不同环境不同权限

3. 审批门控
   Staging → 自动
   Production → PR Review + 自动检查通过

4. 变更窗口检查
   Pipeline 内检查是否在允许的变更窗口
   冻结期自动阻断

5. 回滚就绪
   部署前验证旧版本镜像可用
   回滚脚本预置
```

---

## 三、面试

### 6. 面试题：如何设计一个零停机部署方案？

**答：**

```
零停机部署全链路设计：

1. 应用层
   - 优雅启动：Readiness Probe + 预热
   - 优雅终止：preStop + graceful shutdown
   - 连接排干：停止接收新请求，完成已有请求

2. 负载均衡层
   - 健康检查及时摘除不健康节点
   - 连接复用和长连接处理
   - 会话保持（如需要）

3. 部署策略
   - RollingUpdate: maxUnavailable=0
   - 确保新 Pod Ready 后再终止旧 Pod

4. 数据库层
   - Schema 变更向后兼容
   - 在线 DDL（gh-ost / pt-osc）
   - 读写分离减少影响

5. 验证
   - 部署后自动化 Smoke Test
   - SLO 持续监控
   - 异常自动回滚
```

### 7. 面试题：CI/CD Pipeline 出故障影响发布怎么办？

**答：**

```
CI/CD 高可用设计：

1. Pipeline 高可用
   - CI Runner 多实例
   - 分布式构建缓存
   - 制品仓库双活

2. 应急发布通道
   - 手动部署 Runbook
   - 紧急发布绕过非关键检查
   - 但不能跳过安全扫描和基本测试

3. 缓存和加速
   - 构建缓存（Docker layer cache）
   - 依赖缓存（npm/pip/go cache）
   - 并行执行无依赖阶段

4. 监控 Pipeline
   - Pipeline 成功率监控
   - 构建时间监控（定 SLO）
   - Runner 资源监控

目标：
  Pipeline SLO: 99.5% 可用
  构建时间: P95 < 15 分钟
  部署时间: P95 < 10 分钟
```
