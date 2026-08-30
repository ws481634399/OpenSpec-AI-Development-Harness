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
import { parseDocument } from 'yaml';
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
    skills: { changed: skillsDiff.changed, details: skillsDiff.details },
    prompts: { changed: promptsDiff.changed, details: promptsDiff.details },
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

  // a. skills/prompts 同步（全量覆盖策略）
  await syncSkills(harnessRoot, workspaceRoot);
  touched.push(...plan.skills.changed.map((id) => join('skills', id)));
  await syncPrompts(harnessRoot, workspaceRoot);
  touched.push(...plan.prompts.changed.map((rel) => join('prompts', rel)));

  // b. 补齐 .sdd 缺失文件
  for (const rel of plan.addedFiles) {
    const src = join(harnessRoot, 'templates', 'default-workspace', rel);
    const dest = join(workspaceRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    touched.push(rel);
  }

  // c. schema 迁移
  const migrations = await runMigrations(workspaceRoot);
  for (const m of migrations.executed) touched.push(...(m.files || []));

  // d. 更新 version.yaml
  if (plan.versionTransitions.harness || plan.versionTransitions.workspaceTemplate) {
    await patchWorkspaceVersionYaml(workspaceRoot, {
      harnessVersion: plan.target.harnessVersion,
      templateVersion: plan.target.templateVersion,
    });
    touched.push(join('.sdd', 'version.yaml'));
  }

  return { ...plan, dryRun: false, migrations, touchedFiles: [...new Set(touched)] };
}

export { MANAGED_DIRS };
