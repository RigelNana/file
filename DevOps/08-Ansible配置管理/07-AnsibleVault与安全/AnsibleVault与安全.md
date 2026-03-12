# Ansible Vault 与安全

---

## 1. Ansible Vault 是什么？

**回答：**

Ansible Vault 是内置的加密工具，用于保护 Playbook 中的敏感数据。

```
功能:
  加密文件         → 整个 YAML 文件加密
  加密变量         → 单个变量值加密
  加密算法         → AES-256 (对称加密)
  密码管理         → 密码文件 / 脚本 / 交互输入

适用场景:
  数据库密码
  API 密钥 / Token
  SSL 证书私钥
  云平台认证信息
  SSH 私钥
```

---

## 2. Vault 基本操作？

**回答：**

```bash
# 创建加密文件
ansible-vault create secrets.yml
# 打开编辑器, 输入内容, 保存后自动加密

# 加密已有文件
ansible-vault encrypt vars/production.yml
ansible-vault encrypt group_vars/production/vault.yml

# 查看加密文件
ansible-vault view secrets.yml

# 编辑加密文件
ansible-vault edit secrets.yml

# 解密文件
ansible-vault decrypt secrets.yml

# 重新设置密码
ansible-vault rekey secrets.yml
ansible-vault rekey --new-vault-password-file=new_pw.txt secrets.yml

# 加密字符串 (内联变量)
ansible-vault encrypt_string 'SuperSecret123' --name 'db_password'
# 输出:
# db_password: !vault |
#   $ANSIBLE_VAULT;1.1;AES256
#   36643230626237353336...

# 从 stdin 加密
echo -n 'MySecret' | ansible-vault encrypt_string --stdin-name 'api_key'

# 批量加密文件
ansible-vault encrypt group_vars/*/vault.yml
```

---

## 3. Vault 密码管理方式？

**回答：**

```bash
# 方式 1: 交互输入
ansible-playbook site.yml --ask-vault-pass

# 方式 2: 密码文件
echo 'MyVaultPassword' > .vault_pass
chmod 600 .vault_pass
ansible-playbook site.yml --vault-password-file=.vault_pass

# 方式 3: ansible.cfg 配置
[defaults]
vault_password_file = .vault_pass

# 方式 4: 环境变量
export ANSIBLE_VAULT_PASSWORD_FILE=.vault_pass
ansible-playbook site.yml

# 方式 5: 密码脚本 (推荐生产环境)
cat > vault_pass.sh << 'EOF'
#!/bin/bash
# 从密码管理器获取
pass show ansible/vault-password
# 或从环境变量
# echo "$VAULT_PASSWORD"
# 或从 AWS SSM
# aws ssm get-parameter --name /ansible/vault-pass --with-decryption --query Parameter.Value --output text
EOF
chmod 700 vault_pass.sh
ansible-playbook site.yml --vault-password-file=vault_pass.sh

# 安全: .vault_pass 加入 .gitignore
echo '.vault_pass' >> .gitignore
echo 'vault_pass.sh' >> .gitignore
```

---

## 4. 多 Vault ID (多密码)？

**回答：**

```bash
# Ansible 2.4+ 支持多个 Vault ID (不同文件用不同密码)

# 创建时指定 Vault ID
ansible-vault create --vault-id dev@prompt secrets_dev.yml
ansible-vault create --vault-id prod@.vault_pass_prod secrets_prod.yml

# 加密字符串指定 ID
ansible-vault encrypt_string --vault-id prod@.vault_pass_prod 'SecretValue' --name 'password'

# 执行时提供多个密码
ansible-playbook site.yml \
  --vault-id dev@.vault_pass_dev \
  --vault-id prod@.vault_pass_prod

# ansible.cfg 配置多密码
[defaults]
vault_identity_list = dev@.vault_pass_dev, prod@.vault_pass_prod
```

```
使用场景:
  不同环境用不同密码:
    dev   → 开发组密码
    prod  → 仅运维组知道的密码

  不同用途不同密码:
    db    → 数据库密码
    api   → API 密钥
    cert  → 证书密码
```

---

## 5. Vault 文件组织最佳实践？

**回答：**

```
推荐模式: 变量间接引用

group_vars/
├── all/
│   ├── vars.yml          # 明文变量
│   └── vault.yml         # 加密变量 (vault_ 前缀)
├── production/
│   ├── vars.yml
│   └── vault.yml
└── staging/
    ├── vars.yml
    └── vault.yml
```

```yaml
# group_vars/production/vault.yml (加密)
vault_db_password: "ProductionDBPass123"
vault_api_key: "prod-api-key-abc123"
vault_ssl_key: |
  -----BEGIN RSA PRIVATE KEY-----
  MIIEowIBAAKCAQEA...
  -----END RSA PRIVATE KEY-----

# group_vars/production/vars.yml (明文, 引用加密变量)
db_password: "{{ vault_db_password }}"
api_key: "{{ vault_api_key }}"
ssl_key: "{{ vault_ssl_key }}"

# 好处:
#   1. vars.yml 可以看到所有变量名 (不用解密也知道有哪些)
#   2. vault.yml 专门存放密文
#   3. 变量名无 vault_ 前缀, 使用更自然
#   4. grep 搜索变量时能找到引用关系
```

---

## 6. Vault 与 CI/CD 集成？

**回答：**

```yaml
# GitLab CI 集成
# .gitlab-ci.yml
deploy:
  stage: deploy
  script:
    - echo "$VAULT_PASSWORD" > .vault_pass
    - chmod 600 .vault_pass
    - ansible-playbook -i inventory/production site.yml --vault-password-file=.vault_pass
    - rm -f .vault_pass
  variables:
    VAULT_PASSWORD: $ANSIBLE_VAULT_PASSWORD   # CI/CD 变量 (Secret)

# GitHub Actions
# .github/workflows/deploy.yml
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run Ansible
        env:
          VAULT_PASSWORD: ${{ secrets.ANSIBLE_VAULT_PASSWORD }}
        run: |
          echo "$VAULT_PASSWORD" > .vault_pass
          chmod 600 .vault_pass
          ansible-playbook -i inventory/production site.yml --vault-password-file=.vault_pass
          rm -f .vault_pass

# Jenkins Pipeline
pipeline {
    environment {
        VAULT_PASS = credentials('ansible-vault-password')
    }
    stages {
        stage('Deploy') {
            steps {
                sh '''
                    echo "$VAULT_PASS" > .vault_pass
                    chmod 600 .vault_pass
                    ansible-playbook site.yml --vault-password-file=.vault_pass
                    rm -f .vault_pass
                '''
            }
        }
    }
}
```

---

## 7. no_log 与敏感信息保护？

**回答：**

```yaml
# no_log: true — 隐藏任务输出中的敏感信息

- name: Set database password
  mysql_user:
    name: app
    password: "{{ db_password }}"
    priv: "app_db.*:ALL"
  no_log: true                    # 输出中不显示参数

# 全局设置
# ansible.cfg
[defaults]
no_log = false                    # 默认 false, 不要全局设为 true

# 条件 no_log
- name: Create user
  user:
    name: "{{ item.name }}"
    password: "{{ item.password | password_hash('sha512') }}"
  loop: "{{ users }}"
  no_log: "{{ not (debug_mode | default(false)) }}"
  # debug 模式时显示, 生产时隐藏

# 注意事项
# no_log: true 会在 -vvv 模式下仍然隐藏
# 但在某些错误场景可能泄露, 需结合其他措施
```

---

## 8. SSH 密钥与认证安全？

**回答：**

```yaml
# SSH 密钥配置
[webservers:vars]
ansible_user: deploy
ansible_ssh_private_key_file: ~/.ssh/deploy_ed25519
ansible_ssh_common_args: '-o StrictHostKeyChecking=yes'

# SSH Agent 转发
# ansible.cfg
[ssh_connection]
ssh_args = -o ForwardAgent=yes

# become 提权安全
[privilege_escalation]
become = true
become_method = sudo
become_user = root
become_ask_pass = false       # sudoers NOPASSWD 配置

# sudoers 最小权限
# /etc/sudoers.d/ansible-deploy
deploy ALL=(ALL) NOPASSWD: /usr/bin/apt, /usr/bin/systemctl, /usr/bin/cp, /usr/bin/mv

# 密钥轮换
- name: Rotate SSH keys
  authorized_key:
    user: deploy
    key: "{{ lookup('file', 'files/new_deploy_key.pub') }}"
    state: present

- name: Remove old key
  authorized_key:
    user: deploy
    key: "{{ lookup('file', 'files/old_deploy_key.pub') }}"
    state: absent
```

---

## 9. Vault 替代方案 — 外部密钥管理？

**回答：**

```yaml
# HashiCorp Vault (通过 lookup 插件)
- name: Get secret from HashiCorp Vault
  set_fact:
    db_password: "{{ lookup('community.hashi_vault.hashi_vault',
                      'secret=secret/data/myapp/db:password
                       url=https://vault.example.com
                       token={{ vault_token }}') }}"

# AWS Secrets Manager
- name: Get secret from AWS
  set_fact:
    db_password: "{{ lookup('amazon.aws.aws_secret',
                      'myapp/db-password',
                      region='us-east-1') }}"

# AWS SSM Parameter Store
- name: Get parameter from SSM
  set_fact:
    api_key: "{{ lookup('amazon.aws.aws_ssm',
                   '/myapp/api-key',
                   region='us-east-1') }}"

# Azure Key Vault
- name: Get secret from Azure
  set_fact:
    db_password: "{{ lookup('azure.azcollection.azure_keyvault_secret',
                      'db-password',
                      vault_url='https://myvault.vault.azure.net') }}"

# 环境变量 (简单场景)
- name: Use env variable
  set_fact:
    api_key: "{{ lookup('env', 'APP_API_KEY') }}"
```

```
对比:
  Ansible Vault          → 简单, 文件级加密, 适合小团队
  HashiCorp Vault        → 企业级, 动态凭据, 审计, 租约
  AWS Secrets Manager    → AWS 原生, 自动轮换
  Azure Key Vault        → Azure 原生, HSM 支持
  
选型:
  小团队/简单项目   → Ansible Vault
  企业/合规要求     → HashiCorp Vault / 云厂商方案
  混合             → Ansible Vault + 外部密钥管理
```

---

## 10. 安全最佳实践总结？

**回答：**

```
密码管理:
  ✓ 所有密码用 Vault 加密, 不要明文提交 Git
  ✓ .vault_pass 加入 .gitignore
  ✓ CI/CD 中用环境变量传递 Vault 密码
  ✓ 生产环境用密码脚本 (从密码管理器获取)
  ✓ 定期轮换 Vault 密码 (ansible-vault rekey)

SSH 安全:
  ✓ 使用 SSH 密钥认证, 禁用密码登录
  ✓ 使用 ed25519 算法
  ✓ 设置 SSH 密钥过期和轮换
  ✓ 限制 sudo 权限 (sudoers NOPASSWD)

任务安全:
  ✓ 敏感任务用 no_log: true
  ✓ 不在 debug 中输出完整结果
  ✓ 使用 assert 验证输入

网络安全:
  ✓ 使用 SSH 加密通道
  ✓ 限制控制节点网络访问
  ✓ 生产环境通过堡垒机/跳板机

代码安全:
  ✓ Playbook 代码审查
  ✓ 使用 ansible-lint 检查安全项
  ✓ 固定 Collection/Role 版本
  ✓ 验证下载的 Role 完整性

审计:
  ✓ 开启 Ansible 日志 (log_path)
  ✓ 使用 callback 插件记录操作
  ✓ 集成 SIEM 系统
  ✓ AWX/Tower 提供完整审计日志

检查清单:
  □ .vault_pass 在 .gitignore 中
  □ 所有敏感变量已加密
  □ no_log 已应用于敏感任务
  □ SSH 密钥权限 600
  □ sudoers 最小权限
  □ 日志已开启
  □ 定期密码轮换计划
```
