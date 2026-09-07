# 产品知识（Product Knowledge）

> 版本：v0.1  
> 类型：Workspace 世界定义  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 OpenSpec Workspace 中 Product 世界的职责、内容范围和管理规则。


Product 世界用于存放：

```
产品需求

+

业务知识

+

用户价值

+

功能定义
```


它描述：

```
系统需要解决什么问题
```


而不是：

```
系统如何实现
```


---

# 2. Product 世界定位


OpenSpec Workspace 分为四个核心世界：


```
Standards

规则世界


Product

产品世界


Delivery

交付世界


Implementation

实现世界
```


Product 位于：

```
业务目标

↓

功能定义

↓

开发交付
```


之间。


---

# 3. Product 与其他世界关系


## 3.1 Product 与 Standards


关系：

```
Product

使用

Standards
```


例如：


产品提出：

```
需要实现订单管理能力
```


Standards约束：

```
需求如何管理

如何设计Change

如何验证
```


---

## 3.2 Product 与 Delivery


关系：

```
Product

产生

Delivery
```


例如：

产品需求：

```
支持订单取消
```


转换为：

```
Change

Design

Task

Test Evidence
```


---

## 3.3 Product 与 Implementation


关系：

```
Product

最终由

Implementation
```


实现。


但是：

```
代码行为

≠

产品规则
```


代码只能作为产品知识分析依据。


---

# 4. Product 内容范围


Product 世界主要包含：


```
业务目标

用户角色

业务术语

Feature

业务规则

产品规划
```


---

# 5. 推荐目录结构


默认结构：


```
product/

├── README.md

├── feature-tree.yaml

├── features/

├── specs/

└── glossary/
```


---

# 6. 内容说明


## 6.1 feature-tree.yaml


管理产品能力树。


初始化：


```yaml
features: []
```


作用：

- 汇总产品能力；
- 维护 Feature 之间的层级关系；
- 提供产品整体视图。


---

## 6.2 features/


feature-tree 的派生缓存（SSOT 派生，只读）。

由 `openspec feature materialize` 从 `feature-tree.yaml` 清空重建：

- L1/L2/L3 目录为空（仅作 IDE 导航）；
- 仅 Story 级目录含 README.md（面包屑、简介、Change 历史、审计包链接）。

禁止手改本目录；树内容以 `feature-tree.yaml` 为准，发现不一致时重跑 materialize。


---

## 6.3 specs/


存储已确认的产品规则（正式规格）。

组织约定：


```
specs/

├── 订单能力.md

└── 账户能力.md
```


按 L2 Feature 域一个文件，文件格式见 `templates/artifacts/product-spec.md`（front-matter 含 source-chg / promoted-at / status: approved）。

晋升机制：

- Agent 在 converge 阶段将 SPEC 草稿写入 convergence.md 的「Spec 晋升候选」节；
- 人工评审通过后，才落入本目录；
- Agent 不得绕过评审直接写入 specs/。

内容包括：

- 产品需求规格；
- 业务规则（如订单取消规则、优惠计算规则、会员等级规则）；
- 验收标准。


spec 用于沉淀已经确认的产品知识，作为开发依据。


---

## 6.4 glossary/


存储业务术语（单文件表格式）。

约定文件：

```
glossary/

└── terms.md
```


terms.md 为表格式术语表，每个条目包含：

- 术语名称；
- 定义；
- 使用范围；
- 关联概念。


业务术语示例：

```
订单

商品

库存

会员
```


---

# 7. Product 知识生命周期


Product 内容应该经过生命周期管理。


流程：


```
Draft

↓

Review

↓

Approved

↓

Active

↓

Deprecated
```


---

# 8. Product 文档原则


## 8.1 面向业务


Product 文档应该使用：

- 业务语言；
- 用户语言；
- 产品语言。


避免：

大量技术实现描述。


---

## 8.2 保持稳定


Product 中的内容：

应该描述长期业务能力。


避免：

记录临时开发过程。


---

## 8.3 可追踪


重要产品知识应该包含：


```
来源

版本

状态

关联Feature
```


---

# 9. AI 使用 Product 知识规则


AI Agent 使用 Product 知识时：


应该用于：

- 理解业务目标；
- 分析需求；
- 生成设计；
- 验证实现。


---

AI 不应该：


## 9.1 将代码行为直接作为产品规则


例如：


Implementation：

```
当前代码订单超过30分钟不可取消
```


不能直接认为：

```
产品规则就是30分钟
```


需要确认。


---

## 9.2 修改已批准产品知识


Approved Product 内容：

不得被 AI 自动覆盖。


---

## 9.3 混入技术设计


以下内容不应该放入 Product：


```
数据库表设计

接口路径

代码结构

技术框架
```


这些属于：

```
Delivery

Implementation

Standards
```


---

# 10. Product 与 SDD 流程关系


产品变化流程：


```
Product Requirement

↓

Change

↓

Design

↓

Implementation

↓

Validation
```


---

# 11. Product 检查清单


新增产品知识时检查：


```
[ ] 是否属于业务内容

[ ] 是否描述用户价值

[ ] 是否明确范围

[ ] 是否有状态

[ ] 是否可追踪

[ ] 是否避免技术实现
```


---

# 12. 总结


Product 世界用于保存：

```
为什么做

+

做什么
```


它连接：

```
业务目标

↓

功能需求

↓

软件交付
```


通过 Product 知识：

AI 能够理解系统建设目的，而不是只根据代码推理业务。
