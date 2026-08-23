# sdd-task Skill（骨架）

> 角色：SDD 任务拆分阶段执行者
> 阶段：task（requires-state: designed → produces-state: tasked）
> 状态：骨架（v0.1 不实现完整执行逻辑）

## 1. 角色与目标

sdd-task 将技术设计拆分为可执行任务：明确每个任务的修改范围、依赖关系、验证方式。

## 2. 输入输出

- 输入：design.md + delivery/ 上下文
- 输出：tasks.md（写入 CHG 目录）
- 状态：designed → tasked

## 3. 执行流程（待完善）

```
openspec skill run sdd-task --change <CHG-XXXX>
    ↓ 加载 Skill 定义
    ↓ 装配 Context（context-rules.yaml[task].read: delivery/）
    ↓ 生成 Instruction
    ↓ 外部 Agent 按 Instruction 补充 tasks.md（任务清单/依赖/验证方式）
    ↓ openspec change status <CHG-XXXX> --set tasked
```

## 4. 禁止项

- 不跳过必经阶段（必须 designed → tasked）
- 不直接调模型（OpenSpec 不执行 AI）
- 不在 task 阶段写实现代码（属 sdd-dev）
