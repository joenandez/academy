#!/usr/bin/env node
/**
 * Academy v3 CLI — portable agents on top of Subspace's agent platform.
 *
 * Per scope §2.5 (no-customization constraint): no adapter classes, no glue.
 * This CLI scaffolds agents and shells out to Claude Code / Helm / Subspace
 * directly — internal tool skills (Phase 1) are SKILL.md docs, not code here.
 *
 * Commands:
 *   academy create <name>     Scaffold an agent at ~/.academy/agents/<name>/
 *   academy hire              Interactive hire flow (launches Claude Code with hire skill)
 *   academy run <name>        Launch Claude Code against current project
 *   academy list              List all agents
 *   academy inspect <name>    Inspect one agent
 *   academy clean <name>      Clear transient agent state (notes/threads — not destructive)
 *   academy destroy <name>    Remove an agent (--force required)
 *   academy root              Print Academy package root
 *   academy notes add/list    Append-only micro-steering on an agent's notes.md
 */
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Academy package root (parent of scripts/). */
const ACADEMY_ROOT = resolve(__dirname, '..');

/** Global agents root — portable plugin layout. Key v3 differentiator (§2). */
const AGENTS_ROOT = process.env.AGENTS_ROOT || join(homedir(), '.academy', 'agents');

/** Allowed agent name pattern: kebab-case, 1–32 chars. */
const NAME_RE = /^[a-z][a-z0-9-]{0,31}$/;

const SURFACES = ['identity', 'role', 'knowledge', 'goals', 'priorities', 'threads', 'notes', 'dailys'];
const UNIVERSAL_SKILLS = ['check-in', 'self-update', 'nightly-consolidation'];
const NIGHTLY_JOB_CRON = '0 22 * * *';
const SCHEDULED_CLAUDE_PERMISSION_ARGS = ['--permission-mode', 'auto'];
const ACADEMY_SYSTEM_PROMPT = 'academy-system-prompt.md';

// ─────────────────────────────────────────────────────────────────────────────
// Argument parsing
// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help') return { command: 'help' };
  switch (command) {
    case 'create':  return { command, name: rest[0] };
    case 'hire':    return { command };
    case 'run':     return { command, name: rest[0], passthrough: extractPassthrough(rest.slice(1)) };
    case 'list':    return { command, json: hasFlag(rest, '--json') };
    case 'inspect': return { command, name: rest.find((arg) => arg !== '--json'), json: hasFlag(rest, '--json') };
    case 'clean':   return { command, name: rest[0] };
    case 'destroy': return { command, name: rest[0], force: rest.includes('--force') };
    case 'root':    return { command, json: hasFlag(rest, '--json') };
    case 'notes':   return parseNotesArgs(rest);
    default:
      console.error(`Unknown command: ${command}`);
      return { command: 'help', exitCode: 1 };
  }
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function extractPassthrough(rest) {
  const dashIdx = rest.indexOf('--');
  return dashIdx >= 0 ? rest.slice(dashIdx + 1) : [];
}

// `notes add [<agent>] "text"` and `notes list [<agent>] [--last N]`. The first
// positional token is treated as an agent only when it looks like an agent name
// (NAME_RE) AND there is more to follow — so quoted single-arg text stays text.
function parseNotesArgs(rest) {
  const action = rest[0];
  if (action !== 'add' && action !== 'list') {
    console.error(`Unknown notes action: ${action ?? '(none)'}. Use 'add' or 'list'.`);
    return { command: 'help', exitCode: 1 };
  }
  const args = rest.slice(1);

  if (action === 'add') {
    let name;
    let textParts = args;
    if (args.length >= 2 && NAME_RE.test(args[0])) {
      name = args[0];
      textParts = args.slice(1);
    }
    return { command: 'notes', action, name, text: textParts.join(' ') };
  }

  // list — pull out --last N (or --last=N), the rest is an optional agent name.
  let last = 12;
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--last') {
      last = Number.parseInt(args[++i], 10);
    } else if (args[i].startsWith('--last=')) {
      last = Number.parseInt(args[i].slice('--last='.length), 10);
    } else {
      positional.push(args[i]);
    }
  }
  if (!Number.isInteger(last) || last <= 0) last = 12;
  const name = positional[0] && NAME_RE.test(positional[0]) ? positional[0] : undefined;
  return { command: 'notes', action, name, last };
}

function printUsage() {
  console.log(`
Usage: academy <command> [options]

Commands:
  create <name>           Scaffold a new portable agent at ~/.academy/agents/<name>/
  hire                    Interactive hire flow — produces 8 boot files via Claude Code
  run <name> [-- ...]     Launch Claude Code against current project (plugin mode)
  list                    List all agents
  inspect <name>          Inspect one agent
  clean <name>            Truncate transient surfaces (notes.md, threads.md)
  destroy <name> --force  Remove an agent and all its files
  root                    Print Academy package root
  notes add [<agent>] "…" Append a short note to the agent's notes.md
  notes list [<agent>] [--last N]  Show recent notes (default last 12)

Examples:
  academy create kai
  academy hire
  academy run kai
  academy run kai -- -p "Run today's analytics review"
  academy notes add "User prefers short status updates before edits"
  academy notes list --last 20
  `.trim());
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────

function validateName(name) {
  if (!name) {
    console.error('Error: agent name required');
    process.exit(1);
  }
  if (!NAME_RE.test(name)) {
    console.error(`Error: invalid name "${name}". Use kebab-case, 1–32 chars, starting with a letter.`);
    process.exit(1);
  }
}

function agentDir(name) {
  return join(AGENTS_ROOT, name);
}

function printJson(value, stream = process.stdout) {
  stream.write(`${JSON.stringify(value, null, 2)}\n`);
}

function exitJsonError(code, message, fields = {}) {
  printJson({ error: { code, message, ...fields } }, process.stderr);
  process.exit(1);
}

function isSymlink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureSymlink(target, linkPath, type = 'dir') {
  const resolvedTarget = resolve(target);
  if (isSymlink(linkPath)) {
    const existing = readlinkSync(linkPath);
    const resolvedExisting = resolve(dirname(linkPath), existing);
    if (resolvedExisting === resolvedTarget || resolve(existing) === resolvedTarget) return;
    unlinkSync(linkPath);
  } else if (existsSync(linkPath)) {
    rmSync(linkPath, { recursive: true, force: true });
  }
  mkdirSync(dirname(linkPath), { recursive: true });
  symlinkSync(resolvedTarget, linkPath, type);
}

function ensureAcademyGitignore(projectDir) {
  const academyDir = join(projectDir, '.academy');
  mkdirSync(academyDir, { recursive: true });
  const gitignorePath = join(academyDir, '.gitignore');
  if (!existsSync(gitignorePath)) writeFileSync(gitignorePath, '*\n');
}

function projectPluginDir(projectDir, name) {
  return join(resolve(projectDir), '.academy', 'agents', name);
}

function legacyAcademyRoot(dir) {
  const rootFile = join(dir, '.academy_root');
  if (!existsSync(rootFile)) return null;
  const root = readFileSync(rootFile, 'utf8').trim();
  if (!root || resolve(root) === ACADEMY_ROOT) return null;
  const legacyCli = join(root, 'scripts', 'agent.mjs');
  return existsSync(legacyCli) ? root : null;
}

function delegateLegacyRun(name, passthrough, legacyRoot) {
  const args = ['run', name, ...(passthrough.length > 0 ? ['--', ...passthrough] : [])];
  const result = spawnSync(process.execPath, [join(legacyRoot, 'scripts', 'agent.mjs'), ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    env: process.env,
  });
  process.exit(result.status ?? 0);
}

function isInside(childPath, parentPath) {
  let child = resolve(childPath);
  let parent = resolve(parentPath);
  try { child = realpathSync(child); } catch { /* use resolved path */ }
  try { parent = realpathSync(parent); } catch { /* use resolved path */ }
  return child === parent || child.startsWith(parent + '/');
}

// ─────────────────────────────────────────────────────────────────────────────
// `create` — scaffold the 8 boot files + universal skills + plugin symlink
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = {
  'identity.md': (name, today) =>
`# Identity

_(Who you are — values, character, voice, persona/backstory.)_

You are ${name}.

_(Hire flow will populate this. See \`academy hire\`.)_

---
_Created: ${today}._
`,
  'role.md': (name, today) =>
`# Role

_(What you do — job, responsibilities, scope, deliverable shape, cadence.)_

_(Hire flow will populate this. See \`academy hire\`.)_

---
_Created: ${today}._
`,
  'knowledge.md': (name, today) =>
`# Knowledge

_(What you know — domain expertise, mental models, frameworks, learned patterns.)_

Lightweight sections by domain (max 5–8). Dated entries within sections.
Curation is by reference + uniqueness + user signal — see scope §7.

_(Hire flow will populate this from research. See \`academy hire\`.)_

---
_Created: ${today}._
`,
  'goals.md': (name, today) =>
`# Goals

_(Strategic direction — quarterly horizon, hard cap of 3.)_

1. _(goal one)_
2. _(goal two)_
3. _(goal three)_

---
_Created: ${today}. Re-affirm every 14 days._
`,
  'priorities.md': (name, today) =>
`# Priorities

_(Weekly direction — WIP-limited, 3–5 visible.)_

- _(priority one)_
- _(priority two)_

---
_Created: ${today}._
`,
  'threads.md': (name, today) =>
`# Threads

_(Active work pursuits — 5 active visible / 8 idle. Auto-demote by \`last_touched\`.)_

## Active

_(none yet)_

## Idle

_(none yet)_

## Parked

_(none yet)_

---
_Created: ${today}._
`,
  'notes.md': (name, today) =>
`# Notes

_(Micro-steering staging area — 8–12 visible cap. Graduate or expire.)_

_Capture temporary steering, corrections, stakeholder facts, caveats, and raw
learnings here with_ \`academy notes add "..."\` _— it appends a timestamped
bullet without rewriting this file. Review with_ \`academy notes list\`_._

_(none yet)_

---
_Created: ${today}. Long-staying notes are a smell — they should graduate to knowledge / role / identity / skill, or expire._
`,
  'dailys.md': (name, today) =>
`# Recent Days

_(Tight summaries, last 7 working days, FIFO.)_

_(none yet — populated by daily primitive in Phase 3.)_

---
_Created: ${today}._
`,
};

function scaffoldBootFiles(dir, name) {
  const today = new Date().toISOString().slice(0, 10);
  for (const surface of SURFACES) {
    const filename = `${surface}.md`;
    const path = join(dir, filename);
    if (existsSync(path)) continue;
    writeFileSync(path, TEMPLATES[filename](name, today));
  }
  return today;
}

function writeAgentYaml(dir, name, today) {
  const yaml =
`# Agent metadata. Hand-edit role and objective once the hire flow runs.
name: ${name}
created: ${today}
role: ""
objective: ""

# Boot context — 8 surfaces, ~5–6k tokens combined (see scope §3).
# Files live alongside this yaml; academy run compiles them into the generated
# .claude/${ACADEMY_SYSTEM_PROMPT} before launching Claude Code.
surfaces:
  - identity.md
  - role.md
  - knowledge.md
  - goals.md
  - priorities.md
  - threads.md
  - notes.md
  - dailys.md
`;
  writeFileSync(join(dir, 'agent.yaml'), yaml);
}

function writeAgentClaudeMd(dir, name) {
  // Tiny CLAUDE.md — intentionally minimal. Identity lives in identity.md, the
  // user instructions channel can grow over time but starts effectively empty.
  const md =
`# ${name}

User instructions for this agent. The 8 boot surfaces (\`identity.md\`,
\`role.md\`, \`knowledge.md\`, \`goals.md\`, \`priorities.md\`, \`threads.md\`,
\`notes.md\`, \`dailys.md\`) are compiled into \`.claude/${ACADEMY_SYSTEM_PROMPT}\`
when \`academy run ${name}\` launches Claude Code.

Add user-driven instructions below as they come up.
`;
  writeFileSync(join(dir, 'CLAUDE.md'), md);
}

function writePluginSymlink(dir) {
  // The portable plugin layout (§2): each agent has its own .claude-plugin/
  // pointing at the Academy package's plugin manifest, so lifecycle hooks fire
  // when Claude Code runs in the agent's cwd.
  ensureSymlink(join(ACADEMY_ROOT, '.claude-plugin'), join(dir, '.claude-plugin'));

  // Also symlink hooks/ so plugin.json's relative ./hooks/hooks.json resolves.
  ensureSymlink(join(ACADEMY_ROOT, 'hooks'), join(dir, 'hooks'));
}

function writeProjectPluginInstance(projectDir, name, dir) {
  const pluginDir = projectPluginDir(projectDir, name);
  mkdirSync(pluginDir, { recursive: true });

  ensureSymlink(join(ACADEMY_ROOT, '.claude-plugin'), join(pluginDir, '.claude-plugin'));
  ensureSymlink(join(ACADEMY_ROOT, 'hooks'), join(pluginDir, 'hooks'));

  const agentSkillsDir = join(dir, '.claude', 'skills');
  if (existsSync(agentSkillsDir)) ensureSymlink(agentSkillsDir, join(pluginDir, 'skills'));

  writeFileSync(join(pluginDir, 'instance.json'), JSON.stringify({
    agent: name,
    agentDir: dir,
    projectPath: resolve(projectDir),
    lastActive: new Date().toISOString(),
  }, null, 2) + '\n');

  ensureAcademyGitignore(projectDir);
  return pluginDir;
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([a-z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Unknown template variable: ${match}`);
    return values[key];
  });
}

function universalSkillValues(dir, name) {
  const skillsDir = join(dir, '.claude', 'skills');
  const dreamsDir = join(dir, 'dreams');
  return {
    agent_name: name,
    agent_dir: dir,
    identity_path: join(dir, 'identity.md'),
    role_path: join(dir, 'role.md'),
    knowledge_path: join(dir, 'knowledge.md'),
    goals_path: join(dir, 'goals.md'),
    priorities_path: join(dir, 'priorities.md'),
    threads_path: join(dir, 'threads.md'),
    notes_path: join(dir, 'notes.md'),
    dailys_path: join(dir, 'dailys.md'),
    memory_observations_path: join(dir, 'memory', 'observations'),
    dreams_dir: dreamsDir,
    skills_dir: skillsDir,
    check_in_path: join(skillsDir, 'check-in', 'SKILL.md'),
    self_update_path: join(skillsDir, 'self-update', 'SKILL.md'),
    nightly_consolidation_path: join(skillsDir, 'nightly-consolidation', 'SKILL.md'),
  };
}

function writeUniversalSkill(dir, name, skillName) {
  const skillsDir = join(dir, '.claude', 'skills');
  const skillDir = join(skillsDir, skillName);
  const templatePath = join(ACADEMY_ROOT, 'templates', 'skills', skillName, 'SKILL.md');
  const template = readFileSync(templatePath, 'utf8');

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), renderTemplate(template, universalSkillValues(dir, name)));
}

function writeSkillsScaffold(dir, name) {
  // Universal Academy skills are copied into each agent with agent-specific
  // paths. Agent/domain skills can be added later by hire or self-update.
  writeDreamsDir(dir);
  writeMemoryScaffold(dir);
  mkdirSync(join(dir, '.claude', 'skills'), { recursive: true });
  for (const skillName of UNIVERSAL_SKILLS) writeUniversalSkill(dir, name, skillName);
}

function academySystemPromptPath(dir) {
  return join(dir, '.claude', ACADEMY_SYSTEM_PROMPT);
}

function surfaceTitle(surface) {
  return `${surface[0].toUpperCase()}${surface.slice(1)}`;
}

function readSurface(dir, surface) {
  const surfaceFile = join(dir, `${surface}.md`);
  if (!existsSync(surfaceFile)) return `# ${surfaceTitle(surface)}\n\n_(No ${surface}.md present yet.)_`;
  const body = readFileSync(surfaceFile, 'utf8').trimEnd();
  return body || `# ${surfaceTitle(surface)}\n\n_(${surface}.md is empty.)_`;
}

function renderAcademySystemPrompt(dir, name) {
  mkdirSync(join(dir, '.claude'), { recursive: true });
  const prompt = [
    '<!-- Generated by `academy`. Do not edit this file directly. Edit the source surfaces instead. -->',
    '',
    `# Academy Agent: ${name}`,
    '',
    'You are an Academy v3 agent. Treat the following surfaces as your durable identity, role, knowledge, goals, priorities, active threads, notes, and recent daily context.',
    '',
    'Capture transient steering cheaply with `academy notes add "..."` — it appends a timestamped bullet to your notes.md without reading the whole file. Use it for corrections, stakeholder facts, caveats, and raw learnings before they are durable enough for another surface; review with `academy notes list`. The self-update skill explains when a note should graduate or expire.',
    '',
    ...SURFACES.flatMap((surface) => [
      `<!-- academy:surface:${surface} -->`,
      readSurface(dir, surface),
      '',
    ]),
  ].join('\n');
  const promptPath = academySystemPromptPath(dir);
  writeFileSync(promptPath, prompt.endsWith('\n') ? prompt : `${prompt}\n`);
  return promptPath;
}

function writeDreamsDir(dir) {
  mkdirSync(join(dir, 'dreams'), { recursive: true });
}

function writeMemoryScaffold(dir) {
  mkdirSync(join(dir, 'memory', 'observations'), { recursive: true });
  const sessionsPath = join(dir, 'memory', 'sessions.jsonl');
  if (!existsSync(sessionsPath)) writeFileSync(sessionsPath, '');
}

function writeSettingsLocal(dir) {
  // Permissions template — Phase 0 is permissive; tighten later if needed.
  // Plugin discovery happens via the symlinked .claude-plugin/ in agent dir.
  const settings = {
    permissions: {
      allow: [
        'Bash(academy:*)',
        'Bash(helm:*)',
        'Bash(helm-tasks:*)',
        'Bash(subspace-memory:*)',
        'Bash(date:*)',
        'Read', 'Edit', 'Write', 'Glob', 'Grep', 'TodoWrite',
      ],
    },
  };
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(join(dir, '.claude', 'settings.local.json'), JSON.stringify(settings, null, 2) + '\n');
}

function createAgent(name) {
  validateName(name);
  const dir = agentDir(name);
  if (existsSync(dir)) {
    console.error(`Agent "${name}" already exists at ${dir}`);
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  const today = scaffoldBootFiles(dir, name);
  writeAgentYaml(dir, name, today);
  writeAgentClaudeMd(dir, name);
  writeSkillsScaffold(dir, name);
  writeSettingsLocal(dir);
  writePluginSymlink(dir);
  renderAcademySystemPrompt(dir, name);
  const nightlyTask = registerNightlyConsolidationTask(dir, name);

  console.log(`Created agent "${name}" at ${dir}`);
  if (nightlyTask.registered) {
    console.log(`Registered nightly consolidation job "${nightlyTask.id}" (${NIGHTLY_JOB_CRON} ${nightlyTask.timezone}).`);
  } else {
    console.log(`Nightly consolidation job not registered: ${nightlyTask.reason}`);
  }
  console.log('');
  console.log('Next:');
  console.log(`  academy hire           # interactive hire flow to populate the 8 surfaces`);
  console.log(`  academy run ${name}    # launch Claude Code in the agent's home`);
}

function localTimezone() {
  return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
}

function registerNightlyConsolidationTask(dir, name) {
  const id = `${name}-nightly-consolidation`;
  if (process.env.ACADEMY_SKIP_NIGHTLY_TASK === '1') {
    return { id, registered: false, reason: 'skipped by ACADEMY_SKIP_NIGHTLY_TASK=1' };
  }

  const timezone = localTimezone();
  const prompt = [
    'Use the nightly-consolidation skill to consolidate today\'s memory.',
    'Update the v3 memory surfaces conservatively, write the dreams report,',
    'and finish with the dreams report path.',
  ].join(' ');

  const args = [
    'schedule',
    '--cwd', dir,
    '--id', id,
    '--cron', NIGHTLY_JOB_CRON,
    '--timezone', timezone,
    '--command', 'academy',
    '--replace',
    '--tags', 'academy,nightly,consolidation',
    '--timeout-sec', '3600',
    '--',
    'run', name, '--', ...SCHEDULED_CLAUDE_PERMISSION_ARGS, '-p', prompt,
  ];

  const result = spawnSync('helm-tasks', args, {
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

function helmFailureReason(output, status) {
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

function hireAgent() {
  // The hire skill is the orchestrator: it calls `academy create <slug>`,
  // writes runnable starter surfaces, then schedules knowledge enrichment
  // after the user-facing hiring summary.
  // Positional arg seeds the first user message; session stays interactive.
  launchClaude(['--plugin-dir', ACADEMY_ROOT, 'run /hire'], {
    cwd: ACADEMY_ROOT,
    env: process.env,
    message: 'Launching Academy hire flow',
  });
}

function launchClaude(args, { cwd, env, message }) {
  console.log(message);
  const claudeBin = process.env.ACADEMY_CLAUDE_BIN || 'claude';
  if (process.env.ACADEMY_DRY_RUN === '1') {
    console.log(`[dry-run] ${claudeBin} ${args.join(' ')}`);
    console.log(`[dry-run] cwd=${cwd}`);
    if (env?.ACADEMY_AGENT_DIR) console.log(`[dry-run] ACADEMY_AGENT_DIR=${env.ACADEMY_AGENT_DIR}`);
    if (env?.ACADEMY_PROJECT_DIR) console.log(`[dry-run] ACADEMY_PROJECT_DIR=${env.ACADEMY_PROJECT_DIR}`);
    process.exit(0);
  }
  const result = spawnSync(claudeBin, args, { stdio: 'inherit', cwd, env });
  process.exit(result.status ?? 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// `run` — launch Claude Code against the current project via plugin mode
// ─────────────────────────────────────────────────────────────────────────────

function runAgent(name, passthrough) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    console.error(`Run \`academy create ${name}\` or \`academy hire\` first.`);
    process.exit(1);
  }

  const legacyRoot = legacyAcademyRoot(dir);
  if (legacyRoot) {
    delegateLegacyRun(name, passthrough, legacyRoot);
    return;
  }

  writeSkillsScaffold(dir, name);
  const systemPromptPath = renderAcademySystemPrompt(dir, name);

  const env = {
    ...process.env,
    ACADEMY_AGENT_DIR: dir,
    ACADEMY_AGENT_NAME: name,
  };

  const projectDir = resolve(process.cwd());
  if (isInside(projectDir, dir)) {
    launchClaude(['--system-prompt-file', systemPromptPath, ...passthrough], {
      cwd: dir,
      env,
      message: `Launching ${name} in agent home (${dir})`,
    });
    return;
  }

  const pluginDir = writeProjectPluginInstance(projectDir, name, dir);
  launchClaude(['--plugin-dir', pluginDir, '--system-prompt-file', systemPromptPath, ...passthrough], {
    cwd: projectDir,
    env: { ...env, ACADEMY_PROJECT_DIR: projectDir },
    message: `Launching ${name} for project ${basename(projectDir)} (plugin: ${pluginDir})`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// `list` — list all agents
// ─────────────────────────────────────────────────────────────────────────────

function listAgents() {
  const entries = agentNames();
  if (entries.length === 0) {
    console.log('(no agents yet — try `academy hire` or `academy create <name>`)');
    return;
  }
  for (const name of entries) {
    const yaml = readAgentYaml(join(AGENTS_ROOT, name));
    const role = yaml.role || '(no role set)';
    console.log(`  ${name.padEnd(20)} ${role}`);
  }
}

function listAgentsJson() {
  printJson({ agents: agentNames().map((name) => agentRecord(name)) });
}

function agentNames() {
  if (!existsSync(AGENTS_ROOT)) return [];
  return readdirSync(AGENTS_ROOT)
    .filter((e) => statSync(join(AGENTS_ROOT, e)).isDirectory())
    .sort();
}

function agentRecord(name, { includeSurfaces = false } = {}) {
  const dir = agentDir(name);
  const yaml = readAgentYaml(dir);
  const record = {
    name,
    dir: resolve(dir),
    displayName: yaml.displayName || yaml.display_name || yaml.name || name,
    runtimeProvider: 'claude_code',
  };
  if (yaml.role) record.role = yaml.role;
  if (includeSurfaces) record.surfaces = surfacePresence(dir);
  return record;
}

function surfacePresence(dir) {
  return Object.fromEntries(SURFACES.map((surface) => [surface, existsSync(join(dir, `${surface}.md`))]));
}

function inspectAgent(name, json) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    const message = `Agent "${name}" not found at ${dir}`;
    if (json) exitJsonError('agent_not_found', message, { name });
    console.error(message);
    process.exit(1);
  }

  const record = agentRecord(name, { includeSurfaces: true });
  if (json) {
    printJson(record);
    return;
  }

  console.log(`${record.name} (${record.runtimeProvider})`);
  console.log(`  dir: ${record.dir}`);
  console.log(`  displayName: ${record.displayName}`);
  if (record.role) console.log(`  role: ${record.role}`);
}

function readAgentYaml(dir) {
  // Tiny YAML reader — only parses the top-level scalar fields the CLI needs.
  // Full YAML parsing can come later if we add nested config.
  const out = {};
  try {
    const text = readFileSync(join(dir, 'agent.yaml'), 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([a-z_][a-z0-9_]*):\s*(.*)$/i);
      if (!m) continue;
      const [, key, raw] = m;
      const value = raw.trim().replace(/^["']|["']$/g, '');
      out[key] = value;
    }
  } catch { /* missing yaml is ok */ }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// `clean` — truncate transient surfaces
// ─────────────────────────────────────────────────────────────────────────────

function cleanAgent(name) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    process.exit(1);
  }
  // Reset notes.md and threads.md to scaffolded state. Other surfaces are
  // load-bearing (identity/role/knowledge) or natural-decay (dailys/goals/priorities).
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(join(dir, 'notes.md'), TEMPLATES['notes.md'](name, today));
  writeFileSync(join(dir, 'threads.md'), TEMPLATES['threads.md'](name, today));
  console.log(`Cleaned transient surfaces for "${name}" (notes.md, threads.md).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// `destroy` — nuke an agent (--force required)
// ─────────────────────────────────────────────────────────────────────────────

function destroyAgent(name, force) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    process.exit(1);
  }
  if (!force) {
    console.error(`Refusing to destroy "${name}" without --force.`);
    console.error(`This removes ${dir} and all its files.`);
    process.exit(1);
  }
  rmSync(dir, { recursive: true, force: true });
  console.log(`Destroyed agent "${name}" (removed ${dir}).`);
}

// ─────────────────────────────────────────────────────────────────────────────
// `notes` — append-only micro-steering staging on an agent's notes.md
// ─────────────────────────────────────────────────────────────────────────────

// Resolve the target agent home for a notes command. Precedence: explicit
// <agent> arg → ACADEMY_AGENT_DIR → ACADEMY_AGENT_HOME (spec synonym) →
// ACADEMY_AGENT_NAME → error. The *_DIR/_HOME vars are absolute agent-home
// paths; ACADEMY_AGENT_DIR is what `academy run` exports.
function resolveNotesAgentDir(explicitName) {
  if (explicitName) {
    validateName(explicitName);
    return agentDir(explicitName);
  }
  if (process.env.ACADEMY_AGENT_DIR) return process.env.ACADEMY_AGENT_DIR;
  if (process.env.ACADEMY_AGENT_HOME) return process.env.ACADEMY_AGENT_HOME;
  if (process.env.ACADEMY_AGENT_NAME) return agentDir(process.env.ACADEMY_AGENT_NAME);
  console.error('Error: no agent resolved for `academy notes`.');
  console.error('Pass an agent name, or run inside an agent so ACADEMY_AGENT_DIR is set.');
  console.error('Usage: academy notes add [<agent>] "text"  |  academy notes list [<agent>] [--last N]');
  process.exit(1);
}

function ensureAgentHome(dir) {
  if (!existsSync(dir)) {
    console.error(`Agent home not found at ${dir}`);
    process.exit(1);
  }
  return dir;
}

// Local-time stamp `YYYY-MM-DD HH:MM` (not UTC — spec §Appended Format).
function localNoteStamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function notesAdd(name, text) {
  if (!text || !text.trim()) {
    console.error('Error: note text required.');
    console.error('Usage: academy notes add [<agent>] "text"');
    process.exit(1);
  }
  const dir = ensureAgentHome(resolveNotesAgentDir(name));
  const notesPath = join(dir, 'notes.md');
  // Append-only: never read or rewrite the whole file (spec §Behavior).
  appendFileSync(notesPath, `- ${localNoteStamp()}: ${text}\n`);
  console.log(`Noted → ${notesPath}`);
}

function notesList(name, last) {
  const dir = ensureAgentHome(resolveNotesAgentDir(name));
  const notesPath = join(dir, 'notes.md');
  if (!existsSync(notesPath)) {
    console.log('(no notes yet)');
    return;
  }
  // A note bullet is a top-level `- ` line — excludes headers, `_(…)_` italics,
  // and `---` rules in the scaffold.
  const bullets = readFileSync(notesPath, 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('- '));
  const recent = bullets.slice(-last);
  if (recent.length === 0) {
    console.log('(no notes yet)');
    return;
  }
  console.log(recent.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  switch (parsed.command) {
    case 'help':
      printUsage();
      process.exit(parsed.exitCode ?? 0);
      break;
    case 'create':
      createAgent(parsed.name);
      break;
    case 'hire':
      hireAgent();
      break;
    case 'run':
      runAgent(parsed.name, parsed.passthrough);
      break;
    case 'list':
      if (parsed.json) listAgentsJson();
      else listAgents();
      break;
    case 'inspect':
      inspectAgent(parsed.name, parsed.json);
      break;
    case 'clean':
      cleanAgent(parsed.name);
      break;
    case 'destroy':
      destroyAgent(parsed.name, parsed.force);
      break;
    case 'root':
      if (parsed.json) printJson({ packageRoot: ACADEMY_ROOT, agentsRoot: resolve(AGENTS_ROOT) });
      else console.log(ACADEMY_ROOT);
      break;
    case 'notes':
      if (parsed.action === 'add') notesAdd(parsed.name, parsed.text);
      else notesList(parsed.name, parsed.last);
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

main();
