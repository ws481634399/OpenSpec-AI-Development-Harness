// Unit tests: ChangeStateMachine（Phase 3.6 补直接单测）
// 纯函数模块，无 IO fixture；锁定生命周期状态机的合法迁移表与报错行为
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHANGE_STATUSES,
  isValidStatus,
  nextStatuses,
  validateTransition,
} from '../core/sdd/change-state-machine.js';

test('StateMachine: 状态枚举为 9 个生命周期状态（含终态 archived）', () => {
  assert.equal(CHANGE_STATUSES.length, 9);
  assert.equal(CHANGE_STATUSES[0], 'created');
  assert.equal(CHANGE_STATUSES[CHANGE_STATUSES.length - 1], 'archived');
});

test('StateMachine: isValidStatus 合法/非法判定', () => {
  assert.equal(isValidStatus('created'), true);
  assert.equal(isValidStatus('completed'), true);
  assert.equal(isValidStatus('ARCHIVED'), false, '大小写敏感');
  assert.equal(isValidStatus('running'), false);
  assert.equal(isValidStatus(''), false);
  assert.equal(isValidStatus(undefined), false);
});

test('StateMachine: nextStatuses 线性前进，终态返回空数组', () => {
  assert.deepEqual(nextStatuses('created'), ['exploring']);
  assert.deepEqual(nextStatuses('exploring'), ['specified']);
  assert.deepEqual(nextStatuses('specified'), ['designed']);
  assert.deepEqual(nextStatuses('designed'), ['tasked']);
  assert.deepEqual(nextStatuses('tasked'), ['developing']);
  assert.deepEqual(nextStatuses('developing'), ['testing']);
  assert.deepEqual(nextStatuses('testing'), ['completed']);
  assert.deepEqual(nextStatuses('completed'), ['archived']);
  assert.deepEqual(nextStatuses('archived'), [], '终态无下一状态');
});

test('StateMachine: nextStatuses 非法状态抛错', () => {
  assert.throws(() => nextStatuses('bogus'), /Invalid status/);
});

test('StateMachine: validateTransition 合法链路逐步通过', () => {
  const chain = [
    'created',
    'exploring',
    'specified',
    'designed',
    'tasked',
    'developing',
    'testing',
    'completed',
    'archived',
  ];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.equal(validateTransition(chain[i], chain[i + 1]), true, `${chain[i]} → ${chain[i + 1]}`);
  }
});

test('StateMachine: 跳阶段抛错', () => {
  assert.throws(() => validateTransition('created', 'specified'), /Illegal transition.*created → specified/);
  assert.throws(() => validateTransition('created', 'completed'), /Illegal transition/);
});

test('StateMachine: 回退抛错', () => {
  assert.throws(() => validateTransition('specified', 'exploring'), /Illegal transition/);
  assert.throws(() => validateTransition('completed', 'testing'), /Illegal transition/);
});

test('StateMachine: 同状态与终态外推抛错', () => {
  assert.throws(() => validateTransition('testing', 'testing'), /from === to/);
  assert.throws(() => validateTransition('archived', 'created'), /Illegal transition/, '终态不可迁出');
});

test('StateMachine: 未知 from/to 状态抛错并提示合法清单', () => {
  assert.throws(() => validateTransition('bogus', 'created'), /Invalid 'from' status/);
  assert.throws(() => validateTransition('created', 'bogus'), /Invalid 'to' status/);
});
