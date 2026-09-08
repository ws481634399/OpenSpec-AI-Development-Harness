// Unit tests: Phase 4.3 S3/S4 机检
// test-design-exists / parseTcTable / tc-coverage / ac-coverage / evidence-trace / red-green-record
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import {
  runChangeCreate,
  readMetadata,
  bindFeaturePath,
} from '../core/sdd/change-model.js';
import { runMachineGate, parseTcTable } from '../core/sdd/gate-validator.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

const FP = {
  'level-1': { id: 'FEAT-001', name: '用户中心' },
  'level-2': { id: 'FEAT-001-01', name: '账户能力' },
  'level-3': { id: 'FEAT-001-01-01', name: '用户认证' },
  story: { id: 'STORY-001-01-01-01', name: '用户注册' },
  candidate: false,
};
const STORY = ['用户中心', '账户能力', '用户认证', '用户注册'];
const seedStory = async (changeDir, rel, content) => {
  const dir = join(changeDir, ...STORY, rel, '..');
  await mkdir(dir, { recursive: true });
  await writeFile(join(changeDir, ...STORY, rel), content, 'utf8');
};

async function setupWorkspace() {
  const tmp = await mkdtemp(join(tmpdir(), 'gate-s34-'));
  await runInit(
    {
      name: 'gate-s34-test',
      type: 'greenfield',
      mode: 'multi',
      repos: [
        { id: 'backend', path: 'implementation/backend' },
        { id: 'frontend', path: 'implementation/frontend' },
      ],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot,
  );
  return tmp;
}
async function setupChange(tmp) {
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: 'S3S4 测试', requirement: 'REQ-S34', repositories: ['backend', 'frontend'] },
    harnessRoot,
  );
  return { changeId: id, changeDir };
}
const gateOf = (artifact, check) => ({ artifact, 'machine-checks': [check] });

// Spec with AC table
const specWithAc = (acs) =>
  `# Spec\n\n## 5. 验收标准\n\n| AC | 验收标准 | 备注 |\n| --- | --- | --- |\n${acs.map((a) => `| ${a} | 标准 | |`).join('\n')}\n`;

// Design with DU table
const designWithDu = (rows) =>
  `# Design\n\n## 6. DU 划分\n\n| DU | 仓库 | covers AC | depends on |\n| --- | --- | --- | --- |\n${rows.map((r) => `| ${r.du} | ${r.repo} | ${r.covers} | ${r.deps || '—'} |`).join('\n')}\n`;

// test-design with TC table
const tdWithTc = (rows) =>
  `# Test Design\n\n## 1. 测试用例\n\n| TC | 验证方式 | verified-by AC | 归属 DU | 备注 |\n| --- | --- | --- | --- | --- |\n${rows.map((r) => `| ${r.tc} | ${r.method} | ${r.ac} | ${r.du} | ${r.note || ''} |`).join('\n')}\n`;

// ==================== parseTcTable ====================

test('parseTcTable: 标准 TC 表解析', () => {
  const md = tdWithTc([
    { tc: 'TC-001', method: 'API', ac: 'AC-001', du: 'DU-BE-001' },
    { tc: 'TC-002', method: 'E2E', ac: 'AC-002', du: 'DU-FE-001' },
  ]);
  const t = parseTcTable(md);
  assert.equal(t.length, 2);
  assert.equal(t[0].tc, 'TC-001');
  assert.deepEqual(t[0].verifiedByAc, ['AC-001']);
  assert.deepEqual(t[0].du, ['DU-BE-001']);
  assert.equal(t[0].notTestable, false);
});

test('parseTcTable: 无测试用例 section → null', () => {
  assert.equal(parseTcTable('# Test Design\n\n无表'), null);
});

test('parseTcTable: TC-NOT-TESTABLE 标注 → notTestable=true', () => {
  const md = `## 测试用例\n\n| TC | 验证方式 | verified-by AC | 归属 DU | 备注 |\n| --- | --- | --- | --- | --- |\n| TC-001 | manual | AC-003 | DU-BE-001 | TC-NOT-TESTABLE: 需人工验证 |\n`;
  const t = parseTcTable(md);
  assert.equal(t[0].notTestable, true);
});

test('parseTcTable: 多 AC 用逗号分隔', () => {
  const md = `## 测试用例\n\n| TC | 验证方式 | verified-by AC | 归属 DU | 备注 |\n| --- | --- | --- | --- | --- |\n| TC-001 | API | AC-001, AC-002 | DU-BE-001 | |\n`;
  const t = parseTcTable(md);
  assert.deepEqual(t[0].verifiedByAc, ['AC-001', 'AC-002']);
});

// ==================== test-design-exists ====================

test('Gate: test-design-exists 缺少 test-design.md → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'test-design-exists'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('test-design.md')), r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: test-design-exists 存在 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  await seedStory(changeDir, 'test-design.md', '# Test Design');
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'test-design-exists'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: test-design-exists 非 tasks.md artifact → 跳过 passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'design.md', '# Design');
  const r = await runMachineGate(changeDir, gateOf('design.md', 'test-design-exists'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ==================== tc-coverage ====================

test('Gate: tc-coverage 全 AC 被 TC 覆盖 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'spec.md', specWithAc(['AC-001', 'AC-002']));
  await seedStory(changeDir, 'test-design.md', tdWithTc([
    { tc: 'TC-001', method: 'API', ac: 'AC-001', du: 'DU-BE-001' },
    { tc: 'TC-002', method: 'E2E', ac: 'AC-002', du: 'DU-FE-001' },
  ]));
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'tc-coverage'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: tc-coverage AC 未被 TC 覆盖 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'spec.md', specWithAc(['AC-001', 'AC-002', 'AC-003']));
  await seedStory(changeDir, 'test-design.md', tdWithTc([
    { tc: 'TC-001', method: 'API', ac: 'AC-001', du: 'DU-BE-001' },
    // AC-002 和 AC-003 未覆盖
  ]));
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'tc-coverage'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('AC-002') && i.includes('tc-coverage')));
  assert.ok(r.issues.some((i) => i.includes('AC-003') && i.includes('tc-coverage')));
  await rmrf(tmp);
});

test('Gate: tc-coverage TC-NOT-TESTABLE → warning 不阻断', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'spec.md', specWithAc(['AC-001']));
  await seedStory(
    changeDir,
    'test-design.md',
    `## 1. 测试用例\n\n| TC | 验证方式 | verified-by AC | 归属 DU | 备注 |\n| --- | --- | --- | --- | --- |\n| TC-001 | manual | AC-001 | DU-BE-001 | TC-NOT-TESTABLE: 需人工验证 |\n`,
  );
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'tc-coverage'));
  // NOT-TESTABLE 算覆盖（进 coveredAcs），但进 warnings
  assert.equal(r.passed, true);
  assert.ok(r.warnings.some((w) => w.includes('AC-001') && w.includes('TC-NOT-TESTABLE')));
  await rmrf(tmp);
});

// ==================== ac-coverage ====================

test('Gate: ac-coverage DU covers AC 存在于 spec → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'spec.md', specWithAc(['AC-001', 'AC-002']));
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002' },
    ]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'ac-coverage'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: ac-coverage DU covers AC 不在 spec → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'spec.md', specWithAc(['AC-001']));
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([{ du: 'DU-BE-001', repo: 'backend', covers: 'AC-999' }]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'ac-coverage'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('AC-999') && i.includes('ac-coverage')));
  await rmrf(tmp);
});

test('Gate: ac-coverage change-design.md → 跳过 passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await writeFile(join(changeDir, 'change-design.md'), '# Change Design', 'utf8');
  const r = await runMachineGate(changeDir, gateOf('change-design.md', 'ac-coverage'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ==================== evidence-trace ====================

test('Gate: evidence-trace test-report 引用合法 TC → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'test-design.md', tdWithTc([
    { tc: 'TC-001', method: 'API', ac: 'AC-001', du: 'DU-BE-001' },
  ]));
  // test-report 引用 TC-001（合法）
  await seedStory(changeDir, 'evidence/test-report.md', '# Test Report\n\nTC-001: passed\n');
  const r = await runMachineGate(changeDir, gateOf('evidence/test-report.md', 'evidence-trace'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: evidence-trace test-report 引用未定义 TC → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'test-design.md', tdWithTc([
    { tc: 'TC-001', method: 'API', ac: 'AC-001', du: 'DU-BE-001' },
  ]));
  // test-report 引用 TC-999（不存在于 test-design）
  await seedStory(changeDir, 'evidence/test-report.md', '# Test Report\n\nTC-999: passed\n');
  const r = await runMachineGate(changeDir, gateOf('evidence/test-report.md', 'evidence-trace'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('TC-999') && i.includes('evidence-trace')));
  await rmrf(tmp);
});

test('Gate: evidence-trace 无 test-design.md → 跳过 passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'evidence/test-report.md', '# Test Report\n\nTC-001: passed\n');
  const r = await runMachineGate(changeDir, gateOf('evidence/test-report.md', 'evidence-trace'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ==================== red-green-record ====================

test('Gate: red-green-record 有红绿灯记录 → 无 warning', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'implementation.md',
    '# Implementation\n\n| TC | 红灯失败摘要 | 绿灯通过确认 |\n| TC-001 | TypeError | ✅ 全绿 |\n',
  );
  const r = await runMachineGate(changeDir, gateOf('implementation.md', 'red-green-record'));
  assert.equal(r.warnings.length, 0, r.warnings.join('; '));
  await rmrf(tmp);
});

test('Gate: red-green-record 无红绿灯记录 → warning（advisory）', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'implementation.md', '# Implementation\n\n无测试记录');
  const r = await runMachineGate(changeDir, gateOf('implementation.md', 'red-green-record'));
  assert.ok(r.warnings.some((w) => w.includes('red-green-record')));
  // advisory → passed=true（warning 不阻断）
  assert.equal(r.passed, true);
  await rmrf(tmp);
});
