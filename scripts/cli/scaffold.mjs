import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  ACADEMY_ROOT,
  ACADEMY_SYSTEM_PROMPT,
  SURFACES,
  UNIVERSAL_SKILLS,
  ensureAcademyGitignore,
  ensureSymlink,
  memoryBridgeEnabled,
  projectPluginDir,
} from './core.mjs';
import { TEMPLATES } from './templates.mjs';
import {
  MEMORY_BRIDGE_PERMISSIONS,
  MEMORY_BRIDGE_SKILL_GUIDANCE,
} from '../../hooks/memory_bridge.mjs';

export function scaffoldBootFiles(dir, name) {
  const today = new Date().toISOString().slice(0, 10);
  for (const surface of SURFACES) {
    const filename = `${surface}.md`;
    const path = join(dir, filename);
    if (existsSync(path)) continue;
    writeFileSync(path, TEMPLATES[filename](name, today));
  }
  return today;
}

export function writeAgentYaml(dir, name, today) {
  const yaml = `# Agent metadata. Hand-edit role and objective once the hire flow runs.
name: ${name}
created: ${today}
# Launch runtime — claude_code or codex. \`academy run --agent\` rewrites it.
runtime: claude_code
role: ""
objective: ""

# Boot context — 8 surfaces, ~5–6k tokens combined (see scope §3).
# Files live alongside this yaml; academy run compiles them into the generated
# .academy/generated/${ACADEMY_SYSTEM_PROMPT} before launching an agent runtime.
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

export function writeAgentClaudeMd(dir, name) {
  // Tiny CLAUDE.md — intentionally minimal. Identity lives in identity.md, the
  // user instructions channel can grow over time but starts effectively empty.
  const md = `# ${name}

User instructions for this agent. The 8 boot surfaces (\`identity.md\`,
\`role.md\`, \`knowledge.md\`, \`goals.md\`, \`priorities.md\`, \`threads.md\`,
\`notes.md\`, \`dailys.md\`) are compiled into \`.academy/generated/${ACADEMY_SYSTEM_PROMPT}\`
when \`academy run ${name}\` launches an agent runtime.

Add user-driven instructions below as they come up.
`;
  writeFileSync(join(dir, 'CLAUDE.md'), md);
}

export function writeOwnershipMarker(dir, name) {
  writeFileSync(
    join(dir, '.academy-agent.json'),
    JSON.stringify(
      {
        capability: 'academy-agent',
        name,
        packageRoot: ACADEMY_ROOT,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );
}

export function writePluginSymlink(dir) {
  // The portable plugin layout (§2): each agent has its own .claude-plugin/
  // pointing at the Academy package's plugin manifest, so lifecycle hooks fire
  // when Claude Code runs in the agent's cwd.
  ensureSymlink(join(ACADEMY_ROOT, '.claude-plugin'), join(dir, '.claude-plugin'));

  // Also symlink hooks/ so plugin.json's relative ./hooks/hooks.json resolves.
  ensureSymlink(join(ACADEMY_ROOT, 'hooks'), join(dir, 'hooks'));
}

export function writeProjectPluginInstance(projectDir, name, dir) {
  const pluginDir = projectPluginDir(projectDir, name);
  mkdirSync(pluginDir, { recursive: true });

  ensureSymlink(join(ACADEMY_ROOT, '.claude-plugin'), join(pluginDir, '.claude-plugin'));
  ensureSymlink(join(ACADEMY_ROOT, 'hooks'), join(pluginDir, 'hooks'));

  const agentSkillsDir = join(dir, '.claude', 'skills');
  if (existsSync(agentSkillsDir)) ensureSymlink(agentSkillsDir, join(pluginDir, 'skills'));
  const agentDefinitionsDir = join(dir, '.claude', 'agents');
  if (existsSync(agentDefinitionsDir))
    ensureSymlink(agentDefinitionsDir, join(pluginDir, 'agents'));

  writeFileSync(
    join(pluginDir, 'instance.json'),
    JSON.stringify(
      {
        agent: name,
        agentDir: dir,
        projectPath: resolve(projectDir),
        lastActive: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
  );

  ensureAcademyGitignore(projectDir);
  return pluginDir;
}

export function writeProjectCodexSkillBridge(projectDir, dir) {
  const agentSkillsDir = join(dir, '.agents', 'skills');
  const projectSkillsDir = join(projectDir, '.agents', 'skills');
  mkdirSync(projectSkillsDir, { recursive: true });

  for (const skillName of UNIVERSAL_SKILLS) {
    const source = join(agentSkillsDir, skillName);
    const target = join(projectSkillsDir, skillName);
    if (!existsSync(source) || existsSync(target)) continue;
    ensureSymlink(source, target);
  }
}

function renderTemplate(template, values) {
  const rendered = template.replace(/\{\{([a-z_]+)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Unknown template variable: ${match}`);
    return values[key];
  });
  // An optional section that renders empty must not leave a hole in a surface
  // Academy charges a token budget for.
  return rendered.replace(/\n{3,}/g, '\n\n');
}

function universalSkillValues(dir, name, skillsDir) {
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
    memory_bridge_guidance: memoryBridgeEnabled() ? MEMORY_BRIDGE_SKILL_GUIDANCE : '',
    dreams_dir: dreamsDir,
    skills_surface: skillsDir.endsWith(join('.agents', 'skills'))
      ? '.agents/skills'
      : '.claude/skills',
    skills_dir: skillsDir,
    check_in_path: join(skillsDir, 'check-in', 'SKILL.md'),
    self_update_path: join(skillsDir, 'self-update', 'SKILL.md'),
    nightly_consolidation_path: join(skillsDir, 'nightly-consolidation', 'SKILL.md'),
    knowledge_curation_path: join(skillsDir, 'knowledge-curation', 'SKILL.md'),
  };
}

function writeUniversalSkill(dir, name, skillName, skillsDir) {
  const skillDir = join(skillsDir, skillName);
  const templatePath = join(ACADEMY_ROOT, 'templates', 'skills', skillName, 'SKILL.md');
  const template = readFileSync(templatePath, 'utf8');

  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    renderTemplate(template, universalSkillValues(dir, name, skillsDir)),
  );
}

export function writeSkillsScaffold(dir, name) {
  // Universal Academy skills are copied into each agent with agent-specific
  // paths. Agent/domain skills can be added later by hire or self-update.
  writeDreamsDir(dir);
  writeMemoryScaffold(dir);
  for (const skillsDir of [join(dir, '.claude', 'skills'), join(dir, '.agents', 'skills')]) {
    mkdirSync(skillsDir, { recursive: true });
    for (const skillName of UNIVERSAL_SKILLS) writeUniversalSkill(dir, name, skillName, skillsDir);
  }
  writeKnowledgeCuratorAgents(dir, name);
}

function writeKnowledgeCuratorAgents(dir, name) {
  const definitions = [
    {
      source: join(ACADEMY_ROOT, 'templates', 'agents', 'claude-code', 'knowledge-curator.md'),
      target: join(dir, '.claude', 'agents', 'knowledge-curator.md'),
      skillsDir: join(dir, '.claude', 'skills'),
    },
    {
      source: join(ACADEMY_ROOT, 'templates', 'agents', 'codex', 'knowledge-curator.toml'),
      target: join(dir, '.codex', 'agents', 'knowledge-curator.toml'),
      skillsDir: join(dir, '.agents', 'skills'),
    },
  ];

  for (const { source, target, skillsDir } of definitions) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(
      target,
      renderTemplate(readFileSync(source, 'utf8'), universalSkillValues(dir, name, skillsDir)),
    );
  }
}

export function academySystemPromptPath(dir) {
  return join(dir, '.academy', 'generated', ACADEMY_SYSTEM_PROMPT);
}

function surfaceTitle(surface) {
  return `${surface[0].toUpperCase()}${surface.slice(1)}`;
}

function readSurface(dir, surface) {
  const surfaceFile = join(dir, `${surface}.md`);
  if (!existsSync(surfaceFile))
    return `# ${surfaceTitle(surface)}\n\n_(No ${surface}.md present yet.)_`;
  const body = readFileSync(surfaceFile, 'utf8').trimEnd();
  return body || `# ${surfaceTitle(surface)}\n\n_(${surface}.md is empty.)_`;
}

export function buildAcademySystemPrompt(dir, name) {
  const intro = [
    '<!-- Generated by `academy`. Do not edit this file directly. Edit the source surfaces instead. -->',
    '',
    `# Academy Agent: ${name}`,
    '',
    'You are an Academy v3 agent. Treat the following surfaces as your durable identity, role, knowledge, goals, priorities, active threads, notes, and recent daily context.',
    '',
    'Capture transient steering cheaply with `academy notes add "..."` — it appends a timestamped bullet to your notes.md without reading the whole file. Use it for corrections, stakeholder facts, caveats, and raw learnings before they are durable enough for another surface; review with `academy notes list`. The self-update skill explains when a note should graduate or expire.',
    '',
  ];
  const surfaces = SURFACES.map((surface) => {
    const path = join(dir, `${surface}.md`);
    const marker = `<!-- academy:surface:${surface} -->`;
    const content = readSurface(dir, surface);
    return {
      name: surface,
      file: `${surface}.md`,
      path,
      exists: existsSync(path),
      marker,
      content,
    };
  });
  const prompt = [
    ...intro,
    ...surfaces.flatMap((surface) => [surface.marker, surface.content, '']),
  ].join('\n');
  return {
    prompt: prompt.endsWith('\n') ? prompt : `${prompt}\n`,
    intro,
    surfaces,
  };
}

export function renderAcademySystemPrompt(dir, name) {
  mkdirSync(dirname(academySystemPromptPath(dir)), { recursive: true });
  const { prompt } = buildAcademySystemPrompt(dir, name);
  const promptPath = academySystemPromptPath(dir);
  writeFileSync(promptPath, prompt);
  return promptPath;
}

function estimateTokens(text) {
  const normalized = text.trim();
  if (!normalized) return 0;
  const chunks = normalized.match(/[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
  return Math.max(chunks.length, Math.ceil(text.length / 4));
}

export function tokenRecord(text) {
  return {
    estimatedTokens: estimateTokens(text),
    chars: text.length,
  };
}

function writeDreamsDir(dir) {
  mkdirSync(join(dir, 'dreams'), { recursive: true });
}

function writeMemoryScaffold(dir) {
  mkdirSync(join(dir, 'memory', 'observations'), { recursive: true });
  const sessionsPath = join(dir, 'memory', 'sessions.jsonl');
  if (!existsSync(sessionsPath)) writeFileSync(sessionsPath, '');
}

export function writeSettingsLocal(dir) {
  // Permissions template — Phase 0 is permissive; tighten later if needed.
  // Plugin discovery happens via the symlinked .claude-plugin/ in agent dir.
  const settings = {
    permissions: {
      allow: [
        'Bash(academy:*)',
        'Bash(helm:*)',
        'Bash(helm-tasks:*)',
        ...(memoryBridgeEnabled() ? MEMORY_BRIDGE_PERMISSIONS : []),
        'Bash(date:*)',
        'Read',
        'Edit',
        'Write',
        'Glob',
        'Grep',
        'TodoWrite',
      ],
    },
  };
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(
    join(dir, '.claude', 'settings.local.json'),
    JSON.stringify(settings, null, 2) + '\n',
  );
}
