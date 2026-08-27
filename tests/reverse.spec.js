// Reverse tests: scanImplementation + runReverse 在 mock implementation/ 上的行为
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, stat } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { scanImplementation, runReverse } from '../core/sdd/knowledge-reverser.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const pathExists = (p) => stat(p).then(() => true).catch(() => false);
const harnessRoot = getHarnessRoot();

test('Reverse: scanImplementation 检测语言和标记文件', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-rev-scan-'));
  // 模拟 implementation 目录
  await mkdir(join(tmp, 'src'), { recursive: true });
  await mkdir(join(tmp, 'node_modules'), { recursive: true });
  await writeFile(join(tmp, 'package.json'), '{}', 'utf8');
  await writeFile(join(tmp, 'src', 'index.js'), 'console.log(1)', 'utf8');
  await writeFile(join(tmp, 'src', 'app.ts'), 'const x = 1;', 'utf8');
  await writeFile(join(tmp, 'src', 'view.vue'), '<template/>', 'utf8');
  // node_modules 应被跳过
  await writeFile(join(tmp, 'node_modules', 'lib.js'), 'module.exports = {};', 'utf8');

  const result = await scanImplementation(tmp);
  assert.ok(result.total >= 4, `total: ${result.total}`);
  assert.ok(result.languages['JavaScript'] >= 1);
  assert.ok(result.languages['TypeScript'] >= 1);
  assert.ok(result.languages['Vue'] >= 1);
  assert.ok(result.markers.some((m) => m.includes('package.json')));
  // node_modules 内文件不应出现
  assert.ok(!result.files.some((f) => f.includes('node_modules')));
  await rmrf(tmp);
});

test('Reverse: scanImplementation 深度限制', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-rev-depth-'));
  await mkdir(join(tmp, 'a', 'b', 'c', 'd', 'e', 'f'), { recursive: true });
  await writeFile(join(tmp, 'a', 'b', 'c', 'd', 'e', 'f', 'deep.js'), '// deep', 'utf8');
  await writeFile(join(tmp, 'top.js'), '// top', 'utf8');

  // maxDepth=2 只扫到 a/b 和 top.js
  const result = await scanImplementation(tmp, 2);
  assert.ok(result.files.some((f) => f === 'top.js'));
  assert.ok(!result.files.some((f) => f.includes('deep.js')));
  await rmrf(tmp);
});

test('Reverse: runReverse 创建 CHG + instruction.md', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-rev-run-'));
  await runInit(
    { name: 'rev-run', type: 'brownfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  // 在 implementation/ 放代码文件
  const implDir = join(tmp, 'implementation');
  await mkdir(join(implDir, 'src'), { recursive: true });
  await writeFile(join(implDir, 'package.json'), '{"name":"demo"}', 'utf8');
  await writeFile(join(implDir, 'src', 'app.js'), 'console.log("hello")', 'utf8');
  await writeFile(join(implDir, 'src', 'api.ts'), 'export const x = 1;', 'utf8');

  const result = await runReverse(tmp, harnessRoot);
  assert.ok(result.changeId.match(/^CHG-\d{4}$/));
  assert.ok(await pathExists(result.instructionPath));

  // instruction.md 内容包含扫描结果
  const content = await (await import('node:fs/promises')).readFile(result.instructionPath, 'utf8');
  assert.ok(content.includes('JavaScript'));
  assert.ok(content.includes('package.json'));
  assert.ok(content.includes(result.changeId));
  assert.ok(result.scanResult.total >= 3);
  await rmrf(tmp);
});

test('Reverse: implementation 为空 → 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-rev-empty-'));
  await runInit(
    { name: 'rev-empty', type: 'brownfield', mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true, force: false },
    tmp, harnessRoot
  );
  // implementation/ 已创建但只有 init 生成的 README.md，删掉使其为空
  await rm(join(tmp, 'implementation', 'README.md'));
  await assert.rejects(
    () => runReverse(tmp, harnessRoot),
    /empty/i
  );
  await rmrf(tmp);
});

test('Reverse: implementation 不存在 → 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-rev-none-'));
  await runInit(
    { name: 'rev-none', type: 'greenfield', mode: 'single',
      repos: [{ id: 'main', path: '../external' }],
      shouldCreateImplementation: false, force: false },
    tmp, harnessRoot
  );
  await assert.rejects(
    () => runReverse(tmp, harnessRoot),
    /implementation.*not found/i
  );
  await rmrf(tmp);
});
