// GitSubmodule：Git Submodule 只读探测（Phase 2.4 plans/phase-2.4-multi-repository-delivery-design.md §5）
//
// 职责边界：
// - .gitmodules = Git Repository Mapping（remote URL / local path）——本模块解析
// - .sdd/repositories.yaml = OpenSpec Repository Registry——delivery-unit.js 消费
// - 本模块只读，不执行任何 git 命令（remote/push/submodule add 一律为用户显式行为）
// - 注意：Submodule 工作树的 .git 通常是指向父仓 .git/modules/... 的文件而非目录
//
// Commit Pointer 的读取（git rev-parse HEAD）由 CLI 层（du sync-status）执行 git 命令完成，
// 保持核心层零 child_process 依赖。

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, isAbsolute } from 'node:path';
import { parse } from 'yaml';

/**
 * 解析 .gitmodules（存在时），返回 submodule 条目。
 * .gitmodules 是 git config 语法（非 YAML），这里做轻量解析：
 *
 *   [submodule "backend"]
 *       path = implementation/backend
 *       url = https://...
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @returns {Promise<Array<{name:string, path:string, url:string}>>} 文件缺失返回 []
 */
export async function parseGitmodules(workspaceRoot) {
  const file = join(workspaceRoot, '.gitmodules');
  let raw;
  try {
    raw = await readFile(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  const result = [];
  let current = null;
  for (const line of raw.split(/\r?\n/)) {
    const section = /^\[submodule\s+"([^"]+)"\]/.exec(line.trim());
    if (section) {
      current = { name: section[1], path: '', url: '' };
      result.push(current);
      continue;
    }
    if (!current) continue;
    const kv = /^\s*(path|url)\s*=\s*(.+)$/.exec(line);
    if (kv) current[kv[1]] = kv[2].trim();
  }
  return result.filter((s) => s.path);
}

/**
 * 探测一个仓库路径的 Git 形态。
 * - .git 为文件 → submodule（gitdir 指针）
 * - .git 为目录 → 独立普通仓
 * - 无 .git → 普通目录
 *
 * @param {string} absPath 仓库绝对路径
 * @returns {Promise<'submodule'|'repo'|'dir'>}
 */
export async function probeRepoKind(absPath) {
  const gitPath = join(absPath, '.git');
  let s;
  try {
    s = await stat(gitPath);
  } catch {
    return 'dir';
  }
  return s.isFile() ? 'submodule' : 'repo';
}

/**
 * 只读解析仓库 HEAD commit（纯文件读取，不执行 git 命令）。
 *
 * 支持两种形态：
 * - Submodule：.git 为文件（gitdir: ../.git/modules/<name>）
 * - 普通仓：.git 为目录
 *
 * 解析链：HEAD → ref: refs/heads/X → loose ref / packed-refs；detached HEAD 直接返回 hash。
 * 供 converge `submodule-pointer-aligned` 机检与 doctor 使用。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} repoPath 仓库相对路径（repositories.yaml path 字段）
 * @returns {Promise<string|null>} 40 位 commit hash；无法解析返回 null
 */
export async function resolveSubmoduleHead(workspaceRoot, repoPath) {
  const repoDir = join(workspaceRoot, repoPath);
  const dotGitPath = join(repoDir, '.git');
  let gitDir;
  try {
    const s = await stat(dotGitPath);
    if (s.isDirectory()) {
      gitDir = dotGitPath;
    } else {
      const raw = await readFile(dotGitPath, 'utf8');
      const m = /^\s*gitdir:\s*(.+)\s*$/.exec(raw);
      if (!m) return null;
      const target = m[1].trim();
      gitDir = isAbsolute(target) ? target : join(repoDir, target);
    }
  } catch {
    return null; // 无 .git（普通目录）或不可读
  }

  let head;
  try {
    head = (await readFile(join(gitDir, 'HEAD'), 'utf8')).trim();
  } catch {
    return null; // 仓库未初始化（gitdir 缺失）
  }

  const refMatch = /^ref:\s+(.+)$/.exec(head);
  if (!refMatch) {
    // detached HEAD：HEAD 直接是 commit hash
    return /^[0-9a-f]{40}$/i.test(head) ? head.toLowerCase() : null;
  }

  const ref = refMatch[1].trim();
  // loose ref：.git/refs/heads/X
  try {
    const loose = (await readFile(join(gitDir, ...ref.split('/')), 'utf8')).trim();
    if (/^[0-9a-f]{40}$/i.test(loose)) return loose.toLowerCase();
  } catch {
    // loose ref 缺失 → 回退 packed-refs
  }
  // packed-refs：<hash> <ref>
  try {
    const packed = await readFile(join(gitDir, 'packed-refs'), 'utf8');
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^([0-9a-f]{40})\\s+${escaped}\\s*$`, 'i');
    for (const line of packed.split(/\r?\n/)) {
      const m = re.exec(line.trim());
      if (m) return m[1].toLowerCase();
    }
  } catch {
    // packed-refs 也不存在
  }
  return null;
}

/**
 * 扫描 implementation/ 下各子目录的 Git 形态 + 与 .gitmodules 的对照。
 * 供 init 检测分支与 doctor 校验使用。
 *
 * @param {string} workspaceRoot
 * @param {string} [implDir='implementation']
 * @returns {Promise<Array<{id:string, path:string, kind:'submodule'|'repo'|'dir', inGitmodules:boolean}>>}
 */
export async function scanImplementationRepos(workspaceRoot, implDir = 'implementation') {
  const implPath = join(workspaceRoot, implDir);
  let entries;
  try {
    entries = await readdir(implPath, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }

  const submodules = await parseGitmodules(workspaceRoot);
  const subPaths = new Set(submodules.map((s) => s.path));

  const result = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'delivery') continue; // 单仓模式下 implementation 自身可能含 delivery
    const relPath = `${implDir}/${e.name}`;
    const kind = await probeRepoKind(join(implPath, e.name));
    result.push({ id: e.name, path: relPath, kind, inGitmodules: subPaths.has(relPath) });
  }
  return result;
}
