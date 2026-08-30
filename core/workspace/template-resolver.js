// TemplateResolver：在 Harness 根下定位 templates/default-workspace 与 stacks/<stack> overlay
// Phase 3.2：default-workspace 即 Empty 基座（通用工程标准 + SDD 标准），技术栈包在 stacks/ 下按需叠加
import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getHarnessRoot } from './harness-root.js';

/** 合法项目模板枚举（kebab-case，与 Roadmap 名称对应） */
export const STACKS = ['empty', 'spring-cloud', 'vue', 'ai-agent'];

/**
 * 解析 default-workspace 模板目录（openspec init 复制源，Empty 基座）。
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

/**
 * 解析技术栈 overlay 目录（Phase 3.2）。
 *
 * - empty → null（基座已含全部内容，无 overlay）
 * - spring-cloud / vue / ai-agent → templates/stacks/<stack>/ 绝对路径
 * - 未知 stack → 抛错（含合法枚举提示）
 *
 * @param {string} stack 项目模板枚举值
 * @param {string} [harnessRoot] Harness 根目录，默认自动解析
 * @returns {string|null} overlay 目录绝对路径；empty 返回 null
 * @throws {Error} stack 非法或 overlay 目录缺失
 */
export function resolveStackOverlay(stack, harnessRoot = getHarnessRoot()) {
  if (!STACKS.includes(stack)) {
    throw new Error(`未知项目模板 '${stack}'。合法值: ${STACKS.join(' | ')}（可用 --stack 指定）`);
  }
  if (stack === 'empty') return null;
  const dir = join(harnessRoot, 'templates', 'stacks', stack);
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new Error(`Stack overlay not found: templates/stacks/${stack}（CLI 安装不完整）`);
  }
  return dir;
}
