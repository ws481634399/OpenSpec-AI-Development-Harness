// ArtifactPath：Stage Artifact 路径解析（Phase 2.4 §17.2 / Phase 3.5 修订 v0.3）
//
// Phase 3.5 修订后规则：
// - 目录段 = 业务名（featureDirSeg 清洗；纯名字模式，用户决策）
// - feature-path 已绑定（非 candidate）→ **所有** artifact 落 STORY 目录：
//   CHG/<L1名>/<L2名>/<L3名>/<STORY名>/<artifact>
// - 未绑定/candidate → CHG 根（explore 早期产物暂存；bind 时由 skeleton 迁移）
// - evidence/ 与 references/ 同样在 STORY 目录下（change-model.js 统一取位）

import { join } from 'node:path';
import { featureDirSeg } from './feature-dirname.js';

/**
 * 从 metadata 提取 feature-path 目录段（业务名数组，按四级顺序）。
 * @param {object} meta readMetadata 结果
 * @returns {string[]|null} 如 ['平台基座','用户管理','账户能力','用户登录']；未绑定返回 null
 */
export function featurePathDirs(meta) {
  const fp = meta?.['feature-path'];
  if (!fp || typeof fp !== 'object') return null;
  const l1 = fp['level-1'];
  const l2 = fp['level-2'];
  const l3 = fp['level-3'];
  const story = fp.story;
  if (!l1?.id || !l2?.id || !l3?.id || !story?.id) return null;
  if (fp.candidate === true) return null; // Candidate 未晋升 → 不物化
  return [
    featureDirSeg(l1.id, l1.name),
    featureDirSeg(l2.id, l2.name),
    featureDirSeg(l3.id, l3.name),
    featureDirSeg(story.id, story.name),
  ];
}

/**
 * 解析 stage artifact 的实际路径。
 * - feature-path 已绑定 → CHG/<四级业务名>/<artifact>
 * - 未绑定/candidate → CHG/<artifact>
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} artifactName stage.artifact（如 'tasks.md'）
 * @param {object} meta readMetadata 结果
 * @returns {string}
 */
export function resolveArtifactPath(changeDir, artifactName, meta) {
  const dirs = featurePathDirs(meta);
  if (dirs) return join(changeDir, ...dirs, artifactName);
  return join(changeDir, artifactName);
}

/**
 * 解析 STORY 目录路径（全部产物与 DU 协调目录所在）。
 * @param {string} changeDir
 * @param {object} meta
 * @returns {string|null} 未绑定 feature-path 返回 null
 */
export function resolveStoryDir(changeDir, meta) {
  const dirs = featurePathDirs(meta);
  if (!dirs) return null;
  return join(changeDir, ...dirs);
}

// ---- Phase 4.2 三级规格分层：Story 感知路径解析 ----
//
// 目录规则（与 Phase 3.5 兼容）：
// - inline 单 Story（meta.stories 为空或唯一条目 inline=true）：
//     feature-path 已绑定 → CHG/<L1名>/<L2名>/<L3名>/<STORY名>/（现有第四级目录）
//     未绑定/candidate    → CHG 根（explore 早期产物暂存）
// - 3-tier 多 Story（stories 含 inline=false 条目）：
//     CHG/stories/<STORY-ID>/ （ID 目录，稳定可寻址；feature-path 权威在各 story-metadata.yaml）

/**
 * 判断 Change 是否处于 3-tier 多 Story 形态。
 * @param {object} meta readMetadata 结果
 * @returns {boolean}
 */
export function isMultiStory(meta) {
  const stories = Array.isArray(meta?.stories) ? meta.stories : [];
  return stories.some((s) => s && s.inline === false);
}

/**
 * 按指定 Story 解析其产物目录（Phase 4.2）。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} meta readMetadata 结果
 * @param {string} storyId Story ID
 * @returns {string|null} 未定位（inline 且未绑定 feature-path）返回 null
 */
export function resolveStoryDirV3(changeDir, meta, storyId) {
  const stories = Array.isArray(meta?.stories) ? meta.stories : [];
  const entry = stories.find((s) => s && s.id === storyId);
  // 显式 3-tier 条目 → stories/<ID>/
  if (entry && entry.inline === false) {
    return join(changeDir, 'stories', storyId);
  }
  // inline / stories 未写（lazy 单 Story）→ 现有第四级目录或 CHG 根
  const dirs = featurePathDirs(meta);
  if (dirs) return join(changeDir, ...dirs);
  return null;
}

/**
 * 按指定 Story 解析 artifact 实际路径（Phase 4.2）。
 * @param {string} changeDir
 * @param {string} artifactName
 * @param {object} meta
 * @param {string} storyId
 * @returns {string}
 */
export function resolveArtifactPathV3(changeDir, artifactName, meta, storyId) {
  const storyDir = resolveStoryDirV3(changeDir, meta, storyId);
  if (storyDir) return join(storyDir, artifactName);
  return join(changeDir, artifactName);
}
