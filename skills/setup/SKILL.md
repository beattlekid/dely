---
name: setup
description: Configure a project's AGENTS.md with one managed Dely block — per-phase harness, model and effort for implement and review, discovered from the live harness surface. Use at the start of a Control Session, when the project has no managed block, or when those pins need rewriting from the installed harnesses. Not for installing plugins, trusting hooks, or delivering a change; that is delivery.
---

# Setup

Write exactly one managed block into the project's `AGENTS.md`. Discover
models and effort from the installed harnesses. Do not store a catalogue. Do
not install, trust, or enumerate anything.

Read `AGENTS.md` first. Replace only the region between this skill's own
markers. Prose outside the block is not read, merged, moved, or deleted.

## Two rows only

The managed block configures deployment preferences for `implement` and
`review` — nothing else. There is no coordinator or orchestrator field,
because Orca is the constant, required execution plane. There is no control
row, because the current interactive session already exists and is never
dispatched. There is no release row, because release has no LLM worker. There
is no Plan Mode field and no design-skill field: the active design method is
a property of the harness and session, not a Dely setting.

## Two paths

**Quick.** Use the current harness for both `implement` and `review`. Use
that harness's defaults for model and effort, written as the literal
`default`.

**Customize.** For each of `implement` and `review`, offer the discovered
harnesses, models and effort levels and write what the human chooses. Where a
harness exposes no way to pin a model or an effort, write the literal `default`
for that cell and point to Orca's agent default arguments.

Ask which path. Do not start writing until that is answered.

## What to write

Exactly one block, and nothing else:

```markdown
<!-- dely:begin -->
## Dely

Bounded or Architectural work invokes `dely:delivery`; Spike starts no
delivery run.

| Phase | Harness | Model | Effort |
| --- | --- | --- | --- |
| `implement` | … | … | … |
| `review` | … | … | … |
<!-- dely:end -->
```

If the markers already exist, replace the region between them. If they do
not, append the block. Touch nothing else.

## Discovery

Run these commands. They are the catalogue. Do not copy a list from this
package, from memory, or from `docs/`.

- Claude Code models: `claude -p "/model" --output-format json`
- Claude Code effort: `claude -p "/effort" --output-format json`
- Codex: `codex debug models`

The two Claude probes are answered locally: `num_turns` 0, `total_cost_usd` 0,
no model turn. Do not treat them as a dispatch.

Codex slugs with `visibility: hide` are not offered. Codex reasoning levels
are `supported_reasoning_levels` on each slug, not one vocabulary per harness.

A harness with no discovery command here gets the literal `default` for Model
and Effort; point the human to Orca's agent default arguments to set the model.
Do not invent a catalogue, do not prompt a model to learn one, and do not treat
a `/model` slash command as discovery.

A harness that is not installed is omitted from the offer, not an error.

### Cursor Agent CLI

Cursor Agent CLI models: `cursor-agent models` (offer the slug before ` - `).
There is no `--effort` flag: write the literal `default` for Effort. Do not
invent an effort vocabulary, do not strip effort suffixes from slugs, and do
not synthesize parameterized `[effort=…]` forms. Omit Cursor discovery that
is unavailable or unusable rather than guessing.

## Pinning

Where a managed block exists, pin its Harness, Model and Effort for
`implement` and `review` on every dispatch. The literal `default` in Model or
Effort means the harness default is wanted: omit that flag. That is not the
same as an unset cell — defaults are a deployment preference, not a
reproducible pin, and the execution envelope records the configured value and,
where the harness exposes it, the actual observed model and effort.

Where `AGENTS.md` carries no managed block, `delivery` runs `implement` and
`review` on the current harness with harness defaults and omits the model and
effort flags. Setup is a convenience over that fallback, not a precondition
for it.

## When a choice cannot be offered

Where a choice cannot be offered, do not make it. Take the conservative
action — which may be writing a conservative value, and may be doing
nothing — and report the choice that was not offered, naming what was
available and how to set it; do not write that report into the managed
block.

For the `CLAUDE.md` import: if the current harness is Claude Code, the import
is absent, and setup cannot ask, write nothing and report the offer that was
not made.

## Refusals

Stop and report to the human, unchanged, when:

- the markers are broken (a `begin` without a matching `end`, or an `end`
  before its `begin`)
- more than one `<!-- dely:begin -->` is present
- a legacy phase table outside the block contradicts the block

Do not merge two tables, delete a legacy table, or guess which is
authoritative.

## Claude Code and `AGENTS.md`

Claude Code does not read `AGENTS.md`. The persistent instruction reaches
Codex CLI and Cursor Agent CLI natively. It reaches Claude Code only where the
project has a `CLAUDE.md` that imports `AGENTS.md`.

Where the current harness is Claude Code and the project has no `CLAUDE.md`
importing `AGENTS.md`, offer to create a one-line `CLAUDE.md` containing
`@AGENTS.md`. The human accepts or declines. Never write it unasked.

This is not a second managed block: no markers, no configuration, a pointer
at the block rather than a copy of it.

The offer is Claude-Code-only. On Codex the file is inert in the same sense
that it is not imported. Cursor Agent CLI applies `CLAUDE.md` as a rule.

## Trust

After the managed block is written, for each pinned harness whose `Setup`
column in `skills/delivery/references/harnesses.md` is `trust dialog`,
`trust-all confirmation`, or `y/n security question`, open it once for the human with
`orca terminal create --worktree path:<repo> --command "<binary> <permission default>"`.
The binary is `claude`, `codex` or `cursor-agent`; take the permission default
from that harness's row in the table. The human answers that harness's own
dialog; setup never answers it and never writes a harness store. The human
closes the terminal when done. `Orca preflight` and `none` need no step.

## Preflight

Open a Run first as `orca skills get orchestration` describes. Then run
`../delivery/scripts/dely preflight --repo <path> --run <runId>` relative
to this skill. Any `PREFLIGHT … FAIL` (exit 1): do not dispatch to any pin;
relay the printed reason to the human.

## What setup will not do

No plugin or skill install. No hook trust. Setup may open a pinned harness
in an Orca terminal so the human can answer that harness's own trust dialog;
it still never answers the dialog and never writes a harness store
(`~/.claude`, `~/.codex`, or `~/.cursor`). No custom agent creation or
modification. No coordinator installation or field. No control or release row.
No enumeration or invocation of project-owned workflow plugins. No model
catalogue.

Print verified install guidance only when the human explicitly asks for it.
