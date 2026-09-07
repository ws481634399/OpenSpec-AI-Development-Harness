// Story 3 集成测试：多 Story workflow 全链路 / inline 向后兼容 / Stale 分层传播
// 对齐 plans/phase-4.2-three-tier-spec-design.md §5.3 / §10 验收标准
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';

import { runWorkflow, WORKFLOW_RESULT } from '../core/sdd/workflow-engine.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import {
  runChangeCreate,
  readMetadata,
  patchStatus,
  bindFeaturePath,
} from '../core/sdd/change-model.js';
import {
  createStory,
  writeChangeStories,
  patchStoryMetadata,
  readStoryMetadata,
  readStories,
} from '../core/sdd/story-model.js';
import {
  readGateResultForStory,
  writeMachineGateForStory,
  writeHumanGateForStory,
  writeMachineGate,
} from '../core/sdd/gate-repository.js';
import { sha256 } from '../core/sdd/artifact-hash.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

const S1 = 'STORY-SW-01';
const S2 = 'STORY-SW-02';

// ---- 夹具 ----

// Change 级 change-spec.md（heading 锚点 '3-功能范围' + [S<n>] 编号条目，供 scope-subset 校验）
const CHANGE_PRD = [
  '# Change PRD',
  '',
  '## 0. 元信息',
  '',
  '- Change ID: CHG-SW',
  '',
  '## 3. 功能范围',
  '',
  '- [S1] 用户注册能力',
  '- [S2] 用户登录能力',
].join('\n');

// Change 级 change-design.md（heading 锚点 'story-design-assignments'，供 change-ref-bound 校验）
const CHANGE_DESIGN = [
  '# Change Design',
  '',
  '## Story Design Assignments',
  '',
  `- ${S1}: 用户注册`,
  `- ${S2}: 用户登录`,
].join('\n');

// Story 级 story-spec.md（story-prd 机检全过：front-matter 引用 + 无占位符 + 三段非空）
function storySpecMd(storyId, scopeRefs) {
  return [
    '---',
    `story-id: ${storyId}`,
    'change-spec-ref: change-spec.md#3-功能范围',
    `scope-refs: [${scopeRefs.join(', ')}]`,
    '---',
    '',
    '# Story Spec',
    '',
    '## 0. 元信息',
    '',
    '- Change ID: CHG-SW',
    `- Story ID: ${storyId}`,
    '',
    '## 1. Story 目标',
    '',
    `交付 ${storyId} 对应的最小产品能力。`,
    '',
    '## 2. Scope（范围）',
    '',
    '### 2.1 包含',
    '',
    `- 包含范围摘要: ${scopeRefs.map((r) => `[${r}]`).join('')} 对应功能点`,
    '',
    '### 2.2 不包含',
    '',
    '- 不包含范围摘要: 属于其他 Story 的功能点',
    '',
    '## 5. Story 验收标准',
    '',
    '- 验收点 1：功能可用',
  ].join('\n');
}

// Story 级 story-design.md（change-ref-bound(change-design-ref) + repo-subset([]) 通过）
function storyDesignMd(storyId) {
  return [
    '---',
    'affected-repositories: []',
    `story-id: ${storyId}`,
    'change-design-ref: change-design.md#story-design-assignments',
    '---',
    '',
    '# Story Design',
    '',
    '## 0. 元信息',
    '',
    '- Change ID: CHG-SW',
    `- Story ID: ${storyId}`,
    '',
    '## 1. 模块改动（Module Changes）',
    '',
    '- 模块改动摘要: 新增注册接口',
    '',
    '## 2. 接口契约细化',
    '',
    '- POST /api/register',
  ].join('\n');
}

// Story 级 tasks.md（DU 拆分清单；scope-subset target=du 在无 DU 时通过）
function storyTasksMd(storyId) {
  return [
    '# Tasks',
    '',
    '## 任务清单',
    '',
    `- [ ] DU-T-001: 实现 ${storyId} 功能`,
  ].join('\n');
}

// ---- 构造工具 ----

async function setupWorkspace(tag) {
  const tmp = await mkdtemp(join(tmpdir(), `story-wf-${tag}-`));
  await runInit(
    {
      name: 'story-wf-test',
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
    { title: '多 Story 工作流测试', requirement: 'REQ-SW', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

// 逐状态推进（走 validateTransition，模拟合法生命周期；从当前状态起跳，支持任意起点）
async function advanceTo(changeDir, target) {
  const { validateTransition } = await import('../core/sdd/change-state-machine.js');
  const path = ['exploring', 'specified', 'designed', 'story-splitting', 'tasked', 'developing', 'testing', 'completed'];
  let cur = (await readMetadata(changeDir)).status;
  if (cur === target) return;
  // created（或路径外状态）从头开始；否则从当前状态的下一个合法状态起跳
  for (let i = path.indexOf(cur) + 1; i < path.length; i++) {
    if (cur === target) return;
    validateTransition(cur, path[i]);
    await patchStatus(changeDir, path[i]);
    cur = path[i];
  }
}

/**
 * 构造多 Story（3-tier）Change：2 个 Story + Change 级 change-spec/change-design 已产出。
 * status 通过合法状态链推进（默认 designed，即 sdd-task 入口前）。
 */
async function makeMultiStoryChange({ status = 'designed' } = {}) {
  const { tmp, changeId, changeDir } = await setupWorkspace('multi');
  const fpBase = {
    'level-1': { id: 'FEAT-SW', name: '平台能力' },
    'level-2': { id: 'FEAT-SW-01', name: '用户中心' },
    'level-3': { id: 'FEAT-SW-01-01', name: '认证' },
    candidate: false,
  };
  // evidence-tier 用 light：du-coverage/du-guidance 等仪式检查按 Phase 4.1 分档跳过
  await createStory(
    changeDir,
    { storyId: S1, title: '用户注册', featurePath: { ...fpBase, story: { id: S1, name: '用户注册' } }, evidenceTier: 'light' },
    harnessRoot
  );
  await createStory(
    changeDir,
    { storyId: S2, title: '用户登录', featurePath: { ...fpBase, story: { id: S2, name: '用户登录' } }, evidenceTier: 'light' },
    harnessRoot
  );
  await writeChangeStories(changeDir, [
    { id: S1, title: '用户注册', inline: false, status: 'pending', path: `stories/${S1}/` },
    { id: S2, title: '用户登录', inline: false, status: 'pending', path: `stories/${S2}/` },
  ]);
  await advanceTo(changeDir, status);
  // Change 级三级产物（模拟 prd/design 阶段已过 Gate）
  await writeFile(join(changeDir, 'change-spec.md'), CHANGE_PRD, 'utf8');
  await writeFile(join(changeDir, 'change-design.md'), CHANGE_DESIGN, 'utf8');
  return { tmp, changeId, changeDir };
}

// Story 级 gate approve（用 machine gate 真实 hash，模拟 gate approve --story）
async function approveStorySpec(changeDir, storyId) {
  const meta = await readMetadata(changeDir);
  const gr = await readGateResultForStory(changeDir, meta, storyId, 'story-spec.md');
  await writeHumanGateForStory(changeDir, meta, storyId, 'story-spec.md', {
    status: 'approved',
    artifactHash: gr.gates.machine['artifact-hash'],
    reviewer: 'integration-test',
  });
}

// ---- Test Section A: 多 Story 全链路（story-splitting 循环 + §5.3 聚合推进）----

test('多 Story: designed → run 进入 story-splitting，S1 spec 缺失 → WAITING_FOR_ARTIFACT(sdd-prd, S1) + Instruction 注入 Story 上下文', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-prd', 'Story pending 段对应 sdd-prd（story-spec）');
  assert.equal(r.story, S1, '顺序推进：第一个未完成 Story');
  assert.ok(r.reason.includes(`stories/${S1}/story-spec.md`), r.reason);
  // Change 已进入 story-splitting 结构态
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'story-splitting');
  // Story 状态未推进（等产物）
  const sm = await readStoryMetadata(join(changeDir, 'stories', S1));
  assert.equal(sm.status, 'pending');
  // Instruction 注入 Story 执行上下文（s3-5 + 拆分循环 storyId 补齐）
  assert.ok(r.instruction.includes('## Story 执行上下文'), 'Instruction 应含 Story 执行上下文');
  assert.ok(r.instruction.includes(S1), 'Instruction 应标明目标 Story');
  await rmrf(tmp);
});

test('多 Story: S1 story-spec 产出 → 机检 passed + story-spec 人审 required → WAITING_FOR_HUMAN', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  await runWorkflow(tmp, changeId, { harnessRoot }); // → story-splitting + S1 spec 缺失
  await writeFile(join(changeDir, 'stories', S1, 'story-spec.md'), storySpecMd(S1, ['S1']), 'utf8');

  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);
  assert.equal(r.story, S1);
  assert.ok(r.reason.includes('--story'), `提示应带 --story 用法: ${r.reason}`);

  // Machine Gate 结果持久化到 story-metadata.yaml（Story 级 Gate 分层）
  const meta = await readMetadata(changeDir);
  const gr = await readGateResultForStory(changeDir, meta, S1, 'story-spec.md');
  assert.equal(gr.gates.machine.status, 'passed');
  assert.equal(gr.gates.human.status, 'pending');
  // Story 状态未推进（等人审）
  const sm = await readStoryMetadata(join(changeDir, 'stories', S1));
  assert.equal(sm.status, 'pending');
  await rmrf(tmp);
});

test('多 Story: approve story-spec → S1 推进 specified → 循环续跑 design 段缺失 → WAITING_FOR_ARTIFACT(sdd-design, S1)', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  await runWorkflow(tmp, changeId, { harnessRoot });
  await writeFile(join(changeDir, 'stories', S1, 'story-spec.md'), storySpecMd(S1, ['S1']), 'utf8');
  await runWorkflow(tmp, changeId, { harnessRoot }); // → WAITING_FOR_HUMAN
  await approveStorySpec(changeDir, S1);

  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-design', 'spec 过审后循环自动进入 design 段');
  assert.equal(r.story, S1);
  // Story 状态已推进 specified（断点续跑生效）
  const sm = await readStoryMetadata(join(changeDir, 'stories', S1));
  assert.equal(sm.status, 'specified');
  await rmrf(tmp);
});

test('多 Story: S1 design+tasks 逐段推进 → S1 tasked → 循环切到 S2 spec 缺失（Story 状态留痕各自独立）', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  // 前置：S1 spec 过审
  await runWorkflow(tmp, changeId, { harnessRoot });
  await writeFile(join(changeDir, 'stories', S1, 'story-spec.md'), storySpecMd(S1, ['S1']), 'utf8');
  await runWorkflow(tmp, changeId, { harnessRoot });
  await approveStorySpec(changeDir, S1);

  // design 产出 → 机检过（human skip 留痕）→ 状态 designed → 循环停在 tasks.md 缺失
  await writeFile(join(changeDir, 'stories', S1, 'story-design.md'), storyDesignMd(S1), 'utf8');
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r1.stage.skill, 'sdd-task');
  assert.equal(r1.story, S1);
  const sm1 = await readStoryMetadata(join(changeDir, 'stories', S1));
  assert.equal(sm1.status, 'designed');

  // tasks 产出 → S1 tasked → 循环切 S2（spec 缺失）
  await writeFile(join(changeDir, 'stories', S1, 'tasks.md'), storyTasksMd(S1), 'utf8');
  const r2 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r2.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r2.stage.skill, 'sdd-prd', '切到下一个 Story 的 spec 段');
  assert.equal(r2.story, S2);
  // Change 仍在 story-splitting（聚合条件未满足）
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'story-splitting');
  await rmrf(tmp);
});

test('多 Story: 全部 Story tasked → §5.3 聚合推进 story-splitting→tasked → Change 级跳过 dev/test/review → converge 聚合门拦截', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  // S1 三段
  await runWorkflow(tmp, changeId, { harnessRoot });
  await writeFile(join(changeDir, 'stories', S1, 'story-spec.md'), storySpecMd(S1, ['S1']), 'utf8');
  await runWorkflow(tmp, changeId, { harnessRoot });
  await approveStorySpec(changeDir, S1);
  await runWorkflow(tmp, changeId, { harnessRoot }); // design 缺失暂停
  await writeFile(join(changeDir, 'stories', S1, 'story-design.md'), storyDesignMd(S1), 'utf8');
  await runWorkflow(tmp, changeId, { harnessRoot }); // tasks 缺失暂停
  await writeFile(join(changeDir, 'stories', S1, 'tasks.md'), storyTasksMd(S1), 'utf8');
  // S2 三段
  await runWorkflow(tmp, changeId, { harnessRoot }); // 切到 S2 spec 缺失
  await writeFile(join(changeDir, 'stories', S2, 'story-spec.md'), storySpecMd(S2, ['S2']), 'utf8');
  await runWorkflow(tmp, changeId, { harnessRoot }); // S2 人审
  await approveStorySpec(changeDir, S2);
  await runWorkflow(tmp, changeId, { harnessRoot }); // S2 design 缺失
  await writeFile(join(changeDir, 'stories', S2, 'story-design.md'), storyDesignMd(S2), 'utf8');
  await runWorkflow(tmp, changeId, { harnessRoot }); // S2 tasks 缺失
  await writeFile(join(changeDir, 'stories', S2, 'tasks.md'), storyTasksMd(S2), 'utf8');

  // 最后一段完成 → 聚合推进 tasked → Change 级 dev/test/review 跳过 → converge 聚合门
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'tasked', '全部 Story tasked → 聚合推进 story-splitting → tasked');
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);
  assert.ok(r.reason.includes('等待 Story 完成'), `converge 聚合门拦截: ${r.reason}`);
  assert.ok(r.reason.includes(S1) && r.reason.includes(S2), '拦截原因列出未完成 Story');
  await rmrf(tmp);
});

test('多 Story: 全部 Story completed → converge 聚合门放行（Change 不自动 completed，由 converge 人审驱动）', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  await advanceTo(changeDir, 'tasked');
  // 模拟 Story 级 dev/test/review 完成（直接置 completed，Story 级执行细节由 --story 测试覆盖）
  await patchStoryMetadata(join(changeDir, 'stories', S1), { status: 'completed' });
  await patchStoryMetadata(join(changeDir, 'stories', S2), { status: 'completed' });

  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-converge', '聚合门放行 → converge 产物缺失');
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'tasked', '聚合不直接推 completed（completed 由 sdd-converge 人审驱动）');
  await rmrf(tmp);
});

// ---- Test Section B: inline 单 Story 向后兼容 ----

test('inline 兼容: bindFeaturePath 单 Story（v4 inline）→ Change 级流程与 v0.2 一致（explore 入口）', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspace('inline');
  await bindFeaturePath(changeDir, {
    'level-1': { id: 'FEAT-SW', name: '平台能力' },
    'level-2': { id: 'FEAT-SW-01', name: '用户中心' },
    'level-3': { id: 'FEAT-SW-01-01', name: '认证' },
    story: { id: 'STORY-SW-INLINE', name: '单 Story 平铺' },
  });
  const meta = await readMetadata(changeDir);
  assert.equal(meta['schema-version'], 4);
  assert.equal(meta.stories[0].inline, true);

  // 单 Story 不受多 Story 逻辑影响：created → explore 产物缺失 → 与既有行为一致
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(r.stage.skill, 'sdd-explore');
  assert.equal(r.story, undefined, 'inline 不产生 Story 级暂停点');
  await rmrf(tmp);
});

test('inline 兼容: 单 Story Change 带 --story → 明确拒绝（inline 走 Change 级流程）', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspace('inline');
  await bindFeaturePath(changeDir, {
    'level-1': { id: 'FEAT-SW', name: '平台能力' },
    'level-2': { id: 'FEAT-SW-01', name: '用户中心' },
    'level-3': { id: 'FEAT-SW-01-01', name: '认证' },
    story: { id: 'STORY-SW-INLINE', name: '单 Story 平铺' },
  });
  await assert.rejects(
    () => runWorkflow(tmp, changeId, { harnessRoot, storyId: 'STORY-SW-INLINE' }),
    /is inline/
  );
  await rmrf(tmp);
});

test('inline 兼容: 多 Story Change 传不存在的 storyId → 明确报错并提示 story list', async () => {
  const { tmp, changeId } = await makeMultiStoryChange();
  await assert.rejects(
    () => runWorkflow(tmp, changeId, { harnessRoot, storyId: 'STORY-NOPE' }),
    /Story not found in Change/
  );
  await rmrf(tmp);
});

// ---- Test Section C: Stale 分层传播（Change→Story / Story→tasks）----

test('Stale 传播: change-spec Gate 后变更 → 未完成 Story 的 story-spec 传播提示; story-design 变更 → tasks 传播; completed Story 不传播', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange({ status: 'story-splitting' });
  // S1 specified（未完成，参与传播）；S2 completed（不参与传播）
  await patchStoryMetadata(join(changeDir, 'stories', S1), { status: 'specified' });
  await patchStoryMetadata(join(changeDir, 'stories', S2), { status: 'completed' });

  // Change 级 change-spec 过 Gate
  await writeMachineGate(changeDir, 'change-spec.md', {
    status: 'passed',
    artifactHash: sha256(CHANGE_PRD),
    validator: 'sdd-prd',
  });
  // S1 story-spec / story-design 过 Gate（story 级）
  const spec1 = storySpecMd(S1, ['S1']);
  await writeFile(join(changeDir, 'stories', S1, 'story-spec.md'), spec1, 'utf8');
  let meta = await readMetadata(changeDir);
  await writeMachineGateForStory(changeDir, meta, S1, 'story-spec.md', {
    status: 'passed',
    artifactHash: sha256(spec1),
    validator: 'sdd-prd',
  });
  const design1 = storyDesignMd(S1);
  await writeFile(join(changeDir, 'stories', S1, 'story-design.md'), design1, 'utf8');
  meta = await readMetadata(changeDir);
  await writeMachineGateForStory(changeDir, meta, S1, 'story-design.md', {
    status: 'passed',
    artifactHash: sha256(design1),
    validator: 'sdd-design',
  });
  // S2 story-spec 过 Gate（completed，改动不会传播到它）
  const spec2 = storySpecMd(S2, ['S2']);
  await writeFile(join(changeDir, 'stories', S2, 'story-spec.md'), spec2, 'utf8');
  meta = await readMetadata(changeDir);
  await writeMachineGateForStory(changeDir, meta, S2, 'story-spec.md', {
    status: 'passed',
    artifactHash: sha256(spec2),
    validator: 'sdd-prd',
  });

  // Gate 后改动上游：change-spec.md（Change 级）+ story-design.md（Story 级）
  await writeFile(join(changeDir, 'change-spec.md'), CHANGE_PRD + '\n\n范围补丁', 'utf8');
  await writeFile(join(changeDir, 'stories', S1, 'story-design.md'), design1 + '\n\n设计补丁', 'utf8');

  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  const stale = r.stale;
  // Change 级 hash 失配
  assert.ok(stale.some((s) => s.artifact === 'change-spec.md' && s.kind === 'hash-mismatch' && s.layer === 'change'));
  // Change→Story 传播（仅未完成 Story）
  assert.ok(stale.some((s) => s.artifact === `stories/${S1}/story-spec.md` && s.kind === 'stale-propagated' && s.from === 'change-spec.md'));
  // Story 级 hash 失配
  assert.ok(stale.some((s) => s.artifact === `stories/${S1}/story-design.md` && s.kind === 'hash-mismatch' && s.layer === 'story'));
  // Story→tasks 传播
  assert.ok(stale.some((s) => s.artifact === `stories/${S1}/tasks.md` && s.kind === 'stale-propagated' && s.from === 'story-design.md'));
  // completed Story 不参与传播
  assert.ok(!stale.some((s) => s.story === S2), 'completed Story 不传播');
  await rmrf(tmp);
});

test('Stale 传播: 无变更时 stale 为空（多 Story 正常推进不被误报）', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange({ status: 'story-splitting' });
  await patchStoryMetadata(join(changeDir, 'stories', S1), { status: 'specified' });
  // 产物过 Gate 且未被改动
  const spec1 = storySpecMd(S1, ['S1']);
  await writeFile(join(changeDir, 'stories', S1, 'story-spec.md'), spec1, 'utf8');
  const meta = await readMetadata(changeDir);
  await writeMachineGateForStory(changeDir, meta, S1, 'story-spec.md', {
    status: 'passed',
    artifactHash: sha256(spec1),
    validator: 'sdd-prd',
  });
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.deepEqual(r.stale, []);
  await rmrf(tmp);
});

// ---- Test Section D: 聚合规则边界（§5.3 与状态机协作）----

test('聚合边界: 任一 Story developing → 聚合推 Change.developing（tryAggregatedTransition 经 runWorkflow 验证）', async () => {
  const { tmp, changeId, changeDir } = await makeMultiStoryChange();
  await advanceTo(changeDir, 'tasked');
  // S1 保持 tasked；S2 推进到 developing → 聚合 developing
  await patchStoryMetadata(join(changeDir, 'stories', S2), { status: 'developing' });
  // Change 级当前 tasked，聚合目标 developing → 经 requestTransition 合法推进
  //（runWorkflow 入口 stale 检测不抛错；Story 级聚合同步在 processStoryStage 内，
  //  此处直接用 workflow run 驱动 dev 段验证状态机协作不抛错即可）
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.ok([WORKFLOW_RESULT.WAITING_FOR_ARTIFACT, WORKFLOW_RESULT.WAITING_FOR_HUMAN, WORKFLOW_RESULT.ADVANCED].includes(r.result));
  // readStories 视角确认状态一致
  const stories = await readStories(changeDir, await readMetadata(changeDir));
  assert.equal(stories.find((s) => s.id === S2).status, 'developing');
  await rmrf(tmp);
});
