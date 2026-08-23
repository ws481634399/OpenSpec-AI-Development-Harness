# OpenSpec Default Workspace

> 版本：v0.1  
> 类型：OpenSpec Workspace Template  
> 作用域：Default Workspace


# 1. 文档目的


本文档介绍 OpenSpec Workspace 默认模板结构。


该模板用于初始化一个符合 OpenSpec SDD 流程的项目工作空间。


目标：

```
建立统一项目结构

+

管理项目知识

+

支持AI辅助开发

+

保证开发过程可追踪
```


---

# 2. Workspace定位


OpenSpec Workspace 是 AI 驱动软件开发过程中的统一工作空间。


它连接：


```
业务知识

+

工程规范

+

交付流程

+

真实实现

+

AI执行能力
```


---

# 3. Workspace整体结构


默认结构：


```
workspace/

├── .sdd/

├── standards/

├── product/

├── delivery/

├── implementation/

└── skills/
```


---

# 4. 目录说明


## 4.1 .sdd/


SDD控制目录。


用于保存 Workspace 元数据和上下文规则。


包含：


```
.sdd/

├── workspace.yaml

├── repositories.yaml

├── context-rules.yaml

└── version.yaml
```


职责：

- Workspace配置；
- 仓库映射；
- AI上下文规则；
- Harness版本管理。


---

## 4.2 standards/


规则知识。


用于保存：

```
项目开发规范

+

工程约束

+

SDD流程规则
```


结构：

```
standards/

├── sdd/

├── engineering/

└── project/
```


其中：

### sdd/

定义：

- Change生命周期；
- SDD流程；
- 知识管理规则。


### engineering/

定义：

- 前端规范；
- 后端规范；
- AI工程规范；
- 测试规范。


### project/

定义：

当前项目专属规范。


---

## 4.3 product/


产品知识。


用于保存：

```
为什么做

+

做什么
```


包括：

- 产品目标；
- Feature；
- 业务术语；
- 产品规则。


---

## 4.4 delivery/


交付知识。


用于记录：

```
一次变化如何完成
```


结构：


```
delivery/

├── changes/

│   └── CHG-XXX/

│       ├── request.md

│       ├── prd.md

│       ├── design.md

│       ├── tasks.md

│       └── evidence/

│
├── archive/

└── reports/
```


---

## 4.5 implementation/


实现资产。


用于保存：

```
系统真实实现
```


包括：

- 源代码；
- 配置；
- 数据库；
- 测试；
- 部署资源。


Implementation 是：

```
当前系统真实状态来源
```


---

## 4.6 skills/


AI能力声明。


用于记录：

```
项目使用哪些Skill
```


v0.1阶段：

```
只声明

不存放Skill实现
```


---

# 5. OpenSpec 四世界模型


Workspace核心模型：


```
                 Standards

                规则世界

                    │


Product ─────── Delivery

产品世界       交付世界

                    │


            Implementation

              实现世界
```


---

# 6. AI Agent工作方式


AI Agent 使用 Workspace 时：


```
读取规则

↓

理解产品目标

↓

分析当前Change

↓

修改实现

↓

生成验证证据
```


---

例如：

用户提出：

```
增加订单退款能力
```


执行流程：


```
product/

读取业务目标


↓

delivery/

创建Change


↓

standards/

加载开发规范


↓

implementation/

修改代码


↓

delivery/

生成Evidence
```


---

# 7. 上下文加载规则


AI Agent 不应该一次读取全部内容。


根据任务阶段加载：


完整规则定义见 [.sdd/context-rules.yaml](file:///d:/Desktop/OpenSpec-AI-Development-Harness/templates/default-workspace/.sdd/context-rules.yaml)。


## explore（探索阶段）


目标：

理解需求，分析业务上下文，识别影响范围。


读取：

```
standards/

product/
```


---

## prd（产品规格阶段）


目标：

生成产品规格，定义验收标准，明确业务规则。


读取：

```
product/

delivery/
```


---

## design（设计阶段）


目标：

生成技术设计，分析架构影响，评估风险。


读取：

```
standards/

product/

implementation/
```


---

## task（任务拆分阶段）


目标：

拆分设计为可执行任务，明确修改范围，定义验证方式。


读取：

```
delivery/
```


---

## dev（开发阶段）


目标：

执行 Task，修改实现代码，遵循工程规范。


读取：

```
delivery/

implementation/
```


---

## test（测试阶段）


目标：

验证实现，生成 Evidence，检查质量。


读取：

```
delivery/

implementation/
```


---

## converge（知识沉淀阶段）


目标：

逆向分析，更新项目知识，沉淀经验。


读取：

```
delivery/

implementation/
```


---

# 8. Workspace初始化原则


初始化 Workspace 后：

应该：

```
保留统一目录结构

加载项目知识

接入代码实现

配置AI上下文
```


---

不应该：

```
修改核心目录结构

复制大量代码副本

混淆规则与业务知识
```


---

# 9. AI开发原则


OpenSpec Workspace 遵循：


```
Knowledge First

Specification Driven

Change Controlled

Evidence Based
```


即：

## Knowledge First

AI先理解项目知识。


## Specification Driven

按照规范和设计执行。


## Change Controlled

所有重要变化可追踪。


## Evidence Based

通过证据证明完成。


---

# 10. 与外部Agent工具关系


OpenSpec Workspace 不提供 Agent Runtime。


它可以运行在：

```
Cursor

Claude Code

字节Trace

其他AI开发工具
```


关系：


```
Agent Runtime

↓

OpenSpec Workspace

↓

Skills

↓

项目资产
```


---

# 11. 版本说明


当前版本：

```
OpenSpec Workspace Template v0.1
```


v0.1目标：

完成：

```
Workspace结构

+

知识分层

+

SDD流程基础

+

AI上下文规则
```


暂不包含：

```
Agent Runtime

Skill执行平台

自动化编排系统
```


---

# 12. 总结


OpenSpec Workspace 提供一个统一的 AI 软件开发空间。


通过：


```
Standards

+

Product

+

Delivery

+

Implementation

+

Skills
```


让 AI Agent 能够：

- 理解项目；
- 遵守规范；
- 管理变化；
- 修改代码；
- 沉淀知识。


最终形成：

```
AI驱动

规范化

可追踪

持续演进

的软件开发体系
```
