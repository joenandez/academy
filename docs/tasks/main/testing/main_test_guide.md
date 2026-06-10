# Academy Codex Runtime Parity Test Guide

## Testing Overview

Complexity: Complex. This change crosses CLI parsing, provider launch commands, generated files, Codex profile configuration, lifecycle memory hooks, nightly scheduling, and public documentation.

Scope: validate that Academy still defaults to Claude Code, can launch Codex with the same Academy agent identity, renders both Claude and Codex skill surfaces, preserves core agent CLI workflows, and keeps scheduled nightly behavior aligned to the selected runtime.

Prerequisites:
- Node.js 18+.
- Repository checked out with `npm test` available.
- Optional but recommended: `codex` on `PATH` for the real CLI startup smoke.
- Use temporary `AGENTS_ROOT` and `CODEX_HOME` values so local agent state is not modified.

## Environment Setup

- [ ] Run `npm test` from the repository root -> verify all default tests pass, with zero todo tests and only opt-in real-provider tests skipped.
- [ ] Create a temporary workspace with `AGENTS_ROOT`, `CODEX_HOME`, and a project directory -> verify paths are outside the user's real `~/.academy` and `~/.codex`.
- [ ] Run `AGENTS_ROOT=<tmp>/agents ACADEMY_SKIP_NIGHTLY_TASK=1 node ./bin/academy create kai` -> verify the command creates `kai` and reports nightly registration skipped only because the environment requested it.

## Core Test Cases

### 1. Default Claude Runtime
- [ ] Run `AGENTS_ROOT=<tmp>/agents ACADEMY_DRY_RUN=1 node ./bin/academy run kai -- -p smoke` from a project directory -> verify output launches Claude Code, includes `--plugin-dir`, includes `--system-prompt-file <agent>/.academy/generated/academy-system-prompt.md`, and preserves `-p smoke`.
- [ ] Run the same command from inside `<agentDir>` -> verify output omits `--plugin-dir` and uses the agent home as cwd.
- [ ] Run `academy run kai --agent claude-code -- -p smoke` -> verify it matches the default Claude behavior.

### 2. Codex Runtime Selection
- [ ] Run `AGENTS_ROOT=<tmp>/agents CODEX_HOME=<tmp>/codex ACADEMY_DRY_RUN=1 node ./bin/academy run kai --agent codex -- exec --json "hello"` -> verify output launches Codex with `--profile academy-kai`, `-C <projectDir>`, `--add-dir <agentDir>`, and `-c model_instructions_file="<agentDir>/.academy/generated/academy-system-prompt.md"`.
- [ ] Inspect `<CODEX_HOME>/academy-kai.config.toml` -> verify it contains the Academy Stop hook and writable root for `<agentDir>`, and does not contain auth, provider, model, MCP, or global plugin settings.
- [ ] Run the Codex command from a project path and agent/Codex-home paths containing spaces -> verify the dry-run output and profile file preserve those paths correctly.
- [ ] If `codex` is installed, run `academy run kai --agent codex -- --help` -> verify the real Codex CLI starts and prints help through Academy's launch path.

### 3. Core Academy Agent Workflows
- [ ] Run `academy list --json` -> verify `kai` appears with its agent directory.
- [ ] Run `academy inspect kai --json` -> verify all eight boot surfaces are present.
- [ ] Run `ACADEMY_AGENT_DIR=<agentDir> academy notes add "codex parity e2e note"` then `academy notes list --last 1` -> verify the note is appended and listed.
- [ ] Edit `<agentDir>/identity.md`, then run `academy run kai --agent codex -- --help` or a dry-run Codex launch -> verify `<agentDir>/.academy/generated/academy-system-prompt.md` refreshes and includes the edited identity.

### 4. Skill Surface Parity
- [ ] Inspect `<agentDir>/.claude/skills/{check-in,self-update,nightly-consolidation}/SKILL.md` -> verify all three Claude-visible universal skills exist with no unresolved `{{...}}` placeholders.
- [ ] Inspect `<agentDir>/.agents/skills/{check-in,self-update,nightly-consolidation}/SKILL.md` -> verify all three Codex-visible universal skills exist with no unresolved `{{...}}` placeholders.
- [ ] Launch Codex from a project directory, then inspect `<projectDir>/.agents/skills/{self-update,nightly-consolidation}` -> verify the project-local bridge exposes Academy skills from Codex's cwd.
- [ ] Create a project-owned `<projectDir>/.agents/skills/check-in/SKILL.md` before launching Codex -> verify Academy preserves that project skill and only bridges missing Academy skill names.
- [ ] Open `<agentDir>/.agents/skills/self-update/SKILL.md` -> verify it references `.agents/skills`, not `.claude/skills`, in its skill path text.

### 5. Nightly Runtime Scheduling
- [ ] Run `academy create kai` with a fake `helm-tasks` executable on `PATH` -> verify the scheduled command includes `run kai --agent claude-code --`.
- [ ] Run `academy run kai --agent codex -- exec smoke` with fake `helm-tasks` and `ACADEMY_SKIP_NIGHTLY_TASK=0` -> verify the replacement scheduled command includes `run kai --agent codex -- --ask-for-approval never --sandbox workspace-write exec`.
- [ ] Make fake `helm-tasks` fail during `academy run` -> verify the run continues and stderr contains a non-fatal warning about the nightly job not being updated.

## Data Validation

- [ ] Verify generated prompt path: `<agentDir>/.academy/generated/academy-system-prompt.md` exists -> confirm it includes all `<!-- academy:surface:* -->` markers.
- [ ] Verify Codex profile path: `<CODEX_HOME>/academy-kai.config.toml` exists -> confirm `writable_roots` contains the exact agent directory.
- [ ] Verify memory lifecycle tests or fake Codex lifecycle run -> confirm `memory/sessions.jsonl` records `sessionId`, `agentName`, `cwd`, and `projectDir`.

## Security

- [ ] Review the generated Codex profile -> verify no user secrets, API keys, provider credentials, model settings, or MCP definitions are copied into the Academy profile.
- [ ] Review the Codex launch command -> verify Academy protects the selected agent identity with CLI `-c model_instructions_file=...` instead of relying on project-local config.

## Known Issues & Limitations

- Real model execution is not required for the default automated suite; real Claude lifecycle coverage remains opt-in behind its environment gate.
- Codex project config only merges when Codex trusts the project, which is owned by Codex rather than Academy.

## Results Documentation

- [ ] Record the `npm test` result, including pass/fail/skip/todo counts.
- [ ] Record the direct CLI smoke commands used and the temporary root path.
- [ ] Record whether the real Codex CLI startup smoke was run or skipped because `codex` was unavailable.
- [ ] Attach any failing command output with the exact `AGENTS_ROOT`, `CODEX_HOME`, and project path shape used.

## Coverage Summary

Workflows: 5. Steps: 28. Estimated time: 20-30 minutes with Codex installed, 10-15 minutes without the optional real Codex startup smoke.
