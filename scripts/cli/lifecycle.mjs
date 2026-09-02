import { existsSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readJsonFile } from './codex.mjs';
import {
  AGENTS_ROOT,
  agentDir,
  agentLifecycleLockPath,
  contractOk,
  exitJsonError,
  isInside,
  isSymlink,
  jsonMode,
  LockTimeoutError,
  RuntimeUnavailableError,
  resolveExecutable,
  validateAgentsRoot,
  validateName,
  withFileLock,
} from './core.mjs';
import { assertNotArchived, holdingAreaOrNull } from './archived.mjs';
import { LogCorruptError, appendLifecycleEvent } from './eventlog.mjs';
import { AgentSpecError } from './yaml.mjs';
import { MUST_EXIST, helmFailureReason } from './create.mjs';
import { TEMPLATES } from './templates.mjs';

export function cleanAgent(name) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    process.exit(1);
  }
  // Reset notes.md and threads.md to scaffolded state. Other surfaces are
  // load-bearing (identity/role/knowledge) or natural-decay (dailys/goals/priorities).
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(join(dir, 'notes.md'), TEMPLATES['notes.md'](name, today));
  writeFileSync(join(dir, 'threads.md'), TEMPLATES['threads.md'](name, today));
  console.log(`Cleaned transient surfaces for "${name}" (notes.md, threads.md).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// `destroy` — nuke an agent (--force required)
// ─────────────────────────────────────────────────────────────────────────────

export function deleteJsonError(code, message, fields = {}, json = false) {
  if (json) exitJsonError(code, message, fields);
  console.error(message);
  process.exit(1);
}

export class DeleteAgentError extends Error {
  constructor(code, message, fields = {}) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

// Ownership is one question, asked by every command that acts on an agent
// directory and by `doctor` when it counts what `migrate` still has to fix.
// It answers with the fault text, or null when the directory is owned.
export function ownershipFault(name, dir) {
  const markerPath = join(dir, '.academy-agent.json');
  if (!existsSync(markerPath) || !existsSync(join(dir, 'agent.yaml'))) {
    return `Agent "${name}" is missing Academy ownership metadata`;
  }
  const marker = readJsonFile(markerPath, {});
  if (marker.capability !== 'academy-agent' || marker.name !== name) {
    return `Agent "${name}" ownership metadata is invalid`;
  }
  return null;
}

// The slot an agent directory is allowed to occupy, and the whole boundary
// once the canonical rule is relaxed. `canonical` is every command's default;
// `archived` is the holding area, checked exactly as strictly; `contained` is
// the delete quarantine, which sits directly inside the root under a name no
// agent can have.
export const SLOT = { canonical: 'canonical', archived: 'archived', contained: 'contained' };

// The holding area is resolved by the one rule in archived.mjs, which every
// read and every write now shares: an unprovable `.archived` has no slots at
// all, so an archived agent can never resolve to some other directory.
function archivedSlot(name) {
  const holding = holdingAreaOrNull();
  return holding === null ? null : join(holding, name);
}

function slotFault(name, dirReal, rootReal, slot) {
  if (!isInside(dirReal, rootReal)) return `Agent "${name}" resolves outside AGENTS_ROOT`;
  if (slot === SLOT.contained) return null;
  const expected = slot === SLOT.archived ? archivedSlot(name) : join(rootReal, name);
  if (expected === dirReal) return null;
  return `Agent "${name}" does not occupy its ${slot} slot inside AGENTS_ROOT`;
}

// Where an agent directory is allowed to be, with no question about what is
// inside it. Stated once, because a boundary expressed in two places is a
// boundary that disagrees with itself the first time one end learns a rule the
// other has not: `delete`, `rename` and `archive` ask it through
// `ownedAgentFault` below before they move a directory, and `inspect`, `tokens`
// and `budget` ask it directly before they publish one.
function containmentFault(name, dir, slot) {
  if (isSymlink(dir)) {
    return {
      code: 'unsafe_agent_path',
      message: `Agent "${name}" is not an owned Academy directory: ${dir}`,
    };
  }
  let rootReal;
  let dirReal;
  try {
    rootReal = realpathSync(AGENTS_ROOT);
    dirReal = realpathSync(dir);
  } catch (error) {
    return {
      code: 'unsafe_agent_path',
      message: `Agent "${name}" cannot be resolved: ${error.message}`,
    };
  }
  const misplaced = slotFault(name, dirReal, rootReal, slot);
  if (misplaced) return { code: 'unsafe_agent_path', message: misplaced };
  return { dirReal };
}

// One rule, two reactions. `delete` exits on it before taking the lock and
// throws on it inside; a validator stated twice is a validator that disagrees
// with itself the first time one end learns a rule the other has not.
function ownedAgentFault(name, dir, slot) {
  if (!existsSync(dir)) {
    return { code: 'agent_not_found', message: `Agent "${name}" not found at ${dir}` };
  }
  const contained = containmentFault(name, dir, slot);
  if (contained.code) return contained;
  const fault = ownershipFault(name, dir);
  if (fault) return { code: 'not_academy_owned', message: fault };
  return { dir, dirReal: contained.dirReal };
}

// The containment half, as the raising check a read command owes. A read moves
// nothing, so it never asks the ownership question — an unowned directory is
// still readable, and `migrate` is the answer to it. It asks where the slot
// landed, because a read that follows one out of the root publishes content
// from outside it under a `dir` field claiming to be inside.
export function assertContainedAgentDir(name, dir, json = jsonMode()) {
  const fault = containmentFault(name, dir, SLOT.canonical);
  if (fault.code) deleteJsonError(fault.code, fault.message, { name }, json);
}

export function validateOwnedAgentDir(name, dir, json = false, slot = SLOT.canonical) {
  const outcome = ownedAgentFault(name, dir, slot);
  if (outcome.code) deleteJsonError(outcome.code, outcome.message, { name }, json);
  return outcome;
}

// The shared preflight for `delete`, `rename` and `archive`. `unarchive` is the
// one lifecycle command that may address an archived agent, so it preflights
// against the holding area instead of coming through here.
export function preflightOwnedAgent(name, json = false) {
  validateName(name);
  validateAgentsRoot();
  assertNotArchived(name, json);
  return validateOwnedAgentDir(name, agentDir(name), json);
}

export function assertOwnedAgentForDelete(name, dir, slot = SLOT.canonical) {
  const outcome = ownedAgentFault(name, dir, slot);
  if (outcome.code) throw new DeleteAgentError(outcome.code, outcome.message, { name });
  return outcome;
}

export function deleteNightlyConsolidation(name, dir) {
  const id = `${name}-nightly-consolidation`;
  // Resolved inside the lock, so exiting here would strand the lock directory
  // and make every later delete of this agent unanswerable.
  let helmTasksBin;
  try {
    helmTasksBin = resolveExecutable('ACADEMY_HELM_TASKS_BIN', 'helm-tasks', MUST_EXIST);
  } catch (error) {
    if (!(error instanceof RuntimeUnavailableError)) throw error;
    return { ok: false, id, code: error.code, reason: error.message };
  }
  const result = spawnSync(helmTasksBin, ['delete', '--cwd', dir, '--id', id], {
    cwd: dirname(dir),
    encoding: 'utf8',
    env: process.env,
  });
  if (result.error) return { ok: false, id, reason: result.error.message };
  if (result.status !== 0)
    return {
      ok: false,
      id,
      reason: helmFailureReason(result.stderr || result.stdout, result.status),
    };
  return { ok: true, id };
}

// The one failure path `delete`, `rename` and `archive` share. Each stated the
// typed set itself and then printed prose and exited, so an untyped throw never
// reached the floor in `main.mjs` — and every one of those throws happens after
// the directory has already moved. A --json client was told the operation
// failed, in bytes it cannot parse, about a move that stands.
export function reportLifecycleFailure(error, verb, name, json) {
  if (
    error instanceof DeleteAgentError ||
    error instanceof LockTimeoutError ||
    error instanceof LogCorruptError ||
    error instanceof AgentSpecError
  ) {
    deleteJsonError(error.code, error.message, error.fields, json);
  }
  // Rethrown, not printed: `main.mjs` renders `internal_error`, the floor under
  // the envelope. A shell user keeps the prose, which is more useful at a
  // terminal, and the stack the floor would swallow.
  if (json) throw error;
  console.error(`Error: failed to ${verb} agent "${name}": ${error.message}`);
  process.exit(1);
}

export function deleteAgent(name, json) {
  preflightOwnedAgent(name, json);
  const lockDir = agentLifecycleLockPath(agentDir(name));
  try {
    withFileLock(lockDir, () => deleteAgentLocked(name, json));
  } catch (error) {
    reportLifecycleFailure(error, 'delete', name, json);
  }
}

function deleteAgentLocked(name, _json) {
  const { dir, dirReal } = assertOwnedAgentForDelete(name, agentDir(name));
  const quarantine = join(
    resolve(AGENTS_ROOT),
    `.${name}.delete-quarantine.${process.pid}.${Date.now()}`,
  );
  renameSync(dir, quarantine);
  assertOwnedAgentForDelete(name, quarantine, SLOT.contained);

  const unscheduled = deleteNightlyConsolidation(name, dirReal);
  if (!unscheduled.ok) {
    if (!existsSync(dir)) {
      renameSync(quarantine, dir);
    } else {
      throw new DeleteAgentError(
        'unschedule_failed_restore_blocked',
        `Refusing to delete "${name}" because nightly unschedule failed and ${dir} is occupied: ${unscheduled.reason}`,
        { name, quarantine },
      );
    }
    throw new DeleteAgentError(
      unscheduled.code ?? 'unschedule_failed',
      `Refusing to delete "${name}" because nightly unschedule failed: ${unscheduled.reason}`,
      { name },
    );
  }
  rmSync(quarantine, { recursive: true, force: false });
  appendLifecycleEvent('agent_deleted', name, dir);
  if (_json) {
    // Absolute, like every other command's `dir`: a client keying agents on the
    // field must be able to match its create record against this confirmation.
    contractOk('delete', {
      deleted: true,
      name,
      dir: resolve(dir),
      unscheduledJobId: unscheduled.id,
    });
    return;
  }
  console.log(`Deleted agent "${name}" (removed ${dir}).`);
}

export function destroyAgent(name, force) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    process.exit(1);
  }
  if (!force) {
    console.error(`Refusing to destroy "${name}" without --force.`);
    console.error(`This removes ${dir} and all its files.`);
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`Destroyed agent "${name}" (removed ${dir}).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// `notes` — append-only micro-steering staging on an agent's notes.md
// ─────────────────────────────────────────────────────────────────────────────

// Resolve the target agent home for a notes command. Precedence: explicit
// <agent> arg → ACADEMY_AGENT_DIR → ACADEMY_AGENT_HOME (spec synonym) →
// ACADEMY_AGENT_NAME → error. The *_DIR/_HOME vars are absolute agent-home
// paths; ACADEMY_AGENT_DIR is what `academy run` exports.
