import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url).pathname;
const hook = join(repoRoot, 'hooks', 'register_session.mjs');

function runHook({ home, payload, env = {} }) {
  return spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      ACADEMY_AGENT_NAME: 'kai',
      ...env,
    },
  });
}

test('SessionStart identity hook writes one valid global Academy session index row', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-session-index-'));
  const result = runHook({
    home: root,
    payload: {
      session_id: 'session-agent',
      cwd: '/project',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');

  const rows = readFileSync(join(root, '.academy', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessionId, 'session-agent');
  assert.equal(rows[0].agentName, 'kai');
  assert.equal(rows[0].cwd, '/project');
  assert.match(rows[0].startedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test('SessionStart identity hook is idempotent for duplicate session delivery', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-session-index-'));
  const payload = {
    session_id: 'session-agent',
    cwd: '/project',
  };

  const first = runHook({ home: root, payload });
  const second = runHook({ home: root, payload });

  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);

  const rows = readFileSync(join(root, '.academy', 'sessions.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessionId, 'session-agent');
});

test('SessionStart identity hook exits cleanly without writing when required identity is missing', () => {
  const missingSessionHome = mkdtempSync(join(tmpdir(), 'academy-session-index-'));
  const missingSession = runHook({
    home: missingSessionHome,
    payload: {
      cwd: '/project',
    },
  });

  assert.equal(missingSession.status, 0, missingSession.stderr);
  assert.equal(existsSync(join(missingSessionHome, '.academy', 'sessions.jsonl')), false);

  const missingAgentHome = mkdtempSync(join(tmpdir(), 'academy-session-index-'));
  const missingAgent = runHook({
    home: missingAgentHome,
    payload: {
      session_id: 'session-agent',
      cwd: '/project',
    },
    env: {
      ACADEMY_AGENT_NAME: '',
    },
  });

  assert.equal(missingAgent.status, 0, missingAgent.stderr);
  assert.equal(existsSync(join(missingAgentHome, '.academy', 'sessions.jsonl')), false);
});
