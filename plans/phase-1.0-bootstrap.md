# OpenSpec AI Development Harness Phase 1.0 Bootstrap Design

> Version: v0.1  
> Status: Draft  
> Type: Implementation Design  
> Phase: Phase 1.0 - Repository Bootstrap

# 1. 文档目的

本文档定义 OpenSpec AI Development Harness Phase 1.0 的初始化方案。

目标：

建立 OpenSpec Harness 自身的工程仓库，为后续：

- Workspace Template
- CLI工具
- Skill实现
- Schema定义
- 示例项目

提供统一开发基础。

---

# 2. Phase 1.0 定位

## 2.1 阶段目标

Phase 1.0 不实现业务能力。

只完成：

> OpenSpec AI Development Harness 工程初始化。

包括：

- 仓库创建；
- 目录规划；
- 基础文件；
- 开发规范；
- Git管理。

---

# 3. 与 Phase 0 的关系

Phase 0：

完成设计。

产物：

```
docs/
```

包括：

- Architecture
- Workflow
- Skill Specification
- Knowledge Model

Phase 1.0：

开始实现。

关系：

```
Phase 0
设计规范
    ↓
Phase 1.0
建立工程
    ↓
Phase 1.1
开发Workspace Template
    ↓
Phase 1.2
实现sdd init
```

---

# 4. 仓库定位

## 4.1 仓库名称

```
OpenSpec-AI-Development-Harness
```

---

## 4.2 仓库职责

该仓库存储：

```
OpenSpec Framework
        +
Development Tools
        +
AI Skills
        +
Templates
        +
Specifications
```

---

# 5. 与业务项目关系

OpenSpec Harness：

```
Framework
```

业务项目：

```
Consumer
```

关系：

```
OpenSpec-AI-Development-Harness
             |
             |
             ↓
AI-Commerce-Platform
CRM-System
Other Projects
```

---

# 6. 初始化目录设计

最终结构：

```
OpenSpec-AI-Development-Harness/
├── README.md
├── LICENSE
├── .gitignore
├── .version
├── CONTRIBUTING.md
├── docs/
├── plans/
├── templates/
├── skills/
├── tools/
├── scripts/
├── schemas/
└── examples/
```

---

# 7. 目录职责说明

# 7.1 docs/

职责：

存放正式规范文档。

内容：

```
docs/
├── 00-Roadmap.md
├── 01-Architecture.md
├── 02-Workflow.md
├── 03-Skill-Spec.md
├── 04-Knowledge-Model.md
└── 05-Implementation-Plan.md
```

特点：

长期稳定。

---

# 7.2 plans/

职责：

存放实施计划。

例如：

```
plans/
├── phase-1.0-bootstrap.md
├── phase-1.1-workspace-template.md
└── phase-1.2-sdd-init.md
```

特点：

随着开发推进变化。

---

# 7.3 templates/

职责：

存放项目初始化模板。

未来：

```
sdd init
```

使用：

```
templates/
└── default-workspace/
```

---

# 7.4 skills/

职责：

存放AI Skill实现。

结构：

```
skills/
├── sdd-workflow/
├── sdd-explore/
├── sdd-design/
└── sdd-dev/
```

---

# 7.5 tools/

职责：

存放工具代码。

例如：

```
tools/
└── sdd-cli/
```

未来：

提供：

```
sdd init
sdd validate
sdd change
```

---

# 7.6 scripts/

职责：

工程辅助脚本。

例如：

```
scripts/
├── install.sh
├── release.sh
└── check.sh
```

---

# 7.7 schemas/

职责：

定义数据格式。

例如：

```
schemas/
├── workspace.schema.yaml
├── change.schema.yaml
└── feature.schema.yaml
```

---

# 7.8 examples/

职责：

提供使用案例。

例如：

```
examples/
└── ai-commerce-project/
```

---

# 8. 基础文件设计

# 8.1 README.md

说明：

- 项目定位；
- 快速开始；
- 当前版本。

示例：

```
OpenSpec AI Development Harness
An SDD framework for AI Coding Agents.
```

---

# 8.2 .version

记录当前版本。

内容：

```
0.1.0
```

---

# 8.3 LICENSE

定义：

开源协议。

初期：

根据项目需求选择。

---

# 8.4 CONTRIBUTING.md

定义贡献规则。

包括：

- 文档修改；
- Skill新增；
- 工具开发；
- Review流程。

---

# 9. Git初始化流程

进入目录：

```bash
cd OpenSpec-AI-Development-Harness
```

初始化：

```bash
git init
```

添加文件：

```bash
git add .
```

第一次提交：

```bash
git commit -m "chore: initialize OpenSpec Harness repository"
```

---

# 10. Phase 1.0 不包含内容

以下功能不在本阶段实现。

---

## 不实现CLI

原因：

CLI依赖Workspace设计。

将在：

Phase 1.2 实现。

---

## 不实现Skill

原因：

Skill依赖运行环境。

将在：

Phase 1.3 实现。

---

## 不实现Knowledge Reverse

原因：

依赖：

- Workspace
- Repository Model
- Skill Framework

---

# 11. Phase 1.0 输出

完成后：

```
OpenSpec-AI-Development-Harness
        |
        |
      v0.1基础工程
```

具备：

✅ 独立Git仓库
✅ 完整目录结构
✅ 文档体系
✅ 开发规范
✅ 后续扩展位置

---

# 12. Phase 1.0 验收标准

满足：

## Repository

- [x] Git初始化完成
- [x] 基础目录存在

## Documentation

- [x] Phase 0文档归档

## Development

- [x] Template目录准备
- [x] Skill目录准备
- [x] Tool目录准备

## Version

- [x] 初始版本记录

---

# 13. 下一阶段

Phase 1.1：

## Workspace Template Design

目标：

设计：

```
templates/default-workspace/
```

定义：

- .sdd结构；
- standards初始化；
- product初始化；
- delivery初始化；
- implementation挂载方式。

---

# 总结

Phase 1.0 的核心目标：

不是开发功能。

而是：

> 建立 OpenSpec AI Development Harness 的工程基础，使后续 Workspace、Skill、CLI 能够在统一结构上演进。
