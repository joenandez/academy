# Implementation Plan: Academy Subspace CLI Contracts And Provisioning

## Overview

Academy needs two related capabilities: stable read-only JSON CLI contracts for
Subspace, and a trusted way for Subspace to run Academy without requiring users
to clone or link the Academy repository. The right shape is a small Academy CLI
contract layer plus a Subspace provisioning path that reuses Subspace's existing
resource-to-`$SUBSPACE_HOME/bin` installation pattern.

This plan keeps the Academy CLI human-first by default. JSON only appears when
`--json` is present, and existing commands such as `run`, `hire`, `create`,
`clean`, `destroy`, and `notes` keep their current behavior.

## Technical Approach

On the Academy side, extend the top-level parser in `scripts/agent.mjs` so
`list`, `root`, and new `inspect` commands carry a `json` boolean. Keep
human-readable functions as the default path, and add small JSON serializers
for agent summary records, root metadata, inspect metadata, and JSON error
output. The existing constants and helpers provide most of the raw data:
`AGENTS_ROOT` at `scripts/agent.mjs:45`, `SURFACES` at
`scripts/agent.mjs:51`, `listAgents()` at `scripts/agent.mjs:700`, and
`readAgentYaml()` at `scripts/agent.mjs:719`.

JSON records should be deliberately boring:

- `academy list --json` returns `{ "agents": [...] }`.
- `academy root --json` returns `{ "packageRoot": "...", "agentsRoot": "..." }`.
- `academy inspect <name> --json` returns one agent record plus
  `surfaces: { identity: boolean, ... }`.
- `academy inspect <missing> --json` returns a non-zero JSON error such as
  `{ "error": { "code": "agent_not_found", "message": "...", "name": "..." } }`.

Use file-presence booleans for inspect surfaces in this first contract. This
matches the scope's unresolved validity question conservatively: Subspace can
learn whether an agent is partial without the CLI rejecting partially scaffolded
or legacy agents. `agent.yaml` can enrich metadata but should not be required
for inspect success if the agent directory exists.

For packaging, keep Academy as a dependency-free Node CLI package in this slice.
Do not introduce a bundler or standalone binary yet. Instead, document and
prepare a copyable distribution directory containing `bin/`, `scripts/`,
`skills/`, `templates/`, `hooks/`, `.claude-plugin/`, `package.json`, and
`README.md`, matching the existing `package.json` file list at `package.json:9`.
Subspace can bundle that tree under its existing `resources/` extraResources
path, which is already packaged outside asar at
`/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/electron-builder.config.cjs:66`.

On the Subspace side, follow the existing `subspace-memory` resource install
pattern rather than executing arbitrary `academy` from user `PATH`. Subspace
already resolves resources in dev and release builds at
`/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src-tauri/src/terminal/types.rs:1548`
and installs `subspace-memory` into `$SUBSPACE_HOME/bin` at
`/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src-tauri/src/terminal/types.rs:2468`.
Add an Academy-specific installer/resolver that prefers:

1. Explicit trusted env/config path, preserving the existing override behavior
   currently handled in `resolve_academy_agent_pane_binary(...)` at
   `/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src-tauri/src/commands/agent_chat.rs:887`.
2. Bundled/provisioned `$SUBSPACE_HOME/bin/academy`.
3. Development-only `PATH` fallback.

Keep the Subspace runtime identity as Claude-backed Academy for now. The
existing descriptor already returns `runtimeProvider: 'claude_code'` at
`/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src/domains/academy/launchDescriptor.ts:4`,
and the Agent Pane command builder already prefixes Academy launches as
`academy run <agent> --` at
`/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src-tauri/src/commands/agent_chat.rs:369`.

## Critical Files

- `scripts/agent.mjs` — *Core logic to modify*. Add JSON flag parsing,
  `inspect`, agent record serializers, root JSON, and JSON error output.
- `tests/agent-cli.test.mjs` — *Test to extend*. Add isolated tests for
  `list --json`, `inspect --json`, missing inspect JSON errors, `root --json`,
  and unchanged human `list` output.
- `package.json` — *Interface to verify*. Confirm the distributable file list
  includes every runtime asset Subspace must copy.
- `README.md` — *Pattern/documentation to update*. Replace local-dev-only
  install guidance with a clear distinction between Subspace-provisioned use
  and local development.
- `/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/electron-builder.config.cjs`
  — *Pattern to follow*. Existing `extraResources` packaging already ships
  `resources/` outside asar.
- `/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src-tauri/src/terminal/types.rs`
  — *Pattern to follow / Core logic to modify in Subspace*. Reuse
  `resolve_resource_path`, `$SUBSPACE_HOME/bin`, wrapper writing, and
  copy-if-changed installation patterns.
- `/Users/joe/Dev/.subspace/codename-grove/academy-agent-support/src-tauri/src/commands/agent_chat.rs`
  — *Core logic to modify in Subspace*. Update Academy binary resolution to
  prefer explicit trusted paths and provisioned Academy before dev fallback.

## External Dependencies — Verify Before Implementation

No new packages.

Academy already uses Node built-ins only and has no npm dependencies:
`package.json:17`. Keep JSON contracts and distribution support dependency-free.
If Subspace provisioning requires runtime handling, use Subspace's existing app
runtime or wrapper strategy rather than adding a new package to Academy.

## Verification — How We Know This Works

- `academy list --json` contract -> verifies by `node --test
  tests/agent-cli.test.mjs` asserting valid JSON, `agents: []` for missing or
  empty roots, sorted records for multiple agents, and unchanged `academy list`
  empty/non-empty human output.
- `academy inspect <name> --json` contract -> verifies by tests creating an
  isolated agent, parsing inspect JSON, checking `name`, `dir`, `displayName`,
  `runtimeProvider: "claude_code"`, and all eight surface keys.
- Missing inspect machine error -> verifies by a failure-path test asserting
  non-zero exit, parseable JSON on stderr or stdout, `error.code:
  "agent_not_found"`, and no human usage text in JSON mode.
- `academy root --json` contract -> verifies by a test asserting valid JSON
  includes absolute `packageRoot` and the active `AGENTS_ROOT` as `agentsRoot`.
- Distribution completeness -> verifies by `npm pack --dry-run` or an
  equivalent file-list assertion showing `bin/`, `scripts/`, `skills/`,
  `templates/`, `hooks/`, `.claude-plugin/`, and `package.json` are included.
- Provisioned Academy runs outside developer checkout -> verifies by a Subspace
  focused test or smoke script that copies the distributable tree to a temp
  resource/install dir, runs the provisioned `academy root --json`, and confirms
  `packageRoot` is not `/Users/joe/Dev/academy`.
- Trusted Subspace resolution -> verifies by Rust tests around
  `resolve_academy_agent_pane_binary` or its replacement asserting explicit env
  wins, provisioned `$SUBSPACE_HOME/bin/academy` wins over user `PATH`, and
  `PATH` fallback is disabled outside dev/test mode.

## Out-of-Bounds — DO NOT add

- Do not add dynamic runtime-provider preferences or Codex runtime selection.
- Do not add `academy hire --json --spec <file>`.
- Do not add a broad `academy doctor --json` or `academy capabilities --json`
  unless provisioning cannot be verified without it.
- Do not add a database, registry service, cache, telemetry, or feature flag.
- Do not rewrite existing human output except where tests prove `--json` is
  absent.
- Do not make `agent.yaml` mandatory for inspect success in this slice.
- Do not make production Subspace execute arbitrary `academy` from user `PATH`.
- Do not introduce a packaging bundler or standalone binary unless the Node
  package-tree approach is proven insufficient during implementation.

## Risks & Filled Assumptions

Risks:

- JSON error stream ambiguity could confuse consumers. Mitigation: choose one
  stream in implementation and lock it with tests; stderr is preferred for
  non-zero errors.
- Partial agents may look valid if inspect only checks directories. Mitigation:
  report surface booleans explicitly so Subspace can distinguish partial state.
- Packaging can expand into a release engineering project. Mitigation: first
  ship a copyable dependency-free Node package tree and document the runtime
  assumption.
- Subspace currently resolves Academy from common install paths and `PATH`.
  Mitigation: keep env overrides, add provisioned path before user locations,
  and gate unrestricted `PATH` fallback to dev/test.
- Subspace and Academy live in separate working trees. Mitigation: sequence
  Academy contract work first, then Subspace provisioning/resolution changes
  with focused tests in the Subspace repo.

Filled assumptions:

- `displayName` can be derived from the agent name when no scalar display field
  exists in `agent.yaml`.
- `runtimeProvider` remains static as `claude_code` for this scope.
- `inspect --json` succeeds for an existing agent directory even if `agent.yaml`
  is missing, and reports missing surfaces as `false`.
- Academy remains a Node CLI for this plan; Subspace provisioning handles
  runtime availability by installing a wrapper that invokes the app/system Node
  path available to Subspace.
- `root --json` does not include `version` unless implementation finds
  provisioning needs it; `packageRoot` and `agentsRoot` are the required fields.
