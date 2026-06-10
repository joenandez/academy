/**
 * Behavioral tests for runtimeEnvFor in register_session.mjs and sync_memory.mjs.
 *
 * Covered:
 *   register_session — runtimeEnvFor merges context file when ACADEMY_AGENT_NAME absent
 *   register_session — runtimeEnvFor ignores expired context (expiresAt in past)
 *   register_session — runtimeEnvFor falls back when cwd/ACADEMY_PROJECT_DIR mismatch
 *   sync_memory      — runtimeEnvFor gates on ACADEMY_AGENT_DIR (not ACADEMY_AGENT_NAME)
 *   sync_memory      — recordSession dedup: two calls with same sessionId write exactly one row
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = new URL('..', import.meta.url).pathname;

// Dynamically import so we get the exported functions without spawning a process.
const { registerAcademySession } = await import(join(repoRoot, 'hooks', 'register_session.mjs'));
const { syncAcademyMemory } = await import(join(repoRoot, 'hooks', 'sync_memory.mjs'));

function readJsonl(path) {
  return readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

// ─────────────────────────────────────────────────────────────────────────────
// register_session — runtimeEnvFor
// ─────────────────────────────────────────────────────────────────────────────

test('register_session: runtimeEnvFor merges context file when ACADEMY_AGENT_NAME is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-rte-'));
  const contextPath = join(root, 'context.json');
  const projectDir = join(root, 'project');
  mkdirSync(projectDir, { recursive: true });

  writeFileSync(contextPath, JSON.stringify({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    env: {
      ACADEMY_AGENT_NAME: 'kai',
      ACADEMY_PROJECT_DIR: projectDir,
    },
  }));

  const result = registerAcademySession(
    { session_id: 'rte-merge-session', cwd: projectDir },
    {
      HOME: root,
      ACADEMY_RUNTIME_CONTEXT: contextPath,
      // No ACADEMY_AGENT_NAME — should be filled from context
    }
  );

  assert.equal(result, true);
  const rows = readJsonl(join(root, '.academy', 'sessions.jsonl'));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].agentName, 'kai');
  assert.equal(rows[0].sessionId, 'rte-merge-session');
});

test('register_session: runtimeEnvFor ignores expired context', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-rte-'));
  const contextPath = join(root, 'context.json');

  writeFileSync(contextPath, JSON.stringify({
    expiresAt: new Date(Date.now() - 1000).toISOString(), // already expired
    env: { ACADEMY_AGENT_NAME: 'kai' },
  }));

  const result = registerAcademySession(
    { session_id: 'rte-expired-session', cwd: '/project' },
    {
      HOME: root,
      ACADEMY_RUNTIME_CONTEXT: contextPath,
      // No ACADEMY_AGENT_NAME and context is expired — should not write
    }
  );

  // Should return false because agentName is missing after ignoring expired context
  assert.equal(result, false);
  // File must not exist
  let wrote = false;
  try {
    readFileSync(join(root, '.academy', 'sessions.jsonl'), 'utf8');
    wrote = true;
  } catch { /* expected */ }
  assert.equal(wrote, false, 'sessions.jsonl must not be created for expired context');
});

test('register_session: runtimeEnvFor falls back when cwd/ACADEMY_PROJECT_DIR mismatch', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-rte-'));
  const contextPath = join(root, 'context.json');

  writeFileSync(contextPath, JSON.stringify({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    env: {
      ACADEMY_AGENT_NAME: 'kai',
      ACADEMY_PROJECT_DIR: '/some/other/dir',
    },
  }));

  // cwd does NOT match ACADEMY_PROJECT_DIR in context
  const result = registerAcademySession(
    { session_id: 'rte-mismatch-session', cwd: '/actual/project' },
    {
      HOME: root,
      ACADEMY_RUNTIME_CONTEXT: contextPath,
      // No ACADEMY_AGENT_NAME and mismatch — must fall back to original env (no agent name)
    }
  );

  assert.equal(result, false, 'should not write when cwd/projectDir mismatch');
  let wrote = false;
  try {
    readFileSync(join(root, '.academy', 'sessions.jsonl'), 'utf8');
    wrote = true;
  } catch { /* expected */ }
  assert.equal(wrote, false, 'sessions.jsonl must not be created on cwd/projectDir mismatch');
});

// ─────────────────────────────────────────────────────────────────────────────
// sync_memory — runtimeEnvFor gates on ACADEMY_AGENT_DIR
// ─────────────────────────────────────────────────────────────────────────────

test('sync_memory: runtimeEnvFor merges context file when ACADEMY_AGENT_DIR is absent', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-rte-'));
  const contextPath = join(root, 'context.json');
  const agentDir = join(root, 'agents', 'kai');
  const projectDir = join(root, 'project');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(agentDir, { recursive: true });

  writeFileSync(contextPath, JSON.stringify({
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    env: {
      ACADEMY_AGENT_DIR: agentDir,
      ACADEMY_AGENT_NAME: 'kai',
      ACADEMY_PROJECT_DIR: projectDir,
    },
  }));

  const result = syncAcademyMemory(
    { session_id: 'sync-merge-session', cwd: projectDir },
    {
      HOME: root,
      ACADEMY_RUNTIME_CONTEXT: contextPath,
      // No ACADEMY_AGENT_DIR — should be filled from context
    }
  );

  // synced: 0 is fine (no subspace obs dir); what matters is sessions.jsonl was written
  const sessionsPath = join(agentDir, 'memory', 'sessions.jsonl');
  const rows = readJsonl(sessionsPath);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sessionId, 'sync-merge-session');
});

test('sync_memory: runtimeEnvFor ignores expired context for ACADEMY_AGENT_DIR', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-rte-'));
  const contextPath = join(root, 'context.json');
  const agentDir = join(root, 'agents', 'kai');

  writeFileSync(contextPath, JSON.stringify({
    expiresAt: new Date(Date.now() - 1000).toISOString(), // expired
    env: { ACADEMY_AGENT_DIR: agentDir, ACADEMY_AGENT_NAME: 'kai' },
  }));

  const result = syncAcademyMemory(
    { session_id: 'sync-expired-session', cwd: '/project' },
    {
      HOME: root,
      ACADEMY_RUNTIME_CONTEXT: contextPath,
      // No ACADEMY_AGENT_DIR and context expired — should short-circuit
    }
  );

  assert.deepEqual(result, { synced: 0 });
  // agentDir should not have been created since context was expired
  let exists = false;
  try {
    readFileSync(join(agentDir, 'memory', 'sessions.jsonl'), 'utf8');
    exists = true;
  } catch { /* expected */ }
  assert.equal(exists, false, 'sessions.jsonl must not exist when context expired');
});

// ─────────────────────────────────────────────────────────────────────────────
// sync_memory — recordSession dedup under file lock
// ─────────────────────────────────────────────────────────────────────────────

test('sync_memory: recordSession dedup writes exactly one row per sessionId', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-rte-'));
  const agentDir = join(root, 'agents', 'kai');
  mkdirSync(agentDir, { recursive: true });

  const payload = { session_id: 'dedup-sync-session', cwd: '/project' };
  const env = {
    HOME: root,
    ACADEMY_AGENT_DIR: agentDir,
    ACADEMY_AGENT_NAME: 'kai',
  };

  // Call twice — second call should be a no-op for sessions.jsonl
  syncAcademyMemory(payload, env);
  syncAcademyMemory(payload, env);

  const rows = readJsonl(join(agentDir, 'memory', 'sessions.jsonl'));
  assert.equal(rows.length, 1, 'recordSession must deduplicate rows for the same sessionId');
  assert.equal(rows[0].sessionId, 'dedup-sync-session');
});
