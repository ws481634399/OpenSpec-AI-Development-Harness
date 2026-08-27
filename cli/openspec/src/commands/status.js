// Status Command：Workspace + Change 概览（CLI 层，调用 core/workspace/status-aggregator.js）
// 对齐 Phase 1 CLI 补齐方案

import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, dim } from '../lib/logger.js';
import { aggregateStatus } from '../../../../core/workspace/status-aggregator.js';

/**
 * 格式化状态概览为文本。
 */
function formatStatus(s) {
  const lines = [];

  // Workspace 区块
  lines.push('Workspace:');
  lines.push(`  name:           ${s.workspace.name}`);
  lines.push(`  type:           ${s.workspace.type}`);
  lines.push(`  harness:        ${s.workspace.harnessVersion}`);
  if (s.workspace.initDate) {
    lines.push(`  init-date:      ${s.workspace.initDate}`);
  }

  // Repositories 区块
  lines.push('');
  lines.push('Repositories:');
  lines.push(`  mode:           ${s.repositories.mode}`);
  lines.push(`  count:          ${s.repositories.count}`);
  for (const r of s.repositories.repos) {
    lines.push(`  - ${r.id}: ${r.path}`);
  }

  // Changes 区块
  lines.push('');
  lines.push('Changes:');
  lines.push(`  total:          ${s.changes.total}`);
  if (s.changes.skipped > 0) {
    lines.push(`  skipped:        ${s.changes.skipped}`);
  }

  const statusEntries = Object.entries(s.changes.byStatus);
  if (statusEntries.length > 0) {
    lines.push('  by status:');
    for (const [status, count] of statusEntries) {
      lines.push(`    ${status}: ${count}`);
    }
  }

  if (s.changes.recent.length > 0) {
    lines.push('  recent:');
    for (const c of s.changes.recent) {
      lines.push(`    ${c.id} (${c.status}) ${c.title}`);
    }
  }

  return lines.join('\n');
}

/**
 * 注册 status 命令到 commander program。
 */
export function registerStatusCommand(program) {
  program
    .command('status')
    .description('Workspace + Change 状态概览')
    .option('--json', '输出 JSON 格式（供 Agent 消费）')
    .action(async (opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const status = await aggregateStatus(ws);

        if (opts.json) {
          console.log(JSON.stringify(status, null, 2));
        } else {
          note(formatStatus(status), 'Workspace Status');
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Status failed.');
        process.exit(1);
      }
    });
}
