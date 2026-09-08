// Unit tests: Phase 4.3 S2 新增机检
// story-domain-boundary / du-defined / du-dependency / du-source-of-truth + parseDuTable
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
  patchMetadata,
} from '../core/sdd/change-model.js';
import { runMachineGate, parseDuTable } from '../core/sdd/gate-validator.js';
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
  const tmp = await mkdtemp(join(tmpdir(), 'gate-s2-'));
  await runInit(
    {
      name: 'gate-s2-test',
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
    harnessRoot
  );
  return tmp;
}

async function setupChange(tmp) {
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: 'S2 测试', requirement: 'REQ-S2', repositories: ['backend', 'frontend'] },
    harnessRoot
  );
  return { changeId: id, changeDir };
}

const gateOf = (artifact, check) => ({ artifact, 'machine-checks': [check] });

// 设计 DU 划分表构造器
const designWithDu = (rows) => {
  const body = rows
    .map(
      (r) =>
        `| ${r.du} | ${r.repo} | ${r.role || '-'} | ${r.covers || ''} | ${r.deps || '—'} |`,
    )
    .join('\n');
  return `# Design

## 6. DU 划分（Delivery Units）

| DU        | 仓库     | 职责（实现哪些 DES） | covers AC      | depends on |
| --------- | -------- | -------------------- | -------------- | ---------- |
${body}
`;
};

// ==================== parseDuTable 单元测试 ====================

test('parseDuTable: 标准表解析 → 返回 DU 列表', () => {
  const md = designWithDu([
    { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
    { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-001' },
  ]);
  const table = parseDuTable(md);
  assert.equal(table.length, 2);
  assert.equal(table[0].du, 'DU-BE-001');
  assert.equal(table[0].repo, 'backend');
  assert.deepEqual(table[0].coversAc, ['AC-001']);
  assert.deepEqual(table[0].dependsOn, []);
  assert.equal(table[1].du, 'DU-FE-001');
  assert.deepEqual(table[1].dependsOn, ['DU-BE-001']);
});

test('parseDuTable: 无 DU 划分 section → null', () => {
  assert.equal(parseDuTable('# Design\n\n正文无表'), null);
});

test('parseDuTable: section 存在但无表格 → null', () => {
  const md = '## 6. DU 划分\n\n仅文字说明，无表格。';
  assert.equal(parseDuTable(md), null);
});

test('parseDuTable: 仅表头无数据行 → 空数组', () => {
  const md = `## DU 划分

| DU | 仓库 | covers AC | depends on |
| --- | --- | --- | --- |
`;
  const table = parseDuTable(md);
  assert.deepEqual(table, []);
});

test('parseDuTable: 无依赖标记 —/-/无/空 → dependsOn=[]', () => {
  for (const marker of ['—', '-', '无', '']) {
    const md = `## DU 划分

| DU | 仓库 | covers AC | depends on |
| --- | --- | --- | --- |
| DU-BE-001 | backend | AC-001 | ${marker} |
`;
    const table = parseDuTable(md);
    assert.deepEqual(table[0].dependsOn, [], `marker='${marker}' 应解析为无依赖`);
  }
});

test('parseDuTable: 多 AC 用空格/逗号分隔 → 全部提取', () => {
  const md = `## DU 划分

| DU | 仓库 | covers AC | depends on |
| --- | --- | --- | --- |
| DU-BE-001 | backend | AC-001 AC-002 | — |
| DU-FE-001 | frontend | AC-003, AC-004 | DU-BE-001 |
`;
  const table = parseDuTable(md);
  assert.deepEqual(table[0].coversAc, ['AC-001', 'AC-002']);
  assert.deepEqual(table[1].coversAc, ['AC-003', 'AC-004']);
});

test('parseDuTable: 列序交换 → 仍正确定位列', () => {
  const md = `## DU 划分

| depends on | covers AC | 仓库 | DU |
| --- | --- | --- | --- |
| DU-BE-001 | AC-002 | frontend | DU-FE-001 |
`;
  const table = parseDuTable(md);
  assert.equal(table[0].du, 'DU-FE-001');
  assert.equal(table[0].repo, 'frontend');
  assert.deepEqual(table[0].coversAc, ['AC-002']);
  assert.deepEqual(table[0].dependsOn, ['DU-BE-001']);
});

test('parseDuTable: section 被同级标题截断', () => {
  const md = `## 6. DU 划分

| DU | 仓库 | covers AC | depends on |
| --- | --- | --- | --- |
| DU-BE-001 | backend | AC-001 | — |

## 7. 风险评估

| 不应被解析的表 | col |
| --- | --- |
| foo | bar |
`;
  const table = parseDuTable(md);
  assert.equal(table.length, 1);
  assert.equal(table[0].du, 'DU-BE-001');
});

// ==================== story-domain-boundary ====================

test('Gate: story-domain-boundary 绑定后 stories[0].domain.id 存在 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'design.md', '# Design');
  const r = await runMachineGate(changeDir, gateOf('design.md', 'story-domain-boundary'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: story-domain-boundary domain.id 缺失 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  // 抹掉 domain.id
  await patchMetadata(changeDir, {
    stories: [{ id: 'STORY-001-01-01-01', inline: true, path: './', domain: {} }],
  });
  await seedStory(changeDir, 'design.md', '# Design');
  const r = await runMachineGate(changeDir, gateOf('design.md', 'story-domain-boundary'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('domain.id')), r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: story-domain-boundary 多 Story 同 domain → warning 不阻断', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await patchMetadata(changeDir, {
    stories: [
      { id: 'S-A', inline: false, domain: { id: 'DOM-1' } },
      { id: 'S-B', inline: false, domain: { id: 'DOM-1' } },
    ],
  });
  await seedStory(changeDir, 'change-design.md', '# Change Design');
  // change-design.md 是 Change 级产物（在 CHG 根，非 STORY 目录）
  await writeFile(join(changeDir, 'change-design.md'), '# Change Design', 'utf8');
  const r = await runMachineGate(
    changeDir,
    gateOf('change-design.md', 'story-domain-boundary'),
  );
  // warning 不阻断 → passed=true（但有 warning）
  assert.equal(r.passed, true);
  assert.ok(r.warnings.some((w) => w.includes('DOM-1') && w.includes('S-A') && w.includes('S-B')));
  await rmrf(tmp);
});

test('Gate: story-domain-boundary 无 stories → 跳过 passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  // v1 兼容：不绑定 feature-path，metadata 无 stories
  await writeFile(join(changeDir, 'design.md'), '# Design', 'utf8');
  const r = await runMachineGate(changeDir, gateOf('design.md', 'story-domain-boundary'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ==================== du-defined ====================

test('Gate: du-defined 缺少 DU 划分表 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'design.md', '# Design\n\n无 DU 表');
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-defined'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('DU 划分') && i.includes('表格')));
  await rmrf(tmp);
});

test('Gate: du-defined DU id 非法 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([{ du: 'BAD-ID', repo: 'backend', covers: 'AC-001', deps: '—' }]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-defined'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('DU id 非法')));
  await rmrf(tmp);
});

test('Gate: du-defined DU id 重复 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-002', deps: '—' },
    ]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-defined'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('DU id 重复')));
  await rmrf(tmp);
});

test('Gate: du-defined covers AC 为空 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([{ du: 'DU-BE-001', repo: 'backend', covers: '', deps: '—' }]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-defined'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('covers AC 列为空')));
  await rmrf(tmp);
});

test('Gate: du-defined 完整表 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-001' },
    ]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-defined'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: du-defined change-design.md → 跳过 passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  // change-design.md 在 CHG 根，无 DU 表也不报错
  await writeFile(join(changeDir, 'change-design.md'), '# Change Design', 'utf8');
  const r = await runMachineGate(changeDir, gateOf('change-design.md', 'du-defined'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ==================== du-dependency ====================

test('Gate: du-dependency depends on 不存在的 DU → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-999' },
    ]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-dependency'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('DU-BE-999')));
  await rmrf(tmp);
});

test('Gate: du-dependency 自环 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([{ du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: 'DU-BE-001' }]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-dependency'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('依赖自身')));
  await rmrf(tmp);
});

test('Gate: du-dependency 依赖环 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: 'DU-FE-001' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-001' },
    ]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-dependency'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('环')), r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: du-dependency 合法依赖链 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-001' },
    ]),
  );
  const r = await runMachineGate(changeDir, gateOf('design.md', 'du-dependency'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ==================== du-source-of-truth ====================

const tasksWithDu = (duIds) => {
  const sections = duIds.map((id) => `### ${id}\n\n任务条目`).join('\n\n');
  return `# Tasks\n\n${sections}\n`;
};

test('Gate: du-source-of-truth tasks 引用 design 未定义的 DU → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  // design 只有 DU-BE-001
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([{ du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' }]),
  );
  // tasks 引用了 DU-BE-001（合法）和 DU-FE-001（未在 design 定义）
  await seedStory(changeDir, 'tasks.md', tasksWithDu(['DU-BE-001', 'DU-FE-001']));
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-source-of-truth'));
  assert.equal(r.passed, false);
  assert.ok(
    r.issues.some((i) => i.includes('DU-FE-001') && i.includes('未在 design')),
    r.issues.join('; '),
  );
  await rmrf(tmp);
});

test('Gate: du-source-of-truth design 有但 tasks 无 → warning', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-001' },
    ]),
  );
  // tasks 只引用 DU-BE-001，缺 DU-FE-001
  await seedStory(changeDir, 'tasks.md', tasksWithDu(['DU-BE-001']));
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-source-of-truth'));
  // 缺 DU-FE-001 是 warning，不阻断
  assert.equal(r.passed, true);
  assert.ok(r.warnings.some((w) => w.includes('DU-FE-001') && w.includes('无对应小节')));
  await rmrf(tmp);
});

test('Gate: du-source-of-truth 完全一致 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([
      { du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' },
      { du: 'DU-FE-001', repo: 'frontend', covers: 'AC-002', deps: 'DU-BE-001' },
    ]),
  );
  await seedStory(changeDir, 'tasks.md', tasksWithDu(['DU-BE-001', 'DU-FE-001']));
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-source-of-truth'));
  assert.equal(r.passed, true, r.issues.join('; '));
  assert.equal(r.warnings.length, 0, r.warnings.join('; '));
  await rmrf(tmp);
});

test('Gate: du-source-of-truth tasks 无 DU 小节 → 跳过 passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  await seedStory(
    changeDir,
    'design.md',
    designWithDu([{ du: 'DU-BE-001', repo: 'backend', covers: 'AC-001', deps: '—' }]),
  );
  await seedStory(changeDir, 'tasks.md', '# Tasks\n\n无 DU 小节');
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-source-of-truth'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: du-source-of-truth design 源不存在 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  // 不写 design.md，只写 tasks.md
  await seedStory(changeDir, 'tasks.md', tasksWithDu(['DU-BE-001']));
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-source-of-truth'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('design 源') && i.includes('不存在')));
  await rmrf(tmp);
});
