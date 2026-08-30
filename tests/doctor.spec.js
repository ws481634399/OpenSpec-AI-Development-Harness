// Doctor tests: runSelfCheck 在健康/破损 Workspace 上的行为
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, rmdir } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runSelfCheck } from '../core/workspace/validator.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { readHarnessVersion } from '../core/workspace/version.js';
import { runVersionChecks } from '../core/sdd/doctor-checks.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();
const harnessVersion = readHarnessVersion(harnessRoot);

test('Doctor: 健康 Workspace 自检通过', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-doc-ok-'));
  await runInit(
    { name: 'doctor-ok', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  const result = runSelfCheck(tmp, harnessVersion);
  assert.ok(result.ok, `issues: ${result.issues.join('; ')}`);
  assert.equal(result.issues.length, 0);
  await rmrf(tmp);
});

test('Doctor: 缺 .sdd/workspace.yaml → 报 issue', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-doc-no-ws-'));
  await runInit(
    { name: 'doctor-no-ws', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  await rm(join(tmp, '.sdd', 'workspace.yaml'));
  const result = runSelfCheck(tmp, harnessVersion);
  assert.ok(!result.ok);
  assert.ok(result.issues.some((i) => i.includes('workspace.yaml missing')));
  await rmrf(tmp);
});

test('Doctor: 缺四世界目录 standards/ → 报 issue', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-doc-no-std-'));
  await runInit(
    { name: 'doctor-no-std', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  await rmrf(join(tmp, 'standards'));
  const result = runSelfCheck(tmp, harnessVersion);
  assert.ok(!result.ok);
  assert.ok(result.issues.some((i) => i.includes('standards/ missing')));
  await rmrf(tmp);
});

test('Doctor: version 分级检查移交 runVersionChecks（Phase 3.1）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-doc-ver-'));
  await runInit(
    { name: 'doctor-ver', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  // 篡改 version.yaml 为跨 major 版本
  await writeFile(join(tmp, '.sdd', 'version.yaml'),
    'harness:\n  version: 99.99.99\n', 'utf8');
  // runSelfCheck 不再做版本精确比较（移交 runVersionChecks）
  const result = runSelfCheck(tmp, harnessVersion);
  assert.ok(result.ok, `issues: ${result.issues.join('; ')}`);
  // runVersionChecks 分级：跨 major → error
  const v = runVersionChecks(tmp, harnessRoot);
  assert.ok(v.issues.some((i) => i.includes('跨 major')));
  await rmrf(tmp);
});
