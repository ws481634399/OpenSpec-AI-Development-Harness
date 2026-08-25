// CandidateRepository：writeCandidate 写 product/features/FEAT-CANDIDATE-NNNN.md
// FeatureModel 保持只读（readFeatureTree / findFeature / featurePath），
// Candidate 生命周期由本模块负责（writeCandidate / nextCandidateId）
// 纯函数，依赖 node:fs/promises 只读扫描 + ArtifactWriter

import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getHarnessRoot } from '../workspace/harness-root.js';
import { writeArtifact } from './artifact-writer.js';

const CANDIDATE_PATTERN = /^FEAT-CANDIDATE-(\d{4})$/;

/**
 * 扫描 product/features/ 下已有 Candidate 编号，返回数字数组。
 *
 * @param {string} featuresDir product/features/ 绝对路径
 * @returns {Promise<number[]>} 编号数字数组
 */
async function scanCandidateIds(featuresDir) {
  let entries;
  try {
    entries = await readdir(featuresDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const ids = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const baseName = e.name.replace(/\.md$/, '');
    const m = CANDIDATE_PATTERN.exec(baseName);
    if (m) ids.push(parseInt(m[1], 10));
  }
  return ids;
}

/**
 * 生成下一个 FEAT-CANDIDATE-NNNN 编号。
 *
 * 扫描 product/features/ 下所有 FEAT-CANDIDATE-XXXX.md 文件，
 * 取最大数字 +1，padStart(4, '0')。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<string>} 如 "FEAT-CANDIDATE-0001"
 */
export async function nextCandidateId(workspaceRoot) {
  const featuresDir = join(workspaceRoot, 'product', 'features');
  const ids = await scanCandidateIds(featuresDir);
  const max = ids.length === 0 ? 0 : Math.max(...ids);
  return `FEAT-CANDIDATE-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 创建 Feature Candidate（需求未匹配 Feature Tree 时）。
 *
 * - 扫描 product/features/ 取最大编号 +1
 * - 读 templates/artifacts/feature-candidate.md 模板（Harness 资产）
 * - 填 front-matter（id/name/status:pending/created-at/source-change）
 * - 替换正文 {{candidate-name}} / {{source-change}} 占位符
 * - 写入 product/features/FEAT-CANDIDATE-NNNN.md
 *
 * pending 标记：待人工 review 后并入 product/feature-tree.yaml。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {{name:string,sourceChange?:string}} input
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<{candidateId:string,candidatePath:string}>}
 */
export async function writeCandidate(workspaceRoot, input, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const candidateId = await nextCandidateId(workspaceRoot);
  const frontMatter = {
    id: candidateId,
    name: input.name || '',
    status: 'pending',
    'created-at': new Date().toISOString(),
  };
  if (input.sourceChange) frontMatter['source-change'] = input.sourceChange;

  const candidatePath = await writeArtifact(
    join(workspaceRoot, 'product', 'features'),
    'feature-candidate.md',
    {
      frontMatter,
      replacements: {
        'candidate-name': input.name || '',
        'source-change': input.sourceChange || '',
      },
      outputName: `${candidateId}.md`,
    },
    root
  );
  return { candidateId, candidatePath };
}
