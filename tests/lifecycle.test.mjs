import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url).pathname;
const cli = join(repoRoot, 'bin', 'academy');
const node = process.execPath;
const today = new Date().toISOString().slice(0, 10);

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

function writeFakeClaude(path, sessionId, logPath) {
  writeFileSync(path, `#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
writeFileSync(${JSON.stringify(logPath)}, JSON.stringify({
  args,
  cwd: process.cwd(),
  agentDir: process.env.ACADEMY_AGENT_DIR || null,
  projectDir: process.env.ACADEMY_PROJECT_DIR || null,
}) + '\\n');

const pluginIdx = args.indexOf('--plugin-dir');
if (pluginIdx < 0) process.exit(0);

const pluginRoot = args[pluginIdx + 1];
const manifest = JSON.parse(readFileSync(join(pluginRoot, '.claude-plugin', 'plugin.json'), 'utf8'));
const hooksConfig = JSON.parse(readFileSync(join(pluginRoot, manifest.hooks), 'utf8'));
const stopHooks = hooksConfig.hooks?.Stop ?? [];
const payload = JSON.stringify({ session_id: ${JSON.stringify(sessionId)}, cwd: process.cwd() });

for (const group of stopHooks) {
  for (const hook of group.hooks ?? []) {
    const result = spawnSync(hook.command, {
      shell: true,
      input: payload,
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot },
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr || result.stdout || '');
      process.exit(result.status ?? 1);
    }
  }
}
`);
  chmodSync(path, 0o755);
}

test('academy run lifecycle invokes project plugin Stop hook and syncs memory', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-lifecycle-'));
  const agentsRoot = join(root, 'agents');
  const projectDir = join(root, 'project');
  const binDir = join(root, 'bin');
  const subspaceHome = join(root, '.subspace-alpha');
  const observationsDir = join(subspaceHome, 'academy', '_home', 'memory', 'observations');
  const fakeClaude = join(binDir, 'claude');
  const fakeClaudeLog = join(root, 'fake-claude.json');
  const sessionId = 'fake-lifecycle-session';

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(observationsDir, { recursive: true });
  writeFakeClaude(fakeClaude, sessionId, fakeClaudeLog);

  writeFileSync(join(observationsDir, `${today}.jsonl`), [
    JSON.stringify({ timestamp: `${today}T10:00:00.000Z`, sessionId, summary: 'Lifecycle copied' }),
    JSON.stringify({ timestamp: `${today}T10:05:00.000Z`, sessionId: 'other-session', summary: 'Lifecycle ignored' }),
  ].join('\n') + '\n');

  const env = {
    AGENTS_ROOT: agentsRoot,
    ACADEMY_CLAUDE_BIN: fakeClaude,
    SUBSPACE_HOME: subspaceHome,
    GROVE_MEMORY_ENABLED: '1',
    GROVE_PROJECT_NAME: 'academy',
    GROVE_WORKSPACE_NAME: '_home',
  };

  runCli(['create', 'kai'], { env });
  runCli(['run', 'kai', '--', '-p', 'smoke'], { cwd: projectDir, env });

  const agentDir = join(agentsRoot, 'kai');
  const resolvedProjectDir = realpathSync(projectDir);
  const sessions = readFileSync(join(agentDir, 'memory', 'sessions.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].agentName, 'kai');
  assert.equal(sessions[0].projectDir, resolvedProjectDir);
  assert.equal(sessions[0].cwd, resolvedProjectDir);

  const synced = readFileSync(join(agentDir, 'memory', 'observations', `${today}.jsonl`), 'utf8');
  assert.match(synced, /Lifecycle copied/);
  assert.doesNotMatch(synced, /Lifecycle ignored/);

  const fakeInvocation = JSON.parse(readFileSync(fakeClaudeLog, 'utf8'));
  const pluginIdx = fakeInvocation.args.indexOf('--plugin-dir');
  assert.notEqual(pluginIdx, -1);
  assert.equal(fakeInvocation.args[pluginIdx + 1], join(resolvedProjectDir, '.academy', 'agents', 'kai'));
  assert.match(fakeInvocation.args.join(' '), /--system-prompt-file/);
  assert.equal(fakeInvocation.agentDir, agentDir);
  assert.equal(fakeInvocation.projectDir, resolvedProjectDir);
});
