// Ide Command：生成 Trae / Cursor / Claude Code 项目规则（Phase 3.3 plans/phase-3.3-ide-adapters-design.md §3）
// CLI 层仅编排，全部逻辑在 core/workspace/ide-rules.js

import { intro, outro } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, dim } from '../lib/logger.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { readHarnessVersion } from '../../../../core/workspace/version.js';
import { TARGETS, planIdeRules, applyIdeRules } from '../../../../core/workspace/ide-rules.js';

export function registerIdeCommand(program) {
  program
    .command('ide')
    .description('生成 AI IDE 项目规则（trae | cursor | claude-code）')
    .argument('<target>', `IDE 目标: ${TARGETS.join(' | ')}`)
    .option('--force', '覆盖已存在且非 OpenSpec 生成的同名文件（trae/cursor）')
    .action(async (target, opts) => {
      intro(`openspec ide ${target}`);

      if (!TARGETS.includes(target)) {
        error(`未知 IDE 目标 '${target}'。合法值: ${TARGETS.join(' | ')}`);
        outro('Failed.');
        process.exit(1);
      }

      let workspaceRoot;
      try {
        workspaceRoot = resolveWorkspaceRoot(process.cwd());
      } catch {
        error('当前目录不在 OpenSpec Workspace 内。请先运行 openspec init 或进入 Workspace 目录。');
        outro('Failed.');
        process.exit(1);
      }

      const harnessRoot = getHarnessRoot();
      const harnessVersion = readHarnessVersion(harnessRoot);

      try {
        const plan = await planIdeRules(workspaceRoot, target, harnessRoot, harnessVersion);

        if (plan.action === 'up-to-date') {
          ok(`${plan.file} 已是最新（v${harnessVersion}）`);
          outro('Done.');
          return;
        }
        if (plan.action === 'conflict' && !opts.force) {
          warn(`${plan.file} 已存在且非 OpenSpec 生成（无版本标记）。`);
          warn('请重命名或删除该文件后重试，或使用 --force 覆盖。');
          outro('Failed.');
          process.exit(1);
        }

        const result = await applyIdeRules(workspaceRoot, target, plan, { force: opts.force });

        if (result.action === 'updated') {
          ok(`${result.file} 已更新（v${result.from} → v${result.to}）`);
        } else {
          ok(`${result.file} 已生成（v${harnessVersion}）`);
        }
        dim('重启 IDE 对话后规则生效。');
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Failed.');
        process.exit(1);
      }
    });
}
