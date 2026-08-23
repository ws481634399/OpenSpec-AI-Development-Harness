// HarnessRootResolver：向上查找 Harness 根目录（templates/default-workspace + .version 双重标记）
import { existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 从 startDir 向上查找最近含 templates/default-workspace 的目录，
 * 同时要求该目录下存在 .version 文件（双重校验，避免误命中）。
 *
 * @param {string} startDir 起始查找目录
 * @returns {string|null} Harness 根目录绝对路径，找不到返回 null
 */
export function findHarnessRoot(startDir) {
  let dir = resolve(startDir);
  for (;;) {
    const tpl = join(dir, 'templates', 'default-workspace');
    const versionFile = join(dir, '.version');
    if (existsSync(tpl) && statSync(tpl).isDirectory() && existsSync(versionFile)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break; // 已到文件系统根
    dir = parent;
  }
  return null;
}

/**
 * 解析 Harness 根目录。从本模块所在位置（core/workspace/）向上查找。
 *
 * dev 场景：找到仓库根（含 templates/ 与 .version）。
 * 发布场景：找到含 templates 的包根（取决于发布策略，Phase 1.3+ 落实）。
 * 找不到则抛错——CLI 安装不完整。
 *
 * @returns {string} Harness 根目录绝对路径
 * @throws {Error} 找不到 templates/default-workspace
 */
export function getHarnessRoot() {
  const here = dirname(fileURLToPath(import.meta.url)); // .../core/workspace
  const root = findHarnessRoot(here);
  if (!root) {
    throw new Error(
      'Workspace template not found. CLI installation incomplete (missing templates/default-workspace).'
    );
  }
  return root;
}
