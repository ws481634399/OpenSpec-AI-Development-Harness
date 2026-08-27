// openspec CLI 入口：commander program 装配
import { Command } from 'commander';
import { readHarnessVersion } from '../../../core/workspace/version.js';
import { getHarnessRoot } from '../../../core/workspace/harness-root.js';
import { registerInitCommand } from './commands/init.js';
import { registerChangeCommand } from './commands/change.js';
import { registerSkillCommand } from './commands/skill.js';
import { registerGateCommand } from './commands/gate.js';
import { registerWorkflowCommand } from './commands/workflow.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerStatusCommand } from './commands/status.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerReverseCommand } from './commands/reverse.js';
import { registerFeatureCommand } from './commands/feature.js';

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

// Phase 1.4：skill 管理与调用（list/show/run，sdd-explore 完整演示，其余 6 骨架）
registerSkillCommand(program);

// Phase 1.5：gate / workflow（Gate-driven Workflow Engine）
registerGateCommand(program);
registerWorkflowCommand(program);

// Phase 1 补齐：doctor / status / validate / reverse / feature
registerDoctorCommand(program);
registerStatusCommand(program);
registerValidateCommand(program);
registerReverseCommand(program);
registerFeatureCommand(program);

program.parseAsync();
