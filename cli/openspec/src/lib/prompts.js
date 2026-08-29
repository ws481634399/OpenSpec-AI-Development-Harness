// 交互式问答：收集 init 配置（@clack/prompts）
import * as p from '@clack/prompts';
import { scanImplementationRepos } from '../../../../../core/sdd/git-submodule.js';

/**
 * 取消处理：显示 cancel 并退出。
 */
function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/**
 * 根据仓库模式自动生成默认仓库配置。
 *
 * single → 1 个仓库 main → implementation/
 * multi  → 2 个仓库 repo-1/repo-2 → implementation/repo-1, implementation/repo-2
 *
 * 用户不再需要手动输入仓库 id 和路径。
 *
 * @param {string} mode single / multi
 * @returns {Array<{id:string,path:string}>}
 */
function generateDefaultRepos(mode) {
  if (mode === 'multi') {
    return [
      { id: 'repo-1', path: 'implementation/repo-1' },
      { id: 'repo-2', path: 'implementation/repo-2' },
    ];
  }
  return [{ id: 'main', path: 'implementation' }];
}

/**
 * 交互式收集 init 配置。
 *
 * 流程（简化版，去掉仓库路径交互）：
 * 1. 项目名称（text，默认目录 basename）
 * 2. 项目类型（select: greenfield / brownfield）
 * 3. 代码是否已存在（confirm，仅 brownfield）
 * 4. 仓库模式（select: single / multi）
 *
 * 仓库 id 和路径自动生成，用户无需输入。
 * Phase 2.4（§5.3 init 与 Git 边界）：
 * - brownfield + multi + 检测到 implementation/ 下已有 Git 仓（submodule 或普通仓）
 *   → multiselect 采纳检测结果（含 git.submodule 标记；不猜 URL，不执行 git 操作）
 * - 检测失败/未检测到 → 走默认生成路径（repo-1/repo-2），后续可手动改 repositories.yaml
 *
 * @param {string} defaultName 默认项目名（目标目录 basename）
 * @param {string} [targetDir] 目标目录（brownfield 检测用）
 * @returns {Promise<{name:string,type:string,mode:string,repos:Array<{id:string,path:string,git?:{submodule?:boolean}}>,shouldCreateImplementation:boolean,codeExists:boolean,detectedRepos:number}>}
 */
export async function askInitConfig(defaultName, targetDir) {
  // 1. 项目名称
  const name = await p.text({
    message: '项目名称？',
    defaultValue: defaultName,
    placeholder: defaultName,
    validate: (v) => (v && v.trim().length === 0 ? '名称不能为空' : undefined),
  });
  if (p.isCancel(name)) bail('已取消');
  const nameVal = (name || '').trim() || defaultName;

  // 2. 项目类型
  const type = await p.select({
    message: '项目类型？',
    options: [
      { value: 'greenfield', label: '新项目 Greenfield', hint: '从零开始' },
      { value: 'brownfield', label: '已有项目 Brownfield', hint: '接入已有代码' },
    ],
  });
  if (p.isCancel(type)) bail('已取消');

  // 3. brownfield：代码是否已存在
  let codeExists = false;
  if (type === 'brownfield') {
    const ce = await p.confirm({
      message: '代码是否已存在于目标位置？',
      active: 'Yes',
      inactive: 'No',
      initialValue: true,
    });
    if (p.isCancel(ce)) bail('已取消');
    codeExists = ce;
  }

  // 4. 仓库模式
  const mode = await p.select({
    message: '仓库模式？',
    options: [
      { value: 'single', label: '单仓 Single', hint: '一个 Git 仓库' },
      { value: 'multi', label: '多仓 Multi', hint: '多个代码仓库' },
    ],
  });
  if (p.isCancel(mode)) bail('已取消');

  // 5. 自动生成仓库配置（用户无需输入 id 和路径）
  let repos = generateDefaultRepos(mode);
  let detectedRepos = 0;

  // Phase 2.4 §5.3：brownfield + multi → 检测 implementation/ 下已有 Git 仓，采纳为注册表
  if (type === 'brownfield' && codeExists && mode === 'multi' && targetDir) {
    try {
      const detected = await scanImplementationRepos(targetDir);
      const gitRepos = detected.filter((d) => d.kind !== 'dir');
      if (gitRepos.length > 0) {
        const chosen = await p.multiselect({
          message: `检测到 ${gitRepos.length} 个代码仓库，选择要注册的（不选则使用默认 repo-1/repo-2）`,
          options: gitRepos.map((d) => ({
            value: d,
            label: `${d.path}`,
            hint: d.kind === 'submodule' ? 'git submodule' : 'git repo',
          })),
          required: false,
        });
        if (!p.isCancel(chosen) && chosen.length > 0) {
          repos = chosen.map((d) => ({
            id: d.id,
            path: d.path,
            git: { submodule: d.kind === 'submodule' },
          }));
          detectedRepos = chosen.length;
        }
      }
    } catch {
      // 检测失败不影响 init（走默认生成路径）
    }
  }

  // 派生：是否需要创建 implementation/
  // greenfield → 创建；brownfield + 代码不存在 → 创建；brownfield + 代码已存在 → 不创建
  const shouldCreateImplementation = type === 'greenfield' || !codeExists;

  return { name: nameVal, type, mode, repos, shouldCreateImplementation, codeExists, detectedRepos };
}
