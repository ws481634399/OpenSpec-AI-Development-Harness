// SchemaMigrations：Workspace 配置确定性迁移框架（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.3）
//
// 设计约束：
// - 迁移按 MIGRATIONS 数组顺序执行，每项 guard → migrate；guard 不满足则跳过（幂等）
// - migrate 使用 yaml Document API 改写，保留用户注释
// - 不触碰 standards/ product/ delivery/ implementation/（用户数据）
// - 迁移只写 .sdd/ 下受管 YAML；dryRun=true 时零写入

import { readFile, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, isScalar } from 'yaml';

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

/**
 * 读取 context-rules.yaml 的 version 字段。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<number|null>} version 数值；文件缺失返回 null；字段缺失视为 0.1（Phase 2.6 前格式）
 */
async function readContextRulesVersion(workspaceRoot) {
  const p = join(workspaceRoot, '.sdd', 'context-rules.yaml');
  if (!(await pathExists(p))) return null;
  const doc = parseDocument(await readFile(p, 'utf8'));
  const v = doc.get('version');
  if (v === undefined || v === null) return 0.1;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0.1;
}

/**
 * v0.1 字符串条目 → 结构化条目（{ path, mode: inline }），其余条目不动。
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<string[]>} 被改写的文件（Workspace 相对路径）
 */
async function migrateContextRules(workspaceRoot) {
  const p = join(workspaceRoot, '.sdd', 'context-rules.yaml');
  const doc = parseDocument(await readFile(p, 'utf8'));

  const stages = doc.get('stages');
  if (stages && Array.isArray(stages.items)) {
    // 遍历 stages.<name>.read，字符串项转为结构化 inline 条目
    for (const stageItem of stages.items) {
      const stageVal = stageItem.value;
      if (!stageVal || typeof stageVal.get !== 'function') continue;
      const read = stageVal.get('read');
      if (!read || !Array.isArray(read.items)) continue;
      read.items = read.items.map((item) => {
        if (isScalar(item) && typeof item.value === 'string') {
          return doc.createNode({ path: item.value, mode: 'inline' });
        }
        return item;
      });
    }
  }

  doc.set('version', 0.3);
  await writeFile(p, doc.toString(), 'utf8');
  return [join('.sdd', 'context-rules.yaml')];
}

/**
 * 迁移注册表：顺序执行，新增迁移只能追加到末尾（逐版本迁移，不跳版本）。
 *
 * @type {Array<{id:string, description:string, guard:(ws:string)=>Promise<boolean>, migrate:(ws:string)=>Promise<string[]>}>}
 */
export const MIGRATIONS = [
  {
    id: 'context-rules-v0.3',
    description: 'context-rules.yaml → version 0.3（v0.1 字符串条目转结构化 inline 条目）',
    guard: async (workspaceRoot) => {
      const v = await readContextRulesVersion(workspaceRoot);
      return v !== null && v < 0.3;
    },
    migrate: migrateContextRules,
  },
];

/**
 * 顺序执行全部迁移。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {{dryRun?:boolean}} [opts] dryRun=true 只检测 guard 不执行 migrate
 * @returns {Promise<{executed:Array<{id:string,description:string,files:string[]}>, skipped:Array<{id:string,reason:string}>, dryRun:boolean}>}
 */
export async function runMigrations(workspaceRoot, opts = {}) {
  const dryRun = opts.dryRun === true;
  const executed = [];
  const skipped = [];

  for (const m of MIGRATIONS) {
    let need = false;
    try {
      need = await m.guard(workspaceRoot);
    } catch (e) {
      skipped.push({ id: m.id, reason: `guard 失败: ${e.message}` });
      continue;
    }
    if (!need) {
      skipped.push({ id: m.id, reason: 'guard 不满足（已迁移或不适用）' });
      continue;
    }
    if (dryRun) {
      executed.push({ id: m.id, description: m.description, files: [] });
      continue;
    }
    const files = await m.migrate(workspaceRoot);
    executed.push({ id: m.id, description: m.description, files });
  }

  return { executed, skipped, dryRun };
}
