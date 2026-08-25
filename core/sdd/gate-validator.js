// GateValidator：Machine Gate 确定性校验（纯函数，仅依赖 node:fs/promises）
// 对齐 phase-1.5-workflow-engine-design.md §9
//
// 仅做机器能可靠判断的校验，不做 AI 语义评分
// 不扫描 Artifact 全文 - [ ] checkbox（区分 Gate Checklist vs Domain Checklist，见 §9.2）
// 只检查 gate.yaml machine-checks 显式声明的项

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './artifact-hash.js';
import { readGateResult } from './gate-repository.js';

/**
 * 执行 Machine Gate 确定性校验。
 *
 * @param {string} changeDir CHG 目录绝对路径
 * @param {object} gateConfig gate.yaml 解析结果
 * @param {object} [opts] { metadata } 可选注入 metadata（避免重复读）
 * @returns {Promise<{passed:boolean, issues:string[], artifactHash:string}>}
 *   artifactHash 为空字符串表示 Artifact 文件不存在
 */
export async function runMachineGate(changeDir, gateConfig, opts = {}) {
  const issues = [];
  const artifactName = gateConfig.artifact;
  const artifactPath = join(changeDir, artifactName);

  // 读取 Artifact 内容
  let content;
  try {
    content = await readFile(artifactPath, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') {
      return {
        passed: false,
        issues: [`Artifact not found: ${artifactName}`],
        artifactHash: '',
      };
    }
    throw e;
  }

  const artifactHash = sha256(content);
  const checks = gateConfig['machine-checks'] || [];

  for (const check of checks) {
    switch (check) {
      case 'required-front-matter':
        checkRequiredFrontMatter(content, gateConfig['required-front-matter'] || [], issues, artifactName);
        break;
      case 'no-placeholder':
        checkNoPlaceholder(content, gateConfig['required-replacements'] || [], issues, artifactName);
        break;
      case 'required-sections':
        checkRequiredSections(content, gateConfig['non-empty-ai-sections'] || [], issues, artifactName);
        break;
      case 'cross-reference-valid':
        await checkCrossReference(content, changeDir, issues, artifactName);
        break;
      case 'repositories-match-metadata':
        await checkRepositoriesMatch(changeDir, content, opts.metadata, issues, artifactName);
        break;
      case 'all-predecessors-accepted':
        await checkAllPredecessorsAccepted(changeDir, issues, artifactName);
        break;
      default:
        // 未知 check 不抛错（向前兼容，未来 gate.yaml 可声明新 check 而旧 validator 不破）
        break;
    }
  }

  return { passed: issues.length === 0, issues, artifactHash };
}

// ---- 各 check 实现 ----

function checkRequiredFrontMatter(content, requiredFields, issues, artifactName) {
  if (requiredFields.length === 0) return;
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    issues.push(`${artifactName}: front-matter 缺失，但 required-front-matter 声明了 ${requiredFields.join(', ')}`);
    return;
  }
  for (const field of requiredFields) {
    const re = new RegExp(`^${field}:\\s*\\S`, 'm');
    if (!re.test(fmMatch[1])) {
      issues.push(`${artifactName}: required-front-matter 字段为空或缺失: ${field}`);
    }
  }
}

function checkNoPlaceholder(content, requiredReplacements, issues, artifactName) {
  // 去掉 front-matter 后检查正文
  const body = content.replace(/^---\n[\s\S]*?\n---/, '');
  for (const placeholder of requiredReplacements) {
    const token = `{{${placeholder}}}`;
    if (body.includes(token)) {
      issues.push(`${artifactName}: 占位符未替换: ${token}`);
    }
  }
}

function checkRequiredSections(content, sections, issues, artifactName) {
  for (const section of sections) {
    // section 形如 "## 1. 背景"
    const re = new RegExp(`^${escapeRegex(section)}[ \\t]*$`, 'm');
    const match = content.match(re);
    if (!match) {
      issues.push(`${artifactName}: 缺少必需 section: ${section}`);
      continue;
    }
    // 检查标题下有非注释内容（到下一个 ## 或 ### 标题前）
    const afterSection = content.slice(match.index + match[0].length);
    if (!hasNonCommentContent(afterSection)) {
      issues.push(`${artifactName}: section 内容为空或仅注释: ${section}`);
    }
  }
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasNonCommentContent(text) {
  // 去掉 HTML 注释块
  const stripped = text.replace(/<!--[\s\S]*?-->/g, '');
  // 找到下一个 ## 或 ### 标题前的内容
  const nextSection = stripped.match(/^#{2,3}\s/m);
  const segment = nextSection ? stripped.slice(0, nextSection.index) : stripped;
  // 过滤空行
  const lines = segment.split('\n').filter((l) => l.trim());
  return lines.length > 0;
}

async function checkCrossReference(content, changeDir, issues, artifactName) {
  // v0.1：检查正文中所有 CHG-XXXX/<file>.md 引用的文件存在
  // 占位符已替换后正文会包含 "CHG-0001/prd.md" 这类引用
  const refMatches = content.match(/CHG-\d+\/[\w/.-]+\.md/g) || [];
  const seen = new Set();
  for (const ref of refMatches) {
    if (seen.has(ref)) continue;
    seen.add(ref);
    // 提取文件名部分（CHG-0001/prd.md → prd.md；CHG-0001/evidence/test-report.md → evidence/test-report.md）
    const fileName = ref.split('/').slice(1).join('/');
    const refPath = join(changeDir, fileName);
    try {
      await readFile(refPath, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') {
        issues.push(`${artifactName}: cross-reference 引用文件不存在: ${ref} (期望路径: ${refPath})`);
      }
    }
  }
}

async function checkRepositoriesMatch(changeDir, content, metadata, issues, artifactName) {
  // 从正文中提取 "repos-involved: a, b, c" 形式的字段
  const meta = metadata || (await readMetadataInline(changeDir));
  const m = content.match(/^repos-involved[:\s]+([^\n]*)/m);
  if (!m) return; // artifact 不含此字段，跳过
  const inArtifact = m[1].split(',').map((s) => s.trim()).filter(Boolean);
  const inMeta = meta.repositories || [];
  for (const r of inArtifact) {
    if (!inMeta.includes(r)) {
      issues.push(`${artifactName}: repositories 与 metadata 不匹配: artifact 含 ${r}，metadata.repositories 不含`);
    }
  }
}

async function readMetadataInline(changeDir) {
  const { readMetadata } = await import('./change-model.js');
  return readMetadata(changeDir);
}

async function checkAllPredecessorsAccepted(changeDir, issues, artifactName) {
  // sdd-converge 专用：检查前序所有 artifact accepted（§15.1）
  const predecessors = [
    'exploration.md',
    'prd.md',
    'design.md',
    'tasks.md',
    'implementation.md',
    'evidence/test-report.md',
  ];
  for (const name of predecessors) {
    const r = await readGateResult(changeDir, name);
    if (r.status !== 'accepted') {
      issues.push(`${artifactName}: 前序 artifact 未 accepted: ${name} (status: ${r.status})`);
    }
  }
}
