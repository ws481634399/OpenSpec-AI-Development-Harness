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
import { readMetadata } from "./change-model.js";
import {
  resolveArtifactPath,
  resolveStoryDir,
  resolveStoryDirV3,
  resolveArtifactPathV3,
  isMultiStory,
} from "./artifact-path.js";
import {
  loadEvidence,
  validateEvidence,
  checkCoverage,
  readRepositoryIds,
  deriveWorkspaceRoot,
} from "./evidence-model.js";
import {
  readWorkspaceDus,
  readWorkspaceDusForStory,
  aggregateDuStatus,
  aggregateDuStatusForStory,
  readRepositories,
  DU_COMPLEXITY_TRIGGERS,
} from "./delivery-unit.js";
import { resolveSubmoduleHead } from "./git-submodule.js";

/**
 * 执行 Machine Gate 确定性校验。
 *
 * machine-checks 条目两种格式（Phase 4.1 轻量化）：
 * - 字符串（v0.1 兼容）：'required-front-matter'，severity=blocking
 * - 对象：{ id, severity: blocking|advisory, skip-tier: [light,...] }
 *   advisory fail → 收集到 warnings，不阻断（Gate Result 留痕）
 *   skip-tier 含当前 Change 的 evidence-tier 时整条跳过（Evidence 分档）
 *
 * Phase 4.2 三态分发（Gate 分层分发）：
 * - inline（缺省）：单 Story 平铺双语义，artifact/检查项与 v0.2 完全一致（100% 向后兼容）
 * - change3：多 Story Change（isMultiStory）且 gate.yaml 声明 three-tier.change-artifact
 *   → 检查 Change 级产物（change-prd.md / change-design.md，CHG 根）
 * - story：opts.storyId 传入且 gate.yaml 声明 three-tier.story-artifact
 *   → 检查 Story 级产物（story-spec.md / story-design.md / tasks.md...，stories/<id>/ 目录），
 *     machine-checks = 基础检查 + three-tier.story-machine-checks 追加，
 *     DU/Evidence 相关检查自动切换为该 Story 范围（Gate 分层）
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} gateConfig gate.yaml 解析结果
 * @param {object} [opts] { metadata?, artifactPath?, storyId? } 可选注入（避免重复读）
 * @returns {Promise<{passed:boolean, issues:string[], warnings:string[], artifactHash:string}>}
 *   artifactHash 为空字符串表示 Artifact 文件不存在
 */
export async function runMachineGate(changeDir, gateConfig, opts = {}) {
  const issues = [];
  const warnings = [];
  const meta = opts.metadata || (await readMetadata(changeDir));

  // Phase 4.2 三态分发
  const tt = gateConfig["three-tier"] || {};
  const storyMode = Boolean(opts.storyId) && Boolean(tt["story-artifact"]);
  const change3Mode = !storyMode && isMultiStory(meta) && Boolean(tt["change-artifact"]);
  const artifactName = storyMode
    ? tt["story-artifact"]
    : change3Mode
      ? tt["change-artifact"]
      : gateConfig.artifact;
  const artifactPath =
    opts.artifactPath ||
    (storyMode
      ? resolveArtifactPathV3(changeDir, artifactName, meta, opts.storyId)
      : change3Mode
        ? join(changeDir, artifactName) // Change 级三级产物固定在 CHG 根（plan §3.1）
        : resolveArtifactPath(changeDir, artifactName, meta));

  // 读取 Artifact 内容
  let content;
  try {
    content = await readFile(artifactPath, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        passed: false,
        issues: [`Artifact not found: ${artifactName}`],
        warnings,
        artifactHash: "",
      };
    }
    throw e;
  }

  const artifactHash = sha256(content);
  const baseChecks = gateConfig["machine-checks"] || [];
  const checks =
    storyMode && Array.isArray(tt["story-machine-checks"])
      ? [...baseChecks, ...tt["story-machine-checks"]]
      : baseChecks;

  // Evidence 分档：story mode 下 Story metadata 的 evidence-tier 覆盖 Change 级
  let tier = meta["evidence-tier"] || "standard";
  if (storyMode) {
    const sDir = resolveStoryDirV3(changeDir, meta, opts.storyId);
    if (sDir) {
      try {
        const sm = parse(await readFile(join(sDir, "story-metadata.yaml"), "utf8"));
        if (sm?.["evidence-tier"]) tier = sm["evidence-tier"];
      } catch {
        // story-metadata.yaml 未创建 → 继承 Change 级档位
      }
    }
  }

  /** 按 mode 取配置段：story/change3 优先专用段，缺省回落共享段（inline 与 v0.2 一致） */
  const cfg = (key) => {
    const modeKey = storyMode ? `story-${key}` : change3Mode ? `change-${key}` : null;
    const v = modeKey ? tt[modeKey] : undefined;
    return v !== undefined ? v : gateConfig[key];
  };

  const storyDir = storyMode
    ? resolveStoryDirV3(changeDir, meta, opts.storyId)
    : resolveStoryDir(changeDir, meta);

  for (const entry of checks) {
    const check = typeof entry === "string" ? entry : entry?.id;
    if (!check) continue; // 非法条目跳过（向前兼容）
    const severity =
      typeof entry === "object" && entry.severity ? entry.severity : "blocking";
    const skipTier =
      typeof entry === "object" && Array.isArray(entry["skip-tier"])
        ? entry["skip-tier"]
        : [];
    if (skipTier.includes(tier)) continue; // Evidence 分档：低档位免重仪式检查

    const bucket = severity === "advisory" ? warnings : issues;
    switch (check) {
      case "required-front-matter":
        checkRequiredFrontMatter(
          content,
          cfg("required-front-matter") || [],
          bucket,
          artifactName,
        );
        break;
      case "no-placeholder":
        checkNoPlaceholder(
          content,
          cfg("required-replacements") || [],
          bucket,
          artifactName,
        );
        break;
      case "required-sections":
        checkRequiredSections(
          content,
          cfg("non-empty-ai-sections") || [],
          bucket,
          artifactName,
        );
        break;
      case "cross-reference-valid":
        await checkCrossReference(
          content,
          changeDir,
          bucket,
          artifactName,
          storyDir,
        );
        break;
      case "change-ref-bound":
        // Phase 4.2 Story 级 cross-reference（blocking）：front-matter 引用必须指向
        // change-prd.md / change-design.md 的真实章节锚点
        await checkChangeRefBound(content, entry, changeDir, bucket, artifactName);
        break;
      case "scope-subset":
        // Phase 4.2 确定性 Scope 子集校验（[S<n>] 编号引用；target: change | du）
        await checkScopeSubset(
          content,
          changeDir,
          meta,
          opts,
          entry,
          bucket,
          warnings,
          artifactName,
        );
        break;
      case "repo-subset":
        // Phase 4.2：story-design.affected-repositories ⊆ change-design 声明
        await checkRepoSubset(content, changeDir, bucket, artifactName);
        break;
      case "repositories-match-metadata":
        await checkRepositoriesMatch(
          changeDir,
          content,
          opts.metadata,
          bucket,
          artifactName,
        );
        break;
      case "all-predecessors-accepted":
        await checkAllPredecessorsAccepted(changeDir, bucket, artifactName);
        break;
      case "evidence-coverage":
        // Phase 2.1：Evidence 完整性机检（gate.yaml evidence-coverage 段声明开关）
        await checkEvidenceCoverage(
          changeDir,
          gateConfig["evidence-coverage"] || {},
          bucket,
          artifactName,
          meta,
          storyMode ? { storyDir } : undefined,
        );
        break;
      case "feature-path-bound":
        // Phase 2.4 §17.3：feature-path 四级完整且 candidate=false
        // Phase 4.2：story 模式读 Story 级 feature-path（3-tier 拆分后 Change 级已清空，权威在 Story metadata）
        await checkFeaturePathBound(changeDir, opts.metadata, bucket, artifactName, opts);
        break;
      case "du-coverage":
        // Phase 2.4 §17.3：design 声明仓 ⊆ DU 覆盖仓 + DU 结构完整性
        await checkDuCoverage(
          changeDir,
          content,
          opts.metadata,
          bucket,
          artifactName,
          opts.storyId,
        );
        break;
      case "du-guidance":
        // Phase 2.5 §9.1：DU Implementation Guidance 完整性（Sketch/Pseudocode/Verification）
        await checkDuGuidance(
          changeDir,
          content,
          opts.metadata,
          bucket,
          artifactName,
          opts.storyId,
        );
        break;
      case "du-materialized":
        // Phase 2.4 §17.3：Workspace 全部 DU 已 materialize（repo 侧目录存在）
        await checkDuMaterialized(changeDir, bucket, artifactName, meta, opts.storyId);
        break;
      case "du-fan-in-testing":
        // Phase 2.4 §17.3：所有 DU status ≥ testing
        await checkDuFanInTesting(changeDir, bucket, artifactName, meta, opts.storyId);
        break;
      case "du-fan-in-complete":
        // Phase 2.4 §17.3：所有 DU completed（review 同态检查点前置）
        await checkDuFanInComplete(changeDir, bucket, artifactName, meta, opts.storyId);
        break;
      case "submodule-pointer-aligned":
        // Phase 2.4 §17.3：repository-result commit == 实际 Submodule HEAD
        await checkSubmodulePointerAligned(changeDir, bucket, artifactName);
        break;
      default:
        // 未知 check 不抛错（向前兼容，未来 gate.yaml 可声明新 check 而旧 validator 不破）
        break;
    }
  }

  return { passed: issues.length === 0, issues, warnings, artifactHash };
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
    // 检查标题下有非注释内容（到下一个同级或更高级标题前；子标题算内容）
    const afterSection = content.slice(match.index + match[0].length);
    const level = (section.match(/^#+/) || ["#"])[0].length;
    if (!hasNonCommentContent(afterSection, level)) {
      issues.push(`${artifactName}: section 内容为空或仅注释: ${section}`);
    }
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasNonCommentContent(text, level = 2) {
  // 去掉 HTML 注释块
  const stripped = text.replace(/<!--[\s\S]*?-->/g, "");
  // 缺陷 4 修复：截断点只取同级或更高级标题（# 数 <= level）；
  // 更深的子标题（如 ## section 下的 ### 小节）属于本 section 内容，不再提前截断
  const cutoff = new RegExp(`^#{1,${Math.max(1, level)}}\\s`, "m");
  const nextSection = stripped.match(cutoff);
  const segment = nextSection ? stripped.slice(0, nextSection.index) : stripped;
  // 过滤空行
  const lines = segment.split("\n").filter((l) => l.trim());
  return lines.length > 0;
}

async function checkCrossReference(
  content,
  changeDir,
  issues,
  artifactName,
  storyDir,
) {
  // v0.1：检查正文中所有 CHG-XXXX/<file>.md 引用的文件存在
  // 占位符已替换后正文会包含 "CHG-0001/prd.md" 这类引用
  const refMatches = content.match(/CHG-\d+\/[\w/.-]+\.md/g) || [];
  const seen = new Set();
  for (const ref of refMatches) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    // 提取文件名部分（CHG-0001/prd.md → prd.md；CHG-0001/evidence/test-report.md → evidence/test-report.md）
    const fileName = ref.split("/").slice(1).join("/");
    // Phase 3.5 修订：产物在 STORY 目录（绑定后）；未绑定/存量在 CHG 根——两处任一存在即通过
    const candidates = [join(changeDir, fileName)];
    if (storyDir) candidates.unshift(join(storyDir, fileName));
    let found = false;
    for (const refPath of candidates) {
      try {
        await readFile(refPath, "utf8");
        found = true;
        break;
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
    if (!found) {
      issues.push(`${artifactName}: cross-reference 引用文件不存在: ${ref}`);
    }
  }
}

// ---- Phase 4.2 三级规格分层新检查项（plans/phase-4.2-three-tier-spec-design.md §5/§8 Story 2）----

/**
 * 解析 markdown front-matter（yaml）。无 front-matter / 解析失败返回 null。
 */
function parseFrontMatter(content) {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return null;
  try {
    return parse(fm[1]);
  } catch {
    return null;
  }
}

/**
 * GitHub 风格标题 slug（确定性）：小写 / 去标点（保留字母数字连字符与中文等 Unicode 字母）/ 空格转连字符。
 * "## 3.2 Story 1 功能范围" → "32-story-1-功能范围"
 */
export function headingSlug(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim() // 标题级前缀（##）移除后的残留空白不产生前导连字符
    .replace(/\s+/g, "-");
}

/** 提取 markdown 全部标题的 slug 集合。 */
function collectHeadingSlugs(md) {
  const slugs = new Set();
  for (const line of md.split("\n")) {
    const m = line.match(/^#{1,6}\s+(.*)$/);
    if (m) slugs.add(headingSlug(m[1]));
  }
  return slugs;
}

/**
 * change-ref-bound（Story 级 cross-reference，blocking）：
 * entry: { id: 'change-ref-bound', field: 'change-prd-ref' | 'change-design-ref' }
 * front-matter.<field> 必须非空且锚点对应 change-prd.md / change-design.md 的真实章节标题。
 */
async function checkChangeRefBound(content, entry, changeDir, issues, artifactName) {
  const field = entry.field || "change-prd-ref";
  const targetFile = field === "change-design-ref" ? "change-design.md" : "change-prd.md";
  const fm = parseFrontMatter(content);
  const ref = typeof fm?.[field] === "string" ? fm[field].trim() : "";
  if (!ref) {
    issues.push(
      `${artifactName}: ${field} 为空（必须引用 ${targetFile} 具体章节，格式 ${targetFile}#<章节锚点>）`,
    );
    return;
  }
  const rawAnchor = ref.split("#").slice(1).join("#");
  if (!rawAnchor) {
    issues.push(
      `${artifactName}: ${field} 缺少章节锚点: ${ref}（格式 ${targetFile}#<章节锚点>）`,
    );
    return;
  }
  let anchor = rawAnchor;
  try {
    anchor = decodeURIComponent(rawAnchor);
  } catch {
    // URL 编码非法 → 保留原样比对
  }
  let md;
  try {
    md = await readFile(join(changeDir, targetFile), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      issues.push(`${artifactName}: ${field} 引用的 ${targetFile} 不存在`);
      return;
    }
    throw e;
  }
  if (!collectHeadingSlugs(md).has(headingSlug(anchor))) {
    issues.push(
      `${artifactName}: ${field} 锚点不存在: ${ref}（${targetFile} 无对应章节标题）`,
    );
  }
}

/**
 * scope-subset（确定性 Scope 子集校验，不做语义评分）：
 * entry: { id: 'scope-subset', target: 'change' | 'du' }
 *
 * target=change（story-spec）：change-prd.md 正文采用 [S<n>] 编号条目时，
 *   story-spec front-matter scope-refs 必须非空且每项 ∈ change-prd 编号集合；
 *   change-prd.md 不存在或无编号条目 → 仅 warning（编号约定未采用，不阻断）。
 * target=du（tasks.md，story mode）：每个 DU metadata.scope 条目中的 [S<n>] 引用
 *   必须 ⊆ 本 Story story-spec front-matter scope-refs；无引用条目 → warning。
 */
async function checkScopeSubset(
  content,
  changeDir,
  meta,
  opts,
  entry,
  issues,
  warnings,
  artifactName,
) {
  const target = entry.target || "change";

  if (target === "change") {
    let prdMd = null;
    try {
      prdMd = await readFile(join(changeDir, "change-prd.md"), "utf8");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (prdMd === null) return; // inline 双语义（prd.md 承担）→ 编号源不在 change-prd.md，跳过
    const prdRefs = new Set([...prdMd.matchAll(/\[(S\d+)\]/g)].map((m) => m[1]));
    if (prdRefs.size === 0) {
      warnings.push(
        `${artifactName}: change-prd.md 无 [S<n>] 编号范围条目，scope-subset 跳过（建议 §3 功能范围采用 [S1]/[S2] 编号条目）`,
      );
      return;
    }
    const fm = parseFrontMatter(content);
    const refs = Array.isArray(fm?.["scope-refs"]) ? fm["scope-refs"].map(String) : [];
    if (refs.length === 0) {
      issues.push(
        `${artifactName}: scope-refs 为空（change-prd.md 已采用编号条目，front-matter 须声明本 Story 覆盖的 [S<n>] 编号）`,
      );
      return;
    }
    for (const ref of refs) {
      if (!prdRefs.has(ref)) {
        issues.push(`${artifactName}: scope-refs 引用不存在的 Change 范围编号: [${ref}]`);
      }
    }
    return;
  }

  // target=du：DU scope [S<n>] 引用 ⊆ 本 Story story-spec scope-refs
  const storyId = opts?.storyId;
  const storyDir = storyId ? resolveStoryDirV3(changeDir, meta, storyId) : null;
  if (!storyDir) return; // Story 目录未定位 → 无规格源（路径问题由其他检查报错）
  let specMd = null;
  try {
    specMd = await readFile(join(storyDir, "story-spec.md"), "utf8");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (specMd === null) {
    issues.push(`${artifactName}: 本 Story story-spec.md 不存在，无法校验 DU Scope ⊆ Story Scope`);
    return;
  }
  const fm = parseFrontMatter(specMd);
  const storyRefs = new Set(
    Array.isArray(fm?.["scope-refs"]) ? fm["scope-refs"].map(String) : [],
  );
  if (storyRefs.size === 0) {
    warnings.push(`${artifactName}: story-spec.md scope-refs 为空，DU Scope 引用校验跳过`);
    return;
  }
  const dus = await readWorkspaceDusForStory(changeDir, meta, storyId);
  for (const du of dus) {
    const scope = Array.isArray(du.metadata?.scope) ? du.metadata.scope.map(String) : [];
    let referenced = false;
    for (const item of scope) {
      for (const m of item.matchAll(/\[(S\d+)\]/g)) {
        referenced = true;
        if (!storyRefs.has(m[1])) {
          issues.push(
            `${artifactName}: DU ${du.id} scope 引用 [${m[1]}] 不在本 Story scope-refs 内（DU Scope ⊆ Story Scope）`,
          );
        }
      }
    }
    if (!referenced) {
      warnings.push(
        `${artifactName}: DU ${du.id} scope 条目无 [S<n>] 引用（建议引用 Story 范围编号以便机检追溯）`,
      );
    }
  }
}

/**
 * repo-subset（确定性仓库子集校验）：story-design front-matter affected-repositories
 * ⊆ change-design.md front-matter affected-repositories。
 */
async function checkRepoSubset(content, changeDir, issues, artifactName) {
  const fm = parseFrontMatter(content);
  const affected = Array.isArray(fm?.["affected-repositories"])
    ? fm["affected-repositories"].map(String).filter(Boolean)
    : [];
  if (affected.length === 0) return; // 空声明由模板占位符检查约束，此处不重复
  let changeDesignMd;
  try {
    changeDesignMd = await readFile(join(changeDir, "change-design.md"), "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      issues.push(
        `${artifactName}: change-design.md 不存在，无法校验 affected-repositories ⊆ Change 级声明`,
      );
      return;
    }
    throw e;
  }
  const cfm = parseFrontMatter(changeDesignMd);
  const allowed = new Set(
    Array.isArray(cfm?.["affected-repositories"])
      ? cfm["affected-repositories"].map(String).filter(Boolean)
      : [],
  );
  for (const repo of affected) {
    if (!allowed.has(repo)) {
      issues.push(
        `${artifactName}: affected-repositories '${repo}' 不在 change-design.md 声明内（Story 仓库 ⊆ Change 仓库）`,
      );
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

async function checkEvidenceCoverage(
  changeDir,
  flags,
  issues,
  artifactName,
  meta,
  storyOpts,
) {
  // Phase 2.1（phase-2.1-evidence-system-design.md §4.2）：
  // 1. evidence.yaml 存在且可 parse
  // 2. validateEvidence 全量规则通过
  // 3. repos-coverage=true 时 implementation.md Commit ↔ code-change 条目对齐
  // 4. test-coverage=true 时至少 1 条通过的 test-run
  // Phase 2.2（plans/phase-2.2-sdd-review-skill-design.md §3.4）：
  // 5. findings-closure=true 时 blocker/major 的 review-finding 必须有非空 resolution
  // Phase 4.2：story mode（storyOpts.storyDir）下 evidence/implementation 定位到 Story 目录
  const storyDir = storyOpts?.storyDir || null;
  const doc = await loadEvidence(changeDir, { storyDir });
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
  const cov = await checkCoverage(
    changeDir,
    doc,
    {
      reposCoverage: flags["repos-coverage"] === true,
      testCoverage: flags["test-coverage"] === true,
      findingsClosure: flags["findings-closure"] === true,
    },
    meta,
    { implPath: storyDir ? join(storyDir, "implementation.md") : undefined },
  );
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
  opts = {},
) {
  // design gate：feature-path 四级完整且 candidate=false
  //（Candidate 须经 Human Gate 晋升并回填 candidate: false）
  // Phase 4.2：story 模式优先读该 Story 的 story-metadata.yaml feature-path
  //（3-tier 多 Story 拆分后 Change 级 feature-path 已清空，Story 级成为权威）
  const meta = metadata || (await readMetadataInline(changeDir));
  let fp = meta["feature-path"];
  if (opts.storyId) {
    const sDir = resolveStoryDirV3(changeDir, meta, opts.storyId);
    if (sDir) {
      try {
        const sm = parse(await readFile(join(sDir, "story-metadata.yaml"), "utf8"));
        if (sm?.["feature-path"]) fp = sm["feature-path"];
      } catch {
        // story-metadata 缺失/损坏 → 回落 Change 级判定（缺失问题由其他检查暴露）
      }
    }
  }
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
  storyId,
) {
  // task gate：design.affected-repositories ⊆ DU 覆盖仓集合；
  // 每个 DU repository ∈ repositories.yaml；DU 1:1 仓（repository 必填）；
  // DU ID 不重复（metadata.id 与目录一致）；scope/acceptance 非空；dependencies 引用有效
  // Phase 4.2：story mode（storyId）下 DU 集合限定为该 Story（stories/<id>/du/）
  const meta = metadata || (await readMetadataInline(changeDir));
  const dus = storyId
    ? await readWorkspaceDusForStory(changeDir, meta, storyId)
    : await readWorkspaceDus(changeDir, meta);
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

async function checkDuGuidance(
  changeDir,
  content,
  metadata,
  issues,
  artifactName,
  storyId,
) {
  // 全部为确定性检查（存在性/非空/枚举/一致性）；合理性判断属 Human Gate / Review
  // Phase 4.2：story mode（storyId）下 DU 集合限定为该 Story
  const meta = metadata || (await readMetadataInline(changeDir));
  const dus = storyId
    ? await readWorkspaceDusForStory(changeDir, meta, storyId)
    : await readWorkspaceDus(changeDir, meta);
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
    const sketch = normalizeDuValue(
      extractDuField(section, "Implementation Sketch"),
    );
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
    const verification = normalizeDuValue(
      extractDuField(section, "Verification"),
    );
    if (!verification || containsDuPlaceholder(verification)) {
      issues.push(
        `${artifactName}: DU ${du.id} Verification 为空或含占位符（必填）`,
      );
    }
  }
}

async function checkDuMaterialized(changeDir, issues, artifactName, meta, storyId) {
  // dev gate：Workspace 全部 DU 已 materialize（repo 侧目录存在）
  // Phase 4.2：story mode（storyId）下聚合范围限定为该 Story
  const agg = storyId
    ? await aggregateDuStatusForStory(changeDir, meta || (await readMetadataInline(changeDir)), storyId)
    : await aggregateDuStatus(changeDir);
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

async function checkDuFanInTesting(changeDir, issues, artifactName, meta, storyId) {
  // test gate：所有 DU status ≥ testing（story mode 下聚合范围限定为该 Story）
  const agg = storyId
    ? await aggregateDuStatusForStory(changeDir, meta || (await readMetadataInline(changeDir)), storyId)
    : await aggregateDuStatus(changeDir);
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

async function checkDuFanInComplete(changeDir, issues, artifactName, meta, storyId) {
  // review gate（同态检查点前置）：所有 DU completed（story mode 下聚合范围限定为该 Story）
  const agg = storyId
    ? await aggregateDuStatusForStory(changeDir, meta || (await readMetadataInline(changeDir)), storyId)
    : await aggregateDuStatus(changeDir);
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
