// SkillPrompts：skill 命令的 @clack 交互封装 + 决策纯函数（CLI 层辅助）
// 决策纯函数（decideReuseAction）不依赖 @clack，便于单测注入返回值
import * as p from '@clack/prompts';

/**
 * 取消处理：显示 cancel 并退出。
 */
function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/**
 * 旧需求沿用决策纯函数（不依赖 @clack，便于单测）。
 *
 * 输入候选清单 + 用户选择 → 返回动作。
 * - choice === 'new' 或无候选 → 新建
 * - choice === 'reuse:<id>' 且命中候选 → 沿用
 * - 其他 → 新建（兜底）
 *
 * @param {Array<{id:string,title:string,status:string,changeDir:string}>} candidates findChangeByRequirement 返回值
 * @param {string} choice 用户选择（'new' | 'reuse:<id>'）
 * @returns {{action:'new'} | {action:'reuse', change:object}}
 */
export function decideReuseAction(candidates, choice) {
  if (!choice || choice === 'new' || !Array.isArray(candidates) || candidates.length === 0) {
    return { action: 'new' };
  }
  if (choice.startsWith('reuse:')) {
    const id = choice.slice('reuse:'.length);
    const found = candidates.find((c) => c.id === id);
    if (found) return { action: 'reuse', change: found };
  }
  return { action: 'new' };
}

/**
 * 交互式收集需求信息（title / requirement / content）。
 * 已通过 CLI opts 提供的字段跳过交互。
 *
 * @param {{title?:string,requirement?:string,content?:string}} [existing] CLI 传入的已有值
 * @returns {Promise<{title:string,requirement:string,content:string}>}
 */
export async function collectRequirement(existing = {}) {
  let { title, requirement, content } = existing;

  // 1. 需求标题
  if (!title) {
    const t = await p.text({
      message: '需求标题？',
      validate: (v) => (!v || v.trim().length === 0 ? '标题不能为空' : undefined),
    });
    if (p.isCancel(t)) bail('已取消');
    title = (t || '').trim();
  }

  // 2. 是否已登记 REQ-XXX
  if (requirement === undefined) {
    const hasReq = await p.confirm({
      message: '是否已登记 REQ-XXX 需求标识？',
      active: 'Yes',
      inactive: 'No',
      initialValue: false,
    });
    if (p.isCancel(hasReq)) bail('已取消');
    if (hasReq) {
      const r = await p.text({
        message: 'REQ-XXX：',
        placeholder: 'REQ-0001',
      });
      if (p.isCancel(r)) bail('已取消');
      requirement = (r || '').trim();
    } else {
      requirement = '';
    }
  }

  // 3. 需求内容
  if (!content) {
    const c = await p.text({
      message: '需求内容（详细描述）：',
      validate: (v) => (!v || v.trim().length === 0 ? '内容不能为空' : undefined),
    });
    if (p.isCancel(c)) bail('已取消');
    content = (c || '').trim();
  }

  return { title, requirement, content };
}

/**
 * 旧需求沿用交互（@clack select 收集选择，委托 decideReuseAction 决策）。
 *
 * @param {Array<{id:string,title:string,status:string,changeDir:string}>} candidates
 * @returns {Promise<{action:'new'} | {action:'reuse', change:object}>}
 */
export async function askReuseDecision(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { action: 'new' };
  }

  const options = [
    ...candidates.map((c) => ({
      value: `reuse:${c.id}`,
      label: `沿用 ${c.id}`,
      hint: `${c.title || '(untitled)'} (${c.status})`,
    })),
    { value: 'new', label: '新建 Change', hint: '不复用现有' },
  ];

  const choice = await p.select({
    message: `匹配到 ${candidates.length} 个进行中 Change，如何处理？`,
    options,
  });
  if (p.isCancel(choice)) bail('已取消');

  return decideReuseAction(candidates, choice);
}
