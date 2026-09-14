#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ACK_S = Number(process.env.DELY_ACK_S || 60);
const POLL_S = Number(process.env.DELY_POLL_S || 15);
const PROGRESS_S = Number(process.env.DELY_PROGRESS_S || 60);

function orca(args) {
  const bin = process.env.ORCA_CLI_COMMAND || "orca";
  const argv = /\.m?js$/i.test(bin) ? [bin, ...args, "--json"] : [...args, "--json"];
  const cmd = /\.m?js$/i.test(bin) ? process.execPath : bin;
  try {
    const out = execFileSync(cmd, argv, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 << 20,
      env: process.env,
    });
    return JSON.parse(out || "{}");
  } catch (e) {
    try {
      return JSON.parse(String(e.stdout || "{}"));
    } catch (_) {
      return { ok: false, error: { message: String((e.stderr || e.message || "").trim() || e) } };
    }
  }
}

function flags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      f[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }
  return f;
}

const AGENTS = {
  "Claude Code": "claude",
  "Codex CLI": "codex",
  "Cursor Agent CLI": "cursor",
  "GitHub Copilot CLI": "copilot",
  "Antigravity CLI": "antigravity",
  "Grok Build": "grok",
  "Kiro CLI": "kiro",
};

function pin(repo, phase) {
  const md = fs.readFileSync(path.join(repo, "AGENTS.md"), "utf8");
  const row = md.split("\n").find((l) => new RegExp("^\\|\\s*`?" + phase + "`?\\s*\\|").test(l));
  if (!row) throw new Error("no " + phase + " pin in AGENTS.md");
  const [, harness, model, effort] = row.split("|").slice(1).map((c) => c.trim().replace(/`/g, ""));
  if (!AGENTS[harness]) throw new Error("unknown harness " + harness);
  return { phase, agent: AGENTS[harness], model, effort };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const out = (line, code) => {
  console.log(typeof line === "string" ? line : JSON.stringify(line));
  if (code != null) process.exit(code);
};

function start(repo, run, p, spec, title) {
  const args = [
    "orchestration",
    "worker-start",
    "--spec",
    spec,
    "--worktree",
    "path:" + repo,
    "--run",
    run,
    "--agent",
    p.agent,
    "--task-title",
    title,
  ];
  if (["claude", "codex", "cursor"].includes(p.agent)) {
    if (p.model !== "default") args.push("--model", p.model);
    if (p.effort !== "default") args.push("--effort", p.effort);
  }
  const r = orca(args);
  const id = r.result && r.result.dispatchId;
  return id
    ? { id }
    : { error: (r.error && r.error.message) || String((r.result && r.result.failedStage) || "worker-start") };
}

function namesDispatch(m, id) {
  return JSON.stringify(m).includes(id);
}

function lastText(id) {
  const r = orca(["orchestration", "worker-read", "--dispatch", id, "--source", "auto", "--limit", "200"]);
  return JSON.stringify((r.result || {}).transcript || r.result || {}).replace(/\\n/g, " ").slice(-300);
}

function preflight(f) {
  const pins = ["implement", "review"].map((ph) => pin(f.repo, ph));
  const uniq = pins.filter(
    (p, i) => pins.findIndex((q) => q.agent === p.agent && q.model === p.model && q.effort === p.effort) === i
  );
  const spec =
    "Preflight only. Do not read, edit or run anything in the repository. Send a heartbeat with subject `ack`, then send worker_done --outcome succeeded with subject `preflight ok`, then stop.";
  const open = {};
  let failed = 0;
  for (const p of uniq) {
    const s = start(f.repo, f.run, p, spec, "preflight-" + p.phase);
    if (s.error) {
      out("PREFLIGHT " + p.phase + " " + p.agent + " FAIL start: " + s.error);
      failed++;
    } else open[s.id] = p;
  }
  const t0 = Date.now();
  while (Object.keys(open).length && Date.now() - t0 < ACK_S * 1000) {
    const r = orca([
      "orchestration",
      "check",
      "--wait",
      "--run",
      f.run,
      "--timeout-ms",
      String(Math.max(1, Math.floor(POLL_S * 1000))),
    ]);
    const res = r.result || {};
    if (!res.deliveryId) continue;
    for (const m of res.messages || []) {
      const hit = Object.keys(open).find((id) => m.type === "worker_done" && namesDispatch(m, id));
      if (hit) {
        out("PREFLIGHT " + open[hit].phase + " " + open[hit].agent + " PASS " + Math.round((Date.now() - t0) / 1000) + "s");
        orca(["orchestration", "worker-release", "--dispatch", hit]);
        delete open[hit];
      }
    }
    orca(["orchestration", "check", "--run", f.run, "--ack", res.deliveryId]);
  }
  for (const [id, p] of Object.entries(open)) {
    out("PREFLIGHT " + p.phase + " " + p.agent + " FAIL no worker_done in " + ACK_S + "s; last output: " + lastText(id));
    orca(["orchestration", "worker-stop", "--dispatch", id]);
    orca(["orchestration", "worker-release", "--dispatch", id]);
    failed++;
  }
  process.exit(failed ? 1 : 0);
}

function dispatch(f) {
  const p = pin(f.repo, f.phase);
  const spec =
    fs.readFileSync(path.resolve(f.repo, f["spec-file"]), "utf8") +
    "\n\nFirst action, before anything else: send a heartbeat with subject `ack`.";
  const s = start(f.repo, f.run, p, spec, f.phase);
  if (s.error) out("FAILED " + s.error, 5);
  const interval = Math.max(20, Math.min(5000, Math.floor(POLL_S * 1000)));
  for (const t0 = Date.now(); Date.now() - t0 < ACK_S * 1000; sleep(interval)) {
    const peek = orca(["orchestration", "check", "--peek", "--run", f.run]);
    if (((peek.result || {}).messages || []).some((m) => namesDispatch(m, s.id))) out("DISPATCHED " + s.id, 0);
  }
  const why = lastText(s.id);
  orca(["orchestration", "worker-stop", "--dispatch", s.id]);
  out("NO_ACK " + s.id + " stopped after " + ACK_S + "s; last output: " + why, 4);
}

function advance(track, id) {
  const t = track[id] || (track[id] = { cursor: null, at: Date.now() });
  for (let page = 0; page < 20; page++) {
    const args = ["orchestration", "worker-read", "--dispatch", id, "--source", "auto", "--limit", "200"];
    if (t.cursor) args.push("--cursor", t.cursor);
    const res = orca(args).result || {};
    const body = res.transcript || {};
    const n = body.returnedMessageCount || 0;
    if (n > 0 && t.cursor) t.at = Date.now();
    if (body.nextCursor) t.cursor = body.nextCursor;
    if (!body.limited) break;
  }
  return (Date.now() - t.at) / 60000;
}

function wait(f) {
  const deadline = Date.now() + Number(f["timeout-min"] || 60) * 60000;
  const stallMin = Number(f["stall-min"] || 10);
  const skip = String(f.skip || "").split(",").filter(Boolean);
  const as = f.as ? ["--terminal", f.as] : [];
  const track = {};
  let lastProgressCheck = 0;
  while (Date.now() < deadline) {
    const r = orca([
      "orchestration",
      "check",
      ...as,
      "--wait",
      "--run",
      f.run,
      "--timeout-ms",
      String(Math.max(1, Math.floor(POLL_S * 1000))),
    ]);
    if (r.ok === false) out("ERROR " + ((r.error && r.error.message) || "check failed"), 9);
    const res = r.result || {};
    if (res.deliveryId) {
      const msgs = res.messages || [];
      if (msgs.some((m) => ["worker_done", "escalation", "question"].includes(m.type))) {
        out(
          {
            SETTLED: res.deliveryId,
            messages: msgs.map((m) => ({
              id: m.id,
              type: m.type,
              from: m.from_handle,
              subject: m.subject,
              payload: m.payload,
            })),
          },
          0
        );
      }
      orca(["orchestration", "check", ...as, "--run", f.run, "--ack", res.deliveryId]);
      continue;
    }
    const rows = ((orca(["orchestration", "worker-list", "--run", f.run]).result || {}).workers || []).filter(
      (w) => !skip.includes(w.dispatchId)
    );
    const act = rows.filter(
      (w) => w.projection && (w.projection.attention || {}).requiresAction && w.dispatchStatus !== "dispatched"
    );
    if (act.length) {
      out(
        {
          ATTENTION: act.map((w) => ({
            dispatchId: w.dispatchId,
            liveness: w.projection.liveness,
            nextAction: w.projection.nextAction,
          })),
        },
        8
      );
    }
    if (Date.now() - lastProgressCheck < PROGRESS_S * 1000) continue;
    lastProgressCheck = Date.now();
    for (const w of rows.filter((w) => w.dispatchStatus === "dispatched")) {
      const idle = advance(track, w.dispatchId);
      if (idle >= stallMin) {
        out(
          "STALLED " +
            w.dispatchId +
            " no new output for " +
            Math.floor(idle) +
            " min; liveness " +
            JSON.stringify((w.projection || {}).liveness) +
            "; last output: " +
            lastText(w.dispatchId),
          6
        );
      }
    }
  }
  out("DEADLINE", 7);
}

function waitBg(f) {
  const me = process.env.ORCA_TERMINAL_HANDLE;
  if (!me) out("ERROR not inside an Orca terminal", 9);
  const file = path.resolve(f.out || ".dely-wait.out");
  const lock = file + ".lock";
  try {
    fs.writeFileSync(lock, String(Date.now()), { flag: "wx" });
  } catch (_) {
    if (Date.now() - Number(fs.readFileSync(lock, "utf8")) < 65 * 60000) {
      out("ALREADY_WAITING: a dely wait is running for this Run; end your turn, it will wake you.", 0);
    }
    fs.writeFileSync(lock, String(Date.now()));
  }
  try {
    fs.unlinkSync(file);
  } catch (_) {
    /* no prior output */
  }
  const self = JSON.stringify(__filename);
  const extra = ["skip", "stall-min", "timeout-min"]
    .filter((k) => f[k])
    .map((k) => " --" + k + " " + f[k])
    .join("");
  const cmd =
    "node " +
    self +
    " wait --run " +
    f.run +
    " --as " +
    me +
    extra +
    " > " +
    JSON.stringify(file) +
    " 2>&1; rm -f " +
    JSON.stringify(lock) +
    "; node " +
    self +
    " notify --run " +
    f.run +
    " --as " +
    me +
    " --out " +
    JSON.stringify(file) +
    "; exit";
  const r = orca(["terminal", "create", "--worktree", "path:" + process.cwd(), "--title", "dely-wait", "--command", cmd]);
  if (r.ok === false) {
    try {
      fs.unlinkSync(lock);
    } catch (_) {
      /* lock */
    }
    out("ERROR " + ((r.error && r.error.message) || "terminal create failed"), 9);
  }
  out("WAITING", 0);
}

function notify(f) {
  const run = (orca(["orchestration", "run-show", "--id", f.run]).result || {}).run || {};
  const to = run.coordinator_handle || f.as;
  orca([
    "terminal",
    "send",
    "--terminal",
    to,
    "--text",
    "dely wait finished for " + f.run + ". Finish your current step, then read " + f.out + " and continue.",
    "--enter",
  ]);
}

const [cmd, ...rest] = process.argv.slice(2);
const table = { preflight, dispatch, wait, "wait-bg": waitBg, notify };
if (table[cmd]) table[cmd](flags(rest));
else out("usage: dely preflight|dispatch|wait|wait-bg|notify", 2);
