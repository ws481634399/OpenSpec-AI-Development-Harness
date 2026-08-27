// Status tests: aggregateStatus 在无/有 Change 的 Workspace 上的行为
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, patchStatus } from '../core/sdd/change-model.js';
import { aggregateStatus } from '../core/workspace/status-aggregator.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

test('Status: 无 Change 的 Workspace 聚合正确', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-stat-empty-'));
  await runInit(
    { name: 'stat-empty', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const s = await aggregateStatus(tmp);
  assert.equal(s.workspace.name, 'stat-empty');
  assert.equal(s.workspace.type, 'greenfield');
  assert.ok(s.workspace.harnessVersion);
  assert.equal(s.repositories.mode, 'single');
  assert.equal(s.repositories.count, 1);
  assert.equal(s.changes.total, 0);
  assert.equal(s.changes.recent.length, 0);
  await rmrf(tmp);
});

test('Status: 多 Change + 不同状态 → byStatus 分组正确', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-stat-multi-'));
  await runInit(
    { name: 'stat-multi', type: 'greenfield', mode: 'multi',
      repos: [{ id: 'backend', path: 'src/backend' }, { id: 'frontend', path: 'src/frontend' }],
      shouldCreateImplementation: false, force: false },
    tmp, harnessRoot
  );
  const r1 = await runChangeCreate(tmp, { title: '需求一', requirement: 'REQ-001' }, harnessRoot);
  await patchStatus(r1.changeDir, 'exploring');
  const r2 = await runChangeCreate(tmp, { title: '需求二', requirement: 'REQ-002' }, harnessRoot);
  await patchStatus(r2.changeDir, 'specified');
  const r3 = await runChangeCreate(tmp, { title: '需求三', requirement: 'REQ-003' }, harnessRoot);
  // r3 留 created

  const s = await aggregateStatus(tmp);
  assert.equal(s.changes.total, 3);
  assert.equal(s.changes.byStatus['exploring'], 1);
  assert.equal(s.changes.byStatus['specified'], 1);
  assert.equal(s.changes.byStatus['created'], 1);
  assert.equal(s.changes.recent.length, 3);
  // 最近 5 条（有 3 条全返回）
  assert.equal(s.repositories.count, 2);
  await rmrf(tmp);
});

test('Status: JSON 输出可序列化', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-stat-json-'));
  await runInit(
    { name: 'stat-json', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const s = await aggregateStatus(tmp);
  const json = JSON.stringify(s, null, 2);
  const parsed = JSON.parse(json);
  assert.equal(parsed.workspace.name, 'stat-json');
  assert.equal(parsed.changes.total, 0);
  await rmrf(tmp);
});
