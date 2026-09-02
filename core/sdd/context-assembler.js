// ContextAssembler：消费 context-rules.yaml 装配 Workspace Context（Phase 2.6 v2 + Phase 2.7 DU 绑定）
//
// 规则模型（plans/phase-2.6-context-rules-design.md §4 + phase-2.7-du-repo-context-design.md §4）：
// - read 条目：字符串（v0.1 兼容 → { path, mode: 'inline' }）或结构化对象
//   { path, category: knowledge|artifact|code|meta, mode: inline|outline,
//     include?, exclude?, max-files?, max-bytes? }
// - change-artifacts：本 CHG 前序产物（相对 CHG 目录），显式条目 + 确定性自动注入
//   （STORY 级 tasks.md / DU-*/metadata.yaml，见 §4.3）
// - limits：全局预算（total-max-bytes 默认 256KB / total-max-files 默认 200），确定性截断入 skipped
// - repos（v0.3）：stages[stage].repos.<repoId>.read per-repo 规则段，仅绑定 DU 且
//   DU.repository === repoId 时激活（Phase 2.7 §4）
//
// DU 绑定（Phase 2.7 §5）：opts.du 传入 DU id 后确定性注入 repo 侧上下文
// （task.md / metadata.yaml inline；implementation.md / evidence/ outline），返回 duBinding。
//
// 纯函数，依赖 node:fs/promises + yaml，无 CLI/@clack 依赖；stage 名与 rules 对齐：
// explore/prd/design/task/dev/test/review/converge

import { readFile, stat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { listFiles } from './fs-walker.js';
import { featurePathDirs, resolveStoryDir, resolveStoryDirV3 } from './artifact-path.js';
import { readMetadata } from './change-model.js';
import { readRepositories, findRepository, readWorkspaceDus } from './delivery-unit.js';

// 单文件最多读取字节数（避免大文件撑爆 Instruction）
const MAX_FILE_BYTES = 16384;

// 全局预算缺省值（phase-2.6 §4.4）
const DEFAULT_TOTAL_MAX_BYTES = 262144;
const DEFAULT_TOTAL_MAX_FILES = 200;

// 自动注入 Change Artifacts 的阶段集合（§4.3）
const AUTO_TASKS_STAGES = new Set(['task', 'dev', 'test', 'review', 'converge']);
const AUTO_DU_STAGES = new Set(['dev', 'test', 'review', 'converge']);

const CATEGORY_BY_PREFIX = [
  ['standards/', 'knowledge'],
  ['product/', 'knowledge'],
  ['delivery/', 'artifact'],
  ['implementation/', 'code'],
];

/**
 * 极简 glob 转 RegExp（双星跨目录 / 单星不跨段 / 问号单字符）。
 * 双星加斜杠匹配零层或多层目录；单星不跨目录段；问号匹配单字符。
 * @param {string} glob
 * @returns {RegExp}
 */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

/** 推断条目 category（未显式声明时按路径前缀；目录名不带尾斜杠也匹配）。 */
function inferCategory(path) {
  for (const [prefix, cat] of CATEGORY_BY_PREFIX) {
    const dir = prefix.slice(0, -1); // 'standards/' → 'standards'
    if (path === dir || path.startsWith(prefix)) return cat;
  }
  return 'meta';
}

/** workspace 相对路径（POSIX 规范化）。 */
function toPosix(p) {
  return p.split('\\').join('/');
}

/** 读单文件正文（16KB 截断；读失败返回空串）。 */
async function readContent(abs) {
  try {
    let content = await readFile(abs, 'utf8');
    if (content.length > MAX_FILE_BYTES) {
      content = content.slice(0, MAX_FILE_BYTES) + '\n... (truncated)';
    }
    return content;
  } catch {
    return '';
  }
}

/**
 * 收集单个 read 条目的文件（workspace 相对 POSIX 路径列表）。
 * @returns {Promise<string[]>}
 */
async function collectEntryFiles(workspaceRoot, entryPath) {
  const abs = join(workspaceRoot, entryPath);
  let st;
  try {
    st = await stat(abs);
  } catch {
    return []; // path 不存在 → 空（doctor 负责告警）
  }
  if (st.isFile()) return [toPosix(entryPath)];
  const dirPrefix = toPosix(entryPath).replace(/\/+$/, '');
  const rel = await listFiles(abs);
  return rel.map((f) => (dirPrefix ? `${dirPrefix}/${f}` : f));
}

/**
 * 装配指定阶段的 Workspace Context（v2 + Phase 2.7 DU 绑定）。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {string} stage SDD 阶段名
 * @param {{changeDir?:string, metadata?:object, du?:string|{id:string, repository?:string},
 *          storyId?:string}} [opts]
 *   changeDir：CHG 目录绝对路径（Change Artifacts 注入 + feature-path 解析）
 *   metadata：readMetadata 结果（避免重复读；changeDir 缺省时忽略）
 *   du：绑定的 Delivery Unit id（Phase 2.7；注入 repo 侧上下文 + 激活 per-repo 规则段）
 *   storyId：Phase 4.2 Story 上下文（3-tier 多 Story）——产物/DU 定位到 stories/<id>/，
 *           并自动注入 Change 级规格引用（prd/design 阶段 inline；task/dev/test/review 阶段 outline）
 * @returns {Promise<{
 *   stage:string,
 *   dirs:string[],
 *   files:Array<{path:string,content:string,category:string,mode:string,source:string}>,
 *   missingArtifacts:string[],
 *   skipped:string[],
 *   budget:{usedBytes:number,usedFiles:number,limitBytes:number,limitFiles:number},
 *   rulesVersion:string,
 *   duBinding:{duId:string,repository:string,repoPath:string,materialized:boolean,
 *              activatedRepos:string[],guidance:object|null}|null,
 * }>}
 * @throws {Error} context-rules.yaml 缺失、stage 未定义、DU 不存在或 repository 不合法
 */
export async function assembleContext(workspaceRoot, stage, opts = {}) {
  const rulesPath = join(workspaceRoot, '.sdd', 'context-rules.yaml');
  let raw;
  try {
    raw = await readFile(rulesPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      throw new Error("Context rules not found: .sdd/context-rules.yaml. Run 'openspec init' first.");
    }
    throw e;
  }
  const doc = parse(raw);
  const stageRule = doc?.stages?.[stage];
  if (!stageRule || !Array.isArray(stageRule.read)) {
    throw new Error(`No context rules for stage: ${stage}`);
  }
  const rulesVersion = String(doc.version || '0.1');
  const changeDir = opts.changeDir;
  const changeId = changeDir ? toPosix(relative(workspaceRoot, changeDir)).split('/').pop() : null;

  // 全局预算（limits 仅 v0.2 生效；v0.1 文件用缺省值兜底）
  const limits = doc.limits || {};
  const budget = {
    usedBytes: 0,
    usedFiles: 0,
    limitBytes: Number(limits['total-max-bytes']) || DEFAULT_TOTAL_MAX_BYTES,
    limitFiles: Number(limits['total-max-files']) || DEFAULT_TOTAL_MAX_FILES,
  };

  const files = [];
  const skipped = [];
  const missingArtifacts = [];

  /** 预算占用：返回 false 表示超全局预算（文件级调用方决定 skipped 行为）。 */
  const fitsBudget = (bytes) =>
    budget.usedBytes + bytes <= budget.limitBytes && budget.usedFiles < budget.limitFiles;

  // ---- 1. read 条目 ----
  const readEntries = stageRule.read
    .map((r) =>
      typeof r === 'string'
        ? { path: r, mode: 'inline', source: 'rule' } // v0.1 兼容
        : { ...r, mode: r.mode || 'inline', source: 'rule' },
    )
    .filter((r) => r.path);

  /**
   * 装配单个 read 条目（workspace 级与 per-repo 段共用同一管道，Phase 2.7）。
   * @param {object} entry 规范化条目 { path, mode, category?, include?, exclude?, max-files?, max-bytes? }
   * @param {'rule'|'repo'} source 来源标记
   */
  const processEntry = async (entry, source) => {
    const entryPath = toPosix(String(entry.path)).replace(/\/+$/, '');
    const category = entry.category || inferCategory(entryPath);
    const mode = entry.mode === 'outline' ? 'outline' : 'inline';
    const includeRes = (Array.isArray(entry.include) ? entry.include : []).map(globToRegExp);
    const excludeRes = (Array.isArray(entry.exclude) ? entry.exclude : []).map(globToRegExp);
    const maxFiles = Number(entry['max-files']) || 0;
    const maxBytes = Number(entry['max-bytes']) || 0;

    let relFiles = await collectEntryFiles(workspaceRoot, entryPath);
    relFiles = relFiles.filter((f) => {
      if (includeRes.length > 0 && !includeRes.some((re) => re.test(f))) return false;
      if (excludeRes.some((re) => re.test(f))) return false;
      return true;
    });

    let entryBytes = 0;
    let entryCount = 0;
    for (const f of relFiles) {
      if (maxFiles && entryCount >= maxFiles) {
        skipped.push(`${f} (over entry max-files)`);
        continue;
      }
      if (mode === 'outline') {
        if (!fitsBudget(0)) {
          skipped.push(`${f} (over budget)`);
          continue;
        }
        budget.usedFiles += 1;
        entryCount += 1;
        files.push({ path: f, content: '', category, mode, source });
        continue;
      }
      // inline：读正文
      const content = await readContent(join(workspaceRoot, f));
      const size = Buffer.byteLength(content, 'utf8');
      if (maxBytes && entryBytes + size > maxBytes) {
        skipped.push(`${f} (over entry max-bytes)`);
        continue;
      }
      if (!fitsBudget(size)) {
        skipped.push(`${f} (over budget)`);
        continue;
      }
      entryBytes += size;
      entryCount += 1;
      budget.usedBytes += size;
      budget.usedFiles += 1;
      files.push({ path: f, content, category, mode, source });
    }
  };

  for (const entry of readEntries) {
    await processEntry(entry, 'rule');
  }

  // ---- 2. Change Artifacts（显式 + 自动注入，§4.3；Phase 4.2 storyId 分发）----
  if (changeDir) {
    const meta = opts.metadata || null;
    const storyId = opts.storyId || null;
    // Phase 4.2：story mode 的 Story 目录（3-tier → stories/<id>/；inline → 四级目录回落）
    const storyDirV3 =
      storyId && meta ? resolveStoryDirV3(changeDir, meta, storyId) : null;
    const explicit = (Array.isArray(stageRule['change-artifacts']) ? stageRule['change-artifacts'] : [])
      .map((a) => (typeof a === 'string' ? a : a?.path))
      .filter(Boolean);

    /**
     * 注入单个 Change Artifact（存在性检查 + 预算；候选位置优先 STORY 目录，兼容 CHG 根存量）。
     * @param {string} rel 相对 CHG 目录的路径
     * @param {'change-artifact'|'auto'} source 来源标记
     * @param {string} [missingReason] 缺失原因（缺省用 not found）
     * @param {'inline'|'outline'} [mode] outline 只登记路径不读正文（Change 级引用防过载）
     */
    const pushArtifact = async (rel, source, missingReason, mode = 'inline') => {
      const sDir =
        storyId && meta
          ? storyDirV3
          : meta
            ? resolveStoryDir(changeDir, meta)
            : null;
      const candidates = [];
      if (sDir) candidates.push(join(sDir, rel));
      candidates.push(join(changeDir, rel));
      let abs = null;
      for (const c of candidates) {
        try {
          const s = await stat(c);
          if (s.isFile()) {
            abs = c;
            break;
          }
        } catch {
          // 尝试下一个候选位置
        }
      }
      if (!abs) {
        missingArtifacts.push(missingReason ? `${rel} (${missingReason})` : `${rel} (not found)`);
        return;
      }
      if (mode === 'outline') {
        if (!fitsBudget(0)) {
          skipped.push(`delivery/changes/${changeId}/${toPosix(rel)} (over budget)`);
          return;
        }
        budget.usedFiles += 1;
        files.push({
          path: `delivery/changes/${changeId}/${toPosix(rel)}`,
          content: '',
          category: 'artifact',
          mode,
          source,
        });
        return;
      }
      const content = await readContent(abs);
      const size = Buffer.byteLength(content, 'utf8');
      if (!fitsBudget(size)) {
        skipped.push(`delivery/changes/${changeId}/${rel} (over budget)`);
        return;
      }
      budget.usedBytes += size;
      budget.usedFiles += 1;
      files.push({
        path: `delivery/changes/${changeId}/${toPosix(rel)}`,
        content,
        category: 'artifact',
        mode: 'inline',
        source,
      });
    };

    // 2a. 显式条目（按声明顺序）
    for (const rel of explicit) {
      await pushArtifact(rel, 'change-artifact');
    }

    // 2b. 自动：STORY 级 tasks.md（feature-path 已绑定或 story mode → 存在性检查）
    if (AUTO_TASKS_STAGES.has(stage)) {
      if (storyId) {
        // Phase 4.2 story mode：tasks.md 在 stories/<id>/（3-tier）或四级目录（inline 回落）
        await pushArtifact('tasks.md', 'auto', 'story tasks.md not found');
      } else {
        const fp = meta ? featurePathDirs(meta) : null;
        if (!fp) {
          missingArtifacts.push('tasks.md (feature-path not bound)');
        } else {
          await pushArtifact([...fp, 'tasks.md'].join('/'), 'auto');
        }
      }
    }

    // 2c. 自动：STORY 目录下 DU-*/metadata.yaml（readdir 扫描，仅一层）
    if (AUTO_DU_STAGES.has(stage)) {
      if (storyId) {
        if (!storyDirV3) {
          missingArtifacts.push('DU-*/metadata.yaml (story dir not resolved)');
        } else {
          let duIds = [];
          try {
            duIds = (await readdir(storyDirV3, { withFileTypes: true }))
              .filter((d) => d.isDirectory() && d.name.startsWith('DU-'))
              .map((d) => d.name)
              .sort();
          } catch {
            duIds = []; // Story 目录未创建（task 未开始）→ 不标注 missing（tasks.md 已标）
          }
          for (const du of duIds) {
            await pushArtifact(join(du, 'metadata.yaml'), 'auto');
          }
        }
      } else {
        const fp = meta ? featurePathDirs(meta) : null;
        if (!fp) {
          missingArtifacts.push('DU-*/metadata.yaml (feature-path not bound)');
        } else {
          const storyDir = join(changeDir, ...fp);
          let duIds = [];
          try {
            duIds = (await readdir(storyDir, { withFileTypes: true }))
              .filter((d) => d.isDirectory() && d.name.startsWith('DU-'))
              .map((d) => d.name)
              .sort();
          } catch {
            duIds = []; // STORY 目录未创建（task 未开始）→ 不标注 missing（tasks.md 已标）
          }
          for (const du of duIds) {
            await pushArtifact([...fp, du, 'metadata.yaml'].join('/'), 'auto');
          }
        }
      }
    }

    // 2d. Phase 4.2 story mode：自动注入 Change 级规格引用（story-spec/design 的锚定上下文）
    // prd/design 阶段 inline（写 Story 规格需读 Change 规格）；
    // task/dev/test/review 阶段 outline（只登记标题骨架，防上下文过载，plan §9 风险缓解）
    if (storyId) {
      const changeRefs =
        stage === 'prd'
          ? ['change-prd.md']
          : stage === 'design'
            ? ['change-prd.md', 'change-design.md']
            : AUTO_TASKS_STAGES.has(stage)
              ? ['change-prd.md', 'change-design.md']
              : [];
      const refMode = stage === 'prd' || stage === 'design' ? 'inline' : 'outline';
      for (const name of changeRefs) {
        await pushArtifact(name, 'auto', undefined, refMode);
      }
    }
  }

  // ---- 3. DU 绑定（Phase 2.7 §5：repo 侧确定性注入 + per-repo 规则段激活）----
  const duOpt = typeof opts.du === 'string' ? { id: opts.du } : opts.du || null;
  let duBinding = null;
  if (duOpt?.id) {
    if (!changeDir) {
      throw new Error('绑定 DU 需要提供 changeDir（CLI 传 --change <CHG>）');
    }
    const meta = opts.metadata || (await readMetadata(changeDir));
    const dus = await readWorkspaceDus(changeDir, meta);
    const du = dus.find((d) => d.id === duOpt.id);
    if (!du) {
      const known = dus.map((d) => d.id).join(', ') || '无';
      throw new Error(`Workspace DU not found: ${duOpt.id}（当前 Change 可用 DU: ${known}）`);
    }
    const repository = du.metadata.repository || '';
    if (duOpt.repository && duOpt.repository !== repository) {
      throw new Error(`DU ${du.id} repository 不匹配（metadata: ${repository}，传入: ${duOpt.repository}）`);
    }
    const repos = await readRepositories(workspaceRoot);
    const repo = findRepository(repos, repository);
    if (!repo) {
      throw new Error(`repository '${repository}' 不在 .sdd/repositories.yaml（DU ${du.id} 1:1 硬约束）`);
    }

    // repo 侧交付目录：优先 repository-delivery.path（materialize 回填），缺省按物化规则推导
    const fp = featurePathDirs(meta);
    const deliveryPath = du.metadata['repository-delivery']?.path;
    const repoPath =
      deliveryPath ||
      (fp ? `${String(repo.path).replace(/\\/g, '/')}/delivery/${changeId}/${fp.join('/')}/${du.id}` : null);

    let materialized = false;
    if (repoPath) {
      try {
        await stat(join(workspaceRoot, repoPath, 'metadata.yaml'));
        materialized = true;
      } catch {
        materialized = false;
      }
    }

    /**
     * 注入 repo 侧单文件（source=repo）。missingReason 缺省的条目（implementation.md /
     * evidence/）缺失时静默跳过——设计 §5：仅 metadata.yaml 与 task.md 必需。
     */
    const pushRepoFile = async (relPath, mode, missingReason) => {
      const abs = join(workspaceRoot, relPath);
      let st;
      try {
        st = await stat(abs);
      } catch {
        if (missingReason) missingArtifacts.push(`${relPath} (${missingReason})`);
        return;
      }
      if (!st.isFile()) return;
      if (mode === 'outline') {
        if (!fitsBudget(0)) {
          skipped.push(`${relPath} (over budget)`);
          return;
        }
        budget.usedFiles += 1;
        files.push({ path: relPath, content: '', category: 'artifact', mode, source: 'repo' });
        return;
      }
      const content = await readContent(abs);
      const size = Buffer.byteLength(content, 'utf8');
      if (!fitsBudget(size)) {
        skipped.push(`${relPath} (over budget)`);
        return;
      }
      budget.usedBytes += size;
      budget.usedFiles += 1;
      files.push({ path: relPath, content, category: 'artifact', mode, source: 'repo' });
    };

    const notMaterializedReason = `not materialized — run: openspec du materialize ${changeId} ${du.id}`;
    if (!materialized) {
      if (repoPath) {
        missingArtifacts.push(`${repoPath}/metadata.yaml (${notMaterializedReason})`);
        missingArtifacts.push(`${repoPath}/task.md (${notMaterializedReason})`);
      }
    } else {
      await pushRepoFile(`${repoPath}/metadata.yaml`, 'inline');
      await pushRepoFile(`${repoPath}/task.md`, 'inline');
      // implementation.md（Agent 将写入的 Actual 记录）与 evidence/ 仅 outline，不标 missing
      await pushRepoFile(`${repoPath}/implementation.md`, 'outline');
      try {
        const evidenceFiles = await listFiles(join(workspaceRoot, repoPath, 'evidence'));
        for (const f of evidenceFiles) {
          await pushRepoFile(`${repoPath}/evidence/${f}`, 'outline');
        }
      } catch {
        // evidence/ 未创建 → 跳过
      }
    }

    // per-repo 规则段（v0.3）：仅激活 DU.repository 对应段（DU 1:1 Repository）
    const activated = [];
    const repoSection =
      stageRule.repos && typeof stageRule.repos === 'object' && !Array.isArray(stageRule.repos)
        ? stageRule.repos[repository]
        : null;
    if (repoSection && Array.isArray(repoSection.read)) {
      activated.push(repository);
      for (const entry of repoSection.read) {
        if (typeof entry === 'string') {
          await processEntry({ path: entry, mode: 'inline' }, 'repo');
        } else if (entry?.path) {
          await processEntry({ ...entry, mode: entry.mode || 'inline' }, 'repo');
        }
      }
    }

    duBinding = {
      duId: du.id,
      repository,
      repoPath,
      materialized,
      activatedRepos: activated,
      guidance: du.metadata['implementation-guidance'] || null,
    };
  }

  // dirs 兼容保留：read 条目的顶层目录（v1 形态）
  const dirs = [...new Set(readEntries.map((e) => toPosix(String(e.path)).replace(/\/+$/, '')))];

  // Phase 3.5 修订：产物落位信息（Agent 依据其在 Instruction 中写对位置）
  const featureDirs = opts.metadata ? featurePathDirs(opts.metadata) : null;

  // Phase 4.2：Story 上下文透传（3-tier 时为 stories/<id>/ 相对路径）
  const storyId = opts.storyId || null;
  const storyDir =
    storyId && changeDir && opts.metadata
      ? toPosix(relative(changeDir, resolveStoryDirV3(changeDir, opts.metadata, storyId) || changeDir))
      : null;

  return {
    stage,
    dirs,
    files,
    missingArtifacts,
    skipped,
    budget,
    rulesVersion,
    duBinding,
    changeId,
    featureDirs,
    storyId,
    storyDir,
  };
}
