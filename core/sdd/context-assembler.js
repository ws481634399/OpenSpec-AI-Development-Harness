// ContextAssembler：消费 context-rules.yaml 装配 Workspace Context
// 读 .sdd/context-rules.yaml[stage].read 获取目录列表，用 fs-walker 收集文件，读内容组装 Context
// 纯函数，依赖 node:fs/promises + yaml，无 CLI/@clack 依赖
// stage 名与 context-rules.yaml 对齐：explore/prd/design/task/dev/test/converge

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { walkDir } from './fs-walker.js';

// 单文件最多读取字节数（避免大文件撑爆 Instruction）
const MAX_FILE_BYTES = 16384;

/**
 * 装配指定阶段的 Workspace Context。
 *
 * - 读 .sdd/context-rules.yaml[stage].read 获取目录列表
 * - 用 fs-walker 递归收集各目录文件清单
 * - 读文件内容（截断超长文件）
 * - 返回 { stage, dirs, files } 供 InstructionBuilder 消费
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {string} stage SDD 阶段名（explore/prd/design/task/dev/test/converge）
 * @returns {Promise<{stage:string,dirs:string[],files:Array<{path:string,content:string}>}>}
 * @throws {Error} context-rules.yaml 缺失或 stage 未定义
 */
export async function assembleContext(workspaceRoot, stage) {
  const rulesPath = join(workspaceRoot, '.sdd', 'context-rules.yaml');
  let raw;
  try {
    raw = await readFile(rulesPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error("Context rules not found: .sdd/context-rules.yaml. Run 'openspec init' first.");
    }
    throw e;
  }
  const doc = parse(raw);
  const stageRule = doc?.stages?.[stage];
  if (!stageRule || !Array.isArray(stageRule.read)) {
    throw new Error(`No context rules for stage: ${stage}`);
  }

  // 规范化目录名（去尾斜杠）
  const dirs = stageRule.read.map((d) => String(d).replace(/\/+$/, ''));
  const files = [];

  for (const dir of dirs) {
    const absDir = join(workspaceRoot, dir);
    const entries = await walkDir(absDir);
    for (const e of entries) {
      if (e.type !== 'file') continue;
      const abs = join(absDir, e.path);
      let content = '';
      try {
        content = await readFile(abs, 'utf8');
        if (content.length > MAX_FILE_BYTES) {
          content = content.slice(0, MAX_FILE_BYTES) + '\n... (truncated)';
        }
      } catch {
        content = ''; // 读失败跳过（二进制文件等）
      }
      files.push({ path: `${dir}/${e.path}`, content });
    }
  }

  return { stage, dirs, files };
}
