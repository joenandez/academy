import { appendFileSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { AGENTS_ROOT, CLI_NAME, agentDir, isInside, validateName } from './core.mjs';
import { ownershipFault } from './lifecycle.mjs';

// `notes` is not a published contract command, so it has no envelope to answer
// in. It still names the published code for the fault: the containment defect
// is real whether or not the command is contract, and an operator reading
// stderr needs the same vocabulary every other command uses.
function notesFault(code, message) {
  console.error(`Error: ${code}: ${message}`);
  process.exit(1);
}

// The identity gate. ACADEMY_AGENT_DIR arrives from the environment, which is
// not a source Academy can verify, so an accepted directory must prove both
// that it resolves inside AGENTS_ROOT and that Academy owns it. Without this,
// `notes add` is an arbitrary append under an identity nobody checked.
// `migrate` is the repair path for an agent scaffolded before the marker.
function containedAgentDir(candidate) {
  const dir = resolve(candidate);
  if (!isInside(dir, AGENTS_ROOT)) {
    notesFault('unsafe_agent_path', `agent directory resolves outside AGENTS_ROOT: ${dir}`);
  }
  let real;
  try {
    real = realpathSync(dir);
  } catch {
    // Not there at all. `ensureAgentHome` is the second gate and says so.
    return dir;
  }
  const fault = ownershipFault(basename(real), real);
  if (fault) notesFault('not_academy_owned', `${fault} at ${real}`);
  return real;
}

function namedAgentDir(name) {
  validateName(name);
  return containedAgentDir(agentDir(name));
}

function resolveNotesAgentDir(explicitName) {
  if (explicitName) return namedAgentDir(explicitName);
  const home = process.env.ACADEMY_AGENT_DIR || process.env.ACADEMY_AGENT_HOME;
  if (home) return containedAgentDir(home);
  if (process.env.ACADEMY_AGENT_NAME) return namedAgentDir(process.env.ACADEMY_AGENT_NAME);
  console.error(`Error: no agent resolved for \`${CLI_NAME} notes\`.`);
  console.error('Pass an agent name, or run inside an agent so ACADEMY_AGENT_DIR is set.');
  console.error(
    `Usage: ${CLI_NAME} notes add [<agent>] "text"  |  ${CLI_NAME} notes list [<agent>] [--last N]`,
  );
  process.exit(1);
}

function ensureAgentHome(dir) {
  if (!existsSync(dir)) {
    console.error(`Agent home not found at ${dir}`);
    process.exit(1);
  }
  return dir;
}

// Local-time stamp `YYYY-MM-DD HH:MM` (not UTC — spec §Appended Format).
function localNoteStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function notesAdd(name, text) {
  if (!text || !text.trim()) {
    console.error('Error: note text required.');
    console.error(`Usage: ${CLI_NAME} notes add [<agent>] "text"`);
    process.exit(1);
  }
  const dir = ensureAgentHome(resolveNotesAgentDir(name));
  const notesPath = join(dir, 'notes.md');
  // Append-only: never read or rewrite the whole file (spec §Behavior).
  appendFileSync(notesPath, `- ${localNoteStamp()}: ${text}\n`);
  console.log(`Noted → ${notesPath}`);
}

export function notesList(name, last) {
  const dir = ensureAgentHome(resolveNotesAgentDir(name));
  const notesPath = join(dir, 'notes.md');
  if (!existsSync(notesPath)) {
    console.log('(no notes yet)');
    return;
  }
  // A note bullet is a top-level `- ` line — excludes headers, `_(…)_` italics,
  // and `---` rules in the scaffold.
  const bullets = readFileSync(notesPath, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- '));
  const recent = bullets.slice(-last);
  if (recent.length === 0) {
    console.log('(no notes yet)');
    return;
  }
  console.log(recent.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
