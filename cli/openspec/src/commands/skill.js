// Skill Command：编排 list/show/sync（CLI 层，依赖 core/sdd）
// 移除 skill run（编排逻辑已移入 SKILL.md，Agent 直接读 SKILL.md 执行）
// list/show 从 Workspace skills/ 读取（init 时复制的本地副本）
// sync 更新 Workspace skills/ 从 Harness

import { Command } from "commander";
import { outro, note } from "@clack/prompts";
import { resolveWorkspaceRoot } from "../lib/workspace-resolver.js";
import { ok, warn, error } from "../lib/logger.js";
import {
  listSkills,
  getSkill,
  syncSkills,
} from "../../../../core/sdd/skill-registry.js";
import { getHarnessRoot } from "../../../../core/workspace/harness-root.js";
import { join } from "node:path";

/**
 * 注册 skill 子命令组到 commander program。
 */
export function registerSkillCommand(program) {
  const skill = program
    .command("skill")
    .description("SDD Skill 元数据查询与同步");

  // list：列出所有 Skill（从 Workspace 本地副本读取）
  skill.command("list").action(async () => {
    try {
      const harnessRoot = getHarnessRoot();
      let workspaceRoot;
      try {
        workspaceRoot = resolveWorkspaceRoot();
      } catch {
        // 不在 Workspace 内，fallback 到 Harness
      }
      const skills = await listSkills(harnessRoot, workspaceRoot);
      if (skills.length === 0) {
        note("No skills found.", "Skills");
      } else {
        note(
          skills
            .map((s) => {
              const stage = s.stage || "";
              const req = s.requiresState || "-";
              const prod = s.producesState || "-";
              return `${s.id}  stage: ${stage}  ${req} → ${prod}  artifacts: [${s.outputArtifacts.join(", ")}]`;
            })
            .join("\n"),
          `Skills (${skills.length})`,
        );
      }
      outro("Done.");
    } catch (e) {
      error(e.message);
      outro("List failed.");
      process.exit(1);
    }
  });

  // show：显示 Skill 详情 + SKILL.md 路径（供 Agent 读取执行）
  skill.command("show <id>").action(async (id) => {
    try {
      const harnessRoot = getHarnessRoot();
      let workspaceRoot;
      try {
        workspaceRoot = resolveWorkspaceRoot();
      } catch {
        // 不在 Workspace 内，fallback 到 Harness
      }
      const loaded = await getSkill(id, harnessRoot, workspaceRoot);
      const y = loaded.yaml || {};

      // 解析 SKILL.md 路径：优先 Workspace 本地副本
      const skillsRoot = workspaceRoot || harnessRoot;
      const skillMdPath = join(skillsRoot, "skills", id, "SKILL.md");

      const lines = [
        `id: ${y.id || id}`,
        `version: ${y.version || ""}`,
        `stage: ${y.stage || ""}`,
        `description: ${y.description || ""}`,
        `requires-state: ${y["requires-state"] || "-"}`,
        `produces-state: ${y["produces-state"] || "-"}`,
        `output-artifacts: ${Array.isArray(y["output-artifacts"]) ? y["output-artifacts"].join(", ") : ""}`,
      ];
      note(lines.join("\n"), `${id} metadata`);

      ok(`SKILL.md: ${skillMdPath}`);
      warn(`Agent 请读取上述路径的 SKILL.md 并按指令执行`);

      outro("Done.");
    } catch (e) {
      error(e.message);
      outro("Show failed.");
      process.exit(1);
    }
  });

  // sync：从 Harness 同步 skills/ 到 Workspace
  skill
    .command("sync")
    .description("从 Harness 同步内置 Skills 到 Workspace")
    .action(async () => {
      try {
        const harnessRoot = getHarnessRoot();
        let workspaceRoot;
        try {
          workspaceRoot = resolveWorkspaceRoot();
        } catch {
          error("不在 Workspace 内，无法 sync。请先在 Workspace 目录执行。");
          outro("Sync failed.");
          process.exit(1);
        }

        const result = await syncSkills(harnessRoot, workspaceRoot);
        ok(`已同步 ${result.synced} 个 Skill 到 Workspace skills/`);
        note(result.details.join("\n"), "Sync Details");
        outro("Done.");
      } catch (e) {
        error(e.message);
        outro("Sync failed.");
        process.exit(1);
      }
    });
}
