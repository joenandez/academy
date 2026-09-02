#!/usr/bin/env node
import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  isMainModule,
  jsonlHasValue,
  readPayload,
  resolvedAgentDir,
  runtimeEnvFor,
  withFileLock,
} from './hook_runtime.mjs';

function appendSession(sessionsPath, session) {
  if (jsonlHasValue(sessionsPath, 'sessionId', session.sessionId)) return true;
  appendFileSync(sessionsPath, `${JSON.stringify(session)}\n`);
  return true;
}

export function registerAcademySession(payload, env = process.env) {
  env = runtimeEnvFor(payload, env, 'ACADEMY_AGENT_NAME');
  const sessionId = payload?.session_id;
  const agentName = env.ACADEMY_AGENT_NAME;
  const cwd = payload?.cwd;
  if (!sessionId || !agentName || !cwd) return false;
  // Absent when the session did not come from `academy run`. Such a record is
  // unattributable rather than corrupt, so it is written without the field and
  // counted by `doctor`.
  const agentDir = resolvedAgentDir(env.ACADEMY_AGENT_DIR);

  try {
    const academyDir = join(env.HOME || homedir(), '.academy');
    const sessionsPath = join(academyDir, 'sessions.jsonl');
    mkdirSync(academyDir, { recursive: true });
    return withFileLock(join(academyDir, 'sessions.lock'), () =>
      appendSession(sessionsPath, {
        sessionId,
        agentName,
        ...(agentDir ? { agentDir } : {}),
        cwd,
        startedAt: new Date().toISOString(),
      }),
    );
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) {
  registerAcademySession(readPayload());
}
