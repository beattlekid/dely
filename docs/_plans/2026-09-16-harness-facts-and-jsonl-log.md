# Plan — one machine-readable home for harness facts, a protocol-only skill, and a log that records failures

Decision record: `docs/decisions.md`, entry
"2026-09-16 — Harness facts move to `harnesses.json`, the skill keeps only its
protocol, and the log becomes machine-readable".

**Baseline:** `6736331` — the commit carrying the decision record and this plan.

## Goal

Every harness-specific fact lives in `harnesses.json` and is read from there by
the helper and both skills. `skills/delivery/SKILL.md` carries the delivery
protocol and nothing it can transcribe from somewhere else. `~/.dely/log.jsonl`
records what a run did, including the runs that failed, in a form an agent can
parse. `dely wait` reports `ATTENTION` for a worker whose process is gone on
Orca 1.4.203. `dely` with no arguments identifies which copy of Dely is running.

Out of reach: making row 4 pass on an Orca build that projects neither
`nextAction` nor `attention` for a dead worker, and supporting any of the four
deferred harnesses.

## Allowed scope

```
harnesses.json                              (new)
skills/delivery/SKILL.md
skills/delivery/references/harnesses.md     (deleted)
skills/delivery/scripts/dely.js
skills/setup/SKILL.md
AGENTS.md
README.md
probe/checklist.md
.claude-plugin/plugin.json
.codex-plugin/plugin.json
docs/decisions.md
docs/_plans/2026-09-16-harness-facts-and-jsonl-log.md  (deleted at release)
```

Produced by `git ls-files` intersected with the four tasks below; the list
enumerates every path, it does not sample. Carried without being listed: there
are no colocated tests — `tests/` was deleted in 0.19.0 and `AGENTS.md` gates
its absence — and no registry enumerating what this plan adds. The documents
owning these paths are `AGENTS.md` (gates, version, log path) and `README.md`
(install, harness list, log disclosure); both are listed and both are task 4.
`skills/delivery/templates/` was checked and yielded nothing: neither template
names a harness or the log.

## Forbidden scope

`skills/delivery/scripts/dely` — the launcher resolves a Node runtime and
nothing else; its name suggests it dispatches but it does not.

`probe/mkrepo.sh` and `probe/trust.sh` — `trust.sh` hardcodes Claude Code's
dialog on purpose, because it stands in for a human and is not shipped in the
protocol. It does not read `harnesses.json` and must not.

`.cursor-plugin/plugin.json` and `.claude-plugin/marketplace.json` — neither
carries a version field, so the version gate does not reach them.

`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.github/` — the
contribution contract does not change. The bug report form's harness dropdown
already marks four harnesses deferred, done in 0.19.0.

## Execution envelope

**Protected dirty paths:** none. The working tree was clean at baseline
(`git status --porcelain` empty on `36ef5cf`).

**Branch, base, remote, pull-request target:** `feat/harness-facts-and-jsonl-log`,
cut from `origin/main` at `36ef5cf`, pushed to `origin`, pull request against
`main`.

**Resolved phase pins:** `implement` is Cursor Agent CLI, `cursor-grok-4.6-high`,
effort `default`, from `AGENTS.md`. The slug was confirmed present in
`cursor-agent models` on 2026-09-16.

**Review deviation, approved at the design gate:** no reviewer is dispatched
through Orca. When the candidate is pushed and the closure gates are green on
exact HEAD, Control stops and reports the SHA, and a separate session reviews
it. This replaces both the per-task reviews and the integration review that
`SKILL.md` specifies for Architectural work. It is the same deviation 0.19.0
took, and it is recorded rather than taken silently.

**Authority:** branch, commit only the owned paths above, run the closure
gates, push `feat/harness-facts-and-jsonl-log`, open and update its pull
request. Not: merge, force-push, stash, reset, clean, or edit anything outside
owned scope. Removing the two stale Cursor installs is authorised separately
by the human at the design gate and happens at verification, not here.

## Tasks

### 1. Every harness fact is read from one JSON file

**Behaviour.** `harnesses.json` exists at the repository root with one entry per
harness. `dely.js` resolves an agent id, a Control wake mode, and whether to
pass `--model` and `--effort` from that file. `skills/setup/SKILL.md` names no
harness, no binary, no discovery command and no permission default; it says to
read them from `harnesses.json`. `skills/delivery/references/harnesses.md` is
gone. Codex's `trust` reads `dialog`.

**Direction.** Seven entries: `claude`, `codex`, `cursor` as `supported`;
`copilot`, `antigravity`, `grok`, `kiro` as `deferred`, carrying the measured
facts currently in `harnesses.md` plus what `docs/decisions.md` records about
each. Fields per the decision record. `modelFlag` and `effortFlag` are booleans
replacing the helper's hardcoded `["claude","codex","cursor"]` membership test.
`discovery` is the command that lists models, or null. `instructionsFile` names
the file that harness reads for persistent project instructions, and whether it
needs an import of `AGENTS.md` — that is what drives setup's `CLAUDE.md` offer
without naming Claude. Resolve the path from `dely.js` as
`../../../harnesses.json` relative to the script and from each skill as a
relative path stated in the skill; all three harness plugin caches hold the
whole repository, verified 2026-09-16.

`harnessCell()` and the `AGENTS` object literal in `dely.js` are both deleted;
their callers read `harnesses.json`.

**Files.** `harnesses.json`, `skills/delivery/scripts/dely.js`,
`skills/setup/SKILL.md`, `skills/delivery/references/harnesses.md` (deleted).

**Focused verification.**
`jq -e '[.harnesses[] | select(.id and .binary and .status and .controlWake and .trust and .permissionDefault and (.modelFlag|type=="boolean") and (.effortFlag|type=="boolean") and .notes)] | length == 7' harnesses.json`
and
`git grep -nE 'dangerously-skip|dangerously-bypass|--force|bypassPermissions|cursor-agent models|codex debug models|claude -p|--trust-all-tools' -- skills/`
returning empty. It fails if a fact is copied back into a skill.

**Document impact.** None yet; `AGENTS.md` points at `harnesses.md` and is
reconciled in task 4, because the gate and version changes land there too and
splitting them would leave `AGENTS.md` committed twice for one contract.

### 2. The skill states the protocol and transcribes nothing

**Behaviour.** `skills/delivery/SKILL.md` holds only the sections below, and
no prose line exceeds 80 columns. The line budget was amended from 240 to 323
once the file was measured at that wrap; see the decision record. Its `##`
sections are exactly: Two human gates, The control session, Shape, Execution
envelope, Orca and the helper, Implementation, Review, Release, Failure and
recovery. Plan Mode and Investigation are one sentence each. Evidence, Changing
this skill and Language are gone. The log subsection is three lines. No `dely`
usage block. Preflight appears only as setup's step and as the response to
`NO_ACK`. The dispatch spec sentence about reading no other skill is stated as
the helper's behaviour, not as an instruction Control repeats.

**Direction.** The target section budget is in the decision record's source
review: gates and Control 15, shape and acceptance 35, envelope 12, Orca and
helper 45, implementation and handoff 35, review and remediation 40, release
20, failure table 15. Cut the transcription, not the protocol: the two gates,
the acceptance-row counterexample rule, review independence, the one-pass
remediation rule and the seven release steps all survive intact. The failure
table keeps only rows that "Result handling" does not already carry.

`dely dispatch` appends to the spec, after the acknowledgement instruction, a
sentence to the effect that the Orca preamble and this spec are everything the
worker needs and that it should read no other skill.

**Files.** `skills/delivery/SKILL.md`, `skills/delivery/scripts/dely.js`.

**Focused verification.** Line width first — every other prose file in this
repository sits at a 90th-percentile line length of 75 to 82 columns, so
the maximum over prose lines — excluding the YAML frontmatter, Markdown table
rows and fenced blocks, as in every other file here — must be ≤ 80. A line
count is only meaningful at a fixed wrap. Then
`wc -l skills/delivery/SKILL.md` ≤ 323;
`grep '^## ' skills/delivery/SKILL.md` equal to the nine headings above;
`git grep -n 'Changing this skill' -- skills/delivery/SKILL.md` and
`git grep -nE '^## (Language|Evidence)' -- skills/delivery/SKILL.md` empty;
`git grep -n preflight -- skills/delivery/SKILL.md` showing only the setup
reference and the `NO_ACK` route. A file cut to 240 lines by deleting protocol
instead of transcription fails the heading check.

**Document impact.** `README.md` restates the result-handling summary and is
reconciled in task 4.

### 3. The helper logs, identifies itself, and sees a dead worker

**Behaviour.** Three changes to `dely.js`.

`dely wait` reports `ATTENTION` for a worker whose `dispatchStatus` is
`dispatched` and whose `nextAction.kind` is not `none` **or** whose
`projection.attention.requiresAction` is true, and includes `attention`
alongside `liveness` and `nextAction` in the printed object. A worker in any
other `dispatchStatus` raises no `ATTENTION`.

When `~/.dely/` exists, every helper outcome appends one JSON object to
`~/.dely/log.jsonl`: `preflight`, `dispatch` with seconds to acknowledgement,
`no_ack`, `settled`, `attention`, `stalled`, `deadline`, `error`, `wait_bg`,
`notify`. Each line carries `ts`, `run`, `repo`, `sha`, `orca` and `event`.
A new `dely log` subcommand appends Control's closing `delivery` object. When
`~/.dely/` does not exist nothing is written and nothing is created.

`dely` with no arguments prints the manifest version, the Dely SHA where one
resolves, and the sha256 of `skills/delivery/SKILL.md`, then the usage line.

**Direction.** Resolve `orca` version once per process and cache it; a
subprocess per event is not affordable. Resolve `sha` from `git -C <package
root> rev-parse HEAD` and record `null` when the package is not a checkout,
which is the normal case for a plugin install. An append failure is never
allowed to change an exit code or a printed line — the log is an observer.
Keep the existing exit codes; an unknown command still exits 2.

**Files.** `skills/delivery/scripts/dely.js`.

**Focused verification.** For `ATTENTION`, checklist row 4 live, plus the three
control states recorded in the decision record re-run against the candidate: a
healthy working worker and a settled worker must produce no `ATTENTION`, and a
worker killed after acknowledgement must produce one. The 0.19.0 helper fails
the killed case (measured silent for 6 min 8 s); a fix without the
`dispatchStatus` guard fails the startup case. For the log,
`jq -c . ~/.dely/log.jsonl` parsing every line after a real dispatch, and
`jq -r '.event'` containing `dispatch` and `settled`; a pretty-printing logger
fails per-line parse. For identity, the printed sha256 equal to
`shasum -a 256 skills/delivery/SKILL.md`, and changing the manifest version
changing the printed version.

**Document impact.** `AGENTS.md`'s log line and `README.md`'s log disclosure,
both task 4.

### 4. The documents that own these paths say what is true

**Behaviour.** `AGENTS.md`: version gate `0.20.0`; the log line names
`~/.dely/log.jsonl` and the JSON Lines format, keeping "opt-in"; the harness
reference points at `harnesses.json`; the absence list drops 0.19.0's entries
and gains `skills/delivery/references/harnesses.md`; the identifier grep gains
`harnessCell`. `README.md`: the three supported harnesses, install and hash
verification matching what 0.19.0's checklist measured, and the log disclosure.
`probe/checklist.md`: row 4's explanation names the field and the measurement.
Both manifests read `0.20.0`.

**Direction.** The README's install section must state three measured facts
0.19.0 found the hard way: a Claude Control was observed running `scripts/dely`
from the marketplace source directory rather than the plugin cache, so a hash
check covers both; `codex plugin marketplace add` was observed keeping a stale
marketplace of the same name and installing the previous version while
reporting success, so a refresh removes and re-adds; and Cursor Agent CLI reads
the Claude plugin cache and cannot install from a local snapshot. The log
disclosure says the file may contain quoted screen output and therefore
whatever a worker's terminal displayed.

The absence list follows the rule recorded at the 2026-09-15 review: it holds
only files deleted in the delivery that is shipping, and is cleared in the
next. 0.19.0's entries have served that purpose and go.

**Files.** `AGENTS.md`, `README.md`, `probe/checklist.md`,
`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`.

**Focused verification.** The full closure-gate block from `AGENTS.md` on exact
HEAD, every command exit 0, including the new version pin and the new absence
entry. Then the negative controls the gates exist for: reverting one manifest
to `0.19.0` must fail the version gate, and restoring
`skills/delivery/references/harnesses.md` must fail the absence gate.

## Acceptance

| Requirement | Instrument | Counterexample | Observed red |
| --- | --- | --- | --- |
| `harnesses.json` is the only home for harness facts | `jq -e` seven-entry field check; `git grep -nE 'dangerously-skip\|dangerously-bypass\|--force\|bypassPermissions\|cursor-agent models\|codex debug models\|claude -p\|--trust-all-tools' -- skills/` empty | A `harnesses.json` added while setup and `SKILL.md` keep their hardcoded lists: the `jq` check passes, the grep fails | |
| The helper resolves the wake mode from the file, not a literal | `dely wait --run X --control codex` prints `REFUSED … wakes by waker`; with `controlWake` flipped to `background` in a scratch copy of `harnesses.json`, it does not refuse | A helper keeping a `{claude:background, codex:waker}` map: passes the first call, ignores the flip | |
| `SKILL.md` is the nine protocol sections and nothing else | max prose line width ≤ 80 **first** (`awk 'NR>4 && $0 !~ /^\|/ && !/^```/ {print length}' \| sort -n \| tail -1`, excluding frontmatter, table rows and fences), then `wc -l` ≤ 323; `grep '^## '` equals the agreed list; `git grep -n 'Changing this skill\|^## Language\|^## Evidence'` empty | Two, and the width check exists because the second was observed: a 220-line file reached by cutting protocol rather than the usage block, which the heading list catches; and a file reached by reflowing 76-column prose to 133, which `wc -l` alone cannot tell from a real cut | |
| `dely wait` reports `ATTENTION` for a killed worker and for nothing healthy | Checklist row 4; plus a healthy worker and a settled worker producing no `ATTENTION`, and the ~1–2 s starting transient producing none | 0.19.0's `wait`, measured silent for 6 min 8 s on this Orca build; and a guard-less fix, which fires on every dispatch's startup transient | |
| `log.jsonl` is one JSON object per line and records a failed run | After a real dispatch and after a deliberately failed one, `jq -c . ~/.dely/log.jsonl` parses every line and `jq -r '.event'` contains `dispatch`, `settled` and a failure event; every line has `ts`, `run`, `repo`, `sha`, `orca` | A logger that pretty-prints one object across lines, or one that writes only on success: the file exists and per-line parse or the failure event is missing | |
| The log stays opt-in | With `~/.dely/` absent, a full dispatch creates neither the directory nor the file | A logger using `mkdir -p`: the run succeeds and the directory appears | |
| Preflight is off the per-delivery path | `git grep -n preflight -- skills/delivery/SKILL.md` shows only setup and the `NO_ACK` route; checklist row 1's log has no `preflight` event before its first `dispatch` | A `SKILL.md` that still says "once before the first dispatch" | |
| The dispatch spec carries the no-other-skill sentence | Dispatch into a probe repository and read the worker's received spec with `worker-read` | A helper appending only the acknowledgement line | |
| Bare `dely` prints version, SHA and `sha256(SKILL.md)` | `skills/delivery/scripts/dely`; the printed hash equals `shasum -a 256 skills/delivery/SKILL.md`; editing the manifest version changes the printed version | A hardcoded version string: the first check passes, the manifest edit does not move it | |
| The closure gates fail for the reasons they exist | Full `AGENTS.md` block on exact HEAD, all exit 0; then one manifest reverted to `0.19.0`, and `harnesses.md` restored, each failing its gate | A version pin left at `0.19.0`, which passes while the manifests say `0.20.0` | |
| `README.md` install and hash text matches what was measured | **No executable instrument.** A human reads the diff against the three measurements named in task 4 | None — recorded as unverifiable by instrument | |

**Cannot be observed:** the four deferred harnesses, Windows, whether
`attention.requiresAction` keeps this shape on the next Orca build, and whether
a third-party install behaves as the README describes on a machine other than
this one.

## Stop conditions

`NEEDS_REPLAN` if `harnesses.json` at the repository root is not reachable from
a skill in some harness's installed layout — the whole-repository cache was
verified for Claude, Cursor and Codex on this machine on 2026-09-16 and for no
other harness or platform.

`NEEDS_REPLAN` if cutting `SKILL.md` to the nine sections cannot hold the two
gates, the acceptance counterexample rule, and review independence. Those are
the protocol; the line budget is not. The budget is also not a reason to
rewrap: a line count measured at a wrap this repository does not use measures
nothing, and reporting an honest number above 240 is the correct outcome where
the protocol will not compress further.

`BLOCKED` if `attention.requiresAction` does not reproduce on the candidate as
it did during design — that is an execution-plane change, not something to work
around in the helper.

The startup-transient measurement holds for Claude Code workers on Orca 1.4.203
on macOS. It has not been verified for Codex or Cursor workers, and the
`dispatchStatus` guard is written to be correct regardless of how long the
transient lasts.

## Closure gates

All from the repository root, exactly as `AGENTS.md` lists them, with the
version pin reading `0.20.0` and the absence list naming
`skills/delivery/references/harnesses.md`. Report each command, its summary
line verbatim, and its exit code; `$?` after a pipe reports the last command in
the pipe, not the gate.
