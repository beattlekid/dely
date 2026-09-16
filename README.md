# dely

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/logo.svg">
  <img src="assets/logo-light.svg" alt="dely" width="72" height="72">
</picture>

Ask for a change; Dely takes it through design approval, implementation,
independent review, and a pull request you merge.

https://github.com/user-attachments/assets/83ec539a-6551-4807-8517-0c73e5d171d7

[YouTube](https://www.youtube.com/watch?v=6pRWkhlQSAc)

## Contents

- [Quickstart](#quickstart)
- [Project setup](#project-setup)
- [Install](#install)
- [How Dely works](#how-dely-works)
- [Troubleshooting](#troubleshooting)

## Quickstart

Install Orca, then Dely.

1. Install the [desktop app](https://www.onorca.dev/docs/install).
2. Register the CLI (it ships with the app): Settings → General → Orca CLI.
   See the [CLI overview](https://www.onorca.dev/docs/cli/overview).
3. Enable orchestration: Settings → Experimental. See
   [orchestration](https://www.onorca.dev/docs/cli/orchestration).
4. Preflight:

```bash
orca open
orca status --json
orca orchestration run-list --json
```

`dely:delivery` stops if this preflight fails. On Linux the binary is
`orca-ide` (see the [install docs](https://www.onorca.dev/docs/install)).

Optional agent skills `orca-cli` and `orchestration`:
https://www.onorca.dev/docs/cli/skills

Then:

1. Install `dely` in the harness ([Install](#install)).
2. Open a session in the project.
3. Invoke `dely:setup` (optional).
4. Ask for a change.

## Project setup

In the project, invoke `dely:setup`.

It asks Quick (this harness for both phases) or Customize (pick harness,
model, and effort for `implement` and `review`), then writes one managed
block into `AGENTS.md`. Skip it and `dely:delivery` uses the current
harness and that harness's defaults.

## Install

The plugin is `dely`, from the `dely` marketplace at
`https://github.com/hieuphung97/dely.git`. The skill name is `delivery`;
invoke it as `dely:delivery`. The runtime needs Node 18 or newer on PATH.

### Claude Code

```bash
claude plugin marketplace add https://github.com/hieuphung97/dely.git
claude plugin install dely@dely

claude plugin list                 # verify it is installed
claude plugin update dely          # update (restart required to apply)
claude plugin uninstall dely       # uninstall
```

### Codex CLI

```bash
codex plugin marketplace add https://github.com/hieuphung97/dely.git
codex plugin add dely@dely

codex plugin list                  # verify it is installed
codex plugin marketplace upgrade   # update: see below
codex plugin remove dely@dely      # uninstall
```

`codex plugin marketplace add --ref <ref>` pins the marketplace to a tag
such as `v0.17.0` or an exact full commit SHA. There is no
`codex plugin update`: use `codex plugin marketplace upgrade`. Do not use
`codex plugin install`.

### Cursor Agent CLI

```bash
cursor-agent plugin marketplace add https://github.com/hieuphung97/dely.git

# verify it is installed
cursor-agent plugin marketplace list

# re-index, no fetch
cursor-agent plugin marketplace update dely

# refresh: remove and re-add (remove drops the marketplace, not the plugin)
cursor-agent plugin marketplace remove dely
cursor-agent plugin marketplace add https://github.com/hieuphung97/dely.git
```

The snapshot is addressed by commit, so `marketplace update` only re-indexes
and does not fetch. Remove and re-add the marketplace to pick up new commits,
then choose `Uninstall` from the `Installed` tab and install again from the
`Marketplace` tab of the `/plugin` panel.

Add the marketplace first with `cursor-agent plugin marketplace add`, then in
a Cursor Agent session type `/plugin` and press Enter. Open the `Marketplace`
tab, type `dely` in the search box, press Enter on `dely (dely)`, and choose
`Install for you (user scope)` (or `Install for all collaborators on this
repository (project scope)`).

To uninstall, open the `Installed` tab, select `dely`, and choose
`Uninstall`. `cursor-agent plugin marketplace remove` removes the marketplace
entry and leaves the plugin installed.

Type `/dely` to filter the palette to Dely's `/delivery` and `/setup`.

### Checked versions

These are the versions this README's commands were last locally checked
against — observations, not a promised minimum:

| Tool | Checked version |
| --- | --- |
| Claude Code | 2.1.273 |
| Codex CLI | 0.154.0 |
| Cursor Agent CLI | 2026.09.10-fd3934a |
| Orca | 1.4.203 |

## How Dely works

Ask for a change. Approve the design when asked. Dely implements, a
different session reviews, then opens a PR. You merge. A Spike investigates
only — no delivery run.

Control loads `orca skills get orchestration` and follows that supervised
loop. `dely preflight` checks each distinct pin once before the first
`dely dispatch`. After `DISPATCHED`, Control waits by the harness Control
wake: `background` runs `dely wait`; `waker` runs `dely wait-bg` as its
last command and ends the turn. It never acts on an Orca nudge. `SETTLED`
hands over the batch; `ATTENTION` follows `nextAction`; `STALLED` is read
then waited or recovered; `NO_ACK` and `FAILED` retry once; `DEADLINE` is a
checkpoint (`worker-list` and last output; wait again if progressing; a
second `DEADLINE` with no progress goes to the human); `ERROR` goes to the
human.

The workflow contract is [`skills/delivery/SKILL.md`](skills/delivery/SKILL.md).

## Troubleshooting

- **`dely:delivery` stops immediately.** Orca is not running or a required
  capability is absent, including orchestration. Run the Quickstart
  preflight, then retry.
- **A stale skills copy shadows a newer plugin.** Codex also loads
  `~/.agents/skills`, and a copy left there — or a symlink to it from
  `~/.claude/skills` — wins over the plugin. Compare
  `skills/delivery/SKILL.md` by hash with the copy in those directories, then
  update or remove the shadowing install. The plugin version is not evidence
  about which file runs; the hash is.
- **Codex still behaves the same after `codex plugin marketplace upgrade`.**
  Confirm the remote has new commits. A delivery already running keeps the
  plugin version from its start; open a new session after the upgrade.
- **`AGENTS.md` pins don't seem to apply in Claude Code.** Put
  `@AGENTS.md` in `CLAUDE.md`; Claude Code does not read `AGENTS.md`
  directly.

## Contributing, security, and license

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — issue-first workflow, fork/branch/pull
  request flow, and review expectations. External contributors do not need
  Dely or Orca.
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1.
- [`SECURITY.md`](SECURITY.md) — how to report a vulnerability privately.
- [`docs/decisions.md`](docs/decisions.md) — settled, open, and rejected
  design decisions, with rationale.

[MIT](LICENSE)
