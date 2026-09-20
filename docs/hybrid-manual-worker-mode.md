# Hybrid Manual Worker Mode

This is an optional project overlay for environments where Orca can host agent terminals but its native supervised `worker-start` path does not yet support a required harness such as Antigravity CLI (AGY). It is not a replacement for the portable `delivery` contract and must be enabled explicitly by the project.

## Roles

- **Control** is the current interactive session. It owns requirement classification, design approval, task boundaries, prompt dispatch, evidence collection, and synthesis. Control does not implement or independently review the candidate.
- **Researcher** performs read-only discovery and documentation lookup.
- **Planner** produces the approved design/decision record and task breakdown.
- **Implementer** changes only the owned paths and runs focused verification.
- **Reviewer** is a fresh session that did not implement the candidate and reproduces the gates.

The project chooses harnesses and models by task complexity. Prefer a fast model for ordinary scouting, a capable implementation model for code changes, and an independent reviewer. Reserve high-quota reasoning models for architecture, high-risk decisions, or a single specialist question; do not spend them on polling, mechanical edits, or repeated context rediscovery.

## Dispatch contract

The human opens and trusts the worker terminals. Control does not create or close those manual terminals. Until the harness is supported by Orca `worker-start`, Control uses the terminal operations exposed by Orca:

1. Read the target terminal and verify its composer/idle state.
2. Send one complete prompt with role, objective, worktree, owned paths, approved context, acceptance criteria, counterexample, verification commands, and handoff format.
3. Wait with a long terminal wait; do not poll in a tight loop.
4. Read the result and record the evidence.
5. Use an exact retry request identifier only when Orca reports an ambiguous send.

Workspace trust remains a human security gate. Permission flags such as `--dangerously-skip-permissions` do not authorize Control to answer trust dialogs. Manual workers do not create or close other terminals and do not expand scope.

## Work shapes

- **Spike:** read-only investigation; no candidate mutation or delivery run.
- **Bounded:** approved short design, one implementer, and one independent whole-change review.
- **Architectural:** approved decision record and plan, task-scoped implementation/reviews, then integration review.

## Handoff

```text
Status: DONE | BLOCKED | NEEDS_REPLAN
Role:
Terminal:
Baseline:
Changed paths:
Contract coverage:
Verification:
Deviations from plan:
Residue:
Git state:
END OF HANDOFF
```

## Waiting and quota

Waiting on an Orca terminal does not continuously consume worker model inference quota. Control consumes model quota when it generates a turn, analyzes output, or sends another prompt. Use long waits and reuse completed research. Do not dispatch multiple agents to rediscover the same question unless adversarial comparison is part of the approved design.

## Migration

When Orca supports the required harness reliably, remove this overlay from the project configuration and return dispatch to `dely:delivery`. Keep the approved design, acceptance, ownership, review, and release invariants unchanged.
