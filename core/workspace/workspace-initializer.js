// WorkspaceInitializer：编排 定位 → 复制 → 生成 → 自检（纯函数，无 CLI 依赖）
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveDefaultWorkspace } from './template-resolver.js';
import { readHarnessVersion } from './version.js';
import { copyTemplate } from './copier.js';
import { writeWorkspaceYaml, writeRepositoriesYaml, patchVersionYaml } from './config-writer.js';
import { runSelfCheck } from './validator.js';

/**
 * 执行 init 核心逻辑（纯函数，可测试，不经过 @clack 交互）。
 *
 * 流程：检测已存在 → 复制模板 → 生成配置 → 自检。
 *
 * @param {object} config { name, type, mode, repos, shouldCreateImplementation, force }
 * @param {string} targetDir 目标目录绝对路径
 * @param {string} harnessRoot Harness 根目录绝对路径
 * @returns {Promise<{selfCheck:{ok:boolean,issues:string[]}}>}
 * @throws {Error} 若目标已含 .sdd 且未指定 force
 */
export async function runInit(config, targetDir, harnessRoot) {
  const templateDir = resolveDefaultWorkspace(harnessRoot);
  const harnessVersion = readHarnessVersion(harnessRoot);

  const sddDir = resolve(targetDir, '.sdd');
  if (existsSync(sddDir) && !config.force) {
    throw new Error('Workspace already initialized. Use --force to overwrite.');
  }

  await copyTemplate(templateDir, targetDir, config);
  writeWorkspaceYaml(templateDir, targetDir, config, harnessVersion);
  writeRepositoriesYaml(templateDir, targetDir, config);
  patchVersionYaml(targetDir, harnessVersion);

  const selfCheck = runSelfCheck(targetDir, harnessVersion);
  return { selfCheck };
}
