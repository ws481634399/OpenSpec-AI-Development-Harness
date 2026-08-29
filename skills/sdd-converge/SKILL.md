# sdd-converge: 知识收敛

> 阶段: converge
> 状态转换: testing → completed
> 产出: convergence.md + standards/ 和 product/ 知识更新
> 提示片段: prompts/common/persona-sdd.md · prompts/common/constraints.md · prompts/common/output-format.md · prompts/review/persona-converge.md

## 前置条件
- Change 处于 `testing` 状态
- 全部前序 Artifact 已完成（requirement → exploration → prd → design → STORY 级 tasks → implementation → test-report）
- review-report.md 已 accepted（Phase 2.2 评审检查点：blocker/major findings 全部闭环，双门禁通过）
- Phase 2.4：全部 DU 已 completed（du-fan-in-complete），result commit 与各仓 HEAD 对齐（submodule-pointer-aligned）

## 执行步骤

### 1. 读取全部 Artifact

依次读取：
- `delivery/changes/<CHG>/requirement.md`
- `delivery/changes/<CHG>/exploration.md`
- `delivery/changes/<CHG>/prd.md`
- `delivery/changes/<CHG>/design.md`
- STORY 级 `delivery/changes/<CHG>/<L1>/<L2>/<L3>/<STORY>/tasks.md`
- `delivery/changes/<CHG>/implementation.md`（跨仓汇总；各仓 DU 正文按引用追溯）
- `delivery/changes/<CHG>/evidence/test-report.md`
- `delivery/changes/<CHG>/review-report.md`
- 各仓 DU 侧证据（按 evidence.yaml 的 evidence-ref 追溯到 `implementation/<repo>/delivery/.../DU-XXX/evidence/`）

#### 1.1 知识提取清单

从每个 Artifact 提取潜在知识：

| Artifact | 提取维度 | 潜在知识类型 |
|----------|---------|-------------|
| requirement.md | 用户需求来源 | product（业务能力） |
| exploration.md | Feature 归属、影响分析 | product（Feature 路径） |
| prd.md | 业务规则、验收标准 | product（业务规则）、standards（验收标准模板） |
| design.md | 架构决策、接口设计、技术选型、跨仓协作契约 | standards（架构约定）、product（集成边界） |
| tasks.md（STORY 级） | DU 分解策略（仓库映射/依赖排序） | standards（任务粒度约定） |
| implementation.md | 各仓代码模式、错误处理、安全实践 | standards（编码规范） |
| test-report.md | 测试策略、边界 case | standards（测试约定） |
| review-report.md | 评审发现、缺陷模式、修复经验 | standards（代码质量约定） |

### 2. 知识分类

分析整个 Change 的知识产出，按以下规则分类。

#### 2.1 分类判断方法

**对每个知识项，依次回答 4 个问题：**

1. **这是技术知识还是业务知识？**
   - 技术（架构/编码/测试/工具）→ 候选 standards
   - 业务（能力/流程/术语/Feature）→ 候选 product

2. **这是本次特有还是可跨 Change 复用？**
   - 可复用 → 候选晋升
   - 本次特有 → no-update

3. **已有知识中是否已存在？**
   - 已存在且一致 → no-update
   - 已存在但有补充 → 合并更新
   - 不存在 → 新增

4. **是否需要用户确认？**
   - 涉及架构原则变更 → 需确认
   - 新增业务能力 → 需确认
   - 补充已有知识 → 可自主处理

#### 2.2 分类标准

**Standards 晋升**（写入 `standards/`）：
- 新的技术规则或约定（编码规范、命名规则）
- 架构决策（模块划分、接口设计、技术选型）
- 新的测试策略或工具配置
- 性能优化经验或教训
- 错误处理模式
- 安全实践
- 判断标准：**可跨 Change 复用的技术知识**

**Product 更新**（写入 `product/`）：
- 新增或变更的业务能力
- 产品定义更新（用户画像、业务流程）
- 新术语或领域概念
- Feature Tree 节点状态变更
- 判断标准：**与产品业务相关的知识**

**No Update**：
- 仅本次 Change 特有的实现细节
- 已有知识的重复
- 不具备复用价值的临时方案
- 具体的 API 响应格式（属实现细节）

#### 2.3 知识项表格格式

```markdown
### Standards 晋升
- 文件: standards/error-handling.md
- 操作: 新增
- 内容: async/await 错误处理规范（try-catch + 错误分类）
- 理由: 本 Change 发现未捕获 Promise rejection 导致 500
- 复用场景: 未来所有涉及异步操作的 Change

### Product 更新
- 文件: product/user-center.md
- 操作: 更新（已有文件追加段落）
- 内容: 新增"用户注册"能力描述（邮箱/手机号双入口）
- 理由: 新增注册功能，补充产品能力清单
- 关联 Feature: STORY-3

### No Update
- 具体的 POST /api/auth/register 响应格式
- 理由: 属实现细节，不具备跨 Change 复用价值
```

### 3. 写 convergence.md

读取模板 `templates/artifacts/convergence.md`，按结构填写。

元信息 section（占位符替换）：
- `{{change-id}}`：Change ID
- `{{completed-at}}`：ISO8601 时间戳
- `{{from-state}}`：testing
- `{{to-state}}`：completed
- `{{standards-need-update}}`：yes/no
- `{{product-need-update}}`：yes/no
- `{{featuretree-need-update}}`：yes/no
- `{{glossary-need-update}}`：yes/no

非结构化段落：
- §1 知识变化总结（新规则/新模式/新术语/新 Feature）
- §2 每个知识项的更新内容与理由（见 §2.3 格式）
- §3 知识沉淀过程记录（调用 sdd-knowledge 的执行记录）
- §4 完成确认 checklist：

```markdown
- [x] 全部前序 Artifact 已读取
- [x] 知识分类完成（standards/product/no-update）
- [x] standards 更新已写入（如有）
- [x] product 更新已写入（如有）
- [x] Feature Tree Story 状态已更新（如有）
- [x] 索引已重建
- [x] 无未解决的 Conflict 或 Unresolved 问题
```

### 4. 知识沉淀（调用 sdd-knowledge 能力 A）

读取 `skills/sdd-knowledge/SKILL.md`，执行「能力 A：知识沉淀」段落。

#### 4.1 沉淀策略

**Standards 写入：**
- 检查 `standards/` 是否已有同类文件
- 已有 → 合并（追加段落或更新现有段落，保留历史）
- 没有 → 新建文件，写入 front-matter（title/tags/related-changes）

**Product 写入：**
- 检查 `product/` 是否已有同类文件
- 已有 → 合并（更新能力清单、业务流程等）
- 没有 → 新建文件，写入 front-matter

**冲突处理：**
- 新知识与已有知识矛盾 → 标记为 Conflict
- 向用户展示冲突，请用户决定保留哪个
- 不擅自覆盖已有知识

### 5. 重建索引（调用 sdd-knowledge 能力 C）

读取 `skills/sdd-knowledge/SKILL.md`，执行「能力 C：索引构建」段落。
- 扫描 `standards/` 和 `product/` 全部 .md 文档
- 生成 `standards/INDEX.md` 和 `product/INDEX.md`（人读）
- 生成 `.sdd/knowledge-index.json`（Agent 检索）

### 6. 更新 Feature Tree（如需要）

如果 Story 状态需要变更：
```bash
openspec feature update <STORY-ID> --status delivered
```

**Story 状态变更规则：**
- planned → in-progress：开发开始时
- in-progress → delivered：测试通过且 Change 完成时

**Phase 2.4 多仓前提：** Story 置 delivered 前，其下全部 DU 必须 completed，
且 Workspace 引用的各子仓 commit 指针与实际 HEAD 一致
（可运行 `openspec doctor` 验证 submodule-pointer-aligned）。

### 7. 质量自检

产出前自检：
- [ ] 全部前序 Artifact 是否已读取（含 STORY 级 tasks 与各仓 DU 证据）？
- [ ] 每个 DU 是否 completed 且 result commit 与所属仓 HEAD 一致？
- [ ] 每个知识项是否明确了分类（standards/product/no-update）？
- [ ] standards 晋升的知识是否具备跨 Change 复用价值？
- [ ] product 更新是否与 Feature Tree 一致？
- [ ] 冲突是否已解决或标注？
- [ ] 索引是否已重建？
- [ ] Story 状态是否已更新（如需）？
- [ ] 无遗留的 Unresolved 问题？

### 8. 用户交互

展示 convergence.md 和知识更新给用户：
- 知识分类是否合理？
- standards/product 更新是否准确？
- 冲突处理是否满意？
- 索引是否完整？

## 产出草稿
- `delivery/changes/<CHG>/convergence.md` — 收敛报告
- `standards/<category>.md` — 技术规则更新（如有）
- `product/<domain>.md` — 产品知识更新（如有）
- `standards/INDEX.md` / `product/INDEX.md` — 索引更新
- `.sdd/knowledge-index.json` — 机器可读索引更新

## 用户确认

展示 convergence.md 和知识更新给用户：
- 知识分类是否合理？
- standards/product 更新是否准确？
- 索引是否完整？

确认后：
```bash
openspec gate check <CHG>
openspec gate approve <CHG>
openspec change status <CHG> --set completed
```

## 归档

完成后可归档：
```bash
openspec change archive <CHG>
```

**Phase 2.4 多仓注意：** Workspace 归档提交会更新对 `implementation/` 各子仓
commit 指针的引用；各仓 DU 交付记录已在该仓 Git 中独立提交，互不干扰。

## 工作示例

> 完整示例参考: `templates/artifacts/examples/convergence.md`（含知识分类/Standards 更新/Product 更新/归档）

**Change: CHG-0001 用户注册**

**知识提取：**
- design.md 中 bcrypt 密码哈希 → standards 候选（安全实践）
- design.md 中 error-handling 模式 → standards 候选（错误处理）
- prd.md 中"邮箱/手机号双入口" → product 候选（业务能力）
- implementation.md 中 API 响应格式 → no-update（实现细节）
- test-report.md 中边界 case 策略 → standards 候选（测试约定）

**convergence.md §2 知识项节选：**
```markdown
### Standards 晋升
- 文件: standards/security.md
- 操作: 新增
- 内容: 密码存储用 bcrypt，cost ≥ 10，不存明文
- 理由: 本 Change 实施密码安全存储，可作为后续认证相关 Change 参考

- 文件: standards/error-handling.md
- 操作: 新增
- 内容: API 错误分类（400/401/403/404/409/500）+ 统一响应格式
- 理由: 本 Change 确立了错误分类标准，后续接口应遵循

### Product 更新
- 文件: product/user-center.md
- 操作: 更新
- 内容: 新增"用户注册"能力（邮箱/手机号双入口）
- 理由: 补充产品能力清单
- 关联: STORY-3 delivered

### No Update
- POST /api/auth/register 的具体 JSON 响应字段
- 理由: 属实现细节，不具备复用价值
```

## 行为规则

- 知识沉淀通过 sdd-knowledge 执行，不直接写 standards/product
- Story 状态变更需在 Change 完成后执行
- 知识项必须明确分类理由，不模糊归类

> 通用行为约束（产出草稿供用户确认 / 冲突上报用户决定等）见 prompts/common/constraints.md。
