# 后端接口设计规范

> 版本：v0.1  
> 类型：后端工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义后端 API 接口实现规范。


目标：

- 保证接口设计统一；
- 明确接口层职责；
- 提升前后端协作效率；
- 降低接口维护成本；
- 指导 AI Coding Agent 正确设计和修改后端接口。


---

# 2. API设计原则


## 2.1 接口面向业务能力


API 应该表达业务能力，而不是简单暴露数据库操作。


推荐：

```
POST /orders
```


表示：

创建订单业务。


不推荐：

```
POST /insertOrder
```


直接暴露数据库行为。


---

## 2.2 接口职责明确


一个接口应该完成明确业务动作。


避免：

- 一个接口处理多个无关流程；
- 根据大量参数产生不同业务行为。


---

## 2.3 接口稳定性


接口发布后应该保持兼容。


修改已有接口时：

优先：

- 增加字段；
- 新增接口；
- 使用版本升级。


避免：

- 修改字段含义；
- 删除已有字段；
- 改变返回结构。


---

# 3. Controller设计规范


## 3.1 Controller职责


Controller负责：


- 接收请求；
- 参数校验；
- 调用应用服务；
- 返回响应。


Controller不负责：


- 核心业务逻辑；
- 数据访问；
- 复杂流程处理。


正确结构：


```
Controller

↓

Application Service

↓

Domain Service

↓

Repository
```


---

## 3.2 Controller命名


推荐：

```
OrderController

PaymentController

UserController
```


避免：

```
CommonController

BusinessController
```


---

## 3.3 Controller方法设计


方法名称应该表达业务行为。


推荐：

```
createOrder()

cancelOrder()

queryOrder()
```


避免：

```
handle()

process()
```


---

# 4. 请求对象设计


## 4.1 使用Request DTO


接口请求应该使用独立 DTO。


推荐：

```
OrderCreateRequest
```


避免：

直接使用领域对象。


例如：

不推荐：

```
create(Order entity)
```


---

## 4.2 请求参数校验


请求进入系统时应该进行基础校验。


包括：


- 必填校验；
- 格式校验；
- 长度校验；
- 范围校验。


例如：


```
订单编号不能为空

金额必须大于0
```


---

## 4.3 DTO职责


Request DTO：

负责：

```
外部输入

↓

系统内部
```


不负责：

- 业务规则；
- 数据保存。


---

# 5. 响应对象设计


## 5.1 使用Response DTO


接口返回应该使用独立响应对象。


推荐：

```
OrderResponse
```


避免：

直接返回：

```
Domain Entity
```


原因：

- 防止暴露内部模型；
- 降低接口耦合。


---

## 5.2 统一响应结构


推荐：

```json
{
  "code":0,
  "message":"success",
  "data":{}
}
```


字段说明：


|字段|说明|
|-|-|
|code|业务状态码|
|message|提示信息|
|data|业务数据|


---

# 6. 参数校验规范


## 6.1 基础校验


属于接口层。


例如：

- 是否为空；
- 格式是否正确。


---

## 6.2 业务校验


属于业务层。


例如：

```
订单是否允许取消

用户是否有权限操作
```


不要：

将业务规则放在 Controller。


---

# 7. 异常处理规范


## 7.1 统一异常处理


系统应该统一处理异常。


包括：

- 参数异常；
- 业务异常；
- 系统异常。


---

## 7.2 业务异常


业务失败应该返回明确错误。


例如：

```
ORDER_STATUS_INVALID
```


而不是：

```
ERROR
```


---

## 7.3 系统异常


系统异常应该：

- 记录日志；
- 返回安全信息；
- 避免暴露内部细节。


---

# 8. 分页接口规范


分页查询统一设计。


请求：


```
GET /orders?page=1&size=20
```


响应：

```json
{
  "items":[],
  "page":1,
  "size":20,
  "total":100
}
```


---

# 9. 接口版本管理


## 9.1 版本策略


重大接口变化需要版本升级。


例如：


```
/api/v1/orders

/api/v2/orders
```


---

## 9.2 非破坏性修改


以下通常不需要升级版本：

- 增加返回字段；
- 增加可选参数；
- 新增接口。


---

# 10. 接口安全规范


接口设计需要考虑：


## 身份认证


确认：

- 用户身份；
- Token有效性。


---

## 权限控制


确认：

- 用户是否具有操作权限；
- 数据访问范围。


---

## 参数安全


防止：

- 非法输入；
- SQL注入；
- 数据泄露。


---

# 11. AI Coding Agent接口修改规则


AI 修改接口前必须读取：


```
delivery/

design.md

+

api-design-standard.md

+

api-standard.md

+

implementation/
```


确认：


- 接口影响范围；
- 请求响应变化；
- 前端影响；
- 兼容策略。


---

AI 不应该：


## 11.1 直接修改接口协议


接口变化必须经过：

```
Change

↓

Design

↓

Implementation

↓

Validation
```


---

## 11.2 绕过DTO设计


禁止：

```
Controller

直接返回Entity
```


---

## 11.3 隐藏接口变化


接口变化必须记录：

- 修改原因；
- 影响范围；
- 测试结果。


---

# 12. 接口设计检查清单


提交前检查：


```
[ ] Controller职责清晰

[ ] Request DTO定义明确

[ ] Response DTO定义明确

[ ] 参数校验完整

[ ] 异常处理统一

[ ] 权限控制明确

[ ] 接口文档更新

[ ] 测试已验证
```


---

# 13. 与Change流程关系


接口变化属于 Change。


流程：


```
Requirement

↓

Change

↓

API Design

↓

Implementation

↓

Test Evidence
```


---

# 14. 总结


后端接口设计规范用于保证：


```
Controller

+

DTO

+

Service

+

Client
```


之间保持清晰协作。


良好的 API 设计应该：

- 语义明确；
- 稳定可靠；
- 易扩展；
- 易维护。
