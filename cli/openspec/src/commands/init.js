// Init Command：编排 欢迎 → 交互 → WorkspaceInitializer → 输出（CLI 层，依赖 core/workspace）
import { Command } from 'commander';
import { outro, note } from '@clack/prompts';
import { askInitConfig } from '../lib/prompts.js';
import { runInit } from '../../../../core/workspace/workspace-initializer.js';
import { printBanner } from '../lib/banner.js';
import { readHarnessVersion } from '../../../../core/workspace/version.js';
import { getHarnessRoot } from '../../../../core/workspace/harness-root.js';
import { ok, warn, error } from '../lib/logger.js';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, basename, join } from 'node:path';

/**
 * 打印成功输出（对齐设计 §16.1）。
 */
function printSuccess(config, harnessVersion, selfCheck) {
  const modeLabel = config.mode === 'single' ? 'single repository' : 'multi repository';
  note(
    [
      `Project: ${config.name}`,
      `Type: ${config.type}`,
      `Mode: ${modeLabel}`,
      `Harness: ${harnessVersion}`,
      '',
      'Next steps:',
      '1. Configure Feature Tree (product/feature-tree.yaml)',
      '2. Start first Change (Phase 1.3)',
      '3. Begin SDD workflow',
    ].join('\n'),
    'OpenSpec Workspace initialized.'
  );
  if (selfCheck.ok) {
    ok('Self-check passed.');
  } else {
    warn('Self-check issues:');
    selfCheck.issues.forEach((i) => warn('  ' + i));
  }
}

/**
 * 注册 init 命令到 commander program。
 */
export function registerInitCommand(program) {
  program
    .command('init')
    .argument('[project-path]', '目标目录，默认当前目录')
    .option('-f, --force', '覆写已存在的 .sdd/*.yaml 与 README-OpenSpec.md')
    .action(async (projectPath, opts) => {
      const harnessRoot = getHarnessRoot();
      const harnessVersion = readHarnessVersion(harnessRoot);

      printBanner(harnessVersion);

      const targetDir = projectPath ? resolve(process.cwd(), projectPath) : process.cwd();
      const defaultName = basename(targetDir) || 'openspec-project';

      if (projectPath && !existsSync(targetDir)) {
        await mkdir(targetDir, { recursive: true });
      }

      let config;
      try {
        config = await askInitConfig(defaultName, targetDir);
      } catch (e) {
        error(e.message);
        outro('Initialization canceled.');
        process.exit(1);
      }
      config.force = !!opts.force;

      try {
        const { selfCheck } = await runInit(config, targetDir, harnessRoot);
        printSuccess(config, harnessVersion, selfCheck);

        // Phase 2.4 §5.3：Git 边界提示（只检测，不自动执行 git 操作）
        if (existsSync(join(targetDir, '.git'))) {
          note(
            'Workspace 根已是 Git 仓库。implementation/ 下各子仓建议以 git submodule 管理\n' +
              '（.gitmodules = Git 映射；.sdd/repositories.yaml = OpenSpec 注册表，二者由 openspec doctor 校验一致性）。',
            'Git'
          );
        } else if (config.detectedRepos > 0) {
          note(
            `已注册 ${config.detectedRepos} 个检测到的代码仓。workspace 根 git init 与 submodule add 由你显式执行。`,
            'Git'
          );
        }
        outro('Done.');
      } catch (e) {
        error(e.message);
        outro('Initialization failed.');
        process.exit(1);
      }
    });
}
