// DoctorChecks：多仓架构确定性检查（Phase 2.4 plans/phase-2.4-multi-repository-delivery-design.md §7.3）
//
// 检查项（纯 fs，不执行 git 命令；dirty 检测属运行时状态由 CLI 层补充）：
// 1. repositories.yaml ID 唯一
// 2. path 唯一且位于 implementation/ 下
// 3. .gitmodules path 与 Registry path 一致
// 4. Submodule 已初始化且 HEAD 存在（resolveSubmoduleHead 纯文件解析）
// 5. DU repository ∈ Registry
// 6. CHG feature-path 与 feature-tree.yaml 一致（各层 id 存在；story 归属 l3）
// 7. CHG 目录路径与 metadata.feature-path 一致（STORY 目录已物化时）
// 8. Workspace Pointer 与 HEAD 对齐（CHG repository-result vs 子仓 HEAD）

import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readRepositories } from './delivery-unit.js';
import { parseGitmodules, resolveSubmoduleHead } from './git-submodule.js';
import { readFeatureTree, findNodeById } from './feature-model.js';
import { readMetadata } from './change-model.js';
import { featurePathDirs } from './artifact-path.js';

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

async function listChangeDirs(workspaceRoot) {
  const dir = join(workspaceRoot, 'delivery', 'changes');
  if (!(await pathExists(dir))) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() && /^CHG-\d+/.test(e.name)).map((e) => e.name);
}

/**
 * 运行全部多仓检查项。
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<{issues:string[], checked:number}>}
 */
export async function runMultiRepoChecks(workspaceRoot) {
  const issues = [];
  let checked = 0;

  // 1/2. Registry 结构检查
  const repos = await readRepositories(workspaceRoot);
  checked++;
  const ids = repos.map((r) => r.id);
  for (const id of ids) {
    if (ids.filter((x) => x === id).length > 1) {
      issues.push(`repositories.yaml: 仓库 id 重复 '${id}'`);
    }
  }
  const normPaths = repos.map((r) => String(r.path).replace(/\\/g, '/'));
  for (const p of normPaths) {
    if (normPaths.filter((x) => x === p).length > 1) {
      issues.push(`repositories.yaml: 仓库 path 重复 '${p}'`);
    }
  }
  for (const r of repos) {
    const norm = String(r.path).replace(/\\/g, '/');
    if (!norm) {
      issues.push(`repositories.yaml: 仓库 '${r.id}' 缺少 path`);
      continue;
    }
    if (norm !== 'implementation' && !norm.startsWith('implementation/')) {
      issues.push(`repositories.yaml: 仓库 '${r.id}' path '${r.path}' 不在 implementation/ 下`);
    }
  }

  // 3. .gitmodules 与 Registry 对照
  const submodules = await parseGitmodules(workspaceRoot);
  checked++;
  const regPaths = new Set(repos.map((r) => String(r.path).replace(/\\/g, '/')));
  for (const sm of submodules) {
    if (!regPaths.has(sm.path)) {
      issues.push(`.gitmodules: submodule '${sm.path}' 未注册进 repositories.yaml`);
    }
  }
  for (const r of repos) {
    const norm = String(r.path).replace(/\\/g, '/');
    const inGitmodules = submodules.some((sm) => sm.path === norm);
    if (!inGitmodules) continue; // 普通目录注册合法（greenfield 无 remote 场景）
  }

  // 4. 子仓 HEAD 可解析
  for (const r of repos) {
    const head = await resolveSubmoduleHead(workspaceRoot, r.path);
    if (head === null) {
      const kind = await pathExists(join(workspaceRoot, r.path));
      if (kind) issues.push(`repository '${r.id}': 路径存在但无法解析 HEAD（未 git init 或未初始化 submodule）`);
    }
    checked++;
  }

  // 5-8. 逐 CHG 检查
  const tree = await readFeatureTree(workspaceRoot);
  for (const changeId of await listChangeDirs(workspaceRoot)) {
    const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);
    const meta = await readMetadata(changeDir);
    const fp = meta['feature-path'];
    const hasFp = fp && typeof fp === 'object' && fp['level-1']?.id && fp.story?.id;

    if (hasFp) {
      // 6. feature-path 与树一致
      checked++;
      const chainIds = [fp['level-1'].id, fp['level-2'].id, fp['level-3'].id, fp.story.id];
      for (const id of chainIds) {
        if (!findNodeById(tree, id)) {
          issues.push(`${changeId}: feature-path 引用 '${id}' 不在 product/feature-tree.yaml 中`);
        }
      }
      // story 必须归属 l3（story id 前三段 == l3 id 段）
      const l3Segs = fp['level-3'].id.split('-').slice(1).join('-');
      const storySegs = fp.story.id.replace(/^STORY-/, '');
      if (!storySegs.startsWith(l3Segs)) {
        issues.push(`${changeId}: story '${fp.story.id}' 不归属 level-3 '${fp['level-3'].id}'`);
      }

      // 7. 目录路径与 metadata.feature-path 一致
      checked++;
      const dirs = featurePathDirs(meta);
      if (dirs) {
        const storyDir = join(changeDir, ...dirs);
        if (!(await pathExists(storyDir))) {
          issues.push(`${changeId}: STORY 目录未物化（${dirs.join('/')}）——feature-path 已绑定但目录缺失`);
        }
      }
    }

    // 5. DU repository ∈ Registry + 8. pointer 对齐
    const dusDir = hasFp ? join(changeDir, ...[fp['level-1'].id, fp['level-2'].id, fp['level-3'].id, fp.story.id]) : null;
    if (dusDir && (await pathExists(dusDir))) {
      checked++;
      const duEntries = await readdir(dusDir, { withFileTypes: true });
      for (const de of duEntries) {
        if (!de.isDirectory() || !/^DU-/.test(de.name)) continue;
        let duMeta = {};
        try {
          duMeta = parse(await readFile(join(dusDir, de.name, 'metadata.yaml'), 'utf8')) || {};
        } catch {
          issues.push(`${changeId}/${de.name}: metadata.yaml 缺失或损坏`);
          continue;
        }
        if (!repos.some((r) => r.id === duMeta.repository)) {
          issues.push(`${changeId}/${de.name}: repository '${duMeta.repository}' 不在 repositories.yaml`);
        }
        // 8. pointer 对齐（有 result 记录时）
        const resultCommit = duMeta.result?.commit;
        if (resultCommit && duMeta.repository) {
          const repo = repos.find((r) => r.id === duMeta.repository);
          if (repo) {
            const head = await resolveSubmoduleHead(workspaceRoot, repo.path);
            if (head && head !== resultCommit) {
              issues.push(
                `${changeId}/${de.name}: result commit 与 '${repo.id}' HEAD 不一致（可能未同步 submodule pointer）`
              );
            }
          }
        }
      }
    }
  }

  return { issues, checked };
}

// ---- Phase 2.6：context-rules.yaml 确定性校验（plans/phase-2.6-context-rules-design.md §9）----

const CONTEXT_STAGES = ['explore', 'prd', 'design', 'task', 'dev', 'test', 'review', 'converge'];
const CONTEXT_CATEGORIES = ['knowledge', 'artifact', 'code', 'meta'];
const CONTEXT_MODES = ['inline', 'outline'];

/**
 * context-rules.yaml v0.2 校验：stage 覆盖 / 枚举合法 / 数值字段 / path 存在性（warning 级）。
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<{issues:string[], checked:number}>}
 */
export async function runContextRulesChecks(workspaceRoot) {
  const issues = [];
  let checked = 0;
  const rulesPath = join(workspaceRoot, '.sdd', 'context-rules.yaml');
  let raw;
  try {
    raw = await readFile(rulesPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      issues.push(".sdd/context-rules.yaml 缺失（运行 'openspec init' 生成）");
      return { issues, checked };
    }
    throw e;
  }
  checked++;
  let doc;
  try {
    doc = parse(raw);
  } catch (e) {
    issues.push(`context-rules.yaml 解析失败: ${e.message}`);
    return { issues, checked };
  }

  const version = String(doc?.version || '0.1');
  if (version === '0.1') {
    issues.push('context-rules.yaml 为 v0.1 格式（建议升级 v0.2：结构化条目 + change-artifacts + limits）');
  }

  const stages = doc?.stages;
  if (!stages || typeof stages !== 'object') {
    issues.push('context-rules.yaml: 缺少 stages 段');
    return { issues, checked };
  }
  for (const s of CONTEXT_STAGES) {
    if (!stages[s]) issues.push(`context-rules.yaml: 缺少阶段 '${s}'`);
  }

  for (const [name, rule] of Object.entries(stages)) {
    if (!CONTEXT_STAGES.includes(name)) {
      issues.push(`context-rules.yaml: 未知阶段 '${name}'（允许: ${CONTEXT_STAGES.join('/')}）`);
    }
    if (!rule || !Array.isArray(rule.read)) {
      issues.push(`context-rules.yaml: 阶段 '${name}' 缺少 read 数组`);
      continue;
    }
    rule.read.forEach((r, i) => {
      const tag = `stages.${name}.read[${i}]`;
      if (typeof r === 'string') return; // v0.1 兼容
      if (!r || typeof r !== 'object' || !r.path) {
        issues.push(`context-rules.yaml: ${tag} 缺少 path`);
        return;
      }
      if (r.mode !== undefined && !CONTEXT_MODES.includes(r.mode)) {
        issues.push(`context-rules.yaml: ${tag} mode 非法 '${r.mode}'（允许: ${CONTEXT_MODES.join('/')}）`);
      }
      if (r.category !== undefined && !CONTEXT_CATEGORIES.includes(r.category)) {
        issues.push(`context-rules.yaml: ${tag} category 非法 '${r.category}'（允许: ${CONTEXT_CATEGORIES.join('/')}）`);
      }
      for (const k of ['max-files', 'max-bytes']) {
        if (r[k] !== undefined && (!Number.isInteger(r[k]) || r[k] <= 0)) {
          issues.push(`context-rules.yaml: ${tag} ${k} 须为正整数`);
        }
      }
      if (r.include !== undefined && !Array.isArray(r.include)) {
        issues.push(`context-rules.yaml: ${tag} include 须为数组`);
      }
      if (r.exclude !== undefined && !Array.isArray(r.exclude)) {
        issues.push(`context-rules.yaml: ${tag} exclude 须为数组`);
      }
    });
    if (rule['change-artifacts'] !== undefined && !Array.isArray(rule['change-artifacts'])) {
      issues.push(`context-rules.yaml: stages.${name}.change-artifacts 须为数组`);
    } else if (Array.isArray(rule['change-artifacts'])) {
      rule['change-artifacts'].forEach((a, j) => {
        if (typeof a === 'string') return;
        if (!a || typeof a !== 'object' || !a.path) {
          issues.push(`context-rules.yaml: stages.${name}.change-artifacts[${j}] 缺少 path`);
        }
      });
    }
  }

  if (doc.limits !== undefined) {
    for (const k of ['total-max-bytes', 'total-max-files']) {
      const v = doc.limits?.[k];
      if (v !== undefined && (!Number.isInteger(v) || v <= 0)) {
        issues.push(`context-rules.yaml: limits.${k} 须为正整数`);
      }
    }
  }

  // path 存在性（warning 级：允许模板先行，Workspace 内容后补）
  for (const [name, rule] of Object.entries(stages)) {
    if (!rule || !Array.isArray(rule.read)) continue;
    for (const r of rule.read) {
      const p = typeof r === 'string' ? r : r?.path;
      if (!p) continue;
      if (!(await pathExists(join(workspaceRoot, p)))) {
        issues.push(`context-rules.yaml: stages.${name} 条目 path 不存在: ${p}（warning）`);
      }
    }
  }

  return { issues, checked };
}
