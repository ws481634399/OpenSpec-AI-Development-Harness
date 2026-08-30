# Phase 3.2 设计：Template 系统（项目模板）

> Roadmap 归属: Phase 3 Professional Version（docs/00-Roadmap.md §Template系统）
> 前序: Phase 3.1 Version 管理 + Upgrade 系统（已完成，d53845c）
> 状态: Draft v0.1（待评审）
> 日期: 2026-08-29

---

## 1. 背景与目标

Roadmap Phase 3.2 要求支持项目模板选择：**Spring Cloud / Vue / AI Agent / Empty**。

现状 `openspec init` 只有一套 `templates/default-workspace/` 模板，将 backend/frontend/ai 三大技术栈 standards 全量预置到每个 Workspace——无论项目是什么技术栈。这带来：

- 空项目携带无关标准（Vue 项目收到 Spring Cloud 数据库标准），噪音大
- 无法按技术栈定制初始上下文
- 「项目类型」（greenfield/brownfield）与「技术栈」两个维度混在一起被误解

**目标**：init 时可选项目模板，决定 `standards/` 初始内容按需预置。

**Non-goals（明确不做）**：

- 不做 Artifact 模板定制（`templates/artifacts/` 保持全局共享，与技术栈无关）
- 不做 stack 专项 SKILL.md / prompts 差异（Skills 是方法论，与栈无关）
- 不做已初始化 Workspace 的 stack 迁移（standards 是用户数据，upgrade 永不触碰）
- 不做用户自定义 stack 注册（四选一内置，扩展留待后续）

---

## 2. 现状与 Gap

### 2.1 现状盘点

| 组件 | 现状 | 位置 |
| --- | --- | --- |
| Workspace 模板 | 单一全量模板（standards 含 backend/frontend/ai/通用/SDD 五包） | `templates/default-workspace/` |
| init 交互 | 名称 → type(greenfield/brownfield) → codeExists → 仓库模式 → repos | `cli/openspec/src/lib/prompts.js` askInitConfig |
| init 核心 | resolveDefaultWorkspace → copyTemplate → copyBuiltinSkills → config-writer | `core/workspace/workspace-initializer.js` |
| type 语义 | 项目新旧维度（greenfield/brownfield），记录于 workspace.yaml.type | 与技术栈正交 |

### 2.2 Gap

1. **无技术栈维度**：init 无法表达「这是个 Spring Cloud 项目」
2. **standards 全量预置**：三大栈包不区分场景全部复制
3. **模板选择不可编程**：CLI 无 `--stack` 类参数，Agent/CI 无法非交互指定

---

## 3. 需求映射（Roadmap → 设计）

| Roadmap 需求 | 设计落点 |
| --- | --- |
| 项目模板：Spring Cloud | stack `spring-cloud`：Empty 基座 + `standards/engineering/backend/` 五标准 |
| 项目模板：Vue | stack `vue`：Empty 基座 + `standards/engineering/frontend/` 五标准 |
| 项目模板：AI Agent | stack `ai-agent`：Empty 基座 + `standards/engineering/ai/` 五标准 |
| 项目模板：Empty | stack `empty`（默认）：仅通用工程标准 + SDD 标准，不含技术栈包 |

---

## 4. 模板模型：Base + Stack Overlay

**决策**：单一 base 模板 + 技术栈 overlay 叠加（而非每栈一套完整模板目录）。

理由：

- base 内容（SDD 标准、通用工程标准、.sdd 配置、prompts）四栈完全共享，完整目录方案会有 4 份重复，维护漂移风险高
- overlay 天然增量：栈间无文件冲突（backend/frontend/ai 目录互斥），合并 = 简单复制
- 与 Phase 3.1 upgrade 兼容：overlay 只写 `standards/`（用户数据层），不触碰 `.sdd/` 受管文件

**模板语义重定义**：

| 模板 | 语义 | standards 内容 |
| --- | --- | --- |
| `empty`（默认） | 无技术栈预设 | 通用工程标准（coding/testing/git/api/database/security/architecture + engineering 通用四项）+ SDD 标准 |
| `spring-cloud` | Java 微服务 | empty + backend 包（api-design/database-access/service/architecture/framework） |
| `vue` | 前端项目 | empty + frontend 包（component/router/state-management/coding/performance） |
| `ai-agent` | AI Agent 项目 | empty + ai 包（agent/prompt/knowledge/tool-calling/evaluation） |

**行为变化说明**：default-workspace 模板中的三大栈包**移出** base——新 init 的 empty Workspace 不再携带技术栈包。已有 Workspace 不受任何影响（standards 属用户数据，upgrade/init --force 均保护）。

**context-rules 无需差异化**：现有规则 `standards/` 整目录 outline 条目自动覆盖 overlay 叠加的文件，栈包在 `standards/engineering/<tech>/` 同一树内。v0.1 不引入 per-stack context-rules。

---

## 5. 目录结构（目标态）

```
templates/
  default-workspace/            # base（= Empty 语义，改名成本高，保留原名；代码注释注明）
    standards/
      coding-standard.md
      testing-conventions.md
      git-conventions.md
      security-guidelines.md
      architecture-principles.md
      api-standard.md
      database-standard.md
      engineering/              # 仅通用四项 + README
        README.md
        coding-standard.md
        testing-standard.md
        api-standard.md
        database-standard.md
      sdd/                      # 全套保留
      README.md
      INDEX.md
    ...（.sdd/ product/ delivery/ prompts/ 不变）
  stacks/                       # 新增：技术栈 overlay（只含 standards 增量）
    spring-cloud/
      standards/engineering/backend/{README,framework,architecture,service,api-design,database-access}-standard.md
      standards/README.md       # 栈版 README（说明已启用 backend 包）
    vue/
      standards/engineering/frontend/{README,component,router,state-management,coding,performance}-standard.md
      standards/README.md
    ai-agent/
      standards/engineering/ai/{README,agent,prompt,knowledge,tool-calling,evaluation}-standard.md
      standards/README.md
```

- 现有 `templates/default-workspace/standards/engineering/{backend,frontend,ai}/` 整体**移动**到 `templates/stacks/<stack>/standards/engineering/<tech>/`（内容不变，纯迁移）
- 各 stack 的 `standards/README.md` 为栈版说明（替代 base 的 README.md，标注启用了哪个包）
- INDEX.md 不做栈版（通用索引用 base 版；栈内容自解释）

---

## 6. init 流程变更

### 6.1 交互流（新增第 3 步）

```
1. 项目名称
2. 项目类型        greenfield / brownfield        （不变）
3. [brownfield] 代码已存在                        （不变）
4. 项目模板        Empty（默认）/ Spring Cloud / Vue / AI Agent   ← 新增
5. 仓库模式        single / multi                 （不变）
6. repos 注册      （不变）
```

- 模板选择放「项目类型」之后：先定项目性质，再选栈
- brownfield 场景模板仍有效（standards 用于约束后续开发）
- 默认 Empty：回车即过，不增加简单场景负担

### 6.2 CLI 非交互参数

```
openspec init [path] [--stack empty|spring-cloud|vue|ai-agent] [-f]
```

- `--stack` 指定时跳过模板交互步（其余仍交互）
- 非法值直接报错退出，不回退交互
- Agent/CI 场景：`--stack spring-cloud` 可编程初始化

### 6.3 workspace.yaml 新增字段

```yaml
workspace:
  name: demo
  type: greenfield
  stack: spring-cloud    # 新增；empty 时也记录 'empty'（显式优于隐式）
  created: ...
  harnessVersion: ...
```

- 由 config-writer 统一写入
- 供 doctor 展示、未来能力（如 stack 专项检查）读取
- validator 不强校验该字段（向后兼容旧 workspace.yaml）

---

## 7. 核心实现

### 7.1 模块与职责（纯函数，零 CLI 依赖）

| 模块 | 变更 |
| --- | --- |
| `core/workspace/template-resolver.js` | 新增 `resolveStackOverlay(harnessRoot, stack)`：返回 `templates/stacks/<stack>/` 绝对路径；`empty` 返回 null（无 overlay）；未知 stack 抛错（含合法枚举提示） |
| `core/workspace/copier.js` | 新增 `copyStackOverlay(overlayDir, targetDir)`：按目录树整复制（overlay 结构即目标相对路径），与 base 复制同策略；`--force` 时跳过 standards（受保护目录规则不变） |
| `core/workspace/workspace-initializer.js` | `runInit(config, ...)` 编排：copyTemplate → **copyStackOverlay** → copyBuiltinSkills → config-writer（写入 stack 字段）→ selfCheck |
| `core/workspace/config-writer.js` | `writeWorkspaceYaml` 增加 `stack` 字段写入 |
| `cli/openspec/src/lib/prompts.js` | `askInitConfig` 新增模板选择步；`--stack` 传入时跳过 |
| `cli/openspec/src/commands/init.js` | 注册 `--stack` 选项，透传 config |

### 7.2 合并语义

```
目标 standards/ = base standards/（含空缺位） ∪ overlay standards/
冲突策略：overlay 优先（本次栈包与 base 无文件交集；规则仅为防御未来误配）
```

无文件级 merge（不做行内合并），整文件覆盖——保持确定性，行为可预期。

### 7.3 Force 语义

`openspec init --force` 现有规则：standards/product/delivery/skills/prompts 全保护，仅刷新 `.sdd/` 静态文件。**overlay 复制在 force 下跳过**（standards 受保护），与现有语义一致，无新增特例。

---

## 8. 兼容性与升级边界

| 场景 | 影响 |
| --- | --- |
| 已有 Workspace | 零影响（standards 用户数据；upgrade 不触碰） |
| upgrade | 无感知：`findMissingManagedFiles` 只扫 `.sdd/`，栈包在 standards 不参与 |
| doctor | 无新检查项（v0.1）；workspace.yaml.stack 仅展示性读取（缺省不告警） |
| version.yaml | 无影响（stack 不入三层版本；workspace-template.version 语义不变——仍指 base 模板） |
| 测试 | init 类断言「backend/frontend/ai 包存在」的用例需同步调整（空模板 + 显式选栈） |

**stack standards 的后续更新**：Harness 迭代栈标准内容后，已有 Workspace **不自动升级**（用户数据边界，与 standards 同策略）。future：doctor 提示「stack 标准有更新（info）」——本阶段不做，记录于 Roadmap 待办。

---

## 9. 测试计划

`tests/template-system.spec.js`（新增）：

1. **resolveStackOverlay**：empty → null；四栈路径存在；未知栈抛错
2. **copyStackOverlay**：文件落到目标相对路径；overlay 覆盖 base 同名文件（防御性）
3. **runInit × 4 stacks**：
   - empty：无 engineering/backend|frontend|ai 目录
   - spring-cloud：backend 五标准存在，无 frontend/ai
   - vue：frontend 五标准存在，无 backend/ai
   - ai-agent：ai 五标准存在，无 backend/frontend
4. **workspace.yaml.stack**：四栈写入正确；--stack 与交互等价
5. **--force + stack**：standards 保护，overlay 不落盘
6. **default（无 --stack）交互流**：走 prompts 默认 empty（mock 交互层，或直接测 runInit config）

既有测试同步：

- `tests/init.spec.js` / `tests/integration.spec.js`：补 `stack` 字段断言；调整 standards 完整性断言
- 全量回归 ≥ 300 通过

---

## 10. 文档增量（docs/complete-usage-guide.md）

- §2（init 流程）：新增模板选择步骤说明 + `--stack` 参数
- §10（命令参考）：init 行更新参数表
- 新增小节「项目模板」：四栈语义表、standards 预置内容、与项目类型（greenfield/brownfield）的正交关系说明

---

## 11. 交付清单（§12 验收标准）

- [ ] `templates/stacks/{spring-cloud,vue,ai-agent}/` 三套 overlay 就位；base 移除三大栈包
- [ ] resolveStackOverlay / copyStackOverlay 实现
- [ ] runInit 编排 overlay + config-writer 写 stack 字段
- [ ] init 交互第 4 步（模板选择）+ `--stack` CLI 参数
- [ ] 既有测试更新 + tests/template-system.spec.js 新增
- [ ] 全量回归通过（≥ 300）
- [ ] 使用指导更新（init 流程 + 项目模板小节）

---

## 12. 开放问题（评审关注点）

1. **base 目录名**：保留 `default-workspace`（升级/文档引用零改动，注释注明 Empty 语义）vs 改名 `empty-workspace`（语义直白，需同步 resolver/upgrade/文档引用）。推荐**保留原名**。
2. **stack 字段枚举值**：`empty / spring-cloud / vue / ai-agent`（kebab-case）——与 Roadmap 名称对应，是否认可？
3. **栈版 standards/README.md**：overlay 带 README 覆盖 base 版（说明启用包），还是复用 base README 不覆盖？推荐**覆盖**（init 后文档与实际内容一致）。
4. **--force 下 --stack 非法值**：直接报错（推荐）还是告警继续？推荐报错。
