// TransitionService：Change 生命周期状态推进的唯一合法入口
// 对齐 phase-1.5-workflow-engine-design.md §8
//
// 唯一调 patchStatus 的入口。其他任何路径不得绕过 TransitionService。
// patchStatus 保留为 internal persistence primitive（见 §8.1）

import { join } from 'node:path';
import { stat, readFile } from 'node:fs/promises';
import { readMetadata, patchStatus } from './change-model.js';
import { validateTransition } from './change-state-machine.js';
import { loadWorkflow, findStageByToState } from './workflow-loader.js';
import { loadGate } from './gate-config-loader.js';
import { readGateResult, patchArtifactStatus } from './gate-repository.js';
import { sha256 } from './artifact-hash.js';

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

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

  // 4. 确认 Artifact 存在
  const artifactPath = join(changeDir, artifactName);
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
  //    v0.1 不识别 bypassed 推进（见 §10.4），bypassed 视为未通过
  const humanStatus = gateResult.gates.human.status;
  if (humanStatus !== 'approved') {
    return {
      advanced: false,
      reason: `WAITING_FOR_HUMAN: gate ${humanStatus} (v0.1 requires approved)`,
    };
  }
  if (gateResult.gates.human['artifact-hash'] !== currentHash) {
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
