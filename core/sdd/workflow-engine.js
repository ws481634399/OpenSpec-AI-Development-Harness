// WorkflowEngine：编排协调（Coordinator，非 AI 执行器）
// 对齐 phase-1.5-workflow-engine-design.md §12
//
// Persisted State + Resume 模式：每次 workflow run 跑到下一个暂停点返回 WAITING
// v0.1 没有 Agent Runtime，Human Gate 必须人工 gate approve
// 因此 workflow run 大概率停在 WAITING_FOR_HUMAN（见 §12.6 v0.1 Trade-off）

import { join } from 'node:path';
import { stat, readFile, writeFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { readMetadata } from './change-model.js';
import { loadWorkflow } from './workflow-loader.js';
import { loadSkill } from './skill-loader.js';
import { assembleContext } from './context-assembler.js';
import { buildInstruction } from './instruction-builder.js';
import { resolvePrompts } from './prompt-loader.js';
import { loadGate, loadGateRaw } from './gate-config-loader.js';
import { runMachineGate } from './gate-validator.js';
import {
  writeMachineGate,
  writeHumanGate,
  readGateResult,
  readGateResultForStory,
  writeMachineGateForStory,
  writeHumanGateForStory,
  patchArtifactStatusForStory,
} from './gate-repository.js';
import { requestTransition, requestCheckpoint } from './transition-service.js';
import {
  resolveArtifactPath,
  resolveArtifactPathV3,
  resolveStoryDirV3,
  isMultiStory,
} from './artifact-path.js';
import { sha256, rulesHash } from './artifact-hash.js';
import { syncDuStatusFromRepos, syncDuCommits, readRepositories } from './delivery-unit.js';
import { resolveSubmoduleHead } from './git-submodule.js';
import {
  readStories,
  patchStoryMetadata,
  readStoryMetadata,
  aggregateChangeStatus,
  STORY_RANK,
} from './story-model.js';

// DU 相关阶段：machine gate 前自动执行 DU 状态回流 + commit 刷新（缺陷 7 事件驱动同步）
const DU_SYNC_SKILLS = new Set(['sdd-dev', 'sdd-test', 'sdd-review', 'sdd-converge']);

// Phase 4.2：Story 级执行的阶段（多 Story Change 下由 --story 显式驱动，Change 级 run 跳过）
const STORY_EXEC_SKILLS = new Set(['sdd-dev', 'sdd-test', 'sdd-review']);

/**
 * §5.2 Story 生命周期 7 阶段 → Story 级 stage 映射。
 * artifact 实名取 gate.yaml three-tier.story-artifact；story-spec（prd gate）人审 required（评审决策 2）。
 *
 * 导出供 review-queue（openspec approve 待审批项扫描）复用，保持单一事实源。
 */
export const STORY_STAGE_FLOW = [
  { from: 'pending', skill: 'sdd-prd', gate: 'prd', next: 'specified', humanRequired: true },
  { from: 'specified', skill: 'sdd-design', gate: 'design', next: 'designed', humanRequired: false },
  { from: 'designed', skill: 'sdd-task', gate: 'task', next: 'tasked', humanRequired: false },
  { from: 'tasked', skill: 'sdd-dev', gate: 'dev', next: 'developing', humanRequired: false },
  { from: 'developing', skill: 'sdd-test', gate: 'test', next: 'testing', humanRequired: false },
  { from: 'testing', skill: 'sdd-review', gate: 'review', next: 'completed', humanRequired: false },
];

/**
 * 缺陷 7 修复：DU 状态事件驱动同步（repo 侧 → workspace 侧）。
 * Agent 在仓库干活会更新 repo 侧 DU metadata（status/baseline/result），
 * 此前需手动 du sync-status 刷新，converge 机检常因状态滞后失败。
 * 现在 workflow run 处理 DU 相关阶段前自动同步；失败静默降级（不阻断 run，
 * 不一致由 du-* 机检暴露）。
 */
async function autoSyncDus(workspaceRoot, changeId) {
  try {
    await syncDuStatusFromRepos(workspaceRoot, changeId);
    const repos = await readRepositories(workspaceRoot);
    const heads = {};
    for (const repo of repos) {
      const head = await resolveSubmoduleHead(workspaceRoot, repo.path);
      if (head) heads[repo.id] = head;
    }
    await syncDuCommits(workspaceRoot, changeId, heads);
  } catch {
    // 静默降级：同步失败不阻断 run（无 DU/无 git/路径缺失等均属正常场景）
  }
}

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

// Workflow Result 状态枚举（§12.3）
export const WORKFLOW_RESULT = {
  WAITING_FOR_ARTIFACT: 'WAITING_FOR_ARTIFACT',
  WAITING_FOR_MACHINE_FIX: 'WAITING_FOR_MACHINE_FIX',
  WAITING_FOR_HUMAN: 'WAITING_FOR_HUMAN',
  ADVANCED: 'ADVANCED',
  COMPLETED: 'COMPLETED',
};

/**
 * 运行 Workflow，从当前状态跑到下一个暂停点。
 *
 * 流程（§12.2）：
 * 1. 读当前状态
 * 2. 定位当前状态对应的 stage（stage.from-state === current）
 * 3. 检查 Artifact 是否存在
 *    - 不存在 → 准备 Skill Invocation（生成 Instruction），返回 WAITING_FOR_ARTIFACT
 *    - 存在 → 跑 Machine Gate
 *       - failed → WAITING_FOR_MACHINE_FIX
 *       - passed → 检查 Human Gate
 *           - pending/stale → WAITING_FOR_HUMAN
 *           - approved + hash 匹配 → requestTransition → ADVANCED → 下一阶段循环
 * 4. 全部阶段完成 → COMPLETED
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} changeId CHG-XXXX
 * @param {object} [opts] { workflowName='default', harnessRoot, skillInput={}, du? }
 *   du：绑定的 Delivery Unit id（Phase 2.7，仅 dev/test 阶段生效；其他阶段忽略）
 * @returns {Promise<{result:string, stage?:object, reason:string, instruction?:string,
 *   stale?:Array<{artifact:string, kind:'hash-mismatch'|'missing', stage?:string}>}>}
 *   stale：Stale 传播检测结果（Phase 4.1 痛点 2a，仅提示不改状态）
 */
export async function runWorkflow(workspaceRoot, changeId, opts = {}) {
  // Phase 4.1 痛点 2a：入口先做 Stale 传播检测——上游产物在 Gate 后又被改动 → 提示下游可能过期
  // 检测失败不阻断 run（metadata 缺失/损坏时由内层抛权威错误）
  let stale = [];
  try {
    const changeDir0 = join(workspaceRoot, 'delivery', 'changes', changeId);
    const meta0 = await readMetadata(changeDir0);
    const status0 = meta0.status || 'created';
    if (status0 !== 'completed' && status0 !== 'archived') {
      stale = await detectStaleArtifacts(changeDir0, meta0, { harnessRoot: opts.harnessRoot });
    }
  } catch {
    stale = [];
  }
  const result = await runWorkflowCore(workspaceRoot, changeId, opts);
  return { ...result, stale };
}

/**
 * Workflow 编排核心（由 runWorkflow 包装，见上方 Stale 检测）。
 *
 * Phase 4.2 多 Story（3-tier）模式：
 * - opts.storyId 显式指定 → Story 级执行（Story 状态定位 stage，Change 状态按 §5.3 聚合推进）
 * - Change 级 run：
 *     · designed → 进入 story-splitting（Story 执行期），逐 Story 推进 spec/design/task 段
 *     · dev/test/review 阶段跳过（属 Story 级，由 --story 驱动）
 *     · converge 前聚合检查：所有 Story.completed 才允许收敛
 */
async function runWorkflowCore(workspaceRoot, changeId, opts = {}) {
  const workflowName = opts.workflowName || 'default';
  const harnessRoot = opts.harnessRoot;
  const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);

  let meta = await readMetadata(changeDir);
  let current = meta.status || 'created';

  if (current === 'completed' || current === 'archived') {
    return { result: WORKFLOW_RESULT.COMPLETED, reason: `Change already at ${current}` };
  }

  const workflow = await loadWorkflow(workflowName, harnessRoot);
  const multi = isMultiStory(meta);

  // Phase 4.2：显式 --story 仅对多 Story（3-tier）Change 有意义；
  // inline 单 Story / 未拆分 Change 走 Change 级流程，显式传参直接拒绝（防静默忽略）
  if (opts.storyId && !multi) {
    throw new Error(
      `Story ${opts.storyId} is inline or not present（单 Story 平铺 Change 走 Change 级流程，无需 --story）`
    );
  }

  // Phase 4.2：多 Story + 显式 --story → Story 级执行（Story 状态定位 stage）
  if (multi && opts.storyId) {
    return runStoryWorkflow(workspaceRoot, changeDir, changeId, meta, opts);
  }

  // Phase 4.2：多 Story 且当前处于 Story 执行期 → Story 逐级推进循环（spec/design/task 段）
  if (multi && current === 'story-splitting') {
    const r = await runStorySplittingLoop(workspaceRoot, changeDir, changeId, opts);
    if (r) return r;
    // 循环跑完（全部 Story ≥ tasked 且聚合推进成功）→ 重读状态继续 Change 级 stage 循环
    meta = await readMetadata(changeDir);
    current = meta.status || current;
  }

  // 找到当前状态对应的 stage
  // stage.from-state === current 表示此 stage 应该被处理
  let stageIndex = workflow.stages.findIndex((s) => s['from-state'] === current);

  // 若 current 不在任何 stage.from-state 中，可能此状态对应的 stage 已完成
  //（current 是某 stage.to-state）→ 找下一个 stage
  if (stageIndex === -1) {
    const completedStageIdx = workflow.stages.findIndex((s) => s['to-state'] === current);
    if (completedStageIdx >= 0 && completedStageIdx + 1 < workflow.stages.length) {
      stageIndex = completedStageIdx + 1;
    } else {
      return { result: WORKFLOW_RESULT.COMPLETED, reason: `No more stages for state: ${current}` };
    }
  }

  // 循环跑到暂停点或完成
  for (let i = stageIndex; i < workflow.stages.length; i++) {
    const stage = workflow.stages[i];

    // Phase 4.2 多 Story：sdd-task 阶段由 Story 执行期取代
    //（designed → story-splitting → 逐 Story 产出 spec/design/tasks → 聚合推进 tasked）
    if (multi && stage.skill === 'sdd-task') {
      if (meta.status === 'designed') {
        const tr = await requestTransition(changeDir, 'story-splitting', { harnessRoot });
        if (!tr.advanced) {
          return { result: WORKFLOW_RESULT.WAITING_FOR_HUMAN, stage, reason: tr.reason };
        }
      }
      const r = await runStorySplittingLoop(workspaceRoot, changeDir, changeId, opts);
      if (r) return r;
      meta = await readMetadata(changeDir);
      continue;
    }

    // Phase 4.2 多 Story：dev/test/review 属 Story 级，Change 级 run 跳过（由 --story 驱动）
    if (multi && STORY_EXEC_SKILLS.has(stage.skill)) {
      continue;
    }

    // Phase 4.2 多 Story：converge 前聚合检查（§5.3：所有 Story.completed 才允许收敛）
    if (multi && stage.skill === 'sdd-converge') {
      const stories = await readStories(changeDir, meta);
      const pending = stories.filter((s) => s.status !== 'completed').map((s) => s.id);
      if (pending.length > 0) {
        return {
          result: WORKFLOW_RESULT.WAITING_FOR_HUMAN,
          stage,
          reason: `聚合规则（§5.3）：等待 Story 完成: ${pending.join(', ')}。用 'openspec workflow run <wf> --change ${changeId} --story <STORY-ID>' 逐 Story 推进。`,
        };
      }
    }

    // 加载 Gate 配置（提前：三态 artifact 解析需要 three-tier 声明）
    const gateConfig = await loadGate(stage.skill, harnessRoot);
    const gateYamlRaw = await loadGateRaw(stage.skill, harnessRoot); // rules-hash 计算用

    // Phase 4.2 三态 artifact 解析：
    // - change3 模式（多 Story + three-tier.change-artifact）→ CHG 根 Change 级产物
    // - legacy → stage.artifact（inline 双语义 / explore 等不变产物）
    // - story 模式不走此处（runStoryWorkflow 处理）
    const tt = gateConfig['three-tier'] || {};
    const artifactName =
      multi && tt['change-artifact'] ? tt['change-artifact'] : stage.artifact;
    const artifactPath =
      multi && tt['change-artifact']
        ? join(changeDir, tt['change-artifact']) // Change 级三级产物固定在 CHG 根（plan §3.1）
        : resolveArtifactPath(changeDir, artifactName, meta);

    // 检查 Artifact 是否存在
    if (!(await pathExists(artifactPath))) {
      // Artifact 不存在 → 准备 Skill Invocation，返回 WAITING_FOR_ARTIFACT
      const instruction = await prepareSkillInvocation(
        workspaceRoot,
        changeDir,
        changeId,
        stage,
        meta,
        harnessRoot,
        opts
      );
      return {
        result: WORKFLOW_RESULT.WAITING_FOR_ARTIFACT,
        stage,
        reason: `Artifact not found: ${artifactName}. External Agent please follow Instruction to produce it.`,
        instruction,
      };
    }

    // Artifact 存在 → 跑 Machine Gate
    // 缺陷 7：DU 相关阶段机检前先自动同步 DU 状态（repo 侧回流），消除状态滞后导致的机检误失败
    if (DU_SYNC_SKILLS.has(stage.skill)) {
      await autoSyncDus(workspaceRoot, changeId);
    }
    const machineResult = await runMachineGate(changeDir, gateConfig, {
      metadata: meta,
      artifactPath, // Story 级 artifact 传解析后的实际路径
      gateYamlRaw, // 传入 gate.yaml 原始内容用于 rules-hash 计算
    });
    // 持久化 Machine Gate Result（warnings = advisory 未过项，留痕不阻断）
    await writeMachineGate(changeDir, artifactName, {
      status: machineResult.passed ? 'passed' : 'failed',
      issues: machineResult.issues,
      warnings: machineResult.warnings,
      artifactHash: machineResult.artifactHash,
      rulesHash: machineResult.rulesHash, // gate 规则指纹持久化
      validator: stage.skill,
    });

    if (!machineResult.passed) {
      return {
        result: WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX,
        stage,
        reason: `Machine gate failed: ${machineResult.issues.join('; ')}`,
      };
    }

    // Machine Gate passed → Human Gate 分级（Phase 4.1 轻量化）
    const gateResult = await readGateResult(changeDir, artifactName);
    const currentHash = machineResult.artifactHash;
    const humanGateMode = stage['human-gate'] || 'required';

    if (humanGateMode === 'skip') {
      // 免人审档：机检通过即视为该阶段人工确认完成。
      // 记 status: 'skipped' 留痕（明确非 approved），reviewer=workflow 可审计；hash 同步刷新。
      await writeHumanGate(changeDir, artifactName, {
        status: 'skipped',
        reviewer: 'workflow',
        reason: `human-gate: skip (${stage.gate})`,
        artifactHash: currentHash,
      });
    } else {
      const humanStatus = gateResult.gates.human.status;
      if (humanStatus !== 'approved' || gateResult.gates.human['artifact-hash'] !== currentHash) {
        return {
          result: WORKFLOW_RESULT.WAITING_FOR_HUMAN,
          stage,
          reason: `Human gate ${humanStatus} or stale. Run 'openspec approve ${changeId}'（一键审批并续跑），或手动 'openspec gate approve ${changeId} --stage ${stage.gate}'.`,
        };
      }
    }

    // Human Gate approved + hash 匹配 → 推进状态或检查点验收
    if (stage['from-state'] === stage['to-state']) {
      // Phase 2.2 同态检查点（如 sdd-review）：仅验收 artifact（置 accepted），
      // 不调 requestTransition（状态机禁止 from === to），不推进 Change 状态
      const checkpointResult = await requestCheckpoint(changeDir, stage, { harnessRoot });
      if (!checkpointResult.accepted) {
        return {
          result: WORKFLOW_RESULT.WAITING_FOR_HUMAN,
          stage,
          reason: checkpointResult.reason,
        };
      }
      continue; // 检查点通过 → 循环进入下一 stage（sdd-converge）
    }

    const transitionResult = await requestTransition(changeDir, stage['to-state'], { harnessRoot });
    if (!transitionResult.advanced) {
      return {
        result: WORKFLOW_RESULT.WAITING_FOR_HUMAN,
        stage,
        reason: transitionResult.reason,
      };
    }

    // ADVANCED → 进入下一阶段循环（若已是最后一个 stage，下一轮循环结束返回 COMPLETED）
  }

  return { result: WORKFLOW_RESULT.COMPLETED, reason: 'All stages completed' };
}

// ---- Phase 4.2：多 Story（3-tier）执行 ----

/**
 * Story 级单步执行：按 Story 当前状态定位 stage，处理一个阶段（artifact → 机检 → 人审 → Story 推进）。
 * 返回 { pause } 表示暂停点（caller 直接返回）；返回 { advanced } 表示该 Story 已推进一阶段。
 */
async function processStoryStage(workspaceRoot, changeDir, changeId, meta, story, opts) {
  const harnessRoot = opts.harnessRoot;
  const flow = STORY_STAGE_FLOW.find((f) => f.from === story.status);
  if (!flow) {
    return { advanced: false, done: true, from: story.status, to: story.status };
  }

  const stage = { skill: flow.skill, gate: flow.gate };
  const gateConfig = await loadGate(flow.skill, harnessRoot);
  const gateYamlRaw = await loadGateRaw(flow.skill, harnessRoot); // rules-hash 计算用
  const tt = gateConfig['three-tier'] || {};
  const artifactName = tt['story-artifact'] || gateConfig.artifact;
  const artifactPath = resolveArtifactPathV3(changeDir, artifactName, meta, story.id);

  // dev/test/review 阶段机检前 DU 状态回流（缺陷 7 同款，Story 限定）
  if (DU_SYNC_SKILLS.has(flow.skill)) {
    await autoSyncDus(workspaceRoot, changeId);
  }

  // 1. Artifact 存在性
  if (!(await pathExists(artifactPath))) {
    const instruction = await prepareSkillInvocation(
      workspaceRoot,
      changeDir,
      changeId,
      { ...stage, artifact: artifactName },
      meta,
      harnessRoot,
      // Phase 4.2：Story 级调用显式携带 storyId → Instruction 注入 Story 执行上下文
      //（Change 级 story-splitting 循环的 opts 无 storyId，须由 Story 对象补齐）
      { ...opts, storyId: story.id }
    );
    return {
      pause: {
        result: WORKFLOW_RESULT.WAITING_FOR_ARTIFACT,
        stage: { ...stage, artifact: artifactName },
        story: story.id,
        reason: `Story ${story.id} artifact not found: ${String(story.path || '').replace(/\/+$/, '')}/${artifactName}. External Agent please follow Instruction to produce it.`,
        instruction,
      },
    };
  }

  // 2. Machine Gate（story mode：检查项限定该 Story 的 artifact/DU/Evidence 集合）
  const machineResult = await runMachineGate(changeDir, gateConfig, {
    metadata: meta,
    storyId: story.id,
    artifactPath,
    gateYamlRaw,
  });
  await writeMachineGateForStory(changeDir, meta, story.id, artifactName, {
    status: machineResult.passed ? 'passed' : 'failed',
    issues: machineResult.issues,
    warnings: machineResult.warnings,
    artifactHash: machineResult.artifactHash,
    rulesHash: machineResult.rulesHash,
    validator: flow.skill,
  });
  if (!machineResult.passed) {
    return {
      pause: {
        result: WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX,
        stage: { ...stage, artifact: artifactName },
        story: story.id,
        reason: `Story ${story.id} machine gate failed: ${machineResult.issues.join('; ')}`,
      },
    };
  }

  // 3. Human Gate：story-spec（prd gate）required（评审决策 2），其余 skip 留痕
  const currentHash = machineResult.artifactHash;
  if (flow.humanRequired) {
    const gateResult = await readGateResultForStory(changeDir, meta, story.id, artifactName);
    const h = gateResult.gates.human;
    if (h.status !== 'approved' || h['artifact-hash'] !== currentHash) {
      return {
        pause: {
          result: WORKFLOW_RESULT.WAITING_FOR_HUMAN,
          stage: { ...stage, artifact: artifactName },
          story: story.id,
          reason: `Story ${story.id} story-spec human gate ${h.status} or stale. Run 'openspec approve ${changeId}'（一键审批并续跑），或手动 'openspec gate approve ${changeId} --stage prd --story ${story.id}'.`,
        },
      };
    }
  } else {
    await writeHumanGateForStory(changeDir, meta, story.id, artifactName, {
      status: 'skipped',
      reviewer: 'workflow',
      reason: `human-gate: skip (${flow.gate} @ story ${story.id})`,
      artifactHash: currentHash,
    });
  }

  // 4. Story 状态推进 + artifact accepted（Story 无 Transition Service，由 Workflow Engine 协调）
  const storyDir = resolveStoryDirV3(changeDir, meta, story.id);
  await patchStoryMetadata(storyDir, {
    status: flow.next,
    'updated-at': new Date().toISOString(),
  });
  await patchArtifactStatusForStory(changeDir, meta, story.id, artifactName, 'accepted');
  story.status = flow.next; // 本地同步（循环场景复用同一 story 对象）

  // 5. Change 聚合同步（§5.3；completed 由 converge 驱动，聚合不直接推 completed）
  await tryAggregatedTransition(changeDir, harnessRoot);

  return { advanced: true, from: flow.from, to: flow.next };
}

/**
 * 多 Story + 显式 --story 的 Story 级执行入口（runWorkflowCore 分发）。
 * Story 状态定位 stage：pending→spec / specified→design / designed→task / tasked→dev / developing→test / testing→review。
 */
async function runStoryWorkflow(workspaceRoot, changeDir, changeId, meta, opts) {
  const stories = await readStories(changeDir, meta);
  const story = stories.find((s) => s.id === opts.storyId);
  if (!story) {
    throw new Error(
      `Story not found in Change ${changeId}: ${opts.storyId}. Run 'openspec story list ${changeId}' to inspect.`
    );
  }
  if (story.inline) {
    throw new Error(
      `Story ${opts.storyId} is inline（单 Story 平铺 Change 走 Change 级流程，无需 --story）`
    );
  }
  if (story.status === 'completed') {
    return { result: WORKFLOW_RESULT.COMPLETED, story: story.id, reason: `Story ${story.id} already completed` };
  }

  const r = await processStoryStage(workspaceRoot, changeDir, changeId, meta, story, opts);
  if (r.pause) return r.pause;
  return {
    result: WORKFLOW_RESULT.ADVANCED,
    story: story.id,
    reason: `Story ${story.id}: ${r.from} → ${r.to}`,
  };
}

/**
 * Story 执行期循环（Change 状态 story-splitting）：
 * 逐 Story 推进 spec/design/task 段（pending→specified→designed→tasked），
 * dev+ 阶段需显式 --story 执行。全部 Story ≥ tasked 后聚合推进 story-splitting → tasked。
 * 返回暂停点结果；返回 null 表示本段无暂停点（caller 继续 Change 级流程）。
 */
async function runStorySplittingLoop(workspaceRoot, changeDir, changeId, opts) {
  for (;;) {
    const meta = await readMetadata(changeDir);
    const stories = await readStories(changeDir, meta);
    const rank = (s) => STORY_RANK[s] ?? -1;
    // 找第一个未完成 spec/design/task 段的 Story（顺序推进，保证确定性）
    const story = stories.find((s) => !s.inline && rank(s.status) < rank('tasked'));
    if (!story) {
      // 全部 Story ≥ tasked → 聚合推进 story-splitting → tasked
      await tryAggregatedTransition(changeDir, opts.harnessRoot);
      return null;
    }
    const r = await processStoryStage(workspaceRoot, changeDir, changeId, meta, story, opts);
    if (r.pause) return r.pause;
    // ADVANCED → 下一轮循环继续（同一 Story 下一段或下一个 Story）
  }
}

/**
 * §5.3 聚合同步：按 Story 状态聚合推导 Change 目标状态并尝试推进。
 * 聚合结果为 completed 时不直接推进（completed 由 sdd-converge 人审驱动），
 * 此时以 testing 为目标推进（converge 的 from-state 前置）。
 */
async function tryAggregatedTransition(changeDir, harnessRoot) {
  const meta = await readMetadata(changeDir);
  const current = meta.status || 'created';
  const stories = await readStories(changeDir, meta);
  let target = aggregateChangeStatus(stories.map((s) => s.status));
  if (target === 'completed') target = 'testing';
  if (!target || target === current) return false;
  const r = await requestTransition(changeDir, target, { harnessRoot });
  return Boolean(r.advanced);
}

/**
 * 准备 Skill Invocation：加载 Skill + 装配 Context + 生成 Instruction。
 * 写 .instruction.md 到 changeDir，返回 instruction 字符串。
 */
async function prepareSkillInvocation(workspaceRoot, changeDir, changeId, stage, meta, harnessRoot, opts) {
  const skill = await loadSkill(stage.skill, harnessRoot);
  const stageName = stage.gate; // gate 字段 == stage 名（explore/prd/...）
  // Phase 2.6：传 changeDir + metadata → 注入 Change Artifacts（前序产物正文 / STORY tasks.md / DU metadata）
  // Phase 2.7：opts.du 仅对 dev/test 生效（设计 §8——其他阶段忽略，保持幂等）；
  //   DU 存在性与 repository 合法性由 assembleContext 校验（不存在/非法时抛错）
  // Phase 4.2：opts.storyId → Story 级上下文（三级产物注入 + Story 目录定位）
  const du = stageName === 'dev' || stageName === 'test' ? opts.du : undefined;
  const storyId = opts.storyId || null;
  const context = await assembleContext(workspaceRoot, stageName, {
    changeDir,
    metadata: meta,
    ...(du ? { du } : {}),
    ...(storyId ? { storyId } : {}),
  });
  const userInput = {
    changeId,
    requirement: meta.requirement,
    title: meta.title,
    ...(storyId ? { storyId } : {}),
    ...opts.skillInput,
  };
  // Phase 2.7：绑定 DU 时把 DU 信息带入用户输入段展示
  if (context.duBinding) {
    userInput.duId = context.duBinding.duId;
    userInput.repository = context.duBinding.repository;
  }
  // Phase 2.3：解析 skill.yaml prompts 引用的片段（Workspace 优先），缺失条目以占位标注
  const resolved = await resolvePrompts(skill, { harnessRoot, workspaceRoot });
  const promptItems = [
    ...resolved.prompts,
    ...resolved.missing.map((ref) => ({ ref, missing: true })),
  ];
  const instruction = buildInstruction(skill, context, userInput, promptItems);
  await writeFile(join(changeDir, '.instruction.md'), instruction, 'utf8');
  return instruction;
}

/**
 * Stale 传播检测（Phase 4.1 痛点 2a + Phase 4.2 §5.3 分层扩展，纯确定性）：
 * 已登记且机检 passed 的产物，当前文件 hash 与 Gate 记录不一致 → 列入 stale。
 *
 * 分层规则（Phase 4.2）：
 * - Layer change：Change metadata.artifacts（现有逻辑）
 * - Layer story：3-tier 多 Story 时逐 Story story-metadata.yaml artifacts 段
 * - 传播（kind: 'stale-propagated'，只提示不失效）：
 *     · Change 级 change-spec.md 变更 → 所有未 completed Story 的 story-spec.md
 *     · Change 级 change-design.md 变更 → 所有未 completed Story 的 story-design.md
 *     · Story 级 story-design.md 变更 → 该 Story 的 tasks.md
 *
 * 用于上游产物变更后提示下游产物可能过期、建议重刷；
 * 只检测与提示，不改状态、不失效 Gate（状态回退属二期 rollback 命令）。
 * 注意：机检 failed 的产物不参与检测——用户按 WAITING_FOR_MACHINE_FIX 修复产物是合法编辑，非 stale。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} [meta] 可选注入 metadata
 * @param {object} [opts] { harnessRoot? } 可选注入 harnessRoot（rules-mismatch 检测用）
 * @returns {Promise<Array<{artifact:string, kind:'hash-mismatch'|'missing'|'stale-propagated'|'rules-mismatch',
 *   layer:'change'|'story', story?:string, from?:string, stage?:string}>>}
 */
export async function detectStaleArtifacts(changeDir, meta = null, opts = {}) {
  const m = meta || (await readMetadata(changeDir));
  const raw = await readFile(join(changeDir, 'metadata.yaml'), 'utf8');
  const parsed = parse(raw);
  const artifacts = (parsed && parsed.artifacts) || {};
  const stale = [];
  const changeStaleNames = new Set(); // 上游 stale 的 Change 级产物名（传播判定用）

  // Layer change：Change 级产物
  for (const a of Object.values(artifacts)) {
    if (!a || !a.path) continue;
    // 仅检测已通过机检的产物：failed 产物被用户修复属合法编辑，不是 stale
    if (a.gates?.machine?.status !== 'passed') continue;
    const recordedHash = a.gates?.machine?.['artifact-hash'];
    const artifactPath = resolveArtifactPath(changeDir, a.path, m);
    let content;
    try {
      content = await readFile(artifactPath, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') {
        stale.push({ artifact: a.path, kind: 'missing', layer: 'change' });
        continue;
      }
      throw e;
    }
    if (recordedHash && sha256(content) !== recordedHash) {
      stale.push({ artifact: a.path, kind: 'hash-mismatch', layer: 'change' });
      changeStaleNames.add(a.path.split('/').pop());
    }
    // rules-mismatch：gate.yaml 规则变了但 artifact 没变 → 旧 Gate 结果可能失效
    const recordedRulesHash = a.gates?.machine?.['rules-hash'];
    if (recordedRulesHash && opts.harnessRoot) {
      const skillId = a.gates?.machine?.validator;
      if (skillId) {
        try {
          const gateRaw = await loadGateRaw(skillId, opts.harnessRoot);
          const currentRulesHash = rulesHash(gateRaw);
          if (currentRulesHash !== recordedRulesHash) {
            stale.push({ artifact: a.path, kind: 'rules-mismatch', layer: 'change', stage: skillId });
            changeStaleNames.add(a.path.split('/').pop());
          }
        } catch {
          // gate.yaml 读取失败 → 跳过（skill 可能已重构，非阻断）
        }
      }
    }
  }

  // Layer story：3-tier 多 Story 的 Story 级产物 + §5.3 传播
  if (isMultiStory(m)) {
    const stories = await readStories(changeDir, m);
    for (const story of stories) {
      if (story.inline) continue; // inline 单 Story 复用 Change 级 artifacts，无独立检测
      const storyDir = join(changeDir, story.path || `stories/${story.id}`);
      const storyRel = String(story.path || `stories/${story.id}/`).replace(/\/+$/, '');
      let sm;
      try {
        sm = await readStoryMetadata(storyDir);
      } catch {
        continue; // story metadata 缺失/损坏 → 跳过该 Story（stale 检测不阻断 run）
      }
      const sArtifacts = (sm && sm.artifacts) || {};
      const storyStaleNames = new Set();
      for (const a of Object.values(sArtifacts)) {
        if (!a || !a.path) continue;
        if (a.gates?.machine?.status !== 'passed') continue;
        const recordedHash = a.gates?.machine?.['artifact-hash'];
        const abs = join(storyDir, a.path);
        let content;
        try {
          content = await readFile(abs, 'utf8');
        } catch (e) {
          if (e.code === 'ENOENT') {
            stale.push({
              artifact: `${storyRel}/${a.path}`,
              kind: 'missing',
              layer: 'story',
              story: story.id,
            });
            storyStaleNames.add(a.path.split('/').pop());
            continue;
          }
          throw e;
        }
        if (recordedHash && sha256(content) !== recordedHash) {
          stale.push({
            artifact: `${storyRel}/${a.path}`,
            kind: 'hash-mismatch',
            layer: 'story',
            story: story.id,
          });
          storyStaleNames.add(a.path.split('/').pop());
        }
        // rules-mismatch：gate.yaml 规则变了但 artifact 没变 → 旧 Gate 结果可能失效
        const recordedRulesHash = a.gates?.machine?.['rules-hash'];
        if (recordedRulesHash && opts.harnessRoot) {
          const skillId = a.gates?.machine?.validator;
          if (skillId) {
            try {
              const gateRaw = await loadGateRaw(skillId, opts.harnessRoot);
              const currentRulesHash = rulesHash(gateRaw);
              if (currentRulesHash !== recordedRulesHash) {
                stale.push({
                  artifact: `${storyRel}/${a.path}`,
                  kind: 'rules-mismatch',
                  layer: 'story',
                  story: story.id,
                  stage: skillId,
                });
                storyStaleNames.add(a.path.split('/').pop());
              }
            } catch {
              // gate.yaml 读取失败 → 跳过（skill 可能已重构，非阻断）
            }
          }
        }
      }

      // §5.3 传播：Change 级产物变更 → 未 completed Story 的下游产物
      if (story.status !== 'completed') {
        if (changeStaleNames.has('change-spec.md')) {
          stale.push({
            artifact: `${storyRel}/story-spec.md`,
            kind: 'stale-propagated',
            layer: 'story',
            story: story.id,
            from: 'change-spec.md',
          });
        }
        if (changeStaleNames.has('change-design.md')) {
          stale.push({
            artifact: `${storyRel}/story-design.md`,
            kind: 'stale-propagated',
            layer: 'story',
            story: story.id,
            from: 'change-design.md',
          });
        }
      }
      // §5.3 传播：Story 级 story-design 变更 → 该 Story 的 tasks.md
      if (storyStaleNames.has('story-design.md')) {
        stale.push({
          artifact: `${storyRel}/tasks.md`,
          kind: 'stale-propagated',
          layer: 'story',
          story: story.id,
          from: 'story-design.md',
        });
      }
    }
  }

  return stale;
}
