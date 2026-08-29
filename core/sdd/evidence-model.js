// EvidenceModel：CHG 结构化证据索引 evidence/evidence.yaml 读写与校验（Phase 2.1）
// 由 ChangeModel.runChangeCreate 调用 initEvidence（幂等初始化），
// 由 GateValidator 调用 loadEvidence / validateEvidence / checkCoverage（machine gate）。
// 对齐 phase-2.1-evidence-system-design.md 与 evidence.yaml 内注释 schema。

import { writeFile, access, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parseDocument, parse } from 'yaml';

const EVIDENCE_TEMPLATE = `# OpenSpec Evidence Model（Phase 2.1）
#
# 版本: v0.1
# 类型: Change 结构化证据索引
#
# 由 ChangeModel.runChangeCreate 初始化（填充 change-id），
# 由 sdd-dev（code-change）/ sdd-test（test-run）/ sdd-review（review-finding，Phase 2.2 启用）
# 通过追加 items 写入。机器由 gate.yaml 的 evidence-coverage 检查消费。
#
# 条目结构（按 type 区分必填字段）：
#
# ---- type: code-change ----
# - id: EV-001                 # 唯一 id，EV-NNN 递增（appendEvidence 自动分配）
#   type: code-change
#   repo: main                 # 必填，对应 .sdd/repositories.yaml 的 id
#   commit: 23fdb62            # 必填，commit 短 sha（小写）
#   task: TASK-001             # 必填，关联 tasks.md 的 Task id
#   reason: 实现注册服务        # 必填，为什么改
#   files:                     # 必填（可为空数组），修改文件清单
#     - path: src/services/auth/register.js
#       symbols: [registerUser, hashPassword]   # 可选，函数/类/接口名
#   recorded-at: ""            # ISO8601
#
# ---- type: test-run ----
# - id: EV-002
#   type: test-run
#   command: npm test          # 必填，执行命令
#   result: passed             # 必填，passed / failed / partial
#   summary:                   # 必填（对象）
#     total: 0
#     passed: 0
#     failed: 0
#     skipped: 0
#   log: evidence/test-output.log   # 必填，相对 CHG 目录路径
#   covers: [AC-1, AC-2]       # 必填（可为空数组），覆盖的 PRD 验收标准
#   recorded-at: ""
#
# ---- type: review-finding（Phase 2.2 sdd-review 启用） ----
# - id: EV-003
#   type: review-finding
#   target: prd.md#AC-3        # 必填，指向被检查对象
#   severity: major            # 必填，blocker / major / minor
#   finding: 设计与实现不一致   # 必填
#   resolution: ""             # 可选，处理结论
#   recorded-at: ""
#
# ---- type: evidence-ref（Phase 2.4 多仓聚合引用） ----
# Workspace evidence.yaml 不复制 repo 侧证据正文，仅登记引用：
# - id: EV-004
#   type: evidence-ref
#   repository: backend        # 可选，仓库 id
#   delivery-unit: DU-BE-001   # 可选，DU 绑定
#   path: implementation/backend/delivery/CHG-0001/.../DU-BE-001/evidence/test-output.log
#                              # 必填，repo 侧证据文件（workspace 相对路径）
#   summary: backend 单测 12 通过  # 可选，一句话摘要
#   recorded-at: ""

version: 0.1 # schema 版本
change-id: "" # CHG-XXXX，创建时填充
items: [] # Evidence 条目数组，按 recorded-at 升序
`;

/**
 * 初始化 CHG 的 evidence/evidence.yaml（幂等）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} changeId CHG-XXXX
 * @param {string} [harnessRoot] 可选，预留（如后续切换为外部模板资产）
 * @returns {Promise<string>} evidence.yaml 写入路径（已存在时同样返回路径）
 */
export async function initEvidence(changeDir, changeId, harnessRoot) {
  const file = join(changeDir, 'evidence', 'evidence.yaml');

  // 幂等：已存在则不覆盖（保留注释与既有 items）
  try {
    await access(file);
    return file;
  } catch {
    // ENOENT → 继续初始化
  }

  const doc = parseDocument(EVIDENCE_TEMPLATE);
  doc.setIn(['change-id'], changeId);
  await writeFile(file, doc.toString(), 'utf8');
  return file;
}

/**
 * 读取并解析 CHG 的 evidence/evidence.yaml。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @returns {Promise<object|null>} 解析结果；文件缺失返回 null
 */
export async function loadEvidence(changeDir) {
  const file = join(changeDir, 'evidence', 'evidence.yaml');
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  try {
    return parse(raw);
  } catch (e) {
    throw new Error(`evidence.yaml corrupted: ${file} (parse error: ${e.message})`);
  }
}

/**
 * 从 CHG 目录推导 Workspace 根（<root>/delivery/changes/CHG-XXXX → <root>）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @returns {string}
 */
export function deriveWorkspaceRoot(changeDir) {
  return dirname(dirname(dirname(changeDir)));
}

/**
 * 读取 .sdd/repositories.yaml 的仓库 id 白名单。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<string[]|null>} id 数组；配置文件缺失返回 null（调用方跳过白名单校验）
 */
export async function readRepositoryIds(workspaceRoot) {
  const file = join(workspaceRoot, '.sdd', 'repositories.yaml');
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const doc = parse(raw);
  const repos = Array.isArray(doc?.repositories) ? doc.repositories : [];
  return repos.map((r) => r.id).filter(Boolean);
}

const EVIDENCE_TYPES = ['code-change', 'test-run', 'review-finding', 'evidence-ref'];
const TEST_RESULTS = ['passed', 'failed', 'partial'];
const SEVERITIES = ['blocker', 'major', 'minor'];
const DU_ID_RE = /^DU-[A-Z0-9]{2,8}-\d{3}$/;

/**
 * Evidence 全量规则校验（纯函数）。
 *
 * @param {object} doc loadEvidence 的解析结果
 * @param {{repositories?: string[]|null}} [opts] repositories 为仓库 id 白名单（null 表示跳过）
 * @returns {{ok: boolean, issues: string[]}}
 */
export function validateEvidence(doc, opts = {}) {
  const issues = [];

  if (!doc || typeof doc !== 'object') {
    return { ok: false, issues: ['not a valid YAML mapping'] };
  }

  if (doc.version !== 0.1 && doc.version !== '0.1') {
    issues.push(`unsupported schema version: ${doc.version} (期望 0.1)`);
  }
  if (!/^CHG-\d{4,}$/.test(String(doc['change-id'] || ''))) {
    issues.push(`invalid change-id: ${doc['change-id']} (期望 CHG-XXXX)`);
  }
  if (!Array.isArray(doc.items)) {
    issues.push('items 必须是数组');
    return { ok: issues.length === 0, issues };
  }

  const whitelist = Array.isArray(opts.repositories) ? opts.repositories : null;
  const seenIds = new Set();

  doc.items.forEach((item, index) => {
    const label = `items[${index}]`;
    if (!item || typeof item !== 'object') {
      issues.push(`${label}: 不是有效映射`);
      return;
    }
    const id = String(item.id || '');
    if (!/^EV-\d{3,}$/.test(id)) {
      issues.push(`${label}: invalid id: ${item.id} (期望 EV-NNN)`);
    } else if (seenIds.has(id)) {
      issues.push(`${label}: duplicate id: ${id}`);
    }
    seenIds.add(id);

    if (!EVIDENCE_TYPES.includes(item.type)) {
      issues.push(`${label}: invalid type: ${item.type} (允许: ${EVIDENCE_TYPES.join(', ')})`);
      return;
    }

    for (const field of ['id', 'recorded-at']) {
      if (!item[field]) issues.push(`${label}: 缺少必填字段: ${field}`);
    }

    if (item.type === 'code-change') {
      for (const field of ['repo', 'commit', 'task', 'reason']) {
        if (!item[field]) issues.push(`${label}: code-change 缺少必填字段: ${field}`);
      }
      if (!Array.isArray(item.files)) {
        issues.push(`${label}: code-change 的 files 必须是数组`);
      }
      if (whitelist && item.repo && !whitelist.includes(item.repo)) {
        issues.push(`${label}: repo 不在 repositories.yaml 白名单: ${item.repo}`);
      }
      if (item.commit && !/^[0-9a-f]{7,40}$/.test(String(item.commit))) {
        issues.push(`${label}: commit 应为小写 sha: ${item.commit}`);
      }
      // Phase 2.4：delivery-unit 可选字段，提供时校验格式
      if (item['delivery-unit'] && !DU_ID_RE.test(String(item['delivery-unit']))) {
        issues.push(`${label}: delivery-unit 格式应为 DU-<别名>-NNN: ${item['delivery-unit']}`);
      }
    }

    if (item.type === 'test-run') {
      for (const field of ['command', 'log']) {
        if (!item[field]) issues.push(`${label}: test-run 缺少必填字段: ${field}`);
      }
      if (!TEST_RESULTS.includes(item.result)) {
        issues.push(`${label}: invalid result: ${item.result} (允许: ${TEST_RESULTS.join(', ')})`);
      }
      if (!item.summary || typeof item.summary !== 'object') {
        issues.push(`${label}: test-run 缺少 summary 对象`);
      } else {
        for (const field of ['total', 'passed', 'failed', 'skipped']) {
          if (typeof item.summary[field] !== 'number') {
            issues.push(`${label}: summary.${field} 必须是数字`);
          }
        }
      }
      if (!Array.isArray(item.covers)) {
        issues.push(`${label}: test-run 的 covers 必须是数组`);
      }
    }

    if (item.type === 'review-finding') {
      for (const field of ['target', 'finding']) {
        if (!item[field]) issues.push(`${label}: review-finding 缺少必填字段: ${field}`);
      }
      if (!SEVERITIES.includes(item.severity)) {
        issues.push(`${label}: invalid severity: ${item.severity} (允许: ${SEVERITIES.join(', ')})`);
      }
    }

    if (item.type === 'evidence-ref') {
      // Phase 2.4：Workspace 聚合引用——path 必填（workspace 相对路径）
      if (!item.path) {
        issues.push(`${label}: evidence-ref 缺少必填字段: path`);
      }
      if (item['delivery-unit'] && !DU_ID_RE.test(String(item['delivery-unit']))) {
        issues.push(`${label}: delivery-unit 格式应为 DU-<别名>-NNN: ${item['delivery-unit']}`);
      }
      if (whitelist && item.repository && !whitelist.includes(item.repository)) {
        issues.push(`${label}: repository 不在 repositories.yaml 白名单: ${item.repository}`);
      }
    }
  });

  return { ok: issues.length === 0, issues };
}

/**
 * Evidence 覆盖检查（gate.yaml evidence-coverage 开关驱动）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} doc loadEvidence 的解析结果（调用方已保证 schema 通过）
 * @param {{reposCoverage: boolean, testCoverage: boolean, findingsClosure?: boolean}} flags
 * @returns {Promise<{issues: string[]}>}
 */
export async function checkCoverage(changeDir, doc, flags) {
  const issues = [];
  const items = Array.isArray(doc?.items) ? doc.items : [];

  // repos-coverage：implementation.md 的 Commit ↔ code-change 条目对齐
  if (flags.reposCoverage) {
    let implRaw = null;
    try {
      implRaw = await readFile(join(changeDir, 'implementation.md'), 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const codeChanges = items.filter((i) => i.type === 'code-change');
    if (!implRaw) {
      if (codeChanges.length > 0) {
        issues.push('repos-coverage: implementation.md 缺失，无法与 code-change 条目对齐');
      }
      // implementation.md 与 code-change 均为空 → 尚无实现内容，视为对齐
    } else {
      const implCommits = new Set(
        (implRaw.match(/\b[0-9a-f]{7,40}\b/g) || []).map((s) => s.slice(0, 7)),
      );
      for (const item of codeChanges) {
        if (!implCommits.has(String(item.commit).slice(0, 7))) {
          issues.push(`repos-coverage: code-change ${item.id} 的 commit ${item.commit} 未在 implementation.md 中出现`);
        }
      }
      // implementation.md 引用但 evidence 未登记的 commit（仅统计短 sha 出现处）
      const evidenceCommits = new Set(codeChanges.map((i) => String(i.commit).slice(0, 7)));
      for (const sha of implCommits) {
        if (!evidenceCommits.has(sha)) {
          issues.push(`repos-coverage: implementation.md 的 commit ${sha} 缺少 code-change Evidence 条目`);
        }
      }
    }
  }

  // test-coverage：至少 1 条通过的 test-run
  if (flags.testCoverage) {
    const passed = items.some((i) => i.type === 'test-run' && i.result === 'passed');
    if (!passed) {
      issues.push('test-coverage: 至少需要 1 条 result=passed 的 test-run Evidence');
    }
  }

  // findings-closure（Phase 2.2）：blocker/major 的 review-finding 必须有非空 resolution
  // minor 允许保持开放（作为技术债记录）
  if (flags.findingsClosure) {
    for (const item of items) {
      if (item.type !== 'review-finding') continue;
      if (item.severity !== 'blocker' && item.severity !== 'major') continue;
      if (typeof item.resolution !== 'string' || !item.resolution.trim()) {
        issues.push(`findings-closure: review-finding ${item.id}（${item.severity}）未闭环，blocker/major 必须填写非空 resolution`);
      }
    }
  }

  return { issues };
}
