# HCL 语法与配置结构

---

## 1. HCL 基本语法？

**回答：**

```hcl
# HCL = HashiCorp Configuration Language

# 单行注释
// 也是单行注释
/* 多行
   注释 */

# 块 (Block) — HCL 的基本结构单元
block_type "label1" "label2" {
  argument = "value"

  nested_block {
    key = "value"
  }
}

# 实际示例
resource "aws_instance" "web" {     # block_type=resource, labels=aws_instance, web
  ami           = "ami-12345678"     # argument
  instance_type = "t3.micro"

  tags = {                           # map
    Name = "web-server"
  }
}
```

---

## 2. HCL 数据类型？

**回答：**

```hcl
# 基本类型 (Primitive)
string_val  = "hello"               # 字符串
number_val  = 42                    # 数字 (整数或浮点)
bool_val    = true                  # 布尔值

# 复合类型 (Collection)
list_val    = ["a", "b", "c"]       # 列表 (有序, 同类型)
set_val     = toset(["a", "b"])     # 集合 (无序, 去重)
map_val     = {                     # 映射 (键值对)
  key1 = "value1"
  key2 = "value2"
}

# 结构化类型
tuple_val   = ["hello", 42, true]   # 元组 (有序, 可不同类型)
object_val  = {                     # 对象 (有类型约束的 map)
  name = "web"
  port = 80
}

# null
null_val = null                     # 空值 (使用默认值)

# 类型约束 (用于变量声明)
variable "example" {
  type = string                     # 单一类型
  type = number
  type = bool
  type = list(string)               # 字符串列表
  type = set(string)                # 字符串集合
  type = map(number)                # 数字映射
  type = list(object({              # 对象列表
    name = string
    port = number
    ssl  = optional(bool, false)    # 可选字段 + 默认值
  }))
  type = tuple([string, number])    # 元组
  type = any                        # 任意类型
}
```

---

## 3. 字符串与模板语法？

**回答：**

```hcl
# 基本字符串
name = "hello"

# 字符串插值
name = "web-${var.environment}"
name = "instance-${count.index + 1}"

# 多行字符串 (Heredoc)
user_data = <<-EOF
  #!/bin/bash
  echo "Hello from ${var.environment}"
  apt-get update -y
  apt-get install -y nginx
EOF

# 引号内的多行
description = "This is a \
  multi-line string"

# 转义
escaped = "quote: \" backslash: \\ dollar: $$"
interpolation = "literal $${not_a_var}"   # 输出: literal ${not_a_var}

# 指令 (Directives) — 在字符串中使用逻辑
user_data = <<-EOF
  %{ if var.ssl_enabled }
  listen 443 ssl;
  %{ else }
  listen 80;
  %{ endif }

  %{ for server in var.backend_servers ~}
  server ${server};
  %{ endfor ~}
EOF

# ~ 去除空白
trimmed = <<-EOF
  %{ for item in var.list ~}
  ${item}
  %{ endfor ~}
EOF
```

---

## 4. 表达式与运算符？

**回答：**

```hcl
# 算术运算
result = 2 + 3          # 5
result = 10 - 3         # 7
result = 2 * 3          # 6
result = 10 / 3         # 3.333...
result = 10 % 3         # 1

# 比较运算
equal     = var.env == "prod"
not_equal = var.env != "dev"
greater   = var.count > 5
less_eq   = var.count <= 10

# 逻辑运算
and_op = var.ssl && var.production
or_op  = var.debug || var.verbose
not_op = !var.disabled

# 条件表达式 (三元)
instance_type = var.environment == "production" ? "t3.large" : "t3.micro"
subnet_id     = var.public ? aws_subnet.public.id : aws_subnet.private.id

# 嵌套条件
size = (
  var.env == "production" ? "large" :
  var.env == "staging" ? "medium" : "small"
)

# Splat 表达式
all_ids     = aws_instance.web[*].id             # 所有实例的 ID
all_ips     = aws_instance.web[*].public_ip      # 所有实例的公网 IP
all_names   = aws_subnet.public[*].tags["Name"]  # 所有子网名称
```

---

## 5. 引用与依赖？

**回答：**

```hcl
# 资源属性引用
vpc_id    = aws_vpc.main.id                    # resource.<TYPE>.<NAME>.<ATTRIBUTE>
subnet_id = aws_subnet.public[0].id            # 索引引用
sg_id     = aws_security_group.web.id

# 数据源引用
ami_id = data.aws_ami.ubuntu.id                # data.<TYPE>.<NAME>.<ATTRIBUTE>

# 变量引用
region = var.aws_region                        # var.<NAME>

# 本地变量引用
name = local.full_name                         # local.<NAME>

# 模块输出引用
vpc_id = module.vpc.vpc_id                     # module.<NAME>.<OUTPUT>

# 隐式依赖 (推荐)
resource "aws_subnet" "public" {
  vpc_id = aws_vpc.main.id                     # 隐式依赖 aws_vpc.main
}

# 显式依赖 (特殊场景)
resource "aws_instance" "web" {
  ami           = data.aws_ami.ubuntu.id
  instance_type = "t3.micro"

  depends_on = [                               # 显式声明依赖
    aws_iam_role_policy.s3_access,
    aws_security_group.web
  ]
}

# Terraform 自动构建依赖图 (DAG)
# 无依赖的资源可并行创建
# terraform graph | dot -Tpng > graph.png
```

---

## 6. locals 本地变量？

**回答：**

```hcl
# locals — 定义计算后的本地值, 减少重复

locals {
  # 简单值
  project_name = "myapp"
  environment  = var.environment

  # 计算值
  name_prefix = "${local.project_name}-${local.environment}"
  is_production = var.environment == "production"

  # 通用标签
  common_tags = {
    Project     = local.project_name
    Environment = local.environment
    ManagedBy   = "terraform"
    Team        = var.team
  }

  # 条件值
  instance_type = local.is_production ? "t3.large" : "t3.micro"
  replicas      = local.is_production ? 3 : 1

  # 复杂计算
  subnet_cidrs = [
    for i in range(var.subnet_count) :
    cidrsubnet(var.vpc_cidr, 8, i)
  ]
}

# 使用
resource "aws_instance" "web" {
  instance_type = local.instance_type

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-web"
    Role = "webserver"
  })
}

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr
  tags       = local.common_tags
}
```

```
locals vs variables:
  variables → 外部输入 (用户/环境提供)
  locals    → 内部计算 (基于变量和资源计算)

  variables 可被覆盖, locals 不可
  locals 适合: 公共标签, 名称前缀, 条件计算
```

---

## 7. 动态块 (dynamic block)？

**回答：**

```hcl
# dynamic — 动态生成重复的嵌套块

# 不用 dynamic (硬编码)
resource "aws_security_group" "web" {
  ingress {
    from_port = 80
    to_port   = 80
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
  ingress {
    from_port = 443
    to_port   = 443
    protocol  = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# 用 dynamic
variable "ingress_rules" {
  default = [
    { port = 80,  cidr = "0.0.0.0/0",  description = "HTTP" },
    { port = 443, cidr = "0.0.0.0/0",  description = "HTTPS" },
    { port = 22,  cidr = "10.0.0.0/8", description = "SSH" },
  ]
}

resource "aws_security_group" "web" {
  name   = "web-sg"
  vpc_id = aws_vpc.main.id

  dynamic "ingress" {                            # 块名称
    for_each = var.ingress_rules                 # 遍历列表
    content {                                     # 块内容
      from_port   = ingress.value.port            # ingress.value = 当前元素
      to_port     = ingress.value.port
      protocol    = "tcp"
      cidr_blocks = [ingress.value.cidr]
      description = ingress.value.description
    }
  }

  # 自定义迭代变量名
  dynamic "egress" {
    for_each = var.egress_rules
    iterator = rule                               # 自定义名称 (默认为块名)
    content {
      from_port   = rule.value.from_port
      to_port     = rule.value.to_port
      protocol    = rule.value.protocol
      cidr_blocks = rule.value.cidrs
    }
  }
}
```

---

## 8. 内置函数？

**回答：**

```hcl
# 字符串函数
upper("hello")                    # "HELLO"
lower("HELLO")                    # "hello"
title("hello world")              # "Hello World"
trimspace("  hello  ")            # "hello"
replace("hello", "l", "L")       # "heLLo"
split(",", "a,b,c")              # ["a", "b", "c"]
join("-", ["a", "b", "c"])        # "a-b-c"
format("Hello, %s!", var.name)    # "Hello, World!"
substr("hello", 0, 3)            # "hel"
regex("^web-(\\d+)$", "web-42")  # ["42"]

# 数字函数
min(1, 2, 3)                      # 1
max(1, 2, 3)                      # 3
abs(-5)                           # 5
ceil(4.1)                         # 5
floor(4.9)                        # 4
parseint("FF", 16)                # 255

# 集合函数
length(["a", "b"])                # 2
element(["a", "b", "c"], 1)       # "b"
index(["a", "b", "c"], "b")      # 1
contains(["a", "b"], "a")        # true
concat(["a"], ["b"], ["c"])      # ["a", "b", "c"]
flatten([["a", "b"], ["c"]])     # ["a", "b", "c"]
distinct(["a", "a", "b"])        # ["a", "b"]
sort(["c", "a", "b"])            # ["a", "b", "c"]
reverse(["a", "b", "c"])         # ["c", "b", "a"]
slice(["a", "b", "c", "d"], 1, 3) # ["b", "c"]
zipmap(["a", "b"], [1, 2])       # {a=1, b=2}
keys({a=1, b=2})                 # ["a", "b"]
values({a=1, b=2})               # [1, 2]
lookup({a=1, b=2}, "a", 0)       # 1
merge({a=1}, {b=2})              # {a=1, b=2}

# 编码函数
jsonencode({name = "web"})        # JSON 字符串
jsondecode("{\"name\":\"web\"}")  # HCL 对象
yamlencode({name = "web"})        # YAML 字符串
base64encode("hello")            # base64
base64decode("aGVsbG8=")         # "hello"

# 文件函数
file("${path.module}/script.sh")  # 读取文件内容
filebase64("cert.pem")           # 读取并 base64 编码
templatefile("tmpl.tpl", {name = "web"})  # 渲染模板
fileexists("${path.module}/config.json")  # 文件是否存在

# 网络函数
cidrsubnet("10.0.0.0/16", 8, 1)  # "10.0.1.0/24"
cidrhost("10.0.1.0/24", 5)       # "10.0.1.5"
cidrnetmask("10.0.0.0/16")       # "255.255.0.0"

# 类型转换
tostring(42)                      # "42"
tonumber("42")                    # 42
tobool("true")                    # true
tolist(toset(["a", "b"]))        # ["a", "b"]
toset(["a", "a", "b"])           # toset(["a", "b"])
tomap({a = 1})                   # {a = 1}

# 日期
timestamp()                       # 当前 UTC 时间
formatdate("YYYY-MM-DD", timestamp())  # "2024-01-15"
timeadd(timestamp(), "24h")       # 24小时后
```

---

## 9. for 表达式？

**回答：**

```hcl
# for 表达式 — 转换集合

# 列表 → 列表
upper_names = [for name in var.names : upper(name)]
# ["alice", "bob"] → ["ALICE", "BOB"]

# 列表 → 带条件过滤
prod_instances = [
  for inst in var.instances : inst.name
  if inst.environment == "production"
]

# 列表 → map
instance_map = {
  for inst in var.instances :
  inst.name => inst.ip               # key => value
}
# [{name="web1", ip="1.1.1.1"}, ...] → {"web1" = "1.1.1.1", ...}

# map → 列表
names = [for k, v in var.tags : "${k}=${v}"]
# {env="prod", team="ops"} → ["env=prod", "team=ops"]

# 嵌套 for
all_subnets = flatten([
  for vpc_key, vpc in var.vpcs : [
    for subnet_key, subnet in vpc.subnets :
    {
      vpc_name    = vpc_key
      subnet_name = subnet_key
      cidr        = subnet.cidr
    }
  ]
])

# for + 分组
users_by_role = {
  for user in var.users :
  user.role => user.name...          # ... 表示分组 (相同 key 收集为列表)
}
# [{name="alice", role="admin"}, {name="bob", role="admin"}, {name="carol", role="dev"}]
# → {"admin" = ["alice", "bob"], "dev" = ["carol"]}
```

---

## 10. HCL 编码规范与最佳实践？

**回答：**

```
格式化:
  ✓ terraform fmt 自动格式化 (CI 中用 -check)
  ✓ 2 空格缩进
  ✓ = 对齐
  ✓ 块之间空行分隔

命名规范:
  资源名: 小写 + 下划线 (aws_instance.web_server)
  变量名: 小写 + 下划线 (var.instance_type)
  输出名: 小写 + 下划线 (output.vpc_id)
  文件名: 小写 + 下划线 (main.tf, variables.tf)

  ✗ 避免: aws_instance.WebServer, var.instanceType

文件组织:
  main.tf       → 核心资源
  variables.tf  → 变量声明
  outputs.tf    → 输出值
  providers.tf  → Provider 配置
  data.tf       → Data Source
  locals.tf     → 本地变量
  versions.tf   → 版本约束

  按功能拆分:
    networking.tf  → VPC/Subnet/SG
    compute.tf     → EC2/ASG/ALB
    database.tf    → RDS/ElastiCache
    storage.tf     → S3/EFS

编码实践:
  ✓ 使用 locals 消除重复
  ✓ 使用 for_each 替代 count (更稳定)
  ✓ 使用 dynamic block 减少重复
  ✓ 变量加 description + type + validation
  ✓ 标签统一管理 (locals.common_tags)
  ✓ 版本约束 (~> 悲观锁定)
```
