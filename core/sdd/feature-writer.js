// FeatureWriter：feature-tree.yaml 写入（yaml Document API，保留注释）
// 四级结构：Product → Module → Feature → Story
//
// 所有写入函数：readFile → parseDocument → 导航 AST → add/set/del → toString → writeFile
// 纯函数风格，不持有可变状态

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument } from 'yaml';
import { readFeatureTree, collectIds, generateId } from './feature-model.js';

const FEATURE_TREE_PATH = (wsRoot) => join(wsRoot, 'product', 'feature-tree.yaml');

/**
 * 读取 Document（内部辅助）。
 * @param {string} wsRoot
 * @returns {Promise<{doc:object, raw:string}>}
 */
async function loadDoc(wsRoot) {
  const filePath = FEATURE_TREE_PATH(wsRoot);
  let raw;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      raw = 'product:\n  name: ""\n  description: ""\nmodules: []\n';
    } else {
      throw e;
    }
  }
  const doc = parseDocument(raw);
  return { doc, filePath };
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
 * 在 modules 数组中查找 module index。
 * @param {object} doc
 * @param {string} moduleId
 * @returns {number} index，-1 未找到
 */
function findModuleIndex(doc, moduleId) {
  const modules = doc.getIn(['modules']);
  if (!modules || !modules.items) return -1;
  for (let i = 0; i < modules.items.length; i++) {
    if (modules.items[i].get('id') === moduleId) return i;
  }
  return -1;
}

/**
 * 在 module 的 features 数组中查找 feature index。
 */
function findFeatureIndex(doc, modIdx, featureId) {
  const features = doc.getIn(['modules', modIdx, 'features']);
  if (!features || !features.items) return -1;
  for (let i = 0; i < features.items.length; i++) {
    if (features.items[i].get('id') === featureId) return i;
  }
  return -1;
}

// 上面循环的索引递增有误，用传统 for 循环重写
function locateNodeFixed(doc, id) {
  const modules = doc.getIn(['modules']);
  if (!modules || !modules.items) return null;

  for (let mi = 0; mi < modules.items.length; mi++) {
    const mod = modules.items[mi];
    if (mod.get('id') === id) return { level: 'module', modIdx: mi, featIdx: -1, storyIdx: -1 };
    const features = mod.get('features');
    if (features && features.items) {
      for (let fi = 0; fi < features.items.length; fi++) {
        const feat = features.items[fi];
        if (feat.get('id') === id) return { level: 'feature', modIdx: mi, featIdx: fi, storyIdx: -1 };
        const stories = feat.get('stories');
        if (stories && stories.items) {
          for (let si = 0; si < stories.items.length; si++) {
            if (stories.items[si].get('id') === id) {
              return { level: 'story', modIdx: mi, featIdx: fi, storyIdx: si };
            }
          }
        }
      }
    }
  }
  return null;
}

/**
 * 添加 Module。
 *
 * @param {string} wsRoot
 * @param {{id?:string, name:string, description?:string}} input
 * @returns {Promise<{id:string}>}
 */
export async function addModule(wsRoot, input) {
  const { doc, filePath } = await loadDoc(wsRoot);
  const tree = await readFeatureTree(wsRoot);
  const existingIds = collectIds(tree);
  const id = input.id || generateId('MOD-', input.name, existingIds);

  let modules = doc.getIn(['modules']);
  if (!modules) {
    modules = doc.createNode([]);
    doc.set('modules', modules);
  }

  const newMod = doc.createNode({ id, name: input.name, description: input.description || '', features: [] });
  modules.add(newMod);

  await saveDoc(doc, filePath);
  return { id };
}

/**
 * 添加 Feature 到指定 Module。
 *
 * @param {string} wsRoot
 * @param {string} moduleId
 * @param {{id?:string, name:string, description?:string}} input
 * @returns {Promise<{id:string}>}
 */
export async function addFeature(wsRoot, moduleId, input) {
  const { doc, filePath } = await loadDoc(wsRoot);
  const modIdx = findModuleIndex(doc, moduleId);
  if (modIdx === -1) throw new Error(`Module not found: ${moduleId}`);

  const tree = await readFeatureTree(wsRoot);
  const existingIds = collectIds(tree);
  const id = input.id || generateId('FEAT-', input.name, existingIds);

  let features = doc.getIn(['modules', modIdx, 'features']);
  if (!features) {
    features = doc.createNode([]);
    doc.setIn(['modules', modIdx, 'features'], features);
  }

  const newFeat = doc.createNode({ id, name: input.name, description: input.description || '', stories: [] });
  features.add(newFeat);

  await saveDoc(doc, filePath);
  return { id };
}

/**
 * 添加 Story 到指定 Feature。
 *
 * @param {string} wsRoot
 * @param {string} featureId
 * @param {{id?:string, name:string, description?:string, status?:string}} input
 * @returns {Promise<{id:string}>}
 */
export async function addStory(wsRoot, featureId, input) {
  const { doc, filePath } = await loadDoc(wsRoot);

  // 查找 featureId 对应的 module/feature index
  const loc = locateNodeFixed(doc, featureId);
  if (!loc || loc.level !== 'feature') {
    throw new Error(`Feature not found: ${featureId}`);
  }

  const tree = await readFeatureTree(wsRoot);
  const existingIds = collectIds(tree);
  const id = input.id || generateId('STORY-', input.name, existingIds);

  let stories = doc.getIn(['modules', loc.modIdx, 'features', loc.featIdx, 'stories']);
  if (!stories) {
    stories = doc.createNode([]);
    doc.setIn(['modules', loc.modIdx, 'features', loc.featIdx, 'stories'], stories);
  }

  const newStory = doc.createNode({
    id,
    name: input.name,
    description: input.description || '',
    status: input.status || 'planned',
  });
  stories.add(newStory);

  await saveDoc(doc, filePath);
  return { id };
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
  const loc = locateNodeFixed(doc, id);
  if (!loc) throw new Error(`Node not found: ${id}`);

  // 构建基础路径
  let basePath;
  if (loc.level === 'module') {
    basePath = ['modules', loc.modIdx];
  } else if (loc.level === 'feature') {
    basePath = ['modules', loc.modIdx, 'features', loc.featIdx];
  } else {
    basePath = ['modules', loc.modIdx, 'features', loc.featIdx, 'stories', loc.storyIdx];
  }

  if (updates.name !== undefined) doc.setIn([...basePath, 'name'], updates.name);
  if (updates.description !== undefined) doc.setIn([...basePath, 'description'], updates.description);
  if (updates.status !== undefined) {
    if (loc.level !== 'story') {
      throw new Error(`status can only be set on Story nodes, ${id} is ${loc.level}`);
    }
    doc.setIn([...basePath, 'status'], updates.status);
  }

  await saveDoc(doc, filePath);
  return { id };
}

/**
 * 删除节点及其子树。
 *
 * @param {string} wsRoot
 * @param {string} id 节点 ID
 * @returns {Promise<{id:string, level:string}>}
 */
export async function removeNode(wsRoot, id) {
  const { doc, filePath } = await loadDoc(wsRoot);
  const loc = locateNodeFixed(doc, id);
  if (!loc) throw new Error(`Node not found: ${id}`);

  if (loc.level === 'module') {
    const modules = doc.getIn(['modules']);
    modules.items.splice(loc.modIdx, 1);
  } else if (loc.level === 'feature') {
    const features = doc.getIn(['modules', loc.modIdx, 'features']);
    features.items.splice(loc.featIdx, 1);
  } else {
    const stories = doc.getIn(['modules', loc.modIdx, 'features', loc.featIdx, 'stories']);
    stories.items.splice(loc.storyIdx, 1);
  }

  await saveDoc(doc, filePath);
  return { id, level: loc.level };
}
