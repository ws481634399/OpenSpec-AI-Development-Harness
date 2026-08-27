// SkillRegistry：listSkills / getSkill / syncSkills（基于 SkillLoader）
// 纯函数，依赖 node:fs/promises 只读扫描，无 CLI/@clack 依赖
// 优先从 Workspace skills/ 读取（init 时复制的本地副本），fallback 到 Harness

import { readdir, cp, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHarnessRoot } from '../workspace/harness-root.js';
import { loadSkill } from './skill-loader.js';

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
 * 同步 Harness 内置 skills/ 到 Workspace。
 *
 * 将 Harness 的 skills/ 复制到 Workspace 的 skills/，覆盖现有文件。
 * 用于 init 后更新 Workspace 中的 Skill 副本。
 *
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<{synced:number, details:string[]}>} 同步结果
 */
export async function syncSkills(harnessRoot, workspaceRoot) {
  const srcDir = join(harnessRoot, 'skills');
  const destDir = join(workspaceRoot, 'skills');

  await mkdir(destDir, { recursive: true });
  await cp(srcDir, destDir, { recursive: true, force: true });

  const entries = await readdir(srcDir, { withFileTypes: true });
  const details = entries
    .filter((e) => e.isDirectory())
    .map((e) => `${e.name}: synced`);

  return { synced: details.length, details };
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
