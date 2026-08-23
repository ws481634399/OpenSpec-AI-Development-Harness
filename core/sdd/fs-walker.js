// fs-walker：递归收集目录文件清单（路径+类型，不读内容）
// 供 ContextAssembler 消费：按 context-rules.yaml[stage].read 列出的目录收集文件清单
// 纯函数，依赖 node:fs/promises 只读扫描，无 CLI/@clack 依赖

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DEFAULT_IGNORE = new Set(['.git', 'node_modules', '.DS_Store', 'Thumbs.db']);

/**
 * 递归收集目录下的文件与子目录清单（相对路径 + 类型）。
 *
 * - 不读文件内容，仅返回路径与类型（file/dir）
 * - 默认忽略 .git、node_modules、.DS_Store、Thumbs.db
 * - 空目录或目录不存在返回空数组
 * - 结果按路径排序（稳定可测）
 *
 * @param {string} rootDir 起始目录绝对路径
 * @param {{ignore?:string[]}} [opts]
 * @returns {Promise<Array<{path:string,type:'file'|'dir'}>>} path 为相对 rootDir 的 POSIX 风格路径
 */
export async function walkDir(rootDir, opts = {}) {
  const ignore = opts.ignore ? new Set([...DEFAULT_IGNORE, ...opts.ignore]) : DEFAULT_IGNORE;
  const result = [];
  await walk(rootDir, rootDir, ignore, result);
  result.sort((a, b) => a.path.localeCompare(b.path));
  return result;
}

/**
 * 递归收集目录下所有文件路径（仅文件，不含目录）。
 * 等价于 walkDir 后过滤 type==='file' 并提取 path。
 *
 * @param {string} rootDir 起始目录绝对路径
 * @param {{ignore?:string[]}} [opts]
 * @returns {Promise<string[]>} 相对路径数组（POSIX 风格）
 */
export async function listFiles(rootDir, opts = {}) {
  const entries = await walkDir(rootDir, opts);
  return entries.filter((e) => e.type === 'file').map((e) => e.path);
}

async function walk(base, dir, ignore, result) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return; // 目录不存在，视为空
    throw e;
  }
  for (const e of entries) {
    if (ignore.has(e.name)) continue;
    const abs = join(dir, e.name);
    const rel = relative(base, abs).replace(/\\/g, '/');
    if (e.isDirectory()) {
      result.push({ path: rel, type: 'dir' });
      await walk(base, abs, ignore, result);
    } else if (e.isFile()) {
      result.push({ path: rel, type: 'file' });
    }
  }
}
