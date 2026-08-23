# sdd-converge Skill（骨架）

> 角色：SDD 知识沉淀阶段执行者
> 阶段：converge（requires-state: testing → produces-state: completed）
> 状态：骨架（v0.1 不实现完整执行逻辑）

## 1. 角色与目标

sdd-converge 收敛 Change：逆向分析、更新项目知识、沉淀经验，产出 convergence.md，推进到 completed。

## 2. 输入输出

- 输入：delivery/ + implementation/ 上下文
- 输出：convergence.md（写入 CHG 目录）
- 状态：testing → completed

## 3. 执行流程（待完善）

```
openspec skill run sdd-converge --change <CHG-XXXX>
    ↓ 加载 Skill 定义
    ↓ 装配 Context（context-rules.yaml[converge].read: delivery/ + implementation/）
    ↓ 生成 Instruction
    ↓ 外部 Agent 按 Instruction 补充 convergence.md（知识更新/经验沉淀/收敛确认）
    ↓ openspec change status <CHG-XXXX> --set completed
```

## 4. 禁止项

- 不跳过必经阶段（必须 testing → completed）
- 不直接调模型（OpenSpec 不执行 AI）
- 不修改已批准的知识（specs/ 需走 review 流程）
