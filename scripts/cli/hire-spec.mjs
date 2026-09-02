import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { toRuntimeToken } from './runtime.mjs';

// The `hire --spec` file is the whole published input to a headless hire, and
// it is untrusted: it reaches a path join, a yaml scalar write, and a prompt
// handed to a runtime running with an explicit non-interactive permission mode.
// Everything here runs before the runtime is resolved or spawned, so a file
// Academy will not accept never becomes a child process.
//
// Schema — the same fields `create` writes into agent.yaml:
//   { "name": "<kebab-case>", "role": "<text>", "objective": "<text>",
//     "runtime": "claude_code" | "codex" (optional) }

/** Required keys. Every other published key is optional. */
const HIRE_SPEC_REQUIRED = ['name', 'role', 'objective'];

/** The closed key set. An unpublished key is a rejection, not a silent drop. */
const HIRE_SPEC_KEYS = [...HIRE_SPEC_REQUIRED, 'runtime'];

/** Longest a free-text field may be. Both fields land in agent.yaml. */
const HIRE_SPEC_TEXT_CAP = 2000;

/** Largest specification file Academy will read into memory. */
const SPEC_FILE_CAP = 64 * 1024;

// Control characters would close the yaml scalar the writer emits and open a
// second top-level key; a quote or a backslash survives the write but not the
// CLI's line-regex reader, so the round-trip would stop being exact.
const UNSAFE_TEXT_RE = /[\p{Cc}"\\]/u;

// Thrown rather than exited so the caller answers in the envelope it owns.
// `code` is one of the published fifteen: `invalid_spec` for a file Academy
// cannot read or a schema it does not accept, `invalid_runtime` for a runtime
// outside the canonical set.
export class HireSpecError extends Error {
  constructor(code, message, fields = {}) {
    super(message);
    this.code = code;
    this.fields = fields;
  }
}

function invalidSpec(message, specPath, fields = {}) {
  return new HireSpecError('invalid_spec', message, { specPath, ...fields });
}

export function readHireSpec(path) {
  const specPath = resolve(path);
  return validateHireSpec(parseSpecFile(readSpecFile(specPath), specPath), specPath);
}

// A missing file, a directory, an unreadable one and an oversized one are all
// the same answer to the client: this is not a specification Academy can read.
function readSpecFile(specPath) {
  let stats;
  try {
    stats = statSync(specPath);
  } catch (error) {
    throw invalidSpec(`cannot read hire specification at ${specPath}: ${error.code}`, specPath);
  }
  if (!stats.isFile()) {
    throw invalidSpec(`hire specification at ${specPath} is not a file`, specPath);
  }
  if (stats.size > SPEC_FILE_CAP) {
    throw invalidSpec(
      `hire specification at ${specPath} is ${stats.size} bytes, over the ${SPEC_FILE_CAP}-byte limit`,
      specPath,
    );
  }
  try {
    return readFileSync(specPath, 'utf8');
  } catch (error) {
    throw invalidSpec(`cannot read hire specification at ${specPath}: ${error.code}`, specPath);
  }
}

function parseSpecFile(text, specPath) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw invalidSpec(
      `hire specification at ${specPath} is not valid JSON: ${error.message}`,
      specPath,
    );
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidSpec(`hire specification at ${specPath} must be a JSON object`, specPath);
  }
  return parsed;
}

// The name is checked for shape here and for the agent-name rule by
// `validateName` in the caller, so a headless hire is held to exactly the rule
// every other agent-addressed command applies.
function validateHireSpec(parsed, specPath) {
  assertKnownKeys(parsed, specPath);
  const spec = { specPath, runtime: null };
  for (const field of HIRE_SPEC_REQUIRED) {
    spec[field] = assertText(parsed, field, specPath);
  }
  if ('runtime' in parsed) spec.runtime = assertRuntime(parsed.runtime, specPath);
  return spec;
}

function assertKnownKeys(parsed, specPath) {
  const unknown = Object.keys(parsed).filter((key) => !HIRE_SPEC_KEYS.includes(key));
  if (unknown.length === 0) return;
  throw invalidSpec(
    `hire specification at ${specPath} declares unpublished key(s): ${unknown.join(', ')}. Use ${HIRE_SPEC_KEYS.join(', ')}.`,
    specPath,
    { keys: unknown },
  );
}

function assertText(parsed, field, specPath) {
  const value = parsed[field];
  if (typeof value !== 'string') {
    throw invalidSpec(`hire specification at ${specPath} needs a string "${field}"`, specPath, {
      field,
    });
  }
  const text = value.trim();
  if (text === '') {
    throw invalidSpec(`hire specification at ${specPath} has an empty "${field}"`, specPath, {
      field,
    });
  }
  if (text.length > HIRE_SPEC_TEXT_CAP) {
    throw invalidSpec(
      `hire specification at ${specPath} has a "${field}" of ${text.length} characters, over the ${HIRE_SPEC_TEXT_CAP}-character limit`,
      specPath,
      { field },
    );
  }
  if (UNSAFE_TEXT_RE.test(text)) {
    throw invalidSpec(
      `hire specification at ${specPath} has a "${field}" carrying a control character, quote or backslash`,
      specPath,
      { field },
    );
  }
  return text;
}

// The spec speaks the yaml and JSON vocabulary (claude_code), never the
// `--agent` token (claude-code), so the two forms cannot be used interchangeably
// by a client reading the published schema.
function assertRuntime(value, specPath) {
  if (typeof value !== 'string') {
    throw invalidSpec(`hire specification at ${specPath} needs a string "runtime"`, specPath, {
      field: 'runtime',
    });
  }
  if (!toRuntimeToken(value)) {
    throw new HireSpecError(
      'invalid_runtime',
      `Runtime "${value}" is not a runtime Academy supports. Use claude_code or codex.`,
      { runtime: value, specPath },
    );
  }
  return value;
}
