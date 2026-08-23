# 代码规范

> 版本：v0.1  
> 类型：工程通用规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义软件开发过程中的代码质量和代码维护规范。


目标：

- 提升代码可读性；
- 降低系统维护成本；
- 保证 AI Coding Agent 生成代码符合工程要求；
- 建立统一代码质量标准。


---

# 2. 基本原则


## 2.1 可读性优先


代码首先应该服务于阅读者。


要求：

- 使用清晰、有意义的命名；
- 避免复杂的逻辑嵌套；
- 避免不必要的抽象。


示例：


推荐：

```java
OrderStatus orderStatus;
```


不推荐：

```java
int x;
```


---

## 2.2 单一职责


一个模块、类、方法应该拥有明确职责。


避免：


- 一个类承担多个业务职责；
- 一个方法处理多个无关流程；
- 大量条件分支堆积。


---

## 2.3 简单优先


优先选择简单、明确的实现。


避免：

- 过度设计；
- 为未来不存在的需求提前扩展；
- 复杂设计替代简单方案。


---

# 3. 命名规范


## 3.1 基本要求


命名应该表达业务含义。


推荐：

```
createOrder()
calculatePaymentAmount()
```


避免：

```
doSomething()
handleData()
process()
```


---

## 3.2 类命名


类名应该使用名词。


示例：

```
OrderService

PaymentProcessor

UserRepository
```


避免：

```
OrderManagerHelperUtil
```


---

## 3.3 方法命名


方法名应该体现行为。


推荐：

```
cancelOrder()

queryUserById()
```


避免：

```
order()

user()
```


---

## 3.4 变量命名


变量应该表达实际含义。


推荐：

```
expiredAt

paymentStatus

customerId
```


避免：

```
data

temp

value
```


---

# 4. 代码结构规范


## 4.1 方法设计


方法应该：

- 保持职责单一；
- 控制复杂度；
- 避免过长。


复杂逻辑应该拆分。


---

## 4.2 类设计


类应该：

- 具有明确职责；
- 避免成为万能类；
- 降低模块之间耦合。


避免：

```
XXXManager

XXXHelper

XXXUtil
```


无限扩展。


---

## 4.3 注释规范


注释应该解释：

- 为什么这样设计；
- 复杂业务原因；
- 特殊限制。


不要注释：

显而易见的代码。


例如：

不推荐：

```java
// 设置用户名
user.setName(name);
```


推荐：

```java
// 用户名修改需要同步更新搜索索引
updateSearchIndex(user);
```


---

# 5. 异常处理规范


## 5.1 不允许隐藏异常


禁止：

```java
try {

}
catch(Exception e){

}
```


异常必须：

- 记录；
- 转换；
- 继续抛出。


---

## 5.2 使用明确异常类型


避免：

```
Exception
```


推荐：

```
OrderNotFoundException

PaymentFailedException
```


---

# 6. 日志规范


日志应该包含必要上下文。


例如：


推荐：

```
订单取消失败 orderId=10001
```


避免：

```
error
failed
```


---

日志级别：


|级别|用途|
|-|-|
|DEBUG|调试信息|
|INFO|正常业务流程|
|WARN|潜在问题|
|ERROR|异常错误|


---

# 7. 代码提交规范


一次提交应该对应明确目标。


推荐：

```
feat: add order cancellation

fix: resolve payment timeout issue
```


避免：

```
update

modify

change
```


---

# 8. AI Coding Agent代码要求


AI Agent 修改代码时必须：


## 修改前


读取：

```
delivery/

design.md

implementation/
```


理解：

- 当前需求；
- 技术方案；
- 现有代码结构。


---

## 修改中


遵守：

- 项目现有代码风格；
- 架构约束；
- 命名规范。


---

## 修改后


提供：

- 修改文件列表；
- 修改原因；
- 测试结果；
- 潜在风险。


---

# 9. 禁止行为


AI 和开发人员禁止：


## 9.1 随意重构


未经 Change：

禁止：

- 大规模代码调整；
- 修改系统结构。


---

## 9.2 删除未知代码


发现无法理解的代码：

应该分析，而不是直接删除。


---

## 9.3 引入无依据依赖


新增依赖必须说明：

- 使用原因；
- 影响范围；
- 维护成本。


---

# 10. 与 OpenSpec Change 的关系


代码修改必须属于 Change。


流程：


```
Change

↓

Design

↓

Task

↓

Implementation

↓

Evidence
```


代码不是独立产生的。


---

# 11. 代码质量检查


提交前检查：


```
[ ] 命名清晰

[ ] 职责明确

[ ] 无明显重复代码

[ ] 异常处理合理

[ ] 日志符合规范

[ ] 测试已验证
```


---

# 12. 总结


代码规范用于保证：

```
人工开发

+

AI代码生成

+

长期维护
```


保持一致。


好的代码不仅能够运行，还应该：

- 容易理解；
- 容易修改；
- 容易验证。
