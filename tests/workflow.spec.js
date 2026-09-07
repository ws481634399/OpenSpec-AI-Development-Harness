// Unit tests: WorkflowLoader / WorkflowEngine（WAITING / RESUME / state-map 查表）
// 对齐 phase-1.5-workflow-engine-design.md §17.2 / §17.3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { loadWorkflow, listWorkflows, findStageByToState } from '../core/sdd/workflow-loader.js';
import { runWorkflow, detectStaleArtifacts, WORKFLOW_RESULT } from '../core/sdd/workflow-engine.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, patchStatus, patchMetadata } from '../core/sdd/change-model.js';
import { writeMachineGate, writeHumanGate, readGateResult } from '../core/sdd/gate-repository.js';
import { sha256 } from '../core/sdd/artifact-hash.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'wf-engine-'));
  await runInit(
    {
      name: 'wf-test',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: 'Workflow 测试', requirement: 'REQ-WF', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

// 完整的 exploration.md 内容（通过 sdd-explore gate 的所有 machine-checks，与 gate.yaml 五节对齐）
const FULL_EXPLORATION = '# Exploration\n\n## 1. 需求要点\n- 需求内容\n\n## 2. Story 归属判定\n归属\n\n## 3. 证据评估\n证据充分\n\n## 4. 冲突点检测\n无冲突\n\n## 5. 待澄清问题\n无\n';

// ---- WorkflowLoader ----

test('WorkflowLoader: loadWorkflow default 返回 8 个 stages（Phase 2.2 含 review 检查点）', async () => {
  const wf = await loadWorkflow('default', harnessRoot);
  assert.equal(wf.id, 'default');
  assert.equal(wf.stages.length, 8);
  assert.equal(wf.stages[0].skill, 'sdd-explore');
  assert.equal(wf.stages[0]['from-state'], 'created');
  assert.equal(wf.stages[0]['to-state'], 'exploring');
  // Phase 2.2：review 同态检查点位于 test 与 converge 之间
  assert.equal(wf.stages[6].skill, 'sdd-review');
  assert.equal(wf.stages[6].artifact, 'review-report.md');
  assert.equal(wf.stages[6]['from-state'], 'testing');
  assert.equal(wf.stages[6]['to-state'], 'testing');
  assert.equal(wf.stages[7]['to-state'], 'completed');
});

test('WorkflowLoader: findStageByToState specified → sdd-prd + spec.md', () => {
  const wf = {
    stages: [
      { skill: 'sdd-prd', artifact: 'spec.md', gate: 'prd', 'from-state': 'exploring', 'to-state': 'specified' },
    ],
  };
  const stage = findStageByToState(wf, 'specified');
  assert.equal(stage.skill, 'sdd-prd');
  assert.equal(stage.artifact, 'spec.md');
});

test('WorkflowLoader: findStageByToState 不存在的 state 返回 null', () => {
  assert.equal(findStageByToState({ stages: [] }, 'specified'), null);
});

test('WorkflowLoader: 不存在的 workflow 抛错', async () => {
  await assert.rejects(() => loadWorkflow('nonexistent', harnessRoot), /Workflow not found/);
});

test('WorkflowLoader: listWorkflows 至少返回 default', async () => {
  const list = await listWorkflows(harnessRoot);
  assert.ok(list.some((w) => w.id === 'default'));
});

// ---- WorkflowEngine ----

test('WorkflowEngine: 无 Artifact → WAITING_FOR_ARTIFACT（生成 Instruction）', async () => {
  const { tmp, changeId } = await setupChange();
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-explore');
  assert.ok(r.instruction, '应生成 Instruction');
  await rmrf(tmp);
});

// 完整的 spec.md 内容（通过 sdd-prd gate 的所有 machine-checks）
const FULL_PRD =
  '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 3. 范围\n### 3.1 包含\nA\n### 3.2 不包含\nB\n\n## 4. 业务规则\n规则\n\n## 5. 验收标准\n标准内容\n\n## 6. 成功指标\n本期不度量\n';

test('WorkflowEngine: explore 免人审（human-gate: skip）→ 机检通过自动推进 → WAITING_FOR_ARTIFACT(prd)', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  // Machine Gate passed → human-gate skip → 自动推进 exploring → prd Artifact 不存在
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-prd');
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'exploring');
  // Gate Result：machine passed + human skipped（留痕，非 approved）
  const gateResult = await readGateResult(changeDir, 'exploration.md');
  assert.equal(gateResult.gates.machine.status, 'passed');
  assert.equal(gateResult.gates.human.status, 'skipped');
  await rmrf(tmp);
});

test('WorkflowEngine: Human approved + hash 匹配 → ADVANCED + 状态推进到 exploring', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  // 计算 artifact hash，写 Machine + Human Gate（hash 一致）
  const content = await readFile(join(changeDir, 'exploration.md'), 'utf8');
  const hash = sha256(content);
  await writeMachineGate(changeDir, 'exploration.md', {
    status: 'passed',
    artifactHash: hash,
    validator: 'sdd-explore',
  });
  await writeHumanGate(changeDir, 'exploration.md', {
    status: 'approved',
    artifactHash: hash,
  });
  // workflow run：machine passed + human approved + hash 匹配 → requestTransition → exploring
  // 下一阶段 sdd-prd Artifact 不存在 → WAITING_FOR_ARTIFACT
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-prd');
  // 验证状态已推进
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'exploring');
  // 验证 Artifact status = accepted
  const gateResult = await readGateResult(changeDir, 'exploration.md');
  assert.equal(gateResult.status, 'accepted');
  await rmrf(tmp);
});

test('WorkflowEngine: prd（human-gate required）Human approved 但 Artifact 已修改（hash 不匹配）→ WAITING_FOR_HUMAN', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'exploring');
  await writeFile(join(changeDir, 'spec.md'), FULL_PRD, 'utf8');
  // 写 Human Gate approved 但 hash 是旧的（Artifact 在 approve 后被修改）
  await writeHumanGate(changeDir, 'spec.md', {
    status: 'approved',
    artifactHash: 'sha256:old',
  });
  // workflow run：machine gate 重跑通过（刷新 machine hash），human hash 仍为旧值 → WAITING_FOR_HUMAN
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);
  await rmrf(tmp);
});

test('WorkflowEngine: Machine Gate failed → WAITING_FOR_MACHINE_FIX', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  // 写一个不完整的 exploration.md（缺 section）
  await writeFile(
    join(changeDir, 'exploration.md'),
    '# Exploration\n\n## 1. 需求要点\n内容\n',
    'utf8'
  );
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX);
  // 验证 Machine Gate 已持久化为 failed
  const gateResult = await readGateResult(changeDir, 'exploration.md');
  assert.equal(gateResult.gates.machine.status, 'failed');
  await rmrf(tmp);
});

test('WorkflowEngine: completed 状态 → COMPLETED', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  const { validateTransition } = await import('../core/sdd/change-state-machine.js');
  // 手动推进所有状态到 completed（仅测试 COMPLETED 路径，绕过 Gate）
  for (const s of ['exploring', 'specified', 'designed', 'tasked', 'developing', 'testing', 'completed']) {
    validateTransition((await readMetadata(changeDir)).status, s);
    await patchStatus(changeDir, s);
  }
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.COMPLETED);
  await rmrf(tmp);
});

test('WorkflowEngine: 断点续跑——prd 阶段 WAITING_FOR_HUMAN，approve 后再 run → ADVANCED', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'exploring');
  await writeFile(join(changeDir, 'spec.md'), FULL_PRD, 'utf8');

  // 第一次 run：machine passed + human pending（required）→ WAITING_FOR_HUMAN
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);

  // 模拟 gate approve：用 machine gate 写入的真实 hash 写 Human Gate
  const gateResult = await readGateResult(changeDir, 'spec.md');
  const realHash = gateResult.gates.machine['artifact-hash'];
  await writeHumanGate(changeDir, 'spec.md', {
    status: 'approved',
    artifactHash: realHash,
  });

  // 第二次 run：ADVANCED → specified → 下一阶段 design Artifact 不存在 → WAITING_FOR_ARTIFACT
  const r2 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r2.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r2.stage.skill, 'sdd-design');
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'specified');
  await rmrf(tmp);
});

// ---- Phase 4.1 Stale 传播检测（痛点 2a）----

test('detectStaleArtifacts: passed 产物 Gate 后被改动 → hash-mismatch', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  const hash = sha256(FULL_EXPLORATION);
  await writeMachineGate(changeDir, 'exploration.md', {
    status: 'passed',
    artifactHash: hash,
    validator: 'sdd-explore',
  });
  // Gate 后修改产物（模拟上游变更）
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION + '\n补充内容', 'utf8');
  const stale = await detectStaleArtifacts(changeDir);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].artifact, 'exploration.md');
  assert.equal(stale[0].kind, 'hash-mismatch');
  await rmrf(tmp);
});

test('detectStaleArtifacts: failed 产物被修复不报 stale（合法编辑）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  // 残缺产物 → machine gate failed（WAITING_FOR_MACHINE_FIX）
  await writeFile(join(changeDir, 'exploration.md'), '# Exploration\n\n## 1. 需求要点\n内容\n', 'utf8');
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX);
  // 用户按提示修复产物（合法编辑，非 stale）
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  const stale = await detectStaleArtifacts(changeDir);
  assert.deepEqual(stale, []);
  await rmrf(tmp);
});

test('detectStaleArtifacts: passed 产物被删除 → missing', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  const hash = sha256(FULL_EXPLORATION);
  await writeMachineGate(changeDir, 'exploration.md', {
    status: 'passed',
    artifactHash: hash,
    validator: 'sdd-explore',
  });
  const { unlink } = await import('node:fs/promises');
  await unlink(join(changeDir, 'exploration.md'));
  const stale = await detectStaleArtifacts(changeDir);
  assert.equal(stale.length, 1);
  assert.equal(stale[0].kind, 'missing');
  await rmrf(tmp);
});

test('detectStaleArtifacts: 无产物时返回空数组', async () => {
  const { tmp, changeDir } = await setupChange();
  const stale = await detectStaleArtifacts(changeDir);
  assert.deepEqual(stale, []);
  await rmrf(tmp);
});

test('runWorkflow: 返回值带 stale 字段（缺省空数组）', async () => {
  const { tmp, changeId } = await setupChange();
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.deepEqual(r.stale, []);
  await rmrf(tmp);
});

test('runWorkflow: 产物 Gate 后被改动 → stale 非空且 run 结果正常返回', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  // 第一次 run：机检 passed + human skip → 推进到 exploring → WAITING_FOR_ARTIFACT(prd)
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  // Gate 后修改已通过的 exploration.md
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION + '\n补充内容', 'utf8');
  const r2 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r2.stale.length, 1);
  assert.equal(r2.stale[0].artifact, 'exploration.md');
  // run 本身不被 stale 阻断（prd artifact 仍缺 → WAITING_FOR_ARTIFACT）
  assert.equal(r2.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  await rmrf(tmp);
});

// ---- Phase 2.2 同态检查点（sdd-review）----
// 对齐 plans/phase-2.2-sdd-review-skill-design.md §5

// 逐状态推进到指定状态（走 validateTransition，模拟正常生命周期）
async function advanceTo(changeDir, targetStatus) {
  const { validateTransition } = await import('../core/sdd/change-state-machine.js');
  const path = ['exploring', 'specified', 'designed', 'tasked', 'developing', 'testing', 'completed'];
  for (const s of path) {
    const current = (await readMetadata(changeDir)).status;
    if (current === targetStatus) return;
    validateTransition(current, s);
    await patchStatus(changeDir, s);
    if (s === targetStatus) return;
  }
}

// 通过 sdd-review gate 其它 machine-checks 的最小 review-report.md
function fullReviewReport(changeId) {
  return [
    '# Review Report',
    '',
    '## 0. 元信息',
    '',
    `- Change ID: ${changeId}`,
    '- Test Report 来源: evidence/test-report.md',
    '- Evidence 索引: evidence/evidence.yaml',
    '- 状态流转: testing（检查点，状态不变）',
    '- 检查时间: 2026-08-28T12:00:00.000Z',
    '',
    '## 1. 检查结论',
    '',
    '四项检查全部通过，无未闭环发现。',
    '',
    '### 1.1 需求一致性',
    '',
    '全部 AC 有 test-run 覆盖。',
    '',
    '### 1.2 设计一致性',
    '',
    '实现与设计一致。',
    '',
    '### 1.3 代码质量',
    '',
    '无规范违规。',
    '',
    '### 1.4 知识同步候选',
    '',
    '无。',
    '',
    '## 2. 发现清单',
    '',
    '无 blocker/major 发现。',
    '',
    '## 3. 完成确认',
    '',
    '- [x] 四项检查全部执行',
  ].join('\n');
}

test('WorkflowEngine: testing 状态无 review-report → WAITING_FOR_ARTIFACT(sdd-review)', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'testing');
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-review');
  assert.ok(r.instruction, '应生成 sdd-review Instruction');
  await rmrf(tmp);
});

test('WorkflowEngine: 检查点免人审（human-gate: skip）→ 双门禁通过 → review-report accepted 且状态保持 testing → 继续 converge', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'testing');
  // review gate 含 du-fan-in-complete（Phase 2.4）：预置已完成 DU
  const { setupDu } = await import('./helpers/du-fixture.js');
  await setupDu(tmp, changeId, changeDir, { status: 'completed' });
  // Phase 3.5 修订：绑定后产物落 STORY 目录（TEST_FEATURE_PATH 名字段）
  await mkdir(join(changeDir, '用户中心', '账户能力', '用户认证', '用户注册'), { recursive: true });
  await writeFile(
    join(changeDir, '用户中心', '账户能力', '用户认证', '用户注册', 'review-report.md'),
    fullReviewReport(changeId),
    'utf8'
  );

  // 一次 run：machine passed + human skip → 检查点验收（accepted）→ 继续 converge Artifact 缺失
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r1.stage.skill, 'sdd-converge');

  // 检查点已 accepted，human 段记 skipped（留痕），Change 状态保持 testing
  const reviewGate = await readGateResult(changeDir, 'review-report.md');
  assert.equal(reviewGate.status, 'accepted');
  assert.equal(reviewGate.gates.human.status, 'skipped');
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'testing');
  await rmrf(tmp);
});

test('GateValidator: review-report 未 accepted 时 converge machine gate 失败（all-predecessors-accepted）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'testing');
  // review-report.md 不存在（未 accepted）→ 写一份其余检查通过的 convergence.md
  await writeFile(
    join(changeDir, 'convergence.md'),
    [
      '# Convergence',
      '',
      '## 0. 元信息',
      '',
      `- Change ID: ${changeId}`,
      '',
      '## 1. 知识变化总结',
      '',
      '无新增知识。',
      '',
      '## 2. 更新判断',
      '',
      'standards: no-update；product: no-update。',
    ].join('\n'),
    'utf8'
  );
  const { loadGate } = await import('../core/sdd/gate-config-loader.js');
  const gateConfig = await loadGate('sdd-converge', harnessRoot);
  const { runMachineGate } = await import('../core/sdd/gate-validator.js');
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(
    r.issues.some((i) => i.includes('review-report.md')),
    `应报 review-report.md 未 accepted: ${r.issues.join('; ')}`
  );
  await rmrf(tmp);
});

// ---- Phase 2.6 Context v2（prepareSkillInvocation 传 changeDir → 注入 Change Artifacts）----

test('WorkflowEngine: prd 阶段 .instruction.md 注入 requirement.md 正文（Change Artifacts）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  await writeFile(join(changeDir, 'requirement.md'), 'REQ-CONTEXT-MARKER-2646', 'utf8');
  const content = await readFile(join(changeDir, 'exploration.md'), 'utf8');
  const hash = sha256(content);
  await writeMachineGate(changeDir, 'exploration.md', {
    status: 'passed',
    artifactHash: hash,
    validator: 'sdd-explore',
  });
  await writeHumanGate(changeDir, 'exploration.md', {
    status: 'approved',
    artifactHash: hash,
  });
  // ADVANCED → 下一阶段 sdd-prd：prepareSkillInvocation 传 changeDir/metadata
  // → .instruction.md 的 Change Artifacts section 含 requirement.md 正文
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-prd');
  const instruction = await readFile(join(changeDir, '.instruction.md'), 'utf8');
  assert.ok(instruction.includes('## Change Artifacts'), instruction);
  assert.ok(instruction.includes(`delivery/changes/${changeId}/requirement.md`), instruction);
  assert.ok(instruction.includes('REQ-CONTEXT-MARKER-2646'), 'requirement.md 正文应注入 Instruction');
  await rmrf(tmp);
});

// ---- Phase 2.7 DU 绑定执行（--du 透传，plans/phase-2.7-du-repo-context-design.md §8）----

test('WorkflowEngine: 非 dev/test 阶段忽略 --du（不存在 DU 也不抛错）', async () => {
  const { tmp, changeId } = await setupChange();
  // created → explore stage；若透传 du 会因 DU 不存在抛错，被忽略则正常返回
  const r = await runWorkflow(tmp, changeId, { harnessRoot, du: 'DU-NOPE-999' });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-explore');
  assert.ok(r.instruction);
  await rmrf(tmp);
});

test('WorkflowEngine: dev 阶段 --du 透传生效（DU 不存在 → 抛错）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'developing');
  // tasks.md（Story 级 artifact）不存在 → WAITING_FOR_ARTIFACT 分支 → assembleContext 校验 DU
  await assert.rejects(
    () => runWorkflow(tmp, changeId, { harnessRoot, du: 'DU-NOPE-999' }),
    /Workspace DU not found: DU-NOPE-999/
  );
  await rmrf(tmp);
});
