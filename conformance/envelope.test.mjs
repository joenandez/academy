// The envelope, swept across every published command.
//
//   success   stdout, exit 0   { contract_version, ok: true,  command, ...payload }
//   failure   stderr, exit 1   { contract_version, ok: false, command, error }
//
// Exit status is 0 if and only if `ok` is true. The table is checked against
// the command list `doctor` publishes, so a build that publishes a command this
// suite has no case for fails here rather than going unchecked.

import assert from 'node:assert/strict';
import { symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  academy,
  assertFailure,
  assertSuccess,
  createHost,
  hireAgent,
  publishedCommands,
} from './harness.mjs';

function agentHost() {
  const host = createHost();
  hireAgent(host, 'kai');
  return host;
}

function archivedHost() {
  const host = agentHost();
  assertSuccess(academy(host, ['archive', 'kai', '--json']), 'archive');
  return host;
}

// An agents root that resolves outside itself — the one state that fails every
// command reading the root, and so the failure case for the two that address no
// agent and reject no option.
function escapedHost() {
  const host = createHost();
  symlinkSync(host.outside, host.agentsRoot);
  return host;
}

function specHost() {
  const host = createHost();
  const body = { name: 'kai', role: 'conformance subject', objective: 'exist' };
  writeFileSync(join(host.root, 'spec.json'), JSON.stringify(body));
  return host;
}

// `hire` without --spec execs into an interactive session with inherited stdio
// and can never print an envelope, so the headless form is the one under test.
const SPEC = (host) => join(host.root, 'spec.json');

const CASES = {
  doctor: [createHost, () => ['doctor'], escapedHost, () => ['doctor'], 'unsafe_agent_path'],
  list: [createHost, () => ['list'], escapedHost, () => ['list'], 'unsafe_agent_path'],
  inspect: [
    agentHost,
    () => ['inspect', 'kai'],
    createHost,
    () => ['inspect', 'ghost'],
    'agent_not_found',
  ],
  tokens: [
    agentHost,
    () => ['tokens', 'kai'],
    createHost,
    () => ['tokens', 'ghost'],
    'agent_not_found',
  ],
  budget: [
    agentHost,
    () => ['budget', 'kai'],
    createHost,
    () => ['budget', 'ghost'],
    'agent_not_found',
  ],
  sessions: [
    createHost,
    () => ['sessions'],
    createHost,
    () => ['sessions', '--nope'],
    'invalid_spec',
  ],
  events: [
    createHost,
    () => ['events', '--since', '0'],
    createHost,
    () => ['events', '--since', '99999'],
    'replay_unavailable',
  ],
  create: [createHost, () => ['create', 'kai'], agentHost, () => ['create', 'kai'], 'agent_exists'],
  hire: [
    specHost,
    (h) => ['hire', '--spec', SPEC(h)],
    createHost,
    (h) => ['hire', '--spec', SPEC(h)],
    'invalid_spec',
  ],
  rename: [
    agentHost,
    () => ['rename', 'kai', 'nova'],
    createHost,
    () => ['rename', 'ghost', 'nova'],
    'agent_not_found',
  ],
  archive: [
    agentHost,
    () => ['archive', 'kai'],
    createHost,
    () => ['archive', 'ghost'],
    'agent_not_found',
  ],
  unarchive: [
    archivedHost,
    () => ['unarchive', 'kai'],
    createHost,
    () => ['unarchive', 'ghost'],
    'agent_not_found',
  ],
  delete: [
    agentHost,
    () => ['delete', 'kai'],
    createHost,
    () => ['delete', 'ghost'],
    'agent_not_found',
  ],
  migrate: [createHost, () => ['migrate'], createHost, () => ['migrate', '--nope'], 'invalid_spec'],
};

test('every published command has a success case and a failure case', () => {
  const published = publishedCommands(createHost());

  assert.deepEqual([...published].sort(), Object.keys(CASES).sort());
});

for (const [command, [okHost, okArgs, failHost, failArgs, code]] of Object.entries(CASES)) {
  test(`${command} answers success in the envelope with exit 0`, () => {
    const host = okHost();

    const result = academy(host, [...okArgs(host), '--json']);

    assertSuccess(result, command);
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
  });

  test(`${command} answers failure in the envelope with a non-zero exit`, () => {
    const host = failHost();

    const result = academy(host, [...failArgs(host), '--json']);

    assertFailure(result, command, code);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
  });
}

// The one success that carries a false flag in its payload. The exit rule
// follows `ok`, never the payload, so a client must not read a budget breach as
// a failed command.
test('a payload reporting a breach is still ok:true and exit 0', () => {
  const host = agentHost();
  writeFileSync(join(host.agentsRoot, 'kai', 'knowledge.md'), 'over the cap. '.repeat(4000));

  const result = academy(host, ['budget', 'kai', '--json']);

  const payload = assertSuccess(result, 'budget');
  assert.equal(result.status, 0);
  assert.equal(payload.withinBudget, false);
});

// The health channel is not the error channel: a degraded component is reported
// beside an ok:true answer, and the exit rule still follows `ok`.
test('doctor reporting health errors is still ok:true and exit 0', () => {
  const host = agentHost();
  writeFileSync(join(host.agentsRoot, 'kai', 'agent.yaml'), 'name: kai\nruntime: mainframe\n');

  const result = academy(host, ['doctor', '--json']);

  const payload = assertSuccess(result, 'doctor');
  assert.equal(result.status, 0);
  assert.deepEqual(payload.errors, [{ code: 'invalid_runtime_agents', count: 1 }]);
});
