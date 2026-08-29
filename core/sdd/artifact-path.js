// ArtifactPath：Stage Artifact 路径解析（Phase 2.4 §17.2）
//
// Phase 2.4 起 artifact 分两级：
// - Change 级（CHG 根）：requirement/exploration/prd/design/implementation.md/review-report.md/convergence.md/evidence/*
// - Story 级（CHG/<L1>/<L2>/<L3>/<STORY>/）：tasks.md（Decomposition Plan）与 DU 协调目录
//
// workflow-engine 与 transition-service 统一经 resolveArtifactPath 定位，
// state-map 中 artifact 名不变（tasks.md），由 metadata.feature-path 决定物化目录。

import { join } from 'node:path';

/** 需要物化到 STORY 目录的 artifact 名单 */
export const STORY_LEVEL_ARTIFACTS = ['tasks.md'];

/**
 * 从 metadata 提取 feature-path 目录段（ID 数组）。
 * @param {object} meta readMetadata 结果
 * @returns {string[]|null} 如 ['FEAT-001','FEAT-001-02','FEAT-001-02-03','STORY-001-02-03-01']；未绑定返回 null
 */
export function featurePathDirs(meta) {
  const fp = meta?.['feature-path'];
  if (!fp || typeof fp !== 'object') return null;
  const l1 = fp['level-1']?.id;
  const l2 = fp['level-2']?.id;
  const l3 = fp['level-3']?.id;
  const story = fp.story?.id;
  if (!l1 || !l2 || !l3 || !story) return null;
  if (fp.candidate === true) return null; // Candidate 未晋升 → 不物化
  return [l1, l2, l3, story];
}

/**
 * 解析 stage artifact 的实际路径。
 * - Story 级 artifact 且 feature-path 已绑定 → CHG/<L1>/<L2>/<L3>/<STORY>/<artifact>
 * - 其余 → CHG/<artifact>
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} artifactName stage.artifact（如 'tasks.md'）
 * @param {object} meta readMetadata 结果
 * @returns {string}
 */
export function resolveArtifactPath(changeDir, artifactName, meta) {
  if (STORY_LEVEL_ARTIFACTS.includes(artifactName)) {
    const dirs = featurePathDirs(meta);
    if (dirs) return join(changeDir, ...dirs, artifactName);
  }
  return join(changeDir, artifactName);
}

/**
 * 解析 STORY 目录路径（DU 协调视图与 tasks.md 所在）。
 * @param {string} changeDir
 * @param {object} meta
 * @returns {string|null} 未绑定 feature-path 返回 null
 */
export function resolveStoryDir(changeDir, meta) {
  const dirs = featurePathDirs(meta);
  if (!dirs) return null;
  return join(changeDir, ...dirs);
}
