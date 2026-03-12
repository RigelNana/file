# Inventory 主机清单

---

## 1. Inventory 是什么？有哪些类型？

**回答：**

Inventory 定义 Ansible 管理的主机和分组，是 Ansible 执行任务的目标列表。

```
类型:
  静态 Inventory → 手动编写的文件 (INI / YAML 格式)
  动态 Inventory → 脚本或插件自动生成 (从云平台/CMDB 拉取)

默认路径: /etc/ansible/hosts
自定义: ansible-playbook -i inventory/hosts site.yml
```

---

## 2. INI 格式 Inventory？

**回答：**

```ini
# inventory/hosts (INI 格式)

# 未分组主机
192.168.1.100
server1.example.com

# Web 服务器组
[webservers]
web1 ansible_host=192.168.1.101 ansible_port=22
web2 ansible_host=192.168.1.102
web[3:5] ansible_host=192.168.1.10[3:5]    # 范围: web3, web4, web5

# 数据库组
[dbservers]
db1 ansible_host=192.168.1.201
db2 ansible_host=192.168.1.202

# 子组 (嵌套分组)
[production:children]
webservers
dbservers

# 组变量
[webservers:vars]
http_port=80
ansible_user=deploy

[production:vars]
env=production
ntp_server=ntp.example.com

# 全局变量
[all:vars]
ansible_python_interpreter=/usr/bin/python3
```

---

## 3. YAML 格式 Inventory？

**回答：**

```yaml
# inventory/hosts.yml
all:
  vars:
    ansible_python_interpreter: /usr/bin/python3
  children:
    webservers:
      hosts:
        web1:
          ansible_host: 192.168.1.101
          http_port: 80
        web2:
          ansible_host: 192.168.1.102
          http_port: 8080
      vars:
        ansible_user: deploy
    dbservers:
      hosts:
        db1:
          ansible_host: 192.168.1.201
          db_port: 5432
        db2:
          ansible_host: 192.168.1.202
          db_port: 5432
    production:
      children:
        webservers: {}
        dbservers: {}
      vars:
        env: production
```

---

## 4. 动态 Inventory 是什么？怎么实现？

**回答：**

动态 Inventory 从外部数据源自动获取主机列表，适合云环境和大规模基础设施。

```
数据源:
  AWS EC2         → amazon.aws.aws_ec2 插件
  Azure           → azure.azcollection.azure_rm 插件
  GCP             → google.cloud.gcp_compute 插件
  VMware          → community.vmware.vmware_vm_inventory 插件
  Kubernetes      → kubernetes.core.k8s 插件
  自定义脚本       → 输出 JSON 格式的可执行文件
  CMDB/API        → 自定义插件
```

### AWS EC2 动态 Inventory

```yaml
# inventory/aws_ec2.yml
plugin: amazon.aws.aws_ec2
regions:
  - ap-northeast-1
  - us-east-1

filters:
  tag:Environment:
    - production
    - staging
  instance-state-name: running

keyed_groups:
  - key: tags.Environment
    prefix: env
    separator: "_"
  - key: instance_type
    prefix: type
  - key: placement.region
    prefix: region

hostnames:
  - tag:Name
  - private-ip-address

compose:
  ansible_host: private_ip_address
  ansible_user: "'ec2-user'"
```

### 自定义动态 Inventory 脚本

```python
#!/usr/bin/env python3
"""自定义动态 Inventory 脚本"""
import json
import argparse

def get_inventory():
    """从 CMDB/API 获取主机列表"""
    return {
        "webservers": {
            "hosts": ["web1", "web2"],
            "vars": {
                "http_port": 80
            }
        },
        "dbservers": {
            "hosts": ["db1"],
            "vars": {
                "db_port": 5432
            }
        },
        "_meta": {
            "hostvars": {
                "web1": {"ansible_host": "192.168.1.101"},
                "web2": {"ansible_host": "192.168.1.102"},
                "db1": {"ansible_host": "192.168.1.201"}
            }
        }
    }

def get_host(hostname):
    inv = get_inventory()
    return inv["_meta"]["hostvars"].get(hostname, {})

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--list", action="store_true")
    parser.add_argument("--host")
    args = parser.parse_args()

    if args.list:
        print(json.dumps(get_inventory(), indent=2))
    elif args.host:
        print(json.dumps(get_host(args.host), indent=2))
```

```bash
# 使用自定义脚本
chmod +x inventory/custom_inventory.py
ansible-playbook -i inventory/custom_inventory.py site.yml
```

---

## 5. host_vars 和 group_vars？

**回答：**

```
目录结构:
  inventory/
  ├── hosts.yml
  ├── group_vars/
  │   ├── all.yml           # 所有主机的变量
  │   ├── webservers.yml    # webservers 组变量
  │   ├── dbservers.yml     # dbservers 组变量
  │   └── production/       # 目录方式 (多文件)
  │       ├── vars.yml
  │       └── vault.yml     # 加密变量
  └── host_vars/
      ├── web1.yml          # web1 主机变量
      ├── db1.yml           # db1 主机变量
      └── web2/             # 目录方式
          ├── vars.yml
          └── vault.yml
```

```yaml
# group_vars/webservers.yml
http_port: 80
max_connections: 1000
deploy_user: www-data
app_root: /var/www/app

# group_vars/all.yml
ntp_server: ntp.example.com
dns_servers:
  - 8.8.8.8
  - 8.8.4.4

# host_vars/web1.yml
http_port: 8080            # 覆盖组变量
ssl_cert: /etc/ssl/web1.crt
```

---

## 6. Inventory 中的特殊变量？

**回答：**

```yaml
# 连接相关
ansible_host: 192.168.1.101        # SSH 目标地址
ansible_port: 22                    # SSH 端口
ansible_user: deploy                # SSH 用户
ansible_password: "{{ vault_pw }}"  # SSH 密码 (不推荐)
ansible_ssh_private_key_file: ~/.ssh/id_ed25519

# 提权相关
ansible_become: true                # 是否 sudo
ansible_become_method: sudo         # 提权方式 (sudo/su/doas)
ansible_become_user: root           # 切换到的用户
ansible_become_password: "{{ vault_sudo_pw }}"

# 连接类型
ansible_connection: ssh             # ssh / winrm / local / docker

# Python 解释器
ansible_python_interpreter: /usr/bin/python3

# Windows 相关
ansible_winrm_transport: ntlm
ansible_winrm_server_cert_validation: ignore
```

---

## 7. 多环境 Inventory 管理？

**回答：**

```
推荐目录结构:

inventories/
├── dev/
│   ├── hosts.yml
│   ├── group_vars/
│   │   ├── all.yml
│   │   └── webservers.yml
│   └── host_vars/
├── staging/
│   ├── hosts.yml
│   ├── group_vars/
│   │   ├── all.yml
│   │   └── webservers.yml
│   └── host_vars/
└── production/
    ├── hosts.yml
    ├── group_vars/
    │   ├── all.yml
    │   └── webservers.yml
    └── host_vars/
```

```bash
# 使用指定环境
ansible-playbook -i inventories/dev/hosts.yml site.yml
ansible-playbook -i inventories/production/hosts.yml site.yml

# 多 Inventory 组合
ansible-playbook -i inventories/dev/ -i inventories/staging/ site.yml
```

---

## 8. Inventory 插件？

**回答：**

```yaml
# ansible.cfg 中启用插件
[inventory]
enable_plugins = host_list, script, auto, yaml, ini, toml, amazon.aws.aws_ec2

# 常用 Inventory 插件:
#   auto        → 自动识别格式
#   ini         → INI 格式
#   yaml        → YAML 格式
#   script      → 自定义脚本
#   constructed → 基于现有数据构建新组
```

### constructed 插件（基于 Facts 动态分组）

```yaml
# inventory/constructed.yml
plugin: constructed
strict: false
groups:
  # 基于变量创建分组
  ubuntu_hosts: "ansible_distribution == 'Ubuntu'"
  centos_hosts: "ansible_distribution == 'CentOS'"
  large_memory: "ansible_memtotal_mb > 8192"
compose:
  # 创建新变量
  ansible_user: "'deploy'"
keyed_groups:
  - key: ansible_distribution
    prefix: os
  - key: ansible_distribution_version
    prefix: os_version
```

---

## 9. Inventory 模式匹配 (Pattern)？

**回答：**

```bash
# 所有主机
ansible all -m ping

# 单个组
ansible webservers -m ping

# 单个主机
ansible web1 -m ping

# 多个组 (并集 OR)
ansible 'webservers:dbservers' -m ping

# 交集 (AND)
ansible 'webservers:&staging' -m ping

# 排除 (NOT)
ansible 'webservers:!web3' -m ping

# 通配符
ansible '*.example.com' -m ping
ansible 'web*' -m ping

# 正则 (~ 前缀)
ansible '~web[0-9]+\.example\.com' -m ping

# 组合
ansible 'webservers:&production:!web3' -m ping
# = production 中的 webservers 但排除 web3

# 使用索引
ansible 'webservers[0]' -m ping     # 第一台
ansible 'webservers[0:2]' -m ping   # 前三台
ansible 'webservers[-1]' -m ping    # 最后一台
```

---

## 10. Inventory 最佳实践和常见问题？

**回答：**

```
最佳实践:
  ✓ 使用 YAML 格式 (比 INI 更灵活)
  ✓ 使用 group_vars/host_vars 目录管理变量
  ✓ 按环境分离 Inventory (dev/staging/prod)
  ✓ 敏感变量用 Vault 加密 (vault.yml)
  ✓ 云环境使用动态 Inventory 插件
  ✓ 使用有意义的主机名和组名
  ✓ 用 children 组织层级关系
  ✓ 在 CI/CD 中验证 Inventory 正确性

常见问题:

Q: 如何调试 Inventory?
A: ansible-inventory -i hosts.yml --list   # JSON 完整列表
   ansible-inventory -i hosts.yml --graph  # 树形结构
   ansible-inventory -i hosts.yml --host web1  # 单主机变量

Q: 动态 Inventory 缓存?
A:
  [inventory]
  cache = true
  cache_plugin = jsonfile
  cache_connection = /tmp/ansible_inventory_cache
  cache_timeout = 3600

Q: 组变量合并行为?
A: 默认 hash_behaviour = replace (覆盖)
   可设置 hash_behaviour = merge (合并), 但不推荐
   推荐使用 combine 过滤器精确控制

Q: 显示 Inventory 树?
A:
   $ ansible-inventory --graph
   @all:
     |--@webservers:
     |  |--web1
     |  |--web2
     |--@dbservers:
     |  |--db1
     |--@ungrouped:
     |  |--standalone_server
```
