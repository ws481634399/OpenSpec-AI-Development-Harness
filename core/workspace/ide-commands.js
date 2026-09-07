// IdeCommands：生成三家 IDE 的 Skill 斜杠命令（Phase 3.4 plans/phase-3.4-ide-commands-design.md）
//
// 定位：薄入口——命令正文只引导 Agent 走完整治理链路（workflow run → Instruction → 执行 → gate），
// 不内嵌 SKILL.md 方法论（skills 是唯一真相源，防双份漂移）
// 渲染：由 skills/*/skill.yaml 驱动（id/stage/version/description），无静态命令模板，新增 Skill 自动多命令
// 幂等：与 ide-rules 同策略——尾部版本标记 + created/updated/up-to-date/conflict 四态，conflict 不覆盖

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { compareSemver } from './version.js';
import { listSkills } from '../sdd/skill-registry.js';

/** 各 target 的命令目录（相对 Workspace 根） */
export const COMMANDS_DIR = {
  trae: join('.trae', 'commands'),
  cursor: join('.cursor', 'commands'),
  'claude-code': join('.claude', 'commands'),
};

/** workflow 驱动的 stage 类 Skill 集合（与 workflows/default.yaml stages 一一对应） */
const WORKFLOW_STAGES = new Set(['explore', 'prd', 'design', 'task', 'dev', 'test', 'review', 'converge']);

/** 需要显式 DU 绑定的阶段（Phase 2.7 约束） */
const DU_STAGES = new Set(['dev', 'test']);

const VERSION_MARK_RE = /openspec-ide-commands:\s*v(\d+\.\d+\.\d+)/;

/**
 * 从命令文件内容提取版本标记。
 * @param {string} content 文件内容
 * @returns {string|null} 版本号，无标记返回 null
 */
function extractVersionMark(content) {
  const m = content.match(VERSION_MARK_RE);
  return m ? m[1] : null;
}

/**
 * 渲染单个 Skill 的命令文件内容。
 *
 * stage 类：引导 workflow run → Instruction → 执行 → gate 完整链路
 * utility 类（feature-tree/knowledge/reverse）：引导按 SKILL.md 直接执行（无 lifecycle 推进）
 *
 * @param {string} target IDE 目标
 * @param {{id:string, stage:string, version:string, description:string}} skill Skill 摘要
 * @param {string} harnessVersion 当前 Harness 版本
 * @returns {string} 命令文件内容（含版本标记）
 */
export function renderCommand(target, skill, harnessVersion) {
  const fm = ['---'];
  fm.push(`description: ${skill.description || `OpenSpec SDD ${skill.stage} 阶段`}`);
  if (target === 'claude-code') fm.push('argument-hint: <CHG-ID>');
  fm.push('---');

  const body = [];
  if (WORKFLOW_STAGES.has(skill.stage)) {
    body.push(`对 Change \`$ARGUMENTS\` 执行 OpenSpec SDD **${skill.stage}** 阶段。`);
    body.push('');
    body.push('## 执行步骤');
    body.push(`1. 运行 \`openspec workflow run --change $ARGUMENTS --stage ${skill.stage}\` 获取 Instruction。`);
    body.push('   - 若 `$ARGUMENTS` 为空或不是 CHG-ID，先向用户询问 Change ID。');
    body.push('   - 若返回等待/报错状态，如实向用户转述，不要自行绕过。');
    body.push(`2. 严格按照 Instruction 中的 Prompt 片段与 \`skills/${skill.id}/SKILL.md\` 方法论执行。`);
    body.push('3. 将产物写入 Instruction 指定的 Artifact 路径（写回 Change 目录）。');
    body.push(`4. 运行 \`openspec gate check $ARGUMENTS --stage ${skill.stage}\` 做机器检查；`);
    body.push(`   通过后提示用户执行 \`openspec gate approve $ARGUMENTS --stage ${skill.stage}\`（人工评审）。`);
    if (DU_STAGES.has(skill.stage)) {
      body.push('');
      body.push('## DU 绑定（必须）');
      body.push('本阶段必须绑定 Delivery Unit：运行 `openspec du list` 确认 DU，');
      body.push('执行时追加 `--du <DU-ID>` 参数；未绑定直接运行会报错。');
    }
  } else {
    body.push(`执行 OpenSpec Skill **${skill.id}**（${skill.description || skill.stage}）。`);
    body.push('');
    body.push('## 执行步骤');
    body.push(`1. 阅读 \`skills/${skill.id}/SKILL.md\` 并严格按其方法论执行。`);
    body.push('2. 若该 Skill 需要 Change/Story 上下文而用户未提供，先向用户询问。');
    body.push('3. 将产出写回 SKILL.md 指定位置（Knowledge 类写回 knowledge/ 目录）。');
  }
  body.push('');
  body.push('## 约束');
  body.push('- 不得跳过 Instruction/SKILL.md 自行发挥；不得直接修改 Change 生命周期状态。');
  body.push('- 产物只写入 Change 目录或 SKILL.md 指定位置，不触碰 standards/ product/ 等其他目录。');
  body.push('');
  body.push(`<!-- openspec-ide-commands: v${harnessVersion} skill:${skill.id} -->`);

  return `${fm.join('\n')}\n${body.join('\n')}\n`;
}

/**
 * 渲染 target 的全部 Skill 命令。
 *
 * Skill 清单来自 Workspace skills/（优先，含用户 local-only）回退 Harness——
 * 这样 skill sync 升级后重新 ide 即可让命令内容跟随最新版本。
 *
 * @param {string} target IDE 目标（trae|cursor|claude-code|codex）
 * @param {string} harnessRoot Harness 根目录
 * @param {string|null} workspaceRoot Workspace 根目录（null 时仅用 Harness skills）
 * @param {string} harnessVersion 当前 Harness 版本
 * @returns {Promise<Map<string, string>>} 相对路径 → 渲染内容（codex 等 无 slash command 概念的 target 返回空 Map）
 */
export async function renderCommands(target, harnessRoot, workspaceRoot, harnessVersion) {
  if (!COMMANDS_DIR[target]) {
    return new Map(); // codex 等 无 slash command 概念的 target
  }
  const skills = await listSkills(harnessRoot, workspaceRoot);
  const out = new Map();
  for (const skill of skills) {
    out.set(join(COMMANDS_DIR[target], `${skill.id}.md`), renderCommand(target, skill, harnessVersion));
  }
  return out;
}

/**
 * 计算命令写入计划（零写入，逐文件 diff）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} target IDE 目标
 * @param {string} harnessRoot Harness 根目录
 * @param {string} harnessVersion 当前 Harness 版本
 * @returns {Promise<{entries:Array<{file:string, action:'created'|'updated'|'up-to-date'|'conflict', from?:string, to?:string, content:string}>}>}
 */
export async function planIdeCommands(workspaceRoot, target, harnessRoot, harnessVersion) {
  const rendered = await renderCommands(target, harnessRoot, workspaceRoot, harnessVersion);
  const entries = [];
  for (const [file, content] of rendered) {
    const dest = join(workspaceRoot, file);
    let existing = null;
    try {
      existing = await readFile(dest, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    if (existing === null) {
      entries.push({ file, action: 'created', content });
      continue;
    }
    const cur = extractVersionMark(existing);
    if (!cur) {
      entries.push({ file, action: 'conflict', content }); // 存在但非 openspec 生成
      continue;
    }
    if (compareSemver(cur, harnessVersion) === 0) {
      entries.push({ file, action: 'up-to-date', content });
      continue;
    }
    entries.push({ file, action: 'updated', from: cur, to: harnessVersion, content });
  }
  return { entries };
}

/**
 * 执行命令写入（依据 plan 结果；逐条写入，up-to-date 跳过）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} target IDE 目标
 * @param {object} plan planIdeCommands 返回值
 * @param {{force?: boolean}} [opts] force: 覆盖 conflict 文件
 * @returns {Promise<{written:string[], skipped:Array<{file:string, action:string, from?:string, to?:string}>, conflicts:string[]}>}
 */
export async function applyIdeCommands(workspaceRoot, target, plan, opts = {}) {
  const written = [];
  const skipped = [];
  const conflicts = [];
  for (const entry of plan.entries) {
    if (entry.action === 'up-to-date') {
      skipped.push({ file: entry.file, action: entry.action });
      continue;
    }
    if (entry.action === 'conflict' && !opts.force) {
      conflicts.push(entry.file);
      continue;
    }
    const dest = join(workspaceRoot, entry.file);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, entry.content, 'utf8');
    written.push(entry.file);
    skipped.push({ file: entry.file, action: entry.action, from: entry.from, to: entry.to });
  }
  return { written, skipped, conflicts };
}
