// GateRepository：Gate Result 读写 metadata.yaml 的 artifacts 段（纯函数 + node:fs/promises + yaml Document API）
// 对齐 phase-1.5-workflow-engine-design.md §7.3
//
// 沿用 Phase 1.3 patchMetadata 的 parseDocument + setIn 模式，保留模板注释
// setIn 自动创建嵌套路径（artifacts.<key>.gates.{machine,human}.*）

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, parse } from 'yaml';

const META_FILE = 'metadata.yaml';

/**
 * 将 artifact 文件名转换为 metadata.artifacts 段的 key。
 * 'prd.md' → 'prd'
 * 'evidence/test-report.md' → 'test-report'
 * @param {string} artifactName
 * @returns {string}
 */
function artifactKey(artifactName) {
  const base = artifactName.split('/').pop();
  return base.replace(/\.md$/, '');
}

function emptyMachineGate() {
  return {
    status: 'pending',
    'checked-at': '',
    validator: '',
    'artifact-hash': '',
    issues: [],
  };
}

function emptyHumanGate() {
  return {
    status: 'pending',
    'reviewed-at': '',
    reviewer: '',
    'artifact-hash': '',
    reason: '',
  };
}

/**
 * 读 Artifact 的 Gate Result。
 * 不存在时返回 status:'draft' + 全 pending 的 gates（不抛错）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} artifactName Artifact 文件名（如 prd.md / evidence/test-report.md）
 * @returns {Promise<{status:string, path:string, gates:{machine:object, human:object}}>}
 */
export async function readGateResult(changeDir, artifactName) {
  const file = join(changeDir, META_FILE);
  const raw = await readFile(file, 'utf8');
  const meta = parse(raw);
  const key = artifactKey(artifactName);
  const a = (meta.artifacts && meta.artifacts[key]) || {};
  return {
    status: a.status || 'draft',
    path: a.path || artifactName,
    gates: {
      machine: { ...emptyMachineGate(), ...(a.gates?.machine || {}) },
      human: { ...emptyHumanGate(), ...(a.gates?.human || {}) },
    },
  };
}

/**
 * 写 Machine Gate Result 到 metadata.yaml。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} artifactName Artifact 文件名
 * @param {{status:string, issues?:string[], artifactHash:string, validator?:string}} input
 */
export async function writeMachineGate(changeDir, artifactName, input) {
  const file = join(changeDir, META_FILE);
  const raw = await readFile(file, 'utf8');
  const doc = parseDocument(raw);
  const key = artifactKey(artifactName);
  const now = new Date().toISOString();
  doc.setIn(['artifacts', key, 'path'], artifactName);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'status'], input.status);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'checked-at'], now);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'validator'], input.validator || '');
  doc.setIn(['artifacts', key, 'gates', 'machine', 'artifact-hash'], input.artifactHash || '');
  doc.setIn(['artifacts', key, 'gates', 'machine', 'issues'], input.issues || []);
  await writeFile(file, doc.toString(), 'utf8');
}

/**
 * 写 Human Gate Result 到 metadata.yaml。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} artifactName Artifact 文件名
 * @param {{status:string, reviewer?:string, reason?:string, artifactHash:string}} input
 */
export async function writeHumanGate(changeDir, artifactName, input) {
  const file = join(changeDir, META_FILE);
  const raw = await readFile(file, 'utf8');
  const doc = parseDocument(raw);
  const key = artifactKey(artifactName);
  const now = new Date().toISOString();
  doc.setIn(['artifacts', key, 'path'], artifactName);
  doc.setIn(['artifacts', key, 'gates', 'human', 'status'], input.status);
  doc.setIn(['artifacts', key, 'gates', 'human', 'reviewed-at'], now);
  doc.setIn(['artifacts', key, 'gates', 'human', 'reviewer'], input.reviewer || '');
  doc.setIn(['artifacts', key, 'gates', 'human', 'artifact-hash'], input.artifactHash || '');
  doc.setIn(['artifacts', key, 'gates', 'human', 'reason'], input.reason || '');
  await writeFile(file, doc.toString(), 'utf8');
}

/**
 * 更新 Artifact 状态。
 * @param {string} changeDir
 * @param {string} artifactName
 * @param {string} status 'draft' / 'accepted'
 */
export async function patchArtifactStatus(changeDir, artifactName, status) {
  const file = join(changeDir, META_FILE);
  const raw = await readFile(file, 'utf8');
  const doc = parseDocument(raw);
  const key = artifactKey(artifactName);
  doc.setIn(['artifacts', key, 'path'], artifactName);
  doc.setIn(['artifacts', key, 'status'], status);
  await writeFile(file, doc.toString(), 'utf8');
}
