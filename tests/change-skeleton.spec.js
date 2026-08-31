// Unit tests: CHG 内部四级骨架物化 + product/features 四级投影（Phase 3.5 plans/phase-3.5-four-level-paths-design.md §3）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import { parse } from 'yaml';
import { materializeChangeSkeleton, findChangeDirAny } from '../core/sdd/change-skeleton.js';
import { materializeFeatures, checkFeaturesProjection } from '../core/sdd/feature-materializer.js';
import { readMetadata } from '../core/sdd/change-model.js';
import { readFeatureTree } from '../core/sdd/feature-model.js';

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));
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

const ARCHIVE_META = `id: CHG-0001
title: 系统基线
status: completed
feature-path:
  level-1: { id: FEAT-1, name: 平台基座 }
  level-2: { id: FEAT-1-01, name: 账户能力 }
  level-3: { id: FEAT-1-01-01, name: 认证 }
  story: { id: STORY-2, name: 用户登录 }
`;

async function ws() {
  const root = await mkdtemp(join(tmpdir(), 'sdd-skel-'));
  await mkdir(join(root, 'product'), { recursive: true });
  await mkdir(join(root, 'product', 'features'), { recursive: true });
  await writeFile(join(root, 'product', 'feature-tree.yaml'), TREE_YAML);
  return root;
}

async function seedChange(root, { scope = 'changes', id = 'CHG-0002', meta = CHG_META, candidate = false } = {}) {
  const dir = join(root, 'delivery', scope, id);
  await mkdir(dir, { recursive: true });
  let m = meta;
  if (candidate) {
    m = meta.replace('feature-path:', 'feature-path:\n  candidate: true');
  }
  await writeFile(join(dir, 'metadata.yaml'), m);
  return dir;
}

// ---- change-skeleton ----
// Phase 3.5 修订 v0.3：目录段为纯业务名（平台基座/账户能力/认证/用户登录）

test('materializeChangeSkeleton: 生成四级目录（业务名）+ STORY README（front-matter 含 bound-chg）', async () => {
  const root = await ws();
  const changeDir = await seedChange(root);
  const meta = await readMetadata(changeDir);
  const tree = await readFeatureTree(root);

  const r = await materializeChangeSkeleton(changeDir, meta, tree, root);
  assert.equal(r.skipped, false);
  assert.ok(r.created.includes(join('平台基座', '账户能力', '认证', '用户登录')));
  assert.ok(r.created.includes(join('平台基座', '账户能力', '认证', '用户登录', 'README.md')));

  const storyDir = join(changeDir, '平台基座', '账户能力', '认证', '用户登录');
  assert.ok(await pathExists(storyDir));
  const readme = await readFile(join(storyDir, 'README.md'), 'utf8');
  const fm = parse(readme.split('---')[1]);
  assert.equal(fm.id, 'STORY-2');
  assert.equal(fm['bound-chg'], 'CHG-0002');
  assert.equal(fm.level, 'story');
  assert.ok(readme.includes('# 用户登录'));
  await rmrf(root);
});

test('materializeChangeSkeleton: 幂等——二次运行 README 不覆盖，目录不重建', async () => {
  const root = await ws();
  const changeDir = await seedChange(root);
  const meta = await readMetadata(changeDir);
  const tree = await readFeatureTree(root);

  await materializeChangeSkeleton(changeDir, meta, tree, root);
  const readmePath = join(changeDir, '平台基座', '账户能力', '认证', '用户登录', 'README.md');
  // 用户编辑 README 正文（保留 front-matter 锚点，锚点被删会破坏 rename 同步）
  const original = await readFile(readmePath, 'utf8');
  const fmPart = original.split('---').slice(0, 3).join('---');
  await writeFile(readmePath, `${fmPart}\n\n# 用户自定义内容\n`);
  const r = await materializeChangeSkeleton(changeDir, meta, tree, root);
  assert.equal(r.created.length, 0); // 全部已存在
  assert.ok((await readFile(readmePath, 'utf8')).includes('# 用户自定义内容'));
  await rmrf(root);
});

test('materializeChangeSkeleton: candidate / 未绑定 / 链不完整 → skipped + reason', async () => {
  const root = await ws();
  const tree = await readFeatureTree(root);
  // candidate
  let changeDir = await seedChange(root, { candidate: true });
  let meta = await readMetadata(changeDir);
  let r = await materializeChangeSkeleton(changeDir, meta, tree, root);
  assert.equal(r.skipped, true);
  assert.match(r.reason, /Candidate/);
  // 未绑定
  changeDir = await seedChange(root, { id: 'CHG-0003', meta: 'id: CHG-0003\ntitle: x\nstatus: created\n' });
  meta = await readMetadata(changeDir);
  r = await materializeChangeSkeleton(changeDir, meta, tree, root);
  assert.equal(r.skipped, true);
  assert.match(r.reason, /未绑定/);
  // 链不完整（缺 level-3）
  changeDir = await seedChange(root, {
    id: 'CHG-0004',
    meta: `id: CHG-0004\ntitle: x\nstatus: created\nfeature-path:\n  level-1: { id: FEAT-1, name: a }\n  level-2: { id: FEAT-1-01, name: b }\n  story: { id: STORY-2, name: c }\n`,
  });
  meta = await readMetadata(changeDir);
  r = await materializeChangeSkeleton(changeDir, meta, tree, root);
  assert.equal(r.skipped, true);
  assert.match(r.reason, /不完整/);
  await rmrf(root);
});

test('findChangeDirAny: changes 命中 / archive 命中 / 均无 → null', async () => {
  const root = await ws();
  await seedChange(root, { id: 'CHG-0002', meta: CHG_META });
  await seedChange(root, { scope: 'archive', id: 'CHG-0001', meta: ARCHIVE_META });

  let f = await findChangeDirAny(root, 'CHG-0002');
  assert.equal(f.scope, 'changes');
  f = await findChangeDirAny(root, 'CHG-0001');
  assert.equal(f.scope, 'archive');
  f = await findChangeDirAny(root, 'CHG-9999');
  assert.equal(f, null);
  await rmrf(root);
});

test('CLI 集成语义: 对归档 CHG 补骨架（skeleton 命令核心路径）', async () => {
  const root = await ws();
  const dir = await seedChange(root, { scope: 'archive', id: 'CHG-0001', meta: ARCHIVE_META });
  const found = await findChangeDirAny(root, 'CHG-0001');
  const meta = await readMetadata(found.dir);
  const tree = await readFeatureTree(root);
  const r = await materializeChangeSkeleton(found.dir, meta, tree, root);
  assert.equal(r.skipped, false);
  assert.ok(await pathExists(join(dir, '平台基座', '账户能力', '认证', '用户登录', 'README.md')));
  await rmrf(root);
});

test('materializeChangeSkeleton: CHG 根存量产物迁移至 STORY 目录 + 树改名目录 rename', async () => {
  const root = await ws();
  const changeDir = await seedChange(root);
  // 模拟 explore 阶段落在 CHG 根的存量产物
  await writeFile(join(changeDir, 'requirement.md'), '# 需求');
  await mkdir(join(changeDir, 'evidence'), { recursive: true });
  await writeFile(join(changeDir, 'evidence', 'evidence.yaml'), 'items: []');
  const meta = await readMetadata(changeDir);
  const tree = await readFeatureTree(root);

  let r = await materializeChangeSkeleton(changeDir, meta, tree, root);
  assert.deepEqual(r.migrated.sort(), ['evidence', 'requirement.md']);
  const storyDir = join(changeDir, '平台基座', '账户能力', '认证', '用户登录');
  assert.ok(await pathExists(join(storyDir, 'requirement.md')));
  assert.ok(await pathExists(join(storyDir, 'evidence', 'evidence.yaml')));
  // CHG 根只留 metadata.yaml + 四级骨架 L1 目录
  let rootEntries = (await readdir(changeDir, { withFileTypes: true })).map((e) => e.name);
  assert.deepEqual(rootEntries.sort(), ['metadata.yaml', '平台基座']);

  // 树改名（认证 → 身份认证；用户登录 → 账密登录）→ 锚点 rename 同步
  await writeFile(
    join(root, 'product', 'feature-tree.yaml'),
    TREE_YAML.replace('name: 认证', 'name: 身份认证').replace('name: 用户登录', 'name: 账密登录')
  );
  const tree2 = await readFeatureTree(root);
  const meta2 = await readMetadata(changeDir);
  r = await materializeChangeSkeleton(changeDir, meta2, tree2, root);
  assert.equal(r.nameSynced, true);
  assert.ok(r.renamed.length >= 2); // L3 与 STORY 两级改名
  assert.ok(await pathExists(join(changeDir, '平台基座', '账户能力', '身份认证', '账密登录', 'requirement.md')));
  // metadata 名称已同步为树名
  assert.equal(meta2['feature-path']['level-3'].name, '身份认证');
  rootEntries = (await readdir(changeDir, { withFileTypes: true })).map((e) => e.name);
  assert.deepEqual(rootEntries.sort(), ['metadata.yaml', '平台基座']);
  await rmrf(root);
});

// ---- feature-materializer ----

test('materializeFeatures: 四级 README 投影（业务名目录）+ STORY README 记录绑定 CHG（反查 changes/archive）', async () => {
  const root = await ws();
  await seedChange(root, { id: 'CHG-0002', meta: CHG_META });
  await seedChange(root, { scope: 'archive', id: 'CHG-0001', meta: ARCHIVE_META });

  const r = await materializeFeatures(root);
  // 8 条：4 个目录 + 4 个 README（L1/L2/L3/STORY）
  assert.equal(r.created.length, 8);
  assert.ok(r.created.includes(join('product', 'features', '平台基座', 'README.md')));
  assert.ok(r.created.includes(join('product', 'features', '平台基座', '账户能力', 'README.md')));
  assert.ok(r.created.includes(join('product', 'features', '平台基座', '账户能力', '认证', 'README.md')));
  assert.ok(
    r.created.includes(join('product', 'features', '平台基座', '账户能力', '认证', '用户登录', 'README.md'))
  );
  assert.equal(r.drifted.length, 0);

  const storyReadme = await readFile(
    join(root, 'product', 'features', '平台基座', '账户能力', '认证', '用户登录', 'README.md'),
    'utf8'
  );
  const fm = parse(storyReadme.split('---')[1]);
  assert.equal(fm['bound-chg'], 'CHG-0002'); // active 优先于 archive
  await rmrf(root);
});

test('materializeFeatures: 幂等 + 用户自建 README 不覆盖 + 树改名目录 rename', async () => {
  const root = await ws();
  const r1 = await materializeFeatures(root);
  assert.equal(r1.created.length, 8);

  const readme = join(root, 'product', 'features', '平台基座', 'README.md');
  await writeFile(readme, '# 我的模块说明');
  const r2 = await materializeFeatures(root);
  assert.equal(r2.created.length, 0);
  assert.equal(r2.skipped, 4);
  assert.equal(await readFile(readme, 'utf8'), '# 我的模块说明');

  // 树改名 L2：账户能力 → 用户管理（锚点 rename，README 保留）
  await writeFile(
    join(root, 'product', 'feature-tree.yaml'),
    TREE_YAML.replace('name: 账户能力', 'name: 用户管理')
  );
  const r3 = await materializeFeatures(root);
  assert.ok(r3.renamed.includes(['平台基座', '用户管理'].join('/')));
  const renamedReadme = join(root, 'product', 'features', '平台基座', '用户管理', 'README.md');
  assert.ok(await pathExists(renamedReadme));
  assert.ok(await pathExists(join(root, 'product', 'features', '平台基座', '用户管理', '认证', '用户登录', 'README.md')));
  await rmrf(root);
});

test('materializeFeatures: drift 报告（目录有树无），不删除', async () => {
  const root = await ws();
  const stale = join(root, 'product', 'features', 'FEAT-9');
  await mkdir(stale, { recursive: true });
  await writeFile(join(stale, 'README.md'), 'x');

  const r = await materializeFeatures(root);
  assert.deepEqual(r.drifted, ['FEAT-9']);
  assert.ok(await pathExists(stale)); // 未删除
  await rmrf(root);
});

test('checkFeaturesProjection: 空 features 全 missing → materialize 后归零 → drift 单独报告', async () => {
  const root = await ws();
  await seedChange(root, { id: 'CHG-0002', meta: CHG_META });

  let proj = await checkFeaturesProjection(root);
  assert.equal(proj.missing.length, 4);
  assert.equal(proj.drifted.length, 0);

  await materializeFeatures(root);
  proj = await checkFeaturesProjection(root);
  assert.equal(proj.missing.length, 0);

  // 树中删掉节点模拟 drift（写一棵缺 STORY-2 的树）
  await writeFile(
    join(root, 'product', 'feature-tree.yaml'),
    TREE_YAML.replace(/              - id: STORY-2[\s\S]*?status: planned\n/, '')
  );
  proj = await checkFeaturesProjection(root);
  assert.ok(proj.drifted.some((d) => d.includes('用户登录')));
  await rmrf(root);
});
