// Unit tests: FeatureWriter（addModule / addFeature / addStory / updateNode / removeNode）
// feature-tree.yaml 写入（yaml Document API，保留注释）
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

modules: []
`;

async function makeWorkspace(content = EMPTY_TREE) {
  const tmp = await mkdtemp(join(tmpdir(), 'sdd-fw-'));
  await mkdir(join(tmp, 'product'), { recursive: true });
  await writeFile(join(tmp, 'product', 'feature-tree.yaml'), content, 'utf8');
  return tmp;
}

// ---- addModule ----

test('FeatureWriter.addModule: 添加 Module（自动 ID 序号）', async () => {
  const tmp = await makeWorkspace();
  const { id } = await addModule(tmp, { name: '用户中心', description: '用户域' });
  assert.equal(id, 'MOD-1');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules.length, 1);
  assert.equal(tree.modules[0].name, '用户中心');
  assert.equal(tree.modules[0].description, '用户域');
  await rmrf(tmp);
});

test('FeatureWriter.addModule: ASCII name → slugify ID', async () => {
  const tmp = await makeWorkspace();
  const { id } = await addModule(tmp, { name: 'User Center' });
  assert.equal(id, 'MOD-user-center');
  await rmrf(tmp);
});

test('FeatureWriter.addModule: 多个 Module 序号递增', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { name: '用户中心' });
  const r2 = await addModule(tmp, { name: '订单中心' });
  assert.equal(r2.id, 'MOD-2');
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

// ---- addFeature ----

test('FeatureWriter.addFeature: 在 Module 下添加 Feature', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心' });
  const { id } = await addFeature(tmp, 'MOD-USER', { name: '用户认证' });
  assert.ok(id.startsWith('FEAT-'));
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules[0].features.length, 1);
  assert.equal(tree.modules[0].features[0].name, '用户认证');
  await rmrf(tmp);
});

test('FeatureWriter.addFeature: Module 不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => addFeature(tmp, 'MOD-XXX', { name: 'test' }),
    /Module not found/i
  );
  await rmrf(tmp);
});

// ---- addStory ----

test('FeatureWriter.addStory: 在 Feature 下添加 Story', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心' });
  await addFeature(tmp, 'MOD-USER', { id: 'FEAT-USER-AUTH', name: '用户认证' });
  const { id } = await addStory(tmp, 'FEAT-USER-AUTH', { name: '用户注册', status: 'planned' });
  assert.ok(id.startsWith('STORY-'));
  const tree = await readFeatureTree(tmp);
  const story = tree.modules[0].features[0].stories[0];
  assert.equal(story.name, '用户注册');
  assert.equal(story.status, 'planned');
  await rmrf(tmp);
});

test('FeatureWriter.addStory: Feature 不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => addStory(tmp, 'FEAT-XXX', { name: 'test' }),
    /Feature not found/i
  );
  await rmrf(tmp);
});

// ---- updateNode ----

test('FeatureWriter.updateNode: 更新 Module 名称', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '旧名称' });
  await updateNode(tmp, 'MOD-USER', { name: '新名称' });
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules[0].name, '新名称');
  await rmrf(tmp);
});

test('FeatureWriter.updateNode: 更新 Story 状态', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心' });
  await addFeature(tmp, 'MOD-USER', { id: 'FEAT-USER-AUTH', name: '用户认证' });
  await addStory(tmp, 'FEAT-USER-AUTH', { id: 'STORY-TEST', name: '测试' });
  await updateNode(tmp, 'STORY-TEST', { status: 'in-progress' });
  const tree = await readFeatureTree(tmp);
  const story = tree.modules[0].features[0].stories[0];
  assert.equal(story.status, 'in-progress');
  await rmrf(tmp);
});

test('FeatureWriter.updateNode: 非 Story 节点设 status → 抛错', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心' });
  await assert.rejects(
    () => updateNode(tmp, 'MOD-USER', { status: 'delivered' }),
    /status can only be set on Story/i
  );
  await rmrf(tmp);
});

test('FeatureWriter.updateNode: 节点不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => updateNode(tmp, 'MOD-XXX', { name: 'test' }),
    /Node not found/i
  );
  await rmrf(tmp);
});

// ---- removeNode ----

test('FeatureWriter.removeNode: 删除 Story', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心' });
  await addFeature(tmp, 'MOD-USER', { id: 'FEAT-USER-AUTH', name: '用户认证' });
  await addStory(tmp, 'FEAT-USER-AUTH', { id: 'STORY-1', name: '注册' });
  await addStory(tmp, 'FEAT-USER-AUTH', { id: 'STORY-2', name: '登录' });

  const result = await removeNode(tmp, 'STORY-1');
  assert.equal(result.level, 'story');
  const tree = await readFeatureTree(tmp);
  const stories = tree.modules[0].features[0].stories;
  assert.equal(stories.length, 1);
  assert.equal(stories[0].id, 'STORY-2');
  await rmrf(tmp);
});

test('FeatureWriter.removeNode: 删除 Module 连带子树', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心' });
  await addFeature(tmp, 'MOD-USER', { id: 'FEAT-USER-AUTH', name: '用户认证' });
  await addStory(tmp, 'FEAT-USER-AUTH', { id: 'STORY-1', name: '注册' });
  await addModule(tmp, { id: 'MOD-ORDER', name: '订单中心' });

  await removeNode(tmp, 'MOD-USER');
  const tree = await readFeatureTree(tmp);
  assert.equal(tree.modules.length, 1);
  assert.equal(tree.modules[0].id, 'MOD-ORDER');
  await rmrf(tmp);
});

test('FeatureWriter.removeNode: 节点不存在 → 抛错', async () => {
  const tmp = await makeWorkspace();
  await assert.rejects(
    () => removeNode(tmp, 'MOD-XXX'),
    /Node not found/i
  );
  await rmrf(tmp);
});

// ---- 端到端 ----

test('FeatureWriter: 完整四级树构建 + 查找 + 路径', async () => {
  const tmp = await makeWorkspace();
  await addModule(tmp, { id: 'MOD-USER', name: '用户中心', description: '用户域' });
  await addFeature(tmp, 'MOD-USER', { id: 'FEAT-USER-AUTH', name: '用户认证', description: '认证能力' });
  await addStory(tmp, 'FEAT-USER-AUTH', { id: 'STORY-USER-REGISTER', name: '用户注册', description: '邮箱注册' });

  const tree = await readFeatureTree(tmp);
  const story = findNodeById(tree, 'STORY-USER-REGISTER');
  assert.ok(story);
  assert.equal(nodeLevel(story), 'story');
  assert.equal(
    nodePath(tree, 'STORY-USER-REGISTER'),
    '测试产品 > 用户中心 > 用户认证 > 用户注册'
  );
  await rmrf(tmp);
});
