# Ansible 配置管理八股文

---

## 一、Ansible 基础

### 1. Ansible 是什么？有什么特点？

**答：** Ansible 是一个开源的 IT 自动化工具，用于配置管理、应用部署和任务编排。

**核心特点：**
- **无代理（Agentless）**：不需要在被管理节点安装 Agent，通过 SSH 连接
- **幂等性**：多次执行结果相同
- **声明式**：描述期望状态，而非操作步骤
- **YAML 语法**：简单易读
- **模块丰富**：数千个内置模块
- **可扩展**：支持自定义模块和插件

### 2. Ansible 和其他配置管理工具的对比？

**答：**

| 特性 | Ansible | Puppet | Chef | SaltStack |
|------|---------|--------|------|-----------|
| 语言 | YAML | DSL (Ruby-like) | Ruby | YAML/Python |
| 架构 | 无代理 (SSH) | 有代理 (Agent) | 有代理 (Agent) | 有/无代理 |
| 学习曲线 | 低 | 中 | 高 | 中 |
| 推/拉模式 | Push | Pull | Pull | Push/Pull |
| 性能 | 中等 | 好 | 好 | 好 |
| 适用场景 | 通用（配置、部署、编排） | 大规模配置管理 | 复杂应用部署 | 大规模基础设施 |

### 3. Ansible 的架构和核心组件？

**答：**

```
控制节点 (Control Node)
  ├── ansible.cfg        # 配置文件
  ├── inventory          # 主机清单
  ├── playbook.yml       # 剧本
  ├── roles/             # 角色
  └── group_vars/        # 组变量
        ↓ SSH
被管理节点 (Managed Nodes)
  ├── Node 1
  ├── Node 2
  └── Node 3
```

| 组件 | 说明 |
|------|------|
| **Inventory** | 定义管理的主机和分组 |
| **Module** | 执行特定任务的单元（如 apt, copy, service） |
| **Playbook** | YAML 格式的任务编排文件 |
| **Role** | 可复用的 Playbook 组织结构 |
| **Task** | 调用模块的单个操作 |
| **Handler** | 被通知时才执行的任务（如重启服务） |
| **Fact** | 自动收集的系统信息 |
| **Vault** | 加密敏感数据 |

---

## 二、Inventory 主机清单

### 4. 如何定义 Inventory？

**答：**

```ini
# /etc/ansible/hosts 或 inventory/hosts (INI 格式)

# 单个主机
web1.example.com
192.168.1.100

# 主机组
[webservers]
web1.example.com ansible_host=192.168.1.101
web2.example.com ansible_host=192.168.1.102

[dbservers]
db1.example.com ansible_host=192.168.1.201
db2.example.com ansible_host=192.168.1.202

# 子组
[production:children]
webservers
dbservers

# 主机变量
[webservers:vars]
ansible_user=deploy
ansible_port=22
http_port=80

# 范围表示法
[web]
web[01:10].example.com        # web01 到 web10
192.168.1.[100:110]           # 100 到 110
```

```yaml
# YAML 格式 inventory
all:
  children:
    production:
      children:
        webservers:
          hosts:
            web1:
              ansible_host: 192.168.1.101
            web2:
              ansible_host: 192.168.1.102
          vars:
            http_port: 80
        dbservers:
          hosts:
            db1:
              ansible_host: 192.168.1.201
```

---

## 三、Playbook

### 5. Playbook 的基本结构？

**答：**

```yaml
---
# playbook.yml
- name: Configure Web Servers
  hosts: webservers
  become: yes                     # 使用 sudo
  gather_facts: yes               # 收集系统信息

  vars:
    http_port: 80
    app_version: "2.0"

  vars_files:
    - vars/common.yml

  pre_tasks:
    - name: Update apt cache
      apt:
        update_cache: yes
        cache_valid_time: 3600

  roles:
    - common
    - nginx

  tasks:
    - name: Install required packages
      apt:
        name:
          - nginx
          - python3
        state: present

    - name: Copy nginx configuration
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
        owner: root
        group: root
        mode: '0644'
      notify: Restart nginx

    - name: Ensure nginx is running
      service:
        name: nginx
        state: started
        enabled: yes

  handlers:
    - name: Restart nginx
      service:
        name: nginx
        state: restarted

  post_tasks:
    - name: Verify nginx is running
      uri:
        url: "http://localhost:{{ http_port }}"
        status_code: 200
```

### 6. 常用 Ansible 模块有哪些？

**答：**

```yaml
# 包管理
- apt: name=nginx state=present          # Debian/Ubuntu
- yum: name=nginx state=present          # RHEL/CentOS
- pip: name=flask state=present          # Python

# 文件操作
- copy:
    src: files/app.conf
    dest: /etc/app/app.conf
    owner: root
    mode: '0644'

- template:                               # Jinja2 模板
    src: templates/nginx.conf.j2
    dest: /etc/nginx/nginx.conf

- file:
    path: /opt/app
    state: directory
    owner: app
    mode: '0755'

- lineinfile:                             # 修改文件中的一行
    path: /etc/hosts
    line: "192.168.1.100 myapp.local"

# 服务管理
- service:
    name: nginx
    state: started    # started/stopped/restarted/reloaded
    enabled: yes

- systemd:
    name: myapp
    state: started
    enabled: yes
    daemon_reload: yes

# 用户和组
- user:
    name: deploy
    groups: docker,sudo
    shell: /bin/bash

# 命令执行
- command: ls /tmp                        # 直接执行（不经过Shell）
- shell: cat /etc/passwd | grep root      # 经过 Shell（支持管道）
- raw: apt-get install -y python3         # 原始命令（无Python要求）

# Docker
- docker_container:
    name: myapp
    image: myapp:latest
    ports:
      - "8080:80"
    state: started

# 其他
- uri:                                    # HTTP 请求
    url: https://api.example.com/health
    method: GET
    status_code: 200

- wait_for:                               # 等待条件
    port: 80
    host: "{{ inventory_hostname }}"
    timeout: 60

- debug:                                  # 调试输出
    msg: "Variable value is {{ my_var }}"
```

### 7. 什么是 Handler？它和 Task 的区别？

**答：** Handler 是一种特殊的 Task，只有被 `notify` 通知时才会执行，且在所有 Tasks 执行完后才运行（去重）。

```yaml
tasks:
  - name: Update nginx config
    template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    notify:
      - Restart nginx        # 只有配置文件发生变化才通知
      - Reload firewall

  - name: Update SSL cert
    copy:
      src: ssl/cert.pem
      dest: /etc/nginx/ssl/cert.pem
    notify: Restart nginx    # 即使通知多次，Handler 只执行一次

handlers:
  - name: Restart nginx
    service:
      name: nginx
      state: restarted

  - name: Reload firewall
    command: firewall-cmd --reload
```

---

## 四、变量与模板

### 8. Ansible 变量的优先级顺序？

**答：** 从低到高（后者覆盖前者）：

1. 命令行中的默认值 (`-e` 的默认)
2. Inventory 文件或脚本中的变量
3. `group_vars/all`
4. `group_vars/<group_name>`
5. `host_vars/<hostname>`
6. Playbook 中的 `vars`
7. Playbook 中的 `vars_files`
8. Role 的 `defaults/main.yml`（最低于 Role 内部）
9. Role 的 `vars/main.yml`
10. Task 级别的 `vars`
11. `set_fact` / `register`
12. 命令行 `-e` / `--extra-vars`（**最高优先级**）

### 9. Jinja2 模板的常用语法？

**答：**

```jinja2
{# 这是注释 #}

{# 变量 #}
server_name {{ server_name }};
listen {{ http_port | default(80) }};

{# 条件 #}
{% if env == 'production' %}
worker_processes auto;
{% else %}
worker_processes 2;
{% endif %}

{# 循环 #}
{% for server in upstream_servers %}
    server {{ server.host }}:{{ server.port }} weight={{ server.weight | default(1) }};
{% endfor %}

{# 过滤器 #}
{{ my_list | join(', ') }}
{{ my_string | upper }}
{{ my_dict | to_json }}
{{ my_var | default('fallback_value') }}
{{ path | basename }}
{{ groups['webservers'] | map('extract', hostvars, 'ansible_default_ipv4') | map(attribute='address') | list }}
```

**模板文件示例 (nginx.conf.j2)：**
```jinja2
upstream backend {
{% for host in groups['appservers'] %}
    server {{ hostvars[host]['ansible_default_ipv4']['address'] }}:{{ app_port }};
{% endfor %}
}

server {
    listen {{ http_port }};
    server_name {{ server_name }};

    location / {
        proxy_pass http://backend;
    }
}
```

---

## 五、Roles

### 10. Role 的目录结构是怎样的？

**答：**

```
roles/
└── nginx/
    ├── defaults/
    │   └── main.yml        # 默认变量（最低优先级）
    ├── vars/
    │   └── main.yml        # 角色变量（高优先级）
    ├── tasks/
    │   └── main.yml        # 任务列表
    ├── handlers/
    │   └── main.yml        # Handler 定义
    ├── templates/
    │   └── nginx.conf.j2   # Jinja2 模板
    ├── files/
    │   └── index.html      # 静态文件
    ├── meta/
    │   └── main.yml        # 角色依赖和元数据
    └── README.md
```

```yaml
# roles/nginx/tasks/main.yml
---
- name: Install nginx
  apt:
    name: nginx
    state: present

- name: Copy nginx config
  template:
    src: nginx.conf.j2
    dest: /etc/nginx/nginx.conf
  notify: Restart nginx

- name: Enable and start nginx
  service:
    name: nginx
    state: started
    enabled: yes

# roles/nginx/handlers/main.yml
---
- name: Restart nginx
  service:
    name: nginx
    state: restarted

# roles/nginx/defaults/main.yml
---
nginx_port: 80
nginx_worker_processes: auto

# 使用 Role
- hosts: webservers
  roles:
    - common
    - { role: nginx, nginx_port: 8080 }
```

---

## 六、高级特性

### 11. Ansible Vault 如何管理敏感数据？

**答：**

```bash
# 创建加密文件
ansible-vault create secrets.yml

# 加密已有文件
ansible-vault encrypt vars/secrets.yml

# 解密查看
ansible-vault view secrets.yml

# 编辑加密文件
ansible-vault edit secrets.yml

# 执行时提供密码
ansible-playbook site.yml --ask-vault-pass
ansible-playbook site.yml --vault-password-file ~/.vault_pass

# 加密单个变量
ansible-vault encrypt_string 'mypassword' --name 'db_password'
# 输出：
# db_password: !vault |
#   $ANSIBLE_VAULT;1.1;AES256
#   ...
```

### 12. 条件判断、循环、错误处理？

**答：**

```yaml
# 条件判断 (when)
- name: Install on Debian
  apt:
    name: nginx
  when: ansible_os_family == "Debian"

- name: Install on RedHat
  yum:
    name: nginx
  when: ansible_os_family == "RedHat"

# 循环 (loop)
- name: Create users
  user:
    name: "{{ item.name }}"
    groups: "{{ item.groups }}"
  loop:
    - { name: 'alice', groups: 'sudo' }
    - { name: 'bob', groups: 'docker' }

# 注册变量 (register)
- name: Check if file exists
  stat:
    path: /etc/myapp/config.yml
  register: config_file

- name: Create config if missing
  template:
    src: config.yml.j2
    dest: /etc/myapp/config.yml
  when: not config_file.stat.exists

# 错误处理
- name: Try something risky
  command: /opt/app/migrate.sh
  ignore_errors: yes              # 忽略错误继续

- name: This must succeed
  command: /opt/app/check.sh
  register: result
  failed_when: "'ERROR' in result.stdout"    # 自定义失败条件
  changed_when: "'CHANGED' in result.stdout"  # 自定义变更条件

# Block/Rescue/Always（类似 try/catch/finally）
- block:
    - name: Attempt upgrade
      apt:
        name: myapp
        state: latest
  rescue:
    - name: Rollback on failure
      apt:
        name: myapp=1.0
        state: present
  always:
    - name: Ensure service is running
      service:
        name: myapp
        state: started
```

### 13. 常用 Ansible 命令？

**答：**

```bash
# Ad-hoc 命令（一次性任务）
ansible all -m ping                              # 测试连通性
ansible webservers -m command -a "uptime"        # 执行命令
ansible all -m setup                             # 收集系统信息
ansible webservers -m apt -a "name=nginx state=present" -b  # 安装包

# Playbook 执行
ansible-playbook site.yml                        # 执行 Playbook
ansible-playbook site.yml -i inventory/prod      # 指定 inventory
ansible-playbook site.yml --limit webservers     # 限制目标主机
ansible-playbook site.yml --tags deploy          # 只运行特定 tag
ansible-playbook site.yml --skip-tags test       # 跳过特定 tag
ansible-playbook site.yml --check                # 干运行（不实际执行）
ansible-playbook site.yml --diff                 # 显示文件变更
ansible-playbook site.yml -v / -vv / -vvv        # 增加详细程度

# Galaxy（角色共享）
ansible-galaxy init myrole                       # 创建角色骨架
ansible-galaxy install geerlingguy.docker        # 安装社区角色
ansible-galaxy collection install community.docker  # 安装 Collection
```

---

## 七、最佳实践

### 14. Ansible 项目的推荐目录结构？

**答：**

```
ansible-project/
├── ansible.cfg                   # Ansible 配置
├── inventory/
│   ├── production/
│   │   ├── hosts                 # 生产环境主机
│   │   ├── group_vars/
│   │   │   ├── all.yml
│   │   │   └── webservers.yml
│   │   └── host_vars/
│   │       └── web1.yml
│   └── staging/
│       ├── hosts
│       └── group_vars/
├── playbooks/
│   ├── site.yml                  # 主 playbook
│   ├── webservers.yml
│   └── dbservers.yml
├── roles/
│   ├── common/
│   ├── nginx/
│   └── app/
├── group_vars/
│   └── all/
│       ├── vars.yml
│       └── vault.yml             # 加密变量
├── files/
├── templates/
└── requirements.yml              # Galaxy 依赖
```

### 15. Ansible 性能优化？

**答：**

```ini
# ansible.cfg
[defaults]
forks = 20                        # 并行执行数（默认5）
gathering = smart                 # Facts 缓存策略
fact_caching = jsonfile           # Facts 缓存方式
fact_caching_connection = /tmp/ansible_facts
fact_caching_timeout = 86400

[ssh_connection]
pipelining = True                 # 减少 SSH 连接数
ssh_args = -o ControlMaster=auto -o ControlPersist=60s
```

```yaml
# Playbook 优化
- hosts: all
  gather_facts: no          # 不需要时关闭 Facts 收集

  tasks:
    - name: Install packages (批量操作)
      apt:
        name:
          - nginx
          - python3
          - curl
        state: present        # 一次安装多个包

    - name: Copy files
      copy:
        src: "{{ item }}"
        dest: /opt/app/
      loop: "{{ lookup('fileglob', 'files/*') }}"
      async: 300              # 异步执行
      poll: 5
```
