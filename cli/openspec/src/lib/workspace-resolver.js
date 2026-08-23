// WorkspaceResolver：从 cwd 向上查找含 .sdd/ 的目录（CLI 层辅助，后续 doctor 复用）
import { existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

/**
 * 从 startDir 向上查找最近含 .sdd/ 的目录。
 *
 * @param {string} [startDir] 起始查找目录，默认 process.cwd()
 * @returns {string} Workspace 根目录绝对路径
 * @throws {Error} 找不到 .sdd/（提示先跑 openspec init）
 */
export function resolveWorkspaceRoot(startDir) {
  let dir = resolve(startDir || process.cwd());
  for (;;) {
    const sdd = join(dir, '.sdd');
    if (existsSync(sdd) && statSync(sdd).isDirectory()) return dir;
    const parent = dirname(dir);
    if (parent === dir) break; // 已到文件系统根
    dir = parent;
  }
  throw new Error("Not an OpenSpec Workspace (no .sdd/ found). Run 'openspec init' first.");
}
