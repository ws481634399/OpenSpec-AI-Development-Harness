// Unit tests: ArtifactHash / GateConfigLoader / GateValidator / GateRepository
// 对齐 phase-1.5-workflow-engine-design.md §17.2 / §17.3
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, writeFile, rm, readFile, mkdir } from 'node:fs/promises';
import { parse, stringify } from 'yaml';
import { sha256, hashMatches } from '../core/sdd/artifact-hash.js';
import { loadGate, listGates } from '../core/sdd/gate-config-loader.js';
import { runMachineGate, headingSlug } from '../core/sdd/gate-validator.js';
import {
  readGateResult,
  writeMachineGate,
  writeHumanGate,
  patchArtifactStatus,
  readGateResultForStory,
  writeMachineGateForStory,
  writeHumanGateForStory,
  patchArtifactStatusForStory,
} from '../core/sdd/gate-repository.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, setEvidenceTier } from '../core/sdd/change-model.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'gate-repo-'));
  await runInit(
    {
      name: 'gate-test',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: 'Gate 测试', requirement: 'REQ-GATE', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

// ---- ArtifactHash ----

test('ArtifactHash: sha256 相同内容返回相同 hash', () => {
  const h1 = sha256('hello');
  const h2 = sha256('hello');
  assert.equal(h1, h2);
  assert.ok(h1.startsWith('sha256:'));
});

test('ArtifactHash: sha256 不同内容返回不同 hash', () => {
  assert.notEqual(sha256('hello'), sha256('world'));
});

test('ArtifactHash: hashMatches 一致返回 true', () => {
  const h = sha256('test');
  assert.ok(hashMatches(h, h));
});

test('ArtifactHash: hashMatches gateHash 为空返回 false', () => {
  assert.equal(hashMatches(sha256('test'), ''), false);
});

test('ArtifactHash: hashMatches 不一致返回 false', () => {
  assert.equal(hashMatches(sha256('a'), sha256('b')), false);
});

// ---- GateConfigLoader ----

test('GateConfigLoader: loadGate 返回 sdd-prd 正确配置', async () => {
  const g = await loadGate('sdd-prd', harnessRoot);
  assert.equal(g.stage, 'prd');
  assert.equal(g.artifact, 'spec.md');
  assert.ok(g['machine-checks'].includes('no-placeholder'));
  assert.ok(g['required-replacements'].includes('scope-in'));
  assert.ok(g['non-empty-ai-sections'].includes('## 1. 背景'));
  assert.ok(g['human-checks'].length > 0);
});

test('GateConfigLoader: 9 个 Skill 都有 gate.yaml', async () => {
  const ids = ['sdd-explore', 'sdd-prd', 'sdd-design', 'sdd-task', 'sdd-dev', 'sdd-test', 'sdd-converge', 'sdd-reverse', 'sdd-feature-tree', 'sdd-knowledge'];
  for (const id of ids) {
    const g = await loadGate(id, harnessRoot);
    assert.ok(g.stage, `${id} 应有 stage`);
    assert.ok(g.artifact, `${id} 应有 artifact`);
    assert.ok(Array.isArray(g['machine-checks']), `${id} 应有 machine-checks`);
  }
});

test('GateConfigLoader: 不存在的 Skill 抛错', async () => {
  await assert.rejects(() => loadGate('nonexistent-skill', harnessRoot), /Gate config not found/);
});

test('GateConfigLoader: listGates 返回 11 个（Phase 2.2 含 sdd-review）', async () => {
  const list = await listGates(harnessRoot);
  assert.equal(list.length, 11);
});

// ---- GateRepository ----

test('GateRepository: readGateResult 未初始化返回 draft + pending', async () => {
  const { tmp, changeDir } = await setupChange();
  const r = await readGateResult(changeDir, 'spec.md');
  assert.equal(r.status, 'draft');
  assert.equal(r.gates.machine.status, 'pending');
  assert.equal(r.gates.human.status, 'pending');
  assert.equal(r.gates.machine['artifact-hash'], '');
  await rmrf(tmp);
});

test('GateRepository: writeMachineGate + readGateResult ReadBack 全字段一致', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'spec.md', {
    status: 'passed',
    issues: [],
    artifactHash: 'sha256:abc',
    validator: 'sdd-prd',
  });
  const r = await readGateResult(changeDir, 'spec.md');
  assert.equal(r.gates.machine.status, 'passed');
  assert.equal(r.gates.machine['artifact-hash'], 'sha256:abc');
  assert.equal(r.gates.machine.validator, 'sdd-prd');
  assert.ok(r.gates.machine['checked-at']);
  assert.deepEqual(r.gates.machine.issues, []);
  await rmrf(tmp);
});

test('GateRepository: writeMachineGate failed 时 issues 全字段一致', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'spec.md', {
    status: 'failed',
    issues: ['占位符未替换: {{scope-in}}', 'section 内容为空: ## 1. 背景'],
    artifactHash: 'sha256:def',
    validator: 'sdd-prd',
  });
  const r = await readGateResult(changeDir, 'spec.md');
  assert.equal(r.gates.machine.status, 'failed');
  assert.equal(r.gates.machine.issues.length, 2);
  assert.equal(r.gates.machine.issues[0], '占位符未替换: {{scope-in}}');
  await rmrf(tmp);
});

test('GateRepository: writeHumanGate + readGateResult ReadBack 全字段一致', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeHumanGate(changeDir, 'spec.md', {
    status: 'approved',
    reviewer: 'tester',
    reason: '',
    artifactHash: 'sha256:abc',
  });
  const r = await readGateResult(changeDir, 'spec.md');
  assert.equal(r.gates.human.status, 'approved');
  assert.equal(r.gates.human.reviewer, 'tester');
  assert.equal(r.gates.human['artifact-hash'], 'sha256:abc');
  assert.ok(r.gates.human['reviewed-at']);
  assert.equal(r.gates.human.reason, '');
  await rmrf(tmp);
});

test('GateRepository: patchArtifactStatus 更新 status', async () => {
  const { tmp, changeDir } = await setupChange();
  await patchArtifactStatus(changeDir, 'spec.md', 'accepted');
  const r = await readGateResult(changeDir, 'spec.md');
  assert.equal(r.status, 'accepted');
  await rmrf(tmp);
});

test('GateRepository: evidence/test-report.md 的 key 是 test-report', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'evidence/test-report.md', {
    status: 'passed',
    artifactHash: 'sha256:xyz',
    validator: 'sdd-test',
  });
  const meta = parse(await readFile(join(changeDir, 'metadata.yaml'), 'utf8'));
  assert.ok(meta.artifacts['test-report'], 'key 应为 test-report');
  assert.equal(meta.artifacts['test-report'].path, 'evidence/test-report.md');
  await rmrf(tmp);
});

// ---- GateValidator ----

test('GateValidator: Artifact 不存在返回 passed:false + 空 hash', async () => {
  const { tmp, changeDir } = await setupChange();
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.equal(r.artifactHash, '');
  assert.ok(r.issues.some((i) => i.includes('Artifact not found')));
  await rmrf(tmp);
});

test('GateValidator: 占位符未替换 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值\n\n## 5. 验收标准\n标准\n\n## 6. 成功指标\n本期不度量\n\n{{scope-in}} {{scope-out}}',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('{{scope-in}}')));
  assert.ok(r.artifactHash.startsWith('sha256:'));
  await rmrf(tmp);
});

test('GateValidator: section 缺失 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景\n\n## 2. 用户价值\n价值\n',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('## 5. 验收标准')));
  await rmrf(tmp);
});

test('GateValidator: 完整 spec.md（占位符全替换 + sections 非空）→ passed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 3. 范围\n### 3.1 包含\nA\n### 3.2 不包含\nB\n\n## 4. 业务规则\n规则\n\n## 5. 验收标准\n标准内容\n\n## 6. 成功指标\n本期不度量\n',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, r.issues.join('; '));
  assert.ok(r.artifactHash.startsWith('sha256:'));
  await rmrf(tmp);
});

test('GateValidator: section 仅含注释 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n<!-- AI 填写 -->\n\n## 2. 用户价值\n价值内容\n\n## 5. 验收标准\n标准内容\n',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('## 1. 背景') && i.includes('空')));
  await rmrf(tmp);
});

// ---- GateValidator Phase 4.1 轻量化（severity / skip-tier / Evidence 分档）----

test('GateValidator: advisory fail 只进 warnings 不阻断（passed: true）', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 5. 验收标准\n标准内容\n\nCHG-9999/missing.md',
    'utf8'
  );
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  // 把 cross-reference-valid 覆盖为 advisory（引用不存在的文件 → 只警告）
  gateConfig['machine-checks'] = [
    'no-placeholder',
    { id: 'cross-reference-valid', severity: 'advisory' },
  ];
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true);
  assert.equal(r.issues.length, 0);
  assert.ok(r.warnings.some((w) => w.includes('cross-reference') || w.includes('不存在')));
  await rmrf(tmp);
});

test('GateValidator: skip-tier 命中 evidence-tier 时整条跳过', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 5. 验收标准\n标准内容\n\n{{scope-in}}',
    'utf8'
  );
  // 设置 light 档
  await setEvidenceTier(changeDir, 'light');
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  gateConfig['machine-checks'] = [
    { id: 'no-placeholder', 'skip-tier': ['light'] }, // 命中 light → 跳过
    'no-placeholder', // 字符串条目不跳过 → 仍然失败
  ];
  const r = await runMachineGate(changeDir, gateConfig);
  // skip-tier 条目跳过，但字符串条目仍检查占位符 → failed
  assert.equal(r.passed, false);
  assert.equal(r.issues.filter((i) => i.includes('{{scope-in}}')).length, 1);
  await rmrf(tmp);
});

test('GateValidator: skip-tier 不命中时检查照常执行', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'spec.md'),
    '# PRD\n\n## 0. 元信息\n\n## 1. 背景\n背景内容\n\n## 2. 用户价值\n价值内容\n\n## 5. 验收标准\n标准内容\n\n{{scope-in}}',
    'utf8'
  );
  // 缺省 standard 档，不命中 light
  const gateConfig = await loadGate('sdd-prd', harnessRoot);
  gateConfig['machine-checks'] = [{ id: 'no-placeholder', 'skip-tier': ['light'] }];
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('{{scope-in}}')));
  await rmrf(tmp);
});

test('GateValidator: 主流程 gate.yaml 轻量化配置正确（Phase 4.1）', async () => {
  // sdd-dev: evidence-coverage / du-materialized 对 light 跳过
  const dev = await loadGate('sdd-dev', harnessRoot);
  const devEvidence = dev['machine-checks'].find((e) => typeof e === 'object' && e.id === 'evidence-coverage');
  assert.deepEqual(devEvidence['skip-tier'], ['light']);
  const devMaterialized = dev['machine-checks'].find((e) => typeof e === 'object' && e.id === 'du-materialized');
  assert.deepEqual(devMaterialized['skip-tier'], ['light']);
  // sdd-converge: all-predecessors-accepted 保持 blocking（字符串条目），submodule-pointer-aligned 对 light 跳过
  const converge = await loadGate('sdd-converge', harnessRoot);
  assert.ok(converge['machine-checks'].includes('all-predecessors-accepted'));
  const sub = converge['machine-checks'].find((e) => typeof e === 'object' && e.id === 'submodule-pointer-aligned');
  assert.deepEqual(sub['skip-tier'], ['light']);
  // sdd-converge: 缺陷 10 收口——全局验收标准对照节进入机检（非空）与人审清单
  assert.ok(converge['non-empty-ai-sections'].includes('## 4. 全局验收标准对照'));
  assert.ok(converge['human-checks'].includes('## 4. 全局验收标准对照'));
  // sdd-prd: cross-reference-valid 降 advisory
  const prd = await loadGate('sdd-prd', harnessRoot);
  const xref = prd['machine-checks'].find((e) => typeof e === 'object' && e.id === 'cross-reference-valid');
  assert.equal(xref.severity, 'advisory');
});

// ---- Evidence 分档 CLI（setEvidenceTier）----

test('EvidenceTier: setEvidenceTier 写入 metadata 并可读回', async () => {
  const { tmp, changeDir } = await setupChange();
  await setEvidenceTier(changeDir, 'light');
  const meta = await readMetadata(changeDir);
  assert.equal(meta['evidence-tier'], 'light');
  await setEvidenceTier(changeDir, 'strict');
  const meta2 = await readMetadata(changeDir);
  assert.equal(meta2['evidence-tier'], 'strict');
  await rmrf(tmp);
});

test('EvidenceTier: 非法档位抛错且提示合法值', async () => {
  const { tmp, changeDir } = await setupChange();
  await assert.rejects(() => setEvidenceTier(changeDir, 'heavy'), /Invalid evidence-tier.*light\/standard\/strict/);
  await rmrf(tmp);
});

// ---- 缺陷 4 修复：## section 下直接接 ### 子标题不算空 ----

test('GateValidator: ## section 下直接接 ### 子标题 → 不再误报内容为空（缺陷 4）', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'design.md'),
    [
      '# Design',
      '',
      '## 1. 当前状态',
      '### 1.1 当前实现',
      '当前实现说明',
      '',
      '## 2. 方案',
      '方案内容',
      '',
    ].join('\n'),
    'utf8'
  );
  const gateConfig = {
    artifact: 'design.md',
    'machine-checks': ['required-sections'],
    'non-empty-ai-sections': ['## 1. 当前状态', '## 2. 方案'],
  };
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, true, r.issues.join('; '));
  await rmrf(tmp);
});

test('GateValidator: section 下真正为空仍报错（缺陷 4 回归保护）', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeFile(
    join(changeDir, 'design.md'),
    ['# Design', '', '## 1. 当前状态', '', '## 2. 方案', '方案内容', ''].join('\n'),
    'utf8'
  );
  const gateConfig = {
    artifact: 'design.md',
    'machine-checks': ['required-sections'],
    'non-empty-ai-sections': ['## 1. 当前状态', '## 2. 方案'],
  };
  const r = await runMachineGate(changeDir, gateConfig);
  assert.equal(r.passed, false);
  assert.ok(r.issues.some((i) => i.includes('## 1. 当前状态')));
  await rmrf(tmp);
});

// ---- 缺陷 8 修复：metadata 写入保持块式 YAML ----

test('GateRepository: 多轮 Gate 写入后 metadata 保持块式（缺陷 8）', async () => {
  const { tmp, changeDir } = await setupChange();
  await writeMachineGate(changeDir, 'spec.md', {
    status: 'passed',
    issues: [],
    warnings: ['advisory-w'],
    artifactHash: 'sha256:abc',
    validator: 'sdd-prd',
  });
  await writeHumanGate(changeDir, 'spec.md', {
    status: 'approved',
    reviewer: 'user',
    artifactHash: 'sha256:abc',
  });
  await patchArtifactStatus(changeDir, 'spec.md', 'accepted');
  const raw = await readFile(join(changeDir, 'metadata.yaml'), 'utf8');
  // 流式嵌套形态（人工编辑易坏）必须消失
  assert.doesNotMatch(raw, /gates: \{/);
  assert.doesNotMatch(raw, /machine: \{/);
  assert.doesNotMatch(raw, /human: \{/);
  // 块式结构与数据完整
  assert.match(raw, /gates:\n/);
  assert.match(raw, /status: passed/);
  assert.match(raw, /reviewer: user/);
  assert.match(raw, /warnings:\n {10}- advisory-w/);
  // 仍可被正常解析读回
  const gateResult = await readGateResult(changeDir, 'spec.md');
  assert.equal(gateResult.gates.machine.status, 'passed');
  assert.equal(gateResult.gates.human.reviewer, 'user');
  await rmrf(tmp);
});

// ---- Phase 4.2 三级规格分层：Gate 分层分发 + Story 级检查项 ----

/** 把 CHG 转为 3-tier 多 Story 形态（stories 列表 inline=false），并创建 Story 目录骨架。 */
async function toThreeTier(changeDir, storyId = 'STORY-1') {
  const meta = await readMetadata(changeDir);
  meta['schema-version'] = 3;
  meta.stories = [
    { id: storyId, title: 'Story 1', inline: false, path: `stories/${storyId}/`, status: 'pending' },
  ];
  delete meta['feature-path'];
  await writeFile(join(changeDir, 'metadata.yaml'), stringify(meta), 'utf8');
  const storyDir = join(changeDir, 'stories', storyId);
  await mkdir(storyDir, { recursive: true });
  await writeFile(
    join(storyDir, 'story-metadata.yaml'),
    ['schema-version: 1', `story-id: ${storyId}`, 'evidence-tier: standard', 'artifacts: {}'].join('\n'),
    'utf8'
  );
  return { meta, storyDir };
}

/** Change PRD（CHG 根，含 [S<n>] 编号条目与章节锚点）。 */
async function writeChangePrd(changeDir) {
  await writeFile(
    join(changeDir, 'change-spec.md'),
    [
      '# Change PRD',
      '',
      '## 1. 背景',
      '',
      '背景内容 {{target-user}}',
      '',
      '## 3. 功能范围',
      '',
      '### 3.1 包含',
      '',
      '- [S1] 用户登录',
      '- [S2] 权限管理',
      '',
      '## 5. 全局验收标准',
      '',
      '验收内容',
    ].join('\n'),
    'utf8'
  );
}

test('headingSlug: GitHub 风格 slug（中文/编号/空格）', () => {
  assert.equal(headingSlug('3.2 Story 1 功能范围'), '32-story-1-功能范围');
  assert.equal(headingSlug('## 5. 全局验收标准'), '5-全局验收标准');
  assert.equal(headingSlug('Interface Contract (v1)'), 'interface-contract-v1');
});

test('GateRepository: ForStory 3-tier 写入 story-metadata.yaml（Gate 分层）', async () => {
  const { tmp, changeDir } = await setupChange();
  const { meta, storyDir } = await toThreeTier(changeDir);
  await writeMachineGateForStory(changeDir, meta, 'STORY-1', 'story-spec.md', {
    status: 'failed',
    issues: ['e1'],
    warnings: ['w1'],
    artifactHash: 'sha256:s1',
    validator: 'sdd-prd',
  });
  await writeHumanGateForStory(changeDir, meta, 'STORY-1', 'story-spec.md', {
    status: 'approved',
    reviewer: 'user',
    artifactHash: 'sha256:s1',
  });
  await patchArtifactStatusForStory(changeDir, meta, 'STORY-1', 'story-spec.md', 'accepted');
  // 3-tier：写入 stories/STORY-1/story-metadata.yaml
  const raw = await readFile(join(storyDir, 'story-metadata.yaml'), 'utf8');
  assert.match(raw, /story-spec:/);
  assert.match(raw, /status: failed/);
  const r = await readGateResultForStory(changeDir, meta, 'STORY-1', 'story-spec.md');
  assert.equal(r.status, 'accepted');
  assert.equal(r.gates.machine.status, 'failed');
  assert.deepEqual(r.gates.machine.issues, ['e1']);
  assert.equal(r.gates.human.reviewer, 'user');
  // Change 级 metadata.yaml 未被 Story Gate 污染
  const chgR = await readGateResult(changeDir, 'story-spec.md');
  assert.equal(chgR.gates.machine.status, 'pending');
  await rmrf(tmp);
});

test('GateRepository: ForStory inline 单 Story 复用 CHG metadata.yaml（双语义合并）', async () => {
  const { tmp, changeDir } = await setupChange();
  const meta = await readMetadata(changeDir);
  // inline：stories 为空 / inline=true → 复用 Change 级 artifacts 段
  await writeMachineGateForStory(changeDir, meta, 'STORY-X', 'spec.md', {
    status: 'passed',
    issues: [],
    warnings: [],
    artifactHash: 'sha256:i1',
  });
  const r = await readGateResultForStory(changeDir, meta, 'STORY-X', 'spec.md');
  assert.equal(r.gates.machine.status, 'passed');
  const raw = await readFile(join(changeDir, 'metadata.yaml'), 'utf8');
  assert.match(raw, /spec:/);
  await rmrf(tmp);
});

test('GateValidator: change3 mode（多 Story）检查 change-spec.md 并使用 change 专用段', async () => {
  const { tmp, changeDir } = await setupChange();
  await toThreeTier(changeDir);
  // spec.md 不存在、change-spec.md 存在 → change3 分发到 change-spec.md
  await writeChangePrd(changeDir);
  const gateConfig = {
    stage: 'prd',
    artifact: 'spec.md',
    'machine-checks': ['required-sections', 'no-placeholder'],
    'required-replacements': ['scope-in'],
    'non-empty-ai-sections': ['## 1. 背景'],
    'three-tier': {
      'change-artifact': 'change-spec.md',
      'change-non-empty-ai-sections': ['## 5. 全局验收标准'],
      'change-required-replacements': [],
    },
  };
  const r = await runMachineGate(changeDir, gateConfig);
  // change3 段生效：## 5. 全局验收标准 非空 → passed；若回落共享段（## 1. 背景 在 change-spec 存在）也过，
  // 关键断言：artifactName 是 change-spec.md（构造占位符失败场景验证）
  const gateConfig2 = {
    ...gateConfig,
    'three-tier': { ...gateConfig['three-tier'], 'change-required-replacements': ['target-user'] },
  };
  const r2 = await runMachineGate(changeDir, gateConfig2);
  assert.ok(
    r2.issues.some((i) => i.startsWith('change-spec.md: 占位符未替换')),
    `应检查 change-spec.md 的 change 专用占位符，实际: ${JSON.stringify(r2.issues)}`
  );
  assert.ok(!r2.issues.some((i) => i.startsWith('spec.md:')), '不应回落检查 spec.md');
  await rmrf(tmp);
});

test('GateValidator: story mode 路径分发到 stories/<id>/story-spec.md', async () => {
  const { tmp, changeDir } = await setupChange();
  await toThreeTier(changeDir);
  await writeChangePrd(changeDir);
  const storyDir = join(changeDir, 'stories', 'STORY-1');
  // story-spec.md 存在且合法；spec.md 不存在 → story mode 检查的是 story-spec.md
  await writeFile(
    join(storyDir, 'story-spec.md'),
    [
      '---',
      'story-id: STORY-1',
      'change-spec-ref: "change-spec.md#31-包含"',
      'scope-refs: [S1]',
      '---',
      '',
      '# Story Spec',
      '',
      '## 1. Story 目标',
      '',
      '目标内容',
    ].join('\n'),
    'utf8'
  );
  const gateConfig = {
    stage: 'prd',
    artifact: 'spec.md',
    'machine-checks': [],
    'three-tier': {
      'story-artifact': 'story-spec.md',
      'story-machine-checks': [
        { id: 'change-ref-bound', field: 'change-spec-ref' },
        { id: 'scope-subset', target: 'change' },
      ],
      'story-required-replacements': [],
      'story-non-empty-ai-sections': ['## 1. Story 目标'],
    },
  };
  const r = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.deepEqual(r.issues, [], `合法 story-spec 应全部通过，实际: ${JSON.stringify(r.issues)}`);
  assert.notEqual(r.artifactHash, '');
  await rmrf(tmp);
});

test('GateValidator: change-ref-bound 空 ref / 锚点不存在 → failed（blocking）', async () => {
  const { tmp, changeDir } = await setupChange();
  await toThreeTier(changeDir);
  await writeChangePrd(changeDir);
  const storyDir = join(changeDir, 'stories', 'STORY-1');
  const gateConfig = {
    stage: 'prd',
    artifact: 'spec.md',
    'machine-checks': [],
    'three-tier': {
      'story-artifact': 'story-spec.md',
      'story-machine-checks': [{ id: 'change-ref-bound', field: 'change-spec-ref' }],
    },
  };
  // 场景 1：ref 为空
  await writeFile(
    join(storyDir, 'story-spec.md'),
    '---\nstory-id: STORY-1\nchange-spec-ref: ""\n---\n\n# Story Spec\n',
    'utf8'
  );
  const r1 = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(r1.issues.some((i) => i.includes('change-spec-ref 为空')));
  // 场景 2：锚点不存在
  await writeFile(
    join(storyDir, 'story-spec.md'),
    '---\nstory-id: STORY-1\nchange-spec-ref: "change-spec.md#99-不存在章节"\n---\n',
    'utf8'
  );
  const r2 = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(r2.issues.some((i) => i.includes('锚点不存在')));
  // 场景 3：缺锚点
  await writeFile(
    join(storyDir, 'story-spec.md'),
    '---\nstory-id: STORY-1\nchange-spec-ref: "change-spec.md"\n---\n',
    'utf8'
  );
  const r3 = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(r3.issues.some((i) => i.includes('缺少章节锚点')));
  await rmrf(tmp);
});

test('GateValidator: scope-subset(target=change) 空 scope-refs / 引用不存在 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await toThreeTier(changeDir);
  await writeChangePrd(changeDir);
  const storyDir = join(changeDir, 'stories', 'STORY-1');
  const gateConfig = {
    stage: 'prd',
    artifact: 'spec.md',
    'machine-checks': [],
    'three-tier': {
      'story-artifact': 'story-spec.md',
      'story-machine-checks': [{ id: 'scope-subset', target: 'change' }],
    },
  };
  // 场景 1：scope-refs 为空（change-spec 已用编号条目）
  await writeFile(
    join(storyDir, 'story-spec.md'),
    '---\nstory-id: STORY-1\nscope-refs: []\n---\n',
    'utf8'
  );
  const r1 = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(r1.issues.some((i) => i.includes('scope-refs 为空')));
  // 场景 2：引用不存在的编号
  await writeFile(
    join(storyDir, 'story-spec.md'),
    '---\nstory-id: STORY-1\nscope-refs: [S1, S9]\n---\n',
    'utf8'
  );
  const r2 = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(r2.issues.some((i) => i.includes('[S9]')));
  assert.ok(!r2.issues.some((i) => i.includes('[S1]')), '合法引用 S1 不应报错');
  await rmrf(tmp);
});

test('GateValidator: scope-subset(target=du) DU 引用越界 → failed，无引用 → warning', async () => {
  const { tmp, changeDir } = await setupChange();
  await toThreeTier(changeDir);
  await writeChangePrd(changeDir);
  const storyDir = join(changeDir, 'stories', 'STORY-1');
  await writeFile(
    join(storyDir, 'story-spec.md'),
    '---\nstory-id: STORY-1\nscope-refs: [S1]\n---\n',
    'utf8'
  );
  await writeFile(join(storyDir, 'tasks.md'), '## 任务清单\n\n内容\n', 'utf8');
  const duDir = join(storyDir, 'du', 'DU-MAIN-001');
  await mkdir(duDir, { recursive: true });
  await writeFile(
    join(duDir, 'metadata.yaml'),
    stringify({ id: 'DU-MAIN-001', repository: 'main', scope: ['[S1] 登录接口', '[S2] 越界条目'], acceptance: ['a'] }),
    'utf8'
  );
  const duDir2 = join(storyDir, 'du', 'DU-MAIN-002');
  await mkdir(duDir2, { recursive: true });
  await writeFile(
    join(duDir2, 'metadata.yaml'),
    stringify({ id: 'DU-MAIN-002', repository: 'main', scope: ['无编号自由条目'], acceptance: ['a'] }),
    'utf8'
  );
  const gateConfig = {
    stage: 'task',
    artifact: 'tasks.md',
    'machine-checks': [],
    'three-tier': {
      'story-artifact': 'tasks.md',
      'story-machine-checks': [{ id: 'scope-subset', target: 'du' }],
    },
  };
  const r = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(
    r.issues.some((i) => i.includes('DU-MAIN-001') && i.includes('[S2]') && i.includes('DU Scope ⊆ Story Scope')),
    `越界引用应 blocking，实际: ${JSON.stringify(r.issues)}`
  );
  assert.ok(!r.issues.some((i) => i.includes('[S1]') && i.includes('DU-MAIN-001')), '合法引用不报错');
  assert.ok(
    r.warnings.some((i) => i.includes('DU-MAIN-002') && i.includes('无 [S<n>] 引用')),
    '无引用 DU 仅 warning'
  );
  await rmrf(tmp);
});

test('GateValidator: repo-subset story-design 仓库超集 → failed', async () => {
  const { tmp, changeDir } = await setupChange();
  await toThreeTier(changeDir);
  await writeFile(
    join(changeDir, 'change-design.md'),
    '---\naffected-repositories: [main]\n---\n\n# Change Design\n',
    'utf8'
  );
  await writeFile(
    join(changeDir, 'stories', 'STORY-1', 'story-design.md'),
    '---\naffected-repositories: [main, other]\n---\n\n# Story Design\n',
    'utf8'
  );
  const gateConfig = {
    stage: 'design',
    artifact: 'design.md',
    'machine-checks': [],
    'three-tier': {
      'story-artifact': 'story-design.md',
      'story-machine-checks': ['repo-subset'],
    },
  };
  const r = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.ok(r.issues.some((i) => i.includes("'other'") && i.includes('Story 仓库 ⊆ Change 仓库')));
  assert.ok(!r.issues.some((i) => i.includes("'main'")), '合法仓库不报错');
  await rmrf(tmp);
});

test('GateValidator: story mode evidence-tier 取 Story metadata 覆盖（skip-tier 生效）', async () => {
  const { tmp, changeDir } = await setupChange();
  const { storyDir } = await toThreeTier(changeDir);
  // Story metadata evidence-tier: light → skip-tier: [light] 的检查整条跳过
  await writeFile(
    join(storyDir, 'story-metadata.yaml'),
    ['schema-version: 1', 'story-id: STORY-1', 'evidence-tier: light', 'artifacts: {}'].join('\n'),
    'utf8'
  );
  await writeFile(join(storyDir, 'story-spec.md'), '---\nstory-id: STORY-1\n---\n', 'utf8');
  const gateConfig = {
    stage: 'prd',
    artifact: 'spec.md',
    'machine-checks': [],
    'three-tier': {
      'story-artifact': 'story-spec.md',
      'story-machine-checks': [{ id: 'change-ref-bound', field: 'change-spec-ref', 'skip-tier': ['light'] }],
    },
  };
  // change-spec.md 不存在：若检查执行必然报"引用的 change-spec.md 不存在"；light 档跳过 → 无 issue
  const r = await runMachineGate(changeDir, gateConfig, { storyId: 'STORY-1' });
  assert.deepEqual(r.issues, []);
  await rmrf(tmp);
});
