// Skill Command：编排 list/show/run（CLI 层，依赖 core/sdd）
// 瘦编排范本对齐 change.js：resolveWorkspaceRoot → @clack 交互 → core 纯函数 → note/ok/warn 输出
// skill run 不是运行 AI，而是"创建 Skill Invocation Context 并生成执行指令"
// sdd-explore 完整实现（创建 CHG + 写 Artifact + 推进状态 + 生成 Instruction）
// 其余 6 个 Skill 仅校验状态前置 + 输出 Instruction 骨架（不产出 Artifact）

import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { listSkills, getSkill } from '../../../../core/sdd/skill-registry.js';
import { loadSkill } from '../../../../core/sdd/skill-loader.js';
import { assembleContext } from '../../../../core/sdd/context-assembler.js';
import { buildInstruction } from '../../../../core/sdd/instruction-builder.js';
import { writeArtifact } from '../../../../core/sdd/artifact-writer.js';
import { writeCandidate } from '../../../../core/sdd/candidate-repository.js';
import { runChangeCreate, readMetadata, patchMetadata, patchStatus } from '../../../../core/sdd/change-model.js';
import { findChangeByRequirement, changeExists } from '../../../../core/sdd/change-repository.js';
import { readFeatureTree, findFeature, featurePath } from '../../../../core/sdd/feature-model.js';
import { validateTransition } from '../../../../core/sdd/change-state-machine.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { collectRequirement, askReuseDecision } from '../lib/skill-prompts.js';

/**
 * 注册 skill 子命令组到 commander program。
 */
export function registerSkillCommand(program) {
  const skill = program.command('skill').description('SDD Skill 管理与调用');

  // list：列出所有 Skill
  skill
    .command('list')
    .action(async () => {
      try {
        const harnessRoot = getHarnessRoot();
        const skills = await listSkills(harnessRoot);
        if (skills.length === 0) {
          note('No skills found.', 'Skills');
        } else {
          note(
            skills
              .map(
                (s) =>
                  `${s.id}  stage: ${s.stage}  ${s.requiresState} → ${s.producesState}  artifacts: [${s.outputArtifacts.join(', ')}]`
              )
              .join('\n'),
            `Skills (${skills.length})`
          );
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('List failed.');
        process.exit(1);
      }
    });

  // show：显示 Skill 详情
  skill
    .command('show <id>')
    .action(async (id) => {
      try {
        const harnessRoot = getHarnessRoot();
        const loaded = await getSkill(id, harnessRoot);
        const y = loaded.yaml || {};
        const lines = [
          `id: ${y.id || id}`,
          `version: ${y.version || ''}`,
          `stage: ${y.stage || ''}`,
          `description: ${y.description || ''}`,
          `requires-state: ${y['requires-state'] || ''}`,
          `produces-state: ${y['produces-state'] || ''}`,
          `output-artifacts: ${Array.isArray(y['output-artifacts']) ? y['output-artifacts'].join(', ') : ''}`,
        ];
        note(lines.join('\n'), `${id} metadata`);
        if (loaded.skillMd) {
          note(loaded.skillMd, `${id} SKILL.md`);
        }
        if (loaded.checklistMd) {
          note(loaded.checklistMd, `${id} checklist`);
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Show failed.');
        process.exit(1);
      }
    });

  // run：创建 Invocation Context 并生成 Instruction
  skill
    .command('run <id>')
    .option('--change <chg>', '指定 Change（CHG-XXXX，sdd-explore 不需要）')
    .option('--requirement <req>', '需求标识（REQ-XXX）')
    .option('--title <text>', '需求标题')
    .option('--content <text>', '需求内容')
    .action(async (id, opts) => {
      try {
        const harnessRoot = getHarnessRoot();
        if (id === 'sdd-explore') {
          await runSddExplore(opts, harnessRoot);
        } else {
          await runSkillSkeleton(id, opts, harnessRoot);
        }
      } catch (e) {
        error(e.message);
        outro('Skill run failed.');
        process.exit(1);
      }
    });
}

/**
 * sdd-explore 完整执行流程（对齐设计 §8.1）。
 *
 * 1. 收集 Requirement
 * 2. 查找已有 Change（findChangeByRequirement）
 * 3. 创建或复用 CHG（runChangeCreate）
 * 4. Feature Tree 匹配（命中记录 / 未命中 Candidate）
 * 5. 写 requirement.md（ArtifactWriter）
 * 6. 生成 exploration.md（ArtifactWriter，结构化字段 + 非结构化段占位）
 * 7. 更新 Change State（patchMetadata features + validateTransition + patchStatus exploring）
 * 8. 生成 Instruction（InstructionBuilder，引导外部 AI 补充非结构化分析）
 */
async function runSddExplore(opts, harnessRoot) {
  const ws = resolveWorkspaceRoot();

  // 1. 收集 Requirement
  const { title, requirement, content } = await collectRequirement({
    title: opts.title,
    requirement: opts.requirement,
    content: opts.content,
  });

  // 2. 查找已有 Change
  const candidates = await findChangeByRequirement(ws, { requirement, title });

  // 3. 决策沿用/新建
  const decision = await askReuseDecision(candidates);

  let changeDir, changeId;
  if (decision.action === 'reuse') {
    changeDir = decision.change.changeDir;
    changeId = decision.change.id;
    const meta = await readMetadata(changeDir);
    if (meta.status !== 'created') {
      throw new Error(
        `Cannot reuse ${changeId}: status is ${meta.status}. sdd-explore requires 'created'.`
      );
    }
  } else {
    const result = await runChangeCreate(ws, { title, requirement }, harnessRoot);
    changeDir = result.changeDir;
    changeId = result.id;
  }

  // 4. Feature Tree 匹配
  const tree = await readFeatureTree(ws);
  const feature =
    findFeature(tree, { name: title }) ||
    (requirement ? findFeature(tree, { id: requirement }) : null);
  let featureId = '';
  let featurePathStr = '';
  let isNewCandidate = 'no';
  if (feature) {
    featureId = feature.id || '';
    featurePathStr = featurePath(tree, feature);
  } else {
    await writeCandidate(ws, { name: title, sourceChange: changeId }, harnessRoot);
    isNewCandidate = 'yes';
  }

  // 5. 写 requirement.md
  await writeArtifact(
    changeDir,
    'requirement.md',
    {
      frontMatter: {
        id: requirement || '',
        name: title,
        content,
        source: 'user',
        'created-at': new Date().toISOString(),
      },
      replacements: { 'requirement-content': content },
    },
    harnessRoot
  );

  // 6. 生成 exploration.md
  const metadata = await readMetadata(changeDir);
  const matchedChange = candidates.length > 0 ? candidates[0].id : 'none';
  const archivedChange = metadata['related-change'] || 'none';
  const reuseDecision = decision.action === 'reuse' ? '沿用现有' : '新建';

  await writeArtifact(
    changeDir,
    'exploration.md',
    {
      replacements: {
        'feature-id': featureId,
        'feature-path': featurePathStr,
        'is-new-candidate': isNewCandidate,
        'affected-repos': '',
        'matched-change': matchedChange,
        'archived-change': archivedChange,
        'reuse-decision': reuseDecision,
      },
    },
    harnessRoot
  );

  // 7. 更新 Change State
  if (featureId) {
    await patchMetadata(changeDir, { features: [featureId] });
  }
  const current = (await readMetadata(changeDir)).status;
  validateTransition(current, 'exploring');
  await patchStatus(changeDir, 'exploring');

  // 8. 生成 Instruction
  const skillLoaded = await loadSkill('sdd-explore', harnessRoot);
  const context = await assembleContext(ws, 'explore');
  const instruction = buildInstruction(skillLoaded, context, {
    requirement,
    title,
    content,
    changeId,
  });
  await writeFile(join(changeDir, '.instruction.md'), instruction, 'utf8');

  // 输出
  note(instruction, `Instruction: sdd-explore @ ${changeId}`);
  ok(`${changeId} ${decision.action === 'reuse' ? 'reused' : 'created'}, status: ${current} → exploring`);
  ok('Artifacts: requirement.md, exploration.md');
  if (isNewCandidate === 'yes') {
    warn('Feature 未命中 Feature Tree，已创建 Candidate（product/features/）');
  }
  ok(`Instruction 已写入: ${join(changeDir, '.instruction.md')}`);
  outro('Done.');
}

/**
 * 骨架 Skill 执行（sdd-prd/design/task/dev/test/converge）。
 *
 * v0.1 仅校验状态前置 + 输出 Instruction 骨架，不产出 Artifact：
 * - 必须 --change 指定 CHG
 * - 校验 CHG 状态 === requires-state
 * - 装配 Context + 生成 Instruction
 * - 提示用户外部 Agent 执行后手动 openspec change status --set 推进状态
 */
async function runSkillSkeleton(id, opts, harnessRoot) {
  const ws = resolveWorkspaceRoot();

  if (!opts.change) {
    throw new Error(`--change <CHG-XXXX> is required for skill: ${id} (sdd-explore excepted).`);
  }

  const changeId = opts.change;
  if (!(await changeExists(ws, changeId))) {
    throw new Error(`Change not found: ${changeId}`);
  }

  const changeDir = join(ws, 'delivery', 'changes', changeId);
  const loaded = await loadSkill(id, harnessRoot);
  const y = loaded.yaml || {};
  const requiresState = y['requires-state'];

  // 校验状态前置
  const meta = await readMetadata(changeDir);
  const current = meta.status || 'created';
  if (requiresState && current !== requiresState) {
    throw new Error(
      `Cannot run ${id}: Change ${changeId} status is '${current}', but skill requires '${requiresState}'.`
    );
  }

  // 装配 Context + 生成 Instruction
  const stage = y.stage || id.replace('sdd-', '');
  const context = await assembleContext(ws, stage);
  const userInput = {
    changeId,
    requirement: opts.requirement,
    title: opts.title,
  };
  const instruction = buildInstruction(loaded, context, userInput);
  await writeFile(join(changeDir, '.instruction.md'), instruction, 'utf8');

  note(instruction, `Instruction: ${id} @ ${changeId}`);
  ok(`Instruction 已写入: ${join(changeDir, '.instruction.md')}`);
  if (y['produces-state']) {
    warn(
      `外部 Agent 执行后，运行 openspec change status ${changeId} --set ${y['produces-state']} 推进状态`
    );
  }
  outro('Done.');
}
