# Ansible 生产实践

---

## 1. 生产级项目目录结构？

**回答：**

```
ansible-project/
├── ansible.cfg                    # 项目配置
├── site.yml                       # 总入口
├── playbooks/
│   ├── webservers.yml             # Web 服务器
│   ├── dbservers.yml              # 数据库
│   ├── monitoring.yml             # 监控
│   └── deploy.yml                 # 应用部署
├── inventories/
│   ├── dev/
│   │   ├── hosts.yml
│   │   ├── group_vars/
│   │   │   ├── all.yml
│   │   │   ├── all/vault.yml      # 加密
│   │   │   └── webservers.yml
│   │   └── host_vars/
│   ├── staging/
│   │   ├── hosts.yml
│   │   └── group_vars/
│   └── production/
│       ├── hosts.yml
│       ├── group_vars/
│       │   ├── all.yml
│       │   └── all/vault.yml
│       └── host_vars/
├── roles/
│   ├── common/                    # 基础配置 (NTP, 用户, SSH)
│   ├── nginx/                     # Web 服务器
│   ├── postgresql/                # 数据库
│   ├── app_deploy/                # 应用部署
│   ├── monitoring/                # 监控 (Prometheus/Node Exporter)
│   └── security/                  # 安全加固
├── collections/
│   └── requirements.yml           # Collection 依赖
├── roles/requirements.yml         # Role 依赖
├── .vault_pass                    # Vault 密码 (.gitignore)
├── .gitignore
├── Makefile                       # 常用命令快捷方式
└── README.md
```

```makefile
# Makefile — 常用命令封装
.PHONY: ping deploy check lint

ENV ?= dev

ping:
	ansible -i inventories/$(ENV)/hosts.yml all -m ping

check:
	ansible-playbook -i inventories/$(ENV)/hosts.yml site.yml --check --diff

deploy:
	ansible-playbook -i inventories/$(ENV)/hosts.yml site.yml

deploy-app:
	ansible-playbook -i inventories/$(ENV)/hosts.yml playbooks/deploy.yml -e "version=$(VERSION)"

lint:
	ansible-lint site.yml
	yamllint .

# 使用: make deploy ENV=production VERSION=1.2.3
```

---

## 2. 多环境管理策略？

**回答：**

```yaml
# inventories/dev/group_vars/all.yml
env: dev
domain: dev.example.com
app_replicas: 1
db_instance_type: t3.small
monitoring_enabled: false
log_level: debug

# inventories/staging/group_vars/all.yml
env: staging
domain: staging.example.com
app_replicas: 2
db_instance_type: t3.medium
monitoring_enabled: true
log_level: info

# inventories/production/group_vars/all.yml
env: production
domain: example.com
app_replicas: 4
db_instance_type: r6g.xlarge
monitoring_enabled: true
log_level: warn
```

```yaml
# 环境感知的 Playbook
- hosts: webservers
  tasks:
    - name: Deploy with env-specific config
      template:
        src: app.conf.j2
        dest: /etc/app/app.conf
      # 模板中使用 {{ env }}, {{ domain }} 等变量

    - name: Production safety checks
      assert:
        that:
          - version is defined
          - version != "latest"
        fail_msg: "Production requires explicit version!"
      when: env == "production"

    - name: Production deployment requires approval
      pause:
        prompt: "Deploying {{ version }} to PRODUCTION. Type 'yes' to continue"
      register: approval
      when: env == "production"
      failed_when: approval.user_input != "yes"
```

---

## 3. AWX / Ansible Tower？

**回答：**

```
AWX = Ansible Tower 的开源版本
Tower = Red Hat 商业版 (现为 AAP — Ansible Automation Platform)

功能:
  Web 界面         → 可视化管理 Playbook/Inventory/凭据
  RBAC             → 基于角色的权限控制
  API              → RESTful API 触发任务
  调度             → 定时执行 Playbook
  审计日志          → 完整操作记录
  凭据管理          → 集中管理密钥/密码
  Workflow          → 多 Playbook 串联/并行
  通知             → Slack/邮件/Webhook
  Survey (表单)     → 执行前收集参数
```

```yaml
# AWX 部署 (Docker Compose)
# https://github.com/ansible/awx

# AWX API 触发 Job
curl -X POST \
  https://awx.example.com/api/v2/job_templates/10/launch/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "extra_vars": {
      "version": "1.2.3",
      "env": "production"
    }
  }'

# CI/CD 集成 AWX
# Jenkins Pipeline
stage('Deploy') {
    steps {
        script {
            httpRequest(
                url: 'https://awx.example.com/api/v2/job_templates/10/launch/',
                httpMode: 'POST',
                customHeaders: [[name: 'Authorization', value: "Bearer ${AWX_TOKEN}"]],
                requestBody: '{"extra_vars": {"version": "1.2.3"}}'
            )
        }
    }
}
```

---

## 4. ansible-pull 模式？

**回答：**

```
传统 Push 模式:
  控制节点 → SSH → 推送命令到目标主机

Pull 模式:
  目标主机 → Git pull → 本地执行 Playbook

适用场景:
  大量主机 (1000+)
  Auto Scaling (新主机自动配置)
  控制节点性能瓶颈
  边缘/离线环境
```

```bash
# 目标主机执行
ansible-pull \
  -U https://github.com/org/ansible-config.git \
  -i localhost, \
  -e "env=production" \
  site.yml

# 定时执行 (cron)
# /etc/cron.d/ansible-pull
*/15 * * * * root ansible-pull \
  -U https://github.com/org/ansible-config.git \
  -d /opt/ansible \
  -i localhost, \
  --clean \
  -o \
  site.yml >> /var/log/ansible-pull.log 2>&1

# -o: 只在 Git 有更新时执行
# --clean: 强制清理本地修改
# -d: 本地 checkout 目录
```

```yaml
# 自动注册 ansible-pull (用 Push 模式初始化)
- name: Setup ansible-pull
  hosts: new_servers
  tasks:
    - name: Install ansible
      apt:
        name: ansible
        state: present

    - name: Setup ansible-pull cron
      cron:
        name: "ansible-pull"
        minute: "*/15"
        job: >
          ansible-pull
          -U https://github.com/org/ansible-config.git
          -i localhost,
          -o
          site.yml >> /var/log/ansible-pull.log 2>&1
```

---

## 5. Ansible + Terraform 联动？

**回答：**

```yaml
# CI/CD Pipeline 联动 (推荐)
# .gitlab-ci.yml
stages:
  - infra
  - config

terraform_apply:
  stage: infra
  script:
    - cd terraform/
    - terraform init
    - terraform apply -auto-approve
    - terraform output -json > ../ansible/tf_outputs.json

ansible_configure:
  stage: config
  needs: [terraform_apply]
  script:
    - cd ansible/
    - python scripts/generate_inventory.py  # tf_outputs.json → inventory
    - ansible-playbook -i inventory/dynamic site.yml
```

```python
# scripts/generate_inventory.py
import json
import yaml

with open('tf_outputs.json') as f:
    outputs = json.load(f)

inventory = {
    'all': {
        'children': {
            'webservers': {
                'hosts': {}
            },
            'dbservers': {
                'hosts': {}
            }
        }
    }
}

for i, ip in enumerate(outputs['web_ips']['value']):
    inventory['all']['children']['webservers']['hosts'][f'web{i+1}'] = {
        'ansible_host': ip
    }

for i, ip in enumerate(outputs['db_ips']['value']):
    inventory['all']['children']['dbservers']['hosts'][f'db{i+1}'] = {
        'ansible_host': ip
    }

with open('inventory/dynamic/hosts.yml', 'w') as f:
    yaml.dump(inventory, f, default_flow_style=False)
```

---

## 6. 自动化测试策略？

**回答：**

```
测试金字塔:
  ┌─────────────┐
  │  集成测试     │  真实环境验证
  ├─────────────┤
  │  Molecule    │  容器/VM 中测试 Role
  ├─────────────┤
  │  ansible-lint│  静态检查
  ├─────────────┤
  │  yamllint    │  YAML 格式
  └─────────────┘
```

```yaml
# CI/CD 测试流水线
# .gitlab-ci.yml
stages:
  - lint
  - test
  - deploy

yamllint:
  stage: lint
  script:
    - pip install yamllint
    - yamllint .

ansible_lint:
  stage: lint
  script:
    - pip install ansible-lint
    - ansible-lint site.yml

molecule_test:
  stage: test
  script:
    - pip install molecule molecule-docker
    - cd roles/nginx
    - molecule test
  services:
    - docker:dind

check_mode:
  stage: test
  script:
    - ansible-playbook -i inventories/staging site.yml --check --diff
  only:
    - merge_requests

deploy_staging:
  stage: deploy
  script:
    - ansible-playbook -i inventories/staging site.yml
  only:
    - main
  when: manual
```

---

## 7. 日志监控与告警？

**回答：**

```ini
# ansible.cfg — 完整日志配置
[defaults]
log_path = /var/log/ansible/ansible.log
callback_whitelist = timer, profile_tasks, community.general.log_plays

# profile_tasks 输出耗时最长的任务 → 性能监控
# log_plays 记录每次执行详情 → 审计
```

```yaml
# 执行失败告警
- hosts: webservers
  tasks:
    - block:
        - import_tasks: deploy.yml
      rescue:
        # Slack 告警
        - name: Notify Slack on failure
          uri:
            url: "{{ slack_webhook_url }}"
            method: POST
            body_format: json
            body:
              text: |
                :x: *Ansible Deployment Failed*
                Host: {{ inventory_hostname }}
                Play: {{ ansible_play_name }}
                Error: {{ ansible_failed_result.msg | default('Unknown') }}
          delegate_to: localhost
          ignore_errors: true

        # 邮件告警
        - name: Send email alert
          mail:
            host: smtp.example.com
            port: 587
            to: ops@example.com
            subject: "[ALERT] Ansible deployment failed"
            body: |
              Deployment failed on {{ inventory_hostname }}
              Time: {{ ansible_date_time.iso8601 }}
          delegate_to: localhost
          ignore_errors: true
```

---

## 8. 大规模部署策略 (1000+ 主机)？

**回答：**

```
策略:
  1. 拆分 Inventory
     按地域/业务拆分: inventories/us-east/, inventories/ap-northeast/
     分批执行: ansible-playbook -i inventories/us-east/ site.yml

  2. 滚动部署
     serial: [1, 5, "25%", "100%"]  # 逐步放量

  3. Pull 模式
     ansible-pull + Git → 主机自拉取

  4. AWX/Tower 分布式
     多个执行节点, 按组分配

  5. 性能调优
     forks: 100+
     pipelining: true
     fact_caching: redis
     gather_facts: false (或 smart)

  6. 架构设计
     堡垒机/跳板机:
       ansible.cfg:
       [ssh_connection]
       ssh_args = -o ProxyJump=bastion.example.com
```

```yaml
# 分批执行脚本
#!/bin/bash
# deploy_all.sh
ENVIRONMENTS=("us-east" "us-west" "eu-west" "ap-northeast")

for env in "${ENVIRONMENTS[@]}"; do
    echo "=== Deploying to $env ==="
    ansible-playbook \
        -i "inventories/$env/hosts.yml" \
        site.yml \
        -e "version=$VERSION" \
        --forks 50

    if [ $? -ne 0 ]; then
        echo "FAILED in $env, stopping!"
        exit 1
    fi

    echo "=== $env complete, waiting 60s ==="
    sleep 60
done
```

---

## 9. 安全加固 Playbook 示例？

**回答：**

```yaml
# roles/security/tasks/main.yml
---
- name: Update all packages
  apt:
    upgrade: dist
    update_cache: yes

- name: Configure SSH hardening
  lineinfile:
    path: /etc/ssh/sshd_config
    regexp: "{{ item.regexp }}"
    line: "{{ item.line }}"
  loop:
    - { regexp: '^#?PermitRootLogin', line: 'PermitRootLogin no' }
    - { regexp: '^#?PasswordAuthentication', line: 'PasswordAuthentication no' }
    - { regexp: '^#?X11Forwarding', line: 'X11Forwarding no' }
    - { regexp: '^#?MaxAuthTries', line: 'MaxAuthTries 3' }
    - { regexp: '^#?AllowTcpForwarding', line: 'AllowTcpForwarding no' }
    - { regexp: '^#?ClientAliveInterval', line: 'ClientAliveInterval 300' }
    - { regexp: '^#?ClientAliveCountMax', line: 'ClientAliveCountMax 2' }
  notify: restart sshd

- name: Configure firewall
  ufw:
    rule: "{{ item.rule }}"
    port: "{{ item.port }}"
    proto: "{{ item.proto | default('tcp') }}"
  loop:
    - { rule: allow, port: "22" }
    - { rule: allow, port: "{{ http_port | default('80') }}" }
    - { rule: allow, port: "{{ https_port | default('443') }}" }

- name: Enable firewall
  ufw:
    state: enabled
    policy: deny

- name: Configure fail2ban
  apt:
    name: fail2ban
    state: present

- name: Set file permissions
  file:
    path: "{{ item.path }}"
    mode: "{{ item.mode }}"
  loop:
    - { path: /etc/passwd, mode: '0644' }
    - { path: /etc/shadow, mode: '0640' }
    - { path: /etc/crontab, mode: '0600' }

- name: Configure automatic updates
  apt:
    name: unattended-upgrades
    state: present

- name: Disable unused services
  service:
    name: "{{ item }}"
    state: stopped
    enabled: no
  loop: "{{ disabled_services | default([]) }}"
  ignore_errors: true
```

---

## 10. 面试高频实战题？

**回答：**

```
Q: 如何实现零停机部署？
A: 
  1. serial + 负载均衡器 API (逐台摘除/加回)
  2. Blue-Green: 部署到新组 → 切换 LB → 验证 → 释放旧组
  3. 前置健康检查 + 后置冒烟测试
  4. block/rescue 回滚机制

Q: 如何管理 1000+ 台服务器？
A:
  1. 动态 Inventory (AWS/Azure 插件)
  2. Pull 模式 (ansible-pull + cron)
  3. AWX/Tower 分布式执行
  4. forks 100+ / pipelining / fact_caching
  5. 按地域/业务拆分 Inventory

Q: Ansible 如何实现 CI/CD？
A:
  1. GitLab CI / GitHub Actions 触发 ansible-playbook
  2. Vault 密码通过 CI/CD Secret 注入
  3. --check --diff 在 MR 中预览变更
  4. serial + 健康检查实现滚动部署
  5. AWX API 集成

Q: 如何处理秘钥轮换？
A:
  1. 新密钥 → authorized_key state=present
  2. 验证新密钥连通性
  3. 旧密钥 → authorized_key state=absent
  4. ansible-vault rekey 更新 Vault 密码
  5. 更新 CI/CD 中的密码变量

Q: Ansible 如何与容器/K8s 协作？
A:
  Ansible 用途:
    - 初始化 K8s 节点 (kubeadm)
    - 部署 Helm Charts
    - 管理 K8s 外的基础设施
  K8s 用途:
    - 容器编排和自愈
    - 服务发现和负载均衡
  分界: Ansible 管理节点 → K8s 管理容器

Q: 如何保证 Playbook 质量？
A:
  1. ansible-lint + yamllint (CI 中自动运行)
  2. Molecule 测试 (Role 级别)
  3. --check --diff (MR 预览)
  4. Code Review (Playbook 审查)
  5. 分环境逐步部署 (dev → staging → prod)
  6. 回滚方案 (block/rescue + 版本管理)
```
