// PromptLoader：加载 prompts/ 提示片段（Phase 2.3）
// 片段是可复用提示资产：front-matter（name/category/version/purpose）+ 正文（Role/Task/Output/Constraints）
// 解析顺序：Workspace prompts/（init 时复制，用户可自定义）优先，fallback Harness prompts/（源）
// 引用格式：skill.yaml 的 prompts 字段，条目形如 'common/constraints'（相对 prompts/，不含 .md）

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getHarnessRoot } from '../workspace/harness-root.js';
import { listSkills } from './skill-registry.js';
import { loadSkill } from './skill-loader.js';

/**
 * 解析 Harness 的 prompts/ 根（片段源在 default-workspace 模板内）。
 * @param {string} harnessRoot Harness 根目录
 * @returns {string} 含 prompts/ 的目录
 */
function harnessPromptsBase(harnessRoot) {
  return join(harnessRoot, 'templates', 'default-workspace');
}

/**
 * 解析片段文件原始文本为结构化对象。
 *
 * front-matter 用 '---' 围栏包裹的 YAML，缺失时返回空元数据 + 全文 body。
 *
 * @param {string} ref 引用路径（如 'common/constraints'）
 * @param {string} raw 文件原文
 * @returns {{ref:string,name:string,category:string,version:string,purpose:string,body:string}}
 */
export function parsePromptRaw(ref, raw) {
  const normalized = raw.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return { ref, name: ref, category: '', version: '', purpose: '', body: normalized.trim() };
  }
  // 延迟 import 已在顶部；此处手动解析 key: value 简单结构，避免整段 YAML 依赖
  // front-matter 值均为单行字符串，逐行解析即可
  const meta = {};
  for (const line of match[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) meta[key] = value;
  }
  return {
    ref,
    name: meta.name || ref,
    category: meta.category || '',
    version: meta.version || '',
    purpose: meta.purpose || '',
    body: normalized.slice(match[0].length).trim(),
  };
}

/**
 * 从单个根目录加载 Prompt 片段。
 *
 * @param {string} root 根目录（Workspace 或 Harness）
 * @param {string} ref 引用路径，如 'common/constraints'（无 .md 后缀）
 * @returns {Promise<object|null>} 片段对象；文件不存在返回 null（不抛错）
 */
export async function loadPrompt(root, ref) {
  const safeRef = String(ref || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!safeRef || safeRef.includes('..')) return null; // 防路径穿越
  const file = join(root, 'prompts', `${safeRef}.md`);
  try {
    const raw = await readFile(file, 'utf8');
    return parsePromptRaw(safeRef, raw);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * 按 skill.yaml 的 prompts 字段解析全部片段。
 *
 * 逐条优先尝试 Workspace prompts/，缺失时 fallback Harness prompts/（与 skills 同模式）。
 * 全部缺失的条目收集到 missing，不抛错（由调用方决定告警策略）。
 *
 * @param {object} skill loadSkill 返回值（yaml.prompts 为引用列表）
 * @param {object} [opts] { harnessRoot, workspaceRoot }
 * @returns {Promise<{prompts:Array<object>,missing:string[]}>}
 */
export async function resolvePrompts(skill, opts = {}) {
  const harnessRoot = opts.harnessRoot || getHarnessRoot();
  const harnessBase = harnessPromptsBase(harnessRoot);
  const refs = Array.isArray(skill?.yaml?.prompts) ? skill.yaml.prompts : [];
  const prompts = [];
  const missing = [];
  for (const ref of refs) {
    let loaded = null;
    if (opts.workspaceRoot && existsSync(join(opts.workspaceRoot, 'prompts'))) {
      loaded = await loadPrompt(opts.workspaceRoot, ref);
    }
    if (!loaded) {
      loaded = await loadPrompt(harnessBase, ref);
    }
    if (loaded) {
      prompts.push(loaded);
    } else {
      missing.push(ref);
    }
  }
  return { prompts, missing };
}

/**
 * 引用一致性检查：11 个 skill.yaml 的 prompts 条目 + SKILL.md 顶部引用行。
 *
 * ① 每个 skill.yaml prompts 条目在 Harness prompts/ 下均有对应文件
 * ② 各 SKILL.md 顶部「提示片段」引用行与 skill.yaml prompts 列表一致
 *
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<string[]>} issues（空数组 = 全部一致）
 */
export async function checkPromptRefs(harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const issues = [];
  const skills = await listSkills(root);
  for (const summary of skills) {
    const id = summary.id;
    const loaded = await loadSkill(id, root);
    const refs = Array.isArray(loaded.yaml?.prompts) ? loaded.yaml.prompts : [];

    // ① 条目文件存在性（Harness 片段源在 default-workspace 模板内）
    const promptsBase = harnessPromptsBase(root);
    for (const ref of refs) {
      const file = join(promptsBase, 'prompts', `${String(ref).replace(/\\/g, '/')}.md`);
      try {
        await readFile(file, 'utf8');
      } catch {
        issues.push(`${id}: prompts 引用不存在: ${ref}`);
      }
    }

    // ② SKILL.md 引用行一致性（引用行格式：prompts/<ref>.md 以 · 分隔）
    const refLineMatch = loaded.skillMd.match(/^> 提示片段[:：]\s*(.+)$/m);
    if (refs.length === 0) {
      if (refLineMatch) issues.push(`${id}: SKILL.md 有引用行但 skill.yaml 无 prompts 字段`);
      continue;
    }
    if (!refLineMatch) {
      issues.push(`${id}: skill.yaml 有 prompts 字段但 SKILL.md 缺少「提示片段」引用行`);
      continue;
    }
    const mdRefs = [...refLineMatch[1].matchAll(/prompts\/([\w/-]+)\.md/g)].map((m) => m[1]);
    const yamlSet = [...refs].sort().join(',');
    const mdSet = [...mdRefs].sort().join(',');
    if (yamlSet !== mdSet) {
      issues.push(`${id}: prompts 引用不一致 skill.yaml=[${yamlSet}] SKILL.md=[${mdSet}]`);
    }
  }
  return issues;
}
