// KnowledgeReverser：旧项目接入骨架（Phase 1 无 LLM）
// 扫描 implementation/ 目录树 → 创建 reverse CHG → 生成 instruction.md 指导外部 Agent 执行知识提取
//
// Phase 1 定位：为外部 Agent 产出 Reverse Instruction，不做代码语义分析（需 LLM，Phase 2+）
// 与 7 Skill 的 invocation 模式一致：Skill 不调模型，外部 Agent 按 instruction 执行

import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { runChangeCreate } from './change-model.js';

// 语言/框架推断：文件扩展名 → 语言标签
const EXT_MAP = {
  '.js': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.ts': 'TypeScript',
  '.jsx': 'React (JSX)', '.tsx': 'React (TSX)',
  '.vue': 'Vue',
  '.py': 'Python',
  '.java': 'Java', '.kt': 'Kotlin', '.scala': 'Scala',
  '.go': 'Go',
  '.rs': 'Rust',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.cs': 'C#', '.cpp': 'C++', '.c': 'C',
  '.swift': 'Swift',
  '.dart': 'Dart',
  '.sql': 'SQL',
  '.sh': 'Shell', '.bash': 'Shell',
};

// 框架标记文件：文件名 → 框架标签
const MARKER_FILES = {
  'package.json': 'Node.js / npm',
  'pom.xml': 'Java / Maven',
  'build.gradle': 'Java / Gradle',
  'go.mod': 'Go Module',
  'Cargo.toml': 'Rust / Cargo',
  'requirements.txt': 'Python / pip',
  'pyproject.toml': 'Python / pyproject',
  'Gemfile': 'Ruby / Bundler',
  'composer.json': 'PHP / Composer',
  'pubspec.yaml': 'Dart / pub',
};

/**
 * 扫描目录树，收集文件列表 + 语言统计。
 * 限制深度避免超大仓库卡死，限制文件数 500。
 *
 * @param {string} dir 起始目录
 * @param {number} [maxDepth] 最大深度，默认 5
 * @returns {Promise<{files:Array<string>, languages:object, markers:Array<string>, total:number, truncated:boolean}>}
 */
export async function scanImplementation(dir, maxDepth = 5) {
  const files = [];
  const languages = {};
  const markers = [];
  let total = 0;
  let truncated = false;
  const LIMIT = 500;

  async function walk(currentDir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      // 跳过 .git / node_modules / target / build / dist
      if (e.isDirectory() && ['.git', 'node_modules', 'target', 'build', 'dist', '__pycache__'].includes(e.name)) {
        continue;
      }
      const fullPath = join(currentDir, e.name);
      const relPath = relative(dir, fullPath);

      if (e.isDirectory()) {
        await walk(fullPath, depth + 1);
      } else if (e.isFile()) {
        total++;
        if (files.length < LIMIT) {
          files.push(relPath);
        } else {
          truncated = true;
        }

        // 语言推断
        const ext = extname(e.name).toLowerCase();
        if (EXT_MAP[ext]) {
          const lang = EXT_MAP[ext];
          languages[lang] = (languages[lang] || 0) + 1;
        }

        // 框架标记文件
        if (MARKER_FILES[e.name]) {
          markers.push(`${e.name} (${MARKER_FILES[e.name]})`);
        }
      }
    }
  }

  await walk(dir, 0);

  return { files, languages, markers, total, truncated };
}

/**
 * 生成 instruction.md 内容。
 * @param {object} scanResult scanImplementation 返回值
 * @param {string} changeId CHG-XXXX
 * @param {string} workspaceRoot
 * @returns {string}
 */
function buildInstruction(scanResult, changeId, workspaceRoot) {
  const langList = Object.entries(scanResult.languages)
    .sort((a, b) => b[1] - a[1])
    .map(([lang, count]) => `- ${lang}: ${count} files`)
    .join('\n');

  const fileList = scanResult.files.slice(0, 100).map((f) => `  ${f}`).join('\n');
  const truncationNote = scanResult.truncated
    ? `\n  ...（共 ${scanResult.total} 个文件，仅展示前 100）`
    : '';

  const markers = scanResult.markers.length > 0
    ? scanResult.markers.map((m) => `- ${m}`).join('\n')
    : '(未检测到标记文件)';

  return `# Knowledge Reverse Instruction

> Change: ${changeId}
> Workspace: ${workspaceRoot}

## 目标

扫描 implementation/ 下的现有代码，提取项目知识，写入 SDD 知识体系。

## 扫描结果摘要

### 语言/技术栈
${langList || '(未检测到代码文件)'}

### 框架标记
${markers}

### 文件清单（前 100）
${fileList}${truncationNote}

## 执行步骤

### 1. 扫描代码
阅读 implementation/ 下的核心代码文件，理解：
- 项目架构（单体/微服务/前后端分离）
- 核心业务领域
- 技术栈与依赖关系
- 数据模型与 API 设计

### 2. 写入 standards/
将长期技术规则写入 \`standards/\`（子目录制，禁止写 standards/ 根下）：
- 通用工程规则 → \`standards/engineering/\`（优先合并已有文件：coding-standard.md / api-standard.md / database-standard.md / testing-standard.md / architecture-principles.md / git-conventions.md / security-guidelines.md）
- 项目专属规则 → \`standards/project/<topic>.md\`
- \`standards/sdd/\` 由 Harness 维护，不写入

### 3. 写入 product/
将业务能力写入 \`product/\`：
- 核心业务领域
- 产品功能模块
- 业务流程描述
- Feature Tree 更新

### 4. 写入 delivery/archive/
将本次 reverse 的报告写入 CHG 目录：
- \`${changeId}/reverse-report.md\`：扫描总结 + 知识提取清单

## 完成后

运行以下命令归档：
\`\`\`
openspec change archive ${changeId}
\`\`\`
`;
}

/**
 * 执行 Knowledge Reverse 骨架流程。
 *
 * @param {string} workspaceRoot Workspace 根目录
 * @param {string} harnessRoot Harness 根目录
 * @param {object} [opts] { title?: string }
 * @returns {Promise<{changeId:string, changeDir:string, instructionPath:string, scanResult:object}>}
 */
export async function runReverse(workspaceRoot, harnessRoot, opts = {}) {
  const title = opts.title || 'Knowledge Reverse — 旧项目知识接入';

  // 1. 扫描 implementation/
  const implDir = join(workspaceRoot, 'implementation');
  let scanResult;
  try {
    await stat(implDir);
    scanResult = await scanImplementation(implDir);
  } catch {
    throw new Error(
      "implementation/ not found. Knowledge Reverse requires an existing codebase. Place code in implementation/ first."
    );
  }

  if (scanResult.total === 0) {
    throw new Error('implementation/ is empty. Nothing to reverse.');
  }

  // 2. 创建 reverse CHG
  const { id, changeDir } = await runChangeCreate(
    workspaceRoot,
    { title, requirement: 'REVERSE', repositories: [] },
    harnessRoot
  );

  // 3. 生成 instruction.md
  const instructionContent = buildInstruction(scanResult, id, workspaceRoot);
  const instructionPath = join(changeDir, 'instruction.md');
  await writeFile(instructionPath, instructionContent, 'utf8');

  return { changeId: id, changeDir, instructionPath, scanResult };
}
