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
import { runChangeCreate, readMetadata, patchMetadata } from '../../../../core/sdd/change-model.js';
import { findChangeByRequirement, changeExists } from '../../../../core/sdd/change-repository.js';
import { readFeatureTree, findFeature, featurePath } from '../../../../core/sdd/feature-model.js';
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

  // 7. 不推进状态（Phase 1.5：Skill 产出 ≠ 阶段完成）
  //    状态推进由 TransitionService 在 Machine Gate + Human Gate 通过后执行
  //    Artifacts（requirement.md + exploration.md）保持 draft，等待 gate check/approve
  if (featureId) {
    await patchMetadata(changeDir, { features: [featureId] });
  }
  const current = (await readMetadata(changeDir)).status;

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
  ok(`${changeId} ${decision.action === 'reuse' ? 'reused' : 'created'}, status: ${current} (保持不变)`);
  ok('Artifacts: requirement.md, exploration.md (draft)');
  if (isNewCandidate === 'yes') {
    warn('Feature 未命中 Feature Tree，已创建 Candidate（product/features/）');
  }
  ok(`Instruction 已写入: ${join(changeDir, '.instruction.md')}`);
  warn(`外部 Agent 请按 Instruction 补充 exploration.md 的非结构化分析段`);
  warn(`完成后运行 'openspec gate check ${changeId} --stage explore' 推进 Machine Gate`);
  outro('Done.');
}

/**
 * 通用 Phase Skill Runner（sdd-prd/design/task/dev/test/converge）。
 *
 * 与 sdd-explore 对齐：
 * - 必须 --change 指定 CHG
 * - 校验 CHG 状态 === requires-state
 * - 写本阶段 Artifact（由 SKILL_CONFIG[id] 定义 artifactName + replacements 工厂）
 * - validateTransition + patchStatus 自动推进到 produces-state
 * - 装配 Context + 生成完整版 Instruction（含 SKILL.md / checklist / rules）
 *
 * OpenSpec 不执行 AI，结构化字段由 ArtifactWriter 填充，非结构化段交外部 Agent。
 */

/**
 * Skill 配置表：每个 Skill 的 Artifact 定义。
 * replacementsFactory(meta) 返回填模板的 replacements；
 * artifactWriter 可选自定义写文件函数（默认 ArtifactWriter.writeArtifact）。
 */
const SKILL_CONFIG = {
  'sdd-prd': {
    artifactName: 'prd.md',
    replacementsFactory: (meta, changeId) => ({
      'change-id': changeId,
      requirement: meta.requirement || '',
      'feature-id': (meta.features && meta.features[0]) || '',
      'from-state': meta.status || '',
      'to-state': 'specified',
      'target-user': '',
      'pain-points': '',
      'expected-value': '',
      'scope-in': '',
      'scope-out': '',
    }),
  },
  'sdd-design': {
    artifactName: 'design.md',
    replacementsFactory: (meta, changeId) => ({
      'change-id': changeId,
      'prd-source': changeId + '/prd.md',
      'from-state': meta.status || '',
      'to-state': 'designed',
      'current-pattern': '',
      'repos-involved': (meta.repositories || []).join(', '),
      'modules-involved': '',
      'proposal-summary': '',
      'key-components': '',
      'interface-contract': '',
      'repo-impact-count': String(meta.repositories ? meta.repositories.length : 0),
      'repo-impact-summary': '',
      'need-migration': 'no',
      'data-change-summary': '',
      'risk-level': '',
      'risk-summary': '',
      mitigation: '',
    }),
  },
  'sdd-task': {
    artifactName: 'tasks.md',
    replacementsFactory: (meta, changeId) => ({
      'change-id': changeId,
      'design-source': changeId + '/design.md',
      'from-state': meta.status || '',
      'to-state': 'tasked',
      'task-count': '',
    }),
  },
  'sdd-dev': {
    artifactName: 'implementation.md',
    replacementsFactory: (meta, changeId) => ({
      'change-id': changeId,
      'tasks-source': changeId + '/tasks.md',
      'from-state': meta.status || '',
      'to-state': 'developing',
      'started-at': new Date().toISOString(),
      'primary-repo': (meta.repositories && meta.repositories[0]) || '',
    }),
  },
  'sdd-test': {
    artifactName: 'evidence/test-report.md',
    outputSubDir: 'evidence',
    replacementsFactory: (meta, changeId) => ({
      'change-id': changeId,
      'implementation-source': changeId + '/implementation.md',
      'from-state': meta.status || '',
      'to-state': 'testing',
      'tested-at': new Date().toISOString(),
      'test-scope': '',
      'pass-rate': '',
    }),
  },
  'sdd-converge': {
    artifactName: 'convergence.md',
    replacementsFactory: (meta, changeId) => ({
      'change-id': changeId,
      'completed-at': new Date().toISOString(),
      'from-state': meta.status || '',
      'to-state': 'completed',
      'artifact-count': '',
      'knowledge-delta': '',
      'standards-need-update': 'no',
      'product-need-update': 'no',
      'featuretree-need-update': 'no',
      'glossary-need-update': 'no',
    }),
  },
};

async function runSkillSkeleton(id, opts, harnessRoot) {
  const ws = resolveWorkspaceRoot();

  if (!opts.change) {
    throw new Error(`--change <CHG-XXXX> is required for skill: ${id} (sdd-explore excepted).`);
  }

  const changeId = opts.change;
  if (!(await changeExists(ws, changeId))) {
    throw new Error(`Change not found: ${changeId}`);
  }

  const cfg = SKILL_CONFIG[id];
  if (!cfg) {
    throw new Error(`Unknown skill: ${id}. Run 'openspec skill list'.`);
  }

  const changeDir = join(ws, 'delivery', 'changes', changeId);
  const loaded = await loadSkill(id, harnessRoot);
  const y = loaded.yaml || {};
  const requiresState = y['requires-state'];
  const producesState = y['produces-state'];

  // 校验状态前置
  const meta = await readMetadata(changeDir);
  const current = meta.status || 'created';
  if (requiresState && current !== requiresState) {
    throw new Error(
      `Cannot run ${id}: Change ${changeId} status is '${current}', but skill requires '${requiresState}'.`
    );
  }

  // 1. 写本阶段 Artifact
  const replacements = cfg.replacementsFactory(meta, changeId);
  const artifactFullName = cfg.artifactName; // 含子目录，如 "evidence/test-report.md"
  const artifactOutDir = cfg.outputSubDir ? join(changeDir, cfg.outputSubDir) : changeDir;
  const artifactFileName = artifactFullName.split('/').pop(); // 证据目录的文件名
  await writeArtifact(
    artifactOutDir,
    cfg.artifactName,
    {
      replacements,
      outputName: artifactFileName, // ArtifactWriter 去 templates/artifacts/<artifactName> 读，写时用 basename
    },
    harnessRoot
  );

  // 2. 不推进状态（Phase 1.5：Skill 产出 ≠ 阶段完成）
  //    状态推进由 TransitionService 在 Machine Gate + Human Gate 通过后执行
  //    Artifact 保持 draft，等待 gate check/approve

  // 3. 装配 Context + 生成 Instruction
  const stage = y.stage || id.replace('sdd-', '');
  const context = await assembleContext(ws, stage);
  const userInput = {
    changeId,
    requirement: opts.requirement || meta.requirement,
    title: opts.title || meta.title,
  };
  const instruction = buildInstruction(loaded, context, userInput);
  await writeFile(join(changeDir, '.instruction.md'), instruction, 'utf8');

  note(instruction, `Instruction: ${id} @ ${changeId}`);
  ok(`${id} 完成：${cfg.artifactName} 已写入 (draft)，状态保持 ${current}`);
  ok(`Instruction 已写入: ${join(changeDir, '.instruction.md')}`);
  warn(`外部 Agent 请按 Instruction 补充 ${cfg.artifactName} 的非结构化分析段`);
  warn(`完成后运行 'openspec gate check ${changeId} --stage ${y.stage}' 推进 Machine Gate`);
  outro('Done.');
}
