// FeatureModel：feature-tree 读取/遍历/查找（含缺陷 9 修复的 findStoryChain）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { findStoryChain, normalizeTree } from '../core/sdd/feature-model.js';

const toTree = (raw) => normalizeTree(parse(raw));

// v2 四级树：L3 挂 story（标准形态）
const V2_TREE = toTree(`
product:
  name: demo
features:
  - id: L1-1
    name: 模块一
    children:
      - id: L2-1
        name: 特性一
        children:
          - id: L3-1
            name: 能力一
            stories:
              - id: S-1
                name: 故事一
`);

// v1 过渡树：story 直挂 L2，且 L2 无 L3 子节点（缺陷 9 场景）
const V1_HYBRID_TREE = toTree(`
product:
  name: demo
features:
  - id: L1-1
    name: 模块一
    children:
      - id: L2-1
        name: 特性一
        stories:
          - id: S-DIRECT
            name: 直挂故事
`);

test('findStoryChain: v2 标准形态 L3 挂 story → 返回完整四级链', () => {
  const chain = findStoryChain(V2_TREE, 'S-1');
  assert.ok(chain);
  assert.equal(chain['level-1'].id, 'L1-1');
  assert.equal(chain['level-2'].id, 'L2-1');
  assert.equal(chain['level-3'].id, 'L3-1');
  assert.equal(chain.story.id, 'S-1');
});

test('findStoryChain: story 直挂 L2 且无 L3 子节点 → 命中（缺陷 9 修复）', () => {
  // 修复前：L2.stories 检查嵌套在 L3 循环内，L2 无 children 时永不执行 → Story not found
  const chain = findStoryChain(V1_HYBRID_TREE, 'S-DIRECT');
  assert.ok(chain, '直挂 L2 的 story 必须能命中');
  assert.equal(chain['level-1'].id, 'L1-1');
  assert.equal(chain['level-2'].id, 'L2-1');
  assert.deepEqual(chain['level-3'], { id: '', name: '' }); // v1 过渡：无 L3
  assert.equal(chain.story.id, 'S-DIRECT');
});

test('findStoryChain: L2 同时有 L3 与直挂 story → 两者均可命中', () => {
  const tree = toTree(`
product:
  name: demo
features:
  - id: L1-1
    name: 模块一
    children:
      - id: L2-1
        name: 特性一
        stories:
          - id: S-DIRECT
            name: 直挂故事
        children:
          - id: L3-1
            name: 能力一
            stories:
              - id: S-L3
                name: 深层故事
`);
  const direct = findStoryChain(tree, 'S-DIRECT');
  assert.ok(direct);
  assert.equal(direct.story.id, 'S-DIRECT');
  const deep = findStoryChain(tree, 'S-L3');
  assert.ok(deep);
  assert.equal(deep['level-3'].id, 'L3-1');
});

test('findStoryChain: 不存在的 story → null；空 storyId → null', () => {
  assert.equal(findStoryChain(V2_TREE, 'S-NONE'), null);
  assert.equal(findStoryChain(V2_TREE, ''), null);
});
