# sdd-test Skill（骨架）

> 角色：SDD 测试阶段执行者
> 阶段：test（requires-state: developing → produces-state: testing）
> 状态：骨架（v0.1 不实现完整执行逻辑）

## 1. 角色与目标

sdd-test 验证实现：运行测试、生成 Evidence、检查质量，记录测试结果到 evidence/ 目录。

## 2. 输入输出

- 输入：implementation.md + delivery/ + implementation/ 上下文
- 输出：evidence/（测试证据文件，写入 CHG 目录的 evidence/ 子目录）
- 状态：developing → testing

## 3. 执行流程（待完善）

```
openspec skill run sdd-test --change <CHG-XXXX>
    ↓ 加载 Skill 定义
    ↓ 装配 Context（context-rules.yaml[test].read: delivery/ + implementation/）
    ↓ 生成 Instruction
    ↓ 外部 Agent 按 Instruction 运行测试，生成 evidence/ 文件
    ↓ openspec change status <CHG-XXXX> --set testing
```

## 4. 禁止项

- 不跳过必经阶段（必须 developing → testing）
- 不直接调模型（OpenSpec 不执行 AI）
- 不伪造测试结果（Evidence 必须真实）
