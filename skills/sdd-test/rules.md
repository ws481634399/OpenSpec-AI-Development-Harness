# sdd-test Rules

## R1：生命周期约束

- 必须在 `developing` 状态启动，推进到 `testing`

## R2：证据约束

- 证据必须可追溯（不能只写"通过了"，要能定位到证据）
- 不建议把截图/视频等大二进制进 Git，建议外部存储 + 贴链接
- 测试失败必须记录缺陷编号或问题链接
- 每个 DU 至少一个验收测试（du-fan-in-testing）；每条 spec 验收标准（AC-NNN）至少一个测试用例
- 多仓测试在各仓内执行，Workspace 聚合侧只做 evidence-ref 引用，不复制正文

## R3：代码冻结

- 进入 testing 阶段后，除非修缺陷，不应新增 design 外的功能
- 修缺陷必须对应新的 Commit 记录（回填 implementation.md §3 Commit 记录表）

## R4：Artifact 写入约束

- 只写 evidence/ 下的 Artifact
- 不修改 implementation.md / tasks.md / design.md / spec.md
- patchStatus 前 validateTransition(developing, testing)
