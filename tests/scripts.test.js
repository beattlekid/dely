"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DELY_JS = path.join(ROOT, "skills/delivery/scripts/dely.js");
const FAKE = path.join(ROOT, "tests/fixtures/fake-orca.js");

const DEFAULT_AGENTS = `# dely

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| \`implement\` | Cursor Agent CLI | cursor-grok-4.6-high | default |
| \`review\` | Claude Code | claude-opus-5 | medium |
`;

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dely-test-"));
}

function write(file, body) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  return fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function hasFlagPair(argv, a, b) {
  const i = argv.indexOf(a);
  return i >= 0 && argv[i + 1] === b;
}

function runDely(args, ctx, extraEnv) {
  extraEnv = extraEnv || {};
  const timeout = extraEnv.SPAWN_TIMEOUT_MS;
  const cwd = extraEnv.CWD || ctx.repo;
  const env = Object.assign({}, process.env, extraEnv, {
    ORCA_CLI_COMMAND: FAKE,
    FAKE_ORCA_SCENARIO: ctx.scenarioPath,
    FAKE_ORCA_LOG: ctx.logPath,
    FAKE_ORCA_STATE: ctx.statePath,
    HOME: ctx.home,
    DELY_POLL_S: extraEnv.DELY_POLL_S != null ? String(extraEnv.DELY_POLL_S) : "0.05",
    DELY_ACK_S: extraEnv.DELY_ACK_S != null ? String(extraEnv.DELY_ACK_S) : "1",
    DELY_PROGRESS_S: extraEnv.DELY_PROGRESS_S != null ? String(extraEnv.DELY_PROGRESS_S) : "0",
  });
  delete env.SPAWN_TIMEOUT_MS;
  delete env.CWD;
  return spawnSync(process.execPath, [DELY_JS, ...args], {
    encoding: "utf8",
    env,
    cwd,
    timeout,
  });
}

function setup(agents, scenarioFn) {
  const dir = tmpDir();
  const repo = fs.realpathSync(dir);
  write(path.join(repo, "AGENTS.md"), agents || DEFAULT_AGENTS);
  write(path.join(repo, "task.md"), "# task\n");
  const home = path.join(repo, "home");
  fs.mkdirSync(home, { recursive: true });
  const ctx = {
    repo,
    home,
    scenarioPath: path.join(repo, "scenario.json"),
    logPath: path.join(repo, "orca.log"),
    statePath: path.join(repo, "orca.state.json"),
  };
  const scenario = typeof scenarioFn === "function" ? scenarioFn(repo) : scenarioFn || {};
  write(ctx.scenarioPath, JSON.stringify(scenario, null, 2));
  return ctx;
}

function payload(id) {
  return JSON.stringify({ dispatchId: id, taskId: "task_1" });
}

function startArgv(log) {
  return log.find((argv) => argv[0] === "orchestration" && argv[1] === "worker-start");
}

function checks(log) {
  return log.filter((argv) => argv[0] === "orchestration" && argv[1] === "check");
}

function acks(log) {
  return checks(log).filter((argv) => argv.includes("--ack"));
}

test("1 pin argv: Copilot default omits flags; Claude default effort omits --effort", () => {
  const agents = `# dely

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| \`implement\` | GitHub Copilot CLI | default | default |
| \`review\` | Claude Code | claude-opus-5 | default |
`;
  const ctx = setup(agents, {
    workerStarts: [{ dispatchId: "ctx_ab12" }],
    peekMessages: [{ type: "heartbeat", subject: "ack", payload: payload("ctx_ab12") }],
  });
  const impl = runDely(
    ["dispatch", "--repo", ctx.repo, "--run", "run_1", "--phase", "implement", "--spec-file", "task.md"],
    ctx
  );
  assert.equal(impl.status, 0, impl.stderr + impl.stdout);
  const copilot = startArgv(readLog(ctx.logPath));
  assert.ok(copilot, "worker-start recorded");
  assert.equal(copilot.includes("--model"), false, "Copilot must not get --model");
  assert.equal(copilot.includes("--effort"), false, "Copilot must not get --effort");

  const ctx2 = setup(agents, {
    workerStarts: [{ dispatchId: "ctx_cd34" }],
    peekMessages: [{ type: "heartbeat", subject: "ack", payload: payload("ctx_cd34") }],
  });
  const rev = runDely(
    ["dispatch", "--repo", ctx2.repo, "--run", "run_1", "--phase", "review", "--spec-file", "task.md"],
    ctx2
  );
  assert.equal(rev.status, 0, rev.stderr + rev.stdout);
  const claude = startArgv(readLog(ctx2.logPath));
  assert.ok(hasFlagPair(claude, "--model", "claude-opus-5"));
  assert.equal(claude.includes("--effort"), false, "Claude default effort omits --effort");
});

test("1 pin fail-closed: non-default model on Copilot starts no worker", () => {
  const agents = `# dely

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| \`implement\` | GitHub Copilot CLI | gpt-4.1 | default |
| \`review\` | Claude Code | claude-opus-5 | default |
`;
  const ctx = setup(agents, {
    workerStarts: [{ dispatchId: "ctx_ab12" }],
    peekMessages: [{ type: "heartbeat", subject: "ack", payload: payload("ctx_ab12") }],
  });
  const r = runDely(
    ["dispatch", "--repo", ctx.repo, "--run", "run_1", "--phase", "implement", "--spec-file", "task.md"],
    ctx
  );
  assert.equal(r.status, 5, r.stdout);
  assert.match(
    r.stdout,
    /FAILED pin implement copilot: Orca cannot pin this model; write default and set the model in Orca's agent default arguments/
  );
  assert.equal(readLog(ctx.logPath).filter((argv) => argv[1] === "worker-start").length, 0);
});

test("1 pin fail-closed: effort without model starts no worker", () => {
  const agents = `# dely

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| \`implement\` | Cursor Agent CLI | default | high |
| \`review\` | Claude Code | default | medium |
`;
  const ctx = setup(agents, {
    workerStarts: [{ dispatchId: "ctx_ab12" }],
    peekMessages: [{ type: "heartbeat", subject: "ack", payload: payload("ctx_ab12") }],
  });
  const impl = runDely(
    ["dispatch", "--repo", ctx.repo, "--run", "run_1", "--phase", "implement", "--spec-file", "task.md"],
    ctx
  );
  assert.equal(impl.status, 5, impl.stdout);
  assert.match(impl.stdout, /FAILED pin implement cursor: --effort requires --model/);
  assert.equal(readLog(ctx.logPath).filter((argv) => argv[1] === "worker-start").length, 0);

  const pf = setup(agents, {
    workerStarts: [{ dispatchId: "ctx_aa11" }, { dispatchId: "ctx_bb22" }],
  });
  const pre = runDely(["preflight", "--repo", pf.repo, "--run", "run_1"], pf);
  assert.equal(pre.status, 1, pre.stdout);
  assert.match(pre.stdout, /PREFLIGHT implement cursor FAIL pin implement cursor: --effort requires --model/);
  assert.match(pre.stdout, /PREFLIGHT review claude FAIL pin review claude: --effort requires --model/);
  assert.equal(readLog(pf.logPath).filter((argv) => argv[1] === "worker-start").length, 0);
});

test("1 preflight fail-closed: Copilot non-default model starts no worker", () => {
  const agents = `# dely

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| \`implement\` | GitHub Copilot CLI | gpt-4.1 | high |
| \`review\` | GitHub Copilot CLI | gpt-4.1 | default |
`;
  const ctx = setup(agents, {
    workerStarts: [{ dispatchId: "ctx_aa11" }, { dispatchId: "ctx_bb22" }],
  });
  const r = runDely(["preflight", "--repo", ctx.repo, "--run", "run_1"], ctx);
  assert.equal(r.status, 1, r.stdout);
  assert.match(
    r.stdout,
    /PREFLIGHT implement copilot FAIL pin implement copilot: Orca cannot pin this model; write default and set the model in Orca's agent default arguments/
  );
  assert.equal(readLog(ctx.logPath).filter((argv) => argv[1] === "worker-start").length, 0);
});

test("2 ACK matches its own dispatch: foreign heartbeat is NO_ACK and worker-stop", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workerStarts: [{ dispatchId: "ctx_ab12" }],
    peekMessages: [{ type: "heartbeat", subject: "ack", payload: payload("ctx_ffff") }],
  });
  const r = runDely(
    ["dispatch", "--repo", ctx.repo, "--run", "run_1", "--phase", "implement", "--spec-file", "task.md"],
    ctx,
    { DELY_ACK_S: "1" }
  );
  assert.equal(r.status, 4, r.stdout);
  assert.match(r.stdout, /NO_ACK ctx_ab12/);
  const log = readLog(ctx.logPath);
  assert.ok(
    log.some((argv) => argv[0] === "orchestration" && argv[1] === "worker-stop" && hasFlagPair(argv, "--dispatch", "ctx_ab12"))
  );
  assert.ok(
    log.some((argv) => argv[0] === "orchestration" && argv[1] === "worker-release" && hasFlagPair(argv, "--dispatch", "ctx_ab12")),
    "NO_ACK must also worker-release"
  );
});

test("3 settling batch left unacked", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    deliveries: [
      {
        deliveryId: "dv_mix",
        messages: [
          { type: "heartbeat", subject: "ack", payload: payload("ctx_ab12") },
          { type: "worker_done", subject: "done", payload: payload("ctx_ab12") },
        ],
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--timeout-min", "0.05"], ctx, { SPAWN_TIMEOUT_MS: 15000 });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /SETTLED/);
  assert.match(r.stdout, /dv_mix/);
  assert.match(r.stdout, /heartbeat/);
  assert.match(r.stdout, /worker_done/);
  assert.equal(acks(readLog(ctx.logPath)).length, 0, "settling batch must not be acked");
});

test("3 question-only batch SETTLED unacked", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    deliveries: [
      {
        deliveryId: "dv_q",
        messages: [{ type: "question", subject: "ask", payload: payload("ctx_ab12") }],
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--timeout-min", "0.05"], ctx, { SPAWN_TIMEOUT_MS: 15000 });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /SETTLED/);
  assert.match(r.stdout, /dv_q/);
  assert.match(r.stdout, /question/);
  assert.equal(acks(readLog(ctx.logPath)).length, 0, "question batch must not be acked");
});

test("3 escalation-only batch SETTLED unacked", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    deliveries: [
      {
        deliveryId: "dv_esc",
        messages: [{ type: "escalation", subject: "blocked", payload: payload("ctx_ab12") }],
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--timeout-min", "0.05"], ctx, { SPAWN_TIMEOUT_MS: 15000 });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /SETTLED/);
  assert.match(r.stdout, /dv_esc/);
  assert.match(r.stdout, /escalation/);
  assert.equal(acks(readLog(ctx.logPath)).length, 0, "escalation batch must not be acked");
});

test("3 non-settling batch acked then SETTLED", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    deliveries: [
      {
        deliveryId: "dv_hb",
        messages: [{ type: "heartbeat", subject: "ack", payload: payload("ctx_ab12") }],
      },
      {
        deliveryId: "dv_done",
        messages: [{ type: "worker_done", subject: "done", payload: payload("ctx_ab12") }],
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--timeout-min", "0.08"], ctx, { SPAWN_TIMEOUT_MS: 15000 });
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /SETTLED/);
  assert.match(r.stdout, /dv_done/);
  const ackFlags = acks(readLog(ctx.logPath)).map((argv) => argv[argv.indexOf("--ack") + 1]);
  assert.deepEqual(ackFlags, ["dv_hb"]);
});

test("4 ATTENTION on a failed row", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_dead",
        dispatchStatus: "failed",
        projection: {
          attention: { requiresAction: true },
          liveness: { verdict: "exited" },
          nextAction: { kind: "release", argv: ["orchestration", "worker-release", "--dispatch", "ctx_dead"] },
        },
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--timeout-min", "0.2"], ctx);
  assert.equal(r.status, 8, r.stdout);
  assert.match(r.stdout, /ATTENTION/);
  assert.match(r.stdout, /ctx_dead/);
  assert.match(r.stdout, /exited/);
  assert.match(r.stdout, /worker-release/);
});

test("4 no ATTENTION noise: completed and dispatched unverifiable with nextAction none keep waiting", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_done",
        dispatchStatus: "completed",
        projection: {
          attention: { requiresAction: true },
          liveness: { verdict: "unverifiable" },
          nextAction: { kind: "none", argv: [] },
        },
      },
      {
        dispatchId: "ctx_live",
        dispatchStatus: "dispatched",
        projection: {
          attention: { requiresAction: true },
          liveness: { verdict: "unverifiable" },
          nextAction: { kind: "none", argv: [] },
        },
      },
      {
        dispatchId: "ctx_skip",
        dispatchStatus: "failed",
        projection: {
          attention: { requiresAction: true },
          liveness: { verdict: "exited" },
          nextAction: { kind: "release", argv: ["orchestration", "worker-release"] },
        },
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--skip", "ctx_skip", "--timeout-min", "0.05", "--stall-min", "10"], ctx, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(r.status, 7, r.stdout);
  assert.match(r.stdout, /DEADLINE/);
  assert.equal(/ATTENTION/.test(r.stdout), false);
});

test("5 STALLED when cursor is unchanged; advancing cursor is not STALLED", () => {
  const stalled = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_idle",
        dispatchStatus: "dispatched",
        projection: {
          attention: { requiresAction: false },
          liveness: { verdict: "live" },
          nextAction: null,
        },
      },
    ],
    workerRead: { nextCursor: "c0", limited: false, returnedMessageCount: 0 },
  });
  const red = runDely(["wait", "--run", "run_1", "--stall-min", "0.02", "--timeout-min", "0.15"], stalled, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(red.status, 6, red.stdout);
  assert.match(red.stdout, /STALLED/);
  assert.match(red.stdout, /ctx_idle/);

  const moving = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_busy",
        dispatchStatus: "dispatched",
        projection: {
          attention: { requiresAction: false },
          liveness: { verdict: "live" },
          nextAction: null,
        },
      },
    ],
    workerRead: { advance: true },
  });
  const green = runDely(["wait", "--run", "run_1", "--stall-min", "0.02", "--timeout-min", "0.08"], moving, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(green.status, 7, green.stdout);
  assert.match(green.stdout, /DEADLINE/);
  assert.equal(/STALLED/.test(green.stdout), false);

  const termPage = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_term",
        dispatchStatus: "dispatched",
        projection: {
          attention: { requiresAction: false },
          liveness: { verdict: "live" },
          nextAction: null,
        },
      },
    ],
    workerRead: { terminalAdvance: true },
  });
  const term = runDely(["wait", "--run", "run_1", "--stall-min", "0.02", "--timeout-min", "0.08"], termPage, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(term.status, 7, term.stdout);
  assert.match(term.stdout, /DEADLINE/);
  assert.equal(/STALLED/.test(term.stdout), false, "terminal latestCursor progress must not stall");
});

test("5 STALLED names worker-read error for an open dispatch", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_idle",
        dispatchStatus: "dispatched",
        projection: {
          attention: { requiresAction: false },
          liveness: { verdict: "live" },
          nextAction: { kind: "none", argv: [] },
        },
      },
    ],
    workerRead: { error: "worker_identity_changed" },
  });
  const r = runDely(["wait", "--run", "run_1", "--stall-min", "0.02", "--timeout-min", "0.15"], ctx, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(r.status, 6, r.stdout);
  assert.match(r.stdout, /STALLED ctx_idle/);
  assert.match(r.stdout, /worker_identity_changed/);
  assert.equal(/no new output/.test(r.stdout), false);
});

test("5 stall detection ignores non-dispatched rows", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_done",
        dispatchStatus: "completed",
        projection: {
          attention: { requiresAction: true },
          liveness: { verdict: "exited" },
          nextAction: { kind: "none", argv: [] },
        },
      },
    ],
    workerRead: { nextCursor: "c0", limited: false, returnedMessageCount: 0 },
  });
  const r = runDely(["wait", "--run", "run_1", "--stall-min", "0.02", "--timeout-min", "0.15"], ctx, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(r.status, 7, r.stdout);
  assert.match(r.stdout, /DEADLINE/);
  assert.equal(/STALLED/.test(r.stdout), false, "completed rows must not stall");
  assert.equal(
    readLog(ctx.logPath).filter((argv) => argv[0] === "orchestration" && argv[1] === "worker-read").length,
    0,
    "must not worker-read a non-dispatched row"
  );
});

test("5 advance stops paging on a 0-row limited page", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workers: [
      {
        dispatchId: "ctx_idle",
        dispatchStatus: "dispatched",
        projection: {
          attention: { requiresAction: false },
          liveness: { verdict: "live" },
          nextAction: { kind: "none", argv: [] },
        },
      },
    ],
    workerRead: { nextCursor: "c0", limited: true, returnedMessageCount: 0 },
  });
  const r = runDely(["wait", "--run", "run_1", "--stall-min", "0.02", "--timeout-min", "0.12"], ctx, {
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(r.status, 6, r.stdout);
  assert.match(r.stdout, /STALLED ctx_idle/);
  const log = readLog(ctx.logPath);
  const reads = log.filter((argv) => argv[0] === "orchestration" && argv[1] === "worker-read");
  const cycles = log.filter((argv) => argv[0] === "orchestration" && argv[1] === "worker-list").length;
  assert.ok(reads.length > 0, "must read the open dispatch");
  assert.ok(cycles > 0, "must list workers each progress cycle");
  const per = reads.length / cycles;
  assert.ok(per <= 2, "reads per progress cycle must be ≤ 2, got " + per + " (" + reads.length + "/" + cycles + ")");
});

test("6 waiter names Control: wait --as records --terminal on check", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    deliveries: [
      {
        deliveryId: "dv_done",
        messages: [{ type: "worker_done", payload: payload("ctx_ab12") }],
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--as", "term_x"], ctx);
  assert.equal(r.status, 0, r.stdout);
  const waitChecks = checks(readLog(ctx.logPath));
  assert.ok(waitChecks.length);
  for (const argv of waitChecks) {
    assert.ok(hasFlagPair(argv, "--terminal", "term_x"), String(argv));
  }
});

test("7 one waiter: live recorded terminal is ALREADY_WAITING; missing terminal is stale", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    terminals: [{ handle: "term_w" }],
    terminalHandle: "term_w",
  });
  const outFile = path.join(ctx.repo, "wait.out");
  const lock = outFile + ".lock";
  write(lock, JSON.stringify({ terminal: "term_w" }));
  const fresh = runDely(["wait-bg", "--run", "run_1", "--out", outFile], ctx, {
    ORCA_TERMINAL_HANDLE: "term_ctrl",
  });
  assert.match(fresh.stdout, /ALREADY_WAITING/);
  const afterFresh = readLog(ctx.logPath).filter((argv) => argv[0] === "terminal" && argv[1] === "create");
  assert.equal(afterFresh.length, 0);
  assert.ok(
    readLog(ctx.logPath).some((argv) => argv[0] === "terminal" && argv[1] === "list"),
    "must consult terminal list"
  );

  const ctxDead = setup(DEFAULT_AGENTS, {
    terminals: [{ handle: "term_other" }],
    terminalHandle: "term_w",
  });
  const outDead = path.join(ctxDead.repo, "wait.out");
  const lockDead = outDead + ".lock";
  write(lockDead, JSON.stringify({ terminal: "term_dead" }));
  const stale = runDely(["wait-bg", "--run", "run_1", "--out", outDead], ctxDead, {
    ORCA_TERMINAL_HANDLE: "term_ctrl",
  });
  assert.match(stale.stdout, /^WAITING\b/m);
  assert.equal(/ALREADY_WAITING/.test(stale.stdout), false);
  const created = readLog(ctxDead.logPath).filter((argv) => argv[0] === "terminal" && argv[1] === "create");
  assert.equal(created.length, 1);
  assert.ok(fs.readFileSync(lockDead, "utf8").includes("term_w"), "lock must record the new waiter handle");
});

test("7 wait-bg records the created terminal handle in the lock", () => {
  const ctx = setup(DEFAULT_AGENTS, { terminalHandle: "term_wait1" });
  const outFile = path.join(ctx.repo, "wait.out");
  const lock = outFile + ".lock";
  const r = runDely(["wait-bg", "--run", "run_1", "--out", outFile], ctx, {
    ORCA_TERMINAL_HANDLE: "term_ctrl",
  });
  assert.match(r.stdout, /^WAITING\b/m);
  const body = JSON.parse(fs.readFileSync(lock, "utf8"));
  assert.equal(body.terminal, "term_wait1");
});

test("7 wait-bg uses execPath and quotes run id, handle and skip", () => {
  const ctx = setup(DEFAULT_AGENTS, {});
  const outFile = path.join(ctx.repo, "wait.out");
  const r = runDely(["wait-bg", "--run", "run_1", "--out", outFile, "--skip", "ctx_a,ctx_b"], ctx, {
    ORCA_TERMINAL_HANDLE: "term_ctrl",
  });
  assert.match(r.stdout, /^WAITING\b/m);
  const created = readLog(ctx.logPath).find((argv) => argv[0] === "terminal" && argv[1] === "create");
  assert.ok(created, "terminal create recorded");
  const cmd = created[created.indexOf("--command") + 1];
  const q = JSON.stringify;
  assert.ok(cmd.startsWith(q(process.execPath) + " "), cmd);
  assert.ok(cmd.includes(" wait --run " + q("run_1") + " "), cmd);
  assert.ok(cmd.includes(" --as " + q("term_ctrl")), cmd);
  assert.ok(cmd.includes(" --skip " + q("ctx_a,ctx_b")), cmd);
});

test("8 wake target: notify uses run-show coordinator_handle, not --as", () => {
  const ctx = setup(DEFAULT_AGENTS, { coordinatorHandle: "term_new" });
  const outFile = path.join(ctx.repo, "wait.out");
  const r = runDely(["notify", "--run", "run_1", "--as", "term_old", "--out", outFile], ctx);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const sent = readLog(ctx.logPath).find((argv) => argv[0] === "terminal" && argv[1] === "send");
  assert.ok(sent, "terminal send recorded");
  assert.ok(hasFlagPair(sent, "--terminal", "term_new"));
  assert.equal(sent.includes("term_old"), false);
  assert.ok(sent.includes("--enter"));
  assert.ok(String(sent).includes(outFile));
});

test("9 preflight: two pins PASS+FAIL exit 1; identical pins start one worker", () => {
  const two = setup(DEFAULT_AGENTS, {
    workerStarts: [{ dispatchId: "ctx_aa11" }, { dispatchId: "ctx_bb22" }],
    deliveries: [
      {
        deliveryId: "dv_pf",
        messages: [{ type: "worker_done", payload: payload("ctx_aa11") }],
      },
    ],
    workers: [
      { dispatchId: "ctx_aa11", dispatchStatus: "dispatched", projection: {} },
      { dispatchId: "ctx_bb22", dispatchStatus: "dispatched", projection: {} },
    ],
  });
  const mixed = runDely(["preflight", "--repo", two.repo, "--run", "run_1"], two, {
    DELY_ACK_S: "1",
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(mixed.status, 1, mixed.stdout);
  assert.match(mixed.stdout, /PREFLIGHT implement cursor PASS /);
  assert.match(mixed.stdout, /PREFLIGHT review claude FAIL /);
  const log = readLog(two.logPath);
  assert.ok(log.some((argv) => argv[1] === "worker-stop" && hasFlagPair(argv, "--dispatch", "ctx_bb22")));
  assert.ok(log.some((argv) => argv[1] === "worker-release" && hasFlagPair(argv, "--dispatch", "ctx_bb22")));
  assert.ok(log.some((argv) => argv[1] === "worker-release" && hasFlagPair(argv, "--dispatch", "ctx_aa11")));

  const sameAgents = `# dely

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| \`implement\` | Cursor Agent CLI | cursor-grok-4.6-high | default |
| \`review\` | Cursor Agent CLI | cursor-grok-4.6-high | default |
`;
  const same = setup(sameAgents, {
    workerStarts: [{ dispatchId: "ctx_cc33" }],
    deliveries: [
      {
        deliveryId: "dv_one",
        messages: [{ type: "worker_done", payload: payload("ctx_cc33") }],
      },
    ],
  });
  const one = runDely(["preflight", "--repo", same.repo, "--run", "run_1"], same);
  assert.equal(one.status, 0, one.stdout);
  const starts = readLog(same.logPath).filter((argv) => argv[1] === "worker-start");
  assert.equal(starts.length, 1);
});

test("9 preflight reports a failing check instead of spinning", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    workerStarts: [{ dispatchId: "ctx_aa11" }, { dispatchId: "ctx_bb22" }],
    checkError: "a waiter is already active on this Run",
  });
  const r = runDely(["preflight", "--repo", ctx.repo, "--run", "run_1"], ctx, {
    DELY_ACK_S: "2",
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /PREFLIGHT implement cursor FAIL a waiter is already active on this Run/);
  assert.match(r.stdout, /PREFLIGHT review claude FAIL a waiter is already active on this Run/);
  assert.equal(/no worker_done/.test(r.stdout), false);
  const log = readLog(ctx.logPath);
  const checksOnly = log.filter((argv) => argv[0] === "orchestration" && argv[1] === "check");
  assert.ok(checksOnly.length < 10, "must not spin on a failing check: " + checksOnly.length);
  assert.ok(log.some((argv) => argv[1] === "worker-stop" && hasFlagPair(argv, "--dispatch", "ctx_aa11")));
  assert.ok(log.some((argv) => argv[1] === "worker-stop" && hasFlagPair(argv, "--dispatch", "ctx_bb22")));
  assert.ok(log.some((argv) => argv[1] === "worker-release" && hasFlagPair(argv, "--dispatch", "ctx_aa11")));
  assert.ok(log.some((argv) => argv[1] === "worker-release" && hasFlagPair(argv, "--dispatch", "ctx_bb22")));
});

test("preflight without required flags prints usage and exits 2", () => {
  const ctx = setup();
  const bare = runDely(["preflight"], ctx);
  assert.equal(bare.status, 2, bare.stderr + bare.stdout);
  assert.match(bare.stdout, /^usage:/);
  assert.equal(/ERR_INVALID_ARG_TYPE/.test(bare.stderr + bare.stdout), false);
  assert.equal(/TypeError/.test(bare.stderr + bare.stdout), false);

  const noRun = runDely(["preflight", "--repo", ctx.repo], ctx);
  assert.equal(noRun.status, 2, noRun.stderr + noRun.stdout);
  assert.match(noRun.stdout, /^usage:/);
  assert.equal(/FAIL start:/.test(noRun.stdout), false);
  assert.equal(readLog(ctx.logPath).filter((argv) => argv[1] === "worker-start").length, 0);
});

test("7 wait-bg default output lives under os.tmpdir keyed by run id", () => {
  const ctx = setup(DEFAULT_AGENTS, { terminalHandle: "term_w" });
  const r = runDely(["wait-bg", "--run", "run_xyz"], ctx, {
    ORCA_TERMINAL_HANDLE: "term_ctrl",
  });
  assert.match(r.stdout, /^WAITING\b/m);
  assert.equal(fs.existsSync(path.join(ctx.repo, ".dely-wait.out")), false);
  assert.equal(fs.existsSync(path.join(ctx.repo, ".dely-wait.out.lock")), false);
  const created = readLog(ctx.logPath).find((argv) => argv[0] === "terminal" && argv[1] === "create");
  assert.ok(created, "terminal create recorded");
  const cmd = created[created.indexOf("--command") + 1];
  const expected = path.join(os.tmpdir(), "dely-wait-run_xyz.out");
  assert.ok(cmd.includes(JSON.stringify(expected)), cmd);
  assert.ok(cmd.includes("notify --run " + JSON.stringify("run_xyz")), cmd);
  assert.ok(cmd.includes(" --out " + JSON.stringify(expected)), cmd);
});

test("7 wait-bg lock vanished between wx and read does not throw", () => {
  const ctx = setup(DEFAULT_AGENTS, { terminalHandle: "term_w" });
  const outFile = path.join(ctx.repo, "wait.out");
  const lock = outFile + ".lock";
  fs.mkdirSync(lock);
  const r = runDely(["wait-bg", "--run", "run_1", "--out", outFile], ctx, {
    ORCA_TERMINAL_HANDLE: "term_ctrl",
  });
  assert.equal(/EISDIR/.test(r.stderr), false, r.stderr);
  assert.equal(/ENOENT/.test(r.stderr), false, r.stderr);
  assert.equal(/Error:/.test(r.stderr), false, r.stderr);
  assert.match(r.stdout, /WAITING|ALREADY_WAITING|ERROR/);
});

test("flags() does not take a following --flag as a value", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    deliveries: [
      {
        deliveryId: "dv_done",
        messages: [{ type: "worker_done", payload: payload("ctx_ab12") }],
      },
    ],
  });
  const r = runDely(["wait", "--run", "run_1", "--skip", "--as", "term_x"], ctx);
  assert.equal(r.status, 0, r.stdout);
  const waitChecks = checks(readLog(ctx.logPath));
  assert.ok(waitChecks.length);
  for (const argv of waitChecks) {
    assert.ok(hasFlagPair(argv, "--terminal", "term_x"), String(argv));
    assert.equal(hasFlagPair(argv, "--terminal", "--skip"), false);
  }
});

test("8 notify retries --enter after a block clears and never sends without it", () => {
  const ctx = setup(DEFAULT_AGENTS, {
    coordinatorHandle: "term_new",
    sendEnterBlocked: true,
    sendEnterBlockedUntil: 1,
  });
  const outFile = path.join(ctx.repo, "wait.out");
  const line = "dely wait finished for run_1. Finish your current step, then read " + outFile + " and continue.";
  const r = runDely(["notify", "--run", "run_1", "--as", "term_old", "--out", outFile], ctx, {
    DELY_NOTIFY_RETRY_S: "0.05",
    DELY_NOTIFY_GIVEUP_S: "2",
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const sends = readLog(ctx.logPath).filter((argv) => argv[0] === "terminal" && argv[1] === "send");
  const withoutEnter = sends.filter((argv) => !argv.includes("--enter"));
  assert.equal(withoutEnter.length, 0, "must never send without --enter: " + JSON.stringify(sends));
  assert.equal(
    sends.some((argv) => hasFlagPair(argv, "--text", "\r")),
    false,
    "must never send a bare CR: " + JSON.stringify(sends)
  );
  const afterClear = sends.filter((argv) => argv.includes("--enter") && hasFlagPair(argv, "--text", line));
  assert.equal(afterClear.length, 2, "one blocked --enter then one after clear: " + JSON.stringify(sends));
});

test("8 notify gives up on a lasting block and never sends without --enter", () => {
  const ctx = setup(DEFAULT_AGENTS, { coordinatorHandle: "term_new", sendEnterBlocked: true });
  const outFile = path.join(ctx.repo, "wait.out");
  const r = runDely(["notify", "--run", "run_1", "--as", "term_old", "--out", outFile], ctx, {
    DELY_NOTIFY_RETRY_S: "0.05",
    DELY_NOTIFY_GIVEUP_S: "0.15",
    SPAWN_TIMEOUT_MS: 15000,
  });
  assert.notEqual(r.status, 0, "give-up must exit non-zero: " + r.stderr + r.stdout);
  const sends = readLog(ctx.logPath).filter((argv) => argv[0] === "terminal" && argv[1] === "send");
  assert.ok(sends.length >= 1, JSON.stringify(sends));
  for (const argv of sends) {
    assert.ok(argv.includes("--enter"), "must never send without --enter: " + JSON.stringify(argv));
    assert.equal(hasFlagPair(argv, "--text", "\r"), false, JSON.stringify(argv));
  }
});

test("8 notify falls back from a non-numeric retry interval and still gives up", () => {
  const ctx = setup(DEFAULT_AGENTS, { coordinatorHandle: "term_new", sendEnterBlocked: true });
  const outFile = path.join(ctx.repo, "wait.out");
  const t0 = Date.now();
  const r = runDely(["notify", "--run", "run_1", "--as", "term_old", "--out", outFile], ctx, {
    DELY_NOTIFY_RETRY_S: "abc",
    DELY_NOTIFY_GIVEUP_S: "0.15",
    SPAWN_TIMEOUT_MS: 5000,
  });
  const elapsed = Date.now() - t0;
  assert.notEqual(r.status, null, "must not hang on NaN retry: " + ((r.error && r.error.code) || r.stderr));
  assert.notEqual(r.status, 0, "give-up must exit non-zero: " + r.stderr + r.stdout);
  assert.ok(elapsed < 4000, "must exit within the scaled give-up, not the default retry: " + elapsed + "ms");
});
