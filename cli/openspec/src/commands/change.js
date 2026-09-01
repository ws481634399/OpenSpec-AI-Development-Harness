// Change Command：编排 create/list/show/status/archive（CLI 层，依赖 core/sdd）
// 瘦编排范本对齐 init.js：resolveWorkspaceRoot → @clack 交互 → core 纯函数 → note/ok/warn 输出
// create 供 Agent 读 SKILL.md 后调用（原子操作，不编排 Skill 流程）
import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { listChanges, showChange, changeExists } from '../../../../core/sdd/change-repository.js';
import { runChangeCreate, readMetadata, bindFeaturePath } from '../../../../core/sdd/change-model.js';
import { nextStatuses, isValidStatus } from '../../../../core/sdd/change-state-machine.js';
import { archiveChange } from '../../../../core/sdd/change-archiver.js';
import { materializeChangeSkeleton, findChangeDirAny } from '../../../../core/sdd/change-skeleton.js';
import { requestTransition } from '../../../../core/sdd/transition-service.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { confirmArchive } from '../lib/change-prompts.js';
import { readFeatureTree } from '../../../../core/sdd/feature-model.js';
import { aggregateDuStatus } from '../../../../core/sdd/delivery-unit.js';
import { join } from 'node:path';

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
          note(
            [`Current: ${current}`, next.length ? `Legal next: ${next.join(', ')}` : 'Legal next: none (terminal)'].join('\n'),
            `${id} status`
          );
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
        // 收集 {story, parentL3, parentL2, parentL1} 完整链
        let chain = null;
        for (const l1 of tree.modules) {
          for (const l2 of l1.children || []) {
            for (const l3 of l2.children || []) {
              for (const story of l3.stories || []) {
                if (story.id === opts.story) {
                  chain = { 'level-1': l1, 'level-2': l2, 'level-3': l3, story };
                }
              }
              // v1 过渡：story 直挂 L2
              for (const story of l2.stories || []) {
                if (story.id === opts.story && !chain) {
                  chain = { 'level-1': l1, 'level-2': l2, 'level-3': { id: '', name: '' }, story };
                }
              }
            }
          }
        }
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

  // archive：归档（需 completed）
  change
    .command('archive <id>')
    .action(async (id) => {
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

        const confirmed = await confirmArchive(id, current);
        if (!confirmed) {
          outro('Canceled.');
          return;
        }

        const { archiveDir } = await archiveChange(ws, id);
        ok(`${id} archived to ${archiveDir}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Archive failed.');
        process.exit(1);
      }
    });
}
