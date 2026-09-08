# sdd-review: 评审检查点

> 阶段: review（Phase 2.2 同态检查点）
> 状态: testing（检查点，不推进 Change 状态）
> 产出: review-report.md
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/review/persona-review.md

## 前置条件
- Change 处于 `testing` 状态
- implementation.md 与 evidence/test-report.md 已完成
- evidence/evidence.yaml 已有 code-change / test-run 条目
- Phase 2.4：全部 DU 已 completed（du-fan-in-complete）且 result commit 与各仓 HEAD 一致

## 定位说明

sdd-review 是 sdd-converge 前的**独立质量检查点**：
- 双门禁通过后 review-report.md 被标记为 accepted，但 Change 状态保持 `testing`
- converge 的 Machine Gate 要求 review-report.md 已 accepted（防绕过）
- 本 Skill 只读分析 + 记录发现，**不直接修改业务代码**

## 执行步骤

### 1. 读取输入

依次读取：
- `delivery/changes/<CHG>/spec.md` — AC 清单（需求一致性基准）
- `delivery/changes/<CHG>/design.md` — 接口/模块/规则声明 + **跨仓协作契约 §4**（设计一致性基准）
- `delivery/changes/<CHG>/implementation.md` — 跨仓实施汇总（DU 状态总览）
- STORY 级 `delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md` — DU 清单与 Acceptance
- `delivery/changes/<CHG>/evidence/test-report.md` — 测试结论
- `delivery/changes/<CHG>/evidence/evidence.yaml` — 结构化证据（对照的核心数据源；多仓 DU 侧证据按 evidence-ref 追溯）
- `standards/*.md` — 现行规范（代码质量基准）

### 2. 执行四项检查

#### 检查 1：需求一致性

spec AC 逐条对照 evidence.yaml：

| AC | test-run 证据（covers 字段） | 结论 |
|----|------------------------------|------|
| AC-001 | EV-002 | ✅ |
| AC-002 | （无） | ❌ 缺口 |

- 每条 AC 必须有至少一个 `covers` 包含它的 test-run 条目
- 有 test-report 但 evidence 无对应条目 → 视为缺口
- 缺口 → 记 review-finding（target: `spec.md#AC-NNN`）

#### 检查 2：设计一致性（Design → DU → Implementation Traceability）

**Phase 2.5 扩展**：按三层链路检查（不要求代码逐行匹配伪代码，检查逻辑方向与组件职责）：

```text
Workspace Design（§2 方案 / §4 契约）
        ↓ 检查 a
DU Implementation Sketch / Pseudocode（tasks.md DU 小节 + repo task.md §7/§8）
        ↓ 检查 b
Actual Implementation（code-change 证据 + 源码抽查）
        ↓ 检查 c
Acceptance Criteria 满足
```

| 检查 | 内容 | 偏差处理 |
|------|------|---------|
| a. DU ↔ Design | Sketch/契约引用是否与 design.md 一致；Pseudocode 是否违背 API / Data / Architecture Contract | 记 review-finding（target: `tasks.md#DU-XXX` 或 `design.md#<section>`） |
| b. Implementation ↔ DU | 实际实现是否符合 DU spec；**偏离但 repo implementation.md `## Deviations` 有记录且合理 → 通过；偏离但未记录 → major** | 记 review-finding（target: `implementation.md#Deviations`） |
| c. AC 满足 | 偏离后是否仍满足 DU Acceptance 与 spec AC | 不满足 → blocker |

design.md 声明 ↔ code-change 条目对照：
- 设计声明的接口/模块是否在 code-change 的 files/symbols 中出现
- code-change 的 reason 是否与设计动机冲突
- **Phase 2.4 跨仓一致性**：design.md §4 协作契约（API/Event/Data + 依赖方向）是否被各仓 DU 的实现与测试证据共同满足；affected-repositories 是否都有对应 DU 的 code-change 证据
- 偏差 → 记 review-finding（target: `design.md#<section>` 或 `文件:symbol`）

> 可复用的偏离理由（如「仓内已有反腐败层」）列入 §1.4 知识同步候选。

#### 检查 3：代码质量

对照 `standards/*.md` 中**明确声明**的规范条目：
- 抽查 code-change 涉及的实际代码文件
- 仅记录有明确规范依据的违规（无规则依据不记 finding）
- 违规 → 记 review-finding（target: `standards/<file>.md#<规则>` 或 `文件:symbol`）

#### 检查 4：知识同步（候选识别）

识别 converge 应晋升的候选知识项（**只列清单，不执行沉淀**）：
- 本次变更中出现的新规范/新模式 → 候选 standards
- 新术语/新业务能力 → 候选 product
- 写入 review-report §1.4，供 sdd-converge 消费

### 3. 记录发现（review-finding 条目）

每个发现追加到 `evidence/evidence.yaml` 的 items（直接编辑 YAML，保持既有注释）：

```yaml
- id: EV-003                  # 延续已有 EV-NNN 递增
  type: review-finding
  target: spec.md#AC-002         # 问题定位
  severity: major             # blocker / major / minor
  finding: AC-002 缺少测试覆盖   # 问题描述
  resolution: ""              # 先留空，闭环时回填
  recorded-at: "2026-08-28T12:00:00.000Z"
```

严重度判定标准：

| severity | 判定 |
|----------|------|
| blocker | AC 未满足 / 设计冲突导致功能错误 / 安全违规 |
| major | 设计偏差（功能可用但违背声明设计）/ 规范违规且影响可维护性 |
| minor | 风格偏差 / 可延后的改进建议 |

### 4. 修复与闭环

存在 blocker/major 时（在 testing 状态内完成，不改 Change 状态）：
1. 修复代码 / 补测试
2. 追加新的 code-change / test-run 证据条目（复用 sdd-dev/sdd-test 记录方式）
3. 回填原 review-finding 条目的 `resolution`（引用修复证据的 EV id）：

```yaml
  resolution: 已补充 AC-002 测试，见 EV-004
```

- blocker/major **必须闭环**（Machine Gate findings-closure 强制）
- minor 允许保持开放（作为技术债记录）

### 5. 写 review-report.md

读取模板 `templates/artifacts/review-report.md`，按结构填写。

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{test-report-source}}`：`<CHG>/evidence/test-report.md`
- `{{evidence-index}}`：`<CHG>/evidence/evidence.yaml`
- `{{reviewed-at}}`：ISO8601 时间戳

非结构化段落：
- §1.1–1.3 四项检查对照表与结论
- §1.4 知识同步候选清单
- §2 发现清单（与 evidence.yaml 的 review-finding 条目一一对应）
- §3 完成确认 checklist 全部勾选

### 6. 质量自检

产出前自检：
- [ ] spec 每条 AC（AC-NNN）是否都做了对照？
- [ ] design.md 关键声明是否都核对了实现证据？
- [ ] 每个 DU 是否都有 code-change/test-run 证据（evidence-ref 可追溯到所属仓）？
- [ ] design.md §4 跨仓协作契约是否被各仓证据共同满足？
- [ ] 代码质量 finding 是否都有明确规范依据？
- [ ] 全部 blocker/major 是否已闭环（resolution 非空）？
- [ ] review-finding 条目与 §2 发现清单是否一一对应？
- [ ] 知识同步候选是否已写入 §1.4？
- [ ] **追踪链完整（Phase 4.3 S4）**：AC→DES→DU→TC→EVD 全链无断链？
  - 每个 AC-NNN 有对应 TC-NNN（tc-coverage）？
  - 每个 TC-NNN 在 test-design.md 定义且有 EVD 执行证据（evidence-trace）？
  - 每个 DU covers 的 AC 真实存在于 spec（ac-coverage）？
  - 红绿灯证据真实性抽核（red-green-record 真实性靠人审）？

## 产出草稿
- `delivery/changes/<CHG>/review-report.md` — 评审报告
- `delivery/changes/<CHG>/evidence/evidence.yaml` — 追加 review-finding 条目

## 用户确认

展示 review-report.md 给用户：
- 四项检查结论是否认可？
- blocker/major 的修复方式是否接受？
- minor 是否接受延后处理？

确认后：
```bash
openspec gate check <CHG>
openspec gate approve <CHG> --stage review
# 检查点通过：review-report.md 置 accepted，Change 状态保持 testing
# 随后执行 sdd-converge 进入知识收敛
```

## 工作示例

> 场景：user-registration 案例，review 发现 AC-002 缺测试覆盖

**evidence.yaml 追加条目：**

```yaml
- id: EV-003
  type: review-finding
  target: spec.md#AC-002
  severity: major
  finding: AC-002（已注册邮箱返回 409）无 test-run 覆盖
  resolution: 已补 duplicate_email 测试并跑通，见 EV-004
  recorded-at: "2026-08-28T12:00:00.000Z"
- id: EV-004
  type: test-run
  command: npm test
  result: passed
  summary: { total: 14, passed: 14, failed: 0, skipped: 0 }
  log: evidence/test-output.log
  covers: [AC-002]
  recorded-at: "2026-08-28T12:30:00.000Z"
```

**review-report.md §1.1（节选）：**

```markdown
| AC | test-run 证据 | 结论 |
|----|---------------|------|
| AC-001 | EV-002 | ✅ |
| AC-002 | EV-004（评审后补充） | ✅ 已闭环（EV-003） |
```

## 行为规则
- 只读分析业务代码；发现问题走 evidence 条目，不直接改代码
- 同态检查点：不推进 Change 状态（状态机无 review 态）
- blocker/major 必须闭环后才能通过 Machine Gate
- 代码质量 finding 必须有明确规范依据
- 知识只列候选清单，沉淀由 sdd-converge 执行
