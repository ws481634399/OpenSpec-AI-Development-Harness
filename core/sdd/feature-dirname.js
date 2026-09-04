// FeatureDirname：目录段清洗（Phase 3.8 精简 → v0.4 去锚点）
//
// 职责收敛：
// - featureDirSeg：纯名字段生成（被 CHG 骨架 / features 派生缓存共用）
//
// v0.4 去锚点：早期版本的 findNodeDirByAnchor / syncNodeDirName（CHG 骨架 README
// front-matter id 锚点 rename 同步）已移除——3-tier 模式产物在 stories/<STORY-ID>/
// （ID 目录与业务名解耦），骨架四级目录为空，rename 无产物可迁。树改名后旧名空
// 目录残留由 doctor 报告清理。

const MAX_SEG_LEN = 50;

/**
 * 生成四级目录中的一个段（纯名字模式）。
 * 非法字符（Windows 文件名限制 + 控制符）替换为 '-'；超长截断；清洗后为空回退 ID。
 *
 * @param {string} id 节点 ID（回退用）
 * @param {string} name 业务名
 * @returns {string}
 */
export function featureDirSeg(id, name) {
  const cleaned = String(name || '')
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, MAX_SEG_LEN)
    .replace(/[. ]+$/, '');
  return cleaned || String(id || 'NODE');
}
