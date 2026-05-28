# Academy Notes CLI Spec

## Goal

Make proactive note capture cheap for Academy agents. Agents should be able to
append short-lived steering to `notes.md` without first reading the whole file.

## Runtime

Implement in Node.js inside the existing `academy` CLI for wide local
compatibility and consistency with `scripts/agent.mjs`.

## Commands

```bash
academy notes add "User prefers short status updates before file edits"
academy notes list
academy notes list --last 20
```

When outside an agent home:

```bash
academy notes add <agent> "User prefers short status updates before file edits"
academy notes list <agent> --last 20
```

## Behavior

- `add` appends a single Markdown bullet to the target agent's `notes.md`.
- `add` must not read or rewrite the whole notes file except as needed for a
  simple append operation.
- `list` prints only recent note bullets, defaulting to the last 12.
- Notes remain human-editable Markdown.
- The command should work from project-level launches using
  `ACADEMY_AGENT_HOME` / `ACADEMY_AGENT_NAME` when available.
- If no agent can be resolved, fail with a short usage hint.

## Appended Format

```md
- 2026-05-28 14:30: User prefers short status updates before file edits.
```

Use local time. Keep entries one line unless the caller explicitly provides
multi-line text.

## Non-Goals

- No automatic deletion.
- No graduation to `knowledge.md`, `role.md`, `identity.md`, or skills.
- No ranking, dedupe, or LLM summarization.
- No JSON storage layer.

Cleanup, graduation, and expiry stay with manual editing and nightly
consolidation.

## Agent Instruction

The default `notes.md` scaffold should tell agents to use:

```bash
academy notes add "..."
```

for useful temporary steering, corrections, stakeholder facts, caveats, and raw
learnings that are not yet durable enough for another surface.

## Tests

Add CLI tests covering:

- appending from an agent home
- appending by explicit agent name
- resolving `ACADEMY_AGENT_HOME`
- `list` defaulting to 12 entries
- missing-agent and missing-notes-file errors
