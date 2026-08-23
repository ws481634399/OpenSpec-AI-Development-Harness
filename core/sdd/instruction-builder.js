// InstructionBuilder：组装 Instruction Markdown（纯函数，不 IO）
// 输入 Skill 定义 + Workspace Context + 用户输入 → 输出 Instruction 文本
// 交外部 Agent（Trae/Cursor/Claude Code）按 Instruction 执行产出 Artifact
// OpenSpec 不执行 AI，只装配上下文、生成 Instruction

/**
 * 组装 Instruction Markdown。
 *
 * 结构：
 * 1. Skill 角色与目标（id/stage/description）
 * 2. Workspace Context 摘要（阶段应读目录 + 文件清单）
 * 3. 用户输入原文（requirement/title/content/changeId）
 * 4. Artifact 产出（output-artifacts 引用 templates/artifacts/）
 * 5. 外部 Agent 执行指引（推理/非结构化分析/写回 CHG/推进状态）
 * 6. SKILL.md 原文（若有）
 *
 * @param {object} skill loadSkill 返回值（含 yaml / skillMd）
 * @param {object} context assembleContext 返回值（含 stage / dirs / files）
 * @param {object} [userInput] 用户输入（requirement / title / content / changeId）
 * @returns {string} Instruction Markdown
 */
export function buildInstruction(skill, context, userInput = {}) {
  const y = skill.yaml || {};
  const lines = [];

  // 1. 标题与阶段
  lines.push(`# Instruction: ${y.id || skill.id}`);
  lines.push('');
  lines.push(
    `> 阶段：${y.stage || ''}（requires-state: ${y['requires-state'] || ''} → produces-state: ${y['produces-state'] || ''}）`
  );
  lines.push('');

  // 2. Skill 角色与目标
  if (y.description) {
    lines.push('## Skill 角色与目标');
    lines.push('');
    lines.push(y.description);
    lines.push('');
  }

  // 3. Workspace Context 摘要
  lines.push('## Workspace Context');
  lines.push('');
  const dirs = context?.dirs || [];
  lines.push(`阶段 \`${context?.stage || y.stage || ''}\` 应读取的目录：${dirs.length > 0 ? dirs.join(', ') : '(none)'}`);
  lines.push('');
  const files = context?.files || [];
  if (files.length > 0) {
    lines.push(`上下文文件清单（共 ${files.length} 个）：`);
    lines.push('');
    for (const f of files) {
      lines.push(`- \`${f.path}\``);
    }
    lines.push('');
  } else {
    lines.push('（无上下文文件）');
    lines.push('');
  }

  // 4. 用户输入
  lines.push('## 用户输入');
  lines.push('');
  if (userInput.requirement) lines.push(`- Requirement: ${userInput.requirement}`);
  if (userInput.title) lines.push(`- Title: ${userInput.title}`);
  if (userInput.content) {
    lines.push('- Content:');
    lines.push('');
    lines.push('```');
    lines.push(userInput.content);
    lines.push('```');
    lines.push('');
  }
  if (userInput.changeId) lines.push(`- Change: ${userInput.changeId}`);
  if (!userInput.requirement && !userInput.title && !userInput.content && !userInput.changeId) {
    lines.push('（无）');
    lines.push('');
  }

  // 5. Artifact 产出
  lines.push('## Artifact 产出');
  lines.push('');
  const artifacts = Array.isArray(y['output-artifacts']) ? y['output-artifacts'] : [];
  if (artifacts.length > 0) {
    lines.push('本次 Skill 需产出以下 Artifact（由外部 Agent 按 templates/artifacts/ 模板补充非结构化分析）：');
    lines.push('');
    for (const a of artifacts) {
      lines.push(`- \`${a}\``);
    }
    lines.push('');
  } else {
    lines.push('（无 Artifact 约束）');
    lines.push('');
  }

  // 6. 执行指引
  lines.push('## 执行指引');
  lines.push('');
  lines.push('你（外部 Agent：Trae / Cursor / Claude Code）负责：');
  lines.push('- 推理、非结构化分析（需求理解 / 影响分析 / 未知问题）');
  lines.push('- 按 Artifact 模板补充内容');
  lines.push('- 产出写入 CHG 目录');
  lines.push('');
  lines.push('OpenSpec 负责：上下文装配、规范约束、Artifact 管理、状态推进。');
  lines.push('');
  if (y['produces-state']) {
    lines.push(`完成后，运行 \`openspec change status <CHG-XXXX> --set ${y['produces-state']}\` 推进状态。`);
    lines.push('');
  }

  // 7. SKILL.md 原文（若有）
  if (skill.skillMd) {
    lines.push('---');
    lines.push('');
    lines.push('## SKILL.md');
    lines.push('');
    lines.push(skill.skillMd);
  }

  return lines.join('\n');
}
