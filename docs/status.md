# Academy v3 — Status & Next Steps

**As of:** 2026-05-04
**Phase:** 0 (MVP) shipped — see [`scope.md`](./scope.md) §10 for full phasing

---

## TL;DR

Phase 0 is implemented in this repo (`/Users/joe/Dev/academy`). The CLI scaffolds agents with the v3 8-surface boot model, per-file SessionStart hooks fire on `claude` invocation in an agent's cwd, and the hire skill is authored to drive the end-to-end hire flow. The first real end-to-end hire (DoD item) has **not yet been run** — that's the next concrete action.

The legacy v1/v2 repo at `/Users/joe/Dev/the_academy` is untouched and still functional for existing v2 agents; per scope §10 it stays as read-only reference until v3 stabilizes.

---

## What shipped (Phase 0)

### File inventory

```
academy/
├── .claude-plugin/
│   ├── plugin.json              # Academy plugin manifest (name=academy, hooks→hooks/hooks.json)
│   └── marketplace.json         # Local marketplace entry
├── bin/academy                  # CLI entry shim (npm bin → scripts/agent.mjs)
├── scripts/agent.mjs            # CLI: create / hire / run / list / clean / destroy / root  (~476 LOC)
├── skills/hire/SKILL.md         # v3 hire flow → 8 boot surfaces + 5–10 skills  (~360 LOC)
├── hooks/
│   ├── hooks.json               # 8 SessionStart entries — one per surface
│   └── inject_surface.py        # one-surface-per-call injector  (~118 LOC)
├── docs/
│   ├── scope.md                 # Source of truth (moved from the_academy)
│   └── status.md                # This file
├── package.json                 # type=module, bin=academy
├── README.md
└── .gitignore
```

Substantive code total: **~954 LOC** across the three working files. Well under the <1500 LOC ceiling in scope §2.5.

### Cherry-picks from `the_academy` (literal copies + adaptations, per §10)

- Plugin manifest scaffolding (`.claude-plugin/{plugin,marketplace}.json` shape)
- SessionStart hook output format (`{"hookSpecificOutput": {"hookEventName", "additionalContext"}}`)
- Helm CLI invocation shape (used as-is — referenced in hire skill, no glue)
- Subspace CLI invocation shape (same — referenced, no glue)
- Hire flow orchestration shape (research → extraction → file generation pipeline)
- Permissions/settings template
- Academy CLI structural shape (`agent.mjs`: create/run/list/clean/destroy commands)

### Explicitly NOT cherry-picked (per §10)

- Manifest-based context chunking (`context/manifest.json`)
- `inject_section.py` and `lib/session-hooks.mjs` context-injection wrapper
- Consolidation engine (the appender model)
- `profile/intelligence.md` generation
- `experiments.md` / `changelog.md` / `how-you-work.md` / `priorities.md` / `_mission.md` generators
- v1/v2 hire skill body (wrong shape)
- Any Helm or Subspace adapter/wrapper code
- Existing test suite

### The 8 boot surfaces (scope §3)

Scaffolded by `academy create <name>` at `~/.academy/agents/<name>/`. Each has a placeholder template in `scripts/agent.mjs::TEMPLATES`:

| File | Soft cap | State after `create` | State after `hire` |
| --- | --- | --- | --- |
| `identity.md` | ~400 | Placeholder | Persona + voice + working philosophy |
| `role.md` | ~400 | Placeholder | Title, objective, responsibilities, cadence, sources |
| `knowledge.md` | ~1500–2500 | Placeholder | 5–8 lightweight domain sections from research |
| `goals.md` | ~150 | Empty (3 slots) | 3 strategic objectives from hire sheet |
| `priorities.md` | ~250 | Empty (2 slots) | 3–5 weekly priorities from first assignment |
| `threads.md` | ~700 | Active/Idle/Parked headers | Empty (populates over time) |
| `notes.md` | ~500 | Empty | Empty (populates over time) |
| `dailys.md` | ~1000 | Empty | Empty (Phase 3 daily primitive populates) |

### Verification (smoketest results from 2026-05-03)

| Check | Result |
| --- | --- |
| `academy create v3-smoketest` scaffolds 8 surfaces + agent.yaml + CLAUDE.md + .claude/skills + settings.local.json + .claude-plugin/ symlink + hooks/ symlink | ✅ |
| All 8 hooks emit valid `hookSpecificOutput` JSON | ✅ |
| Empty-agent boot context | **387 tokens** (placeholders only — populates to ~5–6k after hire) |
| `academy list` shows new + legacy v2 agents without breaking either | ✅ |
| `academy clean` truncates `notes.md` and `threads.md` only | ✅ |
| `academy destroy` requires `--force`; refuses without | ✅ |
| Plugin scaffold reachable via symlinks: `~/.academy/agents/<name>/.claude-plugin/plugin.json` and `hooks/inject_surface.py` both resolve | ✅ |

---

## What is **not** built (deferred by design)

Per scope §10 — these are out of scope for Phase 0:

- **Notes graduation engine** — manual user review for now
- **Knowledge curation engine** — manual edits for now
- **Skill spawning/refinement from observations** — Phase 4
- **Subspace CLI feature requests** — Phase 2 (issues filed in Subspace repo, not Academy code)
- **Agent-scoped memory search** — uses existing `subspace-memory search` as-is
- **Internal tool skill SKILL.md instructions** for email/calendar — Phase 1
- **WIP-limit injection enforcement** — visual surface only for now, no auto-evict
- **Auto-demotion of stale threads** — manual or simple time-based for now
- **Daily/weekly primitives + their prompts** — Phase 3 (the_academy's `daily-sweep.sh`, `weekly-sweep.sh`, `performance-review.md`, `memory-consolidation.md`, `strategy-review.md` are wrong-shaped for the 8-surface model)

---

## Definition of done — Phase 0 (scope §10)

| DoD item | State |
| --- | --- |
| One agent hired end-to-end via v3 hire flow | ⏳ **Not yet run** — `academy hire` is wired and ready; hasn't been invoked against an interactive Claude Code session |
| Agent runs scheduled work through Helm | ⏳ Wired into hire skill step 6i (uses `helm-tasks schedule` directly per §2.5); validate after first hire |
| All 8 boot files populated and injected via SessionStart hooks | ✅ Scaffold + injection verified; population happens during hire |
| Manual edits to all 8 surfaces work | ✅ Plain markdown at `~/.academy/agents/<name>/<surface>.md` |
| Boot context measured at ~5–6k tokens | ✅ Templates carry the caps; empty agent at 387 tokens, post-hire targets ~5–6k by surface caps |
| User can interact via Claude Code in agent's cwd | ✅ `academy run <name>` cd's to agent dir, exports `ACADEMY_AGENT_DIR`/`ACADEMY_AGENT_NAME`, spawns `claude` |

---

## Next steps (in order)

### 1. Make the CLI globally invokable

```bash
cd /Users/joe/Dev/academy
npm link        # or: chmod +x bin/academy && symlink to ~/.local/bin
which academy   # confirm
academy --help
```

### 2. Make the plugin discoverable to Claude Code

The hire skill is registered under the Academy plugin (`skills/hire/SKILL.md`). For `academy hire` (which spawns `claude` with `--append-system-prompt "Invoke the academy:hire skill immediately."`) to actually find the skill, the plugin needs to be installed.

Options:
- **Local marketplace:** `/plugin marketplace add /Users/joe/Dev/academy` then `/plugin install academy@academy-local`
- **Symlink approach:** symlink `~/.claude/plugins/academy` → `/Users/joe/Dev/academy/.claude-plugin/` (confirm with the patterns-sessionstart-hooks skill if needed)

Verify by running `/plugin` in any Claude Code session and confirming `academy` is listed and enabled.

### 3. Run the first end-to-end hire

```bash
academy hire
```

This launches an interactive Claude Code session at the Academy package root with the hire skill loaded. Walk through Step 0–7. The skill calls `academy create <slug>` itself in step 6a, then writes content into the resulting agent dir.

**Validate as you go:**
- After 6c–6g, run `~/.academy/agents/<slug>/<surface>.md` for each surface and read it manually — does each feel right at its target size?
- Run `/Users/joe/Dev/academy/hooks/inject_surface.py knowledge` from inside the agent dir — confirm the boot context is now in the 5–6k range total.
- Run `academy run <slug>` and verify all 8 surfaces appear in the SessionStart context block.

### 4. (Optional) Register a Helm work session

If the first hire produced a schedule, hire step 6i should already have called `helm-tasks schedule …`. Confirm with:

```bash
helm-tasks list --cwd ~/.academy/agents/<slug> --pretty
```

### 5. Archive the_academy

Per scope §10:

> When v3 stable, rename `the_academy` → `the_academy_archive`. `dev/academy` becomes the canonical home.

Don't archive yet — wait until at least one v3 agent has run productively for a week. Existing v2 agents (wren, jett, mango, growth-analytics, teach, jax) keep running against the_academy plugin during this validation window.

### 6. Phase 1 (after v3 is stable)

Author internal tool SKILL.md instructions (documentation only, not adapter code):
- `scheduler` — how to invoke `helm-tasks schedule/list/cancel`
- `email` — how to invoke Subspace agent email (AgentMail-backed)
- 30-min spike: confirm Claude Code's native skill discovery handles registry needs (skip building one if so)

### 7. Phase 2 (parallel track — Subspace repo)

File feature requests against Subspace, not Academy code:
- `subspace tasks --agent <name>` filter + status field + auto-update `last_touched`
- `subspace-memory search --agent <name>` flag

Once shipped in Subspace, author the `threads` and `agent-memory-search` internal tool skills referencing the new flags.

---

## Key design constraints to preserve

(Re-read [`scope.md`](./scope.md) before any non-trivial change.)

1. **No-customization constraint (§2.5):** Helm and Subspace CLIs are used as-is. No adapter classes, no wrapper code, no local patches. If a capability is missing, file a feature request against the respective project. Internal tool skills are SKILL.md *instructions*, never glue code.
2. **8 surfaces, 8 hooks, no manifest:** the dedicated SessionStart hook per file replaces v2's manifest-based chunking + `inject_section.py`. Don't reintroduce a manifest.
3. **Skills are unifying (§4):** same SKILL.md shape for both external skills (competencies) and internal tool skills (CLI usage docs). Mechanically identical.
4. **Cap + staleness mechanisms are distinct (§5):** size = WIP-limit at injection (not at file); staleness = auto-demotion across status tiers. Don't conflate.
5. **Knowledge curation is by reference + uniqueness + user signal (§7):** keep the trap cell (low-ref/high-uniqueness — billing-cycle warnings, etc.) until counter-evidence + lack of user affirmation over long absence.
6. **Notes is staging, not storage (§6):** long-staying notes are a smell. Most graduate to `knowledge.md`, some to skill / role / identity, some expire.

---

## Files to know

| File | Purpose |
| --- | --- |
| `docs/scope.md` | Source of truth — read before any architectural change |
| `scripts/agent.mjs` | CLI implementation; `TEMPLATES` constant defines the 8 surface placeholders |
| `hooks/inject_surface.py` | Per-surface SessionStart hook; resolves agent dir via `ACADEMY_AGENT_DIR` env or `agent.yaml` walk-up |
| `hooks/hooks.json` | 8 SessionStart entries — one `python3 inject_surface.py <surface>` per surface |
| `skills/hire/SKILL.md` | The hire flow — Steps 0–7; the generation gate (§6) is the load-bearing block |
| `.claude-plugin/plugin.json` | Plugin manifest; `hooks` field points at `hooks/hooks.json` |

---

## Open questions for next session

- **Plugin install ergonomics:** what's the cleanest install story for end users (and for me during dev)? Local marketplace vs symlink vs npm postinstall hook?
- **Hire skill robustness:** does `academy hire` (which spawns `claude` with `--append-system-prompt`) actually pick up the hire skill reliably, or do we need an explicit `/academy:hire` slash command instead?
- **Agent-dir resolution from arbitrary cwd:** should `academy run` continue to cd into the agent dir, or should it support running from a project dir with the agent dir injected via env? Phase 0 keeps it simple (cd into agent home); revisit if the workspace-agnostic story matters more.
- **Phase 3 prompt authoring:** when we get there, the v2 `performance-review.md` / `memory-consolidation.md` / `strategy-review.md` are wrong-shaped. New prompts will need to target the 8-surface model directly (notes graduation, threads demotion by `last_touched`, knowledge curation by reference + uniqueness).
