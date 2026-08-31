// ChangeSkeleton：CHG 内部四级目录骨架物化（Phase 3.5 plans/phase-3.5-four-level-paths-design.md §2.1）
//
// 诉求：bind-feature-path 后 CHG 内部立即可见完整四级目录（CHG/<L1>/<L2>/<L3>/<STORY>/），
// 而不是等 task 阶段写 tasks.md 时才按需 mkdir。
// 边界：
// - 只增不改不删（README.md 存在即跳过；目录存在即跳过）——幂等可重跑
// - candidate=true / feature-path 链不完整 → 拒绝物化（层级未定不预建）
// - 归档 CHG 同样支持补骨架（archive/CHG-XXXX/ 内部），经 findChangeDirAny 定位

import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { stringify } from 'yaml';
import { featurePathDirs } from './artifact-path.js';
import { findNodeById } from './feature-model.js';

/**
 * 物化 CHG 内部四级目录骨架。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} meta readMetadata 结果（含 feature-path）
 * @param {object|null} [tree] feature-tree 统一视图（用于回查 story status；缺省则不写 status）
 * @returns {Promise<{created:string[], skipped:boolean, reason?:string}>}
 *   created: 相对 changeDir 的新建路径（目录 + README）
 */
export async function materializeChangeSkeleton(changeDir, meta, tree = null) {
  const dirs = featurePathDirs(meta);
  if (!dirs) {
    const fp = meta?.['feature-path'];
    const reason = !fp
      ? 'feature-path 未绑定'
      : fp.candidate === true
        ? 'feature-path 为 Candidate（未晋升），暂不物化骨架'
        : 'feature-path 层级链不完整（需 level-1/2/3 + story）';
    return { created: [], skipped: true, reason };
  }

  const storyDir = join(changeDir, ...dirs);
  const created = [];
  const dirExisted = await stat(storyDir).then(
    () => true,
    (e) => (e.code === 'ENOENT' ? false : Promise.reject(e))
  );
  if (!dirExisted) {
    await mkdir(storyDir, { recursive: true });
    created.push(dirs.join('/'));
  }

  const readmePath = join(storyDir, 'README.md');
  let exists = false;
  try {
    await readFile(readmePath, 'utf8');
    exists = true;
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (!exists) {
    const storyMeta = fpStory(meta);
    const treeNode = tree ? findNodeById(tree, storyMeta.id) : null;
    const fm = {
      id: storyMeta.id,
      name: treeNode?.name || storyMeta.name || '',
      ...(treeNode?.status ? { status: treeNode.status } : {}),
      level: 'story',
      'bound-chg': basename(changeDir),
    };
    const desc = treeNode?.description || storyMeta.description || '';
    const body = [`# ${fm.name || fm.id}`, '', desc, '', `> 绑定 Change：\`${fm['bound-chg']}\``, ''].join('\n');
    await writeFile(readmePath, `---\n${stringify(fm).trimEnd()}\n---\n\n${body}`, 'utf8');
    created.push([...dirs, 'README.md'].join('/'));
  }

  return { created, skipped: false };
}

function fpStory(meta) {
  const fp = meta?.['feature-path'] || {};
  return {
    id: fp.story?.id || '',
    name: fp.story?.name || '',
    description: fp.story?.description || '',
  };
}

/**
 * 在 changes 与 archive 两个作用域定位 CHG 目录（CHG 平铺一层）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} id CHG ID（如 CHG-0002）
 * @returns {Promise<{dir:string, scope:'changes'|'archive'}|null>}
 */
export async function findChangeDirAny(workspaceRoot, id) {
  for (const scope of ['changes', 'archive']) {
    const dir = join(workspaceRoot, 'delivery', scope, id);
    try {
      const meta = await readFile(join(dir, 'metadata.yaml'), 'utf8');
      if (meta !== undefined) return { dir, scope };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return null;
}
