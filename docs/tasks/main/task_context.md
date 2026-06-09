# Task Context: Academy Codex Runtime Parity

## Classification

- Tier: COMPREHENSIVE
- Reason: Public CLI/API surface change (`academy run --agent ...`), broad runtime behavior change, external Codex config/profile dependency, and scheduled/nightly runtime selection.

## Technical Research

### Existing Academy Runtime

- CLI parsing currently handles `run` as `name + passthrough after --` with no Academy-owned run flags before passthrough: `scripts/agent.mjs:60`, `scripts/agent.mjs:66`, `scripts/agent.mjs:78`.
- Agent state already lives under a provider-neutral `AGENTS_ROOT`, with named agent directories from `agentDir(name)`: `scripts/agent.mjs:45`, `scripts/agent.mjs:161`.
- Current shared run preparation validates the agent, backfills skills, renders the prompt, and sets `ACADEMY_AGENT_DIR` / `ACADEMY_AGENT_NAME`: `scripts/agent.mjs:653`, `scripts/agent.mjs:668`, `scripts/agent.mjs:671`.
- Current launch is Claude-only through `launchClaude()`, passing `--system-prompt-file` and, in project mode, a project-local `--plugin-dir`: `scripts/agent.mjs:635`, `scripts/agent.mjs:679`, `scripts/agent.mjs:687`.
- Current prompt output path is Claude-shaped at `.claude/academy-system-prompt.md`: `scripts/agent.mjs:465`, `scripts/agent.mjs:480`, `scripts/agent.mjs:497`.
- Current universal skills are rendered only under `.claude/skills`: `scripts/agent.mjs:423`, `scripts/agent.mjs:446`, `scripts/agent.mjs:456`.
- Current project-local Claude plugin instance symlinks `.claude-plugin`, `hooks`, and agent `.claude/skills`: `scripts/agent.mjs:395`, `scripts/agent.mjs:399`, `scripts/agent.mjs:402`.
- Current nightly registration always schedules `academy run <name> -- -p <prompt>`, so it is implicitly Claude-only: `scripts/agent.mjs:564`, `scripts/agent.mjs:577`, `scripts/agent.mjs:588`.

### Existing Tests And Patterns

- Dry-run launch tests assert project-mode Claude behavior, prompt path, cwd, and Academy env vars: `tests/agent-cli.test.mjs:212`.
- Prompt refresh tests assert create/run writes the generated prompt and includes all eight surfaces: `tests/agent-cli.test.mjs:236`.
- Universal skill scaffold tests assert rendered paths and no unresolved template variables: `tests/agent-cli.test.mjs:265`, `tests/agent-cli.test.mjs:302`.
- Nightly registration test asserts Helm schedules `academy run kai -- -p <prompt>`: `tests/agent-cli.test.mjs:339`.
- Fake lifecycle test is the pattern for provider-specific lifecycle verification: `tests/lifecycle.test.mjs:25`, `tests/lifecycle.test.mjs:66`.
- Stop hook records sessions and syncs observations from provider-neutral `ACADEMY_*` env plus `session_id`: `hooks/sync_memory.mjs:47`, `hooks/sync_memory.mjs:65`, `hooks/sync_memory.mjs:96`.

### Codex External Facts

- Codex `--profile` layers `$CODEX_HOME/<name>.config.toml` on top of base user config; local CLI help confirms `-p, --profile <CONFIG_PROFILE_V2>`.
- Codex supports `-C/--cd`, `--add-dir`, `-c/--config`, `--ask-for-approval`, `--sandbox`, and `--dangerously-bypass-hook-trust`; local `codex --help` and `codex exec --help` confirm these flags.
- Codex docs define `model_instructions_file` as the replacement for built-in instructions; `instructions` is reserved for future use, so Academy should use `model_instructions_file` for the selected agent prompt.
- Codex project config files load from `.codex/config.toml` from repo root to cwd only for trusted projects; closer files win, and project config cannot override profile selection or credential/provider keys.
- Codex loads hooks from `hooks.json` files or inline `[hooks]` tables beside active config layers; user-level hooks remain independent of project trust.
- Codex skills scan `.agents/skills` from cwd up to repo root, user `$HOME/.agents/skills`, admin, and system locations; symlinked skill folders are supported.

## Selected Design

### Runtime Selection

Add an Academy-owned run option parser for tokens before `--`:

- `academy run <name>` defaults to `claude-code`.
- `academy run <name> --agent claude-code -- ...` explicitly launches Claude Code.
- `academy run <name> --agent codex -- ...` launches Codex.
- Everything after `--` remains provider-owned passthrough with no translation.

### Shared Run Preparation

Extract current `runAgent()` preparation into shared helpers:

- Validate agent and legacy delegation.
- Backfill boot scaffolds, memory scaffold, and both Claude/Codex skill surfaces.
- Render the Academy system prompt to a neutral generated path.
- Build provider-neutral env: `ACADEMY_AGENT_DIR`, `ACADEMY_AGENT_NAME`, and project-mode `ACADEMY_PROJECT_DIR`.
- Determine agent-home vs project cwd.

### Prompt Path

Use a neutral generated prompt path for both runtimes:

- Preferred path: `<agentDir>/.academy/generated/academy-system-prompt.md`.
- Claude Code receives it via `--system-prompt-file`.
- Codex receives it via CLI `-c model_instructions_file="<promptPath>"` so project config cannot override the selected Academy agent identity.
- README should document the neutral prompt path used by both runtimes.

### Claude Code Runtime

Keep current Claude behavior semantically unchanged:

- Agent-home mode: launch Claude in agent home with `--system-prompt-file`.
- Project mode: create project-local plugin instance and launch with `--plugin-dir` plus `--system-prompt-file`.
- Continue writing `.claude/settings.local.json`, `.claude/skills`, `.claude-plugin` symlink, and hooks symlink.

### Codex Runtime

Use the user’s normal Codex home/config to preserve auth and global MCPs/skills/plugins:

- Generate or refresh profile file in normal `CODEX_HOME` (default `~/.codex`) named `academy-<agent>.config.toml`.
- Launch with `codex --profile academy-<agent> -C <cwd> --add-dir <agentDir> -c model_instructions_file="<promptPath>" ...passthrough`.
- Use `ACADEMY_CODEX_BIN` for tests/overrides, parallel to `ACADEMY_CLAUDE_BIN`.
- Profile includes Academy agent-level Stop hook and minimal runtime defaults; avoid setting provider/auth/global MCP values so user global config continues to merge.
- Project-local Codex config and `.agents/skills` merge normally through `-C <projectDir>` for trusted projects.

### Codex Skills

Render Academy universal skills from the same templates into both:

- Claude: `<agentDir>/.claude/skills/<skill>/SKILL.md`.
- Codex-native repository/user-discovery surface: `<agentDir>/.agents/skills/<skill>/SKILL.md`.

Use a shared rendering helper so skill content does not drift. Codex plugin packaging can be added as a future distribution path, but v1 must make skills available through `.agents/skills`.

### Runtime Preference And Nightly

Use Helm nightly re-registration as the scheduled-runtime preference carrier:

- `claude-code` remains default when no scheduled runtime preference exists.
- Scheduled/nightly registration should include `--agent <runtime>` based on:
  - Claude-only: `claude-code`
  - Codex-only: `codex`
  - Mixed: last-used runtime for that agent
- Re-register or replace the nightly Helm task on create/run so the scheduled command stays aligned.
- Do not add a separate agent-local runtime preference file in v1; the Helm task command carries the scheduled runtime.

### Verification Spine

- Runtime parser changes -> CLI dry-run tests for default Claude, explicit Claude, explicit Codex, invalid provider, and passthrough preservation.
- Neutral prompt path -> create/run prompt tests assert prompt is refreshed and provider launches reference the neutral path.
- Codex profile launch -> dry-run/fake Codex tests assert `--profile`, `-C`, `--add-dir`, `-c model_instructions_file=...`, env vars, and profile file content.
- Codex skills -> scaffold/backfill tests assert `.agents/skills` has all universal skills with resolved paths and no template variables.
- Nightly runtime behavior -> Helm schedule tests assert default Claude, explicit Codex, and last-used mixed-agent commands via Helm re-registration.
- Memory sync -> existing hook tests remain green; add Codex-shaped fake lifecycle or hook invocation where practical.

## Filled Assumptions

- Use normal `CODEX_HOME` profile files instead of an isolated Academy `CODEX_HOME`, because the scope requires preserving global Codex auth, MCPs, skills, and plugins.
- Use `.academy/generated/academy-system-prompt.md` as the neutral prompt path, because the user selected "neutral" when asked about `.codex` vs neutral generated output.
- Use `.agents/skills` as the required Codex-native skill surface for v1; Codex plugin distribution remains future-facing because direct skill folders are the documented local authoring/discovery path.
- Avoid automatically adding dangerous Codex bypass flags for normal interactive runs; scheduled/non-interactive policy should be explicit in the planned nightly runtime path and tests.
- Phase 0 must verify exact Codex profile resolution and hook TOML syntax with the real Codex CLI before implementation depends on generated profiles.

## Open Questions

- None blocking for planning. The execution task graph includes an explicit Phase 0 real-Codex verification gate for profile resolution and hook TOML syntax.
