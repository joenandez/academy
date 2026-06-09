# Plan Review — Academy Codex Runtime Parity

Independent adversarial plan review. Canonical scope: `docs/tasks/main/concepts/scope.md` (treated as agreed; not edited). Write-back limited to this report.

---

## 1. Must-Delete (Lens 1 — YAGNI)

**Nominated highest-leverage scope-safe cut: subtask `5.1` "Implement runtime state persistence" (`runtime.json`).**

- **Location:** `docs/tasks/main/specs/tasks.json` task 5.1; `docs/tasks/main/specs/plan.md:111`; `:140` (`ACADEMY_AGENT_RUNTIME`); `Component/Data Architecture` (`plan.md:110`).
- **Rationale:** The agreed scope requires the *behavior* "mixed users use the runtime last used for that agent" (`scope.md:74`, `scope.md:135`) — that stays. It does **not** require a persistent agent-local state file as the mechanism; the nearest named concept, "Provider preference storage at the agent or user level," is explicitly **Future** (`scope.md:104`). The last-used-runtime behavior is fully achievable by re-registering the nightly Helm task with `--agent <runtime>` at each `academy run` invocation (nightly re-registration already happens on every run). The Helm task itself becomes the stored preference. Deleting 5.1 removes a new file artifact, a new read-write code path, file↔schedule synchronization logic, and the speculative `ACADEMY_AGENT_RUNTIME` env var — **without cutting any agreed scope item**. Task 5.2 (nightly registration update) remains and is simplified to read the selected runtime from the just-run command.
- **Note:** This is a mechanism simplification, not a scope cut. If review disagrees that re-registration is equivalent, the fallback is to keep 5.1 but delete only `ACADEMY_AGENT_RUNTIME` (M2).

---

## 2. Findings

| # | Severity | Lens | Location | Finding | Suggested Edit |
|---|----------|------|----------|---------|----------------|
| 1 | **Blocker** | 3 / 2 / 4 | `task_context.md:32`,`:126`; `tasks.json` 1.3 (`:249-252`), 4.1 (`:668-674`); `research…:206`,`:227-244` | Codex `--profile` resolution + inline-hook TOML syntax is **load-bearing but unverified**. Artifacts assert `--profile academy-kai` loads a standalone `$CODEX_HOME/academy-<agent>.config.toml` file (`plan.md:15,112`), but the `--profile <CONFIG_PROFILE_V2>` help string is not explained; real Codex may define profiles as `[profiles.<name>]` tables inside `config.toml`, not separate files — which would invalidate the entire profile-writer design (4.1/4.2). The `[[hooks.Stop]]` TOML syntax is flagged unverified in `task_context.md:126` Open Questions ("verify exact TOML syntax… before relying on the generated profile file"). Phase 0's only gate (1.3) is a `type:"state"` fixture, not an executable/real-CLI check, yet 4.1, 4.2, 5.x all depend on it. | Add a Phase-0 subtask that runs the **real** `codex --profile` against a fixture profile containing the planned hook TOML and asserts Codex loads it without error (or documents the real resolution mechanism). Convert 1.3's profile criterion from `state` to `test`. Resolve before execute. |
| 2 | **High** | 2 / 4 | `execute.md:21-22`; `tasks.json:107` (`coverage_summary`) | Subtask count is wrong in two canonical artifacts: both claim **25 subtasks**; actual count is **18** (5+4+2+3+2+2). The per-parent table in `execute.md:38-43` is individually correct and sums to 18, contradicting its own header. An executor using 25 as a completeness denominator never reaches 100% or hunts for 7 non-existent tasks. | Change "Subtasks: 25" → "Subtasks: 18" in `execute.md:22` and `tasks.json` `coverage_summary.subtasks`. |
| 3 | **High** | 2 | `tasks.json` 6.2 (`:943-955`), 2.2 (`:435`), 2.3 (`:473`), 3.1 (`:568`), 4.1 (`:668`), 4.3 (`:753`), 5.1 (`:806`) | Pervasive **non-executable acceptance criteria** on behavior-changing tasks. 6.2 (README) has three `type:"state"` prose criteria and is the *only* coverage for REQ-008 — zero machine-checkable signal. 2.2's "Legacy delegation behavior remains" is `state` despite being regression-critical (existing test at `tests/agent-cli.test.mjs` legacy case not referenced). 2.3/3.1/4.1/4.3/5.1 each restate a behavior as `state`/prose that the paired RED test does not fully cover. | Convert each to `type:"test"` citing the concrete assertion (e.g. 6.2: grep README for `--agent codex`, `--agent claude-code`, `.agents/skills`, nightly; 2.2: existing legacy-delegation test still passes; 4.1: read generated TOML, assert `hooks.Stop` present and `api_key`/`provider`/`mcp_servers` absent). |
| 4 | **High** | 2 | `execute.md:27-32`; `tasks.json` 1.1-1.5 `consumed_by` chains; `coverage_summary.red_pairing` (`:108`) | **Front-loaded RED tests break the RED→GREEN gate.** All RED tests live in wave-1 (1.1-1.5) but go GREEN only in waves 2-5 (1.4→wave-3, 1.5→wave-5, 1.3→wave-4). During waves 2-4 these tests fail in `npm test`, which is also the wave-6 regression gate (6.1). No skip/`todo`/pending mechanism is specified. `red_pairing` claims RED tests are "in phases 1-5" but they are all in phase 0. | Either move each RED test to immediately precede its build subtask inside its own wave, or mark front-loaded RED tests `{ todo: true }` and require conversion to real assertions when the build subtask runs; document that the regression gate applies only after each RED's GREEN wave. |
| 5 | **High** | 4 | `tasks.json` 4.1 ctx (`:652-655`), 5.1 ctx (`:790-793`), 4.3/1.3 ctx (`:731-734`,`:228-231`) | **Shape-mismatched reuse anchors give false confidence.** (a) 4.1 cites `writeSettingsLocal` (`agent.mjs:512`) — writes *JSON* into the *agent dir* — as the pattern for writing *TOML* to an *external* `$CODEX_HOME`. (b) 5.1 cites `instance.json` writer (`agent.mjs:405`) — write-once project metadata, never read back — as the pattern for a read-write runtime state file. (c) 4.3/1.3 cite `writeFakeClaude` (`lifecycle.test.mjs:25`) — discovers hooks via `--plugin-dir` JSON — as the model for a fake Codex that must resolve `--profile` TOML from `CODEX_HOME`. Additionally **no TOML serializer exists in the repo**, unacknowledged anywhere, while out-of-bounds forbids new deps "unless… necessary." | Replace each note with an honest statement of the divergence; explicitly flag the TOML-generation decision point in 4.1 (hand-rolled template vs justified dependency). For 5.1, see Must-Delete (prefer removing the read-write state need entirely). |
| 6 | **Scope Change Required** | 1 / 4 | `scope.md:97-98` vs `plan.md:13,76`; `task_context.md:64,120`; `tasks.json` 1.2/2.3/2.4 | The **neutral prompt path** (`.academy/generated/academy-system-prompt.md`) is listed under scope **Maybe**, but the plan and three subtasks commit to it as decided. `task_context.md:120` records the user selected "neutral," but `scope.md` was never updated. `execute.md` slicing rule says to stop and route to `caspar-scope` if a subtask requires a scope change. Reviewer must not edit scope. | Route to `caspar-scope` to promote the neutral-path decision from **Maybe** → **IN/Decisions** (recording the user's selection). Until then, 1.2/2.3/2.4 rest on an unconfirmed scope item. *Alternative if not promoted:* Codex reads the existing `.claude/academy-system-prompt.md` via `-c model_instructions_file=…` (research:80), deleting the migration in 1.2/2.3/2.4. |
| 7 | **Medium** | 1 | `plan.md:140`; `Component/Data Architecture` | `ACADEMY_AGENT_RUNTIME` env var added "for provider-aware hooks/tests **if useful**." Unrequested by scope; `sync_memory.mjs` is already provider-neutral and needs no runtime discriminator. "If useful" is speculative generality and creates a contract. | Remove `ACADEMY_AGENT_RUNTIME` from the plan; add later only if a concrete consumer appears. |
| 8 | **Medium** | 1 | `plan.md:67-68`,`:152` | **Nested YAGNI:** plan reserves a "compatibility copy" that writes the old `.claude/academy-system-prompt.md` *and* the neutral path "if compatibility concerns appear" — speculative mitigation for the (itself Maybe-scope) prompt migration. | Drop compatibility-copy language. If the neutral path is adopted, commit fully and move tests; do not maintain two prompt files. |
| 9 | **Medium** | 1 / 4 | `tasks.json` 3.1/3.2; `scripts/agent.mjs:423` (`universalSkillValues`), `:439`; `templates/skills/self-update/SKILL.md:27` | `universalSkillValues` hardcodes `skillsDir = …/.claude/skills` and interpolates it into rendered skill text (`{{skills_dir}}`, `*_path`). Without parameterizing per surface, `.agents/skills/*/SKILL.md` will contain `.claude/skills` paths — wrong for Codex. 3.1 (render both) precedes 3.2 (neutral language), creating a chicken-and-egg the tasks don't resolve. | Make 3.1 acceptance require that `.agents/skills` files reference `.agents/skills` paths (call `universalSkillValues` per surface). State the intended 3.1↔3.2 ordering. |
| 10 | **Medium** | 2 | `plan.md:49`; `scope.md:35`; `tasks.json` REQ-003 (`:44-51`), 4.2/4.3 | **Untested scope guarantees.** (a) "Memory identity remains provider-neutral" is asserted but no task checks the Codex-shaped session row has the *same* `agentName`/`projectDir`/`sessionId` schema as Claude. (b) `scope.md:35` "preserve identity even when project-local Codex config is present" — REQ-003 traces to 1.2/2.3/4.2 but none test that `-c model_instructions_file` actually *overrides* a conflicting project-local `.codex/config.toml`. | Add a 4.3 assertion for session-row schema parity; add a 4.2/4.3 test that a project-local conflicting `model_instructions_file` is still overridden by the `-c` override (or mark as a documented manual-E2E gap). |
| 11 | **Medium** | 3 | `research…:221` (`.codex/academy-system-prompt.md`) | Research follow-up example uses the **superseded** prompt path; plan/context settled on `.academy/generated/…`. Research is a cited context artifact; an implementer copying the example would reference a path the renderer never writes. | Annotate the example as pre-decision, or update it to `.academy/generated/academy-system-prompt.md`. |
| 12 | **Low** | 1 / 4 | `tasks.json` 3.1, 4.1; `plan.md:16` | Over-abstraction risk vs anti-scope (`scope.md:90` "not a generic multi-runtime abstraction framework"): "shared skill renderer" and "Codex profile writer" could be read as new abstraction layers. The needed change is a second call site for `writeUniversalSkill` and a hardcoded TOML template string. | Add a one-line constraint to 3.1/4.1: reuse `writeUniversalSkill` per target dir; write a fixed TOML template, not a generic builder. |
| 13 | **Low** | 3 / 4 | `tasks.json` 6.1 ctx (`package.json:17`) | Anchor off-by-one: the `"test"` script is `package.json:18`; line 17 is `"scripts": {`. | Update to `package.json:18`. |
| 14 | **Low** | 4 | `tasks.json` 2.2 (`:399-435`); `scripts/agent.mjs:678` | Missing reuse anchor: shared-prep extraction must preserve the agent-home-vs-project branch (`isInside(projectDir, dir)` at `:678`); 2.2 cites 653/635 but not the branch helper. | Add ctx entry for `agent.mjs:678` "isInside branch — agent-home vs project-mode decision must survive extraction." |
| 15 | **Low** | 3 | `research…:49` (`agent.mjs:45`); `plan.md:28` (`nightly-consolidation/SKILL.md:63`) | Negligible anchor drift: `agent.mjs:45` is the docblock (const at 46); `nightly-consolidation/SKILL.md:63` is the `## Edit Boundaries` heading (the `.claude/skills` reference is at line 74). Both point at the right region. | Optional: bump anchors to 46 and 74. |
| 16 | **Low** | 4 | `execute.md:27-32` | Wave entries are JSON-like but embedded in Markdown bullets — not parseable JSON. Cosmetic unless wave parsing is automated. | None required; tighten only if tooling parses waves. |

---

## 3. Summary

| Severity | Count |
|----------|------:|
| Blocker | 1 |
| High | 4 |
| Scope Change Required | 1 |
| Medium | 5 |
| Low | 5 |
| **Total** | **16** |

**Blockers must resolve before execute:**
- **#1** — Verify Codex `--profile` resolution semantics and inline-hook TOML syntax against the real CLI in Phase 0 with an executable/documented gate, before tasks 4.1/4.2/5.x build on the profile-file design. This single unverified external assumption underpins the entire Codex launch path.

**Scope Change Required (route to `caspar-scope`, do not edit here):**
- **#6** — Promote the neutral prompt path from scope **Maybe** to **IN/Decisions** (or drop the migration). Three subtasks currently rest on an unconfirmed scope item.

**Strongly recommended before execute (High):** fix the subtask count (#2), convert non-executable acceptance criteria — especially README 6.2 and legacy-delegation 2.2 — to tests (#3), resolve the front-loaded RED→GREEN gate (#4), and correct the shape-mismatched reuse anchors plus acknowledge the absent TOML serializer (#5).

**Must-Delete (Lens 1):** subtask 5.1 `runtime.json` state persistence — replace with nightly Helm re-registration at run time; scope-safe, preserves the agreed last-used-runtime behavior.

---

## 4. Review Metadata

- **Mode:** full
- **Reviewer Runtime:** claude-code
- **Auto-apply mode requested by caller:** scope-safe — **not applied.** Write permission for this review is limited to `docs/tasks/main/reviews/plan_review.md`; the reviewer is prohibited from editing `plan.md`, `execute.md`, `tasks.json`, `scope.md`, `task_context.md`, or research files. This report therefore **captures findings before any write-back**; scope-safe edits must be applied by a separately authorized pass.
- **Canonical scope source:** `docs/tasks/main/concepts/scope.md` (treated as agreed/immutable).
- **Timestamp (ISO 8601):** 2026-06-04T20:15:01Z

**Reviewed artifacts — present:**
- `docs/tasks/main/concepts/scope.md`
- `docs/tasks/main/task_context.md`
- `docs/tasks/main/research/academy_codex_parity_060426.md`
- `docs/tasks/main/specs/plan.md`
- `docs/tasks/main/specs/execute.md`
- `docs/tasks/main/specs/tasks.json`

**Reviewed supporting repo sources (read-only):**
- `scripts/agent.mjs`, `hooks/sync_memory.mjs`, `tests/agent-cli.test.mjs`, `tests/lifecycle.test.mjs`, `tests/sync-memory.test.mjs`, `templates/skills/*`, `README.md`, `package.json`

**Absent / not located:** none (all manifest artifacts present).

**Method:** Four independent lens subagents (YAGNI, Verifiability, Existence/Hallucination, Canonical Reference Quality) dispatched in parallel, each grounded in the full artifact set plus the real repo; findings synthesized and de-duplicated by the lead reviewer. Existence lens verified 50+ file:line anchors against the working tree (all confirmed within ≤1 line; no hallucinated files/symbols/env vars). External Codex facts could not be executed and are flagged where load-bearing (#1).
