# Implementation（跨仓实施汇总）

> 阶段：sdd-dev 产物
> 输入：STORY 级 tasks.md（Repository Delivery Decomposition Plan）
> 位置：<CHG>/implementation.md（Workspace 根级）
> 产出状态：developing

Phase 2.4 语义变更：本文件**不再承载实施正文**，而是跨仓实施汇总——
引用各仓 DU 的 implementation.md 与 baseline/result，形成全局实施视图。
实施正文（DU 级 task.md / implementation.md / evidence）在各仓
`implementation/<repo>/delivery/<CHG>/<L1>/<L2>/<L3>/<STORY>/<DU-XXX>/`（Reference do not duplicate）。

结构化字段由 sdd-dev 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- Tasks 来源: {{tasks-source}}
- 状态流转: {{from-state}} → {{to-state}}
- 开始时间: {{started-at}}

## 1. Delivery Unit 状态总览

<!-- AI 补充：每个 DU 一行；DU 明细以各仓 delivery/ 内 metadata.yaml 为准（本表为汇总引用）。
     DU 轻量状态：pending / developing / testing / completed -->

| DU         | 仓库             | 状态 | Baseline | Result |
| ---------- | ---------------- | ---- | -------- | ------ |
| DU-XXX-001 | {{primary-repo}} |      |          |        |

## 2. 各仓实施引用

<!-- AI 补充：每个受影响仓库一个小节，引用该仓 DU 的 implementation.md 相对路径，不复制正文。 -->

### {{primary-repo}}

- DU implementation: implementation/{{primary-repo}}/delivery/...

## 3. Commit 记录（跨仓聚合）

<!-- AI 补充：每个 Commit 对应哪个 DU。commit 明细同步写入各仓 DU evidence/evidence.yaml（type: code-change），
     Workspace 级 evidence/evidence.yaml 以 evidence-ref 引用聚合，二者必须一致（机检）。 -->

| Commit | DU  | 仓库 | 说明 |
| ------ | --- | ---- | ---- |
|        |     |      |      |

## 4. Fan-in 状态

<!-- AI 补充：全部 DU completed 后由 sdd-dev/test 收敛确认；
     develop→test 前置 du-fan-in-testing，review 前置 du-fan-in-complete（Machine Gate 机检）。 -->

- [ ] 所有 DU 物化完成（du-materialized）
- [ ] 所有 DU 进入 testing（du-fan-in-testing）
- [ ] 所有 DU completed（du-fan-in-complete）
