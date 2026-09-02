import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AGENTS_ROOT,
  LockTimeoutError,
  NAME_RE,
  agentLifecycleLockPath,
  checkAgentsRoot,
  contractOk,
  exitJsonError,
  isInside,
  isSymlink,
  withFileLock,
} from './core.mjs';
import { ownershipFault } from './lifecycle.mjs';
import { writeOwnershipMarker } from './scaffold.mjs';

const MARKER = '.academy-agent.json';

// The ownership backfill. Agents scaffolded before the marker existed fail
// every ownership-gated command, and this is the one operator-invoked repair
// for that. It writes the marker and nothing else: it never creates an agent,
// never rewrites agent content, and never touches a directory it cannot prove
// is the agent's own slot inside AGENTS_ROOT.

// Containment is the invariant, and it is proved against the resolved path, not
// the joined one. A symlink inside the root pointing anywhere else — outside
// the root, or at another agent beside it — is refused, because writing "kai"
// ownership through it would mark a directory Academy does not own.
function slotFault(dirReal, rootReal, name) {
  if (!isInside(dirReal, rootReal)) return `resolves outside AGENTS_ROOT: ${dirReal}`;
  if (dirReal !== join(rootReal, name)) {
    return `resolves to another directory inside AGENTS_ROOT: ${dirReal}`;
  }
  return null;
}

// Guarded rather than raised: `doctor` counts the outstanding backfill through
// this same plan and must never exit from inside a probe.
function rootEntries(root) {
  try {
    return readdirSync(root)
      .filter((entry) => NAME_RE.test(entry))
      .sort();
  } catch {
    return [];
  }
}

// Containment is proved for the directory; the marker is a second path and
// needs its own proof. `existsSync` follows symlinks, so a dangling or non-JSON
// symlink at the marker reads as "no marker", and `writeFileSync` then opens
// with O_TRUNC and follows the link to whatever it names. Asked before
// ownership on purpose: a marker symlinked at a valid file outside the root
// would otherwise pass the gate silently instead of being reported.
function markerFault(dirReal) {
  const markerPath = join(dirReal, MARKER);
  if (isSymlink(markerPath)) return `ownership marker is a symlink: ${markerPath}`;
  return null;
}

function classify(root, rootReal, name) {
  const dir = join(root, name);
  let dirReal;
  try {
    dirReal = realpathSync(dir);
  } catch (error) {
    return { refused: { name, dir, reason: `cannot be resolved: ${error.message}` } };
  }
  const fault = slotFault(dirReal, rootReal, name);
  if (fault) return { refused: { name, dir, reason: fault } };
  // Not an agent directory, so not a repair. Marking a directory holding no
  // agent.yaml would create an agent, which the backfill must never do.
  if (!statSync(dirReal).isDirectory()) return {};
  if (!existsSync(join(dirReal, 'agent.yaml'))) return {};
  const marker = markerFault(dirReal);
  if (marker) return { refused: { name, dir, reason: marker } };
  if (ownershipFault(name, dirReal) === null) return {};
  // dirReal is carried, not recomputed at the write: joining the unvalidated
  // path again would traverse the same symlink chain a second time and land
  // somewhere the classification never proved.
  return { repair: { name, dir, dirReal } };
}

// The one enumeration. `migrate` repairs exactly this set and `doctor` counts
// exactly this set, so the reported outstanding count and the repair can never
// disagree.
export function backfillPlan() {
  const root = resolve(AGENTS_ROOT);
  let rootReal = root;
  try {
    rootReal = realpathSync(root);
  } catch {
    /* an unresolvable root yields no candidates */
  }
  const repair = [];
  const refused = [];
  for (const name of rootEntries(root)) {
    const outcome = classify(root, rootReal, name);
    if (outcome.repair) repair.push(outcome.repair);
    if (outcome.refused) refused.push(outcome.refused);
  }
  return { agentsRoot: root, rootReal, repair, refused };
}

// The whole root is classified before the first write, so the last write lands
// long after its entry was judged. The lock serialises the commands; it does
// not revalidate, so the entry is classified again inside it and skipped when
// it no longer qualifies.
function writeOneMarker(root, rootReal, { name, dir }) {
  return withFileLock(agentLifecycleLockPath(dir), () => {
    const current = classify(root, rootReal, name);
    if (current.refused) return current;
    if (!current.repair) return { skipped: true };
    writeOwnershipMarker(current.repair.dirReal, name);
    return { written: true };
  });
}

// One unwritable directory is one refusal, not an abandoned sweep. The operator
// asked for every outstanding marker and has to learn which ones landed, and
// `refused[]` is the channel the payload already publishes for exactly that.
// Only a lock timeout escapes: it is the one fault that fails the command.
function writeMarkers(plan) {
  const migrated = [];
  for (const entry of plan.repair) {
    let outcome;
    try {
      outcome = writeOneMarker(plan.agentsRoot, plan.rootReal, entry);
    } catch (error) {
      if (error instanceof LockTimeoutError) throw error;
      outcome = { refused: { name: entry.name, dir: entry.dir, reason: error.message } };
    }
    if (outcome.written) migrated.push(entry);
    if (outcome.refused) plan.refused.push(outcome.refused);
  }
  return migrated;
}

export function backfillOwnership({ json, dryRun, invalidOption }) {
  if (invalidOption !== undefined) return unreadableInvocation(invalidOption, json);
  checkAgentsRoot(json);
  const plan = backfillPlan();
  let migrated = plan.repair;
  try {
    if (!dryRun) migrated = writeMarkers(plan);
  } catch (error) {
    if (!(error instanceof LockTimeoutError)) throw error;
    if (json) exitJsonError(error.code, error.message, error.fields);
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  if (json) {
    contractOk('migrate', {
      agentsRoot: plan.agentsRoot,
      dryRun: Boolean(dryRun),
      migrated: migrated.map(published),
      refused: plan.refused,
    });
    return;
  }
  printBackfill(plan, migrated, dryRun);
}

// The resolved directory the write targets is internal. A published record
// carries the two keys it always carried.
function published({ name, dir }) {
  return { name, dir };
}

function unreadableInvocation(option, json) {
  const message = `Unknown migrate option: ${option}. Use [--dry-run] [--json].`;
  if (json) exitJsonError('invalid_spec', message, { option });
  console.error(`Error: ${message}`);
  process.exit(1);
}

function printBackfill(plan, migrated, dryRun) {
  const verb = dryRun ? 'would write' : 'wrote';
  console.log(`migrate ${plan.agentsRoot}: ${verb} ${migrated.length} ownership marker(s)`);
  for (const { name, dir } of migrated) console.log(`  marker  ${name}  ${dir}`);
  for (const entry of plan.refused) console.log(`  refused ${entry.name}  ${entry.reason}`);
}
