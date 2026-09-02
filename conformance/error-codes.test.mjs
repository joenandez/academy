// The published error codes, closed at contract_version 1.
//
// Fifteen codes, one invocation each. A client may switch on `error.code`, so
// each row proves the code string a build actually emits and that the exit
// status is non-zero. A build that answers a different code, or answers the
// right code with exit 0, is not conforming.

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { academy, assertFailure, createHost, hireAgent } from './harness.mjs';

const PUBLISHED_ERROR_CODES = [
  'agent_not_found',
  'unsafe_agent_path',
  'not_academy_owned',
  'invalid_name',
  'agent_exists',
  'agent_archived',
  'replay_unavailable',
  'log_corrupt',
  'invalid_runtime',
  'invalid_spec',
  'runtime_unavailable',
  'lock_timeout',
  'internal_error',
  'unschedule_failed',
  'unschedule_failed_restore_blocked',
];

function marker(host, name) {
  return join(host.agentsRoot, name, '.academy-agent.json');
}

function spec(host, body) {
  const path = join(host.root, 'spec.json');
  writeFileSync(path, typeof body === 'string' ? body : JSON.stringify(body));
  return path;
}

// One row per code: a host, an invocation, and the command that answers it.
// Each returns { command, args } and may prepare the host first.
const INVOCATIONS = {
  agent_not_found: () => ({ command: 'inspect', args: ['inspect', 'ghost'] }),
  invalid_name: () => ({ command: 'inspect', args: ['inspect', 'Not A Name'] }),
  agent_exists: (host) => {
    hireAgent(host, 'kai');
    return { command: 'create', args: ['create', 'kai'] };
  },
  agent_archived: (host) => {
    hireAgent(host, 'kai');
    academy(host, ['archive', 'kai', '--json']);
    return { command: 'inspect', args: ['inspect', 'kai'] };
  },
  unsafe_agent_path: (host) => {
    symlinkSync(host.outside, host.agentsRoot);
    return { command: 'list', args: ['list'] };
  },
  not_academy_owned: (host) => {
    hireAgent(host, 'kai');
    rmSync(marker(host, 'kai'));
    return { command: 'rename', args: ['rename', 'kai', 'nova'] };
  },
  invalid_runtime: (host) => {
    hireAgent(host, 'kai');
    writeFileSync(join(host.agentsRoot, 'kai', 'agent.yaml'), 'name: kai\nruntime: mainframe\n');
    return { command: 'inspect', args: ['inspect', 'kai'] };
  },
  invalid_spec: (host) => ({ command: 'hire', args: ['hire', '--spec', spec(host, '{ not json')] }),
  replay_unavailable: () => ({ command: 'events', args: ['events', '--since', '999999'] }),
  log_corrupt: (host) => {
    writeFileSync(host.eventLog, 'this line is not a record\n');
    return { command: 'create', args: ['create', 'kai'] };
  },
  runtime_unavailable: () => ({ command: 'create', args: ['create', 'kai'] }),
  lock_timeout: (host) => {
    hireAgent(host, 'kai');
    mkdirSync(join(host.agentsRoot, '.kai.lifecycle.lock'));
    return { command: 'delete', args: ['delete', 'kai'] };
  },
  internal_error: (host) => {
    hireAgent(host, 'kai');
    rmSync(join(host.agentsRoot, 'kai', 'notes.md'));
    mkdirSync(join(host.agentsRoot, 'kai', 'notes.md'));
    return { command: 'budget', args: ['budget', 'kai'] };
  },
  unschedule_failed: (host) => {
    hireAgent(host, 'kai');
    return { command: 'delete', args: ['delete', 'kai'] };
  },
  unschedule_failed_restore_blocked: (host) => {
    hireAgent(host, 'kai');
    return { command: 'delete', args: ['delete', 'kai'] };
  },
};

// The host each code needs. `runtime_unavailable` needs a PATH with no
// scheduler; the two unschedule codes need a scheduler that fails to remove a
// job, and the second needs one that refills the slot while it fails.
const HOSTS = {
  runtime_unavailable: { scheduler: 'missing' },
  unschedule_failed: { scheduler: 'unscheduleFails' },
  unschedule_failed_restore_blocked: { scheduler: 'unscheduleFailsAndRefillsTheSlot' },
};

test('the published error-code table is closed at fifteen codes', () => {
  assert.deepEqual(Object.keys(INVOCATIONS).sort(), [...PUBLISHED_ERROR_CODES].sort());
  assert.equal(PUBLISHED_ERROR_CODES.length, 15);
});

for (const code of PUBLISHED_ERROR_CODES) {
  test(`${code} is reachable and answered in the envelope`, () => {
    const host = createHost(HOSTS[code]);
    const { command, args } = INVOCATIONS[code](host);

    const result = academy(host, [...args, '--json']);

    const envelope = assertFailure(result, command, code);
    assert.notEqual(result.status, 0);
    assert.equal(typeof envelope.error.message, 'string');
    assert.notEqual(envelope.error.message, '');
    assert.equal(result.stdout, '');
  });
}
