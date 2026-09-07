// ChangeStateMachine：Lifecycle State 状态流转校验（纯函数，无 CLI/IO 依赖）
// 状态定义对齐 change-lifecycle.md §4 与 phase-1.3-sdd-lifecycle-artifact-design.md §7.2

/**
 * Change 生命周期状态枚举（小写存储，对齐 change-lifecycle.md）。
 * 每个状态对应一个 SDD 阶段 Skill 的完成。
 */
export const CHANGE_STATUSES = [
  'created', // CHG 已创建（sdd-explore 入口，exploration 未完成）
  'exploring', // sdd-explore 执行中/完成（exploration.md 已产出）
  'specified', // sdd-prd 完成（change-spec.md 已产出）
  'designed', // sdd-design 完成（change-design.md 已产出）
  'story-splitting', // Phase 4.2：Change Design → 拆 Story；inline 单 Story 可跳过
  'tasked', // sdd-task 完成（所有 Story tasks.md 已产出）
  'developing', // sdd-dev 执行中（implementation.md 进行中）
  'testing', // sdd-test 执行中（evidence 进行中）
  'completed', // sdd-converge 完成（convergence.md 已产出）
  'archived', // 已归档到 delivery/archive/
];

/**
 * 合法迁移表（v0.1 线性前进，不支持回退/取消）。
 * Phase 4.2：designed → tasked 允许直达（inline 单 Story 跳过 story-splitting）；
 *             designed → story-splitting → tasked（多 Story 三级模式）。
 */
const TRANSITIONS = {
  created: ['exploring'],
  exploring: ['specified'],
  specified: ['designed'],
  designed: ['story-splitting', 'tasked'], // 双路径：单 Story 直接 tasked；多 Story 过 splitting
  'story-splitting': ['tasked'],
  tasked: ['developing'],
  developing: ['testing'],
  testing: ['completed'],
  completed: ['archived'],
  archived: [], // 终态
};

/**
 * 校验状态合法性。
 * @param {string} status
 * @returns {boolean}
 */
export function isValidStatus(status) {
  return CHANGE_STATUSES.includes(status);
}

/**
 * 返回当前状态的合法下一状态列表。
 * @param {string} current
 * @returns {string[]} 合法的下一状态（终态返回空数组）
 * @throws {Error} 若 current 不是合法状态
 */
export function nextStatuses(current) {
  if (!isValidStatus(current)) {
    throw new Error(`Invalid status: ${current}. Valid: ${CHANGE_STATUSES.join(', ')}.`);
  }
  return TRANSITIONS[current] ?? [];
}

/**
 * 校验状态迁移是否合法。
 * @param {string} from 起始状态
 * @param {string} to 目标状态
 * @returns {boolean} 合法返回 true
 * @throws {Error} 非法迁移（跳阶段/回退/未知名/相同状态）抛错，message 含合法下一状态提示
 */
export function validateTransition(from, to) {
  if (!isValidStatus(from)) {
    throw new Error(`Invalid 'from' status: ${from}. Valid: ${CHANGE_STATUSES.join(', ')}.`);
  }
  if (!isValidStatus(to)) {
    throw new Error(`Invalid 'to' status: ${to}. Valid: ${CHANGE_STATUSES.join(', ')}.`);
  }
  if (from === to) {
    throw new Error(`Illegal transition: ${from} → ${to} (from === to). Legal next: ${(TRANSITIONS[from] ?? []).join(', ') || 'none (terminal)'}.`);
  }
  const legal = TRANSITIONS[from] ?? [];
  if (!legal.includes(to)) {
    throw new Error(
      `Illegal transition: ${from} → ${to}. Legal next: ${legal.join(', ') || 'none (terminal)'}.`
    );
  }
  return true;
}
