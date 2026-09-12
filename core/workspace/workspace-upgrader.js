// WorkspaceUpgrader：旧 Workspace → 当前 Harness 版本的确定性升级（Phase 3.1 plans/phase-3.1-version-upgrade-design.md §6.4）
//
// 职责：planUpgrade（差异计算）+ applyUpgrade（执行）
// 边界（受管分级 §5）：
// - skills/ prompts/ 全量覆盖（Harness 拥有，与 skill sync 同策略）
// - .sdd/ 仅补缺失文件 + schema 迁移（不覆盖用户已改内容）
// - standards/ product/ delivery/ implementation/ 绝不触碰
// 回滚依赖 Git：报告 touchedFiles 清单，git checkout -- <files> 即可回滚

import { readFile, writeFile, readdir, mkdir, copyFile, stat, rm, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { parse, parseDocument, stringify } from 'yaml';
import { readHarnessVersion, readWorkspaceVersions, readTemplateVersions } from './version.js';
import { runMigrations } from './schema-migrations.js';
import { syncSkills, syncPrompts } from '../sdd/skill-registry.js';
import { featurePathDirs, featurePathDirsFromFp } from '../sdd/artifact-path.js';

const MANAGED_DIRS = ['.sdd', 'skills', 'prompts']; // upgrade 允许写入的顶层目录

const pathExists = (p) =>
  stat(p).then(() => true).catch((e) => (e.code === 'ENOENT' ? false : Promise.reject(e)));

/**
 * 递归收集目录下全部文件相对路径。
 * @param {string} dir 根目录
 * @param {string} [prefix] 内部递归前缀
 * @returns {Promise<string[]>}
 */
async function collectFiles(dir, prefix = '') {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await collectFiles(join(dir, e.name), rel)));
    else out.push(rel);
  }
  return out;
}

/**
 * 扫描模板受管目录（.sdd/）中 Workspace 缺失的文件。
 * skills/prompts 由 sync 全量覆盖，不在此列。
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<string[]>} 待补齐文件的 Workspace 相对路径
 */
async function findMissingManagedFiles(harnessRoot, workspaceRoot) {
  const templateSdd = join(harnessRoot, 'templates', 'default-workspace', '.sdd');
  const templateFiles = await collectFiles(templateSdd);
  const missing = [];
  for (const rel of templateFiles) {
    if (!(await pathExists(join(workspaceRoot, '.sdd', rel)))) {
      missing.push(join('.sdd', rel));
    }
  }
  return missing;
}

// ---- Phase 4.2/4.3：Change schema 迁移 v2→v4（delivery/changes + archive 递归扫 CHG 目录）
// 设计：schema-migrations.js 受「不触碰 delivery/」限制，此处作为 WorkspaceUpgrade 的扩展步骤
// v2→v3（幂等）：metadata.yaml schema-version<3 且 feature-path.story.id 非空 →
//   创建 stories:[{id,title,inline:true,status,path:"./"}]；不移动文件（inline 保持）
// v3→v4（幂等，Phase 4.3 S1）：prd.md→spec.md / change-prd.md→change-spec.md 产物改名；
//   metadata.yaml + story-metadata.yaml 的 artifacts 段键名（prd→spec / change-prd→change-spec）与
//   path 值重写；inline stories[].domain 自动继承 feature-path.level-3；schema-version 升 4

function flowToBlock(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.items)) return;
  const isEmptySeq = node.constructor?.name === 'YAMLSeq' && node.items.length === 0;
  if (!isEmptySeq) node.flow = false;
  for (const item of node.items) if (item && typeof item === 'object') flowToBlock(item.value);
}

const CSTATUS_MAP = {
  created: 'pending', exploring: 'pending', specified: 'specified',
  designed: 'designed', 'story-splitting': 'designed', tasked: 'tasked',
  developing: 'developing', testing: 'testing', completed: 'completed',
  archived: 'completed',
};

/** v4 产物改名映射（文件名 → 新名） */
const V4_ARTIFACT_RENAMES = {
  'prd.md': 'spec.md',
  'change-prd.md': 'change-spec.md',
};

/** artifacts 段键名重写映射（旧键 → { newKey, path }） */
const V4_ARTIFACT_KEYS = [
  { oldKey: 'change-prd', newKey: 'change-spec', newPath: 'change-spec.md' },
  { oldKey: 'prd', newKey: 'spec', newPath: 'spec.md' },
];

/** 递归收集目录下全部文件绝对路径（深度最多 8 级） */
async function collectTreeFiles(root) {
  const results = [];
  async function walk(dir, depth) {
    if (depth > 8) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { await walk(full, depth + 1); continue; }
      if (e.isFile()) results.push(full);
    }
  }
  await walk(root, 0);
  return results;
}

/** 递归扫目录下所有 metadata.yaml（深度最多 8 级，Module/Feature/Story/CHG4 层 + 子目录） */
async function collectChangeMetadatas(root) {
  const files = await collectTreeFiles(root);
  return files.filter((f) => f.endsWith('metadata.yaml'));
}

/**
 * Guard：检测是否需要 Change schema 迁移（有任何 metadata.yaml 未达 v4）。
 * @param {string} workspaceRoot
 * @returns {Promise<boolean>}
 */
export async function needsChangeSchemaMigration(workspaceRoot) {
  const dirs = [
    join(workspaceRoot, 'delivery', 'changes'),
    join(workspaceRoot, 'delivery', 'archive'),
  ];
  for (const d of dirs) {
    const files = await collectChangeMetadatas(d);
    for (const f of files) {
      try {
        const raw = await readFile(f, 'utf8');
        const meta = parse(raw) || {};
        if ((meta['schema-version'] || 1) < 4) return true;
      } catch { /* ignore corrupted */ }
    }
  }
  return false;
}

/**
 * 执行 Change schema v2→v4 迁移（幂等）。
 * 逐 CHG 目录处理（changes + archive 两个 scope）：
 * 1. 树内遗留 prd.md / change-prd.md 产物改名（rename）
 * 2. metadata.yaml + story-metadata.yaml 的 artifacts 段键名与 path 重写
 * 3. metadata.yaml：v2→v3 stories 推导 + v4 inline stories[].domain 继承 + schema-version=4
 * @param {string} workspaceRoot
 * @returns {Promise<{files:string[], migrated:number, skipped:number, renamed:{from:string,to:string}[]}>}
 */
export async function migrateChangeSchema(workspaceRoot) {
  const changed = [];
  const renamed = [];
  let migrated = 0, skipped = 0;
  const toRel = (abs) =>
    abs.startsWith(workspaceRoot) ? abs.slice(workspaceRoot.length + 1).replace(/\\/g, '/') : abs;

  const bases = [
    join(workspaceRoot, 'delivery', 'changes'),
    join(workspaceRoot, 'delivery', 'archive'),
  ];
  for (const base of bases) {
    let entries;
    try { entries = await readdir(base, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const changeDir = join(base, e.name);
      const files = await collectTreeFiles(changeDir);

      // 1. 产物改名（幂等：旧名不存在即跳过）
      for (const f of files) {
        const name = f.split('\\').pop().split('/').pop();
        if (!V4_ARTIFACT_RENAMES[name]) continue;
        const to = join(dirname(f), V4_ARTIFACT_RENAMES[name]);
        try {
          await rename(f, to);
          renamed.push({ from: toRel(f), to: toRel(to) });
        } catch (e) {
          if (e && (e.code === 'ENOENT')) { skipped++; continue; } // 旧文件已不在（竞态），跳过
          throw e; // 其余失败（如目标已存在）直接上抛，避免静默产出错误迁移结果
        }
      }

      // 2+3. yaml 重写（metadata.yaml 走 schema 升级；story-metadata.yaml 仅重写 artifacts 键）
      for (const f of files) {
        const name = f.split('\\').pop().split('/').pop();
        const isChangeMeta = name === 'metadata.yaml';
        const isStoryMeta = name === 'story-metadata.yaml';
        if (!isChangeMeta && !isStoryMeta) continue;
        let raw;
        try { raw = await readFile(f, 'utf8'); } catch { skipped++; continue; }
        let meta;
        try { meta = parse(raw) || {}; } catch { skipped++; continue; }
        const sv = meta['schema-version'] || 1;
        if (isChangeMeta && sv >= 4) {
          // 已 v4：artifacts 键重写已在既往升级完成（键重写与 v4 绑定），无需再动
          continue;
        }

        const doc = parseDocument(raw);
        let dirty = false;
        // v2→v3：stories 推导（仅 Change metadata）
        if (isChangeMeta && sv < 3) {
          const fp = meta['feature-path'];
          const currStories = Array.isArray(meta.stories) ? meta.stories : [];
          if (currStories.length === 0 && fp && fp.story && fp.story.id) {
            const status = CSTATUS_MAP[meta.status] || 'pending';
            const entry = {
              id: fp.story.id,
              title: fp.story.name || meta.title || '',
              inline: true,
              status,
              path: './',
            };
            if (meta['evidence-tier']) entry['evidence-tier'] = meta['evidence-tier'];
            // v4：推导的 inline story 直接继承 L3 domain（doc.setIn 的新列表不在旧 meta.stories 里）
            if (fp['level-3']) {
              entry.domain = {
                id: (fp['level-3'] && fp['level-3'].id) || '',
                name: (fp['level-3'] && fp['level-3'].name) || '',
              };
            }
            doc.setIn(['stories'], [entry]);
            dirty = true;
          } else if (currStories.length === 0) {
            doc.setIn(['stories'], []);
            dirty = true;
          }
        }

        // v4：artifacts 段键名与 path 重写（story-metadata.yaml 同样处理；无旧键则不写文件）
        for (const { oldKey, newKey, newPath } of V4_ARTIFACT_KEYS) {
          const node = doc.getIn(['artifacts', oldKey]);
          if (!node) continue;
          doc.setIn(['artifacts', newKey], node);
          doc.deleteIn(['artifacts', oldKey]);
          doc.setIn(['artifacts', newKey, 'path'], newPath);
          dirty = true;
        }

        // v4：inline stories[].domain 继承 L3（仅 Change metadata）
        if (isChangeMeta) {
          if (sv !== 4) {
            doc.setIn(['schema-version'], 4);
            dirty = true;
          }
          const storiesArr = Array.isArray(meta.stories) ? meta.stories : [];
          const fp = meta['feature-path'];
          storiesArr.forEach((s, idx) => {
            if (s && s.inline === true && !s.domain && fp && fp['level-3']) {
              doc.setIn(['stories', idx, 'domain'], {
                id: (fp['level-3'] && fp['level-3'].id) || '',
                name: (fp['level-3'] && fp['level-3'].name) || '',
              });
              dirty = true;
            }
          });
        }

        if (!dirty) continue; // 幂等：无可变更内容不写文件

        flowToBlock(doc.contents);
        await writeFile(f, doc.toString(), 'utf8');
        changed.push(f);
        migrated++;
      }

      // 4. 多 Story 目录路径迁移：stories/<STORY-ID>/ → 中文名四级路径
      //    （幂等：仅处理 path 以 'stories/' 开头的非 inline 条目）
      let chgMeta;
      try { chgMeta = parse(await readFile(join(changeDir, 'metadata.yaml'), 'utf8')) || {}; } catch { continue; }
      const stArr = Array.isArray(chgMeta.stories) ? chgMeta.stories : [];
      let storiesDirty = false;
      const stDoc = parseDocument(await readFile(join(changeDir, 'metadata.yaml'), 'utf8'));
      for (let si = 0; si < stArr.length; si++) {
        const s = stArr[si];
        if (!s || s.inline !== false) continue;
        const oldRel = String(s.path || '').replace(/\/+$/, '');
        if (!oldRel.startsWith('stories/')) continue; // 已是中文名路径，跳过
        // 读旧 story-metadata.feature-path 算新路径
        let sm;
        try { sm = parse(await readFile(join(changeDir, ...oldRel.split('/'), 'story-metadata.yaml'), 'utf8')); }
        catch { continue; }
        const fp = sm?.['feature-path'];
        const segs = featurePathDirsFromFp(fp);
        if (!segs) continue;
        const newRel = segs.join('/');
        const oldDir = join(changeDir, ...oldRel.split('/'));
        const newDir = join(changeDir, ...segs);
        if (oldDir !== newDir && (await pathExists(oldDir)) && !(await pathExists(newDir))) {
          await mkdir(dirname(newDir), { recursive: true });
          await rename(oldDir, newDir);
          renamed.push({ from: toRel(oldDir), to: toRel(newDir) });
        }
        stDoc.setIn(['stories', si, 'path'], newRel + '/');
        storiesDirty = true;
      }
      if (storiesDirty) {
        flowToBlock(stDoc.contents);
        await writeFile(join(changeDir, 'metadata.yaml'), stDoc.toString(), 'utf8');
        changed.push(join(changeDir, 'metadata.yaml'));
        migrated++;
      }
    }
  }
  return { files: changed, migrated, skipped, renamed };
}

// ---- v0.4：CHG 骨架遗留锚点 README 清理（去锚点后四级骨架内不应再有 README.md） ----
// doctor 侧将遗留 README 报为 issue（doctor-checks.js runStructureChecks）；upgrade 侧执行确定性删除，
// 与 changeSchema 迁移同为 delivery/ 的扩展升级步骤。删除文件不入 gitRevertFiles（废弃文件不做回滚
// 恢复；回滚到 0.3.x 后重跑 'openspec change skeleton' 会重建锚点 README）。

/**
 * 收集 delivery/changes + archive 下绑定 feature-path 的 CHG 四级骨架内的 README.md（绝对路径）。
 * 规则与 doctor 骨架检查一致：仅扫描绑定 CHG 的四级目录链（含中间级），candidate/未绑定跳过。
 * @param {string} workspaceRoot
 * @returns {Promise<string[]>}
 */
export async function findLegacyAnchorReadmes(workspaceRoot) {
  const bases = [
    join(workspaceRoot, 'delivery', 'changes'),
    join(workspaceRoot, 'delivery', 'archive'),
  ];
  const found = [];
  for (const base of bases) {
    let entries;
    try {
      entries = await readdir(base, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!e.isDirectory() || !/^CHG-\d+/.test(e.name)) continue;
      const changeDir = join(base, e.name);
      let meta;
      try {
        meta = parse(await readFile(join(changeDir, 'metadata.yaml'), 'utf8')) || {};
      } catch {
        continue; // metadata 损坏由 doctor 侧报告，此处跳过
      }
      const fp = meta['feature-path'];
      if (!fp || fp.candidate === true || !fp['level-1']?.id || !fp.story?.id) continue;
      const segs = featurePathDirs(meta);
      if (!segs || segs.length === 0) continue;
      let parent = changeDir;
      for (const seg of segs) {
        parent = join(parent, seg);
        const readme = join(parent, 'README.md');
        if (await pathExists(readme)) found.push(readme);
      }
    }
  }
  return found;
}

/**
 * 更新版本记录文件。
 * - version.yaml：harness + workspace-template 双版本（权威版本记录；schema.version 不动）
 * - workspace.yaml：workspace.harness.version 快照（init 时写入；doctor 校验与 version.yaml 一致，
 *   缺失/损坏则容错跳过——该文件仅含 name/type/版本快照，不影响升级主流程）
 * @param {string} workspaceRoot Workspace 根目录
 * @param {{harnessVersion:string, templateVersion:string}} [v]
 * @returns {Promise<{workspaceYamlTouched: boolean}>}
 */
async function patchWorkspaceVersionYaml(workspaceRoot, { harnessVersion, templateVersion }) {
  const p = join(workspaceRoot, '.sdd', 'version.yaml');
  const doc = parseDocument(await readFile(p, 'utf8'));
  doc.setIn(['harness', 'version'], harnessVersion);
  doc.setIn(['workspace-template', 'version'], templateVersion);
  await writeFile(p, doc.toString(), 'utf8');

  // 同步 workspace.yaml 的 harness 版本快照（Phase 4.2+ 缺口修复：
  // 不同步会导致 doctor 报「workspace.yaml 记录版本与 version.yaml 不一致」）
  let workspaceYamlTouched = false;
  const wsP = join(workspaceRoot, '.sdd', 'workspace.yaml');
  try {
    const wsDoc = parseDocument(await readFile(wsP, 'utf8'));
    wsDoc.setIn(['workspace', 'harness', 'version'], harnessVersion);
    await writeFile(wsP, wsDoc.toString(), 'utf8');
    workspaceYamlTouched = true;
  } catch {
    // workspace.yaml 缺失/损坏 → 容错跳过（version.yaml 才是权威记录）
  }
  return { workspaceYamlTouched };
}

/**
 * 计算升级计划（零写入）。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录
 * @returns {Promise<object>} 升级计划/报告（upToDate=true 表示无需升级）
 * @throws {Error} version.yaml 缺失（Workspace 过旧，无法自动升级）
 */
export async function planUpgrade(workspaceRoot, harnessRoot) {
  const ws = readWorkspaceVersions(workspaceRoot);
  if (!ws) {
    throw new Error('.sdd/version.yaml 缺失，无法自动升级（Workspace 过旧）。请重新 init 或手动补齐版本文件。');
  }
  const harnessVersion = readHarnessVersion(harnessRoot);
  const templateVersion = readTemplateVersions(harnessRoot).workspaceTemplate || harnessVersion;

  const [skillsDiff, promptsDiff, missingFiles, migrations, changeSchemaNeeded, legacyReadmes] = await Promise.all([
    syncSkills(harnessRoot, workspaceRoot, { dryRun: true }),
    syncPrompts(harnessRoot, workspaceRoot, { dryRun: true }),
    findMissingManagedFiles(harnessRoot, workspaceRoot),
    runMigrations(workspaceRoot, { dryRun: true }),
    needsChangeSchemaMigration(workspaceRoot),
    findLegacyAnchorReadmes(workspaceRoot),
  ]);

  const versionTransitions = {
    harness: ws.harness !== harnessVersion ? { from: ws.harness, to: harnessVersion } : null,
    workspaceTemplate: ws.workspaceTemplate !== templateVersion ? { from: ws.workspaceTemplate, to: templateVersion } : null,
  };

  const upToDate =
    !versionTransitions.harness &&
    !versionTransitions.workspaceTemplate &&
    skillsDiff.changed.length === 0 &&
    promptsDiff.changed.length === 0 &&
    missingFiles.length === 0 &&
    migrations.executed.length === 0 &&
    !changeSchemaNeeded &&
    legacyReadmes.length === 0;

  return {
    upToDate,
    dryRun: true,
    current: ws,
    target: { harnessVersion, templateVersion },
    versionTransitions,
    skills: { changed: skillsDiff.changed, details: skillsDiff.details, added: skillsDiff.added, updated: skillsDiff.updated },
    prompts: { changed: promptsDiff.changed, details: promptsDiff.details, added: promptsDiff.added, updated: promptsDiff.updated },
    addedFiles: missingFiles,
    migrations: { executed: migrations.executed, skipped: migrations.skipped },
    changeSchema: changeSchemaNeeded
      ? { needsMigration: true, step: 'delivery/changes + archive v2→v4（prd→spec 产物改名 + artifacts 键重写 + inline story 推导 + domain 继承）' }
      : { needsMigration: false },
    anchorReadme: legacyReadmes.length
      ? {
          needsCleanup: true,
          count: legacyReadmes.length,
          files: legacyReadmes.map((abs) =>
            abs.startsWith(workspaceRoot) ? abs.slice(workspaceRoot.length + 1).replace(/\\/g, '/') : abs
          ),
        }
      : { needsCleanup: false, count: 0, files: [] },
    touchedFiles: [],
  };
}

/**
 * 执行升级。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录
 * @returns {Promise<object>} 升级报告（与 planUpgrade 同构，dryRun=false，touchedFiles 列出全部写入路径）
 */
export async function applyUpgrade(workspaceRoot, harnessRoot) {
  const plan = await planUpgrade(workspaceRoot, harnessRoot);
  if (plan.upToDate) return { ...plan, dryRun: false };

  const touched = [];
  const gitRevertFiles = []; // 回滚时 git checkout 恢复（已存在文件的更新）
  const gitNewFiles = []; // 回滚时删除（升级新增的 untracked 文件）

  // a. skills/prompts 同步（全量覆盖策略）
  await syncSkills(harnessRoot, workspaceRoot);
  const skillAdded = plan.skills.added || [];
  const skillUpdated = plan.skills.updated || [];
  for (const id of skillAdded) gitNewFiles.push(join('skills', id));
  for (const id of skillUpdated) gitRevertFiles.push(join('skills', id));
  touched.push(...plan.skills.changed.map((id) => join('skills', id)));

  await syncPrompts(harnessRoot, workspaceRoot);
  for (const rel of plan.prompts.added || []) gitNewFiles.push(join('prompts', rel));
  for (const rel of plan.prompts.updated || []) gitRevertFiles.push(join('prompts', rel));
  touched.push(...plan.prompts.changed.map((rel) => join('prompts', rel)));

  // b. 补齐 .sdd 缺失文件（全新文件 → 回滚时删除）
  for (const rel of plan.addedFiles) {
    const src = join(harnessRoot, 'templates', 'default-workspace', rel);
    const dest = join(workspaceRoot, rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    gitNewFiles.push(rel);
    touched.push(rel);
  }

  // c. schema 迁移（内容变更 → git checkout 恢复）
  const migrations = await runMigrations(workspaceRoot);
  for (const m of migrations.executed) {
    for (const f of m.files || []) gitRevertFiles.push(f);
    touched.push(...(m.files || []));
  }

  // c2. Phase 4.2/4.3：Change schema v2→v4 迁移（产物改名 + artifacts 键重写 + stories/domain 补齐）
  let changeSchemaReport = { files: [], migrated: 0, skipped: 0, renamed: [] };
  if (plan.changeSchema && plan.changeSchema.needsMigration) {
    changeSchemaReport = await migrateChangeSchema(workspaceRoot);
    for (const f of changeSchemaReport.files) {
      const rel = f.startsWith(workspaceRoot) ? f.slice(workspaceRoot.length + 1).replace(/\\/g, '/') : f;
      gitRevertFiles.push(rel);
      touched.push(rel);
    }
    // 产物改名：旧路径 git checkout 恢复，新路径按升级新增文件删除
    for (const r of changeSchemaReport.renamed || []) {
      gitRevertFiles.push(r.from);
      gitNewFiles.push(r.to);
      touched.push(r.from, r.to);
    }
  }

  // c3. v0.4：清理四级骨架遗留锚点 README（删除项仅记入 touchedFiles 供审计，不做回滚恢复）
  const anchorReadmeReport = { removed: [], count: 0 };
  if (plan.anchorReadme?.needsCleanup) {
    for (const rel of plan.anchorReadme.files) {
      await rm(join(workspaceRoot, rel));
      anchorReadmeReport.removed.push(rel);
      touched.push(rel);
    }
    anchorReadmeReport.count = anchorReadmeReport.removed.length;
  }

  // d. 更新 version.yaml + workspace.yaml 版本快照
  if (plan.versionTransitions.harness || plan.versionTransitions.workspaceTemplate) {
    const { workspaceYamlTouched } = await patchWorkspaceVersionYaml(workspaceRoot, {
      harnessVersion: plan.target.harnessVersion,
      templateVersion: plan.target.templateVersion,
    });
    gitRevertFiles.push(join('.sdd', 'version.yaml'));
    touched.push(join('.sdd', 'version.yaml'));
    if (workspaceYamlTouched) {
      gitRevertFiles.push(join('.sdd', 'workspace.yaml'));
      touched.push(join('.sdd', 'workspace.yaml'));
    }
  }

  const report = {
    ...plan,
    dryRun: false,
    migrations,
    changeSchema: changeSchemaReport,
    anchorReadme: anchorReadmeReport,
    touchedFiles: [...new Set(touched)],
    gitRevertFiles: [...new Set(gitRevertFiles)],
    gitNewFiles: [...new Set(gitNewFiles)],
  };
  await appendUpgradeLog(workspaceRoot, report);
  return report;
}

// ---- Phase 3.1+: 升级日志与回滚（Roadmap Phase 3「Upgrade 支持回滚」补齐）----
// 日志文件 .sdd/upgrade-log.yaml 机器维护（无注释需求，直接 stringify）。
// 回滚语义（确定性）：
// - 仅允许回滚「最近一次且未回滚」的升级，且当前 version.yaml 必须与该记录的 to 一致
//   （否则说明升级后发生过其他版本变更，拒绝自动回滚）
// - gitRevertFiles 由 CLI 层执行 git checkout（core 不执行 git）；version.yaml 由
//   Document API 恢复 from 值（不依赖 git）；gitNewFiles 由 CLI 层删除

const UPGRADE_LOG = join('.sdd', 'upgrade-log.yaml');

/**
 * 追加升级日志（applyUpgrade 成功后调用）。
 * @param {string} workspaceRoot Workspace 根目录
 * @param {object} report applyUpgrade 报告
 */
export async function appendUpgradeLog(workspaceRoot, report) {
  const p = join(workspaceRoot, UPGRADE_LOG);
  let log = { upgrades: [] };
  try {
    log = parse(await readFile(p, 'utf8')) || { upgrades: [] };
  } catch {
    // 首次升级或文件损坏 → 重新建（损坏的历史日志不可恢复，宁缺勿错）
  }
  log.upgrades.push({
    at: new Date().toISOString(),
    from: report.current || {},
    // 规范化为与 from 同构的版本字段（plan.target 是 { harnessVersion, templateVersion }）
    to: {
      harness: report.target?.harnessVersion,
      workspaceTemplate: report.target?.templateVersion,
    },
    touchedFiles: report.touchedFiles || [],
    gitRevertFiles: report.gitRevertFiles || [],
    gitNewFiles: report.gitNewFiles || [],
    rolledBack: null,
  });
  await writeFile(p, stringify(log), 'utf8');
}

/**
 * 计算回滚（零写入）：取最后一条未回滚记录并校验当前版本一致。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<object>} 日志记录（含 from/to/gitRevertFiles/gitNewFiles）
 * @throws {Error} 无可回滚记录 / 当前版本与记录不一致
 */
export async function planRollback(workspaceRoot) {
  let log;
  try {
    log = parse(await readFile(join(workspaceRoot, UPGRADE_LOG), 'utf8'));
  } catch {
    throw new Error('无升级日志（.sdd/upgrade-log.yaml），没有可回滚的升级。');
  }
  const record = [...(log?.upgrades || [])].reverse().find((u) => !u.rolledBack);
  if (!record) throw new Error('没有未回滚的升级记录。');

  const cur = readWorkspaceVersions(workspaceRoot);
  if (!cur || cur.harness !== String(record.to.harness)) {
    throw new Error(
      `当前 harness 版本（${cur?.harness ?? '?'}）与最近升级记录（→ ${record.to.harness}）不一致，` +
        '升级后已发生其他版本变更，拒绝自动回滚（请手动处理）。'
    );
  }
  return record;
}

/**
 * 执行回滚的 core 部分（CLI 负责 git checkout 与删除新文件后调用）：
 * version.yaml 恢复为升级前值 + 日志标记 rolledBack。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {object} record planRollback 返回的日志记录
 */
export async function markRolledBack(workspaceRoot, record) {
  // 1. version.yaml 恢复 from（Document API，不依赖 git）
  const p = join(workspaceRoot, '.sdd', 'version.yaml');
  if (record.from?.harness != null || record.from?.workspaceTemplate != null) {
    const doc = parseDocument(await readFile(p, 'utf8'));
    if (record.from?.harness != null) doc.setIn(['harness', 'version'], String(record.from.harness));
    if (record.from?.workspaceTemplate != null) {
      doc.setIn(['workspace-template', 'version'], String(record.from.workspaceTemplate));
    }
    await writeFile(p, doc.toString(), 'utf8');
  }

  // 2. 日志标记 rolledBack
  const lp = join(workspaceRoot, UPGRADE_LOG);
  const log = parse(await readFile(lp, 'utf8'));
  const entry = [...(log?.upgrades || [])].reverse().find((u) => !u.rolledBack);
  if (entry) entry.rolledBack = new Date().toISOString();
  await writeFile(lp, stringify(log), 'utf8');
}

export { MANAGED_DIRS };
