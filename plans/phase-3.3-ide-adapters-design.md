# Phase 3.3 设计：IDE 适配（IDE Rules 生成）

> Roadmap 归属: Phase 3 Professional Version（docs/00-Roadmap.md §IDE适配）
> 前序: Phase 3.2 Template 系统（已完成，6e1ab4a）
> 状态: Draft v0.1（待评审）
> 日期: 2026-08-29

---

## 1. 背景与目标

Roadmap Phase 3.3 要求为三类 AI IDE 生成项目规则，让 Agent 无需用户口头介绍即可理解 OpenSpec 工作流：

- **Trae** Rules
- **Cursor** Rules
- **Claude Code** Instructions

现状：init 后 Agent 需要用户手动告知「这是一个 OpenSpec 项目、去读 skills/」。IDE 规则文件把这层引导**工程化**：对话开始时 IDE 自动注入 OpenSpec 工作流上下文。

**目标**：`openspec ide <target>` 一条命令生成对应 IDE 的规则文件，内容为「工作流引导」（指向 skills/ 与 CLI），幂等可更新，不破坏用户已有内容。

**Non-goals**：

- 不复制 skills/ 或 standards/ 内容进规则文件（引导文件只指路，避免双份真相漂移）
- 不生成 AGENTS.md（Trae/Cursor 均已兼容既有约定；留待后续按需增加）
- 不做 IDE 侧的 Skill/命令深度集成（如 Cursor commands）——v0.1 只做规则注入
- 不做全局规则（user-level）生成——只做项目级

---

## 2. 目标 IDE 格式调研结论（2026-08 现状）

| IDE | 规则位置 | 格式 | 关键约束 |
| --- | --- | --- | --- |
| Trae | `.trae/rules/*.md` | Markdown + front-matter（alwaysApply/globs/description，与 Cursor 同款） | 支持目录嵌套（至多 3 层）；plain md 无 front-matter 也可读取，但 front-matter 控制生效方式；另兼容读取 CLAUDE.md/AGENTS.md |
| Cursor | `.cursor/rules/*.mdc` | **必须 .mdc 扩展名** + front-matter 三字段（description/globs/alwaysApply） | plain `.md` 会被规则系统忽略；四种激活模式（Always/Auto Attach/Agent Requested/Manual） |
| Claude Code | 项目根 `CLAUDE.md`（+ 可选 `CLAUDE.local.md`） | 纯 Markdown，无 front-matter | 用户可能已有内容——**必须标记块管理**，不能整文件覆盖 |
| Codex CLI | 项目根 `AGENTS.md` | 纯 Markdown，无 front-matter（与 CLAUDE.md 同款） | 用户可能已有内容——**标记块管理**（复用 claude-code 协议）；**无项目级 slash command 机制**（命令侧跳过） |

**激活方式选择**：三个目标统一采用「始终生效」——OpenSpec 工作流引导是项目级基础上下文（类似编码规范），Token 开销可控（< 100 行）。Cursor 用 `alwaysApply: true`，Trae 同款 front-matter，CLAUDE.md 天然全文生效。

---

## 3. 命令设计

```
openspec ide <target> [--force]

target: trae | cursor | claude-code
```

- **运行位置**：必须在 Workspace 内（复用 `resolveWorkspaceRoot`；不在 Workspace 内报错引导先 init）
- `--force`：语义见 §5（claude-code 场景不需要——标记块替换天然安全）
- 无 `--all`：v0.1 保持单目标确定性（需要多个就跑多次；每条命令输出独立报告）

**生成物**：

| target | 生成文件 | 策略 |
| --- | --- | --- |
| `trae` | `.trae/rules/openspec-workflow.md` | 独立新文件；不存在→生成；已存在且含 openspec 标记→版本比对更新；已存在但无标记→报错提示重命名或删除（不覆盖用户文件） |
| `cursor` | `.cursor/rules/openspec-workflow.mdc` | 同上 |
| `claude-code` | `CLAUDE.md` | **标记块注入**：无文件→创建（文件内容即标记块）；有文件→替换 `<!-- openspec:begin -->` 与 `<!-- openspec:end -->` 之间内容；无标记块→追加到文件末尾；块外内容永不动 |

**输出报告**：`created / updated (x.y.z → a.b.c) / up-to-date / skipped`。

---

## 4. 内容设计（单一真相源 + 三渲染器）

### 4.1 模板与占位符

模板放 `templates/ide/`（与 default-workspace 同级，受管文件）：

```
templates/ide/
  trae/openspec-workflow.md          # 含 front-matter
  cursor/openspec-workflow.mdc       # 含 front-matter（内容与 trae 版几乎相同，扩展名差异）
  claude-code/CLAUDE.md              # 纯正文（无 front-matter），由代码包上标记块
```

占位符：`{{HARNESS_VERSION}}`（渲染时注入当前 Harness 版本）。

内容变更通过 Harness 发版生效；workspace 侧的更新检测依赖文件尾部的版本标记：

```
<!-- openspec-ide-rules: v{{HARNESS_VERSION}} -->
```

### 4.2 正文结构（约 60-80 行，轻量引导）

```
# OpenSpec SDD Workflow

本项目是 OpenSpec SDD Workspace（Spec-Driven Development：先文档后代码）。

## 你需要知道的结构
- 四世界：standards/（规则）product/（产品知识）delivery/（交付过程）implementation/（实现代码）
- Skills：skills/sdd-*/SKILL.md —— 每个阶段的方法论与执行步骤
- 配置：.sdd/（workspace/repositories/context-rules/version）

## 启动约定（对话开始时）
1. 用户提出功能开发诉求 → 先读 skills/README.md 选择对应 Skill
2. 找到当前 Change：delivery/changes/<Module>/<Feature>/<Story>/<CHG-ID>/（可用 openspec status 查看）
3. 严格按 SKILL.md 方法论执行，产出写回 Change 目录

## 状态推进（唯一合法方式）
- openspec workflow run --change <CHG-ID> [--stage <stage>] [--du <DU-ID>]
  （dev/test 阶段多仓项目必须绑定 --du）
- 返回状态：WAITING_FOR_ARTIFACT / WAITING_FOR_MACHINE_FIX / WAITING_FOR_HUMAN / ADVANCED / COMPLETED
- Machine Gate：openspec gate verify；人工审批：openspec gate approve（不推进状态）

## 禁止事项
- 禁止直接修改 .sdd/ 下状态字段或手动移动 Change 生命周期
- 禁止跳过 Gate 直接实现（除 dev 阶段绑 DU 执行外）
- 禁止把实现细节写进 standards/（规则世界只放长期约束）

## 常用命令
openspec status / change list / gate verify / gate approve / du show / context / doctor / version

完整方法论见 skills/README.md 与各 SKILL.md。
```

要点：**只放行为引导与入口**，不放方法论细节（skills 是真相源）；所有路径相对 Workspace 根。

---

## 5. 幂等与更新语义（确定性，无交互）

| 情形 | trae / cursor | claude-code |
| --- | --- | --- |
| 目标不存在 | 生成 | 创建（含标记块） |
| 存在 + 无 openspec 标记 | **报错退出**（`文件已存在且非 OpenSpec 生成，请重命名或删除后重试`）——绝不覆盖用户文件 | 末尾追加标记块（块外内容不动） |
| 存在 + 有标记 + 版本一致 | up-to-date，零写入 | 同左 |
| 存在 + 有标记 + 版本落后 | 用当前模板覆盖更新（报告 from→to） | 替换标记块之间内容 |

- 版本标记检测：正则提取 `openspec-ide-rules: v(\d+\.\d+\.\d+)`，用 `compareSemver`（Phase 3.1 已有）比较
- `--force`（trae/cursor）：覆盖**无标记**的同名文件（用户显式授权破坏性操作）；有标记文件无需 force 自动更新

---

## 6. 核心实现

| 模块 | 职责 |
| --- | --- |
| `core/workspace/ide-rules.js`（新增，纯函数） | `TARGETS` 枚举；`renderIdeRules(target, harnessRoot, harnessVersion)` 读模板 + 占位符替换；`planIdeRules(workspaceRoot, target, harnessVersion)` 纯计算（created/updated/up-to-date/conflict + 目标内容）；`applyIdeRules(...)` 执行写入（mkdir -p + 写文件 / CLAUDE.md 标记块替换） |
| `cli/openspec/src/commands/ide.js`（新增） | 参数校验（非法 target 报错含枚举）、调 plan → apply、输出报告 |
| `cli/openspec/src/index.js` | 注册 ide 命令 |

**分层原则**：plan（零写入，返回 diff 计划）与 apply（执行）分离——与 workspace-upgrader 同构，便于测试与 --force 语义实现。

**CLAUDE.md 标记块协议**：

```
<!-- openspec:begin (managed by openspec ide, do not edit inside) -->
...渲染内容...
<!-- openspec:end -->
```

---

## 7. doctor 集成（轻量）

`runIdeRulesChecks`（doctor-checks.js 新增，info 级）：

- Workspace 内检测 `.trae/rules/openspec-workflow.md`、`.cursor/rules/openspec-workflow.mdc`、`CLAUDE.md`（标记块）
- 存在但版本落后 → info：「IDE 规则可更新：openspec ide <target>」
- 不存在 → 不提示（IDE 规则是可选项，不是必需品）

---

## 8. 兼容性与边界

| 场景 | 行为 |
| --- | --- |
| 旧 Workspace（无 IDE 规则） | ide 命令正常生成；doctor 不告警 |
| 用户自定义 .trae/rules/ 其他文件 | 不触碰（只管理 openspec-workflow.md 这一个文件名） |
| 用户自定义 .cursor/rules/ 其他 .mdc | 不触碰 |
| 用户已有 CLAUDE.md | 标记块外内容永不修改 |
| upgrade | 不参与（IDE 规则由 ide 命令显式更新；upgrade 的 findMissingManagedFiles 只扫 `.sdd/`） |
| Trae 用户同时装 CLAUDE.md | 允许（Trae 兼容读取；内容一致无冲突） |

---

## 9. 测试计划

`tests/ide-rules.spec.js`（新增）：

1. renderIdeRules：三 target 内容含 `{{HARNESS_VERSION}}` 已替换；cursor/trae 含 front-matter alwaysApply: true
2. planIdeRules × 情形矩阵：不存在→created；有标记同版本→up-to-date；有标记旧版本→updated(from/to)；无标记同名文件→conflict
3. applyIdeRules：trae/cursor 生成文件落位（含 mkdir 递归）
4. CLAUDE.md：无文件创建；已有文件末尾追加（原文保留）；已有标记块替换（块外保留、旧块清除）；二次运行 up-to-date
5. --force：conflict 场景覆盖成功
6. doctor runIdeRulesChecks：落后→info；最新→无提示；不存在→无提示
7. 非法 target 抛错含枚举

全量回归 ≥ 311 通过。

---

## 10. 文档增量（docs/complete-usage-guide.md）

- §4.1 init 完成后步骤补充：「如用 Trae/Cursor/Claude Code，运行 `openspec ide <target>` 生成规则」
- §10.1 命令表新增 ide 行
- 新增小节「IDE 适配（Phase 3.3）」：三 target 生成物表、更新语义（标记块/版本标记/冲突保护）、doctor 提示说明

---

## 11. 交付清单

- [ ] templates/ide/ 三模板（含占位符与版本标记）
- [ ] core/workspace/ide-rules.js（plan/apply 分离 + CLAUDE.md 标记块协议）
- [ ] cli ide 命令 + 注册
- [ ] doctor runIdeRulesChecks（info 级）
- [ ] tests/ide-rules.spec.js + 全量回归
- [ ] 使用指导更新

---

## 12. 开放问题（评审关注点）

1. **生成文件名**：trae/cursor 用 `openspec-workflow.md/.mdc`（固定名，冲突可检测）——是否认可？
2. **冲突策略**：trae/cursor 同名文件无标记时报错退出（推荐，绝不覆盖用户文件）vs 覆盖（危险）？
3. **CLAUDE.md 追加位置**：文件末尾追加标记块（推荐，常见实践是 CLAUDE.md 末尾放项目细节）vs 文件开头？
4. **无 --all**：v0.1 是否需要一条命令生成全部三个？推荐不需要（输出独立报告更清晰，Agent 可串行调用）。

---

## 13. Codex 适配增量（Phase 3.3.1，2026-09-07）

§1 Non-goals 中「不生成 AGENTS.md」预留的口子，在 Phase 3.3.1 补齐：新增 `codex` 作为第四个 target。

### 13.1 决策

| 决策点 | 选择 | 理由 |
| --- | --- | --- |
| 规则落位 | 项目根 `AGENTS.md` | Codex CLI 约定，与 CLAUDE.md 同款（纯 markdown 无 front-matter） |
| 合并协议 | 复用 claude-code 的 `<!-- openspec:begin/end -->` 标记块 | 块外内容永不修改；引入 `BLOCK_MERGE_TARGETS = new Set(['claude-code', 'codex'])` 消除两处硬编码 |
| 函数命名 | `mergeClaudeMd` → `mergeManagedBlock` | 私有函数零外部影响，避免未来读者误解 |
| 命令侧 | 跳过（不生成 `.codex/commands/`） | Codex CLI 无项目级 slash command 机制；COMMANDS_DIR 不加 codex，`renderCommands` 早返空 Map，doctor `Object.entries(COMMANDS_DIR)` 天然跳过 |
| 模板内容 | 复制 CLAUDE.md + 「常用命令」段加一行说明 | 保持方法论单一真相源，仅说明无 slash command |

### 13.2 影响

- `core/workspace/ide-rules.js`：TARGETS/TARGET_FILES/TEMPLATE_FILES 加 codex；引入 BLOCK_MERGE_TARGETS；mergeClaudeMd → mergeManagedBlock
- `core/workspace/ide-commands.js`：renderCommands 加 `if (!COMMANDS_DIR[target]) return new Map()` 早返
- `cli/openspec/src/commands/ide.js`：description 加 codex；codex 短路输出「无 slash command 概念」；第 91 行三元判断重构为 `COMMANDS_DIR[target]`
- `templates/ide/codex/AGENTS.md`：新建（基于 CLAUDE.md 复制 + codex 特化说明）
- `core/sdd/doctor-checks.js`：零代码改动（Object.entries 天然适配）
- tests：新增 codex 5 场景测试（复用 claude-code 标记块合并）+ codex doctor 落后测试 + renderCommands codex 空 Map 测试

### 13.3 边界

- `--force` 对 codex 无意义（block-merge 天然安全，永远不触发 conflict 路径），用户传 `--force` 无副作用
- 多 target 共存：用户可同时跑 `openspec ide claude-code` 与 `openspec ide codex`，生成 CLAUDE.md 与 AGENTS.md 两个独立文件，无冲突
- 升级时存量 codex 文件迁移：用户手写过 AGENTS.md → 第一次跑走「末尾追加」路径，原文保留；旧版本 openspec 生成的 → 走 updated 分支，块内替换块外保留。无迁移脚本
