// Unit tests: PromptLoader / InstructionBuilder prompts 注入 / syncPrompts / checkPromptRefs（Phase 2.3）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import {
  parsePromptRaw,
  loadPrompt,
  resolvePrompts,
  checkPromptRefs,
} from '../core/sdd/prompt-loader.js';
import { buildInstruction } from '../core/sdd/instruction-builder.js';
import { syncPrompts } from '../core/sdd/skill-registry.js';
import { loadSkill } from '../core/sdd/skill-loader.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

// ---- parsePromptRaw ----

test('parsePromptRaw: 解析 front-matter 与 body', () => {
  const raw = [
    '---',
    'name: persona-dev',
    'category: coding',
    'version: 0.1.0',
    'purpose: sdd-dev 角色设定',
    '---',
    '',
    '## Role',
    '',
    '开发工程师',
  ].join('\n');
  const p = parsePromptRaw('coding/persona-dev', raw);
  assert.equal(p.name, 'persona-dev');
  assert.equal(p.category, 'coding');
  assert.equal(p.version, '0.1.0');
  assert.equal(p.purpose, 'sdd-dev 角色设定');
  assert.ok(p.body.includes('## Role'));
  assert.ok(p.body.includes('开发工程师'));
});

test('parsePromptRaw: 无 front-matter 时 body 为全文', () => {
  const p = parsePromptRaw('x/y', '# 纯文本\n内容');
  assert.equal(p.body, '# 纯文本\n内容');
  assert.equal(p.category, '');
});

// ---- loadPrompt ----

// loadPrompt 语义：root = 含 prompts/ 的目录（Workspace 根 或 Harness 的 templates/default-workspace）
const harnessBase = join(harnessRoot, 'templates', 'default-workspace');

test('loadPrompt: 从 Harness 加载 common/constraints 成功', async () => {
  const p = await loadPrompt(harnessBase, 'common/constraints');
  assert.ok(p);
  assert.equal(p.name, 'constraints');
  assert.equal(p.category, 'common');
  assert.ok(p.body.length > 0);
});

test('loadPrompt: 不存在的 ref 返回 null（不抛错）', async () => {
  const p = await loadPrompt(harnessBase, 'common/not-exist');
  assert.equal(p, null);
});

test('loadPrompt: 路径穿越被拒绝返回 null', async () => {
  const p = await loadPrompt(harnessBase, '../skills/sdd-dev/skill');
  assert.equal(p, null);
});

// ---- resolvePrompts ----

test('resolvePrompts: 无 Workspace 时全部 fallback Harness', async () => {
  const skill = await loadSkill('sdd-dev', harnessRoot);
  const { prompts, missing } = await resolvePrompts(skill, { harnessRoot });
  assert.equal(missing.length, 0);
  assert.equal(prompts.length, 4); // common 三件 + coding/persona-dev
  const refs = prompts.map((p) => p.ref);
  assert.ok(refs.includes('common/persona-sdd'));
  assert.ok(refs.includes('common/constraints'));
  assert.ok(refs.includes('common/output-format'));
  assert.ok(refs.includes('coding/persona-dev'));
});

test('resolvePrompts: Workspace prompts/ 优先于 Harness', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'prompt-ws-'));
  const wsPrompts = join(tmp, 'prompts', 'common');
  await mkdir(wsPrompts, { recursive: true });
  await writeFile(
    join(wsPrompts, 'constraints.md'),
    '---\nname: constraints\ncategory: common\nversion: 9.9.9\npurpose: 用户自定义\n---\n\n自定义约束'
  );
  const skill = await loadSkill('sdd-dev', harnessRoot);
  const { prompts, missing } = await resolvePrompts(skill, {
    harnessRoot,
    workspaceRoot: tmp,
  });
  assert.equal(missing.length, 0);
  const constraints = prompts.find((p) => p.ref === 'common/constraints');
  assert.equal(constraints.version, '9.9.9', '应返回 Workspace 自定义版本');
  await rmrf(tmp);
});

test('resolvePrompts: 缺失条目收集到 missing', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'prompt-missing-'));
  const skill = { yaml: { prompts: ['common/persona-sdd', 'nope/ghost'] } };
  const { prompts, missing } = await resolvePrompts(skill, { harnessRoot });
  assert.equal(prompts.length, 1);
  assert.deepEqual(missing, ['nope/ghost']);
  await rmrf(tmp);
});

// ---- buildInstruction prompts 注入 ----

function makeSkill() {
  return {
    id: 'sdd-dev',
    yaml: {
      id: 'sdd-dev',
      stage: 'dev',
      description: 'Test skill',
      'requires-state': 'tasked',
      'produces-state': 'developing',
      'output-artifacts': ['implementation.md'],
    },
    skillMd: '# SKILL content',
  };
}

test('buildInstruction: 注入 Prompt 片段且位于角色与 Context 之间', () => {
  const prompts = [
    { ref: 'common/persona-sdd', category: 'common', version: '0.1.0', purpose: '基础角色', body: '你是 SDD 协作者' },
    { ref: 'coding/persona-dev', category: 'coding', version: '0.1.0', purpose: '开发角色', body: '你是开发工程师' },
  ];
  const instruction = buildInstruction(makeSkill(), { stage: 'dev', dirs: [], files: [] }, {}, prompts);
  const iRole = instruction.indexOf('## Skill 角色与目标');
  const iPrompt = instruction.indexOf('## Prompt 片段');
  const iCtx = instruction.indexOf('## Workspace Context');
  assert.ok(iRole >= 0 && iPrompt > iRole && iCtx > iPrompt, 'section 顺序应为 角色 → Prompt 片段 → Context');
  assert.ok(instruction.includes('### prompts/common/persona-sdd'));
  assert.ok(instruction.includes('你是 SDD 协作者'));
  assert.ok(instruction.includes('你是开发工程师'));
  assert.ok(instruction.includes('purpose: 基础角色'));
});

test('buildInstruction: 缺失片段输出占位标注', () => {
  const prompts = [{ ref: 'nope/ghost', missing: true }];
  const instruction = buildInstruction(makeSkill(), { stage: 'dev', dirs: [], files: [] }, {}, prompts);
  assert.ok(instruction.includes('### prompts/nope/ghost'));
  assert.ok(instruction.includes('（缺失: 文件不存在，请检查 skill.yaml prompts 字段）'));
});

test('buildInstruction: 不传第 4 参无 Prompt 片段 section（向后兼容）', () => {
  const instruction = buildInstruction(makeSkill(), { stage: 'dev', dirs: [], files: [] }, {});
  assert.ok(!instruction.includes('## Prompt 片段'));
  assert.ok(instruction.includes('SKILL content'));
});

// ---- checkPromptRefs（11 个 Skill 全量一致性）----

test('checkPromptRefs: Harness 全部 Skill 零 issues', async () => {
  const issues = await checkPromptRefs(harnessRoot);
  assert.deepEqual(issues, [], `引用一致性 issues: ${issues.join('; ')}`);
});

test('checkPromptRefs: 每个生命周期 Skill 的 prompts 恰为 4 条（common 三件 + 各自 persona）', async () => {
  const ids = [
    'sdd-explore', 'sdd-prd', 'sdd-design', 'sdd-task', 'sdd-dev', 'sdd-test',
    'sdd-converge', 'sdd-reverse', 'sdd-feature-tree', 'sdd-knowledge', 'sdd-review',
  ];
  for (const id of ids) {
    const skill = await loadSkill(id, harnessRoot);
    assert.ok(Array.isArray(skill.yaml.prompts), `${id} 应有 prompts 字段`);
    assert.equal(skill.yaml.prompts.length, 4, `${id} prompts 应为 4 条`);
    assert.deepEqual(skill.yaml.prompts.slice(0, 3), [
      'common/persona-sdd',
      'common/constraints',
      'common/output-format',
    ]);
  }
});

// ---- constraints.md 等价覆盖（SKILL.md 瘦身回验）----

test('constraints.md 覆盖全部被抽取的通用约束条目', async () => {
  const p = await loadPrompt(harnessBase, 'common/constraints');
  assert.ok(p.body.includes('产出草稿供用户确认'));
  assert.ok(p.body.includes('不直接推进状态'));
  assert.ok(p.body.includes('不修改前序 Artifact'));
  assert.ok(p.body.includes('不修改 product/ 或 standards/'));
  assert.ok(p.body.includes('上报用户决定'));
});

test('SKILL.md 已移除通用约束条目（保留 Skill 特有规则）', async () => {
  const ids = ['sdd-dev', 'sdd-prd', 'sdd-design', 'sdd-task', 'sdd-test', 'sdd-converge', 'sdd-explore', 'sdd-reverse'];
  for (const id of ids) {
    const md = await readFile(join(harnessRoot, 'skills', id, 'SKILL.md'), 'utf8');
    assert.ok(!md.includes('- 产出草稿供用户确认'), `${id} 应删除通用条目「产出草稿供用户确认」`);
    assert.ok(!md.includes('- 不修改 product/ 或 standards/（知识沉淀在 sdd-converge）'), `${id} 应删除通用条目「不修改 product/ 或 standards/」`);
    assert.ok(md.includes('prompts/common/constraints.md'), `${id} 应保留引用行`);
  }
});

// ---- syncPrompts ----

test('syncPrompts: 同步 14 个片段到 Workspace', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'prompt-sync-'));
  const result = await syncPrompts(harnessRoot, tmp);
  assert.equal(result.synced, 14);
  const raw = await readFile(join(tmp, 'prompts', 'common', 'constraints.md'), 'utf8');
  assert.ok(raw.includes('name: constraints'));
  assert.ok(raw.startsWith('---'), '同步产物应保留 front-matter');
  await rmrf(tmp);
});
