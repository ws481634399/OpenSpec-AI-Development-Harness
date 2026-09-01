// FeatureMaterializer：product/features 派生缓存（方案 D —— SSOT 重建模式，Phase 3.8）
//
// 唯一权威源 SSOT = product/feature-tree.yaml。
// product/features/ = 纯派生缓存（供人类在 IDE 中层层点进浏览），不作锚点、不作 rename 依据。
// 语义：
//   - 每次 materialize = 先清旧缓存目录、再按 SSOT 全量重建；
//   - 物理目录保持 4 级（保留 IDE 导航体验），但只在 L4 Story 级写 README.md（人读内容页）；
//   - L1/L2/L3 只建空目录（目录本身承担"层层导航"），不生成 README，不作锚点；
//   - 不再提供 drift/rename 报告：缓存与 SSOT 不一致 → 重跑 materialize 就重建，这是派生缓存的定义。

import { mkdir, writeFile, readFile, readdir, stat, rm } from 'node:fs/promises';
import { join, relative, dirname, sep } from 'node:path';
import { stringify, parse } from 'yaml';
import { readFeatureTree } from './feature-model.js';
import { readMetadata } from './change-model.js';
import { featureDirSeg } from './feature-dirname.js';

const pathExists = (p) =>
  stat(p).then(
    () => true,
    (e) => (e.code === 'ENOENT' ? false : Promise.reject(e))
  );

/**
 * 遍历树，产出全部投影条目（materialize 专用）。
 * 每条 Story 条目携带完整路径链 + 父级节点，便于 README 页写"路径面包屑"。
 *
 * @returns {Array<{node:object, chain:string[], nodeChain:object[], seg:string, parentDir:string}>}
 */
function collectStories(tree) {
  const out = [];
  const seg = (node) => featureDirSeg(node.id, node.name);
  for (const l1 of tree.modules) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        for (const st of l3.stories || []) {
          out.push({
            node: st,
            chain: [seg(l1), seg(l2), seg(l3), seg(st)],
            nodeChain: [l1, l2, l3, st],
            seg: seg(st),
          });
        }
      }
      // v1 过渡：story 直挂 L2（三级链；L3=null 占位；不影响 L1/L2 目录空段）
      for (const st of l2.stories || []) {
        out.push({
          node: st,
          chain: [seg(l1), seg(l2), seg(st)],
          nodeChain: [l1, l2, st],
          seg: seg(st),
        });
      }
    }
  }
  return out;
}

/**
 * 列出全部需要创建的"空目录"（含 L1/L2/L3 中间层 + Story 父目录，去重）。
 * 不包含 features 根（featuresRoot 由调用方处理）。
 */
function collectAllDirChains(storyEntries) {
  const set = new Set();
  for (const s of storyEntries) {
    for (let i = 1; i <= s.chain.length; i++) {
      set.add(s.chain.slice(0, i).join('/'));
    }
  }
  return [...set].map((s) => s.split('/'));
}

/**
 * 构建 Story → CHG 历史索引（changes/ + archive/ 全部扫到，支持一个 Story 多次交付历史）。
 * 排序：completed/archived 按 updatedAt 倒序。
 *
 * @returns {Promise<Map<string, Array<{id:string, scope:'changes'|'archive', status:string, updatedAt:string, metaDir:string}>>>}
 */
async function buildStoryChangeHistory(workspaceRoot) {
  const history = new Map();
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
      const changeDir = join(base, e.name);
      let meta;
      try {
        meta = await readMetadata(changeDir);
      } catch {
        continue;
      }
      const storyId = meta?.['feature-path']?.story?.id;
      if (!storyId) continue;
      const list = history.get(storyId) || [];
      list.push({
        id: e.name,
        scope,
        status: meta.status || '',
        updatedAt: meta['updated-at'] || '',
        changeDir,
      });
      history.set(storyId, list);
    }
  }
  // 每个 Story：updatedAt 倒序（空排最后），active (changes) 优先于 archive
  for (const [k, v] of history.entries()) {
    v.sort((a, b) => {
      const sa = a.scope === 'changes' ? 0 : 1;
      const sb = b.scope === 'changes' ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return (b.updatedAt || '').localeCompare(a.updatedAt || '');
    });
    history.set(k, v);
  }
  return history;
}

/**
 * 从 Story 所在 README 的位置，算一个指向 CHG 审计包（STORY 级）的相对路径。
 * Story README 位置 = features/<L1>/<L2>/<L3>/<Story>/README.md
 * CHG 完整审计包 = delivery/<changes|archive>/<CHG>/<L1>/<L2>/<L3>/<Story>/
 *   其中 CHG 侧的 L1..Story 段名来源于 meta，可能与 features 侧不同（重名没同步 skeleton 的极端情况）。
 *   兜底方案（feature-path 解析不出四级段）：直接指 CHG 根。
 */
function relativeAuditLink(storyChain, changeMeta) {
  const fp = changeMeta?.['feature-path'];
  let chgStorySegs = null;
  if (fp?.['level-1']?.id && fp?.story?.id) {
    chgStorySegs = [fp['level-1'], fp['level-2'], fp['level-3'], fp.story]
      .filter(Boolean)
      .map((n) => featureDirSeg(n.id, n.name));
  }
  // features/README 的目录深度固定为 chain.length（3 或 4）；从 README 位置回到 workspace 根。
  const storyDirDepth = storyChain.length; // Story 目录深度 = README 父目录深度
  const goBack = '../'.repeat(storyDirDepth + 1); // 再 +1 回到 features/ 之上（product/ 根）
  const prefix = `${goBack}delivery/${changeMeta.scope}/${changeMeta.id}`;
  if (chgStorySegs) return `${prefix}/${chgStorySegs.join('/')}/`;
  return `${prefix}/`;
}

/**
 * 生成 Story 级 README 正文（唯一人读产物）。
 * 包含：front-matter(id/name/level/status) + 路径面包屑 + 描述 + Change 历史（含 archive 链接）。
 */
function renderStoryReadme(entry, changeHistory, workspaceRoot) {
  const { node, chain, nodeChain } = entry;
  const fm = {
    id: node.id,
    name: node.name,
    level: 'story',
    ...(node.status ? { status: node.status } : {}),
  };
  const lines = [];
  // 标题
  lines.push(`# ${node.name || node.id}`, '');
  // 面包屑
  const breadcrumb = nodeChain.map((n, i) => {
    if (i === nodeChain.length - 1) return `**${n.name || n.id}**`;
    return n.name || n.id;
  }).join(' / ');
  lines.push(`> 路径：${breadcrumb}`, '');
  // 描述
  if (node.description) {
    lines.push(node.description, '');
  }
  // CHG 历史（若有）
  const history = changeHistory.get(node.id) || [];
  if (history.length > 0) {
    lines.push('## Change 历史', '');
    lines.push('| ID | 状态 | Scope | 更新时间 | 审计包（相对链接） |');
    lines.push('|---|---|---|---|---|');
    for (const h of history) {
      // 用 readMetadata 从 changeDir 再解一次 feature-path 算链接
      const link = relativeAuditLink(chain, { ...h });
      const at = h.updatedAt ? h.updatedAt.replace('T', ' ').slice(0, 19) : '-';
      lines.push(`| ${h.id} | ${h.status || '-'} | ${h.scope} | ${at} | [打开](${link}) |`);
    }
    lines.push('');
    // 当前绑定高亮（changes scope 第一条 = active）
    const active = history.find((h) => h.scope === 'changes');
    if (active) {
      lines.push(`> 当前绑定 Change：\`${active.id}\`（${active.status || 'active'}）`, '');
    } else {
      const latest = history[0];
      lines.push(`> 最近交付：\`${latest.id}\`（已归档）`, '');
    }
  } else {
    lines.push('_（尚未绑定任何 Change）_', '');
  }
  return `---\n${stringify(fm).trimEnd()}\n---\n\n${lines.join('\n')}`;
}

/**
 * 生成一份"重建计划"（纯函数，零 IO，供 dry-run 直接展示）。
 * 返回：
 *   expectedDirs: Set<string> —— features 根以下，按 SSOT 应该存在的目录（含 L1/L2/L3/Story 父级/Story）。
 *   expectedFiles: {path:content}[] —— 应该写入的 README（仅 Story 级）。
 */
export function computeReconstructionPlan(tree, changeHistoryByStory) {
  const stories = collectStories(tree);
  const allDirs = collectAllDirChains(stories);
  const expectedDirs = new Set(allDirs.map((c) => c.join(sep)));
  const expectedFiles = stories.map((entry) => ({
    path: join(...entry.chain, 'README.md'),
    content: renderStoryReadme(entry, changeHistoryByStory),
  }));
  return { expectedDirs, expectedFiles, storyCount: stories.length };
}

/**
 * 扫描现有 features/ 缓存，返回与重建计划对比的差异（用于报告 / dry-run）。
 * - obsoleteDirs：现有目录不在 expectedDirs 中（会被 rm -rf）
 * - obsoleteFiles：现有文件不在 expectedFiles 中（会被 rm，因为父级目录会被整删 / 或单文件清）
 * - createdFiles：expectedFiles
 * - createdDirs：expectedDirs 中原本不存在的目录
 * 注：此函数只走计划，不写盘。
 */
async function computeDiff(featuresRoot, plan) {
  const { expectedDirs, expectedFiles } = plan;
  const obsoleteDirs = [];
  const obsoleteFiles = [];
  const createdDirs = [];
  const createdFiles = [...expectedFiles];

  // 先列出现有
  const walk = async (dir, relChunks) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (e) {
      if (e.code === 'ENOENT') return;
      throw e;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      const relArr = [...relChunks, e.name];
      const rel = relArr.join(sep);
      if (e.isDirectory()) {
        if (!expectedDirs.has(rel)) {
          obsoleteDirs.push(rel);
          // 子级不再展开——整个目录被 rm
        } else {
          await walk(p, relArr);
        }
      } else {
        // 只有 expectedFiles 精确命中的文件才"保留"（实际仍会覆写 = 新内容，但不算 obsolete）
        const matched = expectedFiles.some((f) => f.path === rel);
        if (!matched) obsoleteFiles.push(rel);
      }
    }
  };
  await walk(featuresRoot, []);

  for (const d of expectedDirs) {
    if (!(await pathExists(join(featuresRoot, d)))) createdDirs.push(d);
  }
  return { obsoleteDirs, obsoleteFiles, createdDirs, createdFiles };
}

/**
 * 物化 product/features 派生缓存。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {{dryRun?:boolean}} [opts] dryRun=true 时返回差异但不写盘
 * @returns {Promise<{dryRun:boolean, storyCount:number, createdDirs:string[], createdFiles:string[], removedDirs:string[], removedFiles:string[], featuresRoot:string}>}
 */
export async function materializeFeatures(workspaceRoot, opts = {}) {
  const dryRun = !!opts.dryRun;
  const tree = await readFeatureTree(workspaceRoot);
  const changeHistory = await buildStoryChangeHistory(workspaceRoot);
  const featuresRoot = join(workspaceRoot, 'product', 'features');
  const plan = computeReconstructionPlan(tree, changeHistory);
  const diff = await computeDiff(featuresRoot, plan);

  if (dryRun) {
    return {
      dryRun: true,
      storyCount: plan.storyCount,
      createdDirs: diff.createdDirs,
      createdFiles: diff.createdFiles.map((f) => f.path),
      removedDirs: diff.obsoleteDirs,
      removedFiles: diff.obsoleteFiles,
      featuresRoot,
    };
  }

  // 1) 移除 obsolete 目录（recursive force）
  for (const relDir of diff.obsoleteDirs) {
    await rm(join(featuresRoot, relDir), { recursive: true, force: true });
  }
  // 2) 移除 obsolete 文件（不在 expectedFiles 里的文件，比如遗留 README、用户塞的 notes.txt）
  for (const relFile of diff.obsoleteFiles) {
    await rm(join(featuresRoot, relFile), { force: true });
  }
  // 3) 建目录（recursive mkdir，幂等）
  for (const relDir of diff.createdDirs) {
    await mkdir(join(featuresRoot, relDir), { recursive: true });
  }
  // 4) 写 Story README（每次重写，确保与 SSOT 最新描述/status 同步，而非"缺失才写"）
  for (const f of diff.createdFiles) {
    const abs = join(featuresRoot, f.path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, f.content, 'utf8');
  }

  return {
    dryRun: false,
    storyCount: plan.storyCount,
    createdDirs: diff.createdDirs,
    createdFiles: diff.createdFiles.map((f) => f.path),
    removedDirs: diff.obsoleteDirs,
    removedFiles: diff.obsoleteFiles,
    featuresRoot,
  };
}

/**
 * features/ 投影检查（doctor 用，零写入）。
 * 由于 features/ 现在是派生缓存，这里不做 drift，只做必要的基本信息收集：
 *   - missingStories：Feature Tree 中有 Story 但 features/ 目录下对应 Story README 不存在
 *   - extraneousFiles：features/ 下存在非预期单文件（提示 materialize 重建）
 * @param {string} workspaceRoot
 * @returns {Promise<{missingStories:string[], extraneousFiles:string[], storyInTree:number, storyOnDisk:number}>}
 */
export async function checkFeaturesProjection(workspaceRoot) {
  const tree = await readFeatureTree(workspaceRoot);
  const changeHistory = await buildStoryChangeHistory(workspaceRoot);
  const featuresRoot = join(workspaceRoot, 'product', 'features');
  const plan = computeReconstructionPlan(tree, changeHistory);
  const diff = await computeDiff(featuresRoot, plan);

  const missingStories = [];
  for (const f of plan.expectedFiles) {
    if (!(await pathExists(join(featuresRoot, f.path)))) {
      missingStories.push(f.path.split(sep).slice(0, -1).join('/'));
    }
  }
  // extraneousFiles：obsoleteFiles 里 README 最典型（L1/L2/L3 遗留 README 或用户手加）
  const extraneousFiles = diff.obsoleteFiles;

  return {
    missingStories,
    extraneousFiles,
    storyInTree: plan.storyCount,
    storyOnDisk: plan.storyCount - missingStories.length,
  };
}
