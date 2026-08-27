// Reverse Command：Knowledge Reverse 骨架（CLI 层，调用 core/sdd/knowledge-reverser.js）
// 对齐 Phase 1 CLI 补齐方案
//
// Phase 1 无 LLM：扫描 implementation/ → 创建 reverse CHG → 生成 instruction.md
// 外部 Agent 按 instruction 执行知识提取，写入 standards/product/

import { Command } from 'commander';
import { outro } from '@clack/prompts';
import { resolveWorkspaceRoot } from '../lib/workspace-resolver.js';
import { ok, warn, error } from '../lib/logger.js';
import { runReverse } from '../../../../core/sdd/knowledge-reverser.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';

/**
 * 注册 reverse 命令到 commander program。
 */
export function registerReverseCommand(program) {
  program
    .command('reverse')
    .description('Knowledge Reverse — 旧项目知识接入（生成 Agent 执行指令）')
    .option('--title <title>', 'Change 标题', 'Knowledge Reverse — 旧项目知识接入')
    .action(async (opts) => {
      try {
        const ws = resolveWorkspaceRoot();
        const harnessRoot = getHarnessRoot();
        const result = await runReverse(ws, harnessRoot, { title: opts.title });

        ok(`Reverse CHG created: ${result.changeId}`);
        ok(`Instruction: ${result.instructionPath}`);

        // 扫描结果摘要
        const langCount = Object.keys(result.scanResult.languages).length;
        warn(`Scanned ${result.scanResult.total} files, detected ${langCount} language(s).`);
        if (result.scanResult.markers.length > 0) {
          warn(`Markers: ${result.scanResult.markers.join(', ')}`);
        }

        outro('External Agent: read instruction.md, scan code, write knowledge to standards/ and product/.');
      } catch (e) {
        error(e.message);
        outro('Reverse failed.');
        process.exit(1);
      }
    });
}
