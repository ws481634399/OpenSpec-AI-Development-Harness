---
title: 编码规范
tags: [code, style, naming, formatting]
related-changes: []
created-at: 2026-01-01T00:00:00Z
updated-at: 2026-01-01T00:00:00Z
---

# 编码规范

本规范定义项目的编码风格、命名约定和文件组织规则。适用于全部新代码。

## 命名约定

### 变量与函数

- 使用 camelCase：`getUserById`、`isValidEmail`
- 布尔值用 is/has/can/should 前缀：`isAuthenticated`、`hasPermission`
- 避免缩写：`getUser` 而非 `getUsr`，`calculate` 而非 `calc`
- 常量用 UPPER_SNAKE_CASE：`MAX_RETRY`、`DEFAULT_TIMEOUT`

### 类与接口

- 使用 PascalCase：`UserService`、`OrderRepository`
- 接口不加 I 前缀：`Repository` 而非 `IRepository`
- 抽象类用 Abstract 前缀：`AbstractValidator`

### 文件命名

- JavaScript/TypeScript：kebab-case：`user-service.js`、`order-controller.ts`
- Python：snake_case：`user_service.py`
- Java：PascalCase：`UserService.java`
- 配置文件：kebab-case：`database-config.yaml`

### 数据库

- 表名：snake_case 复数：`users`、`order_items`
- 字段名：snake_case：`created_at`、`user_id`
- 索引名：`idx_<table>_<columns>`：`idx_users_email`
- 外键名：`fk_<table>_<ref_table>`：`fk_orders_users`

## 文件组织

### 目录结构（分层架构）

```
src/
├── controllers/    # 接口层：接收请求，返回响应
├── services/       # 服务层：业务逻辑
├── repositories/   # 数据层：数据访问
├── models/         # 数据模型定义
├── utils/          # 工具函数
├── config/         # 配置
└── tests/          # 测试
```

### 文件长度

- 单文件不超过 300 行（超出考虑拆分）
- 单函数不超过 50 行（超出考虑提取子函数）
- 单类不超过 500 行（超出考虑拆分职责）

### 导入顺序

1. Node.js 内置模块
2. 第三方依赖
3. 项目内模块
4. 类型/接口

```javascript
import { join } from 'node:path';
import express from 'express';
import { UserService } from './services/user-service.js';
import type { User } from './types.js';
```

## 格式化

### 缩进与空行

- 缩进：2 空格（JS/TS/Python），4 空格（Java）
- 函数之间空 1 行
- 类之间空 2 行
- 文件末尾保留 1 个空行

### 括号与分号

- 使用单引号：`'text'` 而非 `"text"`
- 行尾加分号（JS/TS）
- 大括号：K&R 风格

```javascript
function getUser(id) {
  if (!id) {
    return null;
  }
  return users.find((u) => u.id === id);
}
```

## 注释规则

### 什么时候写注释

- **写**：非显而易见的 WHY（约束、不变量、workaround）
- **不写**：代码做什么（好命名已经说明）
- **不写**：当前任务/PR 描述（属于 commit message）

### 注释格式

```javascript
// FIXME: 临时方案，v0.2 改为事件驱动
// HACK: 绕过 ORM 缓存问题，见 issue #123
// NOTE: 此函数必须在事务内调用，否则数据不一致
```

### 函数文档

```javascript
/**
 * 验证邮箱格式。
 * @param {string} email - 待验证的邮箱
 * @returns {boolean} 有效返回 true
 */
function isValidEmail(email) { ... }
```

## 错误处理

### 错误分类

- **参数错误（400）**：用户输入无效
- **未认证（401）**：未登录或 token 失效
- **无权限（403）**：已登录但无权操作
- **不存在（404）**：资源不存在
- **冲突（409）**：资源已存在或状态冲突
- **服务器错误（500）**：意外错误

### 错误响应格式

```json
{
  "error": "邮箱已注册",
  "code": "EMAIL_DUPLICATE",
  "details": { "field": "email" }
}
```

### 异步错误处理

- 所有 async/await 必须 try-catch 或 .catch()
- 不允许 unhandled rejection
- 错误消息面向用户友好，不泄露技术细节（堆栈、SQL）

## 禁止事项

- 禁止 `var`（使用 `const` / `let`）
- 禁止 `==`（使用 `===`）
- 禁止 `console.log` 在生产代码中（使用 logger）
- 禁止硬编码密码/密钥（从环境变量读取）
- 禁止 SQL 字符串拼接（使用参数化查询）
- 禁止 `any` 类型（TypeScript）
