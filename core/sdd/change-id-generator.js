// ChangeIdGenerator：CHG-XXXX 自增编号（纯函数，依赖 node:fs/promises 只读扫描）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §8.4

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHG_PATTERN = /^CHG-(\d{4})$/;
// 宽松格式（允许 >=4 位数字，默认严格使用 CHG_PATTERN 零填充 4 位）：CHG-NNNN…
export const CHANGE_ID_REGEX = /^CHG-(\d+)$/;
export const CHANGE_ID_HINT = "格式: CHG-<数字>（数字部分至少 4 位，例: CHG-0003）";

/**
 * 扫描指定目录下所有匹配 CHG-XXXX 的目录名，返回编号数字数组。
 * 目录不存在时返回空数组（视为无历史 Change）。
 *
 * @param {string} dir 目录绝对路径
 * @returns {Promise<number[]>} 编号数字数组（如 [1, 3]）
 */
async function scanChangeIds(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return []; // 目录不存在，视为无历史
    throw e;
  }
  const ids = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const m = CHG_PATTERN.exec(e.name);
    if (m) ids.push(parseInt(m[1], 10));
  }
  return ids;
}

/**
 * 生成下一个 CHG-XXXX 编号。
 *
 * 扫描 delivery/changes/ + delivery/archive/ 下所有目录名，
 * 取最大数字 +1，String(n).padStart(4, '0')。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<string>} 如 "CHG-0001"
 */
export async function nextChangeId(workspaceRoot) {
  const changesDir = join(workspaceRoot, 'delivery', 'changes');
  const archiveDir = join(workspaceRoot, 'delivery', 'archive');
  const [liveIds, archivedIds] = await Promise.all([
    scanChangeIds(changesDir),
    scanChangeIds(archiveDir),
  ]);
  const all = [...liveIds, ...archivedIds];
  const max = all.length === 0 ? 0 : Math.max(...all);
  return `CHG-${String(max + 1).padStart(4, '0')}`;
}
