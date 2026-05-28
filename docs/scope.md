
# Academy v3 — Scope

**Status:** scoping complete, MVP-first phased execution **Date:** 2026-05-03 **Supersedes:** `docs/tasks/academy-v2-context-architecture/concepts/scope.md`, `docs/tasks/main/academy_context_v2/specs/plan.md` (Phase 1 watcher/pinned-doc/recall-injection direction)

---

## 1. Problem & Diagnosis

Academy v1/v2 over-rotated on context engineering. \~30-40k tokens of agent-facing surfaces (changelog, intelligence, how-you-work, priorities, mission, experiments, etc.) accreted around a working pull-based core. Each surface looked load-bearing individually; the aggregate is suffocating, the maintenance machinery (consolidation, manifest-based chunking, L1/L2 splits, inject-section, watcher hooks) is brittle, and unwinding feels heavier than rebuilding.

The mechanism (push vs pull) is not the problem. Academy already pulls. The problem is **surface count + surface bloat + monolithic intelligence file**.

The v3 design fixes both by:

1. Splitting the monolithic `intelligence.md` into a clean three-way (identity / role / knowledge) and a unified skills primitive
2. Bounding every always-loaded surface with explicit cap + staleness mechanisms
3. Designing the self-improvement engine as a routing layer between surfaces, not as a content-appender

---

## 2. Architecture (closed)

### Ownership boundary (Academy vs Subspace agent platform)

Academy is a specialized layer on top of Subspace's agent platform. Keep this boundary crisp:

**Academy owns (specialized to Academy):**

- Hire flow
- Agent context management (identity / role / knowledge)
- Skill registry + skill lifecycle
- Self-improvement loop (notes routing, knowledge curation, skill spawning/refining)
- `~/.academy/agents/<name>/` portable plugin layout — **key differentiator** (run anywhere, tied back globally via symlinks)

**Subspace agent platform owns (generic to all Subspace agents):**

- Session memory + memory search (FTS5 + RAG, including agent-scoped search)
- Helm scheduler (cron + headless invocation)
- Agent email (delivery)
- Tasks CLI (workspace/agent task storage)
- Future: agent agnosticism — any model via Anthropic proxy URI + Claude-Code-harness-compatible libraries

Academy agents access Subspace platform capabilities via skills, like any other Subspace agent. There is no Academy-specific scheduler, email pipe, or memory layer — those are dependencies, not embeddings.

### Layered view

```plaintext
Boot context (always loaded, ~5-6k tokens, dedicated SessionStart hook per file)
                                                                 [Academy-owned]
├── identity.md      — who the agent IS
├── role.md          — what the agent DOES
├── knowledge.md     — what the agent KNOWS (the powerhouse)
├── goals.md         — strategic direction (3 hard cap, quarterly)
├── priorities.md    — weekly direction (3-5, WIP-limit)
├── threads.md       — active work threads (5 active visible, system-injected)
├── notes.md         — micro-steering staging area (8-12 cap, graduates or expires)
└── dailys.md        — last 7 working days, ~150 tokens each

Capability layer (on-demand, unified primitive)                  [Academy-owned]
└── .claude/skills/<name>/SKILL.md
    ├── External skills    — competencies/methods (analytics-review, code-review-style)
    └── Internal tool skills — wrappers around bundled tools (email (agentmail),
                               scheduler, threads, agent-memory-search)

Subspace agent platform (dependency, accessed via skills)        [Subspace-owned]
├── Memory: session memory + memory search (incl. agent-scoped, FTS5 + RAG)
├── Tasks: tasks CLI (workspace/agent task storage)
├── Helm: scheduler (cron + headless invocation)
├── Email: agent email delivery
└── (Medium-term) Agent agnosticism — any model via proxy URI + harness libs

Plugin layout                                                    [Academy-owned]
└── ~/.academy/agents/<name>/ portable plugin layout (key differentiator)
```

### 2.5 No-customization constraint on Subspace dependencies

Academy uses Helm CLI and Subspace CLI **as they exist**. No adapter classes, no wrapper code, no local patches.

- If a capability is missing, file a feature request against the respective project (we own both Helm and Subspace).
- "Internal tool skills" are therefore not glue code — they're SKILL.md instructions that tell the agent how to invoke the existing CLI. The skill body might say *"to schedule a recurring run, invoke `helm schedule add ...`"*, and that's the integration.
- Result: Academy code is thin. No integration adapters. MVP estimated <1500 LOC.
- Phase 2 ("Subspace platform extensions") is **literal feature requests filed against Subspace**, not Academy code changes.

---

## 3. The 8 Boot Surfaces

| File | Contains | Size | Cap | Curation |
| --- | --- | --- | --- | --- |
| `identity.md` | Values, character, voice, persona/backstory | \~400 | None | Hand-edit or rare promotion from notes |
| `role.md` | Job, responsibilities, scope, deliverable shape, cadence, who-served | \~400 | None | User-driven; primitive can suggest |
| `knowledge.md` | Domain expertise, mental models, frameworks, learned patterns | \~1500-2500 | Soft cap by token budget | Primitive: reference + uniqueness + user signal → keep / consolidate / evict |
| `goals.md` | Strategic objectives | \~150 | Hard cap 3 | Forced re-affirmation every 14d |
| `priorities.md` | Weekly direction | \~250 | WIP-limit 3-5 visible | Auto-demote by `last_touched` |
| `threads.md` | Active work pursuits | \~700 | WIP-limit 5 active visible / 8 idle | Auto-demote active→idle→parked by `last_touched` |
| `notes.md` | Micro-steering corrections, stakeholder facts, heuristics | \~500 | Hard cap 8-12 visible | Graduate-or-expire (no long-term stay) |
| `dailys.md` | Tight summaries last 7 working days | \~1000 | Fixed 7 entries (FIFO) | Natural |

**Total: \~5-6k always-loaded.** Slightly above original 3-5k target. Acceptable — `knowledge.md` is load-bearing for capability; tokens spent there earn agent quality.

### Content boundaries (for crisp routing)

- *"I'm direct about uncertainty"* → identity
- *"Former Meta growth PM who shipped 2019 onboarding"* → identity (backstory)
- *"Weekly analytics review for Subspace, 1-page brief"* → role
- *"AARRR funnel framework"* → knowledge
- *"Watch billing-cycle effects when reading cohort retention"* → knowledge
- *"Run a weekly analytics review"* (the procedure) → skill

**Knowledge.md structure:** lightweight sections by domain (max 5-8), dated entries within. Not a flat list (primitive can't consolidate); not an org chart (overkill).

---

## 4. Skills as Unifying Primitive

Skills are the substrate for **both** agent competencies AND tool wrappers. Same file shape, same lifecycle, same observability. Mechanically identical; categorized for internal tracking only.

### Two categories (internal tracking)

- **External skills** — true skills/competencies the agent has (analytics-review, code-review-style, growth-strategy). Originate from research extraction at hire time and from notes graduation over the agent's life. Vary heavily across agents.
- **Internal tool skills** — SKILL.md **instructions** (not adapter code) telling the agent how to invoke bundled Subspace platform CLIs (helm, subspace) and any other defaults. Standardized, shared across agents. Per the no-customization constraint (§2.5), these are documentation skills, not glue layers.

```plaintext
.claude/skills/
├── weekly-analytics-review/SKILL.md    (external skill)
├── code-review-style/SKILL.md          (external skill)
├── gmail/SKILL.md                      (internal tool skill — wraps Subspace email)
├── calendar/SKILL.md                   (internal tool skill)
├── scheduler/SKILL.md                  (internal tool skill — wraps Subspace Helm)
├── threads/SKILL.md                    (internal tool skill — wraps Subspace tasks CLI)
└── agent-memory-search/SKILL.md        (internal tool skill — wraps Subspace search)
```

**Granularity heuristics:**

- External: "one job-shaped task = one skill" (weekly-analytics-review, not analytics)
- Internal tool: "one external service = one skill, multiple capabilities per skill body" (gmail/SKILL.md with send-message/find-thread/archive)

**Registry:** Claude Code's native skill discovery surfaces skills + descriptions to the model when at `.claude/skills/`. Likely no explicit registry file needed; good SKILL.md frontmatter (name, description, when-to-load) replaces it. **30-min spike to confirm** before building a registry.

**Knowledge-vs-skill boundary heuristic:**

- "How do I think about X?" → knowledge.md
- "How do I do X?" → skill

---

## 5. Cap & Staleness Mechanisms

Two distinct problems, two distinct mechanisms.

### Staleness — auto-demotion across status tiers

Threads use four-tier model: **active** (touched ≤7d) → **idle** (7-21d) → **parked** (>21d) → **done** (evaporates to dailys.md).

Daily primitive demotes by `last_touched`. Re-promotion requires reason in body (asymmetric cost favors closure, not accumulation).

### Size — WIP-limit at injection, not at file

The file can hold 30+ entries. Only top N (by recency or rank) inject into context. Agent literally cannot have more than N active visible — prevents the "tail-ignore" failure mode documented across opencode/hermes/etc. **Subspace UI shows the full list to the user; agent context is scoped.** Useful asymmetry — user steers, agent executes.

### WIP-limit edge cases

- **Add when full** → auto-evict oldest by `last_touched` to idle, surface eviction to agent ("Adding X. Auto-parked Y, no activity 11d."). Agent re-promotes with reason if it disagrees.
- **Recall parked** → memory search → promote, OR direct promote by ID.
- **User visibility** → Subspace UI shows full task list per workspace/agent.

---

## 6. Notes Graduation (the self-improvement engine's primary job)

Notes is a staging area. Most graduate to **knowledge.md** (primary destination). Some to skill / role / identity. Some expire.

| Note type | Example | Destination |
| --- | --- | --- |
| Domain pattern, mental model, framework | "Watch billing-cycle effects in cohort retention" | **knowledge.md** (most common) |
| Operational heuristic with clear trigger | "Validate Mixpanel freshness before conclusions" | **skill** |
| Behavioral correction (durable) | "Don't over-explain before gauging audience" | **role.md** or **identity.md** |
| Stakeholder fact | "Pat prefers absolutes over percentages" | **role.md** or **knowledge.md** |
| Resolution-pending | "Ask Pat about Q2 target" | Expires when resolved |
| Failed correction (counter-signal in observations) | — | Expires + flag for re-attempt |

### Graduation signals (any one triggers review)

- Referenced ≥3 times in recent Subspace observations
- Active ≥21 days without behavioral violation
- Explicitly affirmed by user feedback
- Cross-references another existing note (durable pattern)

### Expire signals

- Resolution-shaped note where resolution happened
- ≥30 days without reference, behavior already reflects it
- Counter-signal: behavior consistently violates note

**Long-staying notes are a smell.** If a note is still in notes after 6 weeks, the primitive failed it.

---

## 7. Knowledge Curation (the operational definition of "powerhouse impact per token")

| Reference | Uniqueness | Action |
| --- | --- | --- |
| High | High | Keep — this IS the powerhouse |
| High | Low | Consolidate redundant items |
| Low | High | Keep, flag for review (might be high-impact-low-frequency, e.g. billing-cycle warnings — fire rarely, prevent major errors) |
| Low | Low | Evict |

**Trap cell: low-ref/high-uniqueness.** Pure frequency-based eviction kills load-bearing rare-fire knowledge. Be conservative — keep until counter-evidence + lack of user affirmation over long absence.

**Counter-evidence axis (separate):**

- Agent's work contradicts the knowledge → re-frame or evict
- User says "that's wrong" → evict
- Knowledge subsumed by more general principle the agent now uses → consolidate

---

## 8. Subspace Agent Platform Dependencies

Subspace owns the generic agent platform. Academy depends on it; doesn't replicate it.

### Subspace memory

- Per-session observations (existing FTS5 + recency rerank)
- Cross-session RAG (existing)
- Workspace/agent tasks (existing CLI; needs extensions — see Phase 2)
- Agent-scoped memory search (existing search; needs `--agent` flag — see Phase 2)

### Subspace runtime (Helm)

- Cron + headless invocation (existing)
- Agent email delivery (existing)
- Future: agent agnosticism — any model via Anthropic proxy URI + Claude-Code-harness-compatible libraries

**Academy does NOT duplicate any of this, and does NOT customize the Helm/Subspace CLIs (see §2.5).** Source of truth for observations, tasks, scheduling, and email is Subspace. Academy agents access these via internal tool skills, which are SKILL.md instructions on how to use the existing CLIs — not adapter code. Missing capabilities are filed as feature requests against the respective project.

### Academy owns

- Identity (identity.md)
- Job definition (role.md)
- Curated expertise (knowledge.md)
- Skill registry (.claude/skills/) — both external and internal tool skills
- Boot SessionStart hooks
- Hire flow
- Self-improvement engine (the routing layer)
- Portable plugin layout (`~/.academy/agents/<name>/`) — **key differentiator**: agents run in any cwd, tied back globally via symlinks; not coupled to a single project

---

## 9. Agent Loop

1. **Hire**: User describes work needed → research → role.md + identity.md + initial knowledge.md + initial skill bootstrap + initial goals/priorities
2. **Execute**: User invokes directly OR Helm scheduled OR combination → agent does work, updates threads/notes/priorities proactively
3. **Daily primitive** (nightly cron): demote stale threads, age notes, generate daily summary
4. **Self-improvement primitive** (daily/weekly): route notes → curate knowledge → spawn/refine/retire skills

---

## 10. Phasing Plan

### Phase 0 — MVP (target: running in Subspace ASAP)

**Goal:** Working agent with the v3 architecture shape, manual curation acceptable.

**In scope:**

- 8 boot files created at `~/.academy/agents/<name>/`
- Per-file SessionStart hooks (8 simple hooks, one per surface)
- Hire flow producing initial 8 files via research:
  - identity.md (persona/backstory from research synthesis)
  - role.md (job spec from user-described work)
  - knowledge.md (initial domain expertise from research extraction)
  - goals.md / priorities.md (seeded from user input)
  - threads.md / notes.md (start empty)
  - dailys.md (starts empty, fills via daily primitive)
- Initial skills bootstrap from research (5-10 knowledge skills)
- Use existing Subspace memory search (no agent-scope yet)
- Use existing Subspace tasks CLI (workspace-level, not yet agent-scoped)
- Helm scheduling (existing)
- \~/.academy/agents/<name>/ portable layout (existing)

**Out of scope (deferred):**

- Notes graduation engine (manual review by user for now)
- Knowledge curation engine (manual edits for now)
- Skill spawning/refinement from observations
- Subspace CLI feature requests (filed in Phase 2, not blocking MVP)
- Agent-scoped search (use existing CLI as-is)
- Internal tool skill instructions for email/calendar (Phase 1)
- WIP-limit injection enforcement (visual surface for now, no auto-evict)
- Auto-demotion of stale threads (manual or simple time-based)

**Code-level migration: fresh repo at `/Users/joe/Dev/academy`.**

Rationale: MVP scope is small (<1500 LOC under the no-customization constraint — see §2.5). Refactoring the existing `the_academy` repo means deletion-with-dependencies surgery on the manifest/chunking/inject_section pipeline plus its tests, and leaves the repo in a busted state mid-refactor. Fresh has a one-time setup tax (plugin manifest, permissions, CLI invocation patterns) but pays it in a clean repo with structural forcing function against accreted scope.

**Cherry-pick from `the_academy` (literal copy, adapt — do not import):**

1. Plugin manifest scaffolding (`.claude-plugin/`)
2. SessionStart hook patterns (input parsing, JSON output, exit codes — from `session-start.py`)
3. Helm CLI invocation patterns (canonical command shape — confirm only, no glue)
4. Subspace CLI invocation patterns (canonical command shape — confirm only, no glue)
5. Hire flow orchestration shape (research → extraction → file generation pipeline — NOT existing content templates, those are wrong-shaped)
6. Permissions/settings.json templates
7. **Academy CLI structural shape** (`agent.mjs`: create/run/list/clean/destroy commands, instance management, agent-project context merge) — copy structure, rewrite the file-generation bodies to produce the 8 boot surfaces

**Explicitly do NOT cherry-pick:**

- Manifest-based context chunking
- `inject_section.py`, `lib/session-hooks.mjs` context-injection
- Consolidation engine (the appender)
- `profile/intelligence.md` generation
- Existing test suite (write fresh; old tests test the wrong thing)
- `experiments.md` / `changelog.md` / `how-you-work.md` / `priorities.md` / `_mission.md` generators
- Any Helm or Subspace adapter/wrapper code (constraint: use CLIs as-is, see §2.5)

**Path & migration:**

- New: `/Users/joe/Dev/academy`
- Reference (read-only during build): `/Users/joe/Dev/the_academy`
- Archive: when v3 stable, rename `the_academy` → `the_academy_archive`. `dev/academy` becomes the canonical home.

**Agent-level migration: fresh `~/.academy/agents/<name>/` per v3 agent.** Existing v2 agents continue running against `the_academy` plugin until v3 is validated, then migrated.

**Definition of done:**

- One agent hired end-to-end via v3 hire flow
- Agent runs scheduled work through Helm
- All 8 boot files populated and injected via SessionStart hooks
- Manual edits to all 8 surfaces work
- Boot context measured at \~5-6k tokens
- User can interact via Claude Code in agent's cwd

### Phase 1 — Internal tool skill instructions

**Goal:** Author SKILL.md instructions that tell agents how to invoke the existing Subspace platform CLIs. **Documentation skills, not adapter code** (per §2.5).

- `scheduler` skill — instructions for `helm` CLI usage
- `email` skill — instructions for Subspace agent email (via AgentMail) usage
- (Confirm Claude Code skill discovery handles registry — 30-min spike)

### Phase 2 — Subspace platform feature requests

**Goal:** File feature requests against Subspace for agent-scoped capabilities Academy needs. **These are issues filed in the Subspace repo, not Academy code.**

- Subspace tasks CLI feature requests:
  - `--agent <name>` filter
  - Status field (active / idle / parked / done)
  - Auto-update `last_touched` on read/write
  - Agent write paths (create / update / promote / archive)
- Subspace search CLI feature request: `--agent <name>` flag
- Once shipped in Subspace: Academy authors `threads` and `agent-memory-search` internal tool skill instructions referencing the new flags
- Replace markdown threads.md fallback (if any) with Subspace-injected threads

### Phase 3 — Daily primitives reliability

**Goal:** Daily primitives run reliably enough to depend on for staleness/decay.

- Daily primitive infrastructure hardening
- Notes age-out (time-based)
- Threads auto-demotion (time-based)
- Goals re-affirmation reminder (14d)
- Daily summary generation → dailys.md
- WIP-limit injection enforcement (auto-evict oldest, surface to agent)

### Phase 4 — Self-improvement engine

**Goal:** Notes graduation + knowledge curation + skill lifecycle automated.

- Notes routing: graduate to knowledge / skill / role / identity / expire
- Knowledge curation: reference + uniqueness + user signal → keep / consolidate / evict
- Skills: spawn from observations, refine, retire, split
- Daily diff output legible: "Notes: promoted N (M to knowledge, K to skill...). Knowledge: kept Q, consolidated R, evicted S. Skills: spawned X, refined Y, retired Z."
- Estimated 3-4 days of real work

### Phase 5 — Identity/role evolution + cross-agent

- Suggest role updates when user behavior implies job redefinition
- Suggest identity updates from accumulated notes signal
- Cross-agent learnings (skills shared across agents, knowledge cross-pollination)

---

## 11. Open Decisions

These can be deferred but should be made before Phase 4:

- **goals/priorities split or merge?** Currently separate. Reconsider if one file with horizon tags is cleaner once running.
- **Done-thread destination:** dailys.md, separate threads-archive.md, or git history only? MVP: git history.
- **Persona placement:** entirely in identity.md, or split (durable identity + replaceable backstory)?
- **Stakeholders.md:** separate file when relationships matter, or always in role/knowledge? Defer until needed.
- **Notes referenced-but-pinned:** notes referenced by threads/goals stay even if old. Confirm primitive logic.

---

## 12. What Dies in v3

From v1/v2:

- `profile/intelligence.md` as monolith → splits into role.md + knowledge.md + skills
- `changelog.md` → git log over `.claude/skills/` is the changelog
- `experiments.md` → candidate-skills folder + retirement metadata in skill frontmatter
- `context/how-you-work.md` → folded into role.md
- `context/priorities.md`, `_mission.md` → folded into goals/priorities split
- `context/manifest.json` + L1/L2 chunking + `inject_section.py` + `lib/session-hooks.mjs` context-injection wrapper → replaced by per-item dedicated SessionStart hooks
- Consolidation engine appending to intelligence → replaced by skill spawn/refine in self-improvement primitive
- Watcher-based turn detection (Phase 1 v2 work) → not part of v3 direction
- Pinned-doc semantics (Phase 1 v2 work) → not part of v3 direction
- Recall/history chunks (Phase 1 v2 work) → Subspace handles this natively

## 13. What Stays from v1/v2

- `~/.academy/agents/<name>/` portable plugin layout
- Hire flow (gets simpler — output is small markdown files + initial skill set)
- Helm scheduler integration
- Subspace memory integration
- `.claude/skills/` skill folder pattern
- `work/` deliverables (archive, not context)

---

## 14. Bakeoff Outcome (for the record)

Evaluated copana (PayRequest/copana) and nanoclaw (qwibitai/nanoclaw) as foundations. **Neither adopted.**

- **Copana**: 13 commits, abandoned Feb 2026. Aesthetic influence only (small markdown identity files, SKILL.md recipe pattern). Not viable as foundation.
- **NanoClaw**: 28k stars, active, strong scheduling/isolation primitives. Rejected — Docker-tied global daemon incompatible with portable plugin requirement.

Field gap confirmed via web research across opencode / hermes / nanoclaw / gsd / codex / openhands / Anthropic harness / personal-agent frameworks: **no surveyed system has first-class "3-7 active pursuits with lifecycle" object**. Most have granular todos OR passive memory. Academy's threads.md fills a real gap — differentiator, not derivative.

Both repos cloned at `/tmp/bakeoff/` for reference.

---

## 15. Failure modes designed against

From the field research (Hermes #9400, OpenCode #15096, etc.):

1. **Task-as-loop-variable decay** — task state in inference loop vanishes on interruption. **Mitigated:** threads on disk, system-injected.
2. **Unbounded growth** — agents add faster than they close, tail gets ignored. **Mitigated:** WIP-limit injection.
3. **Drift when not in active context** — agents ignore task state if loaded only at start. **Mitigated:** always-loaded boot block.
4. **Premature victory** — agents declaring everything done. **Mitigated:** explicit `done` tier evaporation, not ambient flag.

---

## Next steps

1. Initialize fresh repo at `/Users/joe/Dev/academy` with plugin manifest + permissions scaffolding (cherry-pick from `the_academy`)
2. 30-min spike: confirm Claude Code native skill discovery handles registry needs
3. Cherry-pick & adapt Academy CLI structural shape (`agent.mjs` create/run/list/clean/destroy)
4. Build hire flow that produces the 8 boot files (research → identity/role/knowledge synthesis + initial skills)
5. Build per-file SessionStart hooks (8 hooks)
6. End-to-end test: hire one agent, run it via Helm CLI directly (no Academy adapter), validate boot context ~5-6k
7. File Phase 2 Subspace CLI feature requests in Subspace repo (parallel track)
8. Plan Phase 1 internal tool skill instructions based on MVP learnings