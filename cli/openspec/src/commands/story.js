// Story Command：Phase 4.2 三级规格分层——Story 级管理（list/show）
// 瘦命令：纯函数 core/sdd/story-model.js 编排 + @clack/note 输出
import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { findChangeDirAny } from '../../../../core/sdd/change-skeleton.js';
import { readStories, resolveStoryDir, STORY_STATUSES } from '../../../../core/sdd/story-model.js';
import { readMetadata } from '../../../../core/sdd/change-model.js';

/**
 * 注册 story 子命令组到 commander program。
 */
export function registerStoryCommand(program) {
  const story = program.command('story').description('Phase 4.2：Story 级管理（list/show，三级规格分层）');

  // story list <CHG-ID>：列出 Change 下所有 Story
  story
    .command('list <change-id>')
    .description('列出 Change 下的所有 Story（含 inline 单 Story 场景）')
    .option('-s, --status <state>', '按 Story 状态过滤（pending/specified/designed/tasked/developing/testing/completed）')
    .action(async (changeId, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        if (opts.status && !STORY_STATUSES.includes(opts.status)) {
          throw new Error(`Invalid story status: ${opts.status}（合法值: ${STORY_STATUSES.join('/')}）`);
        }
        const changeDir = await findChangeDirAny(ws, changeId);
        if (!changeDir) throw new Error(`Change not found: ${changeId}`);
        const meta = await readMetadata(changeDir);
        let stories = await readStories(changeDir, meta, readMetadata);
        if (opts.status) stories = stories.filter((s) => s.status === opts.status);
        if (stories.length === 0) {
          note('No stories found — bind feature-path first or split to multi-story format.', `Stories (${meta.id})`);
        } else {
          const header = `${meta.id}（${meta.title || '(untitled)'}）status:${meta.status}  evidence-tier:${meta['evidence-tier'] || 'standard'}`;
          const lines = stories.map((s, i) => {
            const mode = s.inline ? 'inline' : '3-tier';
            const dus = (s.dus && s.dus.length) ? `${s.dus.length} DU` : 'no DU';
            const fp = s.featurePath && s.featurePath.story ? s.featurePath.story.id : '(no fp)';
            return `${i + 1}. ${s.id}  ${s.title || '(untitled)'}  [${mode}]  status:${s.status}  tier:${s.evidenceTier}  ${dus}  fp:${fp}`;
          });
          note(lines.join('\n'), `Stories (${stories.length}) — ${header}`);
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('story list failed.');
        process.exit(1);
      }
    });

  // story show <change-id> <story-id>：显示 Story 详情
  story
    .command('show <change-id> <story-id>')
    .description('显示单个 Story 的详情（metadata / gates / dus / feature-path）')
    .option('--json', '输出 JSON 便于 Agent 读取')
    .action(async (changeId, storyId, opts) => {
      const ws = resolveWorkspaceRoot();
      try {
        const changeDir = await findChangeDirAny(ws, changeId);
        if (!changeDir) throw new Error(`Change not found: ${changeId}`);
        const resolved = await resolveStoryDir(changeDir, storyId);
        const meta = resolved.metadata;
        if (opts.json) {
          const payload = {
            changeId,
            storyId,
            inline: resolved.inline,
            storyDir: resolved.storyDir,
            status: meta.status,
            evidenceTier: meta['evidence-tier'],
            featurePath: meta['feature-path'] || null,
            changePrdRef: meta['change-prd-ref'] || '',
            changeDesignRef: meta['change-design-ref'] || '',
            dus: meta.dus || [],
            artifacts: Object.keys(meta.artifacts || {}),
          };
          process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
          outro('Done.');
          return;
        }
        const sections = [];
        sections.push(`Story ${storyId}${meta.title ? ' — ' + meta.title : ''}`);
        sections.push(`  Mode        : ${resolved.inline ? 'inline (平铺)' : '3-tier (stories/ 子目录)'}`);
        sections.push(`  Dir         : ${resolved.storyDir}`);
        sections.push(`  Status      : ${meta.status}`);
        sections.push(`  Tier        : ${meta['evidence-tier'] || 'standard'}`);
        sections.push(`  Created     : ${meta['created-at'] || '-'}`);
        sections.push(`  Updated     : ${meta['updated-at'] || '-'}`);
        if (meta['change-prd-ref'])    sections.push(`  PRD Ref     : ${meta['change-prd-ref']}`);
        if (meta['change-design-ref']) sections.push(`  Design Ref  : ${meta['change-design-ref']}`);
        if (meta['feature-path']) {
          const fp = meta['feature-path'];
          const chain = [fp['level-1'], fp['level-2'], fp['level-3'], fp.story]
            .filter(Boolean).map((n) => `${n.id}:${n.name}`).join(' > ');
          sections.push(`  Feature     : ${chain || '(incomplete)'}`);
        }
        const dus = meta.dus || [];
        if (dus.length === 0) {
          sections.push(`  DUs         : (none — task 阶段拆分)`);
        } else {
          sections.push(`  DUs (${dus.length}):`);
          for (const d of dus) {
            sections.push(`    - ${d.id}  repo:${d.repo}  status:${d.status || 'pending'}`);
          }
        }
        const arts = Object.keys(meta.artifacts || {});
        sections.push(`  Artifacts   : ${arts.length === 0 ? '(none)' : arts.join(', ')}`);
        note(sections.join('\n'), 'Story Detail');
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('story show failed.');
        process.exit(1);
      }
    });
}
