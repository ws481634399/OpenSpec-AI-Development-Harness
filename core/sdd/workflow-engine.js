// WorkflowEngine：编排协调（Coordinator，非 AI 执行器）
// 对齐 phase-1.5-workflow-engine-design.md §12
//
// Persisted State + Resume 模式：每次 workflow run 跑到下一个暂停点返回 WAITING
// v0.1 没有 Agent Runtime，Human Gate 必须人工 gate approve
// 因此 workflow run 大概率停在 WAITING_FOR_HUMAN（见 §12.6 v0.1 Trade-off）

import { join } from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
import { readMetadata } from './change-model.js';
import { loadWorkflow } from './workflow-loader.js';
import { loadSkill } from './skill-loader.js';
import { assembleContext } from './context-assembler.js';
import { buildInstruction } from './instruction-builder.js';
import { loadGate } from './gate-config-loader.js';
import { runMachineGate } from './gate-validator.js';
import { writeMachineGate, readGateResult } from './gate-repository.js';
import { requestTransition } from './transition-service.js';

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
 * @param {object} [opts] { workflowName='default', harnessRoot, skillInput={} }
 * @returns {Promise<{result:string, stage?:object, reason:string, instruction?:string}>}
 */
export async function runWorkflow(workspaceRoot, changeId, opts = {}) {
  const workflowName = opts.workflowName || 'default';
  const harnessRoot = opts.harnessRoot;
  const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);

  const meta = await readMetadata(changeDir);
  const current = meta.status || 'created';

  if (current === 'completed' || current === 'archived') {
    return { result: WORKFLOW_RESULT.COMPLETED, reason: `Change already at ${current}` };
  }

  const workflow = await loadWorkflow(workflowName, harnessRoot);

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
    const artifactName = stage.artifact;
    const artifactPath = join(changeDir, artifactName);

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
    const gateConfig = await loadGate(stage.skill, harnessRoot);
    const machineResult = await runMachineGate(changeDir, gateConfig, { metadata: meta });
    // 持久化 Machine Gate Result
    await writeMachineGate(changeDir, artifactName, {
      status: machineResult.passed ? 'passed' : 'failed',
      issues: machineResult.issues,
      artifactHash: machineResult.artifactHash,
      validator: stage.skill,
    });

    if (!machineResult.passed) {
      return {
        result: WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX,
        stage,
        reason: `Machine gate failed: ${machineResult.issues.join('; ')}`,
      };
    }

    // Machine Gate passed → 检查 Human Gate
    const gateResult = await readGateResult(changeDir, artifactName);
    const humanStatus = gateResult.gates.human.status;
    const currentHash = machineResult.artifactHash;

    if (humanStatus !== 'approved' || gateResult.gates.human['artifact-hash'] !== currentHash) {
      return {
        result: WORKFLOW_RESULT.WAITING_FOR_HUMAN,
        stage,
        reason: `Human gate ${humanStatus} or stale. Run 'openspec gate approve ${changeId} --stage ${stage.gate}'.`,
      };
    }

    // Human Gate approved + hash 匹配 → requestTransition
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

/**
 * 准备 Skill Invocation：加载 Skill + 装配 Context + 生成 Instruction。
 * 写 .instruction.md 到 changeDir，返回 instruction 字符串。
 */
async function prepareSkillInvocation(workspaceRoot, changeDir, changeId, stage, meta, harnessRoot, opts) {
  const skill = await loadSkill(stage.skill, harnessRoot);
  const stageName = stage.gate; // gate 字段 == stage 名（explore/prd/...）
  const context = await assembleContext(workspaceRoot, stageName);
  const userInput = {
    changeId,
    requirement: meta.requirement,
    title: meta.title,
    ...opts.skillInput,
  };
  const instruction = buildInstruction(skill, context, userInput);
  await writeFile(join(changeDir, '.instruction.md'), instruction, 'utf8');
  return instruction;
}
