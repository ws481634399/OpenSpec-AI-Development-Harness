# Convergence

> 阶段：sdd-converge 产物
> 输入：completed change（全部 Artifact 已产出）
> 产出状态：completed

本文档记录本次 Change 的知识收敛过程。真正的知识更新发生在 Workspace Knowledge 中（写回 standards/product/），本文件只记录"该不该更新、更新了什么、为什么"。

结构化字段由 sdd-converge 通过 ArtifactWriter 填充（{{placeholder}}），
非结构化段落（知识沉淀过程与评估）由外部 Agent 按 Instruction 补充。

## 0. 元信息

- Change ID: {{change-id}}
- 完成时间: {{completed-at}}
- 状态流转: {{from-state}} → {{to-state}}
- 产出 Artifact 数: {{artifact-count}}

## 1. 知识变化总结

<!-- AI 补充：本次 Change 带来的知识增量：新规则、新模式、新术语、新 Feature -->

- 知识增量摘要: {{knowledge-delta}}

## 2. 更新判断

### Standards

- 是否需更新: {{standards-need-update}} <!-- yes/no -->
- 更新内容: <!-- 具体标准文件路径与改动概要 -->
- 理由:

### Product

- 是否需更新: {{product-need-update}} <!-- yes/no -->
- 更新内容: <!-- feature-tree.yaml / specs/ 改动概要 -->
- 理由:

### feature-tree.yaml

- 是否需更新: {{featuretree-need-update}} <!-- yes/no -->
- 更新内容:
- 理由:

### Glossary

- 是否需更新: {{glossary-need-update}} <!-- yes/no -->
- 更新内容:
- 理由:

## 3. 知识沉淀过程

<!-- 记录知识更新的执行情况：哪些已写回、哪些留待后续、为什么 -->

## 4. 完成确认

- [ ] 代码变更已完成
- [ ] 测试已完成
- [ ] 证据已收集
- [ ] 知识更新已评估
