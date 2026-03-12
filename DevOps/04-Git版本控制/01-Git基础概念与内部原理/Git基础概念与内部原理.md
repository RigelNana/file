# Git 基础概念与内部原理

---

## 1. Git 和 SVN 有什么区别？

**回答：**

| 特性 | Git | SVN |
|------|-----|-----|
| 架构 | 分布式 | 集中式 |
| 仓库 | 每个开发者有完整仓库 | 只有中央服务器有完整历史 |
| 离线工作 | 可以离线提交、查看历史、建分支 | 大部分操作需要网络 |
| 分支 | 轻量指针，创建/切换瞬间完成 | 目录拷贝，重量级 |
| 速度 | 快（大部分操作在本地） | 慢（频繁与服务器通信） |
| 存储模型 | 快照（snapshot） | 增量差异（delta） |
| 完整性 | SHA-1 校验每个对象 | 无内置完整性校验 |
| 学习曲线 | 较陡峭 | 较平缓 |

```
集中式（SVN）：                    分布式（Git）：
                                  
  ┌─────────┐                     ┌─────────┐
  │ Central │                     │ Remote  │
  │ Server  │                     │  Repo   │
  └────┬────┘                     └────┬────┘
       │                          ┌────┼────┐
   ┌───┼───┐                ┌─────┴┐ ┌┴────┐ ┌┴─────┐
   │   │   │                │Local │ │Local│ │Local │
  Client  Client            │Repo  │ │Repo │ │Repo  │
  (无完整历史)               │(完整)│ │(完整)│ │(完整)│
                            └──────┘ └─────┘ └──────┘
```

---

## 2. Git 的三个工作区域和文件状态？

**回答：**

### 三个区域

```
工作区 (Working Directory)     暂存区 (Staging Area/Index)     本地仓库 (Repository/.git)
       ┌──────────┐                ┌──────────┐                ┌──────────┐
       │          │  git add →     │          │  git commit →  │          │
       │ 编辑文件  │ ────────────→ │ .git/index│ ────────────→ │ .git/objects│
       │          │                │          │                │          │
       │          │ ← git restore  │          │ ← git reset    │          │
       └──────────┘                └──────────┘                └──────────┘

还有一个远程仓库 (Remote Repository)：
  git push →    推送到远程
  git fetch →   拉取远程更新（不合并）
  git pull →    拉取并合并
```

### 文件的四种状态

```
Untracked  →  git add  →  Staged
                              ↓ git commit
Unmodified ← ─ ─ ─ ─ ─ ─  Committed
    ↓ 修改文件
Modified   →  git add  →  Staged

查看状态：git status
  Untracked:  新创建的文件，未被 Git 追踪
  Modified:   已追踪文件被修改
  Staged:     已添加到暂存区，等待提交
  Committed:  已保存到本地仓库
```

---

## 3. Git 的四种对象类型？

**回答：**

Git 是一个**内容寻址文件系统**，所有数据以对象形式存储，用 SHA-1 哈希（40字符）标识。

| 对象类型 | 说明 | 内容 |
|---------|------|------|
| blob | 文件内容 | 纯二进制内容，不含文件名 |
| tree | 目录结构 | 文件名 + blob/tree 引用 + 权限 |
| commit | 提交 | tree指针 + 父commit + 作者 + 提交者 + message |
| tag | 注释标签 | 指向commit + 标签信息 + 签名 |

```
一次 commit 的对象关系：

commit abc123
├── tree: def456        ← 根目录
│   ├── blob: 111aaa   ← README.md
│   ├── blob: 222bbb   ← main.py
│   └── tree: 333ccc   ← src/
│       ├── blob: 444ddd ← src/app.py
│       └── blob: 555eee ← src/util.py
├── parent: xyz789      ← 父提交
├── author: Alice <alice@example.com>
└── message: "Add feature X"
```

### 查看底层对象

```bash
# 查看对象类型
git cat-file -t <hash>
# → blob / tree / commit / tag

# 查看对象内容
git cat-file -p <hash>

# 查看 commit 对象
git cat-file -p HEAD
# tree 4b825dc642cb6eb9a060e54bf899d3e5c3e2e4c1
# parent d6a9c3...
# author Alice <alice@example.com> 1625000000 +0800
# committer Alice <alice@example.com> 1625000000 +0800
#
# Add feature X

# 手动创建 blob 对象
echo "hello" | git hash-object -w --stdin
# → ce013625030ba8dba906f756967f9e9ca394464a

# 查看所有对象
find .git/objects -type f
```

---

## 4. .git 目录结构详解？

**回答：**

```
.git/
├── HEAD                # 当前所在分支的引用
│                       # 内容: ref: refs/heads/main
├── config              # 仓库级配置
├── description         # GitWeb 用的描述
├── index               # 暂存区（二进制文件）
├── hooks/              # Git Hooks 脚本目录
│   ├── pre-commit.sample
│   ├── commit-msg.sample
│   └── ...
├── info/
│   └── exclude         # 本地忽略规则（不提交到仓库）
├── logs/               # 引用变更日志（reflog）
│   ├── HEAD
│   └── refs/
│       └── heads/
│           └── main
├── objects/            # 所有 Git 对象（blob/tree/commit/tag）
│   ├── pack/           # 打包后的对象（优化存储）
│   │   ├── pack-xxx.idx
│   │   └── pack-xxx.pack
│   ├── info/
│   ├── ab/             # 对象目录（前2位hash）
│   │   └── cdef1234... # 对象文件（剩余38位hash）
│   └── ...
├── refs/               # 引用（分支和标签的指针）
│   ├── heads/          # 本地分支
│   │   └── main        # 内容: commit hash
│   ├── tags/           # 标签
│   │   └── v1.0
│   └── remotes/        # 远程跟踪分支
│       └── origin/
│           ├── main
│           └── HEAD
├── packed-refs          # 打包后的引用（优化）
└── COMMIT_EDITMSG      # 最近的提交信息
```

### 关键文件解读

```bash
# HEAD 文件 - 指向当前分支
cat .git/HEAD
# ref: refs/heads/main

# 分离 HEAD（detached HEAD）时直接包含 commit hash
# a1b2c3d4e5f6...

# refs/heads/main - main 分支指向的 commit
cat .git/refs/heads/main
# d6a9c3f...

# index - 暂存区（二进制，用 git ls-files 查看）
git ls-files --stage
# 100644 blob_hash 0	file.txt
```

---

## 5. HEAD、分支、标签的本质？

**回答：**

```
HEAD：指向当前所在分支的指针（指针的指针）
分支：指向某个 commit 的可移动指针
标签：指向某个 commit 的固定指针

                HEAD
                 ↓
                main
                 ↓
A ← B ← C ← D (commit)
         ↑
      feature
         ↑
        v1.0 (tag)
```

### HEAD 的状态

```bash
# 正常状态：HEAD 指向分支
cat .git/HEAD
# ref: refs/heads/main

# 分离 HEAD（Detached HEAD）：HEAD 直接指向 commit
git checkout abc1234
cat .git/HEAD
# abc1234567890...

# 分离 HEAD 的风险：
#   在此状态下的新提交不属于任何分支
#   切换到其他分支后，这些提交可能丢失
#   解决: git switch -c new-branch  # 创建新分支保存
```

### 标签类型

```bash
# 轻量标签（Lightweight Tag）
# 只是一个指向 commit 的引用
git tag v1.0

# 注释标签（Annotated Tag）
# 创建一个 tag 对象，包含标签信息
git tag -a v1.0 -m "Release 1.0"

# 推荐使用注释标签（有日期、作者、签名等信息）
git tag -s v1.0 -m "Signed release 1.0"   # GPG 签名标签

# 查看标签
git tag -l "v1.*"
git show v1.0
```

---

## 6. Git 的存储模型：快照 vs 增量？

**回答：**

```
SVN 增量存储（Delta）：
  每个版本只存储与上一版本的差异
  
  v1: fileA(v1) fileB(v1)
  v2: δA       fileB(v1)     ← 只存 A 的变更
  v3: δA       δB            ← 只存变更部分

Git 快照存储（Snapshot）：
  每个 commit 保存所有文件的完整快照
  未修改的文件只存一个指向已有 blob 的引用
  
  commit1: blobA1 blobB1
  commit2: blobA2 blobB1     ← A 新 blob，B 指向同一 blob
  commit3: blobA2 blobB2     ← A 指向同一 blob，B 新 blob
```

### 存储优化

```
Git 的实际优化：
  1. 相同内容只存一份（内容寻址）
     两个文件内容完全一样 → 同一个 blob
     
  2. 松散对象 → Pack 打包
     git gc 时将对象打包为 .pack 文件
     打包时使用增量压缩（delta compression）
     → 实际磁盘占用很小

  3. zlib 压缩
     所有对象都经过 zlib 压缩存储

# 手动打包
git gc

# 查看打包文件
git verify-pack -v .git/objects/pack/pack-xxx.idx

# 查看仓库大小
git count-objects -vH
```

---

## 7. SHA-1 哈希在 Git 中的作用？

**回答：**

```
每个 Git 对象的 SHA-1 = hash(对象类型 + 空格 + 内容长度 + \0 + 内容)

作用：
  1. 唯一标识：每个对象有全球唯一的 ID
  2. 完整性校验：内容变化 → hash 变化 → 立即发现篡改
  3. 去重：相同内容 → 相同 hash → 只存一份
  4. 不可变性：commit 的 hash 包含 parent hash
     → 修改历史中任何一个提交，所有后续提交的 hash 都会改变
     → 这就是 "重写历史" 的含义

# 计算 blob 对象的 hash
echo -n "hello" | git hash-object --stdin
# → ce013625030ba8dba906f756967f9e9ca394464a

# 等价于
echo -en "blob 5\0hello" | sha1sum

# Git 正在迁移到 SHA-256（更安全）
# git init --object-format=sha256
```

---

## 8. Git 的引用（refs）系统？

**回答：**

```
引用 = 人类可读的名字 → 指向 commit hash

refs 类型：
  refs/heads/main       → 本地分支
  refs/tags/v1.0        → 标签
  refs/remotes/origin/main → 远程跟踪分支
  refs/stash            → stash 引用

特殊引用：
  HEAD                  → 当前分支（refs/heads/xxx）
  ORIG_HEAD             → 重置/合并前的 HEAD（用于撤销）
  MERGE_HEAD            → 合并时，被合并分支的 HEAD
  FETCH_HEAD            → 最近 fetch 的远程分支

引用规范（Refspec）：
  git fetch origin main
  → +refs/heads/main:refs/remotes/origin/main
  
  格式: +<src>:<dst>
  + 表示非快进也更新（force）
```

### 祖先引用

```bash
# ~ 和 ^ 的区别
HEAD~1   = HEAD的第一个父提交   = HEAD^
HEAD~2   = HEAD的祖父提交       = HEAD^^
HEAD~3   = HEAD的曾祖父提交

# ^ 用于合并提交（有多个父提交时）
HEAD^1   = 第一个父提交（被合并到的分支）
HEAD^2   = 第二个父提交（被合并的分支）

# 组合使用
HEAD~2^2 = HEAD 的祖父的第二个父提交

# 范围
main..feature    = feature 有但 main 没有的提交
main...feature   = 两者各自独有的提交
```

---

## 9. Git 配置的三个层级？

**回答：**

```bash
# 系统级（所有用户）
git config --system       # /etc/gitconfig

# 用户级（当前用户）
git config --global       # ~/.gitconfig

# 仓库级（当前仓库）
git config --local        # .git/config

# 优先级：local > global > system

# 常用配置
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global core.editor "code --wait"
git config --global init.defaultBranch main
git config --global pull.rebase true             # pull 时默认 rebase
git config --global merge.conflictstyle diff3    # 三路对比冲突
git config --global rerere.enabled true          # 记住冲突解决方式
git config --global core.autocrlf input          # 行尾处理（Linux/Mac）
git config --global core.autocrlf true           # 行尾处理（Windows）
git config --global credential.helper store      # 保存凭据

# 别名
git config --global alias.st status
git config --global alias.co checkout
git config --global alias.br branch
git config --global alias.lg "log --oneline --graph --all --decorate"

# 查看所有配置
git config --list --show-origin
```

---

## 10. Git 的 packfile 和垃圾回收？

**回答：**

```
松散对象（Loose Objects）：
  每个对象单独一个文件: .git/objects/ab/cdef...
  小仓库没问题，但大仓库会有大量小文件

Pack 文件（Packfiles）：
  多个对象打包为一个文件: .git/objects/pack/pack-xxx.pack
  使用增量压缩：相似的 blob 只存差异
  配合索引文件: pack-xxx.idx（快速定位）
```

### 垃圾回收

```bash
# 自动 GC（达到阈值时自动触发）
git gc --auto

# 手动 GC
git gc

# 积极 GC（更彻底的打包和清理）
git gc --aggressive --prune=now

# GC 做了什么：
#   1. 将松散对象打包为 packfile
#   2. 打包引用（refs → packed-refs）
#   3. 清理不可达对象（孤立的 blob/tree/commit）
#   4. 清理过期的 reflog

# 查看不可达对象
git fsck --unreachable

# 查看仓库统计
git count-objects -vH
# count: 0            ← 松散对象数
# size: 0 bytes       ← 松散对象大小
# in-pack: 1234       ← pack 中的对象数
# packs: 1            ← pack 文件数
# size-pack: 5.67 MiB ← pack 总大小

# 注意：
#   不可达对象默认保留 2 周（gc.pruneExpire）
#   reflog 默认保留 90 天（gc.reflogExpire）
#   已合并分支的 reflog 保留 30 天（gc.reflogExpireUnreachable）
```
