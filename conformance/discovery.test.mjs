// Discovery — what a client learns before it renders anything.
//
// `doctor --json` is the one call a client may make against an Academy it knows
// nothing about. Everything else in this suite is driven from what it answers.

import assert from 'node:assert/strict';
import { existsSync, rmSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';
import { academy, assertFailure, assertSuccess, createHost, hireAgent } from './harness.mjs';

// The frozen answer at contract_version 1, in order. A client may key on the
// order, so this is asserted by equality rather than by membership.
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

// Commands an Academy build may implement but must not publish. A client that
// found one here would build on a surface with no contract behind it.
const UNPUBLISHED_COMMANDS = ['notes', 'nightly', 'clean', 'root', 'run', 'destroy'];

// The payload keys, in order, after the three envelope keys.
const DOCTOR_PAYLOAD_KEYS = [
  'contracts',
  'version',
  'packageRoot',
  'agentsRoot',
  'eventLog',
  'commands',
  'runtimes',
  'errors',
];

// `errors[]` is a health channel, not the error channel: it names a degraded
// part of an install and how much of it there is. None of the fifteen failure
// codes may appear here.
const HEALTH_CODES = ['unowned_agents', 'invalid_runtime_agents', 'unattributable_sessions'];

test('doctor publishes the whole command set, in order', () => {
  const host = createHost();

  const payload = assertSuccess(academy(host, ['doctor', '--json']), 'doctor');

  assert.deepEqual(payload.commands, PUBLISHED_COMMANDS);
  for (const command of UNPUBLISHED_COMMANDS) {
    assert.equal(payload.commands.includes(command), false, `${command} must not be published`);
  }
});

test('doctor answers with exactly the published payload keys', () => {
  const host = createHost();

  const payload = assertSuccess(academy(host, ['doctor', '--json']), 'doctor');

  assert.deepEqual(Object.keys(payload), [
    'contract_version',
    'ok',
    'command',
    ...DOCTOR_PAYLOAD_KEYS,
  ]);
  assert.deepEqual(payload.contracts, [1]);
  assert.equal(typeof payload.packageRoot, 'string');
  assert.equal(typeof payload.agentsRoot, 'string');
  assert.equal(typeof payload.eventLog, 'string');
  assert.deepEqual(Object.keys(payload.runtimes).sort(), ['claude_code', 'codex']);
  for (const runtime of Object.values(payload.runtimes)) {
    assert.equal(typeof runtime.available, 'boolean');
  }
});

// Two builds with different capabilities must never report the same version. A
// checkout names its own commit as semver build metadata; an install has no
// checkout to name and reports the published version bare.
test('doctor reports build metadata only for a checkout', () => {
  const host = createHost();

  const payload = assertSuccess(academy(host, ['doctor', '--json']), 'doctor');

  assert.equal(typeof payload.version, 'string');
  assert.notEqual(payload.version, '');
  if (describesItsOwnCheckout(host, payload.packageRoot)) {
    assert.match(payload.version, /^[^+]+\+[0-9A-Za-z-]+$/);
  } else {
    assert.equal(payload.version.includes('+'), false);
  }
});

function describesItsOwnCheckout(host, packageRoot) {
  if (!existsSync(join(packageRoot, '.git'))) return false;
  return spawnSync('git', ['--version'], { env: host.env, encoding: 'utf8' }).status === 0;
}

// A degraded component is not a failure. A client calls doctor before it renders
// anything, so an install with repairable faults must still be usable.
test('a degraded install stays ok:true and exits 0', () => {
  const host = createHost();
  hireAgent(host, 'kai');
  rmSync(join(host.agentsRoot, 'kai', '.academy-agent.json'));

  const result = academy(host, ['doctor', '--json']);

  const payload = assertSuccess(result, 'doctor');
  assert.equal(result.status, 0);
  assert.deepEqual(payload.errors, [{ code: 'unowned_agents', count: 1 }]);
  for (const entry of payload.errors) assert.equal(HEALTH_CODES.includes(entry.code), true);
});

// The one state doctor answers with ok:false: every agent-addressed command
// would fail on this root, so a client told ok:true would render an interface
// whose first call fails. The payload still ships, beside the error.
test('doctor is ok:false only when the agents root fails its audit', () => {
  const host = createHost();
  symlinkSync(host.outside, host.agentsRoot);

  const result = academy(host, ['doctor', '--json']);

  const envelope = assertFailure(result, 'doctor', 'unsafe_agent_path');
  assert.deepEqual(Object.keys(envelope), [
    'contract_version',
    'ok',
    'command',
    ...DOCTOR_PAYLOAD_KEYS,
    'error',
  ]);
  assert.deepEqual(envelope.commands, PUBLISHED_COMMANDS);
});
