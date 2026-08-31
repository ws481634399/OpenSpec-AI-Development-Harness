// FeatureMaterializer：product/features 四级物理投影（Phase 3.5 修订 v0.3）
//
// feature-tree.yaml 是唯一权威源，本模块把逻辑树投影为物理目录：
//   product/features/<L1名>/<L2名>/<L3名>/<STORY名>/README.md
// 同步策略（重跑 = 同步）：
// - 各级目录以 README.md front-matter 的 id 为锚点：树中改名 → rename 同步（STORY 与各级同规则）
// - README 已存在 → 跳过（幂等）；用户自建文件永不触碰
// - 树节点删除/改名后的旧目录：rename 无法命中（无锚点）→ drift 报告，不删除
// - STORY 级 README 额外记录绑定 CHG（反查 delivery/changes 与 delivery/archive 的 metadata.feature-path）

import { mkdir, writeFile, readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify, parse } from 'yaml';
import { readFeatureTree } from './feature-model.js';
import { readMetadata } from './change-model.js';
import { featureDirSeg, syncNodeDirName } from './feature-dirname.js';

const pathExists = (p) =>
  stat(p).then(
    () => true,
    (e) => (e.code === 'ENOENT' ? false : Promise.reject(e))
  );

/**
 * 遍历树，产出全部节点投影清单（供 materialize/check 共用）。
 * @returns {Array<{node:object, level:'module'|'feature'|'capability'|'story', chain:string[], seg:string, parentDir:string}>}
 *   chain: 从 L1 到该节点的目录段（业务名）数组
 */
function collectProjections(tree) {
  const out = [];
  const seg = (node) => featureDirSeg(node.id, node.name);
  for (const l1 of tree.modules) {
    out.push({ node: l1, level: 'module', chain: [seg(l1)], seg: seg(l1), parentDir: '' });
    for (const l2 of l1.children || []) {
      out.push({ node: l2, level: 'feature', chain: [seg(l1), seg(l2)], seg: seg(l2), parentDir: seg(l1) });
      for (const l3 of l2.children || []) {
        out.push({
          node: l3, level: 'capability',
          chain: [seg(l1), seg(l2), seg(l3)], seg: seg(l3), parentDir: `${seg(l1)}/${seg(l2)}`,
        });
        for (const st of l3.stories || []) {
          out.push({
            node: st, level: 'story',
            chain: [seg(l1), seg(l2), seg(l3), seg(st)], seg: seg(st),
            parentDir: `${seg(l1)}/${seg(l2)}/${seg(l3)}`,
          });
        }
      }
      // v1 过渡：story 直挂 L2（三级链）
      for (const st of l2.stories || []) {
        out.push({
          node: st, level: 'story',
          chain: [seg(l1), seg(l2), seg(st)], seg: seg(st), parentDir: `${seg(l1)}/${seg(l2)}`,
        });
      }
    }
  }
  return out;
}

/**
 * 反查各 Story 绑定的 CHG：遍历 changes/ 与 archive/ 下全部 CHG metadata。
 * @param {string} workspaceRoot
 * @returns {Promise<Map<string, string>>} storyId → CHG ID
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
        if (storyId && !index.has(storyId)) index.set(storyId, e.name);
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
  const lines = [`# ${node.name || node.id}`, '', node.description || '', ''];
  if (level === 'story' && boundChg) {
    lines.push(`> 绑定 Change：\`${boundChg}\``, '');
  }
  return `---\n${stringify(fm).trimEnd()}\n---\n\n${lines.join('\n')}`;
}

/**
 * 物化 product/features 四级投影（重跑 = 同步，含改名 rename）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<{created:string[], renamed:string[], skipped:number, drifted:string[]}>}
 */
export async function materializeFeatures(workspaceRoot) {
  const tree = await readFeatureTree(workspaceRoot);
  const changeIndex = await buildStoryChangeIndex(workspaceRoot);
  const featuresRoot = join(workspaceRoot, 'product', 'features');
  const created = [];
  const renamed = [];
  let skipped = 0;

  // 目录段路径（锚点 rename 逐级从上往下做，父级 rename 后子级路径跟随）
  const dirCache = new Map(); // parentDirKey -> 实际目录路径
  const resolveParent = (parentKey) => (parentKey ? dirCache.get(parentKey) : featuresRoot);

  for (const proj of collectProjections(tree)) {
    const parentDir = resolveParent(proj.parentDir) || featuresRoot;
    const segDir = join(parentDir, proj.seg);

    // 父目录 key：用树中稳定 id 链做 key，避免名字变化影响子级查找
    const parentId = proj.parentDir; // 上层已把 rename 后路径写入 cache，key 即名字链
    dirCache.set(parentId ? `${parentId}/${proj.seg}` : proj.seg, segDir);

    // 锚点 rename / 新建
    const synced = await syncNodeDirName(parentDir, proj.node.id, proj.seg);
    if (synced) {
      if (synced.renamed) renamed.push(proj.chain.join('/'));
      dirCache.set(proj.parentDir ? `${proj.parentDir}/${proj.seg}` : proj.seg, synced.dir);
    } else if (!(await pathExists(segDir))) {
      await mkdir(segDir, { recursive: true });
      created.push(join('product', 'features', ...proj.chain));
    }

    // README（锚点依据，缺失才写）
    const finalDir = synced ? synced.dir : segDir;
    const readmePath = join(finalDir, 'README.md');
    let exists = false;
    try {
      await readFile(readmePath, 'utf8');
      exists = true;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    if (exists) {
      skipped++;
    } else {
      const boundChg = proj.level === 'story' ? changeIndex.get(proj.node.id) : undefined;
      await writeFile(readmePath, renderNodeReadme(proj.node, proj.level, boundChg), 'utf8');
      created.push(join('product', 'features', ...proj.chain, 'README.md'));
    }
  }

  const drifted = await collectDrift(workspaceRoot, tree);
  return { created, renamed, skipped, drifted };
}

/**
 * 收集 features/ 下树中已不存在的节点目录（drift，只报告不删除）。
 * 判定：目录内 README front-matter 的 id 在树中不存在，或目录无 README 且段名不匹配任何期望段。
 * @param {string} workspaceRoot
 * @param {object} tree 统一视图
 * @returns {Promise<string[]>} 相对 features/ 的目录链（如 'FEAT-1'）
 */
export async function collectDrift(workspaceRoot, tree) {
  const featuresRoot = join(workspaceRoot, 'product', 'features');
  const knownIds = new Set(collectProjections(tree).map((p) => p.node.id));

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
      // 读锚点 id
      let anchorId = null;
      try {
        const raw = await readFile(join(dir, e.name, 'README.md'), 'utf8');
        const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (m) anchorId = parse(m[1])?.id ?? null;
      } catch {
        anchorId = null;
      }
      if (anchorId && knownIds.has(anchorId)) {
        await walk(join(dir, e.name), childRel);
      } else {
        drifted.push(childRel); // 无锚点或锚点不在树中 → 整枝计为 drift
      }
    }
  };
  await walk(featuresRoot, '');
  return drifted;
}

/**
 * features/ 物理投影完整性检查（doctor 用，零写入）。
 * @param {string} workspaceRoot
 * @returns {Promise<{missing:string[], drifted:string[]}>}
 */
export async function checkFeaturesProjection(workspaceRoot) {
  const tree = await readFeatureTree(workspaceRoot);
  const featuresRoot = join(workspaceRoot, 'product', 'features');

  const missing = [];
  for (const proj of collectProjections(tree)) {
    if (!(await pathExists(join(featuresRoot, ...proj.chain)))) {
      missing.push(proj.chain.join('/'));
    }
  }

  const drifted = await collectDrift(workspaceRoot, tree);
  return { missing, drifted };
}
