// Unit tests: Phase 2.4 多仓交付（delivery-unit / artifact-path / git-submodule）
// 对齐 plans/phase-2.4-multi-repository-delivery-design.md §10/§13/§14/§17
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, readFile, stat } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, bindFeaturePath } from '../core/sdd/change-model.js';
import {
  writeWorkspaceDu,
  readWorkspaceDus,
  materializeDeliveryUnit,
  aggregateDuStatus,
  updateWorkspaceDuStatus,
  readRepositories,
  findRepository,
  syncDuCommits,
} from '../core/sdd/delivery-unit.js';
import { resolveArtifactPath, featurePathDirs, resolveStoryDir } from '../core/sdd/artifact-path.js';
import { parseGitmodules, probeRepoKind, resolveSubmoduleHead } from '../core/sdd/git-submodule.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();
const HASH = 'a'.repeat(40);

const FP = {
  'level-1': { id: 'FEAT-001', name: '用户中心' },
  'level-2': { id: 'FEAT-001-01', name: '账户能力' },
  'level-3': { id: 'FEAT-001-01-01', name: '用户认证' },
  story: { id: 'STORY-001-01-01-01', name: '用户注册' },
  candidate: false,
};

// 多仓 workspace：backend / frontend 两个子目录仓
async function setupMultiRepoWorkspace() {
  const tmp = await mkdtemp(join(tmpdir(), 'du-'));
  await runInit(
    {
      name: 'du-test',
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
  // .sdd/repositories.yaml 由 init 生成，这里确认存在
  const repos = await readRepositories(tmp);
  assert.ok(repos.some((r) => r.id === 'backend'));
  return tmp;
}

async function setupChange(tmp, repos) {
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: '多仓测试', requirement: 'REQ-DU', repositories: repos },
    harnessRoot
  );
  return { changeId: id, changeDir };
}

// ---- artifact-path ----

test('ArtifactPath.featurePathDirs: 四级完整返回业务名段（纯名字模式），未绑定返回 null', async () => {
  assert.deepEqual(featurePathDirs({ 'feature-path': FP }), [
    '用户中心',
    '账户能力',
    '用户认证',
    '用户注册',
  ]);
  assert.equal(featurePathDirs({}), null);
  assert.equal(featurePathDirs({ 'feature-path': { ...FP, story: undefined } }), null);
  // Candidate 未晋升不物化
  assert.equal(featurePathDirs({ 'feature-path': { ...FP, candidate: true } }), null);
});

test('ArtifactPath.resolveArtifactPath: 绑定后全部产物落 STORY 目录（第四层级）', async () => {
  const changeDir = join('x', 'CHG-0001');
  const dirs = ['用户中心', '账户能力', '用户认证', '用户注册'];
  assert.equal(
    resolveArtifactPath(changeDir, 'tasks.md', { 'feature-path': FP }),
    join(changeDir, ...dirs, 'tasks.md')
  );
  // 未绑定 → CHG 根（explore 早期暂存；bind 时由 skeleton 迁移）
  assert.equal(resolveArtifactPath(changeDir, 'tasks.md', {}), join(changeDir, 'tasks.md'));
  // Phase 3.5 修订：全部 Artifact（含 implementation.md）落 STORY 目录
  assert.equal(
    resolveArtifactPath(changeDir, 'implementation.md', { 'feature-path': FP }),
    join(changeDir, ...dirs, 'implementation.md')
  );
  assert.equal(resolveStoryDir(changeDir, { 'feature-path': FP }), join(changeDir, ...dirs));
});

// ---- Workspace DU 生命周期 ----

test('DeliveryUnit: writeWorkspaceDu 创建协调记录（STORY 目录下）', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeId, changeDir } = await setupChange(tmp, ['backend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  const { dir } = await writeWorkspaceDu(changeDir, meta, {
    id: 'DU-BE-001',
    repository: 'backend',
    scope: ['registration-api'],
    dependencies: [],
    acceptance: ['AC-1'],
  });
  assert.ok(dir.includes(join('用户中心', '账户能力', '用户认证', '用户注册', 'DU-BE-001')));
  const raw = await readFile(join(dir, 'metadata.yaml'), 'utf8');
  const { parse } = await import('yaml');
  const duMeta = parse(raw);
  assert.equal(duMeta.id, 'DU-BE-001');
  assert.equal(duMeta.repository, 'backend');
  assert.deepEqual(duMeta.scope, ['registration-api']);
  assert.deepEqual(duMeta.acceptance, ['AC-1']);
  await rmrf(tmp);
});

test('DeliveryUnit: feature-path 未绑定时 writeWorkspaceDu 抛错', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeDir } = await setupChange(tmp, ['backend']);
  const meta = await readMetadata(changeDir);
  await assert.rejects(
    () => writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-001', repository: 'backend' }),
    /feature-path 未绑定/
  );
  await rmrf(tmp);
});

test('DeliveryUnit: materialize 到对应仓（完整父路径 + 双写回填）', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeId, changeDir } = await setupChange(tmp, ['backend', 'frontend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-001', repository: 'backend', scope: ['s'], acceptance: ['a'] });
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-FE-001', repository: 'frontend', scope: ['s'], acceptance: ['a'] });

  const r = await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001');
  assert.equal(r.repoPath, 'implementation/backend');

  // repo 侧完整父路径：delivery/CHG-XXXX/四级业务名/DU-BE-001（纯名字段）
  const repoDuDir = join(tmp, 'implementation', 'backend', 'delivery', changeId, '用户中心', '账户能力', '用户认证', '用户注册', 'DU-BE-001');
  assert.equal((await stat(join(repoDuDir, 'metadata.yaml'))).isFile(), true);
  assert.equal((await stat(join(repoDuDir, 'task.md'))).isFile(), true);
  assert.equal((await stat(join(repoDuDir, 'implementation.md'))).isFile(), true);
  assert.equal((await stat(join(repoDuDir, 'evidence'))).isDirectory(), true);
  // repo 侧 metadata 含 workspace-source 引用（tasks 指向 STORY 目录，业务名段）
  const repoMetaRaw = await readFile(join(repoDuDir, 'metadata.yaml'), 'utf8');
  assert.ok(repoMetaRaw.includes('用户注册/tasks.md'));

  // frontend 仓只见自己的 DU（frontend 未物化前无目录）
  const feDelivery = join(tmp, 'implementation', 'frontend', 'delivery', changeId);
  await assert.rejects(() => stat(feDelivery));

  // Workspace DU 回填 repository-delivery.path（正斜杠规范化）+ status=pending
  const dus = await readWorkspaceDus(changeDir, meta);
  const be = dus.find((d) => d.id === 'DU-BE-001');
  assert.equal(
    be.metadata['repository-delivery'].path,
    'implementation/backend/delivery/' + [changeId, '用户中心', '账户能力', '用户认证', '用户注册', 'DU-BE-001'].join('/')
  );
  assert.equal(be.metadata.status, 'pending');
  await rmrf(tmp);
});

test('DeliveryUnit: repository 不在 repositories.yaml → materialize 抛错（1:1 硬约束）', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeId, changeDir } = await setupChange(tmp, ['backend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-XX-001', repository: 'nonexistent', scope: ['s'], acceptance: ['a'] });
  await assert.rejects(
    () => materializeDeliveryUnit(tmp, changeId, 'DU-XX-001'),
    /repositories\.yaml/
  );
  await rmrf(tmp);
});

test('DeliveryUnit: aggregateDuStatus 聚合 materialized/status/仓覆盖', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeId, changeDir } = await setupChange(tmp, ['backend', 'frontend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-001', repository: 'backend', scope: ['s'], acceptance: ['a'] });
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-FE-001', repository: 'frontend', scope: ['s'], acceptance: ['a'] });

  // 未物化
  let agg = await aggregateDuStatus(changeDir, tmp);
  assert.equal(agg.total, 2);
  assert.equal(agg.allMaterialized, false);

  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001');
  await materializeDeliveryUnit(tmp, changeId, 'DU-FE-001');
  agg = await aggregateDuStatus(changeDir, tmp);
  assert.equal(agg.allMaterialized, true);
  assert.equal(agg.allTesting, false);
  assert.deepEqual(agg.repositories.sort(), ['backend', 'frontend']);

  // 状态推进 → fan-in 判定
  const meta2 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta2, 'DU-BE-001', 'testing');
  agg = await aggregateDuStatus(changeDir, tmp);
  assert.equal(agg.allTesting, false, 'frontend 仍 pending');
  const meta3 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta3, 'DU-FE-001', 'testing');
  agg = await aggregateDuStatus(changeDir, tmp);
  assert.equal(agg.allTesting, true);
  await rmrf(tmp);
});

test('DeliveryUnit: completed 回填 result commit → CHG metadata.repository-result', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeId, changeDir } = await setupChange(tmp, ['backend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-001', repository: 'backend', scope: ['s'], acceptance: ['a'] });
  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001', { headCommit: 'b'.repeat(40) });

  const meta2 = await readMetadata(changeDir);
  assert.equal(meta2['repository-baseline']?.backend?.commit, 'b'.repeat(40), 'materialize 记录 baseline');

  await updateWorkspaceDuStatus(changeDir, meta2, 'DU-BE-001', 'completed', { resultCommit: HASH });
  const meta3 = await readMetadata(changeDir);
  assert.equal(meta3['repository-result']?.backend?.commit, HASH);
  await rmrf(tmp);
});

test('DeliveryUnit: 非法 DU id / 非法 status 抛错', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeDir } = await setupChange(tmp, ['backend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await assert.rejects(
    () => writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-1', repository: 'backend' }),
    /invalid DU id/
  );
  await assert.rejects(
    () => updateWorkspaceDuStatus(changeDir, meta, 'DU-BE-001', 'done'),
    /invalid DU status/
  );
  await rmrf(tmp);
});

test('DeliveryUnit: findRepository 命中与未命中', async () => {
  const repos = [
    { id: 'backend', path: 'implementation/backend' },
    { id: 'frontend', path: 'implementation/frontend' },
  ];
  assert.equal(findRepository(repos, 'backend').path, 'implementation/backend');
  assert.equal(findRepository(repos, 'ai'), null);
});

test('DeliveryUnit.syncDuCommits: 补 baseline / completed 刷 result / head 缺失跳过', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { changeId, changeDir } = await setupChange(tmp, ['backend', 'frontend']);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-001', repository: 'backend', scope: ['s'], acceptance: ['a'] });
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-FE-001', repository: 'frontend', scope: ['s'], acceptance: ['a'] });
  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001');
  await materializeDeliveryUnit(tmp, changeId, 'DU-FE-001');

  const C1 = 'c'.repeat(40);
  const C2 = 'd'.repeat(40);

  // backend 有 head → 补 baseline；frontend 无 head → none
  let results = await syncDuCommits(tmp, changeId, { backend: C1 });
  assert.deepEqual(results.find((r) => r.duId === 'DU-BE-001').updated, 'baseline');
  assert.deepEqual(results.find((r) => r.duId === 'DU-FE-001').updated, 'none');
  let meta2 = await readMetadata(changeDir);
  assert.equal(meta2['repository-baseline']?.backend?.commit, C1);
  assert.equal(meta2['repository-result']?.backend, undefined, 'pending 不写 result');

  // 幂等：已有 baseline 不覆写
  results = await syncDuCommits(tmp, changeId, { backend: C2 });
  assert.deepEqual(results.find((r) => r.duId === 'DU-BE-001').updated, 'none');
  meta2 = await readMetadata(changeDir);
  assert.equal(meta2['repository-baseline']?.backend?.commit, C1);

  // completed → 刷 result + 聚合 CHG
  const meta3 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta3, 'DU-BE-001', 'completed');
  results = await syncDuCommits(tmp, changeId, { backend: C2 });
  assert.deepEqual(results.find((r) => r.duId === 'DU-BE-001').updated, 'result');
  const meta4 = await readMetadata(changeDir);
  assert.equal(meta4['repository-result']?.backend?.commit, C2);
  await rmrf(tmp);
});

// ---- git-submodule ----

test('GitSubmodule.parseGitmodules: 解析 submodule 条目，缺文件返回 []', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'git-'));
  assert.deepEqual(await parseGitmodules(tmp), []);
  await writeFile(
    join(tmp, '.gitmodules'),
    '[submodule "backend"]\n\tpath = implementation/backend\n\turl = https://example.com/backend.git\n\n[submodule "frontend"]\n\tpath = implementation/frontend\n\turl = https://example.com/frontend.git\n',
    'utf8'
  );
  const subs = await parseGitmodules(tmp);
  assert.equal(subs.length, 2);
  assert.equal(subs[0].name, 'backend');
  assert.equal(subs[0].path, 'implementation/backend');
  assert.equal(subs[1].path, 'implementation/frontend');
  await rmrf(tmp);
});

test('GitSubmodule.probeRepoKind: 目录/普通仓/submodule 三态', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'git-'));
  const dir = join(tmp, 'plain');
  const repo = join(tmp, 'repo');
  const sub = join(tmp, 'sub');
  await mkdir(dir, { recursive: true });
  await mkdir(join(repo, '.git'), { recursive: true });
  await mkdir(sub, { recursive: true });
  await writeFile(join(sub, '.git'), 'gitdir: ../.git/modules/sub\n', 'utf8');
  assert.equal(await probeRepoKind(dir), 'dir');
  assert.equal(await probeRepoKind(repo), 'repo');
  assert.equal(await probeRepoKind(sub), 'submodule');
  await rmrf(tmp);
});

test('GitSubmodule.resolveSubmoduleHead: loose ref / packed-refs / detached / 未初始化', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'git-'));
  const C1 = '1'.repeat(40);
  const C2 = '2'.repeat(40);

  // 场景 1：submodule 形态（.git 文件 → gitdir 指针）+ loose ref
  const sub = join(tmp, 'sub');
  const subGitDir = join(tmp, '.git', 'modules', 'sub');
  await mkdir(join(subGitDir, 'refs', 'heads'), { recursive: true });
  await mkdir(sub, { recursive: true });
  await writeFile(join(sub, '.git'), 'gitdir: ../.git/modules/sub\n', 'utf8');
  await writeFile(join(subGitDir, 'HEAD'), 'ref: refs/heads/master\n', 'utf8');
  await writeFile(join(subGitDir, 'refs', 'heads', 'master'), `${C1}\n`, 'utf8');
  assert.equal(await resolveSubmoduleHead(tmp, 'sub'), C1);

  // 场景 2：loose ref 缺失 → packed-refs 回退
  await rm(join(subGitDir, 'refs', 'heads', 'master'));
  await writeFile(join(subGitDir, 'packed-refs'), `# pack-refs with: peeled fully-peeled sorted \n${C2} refs/heads/master\n`, 'utf8');
  assert.equal(await resolveSubmoduleHead(tmp, 'sub'), C2);

  // 场景 3：detached HEAD（直接 hash）
  await rm(join(subGitDir, 'packed-refs'));
  await writeFile(join(subGitDir, 'HEAD'), `${C1}\n`, 'utf8');
  assert.equal(await resolveSubmoduleHead(tmp, 'sub'), C1);

  // 场景 4：普通仓形态（.git 目录）
  const repo = join(tmp, 'repo');
  await mkdir(join(repo, '.git', 'refs', 'heads'), { recursive: true });
  await writeFile(join(repo, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  await writeFile(join(repo, '.git', 'refs', 'heads', 'main'), `${C2}\n`, 'utf8');
  assert.equal(await resolveSubmoduleHead(tmp, 'repo'), C2);

  // 场景 5：未初始化（无 .git）→ null
  assert.equal(await resolveSubmoduleHead(tmp, 'notexist'), null);
  await rmrf(tmp);
});
