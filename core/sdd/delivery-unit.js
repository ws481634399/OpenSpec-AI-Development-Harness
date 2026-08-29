// DeliveryUnit：DU 领域模型（Phase 2.4 plans/phase-2.4-multi-repository-delivery-design.md §10/§13/§14
//               + Phase 2.5 plans/phase-2.5-du-implementation-guidance-design.md Dev 前置实现指导）
//
// 定义（Phase 2.5 v2）：Delivery Unit 是 Repository-specific executable delivery specification。
// 关系：Story 1:N DU；DU 1:1 Repository；DU 创建时机 = sdd-task；Task Gate accepted 后 materialize。
//
// Workspace DU（CHG/<L1>/<L2>/<L3>/<STORY>/DU-xxx/metadata.yaml）= 全局协调记录（Reference/Status，不复制实施正文）
// Repository DU（<repo>/delivery/<CHG>/<L1>/<L2>/<L3>/<STORY>/DU-xxx/）= 实际交付（metadata/task.md/implementation.md/evidence/）
//
// DU 轻量状态（pending/developing/testing/completed）是记录字段，不是 Lifecycle State，
// 不经过 Transition Service；Workspace 9 态推进仍唯一走 TransitionService。

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { readMetadata, patchMetadata } from './change-model.js';
import { resolveStoryDir, featurePathDirs } from './artifact-path.js';
import { deriveWorkspaceRoot } from './evidence-model.js';

export const DU_ID_PATTERN = /^DU-[A-Z0-9]{2,8}-\d{3}$/;
export const DU_STATUSES = ['pending', 'developing', 'testing', 'completed'];

// Phase 2.5 §4.2：Pseudocode 条件必填的复杂度触发器（四枚举）
export const DU_COMPLEXITY_TRIGGERS = ['business-flow', 'algorithm', 'state-transition', 'orchestration'];

const WORKSPACE_DU_TEMPLATE = `# OpenSpec Delivery Unit（Workspace 协调记录）
#
# Workspace DU 只保存 Reference / Summary / Status，不复制 implementation.md /
# evidence 正文 / commit log（Reference, do not duplicate）。
# 实际交付见 repository-delivery.path 指向的 Repository Delivery。

id: {{du-id}}
repository: "" # 所属仓库 id（对应 .sdd/repositories.yaml，1:1 硬约束）
parent:
  change: "" # CHG-XXXX
feature-path: {} # 与 CHG metadata.feature-path 同构（level-1/2/3 + story）
scope: [] # 本 DU 交付范围
dependencies: [] # 依赖的 DU id
acceptance: [] # 验收标准条目
implementation-guidance: # Phase 2.5：Dev 前置实现指导声明（正文在 tasks.md DU 小节，不复制进 metadata）
  sketch: true # Implementation Sketch 必填（恒为 true，占位声明）
  pseudocode: false # 本 DU 是否要求 Pseudocode（complexity-trigger 命中时 true）
  complexity-trigger: [] # 命中的触发器：business-flow / algorithm / state-transition / orchestration
repository-delivery:
  path: "" # repo 侧交付目录（workspace 相对路径），materialize 后回填
status: pending # pending / developing / testing / completed（轻量记录，非 Lifecycle State）
evidence-ref: [] # repo 侧 evidence 引用（路径条目）
baseline:
  commit: "" # materialize 时记录的仓库 HEAD（可选，du sync-status 刷新）
result:
  commit: "" # completed 时的仓库 HEAD（可选）
`;

const REPO_DU_METADATA_TEMPLATE = `# OpenSpec Repository Delivery Unit Metadata
#
# 保存完整 Parent Chain：即使仓库被单独打开，也能追溯 DU → Story → Feature Path → Change。
# 不复制 Workspace PRD / Design（Reference do not duplicate），workspace-source 仅为相对引用。

id: {{du-id}}
repository: ""
parent:
  change: ""
feature-path: {}
workspace-source:
  requirement: ""
  prd: ""
  design: ""
  tasks: ""
scope: []
implementation-guidance: # Phase 2.5：从 Workspace DU 复制，仓库单独打开时仍可追溯 Pseudocode 要求
  sketch: true
  pseudocode: false
  complexity-trigger: []
status: pending # pending / developing / testing / completed
baseline:
  commit: ""
result:
  commit: ""
`;

const REPO_TASK_TEMPLATE = `# DU Task — {{du-id}}

> Repository Delivery 的 DU 级任务细化（Expected Implementation）。
> 权威来源：workspace-source.tasks 中本 DU 小节；本文件是 repo 侧可执行副本，
> Agent 依据权威来源填写，允许按仓内实际情况微调并保持一致。
>
> Implementation Guidance 提示：Implementation Sketch 必填；
> Pseudocode {{pseudocode-required}}；Verification 必填。
> 本文件固定为 Expected Implementation（Plan / Sketch / Pseudocode / Verification），
> 与 implementation.md（Actual Implementation）分立，不得合并。

## 1. Goal

## 2. Repository

## 3. Scope

<!-- Scope：Target Modules / Components / Packages / Services / APIs / Data Objects -->

## 4. Design References

<!-- 引用 workspace design.md 章节 + API / Event / Data Contract -->

## 5. Dependencies

<!-- 其他 DU / Repository Contract / External Service / Migration -->

## 6. Acceptance Criteria

## 7. Implementation Sketch

<!-- 推荐组件 / 调用关系 / 主要控制流程 / 领域边界 / 数据流 / 错误处理路径 -->

## 8. Pseudocode

<!-- 条件必填：complexity-trigger 命中时覆盖主流程 + 关键异常分支；未命中写 N/A + 理由 -->

## 9. Verification

<!-- Unit / Integration / API / Migration Verification / Error Case -->
`;

const REPO_IMPLEMENTATION_TEMPLATE = `# DU Implementation — {{du-id}}

> DU 级实施记录（Actual Implementation，sdd-dev 绑定本 DU 产出）。实施正文归属本仓库，Workspace 仅保留引用。
> 本文件固定为 Actual Implementation（实际修改模块/文件、Commit、Task/DU Mapping、实现偏离、完成情况），
> 与 task.md（Expected Implementation）分立，不得合并。

## 变更内容

## Commits

## Deviations

<!-- 实现与 DU 建议（Sketch / Pseudocode）明显偏离时必须记录；无偏离写「无」。
     每条偏离三要素缺一不可：原 DU 建议 / 实际实现 / 原因（建议附影响评估）。
     格式：### DEV-N
           - 原 DU 建议:
           - 实际实现:
           - 原因:
           - 影响评估: -->

## 自检
`;

/**
 * 读取 .sdd/repositories.yaml 完整条目（id + path）。
 * @param {string} workspaceRoot
 * @returns {Promise<Array<{id:string, path:string}>>}
 */
export async function readRepositories(workspaceRoot) {
  const file = join(workspaceRoot, '.sdd', 'repositories.yaml');
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const doc = parse(raw);
  const repos = Array.isArray(doc?.repositories) ? doc.repositories : [];
  return repos.map((r) => ({ id: r?.id || '', path: r?.path || '' })).filter((r) => r.id);
}

/**
 * 按 id 查找仓库条目。
 * @param {Array<{id:string,path:string}>} repos
 * @param {string} repoId
 * @returns {object|null}
 */
export function findRepository(repos, repoId) {
  return repos.find((r) => r.id === repoId) || null;
}

/**
 * Workspace DU 目录路径（CHG/<L1>/<L2>/<L3>/<STORY>/DU-xxx）。
 * @returns {string|null} feature-path 未绑定返回 null
 */
export function workspaceDuDir(changeDir, meta, duId) {
  const storyDir = resolveStoryDir(changeDir, meta);
  if (!storyDir) return null;
  return join(storyDir, duId);
}

/**
 * 生成 DU metadata YAML（模板 + 占位填充，保留注释）。
 * @param {'workspace'|'repository'} kind
 * @param {object} fields { duId, repository, changeId, featurePath }
 */
function renderDuMetadata(kind, fields) {
  const tpl = kind === 'workspace' ? WORKSPACE_DU_TEMPLATE : REPO_DU_METADATA_TEMPLATE;
  const doc = parseDocument(tpl);
  doc.setIn(['id'], fields.duId);
  doc.setIn(['repository'], fields.repository || '');
  if (fields.changeId) doc.setIn(['parent', 'change'], fields.changeId);
  if (fields.featurePath) doc.setIn(['feature-path'], fields.featurePath);
  return doc.toString();
}

/**
 * 创建 Workspace DU 协调记录（sdd-task 产出，Task Gate accepted 前为 draft 阶段产物）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} meta readMetadata 结果（须已绑定 feature-path）
 * @param {{id:string, repository:string, scope?:string[], dependencies?:string[], acceptance?:string[],
 *          pseudocode?:boolean, complexityTrigger?:string[]}} input
 *   Phase 2.5：pseudocode 显式声明；complexityTrigger 命中时 pseudocode 自动置 true
 *   （显式 pseudocode=false 优先，不一致告警由 CLI 层负责）
 * @returns {Promise<{dir:string, metadataPath:string}>}
 */
export async function writeWorkspaceDu(changeDir, meta, input) {
  if (!DU_ID_PATTERN.test(input.id)) {
    throw new Error(`invalid DU id: ${input.id} (期望 DU-<REPO别名>-NNN，如 DU-BE-001)`);
  }
  const storyDir = resolveStoryDir(changeDir, meta);
  if (!storyDir) throw new Error('feature-path 未绑定（task 阶段前必须完成 Requirement→Story 映射）');

  const duDir = join(storyDir, input.id);
  await mkdir(duDir, { recursive: true });
  const fp = meta['feature-path'];
  const content = renderDuMetadata('workspace', {
    duId: input.id,
    repository: input.repository,
    changeId: meta.id,
    featurePath: {
      'level-1': fp['level-1'],
      'level-2': fp['level-2'],
      'level-3': fp['level-3'],
      story: fp.story,
    },
  });
  const doc = parseDocument(content);
  // 分解产出字段（du-coverage 机检输入）
  if (input.scope) doc.setIn(['scope'], doc.createNode(input.scope));
  if (input.dependencies) doc.setIn(['dependencies'], doc.createNode(input.dependencies));
  if (input.acceptance) doc.setIn(['acceptance'], doc.createNode(input.acceptance));
  // Phase 2.5 §4：implementation-guidance 声明（正文在 tasks.md DU 小节，metadata 只存声明）
  const triggers = Array.isArray(input.complexityTrigger)
    ? [...new Set(input.complexityTrigger)].filter((t) => DU_COMPLEXITY_TRIGGERS.includes(t))
    : [];
  const pseudocode = input.pseudocode === false ? false : input.pseudocode === true || triggers.length > 0;
  doc.setIn(['implementation-guidance'], doc.createNode({ sketch: true, pseudocode, 'complexity-trigger': triggers }));
  const metadataPath = join(duDir, 'metadata.yaml');
  await writeFile(metadataPath, doc.toString(), 'utf8');
  return { dir: duDir, metadataPath };
}

/**
 * 扫描 Workspace 全部 DU（读 STORY 目录下 DU-xxx/metadata.yaml）。
 * @param {string} changeDir
 * @param {object} meta
 * @returns {Promise<Array<{dir:string, id:string, metadata:object}>>}
 */
export async function readWorkspaceDus(changeDir, meta) {
  const storyDir = resolveStoryDir(changeDir, meta);
  if (!storyDir) return [];
  let entries;
  try {
    entries = await readdir(storyDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const dus = [];
  for (const e of entries) {
    if (!e.isDirectory() || !DU_ID_PATTERN.test(e.name)) continue;
    const dir = join(storyDir, e.name);
    try {
      const raw = await readFile(join(dir, 'metadata.yaml'), 'utf8');
      dus.push({ dir, id: e.name, metadata: parse(raw) || {} });
    } catch {
      // metadata 缺失/损坏 → 记录为空 metadata（由 gate 检查项报 issue）
      dus.push({ dir, id: e.name, metadata: {} });
    }
  }
  return dus;
}

/**
 * Materialize DU 到对应 Repository（Task Gate accepted 后调用）。
 *
 * 创建 repo 侧交付目录（完整父路径 CHG→L1→L2→L3→STORY→DU）：
 * metadata.yaml + task.md + implementation.md + evidence/
 * 并回写 Workspace DU：repository-delivery.path / status=pending / baseline（可选）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} changeId CHG-XXXX
 * @param {string} duId DU-XXX-NNN
 * @param {object} [opts] { headCommit?: string, harnessRoot?: string }（headCommit 用于 baseline）
 * @returns {Promise<{repoDir:string, repoPath:string}>}
 */
export async function materializeDeliveryUnit(workspaceRoot, changeId, duId, opts = {}) {
  const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);
  const meta = await readMetadata(changeDir);
  const dus = await readWorkspaceDus(changeDir, meta);
  const du = dus.find((d) => d.id === duId);
  if (!du) throw new Error(`Workspace DU not found: ${duId}`);

  const repository = du.metadata.repository;
  if (!repository) throw new Error(`DU ${duId} metadata.repository 未设置`);

  const repos = await readRepositories(workspaceRoot);
  const repo = findRepository(repos, repository);
  if (!repo) {
    throw new Error(`repository '${repository}' 不在 .sdd/repositories.yaml（DU 1:1 Repository 硬约束）`);
  }

  const dirs = featurePathDirs(meta);
  if (!dirs) throw new Error('feature-path 未绑定，无法 materialize');

  const repoDeliveryRoot = join(workspaceRoot, repo.path, 'delivery', changeId, ...dirs);
  const repoDuDir = join(repoDeliveryRoot, duId);
  await mkdir(join(repoDuDir, 'evidence'), { recursive: true });

  const fp = meta['feature-path'];
  const wsRel = (p) => relative(workspaceRoot, p).replace(/\\/g, '/');
  const repoMetaContent = renderDuMetadata('repository', {
    duId,
    repository,
    changeId,
    featurePath: fp,
  });
  const doc = parseDocument(repoMetaContent);
  doc.setIn(['workspace-source'], {
    requirement: `delivery/changes/${changeId}/requirement.md`,
    prd: `delivery/changes/${changeId}/prd.md`,
    design: `delivery/changes/${changeId}/design.md`,
    tasks: `delivery/changes/${changeId}/${[...dirs, 'tasks.md'].join('/')}`,
  });
  // Phase 2.5 §4.3：implementation-guidance 从 Workspace DU 复制（仓库单独打开仍可追溯）
  const guidance = du.metadata['implementation-guidance'];
  if (guidance && typeof guidance === 'object') {
    doc.setIn(['implementation-guidance'], doc.createNode(guidance));
  }
  if (opts.headCommit) doc.setIn(['baseline', 'commit'], opts.headCommit);
  await writeFile(join(repoDuDir, 'metadata.yaml'), doc.toString(), 'utf8');

  // Phase 2.5 §6：task.md 头部注入 guidance 提示行（pseudocode 是否必填）
  const pseudoRequired = guidance?.pseudocode === true
    ? `必填（complexity-trigger: ${(guidance['complexity-trigger'] || []).join(', ') || 'declared'}）`
    : '条件必填（本 DU 未声明触发器，未命中时写 N/A + 理由）';
  const fill = (tpl) =>
    tpl.replaceAll('{{du-id}}', duId).replaceAll('{{pseudocode-required}}', pseudoRequired);
  await writeFile(join(repoDuDir, 'task.md'), fill(REPO_TASK_TEMPLATE), 'utf8');
  await writeFile(join(repoDuDir, 'implementation.md'), fill(REPO_IMPLEMENTATION_TEMPLATE), 'utf8');

  // 回写 Workspace DU 协调记录
  const wsDuDoc = parseDocument(await readFile(join(du.dir, 'metadata.yaml'), 'utf8'));
  wsDuDoc.setIn(['repository-delivery', 'path'], wsRel(repoDuDir));
  wsDuDoc.setIn(['status'], 'pending');
  if (opts.headCommit) wsDuDoc.setIn(['baseline', 'commit'], opts.headCommit);
  await writeFile(join(du.dir, 'metadata.yaml'), wsDuDoc.toString(), 'utf8');

  // CHG metadata 聚合 repository-baseline（§27：materialize 时记录）
  if (opts.headCommit) {
    const changeDoc = { 'repository-baseline': { [repository]: { commit: opts.headCommit } } };
    await patchMetadata(changeDir, changeDoc);
  }

  return { repoDir: repoDuDir, repoPath: repo.path };
}

/**
 * 聚合 DU 状态（Workflow Fan-in 判定输入，确定性）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} [workspaceRoot] 可选（默认从 changeDir 推导）
 * @returns {Promise<{dus:Array, total:number, allMaterialized:boolean, allTesting:boolean, allCompleted:boolean, repositories:string[]}>}
 */
export async function aggregateDuStatus(changeDir, workspaceRoot) {
  const root = workspaceRoot || deriveWorkspaceRoot(changeDir);
  const meta = await readMetadata(changeDir);
  const dus = await readWorkspaceDus(changeDir, meta);
  const repos = await readRepositories(root);

  const items = [];
  for (const du of dus) {
    let materialized = false;
    const deliveryPath = du.metadata['repository-delivery']?.path;
    if (deliveryPath) {
      try {
        await readFile(join(root, deliveryPath, 'metadata.yaml'), 'utf8');
        materialized = true;
      } catch {
        materialized = false;
      }
    }
    items.push({
      id: du.id,
      repository: du.metadata.repository || '',
      status: du.metadata.status || 'pending',
      materialized,
      repositoryValid: repos.some((r) => r.id === (du.metadata.repository || '')),
      hasScope: Array.isArray(du.metadata.scope) && du.metadata.scope.length > 0,
      hasAcceptance: Array.isArray(du.metadata.acceptance) && du.metadata.acceptance.length > 0,
      dependencies: Array.isArray(du.metadata.dependencies) ? du.metadata.dependencies : [],
    });
  }

  const rank = { pending: 0, developing: 1, testing: 2, completed: 3 };
  const minRank = items.length ? Math.min(...items.map((d) => rank[d.status] ?? 0)) : 0;
  return {
    dus: items,
    total: items.length,
    allMaterialized: items.length > 0 && items.every((d) => d.materialized),
    allTesting: items.length > 0 && minRank >= rank.testing,
    allCompleted: items.length > 0 && items.every((d) => d.status === 'completed'),
    repositories: [...new Set(items.map((d) => d.repository).filter(Boolean))],
  };
}

/**
 * 同步 DU baseline/result commit（`du sync-status` 核心，Phase 2.4 §22）。
 *
 * heads 由 CLI 层收集（resolveSubmoduleHead 纯文件解析 + git dirty 检测）。
 * - baseline：DU 尚无 baseline 且 head 已知 → 写入 baseline（并聚合 CHG repository-baseline）
 * - result：DU status=completed 且 head 已知 → 刷新 result（并聚合 CHG repository-result）
 *
 * DU status 本身是 Agent 工作进展记录，不由本函数推断修改。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} changeId CHG-XXXX
 * @param {Record<string,string>} heads { repoId: commitHash }（仅包含可解析 HEAD 的仓）
 * @returns {Promise<Array<{duId:string, repository:string, updated:'baseline'|'result'|'both'|'none'}>>}
 */
export async function syncDuCommits(workspaceRoot, changeId, heads) {
  const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);
  const meta = await readMetadata(changeDir);
  const dus = await readWorkspaceDus(changeDir, meta);
  const results = [];

  for (const du of dus) {
    const repoId = du.metadata.repository;
    const head = heads[repoId];
    if (!repoId || !head) {
      results.push({ duId: du.id, repository: repoId || '', updated: 'none' });
      continue;
    }
    const file = join(du.dir, 'metadata.yaml');
    const doc = parseDocument(await readFile(file, 'utf8'));
    let updated = 'none';
    const hasBaseline = Boolean(doc.getIn(['baseline', 'commit']));
    if (!hasBaseline) {
      doc.setIn(['baseline', 'commit'], head);
      updated = 'baseline';
    }
    if ((doc.getIn(['status']) || 'pending') === 'completed') {
      doc.setIn(['result', 'commit'], head);
      updated = updated === 'baseline' ? 'both' : 'result';
    }
    await writeFile(file, doc.toString(), 'utf8');

    // 聚合 CHG metadata
    const patch = {};
    if (updated === 'baseline' || updated === 'both') {
      patch['repository-baseline'] = { [repoId]: { commit: head } };
    }
    if (updated === 'result' || updated === 'both') {
      patch['repository-result'] = { [repoId]: { commit: head } };
    }
    if (Object.keys(patch).length) await patchMetadata(changeDir, patch);
    results.push({ duId: du.id, repository: repoId, updated });
  }
  return results;
}

/**
 * 更新 Workspace DU 轻量状态（记录字段，不经 Transition Service）。
 * @param {string} changeDir
 * @param {object} meta
 * @param {string} duId
 * @param {'pending'|'developing'|'testing'|'completed'} status
 * @param {{resultCommit?:string}} [opts] completed 时回填 result
 */
export async function updateWorkspaceDuStatus(changeDir, meta, duId, status, opts = {}) {
  if (!DU_STATUSES.includes(status)) {
    throw new Error(`invalid DU status: ${status} (允许: ${DU_STATUSES.join(', ')})`);
  }
  const duDir = workspaceDuDir(changeDir, meta, duId);
  if (!duDir) throw new Error('feature-path 未绑定');
  const file = join(duDir, 'metadata.yaml');
  const doc = parseDocument(await readFile(file, 'utf8'));
  doc.setIn(['status'], status);
  if (status === 'completed' && opts.resultCommit) doc.setIn(['result', 'commit'], opts.resultCommit);
  await writeFile(file, doc.toString(), 'utf8');

  // completed 时聚合 CHG metadata.repository-result（§27）
  if (status === 'completed' && opts.resultCommit) {
    const duMeta = parse(await readFile(file, 'utf8'));
    const repository = duMeta.repository;
    if (repository) {
      await patchMetadata(changeDir, { 'repository-result': { [repository]: { commit: opts.resultCommit } } });
    }
  }
}
