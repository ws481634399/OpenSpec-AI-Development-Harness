// StoryModel：Story 元信息 + 目录读写纯函数（Phase 4.2 Three-Tier Spec Delivery）
// 与 change-model.js 风格一致：readFile + parse / parseDocument + setIn + flowToBlock + writeFile
// Story 状态枚举：pending/specified/designed/tasked/developing/testing/completed

import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { join, dirname, basename } from "node:path";
import { parse, parseDocument } from "yaml";
import { getHarnessRoot } from "../workspace/harness-root.js";

// Story 生命周期状态（纯枚举，无 state-machine 复杂迁移——Story 推进由 Change workflow 协调）
export const STORY_STATUSES = [
  "pending",
  "specified",
  "designed",
  "tasked",
  "developing",
  "testing",
  "completed",
];

export function isValidStoryStatus(s) {
  return STORY_STATUSES.includes(s);
}

/** Story 状态序（用于聚合/排序比较；与 STORY_STATUSES 一致） */
export const STORY_RANK = Object.fromEntries(STORY_STATUSES.map((s, i) => [s, i]));

/**
 * Phase 4.2 §5.3 聚合推进规则（纯函数，Workflow Engine / Transition Service 共用）：
 *   Change.tasked      ← 所有 Story ≥ tasked（全部 Story 拆完 DU）
 *   Change.developing  ← 任一 Story.developing（有 Story 在开发即整体在开发）
 *   Change.testing     ← 任一 Story.testing 且 所有 Story ≥ tasked（混合开发+测试期也算 testing）
 *   Change.completed   ← 所有 Story.completed（由 sdd-converge 人审驱动，聚合结果仅作前置判断）
 *
 * @param {string[]} statuses Story 状态数组
 * @returns {string|null} 聚合目标状态；不满足任何规则返回 null（保持现状）
 */
export function aggregateChangeStatus(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) return null;
  const rank = (s) => STORY_RANK[s] ?? -1;
  const all = (name) => statuses.every((s) => rank(s) >= rank(name));
  const any = (name) => statuses.some((s) => rank(s) >= rank(name));
  if (all("completed")) return "completed";
  if (any("testing") && all("tasked")) return "testing";
  if (any("developing")) return "developing";
  if (all("tasked")) return "tasked";
  return null;
}

/** yaml v2 缺陷 8 同款 flowToBlock（setIn 后递归转块式；空 seq 保单行 []） */
function flowToBlock(node) {
  if (!node || typeof node !== "object" || !Array.isArray(node.items)) return;
  const isEmptySeq = node.constructor?.name === "YAMLSeq" && node.items.length === 0;
  if (!isEmptySeq) node.flow = false;
  for (const item of node.items) {
    if (item && typeof item === "object") flowToBlock(item.value);
  }
}

/** Story metadata.yaml 模板路径（Harness 资产） */
function storyTemplatePath(harnessRoot) {
  return join(harnessRoot, "templates", "artifacts", "story-metadata.yaml");
}

/**
 * 读取 Story metadata。
 * @param {string} storyDir Story 目录（stories/<id>/ 或 CHG 根目录 inline 场景）
 * @returns {Promise<object>}
 */
export async function readStoryMetadata(storyDir) {
  const file = join(storyDir, "story-metadata.yaml");
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      // inline 模式无 story-metadata.yaml（Story metadata 直接读 CHG metadata.yaml），
      // 由 caller（readStories / resolveStoryDir）显式处理；此处抛标准错
      throw new Error(`Story metadata not found: ${file}`);
    }
    throw e;
  }
  try {
    return parse(raw);
  } catch (e) {
    throw new Error(`Story metadata corrupted: ${file} (${e.message})`);
  }
}

/**
 * 写入 patch 到 Story metadata（Document API 保留注释 + flowToBlock）。
 * @param {string} storyDir
 * @param {object} patch 键值对，支持点路径（如 { 'feature-path.level-1.id': 'FEAT-001' }）—— 未提供键跳过
 */
export async function patchStoryMetadata(storyDir, patch) {
  const file = join(storyDir, "story-metadata.yaml");
  const raw = await readFile(file, "utf8");
  const doc = parseDocument(raw);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const path = k.split("."); // 支持 feature-path.story.id 写法
    // 缺陷教训（yaml v2 setIn 语义）：
    //   1. 中间容器（如 feature-path）不存在时，必须显式创建为 flow=false 的块式容器
    //      才能让后续 setIn 子路径生效（普通 JS 对象字面量 setIn 子容器节点为 flow，且再次 setIn 子路径报
    //      "Expected YAML collection at <parent>"）。
    //   2. 对于深度 2 或以上的路径，逐级创建 YAMLMap block 容器。
    for (let depth = 1; depth < path.length; depth++) {
      const prefix = path.slice(0, depth);
      const existing = doc.getIn(prefix);
      if (!existing || !isNodeObject(existing)) {
        const blockNode = doc.createNode({});
        blockNode.flow = false;
        doc.setIn(prefix, blockNode);
      }
    }
    doc.setIn(path, v);
  }
  flowToBlock(doc.contents);
  await writeFile(file, doc.toString(), "utf8");
}

/** 判断 yaml Node 是映射或序列容器（getIn 可再寻址） */
function isNodeObject(n) {
  if (!n || typeof n !== 'object') return false;
  const name = n.constructor?.name;
  return name === "YAMLMap" || name === "YAMLSeq" || name === "Document";
}

/**
 * 创建 Story 目录 + story-metadata.yaml（三级形态 stories/<id>/）。
 * 不直接写入 Change metadata.stories 列表——由 caller 通过 updateChangeStories 统一更新。
 *
 * @param {string} changeDir CHG 根目录
 * @param {{
 *   storyId: string,
 *   title?: string,
 *   summary?: string,
 *   featurePath?: object,     // { level-1, level-2, level-3, story, candidate }
 *   evidenceTier?: 'light'|'standard'|'strict',
 *   changePrdRef?: string,    // cross-ref 到 change-prd.md 章节
 *   changeDesignRef?: string, // cross-ref 到 change-design.md 章节
 *   status?: string,          // 默认 pending
 * }} payload
 * @param {string} [harnessRoot]
 * @returns {Promise<{storyId:string, storyDir:string, metadata:object}>}
 */
export async function createStory(changeDir, payload, harnessRoot) {
  const root = harnessRoot || getHarnessRoot();
  const now = new Date().toISOString();
  const storyDir = join(changeDir, "stories", payload.storyId);
  await mkdir(storyDir, { recursive: true });

  // 拷模板 + patch
  const tmpl = await readFile(storyTemplatePath(root), "utf8");
  const outPath = join(storyDir, "story-metadata.yaml");
  await writeFile(outPath, tmpl, "utf8");

  const patch = {
    "change-id": payload.changeId || basename(changeDir),
    "story-id": payload.storyId,
    title: payload.title || payload.storyId,
    summary: payload.summary,
    status: payload.status || "pending",
    "evidence-tier": payload.evidenceTier || "standard",
    "created-at": now,
    "updated-at": now,
    "change-prd-ref": payload.changePrdRef || "",
    "change-design-ref": payload.changeDesignRef || "",
    dus: [],
    artifacts: {},
  };
  if (payload.featurePath) {
    for (const [k, v] of Object.entries(payload.featurePath)) {
      patch[`feature-path.${k}`] = v;
    }
  }
  await patchStoryMetadata(storyDir, patch);

  const metadata = await readStoryMetadata(storyDir);
  return { storyId: payload.storyId, storyDir, metadata };
}

/**
 * 读取 Change 下所有 Story（自动区分 inline/三级形态）。
 * 策略：
 *  1. 读 change metadata.stories 列表
 *  2. 每条 inline → 构造「合成 Story metadata」（从 Change feature-path/status 推导）
 *  3. 每条 inline=false → 读 stories/<id>/story-metadata.yaml
 *  4. stories 为空且 feature-path 非空（v3 未显式写 stories 但有绑定）→ 视为单 inline
 *
 * @param {string} changeDir CHG 根目录
 * @param {object} [changeMeta] 可选，已读取的 Change metadata（避免重复读）
 * @param {function} [readChangeMetaFn] 注入 readMetadata 测试
 * @returns {Promise<Array<{
 *   id:string, title:string, inline:boolean, path:string, status:string,
 *   evidenceTier:string, metadata:object, featurePath:object|null, dus:Array
 * }>>}
 */
export async function readStories(changeDir, changeMeta, readChangeMetaFn) {
  const readFn = readChangeMetaFn || (await import("./change-model.js")).readMetadata;
  const meta = changeMeta || (await readFn(changeDir));
  const stories = (meta && Array.isArray(meta.stories) && meta.stories.length > 0)
    ? meta.stories.slice()
    : [];

  // v3 兼容兜底：stories 为空但 feature-path 有值 → 构造单 inline 条目（lazy 填充）
  if (stories.length === 0 && meta && meta["feature-path"] && meta["feature-path"].story) {
    stories.push({
      id: meta["feature-path"].story.id,
      title: meta["feature-path"].story.name || meta.title || "",
      inline: true,
      path: "./",
      status: meta.status === "created" ? "pending" : changeStatusToStoryStatus(meta.status),
    });
  }

  const out = [];
  for (const entry of stories) {
    if (entry.inline) {
      // inline 模式：Story metadata 合成（基于 Change metadata）
      const synthetic = buildInlineStoryMeta(meta, entry);
      out.push({
        id: entry.id,
        title: entry.title || synthetic.title,
        inline: true,
        path: "./",
        status: synthetic.status,
        evidenceTier: synthetic["evidence-tier"] || meta["evidence-tier"] || "standard",
        metadata: synthetic,
        featurePath: synthetic["feature-path"] || null,
        dus: synthetic.dus || [],
      });
    } else {
      const storyDir = join(changeDir, entry.path || `stories/${entry.id}`);
      const m = await readStoryMetadata(storyDir).catch(() => null);
      out.push({
        id: entry.id,
        title: (m && m.title) || entry.title || "",
        inline: false,
        path: entry.path || `stories/${entry.id}/`,
        status: (m && m.status) || entry.status || "pending",
        evidenceTier: (m && m["evidence-tier"]) || entry["evidence-tier"] || meta["evidence-tier"] || "standard",
        metadata: m || {},
        featurePath: (m && m["feature-path"]) || null,
        dus: (m && m.dus) || [],
      });
    }
  }
  return out;
}

/** Change 状态 → Inline Story 状态映射（best-effort 同步冗余） */
export function changeStatusToStoryStatus(chgStatus) {
  // Change created/exploring → Story 未开始（pending）
  // Change specified(prd)/designed → Story 继承到 corresponding
  // Change story-splitting/tasked → Story tasked+ 按 Change 推进
  const MAP = {
    created: "pending",
    exploring: "pending",
    specified: "specified",
    designed: "designed",
    "story-splitting": "designed", // splitting 中 Story 至少为 designed
    tasked: "tasked",
    developing: "developing",
    testing: "testing",
    completed: "completed",
    archived: "completed",
  };
  return MAP[chgStatus] || "pending";
}

/** 构造 inline Story metadata（平铺双语义场景） */
function buildInlineStoryMeta(changeMeta, entry) {
  return {
    "schema-version": 1,
    "change-id": changeMeta.id,
    "story-id": entry.id,
    title: entry.title || changeMeta.title || entry.id,
    summary: changeMeta.summary,
    status: entry.status || changeStatusToStoryStatus(changeMeta.status),
    "evidence-tier": entry["evidence-tier"] || changeMeta["evidence-tier"] || "standard",
    "created-at": changeMeta["created-at"],
    "updated-at": changeMeta["updated-at"],
    "change-prd-ref": "",
    "change-design-ref": "",
    "feature-path": changeMeta["feature-path"] || null,
    dus: [],
    artifacts: changeMeta.artifacts || {}, // inline 模式复用 Change 级 artifacts
  };
}

/**
 * Update Change metadata.stories 列表（写入后 flowToBlock 保证块式）。
 * @param {string} changeDir
 * @param {Array<object>} stories 新的 stories 列表（全量覆盖）
 */
export async function writeChangeStories(changeDir, stories, { readMetadata, patchMetadata } = {}) {
  const changeModel = readMetadata ? null : await import("./change-model.js");
  const readMeta = readMetadata || changeModel.readMetadata;
  const patchMeta = patchMetadata || changeModel.patchMetadata;
  const meta = await readMeta(changeDir);

  const file = join(changeDir, "metadata.yaml");
  const raw = await readFile(file, "utf8");
  const doc = parseDocument(raw);
  doc.setIn(["stories"], stories);
  // schema-version 如 < 3 → 升 3
  const sv = (meta && meta["schema-version"]) || 1;
  if (sv < 3) doc.setIn(["schema-version"], 3);
  doc.setIn(["updated-at"], new Date().toISOString());
  flowToBlock(doc.contents);
  await writeFile(file, doc.toString(), "utf8");
}

/**
 * 把 inline 单 Story Change 转换为三级形态（拆分 stories/<id>/ 子目录）。
 * 操作：
 *  1. mkdir stories/<story-id>/
 *  2. 新建 story-metadata.yaml（从 inline 合成数据填充）
 *  3. 移动 tasks/implementation/test-report/review-report/evidence/du/ 到子目录
 *  4. 更新 Change metadata.stories（inline=true → inline=false，path=stories/<id>/，schema-version=3）
 *  5. feature-path 在 Change 级清空（多 Story 场景不再权威），保留在 Story 级
 *
 * @param {string} changeDir
 * @param {object} [opts]
 * @param {string} [opts.newStoryId] 拆分后的 Story ID；默认用 feature-path.story.id
 * @param {object} [opts.inject] 测试注入（readMetadata/patchMetadata/readFile/writeFile/rename/mkdir）
 * @returns {Promise<{storyId:string, storyDir:string, movedFiles:string[]}>}
 */
export async function splitInlineStory(changeDir, opts = {}) {
  const inject = opts.inject || {};
  const changeModel = await import("./change-model.js");
  const readMeta = inject.readMetadata || changeModel.readMetadata;
  const writeStories = inject.writeChangeStories || writeChangeStories;
  const mk = inject.mkdir || mkdir;
  const mv = inject.rename || rename;

  const meta = await readMeta(changeDir);
  const fp = meta && meta["feature-path"];
  if (!fp || !fp.story || !fp.story.id) {
    throw new Error(
      `Cannot split inline Change without feature-path.story. Bind feature-path first via 'openspec change bind-feature-path ${meta.id || basename(changeDir)}'`
    );
  }
  const stories = Array.isArray(meta.stories) ? meta.stories : [];
  // 必须是 inline 单 Story 场景
  if (stories.length > 1 || (stories.length === 1 && !stories[0].inline)) {
    throw new Error(
      `split-story only applies to single-story inline Change. Got stories=${stories.length} multi-story or already split.`
    );
  }
  const storyId = opts.newStoryId || fp.story.id;
  const storyTitle = fp.story.name || meta.title || storyId;

  // 1) mkdir + 创建 story-metadata.yaml（createStory 内部会 mkdir）
  const created = await createStory(
    changeDir,
    {
      storyId,
      title: storyTitle,
      summary: meta.summary,
      featurePath: fp,
      evidenceTier: meta["evidence-tier"] || "standard",
      status: changeStatusToStoryStatus(meta.status),
    },
    opts.harnessRoot
  );

  // 2) 移动 Story 级文件到子目录（CHG 根目录的 tasks.md 等）
  const filesToMove = [
    "tasks.md",
    "implementation.md",
    "test-report.md",
    "review-report.md",
  ];
  const dirsToMove = ["evidence", "du"];
  const movedFiles = [];
  for (const name of filesToMove) {
    const src = join(changeDir, name);
    const dst = join(created.storyDir, name);
    if (await exists(src, inject)) {
      await mv(src, dst);
      movedFiles.push(name);
    }
  }
  for (const name of dirsToMove) {
    const src = join(changeDir, name);
    const dst = join(created.storyDir, name);
    if (await exists(src, inject)) {
      await mv(src, dst);
      movedFiles.push(name + "/");
    }
  }

  // 3) 更新 Change metadata：schema=3、stories 列表（inline=false + path）、清空 feature-path
  const newStories = [
    {
      id: storyId,
      title: storyTitle,
      inline: false,
      "evidence-tier": meta["evidence-tier"] || "standard",
      status: changeStatusToStoryStatus(meta.status),
      path: `stories/${storyId}/`,
    },
  ];
  await writeStories(changeDir, newStories, inject);
  // 清空 Change 级 feature-path（Story 级成为权威）
  const patchMeta = inject.patchMetadata || changeModel.patchMetadata;
  await patchMeta(changeDir, {
    "schema-version": 3,
    "feature-path": undefined, // 清空（Document API setIn 不支持删，这里 workaround 写空对象然后处理）
  });
  // setIn(undefined) 在 yaml 中不写键——但若之前存在则需要移除；改用 Document API 删
  const metaFile = join(changeDir, "metadata.yaml");
  const raw2 = await (inject.readFile || readFile)(metaFile, "utf8");
  const doc = parseDocument(raw2);
  doc.deleteIn(["feature-path"]);
  flowToBlock(doc.contents);
  await (inject.writeFile || writeFile)(metaFile, doc.toString(), "utf8");

  return { storyId, storyDir: created.storyDir, movedFiles };
}

/** 小工具：检查路径是否存在（async） */
async function exists(path, inject = {}) {
  try {
    const st = (inject.stat)
      ? await inject.stat(path)
      : await (await import("node:fs/promises")).stat(path);
    return true;
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
}

/**
 * 获取或解析单个 Story 目录（caller 传 changeDir + storyId → 返回绝对 storyDir）。
 * 支持 inline 模式：
 *   - storyId === metadata.stories[0].id 且 inline=true → 返回 changeDir 本身
 *   - 否则返回 join(changeDir, stories/<storyId>/)
 * @returns {Promise<{storyDir:string,inline:boolean,metadata:object}>}
 */
export async function resolveStoryDir(changeDir, storyId, inject = {}) {
  const readMeta = inject.readMetadata || (await import("./change-model.js")).readMetadata;
  const meta = await readMeta(changeDir);
  const stories = await readStories(changeDir, meta, readMeta);
  const hit = stories.find((s) => s.id === storyId);
  if (!hit) throw new Error(`Story not found in Change ${meta.id || basename(changeDir)}: ${storyId}`);
  const storyDir = hit.inline ? changeDir : join(changeDir, hit.path);
  return { storyDir, inline: hit.inline, metadata: hit.metadata };
}
