import { existsSync, unlinkSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pendingMarkerPath } from '../../hooks/memory_store.mjs';
import {
  codexRuntimeContextPath,
  launchCodex,
  readJsonFile,
  writeCodexHooks,
  writeCodexProfile,
} from './codex.mjs';
import {
  CLI_NAME,
  ACADEMY_CLI_PATH,
  SCHEDULED_CLAUDE_PERMISSION_ARGS,
  SCHEDULED_CODEX_PERMISSION_ARGS,
  LockTimeoutError,
  agentDir,
  delegateLegacyRun,
  isInside,
  legacyAcademyRoot,
  validateName,
} from './core.mjs';
import { registerNightlyConsolidationTask } from './create.mjs';
import { launchClaude } from './hire.mjs';
import { readRuntimeProvider, toRuntimeProvider, toRuntimeToken } from './runtime.mjs';
import { AgentSpecError, writeAgentYamlScalar } from './yaml.mjs';
import {
  renderAcademySystemPrompt,
  writeProjectCodexSkillBridge,
  writeProjectPluginInstance,
  writeSkillsScaffold,
} from './scaffold.mjs';

// The agent's runtime is only knowable once the agent is resolved. A bare run
// reads what the agent already declared, so it can neither launch the wrong
// provider nor re-register the nightly job under one. Only an explicit --agent
// is a decision, and only a decision is persisted.
function resolveRuntime(dir, requested) {
  if (!requested) return toRuntimeToken(readRuntimeProvider(dir));
  persistRuntime(dir, requested);
  return requested;
}

// `run` is outside the envelope, so the durable write's typed failures are
// rendered the way every other run failure is: one actionable line. Anything
// untyped still throws, because a run has no envelope to hide it in.
function persistRuntime(dir, requested) {
  try {
    writeAgentYamlScalar(dir, 'runtime', toRuntimeProvider(requested));
  } catch (error) {
    const typed = error instanceof LockTimeoutError || error instanceof AgentSpecError;
    if (!typed) throw error;
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

function prepareAgentRun(name, requestedRuntime, passthrough) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    console.error(`Run \`${CLI_NAME} create ${name}\` or \`${CLI_NAME} hire\` first.`);
    process.exit(1);
  }

  const legacyRoot = legacyAcademyRoot(dir);
  if (legacyRoot) {
    delegateLegacyRun(name, passthrough, legacyRoot);
    return null;
  }

  const runtime = resolveRuntime(dir, requestedRuntime);
  writeSkillsScaffold(dir, name);
  const systemPromptPath = renderAcademySystemPrompt(dir, name);
  const projectDir = resolve(process.cwd());
  const inAgentHome = isInside(projectDir, dir);
  const codex =
    runtime === 'codex'
      ? { ...writeCodexProfile(dir, name), runtimeContextPath: codexRuntimeContextPath() }
      : undefined;
  if (codex) writeCodexHooks(codex.runtimeContextPath);
  const nightlyTask = requestedRuntime ? registerNightlyConsolidationTask(dir, name) : null;
  if (nightlyTask && !nightlyTask.registered && process.env.ACADEMY_SKIP_NIGHTLY_TASK !== '1') {
    console.error(
      `Warning: nightly consolidation job "${nightlyTask.id}" not updated: ${nightlyTask.reason}`,
    );
  }

  const env = {
    ...process.env,
    ACADEMY_AGENT_DIR: dir,
    ACADEMY_AGENT_NAME: name,
  };
  return { codex, dir, env, inAgentHome, name, passthrough, projectDir, runtime, systemPromptPath };
}

function launchInAgentHome(context) {
  const { codex, dir, env, name, passthrough, systemPromptPath } = context;
  if (!codex) {
    launchClaude(['--system-prompt-file', systemPromptPath, ...passthrough], {
      cwd: dir,
      env,
      message: `Launching ${name} with Claude Code in agent home (${dir})`,
    });
    return;
  }
  launchCodex(
    [
      '--profile',
      codex.profileName,
      '-C',
      dir,
      '--add-dir',
      dir,
      '-c',
      `model_instructions_file=${JSON.stringify(systemPromptPath)}`,
      ...passthrough,
    ],
    { cwd: dir, env, message: `Launching ${name} with Codex in agent home (${dir})`, ...codex },
  );
}

function launchInProject(context) {
  const { codex, dir, env, name, passthrough, projectDir, systemPromptPath } = context;
  if (codex) {
    writeProjectCodexSkillBridge(projectDir, dir);
    launchCodex(
      [
        '--profile',
        codex.profileName,
        '-C',
        projectDir,
        '--add-dir',
        dir,
        '-c',
        `model_instructions_file=${JSON.stringify(systemPromptPath)}`,
        ...passthrough,
      ],
      {
        cwd: projectDir,
        env: { ...env, ACADEMY_PROJECT_DIR: projectDir },
        message: `Launching ${name} with Codex for project ${basename(projectDir)}`,
        ...codex,
      },
    );
    return;
  }

  const pluginDir = writeProjectPluginInstance(projectDir, name, dir);
  launchClaude(
    ['--plugin-dir', pluginDir, '--system-prompt-file', systemPromptPath, ...passthrough],
    {
      cwd: projectDir,
      env: { ...env, ACADEMY_PROJECT_DIR: projectDir },
      message: `Launching ${name} with Claude Code for project ${basename(projectDir)} (plugin: ${pluginDir})`,
    },
  );
}

export function runAgent(name, runtime, passthrough) {
  const context = prepareAgentRun(name, runtime, passthrough);
  if (!context) return;
  if (context.inAgentHome) launchInAgentHome(context);
  else launchInProject(context);
}

// Runtime-agnostic by construction. An `--agent` on this command line comes
// from a job an earlier build registered; it is accepted and ignored, because
// the persisted scalar is the only source of truth a scheduled run may read.
// The child is spawned bare, so it persists nothing and cannot revert the
// operator's edit — editing agent.yaml is the published way to change a
// runtime, and a nightly that carried a snapshot undid that edit every night.
export function runNightly(name) {
  validateName(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    console.error(`Agent "${name}" not found at ${dir}`);
    process.exit(1);
  }
  const runtime = toRuntimeToken(readRuntimeProvider(dir));

  const markerPath = pendingMarkerPath(dir);
  if (!existsSync(markerPath)) {
    console.log(
      `Skipping nightly consolidation for ${name}: no new session activity since the last run.`,
    );
    return;
  }

  const revision = Number(readJsonFile(markerPath, {}).revision);
  const prompt = [
    "Use the nightly-consolidation skill to consolidate today's pending observation memory.",
    'Update the v3 memory surfaces conservatively, write the dreams report,',
    'and finish with the dreams report path.',
  ].join(' ');
  const providerArgs =
    runtime === 'codex'
      ? [...SCHEDULED_CODEX_PERMISSION_ARGS, prompt]
      : [...SCHEDULED_CLAUDE_PERMISSION_ARGS, '-p', prompt];
  const result = spawnSync(
    process.execPath,
    [ACADEMY_CLI_PATH, 'run', name, '--', ...providerArgs],
    {
      stdio: 'inherit',
      cwd: dir,
      env: {
        ...process.env,
        ACADEMY_SKIP_NIGHTLY_TASK: '1',
        ACADEMY_NIGHTLY_RUN: '1',
      },
    },
  );
  const status = result.status ?? 1;

  if (status === 0 && existsSync(markerPath)) {
    const currentRevision = Number(readJsonFile(markerPath, {}).revision);
    if (currentRevision === revision) unlinkSync(markerPath);
  }

  process.exit(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// `list` — list all agents
// ─────────────────────────────────────────────────────────────────────────────
