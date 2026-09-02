import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentLifecycleLockPath, withFileLock } from './core.mjs';

// agent.yaml is hand-authored: it carries comments and a `surfaces:` list that
// the CLI's line-regex reader cannot represent. Writing is therefore line
// surgery, never re-serialization — anything the writer does not touch keeps
// its exact bytes.

/** The reader's key line: a top-level scalar, value optional. */
const scalarLine = (key) => new RegExp(`^${key}:[ \\t]*(.*)$`);
/** Any line naming the same key in a form neither end of this module handles. */
const looseKeyLine = (key) => new RegExp(`^\\s*(["']?)${key}\\1\\s*:`);
/** A top-level scalar carrying a non-empty value. `surfaces:` does not match. */
const VALUED_SCALAR_RE = /^[a-z_][a-z0-9_]*:[ \t]*\S/;

// Raised when agent.yaml already names the key in a shape the line surgery
// cannot rewrite. Inserting a second top-level key instead would leave a
// duplicate mapping key in a file §3.7 publishes for clients to parse, and a
// strict parser rejects that outright. Thrown, not exited, so a --json caller
// can answer in the envelope; `invalid_spec` is the published code for an agent
// spec Academy will not accept.
export class AgentSpecError extends Error {
  constructor(message, fields) {
    super(message);
    this.code = 'invalid_spec';
    this.fields = fields;
  }
}

function lastIndexMatching(lines, test) {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (test(lines[i])) return i;
  }
  return -1;
}

// The read, the edit and the commit belong to one critical section. agent.yaml
// is published as client-writable, `delete` moves the whole directory, and a
// nightly child can run at the same instant as an interactive one — so the
// scalar write takes the same lock every lifecycle command takes.
export function writeAgentYamlScalar(dir, key, value) {
  withFileLock(agentLifecycleLockPath(dir), () => rewriteAgentYamlScalar(dir, key, value));
}

// The same write for a caller that already holds the agent's lifecycle lock.
// `rename` moves the directory and rewrites `name:` in one critical section, so
// taking the lock a second time here would block against its own holder until
// the timeout and report `lock_timeout` for work that was never contended.
export function rewriteAgentYamlScalar(dir, key, value) {
  const path = join(dir, 'agent.yaml');
  const text = readFileSync(path, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = splitLines(text.replace(/\r?\n$/, ''));
  const line = `${key}: ${value}`;

  // Rewrite the last occurrence: the reader takes the last key line too, so a
  // hand-edited duplicate cannot shadow what was just written.
  const present = lastIndexMatching(lines, (candidate) => scalarLine(key).test(candidate));
  if (present !== -1) lines[present] = line;
  else lines.splice(insertionIndex(lines, key, path) + 1, 0, line);

  commit(path, lines.join(eol) + eol);
}

// The strict key line is absent. Inserting is safe only when nothing else in
// the file claims the key: an indented, quoted or space-padded one is invisible
// to this module's reader and writer alike, so adding a second is a duplicate
// no client should have to resolve.
function insertionIndex(lines, key, path) {
  const loose = lastIndexMatching(lines, (candidate) => looseKeyLine(key).test(candidate));
  if (loose !== -1) {
    throw new AgentSpecError(
      `agent.yaml at ${path} already declares "${key}" on line ${loose + 1} in a form Academy cannot rewrite. Restate it as a top-level \`${key}: <value>\` and retry.`,
      { path, key, line: loose + 1 },
    );
  }
  return anchorIndex(lines);
}

// Truncating the published file in place has a window where a crash leaves it
// empty and a concurrent reader sees no scalars at all — `name`, `created`,
// `role`, the `surfaces:` block, gone. Rename is atomic, so every reader sees
// either the whole old file or the whole new one.
function commit(path, contents) {
  const temp = `${path}.tmp`;
  writeFileSync(temp, contents);
  renameSync(temp, path);
}

// Insert after the last scalar carrying a value. Inserting after the last line
// the reader recognizes would land inside `surfaces:` and split the list from
// its key. With no valued scalar anywhere, append at end of file.
function anchorIndex(lines) {
  const anchor = lastIndexMatching(lines, (line) => VALUED_SCALAR_RE.test(line));
  return anchor === -1 ? lines.length - 1 : anchor;
}

// One line splitter for both ends. `.` does not match `\r`, so a `$`-anchored
// key regex matched nothing at all on a CRLF file and Academy reported the
// default runtime for an agent that declared another one.
function splitLines(text) {
  return text.split(/\r?\n/);
}

// The matching reader: only the top-level scalars the CLI needs, taking the
// last occurrence of a key so it agrees with the writer above. A missing or
// unreadable agent.yaml reads as an empty record, never as an error.
const READ_SCALAR_RE = /^([a-z_][a-z0-9_]*):\s*(.*)$/i;

export function readAgentYaml(dir) {
  const out = {};
  let text;
  try {
    text = readFileSync(join(dir, 'agent.yaml'), 'utf8');
  } catch {
    return out;
  }
  for (const line of splitLines(text)) {
    const match = line.match(READ_SCALAR_RE);
    if (match) out[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
