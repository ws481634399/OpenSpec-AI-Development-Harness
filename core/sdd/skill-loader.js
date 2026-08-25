// SkillLoader：从 harnessRoot/skills/<id>/ 加载 Skill 定义（纯函数，依赖 node:fs/promises + yaml）
// 加载 skill.yaml 元数据 + SKILL.md / checklist.md / rules.md 执行说明（可选）
// Skill 属于 Harness 能力，由 getHarnessRoot() 定位，Workspace 不复制源码

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { getHarnessRoot } from '../workspace/harness-root.js';

/**
 * 加载单个 Skill 定义（skill.yaml + SKILL.md + checklist.md + rules.md）。
 *
 * skill.yaml 必须存在（缺失视为 Skill 不存在）。
 * SKILL.md / checklist.md / rules.md 可选，缺失返回空字符串。
 *
 * @param {string} skillId Skill id（如 sdd-explore）
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<{id:string,yaml:object,skillMd:string,checklistMd:string,rulesMd:string,skillDir:string}>}
 * @throws {Error} Skill 不存在（目录或 skill.yaml 缺失）
 */
export async function loadSkill(skillId, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const skillDir = join(root, 'skills', skillId);

  // 校验目录存在
  try {
    const s = await stat(skillDir);
    if (!s.isDirectory()) throw new Error('not a directory');
  } catch (e) {
    throw new Error(`Skill not found: ${skillId}. Run 'openspec skill list'.`);
  }

  // skill.yaml 必须存在
  const yamlRaw = await readRequired(
    join(skillDir, 'skill.yaml'),
    `Skill not found: ${skillId}. Run 'openspec skill list'.`
  );
  const yaml = parse(yamlRaw);

  // 可选文件（SKILL.md / checklist.md / rules.md）
  const [skillMd, checklistMd, rulesMd] = await Promise.all([
    readOptional(join(skillDir, 'SKILL.md')),
    readOptional(join(skillDir, 'checklist.md')),
    readOptional(join(skillDir, 'rules.md')),
  ]);

  return { id: skillId, yaml, skillMd, checklistMd, rulesMd, skillDir };
}

/**
 * 读必需文件，缺失抛指定错误。
 */
async function readRequired(path, errorMsg) {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(errorMsg);
    throw e;
  }
}

/**
 * 读可选文件，缺失返回空字符串。
 */
async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return '';
    throw e;
  }
}
