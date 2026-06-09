# Execute: Academy Codex Runtime Parity

## Document Manifest

- Scope: `docs/tasks/main/concepts/scope.md`
- Technical context: `docs/tasks/main/task_context.md`
- Research: `docs/tasks/main/research/academy_codex_parity_060426.md`
- Plan: `docs/tasks/main/specs/plan.md`
- Task detail: `docs/tasks/main/specs/tasks.json`

## Task Detail Source

Task detail lives in `docs/tasks/main/specs/tasks.json`.

Do not read the full JSON by default. Slice by selected parent task ids and inspect only the parent/subtask detail needed for the current wave. Keep mutable status updates in `tasks.json`; use this file only as the compact execution index.

## Execution Summary

- Phases: 6
- Parent tasks: 6
- Subtasks: 16
- Waves: 6
- Shape: mostly sequential because runtime parser/prompt work unblocks skill rendering, Codex launch, nightly scheduling, and final documentation/regression. Phase 0 creates pending RED specifications with node:test `test.todo("description")` and no body; each build wave converts the relevant todo into an active test before implementation.

## Wave Plan

- `{ "id": "wave-1", "label": "Phase 0 verification tests", "parent_task_ids": ["1"], "after": [], "rationale": "Locks pending RED specs and real Codex profile verification for parser, prompt path, Codex profile launch, skills, and nightly runtime before implementation." }`
- `{ "id": "wave-2", "label": "Runtime parser and shared prompt preparation", "parent_task_ids": ["2"], "after": ["wave-1"], "rationale": "Builds the shared runtime foundation and preserves Claude behavior." }`
- `{ "id": "wave-3", "label": "Skill surface parity", "parent_task_ids": ["3"], "after": ["wave-2"], "rationale": "Adds Codex-visible universal skills once shared prep/backfill shape is in place." }`
- `{ "id": "wave-4", "label": "Codex profile and launcher", "parent_task_ids": ["4"], "after": ["wave-3"], "rationale": "Adds Codex runtime only after prompt and skill surfaces are stable." }`
- `{ "id": "wave-5", "label": "Nightly runtime selection", "parent_task_ids": ["5"], "after": ["wave-4"], "rationale": "Uses implemented runtime selection to re-register recurring work with the selected runtime." }`
- `{ "id": "wave-6", "label": "Regression and docs", "parent_task_ids": ["6"], "after": ["wave-5"], "rationale": "Runs final verification and updates README after behavior is settled." }`

## Parent Task Index

| Phase | Parent | Title | Subtasks | Predecessor | Unblocks |
| --- | --- | --- | ---: | --- | --- |
| Phase 0 - Verify Codex Assumptions | 1 | Codex assumptions and fixture verification | 5 | none | 2, 5 |
| Phase 1 - Runtime Parser And Shared Preparation | 2 | Runtime selection and prompt preparation | 4 | 1 | 3, 5 |
| Phase 2 - Skill Surface Parity | 3 | Dual skill rendering | 1 | 2 | 4, 6 |
| Phase 3 - Codex Profile And Launch | 4 | Codex profile generation and launcher | 3 | 3 | 5, 6 |
| Phase 4 - Nightly Runtime Selection | 5 | Nightly runtime scheduling | 1 | 4 | 6 |
| Phase 5 - Regression, Documentation, And Cleanup | 6 | Regression and documentation | 2 | 5 | none |

## Slicing Rules

- Start each wave by reading this index, then parse only the selected parent task ids from `tasks.json`.
- For a parent task, read its subtasks, context refs, acceptance criteria, predecessor, and unblocks.
- Preserve the pending-RED/build order: activate the selected parent's TODO-RED assertions before implementing the matching build work unless an equivalent failing test is already present.
- Update only the selected parent/subtask statuses while executing.
- Do not implement anything listed in `meta.out_of_bounds`.
- Every behavior-changing build subtask should be paired with its preceding RED task or an equivalent failing test already present.
- If a subtask requires changing the canonical scope, stop and route back to `caspar-scope` rather than editing stale plan/task artifacts.
