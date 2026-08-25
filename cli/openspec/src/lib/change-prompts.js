// ChangePrompts：change 命令的 @clack 交互封装（CLI 层辅助）
import * as p from '@clack/prompts';

/**
 * 取消处理：显示 cancel 并退出。
 */
function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/**
 * 归档确认（难逆操作，须用户裁决）。
 *
 * @param {string} id CHG-XXXX
 * @param {string} status 当前状态
 * @returns {Promise<boolean>} 确认返回 true
 */
export async function confirmArchive(id, status) {
  const ce = await p.confirm({
    message: `归档 ${id}（当前 status: ${status}）？此操作将移动到 delivery/archive/，不可逆。`,
    active: 'Yes',
    inactive: 'No',
    initialValue: false,
  });
  if (p.isCancel(ce)) bail('已取消');
  return ce;
}
