// 测试辅助：为 CHG 绑定 feature-path 并创建/物化 DU（Phase 2.4 gate 测试共用）
// 新建 CHG 为 schema v2，design/task/dev/test/review 相关 gate 均含 DU 机检项，
// 断言 machine gate passed 的测试需先完成 feature-path 绑定 + DU 物化。
import { bindFeaturePath, readMetadata } from '../../core/sdd/change-model.js';
import {
  writeWorkspaceDu,
  materializeDeliveryUnit,
  updateWorkspaceDuStatus,
} from '../../core/sdd/delivery-unit.js';

// 标准四级 feature-path（与 DU 目录投影一致）
export const TEST_FEATURE_PATH = {
  'level-1': { id: 'FEAT-001', name: '用户中心' },
  'level-2': { id: 'FEAT-001-01', name: '账户能力' },
  'level-3': { id: 'FEAT-001-01-01', name: '用户认证' },
  story: { id: 'STORY-001-01-01-01', name: '用户注册' },
  candidate: false,
};

/**
 * 为 CHG 绑定 feature-path + 创建并物化一个 DU（repository: main）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} changeId CHG-XXXX
 * @param {string} changeDir CHG 目录绝对路径
 * @param {{status?:'pending'|'developing'|'testing'|'completed'}} [opts]
 *   指定时同时推进 DU 轻量状态（completed 会回填 repository-result）
 */
export async function setupDu(workspaceRoot, changeId, changeDir, opts = {}) {
  await bindFeaturePath(changeDir, TEST_FEATURE_PATH);
  let meta = await readMetadata(changeDir);
  await writeWorkspaceDu(changeDir, meta, {
    id: 'DU-MAIN-001',
    repository: 'main',
    scope: ['registration'],
    acceptance: ['AC-1 注册流程可用'],
  });
  await materializeDeliveryUnit(workspaceRoot, changeId, 'DU-MAIN-001');
  if (opts.status) {
    meta = await readMetadata(changeDir);
    await updateWorkspaceDuStatus(changeDir, meta, 'DU-MAIN-001', opts.status, {
      resultCommit: 'a'.repeat(40),
    });
  }
}
