// Unit tests: ChangeArchiver（Phase 3.6 补直接单测）
// 锁定 completed→archived 迁移：状态校验 / 目录整体迁移 / metadata 持久化（phase-1.3 §8.5）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, stat, mkdir, writeFile } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata, patchStatus } from '../core/sdd/change-model.js';
import { archiveChange } from '../core/sdd/change-archiver.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function setupChange() {
  const tmp = await mkdtemp(join(tmpdir(), 'archive-'));
  await runInit(
    {
      name: 'archive-test',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot
  );
  const { id, changeDir } = await runChangeCreate(
    tmp,
    { title: 'Archive 测试', requirement: 'REQ-ARCHIVE', repositories: ['main'] },
    harnessRoot
  );
  return { tmp, changeId: id, changeDir };
}

test('Archiver: Change 不存在 → 抛错', async () => {
  const { tmp } = await setupChange();
  await assert.rejects(() => archiveChange(tmp, 'CHG-9999'));
  await rmrf(tmp);
});

test('Archiver: 非 completed 状态 → 抛错（状态机拒绝 created→archived）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await assert.rejects(
    () => archiveChange(tmp, changeId),
    /Illegal transition/
  );
  // 拒绝后不应产生归档目录
  await assert.rejects(stat(join(tmp, 'delivery', 'archive', changeId)));
  await rmrf(tmp);
});

test('Archiver: completed → 整体迁移 + status 持久化', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  // 直接 patch 到 completed（归档前置状态；推进链路由 transition-service.spec 覆盖）
  await patchStatus(changeDir, 'completed');
  // 预置一个产物文件验证整体迁移
  await writeFile(join(changeDir, 'convergence.md'), '# Convergence\n', 'utf8');

  const { archiveDir } = await archiveChange(tmp, changeId);
  assert.equal(archiveDir, join(tmp, 'delivery', 'archive', changeId));

  const archivedMeta = await readMetadata(archiveDir);
  assert.equal(archivedMeta.status, 'archived');
  assert.ok((await stat(join(archiveDir, 'convergence.md'))).isFile(), '产物随目录整体迁移');

  // 原 changes/<id> 不复存在
  await assert.rejects(stat(join(tmp, 'delivery', 'changes', changeId)));
  await rmrf(tmp);
});

test('Archiver: 四级骨架随目录整体迁移（Phase 3.5 v0.3）', async () => {
  const { tmp, changeId, changeDir } = await setupChange();
  await patchStatus(changeDir, 'completed');
  // 手工搭一个 STORY 骨架片段（不绑定树，仅验证迁移行为）
  const storyDir = join(changeDir, '模块甲', '特性乙', '能力丙', '故事丁');
  await mkdir(storyDir, { recursive: true });
  await writeFile(
    join(storyDir, 'README.md'),
    '---\nid: STORY-X\nname: 故事丁\nlevel: story\nbound-chg: ' + changeId + '\n---\n\n# 故事丁\n',
    'utf8'
  );

  const { archiveDir } = await archiveChange(tmp, changeId);
  const moved = join(archiveDir, '模块甲', '特性乙', '能力丙', '故事丁');
  assert.ok((await stat(moved)).isDirectory(), '四级骨架随目录整体迁移');
  assert.ok((await stat(join(moved, 'README.md'))).isFile());
  await assert.rejects(stat(join(changeDir)), 'changes 侧原目录消失');
  await rmrf(tmp);
});
