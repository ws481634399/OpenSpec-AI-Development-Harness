// Unit tests: Phase 2.6 Context 规则 v0.2（plans/phase-2.6-context-rules-design.md §11.1）
// 覆盖：glob 转换 / v0.1 字符串兼容 / v0.2 结构化条目（mode/category/include/exclude）/
//       change-artifacts 显式注入 / 自动注入（STORY tasks.md + DU metadata）/ 预算截断 / 错误
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { mkdtemp, writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { assembleContext, globToRegExp } from '../core/sdd/context-assembler.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });

async function mkWs() {
  return mkdtemp(join(tmpdir(), 'ctx-asm-'));
}

async function writeRules(tmp, yamlText) {
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  await writeFile(join(tmp, '.sdd', 'context-rules.yaml'), yamlText, 'utf8');
}

/** 写文件（自动创建父目录）。 */
async function writeDeep(tmp, rel, content = '') {
  const abs = join(tmp, rel);
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

// feature-path 已绑定的 metadata（featurePathDirs 输入）
const FP_META = {
  'feature-path': {
    'level-1': { id: 'FEAT-001' },
    'level-2': { id: 'FEAT-001-01' },
    'level-3': { id: 'FEAT-001-01-01' },
    story: { id: 'STORY-001-01-01-01' },
    candidate: false,
  },
};

// ---- globToRegExp ----

test('globToRegExp: 双星跨目录 / 单星不跨段 / 问号单字符 / 特殊字符转义', () => {
  assert.ok(globToRegExp('**/*.md').test('a/b/c.md'));
  assert.ok(globToRegExp('**/*.md').test('c.md'), '双星加斜杠匹配零层目录');
  assert.ok(globToRegExp('*.md').test('c.md'));
  assert.ok(!globToRegExp('*.md').test('a/c.md'), '单星不跨目录段');
  assert.ok(globToRegExp('file?.ts').test('file1.ts'));
  assert.ok(!globToRegExp('file?.ts').test('file12.ts'));
  assert.ok(globToRegExp('a+b.md').test('a+b.md'));
  assert.ok(!globToRegExp('a+b.md').test('aab.md'), '+ 等特殊字符需字面匹配');
});

// ---- v0.1 兼容 ----

test('v0.1 字符串条目：读正文 + 前缀 category 推断 + dirs 保留', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['stages:', '  explore:', '    read:', '      - standards/', '      - product/guide.md'].join('\n'));
  await writeDeep(tmp, 'standards/coding.md', 'CODING-RULES-MARKER');
  await writeDeep(tmp, 'standards/deep/nested.md', 'NESTED');
  await writeDeep(tmp, 'product/guide.md', 'PRODUCT-GUIDE-MARKER');
  const ctx = await assembleContext(tmp, 'explore');
  assert.equal(ctx.rulesVersion, '0.1');
  const coding = ctx.files.find((f) => f.path === 'standards/coding.md');
  assert.ok(coding, 'standards/coding.md 应被收集');
  assert.equal(coding.content, 'CODING-RULES-MARKER');
  assert.equal(coding.mode, 'inline');
  assert.equal(coding.source, 'rule');
  assert.equal(coding.category, 'knowledge');
  assert.ok(ctx.files.some((f) => f.path === 'standards/deep/nested.md'), '目录递归收集');
  const guide = ctx.files.find((f) => f.path === 'product/guide.md');
  assert.equal(guide.content, 'PRODUCT-GUIDE-MARKER');
  assert.equal(guide.category, 'knowledge');
  assert.deepEqual(ctx.dirs, ['standards', 'product/guide.md']);
  await rmrf(tmp);
});

// ---- v0.2 结构化条目 ----

test('v0.2 mode=outline：不读正文，仅计文件数预算', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  design:', '    read:', '      - path: implementation/', '        mode: outline'].join('\n'));
  await writeDeep(tmp, 'implementation/backend/src/a.ts', 'SOURCE-CONTENT');
  const ctx = await assembleContext(tmp, 'design');
  assert.equal(ctx.files.length, 1);
  assert.equal(ctx.files[0].path, 'implementation/backend/src/a.ts');
  assert.equal(ctx.files[0].content, '', 'outline 不读正文');
  assert.equal(ctx.files[0].mode, 'outline');
  assert.equal(ctx.files[0].category, 'code');
  assert.equal(ctx.budget.usedBytes, 0);
  assert.equal(ctx.budget.usedFiles, 1);
  await rmrf(tmp);
});

test('v0.2 include/exclude glob 过滤', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    [
      'version: 0.2',
      'stages:',
      '  design:',
      '    read:',
      '      - path: implementation/',
      '        include: ["**/*.ts"]',
      '        exclude: ["**/*.spec.ts"]',
    ].join('\n')
  );
  await writeDeep(tmp, 'implementation/backend/a.ts', 'A');
  await writeDeep(tmp, 'implementation/backend/a.spec.ts', 'S');
  await writeDeep(tmp, 'implementation/backend/b.md', 'B');
  await writeDeep(tmp, 'implementation/frontend/c.tsx', 'C');
  const ctx = await assembleContext(tmp, 'design');
  const paths = ctx.files.map((f) => f.path);
  assert.deepEqual(paths, ['implementation/backend/a.ts']);
  await rmrf(tmp);
});

test('v0.2 category：显式声明优先，前缀推断 delivery→artifact / implementation→code / 其它→meta', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    [
      'version: 0.2',
      'stages:',
      '  explore:',
      '    read:',
      '      - path: delivery/a.md',
      '      - path: implementation/a.ts',
      '      - path: notes.md',
      '      - path: delivery/b.md',
      '        category: knowledge',
    ].join('\n')
  );
  await writeDeep(tmp, 'delivery/a.md', 'A');
  await writeDeep(tmp, 'implementation/a.ts', 'A');
  await writeDeep(tmp, 'notes.md', 'N');
  await writeDeep(tmp, 'delivery/b.md', 'B');
  const ctx = await assembleContext(tmp, 'explore');
  const catOf = (p) => ctx.files.find((f) => f.path === p)?.category;
  assert.equal(catOf('delivery/a.md'), 'artifact');
  assert.equal(catOf('implementation/a.ts'), 'code');
  assert.equal(catOf('notes.md'), 'meta');
  assert.equal(catOf('delivery/b.md'), 'knowledge', '显式 category 覆盖前缀推断');
  await rmrf(tmp);
});

// ---- change-artifacts 显式注入 ----

test('change-artifacts：存在注入正文（source=change-artifact），缺失标 missing', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    [
      'version: 0.2',
      'stages:',
      '  prd:',
      '    read: []',
      '    change-artifacts:',
      '      - requirement.md',
      '      - spec.md',
    ].join('\n')
  );
  const changeDir = join(tmp, 'delivery', 'changes', 'CHG-0001');
  await writeDeep(changeDir, 'requirement.md', 'REQ-MARKER');
  const ctx = await assembleContext(tmp, 'prd', { changeDir });
  const req = ctx.files.find((f) => f.path === 'delivery/changes/CHG-0001/requirement.md');
  assert.ok(req, 'requirement.md 应注入');
  assert.equal(req.content, 'REQ-MARKER');
  assert.equal(req.source, 'change-artifact');
  assert.equal(req.category, 'artifact');
  assert.ok(ctx.missingArtifacts.includes('spec.md (not found)'), `missing 应含 spec.md: ${ctx.missingArtifacts.join(';')}`);
  await rmrf(tmp);
});

// ---- 自动注入（§4.3）----

test('task 阶段自动注入 STORY tasks.md（feature-path 已绑定）', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  task:', '    read: []'].join('\n'));
  const changeDir = join(tmp, 'delivery', 'changes', 'CHG-0001');
  await writeDeep(changeDir, 'FEAT-001/FEAT-001-01/FEAT-001-01-01/STORY-001-01-01-01/tasks.md', 'TASKS-MARKER');
  const ctx = await assembleContext(tmp, 'task', { changeDir, metadata: FP_META });
  const tasks = ctx.files.find((f) => f.source === 'auto');
  assert.ok(tasks, '应自动注入 tasks.md');
  assert.equal(tasks.path, 'delivery/changes/CHG-0001/FEAT-001/FEAT-001-01/FEAT-001-01-01/STORY-001-01-01-01/tasks.md');
  assert.equal(tasks.content, 'TASKS-MARKER');
  assert.deepEqual(ctx.missingArtifacts, []);
  await rmrf(tmp);
});

test('task 阶段未绑定 feature-path → tasks.md 标 missing（不读 CHG 根 tasks.md）', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  task:', '    read: []'].join('\n'));
  const changeDir = join(tmp, 'delivery', 'changes', 'CHG-0001');
  await writeDeep(changeDir, 'tasks.md', 'OLD-FLAT-TASKS');
  const ctx = await assembleContext(tmp, 'task', { changeDir, metadata: {} });
  assert.deepEqual(ctx.files, [], '未绑定时不误读 CHG 根 tasks.md');
  assert.ok(ctx.missingArtifacts.includes('tasks.md (feature-path not bound)'), ctx.missingArtifacts.join(';'));
  await rmrf(tmp);
});

test('dev 阶段自动注入 STORY tasks.md + DU-*/metadata.yaml（排序；无 STORY 目录不误报 DU 缺失）', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  dev:', '    read: []'].join('\n'));
  const changeDir = join(tmp, 'delivery', 'changes', 'CHG-0001');
  const story = 'FEAT-001/FEAT-001-01/FEAT-001-01-01/STORY-001-01-01-01';
  await writeDeep(changeDir, `${story}/tasks.md`, 'TASKS');
  await writeDeep(changeDir, `${story}/DU-BE-001/metadata.yaml`, 'DU-BE-CONTENT');
  await writeDeep(changeDir, `${story}/DU-FE-002/metadata.yaml`, 'DU-FE-CONTENT');
  const ctx = await assembleContext(tmp, 'dev', { changeDir, metadata: FP_META });
  const auto = ctx.files.filter((f) => f.source === 'auto');
  assert.deepEqual(
    auto.map((f) => f.path),
    [
      `delivery/changes/CHG-0001/${story}/tasks.md`,
      `delivery/changes/CHG-0001/${story}/DU-BE-001/metadata.yaml`,
      `delivery/changes/CHG-0001/${story}/DU-FE-002/metadata.yaml`,
    ],
    'DU 按 id 排序'
  );
  assert.equal(auto[1].content, 'DU-BE-CONTENT');
  assert.equal(auto[2].content, 'DU-FE-CONTENT');
  assert.deepEqual(ctx.missingArtifacts, []);
  await rmrf(tmp);
});

test('dev 阶段 STORY 目录不存在 → 仅 tasks.md 标 missing，DU 不误报', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  dev:', '    read: []'].join('\n'));
  const changeDir = join(tmp, 'delivery', 'changes', 'CHG-0001');
  const ctx = await assembleContext(tmp, 'dev', { changeDir, metadata: FP_META });
  assert.deepEqual(ctx.files, []);
  assert.ok(ctx.missingArtifacts.some((m) => m.endsWith('tasks.md (not found)')), ctx.missingArtifacts.join(';'));
  assert.ok(!ctx.missingArtifacts.some((m) => m.includes('DU-')), 'DU 目录未创建不应误报');
  await rmrf(tmp);
});

// ---- 预算 ----

test('条目级 max-bytes / max-files 截断 → skipped', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    [
      'version: 0.2',
      'stages:',
      '  explore:',
      '    read:',
      '      - path: standards/',
      '        max-bytes: 10',
      '      - path: product/',
      '        max-files: 1',
    ].join('\n')
  );
  await writeDeep(tmp, 'standards/a.md', 'AAAAAAAAAA'); // 10 bytes → 保留
  await writeDeep(tmp, 'standards/b.md', 'BBBBBBBBBB'); // 超 max-bytes
  await writeDeep(tmp, 'product/x.md', 'X');
  await writeDeep(tmp, 'product/y.md', 'Y');
  const ctx = await assembleContext(tmp, 'explore');
  assert.deepEqual(
    ctx.files.map((f) => f.path),
    ['standards/a.md', 'product/x.md']
  );
  assert.ok(ctx.skipped.includes('standards/b.md (over entry max-bytes)'), ctx.skipped.join(';'));
  assert.ok(ctx.skipped.includes('product/y.md (over entry max-files)'), ctx.skipped.join(';'));
  await rmrf(tmp);
});

test('全局 limits 预算：超限文件入 skipped，usedBytes 不超限', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    ['version: 0.2', 'limits:', '  total-max-bytes: 15', 'stages:', '  explore:', '    read:', '      - path: standards/'].join('\n')
  );
  await writeDeep(tmp, 'standards/a.md', 'AAAAAAAAAA'); // 10 bytes
  await writeDeep(tmp, 'standards/b.md', 'BBBBBBBBBB'); // 10 bytes → 超全局 15
  const ctx = await assembleContext(tmp, 'explore');
  assert.deepEqual(
    ctx.files.map((f) => f.path),
    ['standards/a.md']
  );
  assert.ok(ctx.skipped.includes('standards/b.md (over budget)'), ctx.skipped.join(';'));
  assert.equal(ctx.budget.usedBytes, 10);
  assert.equal(ctx.budget.limitBytes, 15);
  await rmrf(tmp);
});

test('缺省预算 256KB / 200 文件（limits 缺省时兜底）', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  explore:', '    read: []'].join('\n'));
  const ctx = await assembleContext(tmp, 'explore');
  assert.equal(ctx.budget.limitBytes, 262144);
  assert.equal(ctx.budget.limitFiles, 200);
  await rmrf(tmp);
});

// ---- 错误 ----

test('context-rules.yaml 缺失 → 抛错；stage 未定义 → 抛错', async () => {
  const tmp = await mkWs();
  await assert.rejects(() => assembleContext(tmp, 'explore'), /Context rules not found/);
  await writeRules(tmp, ['version: 0.2', 'stages:', '  explore:', '    read: []'].join('\n'));
  await assert.rejects(() => assembleContext(tmp, 'prd'), /No context rules for stage: prd/);
  await rmrf(tmp);
});

// ---- Phase 2.7：DU 绑定 + per-repo 规则段（plans/phase-2.7-du-repo-context-design.md §5/§6）----

const FP_REL = 'FEAT-001/FEAT-001-01/FEAT-001-01-01/STORY-001-01-01-01';

// Workspace DU metadata.yaml（readWorkspaceDus 消费 repository / repository-delivery.path / guidance）
const duYaml = (duId, repoId, repoPath) =>
  [
    `id: ${duId}`,
    `repository: ${repoId}`,
    'repository-delivery:',
    `  path: "${repoPath}"`,
    'status: pending',
    'implementation-guidance:',
    '  sketch: true',
    '  pseudocode: true',
    '  complexity-trigger: [business-flow]',
  ].join('\n');

const REPO_REGISTRY = ['repositories:', '  - id: backend', '    path: implementation/backend'].join('\n');

/**
 * 构造 DU fixture：Workspace DU metadata + repo 侧交付目录。
 * @param {object} o { duId, repoId, materialized, wsDuRepoPath 覆写 Workspace DU 记录的 path }
 */
async function writeDuFixture(tmp, { duId = 'DU-BE-001', repoId = 'backend', materialized = true, wsDuRepoPath } = {}) {
  await writeDeep(tmp, '.sdd/repositories.yaml', REPO_REGISTRY);
  const repoPath = `implementation/${repoId}/delivery/CHG-0001/${FP_REL}/${duId}`;
  const recorded = wsDuRepoPath !== undefined ? wsDuRepoPath : materialized ? repoPath : '';
  await writeDeep(tmp, `delivery/changes/CHG-0001/${FP_REL}/tasks.md`, 'STORY-TASKS-MARKER');
  await writeDeep(tmp, `delivery/changes/CHG-0001/${FP_REL}/${duId}/metadata.yaml`, duYaml(duId, repoId, recorded));
  if (materialized) {
    await writeDeep(tmp, `${repoPath}/metadata.yaml`, 'REPO-META-MARKER');
    await writeDeep(tmp, `${repoPath}/task.md`, 'REPO-TASK-MARKER');
    await writeDeep(tmp, `${repoPath}/implementation.md`, 'REPO-IMPL-MARKER');
    await writeDeep(tmp, `${repoPath}/evidence/evidence.yaml`, 'EV-MARKER');
  }
  return repoPath;
}

const changeDirOf = (tmp) => join(tmp, 'delivery', 'changes', 'CHG-0001');

test('Phase 2.7 DU 绑定：已物化 → repo task.md/metadata inline + implementation.md/evidence outline', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.3', 'stages:', '  dev:', '    read: []'].join('\n'));
  const repoPath = await writeDuFixture(tmp);
  const ctx = await assembleContext(tmp, 'dev', { changeDir: changeDirOf(tmp), metadata: FP_META, du: 'DU-BE-001' });

  const task = ctx.files.find((f) => f.path === `${repoPath}/task.md`);
  assert.ok(task, 'repo task.md 应注入');
  assert.equal(task.content, 'REPO-TASK-MARKER');
  assert.equal(task.source, 'repo');
  assert.equal(task.mode, 'inline');
  assert.equal(task.category, 'artifact');
  const metaF = ctx.files.find((f) => f.path === `${repoPath}/metadata.yaml`);
  assert.equal(metaF.content, 'REPO-META-MARKER');
  const impl = ctx.files.find((f) => f.path === `${repoPath}/implementation.md`);
  assert.ok(impl, 'implementation.md 应以 outline 收集');
  assert.equal(impl.mode, 'outline');
  const ev = ctx.files.find((f) => f.path === `${repoPath}/evidence/evidence.yaml`);
  assert.ok(ev, 'evidence 清单应收集');
  assert.equal(ev.mode, 'outline');
  assert.deepEqual(ctx.missingArtifacts, []);
  assert.deepEqual(ctx.duBinding, {
    duId: 'DU-BE-001',
    repository: 'backend',
    repoPath,
    materialized: true,
    activatedRepos: [],
    guidance: { sketch: true, pseudocode: true, 'complexity-trigger': ['business-flow'] },
  });
  await rmrf(tmp);
});

test('Phase 2.7 DU 绑定：未物化 → metadata/task.md 标 missing 并提示 materialize', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.3', 'stages:', '  dev:', '    read: []'].join('\n'));
  const repoPath = await writeDuFixture(tmp, { materialized: false });
  const ctx = await assembleContext(tmp, 'dev', { changeDir: changeDirOf(tmp), metadata: FP_META, du: 'DU-BE-001' });
  assert.equal(ctx.duBinding.materialized, false);
  assert.equal(ctx.duBinding.repoPath, repoPath, '未记录 path 时按物化规则推导');
  assert.equal(ctx.missingArtifacts.length, 2);
  for (const m of ctx.missingArtifacts) {
    assert.ok(m.includes('(not materialized — run: openspec du materialize CHG-0001 DU-BE-001)'), m);
  }
  await rmrf(tmp);
});

test('Phase 2.7 DU 绑定：DU 不存在 → 抛错并列出可用 DU', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.3', 'stages:', '  dev:', '    read: []'].join('\n'));
  await writeDuFixture(tmp);
  await assert.rejects(
    () => assembleContext(tmp, 'dev', { changeDir: changeDirOf(tmp), metadata: FP_META, du: 'DU-BE-999' }),
    /Workspace DU not found: DU-BE-999/
  );
  await rmrf(tmp);
});

test('Phase 2.7 DU 绑定：repository 不在 Registry → 抛错', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.3', 'stages:', '  dev:', '    read: []'].join('\n'));
  await writeDeep(tmp, '.sdd/repositories.yaml', REPO_REGISTRY);
  await writeDeep(tmp, `delivery/changes/CHG-0001/${FP_REL}/DU-GH-001/metadata.yaml`, duYaml('DU-GH-001', 'ghost', ''));
  await assert.rejects(
    () => assembleContext(tmp, 'dev', { changeDir: changeDirOf(tmp), metadata: FP_META, du: 'DU-GH-001' }),
    /repository 'ghost' 不在 \.sdd\/repositories\.yaml/
  );
  await rmrf(tmp);
});

test('Phase 2.7 per-repo 规则段：绑定 DU 激活对应仓（source=repo），其他仓不激活', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    [
      'version: 0.3',
      'stages:',
      '  dev:',
      '    read: []',
      '    repos:',
      '      backend:',
      '        read:',
      '          - path: implementation/backend/src/',
      '            mode: inline',
      '      frontend:',
      '        read:',
      '          - path: implementation/frontend/src/',
      '            mode: inline',
    ].join('\n')
  );
  await writeDuFixture(tmp, { materialized: false }); // 未物化避免注入占用预算干扰断言
  await writeDeep(tmp, 'implementation/backend/src/A.java', 'BACKEND-SRC-MARKER');
  await writeDeep(tmp, 'implementation/frontend/src/B.ts', 'FRONTEND-SRC-MARKER');
  const ctx = await assembleContext(tmp, 'dev', { changeDir: changeDirOf(tmp), metadata: FP_META, du: 'DU-BE-001' });
  const backend = ctx.files.find((f) => f.path === 'implementation/backend/src/A.java');
  assert.ok(backend, '绑定仓的 src 应内联');
  assert.equal(backend.content, 'BACKEND-SRC-MARKER');
  assert.equal(backend.source, 'repo');
  assert.ok(!ctx.files.some((f) => f.path === 'implementation/frontend/src/B.ts'), '未绑定仓不激活');
  assert.deepEqual(ctx.duBinding.activatedRepos, ['backend']);
  await rmrf(tmp);
});

test('Phase 2.7 未绑定 DU → repos 段不激活，duBinding 为 null', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    ['version: 0.3', 'stages:', '  dev:', '    read: []', '    repos:', '      backend:', '        read:', '          - path: implementation/backend/src/'].join('\n')
  );
  await writeDeep(tmp, 'implementation/backend/src/A.java', 'BACKEND-SRC-MARKER');
  const ctx = await assembleContext(tmp, 'dev');
  assert.equal(ctx.duBinding, null);
  assert.deepEqual(ctx.files, []);
  await rmrf(tmp);
});

test('Phase 2.7 per-repo 条目受全局 limits 约束', async () => {
  const tmp = await mkWs();
  await writeRules(
    tmp,
    ['version: 0.3', 'limits:', '  total-max-bytes: 10', 'stages:', '  dev:', '    read: []', '    repos:', '      backend:', '        read:', '          - path: implementation/backend/src/'].join('\n')
  );
  await writeDuFixture(tmp, { materialized: false });
  await writeDeep(tmp, 'implementation/backend/src/A.java', 'A'.repeat(20));
  const ctx = await assembleContext(tmp, 'dev', { changeDir: changeDirOf(tmp), metadata: FP_META, du: 'DU-BE-001' });
  assert.deepEqual(ctx.files, []);
  assert.ok(ctx.skipped.includes('implementation/backend/src/A.java (over budget)'), ctx.skipped.join(';'));
  await rmrf(tmp);
});

test('Phase 2.7 DU 绑定未传 changeDir → 抛错', async () => {
  const tmp = await mkWs();
  await writeRules(tmp, ['version: 0.3', 'stages:', '  dev:', '    read: []'].join('\n'));
  await assert.rejects(() => assembleContext(tmp, 'dev', { du: 'DU-BE-001' }), /changeDir/);
  await rmrf(tmp);
});

// ---- v0.4 模板规则：交接缺口修复（exploration 注入 prd/design + converge 全链视图）----

/** 将 Harness 模板 context-rules.yaml 原样复制为被测规则。 */
async function writeTemplateRules(tmp) {
  const raw = await readFile(
    join(getHarnessRoot(), 'templates', 'default-workspace', '.sdd', 'context-rules.yaml'),
    'utf8'
  );
  await writeRules(tmp, raw);
}

test('模板规则 v0.4：prd/design 注入 exploration.md（缺口 1：探索分析随交接流动）', async () => {
  const tmp = await mkWs();
  await writeTemplateRules(tmp);
  await writeDeep(tmp, 'delivery/changes/CHG-0001/requirement.md', 'REQ-MARKER');
  await writeDeep(tmp, 'delivery/changes/CHG-0001/exploration.md', 'EXPLORATION-MARKER');
  await writeDeep(tmp, 'delivery/changes/CHG-0001/spec.md', 'PRD-MARKER');
  const ctx = await assembleContext(tmp, 'design', { changeDir: changeDirOf(tmp) });
  assert.equal(ctx.rulesVersion, '0.4');
  const expl = ctx.files.find((f) => f.path === 'delivery/changes/CHG-0001/exploration.md');
  assert.ok(expl, 'exploration.md 应注入 design 上下文');
  assert.equal(expl.content, 'EXPLORATION-MARKER');
  assert.equal(expl.source, 'change-artifact');
  assert.ok(!ctx.missingArtifacts.some((m) => m.includes('exploration.md')), ctx.missingArtifacts.join(';'));
  await rmrf(tmp);
});

test('模板规则 v0.4：converge 注入全链产物（缺口 2：人审全链视图）', async () => {
  const tmp = await mkWs();
  await writeTemplateRules(tmp);
  const base = 'delivery/changes/CHG-0001';
  await writeDeep(tmp, `${base}/design.md`, 'DESIGN-MARKER');
  await writeDeep(tmp, `${base}/spec.md`, 'PRD-MARKER');
  await writeDeep(tmp, `${base}/implementation.md`, 'IMPL-MARKER');
  await writeDeep(tmp, `${base}/evidence/test-report.md`, 'TEST-MARKER');
  await writeDeep(tmp, `${base}/review-report.md`, 'REVIEW-MARKER');
  const ctx = await assembleContext(tmp, 'converge', { changeDir: changeDirOf(tmp) });
  assert.equal(ctx.rulesVersion, '0.4');
  for (const rel of ['design.md', 'spec.md', 'implementation.md', 'evidence/test-report.md', 'review-report.md']) {
    const f = ctx.files.find((x) => x.path === `delivery/changes/CHG-0001/${rel}`);
    assert.ok(f, `${rel} 应注入 converge 上下文`);
    assert.equal(f.source, 'change-artifact');
  }
  assert.deepEqual(
    ctx.missingArtifacts.filter((m) => !m.includes('tasks.md') && !m.includes('DU-')),
    [],
    `不应有非 DU 仪式性 missing: ${ctx.missingArtifacts.join(';')}`
  );
  await rmrf(tmp);
});
