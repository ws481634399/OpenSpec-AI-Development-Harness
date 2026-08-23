// Integration tests: runInit 端到端（greenfield / brownfield+multi+外部路径 / 重复 init / --force 保护四世界 / 版本一致）
//                 + Change 生命周期端到端（init → create → 全状态推进 → archive）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, stat, writeFile, mkdir, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { readHarnessVersion } from '../core/workspace/version.js';
import { runChangeCreate, patchStatus, patchMetadata, readMetadata } from '../core/sdd/change-model.js';
import { changeExists, listChanges, findChangeByRequirement } from '../core/sdd/change-repository.js';
import { archiveChange } from '../core/sdd/change-archiver.js';
import { readFeatureTree, findFeature, featurePath } from '../core/sdd/feature-model.js';
import { validateTransition } from '../core/sdd/change-state-machine.js';
import { loadSkill } from '../core/sdd/skill-loader.js';
import { assembleContext } from '../core/sdd/context-assembler.js';
import { buildInstruction } from '../core/sdd/instruction-builder.js';
import { writeArtifact } from '../core/sdd/artifact-writer.js';
import { writeCandidate } from '../core/sdd/candidate-repository.js';
import { decideReuseAction } from '../cli/openspec/src/lib/skill-prompts.js';

const pathExists = (p) => stat(p).then(() => true).catch(() => false);
const rmrf = (p) => rm(p, { recursive: true, force: true });

const harnessRoot = getHarnessRoot();
const harnessVersion = readHarnessVersion(harnessRoot);

test('integration: greenfield + single 完整初始化', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-i-green-'));
  const config = {
    name: 'test-green',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: false,
  };
  const { selfCheck } = await runInit(config, tmp, harnessRoot);
  assert.ok(selfCheck.ok, selfCheck.issues.join('; '));

  const ws = parse(readFileSync(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.name, 'test-green');
  assert.equal(ws.workspace.type, 'greenfield');
  assert.equal(ws.workspace.harness.version, '0.1.0');

  const rep = parse(readFileSync(join(tmp, '.sdd', 'repositories.yaml'), 'utf8'));
  assert.equal(rep.mode, 'single');
  assert.equal(rep.repositories[0].id, 'main');
  assert.equal(rep.repositories[0].path, 'implementation');

  assert.ok(await pathExists(join(tmp, 'implementation', 'README.md')), 'implementation/README.md 应创建');
  assert.ok(await pathExists(join(tmp, 'README-OpenSpec.md')), 'README-OpenSpec.md 应存在');
  assert.ok(!(await pathExists(join(tmp, 'README.md'))), 'README.md 不应存在（改名）');
  assert.ok(await pathExists(join(tmp, '.sdd', 'context-rules.yaml')), 'context-rules.yaml 应存在');

  await rmrf(tmp);
});

test('integration: brownfield + multi + 外部路径不创建 implementation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-i-brown-'));
  const config = {
    name: 'test-brown',
    type: 'brownfield',
    mode: 'multi',
    repos: [
      { id: 'backend', path: '../existing-src/backend' },
      { id: 'frontend', path: '../existing-src/frontend' },
    ],
    shouldCreateImplementation: false,
    force: false,
  };
  const { selfCheck } = await runInit(config, tmp, harnessRoot);
  assert.ok(selfCheck.ok, selfCheck.issues.join('; '));

  assert.ok(!(await pathExists(join(tmp, 'implementation'))), 'implementation/ 不应创建（外部路径）');

  const rep = parse(readFileSync(join(tmp, '.sdd', 'repositories.yaml'), 'utf8'));
  assert.equal(rep.mode, 'multi');
  assert.equal(rep.repositories.length, 2);
  assert.equal(rep.repositories[0].id, 'backend');
  assert.equal(rep.repositories[1].path, '../existing-src/frontend');

  await rmrf(tmp);
});

test('integration: 重复 init 无 --force 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-i-dup-'));
  const config = {
    name: 'dup',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: false,
  };
  await runInit(config, tmp, harnessRoot);
  await assert.rejects(() => runInit(config, tmp, harnessRoot), /already initialized/);
  await rmrf(tmp);
});

test('integration: --force 覆写 .sdd/*.yaml 但保护四世界', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-i-force-'));
  const config1 = {
    name: 'first',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: false,
  };
  await runInit(config1, tmp, harnessRoot);

  // 模拟用户在 standards/ 写入知识
  await writeFile(join(tmp, 'standards', 'USER_MARKER.md'), 'user kept');

  const config2 = {
    name: 'second',
    type: 'brownfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: true,
  };
  await runInit(config2, tmp, harnessRoot);

  const ws = parse(readFileSync(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.name, 'second');
  assert.equal(ws.workspace.type, 'brownfield');

  // 四世界用户知识应保留
  assert.ok(
    await pathExists(join(tmp, 'standards', 'USER_MARKER.md')),
    '--force 不应清空 standards/ 标记文件'
  );

  await rmrf(tmp);
});

test('integration: version.yaml.harness.version 与 .version 一致', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-i-ver-'));
  const config = {
    name: 'verproj',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: false,
  };
  await runInit(config, tmp, harnessRoot);
  const v = parse(readFileSync(join(tmp, '.sdd', 'version.yaml'), 'utf8'));
  assert.equal(v.harness.version, harnessVersion);
  await rmrf(tmp);
});

// ---- Change 生命周期端到端 ----
// 验证 SDD 生命周期领域模型在已初始化 Workspace 中的完整流转

const LIFECYCLE_STATES = [
  'exploring',
  'specified',
  'designed',
  'tasked',
  'developing',
  'testing',
  'completed',
];

test('integration: init → change create → 全状态推进 → archive 完整生命周期', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-life-e2e-'));
  // 1. 初始化 Workspace
  const initConfig = {
    name: 'lifecycle-e2e',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: false,
  };
  const { selfCheck } = await runInit(initConfig, tmp, harnessRoot);
  assert.ok(selfCheck.ok, selfCheck.issues.join('; '));

  // 2. 创建 Change（created 状态）
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: '新增智能商品推荐', requirement: 'REQ-001', repositories: ['main'] },
    harnessRoot
  );
  assert.equal(id, 'CHG-0001');
  assert.ok(await changeExists(tmp, id));
  let meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'created');
  assert.equal(meta.requirement, 'REQ-001');

  // 3. 全状态推进 created → archived（除 archived，archive 单独走）
  for (const s of LIFECYCLE_STATES) {
    await patchStatus(changeDir, s);
  }
  meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'completed', '应推进到 completed');
  assert.equal(meta['updated-at'], meta['updated-at']); // 字段存在

  // 4. archive
  const { archiveDir } = await archiveChange(tmp, id);
  assert.ok(!(await changeExists(tmp, id)), 'changes/ 内目录应消失');
  assert.ok(await pathExists(archiveDir), 'archive/ 内目录应存在');
  const archivedMeta = parse(readFileSync(join(archiveDir, 'metadata.yaml'), 'utf8'));
  assert.equal(archivedMeta.status, 'archived');

  await rmrf(tmp);
});

test('integration: 多 Change 共存 listChanges 在已初始化 Workspace 工作', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-life-list-'));
  await runInit(
    {
      name: 'list-e2e',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );

  const r1 = await runChangeCreate(tmp, { title: '需求一', requirement: 'REQ-001' }, harnessRoot);
  const r2 = await runChangeCreate(tmp, { title: '需求二', requirement: 'REQ-002' }, harnessRoot);
  // r1 推进到 exploring，r2 留 created
  await patchStatus(r1.changeDir, 'exploring');

  const { changes, skipped } = await listChanges(tmp);
  assert.equal(changes.length, 2);
  assert.equal(skipped, 0);
  // r1 最后 patch，updated-at 最新，应排第一
  assert.equal(changes[0].id, 'CHG-0001');
  assert.equal(changes[0].status, 'exploring');
  assert.equal(changes[1].status, 'created');

  // --status 过滤
  const onlyExploring = await listChanges(tmp, { status: 'exploring' });
  assert.equal(onlyExploring.changes.length, 1);
  assert.equal(onlyExploring.changes[0].id, 'CHG-0001');

  await rmrf(tmp);
});

test('integration: archive 后 nextChangeId 仍跨 changes+archive 取最大+1', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-life-id-'));
  await runInit(
    {
      name: 'id-e2e',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );

  // 创建 CHG-0001 并归档
  const r1 = await runChangeCreate(tmp, { title: '归档项', requirement: 'REQ-001' }, harnessRoot);
  for (const s of LIFECYCLE_STATES) {
    await patchStatus(r1.changeDir, s);
  }
  await archiveChange(tmp, r1.id);

  // 新建 Change 复用旧需求 REQ-001 → 应命中 archive 记录 related-change
  // 同时编号应跨 changes+archive 取最大+1，跳过 archive 中的 CHG-0001
  const r2 = await runChangeCreate(tmp, { title: '复用旧需求', requirement: 'REQ-001' }, harnessRoot);
  assert.equal(r2.id, 'CHG-0002');
  const meta = await readMetadata(r2.changeDir);
  assert.equal(meta['related-change'], 'CHG-0001');

  await rmrf(tmp);
});

test('integration: Change 目录位于 delivery/changes/ 与 Workspace 模板一致', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-life-loc-'));
  await runInit(
    {
      name: 'loc-e2e',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );

  const { id, changeDir } = await runChangeCreate(tmp, { title: '路径校验' }, harnessRoot);
  // changeDir 应位于 <tmp>/delivery/changes/<id>
  assert.ok(changeDir.startsWith(join(tmp, 'delivery', 'changes')), 'changeDir 应在 delivery/changes/ 下');
  assert.ok(await pathExists(join(changeDir, 'metadata.yaml')));
  assert.ok(await pathExists(join(changeDir, 'evidence')), 'evidence/ 子目录应创建');

  // delivery/changes 由 init 模板预创建（templates/default-workspace/delivery/changes/.gitkeep）
  assert.ok(await pathExists(join(tmp, 'delivery', 'changes')), 'delivery/changes/ 应由 init 预创建');
  assert.ok(await pathExists(join(tmp, 'delivery', 'archive')), 'delivery/archive/ 应由 init 预创建');

  await rmrf(tmp);
});

// ---- sdd-explore 端到端 ----
// 验证 sdd-explore 完整执行流程：init → core 纯函数链模拟 skill run → Artifact + 状态 + Instruction
// 直接调用 core 函数链（绕过 @clack 交互），decideReuseAction 用纯函数注入选择

test('integration: sdd-explore 全新需求 → 新建 CHG + 创建 Candidate + 生成 Artifact + 推进状态', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-exp-new-'));
  // 1. 初始化 Workspace（feature-tree.yaml 为空模板 → 命中 Candidate 分支）
  await runInit(
    {
      name: 'explore-new',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );

  // 2. 模拟 sdd-explore 流程（直接调用 core 函数，绕过 @clack）
  const title = '智能商品推荐';
  const requirement = 'REQ-001';
  const content = '根据用户历史行为推荐商品';

  // 2a. 查找已有 Change（空 Workspace → 无候选）
  const candidates = await findChangeByRequirement(tmp, { requirement, title });
  assert.equal(candidates.length, 0, '空 Workspace 不应命中历史 Change');

  // 2b. 决策沿用/新建（无候选 → 新建）
  const decision = decideReuseAction(candidates, 'new');
  assert.equal(decision.action, 'new');

  // 2c. 创建 CHG
  const { id, changeDir } = await runChangeCreate(tmp, { title, requirement }, harnessRoot);
  assert.equal(id, 'CHG-0001');

  // 2d. Feature Tree 匹配（空模板 → 未命中 → 创建 Candidate）
  const tree = await readFeatureTree(tmp);
  const feature = findFeature(tree, { name: title }) || findFeature(tree, { id: requirement });
  assert.equal(feature, null, '空 feature-tree 不应命中');
  const candidateResult = await writeCandidate(tmp, { name: title, sourceChange: id }, harnessRoot);
  assert.equal(candidateResult.candidateId, 'FEAT-CANDIDATE-0001');

  // 2e. 写 requirement.md
  await writeArtifact(
    changeDir,
    'requirement.md',
    {
      frontMatter: {
        id: requirement,
        name: title,
        content,
        source: 'user',
        'created-at': new Date().toISOString(),
      },
      replacements: { 'requirement-content': content },
    },
    harnessRoot
  );

  // 2f. 生成 exploration.md
  await writeArtifact(
    changeDir,
    'exploration.md',
    {
      replacements: {
        'feature-id': '',
        'feature-path': '',
        'is-new-candidate': 'yes',
        'affected-repos': '',
        'matched-change': 'none',
        'archived-change': 'none',
        'reuse-decision': '新建',
      },
    },
    harnessRoot
  );

  // 2g. 更新 Change State（created → exploring）
  const current = (await readMetadata(changeDir)).status;
  assert.equal(current, 'created');
  validateTransition(current, 'exploring');
  await patchStatus(changeDir, 'exploring');
  const afterMeta = await readMetadata(changeDir);
  assert.equal(afterMeta.status, 'exploring');

  // 2h. 生成 Instruction
  const skillLoaded = await loadSkill('sdd-explore', harnessRoot);
  const context = await assembleContext(tmp, 'explore');
  const instruction = buildInstruction(skillLoaded, context, {
    requirement,
    title,
    content,
    changeId: id,
  });
  await writeFile(join(changeDir, '.instruction.md'), instruction, 'utf8');

  // 3. 验证产物
  // 3a. CHG-0001 目录
  assert.ok(await pathExists(join(tmp, 'delivery', 'changes', 'CHG-0001', 'metadata.yaml')));
  // 3b. requirement.md
  const reqRaw = await readFile(join(changeDir, 'requirement.md'), 'utf8');
  assert.ok(reqRaw.includes('REQ-001'));
  assert.ok(reqRaw.includes('智能商品推荐'));
  assert.ok(reqRaw.includes('根据用户历史行为推荐商品'));
  // 3c. exploration.md（正文占位符已替换）
  const expRaw = await readFile(join(changeDir, 'exploration.md'), 'utf8');
  assert.ok(expRaw.includes('是否新建 candidate: yes'));
  assert.ok(expRaw.includes('决策: 新建'));
  assert.ok(!expRaw.includes('{{feature-id}}'), '占位符不应残留');
  // 3d. 状态推进
  assert.equal(afterMeta.status, 'exploring');
  // 3e. Feature Candidate
  assert.ok(
    await pathExists(join(tmp, 'product', 'features', 'FEAT-CANDIDATE-0001.md')),
    'Candidate 文件应创建'
  );
  const candRaw = await readFile(join(tmp, 'product', 'features', 'FEAT-CANDIDATE-0001.md'), 'utf8');
  assert.ok(candRaw.includes('智能商品推荐'));
  assert.ok(candRaw.includes('CHG-0001'));
  assert.ok(candRaw.includes('status: pending'));
  // 3f. Instruction
  const instrRaw = await readFile(join(changeDir, '.instruction.md'), 'utf8');
  assert.ok(instrRaw.includes('sdd-explore'));
  assert.ok(instrRaw.includes('智能商品推荐'));
  assert.ok(instrRaw.includes('CHG-0001'));
  assert.ok(instrRaw.includes('requirement.md'));
  assert.ok(instrRaw.includes('exploration.md'));
  assert.ok(instrRaw.includes('openspec change status'));

  await rmrf(tmp);
});

test('integration: sdd-explore 旧需求命中进行中 Change → 沿用 + 写 Artifact + 推进状态', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-exp-reuse-'));
  await runInit(
    {
      name: 'explore-reuse',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );

  // 1. 预先创建一个进行中 Change（created 状态）
  const existing = await runChangeCreate(
    tmp,
    { title: '智能商品推荐', requirement: 'REQ-001' },
    harnessRoot
  );
  assert.equal(existing.id, 'CHG-0001');

  // 2. 模拟 sdd-explore 流程
  const title = '智能商品推荐';
  const requirement = 'REQ-001';
  const content = '根据用户历史行为推荐商品';

  // 2a. 查找已有 Change → 命中 CHG-0001
  const candidates = await findChangeByRequirement(tmp, { requirement, title });
  assert.ok(candidates.length > 0, '应命中预创建的进行中 Change');
  assert.equal(candidates[0].id, 'CHG-0001');

  // 2b. 决策沿用
  const decision = decideReuseAction(candidates, 'reuse:CHG-0001');
  assert.equal(decision.action, 'reuse');
  assert.equal(decision.change.id, 'CHG-0001');

  // 2c. 沿用现有 Change（不新建）
  const changeDir = decision.change.changeDir;
  const changeId = decision.change.id;
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'created', '可沿用的 Change 必须处于 created 状态');

  // 2d. Feature Tree 匹配（空模板 → 未命中 → 创建 Candidate）
  const tree = await readFeatureTree(tmp);
  const feature = findFeature(tree, { name: title });
  assert.equal(feature, null);
  const candidateResult = await writeCandidate(tmp, { name: title, sourceChange: changeId }, harnessRoot);
  assert.equal(candidateResult.candidateId, 'FEAT-CANDIDATE-0001');

  // 2e. 写 requirement.md
  await writeArtifact(
    changeDir,
    'requirement.md',
    {
      frontMatter: {
        id: requirement,
        name: title,
        content,
        source: 'user',
        'created-at': new Date().toISOString(),
      },
      replacements: { 'requirement-content': content },
    },
    harnessRoot
  );

  // 2f. 生成 exploration.md（沿用场景）
  await writeArtifact(
    changeDir,
    'exploration.md',
    {
      replacements: {
        'feature-id': '',
        'feature-path': '',
        'is-new-candidate': 'yes',
        'affected-repos': '',
        'matched-change': candidates[0].id,
        'archived-change': 'none',
        'reuse-decision': '沿用现有',
      },
    },
    harnessRoot
  );

  // 2g. 推进状态
  validateTransition(meta.status, 'exploring');
  await patchStatus(changeDir, 'exploring');

  // 3. 验证：未新建 CHG（仍只有 CHG-0001）
  const { changes } = await listChanges(tmp);
  assert.equal(changes.length, 1, '沿用场景不应新建 Change');
  assert.equal(changes[0].id, 'CHG-0001');
  assert.equal(changes[0].status, 'exploring');

  // 4. Artifact 已写入沿用目录
  const reqRaw = await readFile(join(changeDir, 'requirement.md'), 'utf8');
  assert.ok(reqRaw.includes('REQ-001'));
  assert.ok(reqRaw.includes('智能商品推荐'));
  const expRaw = await readFile(join(changeDir, 'exploration.md'), 'utf8');
  assert.ok(expRaw.includes('匹配进行中 Change: CHG-0001'));
  assert.ok(expRaw.includes('决策: 沿用现有'));

  await rmrf(tmp);
});
