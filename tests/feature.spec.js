// Unit tests: FeatureModel（readFeatureTree / findFeature / featurePath / findNodeById / nodeLevel / generateId）
// 四级结构：Product → Module → Feature → Story
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import {
  readFeatureTree, findFeature, findNodeById, findNodeByName,
  featurePath, nodePath, nodeLevel, generateId, generateNestedId, collectIds,
} from '../core/sdd/feature-model.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });

// 四级 Feature Tree 示例（v1 磁盘格式，用于兼容读取测试）
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

// v2 磁盘格式（features → children → children → stories，层级嵌套 ID）
const V2_SAMPLE_TREE = `# OpenSpec Product Feature Tree
product:
  name: 示例产品
  description: 用于 FeatureModel 测试

features:
  - id: FEAT-001
    name: 商品中心
    children:
      - id: FEAT-001-02
        name: 商品管理
        children:
          - id: FEAT-001-02-03
            name: 商品 CRUD
            stories:
              - id: STORY-001-02-03-01
                name: 创建商品
                status: planned
`;

async function makeWorkspace(treeContent = SAMPLE_TREE) {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-feat-'));
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(join(tmp, 'product', 'feature-tree.yaml'), treeContent, 'utf8');
  return tmp;
}

// ---- readFeatureTree ----

test('FeatureModel.readFeatureTree: v1 文件投影为统一视图（children 兼容）', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.product.name, '示例产品');
  assert.equal(tree.product.description, '用于 FeatureModel 测试');
  assert.equal(tree.schema, 1); // v1 磁盘格式标记
  assert.ok(Array.isArray(tree.modules));
  assert.equal(tree.modules.length, 2);
  assert.equal(tree.modules[0].id, 'MOD-PRODUCT');
  assert.equal(tree.modules[0].children.length, 2);
  assert.equal(tree.modules[0].children[0].stories.length, 1);
  await rmrf(tmp);
});

test('FeatureModel.readFeatureTree: v2 文件读取（features → children → children → stories）', async () => {
  const tmp = await makeWorkspace(V2_SAMPLE_TREE);
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.schema, 2);
  assert.equal(tree.modules[0].id, 'FEAT-001');
  assert.equal(tree.modules[0].children[0].id, 'FEAT-001-02');
  assert.equal(tree.modules[0].children[0].children[0].id, 'FEAT-001-02-03');
  assert.equal(tree.modules[0].children[0].children[0].stories[0].id, 'STORY-001-02-03-01');
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

test('FeatureModel.nodeLevel: v1 前缀与 v2 嵌套 ID 判断正确', async () => {
  const tmp = await makeWorkspace();
  const tree = await readFeatureTree(tmp);
  // v1 前缀兼容
  assert.equal(nodeLevel(findNodeById(tree, 'MOD-PRODUCT')), 'l1');
  assert.equal(nodeLevel(findNodeById(tree, 'FEAT-PRODUCT-MGMT')), 'l2');
  assert.equal(nodeLevel(findNodeById(tree, 'STORY-PRODUCT-CREATE')), 'story');
  // v2 嵌套编码按段数判定
  assert.equal(nodeLevel({ id: 'FEAT-001' }), 'l1');
  assert.equal(nodeLevel({ id: 'FEAT-001-02' }), 'l2');
  assert.equal(nodeLevel({ id: 'FEAT-001-02-03' }), 'l3');
  assert.equal(nodeLevel({ id: 'STORY-001-02-03-01' }), 'story');
  await rmrf(tmp);
});

// ---- generateNestedId ----

test('FeatureModel.generateNestedId: L1/L2/L3/Story 层级嵌套', async () => {
  const tree = { modules: [] };
  const l1 = generateNestedId('l1', null, tree);
  assert.equal(l1, 'FEAT-001');
  const l2 = generateNestedId('l2', l1, tree);
  assert.equal(l2, 'FEAT-001-01');
  const l3 = generateNestedId('l3', l2, tree);
  assert.equal(l3, 'FEAT-001-01-01');
  const story = generateNestedId('story', l3, tree);
  assert.equal(story, 'STORY-001-01-01-01');
});

test('FeatureModel.generateNestedId: 冲突递增', () => {
  const tree = {
    modules: [
      { id: 'FEAT-001', children: [] },
      { id: 'FEAT-002', children: [] },
    ],
  };
  assert.equal(generateNestedId('l1', null, tree), 'FEAT-003');
  const tree2 = {
    modules: [{ id: 'FEAT-001', children: [{ id: 'FEAT-001-01', children: [] }] }],
  };
  assert.equal(generateNestedId('l2', 'FEAT-001', tree2), 'FEAT-001-02');
});

test('FeatureModel.generateNestedId: v1 遗留父 ID → slug 派生', () => {
  const tree = { modules: [{ id: 'MOD-USER', children: [] }] };
  assert.equal(generateNestedId('l2', 'MOD-USER', tree), 'FEAT-USER-1');
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
