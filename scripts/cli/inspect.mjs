import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  AGENTS_ROOT,
  CLI_NAME,
  ENFORCED_SURFACES,
  NAME_RE,
  SURFACES,
  SURFACE_CAPS,
  TOTAL_SURFACE_CAP,
  agentDir,
  checkAgentsRoot,
  contractOk,
  exitJsonError,
  validateName,
} from './core.mjs';
import { archivedAgentDir, archivedAgentNames, assertNotArchived } from './archived.mjs';
import { assertContainedAgentDir } from './lifecycle.mjs';
import { readEventLogWatermark } from './eventlog.mjs';
import { readRuntimeProvider, runtimeProviderOrNull } from './runtime.mjs';
import { academySystemPromptPath, buildAcademySystemPrompt, tokenRecord } from './scaffold.mjs';
import { readAgentYaml } from './yaml.mjs';

export function listAgents() {
  const entries = agentNames();
  if (entries.length === 0 && archivedAgentNames().length === 0) {
    console.log(`(no agents yet — try \`${CLI_NAME} hire\` or \`${CLI_NAME} create <name>\`)`);
    return;
  }
  for (const name of entries) printRosterLine(name, agentDir(name), '');
  for (const name of archivedAgentNames()) {
    printRosterLine(name, archivedAgentDir(name), '(archived) ');
  }
}

function printRosterLine(name, dir, prefix) {
  const role = readAgentYaml(dir).role || '(no role set)';
  console.log(`  ${(prefix + name).padEnd(20)} ${role}`);
}

// The watermark is read before the roster, and that order is the contract. Read
// after, an agent created between the two reads would be missing from the
// roster and below the watermark, so no later `events --since` could ever
// deliver it. Read before, the same agent is in the roster and its event is
// re-delivered, which the client's seq dedup absorbs.
//
// `agents` is the working roster and `archived` names what it leaves out. An
// archived agent that simply vanished would be indistinguishable from a deleted
// one, and this is the documented re-sync path after a replay gap.
export function listAgentsJson() {
  const { lastSeq, logId } = readEventLogWatermark();
  contractOk('list', {
    agents: agentNames().map((name) => agentRecord(name)),
    archived: archivedAgentNames().map((name) =>
      agentRecord(name, { dir: archivedAgentDir(name) }),
    ),
    lastSeq,
    logId,
  });
}

// The single directory-listing entry point for the agents root. The root audit
// runs first so an unusable root is reported rather than read as empty.
// Name-filtering before the stat keeps the archive, lock, and delete-quarantine
// dot-directories out of the roster, and the guarded stat lets an entry deleted
// mid-scan disappear quietly instead of throwing a non-envelope stack trace.
function agentNames() {
  if (!checkAgentsRoot().exists) return [];
  return readAgentsRoot().filter(isAgentDirectory).sort();
}

// A root that passed the audit but cannot be listed is not a usable root, and
// reporting it empty would tell a re-syncing client to drop its whole roster.
function readAgentsRoot() {
  try {
    return readdirSync(AGENTS_ROOT);
  } catch (error) {
    exitJsonError('unsafe_agent_path', `AGENTS_ROOT cannot be listed: ${error.message}`, {
      agentsRoot: resolve(AGENTS_ROOT),
    });
    return [];
  }
}

// lstat, not stat: a symlinked entry is not an agent Academy owns, and `delete`
// rejects it as unsafe. Listing it would make the two commands disagree.
export function isAgentDirectory(entry) {
  if (!NAME_RE.test(entry)) return false;
  try {
    return lstatSync(join(AGENTS_ROOT, entry)).isDirectory();
  } catch {
    return false;
  }
}

// `strictRuntime` is the difference between a roster and an answer. The roster
// degrades per agent so one unparseable `runtime:` cannot hide the healthy
// agents beside it — `list` is the documented re-sync path, and a client locked
// out of it has no recovery left. A direct question about one agent raises
// instead. Neither path ever names a provider the scalar did not.
export function agentRecord(
  name,
  { dir = agentDir(name), includeSurfaces = false, strictRuntime = false } = {},
) {
  const yaml = readAgentYaml(dir);
  const record = {
    name,
    dir: resolve(dir),
    displayName: yaml.displayName || yaml.display_name || yaml.name || name,
    runtimeProvider: strictRuntime ? readRuntimeProvider(dir) : runtimeProviderOrNull(dir),
  };
  if (yaml.role) record.role = yaml.role;
  if (includeSurfaces) record.surfaces = surfacePresence(dir);
  return record;
}

function surfacePresence(dir) {
  return Object.fromEntries(
    SURFACES.map((surface) => [surface, existsSync(join(dir, `${surface}.md`))]),
  );
}

export function inspectAgent(name, json) {
  validateName(name);
  checkAgentsRoot();
  assertNotArchived(name);
  const dir = agentDir(name);
  if (!existsSync(dir)) {
    const message = `Agent "${name}" not found at ${dir}`;
    if (json) exitJsonError('agent_not_found', message, { name });
    console.error(message);
    process.exit(1);
  }
  assertContainedAgentDir(name, dir);

  const record = agentRecord(name, { includeSurfaces: true, strictRuntime: true });
  if (json) {
    contractOk('inspect', record);
    return;
  }

  console.log(`${record.name} (${record.runtimeProvider})`);
  console.log(`  dir: ${record.dir}`);
  console.log(`  displayName: ${record.displayName}`);
  if (record.role) console.log(`  role: ${record.role}`);
}

function roundPercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function promptTokenReport(name) {
  validateName(name);
  checkAgentsRoot();
  assertNotArchived(name);
  const dir = resolve(agentDir(name));
  if (!existsSync(dir)) return { missing: true, dir };
  assertContainedAgentDir(name, dir);

  const built = buildAcademySystemPrompt(dir, name);
  const total = tokenRecord(built.prompt);
  const overheadText = [
    ...built.intro,
    ...built.surfaces.flatMap((surface) => [surface.marker, '']),
  ].join('\n');
  const overhead = tokenRecord(overheadText);
  const surfaces = built.surfaces.map((surface) => {
    const count = tokenRecord(surface.content);
    return {
      name: surface.name,
      file: surface.file,
      path: surface.path,
      exists: surface.exists,
      ...count,
      percent: roundPercent(count.estimatedTokens, total.estimatedTokens),
    };
  });

  return {
    agent: name,
    dir,
    promptPath: academySystemPromptPath(dir),
    tokenizer: 'estimated:chars-and-words-v1',
    total,
    overhead: {
      ...overhead,
      percent: roundPercent(overhead.estimatedTokens, total.estimatedTokens),
    },
    surfaces,
  };
}

export function printPromptTokens(name, json) {
  const report = promptTokenReport(name);
  if (report.missing) {
    const message = `Agent "${name}" not found at ${report.dir}`;
    if (json) exitJsonError('agent_not_found', message, { name });
    console.error(message);
    process.exit(1);
  }

  if (json) {
    contractOk('tokens', report);
    return;
  }

  console.log(`${report.agent} prompt token estimate`);
  console.log(`tokenizer: ${report.tokenizer}`);
  console.log('');
  console.log(
    `${'total'.padEnd(12)} ${String(report.total.estimatedTokens).padStart(7)} tokens  ${String(report.total.chars).padStart(7)} chars`,
  );
  console.log(
    `${'overhead'.padEnd(12)} ${String(report.overhead.estimatedTokens).padStart(7)} tokens  ${String(report.overhead.chars).padStart(7)} chars  ${report.overhead.percent.toFixed(1).padStart(5)}%`,
  );
  console.log('');
  for (const surface of report.surfaces) {
    console.log(
      `${surface.name.padEnd(12)} ${String(surface.estimatedTokens).padStart(7)} tokens  ${String(surface.chars).padStart(7)} chars  ${surface.percent.toFixed(1).padStart(5)}%`,
    );
  }
}

export function printSurfaceBudget(name, json) {
  const tokenReport = promptTokenReport(name);
  if (tokenReport.missing) {
    const message = `Agent "${name}" not found at ${tokenReport.dir}`;
    if (json) exitJsonError('agent_not_found', message, { name });
    console.error(message);
    process.exit(1);
  }

  const surfaces = tokenReport.surfaces.map((surface) => {
    const cap = SURFACE_CAPS[surface.name];
    const overBy = Math.max(0, surface.estimatedTokens - cap);
    return {
      name: surface.name,
      estimatedTokens: surface.estimatedTokens,
      cap,
      overBy,
      withinCap: overBy === 0,
      enforced: ENFORCED_SURFACES.has(surface.name),
    };
  });
  const totalEstimatedTokens = surfaces.reduce((sum, surface) => sum + surface.estimatedTokens, 0);
  const violations = surfaces.filter((surface) => !surface.withinCap);
  const report = {
    agent: tokenReport.agent,
    dir: tokenReport.dir,
    withinBudget: !violations.some((surface) => surface.enforced),
    total: {
      estimatedTokens: totalEstimatedTokens,
      cap: TOTAL_SURFACE_CAP,
      overBy: Math.max(0, totalEstimatedTokens - TOTAL_SURFACE_CAP),
    },
    surfaces,
    violations,
  };

  const exitCode = report.violations.some((surface) => surface.enforced) ? 1 : 0;
  if (json) {
    contractOk('budget', report);
    return;
  }

  console.log(`${report.agent} prompt budget`);
  console.log(
    `${'total'.padEnd(12)} ${String(report.total.estimatedTokens).padStart(7)} / ${String(report.total.cap).padStart(4)} tokens  ${report.total.overBy === 0 ? 'OK' : `OVER by ${report.total.overBy}`}`,
  );
  console.log('');
  for (const surface of report.surfaces) {
    const status = surface.withinCap ? 'OK' : `OVER by ${surface.overBy}`;
    const mode = surface.enforced ? 'enforced' : 'advisory';
    console.log(
      `${surface.name.padEnd(12)} ${String(surface.estimatedTokens).padStart(7)} / ${String(surface.cap).padStart(4)} tokens  ${status}  ${mode}`,
    );
  }
  console.log('');
  console.log(exitCode === 0 ? 'PASS' : 'FAIL');
  process.exitCode = exitCode;
}

// ─────────────────────────────────────────────────────────────────────────────
// `clean` — truncate transient surfaces
// ─────────────────────────────────────────────────────────────────────────────
