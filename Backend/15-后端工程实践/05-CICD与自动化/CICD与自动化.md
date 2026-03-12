# CICD与自动化

---

## 1. CI/CD核心概念？

**回答：**

```
  CI/CD 三个阶段：

  ┌────────────────────┐
  │ CI 持续集成          │
  │ 频繁合并代码         │
  │ 自动构建+自动测试    │
  └────────┬───────────┘
           │
  ┌────────▼───────────┐
  │ CD 持续交付          │
  │ 代码随时可发布        │
  │ 发布需要人工确认      │
  └────────┬───────────┘
           │
  ┌────────▼───────────┐
  │ CD 持续部署          │
  │ 自动部署到生产        │
  │ 无需人工干预          │
  └────────────────────┘

  CI的核心实践：
  1. 每次push触发CI
  2. 构建时间 < 10分钟
  3. 主分支始终是绿色（可发布）
  4. 失败立即修复（不过夜）

  CI/CD工具选型：
  ┌──────────────┬──────────────────────────┐
  │ 工具          │ 特点                     │
  ├──────────────┼──────────────────────────┤
  │ GitHub Actions│ GitHub原生 配置简单      │
  │ GitLab CI    │ GitLab内置 功能完善       │
  │ Jenkins      │ 老牌 灵活 插件生态丰富    │
  │ ArgoCD       │ K8s原生 GitOps           │
  │ Tekton       │ K8s原生 Pipeline         │
  └──────────────┴──────────────────────────┘
```

---

## 2. GitHub Actions实战？

**回答：**

```
  Go项目完整CI配置：
```

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: golangci-lint
        uses: golangci/golangci-lint-action@v4
        with:
          version: latest

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: Cache Go modules
        uses: actions/cache@v4
        with:
          path: ~/go/pkg/mod
          key: go-mod-${{ hashFiles('go.sum') }}
      - name: Run tests
        run: go test -race -coverprofile=coverage.out ./...
        env:
          DATABASE_URL: postgres://test:test@localhost:5432/test?sslmode=disable
      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: coverage.out

  build:
    needs: [lint, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - run: go build -o bin/server ./cmd/server/
```

---

## 3. Docker镜像构建优化？

**回答：**

```
  多阶段构建（推荐）：
```

```dockerfile
# 阶段1：构建
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /server ./cmd/server/

# 阶段2：运行
FROM gcr.io/distroless/static-debian12
COPY --from=builder /server /server
COPY --from=builder /app/configs /configs
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

```
  优化对比：
  ┌──────────────────────┬──────────────┐
  │ 方式                  │ 镜像大小     │
  ├──────────────────────┼──────────────┤
  │ golang:1.22          │ ~1.2GB       │
  │ golang:1.22-alpine   │ ~300MB       │
  │ 多阶段+alpine        │ ~20MB        │
  │ 多阶段+distroless    │ ~10MB        │
  │ 多阶段+scratch       │ ~8MB         │
  └──────────────────────┴──────────────┘

  镜像构建最佳实践：
  1. 利用缓存：先COPY go.mod go.sum 再COPY .
  2. 最小基础镜像：distroless/scratch
  3. 非root用户运行
  4. 禁用CGO（纯Go不需要）
  5. 去除调试符号 -ldflags="-s -w"
  6. .dockerignore排除无关文件
```

---

## 4. 部署策略？

**回答：**

```
  部署策略对比：

  1. 滚动更新（Rolling Update）
     ┌───┐┌───┐┌───┐    ┌───┐┌───┐┌───┐
     │v1 ││v1 ││v1 │ →  │v2 ││v2 ││v2 │
     └───┘└───┘└───┘    └───┘└───┘└───┘
     逐个替换 始终有可用实例
     K8s默认策略

  2. 蓝绿部署
     蓝(v1) ●────流量    蓝(v1)
     绿(v2)          →  绿(v2) ●────流量
     两套环境 切换流量
     回滚快（切回蓝）资源消耗2倍

  3. 金丝雀发布
     v1 ●────95%流量    v1 ●────0%
     v2 ●──── 5%流量 →  v2 ●────100%
     逐步增加新版本流量
     出问题影响范围小

  K8s滚动更新配置：
  spec:
    strategy:
      type: RollingUpdate
      rollingUpdate:
        maxUnavailable: 1
        maxSurge: 1

  Argo Rollouts金丝雀：
  spec:
    strategy:
      canary:
        steps:
          - setWeight: 5
          - pause: {duration: 5m}
          - setWeight: 25
          - pause: {duration: 10m}
          - setWeight: 75
          - pause: {duration: 10m}

  选择建议：
  小团队/简单服务 → 滚动更新
  关键服务/需要快速回滚 → 蓝绿
  大流量/风险高 → 金丝雀
```

---

## 5. GitOps实践？

**回答：**

```
  GitOps原则：
  1. 声明式描述期望状态（YAML/HCL）
  2. Git作为唯一事实来源
  3. 变更通过PR审核
  4. 自动同步到运行环境

  GitOps流程：
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ 代码仓库  │  │ 配置仓库  │  │ K8s集群  │
  │  app-src  │  │ app-deploy│  │          │
  └────┬─────┘  └────┬─────┘  └────┬─────┘
       │              │              │
  CI构建镜像 → 更新镜像tag → ArgoCD同步
                  (PR)         (自动)

  ArgoCD配置：
  apiVersion: argoproj.io/v1alpha1
  kind: Application
  metadata:
    name: myapp
  spec:
    source:
      repoURL: https://github.com/org/app-deploy
      path: k8s/overlays/prod
    destination:
      server: https://kubernetes.default.svc
      namespace: production
    syncPolicy:
      automated:
        prune: true
        selfHeal: true

  GitOps优势：
  ✓ Git历史 = 部署历史（完整审计）
  ✓ 回滚 = git revert（简单可靠）
  ✓ PR Review = 部署审批
  ✓ 声明式 → 自动修复漂移

  代码仓库 vs 配置仓库 分开：
  代码仓库频繁提交 CI触发构建
  配置仓库变更 = 部署意图 ArgoCD监听
```

---

## 6. 自动化测试策略？

**回答：**

```
  CI中的测试分层：

  PR阶段（快 必须通过）：
  ┌──────────────────────────┐
  │ go vet                    │ 静态检查
  │ golangci-lint             │ Lint
  │ go test -race ./...      │ 单元测试
  │ go test -cover           │ 覆盖率检查
  └──────────────────────────┘

  合并后（稍慢）：
  ┌──────────────────────────┐
  │ 集成测试（需要DB/Redis） │
  │ 安全扫描（gosec）        │
  │ 构建Docker镜像           │
  └──────────────────────────┘

  定时（慢 每天/每周）：
  ┌──────────────────────────┐
  │ E2E测试                  │
  │ 性能测试                  │
  │ 依赖漏洞扫描              │
  └──────────────────────────┘

  测试加速策略：
  1. 并行运行 go test -p 4
  2. 缓存Go模块
  3. 只测试变更的包
  4. 拆分快/慢测试（-short标志）
  5. lint和test并行执行

  质量门禁（PR合并条件）：
  ✓ CI全部通过
  ✓ 覆盖率不低于基准线
  ✓ 至少1个Approver
  ✓ 无Blocker级别Review意见
```

---

## 7. 发布版本管理？

**回答：**

```
  语义化版本（SemVer）：
  MAJOR.MINOR.PATCH
  1.2.3

  MAJOR：不兼容的API变更
  MINOR：向后兼容的新功能
  PATCH：向后兼容的Bug修复

  自动化版本发布：
```

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.22'
      - name: Run GoReleaser
        uses: goreleaser/goreleaser-action@v5
        with:
          args: release --clean
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

```
  发布流程：
  1. 开发在main完成
  2. 打tag: git tag v1.2.0
  3. push tag触发CI
  4. 自动构建+推送镜像+创建Release
  5. ArgoCD检测新镜像 → 自动部署

  Conventional Commits → 自动版本号：
  feat: → MINOR
  fix: → PATCH
  BREAKING CHANGE: → MAJOR

  CHANGELOG自动生成：
  基于Conventional Commits
  工具：goreleaser / standard-version
```

---

## 8. 环境管理？

**回答：**

```
  环境分级：
  ┌──────────────┬──────────────┬──────────────────┐
  │ 环境          │ 用途          │ 部署方式          │
  ├──────────────┼──────────────┼──────────────────┤
  │ local        │ 本地开发      │ docker-compose   │
  │ dev          │ 开发联调      │ 自动部署         │
  │ staging      │ 预发布验证    │ 手动触发         │
  │ production   │ 生产         │ 审批后部署        │
  └──────────────┴──────────────┴──────────────────┘

  本地开发环境：
  # docker-compose.dev.yml
  services:
    postgres:
      image: postgres:16-alpine
      ports: ["5432:5432"]
    redis:
      image: redis:7-alpine
      ports: ["6379:6379"]
    kafka:
      image: bitnami/kafka:latest
      ports: ["9092:9092"]

  Makefile统一入口：
  dev-up:
      docker compose -f docker-compose.dev.yml up -d
  
  dev-down:
      docker compose -f docker-compose.dev.yml down
  
  run:
      APP_ENV=local go run ./cmd/server/

  环境间差异最小化：
  使用相同的Docker镜像
  只通过配置区分环境
  staging配置尽量和prod一致
```

---

## 9. 监控与回滚？

**回答：**

```
  部署后监控清单：
  ┌──────────────────────────────────────┐
  │ 1. 错误率是否上升                     │
  │ 2. P99延迟是否增加                   │
  │ 3. CPU/内存是否异常                   │
  │ 4. 日志中是否有新类型错误             │
  │ 5. 业务指标是否正常（订单量/支付量）  │
  └──────────────────────────────────────┘

  自动回滚条件：
  新版本在5分钟内：
  - 错误率 > 5% → 自动回滚
  - Pod CrashLoopBackOff → 自动回滚
  - 健康检查失败 → 自动回滚

  K8s回滚：
  # 手动回滚到上一个版本
  kubectl rollout undo deployment/myapp
  
  # 查看历史版本
  kubectl rollout history deployment/myapp
  
  # 回滚到指定版本
  kubectl rollout undo deployment/myapp --to-revision=3

  Argo Rollouts自动回滚：
  spec:
    strategy:
      canary:
        analysis:
          templates:
            - templateName: success-rate
          args:
            - name: service
              value: myapp
        # 分析失败自动回滚

  回滚策略：
  1. 应用回滚：kubectl rollout undo
  2. 配置回滚：git revert配置仓库
  3. 数据库回滚：执行down迁移（慎重）
  4. Feature Flag：关闭开关（最快）
```

---

## 10. CICD面试速答？

**回答：**

```
Q: CI和CD的区别？
A: CI=代码合并自动构建测试
   CD=持续交付(人工确认)/持续部署(自动)

Q: CI Pipeline包含哪些步骤？
A: lint→test→build→镜像构建→推送仓库
   PR阶段快(lint+test) 合并后全量

Q: Docker镜像怎么优化？
A: 多阶段构建 distroless/scratch基础镜像
   先COPY go.mod利用缓存 非root运行

Q: 部署策略怎么选？
A: 滚动(默认)蓝绿(快速回滚)金丝雀(大流量)
   K8s原生RollingUpdate+Argo Rollouts

Q: 什么是GitOps？
A: Git为唯一事实来源 声明式+自动同步
   变更通过PR 回滚=git revert

Q: 怎么做自动回滚？
A: 部署后监控错误率/延迟/健康检查
   异常自动回滚 或Feature Flag关闭

Q: 版本号怎么管理？
A: SemVer(MAJOR.MINOR.PATCH)
   Conventional Commits自动决定版本

Q: 质量门禁有哪些？
A: CI通过+覆盖率达标+Code Review通过
   无Blocker意见 PR才能合并
```
