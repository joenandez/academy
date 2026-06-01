import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
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

  const pythonCheck = spawnSync('python3', ['-c', 'import pty'], { encoding: 'utf8' });
  if (pythonCheck.status !== 0) {
    return t.skip('python3 with pty support must be available');
  }

  const root = mkdtempSync(join(tmpdir(), 'academy-claude-e2e-'));
  const agentsRoot = join(root, 'agents');
  const projectDir = join(root, 'project');
  const subspaceHome = join(root, '.subspace-alpha');
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

  const ptyDriver = join(root, 'run-claude-pty.py');
  writeFileSync(ptyDriver, `
import os
import select
import signal
import sys
import time

pid, fd = os.forkpty()
if pid == 0:
    os.chdir(os.environ["ACADEMY_E2E_PROJECT_DIR"])
    os.execvpe(os.environ["ACADEMY_E2E_NODE"], [
        os.environ["ACADEMY_E2E_NODE"],
        os.environ["ACADEMY_E2E_CLI"],
        "run",
        "kai",
        "--",
        "--permission-mode",
        "bypassPermissions",
    ], os.environ)

sent_prompt = False
sent_exit = False
started = time.time()
output = []

while True:
    now = time.time()
    if not sent_prompt and now - started > 2:
        os.write(fd, b"Reply exactly: ok\\r")
        sent_prompt = True
    if sent_prompt and not sent_exit and now - started > 20:
        os.write(fd, b"/exit\\r")
        sent_exit = True

    ready, _, _ = select.select([fd], [], [], 0.2)
    if ready:
        try:
            chunk = os.read(fd, 4096)
            if chunk:
                output.append(chunk)
                sys.stdout.buffer.write(chunk)
                sys.stdout.buffer.flush()
        except OSError:
            pass

    done, status = os.waitpid(pid, os.WNOHANG)
    if done:
        sys.exit(os.waitstatus_to_exitcode(status))

    if now - started > 80:
        os.kill(pid, signal.SIGTERM)
        sys.stderr.write("timed out waiting for Claude interactive session to exit\\n")
        sys.exit(124)
`);

  const result = spawnSync('python3', [ptyDriver], {
    cwd: resolvedProjectDir,
    env: {
      ...process.env,
      ACADEMY_SKIP_NIGHTLY_TASK: '1',
      ACADEMY_E2E_PROJECT_DIR: resolvedProjectDir,
      ACADEMY_E2E_NODE: node,
      ACADEMY_E2E_CLI: cli,
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

  assert.ok(sessions.length >= 1, 'expected at least one Stop-hook session row');
  assert.equal(sessions.at(-1).agentName, 'kai');
  assert.equal(sessions.at(-1).projectDir, resolvedProjectDir);
});
