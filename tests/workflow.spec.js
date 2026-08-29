// Unit tests: WorkflowLoader / WorkflowEngine（WAITING / RESUME / state-map 查表）
// 对齐 phase-1.5-workflow-engine-design.md §17.2 / §17.3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { loadWorkflow, listWorkflows, findStageByToState } from '../core/sdd/workflow-loader.js';
import { runWorkflow, WORKFLOW_RESULT } from '../core/sdd/workflow-engine.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, patchStatus } from '../core/sdd/change-model.js';
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

// 完整的 exploration.md 内容（通过 sdd-explore gate 的所有 machine-checks）
const FULL_EXPLORATION = '# Exploration\n\n## 1. 需求理解\n需求内容\n\n## 2. Feature 归属\n归属\n\n## 3. 影响分析\n影响\n\n## 4. 未知问题\n无\n\n## 5. 旧需求沿用判断\n无\n';

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

test('WorkflowLoader: findStageByToState specified → sdd-prd + prd.md', () => {
  const wf = {
    stages: [
      { skill: 'sdd-prd', artifact: 'prd.md', gate: 'prd', 'from-state': 'exploring', 'to-state': 'specified' },
    ],
  };
  const stage = findStageByToState(wf, 'specified');
  assert.equal(stage.skill, 'sdd-prd');
  assert.equal(stage.artifact, 'prd.md');
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

test('WorkflowEngine: Artifact 存在但 Human Gate pending → WAITING_FOR_HUMAN', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  // Machine Gate 应 passed，Human Gate pending → WAITING_FOR_HUMAN
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);
  // 验证 Machine Gate 已持久化为 passed
  const gateResult = await readGateResult(changeDir, 'exploration.md');
  assert.equal(gateResult.gates.machine.status, 'passed');
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

test('WorkflowEngine: Human approved 但 Artifact 已修改（hash 不匹配）→ WAITING_FOR_HUMAN', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  // 写旧的 Machine + Human Gate（hash 不匹配当前 Artifact）
  await writeMachineGate(changeDir, 'exploration.md', {
    status: 'passed',
    artifactHash: 'sha256:old',
    validator: 'sdd-explore',
  });
  await writeHumanGate(changeDir, 'exploration.md', {
    status: 'approved',
    artifactHash: 'sha256:old',
  });
  // workflow run：machine gate 会重跑（hash 变化），覆盖旧 machine hash
  // human gate hash 仍为 'sha256:old'，与新 machine hash 不匹配 → WAITING_FOR_HUMAN
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);
  await rmrf(tmp);
});

test('WorkflowEngine: Machine Gate failed → WAITING_FOR_MACHINE_FIX', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  // 写一个不完整的 exploration.md（缺 section）
  await writeFile(
    join(changeDir, 'exploration.md'),
    '# Exploration\n\n## 1. 需求理解\n内容\n',
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

test('WorkflowEngine: 断点续跑——第一次 WAITING_FOR_HUMAN，approve 后再 run → ADVANCED', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');

  // 第一次 run：machine passed + human pending → WAITING_FOR_HUMAN
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);

  // 模拟 gate approve：用 machine gate 写入的真实 hash 写 Human Gate
  const gateResult = await readGateResult(changeDir, 'exploration.md');
  const realHash = gateResult.gates.machine['artifact-hash'];
  await writeHumanGate(changeDir, 'exploration.md', {
    status: 'approved',
    artifactHash: realHash,
  });

  // 第二次 run：ADVANCED → exploring → 下一阶段 sdd-prd Artifact 不存在 → WAITING_FOR_ARTIFACT
  const r2 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r2.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r2.stage.skill, 'sdd-prd');
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'exploring');
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

test('WorkflowEngine: 检查点双门禁通过 → review-report accepted 且状态保持 testing → 继续 converge', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await advanceTo(changeDir, 'testing');
  // review gate 含 du-fan-in-complete（Phase 2.4）：预置已完成 DU
  const { setupDu } = await import('./helpers/du-fixture.js');
  await setupDu(tmp, changeId, changeDir, { status: 'completed' });
  await writeFile(join(changeDir, 'review-report.md'), fullReviewReport(changeId), 'utf8');

  // 第一次 run：machine passed + human pending → WAITING_FOR_HUMAN
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);

  // 用 machine gate 写入的真实 hash 模拟 gate approve --stage review
  const gr = await readGateResult(changeDir, 'review-report.md');
  await writeHumanGate(changeDir, 'review-report.md', {
    status: 'approved',
    artifactHash: gr.gates.machine['artifact-hash'],
  });

  // 第二次 run：检查点验收（状态不变）→ 循环继续 → converge Artifact 缺失
  const r2 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r2.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r2.stage.skill, 'sdd-converge');

  // 检查点已 accepted，Change 状态保持 testing
  const reviewGate = await readGateResult(changeDir, 'review-report.md');
  assert.equal(reviewGate.status, 'accepted');
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
