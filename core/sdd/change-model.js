// ChangeModel：Change 数据/目录/metadata 读写 + runChangeCreate（纯函数，依赖 node:fs/promises + yaml）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §8.3/§8.4/§8.5/§8.6
// runChangeCreate 作为纯函数在 Phase 1.3 实现，供 Phase 1.4 sdd-explore 调用

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, parse } from 'yaml';
import { getHarnessRoot } from '../workspace/harness-root.js';
import { nextChangeId } from './change-id-generator.js';

/**
 * 定位 templates/artifacts/metadata.yaml 模板（Harness 资产）。
 * @param {string} harnessRoot
 * @returns {string}
 */
function metadataTemplatePath(harnessRoot) {
  return join(harnessRoot, 'templates', 'artifacts', 'metadata.yaml');
}

/**
 * 读取 CHG 目录的 metadata.yaml，返回对象。
 * @param {string} changeDir CHG 目录绝对路径
 * @returns {Promise<object>} metadata 对象
 * @throws {Error} 文件缺失或解析失败
 */
export async function readMetadata(changeDir) {
  const file = join(changeDir, 'metadata.yaml');
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`Change metadata not found: ${file}`);
    throw e;
  }
  try {
    return parse(raw);
  } catch (e) {
    throw new Error(`Change metadata corrupted: ${file} (parse error: ${e.message})`);
  }
}

/**
 * 用 parseDocument + setIn 改写 metadata.yaml 字段（保留模板注释）。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} patch 要更新的字段（如 { status, 'updated-at': ... }）
 */
export async function patchMetadata(changeDir, patch) {
  const file = join(changeDir, 'metadata.yaml');
  const raw = await readFile(file, 'utf8');
  const doc = parseDocument(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) doc.setIn([k], v);
  }
  await writeFile(file, doc.toString(), 'utf8');
}

/**
 * 扫描 delivery/archive/ 下匹配 requirement 或 title 的历史 Change。
 * 用于 runChangeCreate 写 related-change（§8.6.3 archived 匹配）。
 *
 * @param {string} workspaceRoot
 * @param {{requirement?:string,title?:string}} query
 * @returns {Promise<string|null>} 命中的历史 CHG-XXXX，无匹配返回 null
 */
async function findArchivedMatch(workspaceRoot, { requirement, title }) {
  const archiveDir = join(workspaceRoot, 'delivery', 'archive');
  let entries;
  try {
    entries = await readdir(archiveDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const norm = (s) => String(s || '').trim().toLowerCase();
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const meta = await readMetadata(join(archiveDir, e.name)).catch(() => null);
    if (!meta) continue;
    if (requirement && meta.requirement === requirement) return meta.id || e.name;
    if (title && norm(meta.title) === norm(title)) return meta.id || e.name;
  }
  return null;
}

/**
 * 创建 CHG-XXX 载体（生命周期容器初始化）。
 *
 * 流程（§8.5）：
 * 1. nextChangeId 扫描 changes + archive 取最大 +1
 * 2. mkdir delivery/changes/<id>/evidence/ + references/
 * 3. 读 templates/artifacts/metadata.yaml 模板（保留注释）
 * 4. setIn 填充 id/title/summary/status:created/requirement/created-at/updated-at/repositories
 * 5. 查 archive 关联历史 → 写 related-change（§8.6）
 * 6. 写入 <id>/metadata.yaml
 * 7. 不预创建 requirement/exploration/prd/design/tasks/implementation/convergence（由对应阶段产出）
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {{title:string,summary?:string,requirement?:string,repositories?:string[]}} input
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<{id:string,changeDir:string}>}
 */
export async function runChangeCreate(workspaceRoot, input, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const id = await nextChangeId(workspaceRoot);
  const changeDir = join(workspaceRoot, 'delivery', 'changes', id);
  const evidenceDir = join(changeDir, 'evidence');
  const referencesDir = join(changeDir, 'references');

  await mkdir(changeDir, { recursive: true });
  await mkdir(evidenceDir, { recursive: true });
  await mkdir(referencesDir, { recursive: true });

  // 读模板（保留注释）→ setIn 填充
  const templateRaw = await readFile(metadataTemplatePath(root), 'utf8');
  const doc = parseDocument(templateRaw);
  const now = new Date().toISOString();
  doc.setIn(['id'], id);
  doc.setIn(['title'], input.title || '');
  if (input.summary !== undefined) doc.setIn(['summary'], input.summary);
  doc.setIn(['status'], 'created');
  doc.setIn(['requirement'], input.requirement || '');
  doc.setIn(['created-at'], now);
  doc.setIn(['updated-at'], now);
  if (Array.isArray(input.repositories) && input.repositories.length > 0) {
    doc.setIn(['repositories'], input.repositories.map((r) => r));
  }

  // §8.6.5 查 archive 关联历史（用户提供 requirement 或 title 时）
  if (input.requirement || input.title) {
    const archived = await findArchivedMatch(workspaceRoot, {
      requirement: input.requirement,
      title: input.title,
    });
    if (archived) doc.setIn(['related-change'], archived);
  }

  await writeFile(join(changeDir, 'metadata.yaml'), doc.toString(), 'utf8');
  return { id, changeDir };
}

/**
 * 推进 Change 状态（patch status + updated-at）。
 * 由 openspec change status --set 调用，或 sdd-explore 完成后调用。
 *
 * 注意：本函数只写 metadata，不校验迁移合法性——调用方须先走
 * ChangeStateMachine.validateTransition(from, to)。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} newStatus 目标状态
 */
export async function patchStatus(changeDir, newStatus) {
  await patchMetadata(changeDir, {
    status: newStatus,
    'updated-at': new Date().toISOString(),
  });
}
