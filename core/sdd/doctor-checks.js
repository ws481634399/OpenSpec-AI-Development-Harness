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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readWorkspaceVersions, readHarnessVersion, readTemplateVersions, compareSemver } from '../workspace/version.js';
import { readRepositories } from './delivery-unit.js';
import { parseGitmodules, resolveSubmoduleHead } from './git-submodule.js';
import { readFeatureTree, findNodeById } from './feature-model.js';
import { readMetadata } from './change-model.js';
import { featurePathDirs, resolveStoryDir } from './artifact-path.js';

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

/**
 * 树结构反查：story 是否直接挂在指定 L3 节点的 stories 下。
 * 兼容 v2 嵌套编码与手工命名的非嵌套 ID。
 */
function storyBelongsToL3(tree, l3Id, storyId) {
  for (const l1 of tree.modules) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        if (l3.id === l3Id && (l3.stories || []).some((s) => s.id === storyId)) return true;
      }
      // v1 过渡：story 直挂 L2 时，L2 本身可能被当作 level-3 引用
      if (l2.id === l3Id && (l2.stories || []).some((s) => s.id === storyId)) return true;
    }
  }
  return false;
}

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

  // 4. 子仓 HEAD 可解析（kind:dir 普通目录无独立 .git，只检查路径存在——单仓多模块形态）
  for (const r of repos) {
    if (r.kind === 'dir') {
      if (!(await pathExists(join(workspaceRoot, r.path)))) {
        issues.push(`repository '${r.id}': kind:dir 模块目录不存在（${r.path}）`);
      }
      checked++;
      continue;
    }
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
      // story 必须归属 l3：优先树结构反查（兼容手工命名的非嵌套编码 ID，如 STORY-2），
      // 仅当结构反查失败且 story 为 v2 嵌套编码时才退化为段校验
      if (!storyBelongsToL3(tree, fp['level-3'].id, fp.story.id)) {
        const l3Segs = fp['level-3'].id.split('-').slice(1).join('-');
        const storySegs = fp.story.id.replace(/^STORY-/, '');
        if (!storySegs.startsWith(l3Segs)) {
          issues.push(`${changeId}: story '${fp.story.id}' 不归属 level-3 '${fp['level-3'].id}'`);
        }
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

    // 5. DU repository ∈ Registry + 8. pointer 对齐（DU 协调目录在 STORY 目录下）
    const dusDir = hasFp ? resolveStoryDir(changeDir, meta) : null;
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
 * 校验单个 read 条目（workspace 级 read 与 per-repo 段 read 共用，Phase 2.7）。
 * @param {object|string} r 条目
 * @param {string} tag 错误信息定位（如 stages.dev.read[0]）
 * @param {string[]} issues 累积 issue
 */
function validateContextEntry(r, tag, issues) {
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
}

/**
 * context-rules.yaml 校验（v0.3，Phase 2.6 §9 + Phase 2.7 §9）：
 * stage 覆盖 / 枚举合法 / 数值字段 / repos 段（repoId 合法性）/ path 存在性（warning 级）。
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
  // repositories.yaml id 集合（repos 段 repoId 校验用；缺失 → 空）
  const registryIds = new Set((await readRepositories(workspaceRoot)).map((r) => r.id));
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
    rule.read.forEach((r, i) => validateContextEntry(r, `stages.${name}.read[${i}]`, issues));
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
    // Phase 2.7：per-repo 规则段（v0.3）
    if (rule.repos !== undefined) {
      if (Number(version) < 0.3) {
        issues.push(`context-rules.yaml: stages.${name}.repos 需要 version >= 0.3（当前 ${version}）`);
      }
      if (!rule.repos || typeof rule.repos !== 'object' || Array.isArray(rule.repos)) {
        issues.push(`context-rules.yaml: stages.${name}.repos 须为对象（repoId → { read }）`);
      } else {
        for (const [repoId, sec] of Object.entries(rule.repos)) {
          const rtag = `stages.${name}.repos.${repoId}`;
          if (!registryIds.has(repoId)) {
            issues.push(`context-rules.yaml: ${rtag} repoId 不在 .sdd/repositories.yaml（warning）`);
          }
          if (!sec || !Array.isArray(sec.read)) {
            issues.push(`context-rules.yaml: ${rtag} 缺少 read 数组`);
          } else {
            sec.read.forEach((r, i) => validateContextEntry(r, `${rtag}.read[${i}]`, issues));
          }
        }
      }
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

  // path 存在性（warning 级：允许模板先行，Workspace 内容后补；含 per-repo 段条目）
  for (const [name, rule] of Object.entries(stages)) {
    if (!rule || !Array.isArray(rule.read)) continue;
    const checkPath = async (p, tag) => {
      if (!p) return;
      if (!(await pathExists(join(workspaceRoot, p)))) {
        issues.push(`context-rules.yaml: ${tag} 条目 path 不存在: ${p}（warning）`);
      }
    };
    for (const r of rule.read) {
      await checkPath(typeof r === 'string' ? r : r?.path, `stages.${name}`);
    }
    if (rule.repos && typeof rule.repos === 'object' && !Array.isArray(rule.repos)) {
      for (const [repoId, sec] of Object.entries(rule.repos)) {
        if (!sec || !Array.isArray(sec.read)) continue;
        for (const r of sec.read) {
          await checkPath(typeof r === 'string' ? r : r?.path, `stages.${name}.repos.${repoId}`);
        }
      }
    }
  }

  return { issues, checked };
}

/**
 * 版本健康检查（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.5）：
 * version.yaml 存在性 / harness.version 兼容性（跨 major=error，落后=info）/
 * schema.version 超前=warning / workspace.yaml 记录点不一致=warning。
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录
 * @returns {{issues:string[], infos:string[], checked:number}}
 */
export function runVersionChecks(workspaceRoot, harnessRoot) {
  const issues = [];
  const infos = [];
  let checked = 0;

  const ws = readWorkspaceVersions(workspaceRoot);
  checked++;
  if (!ws) {
    issues.push('.sdd/version.yaml 缺失（Workspace 过旧，无法自动升级；可重新 init 或手动补齐）');
    return { issues, infos, checked };
  }

  if (!ws.harness) {
    issues.push('version.yaml: harness.version 缺失');
  } else {
    const hv = readHarnessVersion(harnessRoot);
    const wsMajor = String(ws.harness).split('.')[0];
    const hvMajor = String(hv).split('.')[0];
    if (wsMajor !== hvMajor) {
      issues.push(
        `version.yaml: harness.version ${ws.harness} 与当前 Harness ${hv} 跨 major 版本，需人工评估迁移`
      );
    } else if (compareSemver(ws.harness, hv) < 0) {
      infos.push(`Harness 有新版本 ${hv}（当前 Workspace ${ws.harness}）——运行 'openspec upgrade --dry-run' 预览升级`);
    }

    // schema 超前：Workspace schema.version 高于 Harness 模板支持的 schema 版本
    if (ws.schema) {
      const tpl = readTemplateVersions(harnessRoot);
      if (tpl.schema && compareSemver(ws.schema, tpl.schema) > 0) {
        issues.push(
          `warning: version.yaml schema.version ${ws.schema} 高于当前 Harness 支持的 ${tpl.schema}（Workspace 可能由更新版本的 Harness 创建）`
        );
      }
    }
  }

  // 两个记录点一致性：workspace.yaml 的 workspace.harness.version vs version.yaml 的 harness.version
  try {
    const wsYaml = parse(readFileSync(join(workspaceRoot, '.sdd', 'workspace.yaml'), 'utf8'));
    const rec = wsYaml?.workspace?.harness?.version;
    if (rec != null && ws.harness != null && String(rec) !== String(ws.harness)) {
      issues.push(`warning: workspace.yaml 记录的 harness.version ${rec} 与 version.yaml ${ws.harness} 不一致`);
    }
  } catch {
    // workspace.yaml 缺失/解析失败由 runSelfCheck 负责，此处静默
  }

  return { issues, infos, checked };
}

// ---- Phase 3.3：IDE 规则版本检查（plans/phase-3.3-ide-adapters-design.md §7）----
// 可选件：规则文件不存在不提示（不是必需品）；存在且落后 → info 引导 `openspec ide <target>`

import { TARGET_FILES } from '../workspace/ide-rules.js';
import { COMMANDS_DIR } from '../workspace/ide-commands.js';

/**
 * IDE 规则与 Skill 命令版本检查。
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录（读取当前 Harness 版本做比对）
 * @returns {Promise<{issues:string[], infos:string[], checked:number}>}
 */
export async function runIdeRulesChecks(workspaceRoot, harnessRoot) {
  const issues = [];
  const infos = [];
  let checked = 0;
  const hv = readHarnessVersion(harnessRoot);

  // 规则文件（单文件，整文件归属判定）
  for (const [target, relFile] of Object.entries(TARGET_FILES)) {
    const p = join(workspaceRoot, relFile);
    let content;
    try {
      content = await readFile(p, 'utf8');
    } catch {
      continue; // 不存在 → 不提示
    }
    checked++;
    const m = content.match(/openspec-ide-rules:\s*v(\d+\.\d+\.\d+)/);
    if (!m) continue; // 非 openspec 生成的文件 → 不评判
    if (compareSemver(m[1], hv) < 0) {
      infos.push(`IDE 规则可更新（${target}: v${m[1]} → v${hv}）——运行 'openspec ide ${target}'`);
    }
  }

  // Skill 命令（目录集合，存在即检查；落后计数聚合为一条 info）
  for (const [target, cmdDir] of Object.entries(COMMANDS_DIR)) {
    const dir = join(workspaceRoot, cmdDir);
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // 目录不存在 → 用户未启用 commands，不提示
    }
    const cmdFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.md'));
    if (cmdFiles.length === 0) continue;
    let outdated = 0;
    for (const f of cmdFiles) {
      let content;
      try {
        content = await readFile(join(dir, f.name), 'utf8');
      } catch {
        continue;
      }
      const m = content.match(/openspec-ide-commands:\s*v(\d+\.\d+\.\d+)/);
      if (m && compareSemver(m[1], hv) < 0) outdated++;
    }
    if (outdated > 0) {
      infos.push(`IDE Skill 命令可更新（${target}: ${outdated}/${cmdFiles.length} 落后）——运行 'openspec ide ${target}'`);
    }
  }

  return { issues, infos, checked };
}
