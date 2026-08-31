// FeatureMaterializer：product/features 四级物理投影（Phase 3.5 plans/phase-3.5-four-level-paths-design.md §2.3）
//
// feature-tree.yaml 是唯一权威源，本模块把逻辑树投影为物理目录：
//   product/features/<L1>/<L2>/<L3>/<STORY>/README.md
// 同步策略（只增不删）：
// - 树有目录无 → 生成；目录与 README 已存在 → 跳过（幂等）
// - 用户自建文件永不触碰；树节点删除/改名后的旧目录不删除 → 交 drift 报告
// STORY 级 README 额外记录绑定 CHG（反查 delivery/changes 与 delivery/archive 的 metadata.feature-path）

import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { stringify } from 'yaml';
import { walkLevels, readFeatureTree } from './feature-model.js';
import { readMetadata } from './change-model.js';

/**
 * 反查各 Story 绑定的 CHG：遍历 changes/ 与 archive/ 下全部 CHG metadata。
 * @param {string} workspaceRoot
 * @returns {Promise<Map<string, {id:string, scope:string}>>} storyId → CHG 信息
 */
async function buildStoryChangeIndex(workspaceRoot) {
  const index = new Map();
  for (const scope of ['changes', 'archive']) {
    const base = join(workspaceRoot, 'delivery', scope);
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || !/^CHG-\d+/.test(e.name)) continue;
      try {
        const meta = await readMetadata(join(base, e.name));
        const storyId = meta?.['feature-path']?.story?.id;
        if (storyId && !index.has(storyId)) index.set(storyId, { id: e.name, scope });
      } catch {
        // metadata 损坏的 CHG 跳过，不阻断物化
      }
    }
  }
  return index;
}

function renderNodeReadme(node, level, boundChg) {
  const fm = {
    id: node.id,
    name: node.name,
    level,
    ...(node.status ? { status: node.status } : {}),
    ...(boundChg ? { 'bound-chg': boundChg } : {}),
  };
  const desc = node.description || '';
  const lines = [`# ${node.name || node.id}`, '', desc, ''];
  if (level === 'story' && boundChg) {
    lines.push(`> 绑定 Change：\`${boundChg}\``, '');
  }
  return `---\n${stringify(fm).trimEnd()}\n---\n\n${lines.join('\n')}`;
}

/**
 * 物化 product/features 四级投影（只增不删）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<{created:string[], skipped:number, drifted:string[]}>}
 *   created: 新建文件相对 workspaceRoot 的路径
 *   drifted: 存在于 features/ 但树中无对应节点的目录（相对 features/ 的路径，末级）
 */
export async function materializeFeatures(workspaceRoot) {
  const tree = await readFeatureTree(workspaceRoot);
  const changeIndex = await buildStoryChangeIndex(workspaceRoot);
  const featuresRoot = join(workspaceRoot, 'product', 'features');
  const created = [];
  let skipped = 0;

  const ensureReadme = async (relDirs, node, level, boundChg) => {
    const dir = join(featuresRoot, ...relDirs);
    await mkdir(dir, { recursive: true });
    const readmePath = join(dir, 'README.md');
    let exists = false;
    try {
      await readFile(readmePath, 'utf8');
      exists = true;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (exists) {
      skipped++;
      return;
    }
    await writeFile(readmePath, renderNodeReadme(node, level, boundChg), 'utf8');
    created.push(join('product', 'features', ...relDirs, 'README.md'));
  };

  // 遍历树：L1 → L2 → L3 → STORY（L2.stories 直挂兼容）
  for (const { node, level, parent } of walkLevels(tree.modules)) {
    if (level === 'l1') {
      await ensureReadme([node.id], node, 'module');
    } else if (level === 'l2') {
      await ensureReadme([parent.id, node.id], node, 'feature');
    } else if (level === 'l3') {
      const chain = findL3Chain(tree, node.id);
      if (chain) await ensureReadme(chain, node, 'capability');
    } else if (level === 'story') {
      // parent 为 L3 或 L2（直挂）；需完整祖先链
      const chain = storyChain(tree, node.id);
      if (chain) {
        const boundChg = changeIndex.get(node.id)?.id;
        await ensureReadme(chain, node, 'story', boundChg);
      }
    }
  }

  const drifted = await collectDrift(workspaceRoot, tree);
  return { created, skipped, drifted };
}

// walkLevels 未提供祖先链，storyChain 按 ID 反查树定位完整链（ID 原样用于目录名）
function storyChain(tree, storyId) {
  for (const l1 of tree.modules) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        if ((l3.stories || []).some((s) => s.id === storyId)) {
          return [l1.id, l2.id, l3.id, storyId];
        }
      }
      if ((l2.stories || []).some((s) => s.id === storyId)) {
        return [l1.id, l2.id, storyId]; // v1 过渡：story 直挂 L2（三级）
      }
    }
  }
  return null;
}

/**
 * 收集 features/ 下树中已不存在的节点目录（drift，只报告不删除）。
 * @param {string} workspaceRoot
 * @param {object} tree 统一视图
 * @returns {Promise<string[]>} 相对 features/ 的目录链（如 'MOD-1/FEAT-1'）
 */
export async function collectDrift(workspaceRoot, tree) {
  const featuresRoot = join(workspaceRoot, 'product', 'features');
  const known = new Set();
  for (const { node, level, parent } of walkLevels(tree.modules)) {
    if (level === 'l1') known.add(node.id);
    else if (level === 'l2') known.add(`${parent.id}/${node.id}`);
    else if (level === 'l3') {
      const chain = findL3Chain(tree, node.id);
      if (chain) known.add(chain.slice(0, 3).join('/'));
    } else if (level === 'story') {
      const chain = storyChain(tree, node.id);
      if (chain) known.add(chain.join('/'));
    }
  }

  const drifted = [];
  const walk = async (dir, rel) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (!known.has(childRel)) {
        // 检查是否为「链中间存在但整链不匹配」——以该目录为根继续下探会重复报；只报最上层不匹配链
        drifted.push(childRel);
        continue; // 子层必然也不匹配，不再下探
      }
      await walk(join(dir, e.name), childRel);
    }
  };
  await walk(featuresRoot, '');
  return drifted;
}

function findL3Chain(tree, l3Id) {
  for (const l1 of tree.modules) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        if (l3.id === l3Id) return [l1.id, l2.id, l3.id];
      }
    }
  }
  return null;
}

/**
 * features/ 物理投影完整性检查（doctor 用，零写入）。
 * @param {string} workspaceRoot
 * @returns {Promise<{missing:string[], drifted:string[]}>}
 *   missing: 树中存在但 features/ 无对应目录的节点链（提示 materialize）
 *   drifted: features/ 存在但树中无对应节点的目录链（只报告不删除）
 */
export async function checkFeaturesProjection(workspaceRoot) {
  const tree = await readFeatureTree(workspaceRoot);
  const featuresRoot = join(workspaceRoot, 'product', 'features');

  const missing = [];
  const expect = (chain) => missing.push(chain.join('/'));
  for (const { node, level, parent } of walkLevels(tree.modules)) {
    if (level === 'l1') {
      if (!(await pathExists(join(featuresRoot, node.id)))) expect([node.id]);
    } else if (level === 'l2') {
      if (!(await pathExists(join(featuresRoot, parent.id, node.id)))) expect([parent.id, node.id]);
    } else if (level === 'l3') {
      const chain = findL3Chain(tree, node.id);
      if (chain && !(await pathExists(join(featuresRoot, ...chain)))) expect(chain);
    } else if (level === 'story') {
      const chain = storyChain(tree, node.id);
      if (chain && !(await pathExists(join(featuresRoot, ...chain)))) expect(chain);
    }
  }

  const drifted = await collectDrift(workspaceRoot, tree);
  return { missing, drifted };
}

const pathExists = (p) =>
  stat(p).then(
    () => true,
    (e) => (e.code === 'ENOENT' ? false : Promise.reject(e))
  );

// 相对路径辅助（保留语义清晰）
export function featuresRelPath(workspaceRoot, absPath) {
  return relative(join(workspaceRoot, 'product', 'features'), absPath);
}
