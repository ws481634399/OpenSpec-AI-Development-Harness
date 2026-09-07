// IdeRules：生成 Trae / Cursor / Claude Code 项目规则（Phase 3.3 plans/phase-3.3-ide-adapters-design.md §6）
//
// 定位：工作流引导文件（指向 skills/ 与 CLI），不是知识复制——skills 是唯一方法论真相源
// 策略：
// - trae/cursor：独立文件 openspec-workflow.md/.mdc，不存在→生成；有 openspec 标记→版本比对更新；无标记同名文件→conflict（绝不覆盖用户文件）
// - claude-code：CLAUDE.md 标记块注入（<!-- openspec:begin/end -->），块外内容永不修改
// 幂等：渲染内容尾部带版本标记 <!-- openspec-ide-rules: vX.Y.Z -->，compareSemver 判定更新

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { compareSemver } from './version.js';

/** 合法 IDE 目标枚举 */
export const TARGETS = ['trae', 'cursor', 'claude-code', 'codex'];

/** CLAUDE.md / AGENTS.md 标记块协议（块外内容不归 openspec 管理） */
export const BLOCK_BEGIN = '<!-- openspec:begin (managed by openspec ide, do not edit inside) -->';
export const BLOCK_END = '<!-- openspec:end -->';

/** 使用标记块合并协议的 target（项目根 markdown，可能已有用户内容） */
const BLOCK_MERGE_TARGETS = new Set(['claude-code', 'codex']);

/** 各 target 的落位文件（相对 Workspace 根） */
export const TARGET_FILES = {
  trae: join('.trae', 'rules', 'openspec-workflow.md'),
  cursor: join('.cursor', 'rules', 'openspec-workflow.mdc'),
  'claude-code': 'CLAUDE.md',
  codex: 'AGENTS.md',
};

/** 各 target 的模板源文件名（templates/ide/<target>/ 下平铺，与落位路径不同源） */
const TEMPLATE_FILES = {
  trae: 'openspec-workflow.md',
  cursor: 'openspec-workflow.mdc',
  'claude-code': 'CLAUDE.md',
  codex: 'AGENTS.md',
};

const VERSION_MARK_RE = /openspec-ide-rules:\s*v(\d+\.\d+\.\d+)/;

/**
 * 渲染目标模板：读 templates/ide/<target>/ 源文件 + 占位符替换。
 *
 * @param {string} target IDE 目标（trae|cursor|claude-code|codex）
 * @param {string} harnessRoot Harness 根目录
 * @param {string} harnessVersion 当前 Harness 版本
 * @returns {Promise<string>} 渲染后的文件内容（含版本标记）
 * @throws {Error} target 非法或模板缺失
 */
export async function renderIdeRules(target, harnessRoot, harnessVersion) {
  if (!TARGETS.includes(target)) {
    throw new Error(`未知 IDE 目标 '${target}'。合法值: ${TARGETS.join(' | ')}`);
  }
  const src = join(harnessRoot, 'templates', 'ide', target, TEMPLATE_FILES[target]);
  let raw;
  try {
    raw = await readFile(src, 'utf8');
  } catch {
    throw new Error(`IDE 模板缺失: templates/ide/${target}/（CLI 安装不完整）`);
  }
  return raw.replaceAll('{{HARNESS_VERSION}}', harnessVersion);
}

/**
 * 从已生成文件提取 openspec 版本标记。
 * @param {string} content 文件内容
 * @returns {string|null} 版本号（如 '0.2.0'），无标记返回 null
 */
function extractVersionMark(content) {
  const m = content.match(VERSION_MARK_RE);
  return m ? m[1] : null;
}

/**
 * 用渲染内容构造标记块管理的文件完整内容（CLAUDE.md / AGENTS.md）：替换既有标记块，或追加到末尾。
 * @param {string|null} existing 现有文件内容（null=新建）
 * @param {string} rendered 渲染后的标记块内容
 * @returns {string}
 */
function mergeManagedBlock(existing, rendered) {
  if (!existing) return `${BLOCK_BEGIN}\n${rendered}\n${BLOCK_END}\n`;
  const beginIdx = existing.indexOf(BLOCK_BEGIN);
  const endIdx = existing.indexOf(BLOCK_END);
  if (beginIdx !== -1 && endIdx !== -1 && endIdx > beginIdx) {
    // 替换标记块之间内容（含旧块），块外原样保留
    const before = existing.slice(0, beginIdx);
    const after = existing.slice(endIdx + BLOCK_END.length);
    return `${before}${BLOCK_BEGIN}\n${rendered}\n${BLOCK_END}${after}`;
  }
  // 无标记块 → 末尾追加（保证块前有空行分隔）
  const sep = existing.endsWith('\n') ? '\n' : '\n\n';
  return `${existing}${sep}${BLOCK_BEGIN}\n${rendered}\n${BLOCK_END}\n`;
}

/**
 * 计算写入计划（零写入，纯 diff）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} target IDE 目标
 * @param {string} harnessRoot Harness 根目录
 * @param {string} harnessVersion 当前 Harness 版本
 * @returns {Promise<{action:'created'|'updated'|'up-to-date'|'conflict', file:string, from?:string, to?:string, content?:string}>}
 * @throws {Error} target 非法或模板缺失
 */
export async function planIdeRules(workspaceRoot, target, harnessRoot, harnessVersion) {
  const rendered = await renderIdeRules(target, harnessRoot, harnessVersion);
  const file = TARGET_FILES[target];
  const dest = join(workspaceRoot, file);

  let existing = null;
  try {
    existing = await readFile(dest, 'utf8');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  if (existing === null) {
    return { action: 'created', file, content: rendered };
  }

  if (BLOCK_MERGE_TARGETS.has(target)) {
    const cur = extractVersionMark(existing);
    if (cur && compareSemver(cur, harnessVersion) === 0) {
      return { action: 'up-to-date', file };
    }
    return { action: cur ? 'updated' : 'created', file, from: cur ?? undefined, to: harnessVersion, content: rendered };
  }

  // trae/cursor：整文件归属判定
  const cur = extractVersionMark(existing);
  if (!cur) {
    return { action: 'conflict', file, content: rendered }; // 存在但非 openspec 生成
  }
  if (compareSemver(cur, harnessVersion) === 0) {
    return { action: 'up-to-date', file };
  }
  return { action: 'updated', file, from: cur, to: harnessVersion, content: rendered };
}

/**
 * 执行写入（依据 plan 结果）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} target IDE 目标
 * @param {object} plan planIdeRules 的返回值（含 content）
 * @param {{force?: boolean}} [opts] force: 覆盖 trae/cursor 的 conflict 同名文件
 * @returns {Promise<{written:boolean, action:string, file:string, from?:string, to?:string}>}
 */
export async function applyIdeRules(workspaceRoot, target, plan, opts = {}) {
  if (plan.action === 'up-to-date') return { written: false, action: plan.action, file: plan.file };
  if (plan.action === 'conflict' && !opts.force) {
    throw new Error(
      `${plan.file} 已存在且非 OpenSpec 生成（无版本标记）。请重命名或删除后重试，或使用 --force 覆盖。`
    );
  }

  const dest = join(workspaceRoot, plan.file);
  if (BLOCK_MERGE_TARGETS.has(target)) {
    let existing = null;
    try {
      existing = await readFile(dest, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    // rendered 内容是标记块内正文（无外层标记），plan.content 同样只含正文
    const renderedBody = plan.content;
    await writeFile(dest, mergeManagedBlock(existing, renderedBody), 'utf8');
  } else {
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, plan.content, 'utf8');
  }
  return { written: true, action: plan.action, file: plan.file, from: plan.from, to: plan.to };
}
