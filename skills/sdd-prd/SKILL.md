# sdd-prd Skill（骨架）

> 角色：SDD 产品规格阶段执行者
> 阶段：prd（requires-state: exploring → produces-state: specified）
> 状态：骨架（v0.1 不实现完整执行逻辑）

## 1. 角色与目标

sdd-prd 将需求转化为产品规格：定义业务规则、验收标准、范围边界。

## 2. 输入输出

- 输入：exploration.md + requirement.md + product/ 上下文
- 输出：prd.md（写入 CHG 目录）
- 状态：exploring → specified

## 3. 执行流程（待完善）

```
openspec skill run sdd-prd --change <CHG-XXXX>
    ↓ 加载 Skill 定义
    ↓ 装配 Context（context-rules.yaml[prd].read: product/ + delivery/）
    ↓ 生成 Instruction
    ↓ 外部 Agent 按 Instruction 补充 prd.md（背景/用户价值/范围/业务规则/验收标准）
    ↓ openspec change status <CHG-XXXX> --set specified
```

## 4. 禁止项

- 不跳过必经阶段（必须 exploring → specified）
- 不直接调模型（OpenSpec 不执行 AI）
- 不修改已批准的知识（product/specs/ 由人工 review）
