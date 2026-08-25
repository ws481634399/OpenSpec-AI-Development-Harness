// WorkflowLoader：从 harnessRoot/workflows/<name>.yaml 加载编排定义（纯函数，依赖 node:fs/promises + yaml）
// 对齐 phase-1.5-workflow-engine-design.md §12.5
//
// workflow.yaml 的 stages 段显式声明 state→{skill, artifact, gate} 映射
// TransitionService 通过 stages[].to-state 反查定位 Skill 和 Artifact，不反查 skill.yaml

import { readFile, stat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { getHarnessRoot } from '../workspace/harness-root.js';

/**
 * 加载指定 Workflow 定义。
 *
 * @param {string} name Workflow id（如 default）
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<object>} workflow.yaml 解析对象（含 id / name / description / stages 数组）
 * @throws {Error} workflow 不存在或解析失败
 */
export async function loadWorkflow(name, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const workflowPath = join(root, 'workflows', `${name}.yaml`);

  let raw;
  try {
    const s = await stat(workflowPath);
    if (!s.isFile()) throw new Error('not a file');
    raw = await readFile(workflowPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT' || e.message === 'not a file') {
      throw new Error(`Workflow not found: ${name}. Run 'openspec workflow list'.`);
    }
    throw e;
  }

  let parsed;
  try {
    parsed = parse(raw);
  } catch (e) {
    throw new Error(`Workflow corrupted: ${workflowPath} (parse error: ${e.message})`);
  }

  if (!parsed || !Array.isArray(parsed.stages)) {
    throw new Error(`Workflow invalid: ${name} (missing stages).`);
  }

  return parsed;
}

/**
 * 列出所有可用 Workflow。
 * @param {string} [harnessRoot]
 * @returns {Promise<Array<{id:string,name:string,description:string}>>}
 */
export async function listWorkflows(harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const workflowsDir = join(root, 'workflows');
  let entries;
  try {
    entries = await readdir(workflowsDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const result = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.yaml')) continue;
    const name = e.name.replace(/\.yaml$/, '');
    try {
      const wf = await loadWorkflow(name, root);
      result.push({
        id: wf.id || name,
        name: wf.name || name,
        description: wf.description || '',
      });
    } catch (e) {
      // 跳过损坏的 workflow
    }
  }
  return result;
}

/**
 * 根据 to-state 反查 stage，定位 Skill 和 Artifact。
 * TransitionService 用此避免反查 skill.yaml（§8.2 第 3 步）。
 *
 * @param {object} workflow loadWorkflow 返回的对象
 * @param {string} targetState 目标状态（如 specified）
 * @returns {{skill:string, artifact:string, gate:string, fromState:string, toState:string}|null}
 */
export function findStageByToState(workflow, targetState) {
  const stage = workflow.stages.find((s) => s['to-state'] === targetState);
  if (!stage) return null;
  return {
    skill: stage.skill,
    artifact: stage.artifact,
    gate: stage.gate,
    fromState: stage['from-state'],
    toState: stage['to-state'],
  };
}
