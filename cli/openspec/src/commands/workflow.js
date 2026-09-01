// Workflow Command：编排 workflow list/show/run（CLI 层）
// 对齐 phase-1.5-workflow-engine-design.md §13.2
//
// workflow run 返回 WAITING_FOR_ARTIFACT / WAITING_FOR_MACHINE_FIX / WAITING_FOR_HUMAN / ADVANCED / COMPLETED
// Persisted State + Resume 模式：每次 run 是一次性的，跑到下一个暂停点结束

import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, info } from '../lib/logger.js';
import { changeExists, listChanges } from '../../../../core/sdd/change-repository.js';
import { listWorkflows, loadWorkflow } from '../../../../core/sdd/workflow-loader.js';
import { runWorkflow } from '../../../../core/sdd/workflow-engine.js';
import { readMetadata } from '../../../../core/sdd/change-model.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';

/**
 * 注册 workflow 子命令组到 commander program。
 */
export function registerWorkflowCommand(program) {
  const workflow = program.command('workflow').description('SDD Workflow 编排（Persisted State + Resume）');

  // list：列出可用 Workflow
  workflow
    .command('list')
    .action(async () => {
      try {
        const harnessRoot = getHarnessRoot();
        const wfs = await listWorkflows(harnessRoot);
        if (wfs.length === 0) {
          note('No workflows found.', 'Workflows');
        } else {
          note(
            wfs.map((w) => `${w.id}  ${w.name}  ${w.description}`).join('\n'),
            `Workflows (${wfs.length})`
          );
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('List failed.');
        process.exit(1);
      }
    });

  // show：显示阶段序列
  workflow
    .command('show <name>')
    .action(async (name) => {
      try {
        const harnessRoot = getHarnessRoot();
        const wf = await loadWorkflow(name, harnessRoot);
        const lines = [
          `id: ${wf.id}`,
          `name: ${wf.name}`,
          `description: ${wf.description}`,
          '',
          'Stages:',
        ];
        for (const s of wf.stages) {
          lines.push(
            `  ${s['from-state']} → ${s['to-state']}  skill: ${s.skill}  artifact: ${s.artifact}  gate: ${s.gate}`
          );
        }
        note(lines.join('\n'), `Workflow: ${name}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Show failed.');
        process.exit(1);
      }
    });

  // run：从当前状态跑到下一个暂停点
  workflow
    .command('run <name>')
    .requiredOption('--change <chg>', 'Change id (CHG-XXXX)')
    .option(
      '--du <du-id>',
      '绑定 Delivery Unit（DU-<别名>-NNN）：dev/test 阶段注入 repo 侧上下文并激活 per-repo 规则段（Phase 2.7）'
    )
    .option('--json', '机器可读 JSON 输出（Agent/IDE 集成用，stdout 纯 JSON）')
    .action(async (name, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (!(await changeExists(ws, opts.change))) {
          throw new Error(`Change not found: ${opts.change}`);
        }
        // Phase 3.7：--du 仅 dev/test 阶段生效；当前不是 developing/testing 立即报错，不静默忽略
        if (opts.du) {
          const meta = await readMetadata(join(ws, 'delivery', 'changes', opts.change));
          const st = meta.status || 'created';
          if (st !== 'developing' && st !== 'testing') {
            throw new Error(
              `--du 仅在 developing/testing 阶段生效（当前状态: ${st}）。请先推进到 dev/test，或移除 --du。`
            );
          }
        }
        const harnessRoot = getHarnessRoot();
        const result = await runWorkflow(ws, opts.change, {
          workflowName: name,
          harnessRoot,
          du: opts.du,
        });

        // Phase 3.6：--json 机器可读输出（Agent 集成不再解析 stdout 文案）
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: opts.change,
                workflow: name,
                result: result.result,
                reason: result.reason,
                stage: result.stage
                  ? { skill: result.stage.skill, artifact: result.stage.artifact }
                  : null,
                instruction: result.instruction ?? null,
              },
              null,
              2
            )
          );
          return;
        }

        switch (result.result) {
          case 'WAITING_FOR_ARTIFACT':
            warn(`${opts.change}: WAITING_FOR_ARTIFACT - ${result.reason}`);
            if (result.instruction) {
              note(result.instruction, `Instruction: ${result.stage.skill} @ ${opts.change}`);
            }
            outro('External Agent 请按 Instruction 产出 Artifact 后再次 run。');
            break;
          case 'WAITING_FOR_MACHINE_FIX':
            warn(`${opts.change}: WAITING_FOR_MACHINE_FIX - ${result.reason}`);
            outro('修复 Artifact 后再次 run。');
            break;
          case 'WAITING_FOR_HUMAN':
            warn(`${opts.change}: WAITING_FOR_HUMAN - ${result.reason}`);
            outro('Run \'openspec gate approve\' 后再次 run。');
            break;
          case 'ADVANCED':
            ok(`${opts.change}: ADVANCED - ${result.reason}`);
            outro('Done.');
            break;
          case 'COMPLETED':
            ok(`${opts.change}: COMPLETED - ${result.reason}`);
            outro('Done.');
            break;
          default:
            info(`${opts.change}: ${result.result} - ${result.reason}`);
            outro('Done.');
        }
      } catch (e) {
        if (opts.json) {
          console.log(JSON.stringify({ error: e.message }, null, 2));
          process.exit(1);
        }
        error(e.message);
        outro('Workflow run failed.');
        process.exit(1);
      }
    });
}
