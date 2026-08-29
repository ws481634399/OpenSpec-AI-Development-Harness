# Phase 2.2 — sdd-review Skill 设计文档

> 版本: v0.1 (Draft 待评审)
> 日期: 2026-08-28
> 前置: Phase 2.1 Evidence 体系（已实施，183 测试通过）
> 上游规划: `.trae/documents/phase-2-planning.md` §3.2（决策 D3/D5）

---

# 1. 文档目的

定义第 11 个 Skill `sdd-review` 的完整设计：生命周期安放机制、Skill 目录结构、四项检查方法论、与 Evidence 体系的衔接（review-finding 条目 + 闭环机检）、Workflow 引擎扩展、测试计划与验收标准。

实施完成后的 Definition of Done = §9 验收标准。

# 2. 阶段目标

实现 Roadmap 6.4 的四项检查：**需求一致性 / 设计一致性 / 代码质量 / 知识同步**，作为 sdd-converge 前的独立质量检查点。

非目标（本阶段不做）：

- 不改 9 态状态机（Phase 1.5 硬约束 D5）
- 不做 AI 语义评分自动化（Machine Gate 只做确定性校验，四项检查由外部 Agent 执行）
- 不新增 CLI 命令（走现有 skill run / gate check / gate approve / change status 链路）

# 3. 核心设计决策

## 3.1 决策一：生命周期安放 = 同态检查点（from-state: testing → to-state: testing）

**问题**：9 态状态机为严格线性（`created → exploring → specified → designed → tasked → developing → testing → completed → archived`），且 `validateTransition` 禁止 `from === to`。review 必须在 `testing → completed` 之间执行，但不能引入新状态。

**方案**：review 作为 **同态检查点 stage** 插入 workflow：

```yaml
# workflows/default.yaml 新增 stage（插在 sdd-test 与 sdd-converge 之间）
- skill: sdd-review
  gate: review
  from-state: testing
  to-state: testing # 同态检查点：双门禁通过但不推进 Change 状态
  artifact: review-report.md
```

**引擎配套改造**（`core/sdd/workflow-engine.js`）：

现状：每个 stage 通过后调 `requestTransition(changeDir, stage['to-state'])`，而 `requestTransition` 内部 `validateTransition(current, 'testing')` 在 current=testing 时抛 `from === to` 错误 → 死等 WAITING_FOR_HUMAN。

改造：engine 循环中识别同态 stage（`from-state === to-state`），改调 TransitionService 新增的 `requestCheckpoint`（见 3.2），然后 `continue` 进入下一 stage（sdd-converge）。

**硬约束对齐**：

- Change Lifecycle State 推进仍唯一经 `requestTransition`（patchStatus 唯一调用点不变）
- `requestCheckpoint` 只做 **artifact 级验收**（置 artifact status=accepted），不触碰 Change 状态
- Skill Invocation / gate approve 仍不得直接修改任何状态

## 3.2 决策二：TransitionService 新增 `requestCheckpoint`（唯一 artifact 验收入口）

为什么不复用 `requestTransition`：语义混淆（transition 必然推进状态）+ `findStageByToState(workflow, 'testing')` 将命中 sdd-test（第一个 to-state=testing 的 stage），拿到错误 artifact。

```javascript
// core/sdd/transition-service.js 新增（伪码）
/**
 * 同态检查点验收：验证 artifact 存在 + Machine passed(hash 匹配) + Human approved(hash 匹配)
 * → patchArtifactStatus('accepted')。不调 patchStatus，不改 Change 状态。
 * @param {string} changeDir
 * @param {{skill:string, artifact:string, gate:string}} stage engine 显式传入，避免 to-state 反查歧义
 */
export async function requestCheckpoint(changeDir, stage, opts = {}) {
  // 复用 requestTransition 的第 4-8 步（无 validateTransition / 无 patchStatus）
}
```

关键点：

- stage 对象由 engine 显式传入（engine 已持有当前 stage，避免 `findStageByToState` 双 stage 歧义）
- 验收步骤与 requestTransition 完全一致（hash 匹配防 stale）
- 这是 artifact 验收的唯一新入口；`gate approve` 仍只负责 human 状态，`skill run` 仍无状态权限

## 3.3 决策三：防绕过 = converge 前序清单纳入 review-report.md

`gate-validator.js` 的 `checkAllPredecessorsAccepted`（sdd-converge 专用，硬编码列表）新增一项：

```javascript
const predecessors = [
  'exploration.md', 'prd.md', 'design.md', 'tasks.md',
  'implementation.md', 'evidence/test-report.md',
  'review-report.md', // Phase 2.2 新增
];
```

效果：即使绕过 workflow 直接 `openspec change status <CHG> --set completed`，convergence.md 的 Machine Gate（all-predecessors-accepted）也会失败——review-report.md 未 accepted 时 converge 无法推进。

## 3.4 决策四：review-finding 闭环机检（findings-closure）

Phase 2.1 已预留 `review-finding` 条目类型（severity: blocker/major/minor）。本阶段启用并增加闭环约束：

**Schema 扩展**（evidence-model.js）：

```yaml
# review-finding 条目新增可选字段
- id: EV-003
  type: review-finding
  target: prd.md#AC-2            # 必填，问题定位（artifact#anchor 或 文件:symbol）
  severity: major                # 必填，blocker/major/minor
  finding: 注册接口缺少幂等校验     # 必填，问题描述
  resolution: 补充 INSERT ON CONFLICT 幂等处理，见 EV-004 # 可选，闭环时填写（blocker/major 必填）
  recorded-at: 2026-08-28T12:00:00.000Z
```

- `resolution` 为可选字段：validateEntry 不强制（minor 可保持开放，作为技术债记录）
- **闭环规则（确定性）**：`severity ∈ {blocker, major}` 的条目必须有非空 `resolution`

**机检扩展**（gate-validator.js `checkEvidenceCoverage` 新增分支）：

```yaml
# skills/sdd-review/gate.yaml
evidence-coverage:
  findings-closure: true # blocker/major finding 必须有非空 resolution
```

闭环工作流：review 发现问题 → 追加 review-finding 条目 → Agent 修复代码（同 testing 状态内，追加新 code-change/test-run 证据）→ 在原条目填 `resolution`（引用修复证据的 EV id）→ Machine Gate 通过。

# 4. 模块设计

## 4.1 Skill 目录 `skills/sdd-review/`（5 文件，与 sdd-test 同构）

| 文件 | 职责 |
| ---- | ---- |
| `skill.yaml` | 元数据：stage=review / requires-state=testing / produces-state=testing / output-artifacts=[review-report.md] |
| `SKILL.md` | 四项检查方法论 + 执行步骤 + 质量自检 + 工作示例（Agent 可执行） |
| `gate.yaml` | Machine Gate 配置（§4.3） |
| `checklist.md` | 四项检查的逐条 checklist（Agent 自检用） |
| `rules.md` | 行为规则（只读分析不直接改代码 / 发现问题走 evidence 条目 / 严重度判定标准） |

## 4.2 SKILL.md 方法论：四项检查（嵌入，Agent 执行）

| # | 检查 | 输入 | 判定方式 | 产出 |
| ---- | ---- | ---- | ---- | ---- |
| 1 | 需求一致性 | prd.md AC 清单 ↔ evidence/test-report.md ↔ implementation.md | AC 逐条对照：每条 AC 是否有对应 test-run（covers 字段）与实现描述 | 缺口记 review-finding |
| 2 | 设计一致性 | design.md 接口/模块/规则 ↔ code-change 条目（files/symbols/reason） | 设计声明的接口与模块是否在实现证据中出现，reason 是否与设计动机冲突 | 偏差记 review-finding |
| 3 | 代码质量 | standards/*.md 规则 ↔ code-change 条目 + 抽查实际代码 | 对照明确声明的规范条目（命名/错误处理/安全）；无明确规则依据的不记 finding | 违规记 review-finding |
| 4 | 知识同步 | 全部 Artifact ↔ standards/ product/ 现有知识 | 识别 converge 应晋升的候选知识项（新规范/新术语/新能力），**不执行沉淀** | 候选清单写入 review-report §1.4 |

严重度判定标准（写入 rules.md）：

- **blocker**：AC 未满足 / 设计冲突导致功能错误 / 安全违规
- **major**：设计偏差（功能可用但违背声明设计）/ 规范违规且影响可维护性
- **minor**：风格偏差 / 可延后的改进建议

## 4.3 review gate.yaml

```yaml
stage: review
artifact: review-report.md

machine-checks:
  - required-front-matter
  - no-placeholder
  - required-sections
  - cross-reference-valid
  - evidence-coverage # findings-closure: blocker/major 必须闭环

evidence-coverage:
  repos-coverage: false
  test-coverage: false
  findings-closure: true # Phase 2.2 新增开关

required-front-matter: []

required-replacements:
  - change-id
  - test-report-source
  - evidence-index

non-empty-ai-sections:
  - "## 1. 检查结论"
  - "## 2. 发现清单"

human-checks:
  - "## 1. 检查结论"
  - "## 3. 完成确认"
```

## 4.4 Artifact 模板 `templates/artifacts/review-report.md`

```markdown
# Review Report

## 0. 元信息

- Change ID: {{change-id}}
- Test Report 来源: {{test-report-source}}
- Evidence 索引: {{evidence-index}}
- 状态流转: testing（检查点，不推进状态）

## 1. 检查结论

### 1.1 需求一致性
<!-- AC 逐条对照表：AC / test-run 证据 / 结论 -->

### 1.2 设计一致性
<!-- 设计声明 ↔ 实现证据对照 -->

### 1.3 代码质量
<!-- standards 对照结果 -->

### 1.4 知识同步候选
<!-- 供 sdd-converge 参考的候选知识项清单（可为"无"） -->

## 2. 发现清单
<!-- review-finding 条目映射表：EV id / target / severity / resolution 状态 -->

## 3. 完成确认

- [ ] 四项检查全部执行
- [ ] 全部 blocker/major finding 已闭环（evidence.yaml resolution 非空）
- [ ] minor finding 已记录（允许开放）
- [ ] 知识同步候选已写入 §1.4
```

## 4.5 Workflow Engine / TransitionService 改造点汇总

| 文件 | 改动 |
| ---- | ---- |
| `workflows/default.yaml` | 插入 sdd-review 同态 stage（§3.1） |
| `core/sdd/workflow-engine.js` | 同态 stage 分支：调 `requestCheckpoint` 后 `continue`，不调 requestTransition |
| `core/sdd/transition-service.js` | 新增 `requestCheckpoint(changeDir, stage, opts)`（§3.2） |
| `core/sdd/gate-validator.js` | ① predecessors 列表加 review-report.md；② checkEvidenceCoverage 支持 findings-closure 分支 |
| `core/sdd/evidence-model.js` | validateEntry 对 review-finding 增加可选 resolution 字段说明（不强制，文档级）；checkCoverage 支持 findingsClosure flag |

**不改变清单**：

- 9 态状态机与 `validateTransition` 规则不变
- 既有 7 个 stage 的 from/to/gate/artifact 不变
- `requestTransition` 语义与签名不变（仍要求合法状态推进）
- `gate approve` / `skill run` / `change status` CLI 行为不变
- evidence.yaml 既有 schema 向后兼容（resolution 仅新增可选字段）
- Context 装配链（context-assembler / instruction-builder）不改——instruction-builder 按 stage 参数装配，无硬编码 skill 清单

# 5. 端到端流程（Phase 2.2 后）

```
sdd-test 通过 → status=testing
  → openspec workflow run
    → 定位 sdd-review stage（from-state=testing 首个匹配）
    → review-report.md 不存在 → WAITING_FOR_ARTIFACT（产出 sdd-review Instruction）
  → Agent 执行 sdd-review：四项检查 → 追加 review-finding 条目 → 修复 blocker/major → 填 resolution → 写 review-report.md
  → openspec workflow run
    → Machine Gate（含 findings-closure）→ WAITING_FOR_HUMAN
  → openspec gate approve <CHG> --stage review
  → openspec workflow run
    → requestCheckpoint：hash 校验 → review-report.md status=accepted（状态仍 testing）
    → 循环继续 → sdd-converge stage → WAITING_FOR_ARTIFACT
  → sdd-converge 正常执行（前序检查现含 review-report.md）→ testing → completed
```

幂等性：review 已 accepted 后重复 workflow run → machine gate 重跑 → human approved+hash 匹配 → checkpoint 重复标记（幂等）→ 继续 converge。

# 6. CLI 变更

无新命令。既有命令在新流程中的角色：

```bash
openspec skill list            # 自动发现，显示 11 个（目录扫描，无硬编码）
openspec workflow run          # engine 识别同态 stage
openspec gate check <CHG>      # 支持 --stage review（gate 名来自 stage.gate）
openspec gate approve <CHG> --stage review
openspec change status <CHG> --set completed   # 仍受 all-predecessors-accepted 保护
```

# 7. 测试计划

| 文件 | 内容 |
| ---- | ---- |
| `tests/review.spec.js`（新增） | ① skill 注册：listSkills 含 sdd-review（共 11）；② loadGate('sdd-review') 结构正确；③ findings-closure 机检：blocker 无 resolution → failed / 补 resolution → passed / minor 开放 → passed；④ evidence review-finding 追加与 resolution 回填 |
| `tests/workflow.spec.js`（扩展） | 同态检查点集成：testing 状态 run → WAITING_FOR_ARTIFACT(stage=sdd-review) → 写 review-report → machine fix → approve → run → review accepted 且状态仍 testing → 继续 converge WAITING_FOR_ARTIFACT；converge 前序缺失 review-report → machine gate 失败 |
| `tests/skill.spec.js`（修改） | skill 数量断言 10 → 11，清单加 sdd-review |
| 存量回归 | gate/change/integration 全量不回归（converge gate 测试夹具需补 review-report accepted 前置） |

# 8. 文档更新

- `docs/complete-usage-guide.md`：§6 Skill 详解加 sdd-review；§4 流程图在 4.7 与 4.8 之间插入 review 步骤；§7.2 evidence-coverage 说明补 findings-closure；§14 FAQ 补「review 发现 blocker 怎么办」
- `README.md`：Skill 数量描述（如有 10 的表述）
- `skills/sdd-converge/SKILL.md`：前置条件补「review-report.md 已 accepted」

# 9. 验收标准

1. `openspec skill list` 显示 11 个 Skill，含 sdd-review
2. `openspec workflow run` 在 testing 状态先产出 sdd-review Instruction；review 双门禁通过后 review-report.md = accepted 且 Change 状态保持 testing
3. review-report.md 未 accepted 时，converge 的 gate check 必失败（all-predecessors-accepted）
4. 存在 blocker/major finding 且无 resolution 时，sdd-review Machine Gate 必失败
5. 四项检查方法论 + 严重度标准 + 工作示例（复用 user-registration 案例）写入 SKILL.md，Agent 可独立执行
6. 全量测试通过（存量 183 + 新增，10→11 断言更新后无回归）
7. 9 态状态机、TransitionService 推进语义、既有 7 stage 均未改变

# 10. 待用户评审确认点

| # | 决策 | 备选方案 |
| ---- | ---- | ---- |
| Q1 | 同态检查点机制（from=to=testing + requestCheckpoint） | 备选：新增第 10 态 reviewing（违反硬约束 D5，不推荐） |
| Q2 | findings-closure 机检纳入 review gate（blocker/major 必须闭环） | 备选：不强制闭环，findings 仅记录（收敛弱） |
| Q3 | 知识同步检查定位 = 「候选清单输出」供 converge 消费（不沉淀） | 备选：review 直接执行知识沉淀（与 converge 职责重叠） |
