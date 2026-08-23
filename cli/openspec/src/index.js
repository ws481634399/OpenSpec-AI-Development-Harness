// openspec CLI 入口：commander program 装配
import { Command } from 'commander';
import { readHarnessVersion } from '../../../core/workspace/version.js';
import { getHarnessRoot } from '../../../core/workspace/harness-root.js';
import { registerInitCommand } from './commands/init.js';
import { registerChangeCommand } from './commands/change.js';

// 解析 Harness 版本作为 CLI 版本
let version;
try {
  version = readHarnessVersion(getHarnessRoot());
} catch {
  version = '0.0.0';
}

export const program = new Command();

program
  .name('openspec')
  .description('OpenSpec AI Development Harness CLI')
  .version(version);

// Phase 1.2：init 命令
registerInitCommand(program);

// Phase 1.3：change 管理操作（list/show/status/archive，不含 create 入口）
registerChangeCommand(program);

// Phase 1.4+ 预留（不实现，仅注释占位）：
// program.command('skill', ...)   — openspec skill list/show/run（Phase 1.4）
// program.command('doctor', ...)  — openspec doctor（复用 core/workspace/validator.js 内核）
// program.command('validate', ...) — openspec validate
// program.command('reverse', ...)  — openspec reverse（knowledge reverse）
// program.command('status', ...)   — openspec status

program.parseAsync();
