# dely — Agent Instructions

This repository contains the `dely` package: the `delivery` skill and its
automation-first control protocol for coding agents, supported today on
Claude Code, Codex CLI, and Cursor Agent CLI.

## Source of truth

- The workflow contract is `skills/delivery/SKILL.md`.
- Settled, open, and rejected decisions are recorded in `docs/decisions.md`.
- Installation and onboarding instructions are in `README.md`.
- The closure gates below are the whole structural check. There is no test
  suite and no CI workflow; nothing runs on a pull request automatically.
- Live verification before a release is `probe/checklist.md`, run by a separate
  agent session against a candidate installed from a `git archive` snapshot.
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, and `.github/`
  (issue and pull-request templates) own the human contribution, conduct,
  security, and PR contract; they need no Dely or Orca install to follow.

Repository artifacts are written in English.

## Workflow

- Default branch: `main`.
- Bounded or Architectural work invokes the `delivery` skill; a Spike is
  investigation only and starts no delivery run.
- Durable decisions live in `docs/decisions.md`; transient plans live in
  `docs/_plans/`.
- Maintenance logging is machine-local and opt-in at `~/.dely/log`; no
  project-owned log file is tracked.
- A self-update runs its release phase through the frozen installed plugin
  version, because Control is already using it when the plan starts.
  Candidate changes in this checkout take effect for the next delivery, not
  the one shipping them. Plugin caches and any live worker hook wiring are
  refreshed only between plans.
- A delivery that changes anything under `skills/` advances the version in
  both plugin manifests and the version gate below, within that same delivery.

## Phase dispatch

Name the model and reasoning effort on every dispatch.

<!-- dely:begin -->
## Dely

Bounded or Architectural work invokes `dely:delivery`; Spike starts no
delivery run.

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| `implement` | Cursor Agent CLI | cursor-grok-4.6-high | default |
| `review` | Claude Code | claude-opus-5 | medium |
<!-- dely:end -->

The table is this repository's deployment selection, not the portable
protocol. Per-harness launch mechanics — Orca agent id, permission
defaults, forbidden headless forms, and launch notes — live in
`skills/delivery/references/harnesses.md`.

This project adds no phase-implied sandbox. Native Internet access, closure
gates, result writes and coordinator completion stay available.

## Closure gates

Run from the repository root:

```bash
git diff --check
```

```bash
jq -e . plugin.json .claude-plugin/plugin.json .claude-plugin/marketplace.json .codex-plugin/plugin.json .cursor-plugin/plugin.json >/dev/null
```

```bash
node --check skills/delivery/scripts/dely.js
git ls-files -z '*.sh' 'skills/delivery/scripts/dely' | xargs -0 -n1 bash -n
```

```bash
test "$(jq -r .version .claude-plugin/plugin.json)" = 0.19.0
test "$(jq -r .version .codex-plugin/plugin.json)" = 0.19.0
```

```bash
test ! -e tests
test ! -e .github/workflows/contracts.yml
test ! -e skills/delivery/scripts/dely.cmd
test ! -e git-hooks/pre-push
test ! -e docs/delivery-log.md
test ! -e docs/findings.md
test ! -e docs/harness-surface.md
test ! -e docs/options.md
test ! -e docs/_plans/2026-08-24-automation-first-dely-design.md
test ! -e bin/delivery-doctor
test ! -e bin/delivery-evidence
test ! -e hooks/hooks.json
test ! -e hooks/grok-hooks.json.template
test ! -e hooks/post-tool-journal.sh
test ! -e hooks/session-start-context.sh
```

```bash
git grep -nE 'adoptCommand|adoptedPermission|adoptPath|readAdopts|writeAdopts|recordAdopt|takeAdopt|closeAdopted|closeCreated|waitQuiet|lastOutputAt|launchKind|hasGate|GATES|pinWhy|ELECTRON' -- skills/ && exit 1 || true
```

```bash
git grep -Ei 'pace.?id' -- . ':!docs/_plans' && exit 1 || true
git grep -E '(^|[^A-Za-z0-9])[A-Z][0-9]+[a-z]?([^A-Za-z0-9]|$)' -- . ':!docs/_plans' && exit 1 || true
```

The first three gates prove repository shape and syntax only. A Bounded or
Architectural change to runtime behaviour must also name a focused instrument
that distinguishes the changed behaviour from its failure mode, and a change
to what a worker launch does is verified by running `probe/checklist.md`, not
by these gates.

The version gate is a literal pin. It is what keeps the two manifests from
splitting now that no workflow compares them: a `skills/` change that forgets
one manifest ships different protocol text under the same version string.

The absence commands distinguish a deleted rail from documentation that merely
says it is deleted. The identifier grep is the same instrument applied to code:
it fails on a deletion that removes a definition and leaves a caller.

The disclosure grep is lexical. It catches named consumer identifiers; it does
not catch a quoted consumer path, a branch name, or a session id. A green result
is not a proof of non-disclosure.
