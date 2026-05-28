# Task Context — `academy notes` CLI

**Source spec (canonical scope):** `docs/notes-cli-spec.md`
**Tier:** LIGHT
**OUT_DIR:** `docs/tasks/notes-cli`

## Feature Summary

Add an append-only `academy notes` subcommand so Academy agents can capture
short-lived steering into their `notes.md` surface cheaply (without reading the
whole file first).

Commands:
- `academy notes add "..."` — append one Markdown bullet to the agent's `notes.md`.
- `academy notes add <agent> "..."` — same, with explicit agent target.
- `academy notes list [--last N]` — print the most recent N bullets (default 12).
- `academy notes list <agent> [--last N]` — same, explicit agent target.

Appended line format: `- YYYY-MM-DD HH:MM: <text>` (local time, single line
unless caller passes multi-line text).

## Technical Research

All work lands in the existing single-file CLI `scripts/agent.mjs` (Node ESM,
no deps) plus tests in `tests/agent-cli.test.mjs`. No new files required.

### Existing patterns to mirror

- **Arg parsing** — `parseArgs(argv)` at `scripts/agent.mjs:58` is a `switch` on
  the first token returning a `{ command, ... }` descriptor. Add `case 'notes':`
  that parses a sub-subcommand (`add` | `list`), an optional agent name, the
  text/`--last` flag. Mirror `extractPassthrough` style for flag handling.
- **Main dispatch** — `main()` switch at `scripts/agent.mjs:727`. Add
  `case 'notes':` calling a new handler.
- **Usage text** — `printUsage()` at `scripts/agent.mjs:80`. Add a `notes` line
  and an example.
- **Agent resolution** — `agentDir(name)` at `scripts/agent.mjs:116` returns
  `join(AGENTS_ROOT, name)`; `AGENTS_ROOT` is `~/.academy/agents` (overridable
  via `AGENTS_ROOT` env, used in tests). `validateName()` at `:105` enforces the
  kebab-case `NAME_RE`.
- **notes.md location** — `<agentDir>/notes.md` (see `notes_path` at
  `scripts/agent.mjs:386` and scaffold writer at `:696`).
- **notes.md scaffold template** — inline `TEMPLATES['notes.md']` at
  `scripts/agent.mjs:263`. Spec §"Agent Instruction" wants this scaffold to tell
  agents to use `academy notes add "..."`.
- **Date/time** — codebase uses `new Date().toISOString().slice(0,10)` for dates
  (e.g. `:286`, `:695`). For notes we need local date **and** time
  (`YYYY-MM-DD HH:MM`), so derive from a `new Date()` using local getters.
- **FS** — `readFileSync`/`writeFileSync`/`appendFileSync` from `node:fs`
  (currently `readFileSync`/`writeFileSync` are imported at `:18`;
  `appendFileSync` is NOT yet imported — add it). Append must not read+rewrite
  the whole file (spec §Behavior).
- **Errors** — pattern is `console.error(...); process.exit(1)` (see
  `validateName`, `runAgent:603`). Reuse for missing-agent / missing-text.

### Test harness

- `tests/agent-cli.test.mjs` uses `node --test`, spawns the real CLI via
  `bin/academy` against a temp `AGENTS_ROOT`. New tests follow the same spawn
  pattern. Per CLAUDE.md, also exercise the real CLI binary directly after build.

## Filled Assumptions (silent decisions — reviewer-visible)

1. **Env var name** — Spec says resolve agent via `ACADEMY_AGENT_HOME` /
   `ACADEMY_AGENT_NAME`. But `runAgent` (`:618-622`) actually exports
   `ACADEMY_AGENT_DIR` and `ACADEMY_AGENT_NAME` — `ACADEMY_AGENT_HOME` is never
   set. *Default:* resolve in priority order **explicit `<agent>` arg →
   `ACADEMY_AGENT_DIR` → `ACADEMY_AGENT_NAME` → error**, and additionally accept
   `ACADEMY_AGENT_HOME` as a synonym for `ACADEMY_AGENT_DIR` for spec
   compatibility. *Source: inferred from code; reconciles spec with reality.*
2. **Resolution precedence** — explicit agent-name argument wins over env vars.
   *Source: default.*
3. **`list` on missing/empty notes.md** — print nothing (or a short "(no notes)"
   note to stderr) and exit 0; only a missing *agent* is a hard error. Spec lists
   "missing-notes-file errors" as a test → treat missing notes file for a *valid*
   agent gracefully; reserve error for unresolvable agent. *Source: default;
   confirm in review.*
4. **"Recent N" ordering** — bullets are appended chronologically; `list --last N`
   prints the final N matching `- `-prefixed lines in file order (oldest→newest of
   that tail). *Source: default.*
5. **Bullet detection for `list`** — a "note bullet" is a top-level line starting
   with `- ` (excludes headers, the `_(...)_` scaffold italics, `---`).
   *Source: default.*
6. **Multi-line text** — if caller passes text containing newlines, store as-is
   under one bullet (spec: "one line unless the caller explicitly provides
   multi-line text"). No auto-wrapping. *Source: spec §Appended Format.*
7. **Append idempotency/locking** — single `appendFileSync` call; no locking
   (not a concurrency-sensitive surface). *Source: default; spec Non-Goals imply
   simplicity.*

## Out of Scope (from spec §Non-Goals)

- No auto-deletion, expiry, or graduation to other surfaces/skills.
- No ranking, dedupe, or LLM summarization.
- No JSON storage layer.
- Cleanup/graduation/expiry remain manual + nightly consolidation.

## Verification Spine

- `notes add` from agent home → bullet appended to `<dir>/notes.md` with
  `- <date> <time>: <text>` format → assert via `list` + file read.
- `notes add <agent> "..."` (outside agent home) → targets correct agent file.
- `ACADEMY_AGENT_DIR` (and `ACADEMY_AGENT_HOME`) resolution → append targets the
  env-pointed agent.
- `notes list` default → returns ≤12 most recent bullets; `--last N` honored.
- Unresolvable agent → non-zero exit + usage hint; missing notes file for valid
  agent → graceful empty `list`.
- Scaffold `notes.md` template mentions `academy notes add "..."`.
