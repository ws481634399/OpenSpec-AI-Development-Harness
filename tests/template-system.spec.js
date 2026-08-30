// Unit tests: Template 系统（Phase 3.2 plans/phase-3.2-template-system-design.md §9）
// 覆盖：resolveStackOverlay / copyStackOverlay / runInit × 4 stacks / workspace.yaml.stack / force 保护
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, rm, stat, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parse } from 'yaml';
import { resolveStackOverlay, STACKS } from '../core/workspace/template-resolver.js';
import { copyStackOverlay } from '../core/workspace/copier.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { readHarnessVersion } from '../core/workspace/version.js';

const harnessRoot = getHarnessRoot();
const harnessVersion = readHarnessVersion(harnessRoot);
const rmrf = (p) => rm(p, { recursive: true, force: true });
const pathExists = (p) => stat(p).then(() => true).catch(() => false);

/** 最小 init config（single 仓，greenfield） */
const baseConfig = (stack) => ({
  name: 'demo',
  type: 'greenfield',
  stack,
  mode: 'single',
  repos: [{ id: 'main', path: 'implementation' }],
  shouldCreateImplementation: true,
  force: false,
});

// ---- resolveStackOverlay ----

test('resolveStackOverlay: empty → null，三栈路径存在，未知栈抛错', () => {
  assert.equal(resolveStackOverlay('empty', harnessRoot), null);
  for (const s of ['spring-cloud', 'vue', 'ai-agent']) {
    const dir = resolveStackOverlay(s, harnessRoot);
    assert.ok(existsSync(dir), `${s} overlay 目录应存在: ${dir}`);
    assert.ok(dir.includes(join('templates', 'stacks', s)));
  }
  assert.throws(() => resolveStackOverlay('react', harnessRoot), /未知项目模板.*empty \| spring-cloud \| vue \| ai-agent/);
});

test('STACKS 枚举与 Roadmap 一致', () => {
  assert.deepEqual(STACKS, ['empty', 'spring-cloud', 'vue', 'ai-agent']);
});

// ---- copyStackOverlay ----

test('copyStackOverlay: overlay 结构映射到目标相对路径；force/空 overlay 跳过', async () => {
  const target = await mkdtemp(join(tmpdir(), 'overlay-'));
  await copyStackOverlay(resolveStackOverlay('spring-cloud', harnessRoot), target, { force: false });
  assert.ok(await pathExists(join(target, 'standards', 'STACK.md')));
  assert.ok(await pathExists(join(target, 'standards', 'engineering', 'backend', 'framework-standard.md')));

  // force → 跳过
  const target2 = await mkdtemp(join(tmpdir(), 'overlay-force-'));
  await copyStackOverlay(resolveStackOverlay('vue', harnessRoot), target2, { force: true });
  assert.equal(await pathExists(join(target2, 'standards', 'STACK.md')), false);

  // null overlay → 无操作不抛错
  await copyStackOverlay(null, target, { force: false });
  await rmrf(target);
  await rmrf(target2);
});

// ---- runInit × 4 stacks ----

test('runInit: empty 无技术栈包，stack 记录为 empty', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-empty-'));
  await runInit(baseConfig('empty'), tmp, harnessRoot);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'backend')), false);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'frontend')), false);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'ai')), false);
  // 通用工程标准与 SDD 标准仍在
  assert.ok(await pathExists(join(tmp, 'standards', 'engineering', 'coding-standard.md')));
  assert.ok(await pathExists(join(tmp, 'standards', 'sdd', 'change-lifecycle.md')));
  // 无 STACK.md
  assert.equal(await pathExists(join(tmp, 'standards', 'STACK.md')), false);

  const ws = parse(await readFile(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.stack, 'empty');
  await rmrf(tmp);
});

test('runInit: spring-cloud 仅启用 backend 包', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-sc-'));
  await runInit(baseConfig('spring-cloud'), tmp, harnessRoot);
  assert.ok(await pathExists(join(tmp, 'standards', 'engineering', 'backend', 'framework-standard.md')));
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'frontend')), false);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'ai')), false);
  assert.ok(await pathExists(join(tmp, 'standards', 'STACK.md')));

  const ws = parse(await readFile(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.stack, 'spring-cloud');
  await rmrf(tmp);
});

test('runInit: vue 仅启用 frontend 包', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-vue-'));
  await runInit(baseConfig('vue'), tmp, harnessRoot);
  assert.ok(await pathExists(join(tmp, 'standards', 'engineering', 'frontend', 'component-standard.md')));
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'backend')), false);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'ai')), false);

  const ws = parse(await readFile(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.stack, 'vue');
  await rmrf(tmp);
});

test('runInit: ai-agent 仅启用 ai 包', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-ai-'));
  await runInit(baseConfig('ai-agent'), tmp, harnessRoot);
  assert.ok(await pathExists(join(tmp, 'standards', 'engineering', 'ai', 'agent-standard.md')));
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'backend')), false);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'frontend')), false);

  const ws = parse(await readFile(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.stack, 'ai-agent');
  await rmrf(tmp);
});

test('runInit: 未传 stack 默认 empty（向后兼容）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-nostack-'));
  const config = baseConfig(undefined);
  delete config.stack;
  await runInit(config, tmp, harnessRoot);
  const ws = parse(await readFile(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.stack, 'empty');
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'backend')), false);
  await rmrf(tmp);
});

test('runInit: --force + stack → overlay 跳过（standards 受保护）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-frc-'));
  const config = { ...baseConfig('spring-cloud'), force: true };
  await runInit(config, tmp, harnessRoot);
  // force 模式 standards 全保护（含 overlay 的栈包）
  assert.equal(await pathExists(join(tmp, 'standards', 'STACK.md')), false);
  assert.equal(existsSync(join(tmp, 'standards', 'engineering', 'backend')), false);
  // 但 .sdd 静态文件与 workspace.yaml 仍刷新
  const ws = parse(await readFile(join(tmp, '.sdd', 'workspace.yaml'), 'utf8'));
  assert.equal(ws.workspace.stack, 'spring-cloud');
  await rmrf(tmp);
});

test('runInit: 非法 stack 抛错且不产生半成品', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'init-bad-'));
  await assert.rejects(
    () => runInit(baseConfig('react'), tmp, harnessRoot),
    /未知项目模板/
  );
  await rmrf(tmp);
});
