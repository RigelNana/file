# Git 服务器与大型仓库管理

---

## 1. Git LFS（Large File Storage）？

**回答：**

```
Git LFS = 将大文件存储在独立的 LFS 服务器
Git 仓库中只保存指针文件（~130 bytes）

为什么需要 LFS？
  Git 会保存每个文件的每个版本的完整副本
  大文件（视频/模型/数据集/PSD）会导致:
    - 仓库体积暴增
    - clone/fetch 极慢
    - 历史中永久存在（即使删除了文件）
```

```bash
# 安装
git lfs install

# 追踪大文件类型
git lfs track "*.psd"
git lfs track "*.mp4"
git lfs track "*.zip"
git lfs track "*.model"
git lfs track "datasets/**"

# 查看追踪规则
git lfs track
cat .gitattributes

# 正常使用 Git 即可
git add large-model.bin
git commit -m "add trained model"
git push

# 查看 LFS 文件
git lfs ls-files

# 迁移已有大文件到 LFS
git lfs migrate import --include="*.psd" --everything

# LFS 存储用量
git lfs env
```

### LFS 注意事项

```
限制:
  GitHub Free: 1GB 存储 + 1GB/月 带宽
  GitLab Free: 5GB
  超出需付费

最佳实践:
  1. 项目初始化时就配置 LFS
  2. 在 .gitattributes 中明确追踪规则
  3. CI/CD 中: git lfs install && git lfs pull
  4. 使用 GIT_LFS_SKIP_SMUDGE=1 跳过下载（只需代码时）
```

---

## 2. Monorepo vs Polyrepo？

**回答：**

```
Monorepo = 所有项目/服务放在一个仓库
Polyrepo = 每个项目/服务独立仓库

┌─────────────┬──────────────────┬──────────────────┐
│             │ Monorepo         │ Polyrepo         │
├─────────────┼──────────────────┼──────────────────┤
│ 代码共享    │ ✅ 直接引用       │ ❌ 需发包/子模块  │
│ 原子变更    │ ✅ 跨项目一次提交  │ ❌ 需多仓库协调   │
│ 依赖管理    │ ✅ 统一版本       │ ❌ 各自管理       │
│ 代码可见性  │ ✅ 全部可见       │ ⚠️  需权限配置    │
│ 仓库大小    │ ❌ 可能很大       │ ✅ 各自较小       │
│ CI/CD       │ ❌ 需要选择性构建  │ ✅ 独立流水线     │
│ 权限控制    │ ❌ 细粒度困难     │ ✅ 仓库级别隔离   │
│ 学习曲线    │ ❌ 需要特殊工具   │ ✅ 标准 Git 即可  │
│ 代表公司    │ Google, Meta     │ Netflix, Amazon  │
│ 工具        │ Bazel, Nx, Turbo │ 标准 Git 工具    │
└─────────────┴──────────────────┴──────────────────┘
```

### Monorepo 工具

```bash
# JavaScript/TypeScript
# Nx
npx create-nx-workspace@latest

# Turborepo
npx create-turbo@latest

# pnpm workspaces
# pnpm-workspace.yaml
packages:
  - 'packages/*'
  - 'apps/*'

# Go — Go Modules 天然支持 monorepo
# Python — Pants Build
# 通用 — Bazel (Google 开源)
```

---

## 3. 大型仓库性能优化？

**回答：**

### Partial Clone（部分克隆, Git 2.22+）

```bash
# 不下载 blob 对象（按需下载文件内容）
git clone --filter=blob:none <url>

# 不下载大于指定大小的 blob
git clone --filter=blob:limit=1m <url>

# 不下载 tree 对象（极度瘦身,谨慎使用）
git clone --filter=tree:0 <url>
```

### Sparse Checkout（稀疏检出）

```bash
# 只检出需要的目录
git clone --sparse <url>
cd repo
git sparse-checkout set src/my-service docs

# 使用 cone 模式（推荐，性能更好）
git sparse-checkout init --cone
git sparse-checkout set apps/my-app packages/shared
```

### Commit Graph（提交图加速）

```bash
# 生成 commit-graph 文件,加速 log/merge-base 等操作
git commit-graph write --reachable

# 增量更新
git commit-graph write --reachable --split

# 自动维护
git config gc.writeCommitGraph true

# 效果: 大仓库 git log 可提速 10-100x
```

### Multi-Pack Index

```bash
# 多包索引, 加速有多个 packfile 的仓库
git multi-pack-index write

# 搭配 repack
git repack -ad --write-midx
```

### 其他优化

```bash
# Filesystem Monitor（文件系统监视器）
git config core.fsmonitor true        # 内置 fsmonitor
git config core.untrackedCache true   # 未追踪文件缓存

# 后台维护（Git 2.31+）
git maintenance start
# 自动执行: gc, commit-graph, loose-objects, incremental-repack

# Feature 标志（大仓库推荐开启）
git config feature.manyFiles true
# 自动启用 index.version=4, core.untrackedCache, core.fsmonitor
```

---

## 4. Git 托管平台部署与选型？

**回答：**

```
┌────────────┬──────────────┬──────────────┬──────────────┐
│ 平台       │ 类型         │ 特点          │ 适用场景      │
├────────────┼──────────────┼──────────────┼──────────────┤
│ GitHub     │ SaaS/企业版  │ 最大社区       │ 开源/企业     │
│ GitLab     │ SaaS/自托管  │ 内置 CI/CD    │ 企业自托管    │
│ Gitea      │ 自托管       │ 轻量 Go 实现  │ 小团队/个人   │
│ Gogs       │ 自托管       │ 最轻量        │ 资源受限环境  │
│ Bitbucket  │ SaaS/企业版  │ Jira 集成     │ Atlassian 栈 │
│ Azure Repos│ SaaS         │ Azure 集成    │ 微软技术栈    │
│ Forgejo    │ 自托管       │ Gitea 社区分叉│ 社区驱动     │
└────────────┴──────────────┴──────────────┴──────────────┘
```

### GitLab 自托管部署

```bash
# Docker 部署（推荐）
docker run -d \
  --hostname gitlab.example.com \
  --publish 443:443 --publish 80:80 --publish 22:22 \
  --name gitlab \
  --restart always \
  --volume gitlab_config:/etc/gitlab \
  --volume gitlab_logs:/var/log/gitlab \
  --volume gitlab_data:/var/opt/gitlab \
  gitlab/gitlab-ee:latest

# Kubernetes 部署
helm repo add gitlab https://charts.gitlab.io/
helm install gitlab gitlab/gitlab \
  --set global.hosts.domain=example.com \
  --set certmanager-issuer.email=admin@example.com
```

### Gitea 轻量部署

```bash
# Docker Compose
version: "3"
services:
  server:
    image: gitea/gitea:latest
    ports:
      - "3000:3000"
      - "222:22"
    volumes:
      - ./gitea:/data
    environment:
      - USER_UID=1000
      - USER_GID=1000
# 内存占用 ~100MB，适合小团队
```

---

## 5. 仓库迁移（SVN → Git）？

**回答：**

```bash
# 1. 创建作者映射文件
svn log --xml | grep "^<author" | sort -u > authors-transform.txt
# 编辑为: svn_user = Git Name <email@example.com>

# 2. 使用 git svn 克隆
git svn clone <svn-url> \
  --authors-file=authors-transform.txt \
  --no-metadata \
  --stdlayout \
  --prefix="" \
  my-git-repo

# --stdlayout 适用于标准 SVN 布局:
#   /trunk
#   /branches
#   /tags

# 3. 转换 SVN 分支为 Git 分支
cd my-git-repo
for branch in $(git for-each-ref --format='%(refname:short)' refs/remotes/ | grep -v HEAD); do
    git branch $(echo $branch | sed 's|origin/||') refs/remotes/$branch
done

# 4. 转换 SVN 标签为 Git 标签
for tag in $(git for-each-ref --format='%(refname:short)' refs/remotes/tags/); do
    git tag $(echo $tag | sed 's|tags/||') refs/remotes/$tag
done

# 5. 清理远程引用
git remote remove origin

# 6. 添加新的 Git 远程仓库并推送
git remote add origin <git-url>
git push origin --all
git push origin --tags
```

### 其他迁移场景

```bash
# GitLab → GitHub
# 直接使用 GitHub Import 功能
# 或: git clone --mirror + git push --mirror

# 仓库镜像
git clone --mirror <source-url>
cd repo.git
git push --mirror <target-url>

# 保留 LFS 对象
git lfs fetch --all
git push --mirror <target-url>
git lfs push --all <target-url>
```

---

## 6. Git 安全最佳实践？

**回答：**

```
Git 安全清单:

1. 认证安全
   ✅ 使用 SSH Key 或 PAT（不要用密码）
   ✅ SSH Key 使用 Ed25519 算法
   ✅ 启用 2FA/MFA
   ✅ PAT 设置最小权限 + 过期时间
   ✅ 使用 credential manager 安全存储

2. 提交安全
   ✅ 启用 commit signing (GPG/SSH)
   ✅ 配合 vigilant mode 拒绝未签名提交
   ✅ 使用 .mailmap 统一提交者信息

3. 分支保护
   ✅ 保护 main/release 分支
   ✅ 要求 PR + Code Review
   ✅ 要求 CI 通过
   ✅ 禁止 force push
   ✅ 启用 CODEOWNERS

4. 敏感信息防护
   ✅ 使用 .gitignore 排除敏感文件
   ✅ pre-commit 检测密钥/密码
   ✅ 使用环境变量/Vault 管理密钥
   ✅ 定期使用 GitLeaks/TruffleHog 扫描

5. 仓库权限
   ✅ 最小权限原则
   ✅ 使用 Deploy Key（只读部署密钥）
   ✅ CI/CD 使用短期 Token
   ✅ 定期审计访问权限
```

### 密钥扫描工具

```bash
# GitLeaks — 检测仓库中的密钥泄露
gitleaks detect --source . --verbose

# TruffleHog
trufflehog git <repo-url>

# GitHub Secret Scanning（自动）
# GitLab Secret Detection（CI Job）

# pre-commit 集成
repos:
  - repo: https://github.com/gitleaks/gitleaks
    rev: v8.18.0
    hooks:
      - id: gitleaks

# 泄露后处理:
#   1. 立即撤销/轮换密钥
#   2. 使用 git filter-repo 清除历史
#   3. force push 所有分支
#   4. 通知受影响的服务
```

---

## 7. Deploy Key 与 CI/CD 凭据管理？

**回答：**

```
Deploy Key:
  仓库级别的 SSH Key
  可配置为 只读 或 读写
  一个 Deploy Key 只能关联一个仓库

与其他方案的对比:
  ┌──────────────────┬──────────────┬──────────┬────────────┐
  │ 方式             │ 作用域       │ 权限粒度 │ 推荐场景   │
  ├──────────────────┼──────────────┼──────────┼────────────┤
  │ 个人 SSH Key     │ 用户所有仓库 │ 用户权限 │ 个人开发   │
  │ Deploy Key       │ 单个仓库     │ 读/读写  │ CI/CD 部署 │
  │ PAT              │ 用户所有仓库 │ 可定制   │ API 访问   │
  │ GitHub App Token │ 指定仓库     │ 细粒度   │ 自动化工具 │
  │ GITHUB_TOKEN     │ 当前仓库     │ 工作流级 │ Actions 内 │
  └──────────────────┴──────────────┴──────────┴────────────┘
```

### CI/CD 中的 Git 操作

```yaml
# GitHub Actions — 使用内置 GITHUB_TOKEN
steps:
  - uses: actions/checkout@v4
    with:
      token: ${{ secrets.GITHUB_TOKEN }}

# 需要跨仓库操作时 — 使用 GitHub App
  - uses: actions/checkout@v4
    with:
      token: ${{ steps.app-token.outputs.token }}
      repository: org/other-repo

# GitLab CI — 使用 CI_JOB_TOKEN
script:
  - git clone https://gitlab-ci-token:${CI_JOB_TOKEN}@gitlab.com/group/repo.git
```

---

## 8. Git 仓库备份策略？

**回答：**

```bash
# 方案 1: git clone --mirror（完整镜像备份）
git clone --mirror <url> repo.git
# 包含所有分支、标签、refs
# 定期更新:
cd repo.git && git remote update

# 方案 2: git bundle（离线备份）
git bundle create repo.bundle --all
# 恢复:
git clone repo.bundle repo

# 方案 3: 多平台镜像
# 同时推送到多个平台
git remote add github  https://github.com/org/repo
git remote add gitlab  https://gitlab.com/org/repo
git remote add gitea   https://gitea.company.com/org/repo

# 推送到所有远程
git remote | xargs -I {} git push {} --all
git remote | xargs -I {} git push {} --tags
```

### 自动化备份脚本

```bash
#!/bin/bash
# backup-repos.sh

BACKUP_DIR="/backup/git/$(date +%Y%m%d)"
REPOS=(
  "git@github.com:org/repo1.git"
  "git@github.com:org/repo2.git"
)

mkdir -p "$BACKUP_DIR"

for repo in "${REPOS[@]}"; do
    name=$(basename "$repo" .git)
    echo "Backing up $name..."

    if [ -d "$BACKUP_DIR/$name.git" ]; then
        cd "$BACKUP_DIR/$name.git"
        git remote update
    else
        git clone --mirror "$repo" "$BACKUP_DIR/$name.git"
    fi
done

# 清理 30 天前的备份
find /backup/git/ -maxdepth 1 -mtime +30 -type d -exec rm -rf {} \;

echo "Backup completed: $BACKUP_DIR"
```

---

## 9. Monorepo 中的选择性 CI/CD？

**回答：**

```yaml
# Monorepo 中只构建变更的项目

# GitHub Actions — paths 过滤
name: Backend CI
on:
  push:
    paths:
      - 'apps/backend/**'
      - 'packages/shared/**'
      - 'package.json'

# GitLab CI — rules:changes
backend-test:
  rules:
    - changes:
        - apps/backend/**/*
        - packages/shared/**/*
  script:
    - cd apps/backend && npm test
```

### Nx / Turborepo 影响分析

```bash
# Nx — 只构建受影响的项目
npx nx affected --target=build --base=main
npx nx affected --target=test --base=main

# Turborepo — 增量构建
npx turbo run build --filter=...[HEAD^1]

# 原理:
#   1. 分析依赖图
#   2. 对比 base 和 HEAD 的变更文件
#   3. 找出受影响的项目
#   4. 只构建/测试这些项目
#   5. 利用缓存避免重复构建
```

### 使用 Git 判断变更

```bash
# 获取此次变更影响的目录
CHANGED_DIRS=$(git diff --name-only HEAD~1 | cut -d/ -f1-2 | sort -u)

# 根据变更目录决定构建哪些服务
for dir in $CHANGED_DIRS; do
    case "$dir" in
        apps/api)     echo "Build API"     ;;
        apps/web)     echo "Build Web"     ;;
        packages/*)   echo "Build All"     ;;
    esac
done
```

---

## 10. Git 性能诊断与监控？

**回答：**

```bash
# 仓库健康检查
git count-objects -vH
# count: loose 对象数
# size: loose 对象大小
# in-pack: packed 对象数
# size-pack: packfile 总大小
# prune-packable: 可清理的 loose 对象
# garbage: 垃圾对象

# 查找大文件
git rev-list --objects --all \
  | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '/^blob/ {print $3, $4}' \
  | sort -rn \
  | head -20

# 仓库完整性检查
git fsck --full

# GC 优化
git gc --aggressive --prune=now

# 查看仓库大小
du -sh .git/

# Git 操作计时
GIT_TRACE_PERFORMANCE=1 git status
GIT_TRACE_PERFORMANCE=1 git log --oneline -100
```

### 性能优化总结

```
场景 → 优化方案:

clone 慢
  → partial clone (--filter=blob:none)
  → shallow clone (--depth=1)
  → sparse checkout

git status 慢
  → core.fsmonitor = true
  → core.untrackedCache = true
  → feature.manyFiles = true

git log 慢
  → git commit-graph write
  → git gc

仓库太大
  → git lfs migrate
  → git filter-repo 清理历史
  → git repack -ad

push/fetch 慢
  → 检查网络
  → 使用 SSH 代替 HTTPS
  → 部署本地镜像
  → Git protocol v2 (git config protocol.version 2)

CI/CD 慢
  → 浅克隆 (actions/checkout with fetch-depth: 1)
  → 缓存 .git 目录
  → 选择性构建 (paths filter)
  → Git LFS skip smudge
```
