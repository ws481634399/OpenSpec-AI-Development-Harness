# sdd-test Checklist

sdd-test 执行后，外部 Agent 完成测试与报告前，必须检查以下项：

## 1. 元信息

- [ ] 状态流转：developing → testing
- [ ] 执行时间 tested-at 已记录；Evidence 索引完整

## 2. 测试范围与覆盖

- [ ] §1 测试范围列出本报告覆盖的全部 DU（du-fan-in-testing：每个 DU 至少一个验收测试）
- [ ] 每个 DU 的 Verification 清单（tasks.md：Unit/Integration/API/Migration/Error Case）已逐条验证
- [ ] spec 每条验收标准（AC-NNN）都有至少一个测试用例覆盖（AC↔TC 映射表无缺口）
- [ ] design.md §4 跨仓协作契约（API/Event/Data + 集成边界）有集成/E2E 测试覆盖
- [ ] 正常路径、异常路径（并发/超时/依赖失败）、边界值（空/最小/最大/超长）均有覆盖

## 3. 执行与证据

- [ ] §2 执行汇总表按分类（单元/集成/E2E）填了数字，通过率已计算
- [ ] §3 证据清单引用实际证据（日志/截图/报告链接）；多仓证据以 evidence-ref 引用所属仓 DU 侧文件，不复制正文
- [ ] evidence.yaml 中 test-run 条目 `covers` 字段覆盖全部 AC-NNN 与 DU（sdd-review 需求一致性检查的机检输入）
- [ ] 失败的测试附了失败分析与处理决策（修复 / 延期 + 理由 + 缺陷链接）
- [ ] 测试日志完整保存到所属仓 DU evidence/

## 4. 状态推进

- [ ] 全部 DU 测试通过（或失败项已闭环）后才推进 status 到 testing
- [ ] 前序 Artifact（implementation.md / tasks.md / design.md / spec.md）未被改动；修缺陷的新 Commit 已回填 implementation.md §3
