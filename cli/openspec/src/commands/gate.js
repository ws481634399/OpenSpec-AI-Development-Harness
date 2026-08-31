// Gate Command：编排 gate check/approve/status（CLI 层，依赖 core/sdd）
// 对齐 phase-1.5-workflow-engine-design.md §13.1
//
// gate check    跑 Machine Gate，保存结果到 metadata.yaml artifacts 段，不推进状态
// gate approve   Human Gate 确认（@clack 交互），保存结果，不推进状态
// gate status    查看 Artifact/Machine/Human/Hash 状态

import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import * as p from '@clack/prompts';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { changeExists } from '../../../../core/sdd/change-repository.js';
import { loadGate } from '../../../../core/sdd/gate-config-loader.js';
import { runMachineGate } from '../../../../core/sdd/gate-validator.js';
import { writeMachineGate, writeHumanGate, readGateResult } from '../../../../core/sdd/gate-repository.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';

const VALID_STAGES = ['explore', 'prd', 'design', 'task', 'dev', 'test', 'converge'];

function stageToSkillId(stage) {
  return `sdd-${stage}`;
}

function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/**
 * 注册 gate 子命令组到 commander program。
 */
export function registerGateCommand(program) {
  const gate = program.command('gate').description('SDD Gate 操作（机门禁校验 / 人门禁审批）');

  // check：跑 Machine Gate，保存结果，不推进状态
  gate
    .command('check <id>')
    .requiredOption('--stage <stage>', `Skill 阶段（${VALID_STAGES.join(' / ')}）`)
    .option('--json', '机器可读 JSON 输出（Agent/IDE 集成用，stdout 纯 JSON）')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (!VALID_STAGES.includes(opts.stage)) {
          throw new Error(`Invalid stage: ${opts.stage}. Valid: ${VALID_STAGES.join(', ')}.`);
        }
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const harnessRoot = getHarnessRoot();
        const skillId = stageToSkillId(opts.stage);
        const gateConfig = await loadGate(skillId, harnessRoot);
        const changeDir = join(ws, 'delivery', 'changes', id);

        const result = await runMachineGate(changeDir, gateConfig);
        await writeMachineGate(changeDir, gateConfig.artifact, {
          status: result.passed ? 'passed' : 'failed',
          issues: result.issues,
          artifactHash: result.artifactHash,
          validator: skillId,
        });

        // Phase 3.6：--json 机器可读输出
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: id,
                stage: opts.stage,
                artifact: gateConfig.artifact,
                passed: result.passed,
                issues: result.issues,
                artifactHash: result.artifactHash,
              },
              null,
              2
            )
          );
          if (!result.passed) process.exit(1);
          return;
        }

        if (result.passed) {
          ok(`Machine gate passed for ${id}/${opts.stage} (artifact: ${gateConfig.artifact})`);
          ok(`Hash: ${result.artifactHash}`);
          outro('Done. Run \'openspec gate approve\' for Human Gate.');
        } else {
          warn(`Machine gate failed for ${id}/${opts.stage}:`);
          for (const issue of result.issues) {
            warn(`  - ${issue}`);
          }
          outro('Machine fix required.');
          process.exit(1);
        }
      } catch (e) {
        if (opts.json) {
          console.log(JSON.stringify({ error: e.message }, null, 2));
          process.exit(1);
        }
        error(e.message);
        outro('Gate check failed.');
        process.exit(1);
      }
    });

  // approve：Human Gate 确认，保存结果，不推进状态
  gate
    .command('approve <id>')
    .requiredOption('--stage <stage>', `Skill 阶段（${VALID_STAGES.join(' / ')}）`)
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (!VALID_STAGES.includes(opts.stage)) {
          throw new Error(`Invalid stage: ${opts.stage}. Valid: ${VALID_STAGES.join(', ')}.`);
        }
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const harnessRoot = getHarnessRoot();
        const skillId = stageToSkillId(opts.stage);
        const gateConfig = await loadGate(skillId, harnessRoot);
        const changeDir = join(ws, 'delivery', 'changes', id);
        const artifactName = gateConfig.artifact;

        // 检查 Machine Gate 是否 passed
        const gateResult = await readGateResult(changeDir, artifactName);
        if (gateResult.gates.machine.status !== 'passed') {
          throw new Error(
            `Machine gate not passed (status: ${gateResult.gates.machine.status}). Run 'openspec gate check ${id} --stage ${opts.stage}' first.`
          );
        }

        // @clack 交互：展示 human-checks 段落，请求确认
        const lines = [
          `Change: ${id}`,
          `Stage: ${opts.stage}`,
          `Artifact: ${artifactName}`,
          '',
          '请 review 以下段落（来自 gate.yaml human-checks）:',
        ];
        for (const section of gateConfig['human-checks'] || []) {
          lines.push(`  - ${section}`);
        }
        note(lines.join('\n'), `Human Gate: ${id}/${opts.stage}`);

        const ce = await p.confirm({
          message: `批准 ${id}/${opts.stage} 的 Human Gate？`,
          active: 'Approve',
          inactive: 'Reject',
          initialValue: false,
        });
        if (p.isCancel(ce)) bail('已取消');

        const status = ce ? 'approved' : 'rejected';
        // Human Gate 绑定 Machine 校验时的 hash（hash 一致才有效）
        await writeHumanGate(changeDir, artifactName, {
          status,
          artifactHash: gateResult.gates.machine['artifact-hash'],
        });

        ok(`Human gate ${status} for ${id}/${opts.stage}`);
        if (status === 'approved') {
          outro('Done. Run \'openspec change status --set <next-state>\' or \'openspec workflow run\' to advance.');
        } else {
          outro('Rejected.');
        }
      } catch (e) {
        error(e.message);
        outro('Gate approve failed.');
        process.exit(1);
      }
    });

  // status：查看 Gate 状态
  gate
    .command('status <id>')
    .requiredOption('--stage <stage>', `Skill 阶段（${VALID_STAGES.join(' / ')}）`)
    .option('--json', '机器可读 JSON 输出（Agent/IDE 集成用，stdout 纯 JSON）')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (!VALID_STAGES.includes(opts.stage)) {
          throw new Error(`Invalid stage: ${opts.stage}. Valid: ${VALID_STAGES.join(', ')}.`);
        }
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const harnessRoot = getHarnessRoot();
        const skillId = stageToSkillId(opts.stage);
        const gateConfig = await loadGate(skillId, harnessRoot);
        const changeDir = join(ws, 'delivery', 'changes', id);
        const artifactName = gateConfig.artifact;
        const gateResult = await readGateResult(changeDir, artifactName);

        // Phase 3.6：--json 机器可读输出
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: id,
                stage: opts.stage,
                artifact: artifactName,
                artifactStatus: gateResult.status,
                machine: gateResult.gates.machine,
                human: gateResult.gates.human,
              },
              null,
              2
            )
          );
          return;
        }

        const lines = [
          `Artifact: ${artifactName}`,
          `Artifact Status: ${gateResult.status}`,
          '',
          'Machine Gate:',
          `  status: ${gateResult.gates.machine.status}`,
          `  hash: ${gateResult.gates.machine['artifact-hash'] || '-'}`,
          `  checked-at: ${gateResult.gates.machine['checked-at'] || '-'}`,
          `  validator: ${gateResult.gates.machine.validator || '-'}`,
        ];
        if (gateResult.gates.machine.issues && gateResult.gates.machine.issues.length > 0) {
          lines.push('  issues:');
          for (const iss of gateResult.gates.machine.issues) {
            lines.push(`    - ${iss}`);
          }
        }
        lines.push(
          '',
          'Human Gate:',
          `  status: ${gateResult.gates.human.status}`,
          `  hash: ${gateResult.gates.human['artifact-hash'] || '-'}`,
          `  reviewed-at: ${gateResult.gates.human['reviewed-at'] || '-'}`
        );
        note(lines.join('\n'), `${id}/${opts.stage} gate status`);
        outro('Done.');
      } catch (e) {
        if (opts.json) {
          console.log(JSON.stringify({ error: e.message }, null, 2));
          process.exit(1);
        }
        error(e.message);
        outro('Gate status failed.');
        process.exit(1);
      }
    });
}
