// TemplateCopier：node:fs/promises cp + filter（README 改名、workspace/repositories 排除、implementation 条件、--force 保护四世界）
import { cp, mkdir, copyFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const FOUR_WORLDS = ['standards', 'product', 'delivery', 'skills'];

function isUnder(rel, dir) {
  return rel === dir || rel.startsWith(dir + '/');
}

/**
 * 构造复制过滤器。
 *
 * 排除规则：
 * - 模板根 README.md（改名单独复制为 README-OpenSpec.md）
 * - .sdd/workspace.yaml、.sdd/repositories.yaml（由 ConfigWriter 动态生成）
 * - implementation/ 整树（仅当 config.shouldCreateImplementation 为真且非 force 时才复制）
 * - --force 时不触碰四世界（standards/product/delivery/skills），仅刷新 .sdd 静态文件
 *
 * @param {object} config 含 shouldCreateImplementation、force
 * @param {string} templateRoot 模板根目录绝对路径
 */
function makeFilter(config, templateRoot) {
  return (src) => {
    const rel = relative(templateRoot, src).replace(/\\/g, '/');
    if (rel === 'README.md') return false;
    if (rel === '.sdd/workspace.yaml' || rel === '.sdd/repositories.yaml') return false;
    if (isUnder(rel, 'implementation')) {
      return !!config.shouldCreateImplementation && !config.force;
    }
    if (config.force) {
      for (const w of FOUR_WORLDS) {
        if (isUnder(rel, w)) return false;
      }
    }
    return true;
  };
}

/**
 * 复制 default-workspace 模板到目标目录。
 *
 * - 静态文件直接复制（standards/ product/ delivery/ skills/ .sdd/README.md .sdd/context-rules.yaml .sdd/version.yaml）
 * - 模板根 README.md 改名为 README-OpenSpec.md（绝不覆盖用户 README.md）
 * - implementation/ 仅当 config.shouldCreateImplementation 为真且非 force 时复制
 * - --force 时仅刷新 .sdd 静态文件 + README-OpenSpec.md，保护四世界与 implementation
 * - 确保 .sdd/ 目录存在（即便 workspace/repositories 被排除）
 *
 * @param {string} templateDir 模板根目录
 * @param {string} targetDir 目标项目目录
 * @param {object} config 含 shouldCreateImplementation、force
 */
export async function copyTemplate(templateDir, targetDir, config) {
  await mkdir(targetDir, { recursive: true });

  await cp(templateDir, targetDir, {
    filter: makeFilter(config, templateDir),
    recursive: true,
    force: true,
  });

  // 模板根 README.md → 目标 README-OpenSpec.md（改名复制，不触碰用户 README.md）
  await copyFile(join(templateDir, 'README.md'), join(targetDir, 'README-OpenSpec.md'));

  // 确保 .sdd/ 存在（workspace.yaml/repositories.yaml 被排除时目录仍需存在）
  await mkdir(join(targetDir, '.sdd'), { recursive: true });
}
