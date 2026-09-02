// Identity containment — an agent Academy addresses is an agent inside its own
// agents root, and nothing a caller supplies can move that boundary.
//
// The table below is the *agent-addressed* published commands: the ones that
// name an agent. `doctor`, `list`, `sessions`, `events` and `migrate` are
// published too, but they name no agent, so this vector cannot reach them and a
// row for them could never pass.

import assert from 'node:assert/strict';
import { cpSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { academy, assertFailure, assertSuccess, createHost, hireAgent } from './harness.mjs';

const UNSAFE = 'unsafe_agent_path';

// Every published command that addresses an agent, with an invocation that
// reaches its agent-resolution step.
const AGENT_ADDRESSED = [
  { command: 'inspect', args: () => ['inspect', 'kai'] },
  { command: 'tokens', args: () => ['tokens', 'kai'] },
  { command: 'budget', args: () => ['budget', 'kai'] },
  { command: 'create', args: () => ['create', 'kai'] },
  { command: 'hire', args: (host) => ['hire', '--spec', join(host.root, 'kai.json')] },
  { command: 'rename', args: () => ['rename', 'kai', 'nova'] },
  { command: 'archive', args: () => ['archive', 'kai'] },
  { command: 'unarchive', args: () => ['unarchive', 'kai'] },
  { command: 'delete', args: () => ['delete', 'kai'] },
];

// The commands that address an agent by the slot it occupies, so a slot
// resolving outside the root reaches every one of them. They are asked a second
// time against that vector, in two groups, because the two owe different
// evidence: a move must not carry the root off, and a read must not publish
// what it found outside. `create` and `hire` answer `agent_exists` for an
// occupied slot and `unarchive` answers `agent_not_found` for an empty holding
// area, so neither reaches the containment question by this route.
const RELOCATING = ['rename', 'archive', 'delete'];
const READING = ['inspect', 'tokens', 'budget'];

function writeSpec(host) {
  const spec = { name: 'kai', role: 'conformance subject', objective: 'exist' };
  writeFileSync(join(host.root, 'kai.json'), JSON.stringify(spec));
}

// A root that is a symlink to a directory beside it, plus an ACADEMY_AGENT_DIR
// naming that same out-of-root directory. Both vectors at once, so a command
// that honoured either one would land outside the root.
function escapedRoot(host) {
  const escaped = join(host.root, 'escaped-root');
  symlinkSync(host.outside, escaped);
  return { AGENTS_ROOT: escaped, ACADEMY_AGENT_DIR: host.outside };
}

test('every agent-addressed command refuses an out-of-root root and agent directory', () => {
  const host = createHost();
  writeSpec(host);
  hireAgent(host, 'kai');
  const escaped = escapedRoot(host);

  for (const { command, args } of AGENT_ADDRESSED) {
    const result = academy(host, [...args(host), '--json'], escaped);
    assertFailure(result, command, UNSAFE);
  }

  // The invariant, not the absence of one bug: after every refusal above,
  // nothing was written outside the root and the agent is still addressable
  // inside it.
  assert.deepEqual(readdirSync(host.outside), []);
  assertSuccess(academy(host, ['inspect', 'kai', '--json']), 'inspect');
});

test('a refusal never leaves the agents root half-moved', () => {
  const host = createHost();
  writeSpec(host);
  hireAgent(host, 'kai');
  const escaped = escapedRoot(host);
  const before = readdirSync(host.agentsRoot).sort();

  for (const { args } of AGENT_ADDRESSED) academy(host, [...args(host), '--json'], escaped);

  assert.deepEqual(readdirSync(host.agentsRoot).sort(), before);
  assert.deepEqual(readdirSync(host.outside), []);
});

// An agent directory carried out of the root, with its slot left behind as a
// symlink to it. Every command that resolves an agent by name lands on it.
function escapedSlot(host) {
  const carried = join(host.outside, 'kai');
  cpSync(join(host.agentsRoot, 'kai'), carried, { recursive: true });
  rmSync(join(host.agentsRoot, 'kai'), { recursive: true });
  symlinkSync(carried, join(host.agentsRoot, 'kai'));
  return carried;
}

test('a command that moves an agent refuses a slot resolving outside the root', () => {
  const host = createHost();
  hireAgent(host, 'kai');
  escapedSlot(host);
  writeFileSync(join(host.outside, 'witness'), 'untouched\n');

  for (const command of RELOCATING) {
    const args = command === 'rename' ? [command, 'kai', 'zed'] : [command, 'kai'];
    assertFailure(academy(host, [...args, '--json']), command, UNSAFE);
  }

  assert.deepEqual(readdirSync(host.outside).sort(), ['kai', 'witness']);
});

// The same vector against the commands that only read. They write nothing, so
// the invariant they owe is the other one: an answer about an agent is evidence
// that the agent lives where Academy says it does. A success here would report
// content from outside the root under a `dir` field claiming to be inside it,
// which is why the refusal — not the payload — is what a client can trust.
test('a command that reads an agent refuses a slot resolving outside the root', () => {
  const host = createHost();
  hireAgent(host, 'kai');
  const carried = escapedSlot(host);
  writeFileSync(join(carried, 'role.md'), 'read from outside the agents root\n');

  for (const command of READING) {
    const envelope = assertFailure(academy(host, [command, 'kai', '--json']), command, UNSAFE);
    assert.equal(envelope.dir, undefined, `${command} must publish no dir it did not resolve`);
  }
});
