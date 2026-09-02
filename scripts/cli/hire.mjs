import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ACADEMY_ROOT,
  AGENTS_ROOT,
  RuntimeUnavailableError,
  contractError,
  resolveExecutable,
} from './core.mjs';

function hireContextPath() {
  const baseDir = join(process.env.HOME || homedir(), '.academy', 'hire-contexts');
  mkdirSync(baseDir, { recursive: true });
  const contextDir = mkdtempSync(join(baseDir, 'hire-'));
  return join(contextDir, 'context.json');
}

function writeHireContext(passthrough) {
  const path = hireContextPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        packageRoot: ACADEMY_ROOT,
        agentsRoot: resolve(AGENTS_ROOT),
        passthrough,
      },
      null,
      2,
    ) + '\n',
  );
  return path;
}

// `hire` is published in doctor's frozen command list, so a --json caller is
// entitled to parse the answer. The launch itself inherits stdio and no
// envelope can wrap it, but a launch that never happens is a command failure
// like any other. Asked before the context is written, so a run that cannot
// start leaves no orphaned hire-context directory behind.
function assertHireRuntime(json) {
  if (process.env.ACADEMY_DRY_RUN === '1') return;
  try {
    resolveExecutable('ACADEMY_CLAUDE_BIN', 'claude', { throwOnMissing: true });
  } catch (error) {
    if (!(error instanceof RuntimeUnavailableError)) throw error;
    if (json) contractError('hire', error.code, error.message, error.fields);
    console.error(`[ACADEMY_RUNTIME] ${error.message}`);
    process.exit(1);
  }
}

export function hireAgent(passthrough, json = false) {
  // The hire skill is the orchestrator: it calls `academy create <slug>`,
  // writes runnable starter surfaces, then schedules knowledge enrichment
  // after the user-facing hiring summary.
  // Positional arg seeds the first user message; session stays interactive.
  assertHireRuntime(json);
  const contextPath = writeHireContext(passthrough);
  launchClaude(['--plugin-dir', ACADEMY_ROOT, 'run /hire', ...passthrough], {
    cwd: ACADEMY_ROOT,
    env: { ...process.env, ACADEMY_HIRE_CONTEXT: '1', ACADEMY_HIRE_CONTEXT_PATH: contextPath },
    message: 'Launching Academy hire flow',
  });
}

export function launchClaude(args, { cwd, env, message }) {
  console.log(message);
  const claudeBin =
    process.env.ACADEMY_DRY_RUN === '1'
      ? process.env.ACADEMY_CLAUDE_BIN || 'claude'
      : resolveExecutable('ACADEMY_CLAUDE_BIN', 'claude');
  if (process.env.ACADEMY_DRY_RUN === '1') {
    console.log(`[dry-run] ${claudeBin} ${args.join(' ')}`);
    console.log(`[dry-run] cwd=${cwd}`);
    if (env?.ACADEMY_AGENT_DIR) console.log(`[dry-run] ACADEMY_AGENT_DIR=${env.ACADEMY_AGENT_DIR}`);
    if (env?.ACADEMY_PROJECT_DIR)
      console.log(`[dry-run] ACADEMY_PROJECT_DIR=${env.ACADEMY_PROJECT_DIR}`);
    process.exit(0);
  }
  const result = spawnSync(claudeBin, args, { stdio: 'inherit', cwd, env });
  if (result.error) {
    console.error(
      `[ACADEMY_RUNTIME] Failed to launch Claude Code at ${claudeBin}: ${result.error.message}`,
    );
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}
