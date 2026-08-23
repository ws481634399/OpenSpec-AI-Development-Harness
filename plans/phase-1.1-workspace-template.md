# OpenSpec AI Development Harness Phase 1.1 Workspace Template Design

> Version: v0.1  
> Status: Draft  
> Type: Implementation Design  
> Phase: Phase 1.1 - Workspace Template

# 1. 文档目的

本文档定义 OpenSpec AI Development Harness v0.1 阶段的默认 Workspace Template 设计。

目标：

建立统一项目工作空间，使通过 OpenSpec Harness 管理的软件项目具备：

- SDD 开发流程基础；
- 项目知识管理能力；
- AI Coding Agent 上下文环境；
- Change 生命周期管理能力。

---

# 2. 背景

OpenSpec Harness 不直接管理业务代码，而是通过 Workspace 结构管理：

```
项目知识

+

研发流程

+

代码实现
```

因此需要定义一个统一 Workspace。

该 Workspace 将作为：

```
sdd init

```

命令的初始化模板。

---

# 3. Workspace Template 定位

## 3.1 定义

Workspace Template 是 OpenSpec Harness 提供的默认项目工作空间模板。

来源：

```
OpenSpec-AI-Development-Harness

        |

        |

templates/default-workspace

        |

        |

sdd init

        |

        |

User Project
```

---

## 3.2 职责

Workspace Template 负责：

- 创建标准目录；
- 初始化配置文件；
- 建立知识边界；
- 提供 AI 开发上下文。

---

## 3.3 非职责

Workspace Template 不负责：

- 业务代码生成；
- 项目架构设计；
- 代码迁移；
- 技术栈选择。

---

# 4. 设计原则

## 4.1 四世界模型

Workspace 必须体现：

```
Standards World

Product World

Delivery World

Implementation World
```

对应目录：

```
standards/

product/

delivery/

implementation/
```

---

## 4.2 知识与代码分离

规则：

```
知识:

standards
product
delivery


实现:

implementation
```

AI 不应该从代码中猜测所有规则。

正式知识必须沉淀到知识空间。

---

## 4.3 不修改已有项目

对于已有项目：

禁止：

- 移动源码；
- 修改源码结构；
- 自动重构。

只建立：

OpenSpec Workspace。

---

## 4.4 支持单仓和多仓

Workspace必须支持：

Single Repository：

```
一个项目仓库
```

Multi Repository：

```
多个代码仓库组成一个业务系统
```

---

# 5. Template目录结构

最终结构：

```
templates/

└── default-workspace/

    ├── README.md

    ├── .sdd/

    ├── standards/

    ├── product/

    ├── delivery/

    ├── implementation/

    └── skills/
```

---

# 6. .sdd配置目录

目录：

```
.sdd/
```

职责：

保存 OpenSpec Harness 配置。

结构：

```
.sdd/

├── workspace.yaml

├── repositories.yaml

├── context-rules.yaml

└── version.yaml
```

---

# 6.1 workspace.yaml

作用：

描述当前 Workspace。

模板：

```yaml
workspace:
  name: ""

  type: ""

  harness:
    version: "0.1.0"
```

字段：

| 字段            | 说明        |
| --------------- | ----------- |
| name            | 项目名称    |
| type            | 项目类型    |
| harness.version | Harness版本 |

---

## type类型

### Greenfield

新项目：

```yaml
type: greenfield
```

### Brownfield

已有项目：

```yaml
type: brownfield
```

---

# 6.2 repositories.yaml

作用：

管理代码仓库。

---

## 单仓模板

```yaml
mode: single

repositories:
  - id: main

    path: implementation
```

---

## 多仓模板

```yaml
mode: multi

repositories:
  - id: backend

    path: implementation/backend

  - id: frontend

    path: implementation/frontend
```

---

# 6.3 context-rules.yaml

作用：

定义 AI 在不同阶段读取的上下文。

模板：

```yaml
stages:
  explore:
    read:
      - standards/

      - product/

  prd:
    read:
      - product/

      - delivery/

  design:
    read:
      - standards/

      - product/

      - implementation/

  task:
    read:
      - delivery/

  dev:
    read:
      - delivery/

      - implementation/

  test:
    read:
      - delivery/

      - implementation/

  converge:
    read:
      - delivery/

      - implementation/
```

---

# 6.4 version.yaml

作用：

记录 Workspace 使用的 Harness版本。

模板：

```yaml
harness:
  version: 0.1.0
```

---

# 7. Standards World设计

目录：

```
standards/
```

职责：

存放项目规则。

结构：

```
standards/

├── sdd/

├── engineering/

└── project/
```

---

# 7.1 sdd/

内容：

OpenSpec通用规则。

例如：

```
change-lifecycle.md

skill-guideline.md
```

---

# 7.2 engineering/

内容：

工程规范。

例如：

```
coding-standard.md

api-standard.md

database-standard.md
```

---

# 7.3 project/

内容：

项目专属规则。

初始化：

空目录。

来源：

- 人工维护；
- Knowledge Reverse；
- Converge阶段沉淀。

---

# 8. Product World设计

目录：

```
product/
```

职责：

描述产品能力。

结构：

```
product/

├── feature-tree.yaml

├── features/

├── specs/

└── glossary/
```

---

# 8.1 feature-tree.yaml

初始化：

```yaml
features: []
```

作用：

管理产品能力树。

---

# 8.2 features/

存储 Feature 定义。

例如：

```
FEAT-ORDER-CANCEL.md
```

---

# 8.3 specs/

存储正式规格。

规则：

只有：

```
approved
```

状态才能进入。

---

# 8.4 glossary/

存储业务术语。

例如：

```
order.md

payment.md
```

---

# 9. Delivery World设计

目录：

```
delivery/
```

职责：

记录需求变化过程。

结构：

```
delivery/

├── changes/

├── archive/

└── reports/
```

---

# 9.1 changes/

当前进行中的 Change。

结构：

```
CHG-001/

├── request.md

├── prd.md

├── design.md

├── tasks.md

└── evidence/
```

---

# 9.2 archive/

历史完成 Change。

例如：

```
archive/

└── CHG-001/
```

---

# 9.3 reports/

分析报告。

结构：

```
reports/

├── reverse/

├── conflicts/

└── unresolved/
```

---

# 10. Implementation World设计

目录：

```
implementation/
```

职责：

存放真实代码。

原则：

OpenSpec 不规定代码组织方式。

支持：

```
Java

Go

Python

Node

Frontend

AI Service
```

---

# 11. Skills目录设计

目录：

```
skills/
```

职责：

记录项目使用的 Skill。

v0.1：

不复制 Skill 实现。

原因：

Skill属于 Harness。

项目只记录：

使用关系。

初始化：

```
skills/

└── README.md
```

内容：

```markdown
Skills are managed by OpenSpec Harness.
```

---

# 12. Workspace初始化结果

执行：

```bash
sdd init
```

生成：

```
Project/

├── .sdd/

├── standards/

├── product/

├── delivery/

├── implementation/

└── skills/
```

---

# 13. AI Context规则

AI Agent 根据 Workflow阶段读取不同知识。

---

## Explore

读取：

```
standards/

product/
```

目标：

理解需求。

---

## PRD

读取：

```
product/

delivery/
```

目标：

生成产品规格。

---

## Design

读取：

```
standards/

product/

implementation/
```

目标：

设计技术方案。

---

## Task

读取：

```
delivery/
```

目标：

拆解任务。

---

## Dev

读取：

```
delivery/

implementation/
```

目标：

执行代码修改。

---

## Test

读取：

```
delivery/

implementation/
```

目标：

验证实现。

---

## Converge

读取：

```
delivery/

implementation/
```

目标：

沉淀知识。

---

# 14. Template版本管理

Template跟随 Harness版本。

例如：

```
default-workspace

v0.1.0

v0.2.0
```

---

# 15. 验收标准

Phase 1.1完成后：

## Workspace结构

- [x] 四世界目录存在
- [x] .sdd配置存在

## Repository支持

- [x] 单仓支持
- [x] 多仓支持

## AI上下文

- [x] 阶段读取规则明确

## CLI准备

- [x] 可被sdd init调用

---

# 16. 下一阶段

Phase 1.2：

实现：

```
sdd init
```

基于：

```
templates/default-workspace
```

完成：

- 模板复制；
- 配置生成；
- 初始化检查；
- 项目接入。

---

# 总结

Workspace Template 是 OpenSpec Harness 的运行基础。

它定义：

```
项目结构

+

知识边界

+

AI上下文

+

SDD运行空间
```

为后续：

- Skill执行；
- Change管理；
- Knowledge Reverse；

提供统一基础。
