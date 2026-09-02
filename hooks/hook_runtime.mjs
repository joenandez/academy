import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function readPayload() {
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

export function runtimeEnvFor(payload, env, identityKey) {
  let resolvedEnv = env;
  if (!env[identityKey] && env.ACADEMY_RUNTIME_CONTEXT) {
    try {
      const context = JSON.parse(readFileSync(env.ACADEMY_RUNTIME_CONTEXT, 'utf8'));
      const expired = context.expiresAt && Date.parse(context.expiresAt) < Date.now();
      const merged = expired ? env : { ...env, ...(context.env || {}) };
      const projectMismatch =
        payload?.cwd &&
        merged.ACADEMY_PROJECT_DIR &&
        !sameRealPath(payload.cwd, merged.ACADEMY_PROJECT_DIR);
      if (!projectMismatch) resolvedEnv = merged;
    } catch {
      // Use the provided environment when the runtime context is not valid.
    }
  }
  return resolvedEnv;
}

// A session record names the agent directory, not just the agent name: two
// roots can hold an agent of the same name, and only the resolved directory
// says which one a session belongs to. An unresolvable path still answers
// absolutely, because a record Academy cannot attribute is worse than one
// naming a directory that has since moved.
export function resolvedAgentDir(dir) {
  if (!dir) return null;
  const absolute = resolve(dir);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withFileLock(lockDir, fn) {
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

export function jsonlHasValue(path, field, value) {
  if (!existsSync(path)) return false;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      if (JSON.parse(line)[field] === value) return true;
    } catch {
      // Ignore malformed JSONL rows.
    }
  }
  return false;
}

export function isMainModule(moduleUrl) {
  if (!process.argv[1]) return false;
  const modulePath = fileURLToPath(moduleUrl);
  try {
    return realpathSync(modulePath) === realpathSync(process.argv[1]);
  } catch {
    return modulePath === resolve(process.argv[1]);
  }
}
