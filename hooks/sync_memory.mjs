#!/usr/bin/env node
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isMainModule, readPayload, runtimeEnvFor } from './hook_runtime.mjs';
import { syncBridgeObservations } from './memory_bridge.mjs';
import { markPendingConsolidation, recordSession } from './memory_store.mjs';

export function syncAcademyMemory(payload, env = process.env) {
  env = runtimeEnvFor(payload, env, 'ACADEMY_AGENT_DIR');
  const agentDir = env.ACADEMY_AGENT_DIR;
  const sessionId = payload?.session_id;
  if (!agentDir || !sessionId) return { synced: 0 };

  const memoryDir = join(resolve(agentDir), 'memory');
  const observationsDir = join(memoryDir, 'observations');
  mkdirSync(observationsDir, { recursive: true });
  recordSession(memoryDir, payload, env);
  // Eligibility tracks Academy session activity, not the bridge copy, so an
  // agent still consolidates when the memory bridge is unavailable.
  if (env.ACADEMY_NIGHTLY_RUN !== '1') markPendingConsolidation(memoryDir);

  const synced =
    env.ACADEMY_MEMORY_BRIDGE === '1' ? syncBridgeObservations(env, observationsDir, sessionId) : 0;
  return { synced };
}

if (isMainModule(import.meta.url)) {
  syncAcademyMemory(readPayload());
}
