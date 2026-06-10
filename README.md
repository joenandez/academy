# Academy v3 (Phase 0 — MVP)

Portable AI agents on top of [Subspace's](https://github.com/codename/subspace) agent platform.

## Getting started

**Prerequisites**

- **Node.js v18+** — the CLI is pure ESM Node with zero npm dependencies.
- **Claude Code CLI** (`claude` on your PATH) — required by `academy hire` and
  the default `academy run` runtime.
- **Codex CLI** (`codex` on your PATH) — required when launching
  `academy run <agent> --agent codex`.
- **Subspace + Helm CLIs** (`subspace`, `subspace-memory`, `helm-tasks`) —
  needed for memory sync, nightly consolidation, and task scheduling. Basic
  commands (`create`, `list`, `clean`) work without them; the full agent
  lifecycle does not.

**Subspace-provisioned use**

When Academy is bundled by Subspace, users do not need to clone this repository
or run `npm link`. Subspace installs its trusted Academy entrypoint under its
managed `$SUBSPACE_HOME/bin/academy` path and launches agents through that
entrypoint.

Use `academy root --json`, `academy list --json`, and
`academy inspect <name> --json` for read-only machine contracts. Human output
remains the default when `--json` is absent.

**Clone and link for local development**

```bash
git clone <repo-url> academy
cd academy
npm link        # makes `academy` available globally (no deps to install)
academy --help
```

There is no build step and no `npm install` — `npm link` is all you need for
local development.

**Verify it works**

```bash
academy root              # prints the package root — confirms the link resolved
academy list              # lists agents (empty on a fresh machine)
academy create test-agent # scaffolds ~/.academy/agents/test-agent/
academy run test-agent    # launches Claude Code against the current project
academy run test-agent --agent codex -- exec "say hello"
```

Agents live at `~/.academy/agents/<name>/`, created on first `create`/`hire`.

## What this is

Academy v3 creates **portable, workspace-aware agents** that can run through
Claude Code by default or Codex when selected per launch.
Each agent lives at `~/.academy/agents/<name>/` with eight tight boot surfaces
compiled into `.academy/generated/academy-system-prompt.md` on every `academy run`
(~5–6k tokens combined).

| Surface | Contains | Soft cap |
| --- | --- | --- |
| `identity.md` | Values, character, voice, persona | ~400 |
| `role.md` | Job, responsibilities, deliverable shape | ~400 |
| `knowledge.md` | Domain expertise, frameworks, patterns | ~1500–2500 |
| `goals.md` | Strategic objectives (cap 3) | ~150 |
| `priorities.md` | Weekly direction (3–5 visible) | ~250 |
| `threads.md` | Active work pursuits | ~700 |
| `notes.md` | Micro-steering staging area | ~500 |
| `dailys.md` | Last 7 working days | ~1000 |

Plus a unified **skills** primitive rendered for both Claude Code
(`.claude/skills/`) and Codex (`.agents/skills/`) covering both
Academy-owned universal skills (`check-in`, `self-update`,
`nightly-consolidation`) and agent/domain skills. Subspace-backed agent
sessions are copied into `memory/observations/` for nightly consolidation,
which writes observable reports under `dreams/`.

This repo is the v3 successor to `the_academy` per the Phase 0 plan in
`docs/tasks/academy-v3/concepts/scope.md` (in `the_academy`).

## Phase 0 scope

- 8 boot files, `dreams/`, and universal skills, scaffolded by `academy create`
- Generated Academy system prompt file from the 8 boot surfaces, refreshed
  before every v3 `academy run`
- Agent-specific memory archive at `memory/observations/`, populated from
  Subspace observations by a lightweight Stop hook
- Nightly Helm task registration for v3 memory consolidation
- Hire flow that runs domain research and produces all 8 surfaces
- Subspace platform dependencies (memory, scheduler, email, tasks) used **as-is** — no adapters

Out of scope until later phases: notes graduation, knowledge curation, skill
spawning, agent-scoped CLI flags, and weekly strategy review.

## CLI

```bash
academy create <name>      # scaffold an agent dir at ~/.academy/agents/<name>/
academy hire               # interactive hire flow (launches Claude Code with the hire skill)
academy run <name>         # launch Claude Code against the current project
academy run <name> --agent claude-code -- <claude args>
academy run <name> --agent codex -- <codex args>
academy list               # list all agents
academy list --json        # machine-readable agent summary records
academy inspect <name>     # inspect one agent
academy inspect <name> --json
academy clean <name>       # truncate notes.md and threads.md
academy destroy <name> --force
academy root               # print the package root
academy root --json        # machine-readable packageRoot + agentsRoot
```

## Install (local dev only)

```bash
cd ~/Dev/academy
npm link        # makes `academy` available globally
academy --help
```

`academy run <name>` uses Claude Code unless `--agent codex` is passed before
the provider passthrough boundary (`--`). Everything after `--` is forwarded to
the selected provider unchanged.

For Claude Code plugin discovery, `academy run <name>` creates a project-local
`.academy/agents/<name>/` plugin instance and launches Claude Code with
`--plugin-dir` pointed there. It also passes `--system-prompt-file` pointing at
the generated `.academy/generated/academy-system-prompt.md` artifact for the
agent.

For Codex, `academy run <name> --agent codex` writes or refreshes
`$CODEX_HOME/academy-<name>.config.toml` and launches Codex with
`--profile academy-<name>`, `-C <cwd>`, `--add-dir <agentDir>`, and a
launch-time `-c model_instructions_file=...` override pointing at the same
neutral Academy prompt. Academy does not write Codex auth, provider, model, MCP,
or global plugin settings into that profile, so the user's normal global Codex
environment can continue to merge. Trusted project `.codex/config.toml` and
project `.agents/skills` also merge through Codex's normal project behavior.
On project launches, Academy also bridges its universal skills into
`<project>/.agents/skills` with symlinks when those skill names are not already
owned by the project, so Codex can discover the Academy skills from the project
cwd without replacing project-local skills.

Nightly consolidation is re-registered through Helm when an agent is created or
run. The scheduled command uses Claude Code by default, uses Codex for
Codex-only launches, and for mixed use follows the last runtime selected for
that agent.

## Layout

```
academy/
├── .claude-plugin/           # plugin + marketplace manifests
├── bin/academy               # CLI entry
├── scripts/agent.mjs         # CLI implementation
├── skills/hire/SKILL.md      # v3 hire skill
├── templates/skills/         # universal skill templates copied into agents
└── hooks/
    ├── hooks.json            # lifecycle hook config
    └── sync_memory.mjs       # Stop hook memory bridge
```

## Design notes (read the full scope for context)

- **No adapters.** Helm + Subspace CLIs are used as-is. Missing capability =
  feature request against the relevant project, not glue here.
- **Skills are the unifying primitive.** Same file shape for "competencies the
  agent has" and "how-to-use-Subspace-CLI" docs.
- **Generated system prompt.** The 8 boot surfaces remain editable Markdown
  sources. `academy create` and `academy run` compile them into
  `.academy/generated/academy-system-prompt.md`; launch-time rendering is local
  file IO only, while slower consolidation remains nightly/manual.
- **Lifecycle hooks only.** Hooks are reserved for runtime side effects such as
  the Stop memory bridge, not startup context transport.
- **Portable plugin layout.** Each agent has a `.claude-plugin/` symlink to
  this package, so running Claude Code in `~/.academy/agents/<name>/` keeps the
  Academy lifecycle hooks available.
