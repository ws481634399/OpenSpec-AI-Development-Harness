// GateValidator：Machine Gate 确定性校验（纯函数，仅依赖 node:fs/promises）
// 对齐 phase-1.5-workflow-engine-design.md §9
//
// 仅做机器能可靠判断的校验，不做 AI 语义评分
// 不扫描 Artifact 全文 - [ ] checkbox（区分 Gate Checklist vs Domain Checklist，见 §9.2）
// 只检查 gate.yaml machine-checks 显式声明的项

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { sha256 } from "./artifact-hash.js";
import { readGateResult } from "./gate-repository.js";
import {
  loadEvidence,
  validateEvidence,
  checkCoverage,
  readRepositoryIds,
  deriveWorkspaceRoot,
} from "./evidence-model.js";
import {
  readWorkspaceDus,
  aggregateDuStatus,
  readRepositories,
  DU_COMPLEXITY_TRIGGERS,
} from "./delivery-unit.js";
import { resolveSubmoduleHead } from "./git-submodule.js";

/**
 * 执行 Machine Gate 确定性校验。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} gateConfig gate.yaml 解析结果
 * @param {object} [opts] { metadata } 可选注入 metadata（避免重复读）
 * @returns {Promise<{passed:boolean, issues:string[], artifactHash:string}>}
 *   artifactHash 为空字符串表示 Artifact 文件不存在
 */
export async function runMachineGate(changeDir, gateConfig, opts = {}) {
  const issues = [];
  const artifactName = gateConfig.artifact;
  // Phase 2.4：Story 级 artifact（tasks.md）由调用方传入解析后的实际路径
  const artifactPath = opts.artifactPath || join(changeDir, artifactName);

  // 读取 Artifact 内容
  let content;
  try {
    content = await readFile(artifactPath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        passed: false,
        issues: [`Artifact not found: ${artifactName}`],
        artifactHash: "",
      };
    }
    throw e;
  }

  const artifactHash = sha256(content);
  const checks = gateConfig["machine-checks"] || [];

  for (const check of checks) {
    switch (check) {
      case "required-front-matter":
        checkRequiredFrontMatter(
          content,
          gateConfig["required-front-matter"] || [],
          issues,
          artifactName,
        );
        break;
      case "no-placeholder":
        checkNoPlaceholder(
          content,
          gateConfig["required-replacements"] || [],
          issues,
          artifactName,
        );
        break;
      case "required-sections":
        checkRequiredSections(
          content,
          gateConfig["non-empty-ai-sections"] || [],
          issues,
          artifactName,
        );
        break;
      case "cross-reference-valid":
        await checkCrossReference(content, changeDir, issues, artifactName);
        break;
      case "repositories-match-metadata":
        await checkRepositoriesMatch(
          changeDir,
          content,
          opts.metadata,
          issues,
          artifactName,
        );
        break;
      case "all-predecessors-accepted":
        await checkAllPredecessorsAccepted(changeDir, issues, artifactName);
        break;
      case "evidence-coverage":
        // Phase 2.1：Evidence 完整性机检（gate.yaml evidence-coverage 段声明开关）
        await checkEvidenceCoverage(
          changeDir,
          gateConfig["evidence-coverage"] || {},
          issues,
          artifactName,
        );
        break;
      case "feature-path-bound":
        // Phase 2.4 §17.3：metadata.feature-path 四级完整且 candidate=false
        await checkFeaturePathBound(
          changeDir,
          opts.metadata,
          issues,
          artifactName,
        );
        break;
      case "du-coverage":
        // Phase 2.4 §17.3：design 声明仓 ⊆ DU 覆盖仓 + DU 结构完整性
        await checkDuCoverage(
          changeDir,
          content,
          opts.metadata,
          issues,
          artifactName,
        );
        break;
      case "du-guidance":
        // Phase 2.5 §9.1：DU Implementation Guidance 完整性（Sketch/Pseudocode/Verification）
        await checkDuGuidance(
          changeDir,
          content,
          opts.metadata,
          issues,
          artifactName,
        );
        break;
      case "du-materialized":
        // Phase 2.4 §17.3：Workspace 全部 DU 已 materialize（repo 侧目录存在）
        await checkDuMaterialized(changeDir, issues, artifactName);
        break;
      case "du-fan-in-testing":
        // Phase 2.4 §17.3：所有 DU status ≥ testing
        await checkDuFanInTesting(changeDir, issues, artifactName);
        break;
      case "du-fan-in-complete":
        // Phase 2.4 §17.3：所有 DU completed（review 同态检查点前置）
        await checkDuFanInComplete(changeDir, issues, artifactName);
        break;
      case "submodule-pointer-aligned":
        // Phase 2.4 §17.3：repository-result commit == 实际 Submodule HEAD
        await checkSubmodulePointerAligned(changeDir, issues, artifactName);
        break;
      default:
        // 未知 check 不抛错（向前兼容，未来 gate.yaml 可声明新 check 而旧 validator 不破）
        break;
    }
  }

  return { passed: issues.length === 0, issues, artifactHash };
}

// ---- 各 check 实现 ----

function checkRequiredFrontMatter(
  content,
  requiredFields,
  issues,
  artifactName,
) {
  if (requiredFields.length === 0) return;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    issues.push(
      `${artifactName}: front-matter 缺失，但 required-front-matter 声明了 ${requiredFields.join(", ")}`,
    );
    return;
  }
  for (const field of requiredFields) {
    const re = new RegExp(`^${field}:\\s*\\S`, "m");
    if (!re.test(fmMatch[1])) {
      issues.push(
        `${artifactName}: required-front-matter 字段为空或缺失: ${field}`,
      );
    }
  }
}

function checkNoPlaceholder(
  content,
  requiredReplacements,
  issues,
  artifactName,
) {
  // 去掉 front-matter 后检查正文
  const body = content.replace(/^---\n[\s\S]*?\n---/, "");
  for (const placeholder of requiredReplacements) {
    const token = `{{${placeholder}}}`;
    if (body.includes(token)) {
      issues.push(`${artifactName}: 占位符未替换: ${token}`);
    }
  }
}

function checkRequiredSections(content, sections, issues, artifactName) {
  for (const section of sections) {
    // section 形如 "## 1. 背景"
    const re = new RegExp(`^${escapeRegex(section)}[ \\t]*$`, "m");
    const match = content.match(re);
    if (!match) {
      issues.push(`${artifactName}: 缺少必需 section: ${section}`);
      continue;
    }
    // 检查标题下有非注释内容（到下一个 ## 或 ### 标题前）
    const afterSection = content.slice(match.index + match[0].length);
    if (!hasNonCommentContent(afterSection)) {
      issues.push(`${artifactName}: section 内容为空或仅注释: ${section}`);
    }
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNonCommentContent(text) {
  // 去掉 HTML 注释块
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "");
  // 找到下一个 ## 或 ### 标题前的内容
  const nextSection = stripped.match(/^#{2,3}\s/m);
  const segment = nextSection ? stripped.slice(0, nextSection.index) : stripped;
  // 过滤空行
  const lines = segment.split("\n").filter((l) => l.trim());
  return lines.length > 0;
}

async function checkCrossReference(content, changeDir, issues, artifactName) {
  // v0.1：检查正文中所有 CHG-XXXX/<file>.md 引用的文件存在
  // 占位符已替换后正文会包含 "CHG-0001/prd.md" 这类引用
  const refMatches = content.match(/CHG-\d+\/[\w/.-]+\.md/g) || [];
  const seen = new Set();
  for (const ref of refMatches) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    // 提取文件名部分（CHG-0001/prd.md → prd.md；CHG-0001/evidence/test-report.md → evidence/test-report.md）
    const fileName = ref.split("/").slice(1).join("/");
    const refPath = join(changeDir, fileName);
    try {
      await readFile(refPath, "utf8");
    } catch (e) {
      if (e.code === "ENOENT") {
        issues.push(
          `${artifactName}: cross-reference 引用文件不存在: ${ref} (期望路径: ${refPath})`,
        );
      }
    }
  }
}

async function checkRepositoriesMatch(
  changeDir,
  content,
  metadata,
  issues,
  artifactName,
) {
  // 从正文中提取 "repos-involved: a, b, c" 形式的字段
  const meta = metadata || (await readMetadataInline(changeDir));
  const m = content.match(/^repos-involved[:\s]+([^\n]*)/m);
  if (!m) return; // artifact 不含此字段，跳过
  const inArtifact = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const inMeta = meta.repositories || [];
  for (const r of inArtifact) {
    if (!inMeta.includes(r)) {
      issues.push(
        `${artifactName}: repositories 与 metadata 不匹配: artifact 含 ${r}，metadata.repositories 不含`,
      );
    }
  }
}

async function readMetadataInline(changeDir) {
  const { readMetadata } = await import("./change-model.js");
  return readMetadata(changeDir);
}

async function checkAllPredecessorsAccepted(changeDir, issues, artifactName) {
  // sdd-converge 专用：检查前序所有 artifact accepted（§15.1）
  // Phase 2.2：纳入 review-report.md（review 检查点未 accepted 时 converge 不可推进）
  const predecessors = [
    "exploration.md",
    "prd.md",
    "design.md",
    "tasks.md",
    "implementation.md",
    "evidence/test-report.md",
    "review-report.md",
  ];
  for (const name of predecessors) {
    const r = await readGateResult(changeDir, name);
    if (r.status !== "accepted") {
      issues.push(
        `${artifactName}: 前序 artifact 未 accepted: ${name} (status: ${r.status})`,
      );
    }
  }
}

async function checkEvidenceCoverage(changeDir, flags, issues, artifactName) {
  // Phase 2.1（phase-2.1-evidence-system-design.md §4.2）：
  // 1. evidence.yaml 存在且可 parse
  // 2. validateEvidence 全量规则通过
  // 3. repos-coverage=true 时 implementation.md Commit ↔ code-change 条目对齐
  // 4. test-coverage=true 时至少 1 条通过的 test-run
  // Phase 2.2（plans/phase-2.2-sdd-review-skill-design.md §3.4）：
  // 5. findings-closure=true 时 blocker/major 的 review-finding 必须有非空 resolution
  const doc = await loadEvidence(changeDir);
  if (!doc) {
    issues.push(`${artifactName}: Evidence 索引缺失: evidence/evidence.yaml`);
    return;
  }
  // repo 白名单（repositories.yaml 缺失时跳过，向前兼容旧 Workspace）
  const repos = await readRepositoryIds(deriveWorkspaceRoot(changeDir));
  const v = validateEvidence(doc, { repositories: repos });
  if (!v.ok) {
    for (const issue of v.issues) {
      issues.push(`${artifactName}: evidence.yaml ${issue}`);
    }
    return; // schema 不过时覆盖检查无意义
  }
  const cov = await checkCoverage(changeDir, doc, {
    reposCoverage: flags["repos-coverage"] === true,
    testCoverage: flags["test-coverage"] === true,
    findingsClosure: flags["findings-closure"] === true,
  });
  for (const issue of cov.issues) {
    issues.push(`${artifactName}: ${issue}`);
  }
}

// ---- Phase 2.4 多仓交付新检查项（plans/phase-2.4-multi-repository-delivery-design.md §17.3）----

async function checkFeaturePathBound(
  changeDir,
  metadata,
  issues,
  artifactName,
) {
  // design gate：metadata.feature-path 四级完整且 candidate=false
  //（Candidate 须经 Human Gate 晋升并回填 candidate: false）
  const meta = metadata || (await readMetadataInline(changeDir));
  const fp = meta["feature-path"];
  if (!fp || typeof fp !== "object") {
    issues.push(
      `${artifactName}: feature-path 未绑定（先执行 openspec change bind-feature-path）`,
    );
    return;
  }
  for (const level of ["level-1", "level-2", "level-3", "story"]) {
    if (!fp[level]?.id) {
      issues.push(
        `${artifactName}: feature-path.${level} 缺失 id（四级路径必须完整）`,
      );
    }
  }
  if (fp.candidate === true) {
    issues.push(
      `${artifactName}: feature-path.candidate=true（Candidate 须经 Human Gate 晋升并回填 candidate: false）`,
    );
  }
}

/**
 * 解析 design.md front-matter 的 affected-repositories 声明。
 */
function parseAffectedRepositories(content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return [];
  try {
    const doc = parse(fm[1]);
    const v = doc?.["affected-repositories"];
    return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function checkDuCoverage(
  changeDir,
  content,
  metadata,
  issues,
  artifactName,
) {
  // task gate：design.affected-repositories ⊆ DU 覆盖仓集合；
  // 每个 DU repository ∈ repositories.yaml；DU 1:1 仓（repository 必填）；
  // DU ID 不重复（metadata.id 与目录一致）；scope/acceptance 非空；dependencies 引用有效
  const meta = metadata || (await readMetadataInline(changeDir));
  const dus = await readWorkspaceDus(changeDir, meta);
  if (dus.length === 0) {
    issues.push(
      `${artifactName}: 未创建任何 Delivery Unit（task 阶段必须产出 DU）`,
    );
  }

  const root = deriveWorkspaceRoot(changeDir);
  const repos = await readRepositories(root);
  const seenIds = new Set();
  const coveredRepos = new Set();

  for (const du of dus) {
    const m = du.metadata || {};
    if (m.id && m.id !== du.id) {
      issues.push(
        `${artifactName}: DU metadata.id 与目录名不一致: ${m.id} != ${du.id}`,
      );
    }
    if (seenIds.has(du.id)) {
      issues.push(`${artifactName}: DU ID 重复: ${du.id}`);
    }
    seenIds.add(du.id);

    const repository = m.repository || "";
    if (!repository) {
      issues.push(
        `${artifactName}: DU ${du.id} 未声明 repository（DU 1:1 Repository 硬约束）`,
      );
    } else {
      coveredRepos.add(repository);
      if (!repos.some((r) => r.id === repository)) {
        issues.push(
          `${artifactName}: DU ${du.id} repository '${repository}' 不在 .sdd/repositories.yaml`,
        );
      }
    }

    if (!Array.isArray(m.scope) || m.scope.length === 0) {
      issues.push(`${artifactName}: DU ${du.id} scope 为空`);
    }
    if (!Array.isArray(m.acceptance) || m.acceptance.length === 0) {
      issues.push(`${artifactName}: DU ${du.id} acceptance 为空`);
    }
  }

  // dependencies 引用有效（第二轮：所有 DU id 已收集）
  for (const du of dus) {
    const deps = Array.isArray(du.metadata?.dependencies)
      ? du.metadata.dependencies
      : [];
    for (const dep of deps) {
      if (!seenIds.has(dep)) {
        issues.push(
          `${artifactName}: DU ${du.id} dependencies 引用不存在的 DU: ${dep}`,
        );
      }
    }
  }

  // design.affected-repositories ⊆ DU 覆盖仓集合
  for (const repo of parseAffectedRepositories(content)) {
    if (!coveredRepos.has(repo)) {
      issues.push(
        `${artifactName}: design.affected-repositories '${repo}' 未被任何 DU 覆盖`,
      );
    }
  }
}

// ---- Phase 2.5 DU Implementation Guidance 机检（phase-2.5-du-implementation-guidance-design.md §9.1）----

/**
 * tasks.md DU 小节的顶层字段标签（用于字段值范围终止判定）。
 * 宽松匹配中英文变体（如 "Scope" / "Scope（范围）"）。
 */
const DU_FIELD_LABELS_RE =
  /^-\s*(目标仓库|目标\s*Goal|Scope[^:]*|Design\s*References|Dependencies|Acceptance\s*Criteria|Execution\s*Order|Parallelization|Implementation\s*Sketch|Pseudocode|Verification)\s*:/;

/**
 * 提取 tasks.md 中指定 DU 的小节文本（### <duId> 到下一个 ### 标题）。
 * @returns {string|null} 未找到返回 null
 */
function extractDuSection(content, duId) {
  const lines = content.split("\n");
  const startRe = new RegExp(`^###\\s+${escapeRegex(duId)}(\\s|:|：|$)`);
  const start = lines.findIndex((l) => startRe.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^###\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n");
}

/**
 * 提取 DU 小节中指定字段的值（字段行同行内容 + 直到下一个顶层字段行的跨行内容）。
 * @returns {string|null} 字段不存在返回 null
 */
function extractDuField(section, label) {
  const lines = section.split("\n");
  const labelRe = new RegExp(`^\\s*-\\s*${escapeRegex(label)}\\s*:(.*)$`);
  const start = lines.findIndex((l) => labelRe.test(l));
  if (start === -1) return null;
  const parts = [lines[start].replace(labelRe, "$1").replace(/\s#.*$/, "")];
  for (let i = start + 1; i < lines.length; i++) {
    if (DU_FIELD_LABELS_RE.test(lines[i])) break;
    parts.push(lines[i]);
  }
  return parts.join("\n");
}

/**
 * 规范化 DU 字段值：优先提取 code fence 内容，去注释行/空行。
 */
function normalizeDuValue(raw) {
  if (raw == null) return "";
  let text = String(raw);
  const fence = text.match(/```[\w-]*\r?\n([\s\S]*?)```/);
  if (fence) text = fence[1];
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith(">"))
    .join("\n");
}

/** N/A 声明（值以 N/A 开头）。 */
function isNaValue(text) {
  return /^N\/A\b/.test(text.trim());
}

/** 占位符：{{token}} 或独立成值的 TBD。 */
function containsDuPlaceholder(text) {
  if (/\{\{[^}]*\}\}/.test(text)) return true;
  return /^\s*TBD\s*$/m.test(text);
}

async function checkDuGuidance(changeDir, content, metadata, issues, artifactName) {
  // 全部为确定性检查（存在性/非空/枚举/一致性）；合理性判断属 Human Gate / Review
  const meta = metadata || (await readMetadataInline(changeDir));
  const dus = await readWorkspaceDus(changeDir, meta);
  if (dus.length === 0) return; // 无 DU 时由 du-coverage 报 issue，此处不重复

  for (const du of dus) {
    const section = extractDuSection(content, du.id);
    if (section === null) {
      issues.push(
        `${artifactName}: DU ${du.id} 在 tasks.md 中无对应小节（### ${du.id}）`,
      );
      continue;
    }

    // metadata 合法性：implementation-guidance 段存在 + trigger 枚举合法
    const g = du.metadata["implementation-guidance"];
    if (!g || typeof g !== "object") {
      issues.push(
        `${artifactName}: DU ${du.id} metadata 缺少 implementation-guidance 段（v0.2；重新 du create 或手工补段）`,
      );
    } else {
      const triggers = Array.isArray(g["complexity-trigger"])
        ? g["complexity-trigger"]
        : [];
      for (const t of triggers) {
        if (!DU_COMPLEXITY_TRIGGERS.includes(t)) {
          issues.push(
            `${artifactName}: DU ${du.id} complexity-trigger 非法值 '${t}'（允许: ${DU_COMPLEXITY_TRIGGERS.join(" / ")}）`,
          );
        }
      }
    }
    const requirePseudo = g?.pseudocode === true;

    // Sketch 非空（必填）
    const sketch = normalizeDuValue(extractDuField(section, "Implementation Sketch"));
    if (!sketch || containsDuPlaceholder(sketch)) {
      issues.push(
        `${artifactName}: DU ${du.id} Implementation Sketch 为空或含占位符（必填）`,
      );
    }

    // Pseudocode 条件存在 / 声明一致
    const pseudo = normalizeDuValue(extractDuField(section, "Pseudocode"));
    if (requirePseudo) {
      if (!pseudo || containsDuPlaceholder(pseudo) || isNaValue(pseudo)) {
        issues.push(
          `${artifactName}: DU ${du.id} 声明 pseudocode: true 但 Pseudocode 为空/占位符/N/A`,
        );
      }
    } else if (!pseudo) {
      issues.push(
        `${artifactName}: DU ${du.id} Pseudocode 为空（未命中 complexity-trigger 时写 N/A + 理由）`,
      );
    } else if (isNaValue(pseudo) && pseudo.replace(/^N\/A/, "").trim() === "") {
      issues.push(
        `${artifactName}: DU ${du.id} Pseudocode 为 N/A 但未附理由（须说明未命中触发器的原因）`,
      );
    }

    // Verification 非空（必填）
    const verification = normalizeDuValue(extractDuField(section, "Verification"));
    if (!verification || containsDuPlaceholder(verification)) {
      issues.push(
        `${artifactName}: DU ${du.id} Verification 为空或含占位符（必填）`,
      );
    }
  }
}

async function checkDuMaterialized(changeDir, issues, artifactName) {
  // dev gate：Workspace 全部 DU 已 materialize（repo 侧目录存在）
  const agg = await aggregateDuStatus(changeDir);
  if (agg.total === 0) {
    issues.push(
      `${artifactName}: 未创建任何 Delivery Unit（dev 前必须完成 task 分解与物化）`,
    );
    return;
  }
  for (const du of agg.dus) {
    if (!du.materialized) {
      issues.push(
        `${artifactName}: DU ${du.id} 未 materialize 到仓库（先执行 openspec du materialize）`,
      );
    }
  }
}

async function checkDuFanInTesting(changeDir, issues, artifactName) {
  // test gate：所有 DU status ≥ testing
  const agg = await aggregateDuStatus(changeDir);
  if (agg.total === 0) {
    issues.push(
      `${artifactName}: 未创建任何 Delivery Unit（test 前必须完成 DU 开发）`,
    );
    return;
  }
  for (const du of agg.dus) {
    if (!["testing", "completed"].includes(du.status)) {
      issues.push(
        `${artifactName}: DU ${du.id} status=${du.status}，未达到 testing（Fan-in 阻断）`,
      );
    }
  }
}

async function checkDuFanInComplete(changeDir, issues, artifactName) {
  // review gate（同态检查点前置）：所有 DU completed
  const agg = await aggregateDuStatus(changeDir);
  if (agg.total === 0) {
    issues.push(
      `${artifactName}: 未创建任何 Delivery Unit（review 前必须完成 DU 交付）`,
    );
    return;
  }
  for (const du of agg.dus) {
    if (du.status !== "completed") {
      issues.push(
        `${artifactName}: DU ${du.id} status=${du.status}，未 completed（Fan-in 阻断）`,
      );
    }
  }
}

async function checkSubmodulePointerAligned(changeDir, issues, artifactName) {
  // converge gate：metadata.repository-result.<repo>.commit == 实际 Submodule HEAD
  // HEAD 经 git 内部文件只读解析（不执行 git 命令，见 git-submodule.js）
  const meta = await readMetadataInline(changeDir);
  const result = meta["repository-result"];
  const dus = await readWorkspaceDus(changeDir, meta);

  if (
    !result ||
    typeof result !== "object" ||
    Object.keys(result).length === 0
  ) {
    // v1 CHG（无 DU、无 repository-result）不要求 pointer 校验（§24.4 向后兼容）
    if (dus.length > 0) {
      issues.push(
        `${artifactName}: 存在 DU 但 metadata.repository-result 为空（DU completed 时应回填 result commit）`,
      );
    }
    return;
  }

  const root = deriveWorkspaceRoot(changeDir);
  const repos = await readRepositories(root);
  for (const [repository, entry] of Object.entries(result)) {
    const recorded = entry?.commit;
    if (!recorded) {
      issues.push(
        `${artifactName}: repository-result.${repository}.commit 为空`,
      );
      continue;
    }
    const repoEntry = repos.find((r) => r.id === repository);
    if (!repoEntry) {
      issues.push(
        `${artifactName}: repository-result 仓库 '${repository}' 不在 .sdd/repositories.yaml`,
      );
      continue;
    }
    const head = await resolveSubmoduleHead(root, repoEntry.path);
    if (!head) {
      issues.push(
        `${artifactName}: 无法读取 '${repository}' 的 Git HEAD（仓库未初始化或非 Git 仓）`,
      );
      continue;
    }
    if (head !== String(recorded).toLowerCase()) {
      issues.push(
        `${artifactName}: Submodule Pointer 未对齐: ${repository} recorded=${recorded} actual=${head}（先执行 openspec du sync-status）`,
      );
    }
  }
}
