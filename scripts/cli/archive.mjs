import { existsSync, mkdirSync, renameSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AGENTS_ROOT,
  agentDir,
  agentLifecycleLockPath,
  contractOk,
  isSymlink,
  validateAgentsRoot,
  validateName,
  withFileLock,
} from './core.mjs';
import { ARCHIVED_DIR, archivedAgentDir, holdingAreaOrNull } from './archived.mjs';
import { registerNightlyConsolidationTask } from './create.mjs';
import { appendLifecycleEvent } from './eventlog.mjs';
import {
  DeleteAgentError,
  SLOT,
  assertOwnedAgentForDelete,
  deleteNightlyConsolidation,
  preflightOwnedAgent,
  reportLifecycleFailure,
  validateOwnedAgentDir,
} from './lifecycle.mjs';

// `archive` / `unarchive`. Archived agents live at AGENTS_ROOT/.archived/<name>,
// which is not the canonical slot, so they are validated against the holding
// area instead — see SLOT in lifecycle.mjs, where that relaxation is bounded.
// Neither command destroys anything, so neither quarantines: the move itself is
// the whole operation and it is reversible by the other command.

export function archiveAgent(name, json) {
  preflightOwnedAgent(name, json);
  runLocked(name, json, 'archive', () => archiveAgentLocked(name, json));
}

export function unarchiveAgent(name, json) {
  validateName(name);
  validateAgentsRoot();
  validateOwnedAgentDir(name, archivedAgentDir(name), json, SLOT.archived);
  runLocked(name, json, 'unarchive', () => unarchiveAgentLocked(name, json));
}

// Both commands take the canonical lifecycle lock, the same one `delete` and
// `rename` take, so an archive can never interleave with either.
function runLocked(name, json, verb, work) {
  try {
    withFileLock(agentLifecycleLockPath(agentDir(name)), work);
  } catch (error) {
    reportLifecycleFailure(error, verb, name, json);
  }
}

// The holding area is the only boundary left once the canonical-slot rule is
// relaxed, so it is proved before anything moves. Proved after the rename
// instead, a refusal reports failure with the agent already outside the root,
// where `list` cannot see it and no published command can bring it back. The
// rule itself is `holdingAreaOrNull`, the same one every read now asks: a write
// refuses what a read reports empty, and the two can no longer disagree.
function assertContainedHoldingArea(name) {
  if (holdingAreaOrNull() !== null) return;
  const holding = join(resolve(AGENTS_ROOT), ARCHIVED_DIR);
  throw unsafePath(name, holding, 'is not the real directory AGENTS_ROOT/.archived');
}

// Created only by `archive`, and never through a symlink: `mkdirSync` would
// follow one and provision a directory outside the root before the check runs.
function ensureHoldingArea() {
  const holding = join(resolve(AGENTS_ROOT), ARCHIVED_DIR);
  if (!isSymlink(holding) && !existsSync(holding)) mkdirSync(holding, { recursive: true });
}

// A slot that is a symlink is never written through. `refuseOccupiedTarget`
// asks `existsSync`, which follows one, so a dangling link would otherwise read
// as a free slot and the rename would silently replace it.
function assertContainedSlot(name, target) {
  if (isSymlink(target)) throw unsafePath(name, target, 'is a symlink');
}

function unsafePath(name, path, reason) {
  return new DeleteAgentError(
    'unsafe_agent_path',
    `Agent "${name}" cannot move: ${path} ${reason}`,
    { name, dir: path },
  );
}

function refuseOccupiedTarget(name, target) {
  if (!existsSync(target)) return;
  throw new DeleteAgentError(
    'agent_exists',
    `Agent "${name}" already occupies ${resolve(target)}`,
    { name, dir: resolve(target) },
  );
}

function archiveAgentLocked(name, json) {
  const { dirReal } = assertOwnedAgentForDelete(name, agentDir(name));
  const previousDir = resolve(agentDir(name));
  ensureHoldingArea();
  assertContainedHoldingArea(name);
  const target = archivedAgentDir(name);
  assertContainedSlot(name, target);
  refuseOccupiedTarget(name, target);

  // Unscheduled before the move, for the same reason `rename` unschedules
  // first: the job's --cwd names a directory that is about to move, and an
  // archived agent must not keep firing nightly.
  const unscheduled = deleteNightlyConsolidation(name, dirReal);
  if (!unscheduled.ok) {
    throw new DeleteAgentError(
      unscheduled.code ?? 'unschedule_failed',
      `Refusing to archive "${name}" because nightly unschedule failed: ${unscheduled.reason}`,
      { name },
    );
  }

  renameSync(dirReal, target);
  appendLifecycleEvent('agent_archived', name, resolve(target), { previousDir });

  if (json) {
    contractOk('archive', {
      archived: true,
      name,
      dir: resolve(target),
      previousDir,
      unscheduledJobId: unscheduled.id,
    });
    return;
  }
  console.log(`Archived agent "${name}" (${previousDir} → ${resolve(target)}).`);
  console.log(`Unregistered nightly consolidation job "${unscheduled.id}".`);
}

function unarchiveAgentLocked(name, json) {
  assertContainedHoldingArea(name);
  const { dirReal } = assertOwnedAgentForDelete(name, archivedAgentDir(name), SLOT.archived);
  const previousDir = resolve(archivedAgentDir(name));
  const target = agentDir(name);
  assertContainedSlot(name, target);
  refuseOccupiedTarget(name, target);

  renameSync(dirReal, target);
  const nightly = registerNightlyConsolidationTask(target, name);
  appendLifecycleEvent('agent_unarchived', name, resolve(target), { previousDir });

  const scheduledJobId = nightly.registered ? nightly.id : null;
  if (json) {
    contractOk('unarchive', {
      unarchived: true,
      name,
      dir: resolve(target),
      previousDir,
      scheduledJobId,
    });
    return;
  }
  console.log(`Unarchived agent "${name}" (${previousDir} → ${resolve(target)}).`);
  if (scheduledJobId) console.log(`Registered nightly consolidation job "${scheduledJobId}".`);
  else console.log(`Nightly consolidation job not registered: ${nightly.reason}`);
}
