// Ide Command：生成 Trae / Cursor / Claude Code 项目规则 + Skill 斜杠命令
// （Phase 3.3 plans/phase-3.3-ide-adapters-design.md §3、Phase 3.4 plans/phase-3.4-ide-commands-design.md）
// CLI 层仅编排，规则逻辑在 core/workspace/ide-rules.js，命令逻辑在 core/workspace/ide-commands.js

import { intro, outro } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, dim } from '../lib/logger.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { readHarnessVersion } from '../../../../core/workspace/version.js';
import { TARGETS, planIdeRules, applyIdeRules } from '../../../../core/workspace/ide-rules.js';
import { planIdeCommands, applyIdeCommands } from '../../../../core/workspace/ide-commands.js';

export function registerIdeCommand(program) {
  program
    .command('ide')
    .description('生成 AI IDE 项目规则与 Skill 斜杠命令（trae | cursor | claude-code）')
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
        // ---- Rules（单文件）----
        const rulesPlan = await planIdeRules(workspaceRoot, target, harnessRoot, harnessVersion);
        let rulesMsg;
        if (rulesPlan.action === 'up-to-date') {
          rulesMsg = `Rules: ${rulesPlan.file} 已是最新（v${harnessVersion}）`;
        } else if (rulesPlan.action === 'conflict' && !opts.force) {
          rulesMsg = null;
        } else {
          const r = await applyIdeRules(workspaceRoot, target, rulesPlan, { force: opts.force });
          rulesMsg =
            r.action === 'updated'
              ? `Rules: ${r.file} 已更新（v${r.from} → v${r.to}）`
              : `Rules: ${r.file} 已生成（v${harnessVersion}）`;
        }

        // ---- Commands（11 Skill 命令）----
        const cmdPlan = await planIdeCommands(workspaceRoot, target, harnessRoot, harnessVersion);
        const conflictCmds = cmdPlan.entries.filter((e) => e.action === 'conflict').map((e) => e.file);
        let cmdResult = null;
        if (conflictCmds.length === 0 || opts.force) {
          cmdResult = await applyIdeCommands(workspaceRoot, target, cmdPlan, { force: opts.force });
        }

        // ---- 输出 ----
        if (rulesMsg === null) {
          warn(`Rules: ${rulesPlan.file} 已存在且非 OpenSpec 生成（无版本标记）。`);
          warn('请重命名或删除该文件后重试，或使用 --force 覆盖。');
        } else if (rulesMsg) {
          ok(rulesMsg);
        }

        if (!cmdResult) {
          warn(`Commands: ${conflictCmds.length} 个命令文件已存在且非 OpenSpec 生成（无版本标记）：`);
          for (const f of conflictCmds) warn(`  - ${f}`);
          warn('请重命名或删除后重试，或使用 --force 覆盖。');
          outro('Failed.');
          process.exit(1);
        }

        // codex 等 无 slash command 概念的 target：plan/apply 天然返回空，给出明确提示
        if (!COMMANDS_DIR[target]) {
          ok(`Commands: ${target} 无项目级 slash command 概念，已跳过生成（规则文件已就位即可生效）`);
          dim('重启 IDE 对话后规则生效。');
          outro('Done.');
          return;
        }

        const byAction = { created: 0, updated: 0 };
        for (const s of cmdResult.skipped) {
          if (s.action === 'created') byAction.created++;
          else if (s.action === 'updated') byAction.updated++;
        }
        if (byAction.created === 0 && byAction.updated === 0) {
          ok(`Commands: ${cmdResult.skipped.length} 个 Skill 命令已是最新（v${harnessVersion}）`);
        } else {
          const parts = [];
          if (byAction.created) parts.push(`${byAction.created} 生成`);
          if (byAction.updated) parts.push(`${byAction.updated} 更新`);
          ok(`Commands: Skill 斜杠命令 ${parts.join('，')}（共 ${cmdResult.skipped.length} 个，目录 ${COMMANDS_DIR[target]}）`);
        }

        dim('重启 IDE 对话后规则与命令生效。用法示例：/sdd-explore CHG-0002');
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Failed.');
        process.exit(1);
      }
    });
}
