// TransitionService：Change 生命周期状态推进的唯一合法入口
// 对齐 phase-1.5-workflow-engine-design.md §8
//
// 唯一调 patchStatus 的入口。其他任何路径不得绕过 TransitionService。
// patchStatus 保留为 internal persistence primitive（见 §8.1）

import { join } from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { readMetadata, patchStatus } from './change-model.js';
import { validateTransition, CHANGE_STATUSES } from './change-state-machine.js';
import { loadWorkflow, findStageByToState } from './workflow-loader.js';
import { loadGate } from './gate-config-loader.js';
import { readGateResult, patchArtifactStatus } from './gate-repository.js';
import { sha256 } from './artifact-hash.js';
import { resolveArtifactPath, isMultiStory } from './artifact-path.js';
import { readStories, aggregateChangeStatus, STORY_RANK } from './story-model.js';

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

// Phase 4.2 §5.3：聚合推进目标（completed 由 sdd-converge 人审驱动，不走聚合）
const AGGREGATED_TARGETS = new Set(['tasked', 'developing', 'testing']);

/**
 * 线性生命周期前向路径（CHANGE_STATUSES 严格前向有序）。
 * 聚合推进允许跨态（如 tasked → testing），逐态落盘保证每个中间状态真实存在。
 */
function forwardPath(from, to) {
  const i = CHANGE_STATUSES.indexOf(from);
  const j = CHANGE_STATUSES.indexOf(to);
  if (i < 0 || j < 0 || j <= i) return [];
  return CHANGE_STATUSES.slice(i + 1, j + 1);
}

/**
 * 请求状态推进。唯一合法的 Change 状态推进入口。
 *
 * 流程（§8.2）：
 * 1. 读 metadata
 * 2. 状态机校验（caller bug 抛错；Gate 未通过在后续步骤返回 advanced:false）
 * 3. 通过 workflow state-map 定位 targetState 对应的 Skill / Artifact
 *    不反查 skill.yaml（避免循环依赖，state→{skill, artifact} 由 workflows/default.yaml 显式声明）
 * 4. 确认 Artifact 存在
 * 5. 计算当前 Hash
 * 6. 确认 Machine Gate = passed 且 hash 匹配
 * 7. 确认 Human Gate = approved 且 hash 匹配（v0.1 不识别 bypassed，见 §10.4）
 * 8. Artifact status = accepted
 * 9. 推进状态（唯一 patchStatus 调用点）
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} targetState 目标状态
 * @param {object} [opts] { harnessRoot }
 * @returns {Promise<{advanced:boolean, reason:string}>}
 *   advanced=true 表示已推进；advanced=false 表示未推进（reason 含 WAITING_FOR_* 前缀）
 * @throws {Error} 状态机校验失败（caller bug，非业务流）
 */
export async function requestTransition(changeDir, targetState, opts = {}) {
  // 1. 读 metadata
  const meta = await readMetadata(changeDir);
  const current = meta.status || 'created';

  // Phase 4.2 §5.3 聚合推进：多 Story 模式下 tasked/developing/testing 按 Story 状态聚合判定
  // （允许跨态推进如 tasked → testing，逐态落盘；Story 级 Gate 校验由 Workflow Engine processStoryStage 完成）
  if (isMultiStory(meta) && AGGREGATED_TARGETS.has(targetState)) {
    return requestAggregatedTransition(changeDir, meta, current, targetState);
  }

  // Phase 4.2：story-splitting 是结构性状态（进入 Story 执行期，无自身 artifact/Gate），
  // workflow state-map 无对应 stage，直接校验状态机后落盘
  if (targetState === 'story-splitting') {
    validateTransition(current, targetState);
    await patchStatus(changeDir, targetState);
    return { advanced: true, reason: `${current} → story-splitting（进入 Story 执行期）` };
  }

  // 2. 状态机校验（caller bug 抛错；Gate 未通过在后续步骤返回 advanced:false）
  validateTransition(current, targetState);

  // 3. 通过 Workflow state-map 定位 targetState 对应的 Skill / Artifact
  const workflow = await loadWorkflow('default', opts.harnessRoot);
  const stage = findStageByToState(workflow, targetState);
  if (!stage) {
    return { advanced: false, reason: `No stage produces state: ${targetState}` };
  }
  const skillId = stage.skill;
  const artifactName = stage.artifact;
  await loadGate(skillId, opts.harnessRoot); // 校验 gate.yaml 存在

  // 4. 确认 Artifact 存在（Phase 2.4：Story 级 artifact 按 feature-path 解析）
  const artifactPath = resolveArtifactPath(changeDir, artifactName, meta);
  if (!(await pathExists(artifactPath))) {
    return {
      advanced: false,
      reason: `WAITING_FOR_ARTIFACT: ${artifactName} not found`,
    };
  }

  // 5. 计算当前 Hash
  const content = await readFile(artifactPath, 'utf8');
  const currentHash = sha256(content);

  // 6. 确认 Machine Gate = passed 且 hash 匹配
  const gateResult = await readGateResult(changeDir, artifactName);
  if (
    gateResult.gates.machine.status !== 'passed' ||
    gateResult.gates.machine['artifact-hash'] !== currentHash
  ) {
    return {
      advanced: false,
      reason: `WAITING_FOR_MACHINE: gate stale or not passed`,
    };
  }

  // 7. 确认 Human Gate = approved 且 hash 匹配
  //    Phase 4.1 轻量化：status 'skipped'（workflow human-gate: skip 档写入，reviewer=workflow 留痕）
  //    视为该阶段人工确认完成，放行且不校验 human hash（无人审语义）；
  //    bypassed 仍视为未通过（见 §10.4）
  const humanStatus = gateResult.gates.human.status;
  if (humanStatus !== 'approved' && humanStatus !== 'skipped') {
    return {
      advanced: false,
      reason: `WAITING_FOR_HUMAN: gate ${humanStatus} (requires approved or skipped)`,
    };
  }
  if (
    humanStatus === 'approved' &&
    gateResult.gates.human['artifact-hash'] !== currentHash
  ) {
    return {
      advanced: false,
      reason: `WAITING_FOR_HUMAN: gate stale (hash mismatch)`,
    };
  }

  // 8. Artifact status = accepted
  await patchArtifactStatus(changeDir, artifactName, 'accepted');

  // 9. 推进状态（唯一 patchStatus 调用点）
  await patchStatus(changeDir, targetState);

  return { advanced: true, reason: `${current} → ${targetState}` };
}

/**
 * 同态检查点验收（Phase 2.2，plans/phase-2.2-sdd-review-skill-design.md §3.2）：
 * from-state === to-state 的 stage（如 sdd-review）双门禁通过后，
 * 仅将 Artifact 标记为 accepted，不推进 Change 状态。
 *
 * 验收步骤与 requestTransition 第 4-8 步完全一致（hash 匹配防 stale）：
 * 不做 validateTransition（同态无需转换）、不调 patchStatus。
 *
 * stage 由调用方（WorkflowEngine）显式传入——同态 to-state 在 state-map 中
 * 可能对应多个 stage（如 testing），反查会产生歧义。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {{skill:string, artifact:string, gate:string}} stage 当前 stage 定义
 * @param {object} [opts] { harnessRoot }
 * @returns {Promise<{accepted:boolean, reason:string}>}
 */
export async function requestCheckpoint(changeDir, stage, opts = {}) {
  const artifactName = stage.artifact;

  // 确认 Artifact 存在（Phase 2.4：统一走 artifact 路径解析，Story 级 artifact 物化到 STORY 目录）
  const meta = await readMetadata(changeDir);
  const artifactPath = resolveArtifactPath(changeDir, artifactName, meta);
  if (!(await pathExists(artifactPath))) {
    return { accepted: false, reason: `WAITING_FOR_ARTIFACT: ${artifactName} not found` };
  }

  // 计算当前 Hash
  const content = await readFile(artifactPath, 'utf8');
  const currentHash = sha256(content);

  // 确认 Machine Gate = passed 且 hash 匹配
  const gateResult = await readGateResult(changeDir, artifactName);
  if (
    gateResult.gates.machine.status !== 'passed' ||
    gateResult.gates.machine['artifact-hash'] !== currentHash
  ) {
    return { accepted: false, reason: `WAITING_FOR_MACHINE: gate stale or not passed` };
  }

  // 确认 Human Gate = approved 且 hash 匹配（skipped 放行，bypassed 视为未通过）
  const humanStatus = gateResult.gates.human.status;
  if (humanStatus !== 'approved' && humanStatus !== 'skipped') {
    return { accepted: false, reason: `WAITING_FOR_HUMAN: gate ${humanStatus} (requires approved or skipped)` };
  }
  if (
    humanStatus === 'approved' &&
    gateResult.gates.human['artifact-hash'] !== currentHash
  ) {
    return { accepted: false, reason: `WAITING_FOR_HUMAN: gate stale (hash mismatch)` };
  }

  // Artifact status = accepted（不改 Change 状态）
  await patchArtifactStatus(changeDir, artifactName, 'accepted');

  return { accepted: true, reason: `checkpoint ${artifactName} accepted (state unchanged)` };
}

/**
 * Phase 4.2 §5.3 聚合推进（多 Story 模式专用，由 requestTransition 拦截分发）：
 * Change.tasked/developing/testing 由 Story 状态聚合推导，允许跨态（逐态落盘）。
 * Story 级 Gate 已在 Workflow Engine processStoryStage 推进 Story 状态前校验，
 * 此处仅校验「聚合结果达到目标」+ 前向性，不再重复 Artifact/Hash 检查。
 *
 * @returns {Promise<{advanced:boolean, reason:string}>}
 */
async function requestAggregatedTransition(changeDir, meta, current, targetState) {
  const stories = await readStories(changeDir, meta);
  const agg = aggregateChangeStatus(stories.map((s) => s.status));
  const rank = (s) => STORY_RANK[s] ?? -1;
  // 聚合结果须达到目标（allow agg 超前，如全 Story completed → 允许推到 testing 作为 converge 前置）
  if (!agg || rank(agg) < rank(targetState)) {
    return {
      advanced: false,
      reason: `WAITING_FOR_AGGREGATION: stories aggregate=${agg || 'none'}, target=${targetState}（§5.3）`,
    };
  }
  const path = forwardPath(current, targetState);
  if (path.length === 0) {
    return { advanced: false, reason: `Change already at/beyond ${targetState}` };
  }
  for (const s of path) {
    await patchStatus(changeDir, s);
  }
  return {
    advanced: true,
    reason: `${current} → ${targetState}（§5.3 聚合推进，覆盖 ${stories.length} Story）`,
  };
}
