# 贡献于 OpenSpec AI Development Harness


感谢您的贡献。


本文档定义了 OpenSpec Harness 的贡献规则。


---

# 1. 开发原则


OpenSpec 遵循：

规范驱动开发（Specification Driven Development）。


所有变更应遵循：


```
想法

↓

规范

↓

实现

↓

验证

↓

文档更新
```


---

# 2. 仓库结构规则


## docs/


包含稳定的设计文档。


示例：

- 架构
- 工作流
- 知识模型


变更需经过仔细评审。


---

## plans/


包含实现计划。


示例：

- 阶段计划
- 特性实现计划


---

## skills/


包含 AI Skill 实现。


每个 Skill 必须遵循：


```
skill-name/

├── skill.yaml

├── SKILL.md

├── templates/

├── examples/

├── checklist.md

└── rules.md
```


---

## tools/


包含可执行工具。


示例：

```
tools/

└── sdd-cli
```


---

# 3. 变更规则


每个有意义的变更都应包含：


```
变更

↓

实现

↓

验证
```


示例：


- 新增 Skill；
- 新增 CLI 命令；
- 新增模板；
- Schema 修改。


---

# 4. Skill 贡献规则


新增 Skill 必须提供：


## 元数据

```
skill.yaml
```


## 指令说明

```
SKILL.md
```


## 输出模板

```
templates/
```


## 示例

```
examples/
```


## 校验

```
checklist.md
```


---

# 5. 文档规则


文档变更应：


- 说明动机；
- 描述设计；
- 提供示例；
- 保持术语一致。


---

# 6. 提交约定


使用：


```
type: description
```


示例：


```
chore: initialize repository


feat: add sdd init command


feat: add knowledge reverse skill


docs: update workflow specification


fix: correct skill validation
```


---

# 7. 评审要求


合并前：


检查：


- 是否遵循现有规范？
- 是否引入冲突？
- 文档是否需要更新？
- 是否影响现有用户？


---

# 8. 版本管理


OpenSpec 遵循语义化版本：


```
MAJOR.MINOR.PATCH
```


示例：


```
1.0.0
```


---

# 9. 最终原则


OpenSpec Harness 本身使用 OpenSpec 原则开发。


框架应遵循其提供给用户的相同规则。
