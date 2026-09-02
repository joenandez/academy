# Academy

Portable, workspace-aware AI agents, and a published JSON contract that lets a
client product drive them.

An Academy agent is a directory of Markdown, not a framework object. Eight boot
surfaces describe who the agent is and what it is working on. Academy compiles
them into one system prompt and launches the agent through Claude Code or Codex
against whatever project you are in. Every command also answers JSON, so a
desktop app, a web service, or another CLI can render and manage agents without
reading Academy's source.

**Status: `0.4.0`, contract version 1.** The stable release is on npm.
Install it with `npm install -g @joenandez/academy`.

## Requirements

- **Node.js 18 or later.** The CLI is pure ESM Node with no npm dependencies.
- **`helm-tasks`** on your `PATH` — the scheduler Academy registers each agent's
  nightly consolidation job with. This is a hard dependency of the agent
  lifecycle: without it `create`, `hire --spec`, `delete`, `rename`, and
  `archive` fail with `runtime_unavailable`. Read commands are unaffected.
- **A runtime.** `claude` for Claude Code, `codex` for Codex. You need the one
  you intend to launch. `doctor` reports which are available.

## Install

```bash
# Stable release install
npm install -g @joenandez/academy

# Contributor checkout
git clone https://github.com/joenandez/academy.git
cd academy
npm link          # makes `academy` available globally
```

There is no build step and no `npm install`. Then confirm the link resolved and
read the version Academy reports for itself:

```bash
academy doctor --json
```

`doctor` is the discovery command and the version source; there is no
`academy --version`. Its payload names the supported contract versions, the
build version, the package root, the agents root, the event log, the published
command list, runtime availability, and health counts.

## Create and run an agent

```bash
academy create kai            # scaffold ~/.academy/agents/kai/
academy run kai               # launch Claude Code against the current project
academy run kai --agent codex -- exec "say hello"
academy list
academy inspect kai --json
```

Agents live at `~/.academy/agents/<name>/` by default. Set `AGENTS_ROOT` to put
them anywhere else; two installs with different roots are fully independent.

`academy hire` is the interactive alternative to `create`: it runs a domain
research flow and writes all eight surfaces for you. `academy hire --spec
<file> --json` does the same headlessly from a JSON specification.

## The eight boot surfaces

Each agent directory holds eight editable Markdown files. `academy create` and
every `academy run` compile them into
`.academy/generated/academy-system-prompt.md` — roughly 5–6k tokens combined.

| Surface | Contains | Soft cap |
| --- | --- | --- |
| `identity.md` | Values, character, voice, persona | ~400 |
| `role.md` | Job, responsibilities, deliverable shape | ~400 |
| `knowledge.md` | Domain expertise, frameworks, patterns | ~1500–2500 |
| `goals.md` | Strategic objectives (cap 3) | ~150 |
| `priorities.md` | Weekly direction (3–5 visible) | ~250 |
| `threads.md` | Active work pursuits | ~1750 |
| `notes.md` | Micro-steering staging area | ~500 |
| `dailys.md` | Last 7 working days | ~1000 |

`academy tokens <name>` estimates the compiled prompt by surface, and
`academy budget <name>` reports which surfaces are over their cap.

## Skills

Skills are Academy's one extension primitive, and the same file shape serves
both "a competency the agent has" and "how to use this tool". Academy renders
them for Claude Code under `.claude/skills/` and for Codex under
`.agents/skills/`, from one source.

Four universal skills ship with every agent: `check-in`, `self-update`,
`nightly-consolidation`, and `knowledge-curation`. Nightly consolidation
delegates evidence-backed graduation of notes into knowledge to a bounded
knowledge-curator subagent and writes its report under `dreams/`.

## Commands

Fourteen commands are contract. `doctor` publishes the list, and a client should
read it from there rather than hard-coding it.

```bash
academy doctor [--json]              # discovery, health, and the version source
academy list [--json]                # every agent, plus the archived ones
academy inspect <name> [--json]      # one agent
academy tokens <name> [--json]       # compiled prompt size by surface
academy budget <name> [--json]       # surfaces over their soft cap
academy sessions [--agent <name>] [--json]
academy events --since <seq> [--logid <id>] [--json]
academy create <name> [--json]
academy hire                         # interactive
academy hire --spec <file> [--json]  # headless
academy rename <old> <new> [--json]
academy archive <name> [--json]
academy unarchive <name> [--json]
academy delete <name> [--json]
academy migrate [--dry-run] [--json]
```

`run`, `nightly`, `notes`, `clean`, and `root` also work and are deliberately
not contract: `run` spawns with inherited stdio and can never emit an envelope,
`nightly` is called by the scheduler, and the rest are conveniences for a
person. See §6 of the integration guide.

## For client authors

Everything a client may depend on is in
[`docs/integration-guide.md`](docs/integration-guide.md): the response envelope,
the exit rule, the compatibility floor, all fourteen published commands, the
fifteen error codes, the event log, the agent directory layout, and an explicit
list of what is **not** contract. Anything not in that document is internal and
may change in any release.

The shape in one line: success is JSON on stdout with exit 0, failure is JSON on
stderr with exit 1, and exit status is 0 if and only if `ok` is true.

```json
{ "contract_version": 1, "ok": true, "command": "doctor", "version": "0.4.0" }
```

Academy ships a conformance suite for client authors. It imports no Academy
source and asserts only what a client can observe:

```bash
node --test conformance/*.test.mjs                          # this build
ACADEMY_BIN=/path/to/academy node --test conformance/*.test.mjs   # any build
```

Every test builds its own throwaway install with a fresh temporary `HOME` and
`AGENTS_ROOT`, so it can drive the full lifecycle without reaching any agent on
the machine running it. `conformance/README.md` explains each file.

## Academy is client-agnostic, with one documented exception

No identifier in Academy's source names a specific client product, with exactly
one deliberate exception: **the memory sync bridge**,
`hooks/memory_bridge.mjs`. It copies observation memory from one specific host
product into an agent's `memory/observations/` for nightly consolidation, and it
is **off unless `ACADEMY_MEMORY_BRIDGE=1` is set**. Unset, a scaffolded agent
names no client at all — no client-named environment key is read, no
client-named tool permission is written, and no client-named prose appears in
any skill.

Treat it as an exception, not as a pattern. It is not a plugin point and not a
template for a second client. Integration guide §12 has the full statement.

## Layout

```
academy/
├── .claude-plugin/           # plugin + marketplace manifests
├── bin/academy               # CLI entry
├── scripts/cli/              # CLI implementation
├── scripts/release-check.mjs # read-only release readiness gate
├── scripts/publish-tree.mjs  # allow-list publish tree generator
├── skills/hire/SKILL.md      # the hire skill
├── templates/skills/         # universal skills copied into every agent
├── conformance/              # client conformance suite
├── docs/integration-guide.md # the published client contract
└── hooks/
    ├── hooks.json            # lifecycle hook config
    └── memory_bridge.mjs     # the one client-specific file, off by default
```

## Design notes

- **No adapters.** External CLIs are used as-is. A missing capability is a
  feature request against that project, not glue here.
- **Skills are the unifying primitive.** One file shape for competencies and for
  tool documentation, rendered for both runtimes from one source.
- **Generated system prompt.** The eight surfaces stay editable Markdown.
  Compilation at launch is local file IO only; the slow work stays nightly.
- **Lifecycle hooks only.** Hooks are for runtime side effects, not for startup
  context transport.
- **Portable plugin layout.** Each agent has a `.claude-plugin/` symlink to this
  package, so running Claude Code inside the agent directory keeps Academy's
  lifecycle hooks available.

## Releasing

`node scripts/release-check.mjs` is the read-only readiness gate. It mutates
nothing, packs into a temporary directory, asserts the packed file list against
the declared published surface, runs the conformance suite against the unpacked
tarball, and proves `git status --porcelain` is byte-identical before and after.
`.agents/skills/release/SKILL.md` is the release procedure and calls it from
every mode.

## Licence

MIT. See [`LICENSE`](LICENSE). Changes are recorded in
[`CHANGELOG.md`](CHANGELOG.md).
