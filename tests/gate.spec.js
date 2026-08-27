// Unit tests: ArtifactHash / GateConfigLoader / GateValidator / GateRepository
// 对齐 phase-1.5-workflow-engine-design.md §17.2 / §17.3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { sha256, hashMatches } from '../core/sdd/artifact-hash.js';
import { loadGate, listGates } from '../core/sdd/gate-config-loader.js';
import { runMachineGate } from '../core/sdd/gate-validator.js';
import { readGateResult, writeMachineGate, writeHumanGate, patchArtifactStatus } from '../core/sdd/gate-repository.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate } from '../core/sdd/change-model.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'gate-repo-'));
  await runInit(
    {
      name: 'gate-test',
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
    { title: 'Gate 测试', requirement: 'REQ-GATE', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

// ---- ArtifactHash ----

test('ArtifactHash: sha256 相同内容返回相同 hash', () => {
  const h1 = sha256('hello');
  const h2 = sha256('hello');
  assert.equal(h1, h2);
  assert.ok(h1.startsWith('sha256:'));
});

test('ArtifactHash: sha256 不同内容返回不同 hash', () => {
  assert.notEqual(sha256('hello'), sha256('world'));
});

test('ArtifactHash: hashMatches 一致返回 true', () => {
  const h = sha256('test');
  assert.ok(hashMatches(h, h));
});

test('ArtifactHash: hashMatches gateHash 为空返回 false', () => {
  assert.equal(hashMatches(sha256('test'), ''), false);
});

test('ArtifactHash: hashMatches 不一致返回 false', () => {
  assert.equal(hashMatches(sha256('a'), sha256('b')), false);
});

// ---- GateConfigLoader ----

test('GateConfigLoader: loadGate 返回 sdd-prd 正确配置', async () => {
  const g = await loadGate('sdd-prd', harnessRoot);
  assert.equal(g.stage, 'prd');
  assert.equal(g.artifact, 'prd.md');
  assert.ok(g['machine-checks'].includes('no-placeholder'));
  assert.ok(g['required-replacements'].includes('scope-in'));
  assert.ok(g['non-empty-ai-sections'].includes('## 1. 背景'));
  assert.ok(g['human-checks'].length > 0);
});

test('GateConfigLoader: 7 个 Skill 都有 gate.yaml', async () => {
  const ids = ['sdd-explore', 'sdd-prd', 'sdd-design', 'sdd-task', 'sdd-dev', 'sdd-test', 'sdd-converge'];
  for (const id of ids) {
    const g = await loadGate(id, harnessRoot);
    assert.ok(g.stage, `${id} 应有 stage`);
    assert.ok(g.artifact, `${id} 应有 artifact`);
    assert.ok(Array.isArray(g['machine-checks']), `${id} 应有 machine-checks`);
  }
});

test('GateConfigLoader: 不存在的 Skill 抛错', async () => {
  await assert.rejects(() => loadGate('nonexistent-skill', harnessRoot), /Gate config not found/);
});

test('GateConfigLoader: listGates 返回 8 个', async () => {
  const list = await listGates(harnessRoot);
  assert.equal(list.length, 8);
});

// ---- GateRepository ----

test('GateRepository: readGateResult 未初始化返回 draft + pending', async () => {
  const { tmp, changeDir } = await setupChange();
  const r = await readGateResult(changeDir, 'prd.md');
  assert.equal(r.status, 'draft');
  assert.equal(r.gates.machine.status, 'pending');
  assert.equal(r.gates.human.status, 'pending');
  assert.equal(r.gates.machine['artifact-hash'], '');
  await rmrf(tmp);
});

test('GateRepository: writeMachineGate + readGateResult ReadBack 全字段一致', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'prd.md', {
    status: 'passed',
    issues: [],
    artifactHash: 'sha256:abc',
    validator: 'sdd-prd',
  });
  const r = await readGateResult(changeDir, 'prd.md');
  assert.equal(r.gates.machine.status, 'passed');
  assert.equal(r.gates.machine['artifact-hash'], 'sha256:abc');
  assert.equal(r.gates.machine.validator, 'sdd-prd');
  assert.ok(r.gates.machine['checked-at']);
  assert.deepEqual(r.gates.machine.issues, []);
  await rmrf(tmp);
});

test('GateRepository: writeMachineGate failed 时 issues 全字段一致', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'prd.md', {
    status: 'failed',
    issues: ['占位符未替换: {{scope-in}}', 'section 内容为空: ## 1. 背景'],
    artifactHash: 'sha256:def',
    validator: 'sdd-prd',
  });
  const r = await readGateResult(changeDir, 'prd.md');
  assert.equal(r.gates.machine.status, 'failed');
  assert.equal(r.gates.machine.issues.length, 2);
  assert.equal(r.gates.machine.issues[0], '占位符未替换: {{scope-in}}');
  await rmrf(tmp);
});

test('GateRepository: writeHumanGate + readGateResult ReadBack 全字段一致', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeHumanGate(changeDir, 'prd.md', {
    status: 'approved',
    reviewer: 'tester',
    reason: '',
    artifactHash: 'sha256:abc',
  });
  const r = await readGateResult(changeDir, 'prd.md');
  assert.equal(r.gates.human.status, 'approved');
  assert.equal(r.gates.human.reviewer, 'tester');
  assert.equal(r.gates.human['artifact-hash'], 'sha256:abc');
  assert.ok(r.gates.human['reviewed-at']);
  assert.equal(r.gates.human.reason, '');
  await rmrf(tmp);
});

test('GateRepository: patchArtifactStatus 更新 status', async () => {
  const { tmp, changeDir } = await setupChange();
  await patchArtifactStatus(changeDir, 'prd.md', 'accepted');
  const r = await readGateResult(changeDir, 'prd.md');
  assert.equal(r.status, 'accepted');
  await rmrf(tmp);
});

test('GateRepository: evidence/test-report.md 的 key 是 test-report', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'evidence/test-report.md', {
    status: 'passed',
    artifactHash: 'sha256:xyz',
    validator: 'sdd-test',
  });
  const meta = parse(await readFile(join(changeDir, 'metadata.yaml'), 'utf8'));
  assert.ok(meta.artifacts['test-report'], 'key 应为 test-report');
  assert.equal(meta.artifacts['test-report'].path, 'evidence/test-report.md');
  await rmrf(tmp);
});

// ---- GateValidator ----

test('GateValidator: Artifact 不存在返回 passed:false + 空 hash', async () => {
  const { tmp, changeDir } = await setupChange();
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.equal(r.artifactHash, '');
  assert.ok(r.issues.some((i) => i.includes('Artifact not found')));
  await rmrf(tmp);
});

test('GateValidator: 占位符未替换 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'prd.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值\n\n## 5. 验收标准\n标准\n\n{{scope-in}} {{scope-out}}',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('{{scope-in}}')));
  assert.ok(r.artifactHash.startsWith('sha256:'));
  await rmrf(tmp);
});

test('GateValidator: section 缺失 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'prd.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景\n\n## 2. 用户价值\n价值\n',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('## 5. 验收标准')));
  await rmrf(tmp);
});

test('GateValidator: 完整 prd.md（占位符全替换 + sections 非空）→ passed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'prd.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 3. 范围\n### 3.1 包含\nA\n### 3.2 不包含\nB\n\n## 4. 业务规则\n规则\n\n## 5. 验收标准\n标准内容\n',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, r.issues.join('; '));
  assert.ok(r.artifactHash.startsWith('sha256:'));
  await rmrf(tmp);
});

test('GateValidator: section 仅含注释 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'prd.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n<!-- AI 填写 -->\n\n## 2. 用户价值\n价值内容\n\n## 5. 验收标准\n标准内容\n',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('## 1. 背景') && i.includes('空')));
  await rmrf(tmp);
});
