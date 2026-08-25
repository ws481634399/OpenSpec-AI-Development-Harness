// ArtifactHash：SHA-256 计算 + 比对（纯函数，依赖 node:crypto）
// 对齐 phase-1.5-workflow-engine-design.md §7.2
//
// Artifact 内容变化 → Hash 变化 → 旧 Gate 失效
// Machine Gate 和 Human Gate 的结果都绑定当前 Artifact 内容（artifact-hash）

import { createHash } from 'node:crypto';

/**
 * 计算 Artifact 内容的 SHA-256 哈希。
 * @param {string} content Artifact 文件内容（utf8）
 * @returns {string} 形如 "sha256:abc123..."
 */
export function sha256(content) {
  const h = createHash('sha256');
  h.update(content, 'utf8');
  return `sha256:${h.digest('hex')}`;
}

/**
 * 比对当前哈希与 Gate 记录的哈希是否一致。
 * @param {string} currentHash 当前 Artifact 的 sha256
 * @param {string} gateHash Gate 记录的 sha256（可能为空字符串）
 * @returns {boolean} 一致返回 true；gateHash 为空或不一致返回 false（需重新校验）
 */
export function hashMatches(currentHash, gateHash) {
  if (!gateHash) return false;
  return currentHash === gateHash;
}
