// SkillRegistry：listSkills / getSkill 只读扫描（基于 SkillLoader）
// 纯函数，依赖 node:fs/promises 只读扫描，无 CLI/@clack 依赖
// 扫描 harnessRoot/skills/ 下所有含 skill.yaml 的目录

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getHarnessRoot } from '../workspace/harness-root.js';
import { loadSkill } from './skill-loader.js';

/**
 * 列出所有 Skill 摘要。
 *
 * 扫描 harnessRoot/skills/ 下的目录，每个含 skill.yaml 的视为有效 Skill。
 * 无效目录（无 skill.yaml）静默跳过。
 * 结果按 id 排序（稳定可测）。
 *
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<Array<{id:string,stage:string,description:string,requiresState:string,producesState:string,outputArtifacts:string[],version:string}>>}
 */
export async function listSkills(harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
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
 * @returns {Promise<object>} loadSkill 返回值
 */
export async function getSkill(skillId, harnessRoot) {
  return loadSkill(skillId, harnessRoot);
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
