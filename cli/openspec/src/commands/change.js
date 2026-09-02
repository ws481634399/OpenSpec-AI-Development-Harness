// Change Command：编排 create/list/show/status/archive（CLI 层，依赖 core/sdd）
// 瘦编排范本对齐 init.js：resolveWorkspaceRoot → @clack 交互 → core 纯函数 → note/ok/warn 输出
// create 供 Agent 读 SKILL.md 后调用（原子操作，不编排 Skill 流程）
import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { listChanges, showChange, changeExists } from '../../../../core/sdd/change-repository.js';
import { runChangeCreate, readMetadata, bindFeaturePath, setEvidenceTier, patchMetadata } from '../../../../core/sdd/change-model.js';
import { nextStatuses, isValidStatus } from '../../../../core/sdd/change-state-machine.js';
import { archiveChange } from '../../../../core/sdd/change-archiver.js';
import { materializeChangeSkeleton, findChangeDirAny } from '../../../../core/sdd/change-skeleton.js';
import { requestTransition } from '../../../../core/sdd/transition-service.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { confirmArchive } from '../lib/change-prompts.js';
import { readFeatureTree, findStoryChain } from '../../../../core/sdd/feature-model.js';
import { aggregateDuStatus } from '../../../../core/sdd/delivery-unit.js';
import { splitInlineStory, readStories, aggregateChangeStatus } from '../../../../core/sdd/story-model.js';
import { join, basename } from 'node:path';

/**
 * 注册 change 子命令组到 commander program。
 */
export function registerChangeCommand(program) {
  const change = program.command('change').description('SDD Change 管理操作');

  // create：创建 CHG 载体（Agent 原子操作）
  change
    .command('create')
    .requiredOption('--title <text>', 'Change 标题（非空）')
    .option('--id <custom-id>', '自定义 Change ID（Phase 3.7：格式 CHG-NNNN，省略则按最大编号自动分配）')
    .option('--requirement <req>', '需求来源标识（例 REQ-XXX）')
    .option('--summary <text>', 'Change 摘要')
    .action(async (opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const result = await runChangeCreate(
          ws,
          { id: opts.id, title: opts.title, requirement: opts.requirement, summary: opts.summary },
          getHarnessRoot()
        );
        ok(`${result.id} created`);
        note(`Path: ${result.changeDir}`, result.id);
        outro('Done. 下一步：`feature bind-tree` 或 `workflow run default --change ' + result.id + '`');
      } catch (e) {
        error(e.message);
        outro('Create failed.');
        process.exit(1);
      }
    });

  // list：列出进行中 Change
  change
    .command('list')
    .option('-s, --status <state>', '按状态过滤')
    .action(async (opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (opts.status && !isValidStatus(opts.status)) {
          throw new Error(`Invalid status: ${opts.status}. Run 'openspec change status' for valid states.`);
        }
        const { changes, skipped } = await listChanges(ws, { status: opts.status });
        if (changes.length === 0) {
          note('No changes found.', 'Changes');
        } else {
          note(
            changes
              .map(
                (c) =>
                  `${c.id}  ${c.title || '(untitled)'}  status: ${c.status}  story: ${c.story || '(unbound)'}` +
                  `  updated: ${c.updatedAt}`
              )
              .join('\n'),
            `Changes (${changes.length})`
          );
        }
        if (skipped > 0) warn(`${skipped} skipped due to corruption.`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('List failed.');
        process.exit(1);
      }
    });

  // show：查看 metadata + artifacts 清单
  change
    .command('show <id>')
    .action(async (id) => {
      const ws = resolveWorkspaceRoot();
      try {
        const { metadata, artifacts, changeDir } = await showChange(ws, id);
        const lines = [
          `id: ${metadata.id || id}`,
          `title: ${metadata.title || ''}`,
          `status: ${metadata.status || ''}`,
          `requirement: ${metadata.requirement || ''}`,
          `created-at: ${metadata['created-at'] || ''}`,
          `updated-at: ${metadata['updated-at'] || ''}`,
        ];
        if (metadata.features && metadata.features.length) {
          lines.push(`features: ${metadata.features.join(', ')}`);
        }
        if (metadata.repositories && metadata.repositories.length) {
          lines.push(`repositories: ${metadata.repositories.join(', ')}`);
        }
        if (metadata['related-change']) {
          lines.push(`related-change: ${metadata['related-change']}`);
        }
        // Phase 4.1：Evidence 分档（缺省 standard）
        lines.push(`evidence-tier: ${metadata['evidence-tier'] || 'standard'}`);
        // Phase 2.4：feature-path 摘要
        const fp = metadata['feature-path'];
        if (fp && typeof fp === 'object' && fp.story?.id) {
          lines.push(
            `feature-path: ${fp['level-1']?.id || '?'} > ${fp['level-2']?.id || '?'} > ${fp['level-3']?.id || '?'} > ${fp.story.id}` +
              (fp.candidate ? ' (candidate)' : '')
          );
        } else {
          lines.push('feature-path: (unbound)');
        }
        if (metadata['repository-baseline'] && Object.keys(metadata['repository-baseline']).length) {
          lines.push(
            `repository-baseline: ${Object.entries(metadata['repository-baseline'])
              .map(([r, v]) => `${r}@${v.commit}`)
              .join(', ')}`
          );
        }
        if (metadata['repository-result'] && Object.keys(metadata['repository-result']).length) {
          lines.push(
            `repository-result: ${Object.entries(metadata['repository-result'])
              .map(([r, v]) => `${r}@${v.commit}`)
              .join(', ')}`
          );
        }
        // DU 概览
        try {
          const agg = await aggregateDuStatus(changeDir, ws);
          if (agg.total > 0) {
            lines.push(
              '',
              `Delivery Units (${agg.total}):`,
              ...agg.dus.map((d) => `  ${d.id}  repo: ${d.repository}  status: ${d.status}  materialized: ${d.materialized ? 'yes' : 'no'}`),
              `  allCompleted: ${agg.allCompleted}`
            );
          }
        } catch {
          // DU 概览失败不阻断 show（feature-path 未绑定等）
        }
        lines.push('', 'Artifacts:');
        for (const a of artifacts) {
          lines.push(`  ${a.name} (${a.type})`);
        }
        note(lines.join('\n'), `${id} @ ${changeDir}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Show failed.');
        process.exit(1);
      }
    });

  // status：查看/推进状态
  change
    .command('status <id>')
    .option('--set <state>', '推进到指定状态')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', id);
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const metadata = await readMetadata(changeDir);
        const current = metadata.status || 'created';

        if (!opts.set) {
          const next = nextStatuses(current);
          const lines = [
            `Current: ${current}`,
            next.length ? `Legal next: ${next.join(', ')}` : 'Legal next: none (terminal)',
          ];
          // Phase 4.2：Story 状态表格（多 Story Change 的聚合视图，类似 docker ps）
          const stories = await readStories(changeDir, metadata, readMetadata);
          if (stories.length > 0) {
            const header = 'STORY-ID'.padEnd(24) + 'MODE'.padEnd(9) + 'STATUS'.padEnd(13) + 'EVIDENCE'.padEnd(11) + 'TITLE';
            lines.push('', 'Stories:', '  ' + header);
            for (const s of stories) {
              lines.push(
                '  ' +
                  [
                    s.id.padEnd(24),
                    (s.inline ? 'inline' : '3-tier').padEnd(9),
                    (s.status || 'pending').padEnd(13),
                    (s.evidenceTier || 'standard').padEnd(11),
                    s.title || '-',
                  ].join('')
              );
            }
            // 聚合状态提示（§5.3）
            const agg = aggregateChangeStatus(stories.map((s) => s.status));
            if (agg) {
              lines.push('', `Aggregated (§5.3): all-stories → ${agg}`);
            }
          }
          note(lines.join('\n'), `${id} status`);
          outro('Done.');
          return;
        }

        // --set：推进状态（走 TransitionService，校验 Gate + Hash + 状态机）
        if (opts.set === current) {
          throw new Error(`Already at ${current} (from === to).`);
        }
        const result = await requestTransition(changeDir, opts.set, { harnessRoot: getHarnessRoot() });
        if (!result.advanced) {
          throw new Error(`Cannot advance to ${opts.set}: ${result.reason}`);
        }
        ok(`${id} status: ${result.reason}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Status update failed.');
        process.exit(1);
      }
    });

  // bind-feature-path：绑定/回填 feature-path（Phase 2.4 §22）
  // --story 从树推导完整四级链；--candidate 用于 explore Candidate 待晋升场景
  change
    .command('bind-feature-path <id>')
    .requiredOption('--story <story-id>', 'Story ID（feature-tree.yaml 中最小产品能力节点）')
    .option('--candidate', '标记为 Candidate（未晋升，阻断 task 阶段）')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', id);
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const tree = await readFeatureTree(ws);
        // 缺陷 9 修复：遍历逻辑收敛为 core 纯函数 findStoryChain
        // （v1 过渡形态 story 直挂 L2 且无 L3 子节点时也能命中）
        const chain = findStoryChain(tree, opts.story);
        if (!chain) {
          throw new Error(`Story not found in feature-tree.yaml: ${opts.story}`);
        }
        const fp = {
          'level-1': { id: chain['level-1'].id, name: chain['level-1'].name },
          'level-2': { id: chain['level-2'].id, name: chain['level-2'].name },
          'level-3': { id: chain['level-3'].id, name: chain['level-3'].name },
          story: { id: chain.story.id, name: chain.story.name },
          candidate: !!opts.candidate,
        };
        await bindFeaturePath(changeDir, fp);
        ok(
          `${id} feature-path bound: ${chain['level-1'].id} > ${chain['level-2'].id} > ${chain['level-3'].id || '-'} > ${chain.story.id}` +
            (opts.candidate ? ' (candidate)' : '')
        );
        // 绑定即物化 CHG 内部四级骨架（candidate 不物化；幂等同步：树名/rename/产物迁移）
        if (!opts.candidate) {
          const meta = await readMetadata(changeDir);
          const tree = await readFeatureTree(ws);
          const sk = await materializeChangeSkeleton(changeDir, meta, tree, ws);
          if (sk.skipped) warn(`骨架未物化: ${sk.reason}`);
          else {
            ok(`四级骨架: ${sk.created.join(', ') || '（已存在）'}`);
            if (sk.nameSynced) ok('metadata.feature-path 名称已按特性树同步');
            if (sk.renamed.length > 0) ok(`目录改名: ${sk.renamed.join(', ')}`);
            if (sk.migrated.length > 0) ok(`产物已迁入 STORY 目录: ${sk.migrated.join(', ')}`);
          }
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Bind feature-path failed.');
        process.exit(1);
      }
    });

  // skeleton：为存量/归档 CHG 补物化四级骨架（Phase 3.5，幂等）
  change
    .command('skeleton <id>')
    .description('按 metadata.feature-path 补物化 CHG 内部四级目录骨架（幂等，支持归档 CHG）')
    .action(async (id) => {
      const ws = resolveWorkspaceRoot();
      try {
        const found = await findChangeDirAny(ws, id);
        if (!found) throw new Error(`Change not found: ${id}（changes 与 archive 均未定位到）`);
        const meta = await readMetadata(found.dir);
        const tree = await readFeatureTree(ws);
        const sk = await materializeChangeSkeleton(found.dir, meta, tree, ws);
        if (sk.skipped) warn(`骨架未物化: ${sk.reason}`);
        else {
          ok(`${id}（${found.scope}）四级骨架: ${sk.created.join(', ') || '（已存在）'}`);
          if (sk.nameSynced) ok('metadata.feature-path 名称已按特性树同步');
          if (sk.renamed.length > 0) ok(`目录改名: ${sk.renamed.join(', ')}`);
          if (sk.migrated.length > 0) ok(`产物已迁入 STORY 目录: ${sk.migrated.join(', ')}`);
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Skeleton failed.');
        process.exit(1);
      }
    });

  // tier：设置 Evidence 分档（Phase 4.1 轻量化）
  // light 免 DU/多仓/逐 commit 映射等重仪式机检；standard 缺省；strict 全量
  change
    .command('tier <id> <tier>')
    .description('设置 Evidence 分档（light/standard/strict），gate-validator 按 skip-tier 跳过命中项')
    .action(async (id, tier) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', id);
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const result = await setEvidenceTier(changeDir, tier);
        ok(`${id} evidence-tier: ${result.tier}`);
        if (result.tier === 'light') {
          warn('light 档将跳过 skip-tier: [light] 的 machine-checks（DU/多仓/逐 commit 映射等重仪式），仅建议单仓小改动使用。');
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Tier update failed.');
        process.exit(1);
      }
    });

  // archive：归档（需 completed）
  change
    .command('archive <id>')
    // 缺陷 1.3 修复：--yes 跳过交互确认（CI/沙箱等非交互环境执行）
    .option('-y, --yes', '跳过交互确认（CI/非交互环境用；归档仍不可逆）')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = join(ws, 'delivery', 'changes', id);
        if (!(await changeExists(ws, id))) {
          throw new Error(`Change not found: ${id}`);
        }
        const metadata = await readMetadata(changeDir);
        const current = metadata.status || 'created';

        if (current !== 'completed') {
          throw new Error(`Cannot archive: status is ${current}. Only completed can be archived.`);
        }

        // 归档是难逆操作：交互模式下必须人工确认；--yes 为显式声明（审计可辨）
        if (!opts.yes) {
          const confirmed = await confirmArchive(id, current);
          if (!confirmed) {
            outro('Canceled.');
            return;
          }
        }

        const { archiveDir } = await archiveChange(ws, id);
        ok(`${id} archived to ${archiveDir}`);
        // 缺陷 6 文档化：目录移动 → git 识别为 100% rename，history 完整保留
        note('git will record this as 100% renames — file history is preserved after archiving.');
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Archive failed.');
        process.exit(1);
      }
    });

  // split-story：Phase 4.2 — 将 inline 单 Story Change 转换为 stories/<id>/ 三级形态
  change
    .command('split-story <id>')
    .description('Phase 4.2：拆分平铺单 Story Change → stories/<id>/ 三级形态（不可逆）')
    .option('--story-id <sid>', '自定义拆分后的 Story ID；默认用 feature-path.story.id')
    .option('-y, --yes', '跳过不可逆操作的交互确认')
    .action(async (id, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = await findChangeDirAny(ws, id);
        if (!changeDir) throw new Error(`Change not found: ${id}`);
        const meta = await readMetadata(changeDir);
        const stories = await readStories(changeDir, meta, readMetadata);
        if (stories.length > 1 || (stories.length === 1 && !stories[0].inline)) {
          throw new Error(`split-story 仅适用于单 Story 平铺 Change。当前：${stories.length} stories，多 Story 或已拆分。`);
        }
        if (!opts.yes) {
          const prompts = await import('@clack/prompts');
          const tip = [
            `⚠  这是不可逆操作：会创建 stories/${opts.storyId || (meta['feature-path'] && meta['feature-path'].story ? meta['feature-path'].story.id : 'STORY-XXX')}/ 子目录，`,
            `移动 tasks.md / implementation.md / evidence/ / du/ 等 Story 级文件，`,
            `并清空 Change.metadata.feature-path（Story 级成为权威）。`,
          ].join('\n');
          note(tip, 'Split-story 不可逆');
          const ok_ = await prompts.confirm({ message: '确认执行 split-story？' });
          if (!ok_) { outro('Canceled.'); return; }
        }
        const { storyId, storyDir, movedFiles } = await splitInlineStory(changeDir, { newStoryId: opts.storyId, harnessRoot: getHarnessRoot() });
        ok(`Split done: story-id=${storyId}`);
        note(`Directory: ${storyDir}\nMoved: ${movedFiles.length === 0 ? '(no files to move)' : movedFiles.join(', ')}`, storyId);
        outro(`Done. 下一步：'story list ${meta.id}' 查看拆分结果。`);
      } catch (e) {
        error(e.message);
        outro('split-story failed.');
        process.exit(1);
      }
    });
}
