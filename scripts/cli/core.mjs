import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Academy package root (parent of scripts/). */
export const ACADEMY_ROOT = resolve(__dirname, '../..');
export const ACADEMY_CLI_PATH = join(ACADEMY_ROOT, 'scripts', 'agent.mjs');

/** Global agents root — portable plugin layout. Key v3 differentiator (§2). */
const DEFAULT_AGENTS_ROOT = join(homedir(), '.academy', 'agents');
const NAMED_AGENTS_ROOT = process.env.AGENTS_ROOT;
export const AGENTS_ROOT = NAMED_AGENTS_ROOT || DEFAULT_AGENTS_ROOT;

// Whether the root is Academy's own or one an operator named. The two states
// disagree about exactly one thing — a missing parent — and about nothing else.
const AGENTS_ROOT_IS_DEFAULT = !NAMED_AGENTS_ROOT;

/** Display name for a managed wrapper without changing Academy's API. */
export const CLI_NAME = process.env.ACADEMY_CLI_NAME?.trim() || 'academy';

/** Allowed agent name pattern: kebab-case, 1–32 chars. */
export const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;

export const SURFACES = [
  'identity',
  'role',
  'knowledge',
  'goals',
  'priorities',
  'threads',
  'notes',
  'dailys',
];
export const SURFACE_CAPS = {
  identity: 400,
  role: 400,
  knowledge: 2500,
  goals: 150,
  priorities: 250,
  threads: 1750,
  notes: 500,
  dailys: 1050,
};
export const TOTAL_SURFACE_CAP = Object.values(SURFACE_CAPS).reduce((sum, cap) => sum + cap, 0);
export const ENFORCED_SURFACES = new Set(['knowledge', 'priorities', 'threads', 'notes', 'dailys']);
export const UNIVERSAL_SKILLS = [
  'check-in',
  'self-update',
  'nightly-consolidation',
  'knowledge-curation',
];
export const NIGHTLY_JOB_CRON = '0 22 * * *';
export const SCHEDULED_CLAUDE_PERMISSION_ARGS = ['--permission-mode', 'auto'];
export const SCHEDULED_CODEX_PERMISSION_ARGS = [
  '--ask-for-approval',
  'never',
  '--sandbox',
  'workspace-write',
  'exec',
];
export const ACADEMY_SYSTEM_PROMPT = 'academy-system-prompt.md';
export const RUNTIMES = new Set(['claude-code', 'codex']);

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

export function validateName(name, json = jsonMode()) {
  if (!name) return invalidName('agent name required', name ?? null, json);
  if (!NAME_RE.test(name)) {
    return invalidName(
      `invalid name "${name}". Use kebab-case, 1–32 chars, starting with a letter.`,
      name,
      json,
    );
  }
}

function invalidName(message, name, json) {
  if (json) contractError(activeCommandName(), 'invalid_name', message, { name });
  console.error(`Error: ${message}`);
  process.exit(1);
}

export function agentDir(name) {
  return join(AGENTS_ROOT, name);
}

// The holding area — `.archived`, its containment rule and every command's
// question about it — lives in archived.mjs, which imports from here.

// The one lock that serialises everything acting on a single agent. It lives
// beside the agent directory rather than inside it, so a lifecycle command can
// still hold it while the directory itself moves. Derived from the directory so
// `delete` and the agent.yaml scalar write cannot name different locks.
export function agentLifecycleLockPath(dir) {
  const resolved = resolve(dir);
  return join(dirname(resolved), `.${basename(resolved)}.lifecycle.lock`);
}

// The read-only root audit, as an answer rather than an exit. `doctor` reports
// on a root it cannot use and must never exit from inside a probe, so the
// finding and the reaction to it live apart. It never creates the root: `list`
// on an unmounted volume must report the fault, not manufacture an empty roster.
export function auditAgentsRoot() {
  const root = resolve(AGENTS_ROOT);
  const parent = dirname(root);
  let parentReal;
  try {
    parentReal = realpathSync(parent);
  } catch {
    return missingParent(root, parent);
  }
  if (!existsSync(root)) return { root, exists: false, problem: null };
  return { root, exists: true, problem: rootProblem(root, parentReal) };
}

// A missing `~/.academy` is a user who has not started yet, not a broken
// install: the client provisions Academy silently and calls `doctor` before it
// renders anything, so a first run answered with ok:false is a product that
// looks dead on arrival. An operator who names a root and gets it wrong still
// hears about it — an unmounted volume must never read as an empty roster.
function missingParent(root, parent) {
  if (AGENTS_ROOT_IS_DEFAULT) return { root, exists: false, problem: null };
  return { root, exists: false, problem: `AGENTS_ROOT parent does not exist: ${parent}` };
}

// All four findings share one stable code: the agents root is not a path
// Academy can safely use. The text names which check failed.
function rootProblem(root, parentReal) {
  if (isSymlink(root)) return `AGENTS_ROOT must not be a symlink: ${root}`;
  try {
    if (!statSync(root).isDirectory()) return `AGENTS_ROOT is not a directory: ${root}`;
    if (dirname(realpathSync(root)) !== parentReal) {
      return `AGENTS_ROOT resolves outside its parent: ${root}`;
    }
  } catch (error) {
    return `AGENTS_ROOT cannot be resolved: ${error.message}`;
  }
  return null;
}

// The raising wrapper. Every command that trusts AGENTS_ROOT runs this, so a
// read command and a mutating command can never disagree about the same root.
export function checkAgentsRoot(json = jsonMode()) {
  const { root, exists, problem } = auditAgentsRoot();
  if (problem) unsafeAgentsRoot(problem, root, json);
  return { root, exists };
}

// The default root creates its own parent, because on a first run there is none
// and nothing else will make it. A named root does not: its parent was proved
// to exist by the audit above, so one level is all this ever has to create.
export function validateAgentsRoot(json = jsonMode()) {
  const { root, exists } = checkAgentsRoot(json);
  if (!exists) mkdirSync(root, { recursive: AGENTS_ROOT_IS_DEFAULT });
  return root;
}

function unsafeAgentsRoot(message, root, json) {
  if (json) contractError(activeCommandName(), 'unsafe_agent_path', message, { agentsRoot: root });
  console.error(`Error: ${message}`);
  process.exit(1);
}

export function printJson(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

/** Response contract version. Independent of package semver; frozen shape. */
export const CONTRACT_VERSION = 1;

// Stable error codes. The published set is frozen at contract_version 1:
//   agent_not_found, unsafe_agent_path, not_academy_owned, invalid_name,
//   agent_exists, agent_archived, replay_unavailable, log_corrupt,
//   invalid_runtime, invalid_spec, runtime_unavailable, lock_timeout,
//   internal_error, unschedule_failed, unschedule_failed_restore_blocked.
// Fifteen codes. internal_error was added by ruling during phase 1 as the
// floor under the envelope; the two unschedule_* codes predate the contract
// and were published by ruling rather than retired, because delete already
// raises them and a client must be able to tell the two apart.
// Raised today:
//   agent_not_found     inspect | tokens | budget | delete on a missing agent
//   invalid_name        any agent-addressed command with a non-kebab-case name
//   unsafe_agent_path   an unusable AGENTS_ROOT, or an agent dir resolving outside it
//   not_academy_owned   a directory in AGENTS_ROOT without valid ownership metadata
//   agent_exists        create on a name that already has a directory
//   log_corrupt         a lifecycle append onto an event log with no parseable record
//   invalid_runtime     an agent.yaml runtime scalar outside the canonical set
//   invalid_spec        an agent.yaml naming a key in a form the writer cannot
//                       rewrite, and an events invocation Academy cannot read
//   runtime_unavailable an executable Academy needs is missing or failed
//   lock_timeout        a lifecycle lock could not be taken inside the timeout
//   internal_error      the floor: a throw no command anticipated, under --json
// `doctor`'s `errors[]` is a different channel: it names a degraded thing and
// how many of it there are, never a command failure. None of the fifteen codes
// appears there, and no code from there appears in an `error` object.

// The command name and --json flag are set once at dispatch so validators deep
// in the call stack (validateName, validateAgentsRoot) can emit the envelope
// without every caller plumbing both values through.
let activeCommand = { name: 'academy', json: false };

export function setActiveCommand(name, json = false) {
  activeCommand = { name, json: Boolean(json) };
}

export function activeCommandName() {
  return activeCommand.name;
}

export function jsonMode() {
  return activeCommand.json;
}

export function contractOk(command, payload) {
  printJson({ contract_version: CONTRACT_VERSION, ok: true, command, ...payload });
}

export function contractError(command, code, message, fields = {}) {
  printJson(
    { contract_version: CONTRACT_VERSION, ok: false, command, error: { code, message, ...fields } },
    process.stderr,
  );
  process.exit(1);
}

export function exitJsonError(code, message, fields = {}) {
  contractError(activeCommandName(), code, message, fields);
}

// The memory bridge is Academy's one client-specific surface, and it is opt-in.
// Unset, a scaffolded agent names no client at all.
export function memoryBridgeEnabled() {
  return process.env.ACADEMY_MEMORY_BRIDGE === '1';
}

export function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

// Raised when a lifecycle lock cannot be taken inside the timeout. Thrown, not
// exited, so the command that wanted the lock can answer in the envelope.
export class LockTimeoutError extends Error {
  constructor(lockDir) {
    super(`Timed out acquiring lock: ${lockDir}`);
    this.code = 'lock_timeout';
    this.fields = { lockDir };
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

export function withFileLock(lockDir, fn) {
  const started = Date.now();
  while (true) {
    try {
      mkdirSync(lockDir, { recursive: false });
      break;
    } catch {
      if (Date.now() - started > 5000) throw new LockTimeoutError(lockDir);
      sleep(25);
    }
  }

  try {
    return fn();
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

export function ensureSymlink(target, linkPath, type = 'dir') {
  const resolvedTarget = resolve(target);
  if (isSymlink(linkPath)) {
    const existing = readlinkSync(linkPath);
    const resolvedExisting = resolve(dirname(linkPath), existing);
    if (resolvedExisting === resolvedTarget || resolve(existing) === resolvedTarget) return;
    unlinkSync(linkPath);
  } else if (existsSync(linkPath)) {
    rmSync(linkPath, { recursive: true, force: true });
  }
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(resolvedTarget, linkPath, type);
}

export function ensureAcademyGitignore(projectDir) {
  const academyDir = join(projectDir, '.academy');
  mkdirSync(academyDir, { recursive: true });
  const gitignorePath = join(academyDir, '.gitignore');
  if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, '*\n');
}

export function projectPluginDir(projectDir, name) {
  return join(resolve(projectDir), '.academy', 'agents', name);
}

export function legacyAcademyRoot(dir) {
  const rootFile = join(dir, '.academy_root');
  if (!existsSync(rootFile)) return null;
  const root = readFileSync(rootFile, 'utf8').trim();
  if (!root || resolve(root) === ACADEMY_ROOT) return null;
  const legacyCli = join(root, 'scripts', 'agent.mjs');
  return existsSync(legacyCli) ? root : null;
}

export function delegateLegacyRun(name, passthrough, legacyRoot) {
  const args = ['run', name, ...(passthrough.length > 0 ? ['--', ...passthrough] : [])];
  const result = spawnSync(process.execPath, [join(legacyRoot, 'scripts', 'agent.mjs'), ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

export function isInside(childPath, parentPath) {
  let child = resolve(childPath);
  let parent = resolve(parentPath);
  try {
    child = realpathSync(child);
  } catch {
    /* use resolved path */
  }
  try {
    parent = realpathSync(parent);
  } catch {
    /* use resolved path */
  }
  return child === parent || child.startsWith(parent + '/');
}

export function shellSingleQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Raised when an external binary Academy needs is not installed. Thrown rather
// than exited so the caller can roll its work back, release its lock, and
// answer in the envelope.
export class RuntimeUnavailableError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.code = 'runtime_unavailable';
    this.fields = fields;
  }
}

export function resolveExecutable(envName, fallback, { throwOnMissing = false } = {}) {
  const configured = process.env[envName];
  if (configured) return configured;
  if (fallback.includes('/')) return fallback;

  for (const dir of (process.env.PATH || '').split(':').filter(Boolean)) {
    const candidate = join(dir, fallback);
    if (existsSync(candidate)) return candidate;
  }

  const message = `Failed to resolve executable "${fallback}" from PATH for ${envName}.`;
  if (throwOnMissing) throw new RuntimeUnavailableError(message, { executable: fallback });
  console.error(`[ACADEMY_RUNTIME] ${message}`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// `create` — scaffold the 8 boot files + universal skills + plugin symlink
// ─────────────────────────────────────────────────────────────────────────────
