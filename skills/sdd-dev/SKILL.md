# sdd-dev Skill（骨架）

> 角色：SDD 开发阶段执行者
> 阶段：dev（requires-state: tasked → produces-state: developing）
> 状态：骨架（v0.1 不实现完整执行逻辑）

## 1. 角色与目标

sdd-dev 执行 Task：按 tasks.md 修改实现代码，遵循工程规范，记录实现摘要。

## 2. 输入输出

- 输入：tasks.md + standards/engineering/ + implementation/ 上下文
- 输出：implementation.md（写入 CHG 目录）
- 状态：tasked → developing

## 3. 执行流程（待完善）

```
openspec skill run sdd-dev --change <CHG-XXXX>
    ↓ 加载 Skill 定义
    ↓ 装配 Context（context-rules.yaml[dev].read: delivery/ + implementation/）
    ↓ 生成 Instruction
    ↓ 外部 Agent 按 Instruction 执行 tasks.md，修改代码，补充 implementation.md
    ↓ openspec change status <CHG-XXXX> --set developing
```

## 4. 禁止项

- 不跳过必经阶段（必须 tasked → developing）
- 不直接调模型（OpenSpec 不执行 AI）
- 不绕过 Change 直接修改代码（必须通过 Task）
- 不违反工程规范（standards/engineering/）
