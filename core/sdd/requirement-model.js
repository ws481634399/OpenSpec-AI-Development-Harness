// RequirementModel：REQ 结构定义与解析（纯函数，依赖 node:fs/promises + yaml）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §7.3
// v0.1 不维护独立 requests 目录——Requirement 作为 Change metadata 来源 + CHG 内 requirement.md

import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';

/**
 * REQ-XXX 标识正则（如 REQ-001）。
 */
export const REQ_ID_PATTERN = /^REQ-\d{3,4}$/;

/**
 * 从需求名称生成稳定的 REQ 标识（v0.1 简化：用户显式提供或留空，不自动生成）。
 * 保留接口供后续 LLM 阶段扩展。
 *
 * @param {string} name 需求名称
 * @returns {string} REQ-XXX 或空字符串
 */
export function requirementId(name) {
  // v0.1 不自动生成 REQ-XXX：由 sdd-explore 接收用户显式标识或直接需求文本
  // 此函数保留接口，供后续阶段实现自动编号
  if (!name) return '';
  const m = name.match(REQ_ID_PATTERN);
  return m ? m[0] : '';
}

/**
 * 判断字符串是否为合法 REQ-XXX 标识。
 * @param {string} s
 * @returns {boolean}
 */
export function isRequirementId(s) {
  return typeof s === 'string' && REQ_ID_PATTERN.test(s);
}

/**
 * 解析 CHG 目录内的 requirement.md front-matter，返回 REQ 结构。
 *
 * requirement.md 结构：
 * ---
 * id: REQ-001
 * name: 新增智能商品推荐功能
 * content: <需求原文>
 * source: user
 * created-at: 2026-08-23T...
 * ---
 * # Requirement
 * <正文>
 *
 * @param {string} filePath requirement.md 绝对路径
 * @returns {Promise<{id:string,name:string,content:string,source:string,createdAt:string}>}
 * @throws {Error} 文件缺失或无 front-matter
 */
export async function parseRequirement(filePath) {
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Requirement file not found: ${filePath}`);
    throw e;
  }
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!m) throw new Error(`Requirement file has no front-matter: ${filePath}`);
  const fm = parse(m[1]);
  return {
    id: fm.id || '',
    name: fm.name || '',
    content: fm.content || '',
    source: fm.source || 'user',
    createdAt: fm['created-at'] || '',
  };
}
