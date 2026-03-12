# Jenkins 详解

---

## 1. Jenkins 架构与核心概念？

**回答：**

```
┌─────────────────────────────────────────┐
│            Jenkins Controller           │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │  Web UI  │ │  调度器   │ │ 插件管理 │ │
│  └──────────┘ └──────────┘ └─────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ │
│  │ 任务配置  │ │ 凭证管理  │ │ 构建历史 │ │
│  └──────────┘ └──────────┘ └─────────┘ │
└────────┬───────────┬───────────┬────────┘
         │           │           │
    ┌────▼────┐ ┌────▼────┐ ┌───▼─────┐
    │ Agent 1 │ │ Agent 2 │ │ Agent 3 │
    │ (Linux) │ │(Windows)│ │ (K8s)   │
    └─────────┘ └─────────┘ └─────────┘

核心概念:
  Controller (Master)   → 管理配置/调度/UI, 不执行构建
  Agent (Node/Slave)    → 执行构建任务
  Executor              → Agent 上的并行执行槽位
  Job / Project         → 一个构建任务
  Build                 → Job 的一次执行
  Pipeline              → 复杂的多阶段流水线 (Jenkinsfile)
  Workspace             → 构建的工作目录
  Plugin                → 扩展 Jenkins 功能
```

### Agent 连接方式

```
方式              说明                   适用
──────────       ──────────────        ──────────
SSH              Controller SSH 到 Agent  Linux Agent
JNLP/WebSocket   Agent 主动连接 Controller  防火墙限制
Docker           每次构建启动容器            隔离环境
Kubernetes       K8s Pod 作为动态 Agent      弹性伸缩
```

---

## 2. Jenkinsfile 声明式 vs 脚本式？

**回答：**

| 特性 | 声明式 (Declarative) | 脚本式 (Scripted) |
|------|---------------------|-------------------|
| 语法 | 结构化、固定格式 | Groovy 脚本、完全灵活 |
| 起始关键字 | `pipeline { }` | `node { }` |
| 错误检查 | 编译时语法校验 | 运行时发现错误 |
| 学习曲线 | 低 | 高 (需懂 Groovy) |
| 复杂逻辑 | 用 `script { }` 块嵌入 | 原生支持 |
| 推荐度 | ✅ 推荐 (Jenkins 2.x+) | 极复杂场景使用 |

### 声明式 Pipeline 完整示例

```groovy
pipeline {
    agent {
        kubernetes {
            yaml '''
            apiVersion: v1
            kind: Pod
            spec:
              containers:
                - name: maven
                  image: maven:3.9-eclipse-temurin-17
                  command: ['sleep', 'infinity']
                - name: docker
                  image: docker:24-dind
                  securityContext:
                    privileged: true
            '''
        }
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        retry(2)
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }

    environment {
        DOCKER_REGISTRY = 'registry.example.com'
        IMAGE_NAME = 'myapp'
        VERSION = "${env.BUILD_NUMBER}"
    }

    parameters {
        string(name: 'DEPLOY_ENV', defaultValue: 'staging', description: '部署环境')
        booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: '跳过测试')
        choice(name: 'REGION', choices: ['us-east', 'eu-west', 'ap-east'], description: '区域')
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build') {
            steps {
                container('maven') {
                    sh 'mvn clean package -DskipTests'
                }
            }
        }

        stage('Test') {
            when {
                not { expression { params.SKIP_TESTS } }
            }
            parallel {
                stage('Unit Tests') {
                    steps {
                        container('maven') {
                            sh 'mvn test'
                        }
                    }
                    post {
                        always {
                            junit '**/target/surefire-reports/*.xml'
                        }
                    }
                }
                stage('Integration Tests') {
                    steps {
                        container('maven') {
                            sh 'mvn verify -P integration'
                        }
                    }
                }
            }
        }

        stage('Docker Build & Push') {
            steps {
                container('docker') {
                    script {
                        def image = docker.build("${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION}")
                        docker.withRegistry("https://${DOCKER_REGISTRY}", 'docker-credentials') {
                            image.push()
                            image.push('latest')
                        }
                    }
                }
            }
        }

        stage('Deploy') {
            input {
                message "Deploy to ${params.DEPLOY_ENV}?"
                ok "Deploy"
                submitter "admin,deployer"
            }
            steps {
                sh """
                kubectl set image deployment/myapp \
                  myapp=${DOCKER_REGISTRY}/${IMAGE_NAME}:${VERSION} \
                  -n ${params.DEPLOY_ENV}
                """
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            echo 'Pipeline succeeded!'
        }
        failure {
            echo 'Pipeline failed!'
        }
    }
}
```

---

## 3. Jenkins 共享库 (Shared Library)？

**回答：**

共享库允许多个 Pipeline 复用公共逻辑。

```
shared-library/                    # Git 仓库
├── vars/                          # 全局变量/函数
│   ├── deployToK8s.groovy         # 可在 Pipeline 中直接调用
│   ├── sendNotification.groovy
│   └── standardPipeline.groovy
├── src/
│   └── com/example/
│       ├── DockerUtils.groovy     # Groovy 类
│       └── K8sUtils.groovy
└── resources/
    └── templates/
        └── deployment.yaml
```

```groovy
// vars/deployToK8s.groovy
def call(Map config) {
    def namespace = config.namespace ?: 'default'
    def timeout = config.timeout ?: 300
    
    sh "kubectl set image deployment/${config.name} ${config.name}=${config.image} -n ${namespace}"
    sh "kubectl rollout status deployment/${config.name} -n ${namespace} --timeout=${timeout}s"
}

// vars/standardPipeline.groovy — 标准流水线模板
def call(Map config) {
    pipeline {
        agent any
        stages {
            stage('Build') {
                steps {
                    sh config.buildCommand ?: 'mvn clean package'
                }
            }
            stage('Test') {
                steps {
                    sh config.testCommand ?: 'mvn test'
                }
            }
            stage('Deploy') {
                steps {
                    deployToK8s(
                        name: config.appName,
                        image: "${config.registry}/${config.appName}:${env.BUILD_NUMBER}",
                        namespace: config.namespace
                    )
                }
            }
        }
    }
}
```

### 使用共享库

```groovy
// Jenkinsfile — 在 Jenkins 全局配置中注册共享库
@Library('my-shared-lib') _

// 方式一: 使用自定义步骤
pipeline {
    agent any
    stages {
        stage('Deploy') {
            steps {
                deployToK8s(name: 'myapp', image: 'myapp:1.0', namespace: 'prod')
            }
        }
    }
}

// 方式二: 使用标准流水线模板
@Library('my-shared-lib') _
standardPipeline(
    appName: 'myapp',
    registry: 'registry.example.com',
    namespace: 'production',
    buildCommand: 'gradle build',
    testCommand: 'gradle test'
)
```

---

## 4. Jenkins 插件管理与常用插件？

**回答：**

```
分类              插件名                            功能
──────────       ──────────────────────           ──────────────
SCM              Git Plugin                        Git 集成
                 GitHub/GitLab Plugin               Webhook 集成

Pipeline         Pipeline                          声明式/脚本式 Pipeline
                 Blue Ocean                        现代化 UI
                 Pipeline Utility Steps             文件操作、JSON解析

构建              Docker Pipeline                    Docker 集成
                 Kubernetes Plugin                  K8s 动态 Agent
                 Maven/Gradle Plugin                构建工具集成

测试              JUnit Plugin                       测试报告
                 Cobertura                          覆盖率报告
                 HTML Publisher                     HTML 报告

凭证              Credentials Binding                凭证注入
                 HashiCorp Vault                    Vault 集成
                 AWS Credentials                    AWS 凭证

通知              Slack Notification                  Slack 通知
                 Email Extension                    邮件通知
                 DingTalk                           钉钉通知

安全              Role-based Authorization            RBAC
                 LDAP/Active Directory               统一认证
                 Audit Trail                        操作审计
```

### 插件管理最佳实践

```
1. 定期更新插件 (安全修复)
2. 只安装必要插件 (减少攻击面)
3. 使用 Configuration as Code (JCasC) 管理配置
4. 测试环境先验证插件更新
5. 备份 $JENKINS_HOME 再升级
```

---

## 5. Jenkins Configuration as Code (JCasC)？

**回答：**

JCasC 允许用 YAML 文件管理 Jenkins 配置，取代手动 UI 配置。

```yaml
# jenkins.yaml
jenkins:
  systemMessage: "Jenkins managed by JCasC"
  numExecutors: 0                       # Controller 不执行构建
  mode: EXCLUSIVE

  securityRealm:
    ldap:
      configurations:
        - server: ldap.example.com
          rootDN: dc=example,dc=com
          userSearchFilter: "(uid={0})"

  authorizationStrategy:
    roleBased:
      roles:
        global:
          - name: admin
            permissions:
              - "Overall/Administer"
            entries:
              - user: admin
          - name: developer
            permissions:
              - "Job/Build"
              - "Job/Read"
              - "Job/Workspace"
            entries:
              - group: developers

  clouds:
    - kubernetes:
        name: k8s
        serverUrl: https://kubernetes.default.svc
        namespace: jenkins
        jenkinsUrl: http://jenkins:8080
        templates:
          - name: default
            label: k8s-agent
            containers:
              - name: jnlp
                image: jenkins/inbound-agent:latest
                resourceLimitCpu: "500m"
                resourceLimitMemory: "512Mi"

credentials:
  system:
    domainCredentials:
      - credentials:
          - usernamePassword:
              id: "docker-registry"
              username: "admin"
              password: "${DOCKER_PASSWORD}"
              scope: GLOBAL

unclassified:
  location:
    url: https://jenkins.example.com
```

---

## 6. Jenkins 与 Kubernetes 集成？

**回答：**

使用 Kubernetes Plugin，Jenkins 可以在 K8s 中动态创建 Pod 作为 Agent。

```
流程:
  1. Pipeline 启动
  2. Jenkins Controller 调用 K8s API 创建 Pod
  3. Pod 中的 JNLP 容器连接 Controller
  4. Pod 中的其他容器执行构建任务
  5. 构建完成, Pod 自动销毁

优势:
  弹性伸缩 → 按需创建, 用完即销
  环境隔离 → 每次构建独立 Pod
  资源利用 → 共享 K8s 集群资源
```

```groovy
// Jenkinsfile — K8s Pod 模板
pipeline {
    agent {
        kubernetes {
            inheritFrom 'default'
            yaml '''
            apiVersion: v1
            kind: Pod
            metadata:
              labels:
                jenkins: agent
            spec:
              containers:
                - name: maven
                  image: maven:3.9-eclipse-temurin-17
                  command: ['sleep', 'infinity']
                  volumeMounts:
                    - name: maven-cache
                      mountPath: /root/.m2
                - name: docker
                  image: docker:24
                  command: ['sleep', 'infinity']
                  volumeMounts:
                    - name: docker-sock
                      mountPath: /var/run/docker.sock
                - name: kubectl
                  image: bitnami/kubectl:latest
                  command: ['sleep', 'infinity']
              volumes:
                - name: maven-cache
                  persistentVolumeClaim:
                    claimName: maven-cache-pvc
                - name: docker-sock
                  hostPath:
                    path: /var/run/docker.sock
            '''
        }
    }

    stages {
        stage('Build') {
            steps {
                container('maven') {
                    sh 'mvn clean package -DskipTests'
                }
            }
        }
        stage('Docker Build') {
            steps {
                container('docker') {
                    sh 'docker build -t myapp:${BUILD_NUMBER} .'
                }
            }
        }
        stage('Deploy') {
            steps {
                container('kubectl') {
                    sh 'kubectl apply -f k8s/'
                }
            }
        }
    }
}
```

---

## 7. Jenkins 安全配置？

**回答：**

```
领域                 配置
──────────          ──────────────────────────────────
认证                 LDAP / SAML SSO / GitHub OAuth
授权                 Role-Based Strategy (RBAC)
CSRF                 启用 CSRF Protection (默认)
Agent 安全            Agent → Controller 访问控制
凭证                 凭证加密存储, 限制使用范围
API Token            禁用旧版 Token, 使用 API Token
脚本安全              Script Security Plugin — 脚本审批
审计                 Audit Trail Plugin — 操作日志
网络                 HTTPS (反向代理 Nginx/Traefik)
```

```groovy
// 凭证安全使用
pipeline {
    stages {
        stage('Deploy') {
            steps {
                withCredentials([
                    usernamePassword(
                        credentialsId: 'docker-registry',
                        usernameVariable: 'DOCKER_USER',
                        passwordVariable: 'DOCKER_PASS'
                    ),
                    string(
                        credentialsId: 'kube-token',
                        variable: 'KUBE_TOKEN'
                    )
                ]) {
                    sh 'docker login -u $DOCKER_USER -p $DOCKER_PASS registry.example.com'
                    // $DOCKER_PASS 在日志中自动掩码为 ****
                }
            }
        }
    }
}
```

---

## 8. Jenkins 多分支流水线 (Multibranch Pipeline)？

**回答：**

自动为仓库中每个包含 Jenkinsfile 的分支和 PR 创建 Pipeline。

```
仓库结构:
  main          → Pipeline (自动构建)
  develop       → Pipeline (自动构建)
  feature/login → Pipeline (自动构建)
  PR #42        → Pipeline (自动构建)

工作流:
  1. 扫描仓库分支 (定时或 Webhook)
  2. 发现包含 Jenkinsfile 的分支
  3. 自动创建对应的 Pipeline Job
  4. 分支删除后自动清理 Job
```

```groovy
// Jenkinsfile — 根据分支区分行为
pipeline {
    agent any

    stages {
        stage('Build') {
            steps {
                sh 'mvn clean package'
            }
        }

        stage('Deploy to Dev') {
            when {
                branch 'develop'
            }
            steps {
                sh 'kubectl apply -f k8s/ -n dev'
            }
        }

        stage('Deploy to Staging') {
            when {
                branch 'main'
            }
            steps {
                sh 'kubectl apply -f k8s/ -n staging'
            }
        }

        stage('Deploy to Production') {
            when {
                tag pattern: "v\\d+\\.\\d+\\.\\d+", comparator: "REGEXP"
            }
            input {
                message "Deploy to production?"
            }
            steps {
                sh 'kubectl apply -f k8s/ -n production'
            }
        }
    }
}
```

---

## 9. Jenkins 性能优化？

**回答：**

```
问题              解决方案
──────────       ──────────────────────────────
构建慢             并行阶段 (parallel), 增量构建
排队等待           增加 Agent, K8s 动态 Agent
磁盘占用           构建历史保留策略 (logRotator)
内存不足           增大 JVM 堆 (-Xmx4g)
Controller 负载     不在 Controller 上执行构建
依赖下载慢          本地 Maven/NPM 缓存 (PVC)
Docker 构建慢       多阶段构建, 缓存层不变
```

```groovy
// 优化示例
pipeline {
    options {
        buildDiscarder(logRotator(
            numToKeepStr: '10',      // 最多保留 10 次构建
            daysToKeepStr: '30'      // 最多保留 30 天
        ))
        disableConcurrentBuilds()    // 禁止并行构建
        skipStagesAfterUnstable()    // 不稳定后跳过后续
    }

    stages {
        stage('Parallel Tests') {
            parallel {
                stage('Unit') { steps { sh 'mvn test' } }
                stage('Lint') { steps { sh 'mvn checkstyle:check' } }
                stage('Security') { steps { sh 'mvn dependency-check:check' } }
            }
        }
    }
}
```

---

## 10. Jenkins 高可用与运维？

**回答：**

```
Jenkins HA 方案:

方案 1: Active/Passive
  Active Controller + Standby Controller
  共享存储 ($JENKINS_HOME on NFS/EFS)
  Load Balancer 健康检查自动切换

方案 2: CloudBees Jenkins (商业版)
  原生 HA 支持
  Controller 集群

方案 3: Jenkins on K8s (Helm)
  helm install jenkins jenkinsci/jenkins
  PVC 持久化 $JENKINS_HOME
  K8s 自动重启

备份:
  $JENKINS_HOME 完整备份 (配置, 任务, 插件, 凭证)
  或使用 ThinBackup Plugin
  定期备份到 S3/GCS

升级:
  先备份 → 测试环境验证 → 逐步升级
  Jenkins LTS 版本 (稳定)
  检查插件兼容性

监控:
  /metrics 端点 → Prometheus
  关键指标: 队列长度, 构建时间, Agent 在线数, 磁盘使用
```
