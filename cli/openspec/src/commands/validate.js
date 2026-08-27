// Validate Command：Change 一致性校验（CLI 层，调用 core/sdd/change-validator.js）
// 对齐 Phase 1 CLI 补齐方案

import { Command } from 'commander';
import { outro } from '@clack/prompts';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { validateChange, validateAll } from '../../../../core/sdd/change-validator.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';

/**
 * 注册 validate 命令到 commander program。
 */
export function registerValidateCommand(program) {
  program
    .command('validate')
    .description('校验 Change 的 artifact 完整性 + 状态合法性')
    .argument('[id]', 'CHG-XXXX（省略时需 --all）')
    .option('--all', '校验全部 Change')
    .action(async (id, opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();

        if (opts.all) {
          // 校验全部
          const { results, ok: allOk, issueCount, skipped } = await validateAll(ws, harnessRoot);
          for (const r of results) {
            if (r.ok) {
              ok(`${r.id} (${r.status})`);
            } else {
              warn(`${r.id} (${r.status}):`);
              for (const issue of r.issues) {
                warn(`  ! ${issue}`);
              }
            }
          }
          if (skipped > 0) {
            warn(`${skipped} corrupted change(s) skipped.`);
          }
          if (allOk) {
            outro(`All ${results.length} change(s) valid.`);
          } else {
            outro(`${issueCount} issue(s) found across ${results.length} change(s).`);
            process.exit(1);
          }
        } else if (id) {
          // 校验单个
          const changeDir = join(ws, 'delivery', 'changes', id);
          const r = await validateChange(changeDir, harnessRoot);
          if (r.ok) {
            ok(`${r.id} (${r.status}) — valid.`);
          } else {
            warn(`${r.id} (${r.status}):`);
            for (const issue of r.issues) {
              warn(`  ! ${issue}`);
            }
            process.exit(1);
          }
          outro('Done.');
        } else {
          error('Usage: openspec validate <id>  or  openspec validate --all');
          outro('Validate failed.');
          process.exit(1);
        }
      } catch (e) {
        error(e.message);
        outro('Validate failed.');
        process.exit(1);
      }
    });
}
