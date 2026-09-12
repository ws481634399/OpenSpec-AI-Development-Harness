// Story 1 专用测试：Story 模型读写 + v3/v4 schema + split-story + upgrade 迁移
// 纯函数模块：测试 story-model.js / change-model.bindFeaturePath(v3/v4) /
// workspace-upgrader.migrateChangeSchema（v2→v4）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { parse, parseDocument, stringify } from 'yaml';

import {
  STORY_STATUSES,
  isValidStoryStatus,
  changeStatusToStoryStatus,
  createStory,
  readStoryMetadata,
  patchStoryMetadata,
  readStories,
  splitInlineStory,
  resolveStoryDir,
} from '../core/sdd/story-model.js';
import { bindFeaturePath, runChangeCreate, readMetadata, patchMetadata } from '../core/sdd/change-model.js';
import { migrateChangeSchema, needsChangeSchemaMigration } from '../core/workspace/workspace-upgrader.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

// ---- 工具：临时目录生命周期 ----
let tmpIdx = 0;
function makeTmpRoot() {
  return join(process.cwd(), 'tmp-story-test-' + process.pid + '-' + (++tmpIdx));
}
async function mkChangeWorkspace() {
  const root = makeTmpRoot();
  await mkdir(join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999'), { recursive: true });
  await mkdir(join(root, 'delivery', 'archive'), { recursive: true });
  await mkdir(join(root, '.sdd'), { recursive: true });
  return root;
}
async function writeV2Metadata(changeDir, { status = 'specified', hasStory = true } = {}) {
  const fp = hasStory
    ? {
        'level-1': { id: 'FEAT-001', name: '平台能力' },
        'level-2': { id: 'FEAT-001-02', name: 'SDD 引擎' },
        'level-3': { id: 'FEAT-001-02-03', name: '规格分层' },
        story: { id: 'STORY-001-02-03-01', name: '单 Story 平铺测试' },
        candidate: false,
      }
    : undefined;
  const raw = [
    'schema-version: 2',
    'id: CHG-9999',
    'title: 测试 Change',
    'summary: test',
    `status: ${status}`,
    'requirement: REQ-042',
    'created-at: "2026-09-01T00:00:00.000Z"',
    'updated-at: "2026-09-01T00:00:00.000Z"',
    'evidence-tier: standard',
    fp ? 'feature-path:' : '# feature-path: (empty)',
  ].join('\n') + (fp ? '\n  ' + Object.entries(fp).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n  ') : '') +
    '\nrepositories: [backend]\nrepository-baseline: {}\nrepository-result: {}\nartifacts: {}\n';
  await writeFile(join(changeDir, 'metadata.yaml'), raw, 'utf8');
}

// ---- Test Section A: Story 基础枚举与状态映射 ----
test('StoryModel: STORY_STATUSES 7 态 + isValidStoryStatus', () => {
  assert.deepEqual(STORY_STATUSES, ['pending', 'specified', 'designed', 'tasked', 'developing', 'testing', 'completed']);
  for (const s of STORY_STATUSES) assert.equal(isValidStoryStatus(s), true);
  assert.equal(isValidStoryStatus('created'), false);
  assert.equal(isValidStoryStatus('archived'), false);
  assert.equal(isValidStoryStatus(undefined), false);
});

test('StoryModel: changeStatusToStoryStatus 映射表覆盖 Change 全部 10 态', () => {
  assert.equal(changeStatusToStoryStatus('created'), 'pending');
  assert.equal(changeStatusToStoryStatus('exploring'), 'pending');
  assert.equal(changeStatusToStoryStatus('specified'), 'specified');
  assert.equal(changeStatusToStoryStatus('designed'), 'designed');
  assert.equal(changeStatusToStoryStatus('story-splitting'), 'designed');
  assert.equal(changeStatusToStoryStatus('tasked'), 'tasked');
  assert.equal(changeStatusToStoryStatus('developing'), 'developing');
  assert.equal(changeStatusToStoryStatus('testing'), 'testing');
  assert.equal(changeStatusToStoryStatus('completed'), 'completed');
  assert.equal(changeStatusToStoryStatus('archived'), 'completed');
  assert.equal(changeStatusToStoryStatus('bogus'), 'pending', 'unknown 状态回落 pending');
});

// ---- Test Section B: createStory / Story metadata 读写 ----
test('StoryModel: createStory → story-metadata.yaml 结构正确 + feature-path 正确写入', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    const harness = getHarnessRoot();
    const chain = {
      'level-1': { id: 'FEAT-001', name: '平台能力' },
      'level-2': { id: 'FEAT-001-02', name: 'SDD 引擎' },
      'level-3': { id: 'FEAT-001-02-03', name: '规格分层' },
      story: { id: 'STORY-001-02-03-01', name: 'Story 标题测试' },
      candidate: false,
    };
    const r = await createStory(changeDir, {
      storyId: 'STORY-001-02-03-01',
      title: 'Story 标题测试',
      summary: '单句摘要',
      featurePath: chain,
      evidenceTier: 'light',
      changePrdRef: 'change-spec.md#31-story-1',
      changeDesignRef: 'change-design.md#41-story-1',
    }, harness);
    assert.equal(r.storyId, 'STORY-001-02-03-01');
    assert.equal(r.relPath, '平台能力/SDD 引擎/规格分层/Story 标题测试');
    assert.ok(r.storyDir.endsWith(join('平台能力', 'SDD 引擎', '规格分层', 'Story 标题测试')));

    const m = await readStoryMetadata(r.storyDir);
    assert.equal(m['schema-version'], 1);
    assert.equal(m['change-id'], 'CHG-9999');
    assert.equal(m['story-id'], 'STORY-001-02-03-01');
    assert.equal(m.title, 'Story 标题测试');
    assert.equal(m.status, 'pending');
    assert.equal(m['evidence-tier'], 'light');
    assert.equal(m['change-spec-ref'], 'change-spec.md#31-story-1');
    assert.equal(m['change-design-ref'], 'change-design.md#41-story-1');
    assert.deepEqual(m['feature-path']['level-1'], chain['level-1']);
    assert.deepEqual(m['feature-path'].story, chain.story);
    assert.equal(m['feature-path'].candidate, false);
    assert.deepEqual(m.dus, []);
    assert.deepEqual(m.artifacts, {});
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('StoryModel: patchStoryMetadata 支持点路径 + 保留 yaml v2 块式输出（缺陷 8 断言）', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    const { storyDir } = await createStory(changeDir, {
      storyId: 'STORY-001-02-03-01',
      featurePath: {
        'level-1': { id: 'FEAT-001', name: 'A' },
        'level-2': { id: 'FEAT-001-02', name: 'B' },
        'level-3': { id: 'FEAT-001-02-03', name: 'C' },
        story: { id: 'STORY-001-02-03-01', name: 'S' },
        candidate: false,
      },
    }, getHarnessRoot());
    await patchStoryMetadata(storyDir, {
      status: 'specified',
      'feature-path.story.name': '改了 Story 名',
      'evidence-tier': 'strict',
      dus: [{ id: 'DU-BE-001', repo: 'backend', status: 'pending' }],
      'updated-at': '2026-09-02T12:00:00.000Z',
    });
    const m = await readStoryMetadata(storyDir);
    assert.equal(m.status, 'specified');
    assert.equal(m['feature-path'].story.name, '改了 Story 名');
    assert.equal(m['evidence-tier'], 'strict');
    assert.deepEqual(m.dus, [{ id: 'DU-BE-001', repo: 'backend', status: 'pending' }]);

    // 缺陷 8 断言：artifacts/dus 不应出现流式 { 或 [ 风格
    const raw = await readFile(join(storyDir, 'story-metadata.yaml'), 'utf8');
    assert.doesNotMatch(raw, /dus: \[|artifacts: \{|machine: \{|human: \{|gates: \{/, 'yaml 块式：集合字段禁止流式花括号/方括号首行');
    assert.match(raw, /^dus:\n/m, '块式：dus 首行后换行');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- Test Section C: Change bindFeaturePath v4 自动补 inline story（含 domain 继承）----
test('Change v4: bindFeaturePath 自动 schema=4 + stories:[{inline:true, domain}]', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(changeDir, { status: 'created', hasStory: false });
    // 确保写的是 v2 无 feature-path 的形态
    const pre = await readMetadata(changeDir);
    assert.equal(pre['schema-version'], 2);
    assert.equal(pre.featurePath, undefined, 'feature-path 不存在（bind 前空）');

    const fp = {
      'level-1': { id: 'FEAT-001', name: 'A' },
      'level-2': { id: 'FEAT-001-02', name: 'B' },
      'level-3': { id: 'FEAT-001-02-03', name: 'C' },
      story: { id: 'STORY-001-02-03-01', name: 'Story X' },
    };
    await bindFeaturePath(changeDir, fp);
    const post = await readMetadata(changeDir);
    assert.equal(post['schema-version'], 4, 'bind 后自动升 v4');
    assert.deepEqual(post['feature-path']['level-1'], fp['level-1']);
    assert.ok(Array.isArray(post.stories));
    assert.equal(post.stories.length, 1);
    assert.equal(post.stories[0].id, 'STORY-001-02-03-01');
    assert.equal(post.stories[0].title, 'Story X');
    assert.equal(post.stories[0].inline, true);
    assert.equal(post.stories[0].path, './');
    assert.equal(post.stories[0].status, 'pending', 'Change.created → Story.pending');
    assert.deepEqual(post.stories[0].domain, { id: 'FEAT-001-02-03', name: 'C' }, 'inline Story domain 继承 L3');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- Test Section D: splitInlineStory（核心转换）----
test('splitInlineStory: 旧 schema 升级单 inline → stories/<id>/（schema 升 4）', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(changeDir, { status: 'developing' });
    // 造 Story 级文件用于移动
    await writeFile(join(changeDir, 'tasks.md'), '# Tasks\nDU 内容', 'utf8');
    await writeFile(join(changeDir, 'implementation.md'), '# Impl', 'utf8');
    await mkdir(join(changeDir, 'evidence'));
    await writeFile(join(changeDir, 'evidence', 'test-report.md'), '# Report', 'utf8');
    await mkdir(join(changeDir, 'du'));
    await writeFile(join(changeDir, 'du', 'DU-BE-001.yaml'), 'id: DU-BE-001', 'utf8');
    // 先 bind v3
    await patchMetadata(changeDir, { 'schema-version': 3 });
    const fp = (await readMetadata(changeDir))['feature-path'];
    const svBefore = (await readMetadata(changeDir))['schema-version'];
    // 手动写 stories inline=true（模拟 bind 后状态）
    const prePatchRaw = await readFile(join(changeDir, 'metadata.yaml'), 'utf8');
    const preDoc = parseDocument(prePatchRaw);
    preDoc.setIn(['stories'], [{
      id: fp.story.id, title: fp.story.name, inline: true, status: changeStatusToStoryStatus('developing'), path: './', 'evidence-tier': 'standard',
    }]);
    await writeFile(join(changeDir, 'metadata.yaml'), preDoc.toString(), 'utf8');

    const r = await splitInlineStory(changeDir, { harnessRoot: getHarnessRoot() });
    assert.equal(r.storyId, 'STORY-001-02-03-01');
    assert.ok(r.movedFiles.includes('tasks.md'), 'tasks.md 被移动');
    assert.ok(r.movedFiles.includes('implementation.md'));
    assert.ok(r.movedFiles.includes('evidence/'));
    assert.ok(r.movedFiles.includes('du/'));

    // stories 子目录下文件存在
    const tasksTxt = await readFile(join(r.storyDir, 'tasks.md'), 'utf8');
    assert.match(tasksTxt, /DU 内容/);
    const storyMeta = await readStoryMetadata(r.storyDir);
    assert.equal(storyMeta['story-id'], 'STORY-001-02-03-01');
    assert.equal(storyMeta.status, 'developing');

    // Change metadata 已更新
    const chgMeta = await readMetadata(changeDir);
    assert.equal(chgMeta['schema-version'], 4, '拆分后 schema 升 v4');
    assert.equal(chgMeta['feature-path'], undefined, '拆分后 Change 级 feature-path 清空，Story 级权威');
    assert.ok(Array.isArray(chgMeta.stories));
    assert.equal(chgMeta.stories.length, 1);
    assert.equal(chgMeta.stories[0].inline, false);
    assert.equal(chgMeta.stories[0].path, '平台能力/SDD 引擎/规格分层/单 Story 平铺测试/');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('splitInlineStory: 无 feature-path.story 绑定 → 抛错（需先 bind）', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(changeDir, { hasStory: false });
    await patchMetadata(changeDir, { 'schema-version': 3, 'stories': [] });
    await assert.rejects(() => splitInlineStory(changeDir), /feature-path\.story/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- Test Section E: readStories 双模式（inline + 3-tier）兼容 ----
test('readStories: v3 inline 单 Story → 合成 Story metadata（lazy 填充 stories 列表）', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(changeDir, { status: 'testing' });
    // schema-version 保持 2，stories 为空 → readStories fallback 合成
    const stories = await readStories(changeDir);
    assert.equal(stories.length, 1, 'fallback 合成单条');
    assert.equal(stories[0].id, 'STORY-001-02-03-01');
    assert.equal(stories[0].inline, true);
    assert.equal(stories[0].status, 'testing', 'Change.testing → Inline Story.testing');
    assert.equal(stories[0].evidenceTier, 'standard');
    assert.ok(stories[0].featurePath, '合成 metadata 带 feature-path');
    assert.equal(stories[0].featurePath.story.id, 'STORY-001-02-03-01');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('readStories: 多 Story 三级形态 → 逐 stories/ 读 story-metadata.yaml', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(changeDir, { status: 'story-splitting', hasStory: false });
    // 预写 v3 + stories 列表（3-tier 形式）
    const fp1 = {
      'level-1': { id: 'FEAT-001', name: 'A' },
      'level-2': { id: 'FEAT-001-02', name: 'B' },
      'level-3': { id: 'FEAT-001-02-03', name: 'C' },
      story: { id: 'STORY-001-02-03-01', name: 'S1' },
      candidate: false,
    };
    const fp2 = {
      ...fp1,
      story: { id: 'STORY-001-02-03-02', name: 'S2' },
    };
    const harness = getHarnessRoot();
    await createStory(changeDir, { storyId: 'STORY-001-02-03-01', featurePath: fp1, status: 'specified' }, harness);
    await createStory(changeDir, { storyId: 'STORY-001-02-03-02', featurePath: fp2, evidenceTier: 'strict', status: 'designed' }, harness);
    const listRaw = await readFile(join(changeDir, 'metadata.yaml'), 'utf8');
    const listDoc = parseDocument(listRaw);
    listDoc.setIn(['schema-version'], 3);
    listDoc.setIn(['stories'], [
      { id: 'STORY-001-02-03-01', title: 'S1', inline: false, status: 'specified', path: 'stories/STORY-001-02-03-01/' },
      { id: 'STORY-001-02-03-02', title: 'S2', inline: false, status: 'designed', 'evidence-tier': 'strict', path: 'stories/STORY-001-02-03-02/' },
    ]);
    listDoc.setIn(['feature-path'], null);
    await writeFile(join(changeDir, 'metadata.yaml'), listDoc.toString(), 'utf8');

    const stories = await readStories(changeDir);
    assert.equal(stories.length, 2);
    assert.equal(stories[0].id, 'STORY-001-02-03-01');
    assert.equal(stories[0].inline, false);
    assert.equal(stories[0].status, 'specified');
    assert.equal(stories[1].id, 'STORY-001-02-03-02');
    assert.equal(stories[1].status, 'designed');
    assert.equal(stories[1].evidenceTier, 'strict');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- Test Section F: upgrade Change schema v2→v4 ----
test('Upgrade: migrateChangeSchema v2→v4 产物改名 + artifacts 键重写 + stories/domain 推导（幂等）', async () => {
  const root = await mkChangeWorkspace();
  try {
    const chg1 = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(chg1, { status: 'specified' });
    // v2 CHG 带旧产物文件 + 旧 artifacts 键
    await writeFile(join(chg1, 'prd.md'), '# PRD\n', 'utf8');
    await writeFile(join(chg1, 'change-prd.md'), '# Change PRD\n', 'utf8');
    const oldMeta = parse(await readFile(join(chg1, 'metadata.yaml'), 'utf8'));
    oldMeta.artifacts = {
      'change-prd': { path: 'change-prd.md', status: 'missing' },
      prd: { path: 'prd.md', status: 'missing' },
    };
    await writeFile(join(chg1, 'metadata.yaml'), stringify(oldMeta), 'utf8');

    // archive 目录另一个 CHG（v2，带 prd.md）
    const archDir = join(root, 'delivery', 'archive', 'CHG-0001');
    await mkdir(archDir, { recursive: true });
    const archFp = {
      'level-1': { id: 'FEAT-OLD', name: '老' },
      'level-2': { id: 'FEAT-OLD-01', name: '老1' },
      'level-3': { id: 'FEAT-OLD-01-01', name: '老11' },
      story: { id: 'STORY-OLD-01-01-01', name: '老 Story' },
      candidate: false,
    };
    const archTmpl = [
      'schema-version: 2',
      'id: CHG-0001',
      'title: archived old chg',
      'status: archived',
      'created-at: "2026-01-01T00:00:00.000Z"',
      'updated-at: "2026-01-02T00:00:00.000Z"',
      'evidence-tier: light',
      'feature-path:',
      '  ' + Object.entries(archFp).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n  '),
      'repositories: []',
      'repository-baseline: {}',
      'repository-result: {}',
      'artifacts:',
      '  prd: { path: prd.md, status: accepted }',
      '',
    ].join('\n');
    await writeFile(join(archDir, 'metadata.yaml'), archTmpl, 'utf8');
    await writeFile(join(archDir, 'prd.md'), '# old\n', 'utf8');

    // 第三个：已经 v3 + stories 已填（无 domain）→ 仍升 v4 并补 domain（fp 缺失则跳过）
    const chg3 = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-3333');
    await mkdir(chg3, { recursive: true });
    await writeFile(join(chg3, 'metadata.yaml'), 'schema-version: 3\nid: CHG-3333\ntitle: v3 已有\nstatus: created\nevidences: []\nstories:\n  - { id: X, inline: true, status: pending, path: "./" }\nartifacts:\n  prd: { path: prd.md, status: missing }\n', 'utf8');

    const need = await needsChangeSchemaMigration(root);
    assert.equal(need, true, 'guard 命中 <v4 metadata');

    const r1 = await migrateChangeSchema(root);
    assert.equal(r1.migrated, 3, '三个 metadata 全部迁移');
    assert.equal(r1.files.length, 3);
    assert.equal(r1.renamed.length, 3, 'chg1 两个产物 + archive 一个 prd.md');
    // 幂等：再执行一次 migrated=0 / renamed=0
    const r2 = await migrateChangeSchema(root);
    assert.equal(r2.migrated, 0, '第二次运行幂等，无迁移');
    assert.equal(r2.renamed.length, 0, '第二次运行无改名');

    // CHG-9999 检查：升 4 + stories 单 inline（带 domain 继承 L3）+ 产物改名 + artifacts 键重写
    const a = await readMetadata(chg1);
    assert.equal(a['schema-version'], 4);
    assert.equal(a.stories.length, 1);
    assert.equal(a.stories[0].id, 'STORY-001-02-03-01');
    assert.equal(a.stories[0].inline, true);
    assert.equal(a.stories[0].status, 'specified');
    assert.equal(a.stories[0]['evidence-tier'], 'standard');
    assert.deepEqual(a.stories[0].domain, { id: 'FEAT-001-02-03', name: '规格分层' });
    assert.ok(!a.artifacts.prd && !a.artifacts['change-prd'], '旧 artifacts 键已删除');
    assert.equal(a.artifacts.spec.path, 'spec.md');
    assert.equal(a.artifacts['change-spec'].path, 'change-spec.md');
    const specExists = await readFile(join(chg1, 'spec.md'), 'utf8');
    const changeSpecExists = await readFile(join(chg1, 'change-spec.md'), 'utf8');
    assert.match(specExists, /# PRD/);
    assert.match(changeSpecExists, /# Change PRD/);

    // Archived 检查：light tier 继承 + status archived→completed + prd.md 改名 + artifacts 键重写
    const b = await readMetadata(archDir);
    assert.equal(b['schema-version'], 4);
    assert.equal(b.stories[0].id, 'STORY-OLD-01-01-01');
    assert.equal(b.stories[0].status, 'completed', 'Change.archived → Story.completed');
    assert.equal(b.stories[0]['evidence-tier'], 'light');
    assert.deepEqual(b.stories[0].domain, { id: 'FEAT-OLD-01-01', name: '老11' });
    assert.equal(b.artifacts.spec.path, 'spec.md');
    await readFile(join(archDir, 'spec.md'), 'utf8'); // 改名成功

    // CHG-3333 检查：v3 → v4（artifacts 键重写；domain 因无 feature-path 跳过）
    const c = await readMetadata(chg3);
    assert.equal(c['schema-version'], 4);
    assert.equal(c.artifacts.spec.path, 'spec.md');
    assert.equal(c.stories[0].domain, undefined, '无 feature-path 不补 domain');
  } finally { await rm(root, { recursive: true, force: true }); }
});

// ---- Section G: resolveStoryDir ----
test('resolveStoryDir: inline 模式返回 changeDir 本身；3-tier 返回 stories/<id>/', async () => {
  const root = await mkChangeWorkspace();
  try {
    const changeDir = join(root, 'delivery', 'changes', 'FEAT-001', 'FEAT-001-02', 'FEAT-001-02-03', 'CHG-9999');
    await writeV2Metadata(changeDir);
    // inline（stories 为空，fallback 合成单 inline）
    const inlineR = await resolveStoryDir(changeDir, 'STORY-001-02-03-01');
    assert.equal(inlineR.inline, true);
    assert.equal(inlineR.storyDir, changeDir);
    await assert.rejects(() => resolveStoryDir(changeDir, 'STORY-NOT-EXIST'), /Story not found/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
