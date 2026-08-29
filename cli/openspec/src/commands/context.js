// Context Command：预览指定阶段的 Context 装配结果（Phase 2.6，只读排障入口）
// 不写 .instruction.md——只展示各条目文件数/字节数、missing、skipped、预算占用

import { Command } from 'commander';
import { outro } from '@clack/prompts';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, info, dim } from '../lib/logger.js';
import { assembleContext } from '../../../../core/sdd/context-assembler.js';
import { readMetadata } from '../../../../core/sdd/change-model.js';

const STAGES = ['explore', 'prd', 'design', 'task', 'dev', 'test', 'review', 'converge'];

/**
 * 注册 context 命令到 commander program。
 */
export function registerContextCommand(program) {
  program
    .command('context <stage>')
    .description('预览指定阶段的 Context 装配结果（排障用，不写 .instruction.md）')
    .option('--change <chg-id>', 'CHG-XXXX（注入 Change Artifacts；省略时仅装配 read 规则）')
    .option('--du <du-id>', 'DU-<别名>-NNN（绑定 DU：注入 repo 侧上下文 + 激活 per-repo 规则段，Phase 2.7）')
    .action(async (stage, opts) => {
      try {
        if (!STAGES.includes(stage)) {
          throw new Error(`未知阶段: ${stage}（允许: ${STAGES.join(' / ')}）`);
        }
        const ws = resolveWorkspaceRoot();
        const runOpts = {};
        if (opts.change) {
          const changeDir = join(ws, 'delivery', 'changes', opts.change);
          runOpts.changeDir = changeDir;
          runOpts.metadata = await readMetadata(changeDir);
        }
        if (opts.du) runOpts.du = opts.du;
        const ctx = await assembleContext(ws, stage, runOpts);

        const inline = ctx.files.filter((f) => f.mode !== 'outline' && f.content);
        const outline = ctx.files.filter((f) => f.mode === 'outline' || !f.content);
        const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

        ok(`Stage: ${stage}${ctx.rulesVersion ? ` (rules v${ctx.rulesVersion})` : ''}`);
        if (ctx.duBinding) {
          const b = ctx.duBinding;
          info(
            `DU 绑定: ${b.duId}（repository: ${b.repository}）${b.materialized ? '' : ' [未物化]'}`
          );
          dim(`  repo delivery: ${b.repoPath || '(未解析)'}`);
          if (b.activatedRepos.length > 0) {
            dim(`  per-repo 规则段: ${b.activatedRepos.join(', ')}`);
          } else {
            dim('  per-repo 规则段: 未激活（无匹配 repos 段）');
          }
        }
        info(`Change Artifacts（正文注入）: ${ctx.files.filter((f) => f.source !== 'rule').length} 个`);
        for (const f of ctx.files.filter((f) => f.source !== 'rule' && f.content)) {
          dim(`  = ${f.path} [${f.source}]`);
        }
        const repoOutline = ctx.files.filter((f) => f.source === 'repo' && !f.content);
        if (repoOutline.length > 0) {
          info(`Repo 侧清单: ${repoOutline.length} 个`);
          for (const f of repoOutline) {
            dim(`  - ${f.path}`);
          }
        }
        info(`内联文件: ${inline.length} 个 / 清单文件: ${outline.length} 个`);
        for (const f of outline) {
          dim(`  - ${f.path}`);
        }
        if (ctx.missingArtifacts.length > 0) {
          warn(`缺失产物: ${ctx.missingArtifacts.join('；')}`);
        }
        if (ctx.skipped.length > 0) {
          warn(`预算截断: ${ctx.skipped.length} 个`);
          for (const s of ctx.skipped.slice(0, 20)) {
            dim(`  ! ${s}`);
          }
          if (ctx.skipped.length > 20) dim(`  ...（共 ${ctx.skipped.length} 个）`);
        }
        info(
          `预算: ${kb(ctx.budget.usedBytes)} / ${kb(ctx.budget.limitBytes)} · ${ctx.budget.usedFiles} / ${ctx.budget.limitFiles} files`,
        );
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Context preview failed.');
        process.exit(1);
      }
    });
}
