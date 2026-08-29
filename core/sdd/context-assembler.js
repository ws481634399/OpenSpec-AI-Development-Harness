// ContextAssembler：消费 context-rules.yaml 装配 Workspace Context（Phase 2.6 v2）
//
// 规则模型（plans/phase-2.6-context-rules-design.md §4）：
// - read 条目：字符串（v0.1 兼容 → { path, mode: 'inline' }）或结构化对象
//   { path, category: knowledge|artifact|code|meta, mode: inline|outline,
//     include?, exclude?, max-files?, max-bytes? }
// - change-artifacts：本 CHG 前序产物（相对 CHG 目录），显式条目 + 确定性自动注入
//   （STORY 级 tasks.md / DU-*/metadata.yaml，见 §4.3）
// - limits：全局预算（total-max-bytes 默认 256KB / total-max-files 默认 200），确定性截断入 skipped
//
// 纯函数，依赖 node:fs/promises + yaml，无 CLI/@clack 依赖；stage 名与 rules 对齐：
// explore/prd/design/task/dev/test/review/converge

import { readFile, stat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { listFiles } from './fs-walker.js';
import { featurePathDirs } from './artifact-path.js';

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
 * 装配指定阶段的 Workspace Context（v2）。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {string} stage SDD 阶段名
 * @param {{changeDir?:string, metadata?:object}} [opts]
 *   changeDir：CHG 目录绝对路径（Change Artifacts 注入 + feature-path 解析）
 *   metadata：readMetadata 结果（避免重复读；changeDir 缺省时忽略）
 * @returns {Promise<{
 *   stage:string,
 *   dirs:string[],
 *   files:Array<{path:string,content:string,category:string,mode:string,source:string}>,
 *   missingArtifacts:string[],
 *   skipped:string[],
 *   budget:{usedBytes:number,usedFiles:number,limitBytes:number,limitFiles:number},
 * }>}
 * @throws {Error} context-rules.yaml 缺失或 stage 未定义
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

  for (const entry of readEntries) {
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
        files.push({ path: f, content: '', category, mode, source: 'rule' });
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
      files.push({ path: f, content, category, mode, source: 'rule' });
    }
  }

  // ---- 2. Change Artifacts（显式 + 自动注入，§4.3）----
  const changeDir = opts.changeDir;
  if (changeDir) {
    const changeId = toPosix(relative(workspaceRoot, changeDir)).split('/').pop();
    const meta = opts.metadata || null;
    const explicit = (Array.isArray(stageRule['change-artifacts']) ? stageRule['change-artifacts'] : [])
      .map((a) => (typeof a === 'string' ? a : a?.path))
      .filter(Boolean);

    /** 注入单个 Change Artifact（存在性检查 + 预算）。 */
    const pushArtifact = async (rel, source, missingReason) => {
      const abs = join(changeDir, rel);
      let st;
      try {
        st = await stat(abs);
      } catch {
        missingArtifacts.push(missingReason ? `${rel} (${missingReason})` : `${rel} (not found)`);
        return;
      }
      if (!st.isFile()) {
        missingArtifacts.push(`${rel} (not a file)`);
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

    // 2b. 自动：STORY 级 tasks.md（feature-path 已绑定 → 存在性检查）
    if (AUTO_TASKS_STAGES.has(stage)) {
      const fp = meta ? featurePathDirs(meta) : null;
      if (!fp) {
        missingArtifacts.push('tasks.md (feature-path not bound)');
      } else {
        await pushArtifact([...fp, 'tasks.md'].join('/'), 'auto');
      }
    }

    // 2c. 自动：STORY 目录下 DU-*/metadata.yaml（readdir 扫描，仅一层）
    if (AUTO_DU_STAGES.has(stage)) {
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

  // dirs 兼容保留：read 条目的顶层目录（v1 形态）
  const dirs = [...new Set(readEntries.map((e) => toPosix(String(e.path)).replace(/\/+$/, '')))];

  return { stage, dirs, files, missingArtifacts, skipped, budget, rulesVersion };
}
