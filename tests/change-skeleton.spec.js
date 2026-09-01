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
// Phase 3.8 方案 D：派生缓存（先清后重建），L1-L3 只建空目录，只在 Story 级写 README

test('materializeFeatures: 重建派生缓存（4 个目录 + 1 个 Story README）+ Story README 含 Change 历史', async () => {
  const root = await ws();
  await seedChange(root, { id: 'CHG-0002', meta: CHG_META });
  await seedChange(root, { scope: 'archive', id: 'CHG-0001', meta: ARCHIVE_META });

  const r = await materializeFeatures(root);
  // 4 个目录（L1/L2/L3/Story）+ 1 个 Story README
  assert.equal(r.createdDirs.length, 4);
  assert.equal(r.createdFiles.length, 1);
  assert.ok(r.removedDirs.length === 0);
  assert.ok(r.createdFiles[0].endsWith(join('用户登录', 'README.md')));

  // L1/L2/L3 不写 README
  assert.ok(!(await pathExists(join(root, 'product', 'features', '平台基座', 'README.md'))));
  assert.ok(!(await pathExists(join(root, 'product', 'features', '平台基座', '账户能力', 'README.md'))));
  assert.ok(!(await pathExists(join(root, 'product', 'features', '平台基座', '账户能力', '认证', 'README.md'))));

  // Story README 含 Change 历史（active 优先 + 面包屑 + 审计包链接）
  const storyReadme = await readFile(
    join(root, 'product', 'features', '平台基座', '账户能力', '认证', '用户登录', 'README.md'),
    'utf8'
  );
  const fm = parse(storyReadme.split('---')[1]);
  assert.equal(fm.id, 'STORY-2');
  assert.equal(fm.level, 'story');
  assert.equal(fm.status, 'planned');
  assert.ok(storyReadme.includes('## Change 历史'));
  assert.ok(storyReadme.includes('CHG-0002')); // active
  assert.ok(storyReadme.includes('CHG-0001')); // archive
  assert.ok(storyReadme.includes('路径：')); // 面包屑
  assert.ok(/\/delivery\/changes\/CHG-0002\//.test(storyReadme)); // 审计包相对链接
  await rmrf(root);
});

test('materializeFeatures: dry-run 不写盘 + 返回差异计划', async () => {
  const root = await ws();
  const dry = await materializeFeatures(root, { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.storyCount, 1);
  // 磁盘上 features 目录空（不写盘）
  const storyReadme = join(root, 'product', 'features', '平台基座', '账户能力', '认证', '用户登录', 'README.md');
  assert.ok(!(await pathExists(storyReadme)));
  // 实跑后文件应存在
  const r = await materializeFeatures(root);
  assert.equal(r.dryRun, false);
  assert.ok(await pathExists(storyReadme));
  await rmrf(root);
});

test('materializeFeatures: 树改名 → 重建时清掉旧目录段，不依赖锚点 rename', async () => {
  const root = await ws();
  await materializeFeatures(root);
  const oldReadme = join(root, 'product', 'features', '平台基座', '账户能力', '认证', '用户登录', 'README.md');
  assert.ok(await pathExists(oldReadme));

  // L2 改名：账户能力 → 用户管理（树为权威，materialize = 重建，非锚点 rename）
  await writeFile(
    join(root, 'product', 'feature-tree.yaml'),
    TREE_YAML.replace('name: 账户能力', 'name: 用户管理')
  );
  const r = await materializeFeatures(root);
  assert.ok(r.removedDirs.some((d) => d.includes('账户能力'))); // 旧目录被清
  const newReadme = join(root, 'product', 'features', '平台基座', '用户管理', '认证', '用户登录', 'README.md');
  assert.ok(await pathExists(newReadme));
  assert.ok(!(await pathExists(join(root, 'product', 'features', '平台基座', '用户管理', 'README.md')))); // L2 仍无 README
  await rmrf(root);
});

test('materializeFeatures: 树删除节点 → 重建时整目录移除（原 drift 直接被清）', async () => {
  const root = await ws();
  await materializeFeatures(root);
  const p = join(root, 'product', 'features', '平台基座', '账户能力', '认证', '用户登录', 'README.md');
  assert.ok(await pathExists(p));

  // 树中删掉 STORY-2：整棵树 modules 为空（仅 L1 也没用）——模拟树节点删除
  const emptyTree = `product:\n  name: AI 平台\n  description: 企业级 AI 能力平台\nfeatures: []\n`;
  await writeFile(join(root, 'product', 'feature-tree.yaml'), emptyTree);
  const r = await materializeFeatures(root);
  // L1 平台基座为 obsolete（整目录被删）——removedDirs = ["平台基座"]
  assert.ok(r.removedDirs.includes('平台基座'));
  assert.ok(!(await pathExists(p)));
  await rmrf(root);
});

test('materializeFeatures: 遗留 L1/L2/L3 README / 手工文件 → 重建时被列为 extraneous 并删除', async () => {
  const root = await ws();
  // 模拟老版本遗留：L1 README + 用户手加 notes.txt
  const l1Readme = join(root, 'product', 'features', '平台基座', 'README.md');
  const notes = join(root, 'product', 'features', '平台基座', 'notes.txt');
  await mkdir(join(root, 'product', 'features', '平台基座'), { recursive: true });
  await writeFile(l1Readme, '# 遗留模块说明');
  await writeFile(notes, 'handmade');
  const r = await materializeFeatures(root);
  assert.ok(r.removedFiles.includes(join('平台基座', 'README.md')) ||
            r.removedDirs.includes('平台基座')); // 如果目录本身被重建则在 removedDirs
  assert.ok(r.removedFiles.includes(join('平台基座', 'notes.txt')) ||
            r.removedDirs.includes('平台基座'));
  assert.ok(!(await pathExists(l1Readme)));
  assert.ok(!(await pathExists(notes)));
  await rmrf(root);
});

test('checkFeaturesProjection: 未 materialize → missingStories；materialize → 归零；删节点后 extraneous', async () => {
  const root = await ws();
  await seedChange(root, { id: 'CHG-0002', meta: CHG_META });

  let proj = await checkFeaturesProjection(root);
  assert.equal(proj.missingStories.length, 1);
  assert.equal(proj.storyInTree, 1);
  assert.equal(proj.storyOnDisk, 0);

  await materializeFeatures(root);
  proj = await checkFeaturesProjection(root);
  assert.equal(proj.missingStories.length, 0);
  assert.equal(proj.storyOnDisk, 1);

  // extraneous：塞遗留文件
  const f = join(root, 'product', 'features', '平台基座', 'README.md');
  await writeFile(f, '#遗留');
  proj = await checkFeaturesProjection(root);
  assert.ok(proj.extraneousFiles.some((pth) => pth.endsWith('README.md')));
  await rmrf(root);
});
