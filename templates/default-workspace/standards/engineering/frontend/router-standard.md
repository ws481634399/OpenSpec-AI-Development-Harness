# 前端路由规范

> 版本：v0.1  
> 类型：前端工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义前端应用路由设计、组织、权限控制和维护规范。


目标：

- 保证页面访问路径统一；
- 提升前端应用结构清晰度；
- 规范页面与权限关系；
- 降低路由维护成本；
- 指导 AI Coding Agent 正确设计和修改路由。


---

# 2. 路由设计原则


## 2.1 路由表达业务页面


路由应该表达用户访问的业务资源。


推荐：

```
/orders

/orders/:id

/products
```


避免：

```
/page1

/test

/detail
```


---

## 2.2 路由结构稳定


路由一旦发布，应尽量保持稳定。


避免：

- 随意修改已有路径；
- 修改页面语义；
- 删除正在使用的路由。


如果需要重大调整：

应该通过 Change 管理。


---

## 2.3 路由职责明确


一个路由应该对应明确页面能力。


避免：

一个页面根据大量参数变化成为多个业务入口。


---

# 3. 路由目录规范


推荐结构：


```
src/

└── router/

    ├── index.ts

    ├── routes/

    │
    ├── modules/

    │
    └── guards/
```


---

## 3.1 index.ts


职责：

初始化路由。


包含：

- Router实例创建；
- 全局配置。


不应该：

包含大量业务路由。


---

## 3.2 routes/modules


按照业务模块拆分路由。


例如：


```
router/

└── modules/

    ├── user.ts

    ├── order.ts

    └── product.ts
```


避免：

所有路由集中在一个巨大文件。


---

## 3.3 guards


存放路由守卫。


例如：

```
auth-guard.ts

permission-guard.ts
```


---

# 4. 路由命名规范


## 4.1 Path命名


使用小写和短横线。


推荐：

```
/order-management

/product-list
```


避免：

```
/OrderManagement

/ProductList
```


---

## 4.2 Name命名


路由名称应该具有唯一性。


推荐：

```
OrderList

OrderDetail
```


避免：

```
Page1

Detail
```


---

## 4.3 参数命名


参数名称应该表达业务含义。


推荐：

```
/orders/:orderId
```


避免：

```
/orders/:id
```


当业务复杂时：

应该使用明确名称。


---

# 5. 页面组织规范


路由应该对应页面组件。


推荐：

```
pages/

├── order/

│
├── OrderList.vue

└── OrderDetail.vue
```


关系：

```
Route

↓

Page Component

↓

Business Component
```


---

# 6. 路由懒加载规范


大型应用应该使用懒加载。


目的：

- 减少首次加载资源；
- 提升页面性能。


示例：

```typescript
component: () =>
  import('@/pages/order/OrderList.vue')
```


---

# 7. 路由权限规范


## 7.1 权限控制原则


权限应该由：

```
用户身份

+

权限规则

+

路由配置
```


共同决定。


---

## 7.2 公开路由


无需登录访问。


例如：

```
/login

/register
```


---

## 7.3 受保护路由


需要认证。


例如：

```
/dashboard

/orders
```


---

## 7.4 权限路由


需要具体权限。


例如：

```
订单管理页面

需要:

order:view
```


---

# 8. 路由元信息规范


路由应该通过 meta 描述页面属性。


示例：


```typescript
{
 path:'/orders',
 meta:{
   title:'订单管理',
   requiresAuth:true,
   permission:'order:view'
 }
}
```


常见字段：


|字段|说明|
|-|-|
|title|页面标题|
|requiresAuth|是否需要登录|
|permission|权限标识|
|keepAlive|是否缓存|


---

# 9. 路由与菜单关系


菜单不应该重复维护路由信息。


推荐：

```
Route Config

↓

Generate Menu
```


避免：

```
菜单配置一份

路由配置一份
```


导致不一致。


---

# 10. 路由状态管理


路由相关状态包括：


- 当前页面；
- 页面参数；
- 查询参数；
- 面包屑。


应该根据作用范围管理。


避免：

将所有路由信息复制到全局状态。


---

# 11. AI Coding Agent 路由修改规则


AI 修改路由前必须读取：


```
delivery/

design.md

+

frontend standards

+

existing routes
```


确认：

- 页面影响范围；
- 权限影响；
- 菜单影响；
- 用户访问路径影响。


---

AI 不应该：


## 11.1 随意修改已有路径


已有业务路由修改：

必须通过 Change。


---

## 11.2 绕过权限控制


禁止：

新增页面但未配置权限。


---

## 11.3 创建重复路由


新增页面前：

必须检查已有路由。


---

# 12. 路由测试要求


路由变更应该验证：


```
[ ] 页面可以正常访问

[ ] 路径符合规范

[ ] 登录状态正确

[ ] 权限控制正确

[ ] 页面跳转正常

[ ] 浏览器刷新正常
```


---

# 13. 路由变更流程


路由修改属于 Change。


流程：


```
Requirement

↓

Change

↓

Design

↓

Route Change

↓

Test

↓

Evidence
```


---

# 14. 总结


路由规范用于保证：


```
页面结构

+

访问路径

+

权限控制

+

用户体验
```


保持一致。


良好的路由设计应该：

- 语义清晰；
- 结构稳定；
- 权限明确；
- 易维护。
