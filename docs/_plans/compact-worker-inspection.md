# Plan — compact worker inspection and live deployment inventory

Decision record: `docs/decisions.md` under “Ship compact worker inspection through the
existing cross-platform helper”.

**Baseline:** `3b7e36b96a82fbe112a73775d43398893b460f05`

## Goal

The bundled Dely helper provides a cross-platform, run-scoped command that reduces a
full Orca worker-list response to routing fields and a live inventory that validates
agent, model, effort, and launch-command availability before dispatch. Setup and
dispatch refresh derived inventory evidence at most daily on demand, while a manual
command forces refresh. This plan does not silently substitute roles, automate recovery,
or install a global executable.

## Allowed scope

```text
skills/delivery/scripts/dely.js
probe/workers-filter.js
probe/inventory-refresh.js
skills/delivery/SKILL.md
skills/setup/SKILL.md
README.md
harnesses.json
docs/decisions.md
docs/_plans/compact-worker-inspection.md
.claude-plugin/plugin.json
.codex-plugin/plugin.json
AGENTS.md
```

`rg --files` enumerated the runtime, harness registry, both owning skills, installation
document, probe surface, two versioned manifests, and repository gate owner. There is no
colocated test directory or package registry file; focused probes are added under the
existing `probe/` surface. The durable decision is carried because it owns the new public
helper contracts; this transient plan is deleted before release-binding review.

## Forbidden scope

`.cursor-plugin/plugin.json`, Orca configuration, user PATH, operating-system scheduler,
and plugin caches are excluded. The unversioned Cursor manifest is unchanged and the
candidate does not mutate installed harnesses. Existing wait, release, and worker
lifecycle semantics are unchanged.

## Execution envelope

Protected dirty paths: none; `git status --short` was empty before the design record.

Branch, base, remote, and pull-request target:
`feat/hybrid-manual-worker-rules`, based on `origin/main`, pushed to `origin`, with a
draft pull request targeting `main`.

Resolved phase pins after the approved replans: implementation uses Antigravity CLI,
`gemini-3.1-pro-high`, effort `default`; review also uses a fresh Antigravity CLI session
but model `claude-opus-4-6-thinking`, effort `default`. Live discovery on 2026-09-20
found both exact AGY model ids plus the `agy` and `codex` binaries; it did not find
`cursor-agent`. The locally installed `claude` binary has no usable account and is not a
delivery phase.

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

### 2. Live deployment inventory rejects stale pins before launch

**Behaviour.** `dely inventory --repo <path>` forces current binary/model/command
discovery. Automatic setup/dispatch inventory refresh reuses evidence younger than 24
hours and refreshes stale evidence without an LLM turn. A missing configured binary or
model fails before worker launch and lists valid current choices; it never silently
changes phase ownership.

**Direction.** Extend the same Node helper and add a fake-command probe covering fresh
cache, stale cache, forced refresh, missing binary/model, exact model slugs, and a failed
discovery command. Keep cache data derived and machine-local.

**Files.** `skills/delivery/scripts/dely.js`, `probe/inventory-refresh.js`,
`harnesses.json`, `AGENTS.md`.

**Focused verification.** `node probe/inventory-refresh.js` rejects stale evidence
presented as current, silent fallback from an unavailable pin, and lossy AGY model slug
parsing. `jq -e . harnesses.json` validates the registry shape.

**Document impact.** `harnesses.json` owns verified launch/discovery facts; `AGENTS.md`
owns this repository's live phase choices and version gate.

### 3. Setup and delivery teach both bundled helper surfaces

**Behaviour.** Installation docs say the helper ships with the plugin, setup guidance
teaches the exact compact and inventory commands without installing or trusting anything
new, and delivery routes first-line worker-list inspection plus pre-dispatch availability
checks through them while retaining full Orca inspection for contradictions.

**Direction.** Reconcile the two owning skills and README. Do not add another managed
AGENTS block field or promise global PATH availability.

**Files.** `skills/delivery/SKILL.md`, `skills/setup/SKILL.md`, `README.md`.

**Focused verification.** A repository grep must find exact `dely workers --run` and
`dely inventory --repo` contracts in all three owners, including automatic 24-hour and
manual force-refresh guidance; README must state no separate helper install is required.

**Document impact.** These three files are the owning workflow, setup, and installation
documents; `docs/decisions.md` already records the durable rationale.

### 4. Release metadata and repository gates identify the new skill version

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
| Automatic and manual inventory use current executable evidence | `node probe/inventory-refresh.js` | A stale cache or vanished binary/model is accepted, or AGY slugs are shortened/invented | Pending implementation |
| Missing pins never silently change role ownership | `node probe/inventory-refresh.js` | Cursor is absent and dispatch automatically selects another harness instead of returning current choices | Pending implementation |
| Setup and install guidance own both commands | exact repository grep across the two skills and README | README mentions commands but setup never teaches daily/manual refresh, so a configured project cannot discover the workflow | Pending implementation |
| Versioned skill release is coherent | manifest JSON gate plus literal `0.21.0` assertions | Runtime/skills change while either versioned manifest remains `0.20.0` | Pending implementation |

**Cannot be observed:** fake command probes do not prove compatibility with a future
Orca schema, proprietary CLI output change, or live remote worker; documentation grep
does not prove a particular plugin manager's cache refreshed. The existing live release
probe remains the boundary for installed-plugin behaviour.

## Stop conditions

Return `NEEDS_REPLAN` if a useful compact projection requires fields outside the
approved schema, discovery cannot be substituted deterministically through the existing
process seam, current CLI output cannot be parsed without a maintained static model
catalog, setup would need to mutate global PATH/plugin caches, or preserving missing
optional fields conflicts with an existing public helper contract.

## Closure gates

Run from `D:\WorkSpace\dely`:

```bash
node probe/workers-filter.js
node probe/inventory-refresh.js
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
