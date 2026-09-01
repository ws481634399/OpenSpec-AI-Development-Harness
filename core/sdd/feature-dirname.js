// FeatureDirname：目录段清洗 + CHG 骨架侧锚点辅助（Phase 3.8 精简）
//
// 拆分 responsibilities：
// - featureDirSeg：纯名字段生成（被 CHG 骨架 / features 派生缓存共用）
// - findNodeDirByAnchor / syncNodeDirName：仅服务于 **CHG 骨架侧** 的目录 rename 同步
//   （即 delivery/changes/<CHG>/... 内的四级骨架）。那里 README 锚点机制仍保留
//   （因为 CHG 的目录是长期随 feature-tree 改名而迁移的，不是"派生缓存"概念）。
//
// 注意：product/features/ 侧的 materialize 在方案 D 之后是"先清后重建"，不再使用
//       本文件的锚点 rename 函数（feature-materializer.js 不再 import 它们）。

import { readdir, rename, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

const MAX_SEG_LEN = 50;

/**
 * 生成四级目录中的一个段（纯名字模式）。
 * 非法字符（Windows 文件名限制 + 控制符）替换为 '-'；超长截断；清洗后为空回退 ID。
 *
 * @param {string} id 节点 ID（回退用）
 * @param {string} name 业务名
 * @returns {string}
 */
export function featureDirSeg(id, name) {
  const cleaned = String(name || '')
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, MAX_SEG_LEN)
    .replace(/[. ]+$/, '');
  return cleaned || String(id || 'NODE');
}

/**
 * 按 id 锚点扫描父目录下已存在的节点目录（CHG 骨架专用）。
 * 锚点 = 目录内 README.md front-matter 的 id 字段（由 change-skeleton 生成）。
 *
 * @param {string} parentDir 父目录绝对路径
 * @param {string} nodeId 节点 ID
 * @returns {Promise<{dir:string, name:string}|null>} 命中的目录与其当前段名；无锚点命中返回 null
 */
export async function findNodeDirByAnchor(parentDir, nodeId) {
  let entries;
  try {
    entries = await readdir(parentDir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = join(parentDir, e.name);
    let raw;
    try {
      raw = await readFile(join(dir, 'README.md'), 'utf8');
    } catch {
      continue; // 无 README 的目录不构成锚点
    }
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) continue;
    let fm;
    try {
      fm = parse(m[1]);
    } catch {
      continue;
    }
    if (fm?.id === nodeId) return { dir, name: e.name };
  }
  return null;
}

/**
 * 同步节点目录名到期望段名（锚点 rename，CHG 骨架专用）。
 *
 * - 锚点命中且名字与期望一致 → 原样返回（幂等）
 * - 锚点命中但名字不同 → rename 到新名字
 * - 目标名字已被其他目录占用 → 抛错（同名冲突）
 * - 无锚点命中 → 返回 null（调用方走新建路径）
 *
 * @param {string} parentDir
 * @param {string} nodeId
 * @param {string} expectedSeg 期望目录段名
 * @returns {Promise<{dir:string, renamed:boolean}|null>}
 */
export async function syncNodeDirName(parentDir, nodeId, expectedSeg) {
  const hit = await findNodeDirByAnchor(parentDir, nodeId);
  if (!hit) return null;

  if (hit.name === expectedSeg) return { dir: hit.dir, renamed: false };

  const target = join(parentDir, expectedSeg);
  let targetExists = false;
  try {
    await readFile(join(target, 'README.md'), 'utf8');
    targetExists = true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (targetExists) {
    const err = new Error(
      `目录名冲突：'${expectedSeg}' 已被其他节点占用（节点 ${nodeId} 无法 rename，请检查特性树中的重名）`
    );
    err.code = 'EDIRCONFLICT';
    throw err;
  }
  await rename(hit.dir, target);
  return { dir: target, renamed: true };
}
