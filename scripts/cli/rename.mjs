import { existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readJsonFile } from './codex.mjs';
import {
  agentDir,
  agentLifecycleLockPath,
  contractOk,
  exitJsonError,
  validateName,
  withFileLock,
} from './core.mjs';
import { archivedAgentDir, assertNotArchived, isArchivedAgent } from './archived.mjs';
import { registerNightlyConsolidationTask } from './create.mjs';
import { appendLifecycleEvent } from './eventlog.mjs';
import { agentRecord } from './inspect.mjs';
import {
  DeleteAgentError,
  assertOwnedAgentForDelete,
  deleteJsonError,
  deleteNightlyConsolidation,
  preflightOwnedAgent,
  reportLifecycleFailure,
} from './lifecycle.mjs';
import { AgentSpecError, rewriteAgentYamlScalar } from './yaml.mjs';

// `rename <old> <new>`. The ownership marker is the blocker: both validators
// reject a directory whose marker names another agent, so a rename that moved
// the directory without rewriting `.academy-agent.json` would leave the agent
// permanently `not_academy_owned` — no delete, no archive, no second rename.
// The move, the marker and the `name:` scalar are therefore one critical
// section, and the lock is taken exactly once around all three.

export function renameAgent(name, newName, json, invalidOption) {
  if (invalidOption !== undefined) return unreadableInvocation(invalidOption, json);
  preflightOwnedAgent(name, json);
  validateName(newName);
  // The target name is asked the same two questions `create` asks it, and for
  // the same reason `create` asks them: a live agent moved onto a name the
  // holding area already owns leaves two records under one name, and every
  // published command then answers `agent_archived` for the live one. No
  // published command can reach it again.
  assertNotArchived(newName, json);
  refuseExistingTarget(newName, json);
  try {
    withFileLock(agentLifecycleLockPath(agentDir(name)), () =>
      renameAgentLocked(name, newName, json),
    );
  } catch (error) {
    reportLifecycleFailure(error, 'rename', name, json);
  }
}

// Refused before the lock is taken, because every exit path here ends the
// process and a lock released by nothing would strand the agent for good.
function refuseExistingTarget(newName, json) {
  const target = agentDir(newName);
  if (!existsSync(target)) return;
  deleteJsonError(
    'agent_exists',
    `Agent "${newName}" already exists at ${resolve(target)}`,
    { name: newName, dir: resolve(target) },
    json,
  );
}

function renameAgentLocked(name, newName, json) {
  const { dirReal } = assertOwnedAgentForDelete(name, agentDir(name));
  // Reported as the absolute joined path, never the realpath: a client keying
  // agents on `dir` matches this against the record `create` gave it.
  const previousDir = resolve(agentDir(name));
  const target = agentDir(newName);
  if (existsSync(target)) {
    throw new DeleteAgentError(
      'agent_exists',
      `Agent "${newName}" already exists at ${resolve(target)}`,
      { name: newName, dir: resolve(target) },
    );
  }
  refuseArchivedTarget(newName);
  // Named by the joined path, like every other path this command reports.
  assertRewritableAgentYaml(previousDir);

  // Unschedule before the move. Registration replaces on the *new* identifier,
  // so an old job left behind would fire nightly against a directory that has
  // moved, forever.
  const unscheduled = deleteNightlyConsolidation(name, dirReal);
  if (!unscheduled.ok) {
    throw new DeleteAgentError(
      unscheduled.code ?? 'unschedule_failed',
      `Refusing to rename "${name}" because nightly unschedule failed: ${unscheduled.reason}`,
      { name },
    );
  }

  renameSync(dirReal, target);
  rewriteOwnershipMarker(target, newName);
  // The unlocked writer: this section already holds the agent's lifecycle lock,
  // and `writeAgentYamlScalar` would take the same lock again and time out.
  rewriteAgentYamlScalar(target, 'name', newName);
  assertOwnedAgentForDelete(newName, target);
  const nightly = registerNightlyConsolidationTask(target, newName);

  // The move is complete and consistent by here. An append failure is reported
  // and the move stands, as `createAgent` reports a failed publish: unwinding a
  // rename whose old scheduled job is already gone would lose more than it
  // repairs.
  appendLifecycleEvent('agent_renamed', newName, resolve(target), {
    previousName: name,
    previousDir,
  });
  reportRenamed({ name, newName, previousDir, target, unscheduled, nightly, json });
}

// Mirrored inside the lock exactly as `existsSync(target)` is mirrored above:
// an agent archived between the preflight and the lock must not be overwritten
// by a rename that checked before the holding area claimed the name.
function refuseArchivedTarget(newName) {
  if (!isArchivedAgent(newName)) return;
  const dir = resolve(archivedAgentDir(newName));
  throw new DeleteAgentError(
    'agent_archived',
    `Agent "${newName}" is archived at ${dir}. Unarchive it first.`,
    { name: newName, dir },
  );
}

// The `name:` scalar is rewritten after the move, so a rewrite that throws
// there leaves the directory moved, the marker rewritten, the old nightly job
// unregistered, the new one never registered and no `agent_renamed` event
// appended — while the client is told the rename failed. Proved rewritable
// before any of it, the same refusal costs nothing.
function assertRewritableAgentYaml(dir) {
  const path = join(dir, 'agent.yaml');
  if (statSync(path).isFile()) return;
  throw new AgentSpecError(`agent.yaml at ${path} is not a regular file Academy can rewrite.`, {
    path,
  });
}

// The marker is rewritten, not rewritten from scratch: `createdAt` records when
// the agent was hired, which a rename does not change.
function rewriteOwnershipMarker(dir, name) {
  const path = join(dir, '.academy-agent.json');
  const marker = readJsonFile(path, {});
  writeFileSync(path, `${JSON.stringify({ ...marker, name }, null, 2)}\n`);
}

function reportRenamed({ name, newName, previousDir, target, unscheduled, nightly, json }) {
  const scheduledJobId = nightly.registered ? nightly.id : null;
  if (json) {
    contractOk('rename', {
      renamed: true,
      ...agentRecord(newName),
      previousName: name,
      previousDir,
      unscheduledJobId: unscheduled.id,
      scheduledJobId,
    });
    return;
  }
  console.log(`Renamed agent "${name}" to "${newName}" (${previousDir} → ${resolve(target)}).`);
  console.log(`Unregistered nightly consolidation job "${unscheduled.id}".`);
  if (scheduledJobId) console.log(`Registered nightly consolidation job "${scheduledJobId}".`);
  else console.log(`Nightly consolidation job not registered: ${nightly.reason}`);
}

function unreadableInvocation(option, json) {
  const message = `Unknown rename option: ${option}. Use rename <old> <new> [--json].`;
  if (json) exitJsonError('invalid_spec', message, { option });
  console.error(`Error: ${message}`);
  process.exit(1);
}
