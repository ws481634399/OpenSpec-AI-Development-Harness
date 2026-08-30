// Version Command：Harness / Workspace / Skill 版本全景（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.1）
// 在 Workspace 内展示三层版本 + Skill 差异；不在 Workspace 内仅显示 Harness 版本 + Skill 列表

import { Command } from 'commander';
import { note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { error } from '../lib/logger.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import {
  readHarnessVersion,
  readWorkspaceVersions,
  compareSemver,
} from '../../../../core/workspace/version.js';
import { diffSkills, listSkills } from '../../../../core/sdd/skill-registry.js';

const pad = (label, width = 20) => label.padEnd(width, ' ');

/**
 * 计算版本状态标注（落后/超前/一致）。
 */
function versionMarker(wsVersion, target) {
  if (!wsVersion) return '';
  const c = compareSemver(wsVersion, target);
  if (c < 0) return '  ← 落后，可 upgrade';
  if (c > 0) return '  ← 超前';
  return '';
}

/**
 * 汇总 Skill 差异统计。
 */
function summarizeSkills(diff) {
  const updated = diff.filter((d) => d.status === 'updated');
  const added = diff.filter((d) => d.status === 'added');
  const localOnly = diff.filter((d) => d.status === 'local-only');
  const unchanged = diff.filter((d) => d.status === 'unchanged');
  return { updated, added, localOnly, unchanged };
}

/**
 * 格式化版本全景为文本。
 */
function formatVersion({ harness, workspace, skills }) {
  const lines = [];
  lines.push(`${pad('Harness:')}${harness}`);

  if (workspace) {
    lines.push('Workspace:');
    const hv = workspace.harness ? `${pad('  harness.version:', 22)}${workspace.harness}` : null;
    if (hv) lines.push(hv + versionMarker(workspace.harness, harness));
    if (workspace.workspaceTemplate) {
      lines.push(`${pad('  workspace-template:', 22)}${workspace.workspaceTemplate}`);
    }
    if (workspace.schema) {
      lines.push(`${pad('  schema:', 22)}${workspace.schema}`);
    }
  } else {
    lines.push('Workspace: 不在 Workspace 内（无 .sdd/）');
  }

  const s = summarizeSkills(skills);
  const total = skills.length;
  lines.push('');
  lines.push(
    `Skills (${total}): ${s.updated.length + s.added.length} outdated, ${s.unchanged.length} up-to-date, ${s.localOnly.length} local-only`
  );
  for (const d of s.added) {
    lines.push(`  added:    ${d.id} → ${d.harnessVersion ?? '?'}`);
  }
  for (const d of s.updated) {
    lines.push(`  updated:  ${d.id} ${d.workspaceVersion} → ${d.harnessVersion}`);
  }
  for (const d of s.localOnly) {
    lines.push(`  local:    ${d.id} (${d.workspaceVersion ?? '?'}, Harness 无此 Skill）`);
  }
  return lines.join('\n');
}

/**
 * 注册 version 命令到 commander program。
 */
export function registerVersionCommand(program) {
  program
    .command('version')
    .description('版本全景：Harness / Workspace / Skill 版本与差异')
    .option('--json', '输出 JSON 格式（供 Agent/脚本消费）')
    .action(async (opts) => {
      try {
        const harnessRoot = getHarnessRoot();
        const harnessVersion = readHarnessVersion(harnessRoot);

        // Workspace 可选：不在 Workspace 内也能查看 Harness 版本
        let workspaceRoot = null;
        try {
          workspaceRoot = resolveWorkspaceRoot();
        } catch {
          workspaceRoot = null;
        }

        const workspace = workspaceRoot ? readWorkspaceVersions(workspaceRoot) : null;
        let skills;
        if (workspaceRoot) {
          skills = await diffSkills(harnessRoot, workspaceRoot);
        } else {
          const listed = await listSkills(harnessRoot, null);
          skills = listed.map((s) => ({
            id: s.id,
            workspaceVersion: s.version || null,
            harnessVersion: s.version || null,
            status: 'unchanged',
          }));
        }

        const payload = { harness: harnessVersion, workspace, skills };

        if (opts.json) {
          console.log(JSON.stringify(payload, null, 2));
        } else {
          note(formatVersion(payload), 'OpenSpec Version');
        }
      } catch (e) {
        error(e.message);
        process.exit(1);
      }
    });
}
