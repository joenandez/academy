import { existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pendingMarkerPath } from '../../hooks/memory_store.mjs';
import {
  ACADEMY_ROOT,
  AGENTS_ROOT,
  CLI_NAME,
  activeCommandName,
  NIGHTLY_JOB_CRON,
  agentDir,
  contractError,
  contractOk,
  LockTimeoutError,
  RuntimeUnavailableError,
  resolveExecutable,
  validateAgentsRoot,
  validateName,
} from './core.mjs';
import { assertNotArchived } from './archived.mjs';
import { LogCorruptError, appendLifecycleEvent } from './eventlog.mjs';
import { agentRecord } from './inspect.mjs';
import { deleteNightlyConsolidation } from './lifecycle.mjs';
import {
  renderAcademySystemPrompt,
  scaffoldBootFiles,
  writeAgentClaudeMd,
  writeAgentYaml,
  writeOwnershipMarker,
  writePluginSymlink,
  writeSettingsLocal,
  writeSkillsScaffold,
} from './scaffold.mjs';

// Every executable Academy needs is resolved this way so a missing binary
// raises RuntimeUnavailableError instead of exiting mid-operation.
export const MUST_EXIST = { throwOnMissing: true };

export function createAgent(name, json = false) {
  const { dir, nightlyTask } = provisionAgent(name, json);
  reportCreated(name, dir, nightlyTask, json);
}

// The one creation path. `create` reports what it returns as a create and the
// headless hire reports the same thing as a hire, so an agent hired without a
// terminal is indistinguishable from a created one in ownership, scheduling and
// events. A second scaffolder would be a second definition of what an Academy
// agent is, and the two would disagree the first time one of them learned a
// rule the other did not.
export function provisionAgent(name, json = false) {
  const dir = assertAgentNameFree(name, json);
  scaffoldAgentDir(dir, name, json);
  const nightlyTask = registerNightlyConsolidationTask(dir, name);
  if (!nightlyTask.registered && !nightlyTask.skipped) {
    rmSync(dir, { recursive: true, force: true });
    failNightlyRegistration(name, nightlyTask, json);
  }
  try {
    appendLifecycleEvent('agent_created', name, dir);
  } catch (error) {
    if (nightlyTask.registered) deleteNightlyConsolidation(name, realpathSync(dir));
    rmSync(dir, { recursive: true, force: true });
    failLifecyclePublish(name, error, json);
  }
  return { dir, nightlyTask };
}

// The name question, asked before anything is written. The headless hire asks
// it before it resolves a runtime, so a name that is already taken never
// becomes a child process holding an explicit write permission.
export function assertAgentNameFree(name, json = false) {
  validateName(name);
  validateAgentsRoot();
  // A fresh agent must not take a name the holding area still owns: unarchiving
  // it afterwards could only ever collide.
  assertNotArchived(name, json);
  const dir = agentDir(name);
  if (!existsSync(dir)) return dir;
  const message = `Agent "${name}" already exists at ${dir}`;
  if (json) {
    contractError(activeCommandName(), 'agent_exists', message, { name, dir: resolve(dir) });
  }
  console.error(message);
  process.exit(1);
}

function scaffoldAgentDir(dir, name, json) {
  try {
    mkdirSync(dir, { recursive: false });
    const today = scaffoldBootFiles(dir, name);
    writeAgentYaml(dir, name, today);
    writeAgentClaudeMd(dir, name);
    writeSkillsScaffold(dir, name);
    writeSettingsLocal(dir);
    writePluginSymlink(dir);
    writeOwnershipMarker(dir, name);
    renderAcademySystemPrompt(dir, name);
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    if (json) throw error;
    console.error(`Error: failed to create agent "${name}": ${error.message}`);
    process.exit(1);
  }
}

// A host with no scheduler binary used to exit from inside the resolver, which
// skipped the rollback, the event, and the envelope, and left an orphan agent
// that no client could see and no retry could replace.
function failNightlyRegistration(name, nightlyTask, json) {
  const message = `failed to register nightly consolidation job for "${name}": ${nightlyTask.reason}`;
  if (json) contractError(activeCommandName(), 'runtime_unavailable', message, { name });
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Reached only after the scaffold is rolled back, so the envelope reports a
// create that left nothing behind.
function failLifecyclePublish(name, error, json) {
  const message = `failed to publish lifecycle event for "${name}": ${error.message}`;
  if (json) {
    if (error instanceof LockTimeoutError || error instanceof LogCorruptError) {
      contractError(activeCommandName(), error.code, message, error.fields);
    }
    throw error;
  }
  console.error(`Error: ${message}`);
  process.exit(1);
}

function reportCreated(name, dir, nightlyTask, json) {
  if (json) {
    contractOk('create', {
      created: true,
      ...agentRecord(name),
      scheduledJobId: nightlyTask.registered ? nightlyTask.id : null,
    });
    return;
  }

  console.log(`Created agent "${name}" at ${dir}`);
  if (nightlyTask.registered) {
    console.log(
      `Registered nightly consolidation job "${nightlyTask.id}" (${NIGHTLY_JOB_CRON} ${nightlyTask.timezone}).`,
    );
  } else {
    console.log(`Nightly consolidation job not registered: ${nightlyTask.reason}`);
  }
  console.log('');
  console.log('Next:');
  console.log(`  ${CLI_NAME} hire           # interactive hire flow to populate the 8 surfaces`);
  console.log(`  ${CLI_NAME} run ${name}    # launch Claude Code in the agent's home`);
}

function localTimezone() {
  return (
    process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  );
}

// The job is registered once and then runs unattended for months, so it carries
// no runtime: a token here would be a snapshot of the scalar as it stood on
// registration day, and the child run would rewrite every later operator edit
// back to it. `nightly` reads the persisted scalar instead.
export function registerNightlyConsolidationTask(dir, name) {
  const id = `${name}-nightly-consolidation`;
  if (process.env.ACADEMY_SKIP_NIGHTLY_TASK === '1') {
    return {
      id,
      registered: false,
      skipped: true,
      reason: 'skipped by ACADEMY_SKIP_NIGHTLY_TASK=1',
    };
  }

  const timezone = localTimezone();
  const runArgs = ['nightly', name];
  let academyBin;
  let helmTasksBin;
  try {
    academyBin = resolveExecutable('ACADEMY_BIN', join(ACADEMY_ROOT, 'bin', 'academy'), MUST_EXIST);
    helmTasksBin = resolveExecutable('ACADEMY_HELM_TASKS_BIN', 'helm-tasks', MUST_EXIST);
  } catch (error) {
    if (!(error instanceof RuntimeUnavailableError)) throw error;
    return { id, registered: false, reason: error.message };
  }

  const args = [
    'schedule',
    '--cwd',
    dir,
    '--id',
    id,
    '--cron',
    NIGHTLY_JOB_CRON,
    '--timezone',
    timezone,
    '--condition-file-exists',
    pendingMarkerPath(dir),
    '--command',
    academyBin,
    '--env-json',
    JSON.stringify({ AGENTS_ROOT: resolve(AGENTS_ROOT) }),
    '--replace',
    '--tags',
    'academy,nightly,consolidation',
    '--timeout-sec',
    '3600',
    '--',
    ...runArgs,
  ];

  const result = spawnSync(helmTasksBin, args, {
    cwd: dir,
    encoding: 'utf8',
    env: process.env,
  });

  if (result.error) return { id, registered: false, reason: result.error.message };
  if (result.status !== 0) {
    const reason = helmFailureReason(result.stderr || result.stdout, result.status);
    return { id, registered: false, reason };
  }
  return { id, registered: true, timezone };
}

export function helmFailureReason(output, status) {
  const fallback = `helm-tasks exited ${status}`;
  const text = output?.trim();
  if (!text) return fallback;
  try {
    const parsed = JSON.parse(text);
    const message = parsed.errors?.[0]?.message || parsed.data?.activation?.health?.reason;
    if (message) return message;
  } catch {
    // Fall through to text truncation for non-JSON helm output.
  }
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}

// ─────────────────────────────────────────────────────────────────────────────
// `hire` — launch Claude Code with the hire skill loaded
// ─────────────────────────────────────────────────────────────────────────────
