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

test('WorkflowLoader: loadWorkflow default 返回 7 个 stages', async () => {
  const wf = await loadWorkflow('default', harnessRoot);
  assert.equal(wf.id, 'default');
  assert.equal(wf.stages.length, 7);
  assert.equal(wf.stages[0].skill, 'sdd-explore');
  assert.equal(wf.stages[0]['from-state'], 'created');
  assert.equal(wf.stages[0]['to-state'], 'exploring');
  assert.equal(wf.stages[6]['to-state'], 'completed');
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
