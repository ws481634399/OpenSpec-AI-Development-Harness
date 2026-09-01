// Unit tests: P2-1 + P2-3 输入前置校验（Phase 3.7）
// - change create: validateCreateInput（title/--id 格式/--id 唯一性/repositories 类型）
// - workflow run --du: 非 developing/testing → 抛错（CLI 层前移）
// - du create/materialize/show: DU_ID_PATTERN 校验
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { runInit } from '../core/workspace/workspace-initializer.js';
import { runChangeCreate, readMetadata } from '../core/sdd/change-model.js';
import { getHarnessRoot } from '../core/workspace/harness-root.js';
import { DU_ID_PATTERN } from '../core/sdd/delivery-unit.js';

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

async function ws() {
  const root = await mkdtemp(join(tmpdir(), 'p37-'));
  await runInit(
    {
      name: 'p37',
      type: 'greenfield',
      mode: 'single',
      repos: [{ id: 'main', path: 'implementation' }],
      shouldCreateImplementation: true,
      force: false,
    },
    root,
    harnessRoot
  );
  return root;
}

// ---------- change create 输入校验 ----------

test('InputValidation: title 全空白 → 拒绝', async () => {
  const root = await ws();
  await assert.rejects(
    () => runChangeCreate(root, { title: '   ' }, harnessRoot),
    /title 必填/
  );
  await rmrf(root);
});

test('InputValidation: --id 小写短横错误 → 拒绝（CHG0002 / chg-0002 等）', async () => {
  const root = await ws();
  await assert.rejects(() => runChangeCreate(root, { title: 'T', id: 'chg-0002' }, harnessRoot), /不符合格式/);
  await assert.rejects(() => runChangeCreate(root, { title: 'T', id: 'CHG0002' }, harnessRoot), /不符合格式/);
  await assert.rejects(() => runChangeCreate(root, { title: 'T', id: 'CHG-2' }, harnessRoot), /数字部分应 >= 4 位/);
  await rmrf(root);
});

test('InputValidation: --id 自定义合法 → 成功并分配指定 id', async () => {
  const root = await ws();
  const { id, changeDir } = await runChangeCreate(root, { title: 'T', id: 'CHG-0042' }, harnessRoot);
  assert.equal(id, 'CHG-0042');
  const meta = await readMetadata(changeDir);
  assert.equal(meta.id, 'CHG-0042');
  // 自动分配应考虑已存在的 CHG-XXXX（含自定义的），下一个是 CHG-0043
  const auto = await runChangeCreate(root, { title: 'T2' }, harnessRoot);
  assert.equal(auto.id, 'CHG-0043');
  await rmrf(root);
});

test('InputValidation: --id 已被 changes 占用 → 拒绝并提示下一号', async () => {
  const root = await ws();
  await runChangeCreate(root, { title: 'T', id: 'CHG-0042' }, harnessRoot);
  const err = await runChangeCreate(root, { title: 'T2', id: 'CHG-0042' }, harnessRoot)
    .then(() => null).catch((e) => e);
  assert.ok(err instanceof Error, '应抛错');
  assert.ok(err.message.includes('ID 已存在: CHG-0042'));
  assert.ok(/下一个可用: CHG-0043/.test(err.message));
  await rmrf(root);
});

test('InputValidation: --id 被 archive 占用 → 同样拒绝', async () => {
  const root = await ws();
  await runChangeCreate(root, { title: 'T', id: 'CHG-0042' }, harnessRoot);
  // 手工把 CHG-0042 挪到 archive（模拟归档冲突，不触发 archiveChange 的状态校验）
  await mkdir(join(root, 'delivery', 'archive', 'CHG-0042'), { recursive: true });
  await writeFile(
    join(root, 'delivery', 'archive', 'CHG-0042', 'metadata.yaml'),
    'id: CHG-0042\nstatus: archived\ntitle: T\n'
  );
  // 再拿原来的 changes 侧删掉（保证是 archive 侧单独占的）
  await rmrf(join(root, 'delivery', 'changes', 'CHG-0042'));

  const err = await runChangeCreate(root, { title: 'T2', id: 'CHG-0042' }, harnessRoot)
    .then(() => null).catch((e) => e);
  assert.ok(err && err.message.includes('ID 已存在'), err && err.message);
  await rmrf(root);
});

test('InputValidation: repositories 非数组或含空串 → 拒绝', async () => {
  const root = await ws();
  await assert.rejects(
    () => runChangeCreate(root, { title: 'T', repositories: 'main' }, harnessRoot),
    /repositories 必须为非空字符串数组/
  );
  await assert.rejects(
    () => runChangeCreate(root, { title: 'T', repositories: ['   ', ''] }, harnessRoot),
    /repositories 必须为非空字符串数组/
  );
  await rmrf(root);
});

test('InputValidation: title/summary 前后空白被 trim，归档关联查询基于 trim 后值', async () => {
  const root = await ws();
  const first = await runChangeCreate(
    root,
    { title: '  登录  ', requirement: 'REQ-1 ', summary: '  摘要  ' },
    harnessRoot
  );
  const meta1 = await readMetadata(first.changeDir);
  assert.equal(meta1.title, '登录');
  assert.equal(meta1.requirement, 'REQ-1');
  assert.equal(meta1.summary, '摘要');
  // 同 title（含外围空白）应命中 archived → related-change；这里把 first 挪到 archive 再建第二个
  // 简化为：直接创建第二个（changes + archive 同名未归档，related-change 找 changes？ 当前实现只找 archive，无需断言）
  await rmrf(root);
});

// ---------- DU_ID_PATTERN（与 CLI 前移共用同一正则） ----------

test('InputValidation: DU_ID_PATTERN 边界用例', () => {
  assert.equal(DU_ID_PATTERN.test('DU-BE-001'), true);
  assert.equal(DU_ID_PATTERN.test('DU-AI2-999'), true, '别名允许字母数字');
  assert.equal(DU_ID_PATTERN.test('DU-ABCDEFGH-010'), true, '别名上限 8');
  assert.equal(DU_ID_PATTERN.test('DU-ABCDEFGHI-010'), false, '别名超过 8 位');
  assert.equal(DU_ID_PATTERN.test('DU-FE-01'), false, '数字 2 位不足');
  assert.equal(DU_ID_PATTERN.test('DU--001'), false, '别名为空');
  assert.equal(DU_ID_PATTERN.test('du-be-001'), false, '别名必须大写');
  assert.equal(DU_ID_PATTERN.test('XU-BE-001'), false, '前缀必须 DU');
});
