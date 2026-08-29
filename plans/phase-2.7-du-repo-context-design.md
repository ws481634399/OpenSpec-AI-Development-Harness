# Phase 2.7 设计：DU 绑定执行 + Repo 侧上下文装配

> Status: Draft v0.1
> 前置: Phase 2.4（多仓交付）/ Phase 2.5（DU 实现指导）/ Phase 2.6（Context 规则 v0.2）
> 来源: docs/新增.md 二十三/二十四（Dev/Test 绑定 DU）+ phase-2.6 §13 v0.3 候选（per-repo 上下文规则）

---

## 1. 背景

Phase 2.6 完成后，Workspace 级 Context 已内容化（Change Artifacts / 内联知识 / outline 清单）。但多仓 dev/test 场景存在缺口：

1. **Workflow Engine 不感知 DU**：`prepareSkillInvocation` 只装配 workspace 级 context，`implementation.md` 等待产出时，Agent 拿不到 repo 侧 DU 上下文（task.md 9 节 / DU metadata / repo 规则），需手动按 `repository-delivery.path` 导航——与新增.md 二十三「Dev Invocation 必须显式绑定 DU」不符。
2. **context-rules 无 repo 维度**：`implementation/` 在 dev 阶段仅 outline（结构清单），无法声明「backend 仓读这些、frontend 仓读那些」；per-repo 差异化上下文靠 Agent 自觉。
3. **sdd-dev SKILL.md 已要求读 repo task.md §7/§8/§9**（消费 DU Guidance），但 Harness 不自动装配——Skill 规范与工具能力脱节，违反「规则是确定性的」原则。

## 2. 目标

1. `openspec workflow run --du <DU-ID>`：dev/test 阶段显式绑定 Delivery Unit。
2. 绑定后 Instruction 自动注入 repo 侧上下文：repo task.md（inline）、repo DU metadata（inline）、`implementation.md` 待写说明；Agent 零导航开工。
3. context-rules 升级 v0.3：`stages[stage].repos.<repoId>.read` 规则段，绑定 DU 时按 `DU.repository` 激活对应仓规则段。
4. Instruction 新增「DU 绑定」信息（DU ID / repository / repo 侧路径 / guidance 要求）与「Repository Delivery Context」section。
5. `openspec context` 预览命令与 doctor 校验同步支持 v0.3。

## 3. 非目标

- ❌ 不改 Gate 评估对象：dev gate 仍评 Workspace 级 `implementation.md`，不按 DU 评估（DU 轻量状态不经 Transition Service，Phase 2.4 既定）
- ❌ 不支持一次绑定多个 DU（批量执行留后续；新增.md 二十三「如未来支持批量 DU 必须显式声明」）
- ❌ 不引入 token 精确计量 / Context 缓存 / 语义检索（phase-2.6 §13 明确排除）
- ❌ 不做 repo 侧独立 Workflow（Workspace Workflow 仍是唯一编排器）

## 4. 规则模型（context-rules v0.3）

v0.2 基础上增加可选 `repos` 段；`version: 0.3`；v0.2/v0.1 文件继续合法（repos 段缺省 = 无 per-repo 规则）。

```yaml
version: 0.3

limits:
  total-max-bytes: 262144
  total-max-files: 200

stages:
  dev:
    read:                        # workspace 级（不绑定 DU 也生效）
      - path: standards/
        mode: outline
    change-artifacts:
      - prd.md
      - design.md
    repos:                       # Phase 2.7：per-repo 规则段（仅绑定 DU 且 DU.repository === repoId 时激活）
      backend:
        read:
          - path: implementation/backend/src/
            mode: outline
            include: ["**/*.java"]
          - path: implementation/backend/standards/
            mode: inline
      frontend:
        read:
          - path: implementation/frontend/src/
            mode: outline
```

规则：
- `repos.<repoId>` 的条目格式与 `read` 完全一致（path/category/mode/include/exclude/max-*），复用同一装配管道
- **激活条件**：`opts.du` 存在且 `du.repository === repoId`；只激活一个仓的段（DU 1:1 Repository 硬约束）
- repoId 不在 repositories.yaml → 装配时忽略 + doctor 报 issue
- 全局 `limits` 对 repo 段条目同样生效（统一预算）

## 5. DU 绑定注入（确定性自动装配）

绑定 DU 时（`opts.du = { id, repository }`），assembleContext 在 Change Artifacts 之后执行：

| 注入项 | 来源 | 模式 | 缺失行为 |
|---|---|---|---|
| repo DU metadata.yaml | `<repo-delivery-path>/metadata.yaml` | inline | missing（提示先 `du materialize`） |
| repo task.md | `<repo-delivery-path>/task.md` | inline | missing |
| repo implementation.md | `<repo-delivery-path>/implementation.md` | outline（Agent 将写入它） | 不标 missing（初始为空模板属正常） |
| repo evidence/ | `<repo-delivery-path>/evidence/` | outline | 不标 missing（dev 前期常为空） |

- `repo-delivery-path` 解析优先级：Workspace DU metadata 的 `repository-delivery.path`（materialize 回填）→ 缺省时按 `<repo.path>/delivery/<CHG>/<L1>/<L2>/<L3>/<STORY>/<DU-ID>` 推导（materialize 的物化规则）
- 注入文件 `source: 'repo'`，path 为 workspace 相对 POSIX 路径
- DU 未物化（repo 目录不存在）：metadata/task.md 标 missing，reason 为 `not materialized (run: openspec du materialize <CHG> <DU-ID>)`
- **DU 存在性校验**：`opts.du.id` 不在 `readWorkspaceDus` 结果中 → assembleContext 抛错（调用方提示合法 DU 清单）

## 6. ContextAssembler 变更

```js
// opts 扩展
assembleContext(workspaceRoot, stage, {
  changeDir, metadata,
  du: { id: 'DU-BE-001', repository: 'backend' },  // Phase 2.7
})
```

- 返回值增加 `duBinding`：`{ duId, repository, repoPath: '<workspace 相对>', activated: ['backend'] } | null`
- 装配顺序：read 条目 → change-artifacts → **DU 自动注入（绑定时）** → repos 段（绑定时激活）→ 预算统一核算
- 预算超限的 repo 条目同样入 skipped

## 7. InstructionBuilder 变更

§4 前插入新 section（仅绑定时输出）：

```markdown
## DU 绑定

- Delivery Unit: DU-BE-001（repository: backend）
- Repo Delivery: implementation/backend/delivery/CHG-0001/.../DU-BE-001/
- Guidance: Implementation Sketch 必填；Pseudocode 必填（trigger: business-flow）；Verification 必填

## Repository Delivery Context

### implementation/backend/delivery/.../DU-BE-001/task.md
（正文……）
```

- 「DU 绑定」：固定 4 行元信息；guidance 行从 Workspace DU metadata `implementation-guidance` 渲染（复用 2.5 文案规则）
- 「Repository Delivery Context」：收集 `source: 'repo'` 且 `mode: inline` 的文件正文；outline 条目并入 §4c 文件清单（标注来源）；missing 项并入既有 missing 行
- 未绑定 DU 时不输出上述 section（现状不变）

## 8. WorkflowEngine 变更

```js
runWorkflow(workspaceRoot, changeId, { du: 'DU-BE-001' })
```

- `opts.du` 仅对 `stage.gate ∈ {dev, test}` 生效；其他阶段忽略（不报错，幂等）
- 绑定校验（在 prepareSkillInvocation 内）：
  1. DU 存在（readWorkspaceDus）
  2. `du.repository` 在 repositories.yaml
  3. dev/test 阶段未绑定 → 维持现状（全 DU metadata 自动注入已提供最小上下文）
- userInput 增加 `duId` / `repository`（Instruction 用户输入段展示）

## 9. CLI 变更

| 命令 | 变更 |
|---|---|
| `openspec workflow run default --change <CHG> [--du <DU-ID>]` | 新增 `--du` |
| `openspec context <stage> [--change <CHG>] [--du <DU-ID>]` | 新增 `--du`，输出含 duBinding/repo 段激活情况 |
| `openspec doctor` | runContextRulesChecks 支持 v0.3（repos 段校验） |

doctor 新校验项：
- `repos` 段存在但 `version < 0.3` → issue（提示升级 version）
- `repos.<repoId>` 不在 repositories.yaml → issue
- repos 条目格式校验（复用 read 条目规则，错误信息 tag 为 `stages.<stage>.repos.<repoId>.read[i]`）

## 10. 模板变更

`templates/default-workspace/.sdd/context-rules.yaml`：
- `version: 0.3`
- dev/test 阶段增加 `repos` 段示例（backend/frontend 各一条 outline 示例，注释说明激活条件）
- 顶部注释补 v0.3 说明

## 11. 测试计划（tests/）

1. `context-assembler.spec.js`（扩充）：
   - repos 段：绑定 DU 激活对应仓 / 未绑定不激活 / 绑定其他仓不激活
   - DU 自动注入：已物化 → repo task.md + metadata inline；未物化 → missing 提示 materialize；DU 不存在 → 抛错
   - repo 条目受全局 limits 约束
   - duBinding 返回结构
2. `instruction-builder.spec.js`（扩充）：
   - DU 绑定 section 渲染（含 guidance 文案）
   - Repository Delivery Context section / missing 行
   - 未绑定 → 不输出新 section
3. `workflow.spec.js`（扩充）：
   - dev 阶段 `--du` 绑定 → .instruction.md 含 repo task.md 正文与 DU 绑定 section
   - 非 dev/test 阶段传 --du → 忽略
4. `doctor-context-rules.spec.js`（扩充）：
   - repos 段 repoId 非法 / version 不匹配 / 条目非法

## 12. 实施清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | core/sdd/context-assembler.js | opts.du / DU 自动注入 / repos 段激活 / duBinding |
| 2 | core/sdd/instruction-builder.js | DU 绑定 section + Repository Delivery Context section |
| 3 | core/sdd/workflow-engine.js | opts.du 透传 + dev/test 校验 |
| 4 | core/sdd/doctor-checks.js | v0.3 repos 段校验 |
| 5 | cli/openspec/src/commands/workflow.js | --du 选项 |
| 6 | cli/openspec/src/commands/context.js | --du 选项 + duBinding 输出 |
| 7 | templates/default-workspace/.sdd/context-rules.yaml | v0.3 模板 |
| 8 | tests/*（4 个 spec 扩充） | §11 用例 |
| 9 | docs/complete-usage-guide.md | §9.7 增量（v0.3 repos 段 + --du 用法） |

## 13. 验收标准

1. 绑定 DU 后 `.instruction.md` 包含 repo task.md 全文、DU 元信息、guidance 要求——Agent 无需手动导航 repo 侧文件
2. 未绑定 DU / 非 dev/test 阶段行为与 Phase 2.6 完全一致（全量回归通过）
3. per-repo 规则段激活是确定性的：同一 rules + 同一 DU → 同一 Context
4. doctor 能发现 repoId 拼写错误与 version 不匹配
