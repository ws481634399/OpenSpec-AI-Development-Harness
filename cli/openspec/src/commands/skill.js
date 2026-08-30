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
  syncPrompts,
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
        `prompts: ${Array.isArray(y.prompts) ? y.prompts.join(", ") : "-"}`,
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

  // sync：从 Harness 同步 skills/ 到 Workspace（Phase 3.1：版本对比 + --dry-run）
  skill
    .command("sync")
    .description("从 Harness 同步内置 Skills/Prompts 到 Workspace（按版本对比）")
    .option("--dry-run", "仅对比版本并预览变化，不写入任何文件")
    .action(async (opts) => {
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

        const dryRun = opts.dryRun === true;
        const result = await syncSkills(harnessRoot, workspaceRoot, { dryRun });
        const promptResult = await syncPrompts(harnessRoot, workspaceRoot, { dryRun });
        const prefix = dryRun ? "[dry-run] 将" : "已";
        ok(
          `${prefix}同步 ${result.changed.length} 个 Skill（共 ${result.synced} 变化）到 Workspace skills/，` +
            `${promptResult.changed.length} 个 Prompt 片段到 Workspace prompts/`
        );
        note(
          [...result.details, ...promptResult.details].join("\n"),
          dryRun ? "Sync Plan" : "Sync Details"
        );
        if (dryRun) {
          note("未写入任何文件。去掉 --dry-run 执行实际同步。", "dry-run");
        }
        outro("Done.");
      } catch (e) {
        error(e.message);
        outro("Sync failed.");
        process.exit(1);
      }
    });
}
