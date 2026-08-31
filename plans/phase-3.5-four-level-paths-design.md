# Phase 3.5 设计：CHG 内部四级骨架物化 + product/features 四级投影

- 状态：Draft v0.2（v0.1 外部四级方案经用户澄清废止：CHG 保持平铺，不挂树下）
- 日期：2026-08-29
- 前置：Phase 2.4 metadata v2（feature-path 权威字段、resolveArtifactPath STORY 级物化机制）

## 1. 用户诉求与模型澄清

用户期望的目录形态（三个世界）：

```
delivery/changes/CHG-0002/MOD-1/FEAT-1/FEAT-1-01/STORY-2/     ← CHG 平铺 + 内部四级骨架
delivery/archive/CHG-0001/MOD-1/FEAT-1/FEAT-1-01/STORY-1/     ← 归档后骨架跟随
product/features/MOD-1/FEAT-1/FEAT-1-01/STORY-2/README.md     ← 产品世界物理投影
```

与现状的差异：

| 点 | 现状 | 本期 |
| --- | --- | --- |
| CHG 目录位置 | `changes/CHG-XXXX/` 平铺 | **不变**（Phase 2.4 定稿维持） |
| CHG 内部四级 | 仅 task 阶段写 tasks.md 时按需 mkdir，无骨架可见性 | **bind-feature-path 时即物化完整四级目录骨架** |
| 归档 | rename 整目录 → `archive/CHG-XXXX/` | **不变**（骨架自然跟随，现状已满足） |
| product/features | 空目录（仅 feature-tree.yaml 逻辑树） | **materialize 生成四级 README 投影** |

不变量：`feature-tree.yaml` 唯一权威源；metadata.feature-path 权威引用；`resolveArtifactPath` 的 STORY 级 artifact 落位机制不变（tasks.md → `CHG/<L1>/<L2>/<L3>/<STORY>/tasks.md`，骨架已存在故无需新增 mkdir）。

## 2. 实现

### 2.1 core/sdd/change-skeleton.js（新）

```
materializeChangeSkeleton(changeDir, featurePath) → { created: string[], skipped: boolean }
  - featurePathDirs(featurePath) 取四级 ID；candidate=true 或链不完整 → 拒绝并说明
  - mkdir CHG/<L1>/<L2>/<L3>/<STORY>/（幂等：已存在跳过）
  - STORY 目录写 README.md（幂等：存在即不覆盖）：
    front-matter: story id / name / status（取自树）/ bound-chg（CHG-ID）
    正文: description 投影
findChangeDirAny(workspaceRoot, id) → string|null
  - 先查 delivery/changes/ 递归（CHG 平铺一层），再查 delivery/archive/（支持对归档 CHG 补骨架）
```

### 2.2 CLI 接线（change.js）

- `bind-feature-path`：绑定成功且非 candidate → 调 materializeChangeSkeleton，输出骨架路径
- 新增 `change skeleton <id>`：对任意 CHG（changes 或 archive 定位）按 metadata.feature-path 补物化——存量 CHG 与归档 CHG 的补齐入口，幂等可重跑

### 2.3 product/features 投影（core/sdd/feature-materializer.js 新）

`openspec feature-tree materialize`：

- 遍历树生成 `features/<L1>/.../<STORY>/README.md`（front-matter: id/name/level/status + 正文 description；STORY 级记录绑定 CHG——反查 changes/archive metadata.feature-path）
- 同步策略：只增不删，用户自建文件永不触碰；树节点无对应目录 → 生成；目录有树无（节点已删/改名）→ 不删，交 doctor 报 drift
- doctor：树有目录无 → info 提示 materialize；目录有树无 → info 报 drift

### 2.4 doctor（doctor-checks.js）

- 检查项 7 现语义（「STORY 目录已物化时」才对齐）保留；新增 info：CHG 的 feature-path 完整且 candidate=false 但 CHG 内无四级骨架 → 提示 `openspec change skeleton <id>`（温和，不强制存量）
- 新增 info：features/ 目录与树 drift（随 2.3）

## 3. 测试计划

1. materializeChangeSkeleton：生成四级 + STORY README；幂等；candidate/链不完整拒绝
2. bind-feature-path 自动物化（e2e：bind 后目录与 README 存在）
3. change skeleton：changes 定位 + archive 定位补齐
4. feature-tree materialize：四级 README 生成/幂等/自建文件保护/drift 报告
5. doctor：骨架缺失 info、features drift info

## 4. 文档

- complete-usage-guide.md：§3.5 目录结构示例（CHG 内部四级 + features 投影）、§8 materialize 小节、§10 命令表（change skeleton / feature-tree materialize）

## 5. 交付清单

| # | 项 | 文件 |
| --- | --- | --- |
| 1 | change-skeleton.js（物化 + 定位） | core/sdd/change-skeleton.js（新） |
| 2 | feature-materializer.js（product 投影） | core/sdd/feature-materializer.js（新） |
| 3 | bind 物化 + change skeleton 命令 | cli/openspec/src/commands/change.js |
| 4 | feature-tree materialize 命令 | cli/openspec/src/commands/feature-tree.js |
| 5 | doctor 两项 info | core/sdd/doctor-checks.js |
| 6 | 测试 11 用例 | tests/change-skeleton.spec.js（新）+ doctor.spec.js |
| 7 | 文档 | docs/complete-usage-guide.md |

规模：新增 2 文件，改造 4 文件，无存量数据破坏性变更。
