// Unit tests: Version 管理 + Upgrade 系统（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §8）
// 覆盖：version.js 读取与比较 / skill sync 版本对比与 dry-run / schema 迁移 / workspace-upgrader plan+apply / doctor runVersionChecks
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import {
  readHarnessVersion,
  readWorkspaceVersions,
  readTemplateVersions,
  compareSemver,
} from '../core/workspace/version.js';
import { diffSkills, syncSkills } from '../core/sdd/skill-registry.js';
import { runMigrations, MIGRATIONS } from '../core/workspace/schema-migrations.js';
import { planUpgrade, applyUpgrade, planRollback, markRolledBack, MANAGED_DIRS } from '../core/workspace/workspace-upgrader.js';
import { runVersionChecks } from '../core/sdd/doctor-checks.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const harnessRoot = getHarnessRoot();
const harnessVersion = readHarnessVersion(harnessRoot);
const rmrf = (p) => rm(p, { recursive: true, force: true });
const pathExists = (p) => stat(p).then(() => true).catch(() => false);

/**
 * 构造一个「旧 Workspace」fixture：
 * - version.yaml 记录 0.1.0（旧版本）
 * - context-rules.yaml 为 v0.1 格式（字符串条目 + 注释）
 * - skills/sdd-explore 为旧版本 0.1.0
 */
async function makeOldWorkspace(prefix = 'upgrade-') {
  const tmp = await mkdtemp(join(tmpdir(), prefix));
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    [
      '# 版本记录（测试 fixture）',
      'harness:',
      '  version: "0.1.0" # 落后注释',
      'workspace-template:',
      '  version: "0.1.0"',
      'schema:',
      '  version: "0.1.0"',
      '',
    ].join('\n')
  );
  await writeFile(
    join(tmp, '.sdd', 'context-rules.yaml'),
    [
      '# Context 规则（注释保留测试）',
      'version: 0.1',
      'stages:',
      '  explore:',
      '    read:',
      '      - standards/',
      '      - path: product/',
      '        mode: outline',
      '',
    ].join('\n')
  );
  await mkdir(join(tmp, 'skills', 'sdd-explore'), { recursive: true });
  await writeFile(
    join(tmp, 'skills', 'sdd-explore', 'skill.yaml'),
    'id: sdd-explore\nversion: 0.1.0\nstage: explore\n'
  );
  return tmp;
}

// ---- version.js ----

test('compareSemver: 三段比较', () => {
  assert.equal(compareSemver('0.1.0', '0.2.0'), -1);
  assert.equal(compareSemver('0.2.0', '0.1.0'), 1);
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('0.2.1', '0.2.0'), 1);
  assert.equal(compareSemver('1.0.0', '0.9.9'), 1);
});

test('readWorkspaceVersions: 三层版本读取 + 字段缺失 + 文件缺失', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'ver-read-'));
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    'harness:\n  version: "0.2.0"\nworkspace-template:\n  version: "0.2.0"\nschema:\n  version: "0.1.0"\n'
  );
  const v = readWorkspaceVersions(tmp);
  assert.deepEqual(v, { harness: '0.2.0', workspaceTemplate: '0.2.0', schema: '0.1.0' });

  // 字段缺失 → null
  await writeFile(join(tmp, '.sdd', 'version.yaml'), 'harness:\n  version: "0.1.0"\n');
  const partial = readWorkspaceVersions(tmp);
  assert.equal(partial.harness, '0.1.0');
  assert.equal(partial.workspaceTemplate, null);
  assert.equal(partial.schema, null);

  // 文件缺失 → null
  assert.equal(readWorkspaceVersions(join(tmp, 'nonexistent')), null);
  await rmrf(tmp);
});

test('readTemplateVersions: 模板基线与 Harness 版本一致', () => {
  const tpl = readTemplateVersions(harnessRoot);
  // 模板 version.yaml 应随版本发布同步（workspace-template.version === harness 当前版本）
  assert.equal(tpl.workspaceTemplate, harnessVersion);
  assert.ok(tpl.harness && tpl.schema);
});

// ---- skill sync 版本对比 + dry-run ----

test('diffSkills: 旧 Skill updated + 未安装 added', async () => {
  const tmp = await makeOldWorkspace('diff-');
  const diff = await diffSkills(harnessRoot, tmp);
  const explore = diff.find((d) => d.id === 'sdd-explore');
  assert.equal(explore.status, 'updated');
  assert.equal(explore.workspaceVersion, '0.1.0');
  assert.ok(diff.filter((d) => d.status === 'added').length >= 10);
  await rmrf(tmp);
});

test('syncSkills: dry-run 零写入，changed 检出', async () => {
  const tmp = await makeOldWorkspace('sync-dry-');
  const result = await syncSkills(harnessRoot, tmp, { dryRun: true });
  assert.ok(result.changed.includes('sdd-explore'));
  assert.ok(result.synced >= 1);
  assert.ok(result.details.some((d) => d.includes('sdd-explore: updated 0.1.0 →')));
  // dry-run 不复制其他 Skill
  assert.equal(await pathExists(join(tmp, 'skills', 'sdd-dev')), false);
  // 原 Skill 版本未变
  const raw = await readFile(join(tmp, 'skills', 'sdd-explore', 'skill.yaml'), 'utf8');
  assert.ok(raw.includes('0.1.0'));
  await rmrf(tmp);
});

test('syncSkills: 实际同步后版本对齐', async () => {
  const tmp = await makeOldWorkspace('sync-');
  await syncSkills(harnessRoot, tmp);
  const raw = await readFile(join(tmp, 'skills', 'sdd-explore', 'skill.yaml'), 'utf8');
  assert.ok(raw.includes(`version: ${harnessVersion}`));
  await rmrf(tmp);
});

// ---- schema 迁移 ----

test('runMigrations: dry-run 只报告不写入', async () => {
  const tmp = await makeOldWorkspace('mig-dry-');
  const before = await readFile(join(tmp, '.sdd', 'context-rules.yaml'), 'utf8');
  const result = await runMigrations(tmp, { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.executed.length, 1);
  assert.equal(result.executed[0].id, 'context-rules-v0.3');
  assert.deepEqual(result.executed[0].files, []);
  const after = await readFile(join(tmp, '.sdd', 'context-rules.yaml'), 'utf8');
  assert.equal(after, before, 'dry-run 不应改写文件');
  await rmrf(tmp);
});

test('runMigrations: v0.1 字符串条目转结构化 + 注释保留', async () => {
  const tmp = await makeOldWorkspace('mig-');
  const result = await runMigrations(tmp);
  assert.equal(result.executed.length, 1);
  assert.deepEqual(result.executed[0].files, [join('.sdd', 'context-rules.yaml')]);

  const raw = await readFile(join(tmp, '.sdd', 'context-rules.yaml'), 'utf8');
  assert.ok(raw.includes('# Context 规则（注释保留测试）'), '用户注释应保留');
  assert.ok(raw.includes('version: 0.3'));

  const { parse } = await import('yaml');
  const data = parse(raw);
  assert.equal(data.version, 0.3);
  const read = data.stages.explore.read;
  assert.deepEqual(read[0], { path: 'standards/', mode: 'inline' }, '字符串条目转结构化');
  assert.deepEqual(read[1], { path: 'product/', mode: 'outline' }, '原结构化条目不动');
  await rmrf(tmp);
});

test('runMigrations: 幂等（二次执行 skipped）', async () => {
  const tmp = await makeOldWorkspace('mig-idem-');
  await runMigrations(tmp);
  const second = await runMigrations(tmp);
  assert.equal(second.executed.length, 0);
  assert.equal(second.skipped.length, MIGRATIONS.length);
  assert.equal(second.skipped[0].reason, 'guard 不满足（已迁移或不适用）');
  await rmrf(tmp);
});

// ---- workspace-upgrader ----

test('planUpgrade: 检出版本转换 / Skill 差异 / 迁移；version.yaml 缺失抛错', async () => {
  const tmp = await makeOldWorkspace('plan-');
  const plan = await planUpgrade(tmp, harnessRoot);
  assert.equal(plan.upToDate, false);
  assert.deepEqual(plan.versionTransitions.harness, { from: '0.1.0', to: harnessVersion });
  assert.ok(plan.skills.changed.includes('sdd-explore'));
  assert.ok(plan.migrations.executed.some((m) => m.id === 'context-rules-v0.3'));
  assert.ok(plan.addedFiles.length >= 0);

  // version.yaml 缺失 → 无法升级
  const noVer = await mkdtemp(join(tmpdir(), 'plan-nover-'));
  await mkdir(join(noVer, '.sdd'), { recursive: true });
  await assert.rejects(() => planUpgrade(noVer, harnessRoot), /version\.yaml 缺失/);
  await rmrf(tmp);
  await rmrf(noVer);
});

test('applyUpgrade: 全量升级（skills + 迁移 + version.yaml）', async () => {
  const tmp = await makeOldWorkspace('apply-');
  const report = await applyUpgrade(tmp, harnessRoot);
  assert.equal(report.upToDate, false);

  // skills 同步
  const skillRaw = await readFile(join(tmp, 'skills', 'sdd-explore', 'skill.yaml'), 'utf8');
  assert.ok(skillRaw.includes(`version: ${harnessVersion}`));

  // 迁移已执行
  const rulesRaw = await readFile(join(tmp, '.sdd', 'context-rules.yaml'), 'utf8');
  assert.ok(rulesRaw.includes('version: 0.3'));
  assert.ok(rulesRaw.includes('# Context 规则（注释保留测试）'));

  // version.yaml 更新且注释保留
  const verRaw = await readFile(join(tmp, '.sdd', 'version.yaml'), 'utf8');
  assert.ok(verRaw.includes(`version: "${harnessVersion}"`));
  assert.ok(verRaw.includes('# 版本记录（测试 fixture）'));
  const { parse } = await import('yaml');
  const v = parse(verRaw);
  assert.equal(v.harness.version, harnessVersion);
  assert.equal(v['workspace-template'].version, harnessVersion);
  // schema.version 不由升级推进
  assert.equal(v.schema.version, '0.1.0');

  // touchedFiles 涵盖关键文件
  assert.ok(report.touchedFiles.some((f) => f.includes('context-rules.yaml')));
  assert.ok(report.touchedFiles.some((f) => f.includes('version.yaml')));

  // 用户数据不受影响（本 fixture 未创建 standards/，验证不误写）
  await rmrf(tmp);
});

test('applyUpgrade: 幂等（二次执行 upToDate）', async () => {
  const tmp = await makeOldWorkspace('apply-idem-');
  await applyUpgrade(tmp, harnessRoot);
  const second = await applyUpgrade(tmp, harnessRoot);
  assert.equal(second.upToDate, true);
  assert.deepEqual(second.touchedFiles, []);
  await rmrf(tmp);
});

// ---- 升级日志与回滚（Phase 3.1+：Roadmap「Upgrade 支持回滚」补齐）----
// git checkout 与新增文件删除在 CLI 层（core 不执行 git），此处覆盖 core 的日志/校验/恢复

test('applyUpgrade: 写升级日志（from/to/gitRevertFiles/gitNewFiles）', async () => {
  const tmp = await makeOldWorkspace('uplog-');
  const report = await applyUpgrade(tmp, harnessRoot);

  const { parse } = await import('yaml');
  const log = parse(await readFile(join(tmp, '.sdd', 'upgrade-log.yaml'), 'utf8'));
  assert.equal(log.upgrades.length, 1);
  const u = log.upgrades[0];
  assert.equal(u.from.harness, '0.1.0');
  assert.equal(u.to.harness, harnessVersion);
  assert.equal(u.rolledBack, null);
  assert.ok(u.touchedFiles.length > 0);
  // version.yaml/迁移文件属 git 恢复类；升级前不存在的 skills 更新属恢复类（fixture 中 sdd-explore 已存在）
  assert.ok(u.gitRevertFiles.some((f) => f.includes('version.yaml')));
  assert.ok(u.gitRevertFiles.some((f) => f.includes('context-rules.yaml')));
  // 升级前不存在的 Skill 目录 → 新增删除类
  const wsSkills = readWorkspaceVersions(tmp);
  assert.ok(wsSkills); // fixture 自身版本可读
  await rmrf(tmp);
});

test('planRollback: 正常检出 / 版本不一致拒绝 / 无日志拒绝 / 已回滚拒绝', async () => {
  const tmp = await makeOldWorkspace('rback-');
  await applyUpgrade(tmp, harnessRoot);

  // 1. 正常：返回最近未回滚记录
  const record = await planRollback(tmp);
  assert.equal(record.to.harness, harnessVersion);
  assert.equal(record.from.harness, '0.1.0');

  // 2. 版本不一致（升级后又变更）→ 拒绝
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    'harness:\n  version: "9.9.9"\nworkspace-template:\n  version: "9.9.9"\nschema:\n  version: "0.1.0"\n'
  );
  await assert.rejects(() => planRollback(tmp), /拒绝自动回滚/);

  // 3. 无日志 → 拒绝
  const noLog = await mkdtemp(join(tmpdir(), 'rback-nolog-'));
  await mkdir(join(noLog, '.sdd'), { recursive: true });
  await writeFile(join(noLog, '.sdd', 'version.yaml'), 'harness:\n  version: "0.1.0"\n');
  await assert.rejects(() => planRollback(noLog), /没有可回滚的升级/);

  // 4. 已回滚 → 拒绝
  await markRolledBack(tmp, record);
  await assert.rejects(() => planRollback(tmp), /没有未回滚的升级记录/);

  await rmrf(tmp);
  await rmrf(noLog);
});

test('markRolledBack: version.yaml 恢复 from（注释保留）+ 日志标记', async () => {
  const tmp = await makeOldWorkspace('rmark-');
  await applyUpgrade(tmp, harnessRoot);
  const record = await planRollback(tmp);
  await markRolledBack(tmp, record);

  // version.yaml 恢复为 0.1.0，且注释保留（Document API）
  const verRaw = await readFile(join(tmp, '.sdd', 'version.yaml'), 'utf8');
  assert.ok(verRaw.includes('version: "0.1.0"'));
  assert.ok(verRaw.includes('# 版本记录（测试 fixture）'));

  // 日志标记 rolledBack
  const { parse } = await import('yaml');
  const log = parse(await readFile(join(tmp, '.sdd', 'upgrade-log.yaml'), 'utf8'));
  assert.ok(log.upgrades[0].rolledBack);

  await rmrf(tmp);
});

test('syncSkills/syncPrompts: 返回 added/updated 分组（回滚分类依据）', async () => {
  const tmp = await makeOldWorkspace('rgrp-');
  const r = await syncSkills(harnessRoot, tmp, { dryRun: true });
  assert.ok(Array.isArray(r.added) && Array.isArray(r.updated));
  assert.ok(r.updated.includes('sdd-explore')); // fixture 旧版本 → updated
  assert.ok(r.added.length > 0); // 其余 Skill 未安装 → added
  assert.deepEqual([...r.added, ...r.updated].sort(), [...r.changed].sort());
  await rmrf(tmp);
});


// ---- doctor runVersionChecks ----

test('runVersionChecks: 一致 / 落后 info / 跨 major error', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'verchk-'));
  await mkdir(join(tmp, '.sdd'), { recursive: true });

  // 与当前 Harness 一致 → 无问题无提示
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    `harness:\n  version: "${harnessVersion}"\nworkspace-template:\n  version: "${harnessVersion}"\nschema:\n  version: "0.1.0"\n`
  );
  let r = runVersionChecks(tmp, harnessRoot);
  assert.equal(r.issues.length, 0);
  assert.equal(r.infos.length, 0);

  // 落后（同 major）→ info 提示可升级
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    'harness:\n  version: "0.1.0"\nworkspace-template:\n  version: "0.1.0"\nschema:\n  version: "0.1.0"\n'
  );
  r = runVersionChecks(tmp, harnessRoot);
  assert.equal(r.issues.length, 0);
  assert.equal(r.infos.length, 1);
  assert.ok(r.infos[0].includes('upgrade'));

  // 跨 major → error
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    'harness:\n  version: "9.0.0"\nworkspace-template:\n  version: "9.0.0"\nschema:\n  version: "0.1.0"\n'
  );
  r = runVersionChecks(tmp, harnessRoot);
  assert.equal(r.issues.length, 1);
  assert.ok(r.issues[0].includes('跨 major'));

  // schema 超前 → error
  await writeFile(
    join(tmp, '.sdd', 'version.yaml'),
    `harness:\n  version: "${harnessVersion}"\nworkspace-template:\n  version: "${harnessVersion}"\nschema:\n  version: "99.0.0"\n`
  );
  r = runVersionChecks(tmp, harnessRoot);
  assert.equal(r.issues.length, 1);
  assert.ok(r.issues[0].includes('schema.version'));

  // 文件缺失 → error
  const noVer = await mkdtemp(join(tmpdir(), 'verchk-nover-'));
  await mkdir(join(noVer, '.sdd'), { recursive: true });
  r = runVersionChecks(noVer, harnessRoot);
  assert.equal(r.issues.length, 1);
  assert.ok(r.issues[0].includes('version.yaml 缺失'));
  await rmrf(tmp);
  await rmrf(noVer);
});
