---
description: OpenSpec SDD Workspace 工作流引导：本项目采用 Spec-Driven Development，Agent 必须按 skills/ 方法论与 openspec CLI 推进交付
alwaysApply: true
---

# OpenSpec SDD Workflow

本项目是 OpenSpec SDD Workspace（Spec-Driven Development：先文档后代码）。

## 你需要知道的结构

- 四世界：`standards/`（规则）、`product/`（产品知识）、`delivery/`（交付过程）、`implementation/`（实现代码）
- Skills：`skills/sdd-*/SKILL.md` —— 每个开发阶段的方法论与执行步骤
- 配置：`.sdd/`（workspace / repositories / context-rules / version）

## 启动约定（对话开始时）

1. 用户提出功能开发诉求 → 先读 `skills/README.md` 选择对应 Skill
2. 找到当前 Change：`delivery/changes/<Module>/<Feature>/<Story>/<CHG-ID>/`（可用 `openspec status` 查看）
3. 严格按 SKILL.md 方法论执行，产出写回 Change 目录对应 Artifact

## 状态推进（唯一合法方式）

```bash
openspec workflow run --change <CHG-ID> [--stage <stage>] [--du <DU-ID>]
```

- 多仓项目 dev/test 阶段必须绑定 `--du`
- 返回状态：`WAITING_FOR_ARTIFACT` / `WAITING_FOR_MACHINE_FIX` / `WAITING_FOR_HUMAN` / `ADVANCED` / `COMPLETED`（支持断点续跑）
- Machine Gate：`openspec gate verify`；人工审批：`openspec gate approve`（只设 Human 状态，不推进生命周期）

## 禁止事项

- 禁止直接修改 `.sdd/` 下状态字段或手动移动 Change 生命周期
- 禁止跳过 Gate 直接进入下一阶段实现
- 禁止把实现细节写进 `standards/`（规则世界只放长期约束）

## 常用命令

```
openspec status | change list | gate verify | gate approve | du show | context | doctor | version
```

完整方法论见 `skills/README.md` 与各 `SKILL.md`。

<!-- openspec-ide-rules: v{{HARNESS_VERSION}} -->
