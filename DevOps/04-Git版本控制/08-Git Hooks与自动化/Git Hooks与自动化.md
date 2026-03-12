# Git Hooks 与自动化

---

## 1. Git Hooks 基础？有哪些 Hook？

**回答：**

```
Git Hooks = 在特定 Git 事件触发时自动执行的脚本
位置: .git/hooks/（本地，不会被提交）

Hook 分两类：
  客户端 Hooks: 在开发者本地触发
  服务端 Hooks: 在 Git 服务器端触发
```

### 客户端 Hooks

| Hook | 触发时机 | 常见用途 |
|------|---------|---------|
| pre-commit | commit 前 | lint、格式化、检查 |
| prepare-commit-msg | 编辑提交信息前 | 自动填充模板 |
| commit-msg | 提交信息写完后 | 验证 commit message 格式 |
| post-commit | commit 完成后 | 通知、触发构建 |
| pre-rebase | rebase 前 | 阻止对已推送分支 rebase |
| post-rewrite | amend/rebase 重写后 | 更新相关数据 |
| pre-push | push 前 | 运行测试 |
| post-checkout | checkout 后 | 安装依赖、生成文件 |
| post-merge | merge 后 | 安装依赖 |
| pre-auto-gc | 自动 GC 前 | 通知或阻止 |

### 服务端 Hooks

| Hook | 触发时机 | 常见用途 |
|------|---------|---------|
| pre-receive | 接收推送前 | 权限检查、代码规范 |
| update | 更新每个分支前 | 分支级别权限控制 |
| post-receive | 接收推送后 | 触发 CI/CD、通知 |

---

## 2. 如何编写 pre-commit Hook？

**回答：**

```bash
#!/bin/bash
# .git/hooks/pre-commit
# 返回 0 = 允许提交, 非0 = 阻止提交

# 1. 检查是否有调试代码
if git diff --cached --name-only | xargs grep -l "console.log\|debugger\|import pdb" 2>/dev/null; then
    echo "❌ 发现调试代码，请在提交前清理"
    exit 1
fi

# 2. 运行 linter（只检查暂存的文件）
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|ts|py)$')

if [ -n "$STAGED_FILES" ]; then
    echo "Running linter..."
    npx eslint $STAGED_FILES
    if [ $? -ne 0 ]; then
        echo "❌ Lint 检查失败"
        exit 1
    fi
fi

# 3. 检查文件大小（阻止提交大文件）
MAX_SIZE=5242880  # 5MB
for file in $(git diff --cached --name-only --diff-filter=ACM); do
    size=$(wc -c < "$file" 2>/dev/null || echo 0)
    if [ "$size" -gt "$MAX_SIZE" ]; then
        echo "❌ 文件 $file 超过 5MB ($size bytes)"
        exit 1
    fi
done

# 4. 检查是否有冲突标记
if git diff --cached --name-only | xargs grep -l "<<<<<<< \|======= \|>>>>>>> " 2>/dev/null; then
    echo "❌ 发现未解决的合并冲突"
    exit 1
fi

echo "✅ Pre-commit 检查通过"
exit 0
```

```bash
# 使 hook 可执行
chmod +x .git/hooks/pre-commit

# 跳过 hook（紧急情况）
git commit --no-verify
git commit -n
```

---

## 3. 如何编写 commit-msg Hook？

**回答：**

```bash
#!/bin/bash
# .git/hooks/commit-msg
# $1 = 包含提交信息的临时文件路径

COMMIT_MSG_FILE=$1
COMMIT_MSG=$(cat "$COMMIT_MSG_FILE")

# 验证 Conventional Commits 格式
# type(scope): subject
PATTERN="^(feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert)(\(.+\))?: .{1,72}$"

# 获取第一行
FIRST_LINE=$(head -1 "$COMMIT_MSG_FILE")

if ! echo "$FIRST_LINE" | grep -qE "$PATTERN"; then
    echo "❌ 提交信息格式不符合规范"
    echo ""
    echo "正确格式: type(scope): subject"
    echo "type 可选: feat|fix|docs|style|refactor|perf|test|chore|ci|build|revert"
    echo ""
    echo "示例:"
    echo "  feat(auth): add OAuth2 login"
    echo "  fix: resolve memory leak in worker"
    echo "  docs(readme): update installation guide"
    echo ""
    echo "你的提交信息: $FIRST_LINE"
    exit 1
fi

# 检查 subject 长度
SUBJECT_LENGTH=${#FIRST_LINE}
if [ "$SUBJECT_LENGTH" -gt 72 ]; then
    echo "❌ 提交信息第一行不能超过 72 个字符 (当前: $SUBJECT_LENGTH)"
    exit 1
fi

exit 0
```

---

## 4. Husky（Node.js 项目的 Git Hooks 管理）？

**回答：**

```bash
# Husky 让团队共享 Git Hooks（解决 .git/hooks 不能提交的问题）

# 安装 Husky
npm install husky -D

# 初始化
npx husky init
# 创建 .husky/ 目录
# 在 package.json 添加 prepare 脚本

# 创建 pre-commit hook
echo "npx lint-staged" > .husky/pre-commit

# 创建 commit-msg hook
echo "npx commitlint --edit \$1" > .husky/commit-msg
```

### lint-staged（只检查暂存文件）

```json
// package.json
{
  "lint-staged": {
    "*.{js,ts,jsx,tsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{css,scss}": [
      "stylelint --fix"
    ],
    "*.{json,md,yml}": [
      "prettier --write"
    ]
  }
}
```

### commitlint

```bash
# 安装
npm install @commitlint/cli @commitlint/config-conventional -D

# 配置 commitlint.config.js
module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'docs', 'style', 'refactor',
      'perf', 'test', 'chore', 'ci', 'build', 'revert'
    ]],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [1, 'always', 100]
  }
};
```

---

## 5. pre-commit 框架（Python 生态）？

**回答：**

```yaml
# .pre-commit-config.yaml
repos:
  # 通用检查
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.5.0
    hooks:
      - id: trailing-whitespace       # 去除行尾空格
      - id: end-of-file-fixer         # 确保文件以换行结尾
      - id: check-yaml                # 验证 YAML
      - id: check-json                # 验证 JSON
      - id: check-merge-conflict      # 检查冲突标记
      - id: check-added-large-files   # 阻止大文件
        args: ['--maxkb=500']
      - id: detect-private-key        # 检测私钥
      - id: no-commit-to-branch       # 阻止直接提交到 main
        args: ['--branch', 'main']

  # Python 格式化
  - repo: https://github.com/psf/black
    rev: 24.3.0
    hooks:
      - id: black

  # Python lint
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.3.0
    hooks:
      - id: ruff
        args: ['--fix']

  # Shell 检查
  - repo: https://github.com/shellcheck-py/shellcheck-py
    rev: v0.9.0.6
    hooks:
      - id: shellcheck

  # Dockerfile lint
  - repo: https://github.com/hadolint/hadolint
    rev: v2.12.0
    hooks:
      - id: hadolint

  # Terraform 格式化
  - repo: https://github.com/antonbabenko/pre-commit-terraform
    rev: v1.86.0
    hooks:
      - id: terraform_fmt
      - id: terraform_validate
```

```bash
# 安装
pip install pre-commit

# 安装 hooks
pre-commit install

# 手动运行所有 hooks
pre-commit run --all-files

# 更新 hooks 版本
pre-commit autoupdate

# 跳过（紧急时）
git commit --no-verify
```

---

## 6. pre-push Hook 和 CI 集成？

**回答：**

```bash
#!/bin/bash
# .git/hooks/pre-push

# 推送前运行测试
echo "Running tests before push..."
npm test
if [ $? -ne 0 ]; then
    echo "❌ 测试失败，推送被阻止"
    exit 1
fi

# 检查是否 push 到受保护分支
PROTECTED_BRANCHES="main master"
CURRENT_BRANCH=$(git symbolic-ref HEAD | sed 's|refs/heads/||')

for branch in $PROTECTED_BRANCHES; do
    if [ "$CURRENT_BRANCH" = "$branch" ]; then
        echo "⚠️  直接推送到 $branch 分支！"
        read -p "确认继续? (y/n): " confirm
        if [ "$confirm" != "y" ]; then
            echo "推送已取消"
            exit 1
        fi
    fi
done

exit 0
```

### 与 CI/CD 的关系

```
Git Hooks → 本地快速检查（秒级）
  ├── pre-commit: lint, 格式化, 小检查
  ├── commit-msg: 提交信息规范
  └── pre-push: 单元测试

CI/CD → 服务器端完整检查（分钟级）
  ├── 完整测试套件
  ├── 构建验证
  ├── 集成测试
  ├── 安全扫描
  └── 部署

两者互补：
  Hooks 提供即时反馈（不依赖网络）
  CI 提供权威验证（不可绕过）
  Hooks 可以 --no-verify 跳过
  CI 不可跳过（强制执行）
```

---

## 7. 服务端 Hooks？

**回答：**

```bash
# 服务端 hooks 在 Git 服务器（bare repo）上运行
# GitLab/GitHub 通过 UI 和 API 配置

# pre-receive hook（最重要的服务端 hook）
#!/bin/bash
# 接收每行格式: <old-hash> <new-hash> <ref>

while read oldrev newrev refname; do
    # 阻止 force push 到 main
    if [ "$refname" = "refs/heads/main" ]; then
        if [ "$oldrev" != "0000000000000000000000000000000000000000" ]; then
            # 检查是否是 fast-forward
            MERGE_BASE=$(git merge-base $oldrev $newrev)
            if [ "$MERGE_BASE" != "$oldrev" ]; then
                echo "❌ 禁止对 main 分支进行 force push"
                exit 1
            fi
        fi
    fi

    # 检查提交大小
    for commit in $(git rev-list $oldrev..$newrev); do
        TREE_SIZE=$(git cat-file -s $commit)
        if [ "$TREE_SIZE" -gt 104857600 ]; then  # 100MB
            echo "❌ 提交 $commit 包含超大对象"
            exit 1
        fi
    done
done

exit 0
```

### GitLab 服务端 Hooks

```bash
# GitLab 自定义 hooks 位置:
# /opt/gitlab/embedded/service/gitlab-shell/hooks/
# 或项目级:
# <git-data>/repositories/<project>.git/custom_hooks/

# GitLab 还提供:
# - Push Rules（UI 配置）
# - Webhook（HTTP 回调）
# - Server Hooks（全局）
```

---

## 8. Git Hooks 的团队共享方案？

**回答：**

```
问题: .git/hooks/ 不会被提交到仓库
解决: 让团队成员使用相同的 hooks

方案 1: core.hooksPath（推荐, Git 2.9+）
  将 hooks 放在仓库中的 .githooks/ 目录
  git config core.hooksPath .githooks
  # 或在 Makefile/setup 脚本中自动配置

方案 2: Husky（Node.js 项目）
  见上面 Husky 部分

方案 3: pre-commit 框架（Python 生态）
  见上面 pre-commit 部分

方案 4: Lefthook（Go，多语言支持）
```

### Lefthook

```yaml
# lefthook.yml（轻量级，多语言支持）
pre-commit:
  parallel: true
  commands:
    lint:
      glob: "*.{js,ts}"
      run: npx eslint {staged_files}
    format:
      glob: "*.py"
      run: black {staged_files}
    test:
      run: make test

commit-msg:
  commands:
    validate:
      run: npx commitlint --edit {1}

pre-push:
  commands:
    test:
      run: make test-full
```

```bash
# 安装
# macOS: brew install lefthook
# Go: go install github.com/evilmartians/lefthook@latest

# 初始化
lefthook install
```

---

## 9. GitHub Actions / GitLab CI 中的 Git 操作？

**回答：**

### GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0        # 完整历史（默认浅克隆 depth 1）
          submodules: recursive  # 递归克隆子模块

      - name: Check commit messages
        uses: wagoid/commitlint-github-action@v5

      - name: Lint
        run: npm run lint

      - name: Test
        run: npm test

      - name: Check for fixup commits
        run: |
          if git log --oneline origin/main..HEAD | grep -i "fixup!\|squash!\|WIP"; then
            echo "Found fixup/squash/WIP commits. Please clean up before merging."
            exit 1
          fi
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - deploy

validate:commit:
  stage: validate
  script:
    - pip install gitlint
    - gitlint --commits "origin/main..HEAD"

test:
  stage: test
  script:
    - npm ci
    - npm test
  rules:
    - if: $CI_MERGE_REQUEST_ID

deploy:
  stage: deploy
  script:
    - ./deploy.sh
  rules:
    - if: $CI_COMMIT_BRANCH == "main"
  environment:
    name: production
```

---

## 10. 自动化 Changelog 生成？

**回答：**

```bash
# 基于 Conventional Commits 自动生成 Changelog

# 方案 1: conventional-changelog-cli
npm install -g conventional-changelog-cli
conventional-changelog -p angular -i CHANGELOG.md -s

# 方案 2: standard-version（语义化版本 + changelog）
npm install standard-version -D
npx standard-version
# 自动: 更新版本号 + 生成 CHANGELOG + 创建 Git 标签

# 方案 3: release-please（Google）
# GitHub Action 自动化
- uses: google-github-actions/release-please-action@v4
  with:
    release-type: node

# 方案 4: git-cliff（Rust, 高性能）
git cliff -o CHANGELOG.md

# 原理：
#   feat: → ## Features 章节
#   fix:  → ## Bug Fixes 章节
#   BREAKING CHANGE → ## BREAKING CHANGES 章节
#   → 自动按版本分组

# 示例输出:
# ## [1.2.0] - 2024-03-15
# ### Features
# - **auth**: add OAuth2 login (abc1234)
# - **api**: add rate limiting (def5678)
# ### Bug Fixes
# - fix memory leak in worker (ghi9012)
```
