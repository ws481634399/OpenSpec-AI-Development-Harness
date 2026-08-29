# Phase 2.6 设计：Context 规则（Stage-scoped Context Assembly）

> 状态: Draft v0.1（待用户评审）
> 输入: docs/05-Implementation-Plan.md §6.2 Context 规则
> 基线: Phase 1.4 instruction-builder / Phase 1.5 workflow-engine / Phase 2.3 prompt 体系 / Phase 2.4 多仓交付
> 范围: Context 装配规则模型升级 + Change 级上下文注入 + Instruction 内容化；Git Submodule / DU Contract / Gate / 状态机不动
> 性质: 只写设计，评审通过后编码

---

## 1. 背景

05-Implementation-Plan §6.2 要求：`.sdd/context-rules.yaml` 定义**不同阶段读取哪些知识、哪些代码、哪些文档**。

现状（Phase 1.x 遗留雏形）已有部分实现：

| 组件 | 现状 | 缺口 |
|---|---|---|
| `templates/default-workspace/.sdd/context-rules.yaml` v0.1 | 8 阶段 × 目录级 `read:` 列表 | 无 mode / 分类 / 排除 / 预算 / Change 上下文 |
| `core/sdd/context-assembler.js` | 按阶段读目录 → walkDir → 读全部内容（16KB/文件截断） | 只认目录、无 glob、无预算控制、不知道 Change |
| `core/sdd/instruction-builder.js` §4 | 输出 dirs + files **路径清单** | **content 全部丢弃**，Agent 拿到 Instruction 还得自己再读文件 |
| `core/sdd/workflow-engine.js` prepareSkillInvocation | 只传 workspaceRoot + stage | **不传 changeDir** → CHG 前序 Artifact（requirement/prd/design/tasks）不在 Context |
| `sdd validate`（05 计划 §6.5） | Phase 1 已实现（validate.js + change-validator.js） | 无需再做 |

核心矛盾：**Context 装配是半成品**——规则粗、内容丢弃、最关键的 Change 前序产物缺位。

## 2. 目标（Phase 2.6 完成后）

1. **规则结构化**：条目支持 category / mode / include / exclude / 预算，目录级字符串向后兼容
2. **Context 内容化**：inline 文件正文直接进入 Instruction（Agent 零额外读取即可开工）；outline 仅路径清单
3. **Change 级上下文**：各阶段自动注入本 CHG 前序 Artifact 正文 + STORY 级 tasks.md + DU 协调记录（missing 显式标注）
4. **多仓适配**：implementation/ 默认 outline（结构清单不内联代码），repo 侧内容由 Agent 按 DU metadata 的 repository-delivery.path 按需读取（Reference do not duplicate）
5. **预算可控**：条目级与全局字节数/文件数上限，超限确定性截断并列出 skipped 清单
6. **可观测**：`openspec context <stage>` 预览装配摘要；doctor 校验 rules 合法性

## 3. 设计原则

- **确定性装配**：规则 → 文件集合 → Instruction，全程无 AI 推理（Harness 不执行 AI，原则不变）
- **Instruction 自足**：Agent 拿到 .instruction.md 即可开工，不必回读 Workspace（对齐 Phase 2.5 DU spec 理念）
- **Reference do not duplicate**：repo 侧正文/Workspace 大体积代码不内联，只给路径与结构
- **向后兼容**：v0.1 字符串条目继续可用；InstructionBuilder 结构变化不破坏既有 skill run 链路

## 4. context-rules.yaml v0.2 规则模型

### 4.1 条目结构

```yaml
version: 0.2

stages:
  explore:
    read:
      - path: standards/           # workspace 相对路径（目录或单文件）
        category: knowledge        # knowledge | artifact | code | meta（仅语义分组展示）
        mode: inline               # inline=内联正文 | outline=仅路径清单（默认 inline）
        exclude: ["**/*.png"]      # 可选，glob 相对 path 匹配
        max-bytes: 65536           # 可选，条目级总字节预算
      - path: product/
        mode: inline
    change-artifacts:              # 可选：本 CHG 前序产物（相对 CHG 目录）
      - requirement.md
```

### 4.2 各阶段默认模板（init 生成，用户可改）

| 阶段 | read（v0.2 模板） | change-artifacts |
|---|---|---|
| explore | standards/ inline · product/ inline | （无——requirement 尚未产出） |
| prd | product/ inline · feature-model.yaml inline | requirement.md |
| design | standards/ inline · product/ outline · **implementation/ outline** | requirement.md · prd.md |
| task | standards/ outline · delivery/ outline | requirement.md · prd.md · design.md |
| dev | standards/ outline · **implementation/ outline** | requirement.md · prd.md · design.md · tasks.md（STORY 级，自动）· DU-*/（自动） |
| test | 同 dev | 同 dev |
| review | standards/ outline · implementation/ outline | 同 dev + review 相关产物 |
| converge | product/ inline · standards/ outline | 全部产物 |

关键变化（对照 v0.1 模板）：
- design/dev/test/review/converge 的 `implementation/` 由 inline 语义改为 **outline**（v0.1 行为虽未注入 Instruction，但 assembler 会读全部代码内容，属无谓开销）
- prd 阶段去掉 `delivery/`（历史 Changes 全文无必要，outline 交付索引即可）

### 4.3 Change Artifacts 自动注入（确定性，不需要用户配置）

`change-artifacts` 中除显式条目外，Assembler 依阶段自动补充：

| 阶段 | 自动注入 |
|---|---|
| task / dev / test / review / converge | STORY 级 tasks.md：`<L1>/<L2>/<L3>/<STORY>/tasks.md`（由 metadata.feature-path 解析；未绑定则 missing 标注） |
| dev / test / review / converge | STORY 目录下 `DU-*/metadata.yaml`（inline，Agent 由此获知 scope/acceptance/guidance/repository-delivery.path）；repo 侧正文不注入 |

- 显式条目不存在 → `context.missingArtifacts` 标注（不是错误：explore 阶段 requirement 本就不存在）
- 自动注入的文件不存在（如 DU 未创建）→ 同样进 missingArtifacts，Instruction 中说明原因

### 4.4 预算控制

```yaml
version: 0.2
limits:                        # 可选全局预算
  total-max-bytes: 262144      # 默认 256KB
  total-max-files: 200
```

- 超限时按声明顺序截断（先 read 条目内截断，再跨条目），被跳过文件进入 `context.skipped`
- 单文件仍沿用 MAX_FILE_BYTES = 16KB 截断
- 截断是**确定性**的：同一 rules + 同一 Workspace 状态 → 同一 Context

## 5. ContextAssembler v2（core/sdd/context-assembler.js）

```js
// 签名升级（向后兼容：changeDir 可省略，行为退化为 v1）
export async function assembleContext(workspaceRoot, stage, opts = {})
// opts: { changeDir?: string, metadata?: object, harnessRoot?: string }
// 返回:
{
  stage,
  dirs,               // 兼容保留：字符串目录列表
  files: [            // 兼容保留：{ path, content }；outline 条目 content='' 且带 mode 标记
    { path, content, category, mode, source: 'rule' | 'change-artifact' | 'auto' }
  ],
  missingArtifacts: ['prd.md (not found)'],
  skipped: ['implementation/backend/src/big.js (over budget)'],
  budget: { usedBytes, usedFiles, limitBytes, limitFiles },
}
```

实现要点：
1. rules 解析：字符串条目 → `{ path, mode: 'inline' }`（v0.1 兼容）；`version` 缺省视为 0.1（仅禁用 limits 段告警）
2. glob 匹配：自实现 `**`/`*`/`?` 极简匹配（不引依赖，与 doctor-checks 现有做法一致）
3. Change Artifacts：`opts.changeDir` 存在时注入；STORY tasks.md / DU 注入按 §4.3 自动规则
4. inline 读正文（16KB 截断）；outline 仅收集 path
5. 预算：按 §4.4 顺序消费，超限入 skipped
6. 纯函数层保持：IO 仅 node:fs/promises，无 CLI 依赖

## 6. InstructionBuilder v2（core/sdd/instruction-builder.js）

§4「Workspace Context」拆为三个 section（纯函数，签名不变）：

```markdown
## Change Artifacts

本 Change（CHG-XXXX）已有产物（内容如下，作为本次任务的核心输入）：

### delivery/changes/CHG-0001/prd.md
（正文）

### delivery/changes/CHG-0001/FEAT-001/.../STORY-001/tasks.md
（正文）

缺失产物：design.md（尚未产出——若与你的任务相关，请先确认前置阶段已完成）

## Workspace Context（内联文件）

### standards/coding.md
（正文）

## Workspace Context（文件清单）

阶段 `design` 的 outline 级上下文（仅路径，按需读取）：
- implementation/backend/...
- ...
```

- `source: change-artifact` 的文件进「Change Artifacts」；其余按 mode 分流到两个 Context section
- missingArtifacts / skipped 清单显式列出（Agent 不再猜测文件是否存在）
- 其余 section（Prompt 片段 / 用户输入 / Artifact 产出 / 执行指引 / SKILL.md）不动

## 7. Workflow Engine 集成（core/sdd/workflow-engine.js）

prepareSkillInvocation（§180）变更：

```js
const context = await assembleContext(workspaceRoot, stageName, {
  changeDir,          // ← 新增：CHG 目录（Change Artifacts 注入 + feature-path 解析）
  metadata: meta,     // ← 新增：避免重复读 metadata
  harnessRoot,
});
```

不改生命周期/状态推进逻辑；instruction 写回 `.instruction.md` 行为不变。

## 8. CLI：`openspec context <stage>`（调试预览）

```bash
openspec context design --change CHG-0001
```

输出装配摘要（不写文件）：各条目文件数/字节数、missing、skipped、预算占用。低成本排障入口，避免「为什么 Instruction 里没有 XX」类问题。

## 9. Doctor 校验（core/sdd/doctor-checks.js）

新增确定性检查（挂入现有 workspace 检查组）：

- context-rules.yaml 存在且可解析（已有）
- `stages` 覆盖 8 个阶段（explore/prd/design/task/dev/test/review/converge）
- 每条目 path 字段存在、mode ∈ {inline, outline}、category ∈ 枚举、max-bytes/max-files 为正整数
- rules path 指向的目录/文件在 Workspace 中不存在 → warning（不是 error：允许模板先行）
- change-artifacts 条目格式（字符串或 { path }）

## 10. 兼容性

| 场景 | 行为 |
|---|---|
| 旧 Workspace（v0.1 rules）+ 新 Harness | 字符串条目解析为 inline；无 changeDir 注入（直接 `openspec skill run` 之外的手动调用时退化为 v1 行为）；limits 缺省 256KB/200 files |
| `openspec skill sync` | 不动 context-rules.yaml（workspace 文件非 Harness 分发物，仅 init 生成） |
| Instruction 消费方 | 新增 section 为增量，Agent 对多余 section 无感知风险 |

v0.1 → v0.2 rules 迁移：不写自动迁移脚本（文件是用户可编辑配置）；init 新装 v0.2 模板；doctor 对旧格式报 warning 提示升级。

## 11. 测试计划（tests/）

1. `context-assembler.spec.js`（扩充或新增）：
   - v0.1 字符串规则兼容（含 content 读取）
   - v0.2 mode=outline 不读正文、category 分组、exclude glob 生效
   - change-artifacts：存在注入正文 / missing 标注
   - 自动注入：feature-path 已绑定 → STORY tasks.md；DU-*/metadata.yaml 收集；未绑定 → missing
   - 预算：max-bytes 条目截断 + limits 全局 skipped
2. `instruction-builder.spec.js`（扩充）：Change Artifacts section / 内联正文 / 清单 section / missing 与 skipped 展示
3. `workflow-engine.spec.js`（扩充）：prepareSkillInvocation 传 changeDir 后 .instruction.md 含 prd 正文
4. `doctor-context-rules.spec.js`（新增）：stage 覆盖 / 非法枚举 / path 缺失 warning

## 12. 实施清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | core/sdd/context-assembler.js | v2 重写（条目模型 / change-artifacts / 预算 / 兼容） |
| 2 | core/sdd/instruction-builder.js | §4 拆分为 Change Artifacts + 内联 + 清单三 section |
| 3 | core/sdd/workflow-engine.js | prepareSkillInvocation 传 changeDir/metadata |
| 4 | templates/default-workspace/.sdd/context-rules.yaml | v0.2 模板（§4.2 矩阵） |
| 5 | cli/openspec/src/commands/context.js + index | 新增 context 预览命令 |
| 6 | core/sdd/doctor-checks.js | context-rules v0.2 校验 |
| 7 | tests/* | §11 用例 |
| 8 | docs/complete-usage-guide.md | Context 规则章节增量同步 |

## 13. 非目标（v0.3 候选）

- per-repo 上下文规则段（`stages[stage].repos.<repoId>`）——当前 Agent 可从 DU metadata 定位 repo 内容，暂不引入两级规则
- Token 精确计量（按 tokenizer 计算）——字节预算已够用
- Context 缓存/增量装配——装配是本地文件读取，性能足够
- 语义检索（向量库）——偏离 Harness 确定性原则
