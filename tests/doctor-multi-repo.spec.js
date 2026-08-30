// Doctor multi-repo tests: runMultiRepoChecks（Phase 2.4 §7.3）+ config-writer git.submodule
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runMultiRepoChecks } from '../core/sdd/doctor-checks.js';
import { runChangeCreate, bindFeaturePath } from '../core/sdd/change-model.js';
import { writeWorkspaceDu, materializeDeliveryUnit, updateWorkspaceDuStatus } from '../core/sdd/delivery-unit.js';
import { writeRepositoriesYaml } from '../core/workspace/config-writer.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();
const HASH = 'a'.repeat(40);
const DRIFT = 'f'.repeat(40);

const FP = {
  'level-1': { id: 'FEAT-001', name: '用户中心' },
  'level-2': { id: 'FEAT-001-01', name: '账户能力' },
  'level-3': { id: 'FEAT-001-01-01', name: '用户认证' },
  story: { id: 'STORY-001-01-01-01', name: '用户注册' },
  candidate: false,
};

async function setupMultiRepoWorkspace() {
  const tmp = await mkdtemp(join(tmpdir(), 'doc-mr-'));
  await runInit(
    {
      name: 'doctor-multi',
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

test('DoctorMultiRepo: 健康 Workspace（无 CHG）→ 0 issues', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { issues } = await runMultiRepoChecks(tmp);
  assert.deepEqual(issues, []);
  await rmrf(tmp);
});

test('DoctorMultiRepo: registry id 重复 / path 越界 → 报 issue', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'doc-mr-'));
  // 直接写 .sdd/repositories.yaml（绕过 init，构造非法 registry）
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  await writeFile(
    join(tmp, '.sdd', 'repositories.yaml'),
    'mode: multi\nrepositories:\n  - id: backend\n    path: implementation/backend\n  - id: backend\n    path: outside/repo\n',
    'utf8'
  );
  const { issues } = await runMultiRepoChecks(tmp);
  assert.ok(issues.some((i) => i.includes("id 重复 'backend'")));
  assert.ok(issues.some((i) => i.includes("path 'outside/repo' 不在 implementation/ 下")));
  await rmrf(tmp);
});

test('DoctorMultiRepo: .gitmodules path 未注册 → 报 issue', async () => {
  const tmp = await setupMultiRepoWorkspace();
  await writeFile(
    join(tmp, '.gitmodules'),
    '[submodule "ai"]\n\tpath = implementation/ai\n\turl = https://example.com/ai.git\n',
    'utf8'
  );
  const { issues } = await runMultiRepoChecks(tmp);
  assert.ok(issues.some((i) => i.includes("submodule 'implementation/ai' 未注册")));
  await rmrf(tmp);
});

test('DoctorMultiRepo: kind:dir 单仓多模块（无 .git）→ 跳过 HEAD 检查；目录缺失 → 报 issue', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'doc-mr-dir-'));
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  await mkdir(join(tmp, 'implementation', 'module-a'), { recursive: true });
  // module-a 为 kind:dir 普通目录（无 .git）；module-b 注册但目录不存在
  await writeFile(
    join(tmp, '.sdd', 'repositories.yaml'),
    [
      'mode: multi',
      'repositories:',
      '  - id: module-a',
      '    path: implementation/module-a',
      '    kind: dir',
      '  - id: module-b',
      '    path: implementation/module-b',
      '    kind: dir',
      '',
    ].join('\n'),
    'utf8'
  );
  const { issues } = await runMultiRepoChecks(tmp);
  // module-a 存在且 kind:dir → 无 HEAD 告警
  assert.ok(!issues.some((i) => i.includes("repository 'module-a'")));
  // module-b 目录缺失 → 报 issue
  assert.ok(issues.some((i) => i.includes("repository 'module-b': kind:dir 模块目录不存在")));
  // 对照：无 kind 字段的条目默认 git 形态（第 5 项检查已在其他用例覆盖）
  await rmrf(tmp);
});

test('DoctorMultiRepo: DU repository 未注册 → 报 issue', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { id: chg1, changeDir: dir1 } = await runChangeCreate(tmp, { title: 't', repositories: ['backend'] }, harnessRoot);
  await bindFeaturePath(dir1, FP);
  const { readMetadata } = await import('../core/sdd/change-model.js');
  const meta = await readMetadata(dir1);
  await writeWorkspaceDu(dir1, meta, { id: 'DU-AI-001', repository: 'ai', scope: ['s'], acceptance: ['a'] });
  const { issues } = await runMultiRepoChecks(tmp);
  assert.ok(issues.some((i) => i.includes("repository 'ai' 不在 repositories.yaml")));
  await rmrf(tmp);
});

test('DoctorMultiRepo: feature-path 引用树中不存在 id → 报 issue', async () => {
  const tmp = await setupMultiRepoWorkspace();
  await runChangeCreate(tmp, { title: 't' }, harnessRoot);
  const changeDir = join(tmp, 'delivery', 'changes', 'CHG-0001');
  await bindFeaturePath(changeDir, FP); // 树为空 → 全部 id 不在树中
  const { issues } = await runMultiRepoChecks(tmp);
  assert.ok(issues.some((i) => i.includes("feature-path 引用 'FEAT-001' 不在 product/feature-tree.yaml")));
  assert.ok(issues.some((i) => i.includes('STORY 目录未物化')));
  await rmrf(tmp);
});

test('DoctorMultiRepo: result 与 HEAD 漂移 → 报 issue；对齐 → 通过', async () => {
  const tmp = await setupMultiRepoWorkspace();
  const { id: changeId, changeDir } = await runChangeCreate(tmp, { title: 't', repositories: ['backend'] }, harnessRoot);
  await bindFeaturePath(changeDir, FP);
  const { readMetadata } = await import('../core/sdd/change-model.js');
  let meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, { id: 'DU-BE-001', repository: 'backend', scope: ['s'], acceptance: ['a'] });
  await materializeDeliveryUnit(tmp, changeId, 'DU-BE-001', { headCommit: HASH });
  meta = await readMetadata(changeDir);
  await updateWorkspaceDuStatus(changeDir, meta, 'DU-BE-001', 'completed', { resultCommit: DRIFT });

  // 构造 backend 子仓 HEAD == HASH（.git 目录形态）
  const gitDir = join(tmp, 'implementation', 'backend', '.git', 'refs', 'heads');
  await mkdir(gitDir, { recursive: true });
  await writeFile(join(tmp, 'implementation', 'backend', '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
  await writeFile(join(gitDir, 'main'), `${HASH}\n`, 'utf8');

  // DRIFT != HEAD → issue
  let { issues } = await runMultiRepoChecks(tmp);
  assert.ok(issues.some((i) => i.includes('DU-BE-001: result commit 与') && i.includes("HEAD 不一致")));

  // 对齐 HEAD → 无 issue
  const { updateWorkspaceDuStatus: upd } = await import('../core/sdd/delivery-unit.js');
  const meta2 = await readMetadata(changeDir);
  await upd(changeDir, meta2, 'DU-BE-001', 'completed', { resultCommit: HASH });
  ({ issues } = await runMultiRepoChecks(tmp));
  assert.ok(!issues.some((i) => i.includes('HEAD 不一致')), `issues: ${issues.join('; ')}`);
  await rmrf(tmp);
});

test('ConfigWriter: multi 模式写入 git.submodule 标记', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'cfg-'));
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  writeRepositoriesYaml(join(harnessRoot, 'templates', 'default-workspace'), tmp, {
    mode: 'multi',
    repos: [
      { id: 'backend', path: 'implementation/backend', git: { submodule: true } },
      { id: 'frontend', path: 'implementation/frontend' },
    ],
  });
  const { parse } = await import('yaml');
  const { readFile } = await import('node:fs/promises');
  const doc = parse(await readFile(join(tmp, '.sdd', 'repositories.yaml'), 'utf8'));
  assert.equal(doc.repositories[0].git.submodule, true);
  assert.equal(doc.repositories[1].git, undefined);
  await rmrf(tmp);
});
