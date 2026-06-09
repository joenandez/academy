# Scope: Academy Codex Runtime Parity

## The Problem

Academy currently assumes Claude Code as the only runnable agent backend. `academy run` launches Claude Code, uses Claude-specific runtime files, and relies on Claude plugin behavior for project-local agent setup. Users who prefer or need Codex cannot run the same Academy agent identity with Codex while retaining the same durable surfaces, Academy skills, notes workflow, memory capture, and project-local setup merge.

This creates a portability gap: Academy agents are conceptually provider-independent, but the current product experience is not.

## Target Users

Primary users:

- Academy users who want to run the same named agent through either Claude Code or Codex on a per-launch basis.
- Users who already have useful global Codex configuration, auth, MCPs, skills, and plugins, and expect Academy to preserve access to that environment.

Secondary users:

- Maintainers validating that Claude Code behavior remains unchanged while Codex support is added.
- Users running Academy in project workspaces that already contain project-local Codex config, skills, MCPs, hooks, or rules.

User needs:

- Choose the runtime without creating a separate Academy agent.
- Keep Claude Code as the default for existing commands.
- Preserve the selected Academy agent identity across providers.
- Let Codex merge the user's global and project-local setup normally.
- Make Academy-owned skills available to Codex in the expected Codex skill surfaces.

## Success Criteria

- `academy run <agent>` still launches Claude Code with current behavior.
- `academy run <agent> --agent claude-code -- ...` launches Claude Code and forwards provider flags unchanged.
- `academy run <agent> --agent codex -- ...` launches Codex and forwards provider flags unchanged.
- The same Academy agent surfaces are rendered and used for both runtimes.
- Codex launches preserve the selected Academy agent identity even when project-local Codex config is present.
- Codex launches can access the user's global Codex auth, global MCPs, global skills, and global plugins.
- Codex launches merge trusted project-local Codex config and project `.agents/skills`.
- Academy universal skills are available to Codex as a hard v1 requirement.
- Scheduled/nightly Academy runs honor the user's runtime mode: Claude Code-only users use Claude Code, Codex-only users use Codex, and mixed users use the runtime last used for that agent.
- The generated Academy system prompt uses a neutral Academy path shared by both runtimes rather than a provider-specific `.claude` or `.codex` path.
- README documents the runtime selector, defaults, Codex layering model, and expected skill/config behavior.
- Existing Claude Code tests continue to pass, with added coverage proving Codex selection and launch parity.

## User Experience

The user keeps one Academy agent and chooses the execution backend at launch time:

```bash
academy run kai
academy run kai --agent claude-code -- ...
academy run kai --agent codex -- ...
```

When the user omits `--agent`, Academy behaves as it does today and uses Claude Code. When the user selects Codex, Academy should feel like the same agent running through a different runtime, not like a new agent or separate workflow.

Codex should use the user's normal global Codex environment wherever that is the Codex-designed path for preserving auth, MCPs, skills, plugins, and future Codex features. Project-local Codex setup should merge normally, while Academy protects the selected agent identity so project config cannot silently replace it.

Academy-owned skills should be discoverable in Codex-native skill locations and through Codex-compatible packaging where appropriate. Users should not need to manually copy Academy skills before running Codex.

## Scope Boundaries

### IN

- Add runtime selection for `academy run <agent> --agent claude-code|codex -- ...`.
- Keep `claude-code` as the default runtime when `--agent` is omitted.
- Preserve provider passthrough exactly after `--`; Academy does not normalize provider flags.
- Make Codex run the same named Academy agent with the same rendered surfaces, notes identity, and memory identity.
- Use the Codex-designed configuration approach that preserves user global Codex auth and access to global MCPs, skills, and plugins.
- Use Codex profiles as the Academy agent-specific layer when that best fits Codex's intended design.
- Allow trusted project-local Codex config and project `.agents/skills` to merge normally.
- Protect Academy's selected agent identity/prompt from project-local override.
- Move the generated Academy system prompt to a neutral Academy path used by both runtimes.
- Make Academy universal skills available to Codex as a hard v1 requirement.
- Expose Academy skills through both Codex-native `.agents/skills` style surfaces and compatible packaged/distributed skill surfaces where appropriate.
- Support `/hire` as an existing universal prompt workflow rather than building a separate `academy hire --agent codex` product surface in this project.
- Include scheduled/nightly runtime selection so Academy recurring work uses Claude Code for Claude-only users, Codex for Codex-only users, and the agent's last-used runtime for mixed users.
- Update README with Codex runtime usage and layering behavior.
- Add tests for runtime selection, Codex prompt/profile behavior, Codex-visible skills, and unchanged Claude behavior.

### OUT

- Replacing Claude Code support.
- Making Codex the default runtime.
- Building a separate Codex-specific hire flow.
- Building a full Codex plugin marketplace publishing flow.
- Implementing cross-workspace blended RAG memory.
- Reworking Subspace memory architecture beyond Codex launch parity with the existing Academy memory identity.
- Changing provider-specific flags or translating Claude Code flags into Codex flags.

### ANTI-SCOPE

- Academy is not becoming a generic multi-runtime abstraction framework.
- Codex parity is not a one-for-one clone of Claude's `--plugin-dir` model.
- Project-local Codex configuration must not silently redefine which Academy agent is running.
- Provider passthrough is not Academy's API surface; provider CLIs own those flags.
- Academy should not isolate Codex so aggressively that users lose their normal global Codex auth, MCPs, skills, plugins, or future Codex capabilities.

### Maybe

- A future Codex plugin distribution path once the core profile/project layering path works.

### Future

- `academy hire --agent codex` as an explicit runtime-selected hire launch if the universal `/hire` workflow proves insufficient.
- Provider preference storage at the agent or user level.
- Rich permission-profile management for Codex beyond the basic v1 runtime path.
- Codex-specific end-to-end real CLI tests if local/runtime stability supports them.

## Load-Bearing Assumptions

- Codex's intended profile/config layering can preserve the user's normal global auth, MCPs, skills, and plugins while adding an Academy agent-specific layer. If this is false, Academy will need a different Codex integration strategy or risk breaking user environments.
- Claude Code remains the compatibility default. If this is false, existing users and tests may see surprising runtime changes.
- `/hire` is already universal enough as a prompt workflow for this project. If this is false, scope must expand to include a runtime-selected hire launch path.
- Academy can expose its universal skills through Codex-native skill surfaces without changing their core content. If this is false, v1 parity becomes larger because skills need provider-specific authoring or conversion.
- Project-local Codex config can merge normally while Academy protects the selected agent prompt at launch. If this is false, Codex parity may require stricter project-config isolation and lose project-local usefulness.
- Academy can reliably determine whether a user/agent is Claude Code-only, Codex-only, or mixed, and can remember the last-used runtime for mixed agents. If this is false, scheduled/nightly parity will need an explicit runtime preference setting before launch behavior can be predictable.

## Constraints

- Use the user's global Codex setup when that is the best fit for preserving auth and access to global MCPs, skills, and plugins.
- Claude Code remains the default runtime.
- README must be updated.
- Academy universal skills are a hard requirement for Codex parity v1.
- Project-local Codex config is allowed to merge normally, except Academy agent identity must remain protected.
- Scheduled/nightly Academy jobs must use the appropriate runtime for the user/agent mode rather than always using Claude Code.

## Decisions

- Runtime selection belongs on `academy run` as `--agent claude-code|codex`.
- `claude-code` remains the default when `--agent` is omitted.
- The first project is focused on `academy run`; `/hire` is treated as an already-universal prompt workflow.
- Codex should use the user's global Codex environment rather than an isolated setup if that is the Codex-designed path for preserving access.
- Trusted project-local Codex config and skills should merge normally.
- Academy universal skills must be exposed to Codex in v1.
- Codex skill exposure should support both Codex-native skill locations and compatible packaged/distributed surfaces.
- Scheduled/nightly runs are in scope: Claude Code-only users use Claude Code, Codex-only users use Codex, and mixed users use the runtime last used for that agent.
- The generated prompt path should be neutral rather than `.claude` or `.codex` specific.
- README coverage is in scope.

## Risks

- Codex profile/config precedence may not behave exactly as expected once project-local config and global plugins are present.
- Making Academy skills visible in both Claude and Codex surfaces could create drift if generation/backfill is not kept single-source.
- Protecting Academy identity while still allowing project-local Codex merge may require careful launch-time precedence handling.
- Codex hook trust or project trust behavior may complicate memory-sync parity.
- Scope creep risk: provider parity can easily expand into full plugin distribution, permission UX, and hire runtime selection.

## Next Steps

Recommended next command: `caspar-plan`.

Complexity: L. The user-facing scope is focused, but the implementation touches CLI parsing, runtime launch behavior, generated config/profile assets, skill exposure, scheduled/nightly runtime selection, docs, and tests.
