// FeatureModel：feature-tree.yaml 读取/节点查找/ID 生成（纯函数，依赖 node:fs/promises + yaml）
// 四级结构：Product → Module → Feature → Story
// Story 为最小可实施单元，直接关联 CHG
//
// 写入函数在 feature-writer.js（用 yaml Document API 保留注释）

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * 读取 product/feature-tree.yaml，返回四级树结构。
 * 文件不存在返回空树（modules: []）。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<{product:{name:string,description:string},modules:Array<object>}>}
 */
export async function readFeatureTree(workspaceRoot) {
  const filePath = join(workspaceRoot, 'product', 'feature-tree.yaml');
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { product: { name: '', description: '' }, modules: [] };
    throw e;
  }
  const doc = parse(raw);
  return {
    product: {
      name: doc?.product?.name || '',
      description: doc?.product?.description || '',
    },
    modules: Array.isArray(doc?.modules) ? doc.modules : [],
  };
}

/**
 * 规范化字符串用于模糊匹配：trim + 小写。
 */
function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * 递归遍历 modules → features → stories 三级树。
 * @param {Array} nodes 当前层级节点数组
 * @param {string} childKey 下一层级的 key（'features' / 'stories'）
 * @yields {object} 节点对象（含 level 标记）
 */
function* walkModules(nodes) {
  if (!Array.isArray(nodes)) return;
  for (const mod of nodes) {
    yield { node: mod, level: 'module' };
    if (Array.isArray(mod.features)) {
      for (const feat of mod.features) {
        yield { node: feat, level: 'feature' };
        if (Array.isArray(feat.stories)) {
          for (const story of feat.stories) {
            yield { node: story, level: 'story' };
          }
        }
      }
    }
  }
}

/**
 * 按任意层级 ID 查找节点。
 * 搜索 modules → features → stories 三级。
 *
 * @param {{modules:Array}} tree readFeatureTree 返回的树
 * @param {string} id 节点 ID
 * @returns {object|null} 节点对象（含原始结构），未找到返回 null
 */
export function findNodeById(tree, id) {
  if (!id) return null;
  for (const { node } of walkModules(tree.modules)) {
    if (node.id === id) return node;
  }
  return null;
}

/**
 * 按名称查找节点（模糊匹配，忽略大小写/首尾空白）。
 * 搜索 modules → features → stories 三级，返回第一个匹配。
 *
 * @param {{modules:Array}} tree
 * @param {string} name
 * @returns {object|null}
 */
export function findNodeByName(tree, name) {
  if (!name) return null;
  for (const { node } of walkModules(tree.modules)) {
    if (norm(node.name) === norm(name)) return node;
  }
  return null;
}

/**
 * 兼容旧接口：在树中查找节点。
 * - 提供 id：按 id 精确匹配（findNodeById）
 * - 提供 name：按 name 模糊匹配（findNodeByName）
 * - 同时提供：id 优先
 *
 * @param {{modules:Array}} tree readFeatureTree 返回的树
 * @param {{id?:string,name?:string}} query
 * @returns {object|null}
 */
export function findFeature(tree, { id, name } = {}) {
  if (id) return findNodeById(tree, id);
  if (name) return findNodeByName(tree, name);
  return null;
}

/**
 * 判断节点层级。
 * @param {object} node 节点对象
 * @returns {'module'|'feature'|'story'|'unknown'}
 */
export function nodeLevel(node) {
  if (!node) return 'unknown';
  if (node.id?.startsWith('MOD-')) return 'module';
  if (node.id?.startsWith('FEAT-')) return 'feature';
  if (node.id?.startsWith('STORY-')) return 'story';
  // 回退：按子节点 key 判断
  if (Array.isArray(node.stories)) return 'feature';
  if (Array.isArray(node.features)) return 'module';
  return 'unknown';
}

/**
 * 返回节点在树中的完整路径（如 "电商平台 > 用户中心 > 用户认证 > 用户注册"）。
 * 按 ID 查找节点的祖先链。
 *
 * @param {{product:{name:string},modules:Array}} tree
 * @param {string} id 节点 ID
 * @returns {string} 路径字符串，节点不存在返回空
 */
export function nodePath(tree, id) {
  const parts = [];
  if (tree.product?.name) parts.push(tree.product.name);

  function searchModules(modules) {
    if (!Array.isArray(modules)) return false;
    for (const mod of modules) {
      if (mod.id === id) {
        parts.push(mod.name || mod.id);
        return true;
      }
      if (Array.isArray(mod.features)) {
        for (const feat of mod.features) {
          if (feat.id === id) {
            parts.push(mod.name || mod.id);
            parts.push(feat.name || feat.id);
            return true;
          }
          if (Array.isArray(feat.stories)) {
            for (const story of feat.stories) {
              if (story.id === id) {
                parts.push(mod.name || mod.id);
                parts.push(feat.name || feat.id);
                parts.push(story.name || story.id);
                return true;
              }
            }
          }
        }
      }
    }
    return false;
  }

  searchModules(tree.modules);
  return parts.join(' > ');
}

/**
 * 兼容旧接口：返回节点路径。
 * @param {{product:{name:string},modules:Array}} tree
 * @param {object} target 目标节点
 * @returns {string}
 */
export function featurePath(tree, target) {
  if (!target) return '';
  return nodePath(tree, target.id);
}

/**
 * 从 name 生成序号式 ID。
 * 中文或非 ASCII name → 序号（MOD-1, MOD-2...）
 * ASCII name → slugify（MOD-user-center）
 *
 * @param {string} prefix ID 前缀（MOD- / FEAT- / STORY-）
 * @param {string} name 节点名称
 * @param {Array<string>} existingIds 已存在的 ID 列表（用于序号递增）
 * @returns {string} 生成的 ID
 */
export function generateId(prefix, name, existingIds = []) {
  // ASCII name → slugify
  const isAscii = /^[\x00-\x7F]+$/.test(name || '');
  if (isAscii && name) {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (slug) {
      const candidate = `${prefix}${slug}`;
      if (!existingIds.includes(candidate)) return candidate;
    }
  }
  // 非 ASCII 或 slug 冲突 → 序号
  let n = 1;
  while (existingIds.includes(`${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

/**
 * 收集树中所有节点 ID（用于 generateId 去重）。
 * @param {{modules:Array}} tree
 * @returns {string[]}
 */
export function collectIds(tree) {
  const ids = [];
  for (const { node } of walkModules(tree.modules)) {
    if (node.id) ids.push(node.id);
  }
  return ids;
}
