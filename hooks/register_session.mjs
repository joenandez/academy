#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function readPayload() {
  try {
    const input = readFileSync(0, 'utf8').trim();
    return input ? JSON.parse(input) : null;
  } catch {
    return null;
  }
}

export function registerAcademySession(payload, env = process.env) {
  const sessionId = payload?.session_id;
  const agentName = env.ACADEMY_AGENT_NAME;
  const cwd = payload?.cwd;
  if (!sessionId || !agentName || !cwd) return false;

  try {
    const academyDir = join(env.HOME || homedir(), '.academy');
    mkdirSync(academyDir, { recursive: true });
    appendFileSync(
      join(academyDir, 'sessions.jsonl'),
      JSON.stringify({
        sessionId,
        agentName,
        cwd,
        startedAt: new Date().toISOString(),
      }) + '\n'
    );
    return true;
  } catch {
    return false;
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === realpathSync(process.argv[1]);
  } catch {
    return fileURLToPath(import.meta.url) === process.argv[1];
  }
}

if (isMainModule()) {
  registerAcademySession(readPayload());
}
