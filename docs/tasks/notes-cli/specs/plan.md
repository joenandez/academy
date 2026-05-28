# Implementation Plan — `academy notes` CLI (LIGHT)

**Canonical scope:** `docs/notes-cli-spec.md`
**Context:** `docs/tasks/notes-cli/task_context.md`
**Tier:** LIGHT

## 1. Overview

Academy agents need a cheap, append-only way to capture short-lived steering into
their `notes.md` surface without reading the whole file first. We add a `notes`
subcommand to the existing single-file `academy` CLI (`scripts/agent.mjs`) with
two actions: `add` (append one Markdown bullet via `appendFileSync`) and `list`
(print the last N bullets, default 12). Agent identity resolves from an explicit
`<agent>` argument or, when running inside an agent home, from env vars set by
`academy run`. This is a pure additive change — no new files, no storage layer,
no new dependencies — that follows the CLI's established `parseArgs` → `main()`
dispatch pattern.

## 2. Technical Approach

The change lands entirely in `scripts/agent.mjs`, mirroring how existing commands
are wired, plus tests in `tests/agent-cli.test.mjs`.

- **Arg parsing** — Extend `parseArgs` (`scripts/agent.mjs:58`) with
  `case 'notes':`. Parse `rest[0]` as the action (`add` | `list`). For both
  actions, the next token is an **optional** agent name: it's treated as the
  agent only if it matches `NAME_RE` (`:47`) AND (for `add`) more tokens follow,
  OR (for `list`) it isn't a flag. Remaining tokens: for `add`, join the rest as
  text; for `list`, parse `--last N`. Return a descriptor like
  `{ command:'notes', action, name, text, last }`.
- **Agent resolution** — New helper `resolveAgentDir(explicitName)`:
  1. explicit `<agent>` arg → `agentDir(name)` (validate via `validateName`);
  2. else `ACADEMY_AGENT_DIR` env (set by `runAgent`, `:620`) → use directly;
  3. else `ACADEMY_AGENT_HOME` env (spec synonym) → use directly;
  4. else `ACADEMY_AGENT_NAME` env → `agentDir(name)`;
  5. else `console.error` usage hint + `process.exit(1)`.
  Verify the resolved dir exists (same guard as `runAgent:603`).
- **`add` handler** — Build a timestamp `YYYY-MM-DD HH:MM` from local-time
  getters on a `new Date()` (NOT `toISOString`, which is UTC). Format
  `- ${stamp}: ${text}\n` and `appendFileSync(notesPath, line)`. No read of the
  existing file. If `notes.md` doesn't exist for a valid agent, append still
  creates it (acceptable; or scaffold first — keep simple: append creates).
- **`list` handler** — `readFileSync` the notes file (graceful empty if missing),
  filter lines starting with `- ` (excludes headers, `_(...)_` italics, `---`),
  take the last N (default 12), print to stdout.
- **Dispatch** — Add `case 'notes':` to `main()` (`:727`) calling the handler.
- **Usage** — Add `notes add/list` lines + an example to `printUsage()` (`:80`)
  and to the header comment block (`:9`).
- **Scaffold instruction** — Update `TEMPLATES['notes.md']` (`:263`) to tell
  agents to run `academy notes add "..."` for temporary steering (spec
  §"Agent Instruction").
- **Imports** — Add `appendFileSync` to the `node:fs` import (`:18`).

Follow the shape of existing handlers like `cleanAgent` (`:686`) for the
validate → resolve dir → guard exists → act → `console.log` confirmation flow.

## 3. Critical Files for Implementation

- `scripts/agent.mjs` — Core logic: add `parseArgs` case, `resolveAgentDir`
  helper, `notesAdd`/`notesList` handlers, `main()` dispatch, `printUsage`
  update, `TEMPLATES['notes.md']` instruction, `appendFileSync` import.
- `tests/agent-cli.test.mjs` — Test to extend: add `node --test` cases for
  add/list/resolution/errors using the temp-`AGENTS_ROOT` spawn pattern.

## 4. External Dependencies — Verify Before Implementation

**No new packages.** Uses only Node built-ins already imported from `node:fs`,
`node:os`, `node:path` (`appendFileSync` is the only new symbol, from the
already-imported `node:fs` module). Nothing to verify against a registry.

## 5. Verification — How We Know This Works

- `notes add "txt"` from agent home → `verifies by:` new test "appends a note
  from agent home" — file ends with `- <YYYY-MM-DD HH:MM>: txt`.
- `notes add <agent> "txt"` outside home → `verifies by:` test "appends by
  explicit agent name" — correct agent's `notes.md` mutated, others untouched.
- `ACADEMY_AGENT_DIR` / `ACADEMY_AGENT_HOME` resolution → `verifies by:` test
  "resolves agent from env" — append targets env-pointed dir.
- `notes list` default cap → `verifies by:` test "list defaults to 12" — given
  >12 bullets, exactly 12 most-recent lines printed.
- `notes list --last N` → `verifies by:` test asserting N lines returned.
- Unresolvable agent → `verifies by:` test "missing agent errors" — non-zero
  exit + usage hint on stderr.
- Missing notes file for valid agent on `list` → `verifies by:` test — exit 0,
  empty/`(no notes)` output.
- Append does not rewrite file → `verifies by:` observable — pre-existing
  content + scaffold preserved after `add` (assert prefix unchanged).
- Direct CLI exercise (per CLAUDE.md) → `verifies by:` running `bin/academy
  notes add/list` against a temp `AGENTS_ROOT` and observing real output.

## 6. Out-of-Bounds — DO NOT add

- No auto-deletion, expiry, or pruning of old notes.
- No graduation/promotion to `knowledge.md` / `role.md` / `identity.md` / skills.
- No dedupe, ranking, search, or LLM summarization.
- No JSON or DB storage layer — Markdown file only.
- No file locking / concurrency coordination for appends.
- No `--edit`, `--delete`, or `--clear` subactions (out of scope; `clean`
  already truncates).
- No reading the whole notes file on `add` (token-efficiency is the point).
- No new third-party dependencies.

## 7. Risks & Filled Assumptions

### Risks
- **UTC vs local time** — `toISOString` is UTC; spec requires local time. *Mitigation:*
  build the stamp from local `getFullYear/getMonth/getDate/getHours/getMinutes`
  with zero-padding; assert format in tests.
- **Agent name vs text ambiguity in arg parsing** — a one-word note could look
  like an agent name. *Mitigation:* treat the first post-action token as an agent
  only when it matches `NAME_RE` and there is following text (for `add`) / it's
  not a flag (for `list`); document precedence; cover with tests. Accept the edge
  case that a single bare `NAME_RE`-shaped word is ambiguous — quoting resolves it.
- **Appending to non-existent notes.md** — append auto-creates the file without
  scaffold. *Mitigation:* acceptable for valid agents; `list` handles missing
  file gracefully. Accept and monitor.

### Filled Assumptions
- Env var is `ACADEMY_AGENT_DIR` (what `runAgent` actually sets), with
  `ACADEMY_AGENT_HOME` accepted as a spec-compat synonym. *Spec named the latter;
  reconciled with code.*
- Explicit `<agent>` arg takes precedence over env vars.
- `list` treats only `- `-prefixed top-level lines as note bullets.
- Missing notes file on `list` for a valid agent → graceful empty, exit 0; only
  an unresolvable agent is a hard error.
- Multi-line text stored as-is under one bullet; default is single-line.
- Default `--last` is 12 (spec §Behavior; spec examples also show `--last 20`).
