# SDD 控制层（SDD Workspace Control Layer）

> 版本：v0.1  
> 类型：OpenSpec Harness 控制目录规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 OpenSpec Workspace 中 `.sdd/` 目录的职责、结构和使用规则。


`.sdd/` 是 OpenSpec Harness 的执行控制层。


它负责：

```
管理 SDD 配置

+

维护 Workspace 元数据

+

定义 AI 上下文规则

+

追踪 Harness 版本
```


---

# 2. .sdd 定位


OpenSpec Workspace 包含五个核心部分：


```
Standards

规则世界


Product

产品世界


Delivery

交付世界


Implementation

实现世界


.sdd

执行控制层
```


其中：


```
Standards

定义应该遵守什么


Product

定义为什么做、做什么


Delivery

定义一次变化如何完成


Implementation

保存真实系统实现


.sdd

定义 Workspace 配置与运行规则
```


---

# 3. .sdd 核心职责


## 3.1 Workspace 配置管理


`.sdd/` 保存 Workspace 的基础配置信息。


包括：

- Workspace 名称与类型；
- Harness 版本；
- Workspace Template 版本。


---

## 3.2 仓库接入管理


`.sdd/` 管理接入的代码仓库。


支持：

- 单仓模式（single）；
- 多仓模式（multi）。


---

## 3.3 AI 上下文规则


`.sdd/` 定义 AI Agent 在不同工作流阶段读取的上下文。


包括 7 个阶段：

```
explore

prd

design

task

dev

test

converge
```


---

## 3.4 版本追踪


`.sdd/` 记录 Workspace 使用的 Harness 与 Template 版本。


保证：

```
Workspace

↔

Harness

↔

Template

版本一致
```


---

# 4. .sdd 目录结构


v0.1 默认结构：


```
.sdd/

├── README.md

├── workspace.yaml

├── repositories.yaml

├── context-rules.yaml

└── version.yaml
```


说明：


v0.1 阶段 `.sdd/` 仅包含 4 个 YAML 配置文件 + README.md，不包含子目录。


后续版本可能扩展：


```
.sdd/

├── skills/

├── workflows/

├── templates/

├── registry/

└── state/
```


但 v0.1 暂不引入。


---

# 5. workspace.yaml


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


字段说明：


|字段|说明|
|-|-|
|name|项目名称|
|type|项目类型（greenfield / brownfield）|
|harness.version|Harness 版本|


---

## type 类型


### Greenfield


新项目：

```yaml
type: greenfield
```


### Brownfield


已有项目接入：

```yaml
type: brownfield
```


---

# 6. repositories.yaml


作用：

管理接入的代码仓库。


---

## 单仓模式


```yaml
mode: single


repositories:

  - id: main

    path: implementation
```


---

## 多仓模式


```yaml
mode: multi


repositories:

  - id: backend

    path: implementation/backend


  - id: frontend

    path: implementation/frontend
```


---

# 7. context-rules.yaml


作用：

定义 AI 在不同工作流阶段读取的上下文。


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

## 阶段说明


|阶段|读取目录|目标|
|-|-|-|
|explore|standards/、product/|理解需求|
|prd|product/、delivery/|生成产品规格|
|design|standards/、product/、implementation/|设计技术方案|
|task|delivery/|拆分任务|
|dev|delivery/、implementation/|执行代码修改|
|test|delivery/、implementation/|验证实现|
|converge|delivery/、implementation/|沉淀知识|


---

# 8. version.yaml


作用：

记录 Workspace 使用的版本信息。


包含三类版本：

- Harness 版本；
- Workspace Template 版本；
- Schema 版本。


模板：


```yaml
harness:

  version: "0.1.0"


workspace-template:

  version: "0.1.0"


schema:

  version: "0.1.0"
```


字段说明：


|字段|说明|
|-|-|
|harness.version|OpenSpec Harness 自身版本|
|workspace-template.version|Workspace 初始化时使用的模板版本|
|schema.version|`.sdd/` 下所有 YAML 配置文件的字段结构版本|


---

## Schema 版本的作用


`schema.version` 用于追踪以下 4 个配置文件的结构版本：

- workspace.yaml
- repositories.yaml
- context-rules.yaml
- version.yaml

当 Schema 发生变化时：

- 需要 Workspace 迁移；
- 需要更新 AI Agent 加载逻辑。


---

# 9. .sdd 与 AI Agent 关系


`.sdd/` 不负责运行模型。


它不是：

- Agent Runtime；
- 模型服务；
- Trace 平台。


关系：


```
外部 AI Agent Runtime

(Cursor / Claude Code / Trae 等)

↓

读取 .sdd 配置

↓

根据 context-rules.yaml 加载上下文

↓

执行开发任务

↓

修改 Workspace
```


---

# 10. .sdd 与 Workspace 关系


AI Agent 执行任务时：


读取：


```
.sdd/

↓

standards/

↓

product/

↓

delivery/

↓

implementation/
```


根据 context-rules.yaml 选择对应阶段的上下文。


---

例如：

用户要求：

```
实现订单退款功能
```


执行流程：


```
读取 .sdd/context-rules.yaml（确定当前阶段）

↓

读取 Product 需求

↓

创建 Delivery Change

↓

进入 design 阶段（读取 standards/ + product/ + implementation/）

↓

进入 dev 阶段（读取 delivery/ + implementation/）

↓

修改 Implementation

↓

进入 test 阶段（验证实现）

↓

生成 Evidence
```


---

# 11. AI Agent 使用规则


AI Agent 使用 `.sdd/` 时必须：


```
识别当前任务阶段

↓

读取 context-rules.yaml

↓

加载对应阶段上下文

↓

遵守 Standards

↓

更新 Delivery

↓

验证 Implementation
```


---

禁止：

## 11.1 绕过 SDD 流程


例如：


```
需求

↓

直接修改代码
```


应通过 Change 流程。


---

## 11.2 修改控制文件结构


禁止：

- 删除核心配置文件；
- 修改 YAML 字段协议；
- 修改 Workspace 协议。


---

## 11.3 将业务知识存入 .sdd


禁止存放：


```
业务规则

产品需求

技术设计
```


这些属于：


```
product/

delivery/

standards/
```


`.sdd/` 只保存控制配置，不保存业务知识。


---

# 12. .sdd 生命周期


`.sdd/` 属于 Harness 基础能力。


生命周期：


```
sdd init 创建

↓

项目演进中维护

↓

Harness 升级时同步

↓

版本发布
```


---

# 13. v0.1 范围


当前版本 `.sdd/` 负责：


```
Workspace 配置管理

仓库接入管理

AI 上下文规则定义

Harness 版本追踪
```


暂不负责：


```
Skill 管理

Workflow 编排

Template 生成

Agent Runtime

模型调用

Trace 系统

部署平台
```


这些能力将在后续版本（Phase 1.2+）逐步引入。


---

# 14. 总结


`.sdd/` 是 OpenSpec Harness 的配置入口。


它连接：


```
AI Agent

↓

.sdd 配置

↓

四世界上下文

↓

软件交付结果
```


通过 `.sdd/`：

AI Agent 能够：

- 知道当前 Workspace 是什么；
- 知道接入哪些代码仓库；
- 知道当前阶段应读取哪些知识；
- 知道使用哪个版本的 Harness。


AI 不只是生成代码，

而是在统一配置、规则和流程下参与软件开发。
