# Implementation Plan: Academy Codex Runtime Parity

## Overview

Academy needs to run the same named agent through Claude Code or Codex while preserving current Claude behavior by default. The implementation will add a small runtime selection layer at `academy run`, keep existing Academy surfaces and memory identity shared, expose universal skills to Codex through `.agents/skills`, generate Codex agent profiles in the user's normal Codex home, and update nightly scheduling to use the correct runtime for each agent.

This approach keeps Academy's core agent model provider-neutral while preserving the scope's anti-scope: Academy does not become a generic runtime framework and does not clone Claude's `--plugin-dir` model for Codex. Codex parity is achieved through the Codex-designed profile + trusted project config/skills layering.

## Technical Approach

- **CLI parsing and runtime selection:** Extend `parseArgs()` / `runAgent()` so `run <name> --agent claude-code|codex -- ...` parses Academy-owned flags before provider passthrough. Preserve passthrough exactly after `--` and default to `claude-code` when absent (`scripts/agent.mjs:60`, `scripts/agent.mjs:66`, `scripts/agent.mjs:78`).
- **Shared run preparation:** Split current `runAgent()` into shared preparation plus provider launchers. Shared prep validates the agent, handles legacy delegation, backfills skills, renders the neutral prompt, builds `ACADEMY_*` env, and determines agent-home vs project cwd (`scripts/agent.mjs:653`, `scripts/agent.mjs:668`, `scripts/agent.mjs:671`, `scripts/agent.mjs:677`).
- **Neutral prompt output:** Move launch prompt generation from `.claude/academy-system-prompt.md` to `<agentDir>/.academy/generated/academy-system-prompt.md`, while keeping prompt content unchanged (`scripts/agent.mjs:465`, `scripts/agent.mjs:480`, `scripts/agent.mjs:497`). Claude receives it by `--system-prompt-file`; Codex receives it by launch-time `-c model_instructions_file="<path>"`.
- **Claude Code launcher:** Keep current Claude project/agent-home behavior intact: agent-home mode uses only `--system-prompt-file`, project mode writes a project-local plugin instance and passes `--plugin-dir` plus `--system-prompt-file` (`scripts/agent.mjs:395`, `scripts/agent.mjs:635`, `scripts/agent.mjs:679`, `scripts/agent.mjs:687`).
- **Codex launcher and profile:** Add `launchCodex()` using `ACADEMY_CODEX_BIN || "codex"`. Phase 0 must first verify the exact current Codex profile resolution and hook TOML shape with the real CLI. The launcher then writes/refreshes the verified Academy profile shape in the user's normal `CODEX_HOME`, and launches `codex --profile academy-<agent> -C <cwd> --add-dir <agentDir> -c model_instructions_file="<promptPath>" ...passthrough`. This preserves user global Codex auth/config while adding Academy agent-level hooks/defaults. Generate the profile with a fixed, minimal TOML template rather than a generic TOML builder unless implementation proves a dependency is necessary.
- **Codex skills:** Render universal skills from the same templates into `.claude/skills` and `.agents/skills`; Codex docs confirm repository/user skills are discovered from `.agents/skills` and symlinked skill folders are supported. Use one rendering helper to avoid drift (`scripts/agent.mjs:423`, `scripts/agent.mjs:446`, `scripts/agent.mjs:456`).
- **Nightly runtime selection:** Re-register the Helm nightly task with the runtime selected during `academy run`, so the scheduled command itself carries the last-used runtime preference. Existing registration always schedules `academy run <name> -- -p <prompt>`, which is Claude-specific (`scripts/agent.mjs:564`, `scripts/agent.mjs:577`, `scripts/agent.mjs:588`).
- **Lifecycle/memory:** Reuse `sync_memory.mjs` because it already keys off provider-neutral `ACADEMY_*` env and `session_id` (`hooks/sync_memory.mjs:47`, `hooks/sync_memory.mjs:65`, `hooks/sync_memory.mjs:96`). Add Codex-shaped test coverage around profile/hook invocation rather than rewriting the hook.
- **Documentation:** Update README from Claude-only language to dual-runtime usage and explain Codex profile + project config/skills layering (`README.md:10`, `README.md:41`, `README.md:80`, `README.md:100`).

## Critical Files

- `scripts/agent.mjs` — Core logic to modify. Owns CLI parsing, agent scaffold, prompt rendering, skill rendering, nightly registration, and runtime launch (`scripts/agent.mjs:60`, `scripts/agent.mjs:456`, `scripts/agent.mjs:564`, `scripts/agent.mjs:653`).
- `tests/agent-cli.test.mjs` — Test to extend. Existing CLI, prompt, skill, and nightly schedule tests provide the canonical unit/behavior pattern (`tests/agent-cli.test.mjs:149`, `tests/agent-cli.test.mjs:212`, `tests/agent-cli.test.mjs:265`, `tests/agent-cli.test.mjs:339`).
- `tests/lifecycle.test.mjs` — Test to extend. Fake-provider lifecycle pattern for Stop-hook/session verification (`tests/lifecycle.test.mjs:25`, `tests/lifecycle.test.mjs:66`).
- `hooks/sync_memory.mjs` — Interface to reuse. Provider-neutral Stop-hook memory sync should not need major changes (`hooks/sync_memory.mjs:47`, `hooks/sync_memory.mjs:96`).
- `templates/skills/self-update/SKILL.md` — Pattern to update. Mentions `.claude/skills`; should describe both Claude and Codex skill locations once Codex skills are generated (`templates/skills/self-update/SKILL.md:27`, `templates/skills/self-update/SKILL.md:80`).
- `templates/skills/nightly-consolidation/SKILL.md` — Pattern to follow/update. Existing scheduled memory workflow must stay runtime-neutral (`templates/skills/nightly-consolidation/SKILL.md:1`, `templates/skills/nightly-consolidation/SKILL.md:74`).
- `README.md` — Interface/documentation to update from Claude-only to dual-runtime (`README.md:10`, `README.md:80`, `README.md:100`).

## External Dependencies — Verify Before Implementation

No new npm packages.

External CLI assumptions to verify locally before implementation:

- `codex` CLI exists and supports `--profile`, `-C`, `--add-dir`, `-c`, `--ask-for-approval`, and `--sandbox` via `codex --help`.
- Codex config supports `model_instructions_file`, profile loading, and Academy hook config in the exact generated shape; verify with a real Codex CLI fixture before building the profile writer.
- `helm-tasks` remains available for nightly scheduling; existing tests fake it.

## Verification — How We Know This Works

- Runtime parser preserves compatibility -> verifies by CLI tests for default Claude, explicit Claude, explicit Codex, invalid `--agent`, and passthrough preservation.
- Phase 0 RED specs remain non-disruptive before their build waves -> verifies by using node:test `test.todo("description")` with no body, then converting each relevant todo to an active test in its build wave.
- Neutral prompt path works -> verifies by create/run tests asserting the neutral generated prompt exists, includes all eight surface markers, refreshes from edited surfaces, and both provider launches reference it.
- Claude behavior remains unchanged -> verifies by existing dry-run/lifecycle tests updated only for neutral prompt path, still asserting project `--plugin-dir`, cwd, and `ACADEMY_*` env.
- Codex launch uses profile/project layering -> verifies by Phase 0 real Codex profile check plus fake Codex dry-run test asserting `--profile academy-<agent>`, `-C`, `--add-dir`, `-c model_instructions_file=...`, env vars, and generated profile content.
- Codex universal skills are discoverable -> verifies by create/run tests asserting `.agents/skills/{check-in,self-update,nightly-consolidation}/SKILL.md` exist with no unresolved template variables.
- Nightly runtime selection works -> verifies by Helm fake tests showing default Claude and Codex-selected runs register the expected scheduled command; the Helm task command is the stored scheduled-runtime preference.
- Memory identity remains provider-neutral -> verifies by existing `sync-memory` tests and a fake Codex lifecycle/profile-hook test that records a session row with the expected agent and project.
- README reflects product behavior -> verifies by doc assertions or manual review that runtime selector, default, Codex layering, and skills are documented.

## Out-of-Bounds — DO NOT add

- Do not make Codex the default runtime.
- Do not remove Claude Code support or its project plugin path.
- Do not translate provider passthrough flags between Claude and Codex.
- Do not build a Codex plugin marketplace publishing flow.
- Do not build a separate `academy hire --agent codex` flow.
- Do not implement cross-workspace blended RAG memory.
- Do not add new npm dependencies or TOML parser packages unless a later implementation blocker proves they are necessary.
- Do not set or override user Codex auth/provider/MCP/global-plugin configuration in Academy-generated profiles.

## Risks & Filled Assumptions

Risks:

- **Codex profile syntax drift:** current CLI/docs may differ in hook profile syntax. Mitigation: Phase 0 real Codex CLI verification before profile writer behavior build.
- **Prompt path migration:** moving from `.claude` to neutral generated path can break tests or users relying on the old file. Mitigation: update docs/tests to the neutral path as the single launch prompt path.
- **Skill drift:** rendering both `.claude/skills` and `.agents/skills` can diverge. Mitigation: one renderer writes both surfaces from the same templates.
- **Nightly runtime preference ambiguity:** inferring Claude-only/Codex-only/mixed could be ambiguous. Mitigation: use the runtime selected during run/create when registering the Helm task; default to Claude when absent.
- **Codex hook trust:** profile hooks may need trust state. Mitigation: test fake hook wiring and document/runtime-handle trust or bypass only where explicitly appropriate.

Filled assumptions:

- Normal user `CODEX_HOME` is the right location for Academy profiles because the scope requires preserving global auth, MCPs, skills, and plugins.
- Neutral generated prompt path is `<agentDir>/.academy/generated/academy-system-prompt.md`.
- Codex v1 skill parity requires `.agents/skills`; plugin-distributed skills are out of scope for v1.
- Nightly uses the runtime currently being used to register/replace the Helm task; the scheduled command carries that last-used runtime for mixed users, and Claude remains the default when no runtime is selected.

## Current State

- CLI parser has no `run` option parsing before passthrough (`scripts/agent.mjs:60`, `scripts/agent.mjs:66`, `scripts/agent.mjs:78`).
- Prompt rendering writes only `.claude/academy-system-prompt.md` (`scripts/agent.mjs:465`, `scripts/agent.mjs:480`, `scripts/agent.mjs:497`).
- Universal skills render only into `.claude/skills` (`scripts/agent.mjs:423`, `scripts/agent.mjs:446`, `scripts/agent.mjs:461`).
- Nightly registration always schedules Claude-style `academy run <name> -- -p <prompt>` (`scripts/agent.mjs:577`, `scripts/agent.mjs:588`).
- Existing tests assert Claude-only launch and `.claude` skill paths (`tests/agent-cli.test.mjs:149`, `tests/agent-cli.test.mjs:212`, `tests/agent-cli.test.mjs:265`, `tests/agent-cli.test.mjs:339`).

## Implementation Phases

1. **Phase 0 — Verify Codex Runtime Assumptions**
   - Succeeds when a real Codex CLI fixture verifies profile resolution, `model_instructions_file`, `-C`, `--add-dir`, and hook/profile shape before implementation depends on generated profiles.
2. **Phase 1 — Shared Runtime Parser And Prompt Path**
   - Succeeds when `academy run` parses runtime selection, preserves passthrough, defaults to Claude, and renders the neutral prompt path.
3. **Phase 2 — Skill Surface Parity**
   - Succeeds when create/run render universal skills into both `.claude/skills` and `.agents/skills` from one template path.
4. **Phase 3 — Codex Profile And Launch**
   - Succeeds when Codex dry-run/fake launch proves profile generation, launch args, env, project cwd, and prompt override.
5. **Phase 4 — Nightly Runtime Selection**
   - Succeeds when Helm scheduling picks Claude or Codex based on the runtime selected during registration, so the scheduled command carries the last-used runtime per scope.
6. **Phase 5 — Lifecycle, Docs, And Regression**
   - Succeeds when fake lifecycle/memory tests pass, README is updated, and the full test suite is green.

## Component/Data Architecture

No database or server architecture changes.

New/changed local file artifacts:

- `<agentDir>/.academy/generated/academy-system-prompt.md` — neutral generated prompt used by both runtimes.
- `<agentDir>/.agents/skills/<skill>/SKILL.md` — Codex-native universal skills rendered from existing templates.
- Verified `$CODEX_HOME` profile shape for `academy-<agent>` — Codex profile with Academy agent-level defaults/hooks, intentionally not overriding auth/provider/global MCP config.

Existing artifacts retained:

- `<agentDir>/.claude/skills/<skill>/SKILL.md`
- `<agentDir>/.claude/settings.local.json`
- project `.academy/agents/<name>` Claude plugin instance
- `memory/sessions.jsonl` and `memory/observations/*.jsonl`

## API Design

CLI surface:

```bash
academy run <agent> [--agent claude-code|codex] [-- <provider flags>]
```

Behavior:

- `--agent` is Academy-owned and must appear before `--`.
- Unknown runtime values exit non-zero with a usage hint.
- Flags after `--` are forwarded exactly.
- Default runtime is `claude-code`.

Environment:

- Continue exporting `ACADEMY_AGENT_DIR` and `ACADEMY_AGENT_NAME`.
- Continue exporting `ACADEMY_PROJECT_DIR` in project mode.
- Add `ACADEMY_CODEX_BIN` test override, parallel to `ACADEMY_CLAUDE_BIN`.

## Migration Plan

No data migration.

Compatibility/backfill:

- Existing agents are backfilled on `academy run`, as current skill backfill already does.
- First run after implementation should create neutral prompt path, Codex skill surface, and Codex profile as needed.
- Existing Claude agents continue to work because default runtime remains Claude and Claude plugin scaffolding remains in place.
- Tests/docs must move fully to the neutral prompt path for launch behavior.

Rollback:

- Removing Codex launch code should leave existing Claude behavior intact if provider changes are isolated behind runtime selection.
- Generated Codex profiles and `.agents/skills` files are local artifacts and can be safely regenerated or ignored.

## Testing Strategy

Unit/CLI tests:

- `parseRunArgs` / dry-run tests for default Claude, explicit Claude, explicit Codex, invalid provider, and passthrough preservation.
- Prompt tests for neutral generated path and surface marker refresh.
- Skill tests for `.claude/skills` and `.agents/skills` parity.
- Runtime state/nightly scheduling tests using fake `helm-tasks`.

Integration/fake-provider tests:

- Fake Claude lifecycle test updated for neutral prompt path but otherwise preserving project plugin behavior.
- Fake Codex launcher test records argv/env/profile and optionally invokes `sync_memory.mjs` with Codex-shaped Stop payload.

External/manual or opt-in tests:

- Optional real Codex E2E behind `ACADEMY_RUN_CODEX_E2E=1` if stable enough.
- Existing real Claude E2E remains opt-in.

Final regression must report zero Academy Codex parity `todo` entries; all Phase 0 TODO-RED specs must be activated before handoff.

Deferred:

- Full Codex plugin marketplace/distribution verification.
- Cross-workspace RAG memory verification.
