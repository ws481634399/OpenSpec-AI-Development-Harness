# Phase 3.1 设计：Version 管理 + Upgrade 系统

> Status: Draft v0.1
> 前置: Phase 2.7 已完成（287 tests passing）
> Roadmap 归属: Phase 3 Professional Version（docs/00-Roadmap.md §9）——Version 管理 + Upgrade 系统
> 后续: Phase 3.2 Template 系统 / Phase 3.3 IDE 适配

---

## 1. 背景

Harness 已进入长期演进阶段（Phase 1.0 → 2.7 共 12 个子阶段），Workspace 的配置结构、Skill 内容、模板文件持续变化。但当前缺乏系统的版本管理与升级机制：

- `openspec skill sync` 直接 `cp` 覆盖（[skill-registry.js](../core/sdd/skill-registry.js#L90-L137)），无版本对比——用户不知道同步会更新什么、也无法判断 Workspace 与 Harness 的 Skill 是否有差异；
- Workspace 记录了三层版本（[version.yaml](../templates/default-workspace/.sdd/version.yaml)：harness / workspace-template / schema），但没有任何命令读取展示，也没有 doctor 检查；
- Schema 已实际演进（context-rules v0.1 → v0.2 → v0.3；DU metadata v0.1 → v0.2），老 Workspace 靠读取端兼容（assembler 判断 version 字段），没有主动迁移路径；
- 用户升级 Harness 后，旧 Workspace 处于"半兼容"状态：新 Skill 可 sync，但模板新增文件、schema 结构变化、版本记录全部漂移，只能重建 Workspace。

Phase 3.1 补齐 Roadmap Phase 3 的前两项能力，让旧 Workspace 可以确定性地升级到新 Harness 版本。

## 2. 目标

1. **版本全景可见**：`openspec version` 一条命令展示 Harness / Workspace 三层版本 / Skill 版本差异（Workspace vs Harness）。
2. **skill sync 版本感知**：同步前对比版本，输出 updated / unchanged / added 结构化明细；支持 `--dry-run` 预览。
3. **确定性升级**：`openspec upgrade` 将旧 Workspace 升级到当前 Harness 版本——同步 skills/prompts、补齐模板新增文件、执行 schema 迁移、更新版本记录；`--dry-run` 预览 + 升级报告。
4. **版本健康检查**：doctor 新增版本检查项（version.yaml 存在性/格式、harness 版本兼容性、schema 版本落后提示）。
5. **schema 迁移框架**：`MIGRATIONS` 有序迁移表（from → to 确定性函数），以 context-rules v0.1/v0.2 → v0.3 作为首个真实迁移用例验证框架。

## 3. 非目标

- 不做 Template 系统（Phase 3.2）与 IDE 适配（Phase 3.3）。
- 不做自动/无人值守升级——`openspec upgrade` 永远是显式用户行为，且默认要求预览（首次运行提示先 `--dry-run`）。
- 不做回滚机制——回滚依赖 Git（升级前提示确认工作区干净，或至少让用户自行 commit；升级报告列出全部改动文件路径，`git checkout -- <files>` 即可回滚）。
- 不实现 Agent Runtime / 模型调用（Roadmap 明确不建议）。
- 不迁移 `standards/`、`product/`、`delivery/`、`implementation/` 用户数据（见 §5 受管分级）。

## 4. 版本模型

### 4.1 五类版本与权威来源

| 版本 | 权威来源 | 语义 | 变化时机 |
| --- | --- | --- | --- |
| Harness Version | Harness 根 `.version` | Harness 自身发布版本 | 每次功能/修复发布 |
| workspace-template.version | `.sdd/version.yaml` | Workspace 初始化所用模板快照版本 | init 时固化，仅 upgrade 补齐结构后更新 |
| schema.version | `.sdd/version.yaml` | `.sdd/` YAML 结构版本 | 配置文件结构变化（新增字段/格式变更）时 +0.1 |
| skill version | `skills/<id>/skill.yaml` `version` | 单个 Skill 内容版本 | Skill 方法论/规则变化时 |
| template file | 模板目录内文件 | 受管文件内容 | 随 Harness 发布 |

### 4.2 兼容性规则（确定性）

- `schema.version` 只增不减；读取端必须兼容所有历史 schema（现状已满足：context-assembler 兼容 v0.1/v0.2/v0.3）。
- upgrade 只允许「逐版本顺序迁移」：`0.1.0 → 0.2.0 → 0.3.0`，不允许跳版本（每步迁移函数只理解相邻差异）。
- Workspace `schema.version` **高于** Harness 支持的最高 schema → doctor warning（Workspace 比 Harness 新，可能由更新版本的 Harness 创建）。
- Workspace `harness.version` major 与当前 Harness major 不同 → doctor error（跨 major 需人工评估）。

### 4.3 版本号基准

- Harness `.version` 当前 `0.1.0`。Phase 3.1 发布时提升为 `0.2.0`（Phase 2 系列 + 本阶段为 minor 功能集）。
- `schema.version` 保持 `0.1.0`（Phase 3.1 不改 .sdd 配置结构；首个迁移目标是把旧 Workspace 的 context-rules 从 0.1/0.2 升到 0.3，这属于**内容迁移**而非 schema 结构变化，见 §6.3）。

## 5. 受管文件分级（upgrade 的核心边界）

| 分级 | 范围 | upgrade 策略 |
| --- | --- | --- |
| **Harness 拥有**（全量覆盖） | `skills/`、`prompts/` | 与 `skill sync` 同策略：复制覆盖（用户自定义 Prompt 用新文件名，已在 Phase 2.3 约定） |
| **模板生成、用户可改**（结构迁移） | `.sdd/*.yaml`（workspace.yaml / repositories.yaml / context-rules.yaml / version.yaml） | 不覆盖内容；仅 1) schema 迁移函数改写结构 2) 模板新增字段缺失时补默认值（Document API 保留注释） |
| **模板新增**（缺失补齐） | 模板中存在而 Workspace 缺失的受管新文件（如未来新增 `.sdd/xxx.yaml`） | 复制；已存在的不动 |
| **用户数据**（绝不触碰） | `standards/`、`product/`、`delivery/`、`implementation/` | 完全跳过 |

> 判定规则：upgrade 只操作 `.sdd/`、`skills/`、`prompts/` 三个目录，其余目录一律不进入。

## 6. 功能设计

### 6.1 `openspec version` 命令

```
openspec version [--json]
```

输出（Workspace 内）：

```
Harness:            0.2.0
Workspace:
  harness.version:  0.1.0        ← 落后，可 upgrade
  workspace-template: 0.1.0
  schema:           0.1.0
Skills (11): 3 outdated, 8 up-to-date, 0 local-only
  updated:  sdd-task 0.1.0 → 0.2.0
  updated:  sdd-dev  0.1.0 → 0.2.0
  updated:  sdd-review 0.1.0 → 0.2.0
```

- 不在 Workspace 内：仅显示 Harness 版本 + Skill 列表版本。
- `--json`：结构化输出（供 Agent/脚本），字段：`harness`、`workspace`（三版本）、`skills: [{id, workspaceVersion, harnessVersion, status}]`。

### 6.2 skill sync 版本感知

改造 [syncSkills / syncPrompts](../core/sdd/skill-registry.js#L90-L137)：

1. 同步前对比 Workspace 与 Harness 的 skill.yaml `version` 字段（逐 Skill 读取，缺文件视为 `added`）。
2. 返回结构升级：

```js
{
  synced: number,
  details: [
    'sdd-task: updated 0.1.0 → 0.2.0',
    'sdd-explore: unchanged (0.1.0)',
    'sdd-xxx: added 0.2.0',
  ],
  changed: ['sdd-task', 'sdd-xxx'],   // 有实际变化的 skill id
}
```

3. `openspec skill sync --dry-run`：只做对比，不复制，输出将要发生的变化。
4. prompts/ 对比基线：prompts 文件无版本字段，以「文件存在性 + 字节数」做 added/updated 粗判（不引入 per-file hash 存储，保持零依赖纯 fs）。

### 6.3 schema 迁移框架

新文件 `core/workspace/schema-migrations.js`：

```js
// 迁移表：按序执行，from/to 为 schema.version 或内容结构版本
export const MIGRATIONS = [
  {
    id: 'context-rules-v0.3',
    description: 'context-rules.yaml version → 0.3（结构化条目基线）',
    // guard: 返回 true 表示需要执行
    guard: async (ws) => { const v = await readContextRulesVersion(ws); return v === undefined || v < 0.3; },
    // migrate: 确定性改写（Document API 保留注释）
    migrate: async (ws) => { /* version 字段 → 0.3；v0.1 字符串条目转结构化 { path, mode: inline } */ },
  },
];
```

- 执行器 `runMigrations(workspaceRoot, { dryRun })`：顺序跑 `guard → migrate`，返回 `{ executed: [{id}], skipped: [{id, reason}], dryRun }`。
- 迁移是幂等的：guard 不满足则跳过，重复运行无副作用。
- 迁移不改 `.sdd/version.yaml` 的 schema.version（本阶段无 schema 结构变化）；context-rules 的 `version` 字段由迁移函数自身负责。

**首个迁移用例的选择理由**：context-rules v0.1（纯字符串条目）→ v0.3 是真实存在的存量差异——Phase 2.6 之前 init 的 Workspace 均为 v0.1，读取端兼容但用户无法获知；迁移后获得结构化条目与 per-repo 能力。v0.2 → v0.3 无结构差异（v0.2 已结构化），仅 version 字段推进。

### 6.4 `openspec upgrade` 命令

```
openspec upgrade [--dry-run]
```

执行序列（确定性，无交互）：

```
1. 前置检查
   - 在 Workspace 内（有 .sdd/version.yaml）
   - 工作区 git status 是否干净（仅提示，不阻断——用户数据目录可能有未提交内容）
2. 计算差异
   - version.yaml 三版本 vs Harness 当前
   - skills/prompts 版本对比（复用 6.2）
   - 模板新增文件扫描（模板有、Workspace 无，限受管目录）
   - 迁移 guard 扫描（复用 6.3）
3. 无任何差异 → "Workspace 已是最新" 直接退出
4. 执行（--dry-run 则只打印计划）
   a. syncSkills + syncPrompts（全量覆盖策略）
   b. 补齐模板新增文件（受管目录内）
   c. runMigrations（.sdd 结构/内容迁移）
   d. patchVersionYaml 风格更新 version.yaml：
      - harness.version → 当前 Harness 版本
      - workspace-template.version → 当前 Harness 模板版本（模板快照对齐）
      - schema.version 不变（本阶段无结构变化）
5. 输出升级报告
   - updated skills / prompts
   - added files（路径列表）
   - migrated（迁移 id 列表）
   - version transitions（旧 → 新）
   - skipped 及原因
```

CLI 层仅编排，全部逻辑在 `core/workspace/workspace-upgrader.js`（纯函数，可测）。

### 6.5 doctor 版本检查

[doctor-checks.js](../core/sdd/doctor-checks.js) 新增 `runVersionChecks(workspaceRoot)`（CLI 编排层接入，与 runContextRulesChecks 同模式）：

1. `.sdd/version.yaml` 存在且三字段齐备（缺失 → error）。
2. `harness.version` 与当前 Harness：patch/minor 落后 → info 提示可 upgrade；major 不同 → error。
3. `schema.version` 高于 Harness 支持版本 → warning（Workspace 新于 Harness）。
4. version.yaml 与 workspace.yaml 中 harness.version 不一致 → warning（两个记录点应对齐）。

## 7. 模块设计

```
core/workspace/
  version.js               # 已有：readHarnessVersion（不动）
  schema-migrations.js     # 新增：MIGRATIONS + runMigrations + guard/migrate
  workspace-upgrader.js    # 新增：planUpgrade（差异计算）+ applyUpgrade（执行）
  config-writer.js         # 已有：patchVersionYaml（复用/扩展支持多字段）
core/sdd/
  skill-registry.js        # 改造：syncSkills/syncPrompts 版本对比 + --dry-run
  doctor-checks.js         # 新增：runVersionChecks
cli/openspec/src/commands/
  version.js               # 新增：openspec version [--json]
  upgrade.js               # 新增：openspec upgrade [--dry-run]
  skill.js                 # 改造：sync --dry-run
  doctor.js                # 接入 runVersionChecks
cli/openspec/src/index.js  # 注册 version/upgrade
templates/default-workspace/.sdd/version.yaml  # 注释补充 upgrade 语义说明（内容不动）
```

依赖方向：`workspace-upgrader` → `schema-migrations` + `skill-registry` + `config-writer` + `version.js`；CLI → `workspace-upgrader`。core 层零 CLI/@clack 依赖（延续既有分层）。

## 8. CLI 交互细节

- `upgrade` 无交互（确定性优先）；危险前置（工作区不干净）以 warning 提示后继续。
- `--dry-run` 输出与真实执行同构的「计划报告」，仅多一行 `[dry-run] 未写入任何文件`。
- 报告复用 @clack `note()` 分组展示；`--json` 同时供 version/upgrade（upgrade --json 输出报告对象）。
- 中文输出延续现有 logger（ok/warn/error）风格。

## 9. 测试计划（tests/）

新增 `tests/version-upgrade.spec.js`：

1. `readHarnessVersion` 返回 .version 首行版本（已有文件真实读取）。
2. `syncSkills` 版本对比：构造 Workspace 旧版本 skill / 同版本 skill / 多余 skill → details 断言 updated/unchanged/local-only；`dryRun: true` 不产生文件变化。
3. `syncPrompts` 对比：新增 prompt 文件识别为 added/updated。
4. `runMigrations`：v0.1 context-rules（字符串条目）→ 迁移后 version: 0.3 + 条目结构化 + 注释保留（Document API 断言）；guard 幂等（二次运行 skipped）。
5. `planUpgrade`：旧 Workspace fixture → 计划包含 skill 更新 / version transition / 迁移项。
6. `applyUpgrade`：执行后 version.yaml harness.version 对齐、skills 更新、迁移生效；`--dry-run` 后文件系统零变化（字节级断言：快照对比）。
7. `runVersionChecks`：缺 version.yaml → error；harness major 不同 → error；落后 minor → info；schema 超前 → warning。
8. CLI 冒烟：`version --json` / `upgrade --dry-run` 退出码 0。

回归：现有 287 tests 全量通过（syncSkills/syncPrompts 返回结构向后兼容——details 仍为 string[]，新增 changed 字段）。

## 10. 实施清单

| # | 项 | 文件 |
| --- | --- | --- |
| 1 | Harness `.version` → 0.2.0 + package.json version | `.version` / `package.json` |
| 2 | skill sync 版本对比 + dry-run | `core/sdd/skill-registry.js`、`cli/.../skill.js` |
| 3 | schema 迁移框架 + context-rules v0.3 迁移 | `core/workspace/schema-migrations.js` |
| 4 | upgrader（plan/apply） | `core/workspace/workspace-upgrader.js` |
| 5 | version 命令 | `cli/.../commands/version.js` + index 注册 |
| 6 | upgrade 命令 | `cli/.../commands/upgrade.js` + index 注册 |
| 7 | doctor 版本检查 | `core/sdd/doctor-checks.js`、`cli/.../doctor.js` |
| 8 | version.yaml 模板注释更新 | `templates/default-workspace/.sdd/version.yaml` |
| 9 | 测试 | `tests/version-upgrade.spec.js` |
| 10 | 使用指导 §新增 Version/Upgrade 章节 | `docs/complete-usage-guide.md` |

## 11. 验收标准

1. 旧 Workspace（context-rules v0.1、skills 0.1.0、version.yaml 0.1.0）执行 `openspec upgrade --dry-run` 输出完整计划且文件零变化。
2. 执行 `openspec upgrade` 后：skills 与 Harness 一致、context-rules version: 0.3 且注释保留、version.yaml harness.version = 0.2.0、报告列出全部变更。
3. 重复执行 `openspec upgrade` → "Workspace 已是最新"，零文件写入（幂等）。
4. `openspec version` / `--json` 输出 Harness/Workspace/Skill 版本全景与差异。
5. `openspec doctor` 报告版本健康状态（含 major 不匹配 error 场景）。
6. 全量测试通过（含 287 项回归）。

## 12. 待确认议题

1. **prompts 对比基线**：字节数粗判 vs 引入 prompts/manifest（每文件 sha256 清单）。推荐字节数（零存储、够用）；manifest 更精确但增加状态维护。
2. **workspace-template.version 在 upgrade 中的语义**：本方案选择「upgrade 后对齐当前模板版本」（语义 = 当前结构基线）；备选是保持 init 快照不变（语义 = 历史事实）。推荐前者，因为它与「补齐结构后」的事实一致。
3. **是否将 `.version` 提升为 0.2.0**：推荐是（Phase 2 全量 + Phase 3.1 构成 minor 集合）。
