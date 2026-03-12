# GitLab CI 详解

---

## 1. GitLab CI/CD 核心概念？

**回答：**

```
核心概念:

Pipeline    → 一次完整的 CI/CD 流程 (由 .gitlab-ci.yml 定义)
Stage       → 阶段, 按顺序执行 (build → test → deploy)
Job         → 具体任务, 同一 Stage 内并行执行
Runner      → 执行 Job 的 Agent (GitLab Runner)
Artifact    → Job 产出物, 可在 Job 间传递
Cache       → 缓存依赖, 加速构建
Environment → 部署目标环境 (staging, production)
Variable    → 环境变量 (项目/组/实例级)

Pipeline 执行流程:
  git push → GitLab → 触发 Pipeline → 分配 Runner → 执行 Job

  ┌──────────────── Pipeline ────────────────────┐
  │ Stage: build      Stage: test     Stage: deploy│
  │ ┌─────────┐      ┌────────┐      ┌──────────┐│
  │ │ build   │ ──▶  │ unit   │ ──▶  │ staging  ││
  │ └─────────┘      │ test   │      └──────────┘│
  │                  ├────────┤      ┌──────────┐│
  │                  │ lint   │      │production││
  │                  └────────┘      │ (manual) ││
  │                  (并行)          └──────────┘│
  └──────────────────────────────────────────────┘
```

---

## 2. .gitlab-ci.yml 完整配置详解？

**回答：**

```yaml
# ===== 全局配置 =====
default:
  image: python:3.12                    # 默认 Docker 镜像
  before_script:                        # 每个 Job 前执行
    - pip install -r requirements.txt
  after_script:                         # 每个 Job 后执行
    - echo "Job finished"
  retry:                                # 失败重试
    max: 2
    when:
      - runner_system_failure
      - stuck_or_timeout_failure
  timeout: 30m                          # 超时时间
  tags:
    - docker                            # Runner 标签

# 阶段定义 (顺序执行)
stages:
  - build
  - test
  - security
  - deploy

# 全局变量
variables:
  DOCKER_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  PIP_CACHE_DIR: "$CI_PROJECT_DIR/.cache/pip"

# 缓存
cache:
  key:
    files:
      - requirements.txt                # 依赖文件变化时更新缓存
  paths:
    - .cache/pip
    - venv/

# ===== Jobs =====

build:
  stage: build
  script:
    - python setup.py build
    - python -m build
  artifacts:
    paths:
      - dist/
    expire_in: 1 week

unit-test:
  stage: test
  script:
    - pytest tests/unit --junitxml=report.xml --cov=src
  coverage: '/TOTAL.*\s+(\d+%)$/'       # 提取覆盖率
  artifacts:
    reports:
      junit: report.xml
      coverage_report:
        coverage_format: cobertura
        path: coverage.xml

lint:
  stage: test
  script:
    - flake8 src/
    - mypy src/

security-scan:
  stage: security
  image: aquasec/trivy:latest
  script:
    - trivy fs --exit-code 1 --severity HIGH,CRITICAL .
  allow_failure: true                    # 允许失败不阻塞

deploy-staging:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/myapp myapp=$DOCKER_IMAGE -n staging
  environment:
    name: staging
    url: https://staging.example.com
    on_stop: stop-staging                # 关联停止 Job
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'

stop-staging:
  stage: deploy
  script:
    - kubectl delete deployment myapp -n staging
  environment:
    name: staging
    action: stop
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual

deploy-production:
  stage: deploy
  script:
    - kubectl set image deployment/myapp myapp=$DOCKER_IMAGE -n production
  environment:
    name: production
    url: https://example.com
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual                       # 手动触发
  needs: ['deploy-staging']              # 依赖 staging 部署
```

---

## 3. GitLab Runner 类型与配置？

**回答：**

```
Runner 类型:

类型              说明                        适用
──────────       ──────────────────          ──────────
Shared Runner    GitLab 实例共享               小项目, 标准构建
Group Runner     组内项目共享                   团队级隔离
Project Runner   项目专用                      高安全性, 特殊需求

执行器 (Executor):

Executor         说明                        隔离性
──────────      ──────────────────          ──────
Shell            直接在 Runner 主机执行         无隔离
Docker           每个 Job 启动 Docker 容器       容器级
Docker Machine   自动创建 Docker VM             VM 级
Kubernetes       K8s Pod 作为 Agent             容器级
VirtualBox       虚拟机执行                     VM 级
```

```bash
# 安装 GitLab Runner
curl -L https://packages.gitlab.com/install/repositories/runner/gitlab-runner/script.deb.sh | sudo bash
sudo apt-get install gitlab-runner

# 注册 Runner
sudo gitlab-runner register \
  --url https://gitlab.example.com \
  --token $REGISTRATION_TOKEN \
  --executor docker \
  --docker-image python:3.12 \
  --description "Docker Runner" \
  --tag-list "docker,linux"

# config.toml
[[runners]]
  name = "Docker Runner"
  url = "https://gitlab.example.com"
  executor = "docker"
  [runners.docker]
    image = "python:3.12"
    privileged = false
    volumes = ["/cache", "/var/run/docker.sock:/var/run/docker.sock"]
    pull_policy = "if-not-present"
  [runners.cache]
    Type = "s3"
    [runners.cache.s3]
      BucketName = "runner-cache"
```

---

## 4. GitLab CI 高级特性？

**回答：**

### rules vs only/except

```yaml
# rules (推荐, 替代 only/except)
job:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'     # MR 触发
    - if: '$CI_COMMIT_BRANCH == "main"'                      # main 分支
    - if: '$CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/'           # Tag v1.0.0
    - changes:                                                # 文件变更
        - src/**/*
        - Dockerfile
    - when: never                                             # 其他情况不执行
```

### needs (DAG 依赖)

```yaml
# 不再按 Stage 顺序, 而是按依赖关系执行
stages:
  - build
  - test
  - deploy

build-frontend:
  stage: build
  script: npm run build

build-backend:
  stage: build
  script: mvn package

test-frontend:
  stage: test
  needs: ['build-frontend']    # 只依赖 frontend 构建
  script: npm test

test-backend:
  stage: test
  needs: ['build-backend']     # 只依赖 backend 构建
  script: mvn test

deploy:
  stage: deploy
  needs: ['test-frontend', 'test-backend']
  script: kubectl apply -f k8s/
```

### include (模板复用)

```yaml
# 引入外部模板
include:
  - local: '/.gitlab/ci/build.yml'               # 本仓库
  - project: 'devops/ci-templates'                 # 其他项目
    ref: main
    file: '/templates/docker-build.yml'
  - remote: 'https://example.com/template.yml'    # 远程 URL
  - template: 'Security/SAST.gitlab-ci.yml'       # GitLab 内置
```

### extends (继承)

```yaml
.base-deploy:
  image: bitnami/kubectl:latest
  before_script:
    - kubectl config set-cluster k8s --server=$K8S_SERVER
  script:
    - kubectl apply -f k8s/ -n $NAMESPACE

deploy-staging:
  extends: .base-deploy
  variables:
    NAMESPACE: staging
  environment:
    name: staging

deploy-production:
  extends: .base-deploy
  variables:
    NAMESPACE: production
  environment:
    name: production
  when: manual
```

---

## 5. GitLab CI Docker 镜像构建？

**回答：**

```yaml
# 方式一: Docker-in-Docker (DinD)
build-image:
  image: docker:24
  services:
    - docker:24-dind                    # DinD 服务
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

# 方式二: Docker Socket Binding
# Runner config.toml 中挂载 docker.sock
# volumes = ["/var/run/docker.sock:/var/run/docker.sock"]
build-image:
  image: docker:24
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA

# 方式三: Kaniko (无需 Docker daemon, 更安全)
build-image:
  image:
    name: gcr.io/kaniko-project/executor:v1.20.0-debug
    entrypoint: [""]
  script:
    - /kaniko/executor
      --context $CI_PROJECT_DIR
      --dockerfile Dockerfile
      --destination $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
      --cache=true
```

---

## 6. GitLab CI 预定义变量？

**回答：**

```
常用预定义变量:

变量名                         说明                    示例值
──────────────────────        ──────────────          ──────────
$CI_PIPELINE_ID                Pipeline ID             12345
$CI_PIPELINE_SOURCE            触发来源                push, merge_request_event
$CI_COMMIT_SHA                 完整 Commit SHA          a1b2c3d4...
$CI_COMMIT_SHORT_SHA           短 SHA                   a1b2c3d4
$CI_COMMIT_BRANCH              分支名                   main
$CI_COMMIT_TAG                 Tag 名                   v1.0.0
$CI_COMMIT_MESSAGE             提交信息                 "fix: bug"
$CI_PROJECT_NAME               项目名                   myapp
$CI_PROJECT_DIR                项目目录                 /builds/org/myapp
$CI_REGISTRY                   Container Registry       registry.gitlab.com
$CI_REGISTRY_IMAGE             项目镜像路径              registry.gitlab.com/org/myapp
$CI_REGISTRY_USER              Registry 用户名           gitlab-ci-token
$CI_REGISTRY_PASSWORD          Registry 密码             (自动提供)
$CI_ENVIRONMENT_NAME           环境名                   production
$CI_MERGE_REQUEST_IID          MR 编号                  42
$GITLAB_USER_LOGIN             触发用户                 admin
```

---

## 7. GitLab CI 缓存与制品？

**回答：**

```
Cache vs Artifacts:

特性            Cache                     Artifacts
──────          ──────────                ──────────
用途            加速构建 (依赖/编译缓存)     保存产出物 (报告/二进制)
生命周期        跨 Pipeline 复用             当前 Pipeline 内传递
存储位置        Runner 本地 或 S3            GitLab 服务器
下载            不可从 UI 下载               可从 UI 下载
传递            不保证可用                   Job 间可靠传递
```

```yaml
# Cache — 加速依赖安装
cache:
  key:
    files:
      - package-lock.json             # 文件变化时更新缓存
    prefix: $CI_COMMIT_REF_SLUG       # 分支级缓存
  paths:
    - node_modules/
  policy: pull-push                    # pull-push | pull | push

# Artifacts — 保存构建产出
build:
  script:
    - npm run build
  artifacts:
    paths:
      - dist/
    exclude:
      - dist/**/*.map
    expire_in: 1 week
    reports:
      junit: test-results.xml

# Job 间传递 Artifacts
test:
  needs: ['build']                    # 自动获取 build 的 artifacts
  script:
    - ls dist/                        # 可以访问 build 产出
    - npm test
```

---

## 8. GitLab CI 环境与部署？

**回答：**

```yaml
# 环境管理
deploy-staging:
  stage: deploy
  script:
    - kubectl apply -f k8s/ -n staging
  environment:
    name: staging
    url: https://staging.example.com
    auto_stop_in: 1 week               # 自动停止
    on_stop: stop-staging

# 动态环境 (每个 MR 创建独立环境)
deploy-review:
  stage: deploy
  script:
    - kubectl create namespace review-$CI_MERGE_REQUEST_IID || true
    - helm upgrade --install myapp ./chart
      -n review-$CI_MERGE_REQUEST_IID
      --set image.tag=$CI_COMMIT_SHA
  environment:
    name: review/$CI_MERGE_REQUEST_IID
    url: https://$CI_MERGE_REQUEST_IID.review.example.com
    on_stop: stop-review
    auto_stop_in: 3 days
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'

stop-review:
  stage: deploy
  script:
    - helm uninstall myapp -n review-$CI_MERGE_REQUEST_IID
    - kubectl delete namespace review-$CI_MERGE_REQUEST_IID
  environment:
    name: review/$CI_MERGE_REQUEST_IID
    action: stop
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: manual
```

---

## 9. GitLab CI 安全扫描？

**回答：**

```yaml
# GitLab 内置安全扫描模板
include:
  - template: Security/SAST.gitlab-ci.yml           # 静态分析
  - template: Security/Dependency-Scanning.gitlab-ci.yml  # 依赖扫描
  - template: Security/Container-Scanning.gitlab-ci.yml    # 容器扫描
  - template: Security/Secret-Detection.gitlab-ci.yml      # 密钥检测
  - template: Security/DAST.gitlab-ci.yml                  # 动态分析

# 自定义 Trivy 扫描
container-scan:
  stage: security
  image:
    name: aquasec/trivy:latest
    entrypoint: [""]
  script:
    - trivy image --exit-code 0 --severity LOW,MEDIUM $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  artifacts:
    reports:
      container_scanning: trivy-report.json
```

---

## 10. GitLab CI 最佳实践？

**回答：**

```
1. 使用 rules 替代 only/except
   - rules 更灵活, 支持复杂条件

2. 使用 needs 加速流水线
   - 打破 Stage 顺序限制, 按依赖并行

3. 模板复用
   - include + extends 避免重复配置
   - 维护团队级 CI 模板仓库

4. 缓存优化
   - 依赖缓存 (node_modules, .m2, pip)
   - key 绑定 lock 文件

5. Kaniko 构建镜像
   - 不需要 Docker daemon, 更安全

6. 动态环境
   - MR 自动创建 Review 环境
   - auto_stop_in 自动清理

7. 安全扫描集成
   - 内置 SAST/DAST/依赖/容器扫描

8. 变量管理
   - 敏感变量: Settings → CI/CD → Variables (masked + protected)
   - 非敏感变量: .gitlab-ci.yml 中的 variables

9. Pipeline 效率
   - interruptible: true → 新 Push 取消旧 Pipeline
   - resource_group → 限制并发部署

10. 监控 Pipeline
    - 关注失败率, 平均执行时间
    - 设置通知 (Slack/邮件/钉钉)
```
