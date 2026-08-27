// Doctor Command：Workspace 自检（CLI 层，复用 core/workspace/validator.js 内核）
// 对齐 Phase 1 CLI 补齐方案

import { Command } from 'commander';
import { outro } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { runSelfCheck } from '../../../../core/workspace/validator.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { readHarnessVersion } from '../../../../core/workspace/version.js';

/**
 * 注册 doctor 命令到 commander program。
 */
export function registerDoctorCommand(program) {
  program
    .command('doctor')
    .description('Workspace 自检（检查结构/字段/版本一致性）')
    .action(async () => {
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();
        const expectedVersion = readHarnessVersion(harnessRoot);
        const result = runSelfCheck(ws, expectedVersion);

        if (result.ok) {
          ok('Workspace healthy — all checks passed.');
        } else {
          warn(`Workspace has ${result.issues.length} issue(s):`);
          for (const issue of result.issues) {
            warn(`  ! ${issue}`);
          }
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Doctor failed.');
        process.exit(1);
      }
    });
}
