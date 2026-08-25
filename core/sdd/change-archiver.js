// ChangeArchiver：Completed→Archived 迁移（纯函数，依赖 node:fs/promises）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §8.5 archive / §6.2

import { rename, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readMetadata, patchStatus } from './change-model.js';
import { validateTransition } from './change-state-machine.js';

/**
 * 归档一个 completed Change：迁移到 delivery/archive/<id>/ 并置 archived 状态。
 *
 * 流程（§8.5 archive）：
 * 1. 读 metadata 确认当前 status
 * 2. validateTransition(status, 'archived')（需 completed，否则抛错）
 * 3. rename changes/<id> → archive/<id>
 * 4. patchStatus(archiveDir, 'archived')（更新 status + updated-at）
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {string} id CHG-XXXX
 * @returns {Promise<{archiveDir:string}>}
 * @throws {Error} Change 不存在 / 非 completed / rename 失败
 */
export async function archiveChange(workspaceRoot, id) {
  const changeDir = join(workspaceRoot, 'delivery', 'changes', id);
  const archiveDir = join(workspaceRoot, 'delivery', 'archive', id);

  const metadata = await readMetadata(changeDir); // 不存在/损坏抛错
  const fromStatus = metadata.status || 'created';
  validateTransition(fromStatus, 'archived'); // 非 completed 抛错

  await mkdir(dirname(archiveDir), { recursive: true });
  await rename(changeDir, archiveDir);
  await patchStatus(archiveDir, 'archived');
  return { archiveDir };
}
