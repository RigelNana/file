# Git 版本控制八股文

---

## 一、Git 基础概念

### 1. Git 和 SVN 有什么区别？

**答：**

| 特性 | Git | SVN |
|------|-----|-----|
| 类型 | 分布式版本控制 | 集中式版本控制 |
| 仓库 | 每个开发者本地都有完整仓库 | 只有中央服务器有完整历史 |
| 离线工作 | 可以离线提交、查看历史 | 大部分操作需要网络 |
| 分支 | 轻量级，创建和切换极快 | 分支是目录拷贝，较重 |
| 速度 | 快（大部分操作在本地） | 慢（需要与服务器通信） |
| 存储方式 | 快照 | 增量差异 |

### 2. Git 的三个工作区域是什么？

**答：**

```
工作区(Working Directory) → 暂存区(Staging Area/Index) → 本地仓库(Repository)
         git add →                    git commit →
                            ← git checkout/restore              ← git reset
```

- **工作区**：实际文件所在的目录，你直接编辑的文件
- **暂存区（Index）**：`.git/index` 文件，记录下次提交要包含的文件变更
- **本地仓库**：`.git` 目录，存储所有版本历史和元数据

### 3. Git 对象有哪些类型？

**答：** Git 底层使用四种对象（以 SHA-1 哈希标识）：

| 对象类型 | 说明 |
|---------|------|
| blob | 文件内容（不包含文件名） |
| tree | 目录结构，包含文件名和 blob/tree 的引用 |
| commit | 提交信息，包含 tree 指针、父提交、作者、提交者、提交消息 |
| tag | 标签对象（仅注释标签），指向一个 commit |

```bash
git cat-file -t <hash>    # 查看对象类型
git cat-file -p <hash>    # 查看对象内容
```

---

## 二、常用命令

### 4. Git 最常用的命令有哪些？

**答：**

```bash
# 初始化和克隆
git init                           # 初始化本地仓库
git clone <url>                    # 克隆远程仓库

# 基本工作流
git status                         # 查看状态
git add .                          # 暂存所有修改
git add <file>                     # 暂存指定文件
git commit -m "message"            # 提交
git commit --amend                 # 修改最后一次提交

# 查看历史
git log                            # 查看提交历史
git log --oneline --graph          # 简洁图形化
git log -p -2                      # 查看最近2次提交的diff
git show <commit>                  # 查看某次提交详情
git diff                           # 工作区 vs 暂存区
git diff --staged                  # 暂存区 vs 最近提交
git diff HEAD                      # 工作区 vs 最近提交

# 远程操作
git remote -v                      # 查看远程仓库
git remote add origin <url>        # 添加远程仓库
git fetch origin                   # 获取远程更新（不合并）
git pull origin main               # 获取并合并
git push origin main               # 推送到远程

# 撤销操作
git restore <file>                 # 撤销工作区修改
git restore --staged <file>        # 取消暂存
git reset HEAD~1                   # 撤销最近一次提交（保留修改）
git reset --hard HEAD~1            # 撤销最近一次提交（丢弃修改）
git revert <commit>                # 生成一个反向提交来撤销

# 储藏
git stash                          # 储藏当前修改
git stash list                     # 查看储藏列表
git stash pop                      # 恢复最近的储藏
git stash drop                     # 删除最近的储藏
```

### 5. git fetch 和 git pull 的区别？

**答：**

| 操作 | 说明 |
|------|------|
| `git fetch` | 只下载远程仓库的更新到本地仓库，**不合并**到工作分支 |
| `git pull` | `git fetch` + `git merge`，下载并合并 |
| `git pull --rebase` | `git fetch` + `git rebase`，下载并变基 |

**最佳实践：** 先 `git fetch` 查看变更，确认无冲突后再合并，或者使用 `git pull --rebase` 保持线性历史。

### 6. git reset、git revert、git checkout 的区别？

**答：**

| 命令 | 作用 | 是否修改历史 | 适用场景 |
|------|------|------------|---------|
| `git reset` | 移动 HEAD 和分支指针 | 是（重写历史） | 本地未推送的提交 |
| `git revert` | 创建新提交来撤销 | 否（安全） | 已推送的提交 |
| `git restore` | 恢复文件到某个版本 | 否 | 撤销工作区/暂存区修改 |

**git reset 的三种模式：**
```bash
git reset --soft HEAD~1     # 只移动 HEAD，保留暂存区和工作区
git reset --mixed HEAD~1    # 移动 HEAD + 重置暂存区（默认）
git reset --hard HEAD~1     # 移动 HEAD + 重置暂存区 + 重置工作区（危险！）
```

---

## 三、分支管理

### 7. Git 分支的本质是什么？

**答：** Git 分支本质上是一个指向某个 commit 对象的可移动指针。创建分支只是创建了一个41字节的文件（40字符SHA-1 + 换行符），指向当前 commit，所以极其轻量。

```bash
# 分支操作
git branch                       # 列出本地分支
git branch -a                    # 列出所有分支（含远程）
git branch feature               # 创建分支
git switch feature               # 切换分支（推荐）
git checkout -b feature          # 创建并切换分支
git branch -d feature            # 删除已合并的分支
git branch -D feature            # 强制删除分支
git push origin --delete feature # 删除远程分支
```

### 8. 常见的 Git 分支策略有哪些？

**答：**

#### Git Flow
```
main (production)
  └── develop
        ├── feature/xxx   → 开发新功能
        ├── release/x.x   → 准备发布
        └── hotfix/xxx    → 紧急修复

特点：流程完善，适合版本发布制的项目
缺点：分支多，流程复杂
```

#### GitHub Flow
```
main (always deployable)
  └── feature-branch   → 开发 → Pull Request → Code Review → 合并 → 部署

特点：简单，适合持续部署
```

#### GitLab Flow
```
main → pre-production → production
  └── feature-branch

特点：结合了 Git Flow 和 GitHub Flow 的优点
有环境分支对应不同部署环境
```

#### Trunk-Based Development
```
main (trunk)
  └── short-lived feature branches (< 1-2天)

特点：极简，频繁集成到主干
适合：CI/CD 成熟的团队
```

### 9. git merge 和 git rebase 的区别？

**答：**

```
假设历史：
      A---B---C  feature
     /
D---E---F---G  main

# git merge（合并）：创建一个合并提交
      A---B---C
     /         \
D---E---F---G---H  main (H是合并提交)

# git rebase（变基）：将分支的提交"重放"到目标分支之上
              A'--B'--C'  feature
             /
D---E---F---G  main
```

| 特性 | merge | rebase |
|------|-------|--------|
| 历史 | 保留完整合并历史（非线性） | 线性历史，更清晰 |
| 安全性 | 不修改已有提交（安全） | 重写历史（已推送的提交不要rebase!） |
| 冲突 | 只解决一次 | 每个提交可能需要逐个解决 |
| 适用 | 公共分支合并 | 个人分支整理 |

**黄金法则：** 永远不要在公共分支上执行 rebase！

### 10. 如何解决 Git 合并冲突？

**答：**

```bash
# 1. 合并时出现冲突
git merge feature
# Auto-merging file.txt
# CONFLICT (content): Merge conflict in file.txt

# 2. 查看冲突文件
git status

# 3. 编辑冲突文件，冲突标记如下：
<<<<<<< HEAD
当前分支的内容
=======
被合并分支的内容
>>>>>>> feature

# 4. 解决冲突后
git add file.txt
git commit                     # merge 时
# 或
git rebase --continue          # rebase 时

# 取消合并
git merge --abort
git rebase --abort
```

---

## 四、高级操作

### 11. git cherry-pick 是什么？

**答：** cherry-pick 将某个特定的提交应用到当前分支，不需要合并整个分支。

```bash
# 将某个 commit 应用到当前分支
git cherry-pick <commit-hash>

# 应用多个提交
git cherry-pick <hash1> <hash2>

# 应用一个范围
git cherry-pick <hash1>..<hash2>

# 只暂存不提交
git cherry-pick --no-commit <hash>

# 场景：从 feature 分支挑选一个 bugfix 到 main
git checkout main
git cherry-pick abc1234
```

### 12. git rebase -i 交互式变基怎么用？

**答：** 交互式变基用于整理提交历史。

```bash
# 整理最近 3 个提交
git rebase -i HEAD~3

# 编辑器中显示：
pick abc1234 First commit
pick def5678 Second commit
pick ghi9012 Third commit

# 可用命令：
# pick   = 保留该提交
# reword = 保留但修改提交信息
# edit   = 保留但暂停让你修改
# squash = 合并到前一个提交（保留message）
# fixup  = 合并到前一个提交（丢弃message）
# drop   = 删除该提交

# 常见操作：合并多个提交为一个
pick abc1234 Add feature
squash def5678 Fix typo
squash ghi9012 Add tests
```

### 13. git bisect 二分查找怎么用？

**答：** 用二分法快速找到引入 bug 的提交。

```bash
# 开始二分查找
git bisect start

# 标记当前版本有 bug
git bisect bad

# 标记某个已知正常的版本
git bisect good v1.0

# Git 自动切换到中间的提交，你测试后标记
git bisect good    # 如果这个版本正常
git bisect bad     # 如果这个版本有 bug

# 重复直到找到引入 bug 的 commit

# 结束
git bisect reset

# 自动化：提供测试脚本
git bisect run ./test.sh
```

### 14. git submodule 和 git subtree 的区别？

**答：**

| 特性 | submodule | subtree |
|------|-----------|---------|
| 存储 | 独立仓库，主仓库只存引用 | 代码合并到主仓库 |
| 克隆 | 需要 `--recurse-submodules` | 直接克隆即可 |
| 更新 | `git submodule update` | `git subtree pull` |
| 复杂度 | 较复杂，容易出错 | 相对简单 |
| 适用 | 独立开发的组件库 | 不频繁更新的共享代码 |

```bash
# submodule
git submodule add <url> path
git submodule update --init --recursive
git submodule foreach git pull

# subtree
git subtree add --prefix=lib <url> main --squash
git subtree pull --prefix=lib <url> main --squash
```

---

## 五、Git 工作流与团队协作

### 15. Pull Request / Merge Request 的流程？

**答：**

```
1. 从 main 创建 feature 分支
   git checkout -b feature/add-login main

2. 开发并提交
   git add . && git commit -m "feat: add login"

3. 推送到远程
   git push origin feature/add-login

4. 在 GitHub/GitLab 上创建 PR/MR

5. Code Review（至少1-2人审查）
   - 代码质量
   - 功能正确性
   - 测试覆盖

6. CI/CD 自动检查通过

7. 合并到 main（选择合并策略）

8. 删除 feature 分支
```

### 16. Commit Message 规范（Conventional Commits）？

**答：**

```
<type>(<scope>): <subject>

<body>

<footer>
```

**类型（type）：**

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| docs | 文档修改 |
| style | 代码格式（不影响功能） |
| refactor | 重构 |
| perf | 性能优化 |
| test | 测试相关 |
| chore | 构建/工具变动 |
| ci | CI/CD 配置修改 |

**示例：**
```
feat(auth): add OAuth2 login support

Implement Google and GitHub OAuth2 authentication.
- Add OAuth2 callback endpoints
- Store tokens in encrypted session

Closes #123
```

### 17. .gitignore 的规则？

**答：**

```gitignore
# 注释
*.log              # 忽略所有 .log 文件
!important.log     # 但不忽略 important.log
/build             # 忽略根目录下的 build 目录
build/             # 忽略所有名为 build 的目录
doc/*.txt          # 忽略 doc 目录下的 .txt（不递归）
doc/**/*.txt       # 忽略 doc 目录下所有 .txt（递归）
```

```bash
# 已跟踪的文件需要先取消跟踪
git rm --cached <file>
git rm -r --cached <dir>

# 全局 .gitignore
git config --global core.excludesfile ~/.gitignore_global
```

---

## 六、Git Hooks

### 18. Git Hooks 有哪些？如何使用？

**答：** Git Hooks 是在特定 Git 事件发生时自动执行的脚本，位于 `.git/hooks/` 目录。

| Hook | 触发时机 | 常见用途 |
|------|---------|---------|
| pre-commit | commit 之前 | 代码格式化、lint检查 |
| commit-msg | 提交信息编辑后 | 验证 commit message 格式 |
| pre-push | push 之前 | 运行测试 |
| post-merge | merge 之后 | 安装依赖 |
| pre-receive | 服务端接收推送前 | 权限检查、CI 检查 |

```bash
# 示例：pre-commit hook
#!/bin/bash
# .git/hooks/pre-commit

# 运行 linter
npm run lint
if [ $? -ne 0 ]; then
    echo "Lint failed. Fix errors before committing."
    exit 1
fi
```

**团队共享 Hooks 的工具：**
- **Husky**（Node.js项目）
- **pre-commit**（Python框架）
- 将 hooks 放在仓库中，通过 `core.hooksPath` 配置

```bash
# 配置 hooks 目录
git config core.hooksPath .githooks
```

---

## 七、Git 故障处理

### 19. 如何恢复误操作？

**答：**

```bash
# 1. 误删分支 → 用 reflog 恢复
git reflog                          # 查看所有操作记录
git branch recovered <commit-hash>  # 从 reflog 中的 hash 恢复

# 2. 误 reset --hard → 用 reflog
git reflog
git reset --hard <commit-hash>

# 3. 误删文件
git restore <file>                  # 从暂存区恢复
git restore --source=HEAD <file>    # 从最近提交恢复

# 4. 修改已 push 的提交（谨慎！）
git commit --amend                  # 修改最近提交
git push --force-with-lease         # 安全的强制推送

# 5. 撤销已 push 的提交
git revert <commit>                 # 创建反向提交（安全）
git push
```

### 20. git reflog 是什么？

**答：** reflog 记录了 HEAD 和分支引用的所有变更历史，是 Git 的"安全网"。即使提交被 reset 或分支被删除，在 reflog 过期之前（默认90天）都可以恢复。

```bash
git reflog                          # 查看 HEAD 的 reflog
git reflog show feature             # 查看特定分支的 reflog
git reflog expire --expire=now --all  # 清除 reflog（谨慎！）
```
