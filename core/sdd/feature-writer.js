// FeatureWriter：feature-tree.yaml 写入（yaml Document API）
// Phase 2.4（plans/phase-2.4-multi-repository-delivery-design.md §8）：
//
// 统一写 Schema v2 磁盘格式：product + features(L1) → children(L2) → children(L3) → stories
// ID 用 v2 嵌套编码（generateNestedId）；用户提供显式 ID 时原样采用（ID 稳定原则）
// v1 磁盘文件（modules 键）首次写入时自动升级为 v2（结构投影，头部注释替换为 v2 头）
//
// 所有写入函数：readFile → parseDocument → 导航 AST → add/set/del → toString → writeFile
// 纯函数风格，不持有可变状态

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, parse } from 'yaml';
import { readFeatureTree, generateNestedId } from './feature-model.js';

const FEATURE_TREE_PATH = (wsRoot) => join(wsRoot, 'product', 'feature-tree.yaml');

const V2_HEADER = `# OpenSpec Product Feature Tree
#
# 版本: v0.3 (Schema v2)
# 类型: Product Knowledge Metadata
#
# 四级结构：Level 1 → Level 2 → Level 3 → Story（Story 为最小产品能力节点）
#
# ID 规范（层级嵌套编码，全数字段）：
#   L1:    FEAT-001
#   L2:    FEAT-001-02
#   L3:    FEAT-001-02-03
#   Story: STORY-001-02-03-01
#
# Story status: planned / in-progress / delivered
`;

// v1 文件首次写入时的升级提示注释
const MIGRATE_NOTE = `\n# （本文件已由 Schema v1 自动升级为 v2：modules→features(L1)、features→children、层级嵌套 ID）\n`;

/**
 * 读取 Document；v1 磁盘文件自动升级为 v2 结构（内存转换后整体重写）。
 * @param {string} wsRoot
 * @returns {Promise<{doc:object, filePath:string, migrated:boolean}>}
 */
async function loadDoc(wsRoot) {
  const filePath = FEATURE_TREE_PATH(wsRoot);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      const doc = parseDocument(`${V2_HEADER}\nproduct:\n  name: ""\n  description: ""\nfeatures: []\n`);
      return { doc, filePath, migrated: false };
    }
    throw e;
  }

  const doc = parseDocument(raw);
  const hasV1 = doc.getIn(['modules']) !== undefined;
  const hasV2 = doc.getIn(['features']) !== undefined;

  if (hasV1 && !hasV2) {
    // v1 → v2 内存升级：modules→features(L1)、features→children、stories 保留
    const v1 = parse(raw) || {};
    const features = (Array.isArray(v1.modules) ? v1.modules : []).map((l1) => ({
      id: l1.id,
      name: l1.name,
      ...(l1.description !== undefined ? { description: l1.description } : {}),
      children: (Array.isArray(l1.features) ? l1.features : []).map((l2) => ({
        id: l2.id,
        name: l2.name,
        ...(l2.description !== undefined ? { description: l2.description } : {}),
        ...(Array.isArray(l2.stories) ? { stories: l2.stories } : {}),
      })),
    }));
    const newDoc = parseDocument(`${V2_HEADER}${MIGRATE_NOTE}\nproduct:\n  name: ${JSON.stringify(v1.product?.name || '')}\n  description: ${JSON.stringify(v1.product?.description || '')}\n`);
    newDoc.setIn(['product', 'name'], v1.product?.name || '');
    newDoc.setIn(['product', 'description'], v1.product?.description || '');
    newDoc.set('features', newDoc.createNode(features));
    return { doc: newDoc, filePath, migrated: true };
  }

  if (!hasV2) {
    // 空文件/无结构 → 补 features 键
    doc.set('features', doc.createNode([]));
  }
  return { doc, filePath, migrated: false };
}

/**
 * 保存 Document。
 * @param {object} doc
 * @param {string} filePath
 */
async function saveDoc(doc, filePath) {
  await writeFile(filePath, doc.toString(), 'utf8');
}

/**
 * 在 v2 Document 中按 ID 定位节点。
 * @returns {null|{level:'l1'|'l2'|'l3'|'story', path:string[]}} path 为 getIn/splice 用的索引键路径（指向节点对象）
 */
function locateNode(doc, id) {
  const features = doc.getIn(['features']);
  if (!features || !features.items) return null;

  for (let i = 0; i < features.items.length; i++) {
    const l1 = features.items[i];
    if (l1.get('id') === id) return { level: 'l1', path: ['features', i] };
    const l2s = l1.get('children');
    if (l2s && l2s.items) {
      for (let j = 0; j < l2s.items.length; j++) {
        const l2 = l2s.items[j];
        if (l2.get('id') === id) return { level: 'l2', path: ['features', i, 'children', j] };
        const l3s = l2.get('children');
        if (l3s && l3s.items) {
          for (let k = 0; k < l3s.items.length; k++) {
            const l3 = l3s.items[k];
            if (l3.get('id') === id) return { level: 'l3', path: ['features', i, 'children', j, 'children', k] };
            const stories = l3.get('stories');
            if (stories && stories.items) {
              for (let s = 0; s < stories.items.length; s++) {
                if (stories.items[s].get('id') === id) {
                  return { level: 'story', path: ['features', i, 'children', j, 'children', k, 'stories', s] };
                }
              }
            }
          }
        }
        // v1 过渡形态：story 直挂 L2
        const l2Stories = l2.get('stories');
        if (l2Stories && l2Stories.items) {
          for (let s = 0; s < l2Stories.items.length; s++) {
            if (l2Stories.items[s].get('id') === id) {
              return { level: 'story', path: ['features', i, 'children', j, 'stories', s] };
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * 添加 L1 节点（旧名 addModule 保持 API 兼容）。
 *
 * @param {string} wsRoot
 * @param {{id?:string, name:string, description?:string}} input
 * @returns {Promise<{id:string, migrated?:boolean}>}
 */
export async function addModule(wsRoot, input) {
  const { doc, filePath, migrated } = await loadDoc(wsRoot);
  const tree = await readFeatureTree(wsRoot);
  const id = input.id || generateNestedId('l1', null, tree);

  let features = doc.getIn(['features']);
  if (!features) {
    features = doc.createNode([]);
    doc.set('features', features);
  }
  features.add(doc.createNode({ id, name: input.name, description: input.description || '', children: [] }));

  await saveDoc(doc, filePath);
  return migrated ? { id, migrated: true } : { id };
}

/**
 * 添加 L2 节点到指定 L1，或添加 L3 节点到指定 L2（旧名 addFeature 保持 API 兼容）。
 *
 * @param {string} wsRoot
 * @param {string} parentId L1 或 L2 节点 ID
 * @param {{id?:string, name:string, description?:string}} input
 * @returns {Promise<{id:string, migrated?:boolean}>}
 */
export async function addFeature(wsRoot, parentId, input) {
  const { doc, filePath, migrated } = await loadDoc(wsRoot);
  const loc = locateNode(doc, parentId);
  if (!loc || (loc.level !== 'l1' && loc.level !== 'l2')) {
    throw new Error(`L1/L2 node not found: ${parentId}`);
  }
  const childLevel = loc.level === 'l1' ? 'l2' : 'l3';

  const tree = await readFeatureTree(wsRoot);
  const id = input.id || generateNestedId(childLevel, parentId, tree);

  const parent = doc.getIn(loc.path);
  let children = parent.get('children');
  if (!children) {
    children = doc.createNode([]);
    parent.set('children', children);
  }
  children.add(doc.createNode({ id, name: input.name, description: input.description || '', children: [] }));

  await saveDoc(doc, filePath);
  return migrated ? { id, migrated: true } : { id };
}

/**
 * 添加 Story 到指定 L3（规范路径）；parent 为 L2 时挂 L2.stories（v1 过渡兼容）。
 *
 * @param {string} wsRoot
 * @param {string} parentId L3（或 L2）节点 ID
 * @param {{id?:string, name:string, description?:string, status?:string}} input
 * @returns {Promise<{id:string, migrated?:boolean}>}
 */
export async function addStory(wsRoot, parentId, input) {
  const { doc, filePath, migrated } = await loadDoc(wsRoot);
  const loc = locateNode(doc, parentId);
  if (!loc || (loc.level !== 'l3' && loc.level !== 'l2')) {
    throw new Error(`L3 node not found: ${parentId} (Story 必须挂在 L3 下；L2 直挂仅限 v1 过渡)`);
  }

  const tree = await readFeatureTree(wsRoot);
  const id = input.id || generateNestedId('story', parentId, tree);

  const parent = doc.getIn(loc.path);
  let stories = parent.get('stories');
  if (!stories) {
    stories = doc.createNode([]);
    parent.set('stories', stories);
  }
  stories.add(
    doc.createNode({
      id,
      name: input.name,
      description: input.description || '',
      status: input.status || 'planned',
    }),
  );

  await saveDoc(doc, filePath);
  return migrated ? { id, migrated: true } : { id };
}

/**
 * 更新任意节点字段。
 *
 * @param {string} wsRoot
 * @param {string} id 节点 ID
 * @param {{name?:string, description?:string, status?:string}} updates
 * @returns {Promise<{id:string}>}
 */
export async function updateNode(wsRoot, id, updates) {
  const { doc, filePath } = await loadDoc(wsRoot);
  const loc = locateNode(doc, id);
  if (!loc) throw new Error(`Node not found: ${id}`);

  if (updates.name !== undefined) doc.setIn([...loc.path, 'name'], updates.name);
  if (updates.description !== undefined) doc.setIn([...loc.path, 'description'], updates.description);
  if (updates.status !== undefined) {
    if (loc.level !== 'story') {
      throw new Error(`status can only be set on Story nodes, ${id} is ${loc.level}`);
    }
    doc.setIn([...loc.path, 'status'], updates.status);
  }

  await saveDoc(doc, filePath);
  return { id };
}

/**
 * 删除节点及其子树。
 *
 * @param {string} wsRoot
 * @param {string} id
 * @returns {Promise<{id:string, level:string}>}
 */
export async function removeNode(wsRoot, id) {
  const { doc, filePath } = await loadDoc(wsRoot);
  const loc = locateNode(doc, id);
  if (!loc) throw new Error(`Node not found: ${id}`);

  // splice 父数组中的对应项：path 最后一项是数组内索引，倒数第二项是数组键
  const arrPath = loc.path.slice(0, -1);
  const idx = loc.path[loc.path.length - 1];
  const arr = doc.getIn(arrPath);
  arr.items.splice(idx, 1);

  await saveDoc(doc, filePath);
  return { id, level: loc.level };
}
