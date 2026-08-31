// Doctor Command：Workspace 自检（CLI 层，复用 core/workspace/validator.js + core/sdd/doctor-checks.js）
// Phase 1：结构/字段/版本一致性；Phase 2.4：多仓架构检查（§7.3）

import { Command } from "commander";
import { outro } from "@clack/prompts";
import { resolveWorkspaceRoot } from "../lib/workspace-resolver.js";
import { ok, warn, error, dim } from "../lib/logger.js";
import { runSelfCheck } from "../../../../core/workspace/validator.js";
import {
  runMultiRepoChecks,
  runContextRulesChecks,
  runVersionChecks,
  runIdeRulesChecks,
  runStructureChecks,
} from "../../../../core/sdd/doctor-checks.js";
import { checkFeaturesProjection } from "../../../../core/sdd/feature-materializer.js";
import { getHarnessRoot } from "../../../../core/workspace/harness-root.js";
import { readHarnessVersion } from "../../../../core/workspace/version.js";

/**
 * 注册 doctor 命令到 commander program。
 */
export function registerDoctorCommand(program) {
  program
    .command("doctor")
    .description("Workspace 自检（结构/字段/版本一致性 + 多仓架构检查）")
    .action(async () => {
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();
        const expectedVersion = readHarnessVersion(harnessRoot);
        const result = runSelfCheck(ws, expectedVersion);

        const issues = [...result.issues];

        // Phase 2.4：多仓架构检查（Registry/.gitmodules/HEAD/feature-path/DU/pointer）
        let multiChecked = 0;
        try {
          const multi = await runMultiRepoChecks(ws);
          issues.push(...multi.issues);
          multiChecked += multi.checked;
        } catch (e) {
          warn(`多仓检查跳过: ${e.message}`);
        }

        // Phase 2.6：context-rules.yaml 校验（stage 覆盖/枚举/path 存在性）
        try {
          const ctxChecks = await runContextRulesChecks(ws);
          issues.push(...ctxChecks.issues);
          multiChecked += ctxChecks.checked;
        } catch (e) {
          warn(`Context 规则检查跳过: ${e.message}`);
        }

        // Phase 3.1：版本健康检查（分级：跨 major=error / 可升级=info / schema 超前=error）
        let versionInfos = [];
        try {
          const v = runVersionChecks(ws, harnessRoot);
          issues.push(...v.issues);
          versionInfos = v.infos;
          multiChecked += v.checked;
        } catch (e) {
          warn(`版本检查跳过: ${e.message}`);
        }

        // Phase 3.3：IDE 规则版本检查（可选件：落后=info / 不存在=不提示）
        try {
          const ide = await runIdeRulesChecks(ws, harnessRoot);
          versionInfos.push(...ide.infos);
          multiChecked += ide.checked;
        } catch {
          // IDE 规则检查是可选增强，失败静默
        }

        // Phase 3.5：product/features 四级投影检查（缺失=提示 materialize / drift=报告）
        try {
          const proj = await checkFeaturesProjection(ws);
          if (proj.missing.length > 0) {
            versionInfos.push(
              `features/ 投影缺失 ${proj.missing.length} 个节点目录——运行 'openspec feature materialize'`,
            );
          }
          if (proj.drifted.length > 0) {
            versionInfos.push(
              `features/ drift（目录无对应树节点，未删除）：${proj.drifted.join("、")}`,
            );
          }
          multiChecked += 1;
        } catch {
          // features 投影检查失败静默（树为空等场景）
        }

        // Phase 3.6：CHG 四级骨架锚点一致性（README id 锚点 / bound-chg / 树名落后）
        try {
          const st = await runStructureChecks(ws);
          issues.push(...st.issues);
          versionInfos.push(...st.infos);
          multiChecked += st.checked;
        } catch (e) {
          warn(`骨架结构检查跳过: ${e.message}`);
        }

        if (issues.length === 0) {
          ok(
            `Workspace healthy — all checks passed.${multiChecked ? ` (${multiChecked} multi-repo checks)` : ""}`,
          );
        } else {
          warn(`Workspace has ${issues.length} issue(s):`);
          for (const issue of issues) {
            warn(`  ! ${issue}`);
          }
        }
        // 版本 info 提示（非问题，仅为升级建议）
        for (const info of versionInfos) {
          dim(`  ℹ ${info}`);
        }
        outro("Done.");
      } catch (e) {
        error(e.message);
        outro("Doctor failed.");
        process.exit(1);
      }
    });
}
