# Playbook 详解

---

## 1. Playbook 是什么？基本结构？

**回答：**

Playbook 是 Ansible 的核心编排文件，使用 YAML 格式定义自动化任务。

```yaml
# site.yml — 完整 Playbook 结构
---
- name: Configure web servers            # Play 名称
  hosts: webservers                       # 目标主机/组
  become: true                            # 提权 (sudo)
  gather_facts: true                      # 收集 Facts
  vars:                                   # Play 级别变量
    http_port: 80
    app_version: "1.2.3"

  pre_tasks:                              # 主任务前执行
    - name: Update apt cache
      apt:
        update_cache: yes
        cache_valid_time: 3600

  roles:                                  # 引用 Role
    - common
    - { role: nginx, tags: ['nginx'] }

  tasks:                                  # 主要任务
    - name: Install application
      apt:
        name: "myapp={{ app_version }}"
        state: present
      notify: restart app

    - name: Deploy config
      template:
        src: app.conf.j2
        dest: /etc/myapp/app.conf
      notify: restart app

  handlers:                               # 被 notify 触发的任务
    - name: restart app
      service:
        name: myapp
        state: restarted

  post_tasks:                             # 主任务后执行
    - name: Verify service is running
      uri:
        url: "http://localhost:{{ http_port }}/health"
        status_code: 200
```

---

## 2. Play 执行顺序？

**回答：**

```
单个 Play 中任务执行顺序:
  1. 变量加载 (vars, vars_files, vars_prompt)
  2. Facts 收集 (gather_facts)
  3. pre_tasks (前置任务)
  4. pre_tasks 触发的 Handlers
  5. Roles
  6. tasks (主任务)
  7. Roles/tasks 触发的 Handlers
  8. post_tasks (后置任务)
  9. post_tasks 触发的 Handlers
```

```yaml
# 多 Play 文件 — 按顺序执行
---
- name: Play 1 - Configure database
  hosts: dbservers
  tasks:
    - name: Install PostgreSQL
      apt:
        name: postgresql
        state: present

- name: Play 2 - Configure web servers
  hosts: webservers
  tasks:
    - name: Install Nginx
      apt:
        name: nginx
        state: present

- name: Play 3 - Verify all
  hosts: all
  tasks:
    - name: Check connectivity
      ping:
```

---

## 3. import vs include？

**回答：**

```
             import (静态)              include (动态)
编译时机      预处理阶段 (编译时)        运行时动态加载
条件判断      不能用 when 跳过整个文件    可以用 when 条件加载
循环          不支持 loop               支持 loop
Tags         自动继承                   不继承 (需显式指定)
--list-tags  可以列出                   不可列出
Handler      可以 notify 内部 handler    notify 需指定完整名称
性能          更快 (一次加载)            每次运行时解析
```

```yaml
# import — 静态导入 (推荐用于固定结构)
- import_tasks: tasks/install.yml       # 导入任务文件
- import_role:                          # 导入 Role
    name: nginx
- import_playbook: webservers.yml       # 导入 Playbook

# include — 动态包含 (适合条件/循环场景)
- include_tasks: tasks/{{ ansible_os_family }}.yml    # 动态文件名
  when: dynamic_condition

- include_role:
    name: "{{ role_name }}"
  loop: "{{ role_list }}"

- include_tasks: tasks/setup.yml
  loop:
    - user1
    - user2
  loop_control:
    loop_var: username
```

### 实际用法

```yaml
# site.yml — 主入口
---
- import_playbook: playbooks/common.yml
- import_playbook: playbooks/webservers.yml
- import_playbook: playbooks/dbservers.yml

# playbooks/webservers.yml
---
- name: Configure web servers
  hosts: webservers
  tasks:
    - import_tasks: tasks/install_nginx.yml
    - include_tasks: "tasks/config_{{ env }}.yml"
```

---

## 4. Handler 详解？

**回答：**

Handler 是特殊的 Task，只在被 `notify` 通知且有 `changed` 状态时执行。

```yaml
tasks:
  - name: Update nginx config
    template:
      src: nginx.conf.j2
      dest: /etc/nginx/nginx.conf
    notify:                          # 状态 changed 时通知
      - validate nginx config       # 可通知多个 Handler
      - reload nginx

  - name: Update app config
    template:
      src: app.conf.j2
      dest: /etc/app/app.conf
    notify: restart app

handlers:
  # Handler 按定义顺序执行, 不是 notify 顺序
  - name: validate nginx config
    command: nginx -t
    changed_when: false

  - name: reload nginx
    service:
      name: nginx
      state: reloaded

  - name: restart app
    service:
      name: myapp
      state: restarted
```

### Handler 关键特性

```
特性:
  去重执行        → 同一 Handler 被多次 notify 也只执行一次
  延迟执行        → 在所有 tasks 完成后统一执行 (或 pre/post_tasks 段末)
  按定义顺序      → handlers 按定义顺序执行, 非 notify 顺序
  条件触发        → 只有 changed 状态才触发

提前执行 Handler:
  - meta: flush_handlers    # 强制立即执行已通知的 handlers

Listen — 多对一通知:
  handlers:
    - name: restart web stack
      listen: "restart everything"     # 监听一个主题
      service:
        name: nginx
        state: restarted

    - name: restart app
      listen: "restart everything"
      service:
        name: myapp
        state: restarted

  tasks:
    - name: Deploy new code
      copy:
        src: app.tar.gz
        dest: /opt/app/
      notify: "restart everything"     # 通知主题, 两个 handler 都执行
```

---

## 5. Tags 标签？

**回答：**

Tags 用于选择性执行 Playbook 中的部分任务。

```yaml
- name: Full deployment
  hosts: webservers
  tasks:
    - name: Install packages
      apt:
        name: "{{ item }}"
        state: present
      loop:
        - nginx
        - python3
      tags:
        - install
        - packages

    - name: Copy configuration
      template:
        src: nginx.conf.j2
        dest: /etc/nginx/nginx.conf
      tags: [config, nginx]

    - name: Start service
      service:
        name: nginx
        state: started
      tags: service

  roles:
    - { role: common, tags: ['common'] }
    - { role: nginx, tags: ['nginx', 'web'] }
```

```bash
# 只执行特定 Tag
ansible-playbook site.yml --tags "config"
ansible-playbook site.yml --tags "install,config"

# 跳过特定 Tag
ansible-playbook site.yml --skip-tags "install"

# 列出所有 Tag
ansible-playbook site.yml --list-tags

# 列出所有 Task
ansible-playbook site.yml --list-tasks

# 特殊 Tag
tags: always      # 总是执行 (除非 --skip-tags always)
tags: never       # 永不执行 (除非 --tags never)
```

---

## 6. 变量来源与优先级？

**回答：**

```
变量优先级 (从低到高, 22 级):
  1.  命令行 -e / --extra-vars (最高)
  2.  include params
  3.  role params
  4.  set_fact / registered vars
  5.  include_vars
  6.  task vars
  7.  block vars
  8.  role vars (roles/xxx/vars/main.yml)
  9.  play vars_files
  10. play vars_prompt
  11. play vars
  12. host_vars/xxx (host facts)
  13. inventory host_vars
  14. group_vars/xxx (playbook)
  15. inventory group_vars
  16. role defaults (roles/xxx/defaults/main.yml) ← 最低
```

```yaml
# 多种变量来源
---
- name: Variable demo
  hosts: webservers
  vars:                            # Play 变量
    app_port: 8080
  vars_files:                      # 外部变量文件
    - vars/common.yml
    - "vars/{{ env }}.yml"
  vars_prompt:                     # 交互输入
    - name: deploy_version
      prompt: "Enter version to deploy"
      private: false

  tasks:
    - name: Set dynamic var
      set_fact:                    # 运行时设置变量
        full_version: "{{ deploy_version }}-{{ ansible_date_time.date }}"

    - name: Load extra vars
      include_vars:                # 动态加载变量文件
        file: "vars/{{ ansible_os_family }}.yml"

    - name: Use variable
      debug:
        msg: "Deploying {{ full_version }} on port {{ app_port }}"
```

---

## 7. Playbook 执行控制？

**回答：**

```bash
# 基本执行
ansible-playbook site.yml

# 指定 Inventory
ansible-playbook -i inventory/production site.yml

# 额外变量
ansible-playbook site.yml -e "env=production version=1.2.3"
ansible-playbook site.yml -e "@vars/extra.yml"

# 限制主机
ansible-playbook site.yml --limit web1
ansible-playbook site.yml --limit 'webservers:!web3'

# Dry Run (检查模式)
ansible-playbook site.yml --check

# Diff 模式 (显示变更)
ansible-playbook site.yml --diff
ansible-playbook site.yml --check --diff

# 逐步执行
ansible-playbook site.yml --step

# 从指定 Task 开始
ansible-playbook site.yml --start-at-task "Deploy config"

# 提权
ansible-playbook site.yml -b -K     # sudo + 提示密码

# 并行控制
ansible-playbook site.yml -f 20     # forks=20

# 详细输出
ansible-playbook site.yml -v        # verbose
ansible-playbook site.yml -vvv      # 更详细 (调试)

# 语法检查
ansible-playbook site.yml --syntax-check

# 列出主机
ansible-playbook site.yml --list-hosts
```

---

## 8. 错误处理？

**回答：**

```yaml
tasks:
  # 忽略错误
  - name: This might fail
    command: /opt/maybe_fail.sh
    ignore_errors: true

  # 自定义失败条件
  - name: Check status
    command: check_service.sh
    register: result
    failed_when: "'CRITICAL' in result.stdout"

  # 自定义 changed 判断
  - name: Run migration
    command: python manage.py migrate
    register: migration
    changed_when: "'No migrations to apply' not in migration.stdout"

  # block/rescue/always (try/catch/finally)
  - block:
      - name: Try deploy
        copy:
          src: app.tar.gz
          dest: /opt/app/

      - name: Restart app
        service:
          name: myapp
          state: restarted
    rescue:
      - name: Rollback on failure
        copy:
          src: app_backup.tar.gz
          dest: /opt/app/

      - name: Restart old version
        service:
          name: myapp
          state: restarted

      - name: Send alert
        mail:
          to: ops@example.com
          subject: "Deploy failed on {{ inventory_hostname }}"
    always:
      - name: Clean up temp files
        file:
          path: /tmp/deploy_temp
          state: absent

  # any_errors_fatal — 任一主机失败则全部停止
  - name: Critical task
    hosts: webservers
    any_errors_fatal: true
    tasks:
      - name: Must succeed
        command: critical_check.sh

  # max_fail_percentage
  - name: Rolling update
    hosts: webservers
    max_fail_percentage: 30    # 超过 30% 失败则停止
    serial: 5
    tasks:
      - name: Deploy
        command: deploy.sh
```

---

## 9. 条件与循环？

**回答：**

### 条件 (when)

```yaml
tasks:
  # 基本条件
  - name: Install on Ubuntu
    apt:
      name: nginx
      state: present
    when: ansible_distribution == "Ubuntu"

  # 多条件 (AND)
  - name: Install on Ubuntu 22.04
    apt:
      name: nginx
    when:
      - ansible_distribution == "Ubuntu"
      - ansible_distribution_version == "22.04"

  # OR 条件
  - name: Install on Debian family
    apt:
      name: nginx
    when: ansible_os_family == "Debian" or ansible_os_family == "Ubuntu"

  # 变量检查
  - name: Run if variable defined
    debug:
      msg: "Variable is {{ my_var }}"
    when: my_var is defined

  # 基于 register 结果
  - name: Check if file exists
    stat:
      path: /opt/app/config.yml
    register: config_file

  - name: Create config if missing
    template:
      src: config.yml.j2
      dest: /opt/app/config.yml
    when: not config_file.stat.exists
```

### 循环 (loop)

```yaml
tasks:
  # 简单列表
  - name: Install packages
    apt:
      name: "{{ item }}"
      state: present
    loop:
      - nginx
      - python3
      - git

  # 字典列表
  - name: Create users
    user:
      name: "{{ item.name }}"
      groups: "{{ item.groups }}"
      shell: "{{ item.shell }}"
    loop:
      - { name: deploy, groups: sudo, shell: /bin/bash }
      - { name: app, groups: www-data, shell: /bin/false }

  # loop_control
  - name: Process items
    debug:
      msg: "Processing {{ item_name }} ({{ idx + 1 }}/{{ total }})"
    loop: "{{ items_list }}"
    loop_control:
      loop_var: item_name        # 自定义循环变量名
      index_var: idx             # 索引变量
      label: "{{ item_name }}"   # 简化输出
      pause: 2                   # 每次循环暂停 2 秒

  # until 重试
  - name: Wait for service
    uri:
      url: http://localhost:8080/health
    register: result
    until: result.status == 200
    retries: 10
    delay: 5
```

---

## 10. Playbook 最佳实践？

**回答：**

```
编写规范:
  ✓ 所有 Task 写 name (清晰描述)
  ✓ 使用 FQCN (ansible.builtin.copy 而非 copy)
  ✓ 优先用专用模块 (apt 而非 command: apt install)
  ✓ 使用 import_tasks 拆分大文件
  ✓ 敏感数据用 Vault 加密
  ✓ 用 --check --diff 验证变更
  ✓ handler 实现服务优雅重载
  ✓ 使用 block/rescue 处理错误

项目组织:
  site.yml                     # 总入口
  ├── playbooks/
  │   ├── webservers.yml
  │   └── dbservers.yml
  ├── roles/
  ├── inventory/
  └── group_vars/

安全:
  ✓ 不要在 Playbook 中硬编码密码
  ✓ 使用 no_log: true 隐藏敏感输出
  ✓ 最小权限原则 (仅必要时 become)

调试:
  ansible-playbook site.yml -v       # 基本详细
  ansible-playbook site.yml -vvv     # 调试级别
  ANSIBLE_KEEP_REMOTE_FILES=1        # 保留远程临时文件

Lint:
  ansible-lint site.yml              # 静态检查
  yamllint site.yml                  # YAML 格式检查
```
