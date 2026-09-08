// Approve Command：一键人审（交互式待审批项扫描 + 审批 + 自动续跑 workflow）
//
// 解决痛点：人审需手敲长命令（gate approve <id> --stage <stage> [--story <sid>] --reviewer <name> -y）
// 且审批后还要再手动 workflow run 续跑。本命令：
//   1. 自动扫描待审批项（review-queue.listPendingReviews，与 Engine WAITING_FOR_HUMAN 同构）
//   2. 交互展示待审段落（gate.yaml human-checks）+ 机检 warnings，逐项确认
//   3. 审批写入 Human Gate（不直接推进生命周期，状态推进仍由 Workflow Engine 执行）
//   4. 自动 workflow run 续跑到下一个暂停点；若又停在 WAITING_FOR_HUMAN（如下一阶段产物已就绪）
//      则回到步骤 1 继续，直到无待审批项
//
// 非交互（Agent/CI）：openspec approve [id] --yes --reviewer <name> [--json]
// 审计约束与 gate approve 一致：--yes 必须与 --reviewer 同用。

import { Command } from 'commander';
import * as p from '@clack/prompts';
import { outro, note } from '@clack/prompts';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, info } from '../lib/logger.js';
import { listChanges, changeExists } from '../../../../core/sdd/change-repository.js';
import { listPendingReviews } from '../../../../core/sdd/review-queue.js';
import { writeHumanGate, writeHumanGateForStory } from '../../../../core/sdd/gate-repository.js';
import { readMetadata } from '../../../../core/sdd/change-model.js';
import { runWorkflow, WORKFLOW_RESULT } from '../../../../core/sdd/workflow-engine.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';

// 自动续跑循环上限（防异常状态下死循环；正常流程每轮至少推进一个 gate/状态）
const MAX_CONTINUE_ITERATIONS = 20;

function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/** 读取 git 配置的用户名作为审批人默认值（失败回空串，交互时再输入）。 */
function defaultReviewer(workspaceRoot) {
  try {
    return execFileSync('git', ['config', 'user.name'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function itemLabel(item) {
  return item.kind === 'story'
    ? `${item.storyId} / ${item.gate}（${item.artifact}）`
    : `${item.gate}（${item.artifact}）`;
}

/**
 * 写入一项 Human Gate 审批结果（change 级 / story 级分发）。
 */
async function approveItem(workspaceRoot, changeId, item, reviewer, status) {
  const changeDir = join(workspaceRoot, 'delivery', 'changes', changeId);
  if (item.kind === 'story') {
    const meta = await readMetadata(changeDir);
    await writeHumanGateForStory(changeDir, meta, item.storyId, item.artifact, {
      status,
      reviewer,
      artifactHash: item.machineHash,
    });
  } else {
    await writeHumanGate(changeDir, item.artifact, {
      status,
      reviewer,
      artifactHash: item.machineHash,
    });
  }
}

/**
 * 注册 approve 命令到 commander program。
 */
export function registerApproveCommand(program) {
  program
    .command('approve [id]')
    .description('一键人审：扫描待审批项 → 交互确认 → 自动续跑 workflow（免记 --stage/--story 参数）')
    .option('--reviewer <name>', '审批人（显式传入时进入非交互模式，用于 Agent/CI）')
    .option('-y, --yes', '跳过交互确认直接批准全部待审批项（必须与 --reviewer 同用，保证审批人可审计）')
    .option('--json', '机器可读 JSON 输出（Agent/IDE 集成用，stdout 纯 JSON）')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      const harnessRoot = getHarnessRoot();
      try {
        if (opts.yes && !opts.reviewer) {
          throw new Error('--yes 必须与 --reviewer 同用（审批人必须可审计）。');
        }
        const nonInteractive = Boolean(opts.yes || opts.reviewer);
        const reviewer = opts.reviewer ? String(opts.reviewer).trim() : '';

        // ---- 1. 定位目标 Change（无 id 时扫描全部，交互式可选择）----
        let changeId = id;
        if (changeId) {
          if (!(await changeExists(ws, changeId))) {
            throw new Error(`Change not found: ${changeId}`);
          }
        } else {
          const { changes } = await listChanges(ws);
          const candidates = [];
          for (const c of changes) {
            if (c.status === 'completed' || c.status === 'archived') continue;
            const items = await listPendingReviews(ws, c.id, { harnessRoot });
            if (items.length > 0) candidates.push({ change: c, items });
          }
          if (opts.json) {
            console.log(
              JSON.stringify(
                {
                  pending: candidates.map((c) => ({
                    change: c.change.id,
                    title: c.change.title,
                    items: c.items.map((i) => ({
                      kind: i.kind,
                      gate: i.gate,
                      artifact: i.artifact,
                      ...(i.storyId ? { story: i.storyId } : {}),
                      humanStatus: i.humanStatus,
                      stale: i.stale,
                      warnings: i.warnings.length,
                    })),
                  })),
                },
                null,
                2
              )
            );
            return;
          }
          if (candidates.length === 0) {
            info('当前没有待审批项（没有机检通过、待人审的产物）。');
            outro("可运行 'openspec workflow run default --change <CHG>' 推进到下一暂停点。");
            return;
          }
          if (candidates.length === 1) {
            changeId = candidates[0].change.id;
          } else {
            const choice = await p.select({
              message: '多个 Change 有待审批项，选择要审批的 Change:',
              options: candidates.map((c) => ({
                value: c.change.id,
                label: `${c.change.id}  ${c.change.title || ''}（${c.items.length} 项待审）`,
              })),
            });
            if (p.isCancel(choice)) bail('已取消');
            changeId = choice;
          }
        }

        // ---- 2. 审批 + 续跑循环 ----
        const approved = [];
        const rejected = [];
        let finalRun = null;

        for (let iter = 0; iter < MAX_CONTINUE_ITERATIONS; iter++) {
          const pending = await listPendingReviews(ws, changeId, { harnessRoot });

          if (pending.length === 0) {
            // 无待审批项 → 续跑 workflow，推进到下一暂停点
            const r = await runWorkflow(ws, changeId, { harnessRoot });
            finalRun = r;
            if (r.result === WORKFLOW_RESULT.WAITING_FOR_HUMAN) {
              // 下一阶段产物已就绪且机检通过（如连续阶段产物已提前产出）→ 继续审批循环
              continue;
            }
            break;
          }

          // 有待审批项 → 逐项审批
          let interactiveReviewer = reviewer;
          if (!nonInteractive) {
            const def = defaultReviewer(ws);
            const input = await p.text({
              message: '审批人（reviewer，用于审计留痕）',
              initialValue: def || 'user',
              validate: (v) => (v && v.trim() ? undefined : '审批人不能为空'),
            });
            if (p.isCancel(input)) bail('已取消');
            interactiveReviewer = String(input).trim();
          }

          for (const item of pending) {
            if (nonInteractive) {
              // --yes/--reviewer：全部批准（人审决策由调用方在外部完成，Agent 场景下用户已在对话中确认）
              await approveItem(ws, changeId, item, interactiveReviewer, 'approved');
              approved.push(item);
              continue;
            }
            const lines = [
              `Change: ${changeId}`,
              ...(item.kind === 'story' ? [`Story: ${item.storyId}${item.storyTitle ? `（${item.storyTitle}）` : ''}`] : []),
              `Stage: ${item.gate}    Artifact: ${item.artifact}`,
              `Machine gate: passed${item.stale ? '（注意：产物在审批后被改动过，本次为重新审批）' : ''}`,
            ];
            if (item.humanChecks.length > 0) {
              lines.push('', '请 review 以下段落（gate.yaml human-checks）:');
              for (const section of item.humanChecks) lines.push(`  - ${section}`);
            }
            if (item.warnings.length > 0) {
              lines.push('', `Advisory warnings（${item.warnings.length}，不阻断）:`);
              for (const w of item.warnings.slice(0, 10)) lines.push(`  - ${w}`);
            }
            note(lines.join('\n'), `待审批: ${itemLabel(item)}`);

            const ce = await p.confirm({
              message: `批准 ${itemLabel(item)} 的 Human Gate？`,
              active: 'Approve',
              inactive: 'Reject',
              initialValue: false,
            });
            if (p.isCancel(ce)) bail('已取消');
            if (ce) {
              await approveItem(ws, changeId, item, interactiveReviewer, 'approved');
              approved.push(item);
              ok(`已批准: ${itemLabel(item)}（reviewer: ${interactiveReviewer}）`);
            } else {
              await approveItem(ws, changeId, item, interactiveReviewer, 'rejected');
              rejected.push(item);
              warn(`已拒绝: ${itemLabel(item)}（Change 不会推进，修复后重新运行 approve）`);
            }
          }

          if (rejected.length > 0) break;

          // 本批审批完成 → 续跑 workflow
          const r = await runWorkflow(ws, changeId, { harnessRoot });
          finalRun = r;
          if (r.result !== WORKFLOW_RESULT.WAITING_FOR_HUMAN) break;
          // 又停在人审 → 循环继续扫描新待审批项
        }

        // ---- 3. 输出结果 ----
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: changeId,
                approved: approved.map((i) => ({
                  kind: i.kind,
                  gate: i.gate,
                  artifact: i.artifact,
                  ...(i.storyId ? { story: i.storyId } : {}),
                })),
                rejected: rejected.map((i) => ({
                  kind: i.kind,
                  gate: i.gate,
                  artifact: i.artifact,
                  ...(i.storyId ? { story: i.storyId } : {}),
                })),
                workflow: finalRun
                  ? {
                      result: finalRun.result,
                      reason: finalRun.reason,
                      ...(finalRun.story ? { story: finalRun.story } : {}),
                      ...(finalRun.stage ? { stage: { skill: finalRun.stage.skill, artifact: finalRun.stage.artifact } } : {}),
                      instruction: finalRun.instruction ?? null,
                    }
                  : null,
              },
              null,
              2
            )
          );
          if (rejected.length > 0) process.exit(1);
          return;
        }

        if (approved.length > 0) {
          ok(`审批完成：${approved.length} 项 approved${rejected.length > 0 ? `，${rejected.length} 项 rejected` : ''}`);
        }
        if (finalRun) {
          switch (finalRun.result) {
            case WORKFLOW_RESULT.WAITING_FOR_ARTIFACT:
              warn(`${changeId}: WAITING_FOR_ARTIFACT - ${finalRun.reason}`);
              if (finalRun.instruction) {
                note(finalRun.instruction, `Instruction: ${finalRun.stage?.skill || ''} @ ${changeId}`);
              }
              outro('External Agent 请按 Instruction 产出 Artifact 后，再次运行 openspec approve。');
              break;
            case WORKFLOW_RESULT.WAITING_FOR_MACHINE_FIX:
              warn(`${changeId}: WAITING_FOR_MACHINE_FIX - ${finalRun.reason}`);
              outro('修复 Artifact 后，再次运行 openspec approve。');
              break;
            case WORKFLOW_RESULT.COMPLETED:
              ok(`${changeId}: COMPLETED - ${finalRun.reason}`);
              outro('Done.');
              break;
            case WORKFLOW_RESULT.ADVANCED:
              ok(`${changeId}: ADVANCED - ${finalRun.reason}`);
              outro('Done.');
              break;
            case WORKFLOW_RESULT.WAITING_FOR_HUMAN:
              warn(`${changeId}: WAITING_FOR_HUMAN - ${finalRun.reason}`);
              outro('再次运行 openspec approve 继续审批。');
              break;
            default:
              info(`${changeId}: ${finalRun.result} - ${finalRun.reason}`);
              outro('Done.');
          }
        } else {
          outro('Done.');
        }
      } catch (e) {
        if (opts.json) {
          console.log(JSON.stringify({ error: e.message }, null, 2));
          process.exit(1);
        }
        error(e.message);
        outro('Approve failed.');
        process.exit(1);
      }
    });
}
