# sdd-design Skill（骨架）

> 角色：SDD 技术设计阶段执行者
> 阶段：design（requires-state: specified → produces-state: designed）
> 状态：骨架（v0.1 不实现完整执行逻辑）

## 1. 角色与目标

sdd-design 制定技术方案：分析当前状态、提议方案、识别仓库影响与风险。

## 2. 输入输出

- 输入：prd.md + standards/engineering/ + implementation/ 上下文
- 输出：design.md（写入 CHG 目录）
- 状态：specified → designed

## 3. 执行流程（待完善）

```
openspec skill run sdd-design --change <CHG-XXXX>
    ↓ 加载 Skill 定义
    ↓ 装配 Context（context-rules.yaml[design].read: standards/ + product/ + implementation/）
    ↓ 生成 Instruction
    ↓ 外部 Agent 按 Instruction 补充 design.md（当前状态/提议方案/仓库影响/数据变更/风险）
    ↓ openspec change status <CHG-XXXX> --set designed
```

## 4. 禁止项

- 不跳过必经阶段（必须 specified → designed）
- 不直接调模型（OpenSpec 不执行 AI）
- 不在 design 阶段写实现代码（属 sdd-dev）
