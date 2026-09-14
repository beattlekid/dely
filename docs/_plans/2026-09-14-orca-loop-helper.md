# Replace the 0.18.0 runtime with a helper on Orca's supervised loop

Transient plan. Deleted in the release commit. The durable record is the
2026-09-14 decision in `docs/decisions.md`.

## Baseline

Branch `feat/verify-event-driven-dispatch`, pull request #55, at the commit that
adds this plan. Version stays `0.18.0`, which is unreleased. The Spike helper
that measured this design is `.dely-dispatch/spike-helper.js`, an untracked
reference, not evidence.

## Task 1 — helper and tests

Owned paths: `skills/delivery/scripts/dely.js`, `tests/scripts.test.js`,
`tests/fixtures/fake-orca.js`.

Contract:

1. `dely.js` is CommonJS, needs Node 18 or newer and has no dependencies. It
   exposes `preflight`, `dispatch`, `wait`, `wait-bg` and `notify`, and nothing
   else. The launchers `dely` and `dely.cmd` stay unchanged.
2. **Pins.** `dispatch` and `preflight` read the `implement` and `review` rows of
   `AGENTS.md`.
   - Claude Code, Codex CLI and Cursor Agent CLI pass `--model`, and `--effort`
     when it is not `default`.
   - Every other harness passes neither flag.
   - `default` omits the flag.
3. **ACK.** `dispatch` appends one instruction to send a heartbeat with subject
   `ack`, starts the worker with `worker-start`, and peeks.
   - It prints `DISPATCHED <dispatchId>` once a message naming that dispatch id
     is seen.
   - Otherwise, after `DELY_ACK_S` (default 60), it stops the worker and prints
     `NO_ACK <dispatchId>` with the worker's last output.
   - A start failure prints `FAILED <reason>`.
4. **`preflight`.** One ACK-only dispatch per distinct pin (agent, model, effort),
   all started before waiting.
   - Prints `PREFLIGHT <phase> <agent> PASS <seconds>s` for each `worker_done`,
     then releases that worker.
   - Prints `PREFLIGHT <phase> <agent> FAIL <reason>` on a start failure or
     timeout, with the last output, then stops and releases it.
   - Acknowledges the batches it consumes, and exits 1 when any pin failed.
5. **`wait --run <id>`.** Loops `check --wait` with a `DELY_POLL_S` timeout
   (default 15).
   - **Settling batch:** a batch holding `worker_done`, `escalation` or `question`
     prints `SETTLED` with the delivery id and the whole batch, unacknowledged,
     and exits 0.
   - **Other batches:** acknowledged, and the loop continues.
   - **After each empty wait:** a `worker-list` row with
     `projection.attention.requiresAction`, whose `dispatchStatus` is not
     `dispatched` and whose id is not in `--skip`, prints `ATTENTION` with its
     liveness and `nextAction`, and exits 8.
   - **Stall:** at most once a minute, it advances each open dispatch's
     `worker-read --source auto` cursor. No new rows for `--stall-min` (default
     10) prints `STALLED` with the last output and exits 6.
   - **Deadline:** `DEADLINE` exits 7 after `--timeout-min` (default 60).
   - **Error:** a failing `check` prints `ERROR` and exits 9.
6. **`wait --as <handle>`.** Passes `--terminal <handle>` on every consuming
   `check`.
7. **`wait-bg --run <id>`.** Requires `ORCA_TERMINAL_HANDLE`.
   - Takes an exclusive lock next to its output file. If a lock younger than 65
     minutes exists, it prints `ALREADY_WAITING` and starts nothing.
   - Otherwise it creates one Orca terminal in the working directory that runs
     `wait --as <handle>`, removes the lock, runs `notify`, and exits. It prints
     `WAITING`.
8. **`notify`.** Types one line naming the output file and `--enter` into the
   Run's current `coordinator_handle`, falling back to `--as`.
9. The fake Orca models only fields and messages observed live on Orca 1.4.200:
   - `worker-start` returns `result.dispatchId`.
   - `check` batches carry `result.deliveryId` and `result.messages[].payload`.
   - `worker-list` rows carry `dispatchStatus` and
     `projection.{attention,liveness,nextAction}`.
   - `worker-read` returns `result.transcript.{nextCursor,limited,returnedMessageCount}`.
   - `run-show --id` returns `result.run.coordinator_handle`.
   - A second active waiter on a Run fails `check`.

### Acceptance — task 1

| # | Requirement | Instrument | Plausible wrong implementation it rejects | Observed |
| --- | --- | --- | --- | --- |
| 1 | pin argv | `node --test`: Copilot pin with a model passes no `--model`; Claude `default` effort passes no `--effort` | forwards `--model` for every harness | implementer |
| 2 | ACK matches its own dispatch | test: a heartbeat from another dispatch is pending → `NO_ACK` and `worker-stop` | treats any heartbeat as the ACK | implementer |
| 3 | settling batch left unacked | test: batch of heartbeat + worker_done → `SETTLED` with both, no `--ack` recorded | acks before printing | implementer |
| 3 | non-settling batch acked | test: heartbeat-only batch then worker_done → one `--ack`, then `SETTLED` | never acks, so the batch replays forever | implementer |
| 4 | ATTENTION on a failed row | test: row `dispatchStatus: failed`, `requiresAction: true` → `ATTENTION` exit 8 | requires `dispatchStatus: dispatched` (the Spike's own bug) | implementer |
| 4 | no ATTENTION noise | test: row `dispatched` with `unverifiable` and `requiresAction: true` → keeps waiting; a skipped failed row → keeps waiting | reports every `requiresAction` row | implementer |
| 5 | STALLED | test: cursor unchanged past `--stall-min` → `STALLED` exit 6; cursor advancing → no STALLED | judges stall from liveness only (Orca said `live` for a stalled worker) | implementer |
| 6 | waiter names Control | test: `wait --as term_x` records `--terminal term_x` on `check` | omits it (live Orca fences the check) | implementer |
| 7 | one waiter | test: a second `wait-bg` with a fresh lock prints `ALREADY_WAITING` and records no `terminal create`; a stale lock starts one | no lock | implementer |
| 8 | wake target | test: `run-show` names `term_new` → `terminal send --terminal term_new` although `--as term_old` | uses the handle captured at start | implementer |
| 9 | preflight | test: two distinct pins, one worker_done → one PASS, one FAIL with stop and release, exit 1; identical pins start one worker | FAIL only on start failure | implementer |

## Task 2 — skills, harness table, setup, README, contracts

Owned paths: `skills/delivery/SKILL.md`, `skills/delivery/references/harnesses.md`,
`skills/setup/SKILL.md`, `skills/verify/SKILL.md` (deleted), `README.md`,
`tests/contracts.sh`.

Contract:

10. **`skills/delivery/SKILL.md`, the Orca section.**
    - Coordination: Control loads `orca skills get orchestration` and follows its
      supervised loop.
    - Every dispatch goes through `dely dispatch`, with `dely preflight` once
      before the first.
    - Wait by the harness's `Control wake`: `background` runs `dely wait` as a
      background command; `waker` runs `dely wait-bg` as its last command, then
      ends the turn.
    - Never act on an Orca nudge.
    - Result handling: on `SETTLED`, process the batch, do the guide's completion
      accounting, and acknowledge. On `ATTENTION`, follow `nextAction` and skip
      that id next time. On `STALLED`, read the output, then wait again or
      recover. `NO_ACK` or `FAILED` gets one fresh dispatch. `DEADLINE` and
      `ERROR` go to the human.
    - Gates, shapes, acceptance, review, remediation and release are unchanged.
11. **`references/harnesses.md`.** Keeps Harness, Orca agent id, Permission default,
    Forbidden headless forms, Launch notes, Control wake and Setup, and drops Launch
    and Model pin.
    - Control wake: `background` for Claude Code, Cursor Agent CLI and GitHub
      Copilot CLI; `waker` for Codex CLI, Antigravity CLI and Grok Build;
      `unsupported` for Kiro CLI.
    - A note says models for harnesses other than Claude, Codex and Cursor come
      from Orca's per-agent default arguments.
12. `skills/verify/` is deleted. No skill, README line or contracts pin names
    `dely:verify`, `verify run`, `verify start`, `verify collect`, `dely open`,
    `dely collect` or a `nudge` wake.
13. **`skills/setup/SKILL.md`.** Ends with `dely preflight` in place of
    `dely:verify`.
14. **`README.md`.**
    - The Kiro `npx skills add/remove` lines name `delivery` and `setup` only.
    - "How Dely works" describes preflight, dispatch and wait by wake mode.
    - The `~/.agents/skills` guidance stays.
15. **`tests/contracts.sh`.** Pins the new shape and asserts `skills/verify` is
    absent, within 280 lines.

### Acceptance — task 2

| # | Requirement | Instrument | Plausible wrong implementation it rejects | Observed |
| --- | --- | --- | --- | --- |
| 10 | skill routes by helper output | `bash tests/contracts.sh` pins for `orca skills get orchestration`, `dely preflight`, `dely wait-bg`, `ATTENTION`, `STALLED` | skill keeps the 0.18.0 wait/collect/verify text | implementer |
| 11 | wake column | contracts table pin with `waker` for Codex/Antigravity/Grok | Codex left `nudge` | implementer |
| 12 | old surface gone | contracts absence: `test ! -e skills/verify/SKILL.md` and `git grep` finds none of the names in item 12 under `skills/` and `README.md` | skill deleted but README still says `/verify` | implementer |
| 13–14 | setup and README | contracts pins | setup still runs verify | implementer |

## Integration and live acceptance (Control, after integration review)

Fresh repositories; the checks, targets and the discrepancies they reject:

| # | Check | Target | Rejects |
| --- | --- | --- | --- |
| L1 | delivery, Control Claude Code (background) | done with no human step beyond workspace trust | a helper that passes tests but stalls a live Control |
| L2 | delivery, Control Codex CLI (waker) | done with no human step beyond workspace trust | a waker that dies with Codex's exec or races |
| L3 | preflight with a signed-out or untrusted harness | FAIL within about 2 minutes, with the cause | a preflight that waits for DEADLINE |
| L4 | worker killed after ACK | ATTENTION within about 30 s | a wait that ignores failed rows |
| L5 | worker alive but idle | STALLED within the threshold plus 1 minute | stall judged from liveness |

## Not observable by these instruments

- Whether other Control models follow the skill.
- Windows and Linux.
- Orca versions other than 1.4.200.
