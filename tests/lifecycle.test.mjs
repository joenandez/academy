import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url).pathname;
const cli = join(repoRoot, 'bin', 'academy');
const node = process.execPath;
const today = new Date().toISOString().slice(0, 10);

function readJsonl(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

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
const payload = JSON.stringify({ session_id: ${JSON.stringify(sessionId)}, cwd: process.cwd() });

for (const eventName of ['SessionStart', 'Stop']) {
  for (const group of hooksConfig.hooks?.[eventName] ?? []) {
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
}
`);
  chmodSync(path, 0o755);
}

function writeFakeCodex(path, sessionId, logPath) {
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

const profileIdx = args.indexOf('--profile');
if (profileIdx < 0) process.exit(2);
const profileName = args[profileIdx + 1];
const profilePath = join(process.env.CODEX_HOME, profileName + '.config.toml');
readFileSync(profilePath, 'utf8');
const hooksConfig = JSON.parse(readFileSync(join(process.env.CODEX_HOME, 'hooks.json'), 'utf8'));

const payload = JSON.stringify({
  session_id: ${JSON.stringify(sessionId)},
  cwd: process.cwd(),
  model: 'fake-codex',
});
for (const eventName of ['SessionStart', 'Stop']) {
  for (const group of hooksConfig.hooks?.[eventName] ?? []) {
    for (const hook of group.hooks ?? []) {
      const command = hook.command;
      if (!command) continue;
      const result = spawnSync(command, {
        shell: true,
        input: JSON.stringify({ ...JSON.parse(payload), hook_event_name: eventName }),
        encoding: 'utf8',
        env: process.env,
      });
      if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout || '');
        process.exit(result.status ?? 1);
      }
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
    HOME: root,
    SUBSPACE_HOME: subspaceHome,
    GROVE_MEMORY_ENABLED: '1',
    GROVE_PROJECT_NAME: 'academy',
    GROVE_WORKSPACE_NAME: '_home',
  };

  runCli(['create', 'kai'], { env });
  runCli(['run', 'kai', '--', '-p', 'smoke'], { cwd: projectDir, env });

  const agentDir = join(agentsRoot, 'kai');
  const resolvedProjectDir = realpathSync(projectDir);
  const globalSessions = readJsonl(join(root, '.academy', 'sessions.jsonl'));
  assert.equal(globalSessions.length, 1);
  assert.equal(globalSessions[0].sessionId, sessionId);
  assert.equal(globalSessions[0].agentName, 'kai');
  assert.equal(globalSessions[0].cwd, resolvedProjectDir);

  const sessions = readJsonl(join(agentDir, 'memory', 'sessions.jsonl'));
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

test('academy run codex lifecycle invokes global hooks and syncs memory', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-codex-lifecycle-'));
  const agentsRoot = join(root, 'agents');
  const codexHome = join(root, 'codex-home');
  const projectDir = join(root, 'project');
  const binDir = join(root, 'bin');
  const subspaceHome = join(root, '.subspace-alpha');
  const observationsDir = join(subspaceHome, 'academy', '_home', 'memory', 'observations');
  const fakeCodex = join(binDir, 'codex');
  const fakeCodexLog = join(root, 'fake-codex.json');
  const sessionId = 'fake-codex-lifecycle-session';

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(codexHome, { recursive: true });
  mkdirSync(observationsDir, { recursive: true });
  writeFakeCodex(fakeCodex, sessionId, fakeCodexLog);

  writeFileSync(join(observationsDir, `${today}.jsonl`), [
    JSON.stringify({ timestamp: `${today}T10:00:00.000Z`, sessionId, summary: 'Codex lifecycle copied' }),
    JSON.stringify({ timestamp: `${today}T10:05:00.000Z`, sessionId: 'other-session', summary: 'Codex lifecycle ignored' }),
  ].join('\n') + '\n');

  const env = {
    AGENTS_ROOT: agentsRoot,
    CODEX_HOME: codexHome,
    ACADEMY_CODEX_BIN: fakeCodex,
    HOME: root,
    SUBSPACE_HOME: subspaceHome,
    GROVE_MEMORY_ENABLED: '1',
    GROVE_PROJECT_NAME: 'academy',
    GROVE_WORKSPACE_NAME: '_home',
  };

  runCli(['create', 'kai'], { env });
  runCli(['run', 'kai', '--agent', 'codex', '--', 'exec', 'smoke'], { cwd: projectDir, env });

  const agentDir = join(agentsRoot, 'kai');
  const resolvedProjectDir = realpathSync(projectDir);
  const globalSessionsPath = join(root, '.academy', 'sessions.jsonl');
  assert.equal(existsSync(globalSessionsPath), true);
  const globalSessions = readJsonl(globalSessionsPath);
  assert.equal(globalSessions.length, 1);
  assert.equal(globalSessions[0].sessionId, sessionId);
  assert.equal(globalSessions[0].agentName, 'kai');
  assert.equal(globalSessions[0].cwd, resolvedProjectDir);

  const sessions = readJsonl(join(agentDir, 'memory', 'sessions.jsonl'));
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, sessionId);
  assert.equal(sessions[0].agentName, 'kai');
  assert.equal(sessions[0].projectDir, resolvedProjectDir);
  assert.equal(sessions[0].cwd, resolvedProjectDir);

  const synced = readFileSync(join(agentDir, 'memory', 'observations', `${today}.jsonl`), 'utf8');
  assert.match(synced, /Codex lifecycle copied/);
  assert.doesNotMatch(synced, /Codex lifecycle ignored/);

  const fakeInvocation = JSON.parse(readFileSync(fakeCodexLog, 'utf8'));
  assert.equal(fakeInvocation.args[fakeInvocation.args.indexOf('--profile') + 1], 'academy-kai');
  assert.equal(fakeInvocation.args[fakeInvocation.args.indexOf('-C') + 1], resolvedProjectDir);
  assert.equal(fakeInvocation.args[fakeInvocation.args.indexOf('--add-dir') + 1], agentDir);
  assert.match(fakeInvocation.args.join(' '), /model_instructions_file=/);
  assert.equal(fakeInvocation.agentDir, agentDir);
  assert.equal(fakeInvocation.projectDir, resolvedProjectDir);
});
