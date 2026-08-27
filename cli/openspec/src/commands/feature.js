// Feature Command：四级 Feature Tree 管理（CLI 层）
// Product → Module → Feature → Story
//
// 子命令：list / show / add module / add feature / add story / update / remove
// 对齐 Phase 1 CLI 补齐方案

import { Command } from 'commander';
import * as p from '@clack/prompts';
import { outro, note } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { readFeatureTree, findNodeById, nodeLevel, nodePath } from '../../../../core/sdd/feature-model.js';
import { addModule, addFeature, addStory, updateNode, removeNode } from '../../../../core/sdd/feature-writer.js';

function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/**
 * 格式化整棵树为文本。
 */
function formatTree(tree) {
  const lines = [];
  lines.push(`Product: ${tree.product.name || '(unnamed)'}`);
  if (tree.product.description) {
    lines.push(`  ${tree.product.description}`);
  }
  lines.push('');

  if (!tree.modules || tree.modules.length === 0) {
    lines.push('(no modules)');
    return lines.join('\n');
  }

  for (const mod of tree.modules) {
    lines.push(`[Module] ${mod.id} — ${mod.name}`);
    if (mod.description) lines.push(`  ${mod.description}`);
    if (mod.features) {
      for (const feat of mod.features) {
        lines.push(`  [Feature] ${feat.id} — ${feat.name}`);
        if (feat.description) lines.push(`    ${feat.description}`);
        if (feat.stories) {
          for (const story of feat.stories) {
            const status = story.status ? ` (${story.status})` : '';
            lines.push(`    [Story] ${story.id} — ${story.name}${status}`);
          }
        }
      }
    }
  }
  return lines.join('\n');
}

/**
 * 注册 feature 命令到 commander program。
 */
export function registerFeatureCommand(program) {
  const feature = program.command('feature').description('Feature Tree 管理（Product → Module → Feature → Story）');

  // feature list
  feature
    .command('list')
    .description('列出 Feature Tree')
    .option('--module <id>', '只列出指定 Module 的子树')
    .option('--json', '输出 JSON 格式')
    .action(async (opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const tree = await readFeatureTree(ws);

        if (opts.json) {
          if (opts.module) {
            const mod = findNodeById(tree, opts.module);
            console.log(JSON.stringify(mod, null, 2));
          } else {
            console.log(JSON.stringify(tree, null, 2));
          }
        } else {
          if (opts.module) {
            const mod = findNodeById(tree, opts.module);
            if (!mod) {
              warn(`Module not found: ${opts.module}`);
              outro('Done.');
              return;
            }
            note(formatTree({ product: tree.product, modules: [mod] }), 'Feature Tree');
          } else {
            note(formatTree(tree), 'Feature Tree');
          }
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature list failed.');
        process.exit(1);
      }
    });

  // feature show
  feature
    .command('show <id>')
    .description('查看节点详情')
    .action(async (id) => {
      try {
        const ws = resolveWorkspaceRoot();
        const tree = await readFeatureTree(ws);
        const node = findNodeById(tree, id);
        if (!node) {
          warn(`Node not found: ${id}`);
          outro('Done.');
          return;
        }
        const level = nodeLevel(node);
        const path = nodePath(tree, id);
        const lines = [
          `ID:          ${node.id}`,
          `Name:        ${node.name}`,
          `Level:       ${level}`,
          `Path:        ${path}`,
        ];
        if (node.description) lines.push(`Description: ${node.description}`);
        if (node.status) lines.push(`Status:      ${node.status}`);
        if (level === 'module' && node.features) {
          lines.push(`Features:    ${node.features.length}`);
        }
        if (level === 'feature' && node.stories) {
          lines.push(`Stories:     ${node.stories.length}`);
        }
        note(lines.join('\n'), `Feature Node: ${id}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature show failed.');
        process.exit(1);
      }
    });

  // feature add module
  const addCmd = feature.command('add').description('添加节点');

  addCmd
    .command('module')
    .description('添加 Module')
    .requiredOption('--name <name>', 'Module 名称')
    .option('--id <id>', 'Module ID（省略自动生成）')
    .option('--desc <desc>', 'Module 描述')
    .action(async (opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const result = await addModule(ws, { id: opts.id, name: opts.name, description: opts.desc });
        ok(`Module added: ${result.id} — ${opts.name}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature add module failed.');
        process.exit(1);
      }
    });

  // feature add feature
  addCmd
    .command('feature')
    .description('添加 Feature')
    .requiredOption('--module <id>', '所属 Module ID')
    .requiredOption('--name <name>', 'Feature 名称')
    .option('--id <id>', 'Feature ID（省略自动生成）')
    .option('--desc <desc>', 'Feature 描述')
    .action(async (opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const result = await addFeature(ws, opts.module, { id: opts.id, name: opts.name, description: opts.desc });
        ok(`Feature added: ${result.id} — ${opts.name}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature add feature failed.');
        process.exit(1);
      }
    });

  // feature add story
  addCmd
    .command('story')
    .description('添加 Story')
    .requiredOption('--feature <id>', '所属 Feature ID')
    .requiredOption('--name <name>', 'Story 名称')
    .option('--id <id>', 'Story ID（省略自动生成）')
    .option('--desc <desc>', 'Story 描述')
    .option('--status <status>', 'Story 状态 (planned/in-progress/delivered)', 'planned')
    .action(async (opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const result = await addStory(ws, opts.feature, {
          id: opts.id, name: opts.name, description: opts.desc, status: opts.status,
        });
        ok(`Story added: ${result.id} — ${opts.name} (${opts.status})`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature add story failed.');
        process.exit(1);
      }
    });

  // feature update
  feature
    .command('update <id>')
    .description('更新节点字段')
    .option('--name <name>', '新名称')
    .option('--desc <desc>', '新描述')
    .option('--status <status>', '新状态 (planned/in-progress/delivered，仅 Story)')
    .action(async (id, opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const updates = {};
        if (opts.name !== undefined) updates.name = opts.name;
        if (opts.desc !== undefined) updates.description = opts.desc;
        if (opts.status !== undefined) updates.status = opts.status;
        const result = await updateNode(ws, id, updates);
        ok(`Node updated: ${result.id}`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature update failed.');
        process.exit(1);
      }
    });

  // feature remove
  feature
    .command('remove <id>')
    .description('删除节点及其子树')
    .action(async (id) => {
      try {
        const ws = resolveWorkspaceRoot();
        const ce = await p.confirm({
          message: `删除 ${id} 及其所有子节点？此操作不可逆。`,
          active: 'Yes',
          inactive: 'No',
          initialValue: false,
        });
        if (p.isCancel(ce)) bail('已取消');
        if (!ce) {
          outro('Cancelled.');
          return;
        }
        const result = await removeNode(ws, id);
        ok(`Node removed: ${result.id} (${result.level})`);
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Feature remove failed.');
        process.exit(1);
      }
    });
}
