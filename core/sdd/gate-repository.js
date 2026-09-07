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
 * 'spec.md' → 'prd'
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
 * @param {string} artifactName Artifact 文件名（如 spec.md / evidence/test-report.md）
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

// 缺陷 8 修复：模板预置 artifacts: {} 等空映射是 flow（流式）节点（yaml v2 中 node.flow === true），
// setIn 新增键后整棵子树输出为流式风格（{ a: { b: 1 } }），人工编辑极易破坏缩进/括号。
// setIn 之后把文档中所有 flow 集合节点递归置 flow=false，强制块式输出。
// 例外：空 sequence（issues: []）无块式形态，保持单行 [] 更整洁。
function flowToBlock(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.items)) return;
  const isEmptySeq = node.constructor?.name === 'YAMLSeq' && node.items.length === 0;
  if (!isEmptySeq) node.flow = false;
  for (const item of node.items) {
    if (item && typeof item === 'object') flowToBlock(item.value);
  }
}

/**
 * 写 Machine Gate Result 到 metadata.yaml。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} artifactName Artifact 文件名
 * @param {{status:string, issues?:string[], warnings?:string[], artifactHash:string, validator?:string}} input
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
  doc.setIn(['artifacts', key, 'gates', 'machine', 'warnings'], input.warnings || []);
  flowToBlock(doc.contents); // 缺陷 8：setIn 后统一转块式
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
  flowToBlock(doc.contents); // 缺陷 8：setIn 后统一转块式
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
  flowToBlock(doc.contents); // 缺陷 8：setIn 后统一转块式
  await writeFile(file, doc.toString(), 'utf8');
}

// ---- Phase 4.2 三级规格分层：Story 级 Gate 读写（路径分发）----
//
// 落点规则（与 artifact-path.resolveStoryDirV3 一致）：
// - 3-tier 多 Story（stories 条目 inline=false）→ stories/<STORY-ID>/story-metadata.yaml 的 artifacts 段
// - inline 单 Story → 复用 CHG metadata.yaml 的 artifacts 段（双语义合并，评审决策 2）
// inline 场景直接复用上方 Change 级函数；下方 ForStory 函数统一入口供 workflow/CLI 调用。

/**
 * 解析 Story Gate 写入目标文件。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} meta readMetadata 结果
 * @param {string} storyId
 * @returns {{file:string, inline:boolean}}
 */
export function resolveStoryGateTarget(changeDir, meta, storyId) {
  const stories = Array.isArray(meta?.stories) ? meta.stories : [];
  const entry = stories.find((s) => s && s.id === storyId);
  if (entry && entry.inline === false) {
    return {
      file: join(changeDir, 'stories', storyId, 'story-metadata.yaml'),
      inline: false,
    };
  }
  return { file: join(changeDir, META_FILE), inline: true };
}

/**
 * 读 Story 级 Artifact 的 Gate Result（不存在时返回 draft + 全 pending，不抛错）。
 * @param {string} changeDir
 * @param {object} meta readMetadata 结果
 * @param {string} storyId
 * @param {string} artifactName
 */
export async function readGateResultForStory(changeDir, meta, storyId, artifactName) {
  const target = resolveStoryGateTarget(changeDir, meta, storyId);
  if (target.inline) return readGateResult(changeDir, artifactName);
  const raw = await readFile(target.file, 'utf8');
  const m = parse(raw);
  const key = artifactKey(artifactName);
  const a = (m.artifacts && m.artifacts[key]) || {};
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
 * 写 Story 级 Machine Gate Result。
 * @param {string} changeDir
 * @param {object} meta
 * @param {string} storyId
 * @param {string} artifactName
 * @param {{status:string, issues?:string[], warnings?:string[], artifactHash:string, validator?:string}} input
 */
export async function writeMachineGateForStory(changeDir, meta, storyId, artifactName, input) {
  const target = resolveStoryGateTarget(changeDir, meta, storyId);
  if (target.inline) return writeMachineGate(changeDir, artifactName, input);
  const raw = await readFile(target.file, 'utf8');
  const doc = parseDocument(raw);
  const key = artifactKey(artifactName);
  const now = new Date().toISOString();
  doc.setIn(['artifacts', key, 'path'], artifactName);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'status'], input.status);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'checked-at'], now);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'validator'], input.validator || '');
  doc.setIn(['artifacts', key, 'gates', 'machine', 'artifact-hash'], input.artifactHash || '');
  doc.setIn(['artifacts', key, 'gates', 'machine', 'issues'], input.issues || []);
  doc.setIn(['artifacts', key, 'gates', 'machine', 'warnings'], input.warnings || []);
  flowToBlock(doc.contents);
  await writeFile(target.file, doc.toString(), 'utf8');
}

/**
 * 写 Story 级 Human Gate Result。
 * @param {string} changeDir
 * @param {object} meta
 * @param {string} storyId
 * @param {string} artifactName
 * @param {{status:string, reviewer?:string, reason?:string, artifactHash:string}} input
 */
export async function writeHumanGateForStory(changeDir, meta, storyId, artifactName, input) {
  const target = resolveStoryGateTarget(changeDir, meta, storyId);
  if (target.inline) return writeHumanGate(changeDir, artifactName, input);
  const raw = await readFile(target.file, 'utf8');
  const doc = parseDocument(raw);
  const key = artifactKey(artifactName);
  const now = new Date().toISOString();
  doc.setIn(['artifacts', key, 'path'], artifactName);
  doc.setIn(['artifacts', key, 'gates', 'human', 'status'], input.status);
  doc.setIn(['artifacts', key, 'gates', 'human', 'reviewed-at'], now);
  doc.setIn(['artifacts', key, 'gates', 'human', 'reviewer'], input.reviewer || '');
  doc.setIn(['artifacts', key, 'gates', 'human', 'artifact-hash'], input.artifactHash || '');
  doc.setIn(['artifacts', key, 'gates', 'human', 'reason'], input.reason || '');
  flowToBlock(doc.contents);
  await writeFile(target.file, doc.toString(), 'utf8');
}

/**
 * 更新 Story 级 Artifact 状态（'draft' / 'accepted'）。
 * @param {string} changeDir
 * @param {object} meta
 * @param {string} storyId
 * @param {string} artifactName
 * @param {string} status
 */
export async function patchArtifactStatusForStory(changeDir, meta, storyId, artifactName, status) {
  const target = resolveStoryGateTarget(changeDir, meta, storyId);
  if (target.inline) return patchArtifactStatus(changeDir, artifactName, status);
  const raw = await readFile(target.file, 'utf8');
  const doc = parseDocument(raw);
  const key = artifactKey(artifactName);
  doc.setIn(['artifacts', key, 'path'], artifactName);
  doc.setIn(['artifacts', key, 'status'], status);
  flowToBlock(doc.contents);
  await writeFile(target.file, doc.toString(), 'utf8');
}
