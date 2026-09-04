// Unit tests: Doctor 结构检查 runStructureChecks（Phase 3.6）
// 锁定 CHG 四级骨架一致性体检（v0.4 去锚点）：遗留 README / 目录缺失 / 树名落后 / 未绑定跳过
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm, rename } from 'node:fs/promises';
import { runStructureChecks } from '../core/sdd/doctor-checks.js';
import { materializeChangeSkeleton } from '../core/sdd/change-skeleton.js';
import { readMetadata } from '../core/sdd/change-model.js';
import { readFeatureTree } from '../core/sdd/feature-model.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });

const TREE_YAML = `product:
  name: AI 平台
  description: 企业级 AI 能力平台
features:
  - id: FEAT-1
    name: 平台基座
    description: 基础能力
    children:
      - id: FEAT-1-01
        name: 账户能力
        description: 账户体系
        children:
          - id: FEAT-1-01-01
            name: 认证
            description: 登录认证
            stories:
              - id: STORY-2
                name: 用户登录
                description: 账密登录
                status: planned
`;

const CHG_META = `id: CHG-0002
title: 用户登录实现
status: created
feature-path:
  level-1: { id: FEAT-1, name: 平台基座 }
  level-2: { id: FEAT-1-01, name: 账户能力 }
  level-3: { id: FEAT-1-01-01, name: 认证 }
  story: { id: STORY-2, name: 用户登录 }
`;

async function ws() {
  const root = await mkdtemp(join(tmpdir(), 'sdd-doctor-st-'));
  await mkdir(join(root, 'product'), { recursive: true });
  await mkdir(join(root, 'product', 'features'), { recursive: true });
  await writeFile(join(root, 'product', 'feature-tree.yaml'), TREE_YAML);
  return root;
}

async function seedChange(root, { scope = 'changes', id = 'CHG-0002', meta = CHG_META } = {}) {
  const dir = join(root, 'delivery', scope, id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'metadata.yaml'), meta);
  return dir;
}

async function buildHealthySkeleton(root, opts) {
  const changeDir = await seedChange(root, opts);
  const meta = await readMetadata(changeDir);
  const tree = await readFeatureTree(root);
  await materializeChangeSkeleton(changeDir, meta, tree, root);
  return changeDir;
}

test('StructureChecks: 健康骨架（changes + archive）→ 无 issue 无 info', async () => {
  const root = await ws();
  await buildHealthySkeleton(root, { id: 'CHG-0002' });
  await buildHealthySkeleton(root, { scope: 'archive', id: 'CHG-0001' });

  const r = await runStructureChecks(root);
  assert.equal(r.checked, 2);
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.infos, []);
  await rmrf(root);
});

test('StructureChecks: 未绑定/candidate CHG → 跳过不计入', async () => {
  const root = await ws();
  await seedChange(root, { id: 'CHG-0003', meta: 'id: CHG-0003\ntitle: x\nstatus: created\n' });

  const r = await runStructureChecks(root);
  assert.equal(r.checked, 0);
  assert.deepEqual(r.issues, []);
  await rmrf(root);
});

test('StructureChecks: 骨架遗留 v0.3 锚点 README → issue（提示清理）', async () => {
  const root = await ws();
  const changeDir = await buildHealthySkeleton(root, { id: 'CHG-0002' });
  // v0.3 存量：手动放回一个锚点 README
  await writeFile(
    join(changeDir, '平台基座', '账户能力', '认证', '用户登录', 'README.md'),
    '---\nid: STORY-2\n---\n\n# 用户登录\n',
    'utf8'
  );

  const r = await runStructureChecks(root);
  assert.ok(
    r.issues.some((i) => i.includes('CHG-0002') && i.includes('遗留锚点 README')),
    r.issues.join('; ')
  );
  await rmrf(root);
});

test('StructureChecks: 无 README（v0.4 新常态）→ 无 issue', async () => {
  const root = await ws();
  await buildHealthySkeleton(root, { id: 'CHG-0002' });

  const r = await runStructureChecks(root);
  assert.ok(!r.issues.some((i) => i.includes('README')), r.issues.join('; '));
  await rmrf(root);
});

test('StructureChecks: 目录被手动改名（与 feature-path 名不符）→ 目录缺失 issue', async () => {
  const root = await ws();
  const changeDir = await buildHealthySkeleton(root, { id: 'CHG-0002' });
  // 模拟用户手动 rename 目录（metadata 旧名锚点失效场景）
  await rename(
    join(changeDir, '平台基座', '账户能力', '认证'),
    join(changeDir, '平台基座', '账户能力', '身份认证')
  );

  const r = await runStructureChecks(root);
  assert.ok(
    r.issues.some((i) => i.includes('CHG-0002') && i.includes('目录缺失') && i.includes('认证')),
    r.issues.join('; ')
  );
  await rmrf(root);
});

test('StructureChecks: 树改名未重跑 skeleton → info 引导同步（不阻断）', async () => {
  const root = await ws();
  await buildHealthySkeleton(root, { id: 'CHG-0002' });

  // 树改名（认证 → 身份认证），metadata.name 落后
  await writeFile(
    join(root, 'product', 'feature-tree.yaml'),
    TREE_YAML.replace('name: 认证', 'name: 身份认证')
  );

  const r = await runStructureChecks(root);
  assert.deepEqual(r.issues, [], '名字落后不是错误');
  assert.ok(
    r.infos.some((i) => i.includes('CHG-0002') && i.includes('落后于树') && i.includes('身份认证')),
    r.infos.join('; ')
  );
  await rmrf(root);
});

test('StructureChecks: 上级目录被手动删除 → issue 补报', async () => {
  const root = await ws();
  const changeDir = await buildHealthySkeleton(root, { id: 'CHG-0002' });
  await rmrf(join(changeDir, '平台基座', '账户能力', '认证'));

  const r = await runStructureChecks(root);
  assert.ok(
    r.issues.some((i) => i.includes('CHG-0002') && i.includes('目录缺失') && i.includes('认证')),
    r.issues.join('; ')
  );
  await rmrf(root);
});
