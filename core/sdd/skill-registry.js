// SkillRegistry：listSkills / getSkill / syncSkills（基于 SkillLoader）
// 纯函数，依赖 node:fs/promises 只读扫描，无 CLI/@clack 依赖
// 优先从 Workspace skills/ 读取（init 时复制的本地副本），fallback 到 Harness

import { readdir, cp, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHarnessRoot } from '../workspace/harness-root.js';
import { loadSkill } from './skill-loader.js';
import { parse } from 'yaml';

/**
 * 解析 Skills 根目录。
 *
 * 优先级：Workspace skills/（init 时复制）> Harness skills/（源）。
 * 若 Workspace 有 skills/ 且含 skill.yaml 子目录，视为有效本地副本。
 * 否则 fallback 到 Harness。
 *
 * @param {string} [harnessRoot] Harness 根（测试注入或 fallback）
 * @param {string} [workspaceRoot] Workspace 根（优先）
 * @returns {string} skills 所在根目录
 */
function resolveSkillsRoot(harnessRoot, workspaceRoot) {
  if (workspaceRoot) {
    const wsSkills = join(workspaceRoot, 'skills');
    if (existsSync(join(wsSkills, 'sdd-explore', 'skill.yaml'))) {
      return workspaceRoot;
    }
  }
  return harnessRoot || getHarnessRoot();
}

/**
 * 列出所有 Skill 摘要。
 *
 * 扫描 skills/ 下的目录，每个含 skill.yaml 的视为有效 Skill。
 * 无效目录（无 skill.yaml）静默跳过。
 * 结果按 id 排序（稳定可测）。
 *
 * @param {string} [harnessRoot] 可选，测试注入
 * @param {string} [workspaceRoot] 可选，Workspace 根（优先）
 * @returns {Promise<Array<{id:string,stage:string,description:string,requiresState:string,producesState:string,outputArtifacts:string[],version:string}>>}
 */
export async function listSkills(harnessRoot, workspaceRoot) {
  const root = resolveSkillsRoot(harnessRoot, workspaceRoot);
  const skillsDir = join(root, 'skills');
  let entries;
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const skills = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const loaded = await loadSkill(e.name, root);
      skills.push(toSummary(loaded));
    } catch {
      // 跳过无效 Skill 目录（无 skill.yaml）
    }
  }
  skills.sort((a, b) => a.id.localeCompare(b.id));
  return skills;
}

/**
 * 加载单个 Skill 完整定义（委托 SkillLoader.loadSkill）。
 *
 * @param {string} skillId Skill id
 * @param {string} [harnessRoot] 可选，测试注入
 * @param {string} [workspaceRoot] 可选，Workspace 根（优先）
 * @returns {Promise<object>} loadSkill 返回值
 */
export async function getSkill(skillId, harnessRoot, workspaceRoot) {
  const root = resolveSkillsRoot(harnessRoot, workspaceRoot);
  return loadSkill(skillId, root);
}

/**
 * 读取 skill.yaml 的 version 字段（缺文件/缺字段返回 null）。
 * @param {string} skillDir skill 目录
 * @returns {Promise<string|null>}
 */
async function readSkillVersion(skillDir) {
  try {
    const raw = await readFile(join(skillDir, 'skill.yaml'), 'utf8');
    return parse(raw)?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * 递归收集目录下全部文件的相对路径与字节数。
 * @param {string} dir 根目录
 * @param {string} [prefix] 相对前缀（内部递归用）
 * @returns {Promise<Map<string, number>>} relPath → bytes
 */
async function collectFileSizes(dir, prefix = '') {
  const out = new Map();
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out; // 目录不存在 → 空
  }
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      const sub = await collectFileSizes(join(dir, e.name), rel);
      for (const [k, v] of sub) out.set(k, v);
    } else {
      const st = await stat(join(dir, e.name));
      out.set(rel, st.size);
    }
  }
  return out;
}

/**
 * 对比 Harness 与 Workspace 的 skills 版本（Phase 3.1）。
 *
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<Array<{id:string, workspaceVersion:string|null, harnessVersion:string|null, status:'added'|'updated'|'unchanged'|'local-only'}>>}
 */
export async function diffSkills(harnessRoot, workspaceRoot) {
  const srcDir = join(harnessRoot, 'skills');
  const destDir = join(workspaceRoot, 'skills');
  const harnessIds = new Set();
  let entries;
  try {
    entries = await readdir(srcDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  const result = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    harnessIds.add(e.name);
    const hv = await readSkillVersion(join(srcDir, e.name));
    const wv = await readSkillVersion(join(destDir, e.name));
    const status = wv === null ? 'added' : String(wv) !== String(hv) ? 'updated' : 'unchanged';
    result.push({ id: e.name, workspaceVersion: wv, harnessVersion: hv, status });
  }
  // local-only：Workspace 有而 Harness 无（不删除，仅报告）
  let wsEntries;
  try {
    wsEntries = await readdir(destDir, { withFileTypes: true });
  } catch {
    wsEntries = [];
  }
  for (const e of wsEntries) {
    if (!e.isDirectory() || harnessIds.has(e.name)) continue;
    const wv = await readSkillVersion(join(destDir, e.name));
    result.push({ id: e.name, workspaceVersion: wv, harnessVersion: null, status: 'local-only' });
  }
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

/**
 * 对比 Harness 与 Workspace 的 prompts 文件（Phase 3.1，存在性 + 字节数粗判）。
 *
 * @returns {Promise<Array<{path:string, status:'added'|'updated'|'unchanged'}>>}
 */
export async function diffPrompts(harnessRoot, workspaceRoot) {
  const srcDir = join(harnessRoot, 'templates', 'default-workspace', 'prompts');
  const destDir = join(workspaceRoot, 'prompts');
  const src = await collectFileSizes(srcDir);
  const dest = await collectFileSizes(destDir);
  const result = [];
  for (const [rel, size] of src) {
    if (!dest.has(rel)) result.push({ path: rel, status: 'added' });
    else if (dest.get(rel) !== size) result.push({ path: rel, status: 'updated' });
    else result.push({ path: rel, status: 'unchanged' });
  }
  result.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}

/**
 * 同步 Harness 内置 skills/ 到 Workspace（Phase 3.1：版本对比 + dry-run）。
 *
 * 将 Harness 的 skills/ 复制到 Workspace 的 skills/，覆盖现有文件。
 * 用于 init 后更新 Workspace 中的 Skill 副本。
 *
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceRoot Workspace 根目录
 * @param {{dryRun?:boolean}} [opts] dryRun=true 只对比不复制
 * @returns {Promise<{synced:number, details:string[], changed:string[]}>}
 *   synced = 同步（或 dry-run 下将有变化）的数量；changed = 有实际变化的 skill id
 */
export async function syncSkills(harnessRoot, workspaceRoot, opts = {}) {
  const srcDir = join(harnessRoot, 'skills');
  const destDir = join(workspaceRoot, 'skills');
  const diff = await diffSkills(harnessRoot, workspaceRoot);

  if (!opts.dryRun) {
    await mkdir(destDir, { recursive: true });
    await cp(srcDir, destDir, { recursive: true, force: true });
  }

  const details = diff
    .filter((d) => d.status !== 'local-only')
    .map((d) => {
      if (d.status === 'added') return `${d.id}: added (${d.harnessVersion ?? '?'})`;
      if (d.status === 'updated') return `${d.id}: updated ${d.workspaceVersion} → ${d.harnessVersion}`;
      return `${d.id}: unchanged (${d.harnessVersion ?? '?'})`;
    });
  const localOnly = diff.filter((d) => d.status === 'local-only').map((d) => `${d.id}: local-only（保留，不覆盖）`);
  const changed = diff.filter((d) => d.status === 'added' || d.status === 'updated').map((d) => d.id);

  return { synced: changed.length, details: [...details, ...localOnly], changed };
}

/**
 * 同步 Harness 内置 prompts/ 到 Workspace（Phase 2.3；Phase 3.1 对比 + dry-run）。
 *
 * 将 Harness 的 prompts/ 复制到 Workspace 的 prompts/，覆盖现有文件。
 * 注意：覆盖策略与 skills/ 一致——用户自定义 Prompt 请使用新文件名并修改 skill.yaml 引用。
 *
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceRoot Workspace 根目录
 * @param {{dryRun?:boolean}} [opts] dryRun=true 只对比不复制
 * @returns {Promise<{synced:number, details:string[], changed:string[]}>}
 *   synced = 片段文件数（dry-run 下为将有变化数）；changed = 有实际变化的相对路径
 */
export async function syncPrompts(harnessRoot, workspaceRoot, opts = {}) {
  const srcDir = join(harnessRoot, 'templates', 'default-workspace', 'prompts');
  const destDir = join(workspaceRoot, 'prompts');
  const diff = await diffPrompts(harnessRoot, workspaceRoot);

  if (!opts.dryRun) {
    await mkdir(destDir, { recursive: true });
    await cp(srcDir, destDir, { recursive: true, force: true });
  }

  const details = diff.map((d) =>
    d.status === 'added'
      ? `prompts/${d.path}: added`
      : d.status === 'updated'
        ? `prompts/${d.path}: updated`
        : `prompts/${d.path}: unchanged`
  );
  const changed = diff.filter((d) => d.status !== 'unchanged').map((d) => d.path);

  return { synced: opts.dryRun ? changed.length : diff.length, details, changed };
}

/**
 * 将 loadSkill 返回值转为摘要对象（供 list/show 输出）。
 */
function toSummary(loaded) {
  const y = loaded.yaml || {};
  return {
    id: y.id || loaded.id,
    version: y.version || '',
    stage: y.stage || '',
    description: y.description || '',
    requiresState: y['requires-state'] || '',
    producesState: y['produces-state'] || '',
    outputArtifacts: Array.isArray(y['output-artifacts']) ? y['output-artifacts'] : [],
  };
}
