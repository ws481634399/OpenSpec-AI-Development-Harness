// GateConfigLoader：从 harnessRoot/skills/<id>/gate.yaml 加载门禁规则（纯函数，依赖 node:fs/promises + yaml）
// 与 skill.yaml 同目录，职责不同：skill.yaml 管 Skill 元数据，gate.yaml 管门禁规则
// 对齐 phase-1.5-workflow-engine-design.md §11

import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { getHarnessRoot } from '../workspace/harness-root.js';

/**
 * 加载指定 Skill 的 gate.yaml 配置。
 *
 * gate.yaml 必须存在（缺失视为该 Skill 未配置门禁，抛错）。
 *
 * @param {string} skillId Skill id（如 sdd-prd）
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<object>} gate.yaml 解析对象（含 stage / artifact / machine-checks / required-* / human-checks）
 * @throws {Error} gate.yaml 不存在或解析失败
 */
export async function loadGate(skillId, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const gatePath = join(root, 'skills', skillId, 'gate.yaml');

  let raw;
  try {
    const s = await stat(gatePath);
    if (!s.isFile()) throw new Error('not a file');
    raw = await readFile(gatePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT' || e.message === 'not a file') {
      throw new Error(`Gate config not found for skill: ${skillId}. Run 'openspec skill show ${skillId}'.`);
    }
    throw e;
  }

  try {
    return parse(raw);
  } catch (e) {
    throw new Error(`Gate config corrupted: ${gatePath} (parse error: ${e.message})`);
  }
}

/**
 * 读取 gate.yaml 原始文件内容（用于 rules-hash 计算）。
 * 与 loadGate 共用文件路径逻辑，但不做 parse，直接返回 utf8 字符串。
 *
 * @param {string} skillId Skill id（如 sdd-prd）
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<string>} gate.yaml 原始内容
 * @throws {Error} gate.yaml 不存在
 */
export async function loadGateRaw(skillId, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const gatePath = join(root, 'skills', skillId, 'gate.yaml');
  try {
    return await readFile(gatePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error(`Gate config not found for skill: ${skillId}. Run 'openspec skill show ${skillId}'.`);
    }
    throw e;
  }
}

/**
 * 列出所有 Skill 的 gate 配置摘要（用于 openspec gate list）。
 * @param {string} [harnessRoot]
 * @returns {Promise<Array<{skillId:string, stage:string, artifact:string}>>}
 */
export async function listGates(harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const { listSkills } = await import('./skill-registry.js');
  const skills = await listSkills(root);
  const result = [];
  for (const s of skills) {
    try {
      const g = await loadGate(s.id, root);
      result.push({ skillId: s.id, stage: g.stage, artifact: g.artifact });
    } catch (e) {
      // Skill 没有 gate.yaml，跳过
    }
  }
  return result;
}
