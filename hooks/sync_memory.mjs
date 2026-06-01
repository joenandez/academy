#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPayload() {
  try {
    const input = readFileSync(0, 'utf8').trim();
    return input ? JSON.parse(input) : null;
  } catch {
    return null;
  }
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function syncDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return [formatDate(today), formatDate(yesterday)];
}

function readExistingKeys(path) {
  const keys = new Set();
  if (!existsSync(path)) return keys;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      keys.add(memoryKey(entry));
    } catch {
      // Ignore malformed archive lines.
    }
  }
  return keys;
}

function memoryKey(entry) {
  return `${entry.sessionId || ''}|${entry.timestamp || ''}|${entry.turnNumber || ''}`;
}

function recordSession(memoryDir, payload, env) {
  const sessionId = payload.session_id;
  if (!sessionId) return;

  const sessionsPath = join(memoryDir, 'sessions.jsonl');
  mkdirSync(memoryDir, { recursive: true });

  if (existsSync(sessionsPath)) {
    for (const line of readFileSync(sessionsPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        if (JSON.parse(line).sessionId === sessionId) return;
      } catch {
        // Ignore malformed session lines.
      }
    }
  }

  appendFileSync(sessionsPath, JSON.stringify({
    sessionId,
    agentName: env.ACADEMY_AGENT_NAME || null,
    timestamp: new Date().toISOString(),
    cwd: payload.cwd || null,
    projectDir: env.ACADEMY_PROJECT_DIR || null,
    source: 'stop',
  }) + '\n');
}

function subspaceObservationsDir(env) {
  const project = env.GROVE_PROJECT_NAME;
  const workspace = env.GROVE_WORKSPACE_NAME;
  if (!project || !workspace) return null;

  const roots = [
    env.SUBSPACE_HOME,
    join(env.HOME || homedir(), '.subspace'),
  ].filter(Boolean);

  for (const root of roots) {
    const dir = join(root, project, workspace, 'memory', 'observations');
    if (existsSync(dir)) return dir;
  }
  return null;
}

function memorySyncEnabled(env) {
  return env.GROVE_MEMORY_ENABLED === '1' || env.GROVE_MEMORY_ENABLED === 'true';
}

export function syncAcademyMemory(payload, env = process.env) {
  const agentDir = env.ACADEMY_AGENT_DIR;
  const sessionId = payload?.session_id;
  if (!agentDir || !sessionId) return { synced: 0 };

  const memoryDir = join(resolve(agentDir), 'memory');
  const observationsDir = join(memoryDir, 'observations');
  mkdirSync(observationsDir, { recursive: true });
  recordSession(memoryDir, payload, env);

  const subspaceDir = subspaceObservationsDir(env);
  if (!subspaceDir || !memorySyncEnabled(env)) return { synced: 0 };

  let synced = 0;
  for (const date of syncDates()) {
    const subspaceFile = join(subspaceDir, `${date}.jsonl`);
    if (!existsSync(subspaceFile)) continue;

    const agentFile = join(observationsDir, `${date}.jsonl`);
    const existingKeys = readExistingKeys(agentFile);
    for (const line of readFileSync(subspaceFile, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.sessionId !== sessionId) continue;

        const key = memoryKey(entry);
        if (existingKeys.has(key)) continue;

        appendFileSync(agentFile, trimmed + '\n');
        existingKeys.add(key);
        synced++;
      } catch {
        // Ignore malformed Subspace observation lines.
      }
    }
  }

  return { synced };
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  }
}

if (isMainModule()) {
  syncAcademyMemory(readPayload());
}
