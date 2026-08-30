// WorkspaceUpgrader：旧 Workspace → 当前 Harness 版本的确定性升级（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.4）
//
// 职责：planUpgrade（差异计算）+ applyUpgrade（执行）
// 边界（受管分级 §5）：
// - skills/ prompts/ 全量覆盖（Harness 拥有，与 skill sync 同策略）
// - .sdd/ 仅补缺失文件 + schema 迁移（不覆盖用户已改内容）
// - standards/ product/ delivery/ implementation/ 绝不触碰
// 回滚依赖 Git：报告 touchedFiles 清单，git checkout -- <files> 即可回滚

import { readFile, writeFile, readdir, mkdir, copyFile, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse, parseDocument, stringify } from 'yaml';
import { readHarnessVersion, readWorkspaceVersions, readTemplateVersions } from './version.js';
import { runMigrations } from './schema-migrations.js';
import { syncSkills, syncPrompts } from '../sdd/skill-registry.js';

const MANAGED_DIRS = ['.sdd', 'skills', 'prompts']; // upgrade 允许写入的顶层目录

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

/**
 * 递归收集目录下全部文件相对路径。
 * @param {string} dir 根目录
 * @param {string} [prefix] 内部递归前缀
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir, prefix = '') {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await collectFiles(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

/**
 * 扫描模板受管目录（.sdd/）中 Workspace 缺失的文件。
 * skills/prompts 由 sync 全量覆盖，不在此列。
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<string[]>} 待补齐文件的 Workspace 相对路径
 */
async function findMissingManagedFiles(harnessRoot, workspaceRoot) {
  const templateSdd = join(harnessRoot, 'templates', 'default-workspace', '.sdd');
  const templateFiles = await collectFiles(templateSdd);
  const missing = [];
  for (const rel of templateFiles) {
    if (!(await pathExists(join(workspaceRoot, '.sdd', rel)))) {
      missing.push(join('.sdd', rel));
    }
  }
  return missing;
}

/**
 * 更新 .sdd/version.yaml 的 harness.version 与 workspace-template.version（Document API 保留注释）。
 * schema.version 不动。
 * @param {string} workspaceRoot Workspace 根目录
 * @param {{harnessVersion:string, templateVersion:string}} v
 */
async function patchWorkspaceVersionYaml(workspaceRoot, { harnessVersion, templateVersion }) {
  const p = join(workspaceRoot, '.sdd', 'version.yaml');
  const doc = parseDocument(await readFile(p, 'utf8'));
  doc.setIn(['harness', 'version'], harnessVersion);
  doc.setIn(['workspace-template', 'version'], templateVersion);
  await writeFile(p, doc.toString(), 'utf8');
}

/**
 * 计算升级计划（零写入）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录
 * @returns {Promise<object>} 升级计划/报告（upToDate=true 表示无需升级）
 * @throws {Error} version.yaml 缺失（Workspace 过旧，无法自动升级）
 */
export async function planUpgrade(workspaceRoot, harnessRoot) {
  const ws = readWorkspaceVersions(workspaceRoot);
  if (!ws) {
    throw new Error('.sdd/version.yaml 缺失，无法自动升级（Workspace 过旧）。请重新 init 或手动补齐版本文件。');
  }
  const harnessVersion = readHarnessVersion(harnessRoot);
  const templateVersion = readTemplateVersions(harnessRoot).workspaceTemplate || harnessVersion;

  const [skillsDiff, promptsDiff, missingFiles, migrations] = await Promise.all([
    syncSkills(harnessRoot, workspaceRoot, { dryRun: true }),
    syncPrompts(harnessRoot, workspaceRoot, { dryRun: true }),
    findMissingManagedFiles(harnessRoot, workspaceRoot),
    runMigrations(workspaceRoot, { dryRun: true }),
  ]);

  const versionTransitions = {
    harness: ws.harness !== harnessVersion ? { from: ws.harness, to: harnessVersion } : null,
    workspaceTemplate: ws.workspaceTemplate !== templateVersion ? { from: ws.workspaceTemplate, to: templateVersion } : null,
  };

  const upToDate =
    !versionTransitions.harness &&
    !versionTransitions.workspaceTemplate &&
    skillsDiff.changed.length === 0 &&
    promptsDiff.changed.length === 0 &&
    missingFiles.length === 0 &&
    migrations.executed.length === 0;

  return {
    upToDate,
    dryRun: true,
    current: ws,
    target: { harnessVersion, templateVersion },
    versionTransitions,
    skills: { changed: skillsDiff.changed, details: skillsDiff.details, added: skillsDiff.added, updated: skillsDiff.updated },
    prompts: { changed: promptsDiff.changed, details: promptsDiff.details, added: promptsDiff.added, updated: promptsDiff.updated },
    addedFiles: missingFiles,
    migrations: { executed: migrations.executed, skipped: migrations.skipped },
    touchedFiles: [],
  };
}

/**
 * 执行升级。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录
 * @returns {Promise<object>} 升级报告（与 planUpgrade 同构，dryRun=false，touchedFiles 列出全部写入路径）
 */
export async function applyUpgrade(workspaceRoot, harnessRoot) {
  const plan = await planUpgrade(workspaceRoot, harnessRoot);
  if (plan.upToDate) return { ...plan, dryRun: false };

  const touched = [];
  const gitRevertFiles = []; // 回滚时 git checkout 恢复（已存在文件的更新）
  const gitNewFiles = []; // 回滚时删除（升级新增的 untracked 文件）

  // a. skills/prompts 同步（全量覆盖策略）
  await syncSkills(harnessRoot, workspaceRoot);
  const skillAdded = plan.skills.added || [];
  const skillUpdated = plan.skills.updated || [];
  for (const id of skillAdded) gitNewFiles.push(join('skills', id));
  for (const id of skillUpdated) gitRevertFiles.push(join('skills', id));
  touched.push(...plan.skills.changed.map((id) => join('skills', id)));

  await syncPrompts(harnessRoot, workspaceRoot);
  for (const rel of plan.prompts.added || []) gitNewFiles.push(join('prompts', rel));
  for (const rel of plan.prompts.updated || []) gitRevertFiles.push(join('prompts', rel));
  touched.push(...plan.prompts.changed.map((rel) => join('prompts', rel)));

  // b. 补齐 .sdd 缺失文件（全新文件 → 回滚时删除）
  for (const rel of plan.addedFiles) {
    const src = join(harnessRoot, 'templates', 'default-workspace', rel);
    const dest = join(workspaceRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    gitNewFiles.push(rel);
    touched.push(rel);
  }

  // c. schema 迁移（内容变更 → git checkout 恢复）
  const migrations = await runMigrations(workspaceRoot);
  for (const m of migrations.executed) {
    for (const f of m.files || []) gitRevertFiles.push(f);
    touched.push(...(m.files || []));
  }

  // d. 更新 version.yaml
  if (plan.versionTransitions.harness || plan.versionTransitions.workspaceTemplate) {
    await patchWorkspaceVersionYaml(workspaceRoot, {
      harnessVersion: plan.target.harnessVersion,
      templateVersion: plan.target.templateVersion,
    });
    gitRevertFiles.push(join('.sdd', 'version.yaml'));
    touched.push(join('.sdd', 'version.yaml'));
  }

  const report = {
    ...plan,
    dryRun: false,
    migrations,
    touchedFiles: [...new Set(touched)],
    gitRevertFiles: [...new Set(gitRevertFiles)],
    gitNewFiles: [...new Set(gitNewFiles)],
  };
  await appendUpgradeLog(workspaceRoot, report);
  return report;
}

// ---- Phase 3.1+: 升级日志与回滚（Roadmap Phase 3「Upgrade 支持回滚」补齐）----
// 日志文件 .sdd/upgrade-log.yaml 机器维护（无注释需求，直接 stringify）。
// 回滚语义（确定性）：
// - 仅允许回滚「最近一次且未回滚」的升级，且当前 version.yaml 必须与该记录的 to 一致
//   （否则说明升级后发生过其他版本变更，拒绝自动回滚）
// - gitRevertFiles 由 CLI 层执行 git checkout（core 不执行 git）；version.yaml 由
//   Document API 恢复 from 值（不依赖 git）；gitNewFiles 由 CLI 层删除

const UPGRADE_LOG = join('.sdd', 'upgrade-log.yaml');

/**
 * 追加升级日志（applyUpgrade 成功后调用）。
 * @param {string} workspaceRoot Workspace 根目录
 * @param {object} report applyUpgrade 报告
 */
export async function appendUpgradeLog(workspaceRoot, report) {
  const p = join(workspaceRoot, UPGRADE_LOG);
  let log = { upgrades: [] };
  try {
    log = parse(await readFile(p, 'utf8')) || { upgrades: [] };
  } catch {
    // 首次升级或文件损坏 → 重新建（损坏的历史日志不可恢复，宁缺勿错）
  }
  log.upgrades.push({
    at: new Date().toISOString(),
    from: report.current || {},
    // 规范化为与 from 同构的版本字段（plan.target 是 { harnessVersion, templateVersion }）
    to: {
      harness: report.target?.harnessVersion,
      workspaceTemplate: report.target?.templateVersion,
    },
    touchedFiles: report.touchedFiles || [],
    gitRevertFiles: report.gitRevertFiles || [],
    gitNewFiles: report.gitNewFiles || [],
    rolledBack: null,
  });
  await writeFile(p, stringify(log), 'utf8');
}

/**
 * 计算回滚（零写入）：取最后一条未回滚记录并校验当前版本一致。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<object>} 日志记录（含 from/to/gitRevertFiles/gitNewFiles）
 * @throws {Error} 无可回滚记录 / 当前版本与记录不一致
 */
export async function planRollback(workspaceRoot) {
  let log;
  try {
    log = parse(await readFile(join(workspaceRoot, UPGRADE_LOG), 'utf8'));
  } catch {
    throw new Error('无升级日志（.sdd/upgrade-log.yaml），没有可回滚的升级。');
  }
  const record = [...(log?.upgrades || [])].reverse().find((u) => !u.rolledBack);
  if (!record) throw new Error('没有未回滚的升级记录。');

  const cur = readWorkspaceVersions(workspaceRoot);
  if (!cur || cur.harness !== String(record.to.harness)) {
    throw new Error(
      `当前 harness 版本（${cur?.harness ?? '?'}）与最近升级记录（→ ${record.to.harness}）不一致，` +
        '升级后已发生其他版本变更，拒绝自动回滚（请手动处理）。'
    );
  }
  return record;
}

/**
 * 执行回滚的 core 部分（CLI 负责 git checkout 与删除新文件后调用）：
 * version.yaml 恢复为升级前值 + 日志标记 rolledBack。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {object} record planRollback 返回的日志记录
 */
export async function markRolledBack(workspaceRoot, record) {
  // 1. version.yaml 恢复 from（Document API，不依赖 git）
  const p = join(workspaceRoot, '.sdd', 'version.yaml');
  if (record.from?.harness != null || record.from?.workspaceTemplate != null) {
    const doc = parseDocument(await readFile(p, 'utf8'));
    if (record.from?.harness != null) doc.setIn(['harness', 'version'], String(record.from.harness));
    if (record.from?.workspaceTemplate != null) {
      doc.setIn(['workspace-template', 'version'], String(record.from.workspaceTemplate));
    }
    await writeFile(p, doc.toString(), 'utf8');
  }

  // 2. 日志标记 rolledBack
  const lp = join(workspaceRoot, UPGRADE_LOG);
  const log = parse(await readFile(lp, 'utf8'));
  const entry = [...(log?.upgrades || [])].reverse().find((u) => !u.rolledBack);
  if (entry) entry.rolledBack = new Date().toISOString();
  await writeFile(lp, stringify(log), 'utf8');
}

export { MANAGED_DIRS };
