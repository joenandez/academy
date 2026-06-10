# Prune Cleanup Summary — codex-academy

Scope: uncommitted changes on branch `codex-academy`.
Working set:
- hooks/register_session.mjs
- hooks/sync_memory.mjs
- scripts/agent.mjs
- tests/agent-cli.test.mjs
- tests/lifecycle.test.mjs
- tests/session-index.test.mjs

## Executive Summary

No confirmed-safe removals were made. The uncommitted diff is tight and
purposeful: it migrates Codex hook wiring from per-profile TOML to a global
`hooks.json` + `[hooks.state]` model, adds idempotent session registration with
a file lock, and adds `runtimeEnvFor` context hydration. Every new symbol is
referenced, every import is used, there are no commented-out blocks, no
debug/temp logging, no `.only`/skipped tests, and no AI slop (no `any` casts,
no `eslint-disable`/`@ts-ignore`, no defensive noise). The only notable signal
is intentional cross-file duplication of helpers the user explicitly asked to
preserve, so it is reported (not removed).

## Safe Removals

None. No item in the working set met the CONFIRMED_SAFE bar for removal.

## Manual Review Required

1. **Duplicated runtime helpers across the two hook files**
   `hooks/register_session.mjs:16-62` and `hooks/sync_memory.mjs:16-66` each
   define identical `sameRealPath`, `runtimeEnvFor`, `sleep`, and `withFileLock`
   helpers. The user flagged the file-lock and `runtimeEnvFor` logic as
   intentional, so it was preserved as-is. If desired, these four helpers could
   later be extracted into a shared `hooks/_runtime.mjs` module to remove the
   duplication — that is a behavior-neutral refactor outside prune scope and is
   left for manual decision.
   - Note: the two `runtimeEnvFor` copies differ intentionally — the
     register_session copy gates on `ACADEMY_AGENT_NAME`, the sync_memory copy
     on `ACADEMY_AGENT_DIR`, matching each hook's required identity field. Any
     extraction must parameterize that gate key.

## Excluded Items

- File-lock helpers (`withFileLock`, `sleep`) — excluded per instructions (intentional).
- Dedup logic in `registerAcademySession` / `recordSession` — excluded per instructions (intentional).
- `runtimeEnvFor` / `sameRealPath` — excluded per instructions (intentional).
- The two `// Ignore malformed session lines.` comments — functional empty-catch
  markers, not dead/commented-out code; kept.

## Estimated Impact

Zero lines removed. No behavior change.

## Validation

- Tests: `node --test tests/agent-cli.test.mjs tests/lifecycle.test.mjs tests/session-index.test.mjs`
  → 37 passed, 0 failed.
- Lint: no ESLint config present in repo (`package.json` exposes only `test`);
  no lint gate to run. No ESLint-debt bypasses introduced.
- No `--no-verify`, `eslint-disable`, `@ts-ignore`, or `@ts-expect-error` introduced.
