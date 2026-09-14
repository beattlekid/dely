#!/usr/bin/env node
"use strict";

const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ACK_S = Number(process.env.DELY_ACK_S || 60);
const POLL_S = Number(process.env.DELY_POLL_S || 15);
const PROGRESS_S = Number(process.env.DELY_PROGRESS_S || 60);
const seconds = (v, d) => (Number.isFinite(+v) && +v > 0 ? +v : d);
const PREFLIGHT_S = seconds(process.env.DELY_PREFLIGHT_S, 150);
const NOTIFY_RETRY_S = seconds(process.env.DELY_NOTIFY_RETRY_S, 30);
const NOTIFY_GIVEUP_S = seconds(process.env.DELY_NOTIFY_GIVEUP_S, 1800);

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
      const n = argv[i + 1];
      if (n != null && !String(n).startsWith("--")) {
        f[argv[i].slice(2)] = n;
        i++;
      } else {
        f[argv[i].slice(2)] = true;
      }
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

function pinWhy(p) {
  const can = ["claude", "codex", "cursor"].includes(p.agent);
  if (!can && p.model !== "default") {
    return (
      "pin " +
      p.phase +
      " " +
      p.agent +
      ": Orca cannot pin this model; write default and set the model in Orca's agent default arguments"
    );
  }
  if (p.effort !== "default" && p.model === "default") {
    return "pin " + p.phase + " " + p.agent + ": --effort requires --model";
  }
  return null;
}

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

function clip(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(-300);
}

function messageText(m) {
  if (m == null) return "";
  if (typeof m === "string") return m;
  const blocks = Array.isArray(m.blocks) ? m.blocks : [];
  let last = "";
  let toolOut = "";
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text" && typeof b.text === "string" && b.text.trim()) last = b.text;
    else if (!toolOut && b.type === "tool-result" && typeof b.output === "string" && b.output.trim()) {
      toolOut = b.output;
    }
  }
  return last || toolOut;
}

function lastText(id) {
  const r = orca(["orchestration", "worker-read", "--dispatch", id, "--source", "auto", "--limit", "200"]);
  const res = r.result || {};
  if (res.terminal && Array.isArray(res.terminal.tail)) {
    return clip(res.terminal.tail.filter((l) => String(l || "").trim()).join("\n"));
  }
  const msgs = (res.transcript && res.transcript.messages) || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    const t = messageText(msgs[i]);
    if (String(t).trim()) return clip(t);
  }
  return "";
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
    const why = pinWhy(p);
    if (why) {
      out("PREFLIGHT " + p.phase + " " + p.agent + " FAIL " + why);
      failed++;
      continue;
    }
    const s = start(f.repo, f.run, p, spec, "preflight-" + p.phase);
    if (s.error) {
      out("PREFLIGHT " + p.phase + " " + p.agent + " FAIL start: " + s.error);
      failed++;
    } else open[s.id] = p;
  }
  const t0 = Date.now();
  while (Object.keys(open).length && Date.now() - t0 < PREFLIGHT_S * 1000) {
    const r = orca([
      "orchestration",
      "check",
      "--wait",
      "--run",
      f.run,
      "--timeout-ms",
      String(Math.max(1, Math.floor(POLL_S * 1000))),
    ]);
    if (r.ok === false) {
      const why = (r.error && r.error.message) || "check failed";
      for (const [id, p] of Object.entries(open)) {
        out("PREFLIGHT " + p.phase + " " + p.agent + " FAIL " + why);
        orca(["orchestration", "worker-stop", "--dispatch", id]);
        orca(["orchestration", "worker-release", "--dispatch", id]);
        failed++;
      }
      process.exit(failed ? 1 : 0);
    }
    const res = r.result || {};
    if (!res.deliveryId) {
      sleep(Math.max(1, Math.floor(POLL_S * 1000)));
      continue;
    }
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
    out("PREFLIGHT " + p.phase + " " + p.agent + " FAIL no worker_done in " + PREFLIGHT_S + "s; last output: " + lastText(id));
    orca(["orchestration", "worker-stop", "--dispatch", id]);
    orca(["orchestration", "worker-release", "--dispatch", id]);
    failed++;
  }
  process.exit(failed ? 1 : 0);
}

function dispatch(f) {
  const p = pin(f.repo, f.phase);
  const pinFail = pinWhy(p);
  if (pinFail) out("FAILED " + pinFail, 5);
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
  orca(["orchestration", "worker-release", "--dispatch", s.id]);
  out("NO_ACK " + s.id + " stopped after " + ACK_S + "s; last output: " + why, 4);
}

function advance(track, id) {
  const t = track[id] || (track[id] = { cursor: null, at: Date.now() });
  for (let page = 0; page < 20; page++) {
    const args = ["orchestration", "worker-read", "--dispatch", id, "--source", "auto", "--limit", "200"];
    if (t.cursor) args.push("--cursor", t.cursor);
    const r = orca(args);
    if (r.ok === false) {
      t.error = (r.error && r.error.message) || "worker-read failed";
      break;
    }
    const res = r.result || {};
    if (res.source) t.source = res.source;
    const body = res.transcript || res.terminal || {};
    const cursor = body.nextCursor || null;
    const n = Number(body.returnedMessageCount || body.returnedLineCount || 0);
    if (cursor && cursor !== t.cursor) t.at = Date.now();
    if (cursor) t.cursor = cursor;
    if (!body.limited || n === 0) break;
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
    const act = rows.filter((w) => {
      const kind = ((w.projection || {}).nextAction || {}).kind;
      return kind && kind !== "none";
    });
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
      const rec = track[w.dispatchId] || {};
      if (!rec.error && rec.source !== "transcript") continue;
      if (idle >= stallMin) {
        const why = rec.error ? rec.error : "no new output for " + Math.floor(idle) + " min";
        out(
          "STALLED " +
            w.dispatchId +
            " " +
            why +
            "; liveness " +
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
  const file = path.resolve(f.out || path.join(os.tmpdir(), "dely-wait-" + f.run + ".out"));
  const lock = file + ".lock";
  const recorded = () => {
    try {
      const j = JSON.parse(fs.readFileSync(lock, "utf8"));
      return (j && j.terminal) || "";
    } catch (_) {
      return "";
    }
  };
  const live = (handle) => {
    if (!handle) return false;
    const terms = ((orca(["terminal", "list"]).result || {}).terminals || []);
    return terms.some((t) => t && t.handle === handle);
  };
  const writeLock = (handle) => {
    try {
      fs.writeFileSync(lock, JSON.stringify({ terminal: handle || "" }));
    } catch (_) {
      /* vanished or unwritable */
    }
  };
  try {
    fs.writeFileSync(lock, JSON.stringify({ terminal: "" }), { flag: "wx" });
  } catch (_) {
    if (live(recorded())) {
      out("ALREADY_WAITING: a dely wait is running for this Run; end your turn, it will wake you.", 0);
    }
    writeLock("");
  }
  try {
    fs.unlinkSync(file);
  } catch (_) {
    /* no prior output */
  }
  const q = JSON.stringify;
  const self = q(__filename);
  const bin = q(process.execPath);
  const extra = ["skip", "stall-min", "timeout-min"]
    .filter((k) => f[k] && f[k] !== true)
    .map((k) => " --" + k + " " + q(f[k]))
    .join("");
  const cmd =
    bin +
    " " +
    self +
    " wait --run " +
    q(f.run) +
    " --as " +
    q(me) +
    extra +
    " > " +
    q(file) +
    " 2>&1; rm -f " +
    q(lock) +
    "; " +
    bin +
    " " +
    self +
    " notify --run " +
    q(f.run) +
    " --as " +
    q(me) +
    " --out " +
    q(file) +
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
  writeLock((r.result && r.result.terminal && r.result.terminal.handle) || "");
  out("WAITING", 0);
}

function notify(f) {
  const run = (orca(["orchestration", "run-show", "--id", f.run]).result || {}).run || {};
  const to = run.coordinator_handle || f.as;
  const text = "dely wait finished for " + f.run + ". Finish your current step, then read " + f.out + " and continue.";
  const retryMs = Math.max(1, Math.floor(NOTIFY_RETRY_S * 1000));
  const giveUpMs = NOTIFY_GIVEUP_S * 1000;
  for (const t0 = Date.now(); ; ) {
    const r = orca(["terminal", "send", "--terminal", to, "--text", text, "--enter"]);
    if (r.ok !== false) return;
    const msg = (r.error && r.error.message) || "";
    if (!/agent_prompt_blocked/.test(msg)) return;
    const left = giveUpMs - (Date.now() - t0);
    if (left <= 0) process.exit(1);
    sleep(Math.min(retryMs, left));
  }
}

const [cmd, ...rest] = process.argv.slice(2);
const table = { preflight, dispatch, wait, "wait-bg": waitBg, notify };
const need = {
  preflight: ["repo", "run"],
  dispatch: ["repo", "run", "phase", "spec-file"],
  wait: ["run"],
  "wait-bg": ["run"],
  notify: ["run", "out"],
};
if (!table[cmd]) out("usage: dely preflight|dispatch|wait|wait-bg|notify", 2);
const f = flags(rest);
if (need[cmd].some((k) => !f[k])) out("usage: dely preflight|dispatch|wait|wait-bg|notify", 2);
table[cmd](f);
