// ChangeRepository：list/show/findChangeByRequirement 只读扫描（纯函数，依赖 node:fs/promises + yaml）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §6.2/§8.5/§8.6.5

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { readMetadata } from './change-model.js';

const CHG_PATTERN = /^CHG-\d{4}$/;

/**
 * 扫描 delivery/changes/ 下所有 CHG-XXXX 目录，返回摘要清单。
 * 按 updated-at 倒序；可 --status 过滤；跳过损坏目录并汇总。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {{status?:string}} [opts]
 * @returns {Promise<{changes:Array<{id:string,title:string,status:string,changeDir:string,updatedAt:string}>,skipped:number}>}
 */
export async function listChanges(workspaceRoot, opts = {}) {
  const changesDir = join(workspaceRoot, 'delivery', 'changes');
  let entries;
  try {
    entries = await readdir(changesDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { changes: [], skipped: 0 };
    throw e;
  }

  const changes = [];
  let skipped = 0;
  for (const e of entries) {
    if (!e.isDirectory() || !CHG_PATTERN.test(e.name)) continue;
    const changeDir = join(changesDir, e.name);
    const meta = await readMetadata(changeDir).catch(() => null);
    if (!meta) {
      skipped++;
      continue;
    }
    if (opts.status && meta.status !== opts.status) continue;
    // Phase 2.4：feature-path 摘要（STORY id；未绑定为空）
    const fp = meta['feature-path'];
    changes.push({
      id: meta.id || e.name,
      title: meta.title || '',
      status: meta.status || '',
      changeDir,
      updatedAt: meta['updated-at'] || '',
      story: fp?.story?.id || '',
    });
  }
  // 按 updated-at 倒序（空值排末尾）
  changes.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return { changes, skipped };
}

/**
 * 查看 CHG 的 metadata + artifacts 清单。
 *
 * @param {string} workspaceRoot
 * @param {string} id CHG-XXXX
 * @returns {Promise<{metadata:object,artifacts:Array<{name:string,type:string}>,changeDir:string}>}
 * @throws {Error} Change 不存在或 metadata 损坏
 */
export async function showChange(workspaceRoot, id) {
  const changeDir = join(workspaceRoot, 'delivery', 'changes', id);
  const metadata = await readMetadata(changeDir);
  const entries = await readdir(changeDir, { withFileTypes: true });
  const artifacts = entries.map((e) => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
  }));
  return { metadata, artifacts, changeDir };
}

/**
 * 在 changes/ 内按 REQ-XXX 或 title 查找进行中 Change（§8.6.5）。
 * 不扫 archive（archived 仅在用户选择"新建"时由 ChangeModel.runChangeCreate 记 related-change）。
 *
 * 匹配规则：
 * - requirement 字段精确相等
 * - title 字段精确相等（忽略大小写/首尾空白）
 * - 无匹配返回空数组
 *
 * @param {string} workspaceRoot
 * @param {{requirement?:string,title?:string}} query
 * @returns {Promise<Array<{id:string,title:string,status:string,changeDir:string}>>}
 */
export async function findChangeByRequirement(workspaceRoot, { requirement, title } = {}) {
  const { changes } = await listChanges(workspaceRoot);
  const norm = (s) => String(s || '').trim().toLowerCase();
  const result = [];
  for (const c of changes) {
    // 需读 metadata 获取 requirement 字段（listChanges 摘要不含 requirement）
    const meta = await readMetadata(c.changeDir).catch(() => null);
    if (!meta) continue;
    if (requirement && meta.requirement === requirement) {
      result.push({ id: c.id, title: c.title, status: c.status, changeDir: c.changeDir });
      continue;
    }
    if (title && norm(meta.title) === norm(title)) {
      result.push({ id: c.id, title: c.title, status: c.status, changeDir: c.changeDir });
    }
  }
  return result;
}

/**
 * 判断 CHG-XXXX 目录是否存在（用于 show/status/archive 前置校验）。
 * @param {string} workspaceRoot
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function changeExists(workspaceRoot, id) {
  const changeDir = join(workspaceRoot, 'delivery', 'changes', id);
  try {
    const s = await stat(changeDir);
    return s.isDirectory();
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
