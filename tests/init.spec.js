// Unit tests: version 解析、copier filter、config-writer、validator
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, stat, copyFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { readHarnessVersion } from '../core/workspace/version.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { resolveDefaultWorkspace } from '../core/workspace/template-resolver.js';
import { copyTemplate } from '../core/workspace/copier.js';
import {
  writeWorkspaceYaml,
  writeRepositoriesYaml,
  patchVersionYaml,
} from '../core/workspace/config-writer.js';
import { runSelfCheck } from '../core/workspace/validator.js';

const pathExists = (p) => stat(p).then(() => true).catch(() => false);
const rmrf = (p) => rm(p, { recursive: true, force: true });

const harnessRoot = getHarnessRoot();
const harnessVersion = readHarnessVersion(harnessRoot);
const templateDir = resolveDefaultWorkspace(harnessRoot);

test('readHarnessVersion 返回 0.1.0', () => {
  assert.equal(harnessVersion, '0.1.0');
});

test('readHarnessVersion 非法格式抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-ver-'));
  await writeFile(join(tmp, '.version'), 'not-a-version\n说明');
  assert.throws(() => readHarnessVersion(tmp), /Invalid .version format/);
  await rmrf(tmp);
});

test('copier: greenfield 复制产物正确（README 改名 + workspace/repositories 排除）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-copy-'));
  await copyTemplate(templateDir, tmp, { shouldCreateImplementation: true, force: false });

  assert.ok(await pathExists(join(tmp, 'README-OpenSpec.md')), 'README-OpenSpec.md 应存在');
  assert.ok(!(await pathExists(join(tmp, 'README.md'))), 'README.md 不应存在（已改名）');
  assert.ok(!(await pathExists(join(tmp, '.sdd/workspace.yaml'))), 'workspace.yaml 不应被复制');
  assert.ok(!(await pathExists(join(tmp, '.sdd/repositories.yaml'))), 'repositories.yaml 不应被复制');
  assert.ok(await pathExists(join(tmp, '.sdd/version.yaml')), 'version.yaml 应复制');
  assert.ok(await pathExists(join(tmp, '.sdd/context-rules.yaml')), 'context-rules.yaml 应复制');
  assert.ok(await pathExists(join(tmp, '.sdd/README.md')), '.sdd/README.md 应复制');

  for (const w of ['standards', 'product', 'delivery', 'skills', 'prompts', 'implementation']) {
    assert.ok(await pathExists(join(tmp, w)), `${w}/ 应存在`);
  }
  // Phase 2.3：prompts/ 片段就位（四类目录 + common）
  for (const d of ['common', 'explore', 'design', 'coding', 'review']) {
    assert.ok(await pathExists(join(tmp, 'prompts', d)), `prompts/${d}/ 应存在`);
  }
  await rmrf(tmp);
});

test('copier: brownfield 外部路径不创建 implementation', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-nocopy-'));
  await copyTemplate(templateDir, tmp, { shouldCreateImplementation: false, force: false });
  assert.ok(!(await pathExists(join(tmp, 'implementation'))), 'implementation/ 不应创建');
  await rmrf(tmp);
});

test('copier: --force 不触碰受保护目录（四世界 + prompts）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-force-'));
  await copyTemplate(templateDir, tmp, { shouldCreateImplementation: true, force: false });
  // 在 standards/ 与 prompts/ 内放标记文件，模拟用户自定义内容
  await writeFile(join(tmp, 'standards', 'USER_MARKER.md'), 'user kept');
  await writeFile(join(tmp, 'prompts', 'common', 'USER_PROMPT.md'), 'user prompt');
  // --force 再复制：受保护目录应被跳过，标记文件保留
  await copyTemplate(templateDir, tmp, { shouldCreateImplementation: true, force: true });
  assert.ok(
    await pathExists(join(tmp, 'standards', 'USER_MARKER.md')),
    '--force 不应清空 standards/ 标记文件'
  );
  assert.ok(
    await pathExists(join(tmp, 'prompts', 'common', 'USER_PROMPT.md')),
    '--force 不应覆盖用户自定义 prompts/ 文件'
  );
  assert.ok(await pathExists(join(tmp, '.sdd/version.yaml')), '.sdd/version.yaml 应刷新');
  await rmrf(tmp);
});

test('config-writer: workspace.yaml 字段填充且保留注释', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-ws-'));
  await mkdir(join(tmp, '.sdd'));
  writeWorkspaceYaml(templateDir, tmp, { name: 'test-proj', type: 'greenfield' }, '0.1.0');
  const content = readFileSync(join(tmp, '.sdd', 'workspace.yaml'), 'utf8');
  const doc = parse(content);
  assert.equal(doc.workspace.name, 'test-proj');
  assert.equal(doc.workspace.type, 'greenfield');
  assert.equal(doc.workspace.harness.version, '0.1.0');
  assert.ok(content.includes('#'), '模板注释应保留');
  await rmrf(tmp);
});

test('config-writer: repositories single 逐字段改写保留注释', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-rep-'));
  await mkdir(join(tmp, '.sdd'));
  writeRepositoriesYaml(templateDir, tmp, {
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
  });
  const content = readFileSync(join(tmp, '.sdd', 'repositories.yaml'), 'utf8');
  const doc = parse(content);
  assert.equal(doc.mode, 'single');
  assert.equal(doc.repositories[0].id, 'main');
  assert.equal(doc.repositories[0].path, 'implementation');
  assert.ok(content.includes('#'), '模板注释应保留');
  await rmrf(tmp);
});

test('config-writer: repositories multi 替换数组', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-repm-'));
  await mkdir(join(tmp, '.sdd'));
  writeRepositoriesYaml(templateDir, tmp, {
    mode: 'multi',
    repos: [
      { id: 'backend', path: '../existing-src/backend' },
      { id: 'frontend', path: '../existing-src/frontend' },
    ],
  });
  const doc = parse(readFileSync(join(tmp, '.sdd', 'repositories.yaml'), 'utf8'));
  assert.equal(doc.mode, 'multi');
  assert.equal(doc.repositories.length, 2);
  assert.equal(doc.repositories[0].id, 'backend');
  assert.equal(doc.repositories[1].path, '../existing-src/frontend');
  await rmrf(tmp);
});

test('patchVersionYaml: harness.version 修补，其他两层不动', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-pv-'));
  await mkdir(join(tmp, '.sdd'));
  await copyFile(join(templateDir, '.sdd/version.yaml'), join(tmp, '.sdd/version.yaml'));
  patchVersionYaml(tmp, '0.1.0');
  const doc = parse(readFileSync(join(tmp, '.sdd', 'version.yaml'), 'utf8'));
  assert.equal(doc.harness.version, '0.1.0');
  assert.equal(doc['workspace-template'].version, '0.1.0');
  assert.equal(doc.schema.version, '0.1.0');
  await rmrf(tmp);
});

test('validator: 完整 workspace 自检通过', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-val-'));
  const config = {
    name: 'val-proj',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
  };
  await copyTemplate(templateDir, tmp, config);
  writeWorkspaceYaml(templateDir, tmp, config, harnessVersion);
  writeRepositoriesYaml(templateDir, tmp, config);
  patchVersionYaml(tmp, harnessVersion);
  const result = runSelfCheck(tmp, harnessVersion);
  assert.ok(result.ok, `issues: ${result.issues.join('; ')}`);
  await rmrf(tmp);
});
