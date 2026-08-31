# Phase 3.4 设计：IDE 斜杠命令集成（/sdd-* 薄入口）

- 状态：Draft v0.1
- 日期：2026-08-29
- 前置：Phase 3.3 IDE 规则（ide-rules.js plan/apply 幂等框架）
- 范围：`openspec ide` 扩展——为三家 IDE 生成 11 个 Skill 斜杠命令

## 1. 目标与边界

**目标**：用户在 Trae / Cursor / Claude Code 中输入 `/sdd-explore CHG-0002` 即可触发对应 Skill，无需记住 CLI 命令。

**硬约束（不可绕过）**：
- 斜杠命令是**薄入口**：命令正文只做「引导 Agent 运行 `openspec workflow run` → 按 Instruction 执行」，治理链路（Change Context / Gate / Transition）一步不少
- 禁止命令正文直接内嵌 SKILL.md 方法论全文（那会造成知识双份漂移）；只引用路径
- 禁止命令正文直接推进 Change 状态

**非目标**：
- 不做 IDE 插件/扩展（仍是纯文件）
- 不覆盖用户自建的命令文件（conflict 保护，与 3.3 规则文件同策略）

## 2. 三家 IDE 命令机制（2026-08 调研）

| IDE | 目录 | 文件格式 | 参数支持 | 标记策略 |
| --- | --- | --- | --- | --- |
| Trae IDE | `.trae/commands/` | Markdown（frontmatter `description` + 正文指令） | 无官方参数语法 → 正文统一写 `$ARGUMENTS` + 「未识别时向用户询问」兜底 | 正文尾部 HTML 注释 |
| Cursor | `.cursor/commands/` | Markdown（frontmatter `description`） | `$ARGUMENTS` | 同上 |
| Claude Code | `.claude/commands/` | Markdown（frontmatter `description` + `argument-hint`） | `$ARGUMENTS`、`$1`、`` !`cmd` `` | 同上 |

## 3. 命令分类（由 skill.yaml 驱动，程序化渲染）

**数据源**：Workspace `skills/*/skill.yaml`（listSkills 优先 Workspace）——`id` / `stage` / `version` / `description` 全部已有，**无需静态模板文件**，新增 Skill 自动多一个命令。

### 3.1 stage 类（8 个，走 workflow run）

skill.stage ∈ {explore, prd, design, task, dev, test, review, converge}（与 workflows/default.yaml stages 一一对应）。

命令语义：`/sdd-explore <CHG-ID>` → 引导执行 `openspec workflow run --change <CHG-ID> --stage explore`。

**dev/test 特例**：正文追加 DU 绑定说明（Phase 2.7 约束：dev/test 必须显式 `--du`，否则 workflow run 报错）。

### 3.2 utility 类（3 个，不走 workflow）

skill.stage ∈ {feature-tree, knowledge, reverse}——这 3 个 Skill 不在 workflow 定义中（无 lifecycle 推进、无 Gate），命令正文引导 Agent 直接按 `skills/<id>/SKILL.md` 执行（需 Change Context 时正文提示提供 Change/Story 上下文）。

## 4. 渲染模板（单命令结构，三家共用正文骨架）

以 sdd-explore（stage 类）为例，渲染后 `.claude/commands/sdd-explore.md`：

```markdown
---
description: SDD explore 阶段——需求探索（OpenSpec Workflow）
argument-hint: <CHG-ID>
---
对 Change `$ARGUMENTS` 执行 OpenSpec SDD **explore** 阶段。

## 执行步骤
1. 运行 `openspec workflow run --change $ARGUMENTS --stage explore` 获取 Instruction。
   - 若 `$ARGUMENTS` 为空或不是 CHG-ID，先向用户询问 Change ID。
   - 若返回 WAITING/报错状态，如实向用户转述，不要自行绕过。
2. 严格按照 Instruction 中的「Prompt 片段」与 `skills/sdd-explore/SKILL.md` 方法论执行。
3. 将产物写入 Instruction 指定的 Artifact 路径（写回 Change 目录）。
4. 运行 `openspec gate run --change $ARGUMENTS --stage explore` 做机器检查；
   通过后提示用户执行 `openspec gate approve ...`（人工评审）。

## 约束
- 不得跳过 Instruction 自行发挥；不得直接修改 Change 生命周期状态。
- 产物只写入 Change 目录，不触碰 standards/ product/ 等其他目录。

<!-- openspec-ide-commands v0.2.0 skill:sdd-explore -->
```

**dev/test 差异段**（程序化注入）：

```markdown
## DU 绑定（必须）
本阶段必须绑定 Delivery Unit：运行 `openspec du list` 确认 DU，
执行时追加 `--du <DU-ID>` 参数；未绑定直接运行会报错。
```

**utility 类正文**：无「执行步骤 1」的 workflow run，改为「阅读 `skills/sdd-reverse/SKILL.md` 并按其方法论执行；产出写回用户指定位置（Knowledge 类写回 knowledge/ 目录）」。

**frontmatter 差异**：
- Trae：只有 `description`（IDE 命令规范）；argument-hint 省略
- Cursor：`description`
- Claude Code：`description` + `argument-hint`

## 5. 实现设计

### 5.1 新文件 core/workspace/ide-commands.js

```
renderCommands(target, workspaceRoot, harnessVersion) → Map<relPath, content>
  - listSkills(workspaceRoot 优先 Workspace，回退 Harness) 取 11 个 skill 元数据
  - 按 §4 模板渲染 11 个命令
planIdeCommands(target, workspaceRoot) → { created[], updated[], upToDate[], conflict[] }
  - 与 3.3 规则同判定：无标记块的用户文件 → conflict
applyIdeCommands(target, workspaceRoot) → 写入（含目录创建）
```

### 5.2 ide-rules.js / ide.js 接线

- `openspec ide <target>`：rules + commands 一起 plan/apply，输出分两段（Rules / Commands 各自 created/updated/up-to-date/conflict 计数）
- doctor `runIdeRulesChecks` 扩展：commands 存在但版本落后 → info；不存在 → 静默

### 5.3 幂等与回滚

- 版本标记：`<!-- openspec-ide-commands <version> skill:<id> -->`，plan 据此判定 updated
- conflict 不覆盖（--force 才覆盖，与 3.3 一致）

## 6. 测试计划（扩展 tests/ide-rules.spec.js）

1. 渲染：11 skill × 3 家 = 33 文件路径与 frontmatter 正确
2. stage 类正文含 `workflow run --stage`；dev/test 含 DU 段
3. utility 类正文不含 workflow run、含 SKILL.md 引用
4. apply 幂等：二次运行 up-to-date
5. 用户文件无标记块 → conflict，--force 覆盖
6. Harness skill 版本升级后 → updated
7. doctor：落后 → info

## 7. 文档

- complete-usage-guide.md §4.1.1：ide 命令输出含 Commands 段；新增「斜杠命令速查」小表（11 命令 × 语义）
- §10.1 命令表 ide 行描述更新

## 8. 交付清单

| # | 项 | 文件 |
| --- | --- | --- |
| 1 | ide-commands.js（渲染/plan/apply） | core/workspace/ide-commands.js |
| 2 | ide-rules 接线 + ide.js 输出 | core/workspace/ide-rules.js、cli .../commands/ide.js |
| 3 | doctor 扩展 | core/sdd/doctor-checks.js |
| 4 | 测试 7 项 | tests/ide-rules.spec.js |
| 5 | 文档 | docs/complete-usage-guide.md |

预计改动量：新增 1 文件，修改 4 文件。
