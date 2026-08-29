// Unit tests: sdd-review Skill（Phase 2.2 同态检查点）
// 对齐 plans/phase-2.2-sdd-review-skill-design.md §7
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate } from '../core/sdd/change-model.js';
import { loadGate } from '../core/sdd/gate-config-loader.js';
import { runMachineGate } from '../core/sdd/gate-validator.js';
import { loadSkill } from '../core/sdd/skill-loader.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { setupDu } from './helpers/du-fixture.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'review-'));
  await runInit(
    {
      name: 'review-test',
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
    { title: 'Review 测试', requirement: 'REQ-REVIEW', repositories: ['main'] },
    harnessRoot
  );
  // review gate 含 du-fan-in-complete（Phase 2.4）：fixture 预置已完成 DU
  await setupDu(tmp, id, changeDir, { status: 'completed' });
  return { tmp, changeId: id, changeDir };
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
    '发现已全部闭环（1 major 已修复）。',
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
    '见 evidence.yaml review-finding 条目。',
    '',
    '## 3. 完成确认',
    '',
    '- [x] 四项检查全部执行',
  ].join('\n');
}

// 直接编辑 evidence.yaml（Phase 2.1 定稿模式：Agent 直接编辑条目）
async function writeEvidence(changeDir, changeId, items) {
  const lines = [
    'version: 0.1',
    `change-id: ${changeId}`,
    'items:',
  ];
  for (const item of items) {
    lines.push(`  - id: ${item.id}`);
    lines.push(`    type: ${item.type}`);
    if (item.type === 'review-finding') {
      lines.push(`    target: ${item.target}`);
      lines.push(`    severity: ${item.severity}`);
      lines.push(`    finding: ${item.finding}`);
      lines.push(`    resolution: ${item.resolution === undefined ? '""' : `"${item.resolution}"`}`);
    }
    lines.push(`    recorded-at: "${item['recorded-at']}"`);
  }
  await writeFile(join(changeDir, 'evidence', 'evidence.yaml'), lines.join('\n') + '\n', 'utf8');
}

const finding = (over = {}) => ({
  id: 'EV-001',
  type: 'review-finding',
  target: 'prd.md#AC-1',
  severity: 'major',
  finding: 'AC-1 缺少测试覆盖',
  'recorded-at': '2026-08-28T12:00:00.000Z',
  ...over,
});

// ---- Skill 加载与 gate 配置 ----

test('SkillLoader: 加载 sdd-review 返回同态检查点元数据', async () => {
  const loaded = await loadSkill('sdd-review', harnessRoot);
  assert.equal(loaded.id, 'sdd-review');
  assert.equal(loaded.yaml.stage, 'review');
  assert.equal(loaded.yaml['requires-state'], 'testing');
  assert.equal(loaded.yaml['produces-state'], 'testing', '同态检查点：produces-state === requires-state');
  assert.deepEqual(loaded.yaml['output-artifacts'], ['review-report.md']);
  assert.ok(loaded.skillMd.length > 0);
});

test('GateConfig: sdd-review gate 声明 findings-closure 开关', async () => {
  const gate = await loadGate('sdd-review', harnessRoot);
  assert.equal(gate.artifact, 'review-report.md');
  assert.equal(gate.stage, 'review');
  assert.ok(gate['machine-checks'].includes('evidence-coverage'));
  assert.equal(gate['evidence-coverage']['findings-closure'], true);
  assert.equal(gate['evidence-coverage']['repos-coverage'], false);
  assert.equal(gate['evidence-coverage']['test-coverage'], false);
});

// ---- findings-closure 机检 ----

test('GateValidator: blocker 无 resolution → machine gate failed', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'review-report.md'), fullReviewReport(changeId), 'utf8');
  await writeEvidence(changeDir, changeId, [finding({ severity: 'blocker', resolution: '' })]);
  const gateConfig = await loadGate('sdd-review', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('findings-closure') && i.includes('EV-001')), r.issues.join('; '));
  await rmrf(tmp);
});

test('GateValidator: blocker 补 resolution 后 → machine gate passed', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'review-report.md'), fullReviewReport(changeId), 'utf8');
  await writeEvidence(changeDir, changeId, [
    finding({ severity: 'blocker', resolution: '已补 AC-1 测试，见 EV-002' }),
  ]);
  const gateConfig = await loadGate('sdd-review', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('GateValidator: minor 开放（无 resolution）→ machine gate passed', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'review-report.md'), fullReviewReport(changeId), 'utf8');
  await writeEvidence(changeDir, changeId, [finding({ severity: 'minor' })]);
  const gateConfig = await loadGate('sdd-review', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('GateValidator: major 无 resolution → machine gate failed（与 blocker 同规则）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'review-report.md'), fullReviewReport(changeId), 'utf8');
  await writeEvidence(changeDir, changeId, [finding({ severity: 'major' })]);
  const gateConfig = await loadGate('sdd-review', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('findings-closure')), r.issues.join('; '));
  await rmrf(tmp);
});

// ---- evidence.yaml schema 兼容（resolution 可选字段） ----

test('EvidenceModel: review-finding 含 resolution 通过 validateEvidence（schema 向后兼容）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeEvidence(changeDir, changeId, [
    finding({ resolution: '已修复，见 EV-002' }),
    finding({ id: 'EV-002', type: 'review-finding', target: 'design.md#接口', severity: 'minor', finding: '命名偏差' }),
  ]);
  const raw = await readFile(join(changeDir, 'evidence', 'evidence.yaml'), 'utf8');
  assert.ok(raw.includes('resolution'), 'resolution 字段应写入');
  // 经 machine gate 的 schema 校验路径验证（checkEvidenceCoverage 内部跑 validateEvidence）
  await writeFile(join(changeDir, 'review-report.md'), fullReviewReport(changeId), 'utf8');
  const gateConfig = await loadGate('sdd-review', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});
