// FeatureModel：feature-tree.yaml 读取/节点查找/ID 生成（纯函数，依赖 node:fs/promises + yaml）
// Phase 2.4（plans/phase-2.4-multi-repository-delivery-design.md §8）：
//
// Schema v2（磁盘格式）：product + features（L1）→ children（L2）→ children（L3）→ stories
//   ID 层级嵌套编码：FEAT-001 / FEAT-001-02 / FEAT-001-02-03 / STORY-001-02-03-01
// Schema v1（磁盘格式，兼容读取）：product + modules → features → stories
//   ID 前缀：MOD- / FEAT- / STORY-
//
// 内存统一视图（本模块所有函数的输入输出）：
// {
//   product: { name, description },
//   schema: 1 | 2,
//   modules: [                      // L1 节点数组（字段名保留 modules 以兼容旧调用方）
//     { id, name, description, children: [       // L2
//         { id, name, children: [                // L3（v2 独有）
//             { id, name, stories: [ {id,name,description,status} ] } ] },
//         stories: [...] ] } ]                   // v1 兼容：story 可直挂 L2
// }
//
// 写入见 feature-writer.js（统一写 v2；v1 文件首次写入时自动升级）

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * 读取 product/feature-tree.yaml，返回内存统一视图。
 * v1 / v2 磁盘格式均投影为统一视图（v1: module→L1, feature→L2, story 直挂 L2.stories）。
 * 文件不存在返回空树（schema: 2, modules: []）。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<{product:{name:string,description:string}, schema:number, modules:Array<object>}>}
 */
export async function readFeatureTree(workspaceRoot) {
  const filePath = join(workspaceRoot, 'product', 'feature-tree.yaml');
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { product: { name: '', description: '' }, schema: 2, modules: [] };
    throw e;
  }
  const doc = parse(raw);
  return normalizeTree(doc);
}

/**
 * 将 v1/v2 原始 YAML 对象投影为内存统一视图（纯函数，供测试与读取复用）。
 * @param {object|null} doc parse 后的 YAML 对象
 * @returns {{product:{name:string,description:string}, schema:number, modules:Array<object>}}
 */
export function normalizeTree(doc) {
  const product = {
    name: doc?.product?.name || '',
    description: doc?.product?.description || '',
  };

  // v2：features → children → children → stories
  if (Array.isArray(doc?.features)) {
    const modules = doc.features.map((l1) => ({
      ...pickNode(l1),
      children: (Array.isArray(l1?.children) ? l1.children : []).map((l2) => ({
        ...pickNode(l2),
        children: (Array.isArray(l2?.children) ? l2.children : []).map((l3) => ({
          ...pickNode(l3),
          stories: (Array.isArray(l3?.stories) ? l3.stories : []).map(pickStory),
        })),
        // v2 规范中 story 只挂 L3；但允许 L2.stories（v1 升级过渡形态）
        ...(Array.isArray(l2?.stories) ? { stories: l2.stories.map(pickStory) } : {}),
      })),
    }));
    return { product, schema: 2, modules };
  }

  // v1：modules → features → stories
  const modules = (Array.isArray(doc?.modules) ? doc.modules : []).map((mod) => ({
    ...pickNode(mod),
    children: (Array.isArray(mod?.features) ? mod.features : []).map((feat) => ({
      ...pickNode(feat),
      stories: (Array.isArray(feat?.stories) ? feat.stories : []).map(pickStory),
    })),
  }));
  return { product, schema: 1, modules };
}

function pickNode(n) {
  return { id: n?.id || '', name: n?.name || '', description: n?.description || '' };
}
function pickStory(n) {
  return {
    id: n?.id || '',
    name: n?.name || '',
    description: n?.description || '',
    status: n?.status || 'planned',
  };
}

/**
 * 递归遍历统一视图：L1 → children(L2) → children(L3) → stories（含 L2.stories 兼容）。
 * @param {Array} levels L1 节点数组（tree.modules）
 * @yields {{node:object, level:'l1'|'l2'|'l3'|'story', parent?:object}}
 */
export function* walkLevels(levels) {
  if (!Array.isArray(levels)) return;
  for (const l1 of levels) {
    yield { node: l1, level: 'l1' };
    for (const l2 of l1.children || []) {
      yield { node: l2, level: 'l2', parent: l1 };
      for (const l3 of l2.children || []) {
        yield { node: l3, level: 'l3', parent: l2 };
        for (const story of l3.stories || []) {
          yield { node: story, level: 'story', parent: l3 };
        }
      }
      for (const story of l2.stories || []) {
        yield { node: story, level: 'story', parent: l2 };
      }
    }
  }
}

/** 兼容旧接口：等价 walkLevels（v1 时代三级遍历的泛化版）。 */
export function* walkModules(levels) {
  yield* walkLevels(levels);
}

/**
 * 按 Story ID 查找完整四级链（L1→L2→L3→Story）。
 * 缺陷 9 修复：v1 过渡形态（story 直挂 L2）必须独立于 L3 循环检查——
 * 若嵌套在 L3 循环内，L2 无 L3 子节点时循环体不执行，直挂 story 永远匹配不到。
 * @param {{modules:Array}} tree
 * @param {string} storyId
 * @returns {{'level-1':object, 'level-2':object, 'level-3':object, story:object}|null}
 *   level-3 为 { id:'', name:'' } 表示 story 直挂 L2（v1 过渡形态）
 */
export function findStoryChain(tree, storyId) {
  if (!storyId) return null;
  for (const l1 of tree?.modules || []) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        for (const story of l3.stories || []) {
          if (story.id === storyId) {
            return { 'level-1': l1, 'level-2': l2, 'level-3': l3, story };
          }
        }
      }
      // v1 过渡：story 直挂 L2（L3 之外独立检查，保证无 L3 子节点时也能命中）
      for (const story of l2.stories || []) {
        if (story.id === storyId) {
          return { 'level-1': l1, 'level-2': l2, 'level-3': { id: '', name: '' }, story };
        }
      }
    }
  }
  return null;
}

/**
 * 按任意层级 ID 查找节点。
 * @param {{modules:Array}} tree
 * @param {string} id
 * @returns {object|null}
 */
export function findNodeById(tree, id) {
  if (!id) return null;
  for (const { node } of walkLevels(tree.modules)) {
    if (node.id === id) return node;
  }
  return null;
}

/**
 * 按名称查找节点（模糊匹配，忽略大小写/首尾空白），返回第一个匹配。
 * @param {{modules:Array}} tree
 * @param {string} name
 * @returns {object|null}
 */
export function findNodeByName(tree, name) {
  if (!name) return null;
  const norm = (s) => String(s || '').trim().toLowerCase();
  for (const { node } of walkLevels(tree.modules)) {
    if (norm(node.name) === norm(name)) return node;
  }
  return null;
}

/**
 * 兼容旧接口：在树中查找节点（id 精确优先，name 模糊次之）。
 * @param {{modules:Array}} tree
 * @param {{id?:string,name?:string}} query
 * @returns {object|null}
 */
export function findFeature(tree, { id, name } = {}) {
  if (id) return findNodeById(tree, id);
  if (name) return findNodeByName(tree, name);
  return null;
}

/**
 * 解析 ID 编码为 { prefix, segs }。
 * v2 嵌套编码：FEAT-001-02-03 → { prefix:'FEAT', segs:['001','02','03'] }
 * v1 前缀编码：MOD-USER / FEAT-USER-AUTH → { prefix:'MOD', segs:[] }（无纯数字段）
 * STORY-001-02-03-01 → { prefix:'STORY', segs:['001','02','03','01'] }
 *
 * @param {string} id
 * @returns {{prefix:string, segs:string[]}}
 */
export function parseIdChain(id) {
  const m = /^(MOD|FEAT|STORY|DU)-((?:\d{1,4})(?:-\d{1,4})*)$/.exec(String(id || ''));
  if (!m) return { prefix: String(id || '').split('-')[0] || '', segs: [] };
  return { prefix: m[1], segs: m[2].split('-') };
}

/**
 * 判断节点层级。
 * v2 嵌套 ID 按段数：FEAT-001(1段)→l1；FEAT-001-02(2段)→l2；FEAT-001-02-03(3段)→l3；
 * STORY-*（任意段数）→story。
 * v1 前缀兼容：MOD-→l1；FEAT-（非纯数字段）→l2；STORY-→story。
 * 回退：按子节点 key 判断。
 *
 * @param {object} node
 * @returns {'l1'|'l2'|'l3'|'story'|'unknown'}
 */
export function nodeLevel(node) {
  if (!node) return 'unknown';
  const { prefix, segs } = parseIdChain(node.id);
  if (prefix === 'STORY') return 'story';
  if (prefix === 'FEAT') {
    if (segs.length === 0) return 'l2'; // v1 FEAT-XXX
    if (segs.length === 1) return 'l1';
    if (segs.length === 2) return 'l2';
    return 'l3';
  }
  if (prefix === 'MOD') return 'l1';
  // 回退：按子节点 key
  if (Array.isArray(node.stories)) return 'l3';
  if (Array.isArray(node.children)) return 'l2';
  return 'unknown';
}

/**
 * 返回节点在树中的完整路径（如 "电商平台 > 用户中心 > 账户能力 > 用户认证 > 用户注册"）。
 * @param {{product:{name:string},modules:Array}} tree
 * @param {string} id
 * @returns {string}
 */
export function nodePath(tree, id) {
  const parts = [];
  if (tree.product?.name) parts.push(tree.product.name);

  function search(nodes) {
    if (!Array.isArray(nodes)) return false;
    for (const n of nodes) {
      parts.push(n.name || n.id);
      if (n.id === id) return true;
      if (search(n.children || [])) return true;
      if (search(n.stories || [])) return true;
      parts.pop();
    }
    return false;
  }

  search(tree.modules);
  return parts.join(' > ');
}

/**
 * 兼容旧接口：返回节点路径。
 * @param {{product:{name:string},modules:Array}} tree
 * @param {object} target
 * @returns {string}
 */
export function featurePath(tree, target) {
  if (!target) return '';
  return nodePath(tree, target.id);
}

/**
 * v2 嵌套编码 ID 生成（Phase 2.4 §8）：
 * - l1: FEAT-<nnn>（001 起，全局递增）
 * - l2: FEAT-<l1段>-<nn>（如 FEAT-001-02）
 * - l3: FEAT-<l1>-<l2>-<nn>
 * - story: STORY-<l1>-<l2>-<l3>-<nn>（L3 下）；STORY-<l1>-<l2>-<nn>（L2 直挂，v1 过渡）
 * 父 ID 无数字段（v1 遗留如 MOD-USER）→ 退化为 slug 派生：FEAT-USER-1 / STORY-USER-1。
 *
 * @param {'l1'|'l2'|'l3'|'story'} level 目标层级
 * @param {string|null} parentId 父节点 ID（l1 传 null）
 * @param {Array<object>} levels 统一视图树（tree.modules）
 * @returns {string} 新 ID（保证不与树中现有 ID 冲突）
 */
export function generateNestedId(level, parentId, tree) {
  const existingIds = collectIds(tree);
  const parentSegs = parentId ? parseIdChain(parentId).segs : [];

  if (level === 'l1') {
    let n = 1;
    let candidate = `FEAT-${pad(n, 3)}`;
    while (existingIds.includes(candidate)) candidate = `FEAT-${pad(++n, 3)}`;
    return candidate;
  }

  const prefix = level === 'story' ? 'STORY' : 'FEAT';

  // 父 ID 含数字段 → 标准嵌套
  if (parentSegs.length > 0 && (level !== 'story' || parentSegs.length >= 2)) {
    // l2: 取父（l1）1 段；l3: 取父（l2）2 段；story: 取父全段
    const inherited =
      level === 'l2' ? parentSegs.slice(0, 1) : level === 'l3' ? parentSegs.slice(0, 2) : parentSegs;
    let n = 1;
    let candidate = `${prefix}-${[...inherited, pad(n, 2)].join('-')}`;
    while (existingIds.includes(candidate)) candidate = `${prefix}-${[...inherited, pad(++n, 2)].join('-')}`;
    return candidate;
  }

  // 父 ID 无数字段（v1 遗留）→ slug 派生
  const slug = String(parentId || '')
    .replace(/^(MOD|FEAT|STORY)-/, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
  let n = 1;
  let candidate = `${prefix}-${slug || 'X'}-${n}`;
  while (existingIds.includes(candidate)) candidate = `${prefix}-${slug || 'X'}-${++n}`;
  return candidate;
}

function pad(n, width) {
  return String(n).padStart(width, '0');
}

/**
 * 兼容旧接口（v1 语义）：从 name 生成序号式/slug ID。
 * 保留供旧测试与旧调用；v2 写路径请用 generateNestedId。
 *
 * @param {string} prefix ID 前缀（MOD- / FEAT- / STORY-）
 * @param {string} name
 * @param {string[]} existingIds
 * @returns {string}
 */
export function generateId(prefix, name, existingIds = []) {
  const isAscii = /^[\x00-\x7F]+$/.test(name || '');
  if (isAscii && name) {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) {
      const candidate = `${prefix}${slug}`;
      if (!existingIds.includes(candidate)) return candidate;
    }
  }
  let n = 1;
  while (existingIds.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * 收集树中所有节点 ID（用于 ID 去重）。
 * @param {{modules:Array}} tree
 * @returns {string[]}
 */
export function collectIds(tree) {
  const ids = [];
  for (const { node } of walkLevels(tree.modules)) {
    if (node.id) ids.push(node.id);
  }
  return ids;
}
