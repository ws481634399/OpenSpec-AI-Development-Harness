// ReviewQueue：待人工审批项扫描（纯读取，不推进状态）
//
// Phase 4.3 配套体验改进：openspec approve 一键审批的事实源。
// 扫描逻辑与 workflow-engine 的 WAITING_FOR_HUMAN 判定同构：
//   机检 passed + 人审未 approved（或 approved 但 hash 过期 stale）→ 待审批项。
// 本模块只读 metadata/gate 结果，不做任何写入；状态推进仍由 Workflow Engine（Transition Service）执行。
//
// 覆盖两类待审批项：
//   1. Change 级：当前状态对应 stage（workflow.yaml from-state 定位，含 to-state 回退）
//      且 human-gate: required；多 Story 的 dev/test/review 属 Story 级执行，Change 级跳过。
//   2. Story 级（多 Story）：STORY_STAGE_FLOW 中 humanRequired 的阶段（当前仅 story-spec / prd gate）。

import { join } from 'node:path';
import { stat } from 'node:fs/promises';
import { readMetadata } from './change-model.js';
import { loadWorkflow } from './workflow-loader.js';
import { loadGate } from './gate-config-loader.js';
import { readGateResult, readGateResultForStory } from './gate-repository.js';
import { readStories } from './story-model.js';
import { resolveArtifactPath, resolveArtifactPathV3, isMultiStory } from './artifact-path.js';
import { STORY_STAGE_FLOW } from './workflow-engine.js';

// 多 Story 下属 Story 级执行的阶段（与 workflow-engine STORY_EXEC_SKILLS 同构）
const STORY_EXEC_SKILLS = new Set(['sdd-dev', 'sdd-test', 'sdd-review']);

const pathExists = (p) =>
  stat(p)
    .then(() => true)
    .catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

/**
 * 判断 Gate Result 是否处于「待人审」状态。
 * 机检 passed 且（人审非 approved 或 approved hash 与机检 hash 不一致）→ 返回待审批详情；否则 null。
 * @param {{gates:{machine:object,human:object}}} gateResult
 * @returns {null|{machineHash:string,humanStatus:string,stale:boolean,warnings:string[],issues:string[]}}
 */
export function pendingHumanDetail(gateResult) {
  const m = gateResult.gates.machine;
  const h = gateResult.gates.human;
  if (m.status !== 'passed') return null;
  const stale = h.status === 'approved' && h['artifact-hash'] !== m['artifact-hash'];
  if (h.status === 'approved' && !stale) return null;
  return {
    machineHash: m['artifact-hash'] || '',
    humanStatus: h.status || 'pending',
    stale,
    warnings: Array.isArray(m.warnings) ? m.warnings : [],
    issues: Array.isArray(m.issues) ? m.issues : [],
  };
}

/**
 * 列出 Change 的全部待人工审批项（不推进任何状态）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} changeId CHG-XXXX
 * @param {object} [opts]
 * @param {string} [opts.workflowName='default']
 * @param {string} [opts.harnessRoot] Harness 根（gate.yaml 加载用）
 * @returns {Promise<Array<{
 *   kind:'change'|'story', skill:string, gate:string, artifact:string,
 *   storyId?:string, storyTitle?:string,
 *   machineHash:string, humanStatus:string, stale:boolean,
 *   warnings:string[], issues:string[], humanChecks:string[]
 * }>>}
 */
export async function listPendingReviews(workspaceRoot, changeId, opts = {}) {
  const harnessRoot = opts.harnessRoot;
  const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);
  const meta = await readMetadata(changeDir);
  const status = meta.status || 'created';
  if (status === 'completed' || status === 'archived') return [];

  const workflow = await loadWorkflow(opts.workflowName || 'default', harnessRoot);
  const multi = isMultiStory(meta);
  const items = [];

  // ---- 1. Change 级：定位当前状态对应 stage（与 runWorkflowCore 同构）----
  let stageIndex = workflow.stages.findIndex((s) => s['from-state'] === status);
  if (stageIndex === -1) {
    // current 是某 stage.to-state → 取下一 stage（story-splitting 等结构态不在表中 → 跳过）
    const completedIdx = workflow.stages.findIndex((s) => s['to-state'] === status);
    if (completedIdx >= 0 && completedIdx + 1 < workflow.stages.length) {
      stageIndex = completedIdx + 1;
    }
  }
  if (stageIndex >= 0) {
    const stage = workflow.stages[stageIndex];
    const isStoryExecStage = multi && STORY_EXEC_SKILLS.has(stage.skill);
    if (stage['human-gate'] !== 'skip' && !isStoryExecStage) {
      const gateConfig = await loadGate(stage.skill, harnessRoot);
      const tt = gateConfig['three-tier'] || {};
      const useChangeArtifact = multi && tt['change-artifact'];
      const artifactName = useChangeArtifact ? tt['change-artifact'] : stage.artifact;
      const artifactPath = useChangeArtifact
        ? join(changeDir, tt['change-artifact'])
        : resolveArtifactPath(changeDir, artifactName, meta);
      if (await pathExists(artifactPath)) {
        const gr = await readGateResult(changeDir, artifactName);
        const detail = pendingHumanDetail(gr);
        if (detail) {
          items.push({
            kind: 'change',
            skill: stage.skill,
            gate: stage.gate,
            artifact: artifactName,
            humanChecks: gateConfig['human-checks'] || [],
            ...detail,
          });
        }
      }
    }
  }

  // ---- 2. Story 级（多 Story）：仅 humanRequired 阶段（当前仅 story-spec）----
  if (multi) {
    const stories = await readStories(changeDir, meta);
    for (const story of stories) {
      if (story.inline) continue;
      const flow = STORY_STAGE_FLOW.find((f) => f.from === story.status && f.humanRequired);
      if (!flow) continue;
      const gateConfig = await loadGate(flow.skill, harnessRoot);
      const tt = gateConfig['three-tier'] || {};
      const artifactName = tt['story-artifact'] || gateConfig.artifact;
      const artifactPath = resolveArtifactPathV3(changeDir, artifactName, meta, story.id);
      if (!(await pathExists(artifactPath))) continue;
      const gr = await readGateResultForStory(changeDir, meta, story.id, artifactName);
      const detail = pendingHumanDetail(gr);
      if (detail) {
        items.push({
          kind: 'story',
          skill: flow.skill,
          gate: flow.gate,
          artifact: artifactName,
          storyId: story.id,
          storyTitle: story.title || '',
          humanChecks: gateConfig['human-checks'] || [],
          ...detail,
        });
      }
    }
  }

  return items;
}
