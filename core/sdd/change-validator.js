// ChangeValidator：校验单个或全部 change 的 artifact 完整性 + 状态合法性（纯函数）
// 供 openspec validate 命令调用
//
// 校验维度：
// 1. metadata.yaml 可读且 status 合法（isValidStatus）
// 2. 按 workflow state-map：当前状态之前的所有 stage 的 artifact 应存在
// 3. artifacts 段 gate result 的 artifact-hash 与实际文件 hash 匹配（若 gate 已跑过）

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { readMetadata } from './change-model.js';
import { isValidStatus, CHANGE_STATUSES } from './change-state-machine.js';
import { loadWorkflow } from './workflow-loader.js';
import { sha256, hashMatches } from './artifact-hash.js';
import { readGateResult } from './gate-repository.js';
import { resolveArtifactPath } from './artifact-path.js';

/**
 * 计算文件 sha256（文件不存在返回空字符串）。
 * @param {string} filePath
 * @returns {Promise<string>}
 */
async function fileHash(filePath) {
  try {
    const content = await readFile(filePath, 'utf8');
    return sha256(content);
  } catch {
    return '';
  }
}

/**
 * 校验单个 Change。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<{id:string, status:string, ok:boolean, issues:string[]}>}
 */
export async function validateChange(changeDir, harnessRoot) {
  const issues = [];
  let id = '(unknown)';
  let status = '(unknown)';

  // 1. metadata 可读 + status 合法
  let meta;
  try {
    meta = await readMetadata(changeDir);
    id = meta.id || '(unknown)';
    status = meta.status || '(unknown)';
    if (!isValidStatus(status)) {
      issues.push(`invalid status: ${status}`);
    }
  } catch (e) {
    return { id: '(corrupted)', status: '(unknown)', ok: false, issues: [e.message] };
  }

  // 2. 按 workflow state-map 校验已完成 stage 的 artifact 存在
  let workflow;
  try {
    workflow = await loadWorkflow('default', harnessRoot);
  } catch (e) {
    issues.push(`cannot load workflow: ${e.message}`);
    return { id, status, ok: issues.length === 0, issues };
  }

  const currentIdx = CHANGE_STATUSES.indexOf(status);
  for (const stage of workflow.stages) {
    // 只检查 to-state <= current 的 stage（已完成的阶段）
    const toIdx = CHANGE_STATUSES.indexOf(stage['to-state']);
    if (toIdx > currentIdx) continue;

    const artifactPath = resolveArtifactPath(changeDir, stage.artifact, meta);
    let exists = false;
    try {
      await readFile(artifactPath);
      exists = true;
    } catch {
      exists = false;
    }
    if (!exists) {
      issues.push(`${stage.artifact} missing (expected for state ${stage['to-state']})`);
    }
  }

  // 3. gate result hash 匹配（若 artifacts 段有 gate 记录）
  if (meta.artifacts) {
    for (const stage of workflow.stages) {
      const toIdx = CHANGE_STATUSES.indexOf(stage['to-state']);
      if (toIdx > currentIdx) continue;

      const artifactName = stage.artifact;
      const gateResult = await readGateResult(changeDir, artifactName).catch(() => null);
      if (!gateResult) continue;

      // Machine Gate hash
      const machineHash = gateResult.gates.machine['artifact-hash'];
      if (machineHash && gateResult.gates.machine.status !== 'pending') {
        const currentHash = await fileHash(resolveArtifactPath(changeDir, artifactName, meta));
        if (currentHash && !hashMatches(currentHash, machineHash)) {
          issues.push(`${stage.artifact} hash mismatch (gate recorded ${machineHash.slice(0, 16)}...)`);
        }
      }
    }
  }

  return { id, status, ok: issues.length === 0, issues };
}

/**
 * 校验全部 Change。
 *
 * @param {string} workspaceRoot
 * @param {string} [harnessRoot]
 * @returns {Promise<{results:Array, ok:boolean, issueCount:number}>}
 */
export async function validateAll(workspaceRoot, harnessRoot) {
  const { listChanges } = await import('./change-repository.js');
  const { changes, skipped } = await listChanges(workspaceRoot);
  const results = [];
  let issueCount = 0;

  for (const c of changes) {
    const r = await validateChange(c.changeDir, harnessRoot);
    results.push(r);
    if (!r.ok) issueCount += r.issues.length;
  }

  return { results, ok: issueCount === 0, issueCount, skipped };
}
