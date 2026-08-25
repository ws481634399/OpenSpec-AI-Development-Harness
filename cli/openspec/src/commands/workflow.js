// Workflow Command：编排 workflow list/show/run（CLI 层）
// 对齐 phase-1.5-workflow-engine-design.md §13.2
//
// workflow run 返回 WAITING_FOR_ARTIFACT / WAITING_FOR_MACHINE_FIX / WAITING_FOR_HUMAN / ADVANCED / COMPLETED
// Persisted State + Resume 模式：每次 run 是一次性的，跑到下一个暂停点结束

import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error, info } from '../lib/logger.js';
import { changeExists } from '../../../../core/sdd/change-repository.js';
import { listWorkflows, loadWorkflow } from '../../../../core/sdd/workflow-loader.js';
import { runWorkflow } from '../../../../core/sdd/workflow-engine.js';
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
    .action(async (name, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (!(await changeExists(ws, opts.change))) {
          throw new Error(`Change not found: ${opts.change}`);
        }
        const harnessRoot = getHarnessRoot();
        const result = await runWorkflow(ws, opts.change, {
          workflowName: name,
          harnessRoot,
        });

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
        error(e.message);
        outro('Workflow run failed.');
        process.exit(1);
      }
    });
}
