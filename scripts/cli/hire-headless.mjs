import { rmSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ACADEMY_ROOT,
  RuntimeUnavailableError,
  contractOk,
  exitJsonError,
  resolveExecutable,
  validateName,
} from './core.mjs';
import { MUST_EXIST, assertAgentNameFree, provisionAgent } from './create.mjs';
import { appendLifecycleEvent } from './eventlog.mjs';
import { HireSpecError, readHireSpec } from './hire-spec.mjs';
import { agentRecord } from './inspect.mjs';
import { deleteNightlyConsolidation } from './lifecycle.mjs';
import { writeAgentYamlScalar } from './yaml.mjs';

// `hire --spec <path> [--json]` — the headless form. The interactive form
// spawns with inherited stdio and exits on the child's status, so no envelope
// can ever print from it and the child's own streams would pollute the JSON a
// client parses. This path captures both child streams and forwards neither.
//
// The risk this phase carries is that a specification file drives a runtime
// holding an explicit non-interactive write permission. Every fault Academy can
// name is therefore answered before the runtime is resolved or spawned: the
// file is proved acceptable, the name is proved free, and only then does a
// child exist. Creation and nightly registration stay outside the child
// entirely, so the runtime never decides what an Academy agent is.

/**
 * How long the runtime gets before it is killed. A `-p` turn that writes eight
 * surfaces is minutes of work, and a client waiting on a synchronous command
 * cannot wait on a wedged child forever.
 */
const DEFAULT_TIMEOUT_MS = 600_000;

/** Enough captured output to report a failure, and a bound on a chatty child. */
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const REPORTED_OUTPUT_CHARS = 500;

function hireTimeoutMs() {
  const configured = Number.parseInt(process.env.ACADEMY_HIRE_TIMEOUT_MS ?? '', 10);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_TIMEOUT_MS;
}

function failHire(code, message, fields, json) {
  if (json) exitJsonError(code, message, fields);
  console.error(`Error: ${message}`);
  process.exit(1);
}

// Not a usage dump: the headless form publishes an envelope, so the option it
// does not know is answered inside it.
function assertKnownOptions(invalidOption, json) {
  if (!invalidOption) return;
  failHire(
    'invalid_spec',
    `Unknown hire option: ${invalidOption}. Use --spec <path> and --json.`,
    { option: invalidOption },
    json,
  );
}

function loadSpec(specPath, json) {
  try {
    return readHireSpec(specPath);
  } catch (error) {
    if (!(error instanceof HireSpecError)) throw error;
    failHire(error.code, error.message, error.fields, json);
  }
}

function resolveHireRuntime(json) {
  try {
    return resolveExecutable('ACADEMY_CLAUDE_BIN', 'claude', MUST_EXIST);
  } catch (error) {
    if (!(error instanceof RuntimeUnavailableError)) throw error;
    failHire(error.code, error.message, error.fields, json);
  }
}

// The specification's own fields, persisted before the child starts so the
// runtime reads its brief from the same agent.yaml every other command reads.
// Quoted through JSON.stringify: the free-text fields already refuse control
// characters, quotes and backslashes, so the quoted form round-trips exactly
// through the CLI's line-regex reader.
function writeSpecScalars(dir, spec) {
  writeAgentYamlScalar(dir, 'role', JSON.stringify(spec.role));
  writeAgentYamlScalar(dir, 'objective', JSON.stringify(spec.objective));
  if (spec.runtime) writeAgentYamlScalar(dir, 'runtime', spec.runtime);
}

// Not contract. The specification schema and the response envelope are the
// published surface; what Academy says to its own runtime is Academy's to
// change. `role` and `objective` are caller-supplied text and reach the model
// here, which is why they are capped and single-line and why the child is given
// no authority over creation, naming, scheduling or the event log.
function headlessHirePrompt({ name, role, objective }) {
  return [
    `Use the Academy hire skill to finish hiring the agent "${name}".`,
    'Its home is the current working directory and already holds the scaffolded',
    'boot surfaces, agent.yaml and ownership marker.',
    `Role: ${role}`,
    `Objective: ${objective}`,
    'Rewrite the eight surface files in place and stop. Do not create, rename,',
    'archive or delete any agent, and do not write outside this directory.',
    'There is no user to ask, so make your own best inference and proceed.',
  ].join('\n');
}

// `acceptEdits` rather than `bypassPermissions`: the child has to write eight
// markdown files in its own working directory and needs nothing beyond that.
// stdio is captured on both streams and stdin is closed, so a runtime that
// falls back to asking a question fails fast instead of holding the timeout.
function runHeadlessRuntime(claudeBin, dir, spec) {
  return spawnSync(
    claudeBin,
    [
      '-p',
      headlessHirePrompt(spec),
      '--permission-mode',
      'acceptEdits',
      '--plugin-dir',
      ACADEMY_ROOT,
    ],
    {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: hireTimeoutMs(),
      // SIGKILL, because a hire being rolled back has nothing left to clean up
      // and a runtime that ignores SIGTERM would hold the client open.
      killSignal: 'SIGKILL',
      maxBuffer: MAX_CAPTURE_BYTES,
    },
  );
}

// The success signal is the child's exit status. A sentinel in its output was
// rejected: it would make a prompt token load-bearing, and the hire skill's
// prompts are explicitly not contract.
function runtimeFault(result, claudeBin) {
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal !== null;
  if (timedOut) {
    return {
      message: `runtime ${claudeBin} did not finish within ${hireTimeoutMs()}ms`,
      fields: { executable: claudeBin, status: null, timedOut: true },
    };
  }
  if (result.error) {
    return {
      message: `failed to start runtime ${claudeBin}: ${result.error.message}`,
      fields: { executable: claudeBin, status: null, timedOut: false },
    };
  }
  if (result.status === 0) return null;
  return {
    message: `runtime ${claudeBin} exited ${result.status}: ${excerpt(result.stderr || result.stdout)}`,
    fields: { executable: claudeBin, status: result.status, timedOut: false },
  };
}

function excerpt(output) {
  const text = (output ?? '').trim();
  if (text === '') return '(no output)';
  return text.length > REPORTED_OUTPUT_CHARS
    ? `${text.slice(0, REPORTED_OUTPUT_CHARS - 3)}...`
    : text;
}

// A hire that did not finish is not a hire. The envelope says ok:false, so the
// disk must agree: the nightly job is unscheduled and the directory removed,
// and the append-only log gets a compensating agent_deleted rather than losing
// the agent_created that was already published. Leaving the half-hired agent
// would register nightly consolidation for a specialist nobody hired and would
// block every retry of the same name behind a manual delete.
function rollbackHire(name, dir, nightlyTask) {
  let dirReal = resolve(dir);
  try {
    dirReal = realpathSync(dir);
  } catch {
    /* already gone; the unschedule still names the canonical path */
  }
  if (nightlyTask.registered) deleteNightlyConsolidation(name, dirReal);
  rmSync(dir, { recursive: true, force: true });
  try {
    appendLifecycleEvent('agent_deleted', name, dir);
    return null;
  } catch (error) {
    // Reported inside the runtime fault rather than swallowed: a client
    // replaying the log has to know the compensating record is missing.
    return error.message;
  }
}

function failRuntime(name, dir, nightlyTask, fault, json) {
  const rollbackFault = rollbackHire(name, dir, nightlyTask);
  const fields = { name, ...fault.fields };
  if (rollbackFault) fields.rollbackFault = rollbackFault;
  failHire('runtime_unavailable', `hire of "${name}" failed: ${fault.message}`, fields, json);
}

function reportHired(name, dir, nightlyTask, json) {
  if (json) {
    contractOk('hire', {
      hired: true,
      ...agentRecord(name),
      scheduledJobId: nightlyTask.registered ? nightlyTask.id : null,
    });
    return;
  }
  console.log(`Hired agent "${name}" at ${dir}`);
}

export function hireFromSpec({ spec, json, invalidOption }) {
  assertKnownOptions(invalidOption, json);
  const parsed = loadSpec(spec, json);
  // The one field that reaches a path join, held to the rule every other
  // agent-addressed command applies.
  validateName(parsed.name);
  assertAgentNameFree(parsed.name, json);
  const claudeBin = resolveHireRuntime(json);
  const { dir, nightlyTask } = provisionAgent(parsed.name, json);
  writeSpecScalars(dir, parsed);
  const fault = runtimeFault(runHeadlessRuntime(claudeBin, dir, parsed), claudeBin);
  if (fault) failRuntime(parsed.name, dir, nightlyTask, fault, json);
  reportHired(parsed.name, dir, nightlyTask, json);
}
