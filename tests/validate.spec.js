// Validate tests: validateChange / validateAll 在完整/破损 Change 上的行为
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, patchStatus, readMetadata, patchMetadata } from '../core/sdd/change-model.js';
import { validateChange, validateAll } from '../core/sdd/change-validator.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

test('Validate: created 状态 Change 无 artifact → valid', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-val-created-'));
  await runInit(
    { name: 'val-created', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const { id, changeDir } = await runChangeCreate(
    tmp, { title: 'test', requirement: 'REQ-001' }, harnessRoot
  );
  const r = await validateChange(changeDir, harnessRoot);
  assert.ok(r.ok, r.issues.join('; '));
  assert.equal(r.id, id);
  assert.equal(r.status, 'created');
  await rmrf(tmp);
});

test('Validate: exploring 状态缺 exploration.md → 报 issue', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-val-miss-'));
  await runInit(
    { name: 'val-miss', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const { changeDir } = await runChangeCreate(
    tmp, { title: 'test', requirement: 'REQ-001' }, harnessRoot
  );
  // 推进到 exploring 但不写 exploration.md
  await patchStatus(changeDir, 'exploring');
  const r = await validateChange(changeDir, harnessRoot);
  assert.ok(!r.ok);
  assert.ok(r.issues.some((i) => i.includes('exploration.md missing')));
  await rmrf(tmp);
});

test('Validate: 非法 status → 报 issue', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-val-bad-status-'));
  await runInit(
    { name: 'val-bad', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const { changeDir } = await runChangeCreate(
    tmp, { title: 'test', requirement: 'REQ-001' }, harnessRoot
  );
  // 写入非法 status
  await patchMetadata(changeDir, { status: 'nonexistent' });
  const r = await validateChange(changeDir, harnessRoot);
  assert.ok(!r.ok);
  assert.ok(r.issues.some((i) => i.includes('invalid status')));
  await rmrf(tmp);
});

test('Validate: --all 校验多个 Change', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-val-all-'));
  await runInit(
    { name: 'val-all', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  await runChangeCreate(tmp, { title: 'ok', requirement: 'REQ-001' }, harnessRoot);
  const r2 = await runChangeCreate(tmp, { title: 'bad', requirement: 'REQ-002' }, harnessRoot);
  await patchStatus(r2.changeDir, 'exploring'); // 缺 exploration.md

  const { results, ok, issueCount } = await validateAll(tmp, harnessRoot);
  assert.equal(results.length, 2);
  assert.ok(!ok);
  assert.ok(issueCount >= 1);
  // 第一个 created 状态应该 ok
  assert.ok(results[0].ok || results[1].ok);
  await rmrf(tmp);
});

test('Validate: metadata 损坏 → 返回 corrupted', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-val-corrupt-'));
  await runInit(
    { name: 'val-corrupt', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const { changeDir } = await runChangeCreate(
    tmp, { title: 'test', requirement: 'REQ-001' }, harnessRoot
  );
  // 删除 metadata.yaml 使其不可读
  await rm(join(changeDir, 'metadata.yaml'));
  const r = await validateChange(changeDir, harnessRoot);
  assert.ok(!r.ok);
  assert.equal(r.id, '(corrupted)');
  assert.ok(r.issues.length > 0);
  await rmrf(tmp);
});
