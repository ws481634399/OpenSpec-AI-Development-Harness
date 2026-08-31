// DU Command：Delivery Unit 管理操作（Phase 2.4 plans/phase-2.4-multi-repository-delivery-design.md §22）
// du list / du show / du materialize / du sync-status
//
// 边界：
// - materialize 前置校验 tasks.md Machine Gate passed + Human Gate approved + hash 一致（不经 Transition Service）
// - DU 轻量状态是记录字段；本命令组不触碰 CHG status（状态推进唯一走 change status --set）
// - sync-status 用 resolveSubmoduleHead 纯文件解析 HEAD；dirty 检测执行 git status（只读）

import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import {
  readWorkspaceDus,
  aggregateDuStatus,
  materializeDeliveryUnit,
  syncDuCommits,
  readRepositories,
  writeWorkspaceDu,
} from '../../../../core/sdd/delivery-unit.js';
import { readMetadata } from '../../../../core/sdd/change-model.js';
import { resolveArtifactPath } from '../../../../core/sdd/artifact-path.js';
import { readGateResult } from '../../../../core/sdd/gate-repository.js';
import { sha256 } from '../../../../core/sdd/artifact-hash.js';
import { resolveSubmoduleHead } from '../../../../core/sdd/git-submodule.js';

const execFileAsync = promisify(execFile);

/** 校验 tasks.md Gate 已 accepted（machine passed + human approved + hash 一致），返回 artifactPath。 */
async function ensureTasksAccepted(changeDir, meta, duId) {
  const artifactPath = resolveArtifactPath(changeDir, 'tasks.md', meta);
  let content;
  try {
    content = await readFile(artifactPath, 'utf8');
  } catch {
    throw new Error(`tasks.md not found: ${artifactPath}（feature-path 未绑定或 task 阶段未产出）`);
  }
  const currentHash = sha256(content);
  const gateResult = await readGateResult(changeDir, 'tasks.md');
  if (gateResult.gates.machine.status !== 'passed') {
    throw new Error(`tasks.md Machine Gate not passed (${gateResult.gates.machine.status})，无法物化 ${duId}`);
  }
  if (gateResult.gates.machine['artifact-hash'] !== currentHash) {
    throw new Error('tasks.md hash 与 Machine Gate 记录不一致（Artifact 已变更，Gate Result 已失效）');
  }
  if (gateResult.gates.human.status !== 'approved') {
    throw new Error(`tasks.md Human Gate not approved (${gateResult.gates.human.status})，无法物化 ${duId}`);
  }
  if (gateResult.gates.human['artifact-hash'] !== currentHash) {
    throw new Error('tasks.md hash 与 Human Gate 记录不一致');
  }
  return artifactPath;
}

export function registerDuCommand(program) {
  const du = program.command('du').description('Delivery Unit 管理操作（多仓交付单元）');

  // du create <chg>：注册 Workspace DU 协调记录（sdd-task 阶段 Agent 调用，Phase 2.4 §10.2）
  du
    .command('create <change-id>')
    .requiredOption('--id <du-id>', 'DU ID（DU-<REPO别名>-NNN，如 DU-BE-001）')
    .requiredOption('--repository <repo-id>', '所属仓库 id（对应 .sdd/repositories.yaml）')
    .option('--scope <items>', '交付范围（逗号分隔）')
    .option('--dependencies <ids>', '依赖的 DU id（逗号分隔）')
    .option('--acceptance <items>', '验收标准（分号分隔）')
    .option(
      '--pseudocode <bool>',
      '是否要求 Pseudocode（true/false，Phase 2.5；缺省由 complexity 联动判定）',
    )
    .option(
      '--complexity <triggers>',
      '复杂度触发器（逗号分隔：business-flow/algorithm/state-transition/orchestration；命中任一则 Pseudocode 必填）',
    )
    .description('注册 Workspace DU 协调记录（sdd-task 产出；Task Gate accepted 后用 materialize 物化）')
    .action(async (changeId, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', changeId);
        const meta = await readMetadata(changeDir);
        // Phase 2.5 §4.4：--complexity 命中任一 → pseudocode 自动置 true（显式 false 覆盖并告警）
        const triggers = opts.complexity
          ? opts.complexity.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
        const explicit = typeof opts.pseudocode === 'string' ? opts.pseudocode.trim().toLowerCase() : undefined;
        const pseudocode = explicit === undefined ? undefined : explicit === 'true';
        if (explicit === 'false' && triggers.length > 0) {
          warn('--pseudocode false 与 --complexity 同时给出：以 --pseudocode false 为准（Pseudocode 不要求，但 trigger 保留记录）。');
        }
        const result = await writeWorkspaceDu(changeDir, meta, {
          id: opts.id,
          repository: opts.repository,
          scope: opts.scope ? opts.scope.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
          dependencies: opts.dependencies
            ? opts.dependencies.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
          acceptance: opts.acceptance
            ? opts.acceptance.split(';').map((s) => s.trim()).filter(Boolean)
            : undefined,
          pseudocode,
          complexityTrigger: triggers,
        });
        ok(`${opts.id} registered (Workspace DU)`);
        note(`Dir: ${result.dir}`, changeId);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('DU create failed.');
        process.exit(1);
      }
    });

  // du list <chg>
  du
    .command('list <change-id>')
    .option('--repo <id>', '按仓库过滤')
    .option('--json', '机器可读 JSON 输出（Agent/IDE 集成用，stdout 纯 JSON）')
    .description('列出 CHG 的全部 DU 与聚合状态')
    .action(async (changeId, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', changeId);
        const meta = await readMetadata(changeDir);
        const agg = await aggregateDuStatus(changeDir, ws);
        let items = agg.dus;
        if (opts.repo) items = items.filter((d) => d.repository === opts.repo);

        // Phase 3.6：--json 机器可读输出
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: changeId,
                dus: items.map((d) => ({
                  id: d.id,
                  repository: d.repository,
                  status: d.status,
                  materialized: d.materialized,
                  repositoryValid: d.repositoryValid,
                })),
                total: items.length,
                allMaterialized: agg.allMaterialized,
                allTesting: agg.allTesting,
                allCompleted: agg.allCompleted,
              },
              null,
              2
            )
          );
          return;
        }

        if (items.length === 0) {
          note('No Delivery Units found.（DU 由 sdd-task 在 task 阶段创建）', changeId);
        } else {
          const lines = items.map(
            (d) =>
              `${d.id}  repo: ${d.repository}  status: ${d.status}  materialized: ${d.materialized ? 'yes' : 'no'}` +
              `${d.repositoryValid ? '' : '  (repository 未注册!)'}`
          );
          lines.push(
            '',
            `total: ${agg.total}  allMaterialized: ${agg.allMaterialized}  allTesting: ${agg.allTesting}  allCompleted: ${agg.allCompleted}`
          );
          note(lines.join('\n'), `Delivery Units (${items.length})`);
        }
        outro('Done.');
      } catch (e) {
        if (opts.json) {
          console.log(JSON.stringify({ error: e.message }, null, 2));
          process.exit(1);
        }
        error(e.message);
        outro('DU list failed.');
        process.exit(1);
      }
    });

  // du show <chg> <du-id>
  du
    .command('show <change-id> <du-id>')
    .description('查看单个 DU 的协调记录')
    .action(async (changeId, duId) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', changeId);
        const meta = await readMetadata(changeDir);
        const dus = await readWorkspaceDus(changeDir, meta);
        const target = dus.find((d) => d.id === duId);
        if (!target) throw new Error(`DU not found: ${duId}`);
        const m = target.metadata;
        const lines = [
          `id: ${m.id || duId}`,
          `repository: ${m.repository || ''}`,
          `parent.change: ${m.parent?.change || ''}`,
          `status: ${m.status || 'pending'}`,
          `scope: ${(m.scope || []).join(', ')}`,
          `dependencies: ${(m.dependencies || []).join(', ') || '(none)'}`,
          `acceptance: ${(m.acceptance || []).join('; ')}`,
          // Phase 2.5 §4.4：implementation-guidance 声明输出
          `implementation-guidance: sketch=${m['implementation-guidance']?.sketch !== false}` +
            ` pseudocode=${m['implementation-guidance']?.pseudocode === true}` +
            ` complexity-trigger=[${(m['implementation-guidance']?.['complexity-trigger'] || []).join(', ')}]`,
          `repository-delivery.path: ${m['repository-delivery']?.path || '(not materialized)'}`,
          `baseline: ${m.baseline?.commit || ''}`,
          `result: ${m.result?.commit || ''}`,
          `evidence-ref: ${(m['evidence-ref'] || []).length} item(s)`,
        ];
        note(lines.join('\n'), `${duId} @ ${changeId}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('DU show failed.');
        process.exit(1);
      }
    });

  // du materialize <chg> <du-id>
  du
    .command('materialize <change-id> <du-id>')
    .description('Task Gate accepted 后将 DU 物化到对应仓库（原子操作）')
    .action(async (changeId, duId) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', changeId);
        const meta = await readMetadata(changeDir);
        await ensureTasksAccepted(changeDir, meta, duId);
        const result = await materializeDeliveryUnit(ws, changeId, duId);
        ok(`${duId} materialized to ${result.repoPath}`);
        note(`Repo dir: ${result.repoDir}`, changeId);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('DU materialize failed.');
        process.exit(1);
      }
    });

  // du sync-status <chg>
  du
    .command('sync-status <change-id>')
    .option('--json', '机器可读 JSON 输出（Agent/IDE 集成用，stdout 纯 JSON）')
    .description('读取各仓 HEAD 刷新 DU baseline/result 与 CHG 聚合段；报告 dirty 仓库')
    .action(async (changeId, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', changeId);
        const meta = await readMetadata(changeDir);
        const dus = await readWorkspaceDus(changeDir, meta);
        if (dus.length === 0) throw new Error(`No Delivery Units in ${changeId}`);
        const repos = await readRepositories(ws);

        const heads = {};
        const dirty = [];
        let gitAvailable = true;
        for (const repo of repos) {
          const head = await resolveSubmoduleHead(ws, repo.path);
          if (head) heads[repo.id] = head;
          // dirty 检测（git status --porcelain，只读；非 git 仓/git 不可用则跳过）
          try {
            const { stdout } = await execFileAsync('git', ['status', '--porcelain'], { cwd: join(ws, repo.path) });
            if (String(stdout).trim()) dirty.push(repo.id);
          } catch (e) {
            if (/ENOENT/.test(String(e.message))) gitAvailable = false;
          }
        }
        if (!gitAvailable) warn('git command unavailable, skip dirty check.');

        const results = await syncDuCommits(ws, changeId, heads);

        // Phase 3.6：--json 机器可读输出
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: changeId,
                syncs: results,
                dirty,
                gitAvailable,
              },
              null,
              2
            )
          );
          return;
        }

        const lines = results.map((r) => `${r.duId}  repo: ${r.repository}  sync: ${r.updated}`);
        if (dirty.length) {
          lines.push('', `dirty repositories（未提交变更，commit 后重跑）: ${dirty.join(', ')}`);
          warn(`Dirty repositories: ${dirty.join(', ')}`);
        }
        note(lines.join('\n'), `${changeId} DU sync`);
        outro('Done.');
      } catch (e) {
        if (opts.json) {
          console.log(JSON.stringify({ error: e.message }, null, 2));
          process.exit(1);
        }
        error(e.message);
        outro('DU sync-status failed.');
        process.exit(1);
      }
    });
}
