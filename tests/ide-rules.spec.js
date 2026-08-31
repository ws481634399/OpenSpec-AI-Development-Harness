// Unit tests: IDE 规则与 Skill 斜杠命令生成（Phase 3.3 §9 / Phase 3.4 plans/phase-3.4-ide-commands-design.md §6）
// 覆盖：render / plan 情形矩阵 / apply（trae+cursor+claude-code）/ --force / doctor 检查
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { renderIdeRules, planIdeRules, applyIdeRules, TARGETS, BLOCK_BEGIN, BLOCK_END } from '../core/workspace/ide-rules.js';
import { renderCommand, renderCommands, planIdeCommands, applyIdeCommands, COMMANDS_DIR } from '../core/workspace/ide-commands.js';
import { runIdeRulesChecks } from '../core/sdd/doctor-checks.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { readHarnessVersion } from '../core/workspace/version.js';

const harnessRoot = getHarnessRoot();
const harnessVersion = readHarnessVersion(harnessRoot);
const rmrf = (p) => rm(p, { recursive: true, force: true });
const ws = () => mkdtemp(join(tmpdir(), 'ide-rules-'));
const olderVersion = '0.0.1';
const renderOld = (t) =>
  renderIdeRules(t, harnessRoot, harnessVersion).then((c) => c.replace(`v${harnessVersion}`, `v${olderVersion}`));

// ---- renderIdeRules ----

test('renderIdeRules: 三 target 版本占位符已替换，front-matter 正确', async () => {
  for (const t of TARGETS) {
    const c = await renderIdeRules(t, harnessRoot, harnessVersion);
    assert.ok(!c.includes('{{HARNESS_VERSION}}'), `${t}: 占位符应已替换`);
    assert.ok(c.includes(`openspec-ide-rules: v${harnessVersion}`), `${t}: 应含版本标记`);
    assert.ok(c.includes('OpenSpec SDD Workflow'), `${t}: 应含标题`);
  }
  const trae = await renderIdeRules('trae', harnessRoot, harnessVersion);
  const cursor = await renderIdeRules('cursor', harnessRoot, harnessVersion);
  const claude = await renderIdeRules('claude-code', harnessRoot, harnessVersion);
  for (const c of [trae, cursor]) {
    assert.ok(c.startsWith('---\n'), 'front-matter 应在文件头');
    assert.ok(c.includes('alwaysApply: true'));
  }
  assert.ok(!claude.startsWith('---\n'), 'claude-code 模板无 front-matter');
});

test('renderIdeRules: 非法 target 抛错含枚举', async () => {
  await assert.rejects(() => renderIdeRules('vscode', harnessRoot, harnessVersion), /trae \| cursor \| claude-code/);
});

// ---- planIdeRules ----

test('planIdeRules: 不存在 → created（零写入）', async () => {
  const root = await ws();
  const plan = await planIdeRules(root, 'cursor', harnessRoot, harnessVersion);
  assert.equal(plan.action, 'created');
  assert.equal(plan.file, join('.cursor', 'rules', 'openspec-workflow.mdc'));
  assert.ok(plan.content.includes('OpenSpec SDD Workflow'));
  // 零写入验证
  await assert.rejects(() => readFile(join(root, plan.file), 'utf8'), /ENOENT/);
  await rmrf(root);
});

test('planIdeRules: 有标记同版本 → up-to-date；旧版本 → updated(from/to)', async () => {
  const root = await ws();
  await mkdir(join(root, '.trae', 'rules'), { recursive: true });
  const dest = join(root, '.trae', 'rules', 'openspec-workflow.md');

  await writeFile(dest, await renderIdeRules('trae', harnessRoot, harnessVersion));
  assert.equal((await planIdeRules(root, 'trae', harnessRoot, harnessVersion)).action, 'up-to-date');

  await writeFile(dest, await renderOld('trae'));
  const plan = await planIdeRules(root, 'trae', harnessRoot, harnessVersion);
  assert.equal(plan.action, 'updated');
  assert.equal(plan.from, olderVersion);
  assert.equal(plan.to, harnessVersion);
  await rmrf(root);
});

test('planIdeRules: trae/cursor 无标记同名文件 → conflict（不覆盖）', async () => {
  for (const t of ['trae', 'cursor']) {
    const root = await ws();
    const file = t === 'trae' ? join('.trae', 'rules', 'openspec-workflow.md') : join('.cursor', 'rules', 'openspec-workflow.mdc');
    await mkdir(join(root, file, '..'), { recursive: true });
    await writeFile(join(root, file), '# 我自己的规则\n- 不要动我');
    const plan = await planIdeRules(root, t, harnessRoot, harnessVersion);
    assert.equal(plan.action, 'conflict');
    await assert.rejects(() => applyIdeRules(root, t, plan), /--force/);
    assert.equal(await readFile(join(root, file), 'utf8'), '# 我自己的规则\n- 不要动我'); // 原文未动
    await rmrf(root);
  }
});

// ---- applyIdeRules ----

test('applyIdeRules: trae/cursor 生成落位（mkdir 递归）+ 幂等', async () => {
  const root = await ws();
  for (const t of ['trae', 'cursor']) {
    let plan = await planIdeRules(root, t, harnessRoot, harnessVersion);
    const r = await applyIdeRules(root, t, plan);
    assert.equal(r.written, true);
    const dest = join(root, plan.file);
    assert.ok((await readFile(dest, 'utf8')).includes('alwaysApply: true'));
    // 二次运行 up-to-date，零写入
    plan = await planIdeRules(root, t, harnessRoot, harnessVersion);
    assert.equal(plan.action, 'up-to-date');
    assert.equal((await applyIdeRules(root, t, plan)).written, false);
  }
  await rmrf(root);
});

test('applyIdeRules: --force 覆盖 conflict 文件', async () => {
  const root = await ws();
  await mkdir(join(root, '.cursor', 'rules'), { recursive: true });
  const dest = join(root, '.cursor', 'rules', 'openspec-workflow.mdc');
  await writeFile(dest, '# 旧的');
  const plan = await planIdeRules(root, 'cursor', harnessRoot, harnessVersion);
  assert.equal(plan.action, 'conflict');
  await applyIdeRules(root, 'cursor', plan, { force: true });
  assert.ok((await readFile(dest, 'utf8')).includes('OpenSpec SDD Workflow'));
  await rmrf(root);
});

test('claude-code: 新建 / 末尾追加 / 标记块替换 / 块外保留', async () => {
  const root = await ws();
  const dest = join(root, 'CLAUDE.md');

  // 1. 新建（含标记块）
  let plan = await planIdeRules(root, 'claude-code', harnessRoot, harnessVersion);
  assert.equal(plan.action, 'created');
  await applyIdeRules(root, 'claude-code', plan);
  let content = await readFile(dest, 'utf8');
  assert.ok(content.startsWith(BLOCK_BEGIN));
  assert.ok(content.trimEnd().endsWith(BLOCK_END));
  assert.ok(content.includes(`openspec-ide-rules: v${harnessVersion}`));

  // 2. 二次运行 up-to-date
  plan = await planIdeRules(root, 'claude-code', harnessRoot, harnessVersion);
  assert.equal(plan.action, 'up-to-date');

  // 3. 已有用户文件（无标记）→ 末尾追加，原文保留
  await rmrf(root);
  const root2 = await ws();
  const dest2 = join(root2, 'CLAUDE.md');
  await writeFile(dest2, '# My Project\n\n自定义说明。\n');
  plan = await planIdeRules(root2, 'claude-code', harnessRoot, harnessVersion);
  await applyIdeRules(root2, 'claude-code', plan);
  content = await readFile(dest2, 'utf8');
  assert.ok(content.startsWith('# My Project\n\n自定义说明。'));
  assert.ok(content.includes(BLOCK_BEGIN));

  // 4. 已有标记块 + 旧版本 → 块内替换、块外保留
  const userPart = '# My Project\n\n自定义说明。\n';
  await writeFile(dest2, `${userPart}${BLOCK_BEGIN}\n# 旧内容\nopenspec-ide-rules: v${olderVersion}\n${BLOCK_END}\n尾部用户补充\n`);
  plan = await planIdeRules(root2, 'claude-code', harnessRoot, harnessVersion);
  assert.equal(plan.action, 'updated');
  await applyIdeRules(root2, 'claude-code', plan);
  content = await readFile(dest2, 'utf8');
  assert.ok(content.startsWith(userPart));
  assert.ok(content.trimEnd().endsWith('尾部用户补充'));
  assert.ok(!content.includes(`v${olderVersion}`), '旧标记块内容应被清除');
  assert.ok(content.includes(`openspec-ide-rules: v${harnessVersion}`));

  // 5. 只有一个标记 → 视为无块，末尾追加（防御）
  await writeFile(dest2, `${userPart}${BLOCK_BEGIN}\n残留内容\n`);
  plan = await planIdeRules(root2, 'claude-code', harnessRoot, harnessVersion);
  await applyIdeRules(root2, 'claude-code', plan);
  content = await readFile(dest2, 'utf8');
  assert.ok(content.includes(userPart));
  assert.ok(content.includes(BLOCK_END));

  await rmrf(root2);
  await rmrf(root);
});

// ---- doctor runIdeRulesChecks ----

test('doctor runIdeRulesChecks: 落后 → info；最新/不存在/无标记 → 无提示', async () => {
  const root = await ws();
  // 全不存在 → 无提示
  let r = await runIdeRulesChecks(root, harnessRoot);
  assert.equal(r.infos.length, 0);
  assert.equal(r.checked, 0);

  // trae 落后 → info；cursor 有文件但无标记 → 跳过；claude-code 最新 → 无提示
  await mkdir(join(root, '.trae', 'rules'), { recursive: true });
  await writeFile(join(root, '.trae', 'rules', 'openspec-workflow.md'), await renderOld('trae'));
  await mkdir(join(root, '.cursor', 'rules'), { recursive: true });
  await writeFile(join(root, '.cursor', 'rules', 'openspec-workflow.mdc'), '# 用户自己的');
  await writeFile(join(root, 'CLAUDE.md'), `${BLOCK_BEGIN}\n${await renderIdeRules('claude-code', harnessRoot, harnessVersion)}\n${BLOCK_END}\n`);

  r = await runIdeRulesChecks(root, harnessRoot);
  assert.equal(r.checked, 3);
  assert.equal(r.infos.length, 1);
  assert.match(r.infos[0], /IDE 规则可更新（trae: v0\.0\.1 → v/);
  assert.match(r.infos[0], /openspec ide trae/);

  await rmrf(root);
});

// ---- Phase 3.4：Skill 斜杠命令（plans/phase-3.4-ide-commands-design.md §6）----

const readSkill = async (id) => {
  const { parse } = await import('yaml');
  return parse(await readFile(join(harnessRoot, 'skills', id, 'skill.yaml'), 'utf8'));
};

test('renderCommand: stage 类正文含 workflow run + gate 链路，frontmatter 按 target 差异', async () => {
  const explore = await readSkill('sdd-explore');
  const claude = renderCommand('claude-code', explore, harnessVersion);
  assert.ok(claude.startsWith('---\n'));
  assert.ok(claude.includes('argument-hint: <CHG-ID>'), 'claude-code 应有 argument-hint');
  assert.ok(claude.includes('workflow run --change $ARGUMENTS --stage explore'));
  assert.ok(claude.includes('gate check $ARGUMENTS --stage explore'));
  assert.ok(claude.includes('gate approve $ARGUMENTS --stage explore'));
  assert.ok(claude.includes('skills/sdd-explore/SKILL.md'));
  assert.ok(claude.includes(`openspec-ide-commands: v${harnessVersion} skill:sdd-explore`));
  assert.ok(!claude.includes('--du'), 'explore 不应含 DU 段');

  const trae = renderCommand('trae', explore, harnessVersion);
  assert.ok(trae.startsWith('---\ndescription:'));
  assert.ok(!trae.includes('argument-hint'), 'trae frontmatter 无 argument-hint');
});

test('renderCommand: dev/test 注入 DU 绑定段；utility 类引导 SKILL.md 而非 workflow', async () => {
  const dev = await readSkill('sdd-dev');
  const devCmd = renderCommand('cursor', dev, harnessVersion);
  assert.ok(devCmd.includes('## DU 绑定（必须）'));
  assert.ok(devCmd.includes('--du <DU-ID>'));
  assert.ok(devCmd.includes('openspec du list'));

  const testSkill = await readSkill('sdd-test');
  assert.ok(renderCommand('cursor', testSkill, harnessVersion).includes('## DU 绑定（必须）'));

  for (const id of ['sdd-feature-tree', 'sdd-knowledge', 'sdd-reverse']) {
    const s = await readSkill(id);
    const c = renderCommand('trae', s, harnessVersion);
    assert.ok(!c.includes('workflow run'), `${id} 不应含 workflow run`);
    assert.ok(c.includes(`skills/${id}/SKILL.md`), `${id} 应引用 SKILL.md`);
    assert.ok(c.includes(`skill:${id}`));
  }
});

test('renderCommands: 11 skill × 3 target = 33 个命令文件，路径正确', async () => {
  for (const t of TARGETS) {
    const map = await renderCommands(t, harnessRoot, null, harnessVersion);
    assert.equal(map.size, 11);
    for (const [file, content] of map) {
      assert.ok(file.startsWith(COMMANDS_DIR[t]), `${file} 应位于 ${COMMANDS_DIR[t]}`);
      assert.ok(file.endsWith('.md'));
      assert.ok(content.startsWith('---\n'));
    }
    assert.ok(map.has(join(COMMANDS_DIR[t], 'sdd-explore.md')));
    assert.ok(map.has(join(COMMANDS_DIR[t], 'sdd-knowledge.md')));
  }
});

test('plan/applyIdeCommands: created → 幂等 up-to-date → 旧版本 updated(from/to)', async () => {
  const root = await ws();
  const dest = join(root, '.cursor', 'commands');

  // created（零写入验证）
  let plan = await planIdeCommands(root, 'cursor', harnessRoot, harnessVersion);
  assert.equal(plan.entries.length, 11);
  assert.ok(plan.entries.every((e) => e.action === 'created'));
  await assert.rejects(() => readdir(dest), /ENOENT/);

  // apply → 33 中 11 写入；二次 plan 全 up-to-date
  let r = await applyIdeCommands(root, 'cursor', plan);
  assert.equal(r.written.length, 11);
  assert.ok(r.conflicts.length === 0);
  plan = await planIdeCommands(root, 'cursor', harnessRoot, harnessVersion);
  assert.ok(plan.entries.every((e) => e.action === 'up-to-date'));
  r = await applyIdeCommands(root, 'cursor', plan);
  assert.equal(r.written.length, 0);

  // 模拟旧版本标记 → updated(from/to)
  const exploreFile = join(dest, 'sdd-explore.md');
  const old = (await readFile(exploreFile, 'utf8')).replace(`v${harnessVersion}`, `v${olderVersion}`);
  await writeFile(exploreFile, old);
  plan = await planIdeCommands(root, 'cursor', harnessRoot, harnessVersion);
  const upd = plan.entries.find((e) => e.file === join('.cursor', 'commands', 'sdd-explore.md'));
  assert.equal(upd.action, 'updated');
  assert.equal(upd.from, olderVersion);
  assert.equal(upd.to, harnessVersion);

  await rmrf(root);
});

test('applyIdeCommands: 无标记用户命令文件 → conflict 不覆盖，--force 覆盖', async () => {
  const root = await ws();
  const dir = join(root, '.trae', 'commands');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'sdd-explore.md'), '# 我的自定义 explore 命令\n不要动我');

  const plan = await planIdeCommands(root, 'trae', harnessRoot, harnessVersion);
  const conf = plan.entries.find((e) => e.action === 'conflict');
  assert.ok(conf, '应识别 conflict');
  let r = await applyIdeCommands(root, 'trae', plan);
  assert.deepEqual(r.conflicts, [join('.trae', 'commands', 'sdd-explore.md')]);
  assert.equal(await readFile(join(dir, 'sdd-explore.md'), 'utf8'), '# 我的自定义 explore 命令\n不要动我');

  r = await applyIdeCommands(root, 'trae', plan, { force: true });
  assert.deepEqual(r.conflicts, []);
  assert.ok((await readFile(join(dir, 'sdd-explore.md'), 'utf8')).includes('workflow run'));
  await rmrf(root);
});

test('doctor runIdeRulesChecks: commands 落后聚合为一条 info；未启用不提示', async () => {
  const root = await ws();
  // 未启用 commands → 无提示
  let r = await runIdeRulesChecks(root, harnessRoot);
  assert.equal(r.infos.length, 0);

  // 11 个命令全部当前版本 → 无提示
  const dir = join(root, '.claude', 'commands');
  await mkdir(dir, { recursive: true });
  const map = await renderCommands('claude-code', harnessRoot, null, harnessVersion);
  for (const [f, c] of map) await writeFile(join(root, f), c);
  r = await runIdeRulesChecks(root, harnessRoot);
  assert.equal(r.infos.length, 0);

  // 其中 2 个降版本 → 一条聚合 info
  await writeFile(join(dir, 'sdd-dev.md'), (await readFile(join(dir, 'sdd-dev.md'), 'utf8')).replace(`v${harnessVersion}`, `v${olderVersion}`));
  await writeFile(join(dir, 'sdd-test.md'), (await readFile(join(dir, 'sdd-test.md'), 'utf8')).replace(`v${harnessVersion}`, `v${olderVersion}`));
  r = await runIdeRulesChecks(root, harnessRoot);
  assert.equal(r.infos.length, 1);
  assert.match(r.infos[0], /IDE Skill 命令可更新（claude-code: 2\/11 落后）/);

  await rmrf(root);
});
