# Roles 角色

---

## 1. Role 是什么？为什么要用？

**回答：**

Role 是 Ansible 预定义的目录结构，用于组织和复用自动化代码。

```
为什么用 Role:
  复用性     → 一次编写, 多项目复用 (类似编程中的函数/库)
  结构化     → 强制标准化目录结构
  可维护     → 变量/任务/模板/文件分离
  可共享     → 通过 Ansible Galaxy 分享
  可测试     → 独立测试每个 Role

Role vs Playbook:
  Playbook  → 编排 (who does what)
  Role      → 可复用组件 (how to do)

  Playbook:
    - hosts: webservers
      roles:
        - common      # Role: 基础配置
        - nginx        # Role: Nginx 安装配置
        - myapp        # Role: 应用部署
```

---

## 2. Role 目录结构？

**回答：**

```
roles/
└── nginx/                      # Role 名称
    ├── defaults/
    │   └── main.yml            # 默认变量 (最低优先级, 可覆盖)
    ├── vars/
    │   └── main.yml            # Role 内部变量 (高优先级, 不应覆盖)
    ├── tasks/
    │   ├── main.yml            # 主任务入口
    │   ├── install.yml         # 安装任务
    │   ├── config.yml          # 配置任务
    │   └── service.yml         # 服务任务
    ├── handlers/
    │   └── main.yml            # Handler 定义
    ├── templates/
    │   ├── nginx.conf.j2       # Jinja2 模板
    │   └── vhost.conf.j2
    ├── files/
    │   ├── ssl.crt             # 静态文件
    │   └── dhparam.pem
    ├── meta/
    │   └── main.yml            # Role 元数据 (依赖, 平台兼容)
    ├── tests/
    │   ├── inventory           # 测试 Inventory
    │   └── test.yml            # 测试 Playbook
    ├── molecule/               # Molecule 测试 (可选)
    │   └── default/
    │       ├── molecule.yml
    │       ├── converge.yml
    │       └── verify.yml
    └── README.md               # 文档

注意:
  只需包含实际使用的目录, 空目录可以省略
  main.yml 是每个目录的入口点 (自动加载)
```

---

## 3. Role 各目录文件详解？

**回答：**

```yaml
# defaults/main.yml — 默认变量 (最低优先级)
nginx_port: 80
nginx_worker_processes: auto
nginx_worker_connections: 1024
nginx_user: www-data
nginx_log_dir: /var/log/nginx
nginx_ssl_enabled: false
nginx_ssl_cert: ""
nginx_ssl_key: ""
nginx_vhosts: []

# vars/main.yml — Role 内部变量 (不应被外部覆盖)
nginx_packages:
  - nginx
  - nginx-extras
nginx_config_dir: /etc/nginx
nginx_service_name: nginx

# tasks/main.yml — 主任务入口
---
- import_tasks: install.yml
- import_tasks: config.yml
- import_tasks: service.yml

# tasks/install.yml
---
- name: Install Nginx packages
  apt:
    name: "{{ nginx_packages }}"
    state: present
    update_cache: yes

# tasks/config.yml
---
- name: Deploy main config
  template:
    src: nginx.conf.j2
    dest: "{{ nginx_config_dir }}/nginx.conf"
    validate: "nginx -t -c %s"
  notify: reload nginx

- name: Deploy virtual hosts
  template:
    src: vhost.conf.j2
    dest: "{{ nginx_config_dir }}/conf.d/{{ item.server_name }}.conf"
  loop: "{{ nginx_vhosts }}"
  notify: reload nginx

# handlers/main.yml
---
- name: reload nginx
  service:
    name: "{{ nginx_service_name }}"
    state: reloaded

- name: restart nginx
  service:
    name: "{{ nginx_service_name }}"
    state: restarted

# meta/main.yml — 元数据
---
galaxy_info:
  role_name: nginx
  author: your_name
  description: Install and configure Nginx
  license: MIT
  min_ansible_version: "2.12"
  platforms:
    - name: Ubuntu
      versions: [focal, jammy]
    - name: Debian
      versions: [bullseye, bookworm]
  galaxy_tags:
    - nginx
    - web
    - proxy

dependencies:
  - role: common
  - role: ssl_certs
    when: nginx_ssl_enabled
```

---

## 4. Role 引用方式？

**回答：**

```yaml
# 方式 1: 简单引用
- hosts: webservers
  roles:
    - common
    - nginx
    - myapp

# 方式 2: 带参数
- hosts: webservers
  roles:
    - role: nginx
      vars:
        nginx_port: 8080
        nginx_vhosts:
          - server_name: app.example.com
            root: /var/www/app
      tags: [nginx]
      when: install_nginx | default(true)

# 方式 3: import_role (静态)
- hosts: webservers
  tasks:
    - import_role:
        name: nginx
      vars:
        nginx_port: 8080

# 方式 4: include_role (动态)
- hosts: webservers
  tasks:
    - include_role:
        name: "{{ item }}"
      loop:
        - common
        - nginx
        - myapp

    - include_role:
        name: nginx
        tasks_from: config.yml    # 只运行特定任务文件
        handlers_from: main.yml
        vars_from: production.yml
        defaults_from: main.yml

# 方式 5: 条件引用
- hosts: webservers
  tasks:
    - include_role:
        name: ssl_certs
      when: ssl_enabled | bool

# Role 搜索路径
# ansible.cfg
[defaults]
roles_path = ./roles:~/.ansible/roles:/etc/ansible/roles
```

---

## 5. Role 依赖管理？

**回答：**

```yaml
# meta/main.yml — 定义依赖
dependencies:
  # 简单依赖
  - common

  # 带参数依赖
  - role: ssl_certs
    vars:
      ssl_domain: "{{ nginx_domain }}"

  # 条件依赖
  - role: firewall
    vars:
      firewall_ports:
        - "{{ nginx_port }}/tcp"
    when: manage_firewall | default(true)
```

```
依赖执行规则:
  1. 依赖先于当前 Role 执行
  2. 相同 Role 默认不重复执行
  3. allow_duplicates: true 允许重复

执行顺序示例:
  roles:
    - role: myapp         # 依赖: common → nginx
  
  实际执行:
    1. common (myapp 的依赖)
    2. nginx  (myapp 的依赖)
    3. myapp  (主 Role)

循环依赖:
  ✗ A 依赖 B, B 又依赖 A → 错误
  ✓ 使用 include_role 替代 meta 依赖来打破循环
```

```yaml
# allow_duplicates 示例
# meta/main.yml
allow_duplicates: true

# 使用场景: 同一 Role 不同参数多次调用
- hosts: webservers
  roles:
    - role: vhost
      vars:
        vhost_name: site1
        vhost_port: 80
    - role: vhost
      vars:
        vhost_name: site2
        vhost_port: 8080
```

---

## 6. Ansible Galaxy？

**回答：**

```bash
# Ansible Galaxy = Role/Collection 的公共仓库

# 搜索 Role
ansible-galaxy search nginx
ansible-galaxy search nginx --platforms Ubuntu

# 查看信息
ansible-galaxy info geerlingguy.nginx

# 安装 Role
ansible-galaxy install geerlingguy.nginx
ansible-galaxy install geerlingguy.nginx,4.3.0     # 指定版本
ansible-galaxy install geerlingguy.nginx -p ./roles  # 指定目录

# 从文件批量安装
ansible-galaxy install -r requirements.yml

# 列出已安装
ansible-galaxy list

# 删除
ansible-galaxy remove geerlingguy.nginx

# 初始化新 Role
ansible-galaxy init my_role
ansible-galaxy init --init-path ./roles my_role
```

```yaml
# requirements.yml — 依赖管理文件
---
roles:
  # Galaxy Role
  - name: geerlingguy.nginx
    version: "4.3.0"

  # Git 仓库
  - src: https://github.com/org/ansible-role-app.git
    scm: git
    version: v1.2.0
    name: myapp

  # 本地 tar.gz
  - src: file:///opt/roles/custom_role.tar.gz
    name: custom_role

collections:
  - name: community.docker
    version: ">=3.0.0"
  - name: amazon.aws
    version: "6.0.0"
```

---

## 7. Ansible Collections vs Roles？

**回答：**

```
           Collection                    Role
定义        模块+角色+插件的打包           任务+模板+变量的打包
范围        广 (含自定义模块和插件)         窄 (主要是任务)
命名空间    有 (namespace.collection)      无 (全局)
版本管理    Galaxy NG / Automation Hub      Galaxy
安装方式    ansible-galaxy collection       ansible-galaxy role
包含内容    roles/ plugins/ modules/        tasks/ handlers/ templates/
分发格式    tar.gz (包含 galaxy.yml)        tar.gz (包含 meta/)

Collection 结构:
  my_namespace/
  └── my_collection/
      ├── galaxy.yml           # Collection 元数据
      ├── README.md
      ├── roles/
      │   ├── role1/
      │   └── role2/
      ├── plugins/
      │   ├── modules/
      │   ├── inventory/
      │   ├── callback/
      │   └── filter/
      ├── playbooks/
      └── docs/

何时用 Role:
  任务编排 (安装软件、部署配置)
  不需要自定义模块/插件

何时用 Collection:
  需要自定义模块/插件
  需要命名空间隔离
  企业级分发
```

---

## 8. Role 测试 — Molecule？

**回答：**

```bash
# Molecule = Ansible Role 测试框架

pip install molecule molecule-docker

# 初始化
cd roles/nginx
molecule init scenario --driver-name docker

# 目录结构
molecule/
└── default/
    ├── molecule.yml          # 配置
    ├── converge.yml          # 运行 Role
    ├── verify.yml            # 验证结果
    ├── prepare.yml           # 前置准备
    └── destroy.yml           # 清理
```

```yaml
# molecule/default/molecule.yml
---
dependency:
  name: galaxy
driver:
  name: docker
platforms:
  - name: ubuntu-test
    image: ubuntu:22.04
    pre_build_image: false
    privileged: true
    command: /sbin/init
  - name: centos-test
    image: centos:8
    pre_build_image: false
provisioner:
  name: ansible
  playbooks:
    converge: converge.yml
    verify: verify.yml
verifier:
  name: ansible

# molecule/default/converge.yml
---
- name: Converge
  hosts: all
  roles:
    - role: nginx
      vars:
        nginx_port: 8080

# molecule/default/verify.yml
---
- name: Verify
  hosts: all
  tasks:
    - name: Check nginx is installed
      command: nginx -v
      changed_when: false

    - name: Check nginx is running
      service:
        name: nginx
        state: started
      check_mode: true
      register: result
      failed_when: result.changed

    - name: Check port is listening
      wait_for:
        port: 8080
        timeout: 5
```

```bash
# Molecule 命令
molecule create          # 创建测试容器
molecule converge        # 运行 Role
molecule verify          # 验证
molecule test            # 完整测试 (create → converge → verify → destroy)
molecule destroy         # 清理
molecule login           # 登录测试容器
molecule lint            # 代码检查
```

---

## 9. Role 设计最佳实践？

**回答：**

```
设计原则:
  ✓ 单一职责 — 一个 Role 做一件事 (nginx / postgres / deploy)
  ✓ 参数化 — 通过 defaults/ 暴露配置, 避免硬编码
  ✓ 幂等性 — 多次运行结果一致
  ✓ 跨平台 — 用 when + ansible_os_family 处理差异
  ✓ 文档化 — README.md 说明变量和用法
  ✓ 测试 — Molecule + CI/CD 自动测试

变量策略:
  defaults/main.yml:
    ✓ 所有可配置参数, 合理默认值
    ✓ 用户应只需覆盖此处变量
  vars/main.yml:
    ✓ Role 内部常量, 不应被覆盖
    ✓ 包名映射、路径等

任务组织:
  tasks/main.yml:
    - import_tasks: preflight.yml       # 前置检查
    - import_tasks: install.yml
    - import_tasks: config.yml
    - import_tasks: service.yml
    - import_tasks: verify.yml          # 后置验证

跨平台处理:
  tasks/install.yml:
    - include_tasks: "install_{{ ansible_os_family }}.yml"

  tasks/install_Debian.yml:
    - apt: name=nginx
  tasks/install_RedHat.yml:
    - yum: name=nginx

命名规范:
  ✓ Role 名: 小写 + 下划线 (nginx_proxy)
  ✓ 变量名: role前缀_描述 (nginx_port)
  ✓ Handler名: 动词 + 对象 (restart nginx)
  ✓ Tag名: role名 (nginx)
```

---

## 10. 完整 Role 实战 — Nginx Role？

**回答：**

```yaml
# roles/nginx/defaults/main.yml
---
nginx_port: 80
nginx_https_port: 443
nginx_worker_processes: auto
nginx_worker_connections: 1024
nginx_user: www-data
nginx_ssl_enabled: false
nginx_vhosts: []
nginx_upstream_backends: []
nginx_extra_packages: []

# roles/nginx/vars/main.yml
---
nginx_packages_map:
  Debian:
    - nginx
    - nginx-extras
  RedHat:
    - nginx
nginx_config_path:
  Debian: /etc/nginx
  RedHat: /etc/nginx

# roles/nginx/tasks/main.yml
---
- name: Validate required variables
  assert:
    that:
      - nginx_port is defined
      - nginx_port | int > 0
    fail_msg: "nginx_port must be a positive integer"

- import_tasks: "install_{{ ansible_os_family }}.yml"
- import_tasks: config.yml
- import_tasks: service.yml

# roles/nginx/tasks/install_Debian.yml
---
- name: Install Nginx (Debian)
  apt:
    name: "{{ nginx_packages_map['Debian'] + nginx_extra_packages }}"
    state: present
    update_cache: yes
    cache_valid_time: 3600

# roles/nginx/tasks/config.yml
---
- name: Deploy nginx.conf
  template:
    src: nginx.conf.j2
    dest: "{{ nginx_config_path[ansible_os_family] }}/nginx.conf"
    validate: "nginx -t -c %s"
  notify: reload nginx

- name: Deploy vhosts
  template:
    src: vhost.conf.j2
    dest: "{{ nginx_config_path[ansible_os_family] }}/conf.d/{{ item.name }}.conf"
  loop: "{{ nginx_vhosts }}"
  notify: reload nginx

- name: Remove default site
  file:
    path: "{{ nginx_config_path[ansible_os_family] }}/sites-enabled/default"
    state: absent
  notify: reload nginx

# roles/nginx/tasks/service.yml
---
- name: Start and enable Nginx
  service:
    name: nginx
    state: started
    enabled: yes

# roles/nginx/handlers/main.yml
---
- name: reload nginx
  service:
    name: nginx
    state: reloaded

- name: restart nginx
  service:
    name: nginx
    state: restarted

# 使用示例
# site.yml
- hosts: webservers
  roles:
    - role: nginx
      vars:
        nginx_port: 80
        nginx_ssl_enabled: true
        nginx_vhosts:
          - name: myapp
            server_name: app.example.com
            root: /var/www/app
            proxy_pass: http://app_backend
```
