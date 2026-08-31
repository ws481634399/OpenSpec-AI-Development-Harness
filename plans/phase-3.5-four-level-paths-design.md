# Phase 3.5 设计：CHG 内部四级骨架物化 + product/features 四级投影

- 状态：Draft v0.3（v0.2 后用户决策：目录段改纯业务名；全部 Artifact 落第四级 STORY 目录）
- 日期：2026-08-31
- 前置：Phase 2.4 metadata v2（feature-path 权威字段、resolveArtifactPath STORY 级物化机制）

## 0. 修订记录

| 版本 | 日期 | 变更 |
| --- | --- | --- |
| v0.1 | 2026-08-28 | 初稿：CHG 挂树下四级（废止） |
| v0.2 | 2026-08-29 | CHG 平铺 + 内部四级骨架（ID 段，如 MOD-1/FEAT-1/FEAT-1-01/STORY-2） |
| v0.3 | 2026-08-31 | 目录段改**纯业务名**（如 平台基座/用户管理/账户能力/用户登录）；**全部产物**（含 requirement/prd/design/implementation 等）落 STORY 目录；README 锚点 + rename 同步；CHG 根存量产物自动迁移 |

## 1. 用户诉求与模型澄清

用户期望的目录形态（三个世界，v0.3 纯名字段）：

```
delivery/changes/CHG-0002/平台基座/用户管理/账户能力/用户登录/          ← CHG 平铺 + 内部四级骨架
delivery/changes/CHG-0002/平台基座/用户管理/账户能力/用户登录/tasks.md   ← 全部产物落第四级
delivery/archive/CHG-0001/平台基座/用户管理/账户能力/用户登录/          ← 归档后骨架跟随
product/features/平台基座/用户管理/账户能力/用户登录/README.md          ← 产品世界物理投影
```

与 v0.2 的差异：

| 点 | v0.2 | v0.3（本期） |
| --- | --- | --- |
| 目录段命名 | 节点 ID（MOD-1/FEAT-1/…） | **纯业务名**（featureDirSeg 清洗：非法字符→'-'、超长截断 50、清洗后为空回退 ID） |
| 产物落位 | 仅 tasks.md 等按 feature-path 解析落 STORY 目录 | **全部 Artifact**（resolveArtifactPath 统一）落 STORY 目录；未绑定/(candidate) 时落 CHG 根暂存，bind 时由 skeleton 自动迁移 |
| 名字漂移 | 无处理（ID 即目录名） | README.md front-matter 的 `id` 作**锚点**；树改名后重跑按锚点 **rename** 同步（CHG 骨架与 features 投影同规则） |
| 同名冲突 | 不可能（ID 唯一） | 不同 id 撞同一目录名 → 抛 `EDIRCONFLICT`（不自动加后缀，保持纯名字） |
| CHG 根 | 留存历史产物 | 迁移后只留 `metadata.yaml` + 四级骨架 L1 目录 |

不变量：`feature-tree.yaml` 唯一权威源；metadata.feature-path 权威引用；`resolveArtifactPath` 的 STORY 级 artifact 落位机制扩展为「全部产物」。

## 2. 实现

### 2.0 core/sdd/feature-dirname.js（新，v0.3）

```
featureDirSeg(id, name) → string            # 业务名清洗（Windows 非法字符/控制符→'-'，截断 50，空回退 id）
findNodeDirByAnchor(parentDir, nodeId)      # 扫描父目录下 README front-matter id === nodeId 的子目录
syncNodeDirName(parentDir, nodeId, seg)     # 锚点命中且名异 → rename；目标被占 → EDIRCONFLICT；无锚点 → null（走新建）
```

### 2.1 core/sdd/change-skeleton.js（v0.3 修订）

```
materializeChangeSkeleton(changeDir, meta, tree, workspaceRoot)
  → { created, renamed, migrated, nameSynced, skipped, reason? }
  - candidate / 未绑定 / 绑定链在树中不完整 → skipped + reason（不预建、防悬挂绑定）
  - 1. 树名同步：树为权威，metadata.feature-path name 落后 → bindFeaturePath 回写（nameSynced）
  - 2. 四级统一循环（module/feature/capability/story）：
       syncNodeDirName 锚点 rename → 未命中且不存在则 mkdir → README.md 缺失才写（锚点依据，含 bound-chg 仅 story 级）
  - 3. 产物迁移 migrateRootArtifacts：CHG 根除 metadata.yaml 与骨架 L1 目录外全部迁入 STORY 目录
       （目标已存在不覆盖，人工解决）
findChangeDirAny(workspaceRoot, id) → { dir, scope } | null   # changes / archive 双作用域
```

### 2.2 CLI 接线（change.js）

- `bind-feature-path`：绑定成功且非 candidate → materializeChangeSkeleton（输出 created/renamed/migrated/nameSynced）
- `change skeleton <id>`：changes 或 archive 定位补物化，幂等可重跑（存量 CHG 补齐入口）

### 2.3 product/features 投影（core/sdd/feature-materializer.js，v0.3 修订）

`openspec feature-tree materialize`：

- 遍历树生成 `features/<L1名>/<L2名>/<L3名>/<STORY名>/README.md`（各级 README front-matter id 均为锚点）
- 锚点 rename：树改名 → 重跑按锚点 rename 目录（renamed 报告）；用户自建/已存在 README 永不覆盖
- 树节点删除/无锚点旧目录 → drift 报告，不删除；STORY 级 README 反查 changes/archive 记录 bound-chg
- doctor `checkFeaturesProjection`：树有目录无 → missing；目录有树无 → drift

### 2.4 路径解析与调用方（v0.3 修订）

- `artifact-path.js`：`featurePathDirs(meta)` 返回**业务名段**数组（candidate → null）；`resolveArtifactPath` 对**全部** artifact 落 STORY 目录（未绑定回退 CHG 根）；`resolveStoryDir`
- 调用方适配（全部经上述两函数取位，无硬编码路径）：
  - `change-validator.js` / `transition-service.js` / `workflow-engine.js`：artifact 定位 + hash 校验
  - `gate-validator.js`：cross-reference 同时探测 STORY 目录与 CHG 根（存量兼容）
  - `context-assembler.js`：Change Artifacts 注入按 STORY 优先、根回退；返回值新增 `changeId` / `featureDirs`
  - `evidence-model.js`：evidence.yaml 落 STORY/evidence/（动态 import 解循环依赖）；根位置只读兼容
  - `delivery-unit.js`：DU 目录在 STORY 下；materialize 回填的 workspace-source 追溯引用统一带四级名段
  - `doctor-checks.js`：DU 扫描经 resolveStoryDir
- `instruction-builder.js`：「Artifact 产出」section 为每个 output-artifact 给出**明确落位路径**
  （绑定后 `delivery/changes/<CHG>/<四级名>/<artifact>`，DU 绑定的 implementation.md 指向 Repo Delivery）；
  「执行指引」同步更新，确保外部 Agent 写对位置

### 2.5 doctor（doctor-checks.js）

- 检查项 7 现语义（「STORY 目录已物化时」才对齐）保留；CHG feature-path 完整且 candidate=false 但无四级骨架 → info 提示 `openspec change skeleton <id>`
- features/ 与树 drift → info（随 2.3）

## 3. 测试计划

1. materializeChangeSkeleton：生成四级业务名目录 + STORY README（bound-chg）；幂等（README 正文可改、锚点保留）；candidate/未绑定/链不完整拒绝
2. CHG 根存量产物迁移至 STORY 目录（CHG 根只留 metadata.yaml + L1 目录）+ 树改名后锚点 rename（L3/STORY 两级）+ metadata 树名同步
3. bind-feature-path 自动物化（e2e：bind 后目录与 README 存在）
4. change skeleton：changes 定位 + archive 定位补齐
5. featurePathDirs 业务名段（含 candidate → null、缺级 → null）；resolveArtifactPath 全产物落 STORY（未绑定回退根）
6. feature-tree materialize：四级 README 生成/幂等/自建文件保护/树改名 rename/drift 报告
7. doctor：骨架缺失 info、features drift info
8. gate 全链路（du-guidance/du-coverage/du-materialized/du-fan-in/findings-closure/checkpoint）按 STORY 目录 seed 产物回归

## 4. 文档

- complete-usage-guide.md：§3.5 目录结构示例（CHG 内部四级 + features 投影，业务名段）、§8 materialize 小节、§10 命令表（change skeleton / feature-tree materialize）

## 5. 交付清单

| # | 项 | 文件 |
| --- | --- | --- |
| 1 | feature-dirname.js（名字清洗 + 锚点 rename） | core/sdd/feature-dirname.js（新） |
| 2 | change-skeleton.js（物化 + 树名同步 + 产物迁移 + 定位） | core/sdd/change-skeleton.js（新） |
| 3 | feature-materializer.js（product 投影 + rename） | core/sdd/feature-materializer.js（新） |
| 4 | artifact-path.js（业务名段 + 全产物 STORY 落位） | core/sdd/artifact-path.js（修订） |
| 5 | bind 物化 + change skeleton 命令 | cli/openspec/src/commands/change.js |
| 6 | feature-tree materialize 命令 | cli/openspec/src/commands/feature-tree.js |
| 7 | 调用方路径适配（validator/transition/engine/assembler/evidence/du/doctor） | core/sdd/*.js（修订） |
| 8 | instruction-builder 落位路径指引 | core/sdd/instruction-builder.js（修订） |
| 9 | doctor 两项 info | core/sdd/doctor-checks.js |
| 10 | 测试 14 文件全量回归（341 用例） | tests/*.spec.js |
| 11 | 文档 | docs/complete-usage-guide.md |

规模：新增 3 文件，改造 9 文件；存量 CHG 非破坏（产物迁移可由 skeleton 幂等重跑，目标冲突不覆盖）。
