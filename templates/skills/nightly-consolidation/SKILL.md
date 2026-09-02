---
name: nightly-consolidation
description: Use during {{agent_name}}'s scheduled nightly memory consolidation to update daily memory surfaces and write an observable dreams report.
---

# Nightly Consolidation

This skill runs as {{agent_name}}'s nightly memory pass. It turns recent
experience with the user into tighter next-day context without rewriting the
agent's identity or job definition casually.

## Agent Paths

These files are already loaded into the session context. Open or edit them when
you need exact current text, need to preserve surrounding context, or need to
write the nightly result.

- Agent home: `{{agent_dir}}`
- `identity.md`: `{{identity_path}}`
- `role.md`: `{{role_path}}`
- `knowledge.md`: `{{knowledge_path}}`
- `goals.md`: `{{goals_path}}`
- `priorities.md`: `{{priorities_path}}`
- `threads.md`: `{{threads_path}}`
- `notes.md`: `{{notes_path}}`
- `dailys.md`: `{{dailys_path}}`
- Memory observations: `{{memory_observations_path}}`
- Dreams directory: `{{dreams_dir}}`
- This skill: `{{nightly_consolidation_path}}`
- Knowledge-curation contract: `{{knowledge_curation_path}}`

## Purpose

Prepare tomorrow's version of the agent. The expected outputs are:

- an updated `dailys.md` with the last 7 working-day summaries
- conservative updates to `threads.md`, `notes.md`, and `priorities.md`
- evidence-backed `knowledge.md` graduations applied by the dedicated curator
- optional proposed changes for `goals.md`, `role.md`, `identity.md`,
  deferred `knowledge.md` candidates, or skills
- a dreams report at `{{dreams_dir}}/MM-YY-DD.md`

## Source Material

Use `{{memory_observations_path}}` as the primary source. It contains the
observations recorded from this Academy agent's own sessions. Then use
recent session context and gather only enough additional evidence to avoid
guessing:

1. Read today's observation JSONL from `{{memory_observations_path}}` if it
   exists.
2. Read yesterday's observation JSONL when the nightly job may have run after
   midnight or the prior day was missed.
3. Search with concrete terms from recent work, the agent name, and active
   thread names when more evidence is needed.
4. Read previous dreams reports only when checking whether a recommendation is
   recurring or already handled.

The agent-local observation archive is the required basis for this workflow.
It is the only source that can establish eligibility. If the archive is empty,
stop before editing any memory surface, delegating to the curator, or writing a
dreams report.

{{memory_bridge_guidance}}

## Edit Boundaries

Autonomous edits are allowed for:

- `dailys.md`
- `threads.md`
- `notes.md`
- `priorities.md`
- the nightly dreams report

The nightly parent may add transient notes before delegation. Then the
foreground `knowledge-curator` subagent receives exclusive ownership of
`notes.md` and `knowledge.md` for the curation phase. The parent must wait for
it to finish and must not edit either file during that phase.

After the curator returns and manifest verification finishes, the parent may
reduce `knowledge.md` and `notes.md` only to reduce size. It must never add
content to either file, and it must never reverse a curator graduation
decision. The parent may also reduce `priorities.md`, `threads.md`, and
`dailys.md` during the post-curator budget phase. `identity.md`, `role.md`,
and `goals.md` remain propose-only.

Do not directly rewrite `identity.md`, `role.md`, `goals.md`, or skills from
this workflow unless the user explicitly requested that specific change.
Instead, put a proposal in the dreams report.

## Procedure

1. Determine today's date and the dreams filename using `MM-YY-DD` format.
2. Review recent evidence: loaded context, the observation archive, current
   surfaces, and recent dreams reports if useful.
3. Write a concise daily entry for `dailys.md`. Keep only the last 7 working
   days. Each entry should capture work done, decisions, blockers, user
   steering, and the next useful step.
4. Reconcile `threads.md`:
   - mark completed work done or remove it from active attention
   - demote stale active items to idle or parked
   - add only concrete active pursuits with a next step
5. Add any new transient steering to `notes.md` before delegation. Do not
   graduate or expire notes in the parent.
6. Reconcile `priorities.md` when recent evidence clearly changes next focus.
   Keep 3-5 priorities. Do not turn every unfinished task into a priority.
7. Invoke the foreground `knowledge-curator` subagent in Claude Code or
   `knowledge_curator` in Codex for the bounded knowledge-graduation phase.
   Tell it to use its preloaded `knowledge-curation` skill and confirm the
   contract at `{{knowledge_curation_path}}`; wait for it to finish and retain
   its application manifest.
8. Re-read `knowledge.md` and `notes.md` after the curator returns. Compare the
   files with its manifest. Do not edit either file during manifest
   verification. After verification, only the reduce-only budget edits in the
   following steps are allowed.
9. Run `academy budget {{agent_name}} --json`. The reply is the shared response
   envelope: `contract_version`, `ok`, `command`, then the report. Read
   `withinBudget`, `surfaces`, and `violations` from the top level. The command
   exits 0 for any answer it can compute, so read `ok` and `withinBudget`, never
   the exit status. Record the per-surface baseline estimate, cap, overage, and
   enforced/advisory verdict.
10. If no enforced surface is over cap, set Surface Budget status to `pass`.
11. If an enforced surface is over cap — `withinBudget` is `false`, or an entry
    in `violations` has `enforced: true` — trim reduce-only surfaces and re-run
    `academy budget {{agent_name}} --json`. The parent may reduce
    `knowledge.md` and `notes.md` only to reduce size, may reduce
    `priorities.md`, `threads.md`, and `dailys.md`, and must keep
    `identity.md`, `role.md`, and `goals.md` as proposals only.
    Repeat the trim and re-check cycle until every enforced surface passes or
    further reduction is not possible without violating the edit boundary.
12. Set Surface Budget status to `pass` only when all enforced surfaces pass.
    Status converging only when every still-blocking enforced surface has reduced its overage by at least 20% of that surface's baseline overage.
    The 20% value is a minimum progress floor, not a maximum deletion limit.
    Status failed when neither pass nor the 20% convergence floor can be reached. Converging and failed are explicitly not success.
    Both recur on the next nightly run.
13. Write the dreams report, incorporating the curator manifest and Surface
    Budget results. Always write the dreams report on pass, converging, and
    failed, including curator failure.
14. End with a concise completion summary and include the dreams report path.
    Name the Surface Budget status. Describe only `pass` as budget success;
    describe `converging` or `failed` as an unmet budget.

## Curator Failure Handling

If the curator is unavailable, times out, fails, or does not return a valid
manifest:

- leave `knowledge.md` unchanged when the curator did not write it
- preserve all source notes
- do not apply the proposed edits yourself
- finish `dailys.md`, `threads.md`, `priorities.md`, and the dreams report
- set the dreams report's Knowledge Graduation status to `failed` and record
  the exact reason under Verification
- run `academy budget {{agent_name}} --json` once, populate every
  `## Surface Budget` row from the `surfaces` list in that envelope, and record
  `pass` when `withinBudget` is `true` or `failed` otherwise
- mark budget trimming as skipped because the curator manifest was unavailable

If the curator partially changed a file before failing, report the detected
mismatch and preserve any source note whose destination was not verified. Do
not conceal the partial state with a parent-authored repair.

## Dreams Report Format

Create or replace `{{dreams_dir}}/MM-YY-DD.md`:

```markdown
# Dreams - MM-YY-DD

## Inputs
- Recent memory sources consulted:
- Important gaps or unavailable sources:

## Changes Made
- `dailys.md`:
- `threads.md`:
- `notes.md`:
- `priorities.md`:

## Knowledge Graduation
- Status: completed | skipped | failed

### Applied
- Decision: apply | consolidate | correct
- Candidate:
- Evidence:
- Knowledge section changed:
- Source notes retired:

### Deferred
- Candidate:
- Reason:

### Expired Notes
- Note:
- Reason:

### Verification
- `knowledge.md` re-read:
- `notes.md` re-read:
- Mismatches or partial failures:

## Proposed Changes
- `goals.md`:
- `role.md`:
- `identity.md`:
- `knowledge.md`: deferred candidates requiring human judgment only
- skills:

## Surface Budget
- Overall status: pass | converging | failed
- `identity.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `role.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `knowledge.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `goals.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `priorities.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `threads.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `notes.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict
- `dailys.md`: baseline estimate, final estimate, cap, final overage, and enforced/advisory verdict

## Tomorrow
- Recommended first move:
- Watchouts:
```

Use `None` where no changes or proposals were warranted. The dreams report is
for observability; it should be specific enough that the user can see why the
agent will behave differently tomorrow.

Advisory over-cap `identity.md`, `role.md`, and `goals.md` changes are
proposals under `## Proposed Changes`, never edits.

## Anti-Patterns

- Rewriting stable identity, role, or goals from one noisy day.
- Treating raw observations as permanent knowledge.
- Making priorities a duplicate task list.
- Letting `dailys.md` grow beyond 7 entries.
- Hiding skipped evidence or failed memory commands.
