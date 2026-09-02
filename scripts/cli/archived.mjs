import { lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AGENTS_ROOT, NAME_RE, activeCommandName, contractError, jsonMode } from './core.mjs';

// The holding area, as one module. Archived agents live in a dot-directory
// beside their canonical slots, so the roster's NAME_RE filter already keeps
// the holding area itself out of `list`.
//
// Every reader and writer resolves it through `holdingAreaOrNull` below. Stated
// twice — once for reads with a bare `existsSync`, once for writes with an
// explicit containment check — the two ends disagreed the moment `.archived`
// became a symlink: `archive` refused to write through it while `inspect` and
// `delete` still answered `agent_archived` for a live agent that was never
// archived at all, with no published way back, and `list` published an
// out-of-root role string under a `dir` claiming to be inside the root.

export const ARCHIVED_DIR = '.archived';

// The path an archived agent is *reported* at: joined, never realpath'd, so a
// client keying agents on `dir` matches this against the record it already has.
export function archivedAgentDir(name) {
  return join(AGENTS_ROOT, ARCHIVED_DIR, name);
}

// The holding area Academy will act on, or null when there is none it can
// prove. Equality with the expected real path is stricter than containment on
// purpose: it also refuses a `.archived` symlinked elsewhere inside the root.
// A path that is not a directory is refused for the same reason — a regular
// file resolves to itself and would pass every check up to `renameSync`, which
// fails only after the nightly job has already been unregistered.
export function holdingAreaOrNull() {
  try {
    const expected = join(realpathSync(AGENTS_ROOT), ARCHIVED_DIR);
    if (realpathSync(expected) !== expected) return null;
    return statSync(expected).isDirectory() ? expected : null;
  } catch {
    return null;
  }
}

// A root with no provable holding area holds no archived agents. That is the
// answer a read owes, not a fault: refusing to read must never lock a live
// agent out of every published command because something was planted beside it.
export function archivedAgentNames() {
  const holding = holdingAreaOrNull();
  if (holding === null) return [];
  try {
    return readdirSync(holding)
      .filter((entry) => NAME_RE.test(entry) && isRealDirectory(join(holding, entry)))
      .sort();
  } catch {
    return [];
  }
}

export function isArchivedAgent(name) {
  const holding = holdingAreaOrNull();
  return holding !== null && NAME_RE.test(name) && isRealDirectory(join(holding, name));
}

// lstat, not stat: a symlinked slot is not an archived agent, and `unarchive`
// rejects it as unsafe. Naming it archived would make the two ends disagree.
function isRealDirectory(path) {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

// An archived agent is answered with its own code, never `agent_not_found`: a
// client told an archived specialist does not exist would offer to hire a
// replacement for somebody who is still there. `unarchive` is the one command
// allowed to address one, so it is the one command that does not ask.
export function assertNotArchived(name, json = jsonMode()) {
  if (!isArchivedAgent(name)) return;
  const dir = resolve(archivedAgentDir(name));
  const message = `Agent "${name}" is archived at ${dir}. Unarchive it first.`;
  if (json) contractError(activeCommandName(), 'agent_archived', message, { name, dir });
  console.error(`Error: ${message}`);
  process.exit(1);
}
