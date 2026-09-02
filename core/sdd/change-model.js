// ChangeModel：Change 数据/目录/metadata 读写 + runChangeCreate（纯函数，依赖 node:fs/promises + yaml）
// 对齐 phase-1.3-sdd-lifecycle-artifact-design.md §8.3/§8.4/§8.5/§8.6
// runChangeCreate 作为纯函数在 Phase 1.3 实现，供 Phase 1.4 sdd-explore 调用

import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { parseDocument, parse } from "yaml";
import { getHarnessRoot } from "../workspace/harness-root.js";
import { nextChangeId, CHANGE_ID_REGEX, CHANGE_ID_HINT } from "./change-id-generator.js";
import { featurePathDirs } from "./artifact-path.js";
import { initEvidence } from "./evidence-model.js";

/**
 * 定位 templates/artifacts/metadata.yaml 模板（Harness 资产）。
 * @param {string} harnessRoot
 * @returns {string}
 */
function metadataTemplatePath(harnessRoot) {
  return join(harnessRoot, "templates", "artifacts", "metadata.yaml");
}

/**
 * 读取 CHG 目录的 metadata.yaml，返回对象。
 * @param {string} changeDir CHG 目录绝对路径
 * @returns {Promise<object>} metadata 对象
 * @throws {Error} 文件缺失或解析失败
 */
export async function readMetadata(changeDir) {
  const file = join(changeDir, "metadata.yaml");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT")
      throw new Error(`Change metadata not found: ${file}`);
    throw e;
  }
  try {
    return parse(raw);
  } catch (e) {
    throw new Error(
      `Change metadata corrupted: ${file} (parse error: ${e.message})`,
    );
  }
}

// 缺陷 8 修复：模板预置 artifacts/repository-baseline/repository-result 等空映射是 flow（流式）节点
//（yaml v2 中 node.flow === true），setIn 后整棵子树输出为流式风格，人工编辑极易破坏。
// setIn 之后把文档中所有 flow 集合节点递归置 flow=false，强制块式输出。
// 例外：空 sequence（issues: []）无块式形态，保持单行 [] 更整洁。
function flowToBlock(node) {
  if (!node || typeof node !== "object" || !Array.isArray(node.items)) return;
  const isEmptySeq = node.constructor?.name === "YAMLSeq" && node.items.length === 0;
  if (!isEmptySeq) node.flow = false;
  for (const item of node.items) {
    if (item && typeof item === "object") flowToBlock(item.value);
  }
}

/**
 * 用 parseDocument + setIn 改写 metadata.yaml 字段（保留模板注释）。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} patch 要更新的字段（如 { status, 'updated-at': ... }）
 */
export async function patchMetadata(changeDir, patch) {
  const file = join(changeDir, "metadata.yaml");
  const raw = await readFile(file, "utf8");
  const doc = parseDocument(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) doc.setIn([k], v);
  }
  flowToBlock(doc.contents); // 缺陷 8：setIn 后统一转块式（新节点会继承 flow 父的流式标记）
  await writeFile(file, doc.toString(), "utf8");
}

// Phase 4.1 轻量化：Evidence 分档合法档位（gate-validator 按 metadata.evidence-tier 跳过 skip-tier 命中项）
export const EVIDENCE_TIERS = ["light", "standard", "strict"];

/**
 * 设置 Change 的 evidence-tier（Phase 4.1 轻量化）。
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} tier 'light' | 'standard' | 'strict'
 * @returns {Promise<{tier:string}>} 写入后的档位
 * @throws {Error} tier 非法时抛错（含合法值提示）
 */
export async function setEvidenceTier(changeDir, tier) {
  if (!EVIDENCE_TIERS.includes(tier)) {
    throw new Error(`Invalid evidence-tier: ${tier}（合法值: ${EVIDENCE_TIERS.join("/")}）`);
  }
  await patchMetadata(changeDir, { "evidence-tier": tier });
  return { tier };
}

/**
 * 扫描 delivery/archive/ 下匹配 requirement 或 title 的历史 Change。
 * 用于 runChangeCreate 写 related-change（§8.6.3 archived 匹配）。
 *
 * @param {string} workspaceRoot
 * @param {{requirement?:string,title?:string}} query
 * @returns {Promise<string|null>} 命中的历史 CHG-XXXX，无匹配返回 null
 */
async function findArchivedMatch(workspaceRoot, { requirement, title }) {
  const archiveDir = join(workspaceRoot, "delivery", "archive");
  let entries;
  try {
    entries = await readdir(archiveDir, { withFileTypes: true });
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
  const norm = (s) =>
    String(s || "")
      .trim()
      .toLowerCase();
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const meta = await readMetadata(join(archiveDir, e.name)).catch(() => null);
    if (!meta) continue;
    if (requirement && meta.requirement === requirement)
      return meta.id || e.name;
    if (title && norm(meta.title) === norm(title)) return meta.id || e.name;
  }
  return null;
}

// Phase 3.7：输入前置校验（CLI/其他 caller 都会过）——避免下游正则/归档静默失败
function validateCreateInput(input) {
  const errs = [];
  // title 非空
  const title = String(input.title || "").trim();
  if (!title) errs.push("title 必填（不可全空白）");
  // id：显式提供时严格按 CHANGE_ID_REGEX 检查（含 4 位数字要求，避免 CHG-2 这种）
  if (input.id !== undefined && input.id !== null) {
    const raw = String(input.id).trim();
    if (!CHANGE_ID_REGEX.test(raw)) {
      errs.push(`id 不符合格式: '${raw}'，${CHANGE_ID_HINT.replace("至少 4 位", " >= 1 位（标准为 4 位零填充）")}`);
    } else if (CHANGE_ID_REGEX.exec(raw)[1].length < 4) {
      errs.push(`id 数字部分应 >= 4 位: '${raw}'（标准: CHG-0003，或省略 --id 自动分配）`);
    }
  }
  // requirement：可选，但若提供就需形如 REQ-XXX（宽松但可被识别）
  if (input.requirement) {
    const req = String(input.requirement).trim();
    if (req && !/^[A-Z][A-Z0-9_-]*-\S+/.test(req) && req.length < 4) {
      errs.push(`requirement 若提供需为可识别标识（例: REQ-42），当前: '${req}'`);
    }
  }
  // repositories：字符串数组
  if (input.repositories !== undefined && input.repositories !== null) {
    if (!Array.isArray(input.repositories) ||
        input.repositories.some((r) => typeof r !== "string" || !r.trim())) {
      errs.push("repositories 必须为非空字符串数组");
    }
  }
  if (errs.length) throw new Error("Change 创建参数错误: " + errs.join("; "));
  return { title: title, requirement: input.requirement ? String(input.requirement).trim() : undefined };
}

/**
 * 创建 CHG-XXX 载体（生命周期容器初始化）。
 *
 * 流程（§8.5，Phase 2.4 metadata schema v2 增补）：
 * 1. nextChangeId 扫描 changes + archive 取最大 +1（input.id 显式指定时跳过，并校验唯一性）
 * 2. mkdir delivery/changes/<id>/evidence/ + references/
 * 3. 读 templates/artifacts/metadata.yaml 模板（保留注释）
 * 4. setIn 填充 schema-version: 2/id/title/summary/status:created/requirement/created-at/updated-at/repositories
 * 5. 可选 featurePath：sdd-explore 匹配到 Story 时直接绑定（bindFeaturePath 同构）
 * 6. 查 archive 关联历史 → 写 related-change（§8.6）
 * 7. 不预创建 requirement/exploration/prd/design/tasks/implementation/convergence（由对应阶段产出）
 * 8. 初始化 evidence/evidence.yaml 结构化证据索引（Phase 2.1，幂等）
 *
 * @param {string} workspaceRoot Workspace 根目录绝对路径
 * @param {{title:string,summary?:string,requirement?:string,repositories?:string[],
 *          featurePath?:object,id?:string}} input
 * @param {string} [harnessRoot] 可选，测试注入
 * @returns {Promise<{id:string,changeDir:string}>}
 */
export async function runChangeCreate(workspaceRoot, input, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const { title: cleanTitle, requirement: cleanReq } = validateCreateInput(input);
  const pathExists = (p) => stat(p).then(() => true).catch((e) => (e.code === "ENOENT" ? false : Promise.reject(e)));

  let id;
  if (input.id !== undefined && input.id !== null && String(input.id).trim()) {
    id = String(input.id).trim();
    const autoId = await nextChangeId(workspaceRoot);
    const changesDir = join(workspaceRoot, "delivery", "changes", id);
    const archiveDir = join(workspaceRoot, "delivery", "archive", id);
    const [liveExists, archiveExists] = await Promise.all([pathExists(changesDir), pathExists(archiveDir)]);
    if (liveExists || archiveExists) {
      throw new Error(`Change ID 已存在: ${id}（建议省略 --id 自动分配，下一个可用: ${autoId}）`);
    }
  } else {
    id = await nextChangeId(workspaceRoot);
  }
  const changeDir = join(workspaceRoot, "delivery", "changes", id);

  await mkdir(changeDir, { recursive: true });
  // Phase 3.5 修订：创建时已绑定（非 candidate）→ evidence/references 直接落 STORY 目录
  let baseDir = changeDir;
  if (input.featurePath && input.featurePath.candidate !== true) {
    const dirs = featurePathDirs({ "feature-path": input.featurePath });
    if (dirs) {
      baseDir = join(changeDir, ...dirs);
      await mkdir(baseDir, { recursive: true });
    }
  }
  await mkdir(join(baseDir, "evidence"), { recursive: true });
  await mkdir(join(baseDir, "references"), { recursive: true });

  // 读模板（保留注释）→ setIn 填充
  const templateRaw = await readFile(metadataTemplatePath(root), "utf8");
  const doc = parseDocument(templateRaw);
  const now = new Date().toISOString();
  doc.setIn(["schema-version"], 2);
  doc.setIn(["id"], id);
  doc.setIn(["title"], cleanTitle);
  if (input.summary !== undefined) doc.setIn(["summary"], String(input.summary).trim());
  doc.setIn(["status"], "created");
  doc.setIn(["requirement"], cleanReq || "");
  doc.setIn(["created-at"], now);
  doc.setIn(["updated-at"], now);
  if (Array.isArray(input.repositories) && input.repositories.length > 0) {
    doc.setIn(
      ["repositories"],
      input.repositories.map((r) => r),
    );
  }
  // Phase 2.4：创建时已确定 Story → 直接绑定完整四级路径
  if (input.featurePath) {
    doc.setIn(["feature-path"], input.featurePath);
    doc.setIn(["features"], flattenFeatureIds(input.featurePath));
  }

  // §8.6.5 查 archive 关联历史（用户提供 requirement 或 title 时）
  if (cleanReq || cleanTitle) {
    const archived = await findArchivedMatch(workspaceRoot, {
      requirement: cleanReq,
      title: cleanTitle,
    });
    if (archived) doc.setIn(["related-change"], archived);
  }

  await writeFile(join(changeDir, "metadata.yaml"), doc.toString(), "utf8");

  // Phase 2.1：初始化结构化 Evidence 索引 evidence/evidence.yaml（幂等，模板注释保留）
  await initEvidence(changeDir, id, root);

  return { id, changeDir };
}

/**
 * 将 feature-path 四级链扁平化为 features 冗余索引（id 数组）。
 * @param {object} fp { 'level-1':{id}, 'level-2':{id}, 'level-3':{id}, story:{id} }
 * @returns {string[]}
 */
function flattenFeatureIds(fp) {
  return [
    fp?.["level-1"]?.id,
    fp?.["level-2"]?.id,
    fp?.["level-3"]?.id,
    fp?.story?.id,
  ].filter(Boolean);
}

/**
 * 绑定/回填 Change 的 feature-path（Phase 2.4 §7.2/§17.4）。
 *
 * - sdd-explore 完成 Requirement→Story 匹配后调用
 * - Candidate 晋升后回填（candidate: false）
 * - 同步刷新 features 扁平冗余索引
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {{'level-1':{id,name}, 'level-2':{id,name}, 'level-3':{id,name},
 *          story:{id,name}, candidate?:boolean}} featurePath
 */
export async function bindFeaturePath(changeDir, featurePath) {
  const fp = { ...featurePath };
  if (fp.candidate === undefined) fp.candidate = false;

  // v3 Phase 4.2：若 Change.stories 为空 → 自动填单条 inline=true（默认单 Story 平铺兼容）
  const current = await readMetadata(changeDir).catch(() => ({}));
  const currentStories = Array.isArray(current.stories) ? current.stories : [];
  const sv = current["schema-version"] || 1;

  const patch = {
    "feature-path": fp,
    features: flattenFeatureIds(fp),
    "schema-version": sv < 3 ? 3 : current["schema-version"], // 自动升 v3
    "updated-at": new Date().toISOString(),
  };
  if (currentStories.length === 0) {
    // 用 inline 映射避免 dynamic import 循环依赖（与 story-model.changeStatusToStoryStatus 保持一致）
    const CSTATUS = {
      created: "pending", exploring: "pending", specified: "specified",
      designed: "designed", "story-splitting": "designed", tasked: "tasked",
      developing: "developing", testing: "testing", completed: "completed",
      archived: "completed",
    };
    patch.stories = [
      {
        id: fp.story && fp.story.id ? fp.story.id : "",
        title: fp.story && fp.story.name ? fp.story.name : "",
        inline: true,
        status: CSTATUS[current.status] || "pending",
        path: "./",
      },
    ];
    if (current["evidence-tier"]) patch.stories[0]["evidence-tier"] = current["evidence-tier"];
  }
  await patchMetadata(changeDir, patch);
}

/**
 * 推进 Change 状态（patch status + updated-at）。
 * 由 openspec change status --set 调用，或 sdd-explore 完成后调用。
 *
 * 注意：本函数只写 metadata，不校验迁移合法性——调用方须先走
 * ChangeStateMachine.validateTransition(from, to)。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {string} newStatus 目标状态
 */
export async function patchStatus(changeDir, newStatus) {
  await patchMetadata(changeDir, {
    status: newStatus,
    "updated-at": new Date().toISOString(),
  });
}
