import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  AGENTS_ROOT,
  checkAgentsRoot,
  contractOk,
  exitJsonError,
  isInside,
  validateName,
} from './core.mjs';

// The session index is global across installs — the specialists work needs one
// file a client can read whichever root it drives. Attribution is therefore a
// read-time question, answered by `agentDir` containment inside the resolved
// AGENTS_ROOT, and never by the agent name: two roots can hold a "kai".
//
// `sessions --json [--agent <name>]` payload, for the conformance suite:
//   agentsRoot    absolute, resolved AGENTS_ROOT the rows were filtered against
//   sessionIndex  absolute path of the file the rows were read from
//   sessions[]    index order, oldest first, each row exactly:
//                 { sessionId, agentName, agentDir, cwd, startedAt }

function sessionIndexPath() {
  return join(homedir(), '.academy', 'sessions.jsonl');
}

// Guarded on every read. `doctor` counts unattributable rows through this same
// reader and must never exit from inside a probe, and a torn or hand-edited
// line is not a reason to withhold every other session.
function readIndex() {
  const path = sessionIndexPath();
  if (!existsSync(path)) return [];
  try {
    return readFileSync(path, 'utf8').split('\n').map(parseRow).filter(Boolean);
  } catch {
    return [];
  }
}

function parseRow(line) {
  if (line.trim() === '') return null;
  try {
    const row = JSON.parse(line);
    return row && typeof row === 'object' && row.sessionId ? row : null;
  } catch {
    return null;
  }
}

// Records written before the index carried a directory. They are historical,
// not corrupt: nothing rewrites or removes them, they are left out of every
// root's answer, and `doctor` reports how many there are.
export function unattributableSessionCount() {
  return readIndex().filter((row) => !row.agentDir).length;
}

function attributed(row, rootReal, agent) {
  if (!row.agentDir) return false;
  if (agent && row.agentName !== agent) return false;
  return isInside(row.agentDir, rootReal);
}

function publishedRow(row) {
  return {
    sessionId: row.sessionId,
    agentName: row.agentName ?? null,
    agentDir: row.agentDir,
    cwd: row.cwd ?? null,
    startedAt: row.startedAt ?? null,
  };
}

export function readSessions({ json, agent, invalidOption }) {
  if (invalidOption !== undefined) return unreadableInvocation(invalidOption, json);
  if (agent !== undefined) validateName(agent, json);
  checkAgentsRoot(json);
  const agentsRoot = resolve(AGENTS_ROOT);
  const sessions = readIndex()
    .filter((row) => attributed(row, agentsRoot, agent))
    .map(publishedRow);

  if (json) {
    contractOk('sessions', { agentsRoot, sessionIndex: sessionIndexPath(), sessions });
    return;
  }
  console.log(`sessions ${agentsRoot}  index ${sessionIndexPath()}`);
  for (const row of sessions) {
    console.log(`  ${row.startedAt}  ${row.agentName}  ${row.sessionId}`);
  }
}

function unreadableInvocation(option, json) {
  const message = `Unknown sessions option: ${option}. Use [--agent <name>] [--json].`;
  if (json) exitJsonError('invalid_spec', message, { option });
  console.error(`Error: ${message}`);
  process.exit(1);
}
