// Doctor Command：Workspace 自检（CLI 层，复用 core/workspace/validator.js + core/sdd/doctor-checks.js）
// Phase 1：结构/字段/版本一致性；Phase 2.4：多仓架构检查（§7.3）

import { Command } from 'commander';
import { outro } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { runSelfCheck } from '../../../../core/workspace/validator.js';
import { runMultiRepoChecks } from '../../../../core/sdd/doctor-checks.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { readHarnessVersion } from '../../../../core/workspace/version.js';

/**
 * 注册 doctor 命令到 commander program。
 */
export function registerDoctorCommand(program) {
  program
    .command('doctor')
    .description('Workspace 自检（结构/字段/版本一致性 + 多仓架构检查）')
    .action(async () => {
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();
        const expectedVersion = readHarnessVersion(harnessRoot);
        const result = runSelfCheck(ws, expectedVersion);

        const issues = [...result.issues];

        // Phase 2.4：多仓架构检查（Registry/.gitmodules/HEAD/feature-path/DU/pointer）
        let multiChecked = 0;
        try {
          const multi = await runMultiRepoChecks(ws);
          issues.push(...multi.issues);
          multiChecked = multi.checked;
        } catch (e) {
          warn(`多仓检查跳过: ${e.message}`);
        }

        if (issues.length === 0) {
          ok(`Workspace healthy — all checks passed.${multiChecked ? ` (${multiChecked} multi-repo checks)` : ''}`);
        } else {
          warn(`Workspace has ${issues.length} issue(s):`);
          for (const issue of issues) {
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
