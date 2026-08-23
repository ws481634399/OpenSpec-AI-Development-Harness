# openspec CLI

OpenSpec AI Development Harness CLI。

## 命令

### openspec init

初始化 OpenSpec Workspace，基于 `templates/default-workspace/` 模板。

```bash
# 在当前目录初始化
openspec init

# 指定目录
openspec init ./my-project

# 覆写已存在的 .sdd/*.yaml 与 README-OpenSpec.md（不动四世界）
openspec init --force
```

交互式问答（对齐设计 §7.1）：

- 项目名称（默认目录名）
- 项目类型（greenfield / brownfield）
- 代码是否已存在（仅 brownfield）
- 仓库模式（single / multi）
- brownfield single：代码路径（默认 `implementation`，可改为任意相对/绝对路径）
- multi：仓库列表（id + path，id 留空结束）

## 运行方式

本地开发（无需 link）：

```bash
node cli/openspec/bin/openspec.js init
```

或经 npm link 后：

```bash
npm link
openspec init
```

仓库根也可用：

```bash
npm run openspec -- init
```

## 技术栈

- Node.js（ESM，纯 JavaScript，零构建）
- commander 命令解析
- @clack/prompts 交互式问答
- yaml 配置读写（保留注释）
- picocolors 终端着色
- 文件操作使用 Node 原生 `node:fs/promises`

## 目录结构

```
cli/openspec/
├── package.json             （由根 package.json 统一管理依赖与 bin）
├── README.md
├── bin/
│   └── openspec.js          入口（shebang + import src/index.js）
└── src/
    ├── index.js             commander program 装配（name: openspec）
    ├── commands/
    │   └── init.js          Init Command（编排上移 core/workspace）
    └── lib/
        ├── banner.js        欢迎横幅
        ├── prompts.js       askInitConfig 交互
        └── logger.js        终端日志
```

核心逻辑位于 `core/workspace/`（无 CLI 依赖，可独立测试与复用）：

```
core/workspace/
├── harness-root.js          HarnessRootResolver（向上查找 Harness 根）
├── version.js               VersionReader（读 .version）
├── template-resolver.js     TemplateResolver（定位模板目录）
├── copier.js                TemplateCopier（复制 + filter + README 改名）
├── config-writer.js         ConfigWriter（yaml 配置生成，保留注释）
├── validator.js             WorkspaceValidator（自检内核）
└── workspace-initializer.js WorkspaceInitializer（编排 runInit 纯函数）
```

## 设计要点

- **runInit 为纯函数**：位于 core/workspace，接收 config 对象，不经过 @clack 交互，便于测试。
- **保留注释**：workspace/repositories/version.yaml 用 `yaml` 库 Document API 改写，保留模板注释。
- **不修改业务代码**：implementation/ 仅当 path 以 `implementation` 开头且非 force 时创建；brownfield 外部路径不创建。
- **不覆盖用户 README**：模板根 README.md 改名为 README-OpenSpec.md。
- **--force 仅覆写 .sdd/*.yaml + README-OpenSpec.md**，保护四世界知识。

## Phase 1.2 范围

仅实现 `openspec init`。以下命令推后续阶段：

- `openspec change create` → Change Management 阶段
- `openspec doctor` → 后续阶段（复用 `core/workspace/validator.js` 内核）
- `openspec validate` / `openspec reverse` / `openspec status` → 后续阶段
