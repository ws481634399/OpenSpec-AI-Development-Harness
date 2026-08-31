// Unit tests: Phase 2.5 DU Implementation Guidance（phase-2.5-du-implementation-guidance-design.md）
// 覆盖：metadata v0.2 guidance 段 / --complexity 联动 / du-guidance 机检 / materialize 渲染
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { runInit } from "../core/workspace/workspace-initializer.js";
import {
  runChangeCreate,
  readMetadata,
  bindFeaturePath,
} from "../core/sdd/change-model.js";
import {
  writeWorkspaceDu,
  materializeDeliveryUnit,
  DU_COMPLEXITY_TRIGGERS,
} from "../core/sdd/delivery-unit.js";
import { runMachineGate } from "../core/sdd/gate-validator.js";
import { getHarnessRoot } from "../core/workspace/harness-root.js";
import { parse } from "yaml";

const rmrf = (p) => rm(p, { recursive: true, force: true });
const harnessRoot = getHarnessRoot();

const FP = {
  "level-1": { id: "FEAT-001", name: "用户中心" },
  "level-2": { id: "FEAT-001-01", name: "账户能力" },
  "level-3": { id: "FEAT-001-01-01", name: "用户认证" },
  story: { id: "STORY-001-01-01-01", name: "用户注册" },
  candidate: false,
};

async function setupWorkspace() {
  const tmp = await mkdtemp(join(tmpdir(), "du-guidance-"));
  await runInit(
    {
      name: "du-guidance-test",
      type: "greenfield",
      mode: "multi",
      repos: [
        { id: "backend", path: "implementation/backend" },
        { id: "frontend", path: "implementation/frontend" },
      ],
      shouldCreateImplementation: true,
      force: false,
    },
    tmp,
    harnessRoot,
  );
  return tmp;
}

async function setupChange(tmp) {
  const { id, changeDir } = await runChangeCreate(
    tmp,
    {
      title: "DU Guidance 测试",
      requirement: "REQ-DUG",
      repositories: ["backend"],
    },
    harnessRoot,
  );
  await bindFeaturePath(changeDir, FP);
  const meta = await readMetadata(changeDir);
  return { changeId: id, changeDir, meta };
}

const gateOf = (artifact, check) => ({ artifact, "machine-checks": [check] });

// Phase 3.5 修订：绑定后产物落 STORY 目录（纯业务名段）
const STORY = ["用户中心", "账户能力", "用户认证", "用户注册"];
const seedStory = async (changeDir, rel, content) => {
  await mkdir(join(changeDir, ...STORY, rel, ".."), { recursive: true });
  await writeFile(join(changeDir, ...STORY, rel), content, "utf8");
};

/** 构造含单个 DU 小节的 tasks.md 正文（字段可覆盖）。 */
function duSection(fields) {
  return [
    "### DU-BE-001: 注册服务后端",
    "",
    "- 目标仓库: backend",
    "- 目标 Goal: 注册 API",
    "- Scope（范围）: services/auth/",
    "- Design References: design.md §2",
    "- Dependencies: 无",
    "- Acceptance Criteria: 201",
    "- Execution Order: 1",
    "- Parallelization: 组 A",
    ...fields,
  ].join("\n");
}

const FULL_FIELDS = [
  "- Implementation Sketch:",
  "  ```text",
  "  Controller → Service → Repository",
  "  ```",
  "- Pseudocode:",
  "  ```text",
  "  register(request):",
  "      existing = userRepository.findByEmail(request.email)",
  "      if existing exists: throw EmailAlreadyRegistered",
  "      userRepository.save(user)",
  "  ```",
  "- Verification: Unit（重复邮箱分支）；Integration（201/409）",
];

// ---- metadata v0.2：implementation-guidance 段 ----

test("writeWorkspaceDu 默认写入 guidance 段（sketch=true, pseudocode=false, trigger=[]）", async (t) => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  const raw = await readFile(
    join(
      changeDir,
      "用户中心",
      "账户能力",
      "用户认证",
      "用户注册",
      "DU-BE-001",
      "metadata.yaml",
    ),
    "utf8",
  );
  const m = parse(raw);
  assert.equal(m["implementation-guidance"].sketch, true);
  assert.equal(m["implementation-guidance"].pseudocode, false);
  assert.deepEqual(m["implementation-guidance"]["complexity-trigger"], []);
  await rmrf(tmp);
});

test("writeWorkspaceDu 传 complexityTrigger → pseudocode 自动 true；非法 trigger 过滤", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
    complexityTrigger: ["business-flow", "bad-trigger"],
  });
  const raw = await readFile(
    join(
      changeDir,
      "用户中心",
      "账户能力",
      "用户认证",
      "用户注册",
      "DU-BE-001",
      "metadata.yaml",
    ),
    "utf8",
  );
  const m = parse(raw);
  assert.equal(m["implementation-guidance"].pseudocode, true);
  assert.deepEqual(m["implementation-guidance"]["complexity-trigger"], [
    "business-flow",
  ]);
  await rmrf(tmp);
});

test("writeWorkspaceDu 显式 pseudocode=false 覆盖 trigger 联动", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
    pseudocode: false,
    complexityTrigger: ["algorithm"],
  });
  const raw = await readFile(
    join(
      changeDir,
      "用户中心",
      "账户能力",
      "用户认证",
      "用户注册",
      "DU-BE-001",
      "metadata.yaml",
    ),
    "utf8",
  );
  const m = parse(raw);
  assert.equal(m["implementation-guidance"].pseudocode, false);
  assert.deepEqual(m["implementation-guidance"]["complexity-trigger"], [
    "algorithm",
  ]);
  await rmrf(tmp);
});

test("DU_COMPLEXITY_TRIGGERS 为四枚举", () => {
  assert.deepEqual([...DU_COMPLEXITY_TRIGGERS].sort(), [
    "algorithm",
    "business-flow",
    "orchestration",
    "state-transition",
  ]);
});

// ---- du-guidance 机检 ----

test("Gate: du-guidance 完整 DU 小节 → passed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
    complexityTrigger: ["business-flow"],
  });
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection(FULL_FIELDS),
    "utf8",
  );
  const r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.equal(r.passed, true, r.issues.join("; "));
  await rmrf(tmp);
});

test("Gate: du-guidance 未命中触发器 → N/A + 理由 passed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: 复用现有 CI workflow，仅新增 lint job 节点",
      "- Pseudocode: N/A（纯配置变更，无业务流程/算法/状态转换/编排）",
      "- Verification: CI pipeline 全绿",
    ]),
    "utf8",
  );
  const r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.equal(r.passed, true, r.issues.join("; "));
  await rmrf(tmp);
});

test("Gate: du-guidance Sketch 为空/占位符 → failed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  // 空 Sketch
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch:",
      "- Pseudocode: N/A（配置变更）",
      "- Verification: CI 全绿",
    ]),
    "utf8",
  );
  let r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("DU-BE-001 Implementation Sketch 为空")),
    r.issues.join("; "),
  );
  // 占位符 Sketch
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: {{sketch}}",
      "- Pseudocode: N/A（配置变更）",
      "- Verification: CI 全绿",
    ]),
    "utf8",
  );
  r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("Implementation Sketch 为空或含占位符")),
    r.issues.join("; "),
  );
  await rmrf(tmp);
});

test("Gate: du-guidance pseudocode=true 但 N/A → failed；TBD → failed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
    complexityTrigger: ["business-flow"],
  });
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: Controller → Service",
      "- Pseudocode: N/A（不想写）",
      "- Verification: 全绿",
    ]),
    "utf8",
  );
  let r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) =>
      i.includes("声明 pseudocode: true 但 Pseudocode 为空/占位符/N/A"),
    ),
    r.issues.join("; "),
  );

  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: Controller → Service",
      "- Pseudocode: TBD",
      "- Verification: 全绿",
    ]),
    "utf8",
  );
  r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) =>
      i.includes("声明 pseudocode: true 但 Pseudocode 为空/占位符/N/A"),
    ),
    r.issues.join("; "),
  );
  await rmrf(tmp);
});

test("Gate: du-guidance pseudocode=false 但 Pseudocode 空 → failed；N/A 无理由 → failed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  // 空
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: Controller → Service",
      "- Pseudocode:",
      "- Verification: 全绿",
    ]),
    "utf8",
  );
  let r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("Pseudocode 为空")),
    r.issues.join("; "),
  );
  // N/A 无理由
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: Controller → Service",
      "- Pseudocode: N/A",
      "- Verification: 全绿",
    ]),
    "utf8",
  );
  r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("N/A 但未附理由")),
    r.issues.join("; "),
  );
  await rmrf(tmp);
});

test("Gate: du-guidance Verification 空 → failed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection([
      "- Implementation Sketch: Controller → Service",
      "- Pseudocode: N/A（配置变更）",
      "- Verification:",
    ]),
    "utf8",
  );
  const r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("Verification 为空")),
    r.issues.join("; "),
  );
  await rmrf(tmp);
});

test("Gate: du-guidance metadata 缺 guidance 段（v0.1 旧文件）→ failed；非法 trigger → failed", async () => {
  const tmp = await setupWorkspace();
  const { changeId, changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  // 手工退化为 v0.1（删掉 guidance 段）
  const duMetaPath = join(
    changeDir,
    "用户中心",
    "账户能力",
    "用户认证",
    "用户注册",
    "DU-BE-001",
    "metadata.yaml",
  );
  const raw = await readFile(duMetaPath, "utf8");
  const v1 = raw
    .split("\n")
    .filter(
      (l) =>
        !l.includes("implementation-guidance") &&
        !l.includes("sketch:") &&
        !l.includes("pseudocode:") &&
        !l.includes("complexity-trigger:"),
    )
    .join("\n");
  await writeFile(duMetaPath, v1, "utf8");
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    duSection(FULL_FIELDS),
    "utf8",
  );
  let r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("缺少 implementation-guidance 段")),
    r.issues.join("; "),
  );

  // 非法 trigger
  await writeWorkspaceDu(changeDir, await readMetadata(changeDir), {
    id: "DU-BE-001",
    repository: "backend",
    complexityTrigger: ["business-flow"],
  });
  const doc = await readFile(duMetaPath, "utf8");
  await writeFile(
    duMetaPath,
    doc.replace(
      "complexity-trigger:\n    - business-flow",
      "complexity-trigger:\n    - bad-trigger",
    ),
    "utf8",
  );
  r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.ok(
    r.issues.some((i) => i.includes("complexity-trigger 非法值")),
    r.issues.join("; "),
  );
  await rmrf(tmp);
});

test("Gate: du-guidance tasks.md 无 DU 小节 → failed", async () => {
  const tmp = await setupWorkspace();
  const { changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
  });
  await writeFile(
    join(changeDir, ...STORY, "tasks.md"),
    "# Tasks\n\n（DU 稍后补充）",
    "utf8",
  );
  const r = await runMachineGate(changeDir, gateOf("tasks.md", "du-guidance"));
  assert.equal(r.passed, false);
  assert.ok(
    r.issues.some((i) => i.includes("无对应小节")),
    r.issues.join("; "),
  );
  await rmrf(tmp);
});

// ---- materialize 渲染 ----

test("materialize: repo metadata 复制 guidance 段；task.md 9 节 + pseudocode 提示；implementation.md 含 Deviations", async () => {
  const tmp = await setupWorkspace();
  const { changeId, changeDir, meta } = await setupChange(tmp);
  await writeWorkspaceDu(changeDir, meta, {
    id: "DU-BE-001",
    repository: "backend",
    scope: ["s"],
    acceptance: ["a"],
    complexityTrigger: ["business-flow", "state-transition"],
  });
  await materializeDeliveryUnit(tmp, changeId, "DU-BE-001");

  const repoDuDir = join(
    tmp,
    "implementation",
    "backend",
    "delivery",
    changeId,
    "用户中心",
    "账户能力",
    "用户认证",
    "用户注册",
    "DU-BE-001",
  );
  const rm2 = parse(await readFile(join(repoDuDir, "metadata.yaml"), "utf8"));
  assert.equal(rm2["implementation-guidance"].pseudocode, true);
  assert.deepEqual(rm2["implementation-guidance"]["complexity-trigger"], [
    "business-flow",
    "state-transition",
  ]);

  const taskMd = await readFile(join(repoDuDir, "task.md"), "utf8");
  for (const sec of [
    "## 1. Goal",
    "## 2. Repository",
    "## 3. Scope",
    "## 4. Design References",
    "## 5. Dependencies",
    "## 6. Acceptance Criteria",
    "## 7. Implementation Sketch",
    "## 8. Pseudocode",
    "## 9. Verification",
  ]) {
    assert.ok(taskMd.includes(sec), `task.md 缺少 ${sec}`);
  }
  assert.ok(
    taskMd.includes(
      "必填（complexity-trigger: business-flow, state-transition）",
    ),
    taskMd,
  );
  assert.ok(!taskMd.includes("{{pseudocode-required}}"));

  const implMd = await readFile(join(repoDuDir, "implementation.md"), "utf8");
  assert.ok(implMd.includes("## Deviations"));
  assert.ok(implMd.includes("原 DU 建议"));

  // 未命中触发器 → task.md 提示为条件必填
  await writeWorkspaceDu(changeDir, await readMetadata(changeDir), {
    id: "DU-BE-001",
    repository: "backend",
    scope: ["s"],
    acceptance: ["a"],
  });
  await materializeDeliveryUnit(tmp, changeId, "DU-BE-001");
  const taskMd2 = await readFile(join(repoDuDir, "task.md"), "utf8");
  assert.ok(
    taskMd2.includes(
      "Pseudocode 条件必填（本 DU 未声明触发器，未命中时写 N/A + 理由）",
    ),
    taskMd2,
  );
  await rmrf(tmp);
});
