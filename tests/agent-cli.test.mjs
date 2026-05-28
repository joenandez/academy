import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = realpathSync(new URL('..', import.meta.url));
const cli = join(repoRoot, 'bin', 'academy');
const node = process.execPath;

function runCli(args, options = {}) {
  return execFileSync(node, [cli, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...options.env,
    },
    cwd: options.cwd ?? repoRoot,
  });
}

test('run launches from the project cwd with a project-local plugin dir', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  const projectDir = join(root, 'project');
  mkdirSync(projectDir);
  const resolvedProjectDir = realpathSync(projectDir);

  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });

  const output = runCli(['run', 'kai', '--', '-p', 'smoke'], {
    cwd: projectDir,
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_DRY_RUN: '1' },
  });

  const pluginDir = join(resolvedProjectDir, '.academy', 'agents', 'kai');
  const agentDir = join(agentsRoot, 'kai');
  assert.match(output, new RegExp(`--plugin-dir ${pluginDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`\\[dry-run\\] cwd=${resolvedProjectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`ACADEMY_AGENT_DIR=${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`ACADEMY_PROJECT_DIR=${resolvedProjectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('create scaffolds universal skills with agent-specific paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });

  const agentDir = join(agentsRoot, 'kai');
  const selfUpdatePath = join(agentDir, '.claude', 'skills', 'self-update', 'SKILL.md');
  const checkInPath = join(agentDir, '.claude', 'skills', 'check-in', 'SKILL.md');
  const selfUpdateText = readFileSync(selfUpdatePath, 'utf8');
  const checkInText = readFileSync(checkInPath, 'utf8');

  assert.match(selfUpdateText, /^name: self-update/m);
  assert.match(selfUpdateText, new RegExp(`Agent home: \`${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.match(selfUpdateText, new RegExp(`identity\\.md\`: \`${join(agentDir, 'identity.md').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.match(selfUpdateText, new RegExp(`\\.claude/skills\`: \`${join(agentDir, '.claude', 'skills').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(selfUpdateText, /\{\{[a-z_]+\}\}/);

  assert.match(checkInText, /^name: check-in/m);
  assert.match(checkInText, /Check-in is kai's 1:1 protocol/);
  assert.match(checkInText, new RegExp(`Agent home: \`${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.match(checkInText, new RegExp(`Self-update skill: \`${selfUpdatePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(checkInText, /\{\{[a-z_]+\}\}/);
});

test('run backfills universal skills for existing v3 agents', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  const agentDir = join(agentsRoot, 'kai');
  const projectDir = join(root, 'project');
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectDir);

  runCli(['run', 'kai', '--', '-p', 'smoke'], {
    cwd: projectDir,
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_DRY_RUN: '1' },
  });

  const selfUpdatePath = join(agentDir, '.claude', 'skills', 'self-update', 'SKILL.md');
  const checkInPath = join(agentDir, '.claude', 'skills', 'check-in', 'SKILL.md');
  const selfUpdateText = readFileSync(selfUpdatePath, 'utf8');
  const checkInText = readFileSync(checkInPath, 'utf8');

  assert.match(selfUpdateText, /^name: self-update/m);
  assert.match(selfUpdateText, new RegExp(`Agent home: \`${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(selfUpdateText, /\{\{[a-z_]+\}\}/);

  assert.match(checkInText, /^name: check-in/m);
  assert.match(checkInText, /Check-in is kai's 1:1 protocol/);
  assert.doesNotMatch(checkInText, /\{\{[a-z_]+\}\}/);
});

test('run inside the agent home stays in agent-home mode', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });

  const agentDir = join(agentsRoot, 'kai');
  const output = runCli(['run', 'kai', '--', '-p', 'smoke'], {
    cwd: agentDir,
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_DRY_RUN: '1' },
  });

  assert.doesNotMatch(output, /--plugin-dir/);
  assert.match(output, new RegExp(`\\[dry-run\\] cwd=${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('run delegates legacy agents to their recorded academy root', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  const legacyRoot = join(root, 'legacy-academy');
  const legacyScripts = join(legacyRoot, 'scripts');
  const agentDir = join(agentsRoot, 'legacy');
  const projectDir = join(root, 'project');
  mkdirSync(legacyScripts, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(projectDir);

  writeFileSync(join(agentDir, '.academy_root'), `${legacyRoot}\n`);
  writeFileSync(join(legacyScripts, 'agent.mjs'), `
    console.log('legacy argv=' + JSON.stringify(process.argv.slice(2)));
    console.log('legacy cwd=' + process.cwd());
  `);

  const output = runCli(['run', 'legacy', '--', '-p', 'smoke'], {
    cwd: projectDir,
    env: { AGENTS_ROOT: agentsRoot },
  });

  assert.match(output, /legacy argv=\["run","legacy","--","-p","smoke"\]/);
  assert.match(output, new RegExp(`legacy cwd=${realpathSync(projectDir).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});
