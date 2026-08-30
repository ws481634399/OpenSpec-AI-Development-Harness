// Doctor Command：Workspace 自检（CLI 层，复用 core/workspace/validator.js + core/sdd/doctor-checks.js）
// Phase 1：结构/字段/版本一致性；Phase 2.4：多仓架构检查（§7.3）

import { Command } from 'commander';
import { outro } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { runSelfCheck } from '../../../../core/workspace/validator.js';
import { runMultiRepoChecks, runContextRulesChecks, runVersionChecks, runIdeRulesChecks } from '../../../../core/sdd/doctor-checks.js';
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
          multiChecked += multi.checked;
        } catch (e) {
          warn(`多仓检查跳过: ${e.message}`);
        }

        // Phase 2.6：context-rules.yaml 校验（stage 覆盖/枚举/path 存在性）
        try {
          const ctxChecks = await runContextRulesChecks(ws);
          issues.push(...ctxChecks.issues);
          multiChecked += ctxChecks.checked;
        } catch (e) {
          warn(`Context 规则检查跳过: ${e.message}`);
        }

        // Phase 3.1：版本健康检查（分级：跨 major=error / 可升级=info / schema 超前=error）
        let versionInfos = [];
        try {
          const v = runVersionChecks(ws, harnessRoot);
          issues.push(...v.issues);
          versionInfos = v.infos;
          multiChecked += v.checked;
        } catch (e) {
          warn(`版本检查跳过: ${e.message}`);
        }

        // Phase 3.3：IDE 规则版本检查（可选件：落后=info / 不存在=不提示）
        try {
          const ide = await runIdeRulesChecks(ws, harnessRoot);
          versionInfos.push(...ide.infos);
          multiChecked += ide.checked;
        } catch {
          // IDE 规则检查是可选增强，失败静默
        }

        if (issues.length === 0) {
          ok(`Workspace healthy — all checks passed.${multiChecked ? ` (${multiChecked} multi-repo checks)` : ''}`);
        } else {
          warn(`Workspace has ${issues.length} issue(s):`);
          for (const issue of issues) {
            warn(`  ! ${issue}`);
          }
        }
        // 版本 info 提示（非问题，仅为升级建议）
        for (const info of versionInfos) {
          dim(`  ℹ ${info}`);
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Doctor failed.');
        process.exit(1);
      }
    });
}
