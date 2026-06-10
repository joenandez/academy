---
name: self-update
description: Use when maintaining this Academy agent's own context files, routing new steering to the right surface, or deciding whether a durable self-edit is warranted.
---

# Self-Update

This skill teaches {{agent_name}} how to maintain itself without treating every
observation as permanent truth. Use it to route new information to the right
surface, keep boot context tight, and explain self-edits back to the user.

## Agent Paths

These files are already loaded into the session context. Do not re-read them
just to discover what they are. Open or edit them when you need to verify exact
current text, make a change, or preserve surrounding context.

- Agent home: `{{agent_dir}}`
- `identity.md`: `{{identity_path}}`
- `role.md`: `{{role_path}}`
- `knowledge.md`: `{{knowledge_path}}`
- `goals.md`: `{{goals_path}}`
- `priorities.md`: `{{priorities_path}}`
- `threads.md`: `{{threads_path}}`
- `notes.md`: `{{notes_path}}`
- `dailys.md`: `{{dailys_path}}`
- `{{skills_surface}}`: `{{skills_dir}}`
- This skill: `{{self_update_path}}`

## When To Use

- The user gives durable steering: "remember this," "work this way," "update
  your role," or "that is not what I meant."
- A session reveals a reusable domain pattern.
- A repeated workflow deserves a skill.
- Priorities, goals, or threads have changed.
- You notice stale, contradictory, or low-value context.
- During or after a check-in when the user agrees the agent should adjust.

## Core Rule

Default to `notes.md` first unless the update is clearly durable. Graduation
happens when the note proves reusable, not merely because it is recent.

## Capturing To notes.md

Write transient steering with the CLI, not by hand-editing the file:

- Append: `academy notes add "User prefers short status updates before edits"`
- Review recent: `academy notes list` (last 12) or `academy notes list --last 20`

`add` is append-only and never reads the whole file, so it is the cheap, default
way to jot a note mid-task. Capture proactively — corrections, stakeholder
facts, caveats, gotchas, and raw learnings — the moment they appear, rather than
waiting for a check-in. Reserve manual `Edit` of `notes.md` for curation:
pruning stale bullets, or rewriting before graduating content elsewhere. Keep
the visible list within the ~8-12 cap; if it is overflowing, graduate or expire,
do not just keep appending.

## File Routing

- `identity.md`: rare. Mission, principles, voice, durable persona. Update only
  when the agent's character or operating philosophy changes.
- `role.md`: responsibilities, autonomy, guardrails, deliverables, quality bar,
  definition of done. Update when the job changes.
- `knowledge.md`: durable domain knowledge, mental models, frameworks,
  heuristics, canonical references. Update when the agent learned something
  reusable for future work.
- `goals.md`: strategic objectives. Update sparingly, usually with user
  confirmation.
- `priorities.md`: current near-term direction. Update often enough to keep the
  agent pointed at useful work.
- `threads.md`: active work pursuits and their state. Update when starting,
  pausing, resuming, parking, or finishing work.
- `notes.md`: temporary steering, observations, corrections, raw learnings,
  pending curation. Append with `academy notes add "..."` (see "Capturing To
  notes.md"); hand-edit only to curate or graduate.
- `dailys.md`: concise session/day summaries. What happened, decisions,
  blockers, next step.
- `{{skills_surface}}/`: repeatable procedures. Create or edit only when there is a
  clear trigger, procedure, and output shape.

## Update Procedure

1. Identify the new information.
2. Decide whether it is transient, durable, procedural, or strategic.
3. Pick exactly one primary destination.
4. Make the smallest useful edit.
5. Preserve existing useful context; do not rewrite whole files casually.
6. If changing identity, role, goals, or skills, explain why.
7. Report what changed and what did not change.

## Graduation Rules

- `notes.md` -> `knowledge.md` when it becomes a reusable pattern.
- `notes.md` -> `role.md` when it changes behavior or responsibility.
- `notes.md` -> `identity.md` only when it changes durable principles or voice.
- `knowledge.md` -> skill when "how to do this" becomes a repeatable procedure.
- Stale notes expire instead of accumulating.

## Consent And Autonomy

- You may autonomously update `threads.md`, `notes.md`, `dailys.md`, and usually
  `priorities.md`.
- Summarize changes to `knowledge.md`.
- Ask or clearly propose before changing `identity.md`, `role.md`, `goals.md`,
  or creating/editing skills, unless the user explicitly requested it.

## Anti-Patterns

- Turning every user preference into identity.
- Dumping raw research into knowledge.
- Creating skills for one-off tasks.
- Letting `notes.md` become permanent storage.
- Rewriting boot files for style instead of substance.
- Hiding self-edits from the user.
