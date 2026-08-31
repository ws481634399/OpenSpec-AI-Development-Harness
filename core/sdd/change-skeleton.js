// ChangeSkeleton：CHG 工作目录同步器（Phase 3.5 修订 v0.3）
//
// 职责（幂等，重跑 = 同步）：
// 1. 树名同步：feature-tree.yaml 是唯一权威源——metadata.feature-path 的 name 落后于树时
//    更新 metadata（rename 联动）
// 2. 目录段：纯业务名（featureDirSeg 清洗），CHG/<L1名>/<L2名>/<L3名>/<STORY名>/
// 3. 锚点 rename：目录按 README.md front-matter 的 id 识别；名字变更 → rename 同步
// 4. 产物迁移：CHG 根的历史产物（除 metadata.yaml 外全部文件/目录）迁入 STORY 目录
//    ——修订后全部 Artifact 落第四级，CHG 根只留 metadata.yaml
//
// 边界：candidate / 链不完整 → 拒绝（层级未定不预建）；树节点缺失 → 拒绝（悬挂绑定）

import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  rename,
  stat,
} from "node:fs/promises";
import { join, basename } from "node:path";
import { stringify } from "yaml";
import { featurePathDirs, resolveStoryDir } from "./artifact-path.js";
import { findNodeById } from "./feature-model.js";
import { bindFeaturePath } from "./change-model.js";
import { findNodeDirByAnchor, syncNodeDirName } from "./feature-dirname.js";

const pathExists = (p) =>
  stat(p).then(
    () => true,
    (e) => (e.code === "ENOENT" ? false : Promise.reject(e)),
  );

/**
 * 同步 CHG 工作目录（骨架 + 树名 + 产物迁移）。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} meta readMetadata 结果
 * @param {object} tree feature-tree 统一视图
 * @param {string} workspaceRoot Workspace 根（写回 metadata 用）
 * @returns {Promise<{created:string[], renamed:string[], migrated:string[], nameSynced:boolean, skipped:boolean, reason?:string}>}
 */
export async function materializeChangeSkeleton(
  changeDir,
  meta,
  tree,
  workspaceRoot,
) {
  const fp = meta?.["feature-path"];
  if (!fp || !fp["level-1"]?.id || !fp.story?.id) {
    return {
      created: [],
      renamed: [],
      migrated: [],
      nameSynced: false,
      skipped: true,
      reason: "feature-path 未绑定",
    };
  }
  if (fp.candidate === true) {
    return {
      created: [],
      renamed: [],
      migrated: [],
      nameSynced: false,
      skipped: true,
      reason: "feature-path 为 Candidate（未晋升），暂不物化骨架",
    };
  }
  // 树中校验绑定链存在且完整（防悬挂绑定：树被删节点后 CHG 仍引用）
  const l3Node = fp['level-3']?.id ? findNodeById(tree, fp['level-3'].id) : null;
  const l3Story = l3Node?.stories?.some((s) => s.id === fp.story.id)
    ? l3Node.stories.find((s) => s.id === fp.story.id)
    : null;
  const l1Node = findNodeById(tree, fp["level-1"].id);
  const l2Node = findNodeById(tree, fp["level-2"].id);
  if (!l1Node || !l2Node || !l3Node || !l3Story) {
    return {
      created: [],
      renamed: [],
      migrated: [],
      nameSynced: false,
      skipped: true,
      reason:
        "绑定链在树中不完整（节点已删除或 story 不归属 level-3），请修正 feature-path",
    };
  }

  // 1. 树名同步到 metadata（树为权威）
  const latest = {
    "level-1": { id: l1Node.id, name: l1Node.name },
    "level-2": { id: l2Node.id, name: l2Node.name },
    "level-3": { id: l3Node.id, name: l3Node.name },
    story: { id: l3Story.id, name: l3Story.name },
  };
  const nameSynced =
    fp["level-1"].name !== latest["level-1"].name ||
    fp["level-2"].name !== latest["level-2"].name ||
    fp["level-3"].name !== latest["level-3"].name ||
    fp.story.name !== latest.story.name;
  if (nameSynced) {
    await bindFeaturePath(changeDir, latest);
    fp["level-1"] = latest["level-1"];
    fp["level-2"] = latest["level-2"];
    fp["level-3"] = latest["level-3"];
    fp.story = latest.story;
  }

  // 2. 逐级目录段：锚点 rename / 新建 + README 锚点（四级统一，缺失才写）
  //    README front-matter 的 id 是目录锚点：树改名后重跑可按锚点 rename 同步
  const segs = featurePathDirs(meta); // 名字段（已清洗）
  const created = [];
  const renamed = [];
  const nodes = [l1Node, l2Node, l3Node, l3Story];
  const levels = ["module", "feature", "capability", "story"];
  const ids = [
    fp["level-1"].id,
    fp["level-2"].id,
    fp["level-3"].id,
    fp.story.id,
  ];
  const boundChg = basename(changeDir);
  let parent = changeDir;
  for (let i = 0; i < segs.length; i++) {
    const synced = await syncNodeDirName(parent, ids[i], segs[i]);
    if (synced) {
      if (synced.renamed)
        renamed.push(join(...segs.slice(0, i), `${segs[i]}`));
    } else if (!(await pathExists(join(parent, segs[i])))) {
      await mkdir(join(parent, segs[i]), { recursive: true });
      created.push(join(...segs.slice(0, i + 1)));
    }
    parent = join(parent, segs[i]);

    // README 锚点（缺失才写；用户自建/已存在不覆盖）
    const readmePath = join(parent, "README.md");
    if (!(await pathExists(readmePath))) {
      const node = nodes[i];
      const isStory = i === levels.length - 1;
      const fm = {
        id: ids[i],
        name: node.name,
        level: levels[i],
        ...(isStory ? { "bound-chg": boundChg } : {}),
      };
      const body = [
        `# ${node.name || ids[i]}`,
        "",
        node.description || "",
        "",
        ...(isStory ? [`> 绑定 Change：\`${boundChg}\``, ""] : []),
      ].join("\n");
      await writeFile(
        readmePath,
        `---\n${stringify(fm).trimEnd()}\n---\n\n${body}`,
        "utf8",
      );
      created.push(join(...segs.slice(0, i + 1), "README.md"));
    }
  }
  const storyDir = parent;

  // 4. 产物迁移：CHG 根除 metadata.yaml 与四级骨架 L1 目录外全部迁入 STORY 目录
  const migrated = await migrateRootArtifacts(changeDir, storyDir, segs[0]);

  return { created, renamed, migrated, nameSynced, skipped: false };
}

/**
 * CHG 根 → STORY 目录产物迁移（除 metadata.yaml 与四级骨架 L1 目录外全部）。
 * @param {string} changeDir
 * @param {string} storyDir
 * @param {string} l1Seg 四级骨架的一级目录段名（骨架自身，不迁移）
 * @returns {Promise<string[]>} 迁移的相对名清单
 */
async function migrateRootArtifacts(changeDir, storyDir, l1Seg) {
  let entries;
  try {
    entries = await readdir(changeDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const moved = [];
  for (const e of entries) {
    if (e.name === "metadata.yaml" || e.name === l1Seg) continue;
    const src = join(changeDir, e.name);
    const dest = join(storyDir, e.name);
    if (await pathExists(dest)) continue; // 目标已存在不覆盖（人工解决）
    await rename(src, dest);
    moved.push(e.name);
  }
  return moved;
}

/**
 * 在 changes 与 archive 两个作用域定位 CHG 目录（CHG 平铺一层）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} id CHG ID（如 CHG-0002）
 * @returns {Promise<{dir:string, scope:'changes'|'archive'}|null>}
 */
export async function findChangeDirAny(workspaceRoot, id) {
  for (const scope of ["changes", "archive"]) {
    const dir = join(workspaceRoot, "delivery", scope, id);
    try {
      const meta = await readFile(join(dir, "metadata.yaml"), "utf8");
      if (meta !== undefined) return { dir, scope };
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
  }
  return null;
}
