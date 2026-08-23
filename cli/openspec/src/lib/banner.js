// 欢迎横幅输出
import pc from 'picocolors';

/**
 * 输出 init 命令欢迎横幅。
 *
 * @param {string} version Harness 版本字符串
 */
export function printBanner(version) {
  console.log();
  console.log(pc.bold(pc.cyan('OpenSpec AI Development Harness')));
  console.log(pc.dim('Workspace Initialization'));
  console.log(pc.dim(`Version: ${version}`));
  console.log();
}
