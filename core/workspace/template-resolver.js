// TemplateResolver：在 Harness 根下定位 templates/default-workspace
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getHarnessRoot } from './harness-root.js';

/**
 * 解析 default-workspace 模板目录（openspec init 复制源）。
 *
 * @param {string} [harnessRoot] Harness 根目录，默认自动解析
 * @returns {string} 模板目录绝对路径
 * @throws {Error} 模板目录不存在
 */
export function resolveDefaultWorkspace(harnessRoot = getHarnessRoot()) {
  const dir = join(harnessRoot, 'templates', 'default-workspace');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(
      'Workspace template not found. CLI installation incomplete (missing templates/default-workspace).'
    );
  }
  return dir;
}
