// VersionReader：版本读取与比较工具（Harness .version / Workspace version.yaml / 模板版本）
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseDocument } from 'yaml';

const VERSION_RE = /^\d+\.\d+\.\d+/;

/**
 * 读取 Harness 版本号（Major.Minor.Patch）。
 *
 * .version 文件首行是版本号，其后为说明文字（如"说明：当前 Harness 自身版本"）。
 * 因此只取首行首 token，避免把说明文字当作版本。
 *
 * @param {string} harnessRoot Harness 仓库根目录绝对路径
 * @returns {string} 版本字符串，如 "0.2.0"
 * @throws {Error} 若 .version 不存在或格式不符 Major.Minor.Patch
 */
export function readHarnessVersion(harnessRoot) {
  const versionPath = resolve(harnessRoot, '.version');
  const content = readFileSync(versionPath, 'utf8');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const token = firstLine.trim().split(/\s+/)[0];
  if (!VERSION_RE.test(token)) {
    throw new Error(
      `Invalid .version format: expected Major.Minor.Patch, got "${token}" at ${versionPath}`
    );
  }
  return token;
}

/**
 * 读取 Workspace .sdd/version.yaml 三层版本（Phase 3.1）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {{harness:string|null, workspaceTemplate:string|null, schema:string|null}|null}
 *   文件缺失返回 null；字段缺失对应值为 null
 */
export function readWorkspaceVersions(workspaceRoot) {
  const p = join(workspaceRoot, '.sdd', 'version.yaml');
  let raw;
  try {
    raw = readFileSync(p, 'utf8');
  } catch {
    return null;
  }
  const data = parseDocument(raw).toJS();
  return {
    harness: data?.harness?.version != null ? String(data.harness.version) : null,
    workspaceTemplate:
      data?.['workspace-template']?.version != null ? String(data['workspace-template'].version) : null,
    schema: data?.schema?.version != null ? String(data.schema.version) : null,
  };
}

/**
 * 读取 Harness 模板 version.yaml 的三层版本（升级目标基线，Phase 3.1）。
 * @param {string} harnessRoot Harness 根目录
 * @returns {{harness:string|null, workspaceTemplate:string|null, schema:string|null}}
 */
export function readTemplateVersions(harnessRoot) {
  const p = join(harnessRoot, 'templates', 'default-workspace', '.sdd', 'version.yaml');
  let data = null;
  try {
    data = parseDocument(readFileSync(p, 'utf8')).toJS();
  } catch {
    data = null;
  }
  return {
    harness: data?.harness?.version != null ? String(data.harness.version) : null,
    workspaceTemplate:
      data?.['workspace-template']?.version != null ? String(data['workspace-template'].version) : null,
    schema: data?.schema?.version != null ? String(data.schema.version) : null,
  };
}

/**
 * 语义化版本比较（Major.Minor.Patch）。
 * @param {string} a
 * @param {string} b
 * @returns {number} a<b → -1；a===b → 0；a>b → 1
 */
export function compareSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}
