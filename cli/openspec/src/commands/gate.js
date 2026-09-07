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
import { loadGate, loadGateRaw } from '../../../../core/sdd/gate-config-loader.js';
import { runMachineGate } from '../../../../core/sdd/gate-validator.js';
import {
  writeMachineGate,
  writeHumanGate,
  readGateResult,
  readGateResultForStory,
  writeMachineGateForStory,
  writeHumanGateForStory,
} from '../../../../core/sdd/gate-repository.js';
import { readMetadata } from '../../../../core/sdd/change-model.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';

// 缺陷 1.4 配套：补 'review'（Phase 2.2 同态检查点阶段此前遗漏，导致 review 阶段无法 gate check/approve）
const VALID_STAGES = ['explore', 'prd', 'design', 'task', 'dev', 'test', 'review', 'converge'];

function stageToSkillId(stage) {
  return `sdd-${stage}`;
}

/**
 * Phase 4.2：按 --story 解析 artifact 名与 Gate 读写入口。
 * 有 storyId → three-tier.story-artifact + ForStory 分发（stories/<id>/story-metadata.yaml）；
 * 无 → Change 级 artifact + metadata.yaml。
 */
async function resolveGateTarget(changeDir, gateConfig, storyId) {
  if (!storyId) {
    return {
      artifactName: gateConfig.artifact,
      readResult: () => readGateResult(changeDir, gateConfig.artifact),
      writeMachine: (input) => writeMachineGate(changeDir, gateConfig.artifact, input),
      writeHuman: (input) => writeHumanGate(changeDir, gateConfig.artifact, input),
    };
  }
  const tt = gateConfig['three-tier'] || {};
  if (!tt['story-artifact']) {
    throw new Error(`Skill ${gateConfig.stage || ''} 未配置 three-tier.story-artifact，不支持 --story。`);
  }
  const meta = await readMetadata(changeDir);
  const artifactName = tt['story-artifact'];
  return {
    artifactName,
    readResult: () => readGateResultForStory(changeDir, meta, storyId, artifactName),
    writeMachine: (input) => writeMachineGateForStory(changeDir, meta, storyId, artifactName, input),
    writeHuman: (input) => writeHumanGateForStory(changeDir, meta, storyId, artifactName, input),
  };
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
    .option('--story <story-id>', 'Story 级机检（Phase 4.2：检查项限定该 Story 的 artifact/DU/Evidence）')
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
        const target = await resolveGateTarget(changeDir, gateConfig, opts.story);

        const gateOpts = {};
        if (opts.story) {
          const meta = await readMetadata(changeDir);
          gateOpts.metadata = meta;
          gateOpts.storyId = opts.story;
        }
        gateOpts.gateYamlRaw = await loadGateRaw(skillId, harnessRoot);
        const result = await runMachineGate(changeDir, gateConfig, gateOpts);
        await target.writeMachine({
          status: result.passed ? 'passed' : 'failed',
          issues: result.issues,
          warnings: result.warnings,
          artifactHash: result.artifactHash,
          rulesHash: result.rulesHash,
          validator: skillId,
        });

        // Phase 3.6：--json 机器可读输出
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: id,
                stage: opts.stage,
                ...(opts.story ? { story: opts.story } : {}),
                artifact: target.artifactName,
                passed: result.passed,
                issues: result.issues,
                warnings: result.warnings,
                artifactHash: result.artifactHash,
                rulesHash: result.rulesHash,
              },
              null,
              2
            )
          );
          if (!result.passed) process.exit(1);
          return;
        }

        if (result.passed) {
          ok(
            `Machine gate passed for ${id}/${opts.stage}${opts.story ? ` @ story ${opts.story}` : ''} (artifact: ${target.artifactName})`
          );
          ok(`Hash: ${result.artifactHash}`);
          // Phase 4.1：advisory 未过项（warnings）留痕展示，不阻断
          if (result.warnings && result.warnings.length > 0) {
            warn(`Advisory warnings (${result.warnings.length}):`);
            for (const w of result.warnings) {
              warn(`  - ${w}`);
            }
          }
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
    .option('--story <story-id>', 'Story 级人审（Phase 4.2：story-spec 人审 required，审批写入 stories/<id>/story-metadata.yaml）')
    // 缺陷 1.4 修复：审批人可显式传入（此前只能交互确认，CI/沙箱无法完整写入审批信息）
    .option('--reviewer <name>', '审批人（显式传入时跳过交互确认，用于 CI/非交互环境）')
    .option('-y, --yes', '跳过交互确认直接批准（必须与 --reviewer 同用，保证审批人可审计）')
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
        const target = await resolveGateTarget(changeDir, gateConfig, opts.story);
        const artifactName = target.artifactName;

        // 检查 Machine Gate 是否 passed
        const gateResult = await target.readResult();
        if (gateResult.gates.machine.status !== 'passed') {
          throw new Error(
            `Machine gate not passed (status: ${gateResult.gates.machine.status}). Run 'openspec gate check ${id} --stage ${opts.stage}${opts.story ? ` --story ${opts.story}` : ''}' first.`
          );
        }

        let status;
        let reviewer = '';
        if (opts.yes || opts.reviewer) {
          // 非交互批准：--reviewer 显式记录审批人（可审计）；--yes 单独给出时报错防止匿名批准
          if (opts.yes && !opts.reviewer) {
            throw new Error('--yes 必须与 --reviewer 同用（审批人必须可审计）。');
          }
          reviewer = String(opts.reviewer).trim();
          status = 'approved';
        } else {
          // @clack 交互：展示 human-checks 段落，请求确认
          const lines = [
            `Change: ${id}`,
            ...(opts.story ? [`Story: ${opts.story}`] : []),
            `Stage: ${opts.stage}`,
            `Artifact: ${artifactName}`,
            '',
            '请 review 以下段落（来自 gate.yaml human-checks）:',
          ];
          for (const section of gateConfig['human-checks'] || []) {
            lines.push(`  - ${section}`);
          }
          note(lines.join('\n'), `Human Gate: ${id}/${opts.stage}${opts.story ? ` @ ${opts.story}` : ''}`);

          const ce = await p.confirm({
            message: `批准 ${id}/${opts.stage}${opts.story ? ` @ story ${opts.story}` : ''} 的 Human Gate？`,
            active: 'Approve',
            inactive: 'Reject',
            initialValue: false,
          });
          if (p.isCancel(ce)) bail('已取消');
          status = ce ? 'approved' : 'rejected';
          reviewer = 'user';
        }

        // Human Gate 绑定 Machine 校验时的 hash（hash 一致才有效）
        await target.writeHuman({
          status,
          reviewer,
          artifactHash: gateResult.gates.machine['artifact-hash'],
        });

        ok(
          `Human gate ${status} for ${id}/${opts.stage}${opts.story ? ` @ story ${opts.story}` : ''} (reviewer: ${reviewer || '-'})`
        );
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
    .option('--story <story-id>', '查看 Story 级 Gate 状态（Phase 4.2）')
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
        const target = await resolveGateTarget(changeDir, gateConfig, opts.story);
        const artifactName = target.artifactName;
        const gateResult = await target.readResult();

        // Phase 3.6：--json 机器可读输出
        if (opts.json) {
          console.log(
            JSON.stringify(
              {
                change: id,
                stage: opts.stage,
                ...(opts.story ? { story: opts.story } : {}),
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
          ...(opts.story ? [`Story: ${opts.story}`] : []),
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
        if (gateResult.gates.machine.warnings && gateResult.gates.machine.warnings.length > 0) {
          lines.push('  warnings (advisory, 不阻断):');
          for (const w of gateResult.gates.machine.warnings) {
            lines.push(`    - ${w}`);
          }
        }
        lines.push(
          '',
          'Human Gate:',
          `  status: ${gateResult.gates.human.status}`,
          `  hash: ${gateResult.gates.human['artifact-hash'] || '-'}`,
          `  reviewed-at: ${gateResult.gates.human['reviewed-at'] || '-'}`,
          `  reviewer: ${gateResult.gates.human.reviewer || '-'}`
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
