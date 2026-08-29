# sdd-feature-tree: 特性树生成

> 阶段: feature-tree
> 不进 7 状态生命周期（辅助 Skill，供 sdd-explore / sdd-reverse 调用或独立使用）
> 产出: feature-tree.yaml 更新
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/review/persona-feature-tree.md

## 前置条件
- Workspace 已初始化（`openspec init` 已执行）
- 有需求描述或产品描述

## 执行步骤

### 1. 读取现有 Feature Tree

```bash
openspec feature list --json
```

- 如果返回空树或文件不存在，说明是全新项目，需要从 Product 根开始规划
- 如果已有节点，记录现有 Module / Feature / Story 的 ID 和名称

#### 1.1 现有树分析

**分析现有树的完整度：**
- 有几个 Module？覆盖了哪些业务域？
- 每个 Module 下有几个 Feature？功能分组是否合理？
- 每个 Feature 下有几个 Story？粒度是否均匀？
- 有没有空 Feature（只有 Feature 没有 Story）？

### 2. 分析需求

从需求描述中识别 Feature Tree 节点。

#### 2.1 需求到 Feature 映射方法

**Step 1：提取需求核心动词 + 操作对象**
- "用户注册" → 动词: 注册, 对象: 用户
- "导出月度报表" → 动词: 导出, 对象: 报表

**Step 2：确定归属层级**

Phase 2.4 固定四级结构（L1 → L2 → L3 → Story），ID 层级嵌套编码：

依次判断：
1. **Story 级匹配** — 需求是否与已有 Story 描述一致？
   - "用户注册" 已有 STORY-001-01-01-01 → 复用
2. **L3 级匹配** — 需求是否属于已有 L3 节点的新 Story？
   - "用户注册" 属于"账号认证" FEAT-001-01-02 → 新增 Story
3. **L2/L1 级匹配** — 需求是否需要新建 L3/L2/L1？
   - "商品搜索" 属于"商品中心" L1 → 新建 L2（+L3）+ Story
4. **新建 L1** — 需求不属于任何现有业务域
   - "支付接入" → 新建 L1 "支付中心"

**Step 3：验证匹配合理性**
- 语义相似度：需求核心动词 + 操作对象是否与节点描述一致
- 功能包含关系：需求是否是现有节点的自然子能力
- 业务域归属：需求涉及的数据实体是否属于现有分支

#### 2.2 层级粒度判断标准

| 层级 | 粒度 | 判断标准 | 示例 |
|------|------|---------|------|
| L1 | 业务域 | 一组相关业务能力的集合 | 用户中心、订单中心、支付中心 |
| L2 | 功能组 | 一个业务能力的多个子操作 | 用户认证（注册+登录+登出） |
| L3 | 子功能（可选） | 功能组内需要再分组的复杂域 | 账号认证 / 第三方登录 |
| Story | 可交付单元 | 一个独立可完成的功能（CHG 直接关联的最小单元） | 用户注册、用户登录 |

**Story 粒度校验：**
- 一个 Story 可在 1-3 天内完成 → 合理
- 一个 Story 需要超过 1 周 → 拆分
- 一个 Story 只需几小时 → 考虑合并到已有 Story

**层级简化原则：** 结构简单的域可不建 L3（L2 直挂 Story）；避免为分层而分层。

### 3. 生成 Feature Tree 草稿

根据分析结果，规划要创建的节点。**先展示草稿给用户确认，再执行创建命令。**

#### 3.1 草稿格式

```markdown
新增节点：
  L1: — "支付中心"（描述: 支付流程管理）            → FEAT-002
    └── L2: — "支付下单"（描述: 创建支付订单）        → FEAT-002-01
          └── Story: — "微信支付"（描述: 微信支付下单）  → STORY-002-01-01
          └── Story: — "支付宝支付"（描述: 支付宝下单）  → STORY-002-01-02

复用节点：
  L1: FEAT-001 — "用户中心"（已存在，不创建）
    └── L2: FEAT-001-01 — "用户认证"（已存在，不创建）
          └── Story: — "用户注册"（描述: 邮箱/手机号注册）→ STORY-001-01-01

总计：新增 1 L1 + 1 L2 + 2 Story
```

> 草稿阶段 ID 仅为占位，实际 ID 以 CLI 返回为准。

### 4. 用户确认

展示草稿，询问用户：
- 节点结构是否合理？
- 命名是否清晰？
- L1/L2/L3/Story 粒度是否合适？
- 是否需要调整？

用户确认后继续下一步。

### 5. 创建节点

按顺序执行 CLI 命令创建节点（必须先创建父节点）：

```bash
# 创建 L1（业务域，如不存在）
openspec feature add module --name "<域名>" --desc "<描述>"

# 创建 L2（功能组；父节点为 L1。如不存在，需先获取 L1 ID）
openspec feature add feature --module <FEAT-NNN> --name "<功能名>" --desc "<描述>"

# 创建 L3（可选；父节点为 L2，同一命令按父层级自动判定）
openspec feature add feature --module <FEAT-NNN-NN> --name "<子功能名>" --desc "<描述>"

# 创建 Story（挂 L2 或 L3，需先获取父 ID）
openspec feature add story --feature <FEAT-ID> --name "<故事名>" --desc "<描述>"
```

**ID 规范（Phase 2.4 嵌套编码，CLI 自动生成）：**
- L1: `FEAT-001`
- L2: `FEAT-001-02`（父 ID + 序号）
- L3: `FEAT-001-02-03`
- Story: `STORY-001-02-03-01`
- 兼容性：v1 格式（`MOD-NNN` / `FEAT-NNN` / `STORY-NNN`）可正常读取，
  首次写入时自动升级为嵌套编码
- 创建后记录 CLI 返回的实际 ID

### 6. 返回结果

返回以下信息给调用方：
- 匹配的 Story ID（嵌套编码，如 STORY-001-01-01）
- Feature Path 四级链（如 Product → 用户中心 → 用户认证 → 账号注册）
- 新创建的节点清单

### 7. 质量自检

产出前自检：
- [ ] 是否优先匹配现有节点，避免重复创建？
- [ ] L1 粒度是否是业务域级别（不是具体功能）？
- [ ] L2 粒度是否是功能组级别（包含多个 Story）？
- [ ] L3 是否确有必要（避免为分层而分层）？
- [ ] Story 粒度是否可在 1-3 天内完成？
- [ ] 命名是否清晰（动词 + 对象）？
- [ ] 描述是否一句话能说清？

## 模板参考

Feature Tree 四级结构模板：`templates/default-workspace/product/feature-tree.yaml`（相对于 Workspace 根）

四级定义（Phase 2.4）：
- **Product** — 根节点，代表整个产品
- **L1** — 业务域分组（`FEAT-001`）
- **L2** — 功能分组（`FEAT-001-02`）
- **L3** — 子功能分组，可选（`FEAT-001-02-03`）
- **Story** — 最小可实施单元，直接关联 CHG（`STORY-001-02-03-01`，状态: planned / in-progress / delivered）

## 工作示例

> 完整示例参考: `templates/default-workspace/product/feature-tree.yaml`（四级 Feature Tree 模板）

**需求：** "用户可以通过邮箱或手机号注册账号"

**映射分析：**
1. 提取：动词"注册"，对象"用户"
2. Story 级匹配：无"用户注册" Story → 不复用
3. L2 级匹配：有"用户认证" FEAT-001-01 → 新增 Story（该域结构简单，无需 L3）
4. L1 级匹配：有"用户中心" FEAT-001 → 不新建 L1

**草稿：**
```markdown
复用节点：
  L1: FEAT-001 — "用户中心"（已存在）
  L2: FEAT-001-01 — "用户认证"（已存在）

新增节点：
  L2: FEAT-001-01 下
    └── Story: — "用户注册"（描述: 邮箱/手机号注册）

总计：新增 1 Story
```

**执行：**
```bash
openspec feature add story --feature FEAT-001-01 --name "用户注册" --desc "邮箱/手机号注册"
# 返回: STORY-001-01-01
```

**返回结果：**
- Story ID: STORY-001-01-01
- Feature Path: Product → 用户中心 → 用户认证 → 用户注册

## 完成后

本 Skill 不推进 Change 状态。返回 Story ID 给调用方（如 sdd-explore），由调用方继续后续流程。
