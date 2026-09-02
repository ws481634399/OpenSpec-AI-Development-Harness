---
title: Git 规范
tags: [git, commit, branch, workflow]
related-changes: []
created-at: 2026-01-01T00:00:00Z
updated-at: 2026-01-01T00:00:00Z
---

# Git 规范

定义分支命名、Commit 消息格式和协作流程。

## 分支命名

### 命名格式

```
<type>/<scope>-<description>
```

### 类型

| 类型 | 用途 | 示例 |
|------|------|------|
| `feat` | 新功能 | `feat/auth-user-register` |
| `fix` | 缺陷修复 | `fix/login-token-expiry` |
| `refactor` | 重构（不改行为） | `refactor/user-service-split` |
| `test` | 测试补充 | `test/auth-register-coverage` |
| `docs` | 文档更新 | `docs/api-reference` |
| `chore` | 构建/工具/依赖 | `chore/upgrade-express` |
| `hotfix` | 紧急修复（从 main） | `hotfix/crash-on-startup` |

### 规则

- 全小写，用连字符分隔
- 不含空格、下划线、中文
- 描述简洁（3-5 个单词）

## Commit 消息

### 格式

```
<type>(<scope>): <description>

[可选 body：详细说明]

[可选 footer：关联 Task/Issue]
```

### type

| type | 含义 |
|------|------|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `refactor` | 重构 |
| `test` | 测试 |
| `docs` | 文档 |
| `style` | 格式化（不改逻辑） |
| `chore` | 构建/工具 |
| `perf` | 性能优化 |
| `ci` | CI 配置 |

### scope

模块名（可选）：`auth`、`models`、`config`

### 示例

```
feat(auth): 实现用户注册端点

- 新增 POST /api/auth/register
- 入参校验（email/phone 至少一个，password 强度）
- 返回 userId + token

Task: TASK-003
```

```
fix(order): 修复订单总价计算丢失精度

使用 Decimal 替代 Float 计算金额

Task: TASK-007
```

### 规则

- description 用祈使句：`实现` 而非 `实现了`
- description 不超过 50 字
- body 每行不超过 72 字
- 一个 Commit 只做一件事
- 不以句号结尾

## 提交粒度

### 一个 Task 一个 Commit

```
TASK-001: feat(models): add User model
TASK-002: feat(utils): add password hash
TASK-003: feat(auth): add register endpoint
```

### 禁止混合

```
# ✗ 错误：一个 Commit 包含多个 Task
feat: 实现注册功能（User model + 密码工具 + 端点 + 测试）

# ✓ 正确：拆分为多个 Commit
feat(models): add User model
feat(utils): add password hash
feat(auth): add register endpoint
test(auth): add register tests
```

## 协作流程

### 分支策略（简化 Git Flow）

```
main          ─────●─────●─────●─────●──────── 生产
                    \              /
feature/xxx         ●──●──●──●──●            开发
```

1. 从 `main` 切出 feature 分支
2. 在 feature 分支上开发，每个 Task 一个 Commit
3. 开发完成后提交 PR / MR
4. Code Review 通过后合入 `main`
5. 删除 feature 分支

### PR 规则

- PR 标题同 Commit 格式：`feat(auth): 实现用户注册端点`
- PR 描述包含：变更范围、测试方法、关联 Change/Task
- 至少 1 人 Review 通过
- CI 绿灯
- 不squash merge（保留 Task 级 Commit 历史）

## .gitignore 基线

```
# 依赖
node_modules/
.pnp/
__pycache__/
target/
vendor/

# 构建产物
dist/
build/
*.class
*.jar

# 环境配置
.env
.env.local
config/local.*

# IDE
.vscode/
.idea/
*.swp
*.swo

# 系统
.DS_Store
Thumbs.db

# 测试
coverage/
.nyc_output/
```

## 禁止事项

- 禁止 `git push --force` 到 main 分支
- 禁止提交 `.env` / 密钥文件
- 禁止提交 `node_modules/` / `dist/` 等构建产物
- 禁止一个 PR 超过 500 行改动（超出考虑拆分）
- 禁止 Commit 消息只写 "fix" 或 "update"
