// FeatureDirname：四级物理目录的纯名字段生成与锚点同步（Phase 3.5 修订 v0.3）
//
// 目录段 = 业务名（用户决策：纯名字，如 平台基座/用户管理/账户能力/用户登录）
// 两大问题与对策：
// 1. 名字漂移：树上改名后旧目录无法凭名字找到 → 以目录内 README.md front-matter 的 id
//    作为锚点；重跑 skeleton/materialize 时按锚点 rename 同步
// 2. 同名冲突：不同 id 的节点拿到同一目录名 → 检测后抛错（不自动加后缀，保持纯名字）

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
 * 按 id 锚点扫描父目录下已存在的节点目录。
 * 锚点 = 目录内 README.md front-matter 的 id 字段（由 skeleton/materialize 生成，受管）。
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
 * 同步节点目录名到期望段名（锚点 rename）。
 *
 * - 锚点命中且名字与期望一致 → 原样返回（幂等）
 * - 锚点命中但名字不同 → rename 到新名字
 * - 目标名字已被其他目录（无锚点或不同锚点）占用 → 抛错（同名冲突）
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
