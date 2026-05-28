# Academy v3 - Latest Status

**As of:** 2026-05-28  
**Phase:** Phase 0+ / early Phase 3 wiring  
**Related originals:** [`scope.md`](./scope.md), [`status.md`](./status.md)

## Summary

Academy v3 has moved beyond the original Phase 0 snapshot in
`docs/status.md`. The core portable-agent scaffold exists, a real v3 agent has
been hired and run productively, universal skills are now part of the agent
contract, and the first version of agent-specific memory capture plus nightly
consolidation has been introduced.

The architecture has also changed in one important way from the original scope:
the eight durable surfaces are no longer delivered through eight SessionStart
hooks. They remain the canonical editable sources, but `academy create` and
`academy run` compile them into `.claude/academy-system-prompt.md`, and
`academy run` launches Claude Code with `--system-prompt-file`. Hooks are now
reserved for lifecycle side effects, currently the Stop-hook memory bridge.

The repo is therefore no longer just the original Phase 0 MVP. It is a working
v3 base with several later-phase primitives started, but it still needs real
end-to-end validation and the rest of the self-improvement loop before it is
"where we wanted it to be."

## What Is Done

### Phase 0 Base

- `academy create`, `academy hire`, `academy run`, `academy list`,
  `academy clean`, `academy destroy`, and `academy root` exist.
- Agents are scaffolded under `~/.academy/agents/<name>/`.
- The eight v3 surfaces exist as plain Markdown files:
  `identity.md`, `role.md`, `knowledge.md`, `goals.md`, `priorities.md`,
  `threads.md`, `notes.md`, and `dailys.md`.
- `agent.yaml`, `CLAUDE.md`, `.claude/settings.local.json`,
  `.claude/skills/`, plugin symlinks, and hook symlinks are scaffolded.
- `academy run` supports project-local plugin instances under
  `<project>/.academy/agents/<name>/` so agents can run from project workspaces
  while keeping durable agent state in agent home.
- Legacy v2 agents, including Growth Analytics, are delegated back to their
  recorded Academy root instead of being forcibly migrated.

### Prompt Delivery

- The eight surfaces are compiled into
  `.claude/academy-system-prompt.md`.
- `academy create` writes the initial generated prompt.
- `academy run` refreshes the prompt before launch.
- `academy run` passes the generated prompt with `--system-prompt-file`.
- Startup context is no longer transported by SessionStart hooks.

This is a deliberate update to the original scope. It preserves the
eight-surface model while avoiding prompt-layer conflicts with Subspace startup
context injection.

### Plugin And Hook Contract

- `.claude-plugin/plugin.json` advertises the Academy v3 plugin identity.
- `hooks/hooks.json` is reduced to lifecycle behavior only.
- The active v3 hook is the Stop hook:
  `node ${CLAUDE_PLUGIN_ROOT}/hooks/sync_memory.mjs`.
- Legacy `inject_section.py`, `.ops/scripts`, `observe_turn.py`, and other v2
  hook paths are not part of the v3 hook contract.

### Universal Skills

Academy-owned universal skills are now scaffolded and refreshed for v3 agents:

- `check-in` - 1:1 alignment and calibration protocol.
- `self-update` - safe update procedure for durable surfaces and skills.
- `nightly-consolidation` - nightly memory reflection and low-risk surface
  maintenance.

This replaces the earlier hire-time expectation that each agent would be seeded
with 5-10 generic skills. Hires now define the agent and optionally add
task-specific skills only when recurring work needs a real procedure.

### Agent-Specific Memory Bridge

- V3 agents now scaffold:
  - `memory/sessions.jsonl`
  - `memory/observations/`
- The Stop hook records the Claude session id in `memory/sessions.jsonl`.
- When Subspace memory is available, the Stop hook copies matching Subspace
  observation JSONL lines into `memory/observations/YYYY-MM-DD.jsonl`.
- Sync is session-filtered and deduplicated.
- The bridge does no LLM work; it is a narrow file-copy/sync step.

This gives nightly consolidation an Academy-owned memory archive to reflect on
without requiring custom Subspace memory search first.

### Nightly Consolidation

- `academy create` attempts to register a Helm task for nightly consolidation.
- The default schedule is `0 22 * * *` in the local timezone.
- The scheduled command runs `academy run <name>` with a prompt to use the
  `nightly-consolidation` skill.
- The skill uses `memory/observations/` as its primary source.
- It may directly update low-risk surfaces:
  - `dailys.md`
  - `threads.md`
  - `notes.md`
  - `priorities.md`
- It proposes, but does not directly apply, higher-impact changes to:
  - `goals.md`
  - `role.md`
  - `identity.md`
  - `knowledge.md`
  - `.claude/skills/*`
- Each run writes an observable report under `dreams/MM-YY-DD.md`.

### Real-Agent Validation So Far

- The original `status.md` statement that no real v3 hire had run is obsolete.
- Marlow has been scaffolded as a real v3 agent and has produced useful work.
- Marlow validation surfaced practical gaps around skills, cron cadences,
  notification behavior, and boot-context size.
- Growth Analytics remains a v2 legacy agent and should stay on the delegated
  v2 path until an explicit migration decision is made.

### Regression Coverage

Current tests cover:

- plugin manifest identity and hook config
- Stop-hook memory sync contract
- absence of startup context injection hooks
- project-local plugin launch
- generated system prompt creation and refresh
- universal skill scaffolding and backfill
- nightly Helm task registration shape
- agent-home launch behavior
- legacy v2 delegation
- memory sync happy path and missing-Subspace no-op behavior

The targeted CLI and sync suite has passed with 12 tests.

## What Changed From The Original Plan

### Changed: Surface Transport

Original plan:

- Eight SessionStart hooks, one per surface.

Current implementation:

- Eight surfaces are compiled into one generated system prompt file.
- Lifecycle hooks are reserved for runtime side effects.

Reason:

- A single prompt file avoids startup prompt layering conflicts with Subspace
  and keeps prompt rendering deterministic, fast, and local-only.

### Changed: Skill Bootstrap

Original plan:

- Hire creates 5-10 initial skills from research.

Current implementation:

- Academy always provides universal `check-in`, `self-update`, and
  `nightly-consolidation`.
- Hire may add at most targeted, task-specific skills when recurring work needs
  procedural support.

Reason:

- Generic skill seeding was underspecified and produced unclear contracts.
  Universal skills give every agent the same baseline operating loop.

### Changed: Daily Primitive Timing

Original plan:

- Daily/nightly primitives were Phase 3.

Current implementation:

- A narrow nightly consolidation primitive has started early because it is the
  missing bridge between Subspace session observations and agent-specific
  durable memory.

Reason:

- Without agent-specific observations, there is nothing concrete for nightly
  consolidation to reflect on.

## Remaining Work To Reach The Intended v3

### 1. End-To-End v3 Memory Smoke

Validate the new memory bridge with a real Academy v3 session:

- run `academy run <agent>` inside a Subspace workspace
- complete/stop a real Claude Code session
- confirm `memory/sessions.jsonl` records the session
- confirm `memory/observations/YYYY-MM-DD.jsonl` contains only matching
  session observations
- confirm duplicate Stop-hook invocations do not duplicate observations
- confirm missing Subspace memory degrades cleanly

This is the most important immediate validation gap.

### 2. End-To-End Nightly Consolidation Smoke

After a real memory sync:

- run the nightly consolidation prompt manually or through Helm
- confirm it reads `memory/observations/`
- confirm it updates only low-risk surfaces by default
- confirm it writes `dreams/MM-YY-DD.md`
- confirm the dreams report explains evidence, changes made, gaps, and
  proposed higher-impact changes
- confirm it does not rewrite identity, role, goals, knowledge, or skills
  without explicit user direction

### 3. Helm Runtime Validation

The registration shape is tested, but real runtime behavior still needs
validation:

- confirm `helm-tasks` accepts the scheduled job shape in the live environment
- confirm the nightly job runs from the agent home
- confirm `academy` resolves correctly in the scheduled environment
- confirm logs/failures are inspectable
- decide how completion notification should work

### 4. Documentation Reconciliation

Update stale docs so the project has one coherent story:

- update or supersede `docs/status.md`
- update `docs/scope.md` sections that still say SessionStart hooks are the
  surface transport
- decide whether to keep old hook references as historical notes or remove
  them from active architecture sections
- ensure README, scope, status, and tests all describe the same v3 contract

### 5. Runtime Hook Audit

Confirm no stale hook path remains active:

- no v2 `.ops/scripts` references
- no `inject_section.py`
- no `observe_turn.py`
- no SessionStart context injection hook in active config
- decide whether obsolete `hooks/inject_surface.py` should be deleted,
  archived, or kept only as a diagnostic utility

### 6. Phase 1 Internal Tool Skills

Create standardized SKILL.md instructions for platform tools:

- scheduler / Helm usage
- agent email / AgentMail usage
- tasks / Subspace tasks usage
- memory search usage

These should remain documentation skills, not adapter code.

### 7. Phase 2 Subspace Platform Requests

Track platform work separately from Academy code:

- agent-scoped task filtering
- task lifecycle/status fields for active, idle, parked, done
- `last_touched` support
- agent write paths for tasks
- Academy-specific or agent-scoped memory search

There is already a follow-up task to revisit Academy-specific memory search.
That remains lower priority now that agent-specific observation archives exist,
but it is still part of the intended v3.

### 8. Phase 3 Daily Primitive Reliability

The current nightly consolidation skill is the start, not the full daily
primitive system. Remaining work:

- time-based notes age-out
- thread stale-state demotion
- goals re-affirmation reminder
- daily summary generation discipline
- WIP-limit enforcement
- reliable failure reporting
- clear manual override path

### 9. Phase 4 Self-Improvement Engine

The larger self-improvement engine remains unbuilt:

- route notes to knowledge, skill, role, identity, or expiry
- curate knowledge by reference, uniqueness, and user signal
- spawn skills from repeated procedures
- refine existing skills from observed failures
- retire or split skills
- produce a legible daily diff of all changes and proposals

### 10. Real-Agent Migration Plan

Decide agent by agent:

- keep v2 agents delegated until they need migration
- do not patch Growth Analytics in place without an explicit decision
- migrate important agents by creating fresh v3 homes and validating their
  memory, prompt, skills, and schedules end to end

### 11. Weekly Strategy Review

Weekly strategy review is still intentionally deferred. It should be designed
after nightly consolidation has produced enough real signal to make weekly
reflection meaningful.

## Current Read

Academy v3 now has the right shape for durable, agent-specific memory:

1. Subspace captures the raw session experience.
2. The v3 Stop hook copies that experience into an Academy-local archive for
   the specific agent.
3. Nightly consolidation reflects on that archive.
4. Low-risk surfaces get updated for tomorrow.
5. Higher-impact changes are proposed in `dreams/` for observability.

The remaining risk is not the conceptual model. The remaining risk is runtime
validation and operational reliability: proving the bridge and nightly job work
in real Subspace sessions, then building the rest of the daily/self-improvement
machinery without reintroducing the v1/v2 context bloat that v3 was designed to
escape.

## Recommended Next Order

1. Run the real v3 memory smoke.
2. Run the real nightly consolidation smoke.
3. Reconcile stale docs.
4. Commit the prompt/memory/nightly architecture as the new v3 baseline.
5. Add Phase 1 internal tool skills.
6. Revisit Academy-specific memory search.
7. Build daily primitive reliability.
8. Build the full self-improvement engine.
