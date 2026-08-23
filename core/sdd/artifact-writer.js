// ArtifactWriter：读模板 + 填字段 + 写 CHG 目录（保留模板注释）
// 纯函数，依赖 node:fs/promises + yaml parseDocument（保留注释）
// 读 templates/artifacts/<name>.md 模板，填充 front-matter + 替换正文 {{placeholder}}，写入目标目录

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { getHarnessRoot } from '../workspace/harness-root.js';

/**
 * 读 templates/artifacts/<artifactName>.md 模板，
 * 填充 front-matter 字段 + 替换正文 {{placeholder}}，
 * 写入 changeDir/<outputName 或 artifactName>。
 *
 * - front-matter 用 parseDocument + setIn 改写（保留模板注释）
 * - 正文 {{key}} 替换为 replacements[key]（未提供的 placeholder 保留原样）
 * - 模板无 front-matter 时仅做正文替换
 * - changeDir 不存在时自动创建
 *
 * @param {string} changeDir 目标目录绝对路径（CHG 目录或 features 目录）
 * @param {string} artifactName 模板名（如 exploration.md / feature-candidate.md）
 * @param {{frontMatter?:object,replacements?:object,outputName?:string}} [data]
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<string>} 写入文件绝对路径
 * @throws {Error} 模板不存在
 */
export async function writeArtifact(changeDir, artifactName, data = {}, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const raw = await readTemplate(artifactName, root);
  const filled = fillTemplate(raw, data);
  await mkdir(changeDir, { recursive: true });
  const outName = data.outputName || artifactName;
  const outPath = join(changeDir, outName);
  await writeFile(outPath, filled, 'utf8');
  return outPath;
}

/**
 * 填充模板：分离 front-matter 与正文，分别处理。
 *
 * - front-matter（--- 包裹）用 parseDocument + setIn 改写字段（保留注释）
 * - 正文 {{key}} 替换为 replacements[key]
 * - 无 front-matter 时仅做正文替换
 *
 * @param {string} raw 模板原文
 * @param {{frontMatter?:object,replacements?:object}} [data]
 * @returns {string} 填充后的完整文本
 */
export function fillTemplate(raw, { frontMatter = {}, replacements = {} } = {}) {
  // 分离 front-matter（--- 包裹）与正文
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    // 无 front-matter，仅替换正文
    return replaceBody(raw, replacements);
  }
  const fmRaw = fmMatch[1];
  const body = fmMatch[2];
  const doc = parseDocument(fmRaw);
  for (const [k, v] of Object.entries(frontMatter)) {
    if (v !== undefined) doc.setIn([k], v);
  }
  return `---\n${doc.toString()}---\n${replaceBody(body, replacements)}`;
}

/**
 * 读模板文件（Harness 资产）。
 */
async function readTemplate(artifactName, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const templatePath = join(root, 'templates', 'artifacts', artifactName);
  try {
    return await readFile(templatePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Artifact template not found: ${artifactName}`);
    throw e;
  }
}

/**
 * 替换正文中的 {{key}} 占位符。
 * 未提供的 placeholder 保留原样（供外部 Agent 后续填充）。
 */
function replaceBody(body, replacements) {
  let result = body;
  for (const [k, v] of Object.entries(replacements)) {
    if (v === undefined) continue;
    result = result.split(`{{${k}}}`).join(String(v));
  }
  return result;
}
