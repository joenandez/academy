# Academy v3 (Phase 0 — MVP)

Portable AI agents on top of [Subspace's](https://github.com/codename/subspace) agent platform.

## What this is

Academy v3 is a Claude Code plugin that creates **portable, workspace-aware agents**.
Each agent lives at `~/.academy/agents/<name>/` with eight tight boot surfaces
loaded into every session via SessionStart hooks (~5–6k tokens combined).

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

Plus a unified **skills** primitive at `.claude/skills/` covering both
Academy-owned universal skills (`check-in`, `self-update`) and agent/domain
skills.

This repo is the v3 successor to `the_academy` per the Phase 0 plan in
`docs/tasks/academy-v3/concepts/scope.md` (in `the_academy`).

## Phase 0 scope

- 8 boot files and universal skills, scaffolded by `academy create`
- 8 per-file SessionStart hooks (`hooks/inject_surface.py`)
- Hire flow that runs domain research and produces all 8 surfaces
- Subspace platform dependencies (memory, scheduler, email, tasks) used **as-is** — no adapters

Out of scope until later phases: notes graduation, knowledge curation, skill
spawning, agent-scoped CLI flags, daily primitives.

## CLI

```bash
academy create <name>      # scaffold an agent dir at ~/.academy/agents/<name>/
academy hire               # interactive hire flow (launches Claude Code with the hire skill)
academy run <name>         # launch Claude Code against the current project
academy list               # list all agents
academy clean <name>       # truncate notes.md and threads.md
academy destroy <name> --force
academy root               # print the package root
```

## Install (local dev)

```bash
cd ~/Dev/academy
npm link        # makes `academy` available globally
academy --help
```

For Claude Code plugin discovery, `academy run <name>` creates a project-local
`.academy/agents/<name>/` plugin instance and launches Claude Code with
`--plugin-dir` pointed there.

## Layout

```
academy/
├── .claude-plugin/           # plugin + marketplace manifests
├── bin/academy               # CLI entry
├── scripts/agent.mjs         # CLI implementation
├── skills/hire/SKILL.md      # v3 hire skill
├── templates/skills/         # universal skill templates copied into agents
└── hooks/
    ├── hooks.json            # 8 SessionStart entries
    └── inject_surface.py     # one-surface-per-call injector
```

## Design notes (read the full scope for context)

- **No adapters.** Helm + Subspace CLIs are used as-is. Missing capability =
  feature request against the relevant project, not glue here.
- **Skills are the unifying primitive.** Same file shape for "competencies the
  agent has" and "how-to-use-Subspace-CLI" docs.
- **Per-file SessionStart hooks.** No manifest, no chunking, no inject_section.
  Each surface is a single command in `hooks/hooks.json`.
- **Portable plugin layout.** Each agent has a `.claude-plugin/` symlink to
  this package, so running Claude Code in `~/.academy/agents/<name>/` boots
  the 8 surfaces automatically.
