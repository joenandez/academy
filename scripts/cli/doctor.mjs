import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ACADEMY_ROOT,
  AGENTS_ROOT,
  CONTRACT_VERSION,
  agentDir,
  auditAgentsRoot,
  contractOk,
  printJson,
  resolveExecutable,
} from './core.mjs';
import { eventLogPath } from './eventlog.mjs';
import { isAgentDirectory } from './inspect.mjs';
import { backfillPlan } from './migrate.mjs';
import { runtimeProviderOrNull } from './runtime.mjs';
import { unattributableSessionCount } from './sessions.mjs';

// The frozen capability answer at contract_version 1. `notes`, `nightly`,
// `clean`, `root`, and `run` all keep working and none of them is contract, so
// none of them appears here: `notes` writes a surface, `root` duplicates
// `agentsRoot`, `nightly` is called by the scheduler Academy registers, `clean`
// traces to no criterion, and `run` spawns with inherited stdio and can never
// emit an envelope.
const PUBLISHED_COMMANDS = [
  'doctor',
  'list',
  'inspect',
  'tokens',
  'budget',
  'sessions',
  'events',
  'create',
  'hire',
  'rename',
  'archive',
  'unarchive',
  'delete',
  'migrate',
];

/** Published above and built by no phase yet. Empty: every command is real. */
export const UNIMPLEMENTED_COMMANDS = [];

/** The executable each published provider needs, as [env override, PATH name]. */
const RUNTIME_EXECUTABLES = {
  claude_code: ['ACADEMY_CLAUDE_BIN', 'claude'],
  codex: ['ACADEMY_CODEX_BIN', 'codex'],
};

// The availability gate. Read-only, and it reports every healthy part of a
// degraded install rather than failing: a client calls this before it renders
// anything, so an answer it cannot parse is an Academy it cannot show at all.
export function reportHealth(json) {
  const audit = auditAgentsRoot();
  const payload = {
    contracts: [CONTRACT_VERSION],
    version: reportedVersion(),
    packageRoot: ACADEMY_ROOT,
    agentsRoot: audit.root,
    eventLog: eventLogPath(),
    commands: PUBLISHED_COMMANDS,
    runtimes: runtimeAvailability(),
    errors: audit.problem ? [] : healthErrors(),
  };

  if (audit.problem) return reportUnusableRoot(payload, audit.problem, json);
  if (json) return contractOk('doctor', payload);
  printReport(payload);
}

// The one state answered with ok:false. Academy can still describe itself, but
// every agent-addressed command raises `unsafe_agent_path` on exactly this
// root, so a client told ok:true would render an interface whose first call
// fails. The whole payload ships anyway, because a client parsing the failure
// still needs the version and contract it is talking to.
function reportUnusableRoot(payload, problem, json) {
  if (json) {
    printJson(
      {
        contract_version: CONTRACT_VERSION,
        ok: false,
        command: 'doctor',
        ...payload,
        error: { code: 'unsafe_agent_path', message: problem, agentsRoot: payload.agentsRoot },
      },
      process.stderr,
    );
  } else {
    printReport(payload);
    console.error(`Error: ${problem}`);
  }
  process.exit(1);
}

// Two builds with different capabilities must never report the same version.
// A published version covers installs, because npm forbids reusing one. It does
// not cover checkouts, so a checkout names its own commit as semver build
// metadata. No `.git` means no checkout — including an install that happens to
// sit inside somebody else's repository.
function reportedVersion() {
  const { version } = JSON.parse(readFileSync(join(ACADEMY_ROOT, 'package.json'), 'utf8'));
  const build = describeCheckout();
  return build ? `${version}+${build}` : version;
}

// Git prefers GIT_DIR over discovery from cwd, and any git hook, `git rebase
// --exec`, or CI wrapper exports one. Left inherited, two Academy checkouts
// invoked under the same GIT_DIR report an identical version — the collision
// `version` exists to prevent. The repository is named outright and every
// inherited git variable is dropped. `--dirty` walks the work tree, so the one
// command a client calls before rendering anything is bounded in time too.
const INHERITED_GIT_VARS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR'];

function gitCleanEnv() {
  const env = { ...process.env };
  for (const name of INHERITED_GIT_VARS) delete env[name];
  return env;
}

function describeCheckout() {
  if (!existsSync(join(ACADEMY_ROOT, '.git'))) return null;
  const described = spawnSync(
    'git',
    [
      '--git-dir',
      join(ACADEMY_ROOT, '.git'),
      '--work-tree',
      ACADEMY_ROOT,
      'describe',
      '--always',
      '--dirty',
    ],
    { cwd: ACADEMY_ROOT, encoding: 'utf8', timeout: 2000, env: gitCleanEnv() },
  );
  if (described.error || described.status !== 0) return null;
  return described.stdout.trim().replace(/[^0-9A-Za-z-]/g, '-') || null;
}

function runtimeAvailability() {
  return Object.fromEntries(
    Object.entries(RUNTIME_EXECUTABLES).map(([provider, [envName, fallback]]) => [
      provider,
      { available: executableExists(envName, fallback) },
    ]),
  );
}

// A probe, not a resolution. `resolveExecutable` exits or throws for the
// commands that need the binary, and doctor may do neither. The existence check
// covers an env override pointing at a path that is not there.
function executableExists(envName, fallback) {
  try {
    return existsSync(resolveExecutable(envName, fallback, { throwOnMissing: true }));
  } catch {
    return false;
  }
}

// The health channel, and it is not the error channel. A code here names a
// degraded thing and how much of it there is; it never appears inside an
// `error` object, and none of the fifteen command-failure codes appears here.
// Zero counts are omitted, so a healthy install reports an empty array.
// `unowned_agents` is counted from the backfill's own plan, not from a second
// ownership sweep. A count a client acts on must equal what `migrate` then
// repairs, and two enumerations of "unowned" drift the moment one of them
// learns a rule the other has not.
function healthErrors() {
  return [
    { code: 'unowned_agents', count: backfillPlan().repair.length },
    { code: 'invalid_runtime_agents', count: agentNames().filter(hasUnreadableRuntime).length },
    { code: 'unattributable_sessions', count: unattributableSessionCount() },
  ].filter((entry) => entry.count > 0);
}

function hasUnreadableRuntime(name) {
  return runtimeProviderOrNull(agentDir(name)) === null;
}

// Guarded rather than raised: a root that passed the audit and then cannot be
// listed is still a root doctor must report the rest of the build against.
function agentNames() {
  try {
    return readdirSync(AGENTS_ROOT).filter(isAgentDirectory).sort();
  } catch {
    return [];
  }
}

function printReport(payload) {
  console.log(`academy ${payload.version}  contract ${CONTRACT_VERSION}`);
  console.log(`  packageRoot  ${payload.packageRoot}`);
  console.log(`  agentsRoot   ${payload.agentsRoot}`);
  console.log(`  eventLog     ${payload.eventLog}`);
  for (const [provider, { available }] of Object.entries(payload.runtimes)) {
    console.log(`  runtime      ${provider.padEnd(12)} ${available ? 'available' : 'unavailable'}`);
  }
  console.log(`  commands     ${payload.commands.join(' ')}`);
  for (const entry of payload.errors) {
    console.log(`  health       ${entry.code} ${entry.count}`);
  }
}
