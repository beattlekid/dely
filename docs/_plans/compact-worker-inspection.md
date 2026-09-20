# Plan — compact, setup-documented worker inspection

Decision record: `docs/decisions.md` under “Ship compact worker inspection through the
existing cross-platform helper”.

**Baseline:**

## Goal

The bundled Dely helper provides a cross-platform, run-scoped command that reduces a
full Orca worker-list response to the fields a coordinator routes on, fails visibly
when that evidence cannot be trusted, and is discoverable through both setup guidance
and installation documentation. This plan does not automate recovery or install a
global executable.

## Allowed scope

```text
skills/delivery/scripts/dely.js
probe/workers-filter.js
skills/delivery/SKILL.md
skills/setup/SKILL.md
README.md
docs/decisions.md
docs/_plans/compact-worker-inspection.md
.claude-plugin/plugin.json
.codex-plugin/plugin.json
AGENTS.md
```

`rg --files` enumerated the runtime, both owning skills, the installation document,
the probe surface, the two versioned manifests, and the repository gate owner. There is
no colocated test directory or package registry file; the focused probe is added under
the existing `probe/` surface. The durable decision is carried because it owns the new
public helper contract; this transient plan is deleted before release-binding review.

## Forbidden scope

`harnesses.json`, `.cursor-plugin/plugin.json`, Orca configuration, user PATH, and all
plugin caches are excluded: the command changes neither harness discovery nor the
unversioned Cursor manifest and does not mutate installations during development.
Existing dispatch, wait, release, and worker lifecycle semantics are unchanged.

## Execution envelope

Protected dirty paths: none; `git status --short` was empty before the design record.

Branch, base, remote, and pull-request target:
`feat/hybrid-manual-worker-rules`, based on `origin/main`, pushed to `origin`, with a
draft pull request targeting `main`.

Resolved phase pins: implementation uses Cursor Agent CLI,
`cursor-grok-4.6-high`, effort `default`; review uses Claude Code,
`claude-opus-5`, effort `medium`.

Authority: this plan may commit only its owned paths, run gates, push the named branch,
and open or update its draft pull request. It may not merge, force-push, stash, reset,
clean, change user-machine setup, or edit outside owned scope.

## Tasks

### 1. Compact worker evidence is executable and discriminating

**Behaviour.** `dely workers --run <id>` returns a compact JSON projection of the
run's workers and exits non-zero when Orca fails or the response shape is untrusted.
Absent optional fields remain absent.

**Direction.** Extend the existing Node helper and add a deterministic fake-Orca probe;
reuse the helper's Orca resolution rather than shell pipelines or a second runtime.

**Files.** `skills/delivery/scripts/dely.js`, `probe/workers-filter.js`.

**Focused verification.** `node probe/workers-filter.js` must exercise a rich valid
row, a missing-nextAction row, and failure/malformed responses. It fails if unrelated
sentinel data survives, optional absence becomes `none`, or errors become `[]`.

**Document impact.** None in this task; the next task owns user and Control guidance.

### 2. Setup and delivery teach the bundled helper

**Behaviour.** Installation docs say the helper ships with the plugin, setup guidance
teaches the exact compact command without installing or trusting anything new, and the
delivery workflow routes first-line worker-list inspection through it while retaining
full Orca inspection for contradictions.

**Direction.** Reconcile the two owning skills and README. Do not add another managed
AGENTS block field or promise global PATH availability.

**Files.** `skills/delivery/SKILL.md`, `skills/setup/SKILL.md`, `README.md`.

**Focused verification.** A repository grep must find the exact `dely workers --run`
contract in all three owners and the README must state that no separate helper install
is required.

**Document impact.** These three files are the owning workflow, setup, and installation
documents; `docs/decisions.md` already records the durable rationale.

### 3. Release metadata and repository gates identify the new skill version

**Behaviour.** Both versioned manifests and the literal repository version gate agree
on `0.21.0`; the transient plan is removed before release review.

**Direction.** Apply the repository's skills-change version rule, run every closure
gate, then delete only this plan as the release reconciliation commit.

**Files.** `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, `AGENTS.md`,
`docs/_plans/compact-worker-inspection.md`.

**Focused verification.** The literal version commands in `AGENTS.md` pass and
`test ! -e docs/_plans/compact-worker-inspection.md` passes before final review.

**Document impact.** `AGENTS.md` owns the literal gate; both manifests own the shipped
version.

## Acceptance

| Requirement | Instrument | Counterexample | Observed red |
| --- | --- | --- | --- |
| Compact output contains only routing evidence | `node probe/workers-filter.js` | A valid command prints the full Orca row including a sentinel transcript/metadata field | Pending implementation |
| Optional and error semantics remain trustworthy | `node probe/workers-filter.js` | Missing `nextAction` is emitted as `none`, or an Orca/malformed response succeeds as an empty list | Pending implementation |
| Setup and install guidance own the command | exact repository grep across the two skills and README | README mentions the command but setup never teaches it, so a configured project cannot discover the workflow | Pending implementation |
| Versioned skill release is coherent | manifest JSON gate plus literal `0.21.0` assertions | Runtime/skills change while either versioned manifest remains `0.20.0` | Pending implementation |

**Cannot be observed:** the fake-Orca probe does not prove compatibility with a future
Orca schema or a live remote worker; documentation grep does not prove a particular
plugin manager's cache refreshed. The existing live release probe remains the boundary
for installed-plugin behaviour.

## Stop conditions

Return `NEEDS_REPLAN` if a useful compact projection requires fields outside the
approved schema, if Orca cannot be substituted deterministically through the existing
CLI seam, if setup would need to mutate global PATH/plugin caches, or if preserving
missing optional fields conflicts with an existing public helper contract.

## Closure gates

Run from `D:\WorkSpace\dely`:

```bash
node probe/workers-filter.js
git diff --check
jq -e . harnesses.json plugin.json .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json .cursor-plugin/plugin.json >/dev/null
node --check skills/delivery/scripts/dely.js
git ls-files -z '*.sh' 'skills/delivery/scripts/dely' | xargs -0 -n1 bash -n
test "$(jq -r .version .claude-plugin/plugin.json)" = 0.21.0
test "$(jq -r .version .codex-plugin/plugin.json)" = 0.21.0
test ! -e skills/delivery/references/harnesses.md
git grep -nE 'adoptCommand|adoptedPermission|adoptPath|readAdopts|writeAdopts|recordAdopt|takeAdopt|closeAdopted|closeCreated|waitQuiet|lastOutputAt|launchKind|hasGate|GATES|pinWhy|ELECTRON|harnessCell' -- skills/ && exit 1 || true
git grep -Ei 'pace.?id' -- . ':!docs/_plans' && exit 1 || true
git grep -E '(^|[^A-Za-z0-9])[A-Z][0-9]+[a-z]?([^A-Za-z0-9]|$)' -- . ':!docs/_plans' && exit 1 || true
test ! -e docs/_plans/compact-worker-inspection.md
```
