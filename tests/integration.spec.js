// Integration tests: runInit 端到端（greenfield / brownfield+multi+外部路径 / 重复 init / --force 保护四世界 / 版本一致）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { readHarnessVersion } from '../core/workspace/version.js';

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
