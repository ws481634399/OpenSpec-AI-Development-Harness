// 交互式问答：收集 init 配置（@clack/prompts）
import * as p from '@clack/prompts';

/**
 * 取消处理：显示 cancel 并退出。
 */
function bail(message) {
  p.cancel(message);
  process.exit(1);
}

/**
 * 交互式收集 init 配置。
 *
 * 流程（对齐设计 §7.1 完整交互）：
 * 1. 项目名称（text，默认目录 basename）
 * 2. 项目类型（select: greenfield / brownfield）
 * 3. 代码是否已存在（confirm，仅 brownfield）
 * 4. 仓库模式（select: single / multi）
 * 5a. multi：循环输入 repo id + path（id 留空结束）
 * 5b. single + brownfield：代码路径（text，默认 implementation，允许任意路径）
 *
 * greenfield + single 固定 path=implementation，不问路径。
 *
 * @param {string} defaultName 默认项目名（目标目录 basename）
 * @returns {Promise<{name:string,type:string,mode:string,repos:Array<{id:string,path:string}>,shouldCreateImplementation:boolean,codeExists:boolean}>}
 */
export async function askInitConfig(defaultName) {
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

  // 5. repos
  let repos = [];
  if (mode === 'multi') {
    p.note('依次输入每个仓库的 id 与 path，id 留空结束。', '多仓配置');
    let i = 1;
    for (;;) {
      const id = await p.text({
        message: `仓库 ${i} id（留空结束）：`,
        placeholder: '如 backend',
      });
      if (p.isCancel(id)) bail('已取消');
      const idVal = (id || '').trim();
      if (!idVal) break;
      const path = await p.text({
        message: `仓库 ${idVal} path：`,
        defaultValue: `implementation/${idVal}`,
        placeholder: `implementation/${idVal}`,
      });
      if (p.isCancel(path)) bail('已取消');
      const pathVal = (path || '').trim() || `implementation/${idVal}`;
      repos.push({ id: idVal, path: pathVal });
      i++;
    }
    if (repos.length === 0) bail('多仓模式至少需要一个仓库');
  } else {
    // single
    let path = 'implementation';
    if (type === 'brownfield') {
      const cp = await p.text({
        message: '代码路径？',
        defaultValue: 'implementation',
        placeholder: 'implementation（可改为任意相对/绝对路径）',
      });
      if (p.isCancel(cp)) bail('已取消');
      path = (cp || '').trim() || 'implementation';
    }
    // greenfield + single 固定 implementation
    repos = [{ id: 'main', path }];
  }

  // 派生：是否需要创建 implementation/（任一 repo path 以 implementation 开头）
  const shouldCreateImplementation = repos.some(
    (r) => r.path === 'implementation' || r.path.startsWith('implementation/')
  );

  return { name: nameVal, type, mode, repos, shouldCreateImplementation, codeExists };
}
