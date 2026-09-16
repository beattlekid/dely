# Plan — retire the structural suite and narrow Dely to the harnesses it can support

Decision record: `docs/decisions.md`, the 2026-09-16 entry.

**Baseline:** `abd5476`, the commit carrying the 2026-09-16 decision record
and this plan.

## Goal

Dely 0.19.0 ships the protocol and the helper that the live probes actually
exercised, and nothing else. The structural suite, its CI job, the fake Orca it
ran against, the Antigravity adopt path, the screen-gate classifier, the pin
validator, the Windows launcher and the Electron runtime branch are gone from
the package. Install and discovery text names the harnesses that are supported
today. A `probe/` directory carries the live checklist that replaces the suite,
including the script that acts as the human on a trust dialog.

Out of reach here: `harnesses.json`, a harness-agnostic setup skill, the JSONL
log, the shorter `SKILL.md`, and moving preflight to setup-and-after-`NO_ACK`.
Those belong to the redesign delivery on `main`. This plan only deletes, and
reconciles the documents that own what it deletes.

## Allowed scope

```
AGENTS.md
CONTRIBUTING.md
README.md
.claude-plugin/plugin.json
.codex-plugin/plugin.json
.github/pull_request_template.md
.github/workflows/contracts.yml
docs/decisions.md
docs/_plans/2026-09-16-retire-tests-and-narrow-to-supported-harnesses.md
probe/
skills/delivery/SKILL.md
skills/delivery/scripts/dely
skills/delivery/scripts/dely.cmd
skills/delivery/scripts/dely.js
skills/setup/SKILL.md
tests/
```

Produced by `git ls-files` filtered against the deletions this plan names, then
checked against `git grep -n 'contracts\.sh\|tests/' -- .` and
`git grep -n 'Grok\|Antigravity\|Kiro\|Copilot' -- .` so that no file naming a
deleted thing is left out. Both greps were run; their hits outside this list
are `skills/delivery/references/harnesses.md` and `docs/decisions.md` history,
both deliberately in Forbidden scope below except for the new decision entry.

Carried without being listed: no colocated tests exist after this plan, and no
registry test enumerates what it adds.

## Forbidden scope

- `skills/delivery/references/harnesses.md` — it is replaced by `harnesses.json`
  in the redesign delivery. Editing it here would be rewritten there, and the
  helper still reads its `Control wake` column.
- `skills/delivery/templates/` — decision record and plan templates are not
  affected by any deletion here.
- The parts of `skills/delivery/SKILL.md` that do not describe a deleted thing.
  Its length is the redesign delivery's problem.
- `docs/decisions.md` history before 2026-09-16. Superseded entries are amended
  by the new entry, never deleted.
- `assets/`, `LICENSE`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `plugin.json`,
  `.claude-plugin/marketplace.json`, `.cursor-plugin/plugin.json` — named here
  because a version bump looks like it should touch a manifest: only the two
  manifests that carry a `version` field do.

## Execution envelope

Protected dirty paths: none. The tree was clean at baseline `3ee4e1a`.

Branch, base, remote, pull-request target: commits go on
`feat/verify-event-driven-dispatch`, pushed to `origin`, updating the existing
pull request 55 against `main`. No merge and no rebase.

Resolved phase pins: the human directed at the design gate that Control
implements these four tasks itself rather than dispatching them. No worker is
launched for `implement`, so the `implement` pin in `AGENTS.md` is recorded and
unused. The `review` pin is likewise not dispatched: an independent session
reviews the pushed head, and this delivery stops when the head is pushed and
the gates are green.

This is a deliberate departure from the protocol's dispatched implementation,
taken by the human who owns that choice, and it is the reason no handoff
document exists for these tasks. The independent review is not waived, only
moved out of this session.

Authority: branch is already created; commit only the owned paths above, run
gates, push `feat/verify-event-driven-dispatch`, and update pull request 55.
No merge, no force-push, no stash, no reset, no clean, no edit outside scope.

The live checklist rows still run against a real install built with
`git archive` from the pushed head, never against this working tree.

## Tasks

### 1. The closure contract is a set of static checks and a version pin, with no suite and no CI job behind it

**Behaviour.** `tests/` and `.github/workflows/contracts.yml` do not exist.
`AGENTS.md` names the gates that remain: whitespace, JSON validity, shell and
JavaScript syntax over the files the repository actually ships, the absence
commands extended with the rails this delivery deletes, the disclosure greps,
and a version gate that pins `0.19.0` in both plugin manifests. `CONTRIBUTING.md`
and the pull-request template stop telling a contributor to run a suite that is
gone, and the README stops showing a CI badge for a workflow that is gone.
Both manifests read `0.19.0`.

**Direction.** The version gate replaces the pin that used to live inside
`contracts.sh`: the literal version appears in `AGENTS.md`, so advancing it is
part of the same delivery that changes `skills/`, and a manifest left behind is
a red gate rather than a silent split between the Claude and Codex installs.
Write the syntax gate so it enumerates from `git ls-files` rather than naming
files, so it keeps holding as files come and go.

**Files.** `tests/`, `.github/workflows/contracts.yml`, `AGENTS.md`,
`CONTRIBUTING.md`, `.github/pull_request_template.md`, `README.md`,
`.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`.

**Focused verification.** `test ! -e tests && test ! -e .github/workflows/contracts.yml`,
and `git grep -n 'contracts\.sh\|scripts\.test\.js\|actions/workflows' -- . ':!docs/_plans' ':!docs/decisions.md'`
returns nothing. It fails if the directory is deleted while a document still
sends someone to it. The pattern names the two deleted files and the badge URL,
not the string `workflows/contracts`, because the absence gate in `AGENTS.md`
legitimately contains that path.

**Document impact.** `AGENTS.md` owns the closure gates and the version rule;
`CONTRIBUTING.md` and the pull-request template own the contributor-facing
verification step; `README.md` owns the badge.

### 2. The helper carries only the launch path the supported harnesses use

**Behaviour.** `skills/delivery/scripts/dely.js` no longer contains the
Antigravity adopt path, the `GATES` list and the screen scanning built on it, or
`pinWhy` and its fail-closed branch, nor any helper left dead by those
deletions. `skills/delivery/scripts/dely.cmd` does not exist, and
`skills/delivery/scripts/dely` resolves Node without an Electron fallback.
`preflight`, `dispatch`, `wait`, `wait-bg` and `notify` keep their printed
contract, including the failure quote, which now comes from the worker's own
output rather than from a gate-string filter.

**Direction.** Delete, do not rewrite: every remaining line should be a line
that was already there. When a failure quote loses its gate filter it becomes
the tail of the worker's screen, which is what `PREFLIGHT … FAIL` and `NO_ACK`
already print when no gate string matched. Follow each deletion through to the
helpers it orphans rather than leaving them unreferenced.

**Files.** `skills/delivery/scripts/dely.js`,
`skills/delivery/scripts/dely.cmd`, `skills/delivery/scripts/dely`,
`skills/delivery/SKILL.md` (only the passages that describe a deleted thing:
the adopted-terminal sentence under `dely wait`, and the paragraph that
promises a fail-closed pin).

**Focused verification.**
`git grep -nE 'adoptCommand|adoptedPermission|adoptPath|readAdopts|writeAdopts|recordAdopt|takeAdopt|closeAdopted|closeCreated|waitQuiet|lastOutputAt|launchKind|hasGate|GATES|pinWhy|ELECTRON|ELECTRON_RUN_AS_NODE' -- skills/`
returns nothing, `node --check skills/delivery/scripts/dely.js` passes, and
`sh -n skills/delivery/scripts/dely` passes. The grep enumerates rather than
samples; it fails on a deletion that removes a definition and leaves a call.

**Document impact.** `skills/delivery/SKILL.md` owns the helper's printed
contract and is the only document that describes the adopted terminal and the
fail-closed pin.

### 3. Install and discovery name the harnesses this release supports

**Behaviour.** `README.md` documents installing Dely in Claude Code, Codex CLI
and Cursor Agent CLI, with the checked-version rows for those and for Orca.
`skills/setup/SKILL.md` discovers models and effort for those three and writes
the literal `default` where a harness has no effort vocabulary. Neither file
gives an install command, a discovery command, or a per-harness section for
Grok Build, Antigravity CLI, Kiro CLI or GitHub Copilot CLI.

**Direction.** Narrowing what is documented is not a claim that nothing else
exists; keep the wording open where it was open, and do not add a sentence
declaring a closed set. The troubleshooting entry about a stale `~/.agents`
copy shadowing a newer plugin stays — it is still true for Codex — with the
deferred harnesses dropped from it.

**Files.** `README.md`, `skills/setup/SKILL.md`.

**Focused verification.**
`git grep -n 'Grok\|Antigravity\|Kiro\|Copilot\|agy\|kiro-cli\|copilot' -- README.md skills/setup/SKILL.md`
returns nothing. It fails if a section is deleted while a table row, a binary
name or a troubleshooting line still names the harness.

**Document impact.** `README.md` owns install and troubleshooting;
`skills/setup/SKILL.md` owns discovery and the trust step.

### 4. `probe/` carries the live checklist that replaces the suite

**Behaviour.** `probe/checklist.md` describes the seven rows, the snapshot
install with its hash check, the fixed probe repository paths, and the cleanup,
in enough detail that an agent session runs it without this plan.
`probe/mkrepo.sh` creates a probe repository with a bare remote and a Dely
managed block from arguments, and refuses any path that is not under
`~/dely-probe/`. `probe/trust.sh` opens a harness in an Orca terminal, answers
that harness's own trust dialog, verifies the result in the harness store, and
reports failure when the store does not confirm it; it refuses any path that is
not under `~/dely-probe/`. Neither skill references `probe/`.

**Direction.** The reason `trust.sh` needs a store check is measured: the
earlier probe script reported success twice while
`projects[<path>].hasTrustDialogAccepted` stayed false, and the delivery then
failed its second preflight for the same reason as the first. Verify what the
store says, not what the screen did. Where a harness's store key has not been
measured, refuse rather than guess.

**Files.** `probe/checklist.md`, `probe/mkrepo.sh`, `probe/trust.sh`.

**Focused verification.** `bash -n probe/mkrepo.sh`, `bash -n probe/trust.sh`,
and both scripts run with a path outside `~/dely-probe/` exit non-zero, create
no directory and create no Orca terminal — checked with `orca terminal list`
before and after. `git grep -n 'probe/' -- skills/` returns nothing.

**Document impact.** `probe/checklist.md` owns the live verification procedure
that `AGENTS.md` no longer delegates to a suite.

## Acceptance

| Requirement | Instrument | Counterexample | Observed red |
| --- | --- | --- | --- |
| The suite and its CI job are gone and nothing sends a reader to them | `test ! -e tests`, `test ! -e .github/workflows/contracts.yml`, and `git grep -n 'contracts\.sh\|scripts\.test\.js\|workflows/contracts' -- . ':!docs/_plans' ':!docs/decisions.md'` empty | A change that deletes `tests/` but leaves `CONTRIBUTING.md` step 3 telling a contributor to run `bash tests/contracts.sh`: present, runs, and the two absence checks pass. The grep rejects it | |
| A `skills/` change cannot ship with a stale manifest now that no CI job compares them | `test "$(jq -r .version .claude-plugin/plugin.json)" = 0.19.0` and the same for `.codex-plugin/plugin.json` | Advancing only `.claude-plugin/plugin.json`: the repository looks released, and a Codex install then runs 0.19.0 protocol text under a 0.18.0 version string. The second line rejects it | |
| The deleted helper paths are gone from the shipped code, not merely undocumented | the enumerating grep in task 2, plus `node --check` | An edit that removes the `GATES` array but leaves `hasGate` called from `preflight`'s poll loop: `node --check` passes, the file is smaller, and the first real preflight throws `hasGate is not defined`. The grep rejects it | |
| The helper still dispatches, acknowledges, waits and detects a dead worker after the deletion | checklist rows 1 and 4 on a real install: a delivery reaches `ACCEPT` with the branch pushed, and a worker killed after its ACK surfaces as `ATTENTION` within 30 s with exactly one redispatch | A deletion that also drops the ACK peek so `dispatch` prints `DISPATCHED` immediately: row 1 still passes whenever the worker happens to start, and row 4's killed worker never surfaces within 30 s. Row 4 rejects it | |
| A pin whose harness has not answered its trust dialog stops the delivery instead of hanging | checklist row 5: `dely preflight` on a new path with a Claude pin fails in under 60 s, quoting the dialog, leaving no terminal behind | The gate filter's removal taken one step too far, so the quote is built from an empty tail: the run still fails, within the budget, and the human is told nothing usable. Row 5 rejects it, because it checks the quoted text and not just the verdict | |
| `probe/trust.sh` reports trust from the harness store and refuses to act outside `~/dely-probe/` | checklist row 7 end to end, and `probe/trust.sh /tmp/x claude` exiting non-zero with no terminal created | A script that reports success when the dialog leaves the screen: this is what the earlier probe script did twice on 2026-09-14 while `hasTrustDialogAccepted` stayed false, and the second preflight failed for the same reason as the first. The store check rejects it | |
| Install text that remains is the text that works | checklist step 1: install the snapshot in Claude Code, Codex CLI and Cursor Agent CLI using only the README commands, and compare `sha256` of `SKILL.md` at every install location | Deleting the four deferred sections while mangling the Codex command into `codex plugin install dely@dely`, which the README itself warns against: three sections remain and the page reads correctly; the install fails. Step 1 rejects it | |
| The pull request states what 0.19.0 is and carries the live results | a human reads the body against the checklist result table | None; a human reads the diff | |

**Cannot be observed:** the four deferred harnesses, Windows, and the Electron
runtime path lose their only coverage with this delivery — no row exercises
them, and the launcher's Node resolution is observed only on this machine's
Node. The checklist runs against one Orca build, so a shape change between Orca
releases is invisible until it is rerun. Rows 2, 3 and 6 are not part of this
delivery's verification, so a regression only they would catch is unobserved
here.

## Stop conditions

- Orca is unavailable, orchestration is absent, or a probe harness is signed
  out: this is `BLOCKED`, not something to work around, because every live row
  depends on it.
- A live row fails for a reason inside the candidate: that is
  `CHANGES_REQUESTED` against the task that owns it, not a checklist edit.
- The pull-request branch turns out to need a rebase or a merge to push: stop
  and ask. The delivery is explicitly forbidden both.
- Any assumption here that holds for Claude Code and has not been checked for
  Codex CLI or Cursor Agent CLI — in particular the snapshot install commands —
  is verified in checklist step 1 before it is relied on.

## Closure gates

Run from the repository root, on exact HEAD, after the last task:

```
git diff --check
jq -e . plugin.json .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json .cursor-plugin/plugin.json >/dev/null
node --check skills/delivery/scripts/dely.js
git ls-files -z '*.sh' 'skills/delivery/scripts/dely' | xargs -0 -n1 -I{} sh -c 'bash -n "$1"' _ {}
test "$(jq -r .version .claude-plugin/plugin.json)" = 0.19.0
test "$(jq -r .version .codex-plugin/plugin.json)" = 0.19.0
test ! -e tests
test ! -e .github/workflows/contracts.yml
test ! -e skills/delivery/scripts/dely.cmd
git grep -nE 'adoptCommand|adoptedPermission|adoptPath|readAdopts|writeAdopts|recordAdopt|takeAdopt|closeAdopted|closeCreated|waitQuiet|lastOutputAt|launchKind|hasGate|GATES|pinWhy|ELECTRON' -- skills/ && exit 1 || true
git grep -Ei 'pace.?id' -- . ':!docs/_plans' && exit 1 || true
git grep -E '(^|[^A-Za-z0-9])[A-Z][0-9]+[a-z]?([^A-Za-z0-9]|$)' -- . ':!docs/_plans' && exit 1 || true
```

Intermediate task commits are not required to pass this whole set: task 1
writes gates that name files task 4 creates, and the absence commands assert
deletions task 2 performs. The set is asserted on the exact HEAD that is pushed.

Report every gate with the exact command, the summary line verbatim, and the
exit code.
