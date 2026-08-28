# sdd-prd: 产品需求文档

> 阶段: prd
> 状态转换: exploring → specified
> 产出: prd.md

## 前置条件
- Change 处于 `exploring` 状态
- requirement.md 和 exploration.md 已完成

## 执行步骤

### 1. 读取前序 Artifact

读取 `delivery/changes/<CHG>/requirement.md` 和 `exploration.md`。

#### 1.1 信息提取清单

从 requirement.md 提取：
- 需求标题（metadata.title 一致性）
- 需求来源 ID（REQ-XXX）
- 用户原始描述（保持原话，PRD 中引用）

从 exploration.md 提取：
- Feature 归属路径（理解产品定位）
- 需求理解分析（exploration 中的"需求本质"分析）
- 影响分析（涉及的模块/仓库）
- 未知问题（exploration 列出的待澄清项）

#### 1.2 处理未知问题

exploration.md 中的"未知问题"必须在 PRD 阶段解决：
- 可通过用户澄清解决的 → 向用户提问
- 需技术调查的 → 标注为"待设计阶段确认"
- 已在分析中解决的 → 在 PRD 中明确回答

### 2. 读取 Workspace 上下文

读取知识库（如存在）：
- `product/INDEX.md` 或 `.sdd/knowledge-index.json` — 查找相关产品知识
- `standards/` — 相关技术规范

**目的：**
- 确认业务规则与现有 product/ 知识不冲突
- 确认功能范围与现有 standards/ 约束一致
- 发现可复用的已有设计决策

### 3. 生成 PRD 草稿

读取模板 `templates/artifacts/prd.md`，按结构填写。

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{requirement}}`：需求来源标识
- `{{feature-id}}`：Story ID
- `{{from-state}}`：exploring
- `{{to-state}}`：specified

#### 3.1 PRD 分析方法论

**§1 背景：**
- 需求产生的业务背景（为什么现在要做？）
- 与现有功能/产品的关系（是新增、增强还是替代？）
- 引用 exploration.md 的影响分析结论

**§2 目标用户（用 Job-to-be-Done 框架分析）：**
- 用户角色：谁使用这个功能？（普通用户、管理员、系统...）
- 使用场景：用户在什么情境下使用？（When I..., I want to...）
- 价值目标：以便实现什么？（So that...）

示例：
```
角色：未注册用户
场景：When I 想要使用平台功能, I want to 通过邮箱注册账号
价值：So that 我可以拥有个人空间并使用平台服务
```

**§3 用户价值：**
- 直接价值：用户能做什么以前做不了的事？
- 间接价值：提升了什么效率？降低了什么成本？
- 业务价值：对平台/公司有什么意义？

**§4 功能范围（Scope 管理）：**
- Scope In（做什么）：列出具体功能点，每个功能点用动词开头
- Scope Out（不做什么）：明确排除项，避免范围蔓延

Scope 判断原则：
- 用户明确提到的 → Scope In
- 隐含必要但用户未提及的 → Scope In（需向用户确认）
- 用户提及但属于其他 Story 的 → Scope Out（标注归属）
- 技术实现细节 → Scope Out（属于设计阶段）

**§5 业务规则：**
- 数据约束：字段格式、长度、唯一性、默认值
- 流程约束：操作顺序、前置条件、后置效果
- 权限约束：谁可以操作、操作范围限制
- 异常处理：边界 case 的业务响应

每条规则格式：`[规则名]：[条件] → [结果]`
示例：`邮箱唯一性：同一邮箱不可重复注册 → 返回"邮箱已注册"提示`

**§6 验收标准（必须符合 SMART 原则）：**
- Specific：每条标准只描述一个行为
- Measurable：可通过测试验证（有明确的输入/输出）
- Achievable：在当前技术栈下可实现
- Relevant：与需求目标直接相关
- Time-bound：有明确的完成定义

验收标准格式：
```
- [ ] AC-1: 用户输入有效邮箱和密码 → 点击注册 → 注册成功 → 跳转到首页
- [ ] AC-2: 用户输入已注册邮箱 → 点击注册 → 显示"邮箱已注册" → 提供"找回密码"链接
- [ ] AC-3: 用户输入无效邮箱格式 → 点击注册 → 显示"邮箱格式不正确" → 不提交
```

### 4. 质量自检

产出前自检：
- [ ] 每个目标用户是否有明确的 JTBD 场景？
- [ ] Scope In/Out 是否清晰，无歧义？
- [ ] 每条业务规则是否有明确的条件→结果？
- [ ] 每条验收标准是否可测试（有输入/输出）？
- [ ] exploration.md 的未知问题是否已解决或标注待设计？
- [ ] 业务规则是否与 product/ 已有知识一致？
- [ ] 功能范围是否与 standards/ 技术约束兼容？

### 5. 用户交互

向用户展示 PRD 草稿时，主动确认：
- 优先级：功能点是 P0（必须）/ P1（应该）/ P2（可选）？
- 边界 case：异常场景的处理策略是否合理？
- Scope Out：排除项是否合理，有无遗漏？
- 验收标准：是否覆盖了所有关键路径？

**当用户要求修改时：**
- 修改 PRD 内容
- 更新 front-matter
- 重新自检

写入 `delivery/changes/<CHG>/prd.md`。

## 产出草稿
- `delivery/changes/<CHG>/prd.md` — 产品需求文档

## 用户确认

展示 prd.md 草稿给用户：
- 功能范围是否准确？
- 验收标准是否可测试？
- 业务规则是否完整？

确认后：
```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set specified
```

## 工作示例

> 完整示例参考: `templates/artifacts/examples/prd.md`（含 7 条 SMART 验收标准 + Scope 管理 + 异常处理矩阵）

**需求来源：** "用户注册功能，支持邮箱或手机号注册"

**PRD §2 目标用户节选：**
```
角色：未注册访客
场景：When I 想要成为平台用户, I want to 通过邮箱或手机号注册
价值：So that 我可以拥有账号并使用平台功能
```

**PRD §4 功能范围节选：**
```
Scope In:
- 邮箱注册（含格式校验）
- 手机号注册（含格式校验）
- 密码设置（含强度校验）
- 注册成功后跳转首页

Scope Out:
- 邮箱/手机验证码发送（属于"用户认证"其他 Story）
- 第三方登录（属于独立 Feature）
- 用户资料完善（注册后引导，属于独立 Story）
```

**PRD §6 验收标准节选：**
```
- [ ] AC-1: 有效邮箱+有效密码 → 注册成功 → 跳转首页
- [ ] AC-2: 已注册邮箱 → 提示"邮箱已注册" → 提供找回密码链接
- [ ] AC-3: 无效邮箱格式 → 提示"邮箱格式不正确" → 不提交
- [ ] AC-4: 有效手机号+有效密码 → 注册成功 → 跳转首页
- [ ] AC-5: 密码强度不足 → 提示强度要求 → 不提交
```

## 行为规则
- 不修改 requirement.md / exploration.md
- 不修改 product/ 或 standards/（知识沉淀在 sdd-converge）
- 产出草稿供用户确认，不直接推进状态
- 验收标准必须可测试，拒绝模糊表述（如"界面友好""性能良好"）
- 主动解决 exploration 的未知问题，不遗留到设计阶段
