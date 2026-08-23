// 终端日志输出（picocolors 着色）
import pc from 'picocolors';

export const info = (msg) => console.log(pc.cyan('›') + ' ' + msg);
export const ok = (msg) => console.log(pc.green('✓') + ' ' + msg);
export const warn = (msg) => console.log(pc.yellow('!') + ' ' + msg);
export const error = (msg) => console.error(pc.red('✗') + ' ' + msg);
export const dim = (msg) => console.log(pc.dim(msg));
