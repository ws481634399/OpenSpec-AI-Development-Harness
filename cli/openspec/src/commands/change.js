// Change Command：编排 list/show/status/archive（CLI 层，依赖 core/sdd）
// 瘦编排范本对齐 init.js：resolveWorkspaceRoot → @clack 交互 → core 纯函数 → note/ok/warn 输出
// 不含 create 子命令（create 由 Phase 1.4 sdd-explore 内部调用 ChangeModel.runChangeCreate）
import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { listChanges, showChange, changeExists } from '../../../../core/sdd/change-repository.js';
import { readMetadata, patchStatus } from '../../../../core/sdd/change-model.js';
import {
  validateTransition,
  nextStatuses,
  isValidStatus,
} from '../../../../core/sdd/change-state-machine.js';
import { archiveChange } from '../../../../core/sdd/change-archiver.js';
import { confirmArchive } from '../lib/change-prompts.js';
import { join } from 'node:path';

/**
 * 注册 change 子命令组到 commander program。
 */
export function registerChangeCommand(program) {
  const change = program.command('change').description('SDD Change 管理操作');

  // list：列出进行中 Change
  change
    .command('list')
    .option('-s, --status <state>', '按状态过滤')
    .action(async (opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (opts.status && !isValidStatus(opts.status)) {
          throw new Error(`Invalid status: ${opts.status}. Run 'openspec change status' for valid states.`);
        }
        const { changes, skipped } = await listChanges(ws, { status: opts.status });
        if (changes.length === 0) {
          note('No changes found.', 'Changes');
        } else {
          note(
            changes
              .map((c) => `${c.id}  ${c.title || '(untitled)'}  status: ${c.status}  updated: ${c.updatedAt}`)
              .join('\n'),
            `Changes (${changes.length})`
          );
        }
        if (skipped > 0) warn(`${skipped} skipped due to corruption.`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('List failed.');
        process.exit(1);
      }
    });

  // show：查看 metadata + artifacts 清单
  change
    .command('show <id>')
    .action(async (id) => {
      const ws = resolveWorkspaceRoot();
      try {
        const { metadata, artifacts, changeDir } = await showChange(ws, id);
        const lines = [
          `id: ${metadata.id || id}`,
          `title: ${metadata.title || ''}`,
          `status: ${metadata.status || ''}`,
          `requirement: ${metadata.requirement || ''}`,
          `created-at: ${metadata['created-at'] || ''}`,
          `updated-at: ${metadata['updated-at'] || ''}`,
        ];
        if (metadata.features && metadata.features.length) {
          lines.push(`features: ${metadata.features.join(', ')}`);
        }
        if (metadata.repositories && metadata.repositories.length) {
          lines.push(`repositories: ${metadata.repositories.join(', ')}`);
        }
        if (metadata['related-change']) {
          lines.push(`related-change: ${metadata['related-change']}`);
        }
        lines.push('', 'Artifacts:');
        for (const a of artifacts) {
          lines.push(`  ${a.name} (${a.type})`);
        }
        note(lines.join('\n'), `${id} @ ${changeDir}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Show failed.');
        process.exit(1);
      }
    });

  // status：查看/推进状态
  change
    .command('status <id>')
    .option('--set <state>', '推进到指定状态')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', id);
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const metadata = await readMetadata(changeDir);
        const current = metadata.status || 'created';

        if (!opts.set) {
          const next = nextStatuses(current);
          note(
            [`Current: ${current}`, next.length ? `Legal next: ${next.join(', ')}` : 'Legal next: none (terminal)'].join('\n'),
            `${id} status`
          );
          outro('Done.');
          return;
        }

        // --set：推进状态
        if (opts.set === current) {
          throw new Error(`Already at ${current} (from === to).`);
        }
        validateTransition(current, opts.set); // 非法迁移抛错
        await patchStatus(changeDir, opts.set);
        ok(`${id} status: ${current} → ${opts.set}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Status update failed.');
        process.exit(1);
      }
    });

  // archive：归档（需 completed）
  change
    .command('archive <id>')
    .action(async (id) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', id);
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const metadata = await readMetadata(changeDir);
        const current = metadata.status || 'created';

        if (current !== 'completed') {
          throw new Error(`Cannot archive: status is ${current}. Only completed can be archived.`);
        }

        const confirmed = await confirmArchive(id, current);
        if (!confirmed) {
          outro('Canceled.');
          return;
        }

        const { archiveDir } = await archiveChange(ws, id);
        ok(`${id} archived to ${archiveDir}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Archive failed.');
        process.exit(1);
      }
    });
}
