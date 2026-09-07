// openspec CLI 入口：commander program 装配
import { Command } from 'commander';
import { readHarnessVersion } from '../../../core/workspace/version.js';
import { getHarnessRoot } from '../../../core/workspace/harness-root.js';
import { registerInitCommand } from './commands/init.js';
import { registerChangeCommand } from './commands/change.js';
import { registerStoryCommand } from './commands/story.js';
import { registerSkillCommand } from './commands/skill.js';
import { registerGateCommand } from './commands/gate.js';
import { registerWorkflowCommand } from './commands/workflow.js';
import { registerDoctorCommand } from './commands/doctor.js';
import { registerStatusCommand } from './commands/status.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerReverseCommand } from './commands/reverse.js';
import { registerFeatureCommand } from './commands/feature.js';
import { registerDuCommand } from './commands/du.js';
import { registerContextCommand } from './commands/context.js';
import { registerVersionCommand } from './commands/version.js';
import { registerUpgradeCommand } from './commands/upgrade.js';
import { registerIdeCommand } from './commands/ide.js';

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

// Phase 1.3+：change 管理操作（create/list/show/status/archive/split-story）
registerChangeCommand(program);

// Phase 4.2：Story 级管理操作（list/show — 三级规格分层 1:N Story）
registerStoryCommand(program);

// Phase 1.4+：skill 元数据查询（list/show，Agent 读 SKILL.md 执行）
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

// Phase 2.4：Delivery Unit 管理操作（多仓交付单元）
registerDuCommand(program);

// Phase 2.6：Context 装配预览（排障用）
registerContextCommand(program);

// Phase 3.1：版本全景 + Workspace 升级
registerVersionCommand(program);
registerUpgradeCommand(program);

// Phase 3.3：IDE 项目规则生成（trae / cursor / claude-code / codex）
registerIdeCommand(program);

program.parseAsync();
