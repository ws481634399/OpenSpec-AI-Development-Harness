// Unit tests: TransitionService（Phase 3.6 补直接单测）
// 锁定 requestTransition 的 WAITING_FOR_* 断点语义与 hash stale 防护（phase-1.5 §8）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata } from '../core/sdd/change-model.js';
import { loadGate } from '../core/sdd/gate-config-loader.js';
import { runMachineGate } from '../core/sdd/gate-validator.js';
import { writeMachineGate, writeHumanGate, readGateResult } from '../core/sdd/gate-repository.js';
import { requestTransition } from '../core/sdd/transition-service.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

// sdd-explore gate.yaml 的 required-sections（非空标题）
const EXPLORATION = [
  '# Exploration',
  '',
  '## 1. 需求理解',
  '用户需要登录能力。',
  '',
  '## 2. Feature 归属',
  '归属现有 Feature。',
  '',
  '## 3. 影响分析',
  '影响认证模块。',
  '',
].join('\n');

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'transition-'));
  await runInit(
    {
      name: 'transition-test',
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
    { title: 'Transition 测试', requirement: 'REQ-TRANSITION', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

// 产出 exploration.md + Machine Gate passed（人工 Gate 由用例自行决定）
async function seedExplorationWithMachineGate(changeDir) {
  await writeFile(join(changeDir, 'exploration.md'), EXPLORATION, 'utf8');
  const gateConfig = await loadGate('sdd-explore', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, `fixture 应通过 Machine Gate: ${r.issues.join('; ')}`);
  await writeMachineGate(changeDir, gateConfig.artifact, {
    status: 'passed',
    issues: r.issues,
    artifactHash: r.artifactHash,
    validator: 'sdd-explore',
  });
  return { gateConfig, hash: r.artifactHash };
}

test('TransitionService: Artifact 缺失 → WAITING_FOR_ARTIFACT', async () => {
  const { tmp, changeDir } = await setupChange();
  const r = await requestTransition(changeDir, 'exploring', { harnessRoot });
  assert.equal(r.advanced, false);
  assert.ok(r.reason.startsWith('WAITING_FOR_ARTIFACT'), r.reason);
  await rmrf(tmp);
});

test('TransitionService: Machine Gate 未跑 → WAITING_FOR_MACHINE', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), EXPLORATION, 'utf8');
  const r = await requestTransition(changeDir, 'exploring', { harnessRoot });
  assert.equal(r.advanced, false);
  assert.ok(r.reason.startsWith('WAITING_FOR_MACHINE'), r.reason);
  await rmrf(tmp);
});

test('TransitionService: Machine passed 但 Human 未批 → WAITING_FOR_HUMAN', async () => {
  const { tmp, changeDir } = await setupChange();
  await seedExplorationWithMachineGate(changeDir);
  const r = await requestTransition(changeDir, 'exploring', { harnessRoot });
  assert.equal(r.advanced, false);
  assert.ok(r.reason.startsWith('WAITING_FOR_HUMAN'), r.reason);
  await rmrf(tmp);
});

test('TransitionService: Artifact 变更后 Machine hash 失效 → WAITING_FOR_MACHINE（stale 防护）', async () => {
  const { tmp, changeDir } = await setupChange();
  const { gateConfig } = await seedExplorationWithMachineGate(changeDir);
  await writeHumanGate(changeDir, gateConfig.artifact, { status: 'approved' });
  // Gate 通过后 Artifact 再被修改 → machine hash 不匹配
  await writeFile(join(changeDir, 'exploration.md'), EXPLORATION + '\n追加内容。\n', 'utf8');
  const r = await requestTransition(changeDir, 'exploring', { harnessRoot });
  assert.equal(r.advanced, false);
  assert.ok(r.reason.startsWith('WAITING_FOR_MACHINE'), r.reason);
  await rmrf(tmp);
});

test('TransitionService: Human hash 与当前不一致 → WAITING_FOR_HUMAN（stale 防护）', async () => {
  const { tmp, changeDir } = await setupChange();
  const { gateConfig } = await seedExplorationWithMachineGate(changeDir);
  await writeHumanGate(changeDir, gateConfig.artifact, { status: 'approved', artifactHash: 'deadbeef' });
  const r = await requestTransition(changeDir, 'exploring', { harnessRoot });
  assert.equal(r.advanced, false);
  assert.ok(r.reason.startsWith('WAITING_FOR_HUMAN'), r.reason);
  assert.ok(r.reason.includes('stale'), r.reason);
  await rmrf(tmp);
});

test('TransitionService: 双 Gate 通过 → 推进状态 + Artifact accepted', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  const { gateConfig, hash } = await seedExplorationWithMachineGate(changeDir);
  await writeHumanGate(changeDir, gateConfig.artifact, { status: 'approved', artifactHash: hash });

  const r = await requestTransition(changeDir, 'exploring', { harnessRoot });
  assert.equal(r.advanced, true);
  assert.equal(r.reason, 'created → exploring');

  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'exploring');
  const gateResult = await readGateResult(changeDir, 'exploration.md');
  assert.equal(gateResult.status, 'accepted');
  await rmrf(tmp);
});

test('TransitionService: 跳阶段请求抛错（caller bug，状态机拒绝）', async () => {
  const { tmp, changeDir } = await setupChange();
  await assert.rejects(
    () => requestTransition(changeDir, 'specified', { harnessRoot }),
    /Illegal transition/
  );
  await rmrf(tmp);
});

test('TransitionService: 推进后 metadata status 持久化（断点续跑可读）', async () => {
  const { tmp, changeDir } = await setupChange();
  const { gateConfig, hash } = await seedExplorationWithMachineGate(changeDir);
  await writeHumanGate(changeDir, gateConfig.artifact, { status: 'approved', artifactHash: hash });
  await requestTransition(changeDir, 'exploring', { harnessRoot });
  const raw = await readFile(join(changeDir, 'metadata.yaml'), 'utf8');
  assert.ok(raw.includes('status: exploring'), 'metadata.yaml 应持久化新状态');
  await rmrf(tmp);
});
