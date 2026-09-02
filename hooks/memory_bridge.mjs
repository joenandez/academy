import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Academy names no specific client except in this module. The memory sync
 * bridge stays client-specific by explicit decision, so every client-named
 * identifier Academy needs — env keys, tool permission, skill guidance, and the
 * observation copy itself — lives here. Client-neutral layers import these
 * declarations and inject them only behind ACADEMY_MEMORY_BRIDGE.
 */
export const MEMORY_BRIDGE_ENV = {
  enabled: 'GROVE_MEMORY_ENABLED',
  project: 'GROVE_PROJECT_NAME',
  workspace: 'GROVE_WORKSPACE_NAME',
  home: 'SUBSPACE_HOME',
};

/** Env keys a sandboxed runtime must forward for the bridge to work. */
export const MEMORY_BRIDGE_ENV_KEYS = Object.values(MEMORY_BRIDGE_ENV);

/** Tool permission an agent needs to query the bridge directly. */
export const MEMORY_BRIDGE_PERMISSIONS = ['Bash(subspace-memory:*)'];

/** Optional nightly guidance — the only client-named prose Academy ships. */
export const MEMORY_BRIDGE_SKILL_GUIDANCE = `### Optional — Subspace memory bridge

Academy names no specific client. This bridge is the one exception, and it is
optional. Skip this section when \`subspace-memory\` is not installed.

- Run \`subspace-memory status\` if the archive is thin or appears inconsistent.
- Run \`subspace-memory timeline --days 2\` if more workspace context is needed.

Subspace memory may enrich or corroborate an eligible run. It can never
establish eligibility.`;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function syncDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return [formatDate(today), formatDate(yesterday)];
}

function memoryKey(entry) {
  return `${entry.sessionId || ''}|${entry.timestamp || ''}|${entry.turnNumber || ''}`;
}

function readExistingKeys(path) {
  const keys = new Set();
  if (!existsSync(path)) return keys;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      keys.add(memoryKey(JSON.parse(trimmed)));
    } catch {
      // Ignore malformed archive lines.
    }
  }
  return keys;
}

function subspaceObservationsDir(env) {
  const project = env[MEMORY_BRIDGE_ENV.project];
  const workspace = env[MEMORY_BRIDGE_ENV.workspace];
  if (!project || !workspace) return null;
  const roots = [env[MEMORY_BRIDGE_ENV.home], join(env.HOME || homedir(), '.subspace')].filter(
    Boolean,
  );
  for (const root of roots) {
    const dir = join(root, project, workspace, 'memory', 'observations');
    if (existsSync(dir)) return dir;
  }
  return null;
}

function memorySyncEnabled(env) {
  const enabled = env[MEMORY_BRIDGE_ENV.enabled];
  return enabled === '1' || enabled === 'true';
}

function syncObservationFile(subspaceFile, agentFile, sessionId) {
  const existingKeys = readExistingKeys(agentFile);
  let synced = 0;
  for (const line of readFileSync(subspaceFile, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      const key = memoryKey(entry);
      if (entry.sessionId !== sessionId || existingKeys.has(key)) continue;
      appendFileSync(agentFile, `${trimmed}\n`);
      existingKeys.add(key);
      synced++;
    } catch {
      // Ignore malformed Subspace observation lines.
    }
  }
  return synced;
}

/**
 * Copy the client's observations for this session into the agent's own archive.
 * The client-neutral hook calls this and learns only a count.
 */
export function syncBridgeObservations(env, observationsDir, sessionId) {
  const subspaceDir = subspaceObservationsDir(env);
  if (!subspaceDir || !memorySyncEnabled(env)) return 0;
  let synced = 0;
  for (const date of syncDates()) {
    const subspaceFile = join(subspaceDir, `${date}.jsonl`);
    if (!existsSync(subspaceFile)) continue;
    synced += syncObservationFile(subspaceFile, join(observationsDir, `${date}.jsonl`), sessionId);
  }
  return synced;
}
