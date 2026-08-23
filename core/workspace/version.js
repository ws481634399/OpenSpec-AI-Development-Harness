// VersionReader：读取 Harness 根目录下 .version 文件，返回版本字符串
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const VERSION_RE = /^\d+\.\d+\.\d+/;

/**
 * 读取 Harness 版本号（Major.Minor.Patch）。
 *
 * .version 文件首行是版本号，其后为说明文字（如"说明：当前 Harness 自身版本"）。
 * 因此只取首行首 token，避免把说明文字当作版本。
 *
 * @param {string} harnessRoot Harness 仓库根目录绝对路径
 * @returns {string} 版本字符串，如 "0.1.0"
 * @throws {Error} 若 .version 不存在或格式不符 Major.Minor.Patch
 */
export function readHarnessVersion(harnessRoot) {
  const versionPath = resolve(harnessRoot, '.version');
  const content = readFileSync(versionPath, 'utf8');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const token = firstLine.trim().split(/\s+/)[0];
  if (!VERSION_RE.test(token)) {
    throw new Error(
      `Invalid .version format: expected Major.Minor.Patch, got "${token}" at ${versionPath}`
    );
  }
  return token;
}
