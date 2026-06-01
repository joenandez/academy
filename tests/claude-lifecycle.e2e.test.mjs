import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url).pathname;
const cli = join(repoRoot, 'bin', 'academy');
const node = process.execPath;
const runE2E = process.env.ACADEMY_RUN_CLAUDE_E2E === '1';

function runCli(args, options = {}) {
  return execFileSync(node, [cli, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ACADEMY_SKIP_NIGHTLY_TASK: '1',
      ...options.env,
    },
    cwd: options.cwd ?? repoRoot,
  });
}

test('real Claude lifecycle invokes the v3 Stop hook', { skip: !runE2E, timeout: 120_000 }, (t) => {
  const claudeVersion = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  if (claudeVersion.status !== 0) {
    return t.skip('claude must be available on PATH');
  }

  const root = mkdtempSync(join(tmpdir(), 'academy-claude-e2e-'));
  const agentsRoot = join(root, 'agents');
  const projectDir = join(root, 'project');
  const subspaceHome = join(root, '.subspace-alpha');
  const sessionId = '00000000-0000-4000-8000-000000000123';
  mkdirSync(projectDir, { recursive: true });

  const env = {
    AGENTS_ROOT: agentsRoot,
    SUBSPACE_HOME: subspaceHome,
    GROVE_MEMORY_ENABLED: '0',
    GROVE_PROJECT_NAME: 'academy-e2e',
    GROVE_WORKSPACE_NAME: '_home',
  };

  runCli(['create', 'kai'], { env });
  const resolvedProjectDir = realpathSync(projectDir);

  const result = spawnSync(node, [
    cli,
    'run',
    'kai',
    '--',
    '--session-id',
    sessionId,
    '--permission-mode',
    'bypassPermissions',
    '-p',
    'Reply exactly: ok',
    '--output-format',
    'stream-json',
    '--include-hook-events',
    '--verbose',
  ], {
    cwd: resolvedProjectDir,
    env: {
      ...process.env,
      ACADEMY_SKIP_NIGHTLY_TASK: '1',
      ...env,
    },
    encoding: 'utf8',
    timeout: 90_000,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const sessionsPath = join(agentsRoot, 'kai', 'memory', 'sessions.jsonl');
  assert.equal(existsSync(sessionsPath), true);

  const sessions = readFileSync(sessionsPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(JSON.parse);

  assert.ok(
    sessions.length >= 1,
    `expected at least one Stop-hook session row\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  assert.equal(sessions.at(-1).sessionId, sessionId);
  assert.equal(sessions.at(-1).agentName, 'kai');
  assert.equal(sessions.at(-1).projectDir, resolvedProjectDir);
});
