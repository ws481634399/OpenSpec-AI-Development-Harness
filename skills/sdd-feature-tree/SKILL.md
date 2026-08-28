# sdd-feature-tree: 特性树生成

> 阶段: feature-tree
> 不进 7 状态生命周期（辅助 Skill，供 sdd-explore / sdd-reverse 调用或独立使用）
> 产出: feature-tree.yaml 更新

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

依次判断：
1. **Story 级匹配** — 需求是否与已有 Story 描述一致？
   - "用户注册" 已有 STORY-1 → 复用
2. **Feature 级匹配** — 需求是否属于已有 Feature 的子能力？
   - "用户注册" 属于"用户认证" FEAT-1 → 新增 Story
3. **Module 级匹配** — 需求是否属于已有 Module 的新功能？
   - "商品搜索" 属于"商品中心" MOD-2 → 新增 Feature + Story
4. **新建 Module** — 需求不属于任何现有 Module
   - "支付接入" → 新建 Module "支付中心"

**Step 3：验证匹配合理性**
- 语义相似度：需求核心动词 + 操作对象是否与节点描述一致
- 功能包含关系：需求是否是现有 Feature 的自然子能力
- 业务域归属：需求涉及的数据实体是否属于现有 Module

#### 2.2 层级粒度判断标准

| 层级 | 粒度 | 判断标准 | 示例 |
|------|------|---------|------|
| Module | 业务域 | 一组相关业务能力的集合 | 用户中心、订单中心、支付中心 |
| Feature | 功能组 | 一个业务能力的多个子操作 | 用户认证（注册+登录+登出） |
| Story | 可交付单元 | 一个独立可完成的功能 | 用户注册、用户登录 |

**Story 粒度校验：**
- 一个 Story 可在 1-3 天内完成 → 合理
- 一个 Story 需要超过 1 周 → 拆分
- 一个 Story 只需几小时 → 考虑合并到已有 Story

### 3. 生成 Feature Tree 草稿

根据分析结果，规划要创建的节点。**先展示草稿给用户确认，再执行创建命令。**

#### 3.1 草稿格式

```markdown
新增节点：
  Module: MOD-新 — "支付中心"（描述: 支付流程管理）
    └── Feature: FEAT-新 — "支付下单"（描述: 创建支付订单）
          └── Story: STORY-新 — "微信支付"（描述: 微信支付下单）
          └── Story: STORY-新 — "支付宝支付"（描述: 支付宝支付下单）

复用节点：
  Module: MOD-1 — "用户中心"（已存在，不创建）
    └── Feature: FEAT-1 — "用户认证"（已存在，不创建）
          └── Story: STORY-新 — "用户注册"（描述: 邮箱/手机号注册）

总计：新增 1 Module + 1 Feature + 3 Story
```

### 4. 用户确认

展示草稿，询问用户：
- 节点结构是否合理？
- 命名是否清晰？
- Module/Feature/Story 粒度是否合适？
- 是否需要调整？

用户确认后继续下一步。

### 5. 创建节点

按顺序执行 CLI 命令创建节点（必须先创建父节点）：

```bash
# 创建 Module（如不存在）
openspec feature add module --name "<域名>" --desc "<描述>"

# 创建 Feature（如不存在，需先获取 Module ID）
openspec feature add feature --module <MOD-ID> --name "<功能名>" --desc "<描述>"

# 创建 Story（需先获取 Feature ID）
openspec feature add story --feature <FEAT-ID> --name "<故事名>" --desc "<描述>"
```

**ID 规范：**
- Module: MOD-NNN（自增，CLI 自动生成）
- Feature: FEAT-NNN（自增，CLI 自动生成）
- Story: STORY-NNN（自增，CLI 自动生成）
- 创建后记录 CLI 返回的实际 ID

### 6. 返回结果

返回以下信息给调用方：
- 匹配的 Story ID（如 STORY-3）
- Feature 路径（如 Product → 用户中心 → 用户认证 → 用户注册）
- 新创建的节点清单

### 7. 质量自检

产出前自检：
- [ ] 是否优先匹配现有节点，避免重复创建？
- [ ] Module 粒度是否是业务域级别（不是具体功能）？
- [ ] Feature 粒度是否是功能组级别（包含多个 Story）？
- [ ] Story 粒度是否可在 1-3 天内完成？
- [ ] 命名是否清晰（动词 + 对象）？
- [ ] 描述是否一句话能说清？

## 模板参考

Feature Tree 四级结构模板：`templates/default-workspace/product/feature-tree.yaml`（相对于 Workspace 根）

四级定义：
- **Product** — 根节点，代表整个产品
- **Module** — 业务域分组（MOD-NNN）
- **Feature** — 功能分组（FEAT-NNN）
- **Story** — 最小可实施单元（STORY-NNN，状态: planned / in-progress / delivered）

## 工作示例

> 完整示例参考: `templates/default-workspace/product/feature-tree.yaml`（四级 Feature Tree 模板）

**需求：** "用户可以通过邮箱或手机号注册账号"

**映射分析：**
1. 提取：动词"注册"，对象"用户"
2. Story 级匹配：无"用户注册" Story → 不复用
3. Feature 级匹配：有"用户认证" FEAT-1 → 新增 Story
4. Module 级匹配：有"用户中心" MOD-1 → 不新建 Module

**草稿：**
```markdown
复用节点：
  Module: MOD-1 — "用户中心"（已存在）

新增节点：
  Feature: FEAT-1 下
    └── Story: STORY-新 — "用户注册"（描述: 邮箱/手机号注册）

总计：新增 1 Story
```

**执行：**
```bash
openspec feature add story --feature FEAT-1 --name "用户注册" --desc "邮箱/手机号注册"
# 返回: STORY-3
```

**返回结果：**
- Story ID: STORY-3
- Feature 路径: Product → 用户中心 → 用户认证 → 用户注册

## 完成后

本 Skill 不推进 Change 状态。返回 Story ID 给调用方（如 sdd-explore），由调用方继续后续流程。
