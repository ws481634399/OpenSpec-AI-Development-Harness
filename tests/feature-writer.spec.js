// Unit tests: FeatureWriter（addModule / addFeature / addStory / updateNode / removeNode）
// Phase 2.4 Schema v2：features(L1) → children(L2) → children(L3) → stories
// ID 层级嵌套编码：FEAT-001 / FEAT-001-01 / FEAT-001-01-01 / STORY-001-01-01-01
// v1 磁盘文件（modules 键）首次写入自动升级 v2
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { readFeatureTree, findNodeById, nodeLevel, nodePath } from '../core/sdd/feature-model.js';
import { addModule, addFeature, addStory, updateNode, removeNode } from '../core/sdd/feature-writer.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });

const EMPTY_TREE = `# OpenSpec Product Feature Tree
product:
  name: 测试产品
  description: FeatureWriter 测试

features: []
`;

// v1 磁盘格式（首次写入时自动升级 v2）
const V1_TREE = `# OpenSpec Product Feature Tree
product:
  name: 旧产品
  description: v1 兼容测试

modules:
  - id: MOD-USER
    name: 用户中心
    features:
      - id: FEAT-USER-AUTH
        name: 用户认证
        stories:
          - id: STORY-USER-REGISTER
            name: 用户注册
            status: planned
`;

async function makeWorkspace(content = EMPTY_TREE) {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-fw-'));
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(join(tmp, 'product', 'feature-tree.yaml'), content, 'utf8');
  return tmp;
}

// ---- addModule ----

test('FeatureWriter.addModule: 添加 L1（自动嵌套 ID FEAT-001）', async () => {
  const tmp = await makeWorkspace();
  const { id } = await addModule(tmp, { name: '用户中心', description: '用户域' });
  assert.equal(id, 'FEAT-001');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.schema, 2);
  assert.equal(tree.modules.length, 1);
  assert.equal(tree.modules[0].name, '用户中心');
  assert.equal(tree.modules[0].description, '用户域');
  await rmrf(tmp);
});

test('FeatureWriter.addModule: 显式 ID 原样保留（ID 稳定原则）', async () => {
  const tmp = await makeWorkspace();
  const { id } = await addModule(tmp, { id: 'MOD-USER', name: 'User Center' });
  assert.equal(id, 'MOD-USER');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules[0].id, 'MOD-USER');
  await rmrf(tmp);
});

test('FeatureWriter.addModule: 多个 L1 序号递增', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { name: '用户中心' });
  const r2 = await addModule(tmp, { name: '订单中心' });
  assert.equal(r2.id, 'FEAT-002');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules.length, 2);
  await rmrf(tmp);
});

test('FeatureWriter.addModule: 保留注释', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { name: '用户中心' });
  const raw = await readFile(join(tmp, 'product', 'feature-tree.yaml'), 'utf8');
  assert.ok(raw.includes('# OpenSpec Product Feature Tree'), 'header comment preserved');
  await rmrf(tmp);
});

// ---- v1 → v2 自动升级 ----

test('FeatureWriter: v1 文件首次写入自动升级 v2', async () => {
  const tmp = await makeWorkspace(V1_TREE);
  const r = await addModule(tmp, { name: '订单中心' });
  // v1 旧节点为 slug ID（MOD-USER 等），新 v2 嵌套 ID 从 FEAT-001 起不冲突
  assert.equal(r.id, 'FEAT-001');
  assert.equal(r.migrated, true);
  const raw = await readFile(join(tmp, 'product', 'feature-tree.yaml'), 'utf8');
  assert.ok(raw.includes('features:'), 'v2 features key written');
  assert.ok(!/^modules:/m.test(raw), 'v1 modules key removed');
  assert.ok(raw.includes('自动升级'), 'migration note preserved');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.schema, 2);
  // v1 旧节点 ID 保持不变（ID 稳定原则）
  assert.ok(findNodeById(tree, 'MOD-USER'));
  assert.ok(findNodeById(tree, 'STORY-USER-REGISTER'));
  await rmrf(tmp);
});

// ---- addFeature ----

test('FeatureWriter.addFeature: 在 L1 下添加 L2（嵌套 ID）', async () => {
  const tmp = await makeWorkspace();
  const l1 = await addModule(tmp, { name: '用户中心' });
  const { id } = await addFeature(tmp, l1.id, { name: '用户认证' });
  assert.equal(id, 'FEAT-001-01');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules[0].children.length, 1);
  assert.equal(tree.modules[0].children[0].name, '用户认证');
  await rmrf(tmp);
});

test('FeatureWriter.addFeature: L1/L2 不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => addFeature(tmp, 'FEAT-XXX', { name: 'test' }),
    /node not found/i
  );
  await rmrf(tmp);
});

// ---- addStory ----

test('FeatureWriter.addStory: 在 L3 下添加 Story（嵌套 ID）', async () => {
  const tmp = await makeWorkspace();
  const l1 = await addModule(tmp, { name: '用户中心' });
  const l2 = await addFeature(tmp, l1.id, { name: '用户认证' });
  const l3 = await addFeature(tmp, l2.id, { name: '注册登录' });
  const { id } = await addStory(tmp, l3.id, { name: '用户注册', status: 'planned' });
  assert.equal(id, 'STORY-001-01-01-01');
  const tree = await readFeatureTree(tmp);
  const story = tree.modules[0].children[0].children[0].stories[0];
  assert.equal(story.name, '用户注册');
  assert.equal(story.status, 'planned');
  await rmrf(tmp);
});

test('FeatureWriter.addStory: L3 不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => addStory(tmp, 'FEAT-XXX', { name: 'test' }),
    /L3 node not found/i
  );
  await rmrf(tmp);
});

// ---- updateNode ----

test('FeatureWriter.updateNode: 更新 L1 名称', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { name: '旧名称' });
  await updateNode(tmp, 'FEAT-001', { name: '新名称' });
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules[0].name, '新名称');
  await rmrf(tmp);
});

test('FeatureWriter.updateNode: 更新 Story 状态', async () => {
  const tmp = await makeWorkspace();
  const l1 = await addModule(tmp, { name: '用户中心' });
  const l2 = await addFeature(tmp, l1.id, { name: '用户认证' });
  const l3 = await addFeature(tmp, l2.id, { name: '注册登录' });
  const { id } = await addStory(tmp, l3.id, { name: '测试' });
  await updateNode(tmp, id, { status: 'in-progress' });
  const tree = await readFeatureTree(tmp);
  const story = tree.modules[0].children[0].children[0].stories[0];
  assert.equal(story.status, 'in-progress');
  await rmrf(tmp);
});

test('FeatureWriter.updateNode: 非 Story 节点设 status → 抛错', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { name: '用户中心' });
  await assert.rejects(
    () => updateNode(tmp, 'FEAT-001', { status: 'delivered' }),
    /status can only be set on Story/i
  );
  await rmrf(tmp);
});

test('FeatureWriter.updateNode: 节点不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => updateNode(tmp, 'FEAT-XXX', { name: 'test' }),
    /Node not found/i
  );
  await rmrf(tmp);
});

// ---- removeNode ----

test('FeatureWriter.removeNode: 删除 Story', async () => {
  const tmp = await makeWorkspace();
  const l1 = await addModule(tmp, { name: '用户中心' });
  const l2 = await addFeature(tmp, l1.id, { name: '用户认证' });
  const l3 = await addFeature(tmp, l2.id, { name: '注册登录' });
  const s1 = await addStory(tmp, l3.id, { name: '注册' });
  const s2 = await addStory(tmp, l3.id, { name: '登录' });

  const result = await removeNode(tmp, s1.id);
  assert.equal(result.level, 'story');
  const tree = await readFeatureTree(tmp);
  const stories = tree.modules[0].children[0].children[0].stories;
  assert.equal(stories.length, 1);
  assert.equal(stories[0].id, s2.id);
  await rmrf(tmp);
});

test('FeatureWriter.removeNode: 删除 L1 连带子树', async () => {
  const tmp = await makeWorkspace();
  const l1a = await addModule(tmp, { name: '用户中心' });
  const l2 = await addFeature(tmp, l1a.id, { name: '用户认证' });
  const l3 = await addFeature(tmp, l2.id, { name: '注册登录' });
  await addStory(tmp, l3.id, { name: '注册' });
  await addModule(tmp, { name: '订单中心' });

  await removeNode(tmp, l1a.id);
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules.length, 1);
  assert.equal(tree.modules[0].id, 'FEAT-002');
  await rmrf(tmp);
});

test('FeatureWriter.removeNode: 节点不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => removeNode(tmp, 'FEAT-XXX'),
    /Node not found/i
  );
  await rmrf(tmp);
});

// ---- 端到端 ----

test('FeatureWriter: 完整四级树构建 + 查找 + 路径', async () => {
  const tmp = await makeWorkspace();
  const l1 = await addModule(tmp, { name: '用户中心', description: '用户域' });
  const l2 = await addFeature(tmp, l1.id, { name: '账户能力', description: '账户相关' });
  const l3 = await addFeature(tmp, l2.id, { name: '用户认证', description: '认证能力' });
  const story = await addStory(tmp, l3.id, { name: '用户注册', description: '邮箱注册' });

  const tree = await readFeatureTree(tmp);
  const found = findNodeById(tree, story.id);
  assert.ok(found);
  assert.equal(nodeLevel(found), 'story');
  assert.equal(
    nodePath(tree, story.id),
    '测试产品 > 用户中心 > 账户能力 > 用户认证 > 用户注册'
  );
  await rmrf(tmp);
});
