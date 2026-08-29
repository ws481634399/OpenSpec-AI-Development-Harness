# sdd-knowledge: 知识管理与检索

> 阶段: knowledge
> 不进 7 状态生命周期（辅助 Skill，供 sdd-converge / sdd-explore 调用或独立使用）
> 产出: standards/INDEX.md, product/INDEX.md, .sdd/knowledge-index.json
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/review/persona-knowledge.md

## 四种能力

本 Skill 有四种能力，按调用场景区分。调用方按需读取对应段落执行。

---

## 能力 A：知识沉淀（sdd-converge 调用）

将已完成 Change 的知识沉淀到长期知识库。

### 前置条件
- Change 处于 `completed` 状态
- convergence.md 已产出，含知识分类结果

### 执行步骤

#### 1. 读取 convergence.md

读取 `delivery/changes/<CHG>/convergence.md`，提取知识分类结果：
- standards 晋升项（技术规则、架构决策、编码规范）
- product 更新项（业务能力、产品知识）
- no-update 项（无需沉淀）

#### 2. 写入 standards/

对每个 standards 晋升项：

**确定目标文件：**
- 编码规范 → `standards/coding-standards.md`
- 架构决策 → `standards/architecture-decisions.md`
- 安全实践 → `standards/security.md`
- 测试约定 → `standards/testing-conventions.md`
- 错误处理 → `standards/error-handling.md`

**合并策略：**
- 文件已存在 → 读取现有内容，将新知识合并（追加段落或更新现有 section）
- 文件不存在 → 新建并写入

**Front-matter 格式：**
```yaml
---
title: <标题>
tags: [<标签>]
repos: [<适用仓库 id，可空=全仓通用>]
related-changes: [<CHG-XXXX>]
created-at: <ISO8601>
updated-at: <ISO8601>
---
```

> Phase 2.4 多仓：规则仅适用于特定仓技术栈时（如 Java 后端规范），
> 在 front-matter 标注 `repos`（对应 `.sdd/repositories.yaml` 的仓库 id）；
> 省略表示全仓通用。

**合并原则：**
- 保留历史内容，不覆盖
- 新内容追加到对应 section
- 如与已有内容矛盾，标注冲突，不自动覆盖

#### 3. 写入 product/

对每个 product 更新项：

**确定目标文件：**
- 业务域 → `product/<domain>.md`（如 `user-center.md`、`order-flow.md`）

**合并策略同 standards。**

#### 4. 调用能力 C 重建索引

执行本 SKILL「能力 C：索引构建」段落，更新索引文件。

### 质量自检
- [ ] 每个知识项是否写入到了正确的文件？
- [ ] Front-matter 是否包含 title/tags/related-changes？
- [ ] 合并是否保留了历史内容？
- [ ] 冲突是否标注？

### 产出
- `standards/<category>.md` — 技术规则知识（更新或新建）
- `product/<domain>.md` — 产品知识（更新或新建）

---

## 能力 B：独立添加知识（用户直接调用）

不经过 Change 流程，直接添加知识文档。

### 前置条件
- Workspace 已初始化
- 有知识内容待添加

### 执行步骤

#### 1. 询问用户知识类型

向用户确认：
- **技术规则**（standards/）— 编码规范、架构决策、技术选型
- **产品知识**（product/）— 业务能力、产品定义、领域知识
- **团队约定**（standards/）— 工作流、协作规则

#### 2. 分析内容确定路径

**文件命名规则：**
- 编码规范 → `coding-standards.md`
- 架构决策 → `architecture-decisions.md` 或 `adr-NNN-<title>.md`
- 业务域 → `<domain>.md`（如 `user-center.md`）
- 通用约定 → `<topic>.md`（如 `git-conventions.md`）

如果文件已存在，读取后合并。

#### 3. 写入知识文档

写入文件（含 front-matter）：
```yaml
---
title: <标题>
tags: [<标签>]
related-changes: []
created-at: <ISO8601>
updated-at: <ISO8601>
---
```
正文为知识内容。

#### 4. 调用能力 C 重建索引

### 产出
- `standards/<file>.md` 或 `product/<file>.md`

---

## 能力 C：索引构建（自动调用）

扫描知识目录，生成人读索引和机器可读索引。

### 执行步骤

#### 1. 扫描知识目录

遍历以下目录的全部 `.md` 文件（排除 INDEX.md 自身）：
- `standards/`
- `product/`

#### 2. 提取文档元信息

对每个文档提取：
- **标题**：front-matter 的 `title`，或第一行 `#` 标题
- **路径**：相对 Workspace 根的路径
- **摘要**：front-matter 后的前 3 段正文（去除 markdown 标记）
- **标签**：front-matter 的 `tags`
- **关联 Change**：front-matter 的 `related-changes`

#### 2.1 摘要提取规则

**提取方法：**
1. 跳过 front-matter（`---` 到 `---`）
2. 跳过第一个 `#` 标题（与 title 重复）
3. 提取接下来 3 段正文（以空行分隔的段落）
4. 去除 markdown 标记（`**`、`[link](url)`、代码块）
5. 截断到 150 字符以内

**示例：**
```markdown
---
title: 代码规范
---
# 代码规范

本规范定义了项目的编码风格和约定。适用于全部新代码。

命名使用 camelCase。文件名使用 kebab-case。

...
```
→ 摘要："本规范定义了项目的编码风格和约定。适用于全部新代码。命名使用 camelCase。"

#### 3. 生成 standards/INDEX.md

读取模板 `templates/artifacts/INDEX.md`，按结构填写。

**分类组织方法：**
- 按知识领域分组（编码规范、架构决策、安全实践、测试约定...）
- 每条目：标题（链接）+ 摘要

```markdown
# Standards 知识索引

> 最后更新: 2026-01-01T00:00:00Z
> 关联 Change: CHG-0001, CHG-0002

## 编码规范
- [代码规范](coding-standards.md) — 代码风格、命名约定、格式化规则
- [Git 提交规范](git-conventions.md) — Commit message 格式、分支命名

## 架构决策
- [ADR-001 模块化架构](architecture-decisions.md) — 模块划分依据和边界

## 安全实践
- [密码存储规范](security.md) — bcrypt 哈希，cost=10
```

#### 4. 生成 product/INDEX.md

同上格式，按业务域组织。

#### 5. 生成 .sdd/knowledge-index.json

读取模板 `templates/artifacts/knowledge-index.json`，按结构填写。

机器可读索引（供能力 D 检索使用）：

```json
{
  "updated-at": "2026-01-01T00:00:00Z",
  "standards": [
    {
      "title": "代码规范",
      "path": "standards/coding-standards.md",
      "tags": ["code", "style"],
      "summary": "代码风格、命名约定、格式化规则",
      "related-changes": ["CHG-0001"]
    }
  ],
  "product": [
    {
      "title": "用户中心能力",
      "path": "product/user-center.md",
      "tags": ["user", "auth"],
      "summary": "用户注册、登录、个人中心",
      "related-changes": ["CHG-0002"]
    }
  ]
}
```

### 质量自检
- [ ] 全部 .md 文件是否都已纳入索引？
- [ ] 摘要是否准确反映文档内容？
- [ ] 分类是否合理（不交叉）？
- [ ] knowledge-index.json 格式是否合法？

### 产出
- `standards/INDEX.md` — 技术规则索引（人读）
- `product/INDEX.md` — 产品知识索引（人读）
- `.sdd/knowledge-index.json` — 机器可读索引（Agent 检索）

---

## 能力 D：知识检索（sdd-explore 调用）

新需求探索时，按关键词检索历史知识，注入探索上下文。

### 前置条件
- `.sdd/knowledge-index.json` 已存在（如不存在，先执行能力 C 构建索引）

### 执行步骤

#### 1. 读取索引

读取 `.sdd/knowledge-index.json`。

#### 2. 提取关键词

从需求描述中提取 3-5 个关键词：
- 核心动词（注册、查询、导出、审批...）
- 操作对象（用户、订单、报表...）
- 业务域（用户中心、订单中心...）

**示例：** 需求"用户注册时发送欢迎邮件"
→ 关键词：`用户注册`、`邮件通知`、`用户生命周期`

#### 3. 按关键词匹配

对每个关键词，在索引中匹配每个条目的：
- `title` — 标题包含关键词
- `tags` — 标签包含关键词
- `summary` — 摘要包含关键词

**匹配算法（简单包含即可，无需复杂评分）：**

| 匹配位置 | 优先级 | 得分 |
|---------|--------|------|
| title 精确匹配 | 最高 | 3 |
| tags 包含 | 高 | 2 |
| summary 包含 | 中 | 1 |

**结果排序：**
- 按总分降序
- 同分按 title 字母序

#### 4. 返回匹配结果

返回匹配的知识文档路径列表，格式：
```
匹配的知识文档：
  1. standards/coding-standards.md — 代码规范（tags: code, style）[score: 3]
  2. product/user-center.md — 用户中心能力（tags: user, auth）[score: 2]
  3. standards/email-conventions.md — 邮件通知规范（tags: email）[score: 1]
```

#### 5. 注入探索上下文

调用方（如 sdd-explore）读取匹配的知识文档内容，注入到需求探索的上下文中。

**检索结果处理：**
- 命中且相关（score ≥ 2）→ 读取文档内容，引用到 exploration.md
- 命中但不相关（score = 1）→ 记录但不引用
- 未命中 → 标记"无历史知识参考"

### 质量自检
- [ ] 关键词是否覆盖了需求的核心概念？
- [ ] 匹配结果是否按相关性排序？
- [ ] 无关结果是否被过滤？

### 产出
- 返回匹配的文档路径列表（不写文件，直接返回给调用方）

---

## 设计原则

- 四种能力独立可调用，也可组合
- 能力 A 调用 C，能力 B 调用 C，能力 D 依赖 C 的产出
- 索引双格式：INDEX.md（人读浏览）+ knowledge-index.json（Agent 检索）
- 知识文档含 front-matter（title/tags/related-changes/created-at/updated-at）
- 沉淀时合并已有文档，不覆盖
- 摘要提取自动截断到 150 字符
- 检索使用简单包含匹配，无需向量/语义搜索（v0.1 设计）
