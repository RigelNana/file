# CI/CD 八股文

---

## 一、CI/CD 基础概念

### 1. 什么是 CI/CD？

**答：**

| 概念 | 全称 | 说明 |
|------|------|------|
| **CI** | Continuous Integration（持续集成） | 开发人员频繁合并代码到主分支，每次合并自动触发构建和测试 |
| **CD** | Continuous Delivery（持续交付） | 在 CI 的基础上，自动将构建产物部署到预发布环境，但发布到生产需要手动审批 |
| **CD** | Continuous Deployment（持续部署） | 在持续交付的基础上，自动部署到生产环境，无需手动干预 |

```
代码提交 → 构建 → 单元测试 → 集成测试 → 部署到预发布 → [手动审批] → 部署到生产
|__________ CI ___________|________________ CD (Delivery) _____|
|__________ CI ___________|__________________ CD (Deployment) ________________|
```

### 2. CI/CD 的核心原则有哪些？

**答：**

1. **频繁提交**：至少每天提交一次代码
2. **自动化构建**：每次提交自动触发构建
3. **自动化测试**：每次构建自动运行测试套件
4. **快速反馈**：构建和测试尽快完成（目标 < 10分钟）
5. **主干开发**：保持主分支随时可部署
6. **环境一致性**：各环境配置一致（开发/测试/生产）
7. **版本化一切**：代码、配置、基础设施都版本控制
8. **蓝绿/金丝雀部署**：降低发布风险

### 3. 常见的 CI/CD 工具有哪些？

**答：**

| 工具 | 类型 | 特点 |
|------|------|------|
| **Jenkins** | 自托管 | 老牌、插件丰富、Java生态 |
| **GitLab CI** | SaaS/自托管 | 与 GitLab 深度集成 |
| **GitHub Actions** | SaaS | 与 GitHub 深度集成、Marketplace 丰富 |
| **ArgoCD** | GitOps CD | K8s 原生、声明式、GitOps |
| **Tekton** | K8s 原生 | Cloud Native CI/CD |
| **CircleCI** | SaaS | 速度快、配置简单 |
| **Travis CI** | SaaS | 开源项目免费 |
| **Azure DevOps** | SaaS | 微软生态 |
| **Drone CI** | 自托管 | 轻量级、容器原生 |

---

## 二、Jenkins

### 4. Jenkins 的架构是怎样的？

**答：**

```
Jenkins Master (Controller)
  ├── 管理配置和插件
  ├── 调度构建任务
  ├── Web UI
  └── 分发任务到 Agent

Jenkins Agent (Node)
  ├── 执行具体构建任务
  ├── 可以是物理机、VM、Docker容器、K8s Pod
  └── 通过 JNLP 或 SSH 连接 Master
```

### 5. Jenkins Pipeline 的两种语法有什么区别？

**答：**

| 特性 | 声明式 (Declarative) | 脚本式 (Scripted) |
|------|---------------------|-------------------|
| 语法 | 结构化、固定格式 | Groovy 脚本、灵活 |
| 学习曲线 | 低 | 高 |
| 错误检查 | 编译时检查 | 运行时检查 |
| 推荐度 | ✅ 推荐 | 复杂场景使用 |

```groovy
// 声明式 Pipeline（推荐）
pipeline {
    agent any

    environment {
        DOCKER_REGISTRY = 'registry.example.com'
        IMAGE_NAME = 'myapp'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                sh 'mvn clean package -DskipTests'
            }
        }

        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh 'mvn test'
                    }
                }
                stage('Integration Tests') {
                    steps {
                        sh 'mvn verify -P integration'
                    }
                }
            }
        }

        stage('Docker Build & Push') {
            steps {
                script {
                    def image = docker.build("${DOCKER_REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER}")
                    docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-credentials') {
                        image.push()
                        image.push('latest')
                    }
                }
            }
        }

        stage('Deploy to Staging') {
            steps {
                sh "kubectl set image deployment/myapp myapp=${DOCKER_REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} -n staging"
            }
        }

        stage('Deploy to Production') {
            when {
                branch 'main'
            }
            input {
                message "Deploy to production?"
                ok "Deploy"
            }
            steps {
                sh "kubectl set image deployment/myapp myapp=${DOCKER_REGISTRY}/${IMAGE_NAME}:${BUILD_NUMBER} -n production"
            }
        }
    }

    post {
        always {
            junit '**/target/surefire-reports/*.xml'
            cleanWs()
        }
        success {
            echo 'Pipeline succeeded!'
        }
        failure {
            echo 'Pipeline failed!'
            // 发送通知
        }
    }
}
```

### 6. Jenkins 共享库（Shared Library）是什么？

**答：** 共享库允许多个 Pipeline 复用公共代码，避免在每个 Jenkinsfile 中重复。

```
shared-library/
├── vars/
│   ├── deployToK8s.groovy       # 全局变量/函数
│   └── sendNotification.groovy
├── src/
│   └── com/example/
│       └── Utils.groovy          # Groovy 类
└── resources/
    └── templates/
```

```groovy
// vars/deployToK8s.groovy
def call(Map config) {
    sh "kubectl set image deployment/${config.name} ${config.name}=${config.image} -n ${config.namespace}"
    sh "kubectl rollout status deployment/${config.name} -n ${config.namespace}"
}

// Jenkinsfile 中使用
@Library('my-shared-lib') _
pipeline {
    stages {
        stage('Deploy') {
            steps {
                deployToK8s(name: 'myapp', image: 'myapp:1.0', namespace: 'production')
            }
        }
    }
}
```

---

## 三、GitLab CI/CD

### 7. GitLab CI/CD 的基本概念和配置？

**答：**

核心概念：
- **Pipeline**：一次完整的 CI/CD 流程
- **Stage**：阶段（顺序执行）
- **Job**：具体任务（同一 Stage 内并行执行）
- **Runner**：执行 Job 的 Agent

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

# 构建
build:
  stage: build
  image: docker:24
  services:
    - docker:24-dind
  script:
    - docker build -t $DOCKER_IMAGE .
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker push $DOCKER_IMAGE
  only:
    - main
    - merge_requests

# 测试
unit-test:
  stage: test
  image: python:3.11
  script:
    - pip install -r requirements.txt
    - pytest tests/ --junitxml=report.xml
  artifacts:
    reports:
      junit: report.xml

lint:
  stage: test
  image: python:3.11
  script:
    - pip install flake8
    - flake8 src/

# 部署到预发布
deploy-staging:
  stage: deploy
  image: bitnami/kubectl
  script:
    - kubectl set image deployment/myapp myapp=$DOCKER_IMAGE -n staging
  environment:
    name: staging
    url: https://staging.example.com
  only:
    - main

# 部署到生产（手动触发）
deploy-production:
  stage: deploy
  image: bitnami/kubectl
  script:
    - kubectl set image deployment/myapp myapp=$DOCKER_IMAGE -n production
  environment:
    name: production
    url: https://example.com
  when: manual     # 手动触发
  only:
    - main
```

---

## 四、GitHub Actions

### 8. GitHub Actions 的基本配置？

**答：**

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'

      - name: Install dependencies
        run: pip install -r requirements.txt

      - name: Run tests
        run: pytest tests/ --junitxml=results.xml

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: test-results
          path: results.xml

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: |
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Kubernetes
        uses: azure/k8s-set-context@v3
        with:
          kubeconfig: ${{ secrets.KUBE_CONFIG }}

      - name: Update deployment
        run: |
          kubectl set image deployment/myapp \
            myapp=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            -n production
```

---

## 五、GitOps 与 ArgoCD

### 9. 什么是 GitOps？

**答：** GitOps 是一种以 Git 仓库作为**唯一真实来源（Single Source of Truth）**的运维模式。

**核心原则：**
1. **声明式**：所有系统状态都以声明式方式定义
2. **版本化和不可变**：所有配置存储在 Git 中，有完整的审计追踪
3. **自动拉取**：系统自动将实际状态与 Git 中的期望状态同步
4. **持续协调**：持续检测和修复配置漂移

```
开发者 → Git Push → Git Repository → ArgoCD 检测变更 → 同步到 K8s 集群
                         ↑                                    ↓
                         └────── 配置漂移时自动修复 ←──────────┘
```

### 10. ArgoCD 的基本使用？

**答：**

```yaml
# ArgoCD Application
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: myapp
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/org/k8s-manifests.git
    targetRevision: main
    path: apps/myapp/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      prune: true           # 自动删除多余资源
      selfHeal: true        # 自动修复配置漂移
    syncOptions:
      - CreateNamespace=true
```

```bash
# ArgoCD CLI
argocd app list
argocd app get myapp
argocd app sync myapp
argocd app history myapp
argocd app rollback myapp 1
```

---

## 六、部署策略

### 11. 常见的部署策略有哪些？

**答：**

| 策略 | 说明 | 优点 | 缺点 |
|------|------|------|------|
| **滚动更新** | 逐步替换旧版本实例 | 零停机、资源消耗少 | 新旧版本共存、回滚慢 |
| **蓝绿部署** | 维护两套环境，切换流量 | 快速回滚、零停机 | 资源翻倍 |
| **金丝雀部署** | 先发布给小比例用户 | 风险低、可验证 | 实现复杂 |
| **A/B 测试** | 根据条件路由到不同版本 | 可对比效果 | 需要路由能力 |
| **重建部署** | 先停掉旧版本，再启动新版本 | 简单 | 有停机时间 |

### 12. 蓝绿部署如何实现？

**答：**

```yaml
# Blue Deployment（当前运行版本）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-blue
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
      version: blue
  template:
    metadata:
      labels:
        app: myapp
        version: blue
    spec:
      containers:
        - name: myapp
          image: myapp:1.0

# Green Deployment（新版本）
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp-green
spec:
  replicas: 3
  selector:
    matchLabels:
      app: myapp
      version: green
  template:
    metadata:
      labels:
        app: myapp
        version: green
    spec:
      containers:
        - name: myapp
          image: myapp:2.0

# Service：切换 selector 指向 green
apiVersion: v1
kind: Service
metadata:
  name: myapp-svc
spec:
  selector:
    app: myapp
    version: green    # 切换这里：blue → green
  ports:
    - port: 80
      targetPort: 8080
```

### 13. 金丝雀部署如何实现？

**答：**

```yaml
# 方式一：K8s 原生（通过调整副本数）
# Stable Deployment：9 个副本
# Canary Deployment：1 个副本
# 共享同一个 Service selector（app: myapp）

# 方式二：使用 Istio 流量管理
apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: myapp
spec:
  hosts:
    - myapp
  http:
    - route:
        - destination:
            host: myapp
            subset: stable
          weight: 90        # 90% 流量到稳定版本
        - destination:
            host: myapp
            subset: canary
          weight: 10        # 10% 流量到金丝雀版本

# 方式三：使用 Argo Rollouts
apiVersion: argoproj.io/v1alpha1
kind: Rollout
metadata:
  name: myapp
spec:
  replicas: 10
  strategy:
    canary:
      steps:
        - setWeight: 10
        - pause: {duration: 5m}    # 观察 5 分钟
        - setWeight: 30
        - pause: {duration: 5m}
        - setWeight: 60
        - pause: {duration: 5m}
        - setWeight: 100
```

---

## 七、流水线设计

### 14. 一个完整的 CI/CD 流水线应该包含哪些阶段？

**答：**

```
1. 代码检出 (Checkout)
   └── 从 Git 仓库拉取代码

2. 静态分析 (Static Analysis)
   ├── 代码风格检查 (Lint)
   ├── 安全扫描 (SAST)
   └── 依赖漏洞扫描

3. 构建 (Build)
   ├── 编译代码
   └── 构建 Docker 镜像

4. 测试 (Test)
   ├── 单元测试
   ├── 集成测试
   └── 代码覆盖率

5. 镜像扫描 (Image Scan)
   └── 容器镜像安全扫描

6. 推送制品 (Publish)
   ├── 推送 Docker 镜像到 Registry
   └── 上传制品到制品仓库

7. 部署到预发布 (Deploy Staging)
   └── 自动部署到 staging 环境

8. 验收测试 (Acceptance Test)
   ├── 端到端测试 (E2E)
   ├── 性能测试
   └── 冒烟测试

9. 部署到生产 (Deploy Production)
   ├── 手动审批（持续交付）
   └── 自动部署（持续部署）

10. 上线验证 (Post-Deploy)
    ├── 健康检查
    ├── 监控告警
    └── 快速回滚准备
```

### 15. CI/CD 安全最佳实践？

**答：**

1. **密钥管理**：使用 CI/CD 工具的 Secrets 管理，不在代码中硬编码
2. **最小权限**：CI/CD 使用的凭证只赋予必要权限
3. **依赖扫描**：扫描第三方依赖漏洞（Dependabot、Snyk）
4. **SAST**：静态应用安全测试（SonarQube、Semgrep）
5. **镜像扫描**：扫描容器镜像漏洞（Trivy、Snyk Container）
6. **签名验证**：对镜像进行签名（Cosign、Notary）
7. **审计日志**：记录所有流水线操作
8. **环境隔离**：不同环境使用不同凭证
9. **分支保护**：主分支需要 PR 审查和 CI 通过才能合并
