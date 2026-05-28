# Execute Index — academy notes CLI

## Document Manifest
Read these docs before execution:
- Spec (canonical scope): `docs/notes-cli-spec.md`
- Plan: `docs/tasks/notes-cli/specs/plan.md`
- Research / context: `docs/tasks/notes-cli/task_context.md`

## Task Detail Source
Do not read this file whole:
- Tasks JSON: `docs/tasks/notes-cli/specs/tasks.json`

Use targeted parsing only: status projections, selected parent-task slices, reviewer criteria/context slices, and status updates.

## Execution Summary
- Phases: 1
- Parent tasks: 2
- Subtasks: 6
- Waves: 2

## Wave Plan
- Wave 1: `{ id: "wave-1", label: "Implement notes command", parent_task_ids: ["1.1"], after: [], rationale: "Single-file CLI implementation (scripts/agent.mjs) + tests; nothing precedes it" }`
- Wave 2: `{ id: "wave-2", label: "Real-CLI validation", parent_task_ids: ["1.2"], after: ["wave-1"], rationale: "Direct bin/academy exercise requires the implemented command from 1.1" }`

## Parent Task Index
- Phase 1 — `academy notes` command
  - `{ id: "1.1", title: "Implement `academy notes` add/list in scripts/agent.mjs", subtasks: ["1.1.1", "1.1.2", "1.1.3", "1.1.4"], predecessor: "none", unblocks: "1.2" }`
  - `{ id: "1.2", title: "Validate `academy notes` via the real CLI binary", subtasks: ["1.2.1"], predecessor: "1.1", unblocks: "terminal" }`

## Slicing Rules
Read this index to plan waves. For each owner, choose selected parent task ids from the Wave Plan and batching rules, then query only those parent tasks from `tasks.json` using `jq`, `node -e`, or direct targeted mechanics. Inline the selected parent-task slice under `<task_assignment>`.

Do not load the full task detail JSON into orchestration context. Do not require dispatch boundaries to match phase boundaries. Update mutable `status` fields in `tasks.json`, re-parse after every write, and update this index only if parent ids, parent titles, dependencies, or wave guidance change.
