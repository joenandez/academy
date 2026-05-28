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

## Purpose

Prepare tomorrow's version of the agent. The expected outputs are:

- an updated `dailys.md` with the last 7 working-day summaries
- conservative updates to `threads.md`, `notes.md`, and `priorities.md`
- optional proposed changes for `goals.md`, `role.md`, `identity.md`,
  `knowledge.md`, or skills
- a dreams report at `{{dreams_dir}}/MM-YY-DD.md`

## Source Material

Use `{{memory_observations_path}}` as the primary source. It contains
Subspace observations copied from this Academy agent's own sessions. Then use
recent session context and gather only enough additional evidence to avoid
guessing:

1. Read today's observation JSONL from `{{memory_observations_path}}` if it
   exists.
2. Read yesterday's observation JSONL when the nightly job may have run after
   midnight or the prior day was missed.
3. Run `subspace-memory status` if the archive is missing, thin, or appears
   inconsistent.
4. Run `subspace-memory timeline --days 2` if more workspace context is needed.
5. Search with concrete terms from recent work, the agent name, and active
   thread names when more evidence is needed.
6. Read previous dreams reports only when checking whether a recommendation is
   recurring or already handled.

If the Academy archive and Subspace memory are unavailable or empty, proceed
from the loaded context and say that in the dreams report.

## Edit Boundaries

Autonomous edits are allowed for:

- `dailys.md`
- `threads.md`
- `notes.md`
- `priorities.md`
- the nightly dreams report

Do not directly rewrite `identity.md`, `role.md`, `goals.md`, `knowledge.md`,
or `.claude/skills/*` from this skill unless the user explicitly requested that
specific change. Instead, put a proposal in the dreams report.

## Procedure

1. Determine today's date and the dreams filename using `MM-YY-DD` format.
2. Review recent evidence: loaded context, Subspace memory, current surfaces,
   and recent dreams reports if useful.
3. Write a concise daily entry for `dailys.md`. Keep only the last 7 working
   days. Each entry should capture work done, decisions, blockers, user
   steering, and the next useful step.
4. Reconcile `threads.md`:
   - mark completed work done or remove it from active attention
   - demote stale active items to idle or parked
   - add only concrete active pursuits with a next step
5. Reconcile `notes.md`:
   - keep short-lived steering that still needs proof
   - expire resolved or stale notes
   - propose graduation when a note belongs in knowledge, role, identity, or a
     skill
6. Reconcile `priorities.md` when recent evidence clearly changes next focus.
   Keep 3-5 priorities. Do not turn every unfinished task into a priority.
7. Write the dreams report.
8. End with a concise completion summary and include the dreams report path.

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

## Proposed Changes
- `goals.md`:
- `role.md`:
- `identity.md`:
- `knowledge.md`:
- skills:

## Tomorrow
- Recommended first move:
- Watchouts:
```

Use `None` where no changes or proposals were warranted. The dreams report is
for observability; it should be specific enough that the user can see why the
agent will behave differently tomorrow.

## Anti-Patterns

- Rewriting stable identity, role, or goals from one noisy day.
- Treating raw observations as permanent knowledge.
- Making priorities a duplicate task list.
- Letting `dailys.md` grow beyond 7 entries.
- Hiding skipped evidence or failed memory commands.
