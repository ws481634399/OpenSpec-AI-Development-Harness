# Tool Calling规范

> 版本：v0.1  
> 类型：AI工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 AI Agent 调用外部工具（Tool Calling）的设计、实现和管理规范。


目标：

- 保证 AI 与外部系统交互安全可靠；
- 规范 Tool 的设计方式；
- 降低 Agent 与工具之间的耦合；
- 提升 AI 应用可维护性；
- 指导 AI Coding Agent 正确设计和使用工具能力。


Tool Calling 是连接：

```
AI Agent

+

外部能力

+

业务系统
```

的桥梁。


---

# 2. Tool设计原则


## 2.1 单一职责


一个 Tool 应该负责一个明确能力。


推荐：

```
search_product

查询商品信息
```


```
create_order

创建订单
```


避免：

```
do_everything

执行所有业务操作
```


---

## 2.2 Tool应该表达业务能力


Tool 不应该暴露底层实现。


推荐：

```
get_order_detail(orderId)
```


不推荐：

```
execute_sql(sql)
```


原因：

- 增加安全风险；
- 暴露内部结构；
- 降低可维护性。


---

## 2.3 Tool输入输出明确


每个 Tool 必须定义：

- 输入参数；
- 参数类型；
- 返回结构；
- 错误情况。


避免：

模糊输入。


---

# 3. Tool结构规范


一个标准 Tool 应包含：


```
Tool

├── Metadata

├── Description

├── Input Schema

├── Execution Logic

├── Output Schema

└── Error Handling
```


---

# 3.1 Metadata


描述 Tool 基础信息。


包括：

- 名称；
- 版本；
- 所属领域；
- 权限要求。


示例：

```yaml
name: query_order

version: 1.0.0

domain: order
```


---

# 3.2 Description


Tool描述应该清晰说明：

- 可以做什么；
- 什么时候使用；
- 不应该什么时候使用。


示例：


```
查询指定订单的详细信息。

用于订单状态查询场景。
```


---

# 3.3 Input Schema


输入必须结构化。


推荐：


```json
{
  "orderId":"10001"
}
```


避免：

```json
{
  "input":"帮我查一下订单"
}
```


---

# 3.4 Output Schema


输出应该稳定。


推荐：


```json
{
  "orderId":"10001",
  "status":"PAID"
}
```


避免：

不同情况下返回完全不同结构。


---

# 4. Tool命名规范


Tool名称应该：

- 简洁；
- 表达动作；
- 具有业务含义。


推荐：


```
query_user

create_payment

search_product
```


避免：


```
tool1

process

handleData
```


---

# 5. Tool调用流程


标准流程：


```
User Request

↓

Agent Reasoning

↓

Select Tool

↓

Validate Parameters

↓

Execute Tool

↓

Process Result

↓

Generate Response
```


---

# 6. Tool权限管理


Tool 必须遵循：

```
最小权限原则
```


---

## 6.1 查询类Tool


例如：

```
query_order
```


通常：

只允许读取。


---

## 6.2 修改类Tool


例如：

```
create_order
```


需要：

- 明确授权；
- 参数验证；
- 操作确认。


---

## 6.3 高风险Tool


例如：

- 删除数据；
- 修改配置；
- 执行系统操作。


需要：

- 额外确认；
- 权限控制；
- 操作审计。


---

# 7. Tool安全规范


## 7.1 参数校验


Tool执行前必须检查：


- 参数格式；
- 参数范围；
- 权限。


---

## 7.2 防止越权


Tool不能：

绕过业务权限。


例如：

用户不能通过 AI Tool 查询无权限数据。


---

## 7.3 敏感数据保护


Tool返回结果：

禁止包含：

- 密钥；
- Token；
- 内部敏感信息。


---

# 8. Tool错误处理规范


Tool执行失败应该返回明确错误。


示例：


```json
{
  "success":false,
  "errorCode":"ORDER_NOT_FOUND",
  "message":"订单不存在"
}
```


---

错误类型包括：


## 参数错误


例如：

```
缺少orderId
```


---

## 业务错误


例如：

```
订单状态不允许取消
```


---

## 系统错误


例如：

```
服务不可用
```


---

# 9. Tool与业务系统关系


Tool 不应该替代业务系统。


正确关系：


```
AI Agent

↓

Tool

↓

Application Service

↓

Business System
```


Tool 是业务能力入口。


不是业务逻辑实现位置。


---

# 10. Tool版本管理


Tool属于工程资产。


需要版本管理。


格式：


```
Major.Minor.Patch
```


例如：

```
query_order

1.0.0
```


---

版本变化：


## Patch


修复：

- 描述；
- 参数说明；
- 错误处理。


---

## Minor


新增：

- 可选参数；
- 新返回字段。


---

## Major


破坏性变化：

- 修改参数结构；
- 修改返回结构。


---

# 11. AI Agent Tool使用规则


AI Agent 使用 Tool 时必须：


执行：


```
理解任务

↓

选择合适Tool

↓

验证输入

↓

调用Tool

↓

验证结果
```


---

AI 不应该：


## 11.1 随意调用Tool


调用前必须确认：

- Tool用途；
- 参数正确；
- 用户权限。


---

## 11.2 通过Tool绕过业务规则


禁止：

直接修改底层数据。


---

## 11.3 隐藏Tool执行结果


Tool调用结果应该：

- 被正确处理；
- 必要时反馈用户。


---

# 12. Tool测试规范


Tool上线前需要验证：


```
[ ] 输入参数正确

[ ] 输出结构稳定

[ ] 异常处理完整

[ ] 权限控制有效

[ ] 高风险操作受保护

[ ] Agent能够正确调用
```


---

# 13. Tool与OpenSpec关系


Tool修改属于 Change。


流程：


```
Requirement

↓

Change

↓

Tool Design

↓

Implementation

↓

Evaluation

↓

Evidence
```


---

# 14. Tool设计检查清单


```
[ ] Tool职责明确

[ ] 输入输出定义清晰

[ ] 权限范围明确

[ ] 错误处理完整

[ ] 版本可管理

[ ] 有测试验证
```


---

# 15. 总结


Tool Calling规范用于保证：


```
Agent

+

Tool

+

Business System

+

Security
```


形成可靠 AI 应用能力。


优秀 Tool 应该：

- 能力明确；
- 权限可控；
- 结果稳定；
- 易维护。
