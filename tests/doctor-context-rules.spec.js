// Unit tests: Phase 2.6 Doctor context-rules 校验（plans/phase-2.6-context-rules-design.md §11.4）
// 覆盖：默认模板零 issue / v0.1 升级提示 / 缺文件与解析失败 / 阶段覆盖 / 条目枚举与数值 /
//       change-artifacts / limits / path 存在性 warning
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runContextRulesChecks } from '../core/sdd/doctor-checks.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function initWorkspace() {
  const tmp = await mkdtemp(join(tmpdir(), 'ctx-doctor-'));
  await runInit(
    {
      name: 'ctx-doctor-test',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );
  return tmp;
}

const writeRules = (tmp, text) => writeFile(join(tmp, '.sdd', 'context-rules.yaml'), text, 'utf8');

test('默认模板（v0.2）→ 无 issue', async () => {
  const tmp = await initWorkspace();
  const r = await runContextRulesChecks(tmp);
  assert.deepEqual(r.issues, [], r.issues.join('; '));
  assert.ok(r.checked >= 1);
  await rmrf(tmp);
});

test('v0.1 格式 → 建议升级 v0.2 提示', async () => {
  const tmp = await initWorkspace();
  await writeRules(tmp, ['stages:', '  explore:', '    read:', '      - standards/'].join('\n'));
  const r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('v0.1 格式')), r.issues.join('; '));
  await rmrf(tmp);
});

test('文件缺失 / YAML 解析失败', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'ctx-doctor-empty-'));
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  let r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('context-rules.yaml 缺失')), r.issues.join('; '));

  await writeRules(tmp, 'stages: [oops'); // 未闭合 flow 序列 → 解析失败
  r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('解析失败')), r.issues.join('; '));
  await rmrf(tmp);
});

test('缺少 stages 段 / 阶段覆盖缺失 / 未知阶段 / 缺 read 数组', async () => {
  const tmp = await initWorkspace();
  await writeRules(tmp, 'version: 0.2\nlimits: {}');
  let r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('缺少 stages 段')), r.issues.join('; '));

  await writeRules(
    tmp,
    ['version: 0.2', 'stages:', '  explore:', '    read: []', '  badstage:', '    read: []', '  dev: {}'].join('\n')
  );
  r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes("缺少阶段 'prd'")), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes("未知阶段 'badstage'")), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes("阶段 'dev' 缺少 read 数组")), r.issues.join('; '));
  await rmrf(tmp);
});

test('read 条目非法：缺 path / mode / category / max-* 非正整数 / include-exclude 非数组', async () => {
  const tmp = await initWorkspace();
  await writeRules(
    tmp,
    [
      'version: 0.2',
      'stages:',
      '  explore:',
      '    read:',
      '      - {}',
      '      - path: standards/',
      '        mode: bad',
      '        category: bad',
      '      - path: product/',
      '        max-files: -1',
      '        max-bytes: 0',
      '        include: nope',
      '        exclude: [ok]',
    ].join('\n')
  );
  const r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('read[0] 缺少 path')), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes("mode 非法 'bad'")), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes("category 非法 'bad'")), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes('max-files 须为正整数')), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes('max-bytes 须为正整数')), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes('include 须为数组')), r.issues.join('; '));
  assert.ok(!r.issues.some((i) => i.includes('exclude')), '合法 exclude 不报 issue');
  await rmrf(tmp);
});

test('change-artifacts 非数组 / 条目缺 path', async () => {
  const tmp = await initWorkspace();
  await writeRules(
    tmp,
    ['version: 0.2', 'stages:', '  explore:', '    read: []', '    change-artifacts: 42'].join('\n')
  );
  let r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('change-artifacts 须为数组')), r.issues.join('; '));

  await writeRules(
    tmp,
    ['version: 0.2', 'stages:', '  explore:', '    read: []', '    change-artifacts:', '      - {}', '      - ok.md'].join('\n')
  );
  r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('change-artifacts[0] 缺少 path')), r.issues.join('; '));
  await rmrf(tmp);
});

test('limits 非正整数 → issue', async () => {
  const tmp = await initWorkspace();
  await writeRules(
    tmp,
    ['version: 0.2', 'limits:', '  total-max-bytes: abc', '  total-max-files: 0', 'stages:', '  explore:', '    read: []'].join('\n')
  );
  const r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('limits.total-max-bytes 须为正整数')), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes('limits.total-max-files 须为正整数')), r.issues.join('; '));
  await rmrf(tmp);
});

test('path 不存在 → warning 级 issue', async () => {
  const tmp = await initWorkspace();
  await writeRules(tmp, ['version: 0.2', 'stages:', '  explore:', '    read:', '      - path: no-such-dir/'].join('\n'));
  const r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('path 不存在: no-such-dir/')), r.issues.join('; '));
  await rmrf(tmp);
});

// ---- Phase 2.7：repos 段（per-repo 规则段）校验 ----

test('repos 段：version < 0.3 → 提示升级；repoId 未注册 → warning', async () => {
  const tmp = await initWorkspace();
  await writeRules(
    tmp,
    ['version: 0.2', 'stages:', '  dev:', '    read: []', '    repos:', '      backend:', '        read:', '          - path: implementation/'].join('\n')
  );
  const r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('repos 需要 version >= 0.3')), r.issues.join('; '));
  assert.ok(r.issues.some((i) => i.includes('repos.backend repoId 不在 .sdd/repositories.yaml')), r.issues.join('; '));
  await rmrf(tmp);
});

test('repos 段：非对象 / 条目缺 read / 条目非法', async () => {
  const tmp = await initWorkspace();
  await writeRules(tmp, ['version: 0.3', 'stages:', '  dev:', '    read: []', '    repos: 42'].join('\n'));
  let r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('repos 须为对象')), r.issues.join('; '));

  await writeRules(
    tmp,
    ['version: 0.3', 'stages:', '  dev:', '    read: []', '    repos:', '      main: {}'].join('\n')
  );
  r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('repos.main 缺少 read 数组')), r.issues.join('; '));

  await writeRules(
    tmp,
    ['version: 0.3', 'stages:', '  dev:', '    read: []', '    repos:', '      main:', '        read:', '          - mode: bad'].join('\n')
  );
  r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('repos.main.read[0] 缺少 path')), r.issues.join('; '));
  await rmrf(tmp);
});

test('repos 段合法配置（repoId 已注册 + path 存在）→ 无 issue', async () => {
  const tmp = await initWorkspace();
  await writeRules(
    tmp,
    [
      'version: 0.3',
      'stages:',
      '  explore:',
      '    read: []',
      '  prd:',
      '    read: []',
      '  design:',
      '    read: []',
      '  task:',
      '    read: []',
      '  dev:',
      '    read: []',
      '    repos:',
      '      main:',
      '        read:',
      '          - path: implementation/',
      '            mode: outline',
      '  test:',
      '    read: []',
      '  review:',
      '    read: []',
      '  converge:',
      '    read: []',
    ].join('\n')
  );
  const r = await runContextRulesChecks(tmp);
  assert.deepEqual(r.issues, [], r.issues.join('; '));
  await rmrf(tmp);
});

test('repos 段 path 不存在 → warning 级 issue', async () => {
  const tmp = await initWorkspace();
  await writeRules(
    tmp,
    ['version: 0.3', 'stages:', '  dev:', '    read: []', '    repos:', '      main:', '        read:', '          - path: no-such-repo/'].join('\n')
  );
  const r = await runContextRulesChecks(tmp);
  assert.ok(r.issues.some((i) => i.includes('repos.main 条目 path 不存在: no-such-repo/')), r.issues.join('; '));
  await rmrf(tmp);
});
