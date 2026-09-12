# 当前开发状态

> 本页记录实现快照；权威版本号以仓库根 `.version` 为准。

- **版本：** v0.4.0
- **阶段：** Phase 4.3（可追踪规格与执行隔离）
- **状态：** S1–S4 已交付
- **最后更新：** 2026-09-10
- **工作树基线：** `master` 与 `origin/master` 对齐；更新本文档前无未提交改动
- **设计记录：** [Phase 4.3：可追踪规格与执行隔离](../../plans/phase-4.3-traceability-tdd-design.md)
- **历史 Session：** [Phase 4.2 Story 3 收尾](sessions/2026-09-02-phase-4-2-story-3-workflow-多-story-推进-向后兼容-phase-4-2-story-3-收尾-多-story-workflow-集成测试与-3-个缺陷修复.md)

## 最近完成的工作

- Phase 4.2：Change–Story–DU 三级规格、多 Story 独立推进与 Change 聚合状态、inline 单 Story 向后兼容、Stale 分层传播。
- Phase 4.3 S1：规格命名统一、schema v4、AC-NNN 等追踪 ID 规范。
- Phase 4.3 S2：按领域边界拆分 Story，DU 划分从 task 前移到 design，并增加追踪链前半段机检。
- Phase 4.3 S3–S4：新增 `test-design.md`、红绿灯 TDD 记录、独立测试证据，以及 AC/DU/TC/EVD 追踪链机检。
- Gate 规则增加 `rules-hash`，规则变化后旧 Gate 自动判定为 stale。
- 新增 `openspec approve`，支持扫描待审批项、记录审批人并自动续跑 Workflow。
- IDE 目标扩展为 Trae、Cursor、Claude Code 和 Codex。

## 验证状态

- 2026-09-10 使用 Node.js 测试运行器执行全部测试：499 passed，0 failed，0 skipped。
- CLI `--help` 与 `--version` 冒烟通过，报告版本 `0.4.0`。

## 进行中与阻塞项

- 当前没有记录中的进行中开发项或阻塞项。

## 后续建议

- 补强“1 Change → 3 Story → 5 DU”全物化端到端验收，覆盖 dev/test/review 与 DU 状态回流。
- 继续收口 README、CLI 帮助和设计期文档之间的版本表述。
- 明确 npm 发布方式并补充 LICENSE。
