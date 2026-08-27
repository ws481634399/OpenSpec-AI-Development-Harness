// Unit tests: fs-walker / SkillLoader / SkillRegistry / ContextAssembler / InstructionBuilder / ArtifactWriter / CandidateRepository / decideReuseAction
// 对齐 phase-1.4-sdd-skill-framework.md §13.2
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, stat, readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { walkDir, listFiles } from '../core/sdd/fs-walker.js';
import { loadSkill } from '../core/sdd/skill-loader.js';
import { listSkills, getSkill } from '../core/sdd/skill-registry.js';
import { assembleContext } from '../core/sdd/context-assembler.js';
import { buildInstruction } from '../core/sdd/instruction-builder.js';
import { writeArtifact, fillTemplate } from '../core/sdd/artifact-writer.js';
import { nextCandidateId, writeCandidate } from '../core/sdd/candidate-repository.js';
import { decideReuseAction } from '../cli/openspec/src/lib/skill-prompts.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runChangeCreate, readMetadata, patchStatus } from '../core/sdd/change-model.js';
import { runInit } from '../core/workspace/workspace-initializer.js';

const pathExists = (p) => stat(p).then(() => true).catch(() => false);
const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

// ---- fs-walker ----

test('fs-walker: 递归收集文件与目录', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'walker-'));
  await mkdir(join(tmp, 'a', 'b'), { recursive: true });
  await writeFile(join(tmp, 'a', 'b', 'c.txt'), 'c');
  await writeFile(join(tmp, 'a.txt'), 'a');
  const entries = await walkDir(tmp);
  const paths = entries.map((e) => e.path);
  assert.ok(paths.includes('a.txt'));
  assert.ok(paths.includes('a/b/c.txt'));
  assert.ok(entries.some((e) => e.path === 'a' && e.type === 'dir'));
  assert.ok(entries.some((e) => e.path === 'a/b' && e.type === 'dir'));
  await rmrf(tmp);
});

test('fs-walker: 空目录返回空数组', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'walker-empty-'));
  const entries = await walkDir(tmp);
  assert.deepEqual(entries, []);
  await rmrf(tmp);
});

test('fs-walker: 目录不存在返回空数组', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'walker-noent-'));
  const entries = await walkDir(join(tmp, 'nonexistent'));
  assert.deepEqual(entries, []);
  await rmrf(tmp);
});

test('fs-walker: 忽略 .git 与 node_modules', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'walker-ignore-'));
  await mkdir(join(tmp, '.git'), { recursive: true });
  await mkdir(join(tmp, 'node_modules'), { recursive: true });
  await writeFile(join(tmp, '.git', 'config'), '');
  await writeFile(join(tmp, 'node_modules', 'pkg'), '');
  await writeFile(join(tmp, 'real.txt'), 'real');
  const entries = await walkDir(tmp);
  const paths = entries.map((e) => e.path);
  assert.ok(!paths.some((p) => p.startsWith('.git')));
  assert.ok(!paths.some((p) => p.startsWith('node_modules')));
  assert.ok(paths.includes('real.txt'));
  await rmrf(tmp);
});

test('fs-walker: listFiles 仅返回文件路径', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'walker-files-'));
  await mkdir(join(tmp, 'sub'), { recursive: true });
  await writeFile(join(tmp, 'sub', 'f.txt'), '');
  const files = await listFiles(tmp);
  assert.deepEqual(files, ['sub/f.txt']);
  await rmrf(tmp);
});

// ---- SkillLoader ----

test('SkillLoader: 加载 sdd-explore 返回正确元数据', async () => {
  const loaded = await loadSkill('sdd-explore', harnessRoot);
  assert.equal(loaded.id, 'sdd-explore');
  assert.equal(loaded.yaml.id, 'sdd-explore');
  assert.equal(loaded.yaml.stage, 'explore');
  assert.equal(loaded.yaml['requires-state'], 'created');
  assert.equal(loaded.yaml['produces-state'], 'exploring');
  assert.ok(loaded.yaml['output-artifacts'].includes('requirement.md'));
  assert.ok(loaded.yaml['output-artifacts'].includes('exploration.md'));
  assert.ok(loaded.skillMd.length > 0);
  assert.ok(loaded.checklistMd.length > 0);
  assert.ok(loaded.rulesMd.length > 0);
});

test('SkillLoader: 不存在的 Skill 抛错', async () => {
  await assert.rejects(() => loadSkill('nonexistent-skill', harnessRoot), /Skill not found/);
});

// ---- SkillRegistry ----

test('SkillRegistry: listSkills 返回 8 个 Skill', async () => {
  const skills = await listSkills(harnessRoot);
  assert.equal(skills.length, 8);
  const ids = skills.map((s) => s.id);
  for (const expected of ['sdd-explore', 'sdd-prd', 'sdd-design', 'sdd-task', 'sdd-dev', 'sdd-test', 'sdd-converge', 'sdd-reverse']) {
    assert.ok(ids.includes(expected), `missing skill: ${expected}`);
  }
});

test('SkillRegistry: listSkills 按 id 排序', async () => {
  const skills = await listSkills(harnessRoot);
  const ids = skills.map((s) => s.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted);
});

test('SkillRegistry: getSkill 返回完整定义', async () => {
  const skill = await getSkill('sdd-prd', harnessRoot);
  assert.equal(skill.yaml.stage, 'prd');
  assert.equal(skill.yaml['requires-state'], 'exploring');
  assert.equal(skill.yaml['produces-state'], 'specified');
  assert.ok(skill.skillMd.length > 0);
});

// ---- ContextAssembler ----

test('ContextAssembler: explore 阶段读取 standards/ + product/', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'ctx-'));
  // 复制真实 context-rules.yaml
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  const rulesRaw = await readFile(
    join(harnessRoot, 'templates', 'default-workspace', '.sdd', 'context-rules.yaml'),
    'utf8'
  );
  await writeFile(join(tmp, '.sdd', 'context-rules.yaml'), rulesRaw);
  // 创建 standards/sdd/test.md
  await mkdir(join(tmp, 'standards', 'sdd'), { recursive: true });
  await writeFile(join(tmp, 'standards', 'sdd', 'test.md'), '# Test Standard');
  // 创建 product/feature-tree.yaml
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(join(tmp, 'product', 'feature-tree.yaml'), 'product:\n  name: test\nfeatures: []');

  const ctx = await assembleContext(tmp, 'explore');
  assert.equal(ctx.stage, 'explore');
  assert.ok(ctx.dirs.includes('standards'));
  assert.ok(ctx.dirs.includes('product'));
  assert.ok(ctx.files.some((f) => f.path.startsWith('standards/')));
  assert.ok(ctx.files.some((f) => f.path.startsWith('product/')));
  // 内容被读取
  const stdFile = ctx.files.find((f) => f.path === 'standards/sdd/test.md');
  assert.ok(stdFile);
  assert.ok(stdFile.content.includes('# Test Standard'));
  await rmrf(tmp);
});

test('ContextAssembler: 未定义的 stage 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'ctx-bad-'));
  await mkdir(join(tmp, '.sdd'), { recursive: true });
  await writeFile(join(tmp, '.sdd', 'context-rules.yaml'), 'stages:\n  explore:\n    read:\n      - standards/');
  await assert.rejects(() => assembleContext(tmp, 'unknown'), /No context rules for stage/);
  await rmrf(tmp);
});

test('ContextAssembler: 缺失 context-rules.yaml 抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'ctx-norules-'));
  await assert.rejects(() => assembleContext(tmp, 'explore'), /Context rules not found/);
  await rmrf(tmp);
});

// ---- InstructionBuilder ----

test('InstructionBuilder: 组装 Instruction 含 Skill + Context + 用户输入', () => {
  const skill = {
    id: 'sdd-explore',
    yaml: {
      id: 'sdd-explore',
      stage: 'explore',
      description: 'Test skill description',
      'requires-state': 'created',
      'produces-state': 'exploring',
      'output-artifacts': ['requirement.md', 'exploration.md'],
    },
    skillMd: '# SKILL content',
  };
  const context = {
    stage: 'explore',
    dirs: ['standards', 'product'],
    files: [{ path: 'standards/sdd/test.md', content: '# Test' }],
  };
  const userInput = { title: 'Test title', content: 'Test content', changeId: 'CHG-0001' };
  const instruction = buildInstruction(skill, context, userInput);
  assert.ok(instruction.includes('sdd-explore'));
  assert.ok(instruction.includes('Test skill description'));
  assert.ok(instruction.includes('standards/sdd/test.md'));
  assert.ok(instruction.includes('Test title'));
  assert.ok(instruction.includes('Test content'));
  assert.ok(instruction.includes('CHG-0001'));
  assert.ok(instruction.includes('requirement.md'));
  assert.ok(instruction.includes('exploration.md'));
  assert.ok(instruction.includes('SKILL content'));
  assert.ok(instruction.includes('openspec change status'));
});

test('InstructionBuilder: 无 SKILL.md 时不报错', () => {
  const skill = { yaml: { id: 'test', stage: 'test', 'produces-state': 'testing' } };
  const context = { stage: 'test', dirs: [], files: [] };
  const instruction = buildInstruction(skill, context, {});
  assert.ok(instruction.includes('test'));
  assert.ok(instruction.includes('（无上下文文件）'));
});

// ---- ArtifactWriter ----

test('ArtifactWriter: 读模板 + 填 front-matter + 替换 placeholder + 写文件', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'aw-'));
  const outPath = await writeArtifact(
    tmp,
    'requirement.md',
    {
      frontMatter: {
        id: 'REQ-001',
        name: 'Test',
        content: 'Content',
        source: 'user',
        'created-at': '2026-01-01T00:00:00Z',
      },
      replacements: { 'requirement-content': 'Hello World' },
    },
    harnessRoot
  );
  assert.ok(await pathExists(outPath));
  const raw = await readFile(outPath, 'utf8');
  assert.ok(raw.includes('REQ-001'));
  assert.ok(raw.includes('Hello World'));
  assert.ok(raw.includes('# REQ-XXX'), 'front-matter 注释应保留'); // 模板注释保留
  await rmrf(tmp);
});

test('ArtifactWriter: 无 front-matter 模板仅替换正文', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'aw-nofm-'));
  const outPath = await writeArtifact(
    tmp,
    'exploration.md',
    {
      replacements: { 'feature-id': 'FEAT-001', 'feature-path': 'A / B', 'is-new-candidate': 'no' },
    },
    harnessRoot
  );
  const raw = await readFile(outPath, 'utf8');
  assert.ok(raw.includes('FEAT-001'));
  assert.ok(raw.includes('A / B'));
  assert.ok(!raw.includes('{{feature-id}}'), '已替换的占位符不应残留');
  await rmrf(tmp);
});

test('ArtifactWriter: fillTemplate 纯函数 front-matter 保留注释', () => {
  const raw = '---\nid: "" # comment here\nname: ""\n---\nbody {{key}}';
  const result = fillTemplate(raw, {
    frontMatter: { id: 'X' },
    replacements: { key: 'value' },
  });
  assert.ok(result.includes('# comment here'), '注释保留');
  // yaml 库保留引号风格，输出 id: "X"——用 parse 验证值而非字符串匹配
  const fmRaw = result.match(/^---\n([\s\S]*?)\n---/)[1];
  const parsed = parse(fmRaw);
  assert.equal(parsed.id, 'X');
  assert.ok(result.includes('value'));
});

test('ArtifactWriter: fillTemplate 无 front-matter 仅替换正文', () => {
  const raw = '# Title\n\n{{key}} content';
  const result = fillTemplate(raw, { replacements: { key: 'replaced' } });
  assert.ok(result.includes('replaced'));
  assert.ok(!result.includes('{{key}}'));
});

test('ArtifactWriter: 不存在的模板抛错', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'aw-bad-'));
  await assert.rejects(
    () => writeArtifact(tmp, 'nonexistent.md', {}, harnessRoot),
    /Artifact template not found/
  );
  await rmrf(tmp);
});

// ---- CandidateRepository ----

test('CandidateRepository: nextCandidateId 空目录返回 FEAT-CANDIDATE-0001', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'cand-empty-'));
  const id = await nextCandidateId(tmp);
  assert.equal(id, 'FEAT-CANDIDATE-0001');
  await rmrf(tmp);
});

test('CandidateRepository: writeCandidate 生成文件 + 自增编号', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'cand-write-'));
  const r1 = await writeCandidate(tmp, { name: 'Feature A', sourceChange: 'CHG-0001' }, harnessRoot);
  assert.equal(r1.candidateId, 'FEAT-CANDIDATE-0001');
  assert.ok(await pathExists(r1.candidatePath));
  assert.ok(r1.candidatePath.endsWith('FEAT-CANDIDATE-0001.md'));
  const raw1 = await readFile(r1.candidatePath, 'utf8');
  assert.ok(raw1.includes('FEAT-CANDIDATE-0001'));
  assert.ok(raw1.includes('Feature A'));
  assert.ok(raw1.includes('CHG-0001'));
  assert.ok(raw1.includes('status: pending'));

  const r2 = await writeCandidate(tmp, { name: 'Feature B' }, harnessRoot);
  assert.equal(r2.candidateId, 'FEAT-CANDIDATE-0002');
  await rmrf(tmp);
});

test('CandidateRepository: writeCandidate 无 sourceChange 时不写该字段', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'cand-nosrc-'));
  const r = await writeCandidate(tmp, { name: 'No Source' }, harnessRoot);
  const raw = await readFile(r.candidatePath, 'utf8');
  assert.ok(raw.includes('No Source'));
  await rmrf(tmp);
});

// ---- decideReuseAction（纯函数，不依赖 @clack）----

test('decideReuseAction: new → 新建', () => {
  const candidates = [{ id: 'CHG-0001', title: 'T', status: 'created', changeDir: '/tmp' }];
  assert.deepEqual(decideReuseAction(candidates, 'new'), { action: 'new' });
});

test('decideReuseAction: reuse 命中 → 沿用', () => {
  const candidates = [{ id: 'CHG-0001', title: 'T', status: 'created', changeDir: '/tmp' }];
  const result = decideReuseAction(candidates, 'reuse:CHG-0001');
  assert.equal(result.action, 'reuse');
  assert.equal(result.change.id, 'CHG-0001');
});

test('decideReuseAction: reuse 未命中 → 新建', () => {
  const candidates = [{ id: 'CHG-0001', title: 'T', status: 'created', changeDir: '/tmp' }];
  assert.deepEqual(decideReuseAction(candidates, 'reuse:CHG-9999'), { action: 'new' });
});

test('decideReuseAction: 空候选 → 新建', () => {
  assert.deepEqual(decideReuseAction([], 'reuse:CHG-0001'), { action: 'new' });
});

test('decideReuseAction: null choice → 新建', () => {
  const candidates = [{ id: 'CHG-0001', title: 'T', status: 'created', changeDir: '/tmp' }];
  assert.deepEqual(decideReuseAction(candidates, null), { action: 'new' });
});

// ---- 6 个 Phase Skill 端到端（runChangeCreate → patchStatus → 写 Artifact → 状态推进）
//
// 不依赖 CLI 的 commander/@clack 交互，直接调用 core 纯函数链模拟通用 runner 行为：
// 1. 初始化 Workspace（greenfield/single）
// 2. runChangeCreate 创建 CHG-0001（status: created）
// 3. 依次 patchStatus 到前置状态，再按 Skill 配置写 Artifact + patchStatus 到下一阶段
// 4. 验证 Artifact 存在且元信息正确

async function setupWorkspaceForSkillRunner() {
  const tmp = await mkdtemp(join(tmpdir(), 'skill-run-'));
  const initCfg = {
    name: 'skill-runner-ws',
    type: 'greenfield',
    mode: 'single',
    repos: [{ id: 'main', path: 'implementation' }],
    shouldCreateImplementation: true,
    force: false,
  };
  const { selfCheck } = await runInit(initCfg, tmp, harnessRoot);
  assert.ok(selfCheck.ok, selfCheck.issues.join('; '));
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: 'SkillRunner 测试需求', requirement: 'REQ-TEST', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

/** 通用 Skill Artifact 写出 + 状态推进模拟（对齐 SKILL_CONFIG + runSkillSkeleton） */
const SKILL_CONFIG_TEST = {
  'sdd-prd': { artifactName: 'prd.md', from: 'exploring', to: 'specified',
    replacements: (meta, id) => ({ 'change-id': id, requirement: meta.requirement || '', 'from-state': meta.status, 'to-state': 'specified' }) },
  'sdd-design': { artifactName: 'design.md', from: 'specified', to: 'designed',
    replacements: (meta, id) => ({ 'change-id': id, 'prd-source': `${id}/prd.md`, 'from-state': meta.status, 'to-state': 'designed', 'repo-impact-count': '1' }) },
  'sdd-task': { artifactName: 'tasks.md', from: 'designed', to: 'tasked',
    replacements: (meta, id) => ({ 'change-id': id, 'design-source': `${id}/design.md`, 'from-state': meta.status, 'to-state': 'tasked' }) },
  'sdd-dev': { artifactName: 'implementation.md', from: 'tasked', to: 'developing',
    replacements: (meta, id) => ({ 'change-id': id, 'tasks-source': `${id}/tasks.md`, 'from-state': meta.status, 'to-state': 'developing', 'primary-repo': 'main' }) },
  'sdd-test': { artifactName: 'evidence/test-report.md', outSubDir: 'evidence', from: 'developing', to: 'testing',
    replacements: (meta, id) => ({ 'change-id': id, 'implementation-source': `${id}/implementation.md`, 'from-state': meta.status, 'to-state': 'testing' }) },
  'sdd-converge': { artifactName: 'convergence.md', from: 'testing', to: 'completed',
    replacements: (meta, id) => ({ 'change-id': id, 'from-state': meta.status, 'to-state': 'completed', 'standards-need-update': 'no', 'product-need-update': 'no', 'featuretree-need-update': 'no', 'glossary-need-update': 'no' }) },
};

async function runSkillStep({ ws, changeId, changeDir, skillId }, harness) {
  const cfg = SKILL_CONFIG_TEST[skillId];
  const metaBefore = await readMetadata(changeDir);
  if (metaBefore.status !== cfg.from) {
    // 若当前状态早于 from，顺序推进前置状态（created → exploring → ...）
    const { CHANGE_STATUSES, validateTransition } = await import('../core/sdd/change-state-machine.js');
    let cur = metaBefore.status;
    const fromIdx = CHANGE_STATUSES.indexOf(cfg.from);
    while (CHANGE_STATUSES.indexOf(cur) < fromIdx) {
      const nextStatus = CHANGE_STATUSES[CHANGE_STATUSES.indexOf(cur) + 1];
      validateTransition(cur, nextStatus);
      await patchStatus(changeDir, nextStatus);
      cur = nextStatus;
    }
  }
  const meta = await readMetadata(changeDir);
  assert.equal(meta.status, cfg.from, `skill ${skillId} requires status=${cfg.from}, got ${meta.status}`);

  // 1. 写 Artifact
  const replacements = cfg.replacements(meta, changeId);
  const outDir = cfg.outSubDir ? join(changeDir, cfg.outSubDir) : changeDir;
  const outName = cfg.artifactName.split('/').pop();
  const artifactPath = await writeArtifact(outDir, cfg.artifactName, { replacements, outputName: outName }, harness);
  assert.ok(await pathExists(artifactPath));
  const content = await readFile(artifactPath, 'utf8');
  assert.ok(content.includes(changeId), `${cfg.artifactName} missing change-id`);

  // 2. 不推进状态（Phase 1.5：Skill 产出 ≠ 阶段完成）
  //    状态保持 cfg.from，Artifact 仍是 draft
  //    状态推进迁移到 tests/integration.spec.js 走完整 TransitionService 链路
  const metaAfter = await readMetadata(changeDir);
  assert.equal(metaAfter.status, cfg.from, `skill ${skillId} 应保持状态 ${cfg.from}，实际 ${metaAfter.status}`);

  return { artifactPath };
}

test('SkillRunner: sdd-prd 写 prd.md + exploring→specified', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  const r = await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  const content = await readFile(r.artifactPath, 'utf8');
  assert.ok(content.includes('REQ-TEST')); // replacements.requirement
  assert.ok(content.includes('exploring → specified'));
  await rmrf(tmp);
});

test('SkillRunner: sdd-design 写 design.md + specified→designed', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  const cfg = SKILL_CONFIG_TEST['sdd-design'];
  // 先补前置到 specified
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  const r = await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-design' }, harnessRoot);
  const content = await readFile(r.artifactPath, 'utf8');
  assert.ok(content.includes(`${changeId}/prd.md`));
  assert.ok(content.includes('specified → designed'));
  assert.ok(content.includes('受影响仓库数: 1'));
  await rmrf(tmp);
});

test('SkillRunner: sdd-task 写 tasks.md + designed→tasked', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-design' }, harnessRoot);
  const r = await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-task' }, harnessRoot);
  const content = await readFile(r.artifactPath, 'utf8');
  assert.ok(content.includes(`${changeId}/design.md`));
  assert.ok(content.includes('designed → tasked'));
  await rmrf(tmp);
});

test('SkillRunner: sdd-dev 写 implementation.md + tasked→developing', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-design' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-task' }, harnessRoot);
  const r = await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-dev' }, harnessRoot);
  const content = await readFile(r.artifactPath, 'utf8');
  assert.ok(content.includes(`${changeId}/tasks.md`));
  assert.ok(content.includes('tasked → developing'));
  assert.ok(content.includes('| main | | |'));
  await rmrf(tmp);
});

test('SkillRunner: sdd-test 写 evidence/test-report.md + developing→testing', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-design' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-task' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-dev' }, harnessRoot);
  const r = await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-test' }, harnessRoot);
  assert.ok(r.artifactPath.includes(join('evidence', 'test-report.md')));
  const content = await readFile(r.artifactPath, 'utf8');
  assert.ok(content.includes(`${changeId}/implementation.md`));
  assert.ok(content.includes('developing → testing'));
  await rmrf(tmp);
});

test('SkillRunner: sdd-converge 写 convergence.md + testing→completed', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-design' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-task' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-dev' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-test' }, harnessRoot);
  const r = await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-converge' }, harnessRoot);
  const content = await readFile(r.artifactPath, 'utf8');
  assert.ok(content.includes('testing → completed'));
  assert.ok(content.includes('是否需更新: no')); // 4 个 need-update 都是 no
  await rmrf(tmp);
});

test('SkillRunner: 7 个 Skill 顺序串产出全量 Artifact（状态不推进到 completed）', async () => {
  const { tmp, changeId, changeDir } = await setupWorkspaceForSkillRunner();
  // 0. sdd-explore：created → exploring（写 requirement.md + exploration.md）
  const metaCreated = await readMetadata(changeDir);
  assert.equal(metaCreated.status, 'created');
  const { validateTransition } = await import('../core/sdd/change-state-machine.js');
  validateTransition('created', 'exploring');
  await patchStatus(changeDir, 'exploring');
  await writeArtifact(
    changeDir,
    'requirement.md',
    { replacements: {
        'requirement-id': 'REQ-TEST',
        'requirement-title': 'SkillRunner 测试需求',
        'requirement-content': '模拟的需求原文',
        'requirement-source': 'manual',
        'created-at': new Date().toISOString(),
      } },
    harnessRoot
  );
  await writeArtifact(
    changeDir,
    'exploration.md',
    { replacements: {
        'decision': '新建 CHG', 'new-candidate': 'no', 'matched-change-in-progress': 'none',
        'feature-path': 'none', 'change-id': changeId, 'from-state': 'created', 'to-state': 'exploring',
      } },
    harnessRoot
  );
  // 1~6. 6 个 Skill 串（runSkillStep 内部预推进到 cfg.from，但 Skill 本身不推进到 cfg.to）
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-prd' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-design' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-task' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-dev' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-test' }, harnessRoot);
  await runSkillStep({ ws: tmp, changeId, changeDir, skillId: 'sdd-converge' }, harnessRoot);
  // Phase 1.5：Skill 产出 ≠ 阶段完成，最终状态停在 sdd-converge 的 from（testing）
  //    completed 由 TransitionService 在 Machine Gate + Human Gate 通过后推进（见 integration.spec.js）
  const finalMeta = await readMetadata(changeDir);
  assert.equal(finalMeta.status, 'testing');

  // 验证 8 个 Artifact 都存在
  const expectedArtifacts = [
    'exploration.md', 'requirement.md',
    'prd.md', 'design.md', 'tasks.md', 'implementation.md',
    join('evidence', 'test-report.md'), 'convergence.md',
  ];
  for (const rel of expectedArtifacts) {
    assert.ok(await pathExists(join(changeDir, rel)), `missing artifact: ${rel}`);
  }
  await rmrf(tmp);
});
