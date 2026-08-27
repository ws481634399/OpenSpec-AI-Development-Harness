# sdd-reverse: Knowledge Reverse

> Stage: reverse
> Type: Knowledge Reverse Skill（旧项目接入骨架）

## 目标

扫描 `implementation/` 下的现有代码，为外部 Agent 生成执行指令，指导其提取项目知识并写入 SDD 知识体系。

Phase 1 不执行代码语义分析（需 LLM），仅产出结构化的 instruction.md。

## 输入

- `implementation/` 目录（现有代码库）
- Workspace 元信息（`.sdd/workspace.yaml` / `.sdd/repositories.yaml`）

## 输出

- `instruction.md`：扫描结果 + Agent 执行指令（本 Skill 自动产出）
- `reverse-report.md`：知识提取报告（Agent 执行后产出）

## 执行流程

1. **扫描 implementation/**
   - 递归遍历目录树（深度 ≤ 5，文件数 ≤ 500）
   - 跳过 `.git` / `node_modules` / `target` / `build` / `dist`
   - 按扩展名推断语言/技术栈
   - 检测框架标记文件（package.json / pom.xml / go.mod 等）

2. **创建 reverse CHG**
   - 调用 `runChangeCreate`，requirement 标记为 `REVERSE`
   - CHG 处于 `created` 状态，不进 7 状态生命周期

3. **生成 instruction.md**
   - 写入扫描结果摘要（语言统计、标记文件、文件清单）
   - 写入 Agent 执行步骤（扫描代码 → 写 standards/ → 写 product/ → 写 reverse-report.md）

4. **Agent 执行**（外部 Agent，非本 Skill）
   - 读 instruction.md
   - 扫描代码核心文件
   - 提取技术规则 → 写入 `standards/`
   - 提取业务能力 → 写入 `product/`
   - 写入 `reverse-report.md` 到 CHG 目录

5. **归档**
   - 用户确认知识提取完成后运行 `openspec change archive <id>`

## 不做

- 不做代码语义分析（需 LLM，Phase 2+）
- 不自动生成 standards/product 内容
- 不推进 7 状态生命周期
