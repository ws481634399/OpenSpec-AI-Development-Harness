// InstructionBuilder：组装 Instruction Markdown（纯函数，不 IO）
// 输入 Skill 定义 + Workspace Context + 用户输入 → 输出 Instruction 文本
// 交外部 Agent（Trae/Cursor/Claude Code）按 Instruction 执行产出 Artifact
// OpenSpec 不执行 AI，只装配上下文、生成 Instruction

/**
 * 组装 Instruction Markdown。
 *
 * 结构：
 * 1. Skill 角色与目标（id/stage/description）
 * 2. Prompt 片段（skill.yaml prompts 引用的片段原文，Phase 2.3；缺失条目标注）
 * 3. Workspace Context 摘要（阶段应读目录 + 文件清单）
 * 4. 用户输入原文（requirement/title/content/changeId）
 * 5. Artifact 产出（output-artifacts 引用 templates/artifacts/）
 * 6. 外部 Agent 执行指引（推理/非结构化分析/写回 CHG/推进状态）
 * 7. SKILL.md 原文（若有）
 *
 * @param {object} skill loadSkill 返回值（含 yaml / skillMd）
 * @param {object} context assembleContext 返回值（含 stage / dirs / files）
 * @param {object} [userInput] 用户输入（requirement / title / content / changeId）
 * @param {Array} [prompts] 已解析的 Prompt 片段数组（resolvePrompts().prompts，可选）
 * @returns {string} Instruction Markdown
 */
export function buildInstruction(skill, context, userInput = {}, prompts = []) {
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

  // 3. Prompt 片段（Phase 2.3：persona + 通用约束 + 输出格式，先于方法论生效）
  // 片段元素支持缺失占位：{ ref, missing: true }（resolvePrompts 的 missing 由调用方合并传入）
  if (prompts.length > 0) {
    lines.push('## Prompt 片段');
    lines.push('');
    for (const p of prompts) {
      lines.push(`### prompts/${p.ref}`);
      lines.push('');
      if (p.missing) {
        lines.push('> （缺失: 文件不存在，请检查 skill.yaml prompts 字段）');
        lines.push('');
        continue;
      }
      if (p.purpose || p.version || p.category) {
        const metaBits = [];
        if (p.category) metaBits.push(`category: ${p.category}`);
        if (p.version) metaBits.push(`version: ${p.version}`);
        if (p.purpose) metaBits.push(`purpose: ${p.purpose}`);
        lines.push(`> ${metaBits.join(' · ')}`);
        lines.push('');
      }
      lines.push(p.body);
      lines.push('');
    }
    lines.push('以上片段与本 Instruction 的其余部分同时生效。');
    lines.push('');
  }

  // 4. Context（Phase 2.6 v2：Change Artifacts + 内联文件 + 文件清单三 section）
  const allFiles = context?.files || [];
  const artifacts = allFiles.filter((f) => f.source === 'change-artifact' || f.source === 'auto');
  const inlineCtx = allFiles.filter(
    (f) => f.source === 'rule' && f.mode !== 'outline' && f.content,
  );
  const outlineCtx = allFiles.filter(
    (f) => f.source === 'rule' && (f.mode === 'outline' || !f.content),
  );

  // 4a. Change Artifacts：本 CHG 前序产物正文（Agent 的核心输入）
  lines.push('## Change Artifacts');
  lines.push('');
  if (artifacts.length > 0) {
    lines.push(`本 Change（${userInput.changeId || ''}）已有产物，内容如下（作为本次任务的核心输入）：`);
    lines.push('');
    for (const f of artifacts) {
      lines.push(`### ${f.path}`);
      lines.push('');
      lines.push('````');
      lines.push(f.content);
      lines.push('````');
      lines.push('');
    }
  } else {
    lines.push('（无）');
    lines.push('');
  }
  const missing = context?.missingArtifacts || [];
  if (missing.length > 0) {
    lines.push(`缺失产物（${missing.join('；')}）——尚未产出或无法定位，如与你的任务相关请先确认前置阶段已完成。`);
    lines.push('');
  }

  // 4b. Workspace Context 内联文件（standards/product 等知识正文）
  lines.push('## Workspace Context（内联文件）');
  lines.push('');
  if (inlineCtx.length > 0) {
    lines.push(`阶段 \`${context?.stage || y.stage || ''}\` 的知识上下文（正文已内联，无需回读）：`);
    lines.push('');
    for (const f of inlineCtx) {
      lines.push(`### ${f.path}`);
      lines.push('');
      lines.push('````');
      lines.push(f.content);
      lines.push('````');
      lines.push('');
    }
  } else {
    lines.push('（无内联文件）');
    lines.push('');
  }

  // 4c. Workspace Context 文件清单（outline 级：仅路径，Agent 按需读取）
  lines.push('## Workspace Context（文件清单）');
  lines.push('');
  lines.push(`阶段 \`${context?.stage || y.stage || ''}\` 的 outline 级上下文（仅路径，按需读取）：`);
  lines.push('');
  if (outlineCtx.length > 0) {
    for (const f of outlineCtx) {
      lines.push(`- \`${f.path}\``);
    }
    lines.push('');
  } else {
    lines.push('（无）');
    lines.push('');
  }
  const skipped = context?.skipped || [];
  if (skipped.length > 0) {
    lines.push(`因预算截断未装载的文件：${skipped.join('；')}`);
    lines.push('');
  }

  // 5. 用户输入
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

  // 6. Artifact 产出
  lines.push('## Artifact 产出');
  lines.push('');
  const outputArtifacts = Array.isArray(y['output-artifacts']) ? y['output-artifacts'] : [];
  if (outputArtifacts.length > 0) {
    lines.push('本次 Skill 需产出以下 Artifact（由外部 Agent 按 templates/artifacts/ 模板补充非结构化分析）：');
    lines.push('');
    for (const a of outputArtifacts) {
      lines.push(`- \`${a}\``);
    }
    lines.push('');
  } else {
    lines.push('（无 Artifact 约束）');
    lines.push('');
  }

  // 7. 执行指引
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

  // 8. SKILL.md 原文（若有）
  if (skill.skillMd) {
    lines.push('---');
    lines.push('');
    lines.push('## SKILL.md');
    lines.push('');
    lines.push(skill.skillMd);
  }

  return lines.join('\n');
}
