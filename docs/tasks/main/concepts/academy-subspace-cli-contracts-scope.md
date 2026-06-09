# Scope: Academy Subspace CLI Contracts And Provisioning

## The Problem

Subspace needs to discover and inspect Academy agents through stable,
machine-readable CLI contracts, but the current Academy CLI is mostly a
human-facing developer tool. `academy list` and `academy root` exist, but they
do not support JSON output, and there is no `academy inspect <name> --json`
command.

Subspace also cannot depend on Academy as a developer-local checkout. A user
who installs Subspace should be able to use Academy-backed agent support without
cloning `/Users/joe/Dev/academy`, running `npm link`, or separately installing
Academy by hand.

The current state creates two product gaps: Subspace cannot safely consume
Academy agent metadata yet, and Academy is not yet provisioned as a Subspace
runtime capability.

## Target Users

Primary users:

- Subspace users who want Academy agents to work inside Subspace without a
  separate Academy download, checkout, or `npm link`.
- Subspace product/runtime code that needs a stable way to list, inspect, and
  locate Academy agents.

Secondary users:

- Academy maintainers who need human CLI output to remain stable while adding
  machine-readable contracts.
- Local developers who still need the current developer checkout path to keep
  working during development.

User needs:

- Use Academy-backed agent support from inside Subspace as part of the Subspace
  install experience.
- Let Subspace query Academy safely through read-only JSON commands.
- Preserve existing human-facing Academy CLI behavior unless `--json` is
  explicitly present.
- Avoid trusting an arbitrary `academy` binary from `PATH` in production
  Subspace.

## Success Criteria

- `academy list` human output remains unchanged for empty and non-empty agent
  lists.
- `academy list --json` emits valid JSON, exits zero when no agents exist, and
  returns an `agents` array.
- `academy inspect <name> --json` emits valid JSON for an existing agent.
- `academy inspect <missing> --json` exits non-zero with a machine-readable
  error shape.
- `academy root --json` emits valid JSON containing both `packageRoot` and
  `agentsRoot`.
- JSON agent records include `name`, `dir`, `displayName`, and
  `runtimeProvider`, with the current runtime provider reported as
  `claude_code`.
- Inspect output reports the eight Academy surfaces in a machine-readable
  `surfaces` object.
- Academy has a Subspace-consumable provisioning path so Subspace users do not
  need a separate Academy clone, download, or `npm link`.
- Subspace can resolve the Academy CLI from a trusted bundled, provisioned, or
  explicitly configured path rather than production code executing an arbitrary
  `academy` binary from `PATH`.
- Academy tests cover the new JSON contracts and the existing human output
  behavior.

## User Experience

For a developer or Subspace runtime process, Academy exposes read-only metadata
through explicit JSON flags:

```bash
academy list --json
academy inspect growth-analytics --json
academy root --json
```

When `--json` is absent, users continue to see the same current human output.
The JSON flag is an integration contract, not a redesign of the interactive
Academy CLI.

For an end user, Academy should feel like part of Subspace. Installing and
running Subspace should be enough to access Academy-backed agent support. The
user should not need to know where the Academy repository lives, manually clone
it, or run `npm link`.

The Subspace-side resolution model should prefer trusted Academy locations:
explicit configuration first, then a bundled or provisioned Academy CLI, with
developer `PATH` fallback limited to local/dev use.

## Scope Boundaries

### IN

- Add `academy list --json`.
- Add `academy inspect <name> --json`.
- Add `academy root --json`.
- Include both `packageRoot` and `agentsRoot` in `academy root --json`.
- Preserve current `academy list` human output for empty and non-empty cases.
- Return valid JSON and zero exit for an empty agent list.
- Return machine-readable non-zero JSON errors for missing inspected agents.
- Include current static `runtimeProvider: "claude_code"` in JSON records.
- Include `displayName` in JSON records, derived from available agent metadata
  or a stable fallback from the agent name.
- Include a `surfaces` object for `academy inspect <name> --json`.
- Define and implement a Subspace-consumable Academy provisioning path so
  Academy can run inside Subspace without a separate user download, repository
  checkout, or `npm link`.
- Define a trusted Academy CLI resolution order for Subspace use: explicitly
  configured trusted path, bundled/provisioned Academy CLI, then development
  `PATH` fallback only in local/dev mode.
- Add automated tests for the JSON contracts and existing human list output.

### OUT

- Changing `academy run`, `academy hire`, `academy create`, `academy clean`,
  `academy destroy`, or `academy notes` behavior except where needed to keep the
  provisioned CLI runnable.
- Making Codex a runtime option.
- Replacing the current static `claude_code` runtime provider reporting with a
  dynamic runtime-preference system.
- Building a broad Academy machine API beyond the listed read-only contracts.
- Making Subspace depend on mutating Academy commands in this scope.
- Adding a full `academy hire --json --spec <file>` contract.
- Redesigning Academy agent metadata storage.

### ANTI-SCOPE

- Academy is not becoming a general-purpose service API in this phase.
- The JSON contracts must not change the human CLI experience by default.
- Subspace production should not execute an arbitrary `academy` binary found on
  `PATH`.
- Provisioning Academy for Subspace is not an excuse to make users understand or
  manage the Academy developer repository.
- This work is not a runtime-provider parity project; `claude_code` reporting is
  acceptable for the current contract.

### Maybe

- Add `version` to `academy root --json` if it is useful for Subspace
  provisioning checks without expanding into a full health contract.
- Add a separate `academy doctor --json` or `academy capabilities --json` if the
  provisioning work needs a lightweight readiness contract.
- Treat `agent.yaml` presence as part of inspect validity if implementation
  planning determines that file-existence-only surface checks are too weak.

### Future

- `academy hire --json --spec <file>` for a non-interactive Subspace hiring
  flow.
- Dynamic runtime-provider reporting once Academy supports multiple runtime
  providers.
- Rich capability and dependency reporting, including runtime binaries and
  versioned contract flags.
- Subspace-side UI flows that consume these contracts.

## Load-Bearing Assumptions

- Subspace can consume Academy through a CLI contract rather than requiring an
  embedded library API. If this is false, the work must shift from CLI
  contracts to a programmatic package boundary.
- A static `runtimeProvider: "claude_code"` is acceptable for this phase. If
  this is false, scope must expand into runtime-provider preference and
  discovery work.
- Reporting both `packageRoot` and `agentsRoot` is enough for Subspace's initial
  root-discovery needs. If this is false, the scope may need a fuller
  capabilities or doctor contract.
- Surface inspection can start as machine-readable presence reporting over the
  eight known Academy surface files. If this is false, implementation planning
  must define stricter agent validity checks, likely involving `agent.yaml`.
- Academy can be provisioned with Subspace in a way that preserves the current
  CLI command surface. If this is false, the Subspace integration path will need
  a different runtime wrapper or adapter.
- Existing human CLI output is stable enough to test with empty/non-empty
  assertions rather than a full snapshot. If this is false, the regression
  coverage needs to become stricter.

## Constraints

- Users should not need a separate Academy download, checkout, or `npm link`
  when using Academy inside Subspace.
- `academy root --json` must include both `packageRoot` and `agentsRoot`.
- JSON records may report `runtimeProvider` as `claude_code` for the current
  phase.
- Human `academy list` output should be covered by current empty/non-empty
  behavior assertions.
- Write this as a new scope document for the current branch; do not overwrite
  the existing Codex runtime parity scope.

## Decisions

- This scope includes both the read-only Academy JSON contracts and making
  Academy runnable inside Subspace without a separate user-managed install.
- `academy root --json` will report both package and agent roots.
- `runtimeProvider: "claude_code"` is acceptable as the current value.
- `academy inspect <name> --json` surface validity is intentionally left for
  planning to settle, with file-existence reporting as the starting assumption.
- Human `academy list` regression coverage only needs to assert current empty
  and non-empty behavior.
- This scope gets its own concept document rather than rewriting
  `docs/tasks/main/concepts/scope.md`.

## Risks

- Provisioning can expand beyond a small CLI-contract phase if packaging,
  runtime, or trust decisions are not kept narrowly focused.
- Surface inspection semantics may become ambiguous if agents can be partially
  scaffolded, migrated, or legacy-delegated.
- A too-small `root --json` contract could force another quick contract change
  once Subspace starts consuming it.
- A too-broad health/capabilities contract could pull Phase 5 work into a larger
  dependency-reporting project.
- Preserving development `PATH` fallback while forbidding arbitrary production
  `PATH` execution needs a clear environment boundary.

## Next Steps

Recommended next command: `caspar-plan`.

Complexity: M. The read-only Academy CLI contracts are small and localized, but
making Academy run inside Subspace without a separate install adds packaging,
trust, and resolution decisions that need a concrete implementation plan.
