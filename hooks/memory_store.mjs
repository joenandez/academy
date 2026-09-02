import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { jsonlHasValue, resolvedAgentDir, withFileLock } from './hook_runtime.mjs';

// Academy's own per-agent memory state. Client-neutral: nothing here knows
// which client, if any, feeds the observation archive.

export function pendingMarkerPath(agentDir) {
  return join(resolve(agentDir), 'memory', 'pending-consolidation.json');
}

export function markPendingConsolidation(memoryDir) {
  const markerPath = pendingMarkerPath(resolve(memoryDir, '..'));
  withFileLock(join(memoryDir, 'pending-consolidation.lock'), () => {
    let revision = 0;
    if (existsSync(markerPath)) {
      try {
        revision = Number(JSON.parse(readFileSync(markerPath, 'utf8')).revision) || 0;
      } catch {
        // Replace malformed private state with the next valid revision.
      }
    }
    const tempPath = join(memoryDir, `.pending-consolidation.${process.pid}.${Date.now()}.tmp`);
    writeFileSync(
      tempPath,
      JSON.stringify(
        {
          revision: revision + 1,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + '\n',
    );
    renameSync(tempPath, markerPath);
  });
}

export function recordSession(memoryDir, payload, env) {
  const sessionId = payload.session_id;
  if (!sessionId) return;
  const sessionsPath = join(memoryDir, 'sessions.jsonl');
  mkdirSync(memoryDir, { recursive: true });
  withFileLock(join(memoryDir, 'sessions.lock'), () => {
    if (jsonlHasValue(sessionsPath, 'sessionId', sessionId)) return;
    appendFileSync(
      sessionsPath,
      JSON.stringify({
        sessionId,
        agentName: env.ACADEMY_AGENT_NAME || null,
        agentDir: resolvedAgentDir(join(memoryDir, '..')),
        timestamp: new Date().toISOString(),
        cwd: payload.cwd || null,
        projectDir: env.ACADEMY_PROJECT_DIR || null,
        source: 'stop',
      }) + '\n',
    );
  });
}
