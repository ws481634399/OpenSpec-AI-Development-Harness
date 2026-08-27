// WorkspaceInitializer：编排 定位 → 复制 → 复制 Skills → 生成 → 自检（纯函数，无 CLI 依赖）
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { cp, mkdir } from 'node:fs/promises';
import { resolveDefaultWorkspace } from './template-resolver.js';
import { readHarnessVersion } from './version.js';
import { copyTemplate } from './copier.js';
import { writeWorkspaceYaml, writeRepositoriesYaml, patchVersionYaml } from './config-writer.js';
import { runSelfCheck } from './validator.js';

/**
 * 将 Harness 的内置 skills/ 复制到 Workspace。
 *
 * Workspace 的 skills/ 是运行时副本，Agent 从此处读取 SKILL.md。
 * 用户可通过 `openspec skill sync` 更新。
 *
 * @param {string} harnessRoot Harness 根目录
 * @param {string} workspaceDir Workspace 目录
 */
export async function copyBuiltinSkills(harnessRoot, workspaceDir) {
  const srcDir = join(harnessRoot, 'skills');
  const destDir = join(workspaceDir, 'skills');
  await mkdir(destDir, { recursive: true });
  await cp(srcDir, destDir, { recursive: true, force: true });
}

/**
 * 执行 init 核心逻辑（纯函数，可测试，不经过 @clack 交互）。
 *
 * 流程：检测已存在 → 复制模板 → 复制 Skills → 生成配置 → 自检。
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

  // 复制 Harness 内置 skills/ 到 Workspace（Agent 从本地副本读取 SKILL.md）
  await copyBuiltinSkills(harnessRoot, targetDir);

  writeWorkspaceYaml(templateDir, targetDir, config, harnessVersion);
  writeRepositoriesYaml(templateDir, targetDir, config);
  patchVersionYaml(targetDir, harnessVersion);

  const selfCheck = runSelfCheck(targetDir, harnessVersion);
  return { selfCheck };
}
