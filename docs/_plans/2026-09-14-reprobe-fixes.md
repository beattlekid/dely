# Re-probe fixes for the 0.18.0 helper

Transient plan, deleted in the release commit. The durable record is the
"Amended 2026-09-14, after a re-probe of 397d4fd" bullet in the 2026-09-14
decision. Baseline: the commit adding this plan, on `397d4fd`. Version stays
`0.18.0`.

## Scope

One task. Owned paths: `skills/delivery/scripts/dely.js`, `tests/scripts.test.js`,
`tests/fixtures/fake-orca.js`, `skills/delivery/SKILL.md`,
`skills/delivery/references/harnesses.md`, `skills/setup/SKILL.md`,
`tests/contracts.sh` (≤ 280 lines).

## Contract

1. **Antigravity launch.** For agent `antigravity`, `start()`:
   - runs `orca terminal create --worktree path:<repo> --command "agy <permission>"`, where
     the permission comes from Orca's `agentDefaultArgs.antigravity` when set, otherwise
     from the harness table;
   - waits for output quiescence: at least `DELY_QUIET_MIN_S` (default 5) since launch
     and `DELY_QUIET_S` (default 3) with no terminal output change, capped at 90 s;
   - then runs `worker-start --terminal <handle> --spec … --run … --task-title …`, with no
     `--agent`, `--model` or `--effort`;
   - closes that terminal on any failure, and remembers it so a later close follows the
     existing Dely-created-terminal rule.

   All other agents are unchanged.
2. **`dely wait` and `--control`.**
   - `dely wait` requires `--control <agent>`.
   - A harness whose `Control wake` cell is not `background` gets
     `REFUSED <agent> wakes by <wake>; use dely wait-bg` with exit 3, and no `check` runs.
   - Without `--control` it prints usage and exits 2.
   - `wait-bg` passes the waiter its own `--control` so its internal `wait` is allowed.
3. **Failure quote.**
   - `PREFLIGHT … FAIL`, `NO_ACK` and `STALLED` quote the screen or transcript lines that
     match a gate pattern first, else the last lines, trimmed to about 400 characters.
   - Gate patterns are literal phrases observed live: `Do you trust the contents`,
     `Confirm folder trust`, `Workspace Trust Required`, `Security guide`, `No, exit`,
     `Select login method`, `posing security risks`, `Session ended`,
     `usage limit`, `hit your free usage limit`, `Update available`.
   - The pattern list lives in one constant.
4. **Early preflight failure.** When an open preflight dispatch's screen shows a gate
   pattern on two consecutive polls, and that dispatch has sent no message, preflight
   prints `PREFLIGHT <phase> <agent> FAIL gate on screen: <quote>` at once, then stops and
   releases the dispatch. Antigravity's stale `You are currently not signed in` banner is
   **not** a gate pattern.
5. **Skill.** `skills/delivery/SKILL.md`:
   - names `wait --control`, the `REFUSED … use dely wait-bg` line, and that a waker
     Control never runs `dely wait`;
   - says a `PREFLIGHT … FAIL` or `NO_ACK` worker is already stopped and released, so the
     human runs that harness once in a new terminal to answer its dialog (setup's trust
     step), and Control then reruns `dely preflight`.
6. **Grok Build Setup cell.** `references/harnesses.md` says it asks a y/n security
   question in a fresh repository, and `skills/setup/SKILL.md` opens Grok once for the
   human like the other dialog harnesses.

## Acceptance

| # | Requirement | Instrument | Plausible wrong implementation it rejects | Observed |
| --- | --- | --- | --- | --- |
| 1 | agy adopt | `node --test`: an antigravity pin records `terminal create`, then `worker-start --terminal <that handle>` only after the fake terminal output is quiet, and no `--agent` | adopts at once without waiting for quiescence | implementer |
| 1 | other agents unchanged | test: a claude pin still uses `worker-start --agent claude` | routes every agent through adopt | implementer |
| 2 | wait refuses a waker | test: `wait --control codex` → exit 3 with the REFUSED line, no `check`; `wait` without `--control` → exit 2; `wait-bg` still waits | `wait` ignores `--control` | implementer |
| 3 | quote prefers the gate | test: a tail of 30 preamble lines then `Security guide` / `No, exit` → the quote contains `Security guide` | last 300 characters (the preamble) | implementer |
| 4 | early fail | test: a gate on screen for two polls → FAIL well before the budget; a single-poll flash of a gate line does not fail; an Antigravity `not signed in` banner does not fail | fails on one poll, or on the agy banner | implementer |
| 5–6 | skill and table | `bash tests/contracts.sh` pins: `--control` on the wait usage, the rerun-preflight sentence, the Grok Setup cell | old text | implementer |
| L | live | after release, Control probes: an agy implement/review preflight PASS and one delivery with an agy worker; `wait --control codex` refused; an untrusted Claude pin fails early naming `Security guide`; a Grok fresh repo shows its dialog | passes tests but still loses the agy prompt | Control |
