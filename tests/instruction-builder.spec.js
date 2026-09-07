// Unit tests: Phase 2.6 InstructionBuilder 三 section（plans/phase-2.6-context-rules-design.md §11.2）
// 覆盖：Change Artifacts 注入 / 内联文件正文 / outline 文件清单 / missing 与 skipped 展示
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInstruction } from '../core/sdd/instruction-builder.js';

const SKILL = {
  id: 'sdd-prd',
  yaml: {
    id: 'sdd-prd',
    stage: 'prd',
    description: '产品规格 Skill',
    'requires-state': 'exploring',
    'produces-state': 'specified',
    'output-artifacts': ['spec.md'],
  },
  skillMd: '# SKILL 原文',
};

const mkContext = (files, extra = {}) => ({
  stage: 'prd',
  files,
  missingArtifacts: [],
  skipped: [],
  ...extra,
});

test('Change Artifacts section：change-artifact 与 auto 源均注入正文', () => {
  const ctx = mkContext([
    {
      path: 'delivery/changes/CHG-0001/requirement.md',
      content: 'REQ-MARKER',
      category: 'artifact',
      mode: 'inline',
      source: 'change-artifact',
    },
    {
      path: 'delivery/changes/CHG-0001/FEAT-001/STORY-001/DU-BE-001/metadata.yaml',
      content: 'DU-META-MARKER',
      category: 'artifact',
      mode: 'inline',
      source: 'auto',
    },
  ]);
  const md = buildInstruction(SKILL, ctx, { changeId: 'CHG-0001' });
  assert.ok(md.includes('## Change Artifacts'));
  assert.ok(md.includes('本 Change（CHG-0001）已有产物'));
  assert.ok(md.includes('### delivery/changes/CHG-0001/requirement.md'));
  assert.ok(md.includes('REQ-MARKER'));
  assert.ok(md.includes('DU-META-MARKER'), 'auto 源（DU metadata）也应注入正文');
});

test('内联文件 section：rule+content 注入正文；outline 条目进文件清单不进内联', () => {
  const ctx = mkContext([
    { path: 'standards/coding.md', content: 'STD-MARKER', category: 'knowledge', mode: 'inline', source: 'rule' },
    { path: 'product/roadmap.md', content: '', category: 'knowledge', mode: 'outline', source: 'rule' },
  ]);
  const md = buildInstruction(SKILL, ctx, {});
  assert.ok(md.includes('## Workspace Context（内联文件）'));
  assert.ok(md.includes('### standards/coding.md'));
  assert.ok(md.includes('STD-MARKER'));
  assert.ok(md.includes('## Workspace Context（文件清单）'));
  assert.ok(md.includes('- `product/roadmap.md`'));
  const inlineSection = md.split('## Workspace Context（文件清单）')[0];
  assert.ok(!inlineSection.includes('product/roadmap.md'), 'outline 条目不应出现在内联 section');
});

test('missing 与 skipped 展示', () => {
  const ctx = mkContext([], { missingArtifacts: ['spec.md (not found)'], skipped: ['big.md (over budget)'] });
  const md = buildInstruction(SKILL, ctx, {});
  assert.ok(md.includes('缺失产物（spec.md (not found)）'), md);
  assert.ok(md.includes('因预算截断未装载的文件：big.md (over budget)'), md);
});

test('无 Change Artifacts → （无）占位', () => {
  const md = buildInstruction(SKILL, mkContext([]), {});
  assert.ok(md.includes('## Change Artifacts'));
  const section = md.split('## Change Artifacts')[1].split('## Workspace Context（内联文件）')[0];
  assert.ok(section.includes('（无）'));
});

test('rule 条目无正文（content 为空）归入文件清单 section', () => {
  // inline 条目但文件读取失败 content='' → 按 outline 处理，避免空代码块
  const ctx = mkContext([
    { path: 'standards/missing.md', content: '', category: 'knowledge', mode: 'inline', source: 'rule' },
  ]);
  const md = buildInstruction(SKILL, ctx, {});
  const listSection = md.split('## Workspace Context（文件清单）')[1] || '';
  assert.ok(listSection.includes('standards/missing.md'));
  assert.ok(!md.includes('### standards/missing.md'), '无正文不应出现在内联 section');
});

// ---- Phase 2.7：DU 绑定 section + Repository Delivery Context ----

const DU_BINDING = {
  duId: 'DU-BE-001',
  repository: 'backend',
  repoPath: 'implementation/backend/delivery/CHG-0001/FEAT-001/FEAT-001-01/FEAT-001-01-01/STORY-001-01-01-01/DU-BE-001',
  materialized: true,
  activatedRepos: ['backend'],
  guidance: { sketch: true, pseudocode: true, 'complexity-trigger': ['business-flow'] },
};

test('DU 绑定 section：元信息 + Repo Delivery + guidance 渲染（pseudocode 必填）', () => {
  const md = buildInstruction(SKILL, mkContext([], { duBinding: DU_BINDING }), { changeId: 'CHG-0001' });
  assert.ok(md.includes('## DU 绑定'));
  assert.ok(md.includes('- Delivery Unit: DU-BE-001（repository: backend）'));
  assert.ok(md.includes('- Repo Delivery: `implementation/backend/delivery/CHG-0001/'));
  assert.ok(md.includes('Pseudocode 必填（trigger: business-flow）'));
  assert.ok(md.includes('Implementation Sketch 必填'));
  assert.ok(md.includes('Verification 必填'));
});

test('DU 绑定 section：未声明触发器 → Pseudocode 条件必填文案', () => {
  const md = buildInstruction(
    SKILL,
    mkContext([], { duBinding: { ...DU_BINDING, guidance: { sketch: true, pseudocode: false, 'complexity-trigger': [] } } }),
    { changeId: 'CHG-0001' }
  );
  assert.ok(md.includes('Pseudocode 条件必填（本 DU 未声明触发器，未命中时写 N/A + 理由）'));
});

test('Repository Delivery Context：repo 正文内联；repo outline 条目进文件清单（repo 标记）', () => {
  const ctx = mkContext(
    [
      { path: 'implementation/backend/delivery/CHG-0001/DU-BE-001/task.md', content: 'REPO-TASK-MARKER', category: 'artifact', mode: 'inline', source: 'repo' },
      { path: 'implementation/backend/src/A.java', content: '', category: 'code', mode: 'outline', source: 'repo' },
    ],
    { duBinding: DU_BINDING }
  );
  const md = buildInstruction(SKILL, ctx, { changeId: 'CHG-0001' });
  assert.ok(md.includes('## Repository Delivery Context'));
  assert.ok(md.includes('### implementation/backend/delivery/CHG-0001/DU-BE-001/task.md'));
  assert.ok(md.includes('REPO-TASK-MARKER'));
  const listSection = md.split('## Workspace Context（文件清单）')[1] || '';
  assert.ok(listSection.includes('- `implementation/backend/src/A.java`（repo）'), listSection);
});

test('DU 绑定但 repo 无内联文件 → （无 repo 侧内联文件）占位', () => {
  const md = buildInstruction(SKILL, mkContext([], { duBinding: DU_BINDING }), { changeId: 'CHG-0001' });
  assert.ok(md.includes('（无 repo 侧内联文件）'));
});

test('未物化 → DU 绑定 section 提示 materialize 命令', () => {
  const md = buildInstruction(
    SKILL,
    mkContext([], { duBinding: { ...DU_BINDING, materialized: false } }),
    { changeId: 'CHG-0001' }
  );
  assert.ok(md.includes('openspec du materialize CHG-0001 DU-BE-001'));
});

test('未绑定 DU → 不输出 DU 绑定与 Repository Delivery Context', () => {
  const md = buildInstruction(SKILL, mkContext([]), {});
  assert.ok(!md.includes('## DU 绑定'));
  assert.ok(!md.includes('## Repository Delivery Context'));
});
