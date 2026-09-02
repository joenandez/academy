// Academy client conformance suite — test harness.
//
// This suite is for authors of clients that drive Academy. It treats Academy as
// a black box: it never imports Academy source, and every assertion is made
// against the response envelope a client actually parses.
//
// Point it at any Academy build with ACADEMY_BIN. Unset, it drives the
// `bin/academy` beside this directory.
//
//   ACADEMY_BIN=/usr/local/bin/academy node --test conformance/*.test.mjs
//
// SAFETY: every host below is built from an empty environment. HOME and
// AGENTS_ROOT are fresh temporary directories, so the suite can drive the whole
// lifecycle — including delete, archive, rename and migrate — with no way to
// reach the agents on the machine running it. Nothing is inherited: an
// AGENTS_ROOT or HOME already exported into your shell is not passed to the
// binary under test.

import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The build under test. */
const ACADEMY_BIN = process.env.ACADEMY_BIN
  ? resolve(process.env.ACADEMY_BIN)
  : fileURLToPath(new URL('../bin/academy', import.meta.url));

/** The contract version this suite was written against. */
const CONTRACT_VERSION = 1;

// Academy registers each agent's nightly consolidation job through a scheduler
// it resolves from PATH as `helm-tasks`, and it launches Claude Code as
// `claude`. Neither is part of the published response contract, and a client
// author must not need either installed to check conformance, so each host gets
// its own stubs. The scheduler stub is also how the suite reaches the two
// unschedule failure codes, which no other input can produce.
const SCHEDULER_STUBS = {
  ok: '#!/bin/sh\nexit 0\n',
  unscheduleFails: schedulerStub(false),
  unscheduleFailsAndRefillsTheSlot: schedulerStub(true),
};

function schedulerStub(refillSlot) {
  return [
    '#!/bin/sh',
    'action="$1"',
    'dir=""',
    'while [ "$#" -gt 0 ]; do',
    '  case "$1" in --cwd) dir="$2" ;; esac',
    '  shift',
    'done',
    'if [ "$action" = "delete" ]; then',
    refillSlot ? '  mkdir -p "$dir"' : '  :',
    '  exit 3',
    'fi',
    'exit 0',
  ].join('\n');
}

const RUNTIME_STUB = '#!/bin/sh\nexit 0\n';

function writeExecutable(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

/**
 * A throwaway Academy installation target: its own HOME, its own AGENTS_ROOT,
 * its own PATH. `scheduler: 'missing'` installs no scheduler stub, which is how
 * a host without the scheduler binary is reached.
 */
export function createHost({ scheduler = 'ok' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'academy-conformance-'));
  const host = {
    root,
    home: join(root, 'home'),
    agentsRoot: join(root, 'agents'),
    binDir: join(root, 'bin'),
    outside: join(root, 'outside'),
    eventLog: join(root, 'events.jsonl'),
  };
  for (const dir of [host.home, host.binDir, host.outside]) mkdirSync(dir, { recursive: true });
  writeExecutable(join(host.binDir, 'claude'), RUNTIME_STUB);
  if (scheduler !== 'missing') {
    writeExecutable(join(host.binDir, 'helm-tasks'), SCHEDULER_STUBS[scheduler]);
  }
  host.env = hostEnv(host);
  return host;
}

// Built from nothing, not from process.env. PATH carries the stub directory,
// the running node (Academy's launcher is `#!/usr/bin/env node`), and the system
// directories that hold `git`, which `doctor` uses to describe a checkout.
function hostEnv(host) {
  return {
    HOME: host.home,
    AGENTS_ROOT: host.agentsRoot,
    PATH: [host.binDir, dirname(process.execPath), '/usr/bin', '/bin'].join(':'),
  };
}

/** Run the binary under test. Returns the raw result a shell would see. */
export function academy(host, args, env = {}) {
  const result = spawnSync(ACADEMY_BIN, args, {
    cwd: host.root,
    encoding: 'utf8',
    env: { ...host.env, ...env },
  });
  if (result.error) throw result.error;
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

// ─────────────────────────────────────────────────────────────────────────────
// The envelope
//
//   success   stdout, exit 0   { contract_version, ok: true,  command, ...payload }
//   failure   stderr, exit 1   { contract_version, ok: false, command,
//                                error: { code, message, ...context } }
//
// Exit status is 0 if and only if `ok` is true. `doctor` is the one command
// whose failure envelope also carries its payload.
// ─────────────────────────────────────────────────────────────────────────────

function parseEnvelope(text, where, result) {
  if (text.trim() === '') {
    throw new Error(`expected a JSON envelope on ${where}, got nothing.\n${describe(result)}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`expected a JSON envelope on ${where}: ${error.message}\n${describe(result)}`);
  }
}

function describe(result) {
  return `  exit   ${result.status}\n  stdout ${result.stdout.trim()}\n  stderr ${result.stderr.trim()}`;
}

function assertEqual(actual, expected, what, result) {
  if (actual === expected) return;
  throw new Error(
    `expected ${what} to be ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}\n${describe(result)}`,
  );
}

/** Assert a success envelope on stdout with exit 0, and return its payload. */
export function assertSuccess(result, command) {
  assertEqual(result.status, 0, `exit status of "${command}"`, result);
  const envelope = parseEnvelope(result.stdout, 'stdout', result);
  assertEqual(envelope.contract_version, CONTRACT_VERSION, 'contract_version', result);
  assertEqual(envelope.ok, true, 'ok', result);
  assertEqual(envelope.command, command, 'command', result);
  return envelope;
}

/** Assert a failure envelope on stderr with a non-zero exit, and return it. */
export function assertFailure(result, command, code) {
  if (result.status === 0) {
    throw new Error(`expected "${command}" to exit non-zero\n${describe(result)}`);
  }
  const envelope = parseEnvelope(result.stderr, 'stderr', result);
  assertEqual(envelope.contract_version, CONTRACT_VERSION, 'contract_version', result);
  assertEqual(envelope.ok, false, 'ok', result);
  assertEqual(envelope.command, command, 'command', result);
  if (code !== undefined)
    assertEqual(envelope.error?.code, code, `error code of "${command}"`, result);
  return envelope;
}

/** The command list `doctor` publishes — the discovery answer clients build on. */
export function publishedCommands(host) {
  return assertSuccess(academy(host, ['doctor', '--json']), 'doctor').commands;
}

/** Scaffold an agent through the binary under test, and fail loudly if it cannot. */
export function hireAgent(host, name) {
  return assertSuccess(academy(host, ['create', name, '--json']), 'create');
}
