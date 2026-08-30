// Upgrade Command：旧 Workspace → 当前 Harness 版本的确定性升级（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.4）
// CLI 层仅编排，全部逻辑在 core/workspace/workspace-upgrader.js

import { Command } from 'commander';
import { intro, outro, note, isCancel } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, dim } from '../lib/logger.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import {
  planUpgrade,
  applyUpgrade,
} from '../../../../core/workspace/workspace-upgrader.js';

/**
 * 格式化升级计划/报告为文本。
 */
function formatReport(r) {
  const lines = [];

  lines.push(
    `版本: ${r.current.harness ?? '?'} → ${r.target.harnessVersion}（workspace-template: ${r.current.workspaceTemplate ?? '?'} → ${r.target.templateVersion}）`
  );
  lines.push('');

  // Skills
  const sSkills = r.skills.changed.length;
  lines.push(`Skills: ${sSkills} 个将更新${sSkills ? '' : '（无变化）'}`);
  for (const d of r.skills.details) {
    if (!d.includes('unchanged') && !d.includes('local-only')) lines.push(`  ${d}`);
  }

  // Prompts
  const sPrompts = r.prompts.changed.length;
  lines.push('');
  lines.push(`Prompts: ${sPrompts} 个将更新${sPrompts ? '' : '（无变化）'}`);

  // 新增受管文件
  lines.push('');
  lines.push(`新增受管文件: ${r.addedFiles.length} 个`);
  for (const f of r.addedFiles) lines.push(`  + ${f}`);

  // 迁移
  const migrations = r.migrations.executed;
  lines.push('');
  lines.push(`Schema 迁移: ${migrations.length} 项`);
  for (const m of migrations) lines.push(`  ~ ${m.id || m}`);

  // skipped
  if (r.migrations.skipped?.length) {
    lines.push('');
    lines.push('跳过迁移:');
    for (const s of r.migrations.skipped) {
      lines.push(`  - ${s.id}: ${s.reason}`);
    }
  }
  return lines.join('\n');
}

/**
 * 注册 upgrade 命令到 commander program。
 */
export function registerUpgradeCommand(program) {
  program
    .command('upgrade')
    .description('升级 Workspace 到当前 Harness 版本（skills/prompts 同步 + 模板补齐 + schema 迁移 + 版本记录）')
    .option('--dry-run', '只预览升级计划，不写入任何文件')
    .action(async (opts) => {
      intro(`openspec upgrade${opts.dryRun ? ' (dry-run)' : ''}`);
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();

        const plan = await planUpgrade(ws, harnessRoot);

        if (plan.upToDate) {
          ok('Workspace 已是最新，无需升级。');
          outro('Done.');
          return;
        }

        // 预览：先展示计划
        note(formatReport(plan), opts.dryRun ? 'Upgrade Plan（预览，零写入）' : 'Upgrade Plan');

        if (opts.dryRun) {
          dim('\nDry-run 完成，未写入任何文件。去掉 --dry-run 执行升级。');
          outro('Done.');
          return;
        }

        const report = await applyUpgrade(ws, harnessRoot);

        ok(`升级完成：${report.touchedFiles.length} 个文件变更。`);
        if (report.touchedFiles.length) {
          dim('如需回滚: git checkout -- ' + report.touchedFiles.slice(0, 5).join(' ') +
            (report.touchedFiles.length > 5 ? ` 等 ${report.touchedFiles.length} 个文件` : ''));
        }
        outro('Done.');
      } catch (e) {
        if (isCancel(e)) return;
        error(e.message);
        outro('Upgrade failed.');
        process.exit(1);
      }
    });
}
