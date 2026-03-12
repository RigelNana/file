# Ansible 基础与架构

---

## 1. Ansible 是什么？核心特点？

**回答：**

Ansible 是开源的 IT 自动化工具，用于配置管理、应用部署和任务编排。

```
核心特点:
  无代理 (Agentless)  → 通过 SSH 连接, 被管理节点无需安装 Agent
  幂等性             → 多次执行结果相同, 已是目标状态则不变更
  声明式             → 描述期望状态, 非操作步骤
  YAML 语法          → 简单易读
  模块丰富           → 数千个内置模块 (apt, copy, service, docker...)
  可扩展             → 支持自定义模块和插件
  推送模式 (Push)     → 控制节点主动推送, 无需客户端拉取
```

---

## 2. Ansible 与其他配置管理工具对比？

**回答：**

| 特性 | Ansible | Puppet | Chef | SaltStack | Terraform |
|------|---------|--------|------|-----------|-----------|
| 类型 | 配置管理+编排 | 配置管理 | 配置管理 | 配置管理+编排 | IaC (基础设施) |
| 语言 | YAML | DSL (Ruby-like) | Ruby DSL | YAML/Python | HCL |
| 架构 | 无代理 (SSH) | Agent (Pull) | Agent (Pull) | Agent (Push/Pull) | 无代理 (API) |
| 学习曲线 | 低 | 中 | 高 | 中 | 中 |
| 推/拉 | Push | Pull | Pull | Push+Pull | Push |
| 性能 | 中等 | 好 | 好 | 好 | N/A |
| 状态管理 | 无状态 | 有 (PuppetDB) | 有 (Chef Server) | 有 | 有 (State File) |
| Windows | 支持 (WinRM) | 支持 | 支持 | 支持 | 支持 |

```
选型建议:
  通用自动化 + 简单             → Ansible
  大规模配置管理 (1000+ 节点)   → Puppet / SaltStack
  云基础设施 (创建 VM/VPC)      → Terraform
  两者结合                      → Terraform 创建基础设施 + Ansible 配置软件
```

---

## 3. Ansible 架构与核心组件？

**回答：**

```
┌──────────────────────────────────────────────┐
│             Control Node (控制节点)            │
│                                              │
│  ┌────────────┐  ┌──────────┐  ┌───────────┐│
│  │ ansible.cfg│  │Inventory │  │ Playbook  ││
│  │ (配置文件)  │  │(主机清单) │  │  (剧本)   ││
│  └────────────┘  └──────────┘  └───────────┘│
│  ┌────────────┐  ┌──────────┐  ┌───────────┐│
│  │  Modules   │  │  Roles   │  │  Plugins  ││
│  │  (模块)    │  │  (角色)   │  │  (插件)   ││
│  └────────────┘  └──────────┘  └───────────┘│
└─────────┬────────────┬────────────┬──────────┘
          │ SSH        │ SSH        │ SSH
     ┌────▼────┐  ┌────▼────┐  ┌───▼─────┐
     │ Node 1  │  │ Node 2  │  │ Node 3  │
     │ (Linux) │  │ (Linux) │  │(Windows)│
     └─────────┘  └─────────┘  └─────────┘
                                  WinRM
```

### 核心组件

```
组件              说明
──────────       ──────────────────────────────
Inventory         定义管理的主机和分组
Module            执行特定任务的单元 (apt, copy, service)
Playbook          YAML 格式的任务编排文件
Role              可复用的 Playbook 组织结构
Task              调用 Module 的单个操作
Handler           被 notify 通知时才执行的任务
Fact              自动收集的系统信息 (OS, IP, CPU...)
Vault             加密敏感数据 (密码, 密钥)
Plugin            扩展 Ansible 功能 (连接, 回调, 过滤器)
Collection        模块+角色+插件的打包分发单元
```

---

## 4. Ansible 执行流程？

**回答：**

```
1. 读取 ansible.cfg 配置
2. 解析 Inventory (获取目标主机列表)
3. 加载 Playbook / Ad-hoc 命令
4. 收集 Facts (gather_facts: yes)
5. 编译任务 (变量替换, 条件判断)
6. 通过 SSH 连接目标主机
7. 将 Module 代码传输到目标主机 (/tmp/.ansible_xxx/)
8. 在目标主机上执行 Module
9. 收集执行结果 (JSON 格式)
10. 清理临时文件
11. 根据结果判断是否通知 Handler
12. 输出执行摘要 (ok/changed/failed/skipped)
```

### 执行模式

```
串行 vs 并行:
  serial: 1             → 一台一台执行 (滚动更新)
  serial: "30%"         → 每批 30% 主机
  forks: 20             → 最多同时连接 20 台 (默认 5)

执行策略:
  strategy: linear      → 默认, 等所有主机完成当前 Task 再执行下一个
  strategy: free        → 每台主机独立执行, 不等待其他主机
  strategy: host_pinned → 一台主机完成所有 Task 再做下一台
```

---

## 5. ansible.cfg 配置文件？

**回答：**

```
配置文件搜索顺序 (优先级从高到低):
  1. ANSIBLE_CONFIG 环境变量
  2. ./ansible.cfg (当前目录)
  3. ~/.ansible.cfg (用户目录)
  4. /etc/ansible/ansible.cfg (全局)
```

```ini
# ansible.cfg
[defaults]
inventory = ./inventory/hosts     # 默认 Inventory
remote_user = deploy              # SSH 用户
private_key_file = ~/.ssh/id_ed25519
host_key_checking = False         # 跳过 SSH 指纹确认 (测试环境)
retry_files_enabled = False       # 不生成 .retry 文件
forks = 20                        # 并行数
timeout = 30                      # SSH 超时
log_path = ./ansible.log          # 日志文件

roles_path = ./roles              # Role 搜索路径
collections_path = ./collections  # Collection 路径

gathering = smart                 # Fact 收集策略
fact_caching = jsonfile           # Fact 缓存
fact_caching_connection = /tmp/ansible_facts
fact_caching_timeout = 86400      # 24小时

stdout_callback = yaml            # 输出格式 (yaml 更可读)
callback_whitelist = timer,profile_tasks  # 显示执行时间

[privilege_escalation]
become = True                     # 默认 sudo
become_method = sudo
become_user = root
become_ask_pass = False

[ssh_connection]
pipelining = True                 # 减少 SSH 操作次数 (性能)
ssh_args = -o ControlMaster=auto -o ControlPersist=60s -o StrictHostKeyChecking=no
```

---

## 6. Ad-hoc 命令？

**回答：**

Ad-hoc = 一次性命令，无需写 Playbook。

```bash
# 语法: ansible <pattern> -m <module> -a <arguments> [options]

# 连通性测试
ansible all -m ping

# 执行命令
ansible webservers -m command -a "uptime"
ansible webservers -m shell -a "df -h | grep /dev/sda"

# 收集信息
ansible web1 -m setup                             # 所有 Facts
ansible web1 -m setup -a "filter=ansible_os_family"  # 指定 Fact

# 包管理
ansible webservers -m apt -a "name=nginx state=present" -b

# 文件操作
ansible webservers -m copy -a "src=./app.conf dest=/etc/app/app.conf" -b
ansible webservers -m file -a "path=/opt/app state=directory owner=app mode=0755" -b

# 服务管理
ansible webservers -m service -a "name=nginx state=restarted" -b

# 用户管理
ansible all -m user -a "name=deploy groups=sudo shell=/bin/bash" -b

# 限制主机
ansible webservers -m ping --limit web1
ansible all -m ping --limit 'webservers:&staging'  # 交集
ansible all -m ping --limit 'webservers:!web3'     # 排除
```

---

## 7. Ansible 连接方式？

**回答：**

```
连接类型           说明                      使用场景
──────────        ──────────────           ──────────
ssh (默认)         OpenSSH 连接              Linux 主机
paramiko           Python SSH 库             旧版 SSH 兼容
winrm              Windows Remote Mgmt        Windows 主机
local              本机执行                    控制节点自身
docker             docker exec 连接           容器内执行
network_cli        网络设备 CLI                交换机/路由器
httpapi             HTTP API                  网络设备 REST
```

```yaml
# SSH 连接配置
[webservers]
web1 ansible_host=192.168.1.101 ansible_user=deploy ansible_ssh_private_key_file=~/.ssh/id_ed25519
web2 ansible_host=192.168.1.102 ansible_port=2222

# Windows 连接
[windowsservers]
win1 ansible_host=192.168.1.201

[windowsservers:vars]
ansible_user=administrator
ansible_password="{{ vault_win_password }}"
ansible_connection=winrm
ansible_winrm_server_cert_validation=ignore
ansible_winrm_transport=ntlm
```

---

## 8. Ansible 与 Terraform 如何配合？

**回答：**

```
分工:
  Terraform → 创建基础设施 (VM, VPC, LB, DNS)
  Ansible   → 配置服务器 (安装软件, 部署应用)

流程:
  Terraform apply → 创建 VM → 输出 IP 列表
    → Ansible → SSH 到 VM → 安装配置软件

集成方式:

方式 1: Terraform provisioner (不推荐)
  resource "aws_instance" "web" {
    provisioner "local-exec" {
      command = "ansible-playbook -i '${self.public_ip},' site.yml"
    }
  }

方式 2: Terraform output → 动态 Inventory (推荐)
  terraform output -json > tf_output.json
  → 自定义 inventory 脚本读取 JSON

方式 3: CI/CD Pipeline 串联
  Stage 1: terraform apply
  Stage 2: ansible-playbook -i dynamic_inventory site.yml
```

---

## 9. Ansible Collection 是什么？

**回答：**

Collection 是 Ansible 2.9+ 引入的包分发格式。

```
Collection = Modules + Roles + Plugins 的打包单元

之前: 所有模块在 ansible 核心包中
现在: 模块拆分到独立 Collection 中

常用 Collection:
  ansible.builtin          → 内置模块 (apt, copy, service...)
  community.general        → 社区通用模块
  community.docker         → Docker 模块
  community.kubernetes     → K8s 模块
  amazon.aws               → AWS 模块
  azure.azcollection       → Azure 模块
  google.cloud             → GCP 模块
```

```bash
# 安装 Collection
ansible-galaxy collection install community.docker
ansible-galaxy collection install -r requirements.yml

# requirements.yml
collections:
  - name: community.docker
    version: ">=3.0.0"
  - name: community.kubernetes
    version: ">=3.0.0"
  - name: amazon.aws

# 使用
- name: Run Docker container
  community.docker.docker_container:
    name: myapp
    image: myapp:latest
    state: started
```

---

## 10. Ansible vs Shell 脚本？何时用 Ansible？

**回答：**

```
对比:
  维度              Ansible             Shell 脚本
  ──────────       ──────────          ──────────
  幂等性            内置 (模块保证)       需手动实现
  多主机            原生支持 (Inventory)  需循环 SSH
  错误处理          内置 (block/rescue)   需 set -e / trap
  可读性            YAML 声明式           命令式
  跨平台            多平台模块            OS 相关
  变更追踪          changed/ok 状态       无
  维护性            结构化 (Role)         脚本堆叠

何时用 Ansible:
  多台服务器配置管理
  需要幂等性 (重复执行安全)
  团队协作 (YAML 可读)
  复杂编排 (多步骤依赖)
  审计需求 (变更可追踪)

何时用 Shell:
  单机简单脚本
  快速一次性操作
  Ansible 不支持的场景
  启动/初始化脚本
```
