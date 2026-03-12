# GitHub Actions 详解

---

## 1. GitHub Actions 核心概念？

**回答：**

```
核心概念:

Workflow     → 工作流, 由 .github/workflows/*.yml 定义
Event        → 触发事件 (push, pull_request, schedule, workflow_dispatch)
Job          → 任务, 在 Runner 上执行, 默认并行
Step         → 步骤, 在同一 Runner 上顺序执行
Action       → 可复用的操作单元 (官方/社区/自定义)
Runner       → 执行环境 (GitHub-hosted / Self-hosted)
Artifact     → 产出物, Job 间传递
Secret       → 加密的环境变量
Environment  → 部署目标环境, 支持审批

文件位置: .github/workflows/ci.yml

执行流程:
  Event 触发 → GitHub 解析 Workflow → 调度 Runner → 执行 Job → 报告结果
```

---

## 2. Workflow 完整配置详解？

**回答：**

```yaml
name: CI/CD Pipeline

# ===== 触发条件 =====
on:
  push:
    branches: [main, develop]
    paths:
      - 'src/**'
      - 'Dockerfile'
    tags:
      - 'v*'
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
  schedule:
    - cron: '0 2 * * 1'                # 每周一凌晨2点
  workflow_dispatch:                     # 手动触发
    inputs:
      environment:
        description: '部署环境'
        required: true
        default: 'staging'
        type: choice
        options: [staging, production]
      debug:
        description: '开启调试'
        type: boolean
        default: false

# ===== 全局环境变量 =====
env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

# ===== 权限 =====
permissions:
  contents: read
  packages: write
  id-token: write

# ===== 并发控制 =====
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true              # 新 Push 取消旧的

# ===== Jobs =====
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
      - run: |
          pip install flake8 mypy
          flake8 src/
          mypy src/

  test:
    runs-on: ubuntu-latest
    needs: lint                          # 依赖 lint 通过
    strategy:
      matrix:
        python-version: ['3.10', '3.11', '3.12']
      fail-fast: false                   # 一个失败不取消其他
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python-version }}
          cache: 'pip'
      - run: pip install -r requirements.txt
      - run: pytest tests/ --junitxml=results.xml --cov=src
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results-${{ matrix.python-version }}
          path: results.xml

  build:
    runs-on: ubuntu-latest
    needs: test
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha
            type=ref,event=branch

      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: build
    environment: production              # 关联环境 (支持审批)
    steps:
      - uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
      - run: |
          kubectl set image deployment/myapp \
            myapp=${{ needs.build.outputs.image-tag }} \
            -n production
```

---

## 3. GitHub Actions 常用 Action？

**回答：**

```
分类              Action                               用途
──────────       ──────────────────────               ──────────
基础              actions/checkout@v4                   代码检出
                 actions/setup-node@v4                  Node.js 环境
                 actions/setup-python@v5                Python 环境
                 actions/setup-java@v4                  Java 环境
                 actions/setup-go@v5                    Go 环境

缓存              actions/cache@v4                      通用缓存
                 (setup-* 内置 cache 参数)              语言级缓存

制品              actions/upload-artifact@v4             上传制品
                 actions/download-artifact@v4           下载制品

Docker           docker/login-action@v3                 Registry 登录
                 docker/build-push-action@v5            构建推送镜像
                 docker/metadata-action@v5              镜像标签管理

K8s              azure/k8s-set-context@v3               K8s 认证
                 azure/k8s-deploy@v4                    K8s 部署

安全              github/codeql-action@v3                CodeQL 分析
                 aquasecurity/trivy-action@master        Trivy 扫描

通知              slackapi/slack-github-action@v1         Slack 通知

PR               peter-evans/create-pull-request@v6     自动创建 PR
                 actions/github-script@v7               GitHub API 操作
```

---

## 4. 自定义 Action 开发？

**回答：**

```
Action 类型:
  Composite   → 组合多个 Step (YAML, 最常用)
  JavaScript  → Node.js 实现
  Docker      → Docker 容器执行
```

### Composite Action

```yaml
# .github/actions/deploy-k8s/action.yml
name: 'Deploy to K8s'
description: 'Deploy application to Kubernetes'
inputs:
  namespace:
    description: 'K8s namespace'
    required: true
  image:
    description: 'Docker image'
    required: true
  deployment:
    description: 'Deployment name'
    required: true
  kubeconfig:
    description: 'Kubeconfig content'
    required: true
outputs:
  status:
    description: 'Deployment status'
    value: ${{ steps.deploy.outputs.status }}

runs:
  using: 'composite'
  steps:
    - name: Setup kubectl
      shell: bash
      run: |
        echo "${{ inputs.kubeconfig }}" > /tmp/kubeconfig
        export KUBECONFIG=/tmp/kubeconfig

    - name: Deploy
      id: deploy
      shell: bash
      run: |
        kubectl set image deployment/${{ inputs.deployment }} \
          ${{ inputs.deployment }}=${{ inputs.image }} \
          -n ${{ inputs.namespace }}
        kubectl rollout status deployment/${{ inputs.deployment }} \
          -n ${{ inputs.namespace }} --timeout=300s
        echo "status=success" >> $GITHUB_OUTPUT

    - name: Cleanup
      if: always()
      shell: bash
      run: rm -f /tmp/kubeconfig
```

```yaml
# 使用自定义 Action
jobs:
  deploy:
    steps:
      - uses: ./.github/actions/deploy-k8s
        with:
          namespace: production
          image: myapp:v1.0
          deployment: myapp
          kubeconfig: ${{ secrets.KUBE_CONFIG }}
```

---

## 5. GitHub Actions Secrets 与 Variables？

**回答：**

```
层级 (优先级从高到低):
  Environment Secret/Variable   → 环境级 (最高优先级)
  Repository Secret/Variable    → 仓库级
  Organization Secret/Variable  → 组织级

Secret vs Variable:
  Secret   → 加密存储, 日志掩码, 不可查看原文
  Variable → 明文存储, 配置信息

设置位置:
  Settings → Secrets and variables → Actions
```

```yaml
# 使用方式
jobs:
  deploy:
    environment: production          # 关联环境, 使用环境级 secrets
    env:
      APP_NAME: ${{ vars.APP_NAME }}         # Variable
      DB_HOST: ${{ secrets.DB_HOST }}         # Secret
    steps:
      - run: echo "${{ secrets.API_KEY }}"   # 日志中显示 ***
```

### Environment 保护规则

```
Environment 功能:
  Required reviewers    → 部署前需要审批人批准
  Wait timer           → 部署前等待时间
  Deployment branches  → 限制哪些分支可以部署到此环境
  Environment secrets  → 环境专属 Secret

生产环境典型配置:
  - Required reviewers: 2 人审批
  - Deployment branches: main only
  - Wait timer: 5 minutes
```

---

## 6. 矩阵策略 (Matrix Strategy)？

**回答：**

```yaml
jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        python: ['3.10', '3.11', '3.12']
        exclude:
          - os: windows-latest
            python: '3.10'
        include:
          - os: ubuntu-latest
            python: '3.12'
            experimental: true
      fail-fast: false                  # 一个失败不取消其他
      max-parallel: 4                   # 最大并行数

    runs-on: ${{ matrix.os }}
    continue-on-error: ${{ matrix.experimental || false }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: ${{ matrix.python }}
      - run: pytest tests/

# 上例会生成 3×3 - 1(exclude) + 1(include) = 9 个 Job
```

---

## 7. Reusable Workflows (可复用工作流)？

**回答：**

```yaml
# .github/workflows/reusable-deploy.yml (被调用方)
name: Reusable Deploy
on:
  workflow_call:
    inputs:
      environment:
        required: true
        type: string
      image-tag:
        required: true
        type: string
    secrets:
      KUBE_CONFIG:
        required: true
    outputs:
      deploy-url:
        value: ${{ jobs.deploy.outputs.url }}

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: ${{ inputs.environment }}
    outputs:
      url: ${{ steps.deploy.outputs.url }}
    steps:
      - name: Deploy
        id: deploy
        run: |
          kubectl set image deployment/myapp myapp=${{ inputs.image-tag }}
          echo "url=https://${{ inputs.environment }}.example.com" >> $GITHUB_OUTPUT
```

```yaml
# .github/workflows/ci-cd.yml (调用方)
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.build.outputs.tag }}
    steps:
      - id: build
        run: echo "tag=myapp:${{ github.sha }}" >> $GITHUB_OUTPUT

  deploy-staging:
    needs: build
    uses: ./.github/workflows/reusable-deploy.yml
    with:
      environment: staging
      image-tag: ${{ needs.build.outputs.image-tag }}
    secrets:
      KUBE_CONFIG: ${{ secrets.STAGING_KUBE_CONFIG }}

  deploy-production:
    needs: [build, deploy-staging]
    uses: ./.github/workflows/reusable-deploy.yml
    with:
      environment: production
      image-tag: ${{ needs.build.outputs.image-tag }}
    secrets:
      KUBE_CONFIG: ${{ secrets.PROD_KUBE_CONFIG }}
```

---

## 8. Self-hosted Runner？

**回答：**

```bash
# 安装 Self-hosted Runner
# Settings → Actions → Runners → New self-hosted runner

# Linux 安装
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.com/org/repo --token $TOKEN
./run.sh                          # 前台运行
sudo ./svc.sh install && sudo ./svc.sh start  # 服务方式运行
```

```yaml
# 使用 Self-hosted Runner
jobs:
  build:
    runs-on: self-hosted                     # 标签匹配
    # 或指定更具体的标签
    runs-on: [self-hosted, linux, gpu]

# K8s 上运行 (Actions Runner Controller)
# ARC — 在 K8s 中自动伸缩 Runner
# helm install arc oci://ghcr.io/actions/actions-runner-controller-charts/gha-runner-scale-set-controller
```

### GitHub-hosted vs Self-hosted

```
对比             GitHub-hosted              Self-hosted
──────          ──────────────            ──────────────
维护             GitHub 维护                自行维护
环境             全新 VM, 每次干净            持久化, 需自行清理
性能             标准配置                    自定义硬件 (GPU等)
费用             免费额度 + 按分钟            自行承担硬件成本
安全             隔离性好                    需自行加固
网络             公网                       内网访问
```

---

## 9. GitHub Actions 缓存策略？

**回答：**

```yaml
# 方式一: setup-* Action 内置缓存
- uses: actions/setup-node@v4
  with:
    node-version: 20
    cache: 'npm'                        # 自动缓存 node_modules

- uses: actions/setup-python@v5
  with:
    python-version: '3.12'
    cache: 'pip'                        # 自动缓存 pip

# 方式二: actions/cache (通用)
- uses: actions/cache@v4
  with:
    path: |
      ~/.cache/pip
      ~/.npm
      node_modules
    key: ${{ runner.os }}-deps-${{ hashFiles('**/package-lock.json', '**/requirements.txt') }}
    restore-keys: |
      ${{ runner.os }}-deps-

# 方式三: Docker 层缓存 (GitHub Actions Cache)
- uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

```
缓存限制:
  总缓存大小:     10 GB (仓库级)
  单个缓存:       无限制 (超过时自动清理旧缓存)
  保留时间:       7 天未使用自动删除
  分支:           PR 可使用基础分支的缓存
```

---

## 10. GitHub Actions 最佳实践？

**回答：**

```
1. 版本锁定
   - 使用 @v4 而非 @main
   - 高安全: 使用 SHA — uses: actions/checkout@a1b2c3d4

2. 并发控制
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true

3. 最小权限
   permissions:
     contents: read
     packages: write

4. 路径过滤
   on:
     push:
       paths: ['src/**', 'Dockerfile']
       paths-ignore: ['docs/**', '*.md']

5. Job 输出传递
   jobs.build.outputs → needs.build.outputs

6. 复用
   - Composite Action → 步骤级复用
   - Reusable Workflow → 工作流级复用

7. 安全
   - Secret 不在 fork PR 中暴露
   - GITHUB_TOKEN 最小权限
   - 第三方 Action 审查

8. 调试
   - ACTIONS_RUNNER_DEBUG: true
   - ACTIONS_STEP_DEBUG: true
   - tmate SSH 调试

9. 费用控制
   - timeout-minutes 设置
   - cancel-in-progress 减少冗余
   - 路径过滤减少不必要触发

10. 监控
    - workflow_run 事件监听其他工作流状态
    - 失败通知 (Slack/Email)
```
