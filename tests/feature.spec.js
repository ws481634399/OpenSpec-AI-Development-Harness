// Unit tests: FeatureModel（readFeatureTree / findFeature / featurePath / findNodeById / nodeLevel / generateId）
// 四级结构：Product → Module → Feature → Story
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import {
  readFeatureTree, findFeature, findNodeById, findNodeByName,
  featurePath, nodePath, nodeLevel, generateId, collectIds,
} from '../core/sdd/feature-model.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });

// 四级 Feature Tree 示例
const SAMPLE_TREE = `# OpenSpec Product Feature Tree
product:
  name: 示例产品
  description: 用于 FeatureModel 测试

modules:
  - id: MOD-PRODUCT
    name: 商品中心
    description: 商品域
    features:
      - id: FEAT-PRODUCT-MGMT
        name: 商品管理
        description: 商品 CRUD
        stories:
          - id: STORY-PRODUCT-CREATE
            name: 创建商品
            description: 新建商品入口
            status: planned
      - id: FEAT-PRODUCT-RECO
        name: 智能推荐
        description: 推荐能力
        stories: []
  - id: MOD-ORDER
    name: 订单中心
    description: 订单域
    features: []
`;

async function makeWorkspace(treeContent = SAMPLE_TREE) {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-feat-'));
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(join(tmp, 'product', 'feature-tree.yaml'), treeContent, 'utf8');
  return tmp;
}

// ---- readFeatureTree ----

test('FeatureModel.readFeatureTree: 正常文件返回 product + modules', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.product.name, '示例产品');
  assert.equal(tree.product.description, '用于 FeatureModel 测试');
  assert.ok(Array.isArray(tree.modules));
  assert.equal(tree.modules.length, 2);
  assert.equal(tree.modules[0].id, 'MOD-PRODUCT');
  assert.equal(tree.modules[0].features.length, 2);
  assert.equal(tree.modules[0].features[0].stories.length, 1);
  await rmrf(tmp);
});

test('FeatureModel.readFeatureTree: 文件缺失返回空树（modules: []）', async () => {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-feat-empty-'));
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.product.name, '');
  assert.ok(Array.isArray(tree.modules));
  assert.equal(tree.modules.length, 0);
  await rmrf(tmp);
});

// ---- findNodeById / findFeature ----

test('FeatureModel.findNodeById: 命中 Module 级', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findNodeById(tree, 'MOD-PRODUCT');
  assert.ok(hit);
  assert.equal(hit.name, '商品中心');
  await rmrf(tmp);
});

test('FeatureModel.findNodeById: 命中 Feature 级', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findNodeById(tree, 'FEAT-PRODUCT-RECO');
  assert.ok(hit);
  assert.equal(hit.name, '智能推荐');
  await rmrf(tmp);
});

test('FeatureModel.findNodeById: 命中 Story 级', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findNodeById(tree, 'STORY-PRODUCT-CREATE');
  assert.ok(hit);
  assert.equal(hit.name, '创建商品');
  assert.equal(hit.status, 'planned');
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 按 name 模糊命中（兼容旧接口）', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const hit = findFeature(tree, { name: '  智能推荐  ' });
  assert.ok(hit);
  assert.equal(hit.id, 'FEAT-PRODUCT-RECO');
  await rmrf(tmp);
});

test('FeatureModel.findFeature: 无匹配返回 null', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(findFeature(tree, { id: 'MOD-XXX' }), null);
  assert.equal(findFeature(tree, { name: '不存在的功能' }), null);
  await rmrf(tmp);
});

// ---- nodePath / featurePath ----

test('FeatureModel.nodePath: Module 返回 Product > Module', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const path = nodePath(tree, 'MOD-PRODUCT');
  assert.equal(path, '示例产品 > 商品中心');
  await rmrf(tmp);
});

test('FeatureModel.nodePath: Story 返回完整四级路径', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const path = nodePath(tree, 'STORY-PRODUCT-CREATE');
  assert.equal(path, '示例产品 > 商品中心 > 商品管理 > 创建商品');
  await rmrf(tmp);
});

test('FeatureModel.featurePath: 兼容旧接口', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const node = findNodeById(tree, 'FEAT-PRODUCT-RECO');
  const path = featurePath(tree, node);
  assert.equal(path, '示例产品 > 商品中心 > 智能推荐');
  await rmrf(tmp);
});

// ---- nodeLevel ----

test('FeatureModel.nodeLevel: Module/Feature/Story 判断正确', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(nodeLevel(findNodeById(tree, 'MOD-PRODUCT')), 'module');
  assert.equal(nodeLevel(findNodeById(tree, 'FEAT-PRODUCT-MGMT')), 'feature');
  assert.equal(nodeLevel(findNodeById(tree, 'STORY-PRODUCT-CREATE')), 'story');
  await rmrf(tmp);
});

// ---- generateId ----

test('FeatureModel.generateId: ASCII name → slugify', () => {
  const id = generateId('MOD-', 'User Center', []);
  assert.equal(id, 'MOD-user-center');
});

test('FeatureModel.generateId: 中文 name → 序号', () => {
  const id = generateId('MOD-', '用户中心', []);
  assert.equal(id, 'MOD-1');
});

test('FeatureModel.generateId: 序号递增避重', () => {
  const id = generateId('MOD-', '用户中心', ['MOD-1']);
  assert.equal(id, 'MOD-2');
});

test('FeatureModel.generateId: ASCII slug 冲突 → 序号', () => {
  const id = generateId('MOD-', 'User Center', ['MOD-user-center']);
  assert.match(id, /^MOD-\d+$/);
});

// ---- collectIds ----

test('FeatureModel.collectIds: 收集全树 ID', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  const ids = collectIds(tree);
  assert.ok(ids.includes('MOD-PRODUCT'));
  assert.ok(ids.includes('MOD-ORDER'));
  assert.ok(ids.includes('FEAT-PRODUCT-MGMT'));
  assert.ok(ids.includes('STORY-PRODUCT-CREATE'));
  await rmrf(tmp);
});
