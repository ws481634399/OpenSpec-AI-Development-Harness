# Knowledge Reverse Instruction

> Change: {{change-id}}
> 扫描时间: {{scanned-at}}

## 目标

扫描 `implementation/` 现有代码，提取技术规则和业务能力，写入 SDD 知识体系。

## 扫描结果摘要

- 语言统计: {{language-stats}}
- 框架标记: {{framework-files}}
- 目录结构: {{directory-tree}}
- 文件总数: {{file-count}}

## 执行步骤

### 1. 扫描核心文件

按优先级扫描以下文件：
- 框架配置（package.json / pom.xml / go.mod / Cargo.toml）
- 入口文件（main.* / index.* / app.*）
- 路由/控制器（routes/ / controllers/ / handlers/）
- 数据模型（models/ / entities/ / domain/）
- 配置文件（config/ / .env.example）

### 2. 提取技术规则 → standards/

分析代码中的：
- 编码规范（命名、格式、注释）
- 架构模式（分层、模块化、微服务）
- 技术选型（框架、库、工具）
- 测试策略（单元/集成/E2E）

写入 `standards/<category>.md`（更新或新建）。

### 3. 提取业务能力 → product/

分析代码中的：
- 业务域划分（从模块/目录结构推断）
- 核心能力（从入口/路由/控制器推断）
- 数据模型（从 models/entities 推断）

写入 `product/<domain>.md`（更新或新建）。

### 4. 生成 Feature Tree

从业务能力推断 Feature Tree 结构，调用 sdd-feature-tree 创建节点。

### 5. 写 reverse-report.md

总结扫描结果和知识提取清单，写入 `delivery/changes/<CHG>/reverse-report.md`。

### 6. 重建索引

调用 sdd-knowledge 能力 C，重建 standards/INDEX.md 和 product/INDEX.md。
