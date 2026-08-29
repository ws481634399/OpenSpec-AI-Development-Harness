---
name: output-format
category: common
version: 0.1.0
purpose: 所有 SDD Skill 共享的 Artifact 输出格式约定
---

## Artifact 输出格式

- Artifact 使用 Markdown，正文使用中文（代码、标识符、路径除外）
- 读取 `templates/artifacts/<artifact>` 模板后，按 section 逐个填充，不增删模板结构
- 元信息 section 的 `{{placeholder}}` 占位符必须全部替换；不确定的值向用户确认，不填占位文本
- 非结构化分析 section 必须填写实质内容，禁止留空或残留 HTML 注释（`<!-- -->`）
- 表格用于结构化对照（AC 清单/Commit 记录/发现清单），列表用于要点陈述
- 引用其他文件时写相对路径（如 `delivery/changes/CHG-0001/prd.md`），保证可追溯

## Evidence 记录

- 涉及代码修改与测试执行时，同步向 `evidence/evidence.yaml` 追加结构化条目（code-change / test-run / review-finding）
- 条目 id 沿用已有前缀递增（EV-001、EV-002...），recorded-at 使用 ISO8601 时间戳
