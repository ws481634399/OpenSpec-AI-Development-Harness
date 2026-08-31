// Unit tests: Phase 2.4 Machine Gate 新检查项（§17.3 六项）
// feature-path-bound / du-coverage / du-materialized / du-fan-in-testing / du-fan-in-complete / submodule-pointer-aligned
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, bindFeaturePath } from '../core/sdd/change-model.js';
import {
  writeWorkspaceDu,
  materializeDeliveryUnit,
  updateWorkspaceDuStatus,
} from '../core/sdd/delivery-unit.js';
import { runMachineGate } from '../core/sdd/gate-validator.js';
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

// Phase 3.5 修订：绑定后产物落 STORY 目录（纯业务名段）
const STORY = ['用户中心', '账户能力', '用户认证', '用户注册'];
const seedStory = async (changeDir, rel, content) => {
  await mkdir(join(changeDir, ...STORY, rel, '..'), { recursive: true });
  await writeFile(join(changeDir, ...STORY, rel), content, 'utf8');
};

async function setupWorkspace() {
  const tmp = await mkdtemp(join(tmpdir(), 'gate-du-'));
  await runInit(
    {
      name: 'gate-du-test',
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
    { title: 'Gate DU 测试', requirement: 'REQ-GDU', repositories: ['backend', 'frontend'] },
    harnessRoot
  );
  return { changeId: id, changeDir };
}

// 用内联 gateConfig 直接驱动目标检查项（不依赖 skill gate.yaml）
const gateOf = (artifact, check) => ({ artifact, 'machine-checks': [check] });

async function createDu(changeDir, meta, id, repository, over = {}) {
  await writeWorkspaceDu(changeDir, meta, {
    id,
    repository,
    scope: over.scope ?? ['s'],
    acceptance: over.acceptance ?? ['a'],
    dependencies: over.dependencies ?? [],
  });
}

// ---- feature-path-bound ----

test('Gate: feature-path-bound 未绑定 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await writeFile(join(changeDir, 'design.md'), '# Design', 'utf8');
  const r = await runMachineGate(changeDir, gateOf('design.md', 'feature-path-bound'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('feature-path 未绑定')));
  await rmrf(tmp);
});

test('Gate: feature-path-bound candidate=true → failed；完整绑定 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await writeFile(join(changeDir, 'design.md'), '# Design', 'utf8');

  await bindFeaturePath(changeDir, { ...FP, candidate: true });
  let r = await runMachineGate(changeDir, gateOf('design.md', 'feature-path-bound'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('candidate=true')));

  await bindFeaturePath(changeDir, FP);
  // 完整绑定后产物落 STORY 目录
  await seedStory(changeDir, 'design.md', '# Design');
  r = await runMachineGate(changeDir, gateOf('design.md', 'feature-path-bound'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ---- du-coverage ----

test('Gate: du-coverage design 声明仓未被 DU 覆盖 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'backend');
  await seedStory(
    changeDir,
    'tasks.md',
    '---\naffected-repositories: [backend, frontend]\n---\n# Tasks'
  );
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-coverage'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('frontend') && i.includes('未被任何 DU 覆盖')), r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: du-coverage DU 结构缺陷 → failed（repository 未知/scope 空/依赖悬空/无 DU）', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);

  // 无 DU（先写 tasks.md 让 gate 跑到检查项）
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  let r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-coverage'));
  assert.ok(r.issues.some((i) => i.includes('未创建任何 Delivery Unit')));

  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'ai'); // 不在 repositories.yaml
  await createDu(changeDir, meta, 'DU-FE-001', 'frontend', { scope: [], dependencies: ['DU-BE-999'] }); // scope 空 + 悬空依赖
  await seedStory(changeDir, 'tasks.md', '# Tasks');
  r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-coverage'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes("repository 'ai' 不在")), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes('DU-FE-001 scope 为空')));
  assert.ok(r.issues.some((i) => i.includes('DU-BE-999')));
  await rmrf(tmp);
});

test('Gate: du-coverage 覆盖完整 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'backend');
  await createDu(changeDir, meta, 'DU-FE-001', 'frontend');
  await seedStory(
    changeDir,
    'tasks.md',
    '---\naffected-repositories: [backend, frontend]\n---\n# Tasks'
  );
  const r = await runMachineGate(changeDir, gateOf('tasks.md', 'du-coverage'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ---- du-materialized / du-fan-in-testing / du-fan-in-complete ----

test('Gate: du-materialized 未物化 → failed；物化后 → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeId, changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'backend');
  await createDu(changeDir, meta, 'DU-FE-001', 'frontend');
  await seedStory(changeDir, 'implementation.md', '# Impl');

  let r = await runMachineGate(changeDir, gateOf('implementation.md', 'du-materialized'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('DU-BE-001 未 materialize')));

  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001');
  await materializeDeliveryUnit(tmp, changeId, 'DU-FE-001');
  r = await runMachineGate(changeDir, gateOf('implementation.md', 'du-materialized'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: du-fan-in-testing 任一 DU 未达 testing → failed；全部 testing → passed', async () => {
  const tmp = await setupWorkspace();
  const { changeId, changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'backend');
  await createDu(changeDir, meta, 'DU-FE-001', 'frontend');
  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001');
  await materializeDeliveryUnit(tmp, changeId, 'DU-FE-001');
  await seedStory(changeDir, join('evidence', 'test-report.md'), '# Test');

  const meta2 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta2, 'DU-BE-001', 'testing');
  let r = await runMachineGate(changeDir, gateOf('evidence/test-report.md', 'du-fan-in-testing'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('DU-FE-001 status=pending')));

  const meta3 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta3, 'DU-FE-001', 'testing');
  r = await runMachineGate(changeDir, gateOf('evidence/test-report.md', 'du-fan-in-testing'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: du-fan-in-complete 全部 completed → passed；未完成 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeId, changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'backend');
  await createDu(changeDir, meta, 'DU-FE-001', 'frontend');
  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001');
  await materializeDeliveryUnit(tmp, changeId, 'DU-FE-001');
  await seedStory(changeDir, 'review-report.md', '# Review');

  let r = await runMachineGate(changeDir, gateOf('review-report.md', 'du-fan-in-complete'));
  assert.equal(r.passed, false);

  const meta2 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta2, 'DU-BE-001', 'completed', { resultCommit: HASH });
  const meta3 = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta3, 'DU-FE-001', 'completed', { resultCommit: HASH });
  r = await runMachineGate(changeDir, gateOf('review-report.md', 'du-fan-in-complete'));
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

// ---- submodule-pointer-aligned ----

// 构造一个伪 Git 仓（普通仓形态），返回 HEAD hash
async function fakeGitRepo(workspaceRoot, repoPath, head) {
  const gitDir = join(workspaceRoot, repoPath, '.git');
  await mkdir(join(gitDir, 'refs', 'heads'), { recursive: true });
  await writeFile(join(gitDir, 'HEAD'), 'ref: refs/heads/master\n', 'utf8');
  await writeFile(join(gitDir, 'refs', 'heads', 'master'), `${head}\n`, 'utf8');
}

test('Gate: submodule-pointer-aligned result==HEAD → passed；漂移 → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await bindFeaturePath(changeDir, FP);

  const H1 = '1'.repeat(40);
  const H2 = '2'.repeat(40);
  await fakeGitRepo(tmp, 'implementation/backend', H1);
  await fakeGitRepo(tmp, 'implementation/frontend', H2);

  // repository-result 与实际 HEAD 一致
  const { patchMetadata } = await import('../core/sdd/change-model.js');
  await patchMetadata(changeDir, {
    'repository-result': { backend: { commit: H1 }, frontend: { commit: H2 } },
  });
  await seedStory(changeDir, 'convergence.md', '# Convergence');
  let r = await runMachineGate(changeDir, gateOf('convergence.md', 'submodule-pointer-aligned'));
  assert.equal(r.passed, true, r.issues.join('; '));

  // frontend 出现新提交（指针漂移）
  await fakeGitRepo(tmp, 'implementation/frontend', '3'.repeat(40));
  r = await runMachineGate(changeDir, gateOf('convergence.md', 'submodule-pointer-aligned'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('Submodule Pointer 未对齐') && i.includes('frontend')), r.issues.join('; '));
  await rmrf(tmp);
});

test('Gate: submodule-pointer-aligned v1 CHG（无 DU 无 result）→ 跳过；有 DU 缺 result → failed', async () => {
  const tmp = await setupWorkspace();
  const { changeDir } = await setupChange(tmp);
  await writeFile(join(changeDir, 'convergence.md'), '# Convergence', 'utf8');

  // v2 但无 DU 且无 repository-result → 不要求 pointer 校验
  let r = await runMachineGate(changeDir, gateOf('convergence.md', 'submodule-pointer-aligned'));
  assert.equal(r.passed, true, r.issues.join('; '));

  // 有 DU 但无 repository-result → failed
  await bindFeaturePath(changeDir, FP);
  await seedStory(changeDir, 'convergence.md', '# Convergence');
  const meta = await readMetadata(changeDir);
  await createDu(changeDir, meta, 'DU-BE-001', 'backend');
  r = await runMachineGate(changeDir, gateOf('convergence.md', 'submodule-pointer-aligned'));
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('repository-result 为空')));
  await rmrf(tmp);
});
