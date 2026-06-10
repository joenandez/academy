# Academy Codex Runtime Parity Validation

## Summary

Overall status: Complete.

Delivered: 6 of 6 validation areas. Gap count: 0 current gaps. Scope-creep count: 0.

The implementation is defined, connected, and reachable through `academy run`: Claude Code remains the default, Codex launches through the selected runtime path, the neutral prompt and Codex profile are generated during run preparation, Academy skills are exposed to Codex through a project-local bridge, and nightly scheduling follows the selected runtime. A reviewer-found reachability gap for Codex skills was fixed by bridging Academy universal skills into `<project>/.agents/skills` during project-mode Codex launches.

## Gap Remediation Tasks

No Critical, Medium, or Low remediation tasks remain.

Resolved during validation:

- Requirement: Academy universal skills are available to Codex in v1.
  Current state: delivered.
  Gap: fixed. Codex project launches now create symlinks for missing Academy universal skills in `<project>/.agents/skills`, preserving existing project-local skill names.
  Produces: reachable Codex skill entries from the project cwd.
  Consumed by: Codex runtime launch path.
  Replaces: agent-home-only `.agents/skills` exposure for project-mode runs.
  Verifiable outcomes:
  - [x] `scripts/agent.mjs` bridges missing project skill names.
  - [x] `tests/agent-cli.test.mjs` verifies the bridge creates project-reachable skills.
  - [x] Real `codex debug prompt-input` through `academy run --agent codex` lists `academy:check-in`, `academy:self-update`, and `academy:nightly-consolidation`.

## Scope Creep Review

| Item | Decision | Evidence |
| --- | --- | --- |
| Runtime selector on `academy run` | Keep | In scope: `docs/tasks/main/concepts/scope.md` requires `academy run <agent> --agent claude-code|codex -- ...`; implemented at `scripts/agent.mjs:87` and consumed by `scripts/agent.mjs:777`. |
| Codex project skill bridge | Keep+document | In scope because Codex-visible Academy skills are a hard v1 requirement. Defined at `scripts/agent.mjs:467`, reached from `scripts/agent.mjs:832`, documented at `README.md:141`. |
| Nightly Codex scheduled command | Keep | In scope: scheduled/nightly runtime selection is required; implemented at `scripts/agent.mjs:616` and consumed by `scripts/agent.mjs:795`. |

No out-of-scope runtime marketplace, hire-flow, RAG, or provider-flag translation work was added.

## Validation Coverage

| Area | Status | Definition | Usage | Render Chain |
| --- | --- | --- | --- | --- |
| Runtime parser and passthrough | Delivered | `parseRunArgs` defines `--agent` handling at `scripts/agent.mjs:87`. | Main dispatch calls `runAgent(parsed.name, parsed.runtime, parsed.passthrough)` at `scripts/agent.mjs:1052`; Codex argv is asserted at `tests/agent-cli.test.mjs:425`. | User runs `academy run kai --agent codex -- exec --json prompt` -> parser selects `codex` and preserves passthrough -> `runAgent` emits Codex launch args. |
| Neutral prompt output | Delivered | `academySystemPromptPath` returns `.academy/generated/academy-system-prompt.md` at `scripts/agent.mjs:530`; scaffold text references it at `scripts/agent.mjs:406`. | `renderAcademySystemPrompt` feeds `systemPromptPath` into Claude at `scripts/agent.mjs:823` and Codex at `scripts/agent.mjs:837`; prompt refresh is asserted at `tests/agent-cli.test.mjs:480`. | User creates/runs an agent -> surfaces render into the neutral file -> selected runtime receives that file path. |
| Dual skill rendering | Delivered | `writeSkillsScaffold` renders both `.claude/skills` and `.agents/skills` at `scripts/agent.mjs:519`. | `runAgent` calls `writeSkillsScaffold` at `scripts/agent.mjs:792`; tests assert both surfaces at `tests/agent-cli.test.mjs:504` and `tests/agent-cli.test.mjs:583`. | User creates/runs an agent -> universal skills render into both provider surfaces -> Codex project bridge exposes them during project launches. |
| Codex profile and launcher | Delivered | `writeCodexProfile` defines `$CODEX_HOME/academy-<agent>.config.toml` at `scripts/agent.mjs:730`; `launchCodex` is defined at `scripts/agent.mjs:757`. | `runAgent` writes the profile at `scripts/agent.mjs:794` and calls Codex at `scripts/agent.mjs:833`; tests assert profile content and launch args at `tests/agent-cli.test.mjs:436`. | User runs `academy run kai --agent codex` -> profile generated in CODEX_HOME -> Codex launched with `--profile`, `-C`, `--add-dir`, and CLI prompt override. |
| Codex skill reachability | Delivered | `writeProjectCodexSkillBridge` defines project-local skill exposure at `scripts/agent.mjs:467`. | Project-mode Codex calls the bridge at `scripts/agent.mjs:832`; tests assert project-visible skills and project-skill preservation at `tests/agent-cli.test.mjs:449` and `tests/agent-cli.test.mjs:468`. | User runs Codex from a project -> bridge writes missing `<project>/.agents/skills/*` symlinks -> real Codex `debug prompt-input` lists Academy skills. |
| Nightly runtime scheduling | Delivered | `registerNightlyConsolidationTask` accepts runtime and builds provider-specific command args at `scripts/agent.mjs:616`. | `createAgent` registers default nightly at `scripts/agent.mjs:602`; `runAgent` re-registers with selected runtime at `scripts/agent.mjs:795`; Helm capture tests assert Claude and Codex commands at `tests/agent-cli.test.mjs:630` and `tests/agent-cli.test.mjs:666`. | User creates/runs an agent -> Helm job is registered/replaced -> command uses default Claude or last selected Codex runtime. |
| Lifecycle memory parity | Delivered | `sync_memory.mjs` remains provider-neutral; Codex profile hook command is generated at `scripts/agent.mjs:749`. | Fake Codex lifecycle executes the profile Stop hook at `tests/lifecycle.test.mjs:197` and asserts session fields at `tests/lifecycle.test.mjs:201`. | Codex Stop payload -> profile hook command -> `sync_memory.mjs` records session and copies matching observations. |

## Dead Computations Found

| Variable | File | Computed By | Should Be Consumed By |
| --- | --- | --- | --- |
| None | n/a | n/a | n/a |

## Old Code Paths Still Active

| Old Path | Location | Replaced By | Impact |
| --- | --- | --- | --- |
| `.claude/academy-system-prompt.md` as generated launch prompt | Removed from new scaffold/run paths; `agent.yaml` now references `.academy/generated` at `scripts/agent.mjs:406`. | Neutral prompt path at `scripts/agent.mjs:530`. | No active stale launch path found. |
| Agent-home-only Codex skill exposure for project runs | Fixed by project skill bridge at `scripts/agent.mjs:832`. | Project-local `.agents/skills` bridge at `scripts/agent.mjs:467`. | No current reachability gap found. |
