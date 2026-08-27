// StatusAggregator：聚合 Workspace 元信息 + Change 清单概览（纯函数，依赖 node:fs/promises + yaml）
// 供 openspec status 命令调用，也可供 Agent 消费（--json 输出）

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { listChanges } from '../sdd/change-repository.js';

/**
 * 读取 .sdd/workspace.yaml 的 workspace 段。
 * @param {string} workspaceRoot
 * @returns {Promise<object|null>}
 */
async function readWorkspaceYaml(workspaceRoot) {
  try {
    const raw = await readFile(join(workspaceRoot, '.sdd', 'workspace.yaml'), 'utf8');
    return parse(raw);
  } catch {
    return null;
  }
}

/**
 * 读取 .sdd/repositories.yaml。
 * @param {string} workspaceRoot
 * @returns {Promise<object|null>}
 */
async function readRepositoriesYaml(workspaceRoot) {
  try {
    const raw = await readFile(join(workspaceRoot, '.sdd', 'repositories.yaml'), 'utf8');
    return parse(raw);
  } catch {
    return null;
  }
}

/**
 * 读取 .sdd/version.yaml。
 * @param {string} workspaceRoot
 * @returns {Promise<object|null>}
 */
async function readVersionYaml(workspaceRoot) {
  try {
    const raw = await readFile(join(workspaceRoot, '.sdd', 'version.yaml'), 'utf8');
    return parse(raw);
  } catch {
    return null;
  }
}

/**
 * 聚合 Workspace 状态 + Change 清单。
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @returns {Promise<object>} 聚合结果：
 *   { workspace: {name, type, harnessVersion, initDate},
 *     repositories: {mode, count, repos},
 *     changes: {total, byStatus, recent} }
 */
export async function aggregateStatus(workspaceRoot) {
  const [wsYaml, reposYaml, versionYaml] = await Promise.all([
    readWorkspaceYaml(workspaceRoot),
    readRepositoriesYaml(workspaceRoot),
    readVersionYaml(workspaceRoot),
  ]);

  const ws = wsYaml?.workspace || {};
  const repos = reposYaml || {};
  const ver = versionYaml?.harness || {};

  const { changes, skipped } = await listChanges(workspaceRoot);

  // 按状态分组计数
  const byStatus = {};
  for (const c of changes) {
    byStatus[c.status] = (byStatus[c.status] || 0) + 1;
  }

  return {
    workspace: {
      name: ws.name || '(unknown)',
      type: ws.type || '(unknown)',
      initDate: ws['init-date'] || '',
      harnessVersion: ver.version || '(unknown)',
    },
    repositories: {
      mode: repos.mode || '(unknown)',
      count: Array.isArray(repos.repositories) ? repos.repositories.length : 0,
      repos: Array.isArray(repos.repositories)
        ? repos.repositories.map((r) => ({ id: r.id, path: r.path }))
        : [],
    },
    changes: {
      total: changes.length,
      skipped,
      byStatus,
      recent: changes.slice(0, 5),
    },
  };
}
