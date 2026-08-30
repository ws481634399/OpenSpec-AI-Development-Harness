// Upgrade Command：旧 Workspace → 当前 Harness 版本的确定性升级（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.4）
// --rollback：回滚最近一次升级（core 校验 + version 恢复；git checkout 与新增文件删除在 CLI 层）
// 全部升级逻辑在 core/workspace/workspace-upgrader.js

import { Command } from 'commander';
import { intro, outro, note, isCancel } from '@clack/prompts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, dim } from '../lib/logger.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import {
  planUpgrade,
  applyUpgrade,
  planRollback,
  markRolledBack,
} from '../../../../core/workspace/workspace-upgrader.js';

const execFileAsync = promisify(execFile);

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
 * 回滚最近一次升级：git checkout 恢复已存在文件 → 删除升级新增文件 → core 恢复版本记录与日志标记。
 * Git 依赖：Workspace 必须是被 git 管理的仓库（否则提示手动按日志处理）。
 */
async function runRollback(ws) {
  const record = await planRollback(ws); // 校验 + 零写入

  note(
    `回滚目标: 升级 ${record.from?.harness ?? '?'} → ${record.to?.harness ?? '?'}（${record.at}）\n` +
      `git 恢复 ${record.gitRevertFiles.length} 项 / 删除新增 ${record.gitNewFiles.length} 项`,
    'Rollback Plan'
  );

  // 1. git checkout 恢复已存在文件（untracked 会报错，故仅对 revert 清单执行）
  if (record.gitRevertFiles.length) {
    try {
      await execFileAsync('git', ['checkout', '--', ...record.gitRevertFiles], { cwd: ws });
      dim(`git checkout -- ${record.gitRevertFiles.length} 项完成`);
    } catch (e) {
      error(`git checkout 失败（Workspace 需为 git 管理的仓库）: ${e.message.split('\n')[0]}`);
      error(`请按 .sdd/upgrade-log.yaml 手动恢复: ${record.gitRevertFiles.slice(0, 5).join(' ')} 等`);
      outro('Rollback failed.');
      process.exit(1);
    }
  }

  // 2. 删除升级新增文件（untracked，git checkout 无法恢复）
  let removed = 0;
  for (const rel of record.gitNewFiles) {
    await rm(join(ws, rel), { recursive: true, force: true });
    removed++;
  }
  if (removed) dim(`删除升级新增文件 ${removed} 项`);

  // 3. core：version.yaml 恢复 from + 日志标记 rolledBack
  await markRolledBack(ws, record);
  ok(`已回滚到 ${record.from?.harness ?? '?'}（workspace-template: ${record.from?.workspaceTemplate ?? '?'}）`);
}

/**
 * 注册 upgrade 命令到 commander program。
 */
export function registerUpgradeCommand(program) {
  program
    .command('upgrade')
    .description('升级 Workspace 到当前 Harness 版本（skills/prompts 同步 + 模板补齐 + schema 迁移 + 版本记录）')
    .option('--dry-run', '只预览升级计划，不写入任何文件')
    .option('--rollback', '回滚最近一次未回滚的升级（依赖 Workspace git 与 .sdd/upgrade-log.yaml）')
    .action(async (opts) => {
      intro(`openspec upgrade${opts.rollback ? ' (rollback)' : opts.dryRun ? ' (dry-run)' : ''}`);
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();

        if (opts.rollback) {
          await runRollback(ws);
          outro('Done.');
          return;
        }

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
        dim('如需回滚: openspec upgrade --rollback');
        outro('Done.');
      } catch (e) {
        if (isCancel(e)) return;
        error(e.message);
        outro('Upgrade failed.');
        process.exit(1);
      }
    });
}
