# AI知识管理规范

> 版本：v0.1  
> 类型：AI工程规范  
> 作用域：OpenSpec Workspace


# 1. 文档目的


本文档定义 AI 应用中的知识管理规范。


目标：

- 规范 AI 使用知识的方式；
- 保证 AI 获取正确上下文；
- 建立知识来源和生命周期管理机制；
- 提升 AI 输出准确性和稳定性；
- 指导 AI Coding Agent 正确使用项目知识。


AI知识管理用于连接：


```
项目知识

+

AI模型能力

+

任务上下文

↓

智能执行能力
```


---

# 2. AI知识定位


AI 知识不是简单的文档集合。


AI知识应该包含：


```
知识来源

+

知识结构

+

知识状态

+

使用方式
```


---

# 3. 知识来源规范


OpenSpec Workspace 中的知识主要来源：


```
standards/

product/

delivery/

implementation/
```


不同知识具有不同职责。


---

# 3.1 Standards（规范知识）


位置：


```
standards/
```


作用：

定义长期稳定规则。


例如：

- 工程规范；
- 架构规范；
- 开发流程。


特点：

- 长生命周期；
- 高稳定性；
- 需要审批。


---

# 3.2 Product（产品知识）


位置：


```
product/
```


作用：

描述业务能力和产品定义。


例如：

- Feature；
- 业务术语；
- 用户需求；
- 产品规则。


特点：

- 面向业务；
- 持续演进。


---

# 3.3 Delivery（交付知识）


位置：


```
delivery/
```


作用：

描述具体变更过程。


例如：

- Change；
- Design；
- Task；
- Test Evidence。


特点：

- 面向当前开发；
- 有明确生命周期。


---

# 3.4 Implementation（实现知识）


位置：


```
implementation/
```


作用：

描述系统实际状态。


包括：

- 代码；
- 配置；
- SQL；
- 部署资源。


特点：

- 反映真实系统；
- 是 AI 分析的重要依据。


---

# 4. AI知识使用原则


## 4.1 优先使用项目知识


AI 执行任务时：

应该优先读取：


```
项目已有知识

↓

当前任务上下文

↓

模型通用能力
```


避免：

脱离项目实际情况生成答案。


---

## 4.2 知识来源可信度


推荐优先级：


```
Approved Standards

↓

Current Specifications

↓

Approved Product Knowledge

↓

Delivery Records

↓

Implementation Evidence

↓

模型推理
```


---

## 4.3 不确定性处理


当知识不足时：


AI 应该：

- 标记不确定；
- 请求补充信息；
- 创建 unresolved 记录。


禁止：

编造不存在的项目事实。


---

# 5. 知识结构规范


知识应该按照领域组织。


推荐：


```
knowledge/

├── domain/

├── architecture/

├── business/

├── engineering/
```


避免：

按照文件堆积。


---

# 6. 知识生命周期


知识应该具有生命周期。


流程：


```
Created

↓

Reviewed

↓

Approved

↓

Active

↓

Deprecated
```


---

# 6.1 Draft


表示：

正在形成中的知识。


例如：

```
reconstructed_draft
```


特点：

- 未确认；
- 不作为最终规则使用。


---

# 6.2 Approved


表示：

已经确认的正式知识。


可以：

- 被 AI 使用；
- 作为开发依据。


---

# 6.3 Deprecated


表示：

已经废弃的知识。


保留：

用于历史追踪。


---

# 7. 知识版本管理


重要知识应该版本化。


版本格式：


```
Major.Minor.Patch
```


例如：


```
order-domain-spec

1.0.0
```


---

# 8. AI知识检索规范


AI 获取知识时应该：


```
确定任务

↓

确定需要知识

↓

检索相关内容

↓

验证知识状态

↓

加载上下文
```


---

# 9. RAG知识管理规范


如果使用 RAG：

知识进入向量库前应该：


进行：

- 文档清理；
- 内容切分；
- 元数据标记；
- 版本记录。


---

## 9.1 Chunk设计


知识切片应该：

- 保持语义完整；
- 避免过大；
- 避免破坏上下文。


---

## 9.2 Metadata要求


知识片段应该记录：


例如：


```yaml
source: standards/backend

version: v0.1

status: approved

domain: engineering
```


---

# 10. 知识更新规范


知识更新应该通过变更流程。


流程：


```
发现变化

↓

提出更新

↓

审核

↓

更新知识

↓

重新生效
```


---

# 11. AI Coding Agent知识规则


AI Coding Agent 执行任务时必须：


读取：

```
standards/

+

product/

+

delivery/

+

implementation/
```


根据任务选择范围。


---

AI 不应该：


## 11.1 修改已批准知识


禁止直接修改：


```
Approved Standards

Approved Specs
```


---

## 11.2 混淆观察和事实


例如：

代码观察：


```
当前代码存在某行为
```


不能直接转换为：


```
业务规则就是如此
```


---

## 11.3 删除历史知识


历史知识应该：

保留并标记状态。


---

# 12. 知识质量检查


知识进入正式状态前检查：


```
[ ] 来源明确

[ ] 状态明确

[ ] 版本明确

[ ] 责任范围明确

[ ] 无明显冲突

[ ] 可被AI正确使用
```


---

# 13. 与OpenSpec Harness关系


OpenSpec Harness 中：


```
Knowledge

↓

Agent

↓

Skill

↓

Artifact
```


知识为 Agent 提供：

- 背景；
- 规则；
- 约束；
- 判断依据。


---

# 14. 总结


AI知识管理规范用于保证：


```
项目知识

+

AI能力

+

工程流程
```


形成稳定可靠的 AI 开发体系。


优秀的 AI 知识体系应该：

- 来源清晰；
- 状态明确；
- 可追踪；
- 可持续演进。
