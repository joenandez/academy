import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url).pathname;
const hook = join(repoRoot, 'hooks', 'sync_memory.mjs');
const today = new Date().toISOString().slice(0, 10);

function runHook({ agentDir, home, payload, env = {} }) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      ACADEMY_AGENT_DIR: agentDir,
      ACADEMY_AGENT_NAME: 'kai',
      ...env,
    },
  });
}

function observation(overrides = {}) {
  return JSON.stringify({
    timestamp: '2026-05-28T10:00:00.000Z',
    summary: 'Agent did useful work',
    sessionId: 'session-agent',
    files: [],
    tags: [],
    ...overrides,
  });
}

test('sync_memory records the agent session and copies matching Subspace observations once', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-sync-'));
  const agentDir = join(root, 'agents', 'kai');
  const subspaceObsDir = join(root, '.subspace', 'codename-grove', '_home', 'memory', 'observations');
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(subspaceObsDir, { recursive: true });
  writeFileSync(join(subspaceObsDir, `${today}.jsonl`), [
    observation({ timestamp: `${today}T10:00:00.000Z`, summary: 'Keep me', sessionId: 'session-agent' }),
    observation({ timestamp: `${today}T10:05:00.000Z`, summary: 'Ignore me', sessionId: 'session-other' }),
  ].join('\n') + '\n');

  const payload = {
    session_id: 'session-agent',
    cwd: '/project',
  };
  const env = {
    GROVE_MEMORY_ENABLED: '1',
    GROVE_PROJECT_NAME: 'codename-grove',
    GROVE_WORKSPACE_NAME: '_home',
  };

  const first = runHook({ agentDir, home: root, payload, env });
  const second = runHook({ agentDir, home: root, payload, env });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);

  const sessions = readFileSync(join(agentDir, 'memory', 'sessions.jsonl'), 'utf8').trim().split('\n');
  assert.equal(sessions.length, 1);
  assert.equal(JSON.parse(sessions[0]).sessionId, 'session-agent');
  assert.equal(JSON.parse(sessions[0]).agentName, 'kai');

  const synced = readFileSync(join(agentDir, 'memory', 'observations', `${today}.jsonl`), 'utf8').trim().split('\n');
  assert.equal(synced.length, 1);
  assert.match(synced[0], /Keep me/);
  assert.doesNotMatch(synced[0], /Ignore me/);
});

test('sync_memory exits cleanly and records the session when Subspace memory is unavailable', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-sync-'));
  const agentDir = join(root, 'agents', 'kai');
  mkdirSync(agentDir, { recursive: true });

  const result = runHook({
    agentDir,
    home: root,
    payload: {
      session_id: 'session-agent',
      cwd: '/project',
    },
    env: {
      GROVE_MEMORY_ENABLED: '1',
      GROVE_PROJECT_NAME: 'missing-project',
      GROVE_WORKSPACE_NAME: '_home',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(agentDir, 'memory', 'observations', `${today}.jsonl`)), false);

  const sessions = readFileSync(join(agentDir, 'memory', 'sessions.jsonl'), 'utf8').trim().split('\n');
  assert.equal(sessions.length, 1);
  assert.equal(JSON.parse(sessions[0]).sessionId, 'session-agent');
});
