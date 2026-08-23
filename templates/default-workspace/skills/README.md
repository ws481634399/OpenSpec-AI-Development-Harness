# Skills 能力声明

> 版本：v0.1  
> 类型：AI Development Skill Registry  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 OpenSpec Workspace 中 `skills/` 目录的职责和使用方式。


`skills/` 用于声明当前项目使用的 AI 开发能力。


它描述：

```
项目需要哪些Skill

+

这些Skill用于哪些开发流程
```


不负责：

```
Skill实现

Agent Runtime

模型调用
```


---

# 2. Skills 定位


OpenSpec Workspace 中：


```
Standards

定义规则


Product

定义目标


Delivery

管理变化


Implementation

保存实现


Skills

提供执行能力
```


Skills 是连接：

```
AI Agent

↓

工程流程

↓

Workspace
```

的能力入口。


---

# 3. v0.1设计原则


## 3.1 不存放Skill实现


v0.1阶段：

Workspace 不复制 Skill 源码。


例如：


不创建：

```
skills/

└── sdd-development/

    ├── skill.yaml

    ├── prompt.md

    └── scripts/
```


原因：

Skill属于 Harness 能力，不属于项目资产。


---

## 3.2 只记录使用关系


当前目录用于记录：

- 使用哪些 Skill；
- Skill用途；
- Skill版本；
- Skill来源。


---

# 4. 推荐结构


v0.1：

```
skills/

└── README.md
```


未来扩展：


```
skills/

├── README.md

└── registry.yaml
```


用于记录：

- Skill名称；
- 来源；
- 版本；
- 描述。


---

# 5. Skill概念


Skill 是：

> 一个可执行的软件工程能力单元。


一个 Skill 应该具有：


```
输入

↓

处理流程

↓

输出产物
```


例如：

## sdd-change-create


作用：

创建一次新的 Change。


输入：

```
Feature需求
```


输出：

```
delivery/changes/CHG-XXX/
```


---

## sdd-design


作用：

生成技术设计。


输入：

```
Change
```


输出：

```
design.md
```


---

## sdd-development


作用：

执行开发任务。


输入：

```
Design

+

Tasks
```


输出：

```
Implementation修改
```


---

## sdd-test


作用：

验证实现。


输入：

```
Implementation
```


输出：

```
Evidence
```


---

# 6. Skill使用流程


标准流程：


```
User Request

↓

AI Agent

↓

选择Skill

↓

读取Workspace上下文

↓

执行Skill

↓

生成产物
```


---

例如：

实现新功能：


```
需求

↓

sdd-change-create

↓

sdd-design

↓

sdd-development

↓

sdd-test

↓

Evidence
```


---

# 7. Skill与Workspace关系


Skill 可以读取：


```
standards/

product/

delivery/

implementation/
```


根据任务阶段加载对应上下文。


---

Skill产生的结果：

主要写入：


```
delivery/

implementation/
```


例如：


Change：

```
delivery/changes/
```


代码：

```
implementation/
```


验证：

```
delivery/changes/CHG-XXX/evidence/
```


---

# 8. AI Agent使用规则


AI Agent 使用 Skill 时：


必须：

```
确认任务目标

↓

选择匹配Skill

↓

加载必要上下文

↓

执行流程

↓

验证结果
```


---

禁止：

## 8.1 跳过Skill流程


例如：


```
需求

↓

直接修改代码
```


---

## 8.2 修改Skill定义


项目不能直接修改 Harness Skill。


如果 Skill 需要变化：

应该：

```
更新Harness Skill Repository
```


---

# 9. Skill版本管理


Skill应该记录：


```
名称

版本

来源
```


例如：

```
sdd-development

version: 0.1.0

source: OpenSpec-Harness
```


---

# 10. 与 .sdd 的关系


关系：


```
.sdd/

控制Workspace配置


skills/

声明项目使用能力
```


区别：

|目录|职责|
|-|-|
|.sdd|SDD控制配置|
|skills|AI能力声明|


---

# 11. 与 Agent Runtime 的关系


Skill 不等于 Agent。


关系：


```
Agent Runtime

↓

调用Skill

↓

Skill操作Workspace
```


例如：

```
Cursor

Claude Code

Trace Agent
```

负责运行。


Skill负责：

```
定义如何完成开发动作
```


---

# 12. 总结


`skills/` 是 OpenSpec Workspace 的 AI 能力声明层。


它用于：

```
连接AI Agent

+

SDD流程

+

项目Workspace
```


v0.1阶段：

保持轻量：

```
只声明

不实现
```

未来可以扩展：

```
Skill Registry

Skill Marketplace

Skill Version Management
```
