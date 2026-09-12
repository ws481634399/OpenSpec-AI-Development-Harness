// 测试：ReviewQueue 待审批项扫描 + openspec approve 一键人审 CLI
//
// 覆盖：
// - pendingHumanDetail 纯函数（机检未过/人审通过/stale 三态）
// - listPendingReviews Change 级（spec.md 机检通过待人审 → 1 项；approve 后清零；机检失败 → 无）
// - listPendingReviews Story 级（story-spec 待人审 → story 项）
// - CLI e2e：openspec approve <id> --yes --reviewer <name> --json 审批并自动续跑
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { runWorkflow, WORKFLOW_RESULT } from '../core/sdd/workflow-engine.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, patchStatus } from '../core/sdd/change-model.js';
import { createStory, writeChangeStories } from '../core/sdd/story-model.js';
import { listPendingReviews, pendingHumanDetail } from '../core/sdd/review-queue.js';
import { writeHumanGate } from '../core/sdd/gate-repository.js';

const execFileAsync = promisify(execFile);
const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();
const BIN = join(harnessRoot, 'cli', 'openspec', 'bin', 'openspec.js');

const FULL_EXPLORATION =
  '# Exploration\n\n## 1. 需求要点\n- 需求内容\n\n## 2. Story 归属判定\n归属\n\n## 3. 证据评估\n证据充分\n\n## 4. 冲突点检测\n无冲突\n\n## 5. 待澄清问题\n无\n';

const FULL_SPEC =
  '# Spec\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 3. 范围\n### 3.1 包含\nA\n### 3.2 不包含\nB\n\n## 4. 业务规则\n规则\n\n## 5. 验收标准\n标准内容\n\n## 6. 成功指标\n本期不度量\n';

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'approve-'));
  await runInit(
    {
      name: 'approve-test',
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
    { title: '一键人审测试', requirement: 'REQ-AP', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

// ---- pendingHumanDetail 纯函数 ----

test('pendingHumanDetail: 机检未 passed → null；人审 approved+hash 匹配 → null；pending/stale → 待审批', () => {
  assert.equal(pendingHumanDetail({ gates: { machine: { status: 'failed' }, human: { status: 'pending' } } }), null);
  assert.equal(
    pendingHumanDetail({
      gates: { machine: { status: 'passed', 'artifact-hash': 'h1' }, human: { status: 'approved', 'artifact-hash': 'h1' } },
    }),
    null
  );
  const pending = pendingHumanDetail({
    gates: { machine: { status: 'passed', 'artifact-hash': 'h1', warnings: ['w1'] }, human: { status: 'pending' } },
  });
  assert.ok(pending);
  assert.equal(pending.humanStatus, 'pending');
  assert.equal(pending.stale, false);
  assert.equal(pending.machineHash, 'h1');
  assert.deepEqual(pending.warnings, ['w1']);

  const stale = pendingHumanDetail({
    gates: { machine: { status: 'passed', 'artifact-hash': 'h2' }, human: { status: 'approved', 'artifact-hash': 'h1' } },
  });
  assert.ok(stale);
  assert.equal(stale.stale, true);
});

// ---- listPendingReviews Change 级 ----

test('listPendingReviews: spec 机检通过待人审 → 1 个 change 项；approve 后清零', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  await writeFile(join(changeDir, 'spec.md'), FULL_SPEC, 'utf8');

  // 第一次 run：explore 免人审自动推进 → prd 机检通过 → WAITING_FOR_HUMAN
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);

  const items = await listPendingReviews(tmp, changeId, { harnessRoot });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'change');
  assert.equal(items[0].gate, 'prd');
  assert.equal(items[0].artifact, 'spec.md');
  assert.equal(items[0].humanStatus, 'pending');

  // 模拟 approve：写入 human gate（与机检 hash 一致）
  await writeHumanGate(changeDir, 'spec.md', {
    status: 'approved',
    reviewer: 'tester',
    artifactHash: items[0].machineHash,
  });
  const after = await listPendingReviews(tmp, changeId, { harnessRoot });
  assert.equal(after.length, 0, 'approve 后无待审批项');

  await rmrf(tmp);
});

test('listPendingReviews: 机检 failed 的产物不算待审批项', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  // spec 内容残缺（缺必填章节）→ 机检失败
  await writeFile(join(changeDir, 'spec.md'), '# Spec\n\n## 1. 背景\n残缺\n', 'utf8');
  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX);

  const items = await listPendingReviews(tmp, changeId, { harnessRoot });
  assert.equal(items.length, 0, '机检未通过 → 无待人审项');
  await rmrf(tmp);
});

// ---- listPendingReviews Story 级 ----

const S1 = 'STORY-AP-01';

// 中文名四级路径（与 fixture featurePath name 对齐）
const STORY_REL = '平台能力/用户中心/认证/用户注册';
const storyDir = (changeDir) => join(changeDir, ...STORY_REL.split('/'));

function storySpecMd(storyId) {
  return [
    '---',
    `story-id: ${storyId}`,
    'change-spec-ref: change-spec.md#3-功能范围',
    `scope-refs: [S1]`,
    '---',
    '',
    '# Story Spec',
    '',
    '## 0. 元信息',
    '',
    '- Change ID: CHG-AP',
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
    '- 包含范围摘要: [S1] 对应功能点',
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

test('listPendingReviews: 多 Story 的 story-spec 待人审 → story 项（含 storyId）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  const fp = {
    'level-1': { id: 'FEAT-AP', name: '平台能力' },
    'level-2': { id: 'FEAT-AP-01', name: '用户中心' },
    'level-3': { id: 'FEAT-AP-01-01', name: '认证' },
    candidate: false,
    story: { id: S1, name: '用户注册' },
  };
  await createStory(changeDir, { storyId: S1, title: '用户注册', featurePath: fp, evidenceTier: 'light' }, harnessRoot);
  await writeChangeStories(changeDir, [
    { id: S1, title: '用户注册', inline: false, status: 'pending', path: STORY_REL + '/' },
  ]);
  // Change 级 change-spec.md（story-prd gate 的 change-ref-bound / scope-subset blocking 检查依赖）
  await writeFile(
    join(changeDir, 'change-spec.md'),
    ['# Change Spec', '', '## 3. 功能范围', '', '- [S1] 用户注册能力', ''].join('\n'),
    'utf8'
  );
  // 直接置 story-splitting（队列扫描只读状态；workflow 从 story-splitting 进入 Story 循环）
  await patchStatus(changeDir, 'story-splitting');
  await writeFile(join(storyDir(changeDir), 'story-spec.md'), storySpecMd(S1), 'utf8');

  const r = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);
  assert.equal(r.story, S1);

  const items = await listPendingReviews(tmp, changeId, { harnessRoot });
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, 'story');
  assert.equal(items[0].storyId, S1);
  assert.equal(items[0].gate, 'prd');
  assert.equal(items[0].artifact, 'story-spec.md');

  await rmrf(tmp);
});

// ---- CLI e2e：openspec approve --yes --reviewer --json ----

test('CLI: openspec approve <id> --yes --reviewer → 审批 + 自动续跑到下一暂停点', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await writeFile(join(changeDir, 'exploration.md'), FULL_EXPLORATION, 'utf8');
  await writeFile(join(changeDir, 'spec.md'), FULL_SPEC, 'utf8');
  const r1 = await runWorkflow(tmp, changeId, { harnessRoot });
  assert.equal(r1.result, WORKFLOW_RESULT.WAITING_FOR_HUMAN);

  const { stdout } = await execFileAsync(
    process.execPath,
    [BIN, 'approve', changeId, '--yes', '--reviewer', 'tester', '--json'],
    { cwd: tmp }
  );
  const out = JSON.parse(stdout);
  assert.equal(out.change, changeId);
  assert.equal(out.approved.length, 1);
  assert.equal(out.approved[0].gate, 'prd');
  assert.equal(out.rejected.length, 0);
  // 自动续跑：prd 审批后推进 exploring → specified，design.md 缺失 → WAITING_FOR_ARTIFACT
  assert.equal(out.workflow.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(out.workflow.stage.skill, 'sdd-design');

  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, 'specified', '审批后状态自动推进到 specified');
  await rmrf(tmp);
});

test('CLI: openspec approve --yes 缺 --reviewer → 报错退出（审批人必须可审计）', async () => {
  const { tmp, changeId } = await setupChange();
  try {
    await execFileAsync(process.execPath, [BIN, 'approve', changeId, '--yes', '--json'], { cwd: tmp });
    assert.fail('应非零退出');
  } catch (e) {
    // --json 模式错误以 JSON 输出到 stdout
    const body = e.stdout || '';
    assert.match(body, /--reviewer/, body);
  }
  await rmrf(tmp);
});

test('CLI: openspec approve <id> --json 无待审批项 → 续跑 workflow 返回暂停点', async () => {
  const { tmp, changeId } = await setupChange();
  // 全新 Change：无产物，无待审批项 → 续跑 → WAITING_FOR_ARTIFACT(explore)
  const { stdout } = await execFileAsync(
    process.execPath,
    [BIN, 'approve', changeId, '--yes', '--reviewer', 'tester', '--json'],
    { cwd: tmp }
  );
  const out = JSON.parse(stdout);
  assert.equal(out.approved.length, 0);
  assert.equal(out.workflow.result, WORKFLOW_RESULT.WAITING_FOR_ARTIFACT);
  assert.equal(out.workflow.stage.skill, 'sdd-explore');
  await rmrf(tmp);
});
