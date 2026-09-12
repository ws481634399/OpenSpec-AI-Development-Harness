# OpenSpec AI Development Harness 文档体系

> Version: v1.2
> Status: Active  
> Last Updated: 2026-09-10

---

## 文档定位

本目录是 OpenSpec AI Development Harness 的完整设计文档体系。

文档体系回答三个问题：

1. **是什么** — OpenSpec Harness 的定位与目标
2. **怎么设计** — 架构、流程、知识、Skill 的规范
3. **怎么实现** — 实施计划与首个版本的详细设计

---

## 文档清单

| 编号 | 文档 | 类型 | 职责 |
|------|------|------|------|
| 00 | [Roadmap](./00-Roadmap.md) | 总路线 | 项目定位、背景目标、演进阶段、每阶段交付物 |
| 01 | [Architecture](./01-Architecture.md) | 架构 | 整体分层架构、四世界模型、核心模块、版本边界 |
| 02 | [Workflow](./02-Workflow.md) | 流程 | SDD 七阶段开发流程、Change 状态流转、异常处理 |
| 03 | [Skill-Spec](./03-Skill-Spec.md) | Skill规范 | Skill 定义、目录结构、生命周期、核心 Skill 清单 |
| 04 | [Knowledge-Model](./04-Knowledge-Model.md) | 知识模型 | 四世界知识空间、知识生命周期、来源与使用规则 |
| 05 | [Implementation-Plan](./05-Implementation-Plan.md) | 实施计划 | Phase 0-4 实施路线、验收标准、推荐开发顺序 |
| 06 | [v0.1-Init-Design](./06-v0.1-Init-Design.md) | 初始化设计 | `init` 命令的详细设计、交互流程、生成结构（历史文档，实际实现以 usage guide 为准） |
| — | [Complete Usage Guide](./complete-usage-guide.md) | **使用指导** | 当前版本全量功能与命令的权威文档（持续更新） |

---

## 推荐阅读顺序

### 第一次了解项目

```
README.md（仓库根）
    ↓
00-Roadmap.md
    ↓
01-Architecture.md
```

理解项目是什么、整体架构如何。

### 快速上手使用

```
docs/complete-usage-guide.md
```

当前版本全量功能、命令与工作流的权威说明。

### 深入设计细节

```
02-Workflow.md
    ↓
03-Skill-Spec.md
    ↓
04-Knowledge-Model.md
```

理解开发流程、AI 能力如何标准化、项目知识如何管理。

### 了解演进历史

```
plans/phase-*.md
```

各阶段（Phase 1.0 – 4.3）的设计文档存档。

---

## 文档之间的关系

```
00-Roadmap
  定义：做什么、分几阶段
      │
      ├── 01-Architecture
      │     定义：整体结构
      │
      ├── 02-Workflow
      │     定义：开发流程
      │
      ├── 03-Skill-Spec
      │     定义：AI能力模块
      │
      ├── 04-Knowledge-Model
      │     定义：知识管理
      │
      └── 05-Implementation-Plan
            定义：怎么落地
                │
                └── 06-v0.1-Init-Design
                      定义：第一个功能怎么做
```

---

## 核心概念速查

| 概念 | 说明 | 详见 |
|------|------|------|
| SDD | Specification Driven Development，规格驱动开发 | 02-Workflow |
| 四世界 | Standards / Product / Delivery / Implementation | 01-Architecture, 04-Knowledge-Model |
| CHG | Change，一次业务变化（最外层交付容器） | 02-Workflow |
| Feature Tree | 四级特性树 Product → Module → Feature → Story | 01-Architecture |
| Skill | AI Agent 的标准化能力模块（当前 11 个） | 03-Skill-Spec |
| Workflow Engine | Gate 驱动的流程协调器（状态推进唯一入口为 Transition Service） | 02-Workflow |
| Story | Change 下可独立验收的需求单元；多 Story Change 独立推进并聚合状态 | plans/phase-4.2 |
| Delivery Unit (DU) | Story 面向单个仓库的实现交付单元（多仓交付桥梁） | plans/phase-2.4、phase-4.3 |
| Traceability | AC → Design Decision → DU → Test Case → Evidence 的可验证追踪链 | plans/phase-4.3 |
| Knowledge Reverse | 从已有代码逆向生成项目知识 | 04-Knowledge-Model |

---

## 版本状态

文档体系状态：**Active**（随实现演进持续更新）。

- Phase 0（架构基础）与 Phase 1–3 已完成；Phase 4.1–4.3 已交付，当前 Harness 版本为 v0.4.0
- 00–06 为设计期文档（保留历史视角，演进以 `plans/phase-*.md` 与 usage guide 为准）
- [complete-usage-guide.md](./complete-usage-guide.md) 为当前实现的权威使用文档

---

## 维护规则

- 文档编号一旦确定不更改
- 新增文档按编号顺序追加
- 重大变更需更新对应文档的 Version 和 Status
- 实现阶段发现的设计问题，回写到对应设计文档
