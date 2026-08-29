// ConfigWriter：yaml Document API 保留注释改写 workspace/repositories/version
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

/**
 * 生成 .sdd/workspace.yaml。
 * 读模板 workspace.yaml（保留注释）→ 填 name/type/harness.version → 写入目标。
 *
 * @param {string} templateDir 模板根目录
 * @param {string} targetDir 目标目录
 * @param {object} config { name, type }
 * @param {string} harnessVersion Harness 版本字符串
 */
export function writeWorkspaceYaml(templateDir, targetDir, config, harnessVersion) {
  const src = join(templateDir, '.sdd', 'workspace.yaml');
  const doc = parseDocument(readFileSync(src, 'utf8'));
  doc.setIn(['workspace', 'name'], config.name);
  doc.setIn(['workspace', 'type'], config.type);
  doc.setIn(['workspace', 'harness', 'version'], harnessVersion);
  writeFileSync(join(targetDir, '.sdd', 'workspace.yaml'), doc.toString(), 'utf8');
}

/**
 * 生成 .sdd/repositories.yaml。
 * single 模式逐字段改写（保留模板项注释）；multi 模式替换整个数组。
 * Phase 2.4：repo 条目支持 git.submodule 标记（brownfield 检测写入）。
 *
 * @param {string} templateDir 模板根目录
 * @param {string} targetDir 目标目录
 * @param {object} config { mode, repos: [{id, path, git?: {submodule?: boolean}}] }
 */
export function writeRepositoriesYaml(templateDir, targetDir, config) {
  const src = join(templateDir, '.sdd', 'repositories.yaml');
  const doc = parseDocument(readFileSync(src, 'utf8'));
  doc.setIn(['mode'], config.mode);

  if (config.mode === 'single') {
    const repo = config.repos[0];
    // 模板已有一项（id:main/path:implementation），逐字段改写以保留项注释
    doc.setIn(['repositories', 0, 'id'], repo.id);
    doc.setIn(['repositories', 0, 'path'], repo.path);
    if (repo.git) doc.setIn(['repositories', 0, 'git'], repo.git);
  } else {
    // multi：替换整个数组（项注释丢失可接受，multi 为用户自定义）
    doc.setIn(
      ['repositories'],
      config.repos.map((r) => (r.git ? { id: r.id, path: r.path, git: r.git } : { id: r.id, path: r.path }))
    );
  }

  writeFileSync(join(targetDir, '.sdd', 'repositories.yaml'), doc.toString(), 'utf8');
}

/**
 * 修补 .sdd/version.yaml 的 harness.version（防 Harness 升级后与模板版本漂移）。
 * workspace-template.version 与 schema.version 保持模板原值不动。
 *
 * 前置：TemplateCopier 已把模板 version.yaml 复制到 target/.sdd/version.yaml。
 *
 * @param {string} targetDir 目标目录
 * @param {string} harnessVersion Harness 版本字符串
 */
export function patchVersionYaml(targetDir, harnessVersion) {
  const out = join(targetDir, '.sdd', 'version.yaml');
  const doc = parseDocument(readFileSync(out, 'utf8'));
  doc.setIn(['harness', 'version'], harnessVersion);
  writeFileSync(out, doc.toString(), 'utf8');
}
