import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const repoRoot = realpathSync(new URL('..', import.meta.url));
const cli = join(repoRoot, 'bin', 'academy');
const node = process.execPath;
const surfaces = ['identity', 'role', 'knowledge', 'goals', 'priorities', 'threads', 'notes', 'dailys'];

function runCli(args, options = {}) {
  return execFileSync(node, [cli, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      ACADEMY_SKIP_NIGHTLY_TASK: '1',
      ...options.env,
    },
    cwd: options.cwd ?? repoRoot,
  });
}

// Run the CLI expecting a non-zero exit; return { status, stdout, stderr }.
function runCliExpectFail(args, options = {}) {
  try {
    execFileSync(node, [cli, ...args], {
      encoding: 'utf8',
      env: { ...process.env, ACADEMY_SKIP_NIGHTLY_TASK: '1', ...options.env },
      cwd: options.cwd ?? repoRoot,
    });
    throw new Error('expected CLI to exit non-zero, but it succeeded');
  } catch (err) {
    if (typeof err.status !== 'number') throw err;
    return { status: err.status, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
  }
}

const BULLET_RE = /^- \d{4}-\d{2}-\d{2} \d{2}:\d{2}: /;

test('notes add appends a bulleted note from an agent home', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  const agentDir = join(agentsRoot, 'kai');

  runCli(['notes', 'add', 'User prefers short status updates before file edits'], {
    cwd: agentDir,
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: agentDir, ACADEMY_AGENT_NAME: 'kai' },
  });

  const notes = readFileSync(join(agentDir, 'notes.md'), 'utf8');
  const bullets = notes.split('\n').filter((l) => BULLET_RE.test(l));
  assert.equal(bullets.length, 1);
  assert.match(bullets[0], /User prefers short status updates before file edits/);
});

test('notes add by explicit agent name targets only that agent', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  runCli(['create', 'bob'], { env: { AGENTS_ROOT: agentsRoot } });

  runCli(['notes', 'add', 'bob', 'A note for bob only'], {
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: '', ACADEMY_AGENT_NAME: '' },
  });

  const bobNotes = readFileSync(join(agentsRoot, 'bob', 'notes.md'), 'utf8');
  const kaiNotes = readFileSync(join(agentsRoot, 'kai', 'notes.md'), 'utf8');
  assert.match(bobNotes, /A note for bob only/);
  assert.doesNotMatch(kaiNotes, /A note for bob only/);
});

test('notes add resolves the agent from ACADEMY_AGENT_DIR', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  const agentDir = join(agentsRoot, 'kai');

  runCli(['notes', 'add', 'env dir resolution works'], {
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: agentDir, ACADEMY_AGENT_NAME: '' },
  });

  assert.match(readFileSync(join(agentDir, 'notes.md'), 'utf8'), /env dir resolution works/);
});

test('notes add resolves the agent from ACADEMY_AGENT_HOME', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  const agentDir = join(agentsRoot, 'kai');

  runCli(['notes', 'add', 'env home resolution works'], {
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: '', ACADEMY_AGENT_HOME: agentDir, ACADEMY_AGENT_NAME: '' },
  });

  assert.match(readFileSync(join(agentDir, 'notes.md'), 'utf8'), /env home resolution works/);
});

test('notes list defaults to the most recent 12 notes', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  const agentDir = join(agentsRoot, 'kai');
  const env = { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: agentDir };

  for (let i = 1; i <= 15; i++) {
    runCli(['notes', 'add', `note number ${i}`], { env });
  }

  const out = runCli(['notes', 'list'], { env });
  const listed = out.split('\n').filter((l) => BULLET_RE.test(l));
  assert.equal(listed.length, 12);
  assert.match(listed[listed.length - 1], /note number 15/);
  assert.doesNotMatch(out, /note number 3\b/);
});

test('notes list honors --last N', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  const agentDir = join(agentsRoot, 'kai');
  const env = { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: agentDir };

  for (let i = 1; i <= 6; i++) {
    runCli(['notes', 'add', `entry ${i}`], { env });
  }

  const out = runCli(['notes', 'list', '--last', '3'], { env });
  const listed = out.split('\n').filter((l) => BULLET_RE.test(l));
  assert.equal(listed.length, 3);
  assert.match(out, /entry 6/);
  assert.doesNotMatch(out, /entry 3\b/);
});

test('notes list on an agent with no notes file exits 0', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  const agentDir = join(agentsRoot, 'kai');
  mkdirSync(agentDir, { recursive: true }); // agent home exists, but no notes.md

  const out = runCli(['notes', 'list'], {
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: agentDir },
  });
  assert.doesNotMatch(out, BULLET_RE);
});

test('create surfaces the notes CLI: prompt header, permission, and self-update skill', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });
  const agentDir = join(agentsRoot, 'kai');

  const prompt = readFileSync(join(agentDir, '.claude', 'academy-system-prompt.md'), 'utf8');
  assert.match(prompt, /academy notes add/);

  const settings = JSON.parse(readFileSync(join(agentDir, '.claude', 'settings.local.json'), 'utf8'));
  assert.ok(settings.permissions.allow.includes('Bash(academy:*)'));

  const selfUpdate = readFileSync(join(agentDir, '.claude', 'skills', 'self-update', 'SKILL.md'), 'utf8');
  assert.match(selfUpdate, /academy notes add/);
  assert.match(selfUpdate, /academy notes list/);
});

test('notes add with no resolvable agent fails with a usage hint', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');

  const { status, stderr } = runCliExpectFail(['notes', 'add', 'orphan note'], {
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_AGENT_DIR: '', ACADEMY_AGENT_HOME: '', ACADEMY_AGENT_NAME: '' },
  });
  assert.notEqual(status, 0);
  assert.match(stderr, /academy notes/);
});

test('plugin manifest declares Academy and points at the v3 hook config', () => {
  const manifest = JSON.parse(readFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8'));

  assert.equal(manifest.name, 'academy');
  assert.match(manifest.description, /Academy v3/);
  assert.equal(manifest.version, '0.3.0-phase0');
  assert.equal(manifest.hooks, './hooks/hooks.json');
});

test('hire skill reports readiness without waiting for knowledge enrichment', () => {
  const skill = readFileSync(join(repoRoot, 'skills', 'hire', 'SKILL.md'), 'utf8');
  const summaryIndex = skill.indexOf('## Step 7 — Hiring memo + completion report');
  const enrichmentIndex = skill.indexOf('## Step 8 — Start background knowledge enrichment');

  const draftIndex = skill.indexOf('## Step 7 — Hiring memo + completion report draft');
  assert.equal(summaryIndex, draftIndex);
  assert.notEqual(draftIndex, -1);
  assert.notEqual(enrichmentIndex, -1);
  assert.ok(draftIndex < enrichmentIndex);
  assert.match(skill, /Do \*\*not\*\* run\s+research in Step 6/);
  assert.match(skill, /Prepare the completion report now, but present it after Step 8 schedules/);
  assert.match(skill, /Do not\s+wait for research to complete before saying the agent is ready/);
  assert.match(skill, /Starter knowledge written\. Background enrichment is underway/);
  assert.match(skill, /research phase has started[\s\S]*exact knowledge areas it will deepen/);
  assert.match(skill, /helm-tasks schedule[\s\S]*--id \{slug\}-knowledge-enrichment/);
});

test('hire skill is specialist-first and allows users to skip clarification', () => {
  const skill = readFileSync(join(repoRoot, 'skills', 'hire', 'SKILL.md'), 'utf8');

  assert.match(skill, /Subspace Specialist/);
  assert.match(skill, /Tell me what kind of specialist you wish you had available/);
  assert.match(skill, /specific companies, products, people, or skills/);
  assert.match(skill, /Slack,[\s\S]*Superhuman,[\s\S]*Notion/);
  assert.match(skill, /2–3 plausible specialist hypotheses[\s\S]*grounded in the user's actual dump/);
  assert.match(skill, /Do not invent disconnected options/);
  assert.match(skill, /Capability stack/);
  assert.match(skill, /say\s+`skip`/);
  assert.match(skill, /launch the agent any time, from any workspace/);
  assert.match(skill, /They remember[\s\S]*work that happened anywhere they worked/);
  assert.match(skill, /specific Skills and MCP servers/);
  assert.match(skill, /on demand[\s\S]*one-off future task[\s\S]*recurring work/);
  assert.match(skill, /ask the agent later[\s\S]*review the onboarding funnel every Monday at 9am/);
});

test('hire skill asks for scheduled Claude Code permission mode', () => {
  const skill = readFileSync(join(repoRoot, 'skills', 'hire', 'SKILL.md'), 'utf8');

  assert.match(skill, /All Helm-launched Claude Code tasks must have an explicit permission mode/);
  assert.match(skill, /Auto mode \(recommended\)[\s\S]*`--permission-mode auto`/);
  assert.match(skill, /Dangerously skip permissions[\s\S]*`--dangerously-skip-permissions`/);
  assert.match(skill, /-- run \{slug\} -- \{scheduled permission args\} -p "Run today's work session\."/);
  assert.match(skill, /-- run \{slug\} -- \{scheduled permission args\} -p "Enrich knowledge\.md/);
});

test('hire skill does not configure email during hire', () => {
  const skill = readFileSync(join(repoRoot, 'skills', 'hire', 'SKILL.md'), 'utf8');

  assert.match(skill, /No email setup/);
  assert.match(skill, /helm-email/);
  assert.doesNotMatch(skill, /Step \d+ .*Email Setup/i);
  assert.doesNotMatch(skill, /academy config/);
  assert.doesNotMatch(skill, /academy email setup/);
  assert.doesNotMatch(skill, /agentmail_api_key|user_email|agentmail\.to/);
});

test('hook config keeps Stop memory sync and no startup context injection hooks', () => {
  const config = JSON.parse(readFileSync(join(repoRoot, 'hooks', 'hooks.json'), 'utf8'));
  const sessionStart = config.hooks.SessionStart;
  const stop = config.hooks.Stop;

  assert.equal(sessionStart.length, 1);
  assert.equal(sessionStart[0].matcher, '*');
  assert.deepEqual(sessionStart[0].hooks, [
    {
      type: 'command',
      command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/register_session.mjs',
    },
  ]);
  assert.equal(stop.length, 1);
  assert.equal(stop[0].matcher, '*');
  assert.deepEqual(stop[0].hooks, [
    {
      type: 'command',
      command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/sync_memory.mjs',
    },
  ]);

  const serialized = JSON.stringify(config);
  assert.doesNotMatch(serialized, /inject_surface|inject_section|observe_turn|\.ops/);
  assert.doesNotMatch(serialized, /additionalContext|hookSpecificOutput/);
});

test('memory sync hook exists as a v3 node hook, not a legacy observe hook', () => {
  const hookText = readFileSync(join(repoRoot, 'hooks', 'sync_memory.mjs'), 'utf8');

  assert.match(hookText, /syncAcademyMemory/);
  assert.doesNotMatch(hookText, /observe_turn|inject_section|haiku|gemini/i);
});

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
  const promptPath = join(agentDir, '.claude', 'academy-system-prompt.md');
  assert.match(output, new RegExp(`--plugin-dir ${pluginDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`--system-prompt-file ${promptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`\\[dry-run\\] cwd=${resolvedProjectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`ACADEMY_AGENT_DIR=${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(output, new RegExp(`ACADEMY_PROJECT_DIR=${resolvedProjectDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
});

test('create writes and run refreshes the generated system prompt from surfaces', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  const projectDir = join(root, 'project');
  mkdirSync(projectDir);

  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });

  const agentDir = join(agentsRoot, 'kai');
  const promptPath = join(agentDir, '.claude', 'academy-system-prompt.md');
  const initialPrompt = readFileSync(promptPath, 'utf8');

  assert.match(initialPrompt, /Generated by `academy`/);
  assert.match(initialPrompt, /Do not edit this file directly/);
  assert.equal(surfaces.every((surface) => initialPrompt.includes(`<!-- academy:surface:${surface} -->`)), true);

  writeFileSync(join(agentDir, 'identity.md'), '# Identity\n\nKai custom identity.\n');

  const output = runCli(['run', 'kai', '--', '-p', 'smoke'], {
    cwd: projectDir,
    env: { AGENTS_ROOT: agentsRoot, ACADEMY_DRY_RUN: '1' },
  });
  const refreshedPrompt = readFileSync(promptPath, 'utf8');

  assert.match(output, new RegExp(`--system-prompt-file ${promptPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(refreshedPrompt, /Kai custom identity/);
  assert.equal(surfaces.every((surface) => refreshedPrompt.includes(`<!-- academy:surface:${surface} -->`)), true);
});

test('create scaffolds universal skills with agent-specific paths', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  runCli(['create', 'kai'], { env: { AGENTS_ROOT: agentsRoot } });

  const agentDir = join(agentsRoot, 'kai');
  const selfUpdatePath = join(agentDir, '.claude', 'skills', 'self-update', 'SKILL.md');
  const checkInPath = join(agentDir, '.claude', 'skills', 'check-in', 'SKILL.md');
  const nightlyPath = join(agentDir, '.claude', 'skills', 'nightly-consolidation', 'SKILL.md');
  const selfUpdateText = readFileSync(selfUpdatePath, 'utf8');
  const checkInText = readFileSync(checkInPath, 'utf8');
  const nightlyText = readFileSync(nightlyPath, 'utf8');

  assert.equal(existsSync(join(agentDir, 'dreams')), true);
  assert.equal(existsSync(join(agentDir, 'memory', 'observations')), true);
  assert.equal(existsSync(join(agentDir, 'memory', 'sessions.jsonl')), true);
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

  assert.match(nightlyText, /^name: nightly-consolidation/m);
  assert.match(nightlyText, /Dreams directory:/);
  assert.match(nightlyText, /memory\/observations/);
  assert.match(nightlyText, /primary source/);
  assert.match(nightlyText, new RegExp(`dreams\``));
  assert.match(nightlyText, new RegExp(`This skill: \`${nightlyPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(nightlyText, /\{\{[a-z_]+\}\}/);
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
  const nightlyPath = join(agentDir, '.claude', 'skills', 'nightly-consolidation', 'SKILL.md');
  const selfUpdateText = readFileSync(selfUpdatePath, 'utf8');
  const checkInText = readFileSync(checkInPath, 'utf8');
  const nightlyText = readFileSync(nightlyPath, 'utf8');

  assert.equal(existsSync(join(agentDir, 'dreams')), true);
  assert.equal(existsSync(join(agentDir, 'memory', 'observations')), true);
  assert.equal(existsSync(join(agentDir, 'memory', 'sessions.jsonl')), true);
  assert.match(selfUpdateText, /^name: self-update/m);
  assert.match(selfUpdateText, new RegExp(`Agent home: \`${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\``));
  assert.doesNotMatch(selfUpdateText, /\{\{[a-z_]+\}\}/);

  assert.match(checkInText, /^name: check-in/m);
  assert.match(checkInText, /Check-in is kai's 1:1 protocol/);
  assert.doesNotMatch(checkInText, /\{\{[a-z_]+\}\}/);

  assert.match(nightlyText, /^name: nightly-consolidation/m);
  assert.match(nightlyText, /memory\/observations/);
  assert.match(nightlyText, /primary source/);
  assert.doesNotMatch(nightlyText, /\{\{[a-z_]+\}\}/);
});

test('create registers a nightly Helm consolidation task', () => {
  const root = mkdtempSync(join(tmpdir(), 'academy-cli-'));
  const agentsRoot = join(root, 'agents');
  const binDir = join(root, 'bin');
  const logPath = join(root, 'helm-args.txt');
  mkdirSync(binDir);
  const helmTasks = join(binDir, 'helm-tasks');
  writeFileSync(helmTasks, `#!/usr/bin/env bash
printf '%s\\n' "$PWD" > "${logPath}"
printf '%s\\n' "$@" >> "${logPath}"
`);
  chmodSync(helmTasks, 0o755);

  const output = runCli(['create', 'kai'], {
    env: {
      AGENTS_ROOT: agentsRoot,
      ACADEMY_SKIP_NIGHTLY_TASK: '0',
      PATH: `${binDir}:${process.env.PATH}`,
      TZ: 'America/Los_Angeles',
    },
  });

  const agentDir = join(agentsRoot, 'kai');
  const helmArgs = readFileSync(logPath, 'utf8');
  assert.match(output, /Registered nightly consolidation job "kai-nightly-consolidation"/);
  assert.match(helmArgs, new RegExp(`^${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.match(helmArgs, /^schedule$/m);
  assert.match(helmArgs, /^--cwd$/m);
  assert.match(helmArgs, new RegExp(`^${agentDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'm'));
  assert.match(helmArgs, /^kai-nightly-consolidation$/m);
  assert.match(helmArgs, /^0 22 \* \* \*$/m);
  assert.match(helmArgs, /^America\/Los_Angeles$/m);
  assert.match(helmArgs, /^academy$/m);
  assert.match(helmArgs, /^run$/m);
  assert.match(helmArgs, /^kai$/m);
  assert.match(helmArgs, /^--permission-mode$/m);
  assert.match(helmArgs, /^auto$/m);
  assert.match(helmArgs, /nightly-consolidation skill/);
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
