// openspec CLI 入口：commander program 装配
import { Command } from 'commander';
import { readHarnessVersion } from '../../../core/workspace/version.js';
import { getHarnessRoot } from '../../../core/workspace/harness-root.js';
import { registerInitCommand } from './commands/init.js';

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

// Phase 1.3+ 预留（不实现，仅注释占位）：
// program.command('change', ...)  — openspec change create（Change Management 阶段）
// program.command('doctor', ...)  — openspec doctor（复用 core/workspace/validator.js 内核）
// program.command('validate', ...) — openspec validate
// program.command('reverse', ...)  — openspec reverse（knowledge reverse）
// program.command('status', ...)   — openspec status

program.parseAsync();
