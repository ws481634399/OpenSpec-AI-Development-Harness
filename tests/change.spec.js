// Unit tests: ChangeStateMachine / ChangeIdGenerator / ChangeModel / ChangeRepository / ChangeArchiver / RequirementModel
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, stat, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import {
  CHANGE_STATUSES,
  validateTransition,
  nextStatuses,
  isValidStatus,
} from '../core/sdd/change-state-machine.js';
import { nextChangeId } from '../core/sdd/change-id-generator.js';
import { runChangeCreate, readMetadata, patchMetadata, patchStatus } from '../core/sdd/change-model.js';
import { listChanges, showChange, findChangeByRequirement, changeExists } from '../core/sdd/change-repository.js';
import { archiveChange } from '../core/sdd/change-archiver.js';
import { parseRequirement, requirementId, isRequirementId } from '../core/sdd/requirement-model.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const pathExists = (p) => stat(p).then(() => true).catch(() => false);
const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

// ---- ChangeStateMachine ----

test('ChangeStateMachine: created→exploring 合法', () => {
  assert.equal(validateTransition('created', 'exploring'), true);
});

test('ChangeStateMachine: created→designed 报错（跳阶段）', () => {
  assert.throws(() => validateTransition('created', 'designed'), /Illegal transition.*Legal next: exploring/);
});

test('ChangeStateMachine: archived→任意 报错（终态）', () => {
  assert.throws(() => validateTransition('archived', 'completed'), /Illegal transition.*none/);
});

test('ChangeStateMachine: from===to 报错', () => {
  assert.throws(() => validateTransition('exploring', 'exploring'), /from === to/);
});

test('ChangeStateMachine: nextStatuses 终态返回空数组', () => {
  assert.deepEqual(nextStatuses('archived'), []);
});

test('ChangeStateMachine: nextStatuses 非终态返回单元素', () => {
  assert.deepEqual(nextStatuses('created'), ['exploring']);
});

test('ChangeStateMachine: isValidStatus 校验', () => {
  assert.equal(isValidStatus('created'), true);
  assert.equal(isValidStatus('unknown'), false);
});

test('ChangeStateMachine: CHANGE_STATUSES 含 10 态（Phase 4.2 + story-splitting）', () => {
  assert.equal(CHANGE_STATUSES.length, 10);
  assert.ok(CHANGE_STATUSES.includes('archived'));
  assert.ok(CHANGE_STATUSES.includes('story-splitting'));
});

// ---- ChangeIdGenerator ----

test('ChangeIdGenerator: 空 workspace → CHG-0001', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-id-empty-'));
  const id = await nextChangeId(tmp);
  assert.equal(id, 'CHG-0001');
  await rmrf(tmp);
});

test('ChangeIdGenerator: 已有 CHG-0003 → CHG-0004', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-id-3-'));
  await mkdir(join(tmp, 'delivery', 'changes', 'CHG-0003'), { recursive: true });
  const id = await nextChangeId(tmp);
  assert.equal(id, 'CHG-0004');
  await rmrf(tmp);
});

test('ChangeIdGenerator: archive+changes 跨目录取最大+1', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-id-cross-'));
  await mkdir(join(tmp, 'delivery', 'changes', 'CHG-0002'), { recursive: true });
  await mkdir(join(tmp, 'delivery', 'archive', 'CHG-0005'), { recursive: true });
  const id = await nextChangeId(tmp);
  assert.equal(id, 'CHG-0006');
  await rmrf(tmp);
});

// ---- ChangeModel.runChangeCreate ----

test('ChangeModel.runChangeCreate: 产出 CHG-0001 目录 + metadata + evidence/', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-create-'));
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: '测试需求', requirement: 'REQ-001', repositories: ['main'] },
    harnessRoot
  );
  assert.equal(id, 'CHG-0001');
  assert.ok(await pathExists(changeDir), 'changeDir 应存在');
  assert.ok(await pathExists(join(changeDir, 'metadata.yaml')), 'metadata.yaml 应存在');
  assert.ok(await pathExists(join(changeDir, 'evidence')), 'evidence/ 应存在');

  const meta = parse(readFileSync(join(changeDir, 'metadata.yaml'), 'utf8'));
  assert.equal(meta.id, 'CHG-0001');
  assert.equal(meta.title, '测试需求');
  assert.equal(meta.status, 'created');
  assert.equal(meta.requirement, 'REQ-001');
  assert.ok(meta['created-at'], 'created-at 应非空');
  assert.ok(meta['updated-at'], 'updated-at 应非空');
  assert.deepEqual(meta.repositories, ['main']);

  // 不预创建 requirement/exploration/prd/design/tasks/implementation/convergence
  for (const f of ['requirement.md', 'exploration.md', 'spec.md', 'design.md', 'tasks.md', 'implementation.md', 'convergence.md']) {
    assert.ok(!(await pathExists(join(changeDir, f))), `${f} 不应预创建`);
  }
  await rmrf(tmp);
});

test('ChangeModel.runChangeCreate: 连续 3 次递增 CHG-0001/0002/0003', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-create3-'));
  const r1 = await runChangeCreate(tmp, { title: 'a' }, harnessRoot);
  const r2 = await runChangeCreate(tmp, { title: 'b' }, harnessRoot);
  const r3 = await runChangeCreate(tmp, { title: 'c' }, harnessRoot);
  assert.equal(r1.id, 'CHG-0001');
  assert.equal(r2.id, 'CHG-0002');
  assert.equal(r3.id, 'CHG-0003');
  await rmrf(tmp);
});

test('ChangeModel.patchMetadata: 写入后 parse 回读一致 + 注释保留', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-patch-'));
  const { changeDir } = await runChangeCreate(tmp, { title: 'patch test' }, harnessRoot);
  await patchMetadata(changeDir, { status: 'exploring', summary: '测试摘要' });
  const raw = readFileSync(join(changeDir, 'metadata.yaml'), 'utf8');
  const meta = parse(raw);
  assert.equal(meta.status, 'exploring');
  assert.equal(meta.summary, '测试摘要');
  assert.ok(raw.includes('#'), '模板注释应保留');
  await rmrf(tmp);
});

test('ChangeModel.patchStatus: 推进状态 + 更新 updated-at', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-pstatus-'));
  const { changeDir } = await runChangeCreate(tmp, { title: 'status test' }, harnessRoot);
  const before = parse(readFileSync(join(changeDir, 'metadata.yaml'), 'utf8'));
  await patchStatus(changeDir, 'exploring');
  const after = parse(readFileSync(join(changeDir, 'metadata.yaml'), 'utf8'));
  assert.equal(after.status, 'exploring');
  assert.notEqual(after['updated-at'], before['updated-at'], 'updated-at 应更新');
  await rmrf(tmp);
});

// ---- ChangeModel.runChangeCreate 复用决策（§8.6）----

test('ChangeModel.runChangeCreate 复用: archive 有匹配 → related-change 写入', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-reuse-'));
  // 先创建并归档一个 CHG（模拟历史交付）
  const r1 = await runChangeCreate(tmp, { title: '历史需求', requirement: 'REQ-001' }, harnessRoot);
  // 推进到 completed 再 archive
  await patchStatus(r1.changeDir, 'exploring');
  await patchStatus(r1.changeDir, 'specified');
  await patchStatus(r1.changeDir, 'designed');
  await patchStatus(r1.changeDir, 'tasked');
  await patchStatus(r1.changeDir, 'developing');
  await patchStatus(r1.changeDir, 'testing');
  await patchStatus(r1.changeDir, 'completed');
  await archiveChange(tmp, r1.id);

  // 新建 Change，REQ-001 命中 archive
  const r2 = await runChangeCreate(tmp, { title: '历史需求', requirement: 'REQ-001' }, harnessRoot);
  const meta = parse(readFileSync(join(r2.changeDir, 'metadata.yaml'), 'utf8'));
  assert.equal(meta['related-change'], 'CHG-0001', 'related-change 应写入历史 CHG');
  await rmrf(tmp);
});

test('ChangeModel.runChangeCreate 复用: 无匹配 → related-change 留空', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-noreuse-'));
  const r = await runChangeCreate(tmp, { title: '全新需求', requirement: 'REQ-999' }, harnessRoot);
  const meta = parse(readFileSync(join(r.changeDir, 'metadata.yaml'), 'utf8'));
  assert.equal(meta['related-change'], '', 'related-change 应留空');
  await rmrf(tmp);
});

// ---- ChangeRepository ----

test('ChangeRepository.listChanges: 3 个 CHG 按 updated-at 倒序', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-list-'));
  const r1 = await runChangeCreate(tmp, { title: 'a' }, harnessRoot);
  const r2 = await runChangeCreate(tmp, { title: 'b' }, harnessRoot);
  const r3 = await runChangeCreate(tmp, { title: 'c' }, harnessRoot);
  // 给 r2 更新的 updated-at（后写 patch）
  await patchStatus(r2.changeDir, 'exploring');
  const { changes, skipped } = await listChanges(tmp);
  assert.equal(changes.length, 3);
  assert.equal(skipped, 0);
  // r2 最后 patch，updated-at 最新，应排第一
  assert.equal(changes[0].id, 'CHG-0002');
  await rmrf(tmp);
});

test('ChangeRepository.listChanges: --status 过滤', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-filter-'));
  const r1 = await runChangeCreate(tmp, { title: 'a' }, harnessRoot);
  const r2 = await runChangeCreate(tmp, { title: 'b' }, harnessRoot);
  await patchStatus(r2.changeDir, 'exploring');
  const { changes } = await listChanges(tmp, { status: 'exploring' });
  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, 'CHG-0002');
  await rmrf(tmp);
});

test('ChangeRepository.listChanges: 跳过损坏目录', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-corrupt-'));
  await runChangeCreate(tmp, { title: 'a' }, harnessRoot);
  // 创建一个损坏的 CHG 目录（无 metadata.yaml）
  await mkdir(join(tmp, 'delivery', 'changes', 'CHG-0099'), { recursive: true });
  const { changes, skipped } = await listChanges(tmp);
  assert.equal(changes.length, 1);
  assert.equal(skipped, 1);
  await rmrf(tmp);
});

test('ChangeRepository.showChange: 读 metadata + artifacts 清单', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-show-'));
  const { id } = await runChangeCreate(tmp, { title: 'show test' }, harnessRoot);
  const { metadata, artifacts } = await showChange(tmp, id);
  assert.equal(metadata.id, id);
  assert.equal(metadata.title, 'show test');
  const names = artifacts.map((a) => a.name);
  assert.ok(names.includes('metadata.yaml'));
  assert.ok(names.includes('evidence'));
  await rmrf(tmp);
});

test('ChangeRepository.findChangeByRequirement: REQ-XXX 命中', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-find-req-'));
  await runChangeCreate(tmp, { title: '需求A', requirement: 'REQ-001' }, harnessRoot);
  const candidates = await findChangeByRequirement(tmp, { requirement: 'REQ-001' });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].id, 'CHG-0001');
  await rmrf(tmp);
});

test('ChangeRepository.findChangeByRequirement: title 命中（忽略大小写/空白）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-find-title-'));
  await runChangeCreate(tmp, { title: '智能推荐' }, harnessRoot);
  const candidates = await findChangeByRequirement(tmp, { title: '  智能推荐  ' });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].title, '智能推荐');
  await rmrf(tmp);
});

test('ChangeRepository.findChangeByRequirement: 无匹配返回空数组', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-find-none-'));
  await runChangeCreate(tmp, { title: 'a', requirement: 'REQ-001' }, harnessRoot);
  const candidates = await findChangeByRequirement(tmp, { requirement: 'REQ-999' });
  assert.equal(candidates.length, 0);
  await rmrf(tmp);
});

test('ChangeRepository.findChangeByRequirement: 不扫 archive', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-find-noarch-'));
  const r = await runChangeCreate(tmp, { title: 'a', requirement: 'REQ-001' }, harnessRoot);
  // 推进到 completed 并 archive
  for (const s of ['exploring', 'specified', 'designed', 'tasked', 'developing', 'testing', 'completed']) {
    await patchStatus(r.changeDir, s);
  }
  await archiveChange(tmp, r.id);
  // archive 后 findChangeByRequirement 不应命中
  const candidates = await findChangeByRequirement(tmp, { requirement: 'REQ-001' });
  assert.equal(candidates.length, 0, 'archive 后不应被 findChangeByRequirement 命中');
  await rmrf(tmp);
});

test('ChangeRepository.changeExists: 存在/不存在', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-exists-'));
  await runChangeCreate(tmp, { title: 'a' }, harnessRoot);
  assert.ok(await changeExists(tmp, 'CHG-0001'));
  assert.ok(!(await changeExists(tmp, 'CHG-0099')));
  await rmrf(tmp);
});

// ---- ChangeArchiver ----

test('ChangeArchiver: completed CHG archive 后迁移 + status=archived', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-arch-ok-'));
  const r = await runChangeCreate(tmp, { title: 'archive test' }, harnessRoot);
  for (const s of ['exploring', 'specified', 'designed', 'tasked', 'developing', 'testing', 'completed']) {
    await patchStatus(r.changeDir, s);
  }
  const { archiveDir } = await archiveChange(tmp, r.id);
  assert.ok(!(await pathExists(r.changeDir)), 'changes/ 内目录应消失');
  assert.ok(await pathExists(archiveDir), 'archive/ 内目录应存在');
  const meta = parse(readFileSync(join(archiveDir, 'metadata.yaml'), 'utf8'));
  assert.equal(meta.status, 'archived');
  await rmrf(tmp);
});

test('ChangeArchiver: 非 completed 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-arch-fail-'));
  const r = await runChangeCreate(tmp, { title: 'not completed' }, harnessRoot);
  await assert.rejects(() => archiveChange(tmp, r.id), /Illegal transition/);
  await rmrf(tmp);
});

// ---- RequirementModel ----

test('RequirementModel.parseRequirement: 解析 front-matter', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-req-'));
  const filePath = join(tmp, 'requirement.md');
  await writeFile(
    filePath,
    '---\nid: REQ-001\nname: 测试需求\ncontent: 原文\nsource: user\ncreated-at: 2026-08-23T10:00:00Z\n---\n\n# Requirement\n正文\n'
  );
  const req = await parseRequirement(filePath);
  assert.equal(req.id, 'REQ-001');
  assert.equal(req.name, '测试需求');
  assert.equal(req.content, '原文');
  assert.equal(req.source, 'user');
  assert.equal(req.createdAt, '2026-08-23T10:00:00Z');
  await rmrf(tmp);
});

test('RequirementModel.parseRequirement: 无 front-matter 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-req-nofm-'));
  const filePath = join(tmp, 'requirement.md');
  await writeFile(filePath, '# No front-matter\n正文\n');
  await assert.rejects(() => parseRequirement(filePath), /no front-matter/);
  await rmrf(tmp);
});

test('RequirementModel.requirementId: 合法 REQ-XXX 原样返回', () => {
  assert.equal(requirementId('REQ-001'), 'REQ-001');
  assert.equal(requirementId('普通名称'), '');
  assert.equal(requirementId(''), '');
});

test('RequirementModel.isRequirementId: 校验', () => {
  assert.equal(isRequirementId('REQ-001'), true);
  assert.equal(isRequirementId('REQ-99'), false);
  assert.equal(isRequirementId('not-a-req'), false);
});
