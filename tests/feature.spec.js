// Unit tests: FeatureModel（readFeatureTree / findFeature / featurePath）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §7 Feature Model
// Feature Tree 属 Product World，存放 product/feature-tree.yaml
// 注：FeatureModel 仅提供只读 API；写候选 (writeCandidate) 属 Phase 1.4 sdd-explore 实现，不在本测试范围
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFeatureTree, findFeature, featurePath } from '../core/sdd/feature-model.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });

// 构造示例 Feature Tree（含两层 children）
const SAMPLE_TREE = `# OpenSpec Product Feature Tree
product:
  name: 示例产品
  description: 用于 FeatureModel 测试

features:
  - id: F001
    name: 商品中心
    description: 商品域
    children:
      - id: F001-01
        name: 商品管理
        description: 商品 CRUD
      - id: F001-02
        name: 智能推荐
        description: 推荐能力
  - id: F002
    name: 订单中心
    description: 订单域
`;

async function makeWorkspace(treeContent = SAMPLE_TREE) {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-feat-'));
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(join(tmp, 'product', 'feature-tree.yaml'), treeContent, 'utf8');
  return tmp;
}

// ---- readFeatureTree ----

test('FeatureModel.readFeatureTree: 正常文件返回 product + features', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.product.name, '示例产品');
  assert.equal(tree.product.description, '用于 FeatureModel 测试');
  assert.ok(Array.isArray(tree.features));
  assert.equal(tree.features.length, 2);
  assert.equal(tree.features[0].id, 'F001');
  assert.equal(tree.features[0].children.length, 2);
  await rmrf(tmp);
});

test('FeatureModel.readFeatureTree: 文件缺失返回空树（features: []）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-feat-empty-'));
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.product.name, '');
  assert.equal(tree.product.description, '');
  assert.ok(Array.isArray(tree.features));
  assert.equal(tree.features.length, 0);
  await rmrf(tmp);
});

test('FeatureModel.readFeatureTree: 空 features 字段返回空数组', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-feat-nofeat-'));
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(
    join(tmp, 'product', 'feature-tree.yaml'),
    'product:\n  name: 空产品\n  description: 无能力\nfeatures: []\n',
    'utf8'
  );
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.product.name, '空产品');
  assert.equal(tree.features.length, 0);
  await rmrf(tmp);
});

// ---- findFeature ----

test('FeatureModel.findFeature: 按 id 精确命中根节点', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findFeature(tree, { id: 'F001' });
  assert.ok(hit);
  assert.equal(hit.name, '商品中心');
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 按 id 命中子节点', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findFeature(tree, { id: 'F001-02' });
  assert.ok(hit);
  assert.equal(hit.name, '智能推荐');
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 按 name 命中（忽略大小写/首尾空白）', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findFeature(tree, { name: '  智能推荐  ' });
  assert.ok(hit);
  assert.equal(hit.id, 'F001-02');
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 同时提供 id 与 name 同时命中同一节点', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  // id 与 name 均指向 F002，验证不冲突、能正确命中
  const hit = findFeature(tree, { id: 'F002', name: '订单中心' });
  assert.ok(hit);
  assert.equal(hit.id, 'F002');
  assert.equal(hit.name, '订单中心');
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 无匹配返回 null', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(findFeature(tree, { id: 'F999' }), null);
  assert.equal(findFeature(tree, { name: '不存在的功能' }), null);
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 空 query 返回 null', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(findFeature(tree, {}), null);
  assert.equal(findFeature(tree, { id: '', name: '' }), null);
  await rmrf(tmp);
});

// ---- featurePath ----

test('FeatureModel.featurePath: 根节点返回单层路径', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const node = findFeature(tree, { id: 'F001' });
  const path = featurePath(tree, node);
  assert.equal(path, '商品中心');
  await rmrf(tmp);
});

test('FeatureModel.featurePath: 子节点返回多层路径', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const node = findFeature(tree, { id: 'F001-02' });
  const path = featurePath(tree, node);
  assert.equal(path, '商品中心 / 智能推荐');
  await rmrf(tmp);
});

test('FeatureModel.featurePath: 第二棵树根节点路径独立', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const node = findFeature(tree, { id: 'F002' });
  const path = featurePath(tree, node);
  assert.equal(path, '订单中心');
  await rmrf(tmp);
});

test('FeatureModel.featurePath: target 为 null/undefined 返回空串', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(featurePath(tree, null), '');
  assert.equal(featurePath(tree, undefined), '');
  await rmrf(tmp);
});

test('FeatureModel.featurePath: target 不属于该树返回空串', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const foreign = { id: 'X', name: '外部节点' };
  assert.equal(featurePath(tree, foreign), '');
  await rmrf(tmp);
});
