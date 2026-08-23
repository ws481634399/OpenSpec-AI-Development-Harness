// WorkspaceValidator：自检 结构/字段/版本一致性（后续 openspec doctor 内核）
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

/**
 * 对目标 Workspace 执行轻量自检。
 *
 * 检查项：
 * - .sdd/ 含 workspace/repositories/context-rules/version.yaml + README.md
 * - standards/ product/ delivery/ skills/ 四世界目录存在
 * - workspace.yaml.name/type 非空
 * - repositories.yaml.mode 合法、repositories ≥ 1、每项有 id+path
 * - version.yaml.harness.version === 期望值
 *
 * @param {string} targetDir 目标项目目录
 * @param {string} expectedHarnessVersion 期望的 Harness 版本（读自 .version）
 * @returns {{ ok: boolean, issues: string[] }}
 */
export function runSelfCheck(targetDir, expectedHarnessVersion) {
  const issues = [];
  const must = (cond, msg) => {
    if (!cond) issues.push(msg);
  };

  // .sdd 必备文件
  const sddFiles = [
    'workspace.yaml',
    'repositories.yaml',
    'context-rules.yaml',
    'version.yaml',
    'README.md',
  ];
  for (const f of sddFiles) {
    must(existsSync(join(targetDir, '.sdd', f)), `.sdd/${f} missing`);
  }

  // 四世界目录
  for (const w of ['standards', 'product', 'delivery', 'skills']) {
    must(existsSync(join(targetDir, w)), `${w}/ missing`);
  }

  // workspace.yaml 字段
  const wsPath = join(targetDir, '.sdd', 'workspace.yaml');
  if (existsSync(wsPath)) {
    const ws = parse(readFileSync(wsPath, 'utf8'));
    must(ws?.workspace?.name, 'workspace.yaml: name empty');
    must(ws?.workspace?.type, 'workspace.yaml: type empty');
  }

  // repositories.yaml 字段
  const reposPath = join(targetDir, '.sdd', 'repositories.yaml');
  if (existsSync(reposPath)) {
    const repos = parse(readFileSync(reposPath, 'utf8'));
    must(
      ['single', 'multi'].includes(repos?.mode),
      `repositories.yaml: mode invalid (${repos?.mode})`
    );
    must(
      Array.isArray(repos?.repositories) && repos.repositories.length >= 1,
      'repositories.yaml: repositories < 1'
    );
    if (Array.isArray(repos?.repositories)) {
      repos.repositories.forEach((r, i) => {
        must(r?.id, `repositories[${i}].id empty`);
        must(r?.path, `repositories[${i}].path empty`);
      });
    }
  }

  // version.yaml 版本一致性
  const vPath = join(targetDir, '.sdd', 'version.yaml');
  if (existsSync(vPath)) {
    const v = parse(readFileSync(vPath, 'utf8'));
    must(
      v?.harness?.version === expectedHarnessVersion,
      `version.yaml: harness.version mismatch (expected ${expectedHarnessVersion}, got ${v?.harness?.version})`
    );
  }

  return { ok: issues.length === 0, issues };
}
