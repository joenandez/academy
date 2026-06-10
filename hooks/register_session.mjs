#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
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

function sameRealPath(left, right) {
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return left === right;
  }
}

function runtimeEnvFor(payload, env) {
  if (env.ACADEMY_AGENT_NAME) return env;
  if (!env.ACADEMY_RUNTIME_CONTEXT) return env;

  try {
    const context = JSON.parse(readFileSync(env.ACADEMY_RUNTIME_CONTEXT, 'utf8'));
    if (context.expiresAt && Date.parse(context.expiresAt) < Date.now()) return env;
    const merged = { ...env, ...(context.env || {}) };
    if (payload?.cwd && merged.ACADEMY_PROJECT_DIR && !sameRealPath(payload.cwd, merged.ACADEMY_PROJECT_DIR)) {
      return env;
    }
    return merged;
  } catch {
    return env;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withFileLock(lockDir, fn) {
  const started = Date.now();
  while (true) {
    try {
      mkdirSync(lockDir, { recursive: false });
      break;
    } catch {
      if (Date.now() - started > 5000) return fn();
      sleep(25);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

export function registerAcademySession(payload, env = process.env) {
  env = runtimeEnvFor(payload, env);
  const sessionId = payload?.session_id;
  const agentName = env.ACADEMY_AGENT_NAME;
  const cwd = payload?.cwd;
  if (!sessionId || !agentName || !cwd) return false;

  try {
    const academyDir = join(env.HOME || homedir(), '.academy');
    const sessionsPath = join(academyDir, 'sessions.jsonl');
    mkdirSync(academyDir, { recursive: true });
    return withFileLock(join(academyDir, 'sessions.lock'), () => {
      if (existsSync(sessionsPath)) {
        for (const line of readFileSync(sessionsPath, 'utf8').split('\n')) {
          if (!line.trim()) continue;
          try {
            if (JSON.parse(line).sessionId === sessionId) return true;
          } catch {
            // Ignore malformed session lines.
          }
        }
      }
      appendFileSync(
        sessionsPath,
        JSON.stringify({
          sessionId,
          agentName,
          cwd,
          startedAt: new Date().toISOString(),
        }) + '\n'
      );
      return true;
    });
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
