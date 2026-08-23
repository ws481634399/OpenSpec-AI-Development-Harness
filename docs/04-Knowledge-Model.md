# OpenSpec AI Development Harness Knowledge Model

> Version: v1.0  
> Status: Draft  
> Type: Knowledge Architecture Specification

# 1. Knowledge Model Overview

## 1.1 设计目标

OpenSpec Harness 认为：

> AI 开发的核心问题不是代码生成，而是项目知识管理。

一个成熟项目包含：

- 业务知识；
- 产品能力；
- 技术规则；
- 架构决策；
- 历史变化；
- 实现细节。

这些信息必须被结构化管理，才能被 AI 长期复用。

---

# 1.2 Knowledge Architecture

OpenSpec 使用四世界模型：

```
OpenSpec Knowledge Model
┌─────────────────────┐
│  Standards World    │
│  项目规则            │
└─────────┬───────────┘
          |
          |
┌─────────▼───────────┐
│  Product World      │
│  产品能力            │
└─────────┬───────────┘
          |
          |
┌─────────▼───────────┐
│  Delivery World     │
│  变化过程            │
└─────────┬───────────┘
          |
          |
┌─────────▼───────────┐
│ Implementation      │
│ 代码实现            │
└─────────────────────┘
```

---

# 2. Knowledge 四世界

# 2.1 Standards World

目录：

```
standards/
```

职责：

> 描述项目应该遵守什么。

内容包括：

- 通用开发规范；
- 架构规则；
- 项目约束；
- 设计原则。

结构：

```
standards/
├── sdd/
├── engineering/
└── project/
```

---

## sdd/

定义：

OpenSpec流程规则。

例如：

```
Change必须经过Design阶段才能进入Dev。
```

状态：

```
approved
```

---

## engineering/

定义：

工程规范。

例如：

```
API必须使用REST规范。
数据库变更必须提供Migration。
```

---

## project/

定义：

项目专属规则。

例如：

```
订单取消必须释放库存。
```

来源：

- 人工定义；
- 架构决策；
- 知识逆向。

---

# 2.2 Product World

目录：

```
product/
```

职责：

> 描述产品是什么。

不描述：

- 技术实现；
- 代码结构。

结构：

```
product/
├── feature-tree.yaml
├── features/
├── specs/
└── glossary/
```

---

# Feature Tree

定义：

产品能力层级。

例如：

```
电商平台
├── 用户中心
│
├── 商品中心
│
└── 订单中心
    ├── 创建订单
    ├── 查询订单
    └── 取消订单
```

作用：

需求进入时：

判断：

```
属于哪个产品能力？
```

---

# Features

定义：

具体产品能力。

例如：

```
features/
└── FEAT-ORDER-CANCEL.md
```

内容：

```yaml
id:
 FEAT-ORDER-CANCEL
name:
订单取消
status:
approved
```

---

# Specs

定义：

已经确认的产品规则。

例如：

```
订单取消必须填写取消原因。
```

注意：

Spec必须经过确认。

逆向发现的内容：

不能直接进入Spec。

---

# Glossary

业务术语。

例如：

```
订单
支付状态
取消原因
退款
```

作用：

统一 AI 理解。

---

# 2.3 Delivery World

目录：

```
delivery/
```

职责：

> 描述项目如何发生变化。

核心：

Change。

结构：

```
delivery/
├── changes/
├── archive/
└── reports/
```

---

# Change

定义：

一次完整需求变化。

例如：

```
CHG-ORDER-001
增加订单取消原因
```

结构：

```
CHG-ORDER-001/
├── request.md
├── prd.md
├── design.md
├── tasks.md
├── evidence/
└── snapshot/
```

---

# Archive

历史交付记录。

例如：

```
archive/
├── CHG-001
├── CHG-002
```

作用：

帮助 AI 理解：

为什么过去这么设计。

---

# Reports

存放：

分析报告。

例如：

```
reverse/
conflicts/
unresolved/
```

---

# 2.4 Implementation World

目录：

```
implementation/
```

职责：

> 存放真实实现。

包含：

- 代码；
- SQL；
- 配置；
- 部署资源；
- 测试。

原则：

## 不进行知识改写

例如：

已有项目：

```
spring-cloud-project/
├── service-a
├── service-b
```

保持原样。

---

# 3. Knowledge 生命周期

知识状态：

```
Discovered
↓
Draft
↓
Pending
↓
Approved
↓
Deprecated
```

---

# 3.1 Discovered

发现阶段。

来源：

- 知识逆向；
- AI分析；
- 代码扫描。

不可直接使用。

---

# 3.2 Draft

草稿。

例如：

```
standards/project/order-rule.md
```

状态：

```
reconstructed_draft
```

---

# 3.3 Pending

等待确认。

例如：

```
是否应该成为正式业务规则？
```

---

# 3.4 Approved

正式知识。

AI可以直接引用。

---

# 3.5 Deprecated

废弃。

保留历史。

---

# 4. Knowledge 来源

## 4.1 Human Created

人工创建。

可信度：

最高。

---

## 4.2 Reverse Generated

知识逆向生成。

例如：

代码：

```
OrderService.java
```

发现：

```
取消订单释放库存
```

生成：

```
standards/project/order-rule.md
```

状态：

```
reconstructed_draft
```

---

## 4.3 Change Generated

来自开发过程。

例如：

Design中确认：

```
新增退款规则
```

Converge阶段：

沉淀：

```
product/specs
```

---

# 5. Knowledge 使用规则

## 5.1 AI读取优先级

优先级：

```
Approved Standards
        >
Approved Specs
        >
Current Change
        >
Historical Archive
        >
Implementation Analysis
```

---

# 5.2 冲突处理

禁止：

自动覆盖。

例如：

Standards：

```
订单必须支持退款。
```

代码：

```
没有退款逻辑。
```

处理：

生成：

```
conflicts.md
```

等待确认。

---

# 6. Knowledge Reverse 模型

旧项目接入：

```
Existing Repository
        |
        |
Knowledge Reverse
        |
----------------------
|          |           |
Standards Product Delivery
```

---

扫描：

## Implementation

读取：

- Code
- SQL
- API
- Config
- Test
- Documentation

---

输出：

## Standards

长期规则。

例如：

```
订单必须经过支付校验。
```

---

## Product

业务能力。

例如：

```
订单中心支持取消。
```

---

## Delivery

历史资料。

例如：

```
旧需求文档。
```

---

# 7. AI Context 使用模型

AI执行Skill时：

不会读取整个项目。

根据阶段加载知识。

---

## Explore阶段

读取：

```
product/
feature-tree
glossary
```

---

## Design阶段

读取：

```
standards/
product/specs/
repository
```

---

## Dev阶段

读取：

```
design
tasks
implementation
```

---

## Converge阶段

读取：

```
Change
Evidence
```

---

# 8. Knowledge Governance

## 正式知识保护

以下不能被AI直接修改：

```
approved standards
approved specs
```

必须：

```
Change
↓
Review
↓
Approve
```

---

# 9. Knowledge 与 Git关系

代码：

Git管理。

知识：

同样Git管理。

关系：

```
Git Commit
        |
        |
Evidence
        |
        |
Knowledge Update
```

例如：

```
Commit:
abc123
修改：
OrderService.java
对应：
CHG-ORDER-001
```

---

# 10. Knowledge Model总结

OpenSpec Knowledge Model:

```
Standards
定义规则
Product
定义能力
Delivery
记录变化
Implementation
保存实现
```

通过：

```
Knowledge Reverse
↓
SDD Workflow
↓
Change
↓
Evidence
↓
Knowledge Update
```

形成：

AI 可理解、可持续维护的软件工程知识体系。
