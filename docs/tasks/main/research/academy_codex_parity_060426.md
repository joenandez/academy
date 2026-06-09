---
date: 2026-06-04T12:20:02-0700
git_commit: 6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b
branch: main
repository: Codename-Inc/academy
topic: academy-codex-parity
tags:
  - academy
  - codex
  - claude-code
  - parity
  - research
status: complete
last_updated: 2026-06-04
last_updated_by: codex
last_updated_note: Added profile-based Codex layering recommendation for Academy agent setup plus project-local config/skills merge.
---

# Research: Academy Codex Parity

## Metadata

- Date: 2026-06-04T12:20:02-0700
- Repository: Codename-Inc/academy
- Branch: main
- Commit: 6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b
- Status: complete

## Research Question

How can Academy build a parity version of its current Claude Code-backed agent runtime using Codex instead, while selecting the runtime through Academy CLI flags such as:

```bash
academy run {agent} --agent codex|claude-code -- {codex or claude-code flags}
```

## Summary

Academy should add Codex as a second launch backend rather than rewrite the agent model. The portable parts already exist: agent homes under `AGENTS_ROOT`, eight editable boot surfaces, generated prompt assembly, universal skills, notes CLI, memory archive, and Stop-hook memory sync. The Claude-specific pieces are concentrated around command parsing, runtime launch flags, `.claude` paths, `.claude-plugin` packaging, `settings.local.json` permissions, and Claude-specific lifecycle tests. Current parsing only supports `run <name>` plus passthrough after `--`, so `--agent codex|claude-code` needs to be parsed before passthrough and default to `claude-code` for compatibility ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L60), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L66), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L78)).

For Codex prompt parity, use the rendered Academy prompt as `model_instructions_file`, not `developer_instructions`, because Codex documents `model_instructions_file` as the replacement for built-in instructions and says `instructions` is reserved for future use; `developer_instructions` is additive context ([Codex config reference](https://developers.openai.com/codex/config-reference)). Academy already renders all eight surfaces into one generated prompt file before launch, so the same renderer can be reused with a provider-neutral path; follow-up scope selected `<agentDir>/.academy/generated/academy-system-prompt.md` for both runtimes ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L480), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L497)).

The largest open implementation risk is hook/plugin activation. Claude supports per-run `--plugin-dir`; current local Codex CLI help did not show a direct equivalent. Codex does support plugin-bundled hooks through `.codex-plugin/plugin.json`, lifecycle hooks in config, and compatibility `CLAUDE_PLUGIN_ROOT`, but non-managed plugin hooks require user trust review unless automation passes `--dangerously-bypass-hook-trust` ([Codex hooks](https://developers.openai.com/codex/hooks), [Codex plugin build docs](https://developers.openai.com/codex/plugins/build)). This should be spiked before committing to a hook packaging strategy.

## Detailed Findings

### Academy Runtime Shape

Academy’s reusable runtime state is provider-neutral. It stores agents under `AGENTS_ROOT`, validates names with one shared regex, and resolves each agent directory without reference to Claude ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L45), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L49), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L161)).

The eight Academy boot surfaces are also provider-neutral in content: `identity`, `role`, `knowledge`, `goals`, `priorities`, `threads`, `notes`, and `dailys` are defined once and rendered through the same prompt assembly path ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L51), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L480), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L491)).

The current generated prompt path is Claude-shaped. `academySystemPromptPath()` writes `.claude/academy-system-prompt.md`, and `writeAgentClaudeMd()` tells users that `academy run` compiles surfaces into that `.claude` file ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L369), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L465), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L497)).

`academy run` already has the right shared preparation sequence: validate the agent, backfill skills, render the prompt, set `ACADEMY_AGENT_DIR` and `ACADEMY_AGENT_NAME`, detect agent-home vs project mode, and set `ACADEMY_PROJECT_DIR` in project mode ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L653), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L668), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L671), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L677)).

The provider-specific part of `academy run` is currently the call to `launchClaude()`: agent-home mode launches Claude with `--system-prompt-file`, while project mode creates a project-local plugin instance and launches Claude with both `--plugin-dir` and `--system-prompt-file` ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L635), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L679), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L687)).

### CLI Provider Selection

The parser currently treats `run` as `{ command, name, passthrough }` and extracts passthrough only after a literal `--`, so Academy-owned `--agent` must be parsed from the tokens between `<name>` and `--` ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L60), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L66), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L78)).

The correct compatibility contract is:

```bash
academy run kai
academy run kai --agent claude-code -- -p "Run today's analytics review"
academy run kai --agent codex -- "Run today's analytics review"
academy run kai --agent codex -- exec --json "Run today's analytics review"
```

Academy should not reinterpret provider passthrough flags. Claude currently uses `-p` in tests for print mode, while Codex CLI uses `-p` as `--profile`; keeping all flags after `--` runtime-owned avoids collisions ([tests/agent-cli.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/agent-cli.test.mjs#L221), [tests/claude-lifecycle.e2e.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/claude-lifecycle.e2e.test.mjs#L49)).

### Codex Prompt Parity

Claude has an exact runtime flag for Academy’s current generated prompt file: `--system-prompt-file` ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L679), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L688)). Codex does not expose that same flag in the local `codex --help` output observed during research, but it supports `-c key=value` config overrides, `--profile`, `--cd`, `--sandbox`, `--add-dir`, and `--ask-for-approval` in both interactive and non-interactive modes.

For full prompt replacement, Codex should receive Academy’s generated prompt through `model_instructions_file`. The Codex config reference identifies `model_instructions_file` as the replacement for built-in instructions and separately describes `developer_instructions` as additional injected instructions; therefore `developer_instructions` is useful for small additive runtime context, but not the main parity path for Academy’s durable boot surfaces ([Codex config reference](https://developers.openai.com/codex/config-reference)).

**Superseded by follow-up scope/design:** the project later selected a neutral generated prompt path, `<agentDir>/.academy/generated/academy-system-prompt.md`, for both runtimes. The earlier option below is retained as research history only:

Initial implementation can keep using `.claude/academy-system-prompt.md` for both providers to minimize churn, but the cleaner provider-neutral shape is:

- `renderAcademyPrompt(dir, name, provider)` writes `.claude/academy-system-prompt.md` for Claude Code.
- [SUPERSEDED] The same renderer writes `.codex/academy-system-prompt.md` or `.academy/academy-system-prompt.md` for Codex. Follow-up scope selected `<agentDir>/.academy/generated/academy-system-prompt.md` for both runtimes.
- Codex launch passes `-c model_instructions_file="<promptPath>"`.

### Codex Launch Shape

For interactive Codex, Academy can launch:

```bash
codex -C "$cwd" --add-dir "$agentDir" -c "model_instructions_file=\"$promptPath\"" ...passthrough
```

For non-interactive Codex, users can choose the Codex subcommand through passthrough:

```bash
academy run kai --agent codex -- exec --json --output-last-message /tmp/last.txt "Do the task"
```

Academy should set the same `ACADEMY_AGENT_DIR`, `ACADEMY_AGENT_NAME`, and `ACADEMY_PROJECT_DIR` environment variables for both providers because the notes CLI and Stop hook already rely on those provider-neutral vars ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L671), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L687), [hooks/sync_memory.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L47), [hooks/sync_memory.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L96)).

For unattended Codex jobs, Academy should document or optionally append:

```bash
--ask-for-approval never --sandbox workspace-write --add-dir "$agentDir"
```

Codex permission profiles are a richer future option. The permissions docs describe built-ins `:read-only`, `:workspace`, and `:danger-full-access`, and profile workspace roots can add directories such as `~/.academy/agents/<agent>` to the effective workspace ([Codex permissions](https://developers.openai.com/codex/permissions)).

### Hooks And Memory Sync

Academy’s current Stop hook config is minimal and Claude-specific only in its root variable. It runs `node ${CLAUDE_PLUGIN_ROOT}/hooks/sync_memory.mjs` on `Stop` ([hooks/hooks.json](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/hooks.json#L1), [hooks/hooks.json](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/hooks.json#L7)).

The hook implementation is mostly provider-neutral. It reads JSON from stdin, records `payload.session_id`, captures `payload.cwd`, uses `ACADEMY_AGENT_DIR`, `ACADEMY_AGENT_NAME`, and `ACADEMY_PROJECT_DIR`, and syncs matching Subspace observations when memory sync is enabled ([hooks/sync_memory.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L7), [hooks/sync_memory.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L47), [hooks/sync_memory.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L65), [hooks/sync_memory.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L96)).

Codex hooks receive a JSON object on stdin with common fields including `session_id`, `transcript_path`, `cwd`, `hook_event_name`, and `model`; `Stop` is a supported event, and Codex command hooks can be configured in `config.toml`, `hooks.json`, or plugin-bundled hooks ([Codex hooks](https://developers.openai.com/codex/hooks)). This makes `sync_memory.mjs` reusable for Codex as long as the hook can be loaded and trusted.

Codex plugin hooks use `.codex-plugin/plugin.json`, default to `hooks/hooks.json`, and receive `PLUGIN_ROOT` plus compatibility `CLAUDE_PLUGIN_ROOT`. The current command may work through the compatibility variable, but the Codex-native command should use `${PLUGIN_ROOT}` ([Codex plugin build docs](https://developers.openai.com/codex/plugins/build)).

The implementation risk is activation, not schema. Claude supports per-run `--plugin-dir`; Codex plugin management is installation/config based, and local CLI help did not reveal an equivalent per-run plugin directory flag. Academy should spike one of these strategies:

- Generate a temporary Codex config layer/profile with inline `[[hooks.Stop]]` for this launch.
- Create a project-local `.codex/hooks.json` and trust/project-config path.
- Install/enable an Academy Codex plugin and use `--dangerously-bypass-hook-trust` only for vetted automation.
- Use `PostToolUse` or `SessionStart` only as supplementary context, not as a replacement for Stop memory sync.

### Plugin And Skill Packaging

The repo currently ships only a Claude plugin manifest. Tests assert `.claude-plugin/plugin.json` points at `./hooks/hooks.json` and that the hook config has Stop only, with no startup injection hooks ([.claude-plugin/plugin.json](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/.claude-plugin/plugin.json#L1), [tests/agent-cli.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/agent-cli.test.mjs#L177), [tests/agent-cli.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/agent-cli.test.mjs#L186)).

Codex parity needs a parallel `.codex-plugin/plugin.json` if Academy chooses plugin packaging. Codex plugin manifests use `.codex-plugin/plugin.json`; manifest fields can point to `skills`, `mcpServers`, `apps`, and `hooks`, and hook paths must be relative to plugin root and stay inside it ([Codex plugin build docs](https://developers.openai.com/codex/plugins/build)).

Academy’s universal skills are currently written under `.claude/skills`, and project plugin instances symlink those skills into the Claude plugin instance ([scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L402), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L447), [scripts/agent.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L461)). Codex skills are standard `SKILL.md` directories and can be made available through Codex skill/plugin mechanisms; Academy should expose the same generated skill content through a Codex-visible location rather than relying on `.claude/skills` alone ([Codex skills](https://developers.openai.com/codex/skills)).

### Tests And Verification

Existing tests provide the right template. The dry-run test asserts project-mode Claude launch creates a project-local plugin dir, passes `--system-prompt-file`, runs from the project cwd, and exposes Academy env vars ([tests/agent-cli.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/agent-cli.test.mjs#L212)). The prompt refresh test confirms `academy run` rewrites the generated prompt from source surfaces before launch ([tests/agent-cli.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/agent-cli.test.mjs#L236)).

Lifecycle coverage should mirror the current fake Claude and opt-in real Claude tests. The fake lifecycle test loads the project plugin, expands hook paths, invokes Stop, and asserts sessions and synced observations ([tests/lifecycle.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/lifecycle.test.mjs#L25), [tests/lifecycle.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/lifecycle.test.mjs#L66)). The opt-in real Claude test verifies real Stop-hook behavior with a fixed session id and `--permission-mode bypassPermissions` ([tests/claude-lifecycle.e2e.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/claude-lifecycle.e2e.test.mjs#L25), [tests/claude-lifecycle.e2e.test.mjs](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/claude-lifecycle.e2e.test.mjs#L49)).

Add tests in this order:

1. Parser unit behavior: `academy run kai --agent codex -- ...` selects Codex while preserving passthrough exactly.
2. Dry-run behavior: Claude default remains unchanged; Codex emits `codex`, `-C` or `--cd`, `--add-dir <agentDir>`, and `-c model_instructions_file=...`.
3. Prompt behavior: Codex launch refreshes the same eight-surface prompt.
4. Fake Codex lifecycle: fake binary consumes the generated config/hook wiring and invokes Stop with Codex-shaped JSON.
5. Opt-in real Codex E2E behind `ACADEMY_RUN_CODEX_E2E=1`.

## Code References

- [scripts/agent.mjs:60](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L60): top-level argument parsing.
- [scripts/agent.mjs:78](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L78): passthrough extraction after literal `--`.
- [scripts/agent.mjs:385](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L385): Claude plugin symlink scaffold.
- [scripts/agent.mjs:395](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L395): project-local plugin instance creation.
- [scripts/agent.mjs:480](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L480): generated Academy prompt rendering.
- [scripts/agent.mjs:512](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L512): Claude settings and permissions scaffold.
- [scripts/agent.mjs:635](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L635): current Claude-only launcher.
- [scripts/agent.mjs:653](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/scripts/agent.mjs#L653): current `runAgent()` flow.
- [hooks/hooks.json:1](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/hooks.json#L1): Stop hook configuration.
- [hooks/sync_memory.mjs:47](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L47): Stop session recording.
- [hooks/sync_memory.mjs:96](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/hooks/sync_memory.mjs#L96): provider-neutral memory sync entrypoint.
- [tests/agent-cli.test.mjs:212](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/agent-cli.test.mjs#L212): dry-run project-mode launch test.
- [tests/lifecycle.test.mjs:66](https://github.com/Codename-Inc/academy/blob/6c5775ceb4f9fe6bf32b5ac1888d83f5b5613b2b/tests/lifecycle.test.mjs#L66): fake lifecycle Stop-hook test.

## Architecture Insights

The smallest viable design is a provider switch at the `academy run` boundary:

- `prepareAgentRun(name)` handles validation, legacy delegation, skill backfill, prompt render, env construction, and agent-home/project mode.
- `launchClaudeCode(context, passthrough)` preserves today’s behavior exactly.
- `launchCodex(context, passthrough)` invokes `codex` or `ACADEMY_CODEX_BIN`, passes `--profile academy-<agent>`, `-C <cwd>`, `--add-dir <agentDir>`, and `-c model_instructions_file="<promptPath>"`, then forwards passthrough unchanged.
- Provider-specific scaffold functions write `.claude` and `.codex` runtime assets without duplicating the eight source surfaces.
- Codex profiles are the preferred agent-specific layer. Project-local `.codex/` config, hooks, rules, `AGENTS.md`, and `.agents/skills` supply the project-local layer when Codex is launched with `-C <projectDir>` and the project is trusted.
- Keep Academy identity/prompt protection in CLI `-c model_instructions_file=...`, because CLI overrides sit above profile and project config. This is the closest Codex equivalent to Claude's launch-time `--system-prompt-file`.
- Plugin packaging remains useful for distributed Codex skills/MCPs/hooks, but Academy does not need a per-run Codex `--plugin-dir` equivalent for the core parity path if it generates an agent profile and relies on project `.codex` for local merge.

Provider names should be explicit and stable:

- `claude-code`: default, current behavior.
- `codex`: new backend.

Avoid `--runtime` or `--provider` unless there is a strong product reason; the user request names `--agent`, and the command shape can support it directly.

## Related Research

- Official Codex config reference: https://developers.openai.com/codex/config-reference
- Official Codex hooks guide: https://developers.openai.com/codex/hooks
- Official Codex CLI reference: https://developers.openai.com/codex/cli/reference
- Official Codex plugin build guide: https://developers.openai.com/codex/plugins/build
- Official Codex permissions guide: https://developers.openai.com/codex/permissions
- Official Codex skills guide: https://developers.openai.com/codex/skills
- Prior local context: `docs/academy-agent-memory-rag-spec.md` records adjacent thinking about blended Academy memory RAG, but it does not change the runtime parity recommendation.

## Open Questions

1. Does Academy want generated Codex profiles to live in the user's normal `~/.codex/<profile>.config.toml`, or should `academy run` use an Academy-managed `CODEX_HOME` while preserving the user's authentication/config access?
2. Resolved after follow-up: Academy should move both providers to a neutral `<agentDir>/.academy/generated/academy-system-prompt.md` path.
3. Should Academy automatically add `--ask-for-approval never --sandbox workspace-write --add-dir <agentDir>` for scheduled/unattended Codex runs, or should it document those as user-controlled runtime flags?
4. Should Academy expose universal skills to Codex via plugin-bundled skills, `.agents/skills` symlinks, or both?
5. Should `academy hire` also support `--agent codex`, or should the first parity slice focus only on `academy run`?

## Follow-up Research 2026-06-04T12:31:51-0700

The recommended Codex parity model is now more specific than the original hook/plugin spike language:

- Use Codex profiles as the Academy agent-specific layer. Academy should generate or refresh a profile such as `~/.codex/academy-kai.config.toml` with the agent's Stop hook, sandbox/approval defaults, and any Academy-owned MCP defaults. Codex documents profiles as named configuration layers loaded after the base user config and before project/CLI config when launched with `--profile <name>` (Codex advanced config: https://developers.openai.com/codex/config-advanced#profiles).
- Use project-local Codex files for the project-specific layer. Launching Codex with `-C <projectDir>` lets trusted project `.codex/config.toml` files, project-local hooks, project-local rules, `AGENTS.md`, and project `.agents/skills` contribute local setup. Codex walks from the project root to cwd and loads project `.codex/config.toml`; closer config wins when keys collide, and project layers only load for trusted projects (Codex advanced config: https://developers.openai.com/codex/config-advanced#project-config-files-codexconfigtoml).
- Use CLI `-c model_instructions_file=...` for the Academy rendered prompt. Because project config layers are above profile layers, putting the Academy prompt only in the profile would let project config override it. A launch-time `-c` override preserves the selected Academy agent identity while still allowing project-local skills/MCPs/hooks to merge.
- Use `--add-dir <agentDir>` so a Codex run launched from the project can write to the Academy agent home under workspace-write sandboxing.
- Do not model Codex parity as "Claude `--plugin-dir`, but for Codex." Claude uses project-local plugin instances to isolate and merge setup. Codex's closer equivalent is profile + trusted project config/skills. Codex plugins remain useful for installable/distributed bundles, but the primary Academy runtime should not depend on a per-run plugin directory mechanism.

Example launch:

```bash
ACADEMY_AGENT_DIR="$agentDir" \
ACADEMY_AGENT_NAME="kai" \
ACADEMY_PROJECT_DIR="$projectDir" \
codex --profile academy-kai \
  -C "$projectDir" \
  --add-dir "$agentDir" \
  -c model_instructions_file="\"$agentDir/.academy/generated/academy-system-prompt.md\"" \
  "$@"
```

Example generated profile:

```toml
# ~/.codex/academy-kai.config.toml
sandbox_mode = "workspace-write"
approval_policy = "on-request"

[sandbox_workspace_write]
writable_roots = ["/Users/joe/.academy/agents/kai"]

[features]
hooks = true

[[hooks.Stop]]
[[hooks.Stop.hooks]]
type = "command"
command = "node /Users/joe/Dev/academy/hooks/sync_memory.mjs"
timeout = 30
statusMessage = "Syncing Academy memory"
```
