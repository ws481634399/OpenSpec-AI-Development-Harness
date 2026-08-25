// FeatureModel：feature-tree.yaml 读写/节点查找（纯函数，依赖 node:fs/promises + yaml）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §6.2/§7.3
// Feature Tree 属 Product World，存放 product/feature-tree.yaml

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * 读取 product/feature-tree.yaml，返回树结构。
 * 文件不存在或空 features 返回空树（features: []）。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<{product:{name:string,description:string},features:Array<object>}>}
 */
export async function readFeatureTree(workspaceRoot) {
  const filePath = join(workspaceRoot, 'product', 'feature-tree.yaml');
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return { product: { name: '', description: '' }, features: [] };
    throw e;
  }
  const doc = parse(raw);
  return {
    product: {
      name: doc?.product?.name || '',
      description: doc?.product?.description || '',
    },
    features: Array.isArray(doc?.features) ? doc.features : [],
  };
}

/**
 * 规范化字符串用于模糊匹配：trim + 小写。
 */
function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * 深度优先遍历 features 树。
 * @param {Array} nodes
 * @yields {object} 节点对象（含 children）
 */
function* walk(nodes) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    yield n;
    if (n.children) yield* walk(n.children);
  }
}

/**
 * 在 features 树中查找节点。
 * - 提供 id：按 id 精确匹配
 * - 提供 name：按 name 模糊匹配（忽略大小写/首尾空白）
 * - 同时提供：id 优先
 * - 未命中返回 null
 *
 * @param {{features:Array}} tree readFeatureTree 返回的树
 * @param {{id?:string,name?:string}} query
 * @returns {object|null}
 */
export function findFeature(tree, { id, name } = {}) {
  for (const n of walk(tree.features)) {
    if (id !== undefined && id !== '' && n.id === id) return n;
    if (name !== undefined && name !== '' && norm(n.name) === norm(name)) return n;
  }
  return null;
}

/**
 * 返回节点在树中的层级路径（如 "商品中心 / 智能推荐"）。
 * 根节点返回单层（如 "商品中心"）。
 * 节点不存在或 features 为空返回空字符串。
 *
 * @param {{features:Array}} tree
 * @param {object} target 目标节点（findFeature 返回值）
 * @returns {string}
 */
export function featurePath(tree, target) {
  if (!target) return '';
  const result = [];
  const search = (nodes) => {
    if (!Array.isArray(nodes)) return false;
    for (const n of nodes) {
      if (n === target) {
        result.push(n.name || n.id || '(unnamed)');
        return true;
      }
      if (n.children && search(n.children)) {
        result.unshift(n.name || n.id || '(unnamed)');
        return true;
      }
    }
    return false;
  };
  search(tree.features);
  return result.join(' / ');
}
