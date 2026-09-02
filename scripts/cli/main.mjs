import { resolve } from 'node:path';
import { parseArgs, printUsage } from './args.mjs';
import {
  ACADEMY_ROOT,
  AGENTS_ROOT,
  CONTRACT_VERSION,
  contractOk,
  exitJsonError,
  jsonMode,
  setActiveCommand,
} from './core.mjs';
import { archiveAgent, unarchiveAgent } from './archive.mjs';
import { createAgent } from './create.mjs';
import { UNIMPLEMENTED_COMMANDS, reportHealth } from './doctor.mjs';
import { readEvents } from './events.mjs';
import { hireAgent } from './hire.mjs';
import { hireFromSpec } from './hire-headless.mjs';
import {
  inspectAgent,
  listAgents,
  listAgentsJson,
  printPromptTokens,
  printSurfaceBudget,
} from './inspect.mjs';
import { cleanAgent, deleteAgent, destroyAgent } from './lifecycle.mjs';
import { backfillOwnership } from './migrate.mjs';
import { notesAdd, notesList } from './notes.mjs';
import { renameAgent } from './rename.mjs';
import { runAgent, runNightly } from './run.mjs';
import { readSessions } from './sessions.mjs';

const COMMAND_HANDLERS = {
  ...Object.fromEntries(UNIMPLEMENTED_COMMANDS.map((command) => [command, unimplementedCommand])),
  doctor: (parsed) => reportHealth(parsed.json),
  help: (parsed) => {
    printUsage();
    process.exit(parsed.exitCode ?? 0);
  },
  create: (parsed) => createAgent(parsed.name, parsed.json),
  // `--spec` is the only thing that selects the headless form; without it the
  // interactive launch runs exactly as it always has.
  hire: (parsed) =>
    parsed.spec === null ? hireAgent(parsed.passthrough, parsed.json) : hireFromSpec(parsed),
  run: (parsed) => runAgent(parsed.name, parsed.runtime, parsed.passthrough),
  nightly: (parsed) => runNightly(parsed.name),
  events: (parsed) => readEvents(parsed),
  migrate: (parsed) => backfillOwnership(parsed),
  rename: (parsed) => renameAgent(parsed.name, parsed.newName, parsed.json, parsed.invalidOption),
  archive: (parsed) => archiveAgent(parsed.name, parsed.json),
  unarchive: (parsed) => unarchiveAgent(parsed.name, parsed.json),
  sessions: (parsed) => readSessions(parsed),
  list: (parsed) => (parsed.json ? listAgentsJson() : listAgents()),
  inspect: (parsed) => inspectAgent(parsed.name, parsed.json),
  tokens: (parsed) => printPromptTokens(parsed.name, parsed.json),
  budget: (parsed) => printSurfaceBudget(parsed.name, parsed.json),
  clean: (parsed) => cleanAgent(parsed.name),
  delete: (parsed) => deleteAgent(parsed.name, parsed.json),
  destroy: (parsed) => destroyAgent(parsed.name, parsed.force),
  root: (parsed) => {
    if (parsed.json)
      contractOk('root', { packageRoot: ACADEMY_ROOT, agentsRoot: resolve(AGENTS_ROOT) });
    else console.log(ACADEMY_ROOT);
  },
  notes: (parsed) => {
    if (parsed.action === 'add') notesAdd(parsed.name, parsed.text);
    else notesList(parsed.name, parsed.last);
  },
};

// `doctor` advertises the whole contract_version 1 command set, including the
// commands later phases build. Answering those in the envelope is what keeps
// the capability list honest: a client that calls what doctor named gets a
// parseable failure naming the gap, not a usage dump with no contract shape.
// `internal_error` is the floor under the envelope and the only one of the
// fifteen codes that fits — inventing a sixteenth is not permitted.
function unimplementedCommand(parsed) {
  const message = `Command "${parsed.command}" is published at contract_version ${CONTRACT_VERSION} but is not implemented in this build.`;
  if (parsed.json) exitJsonError('internal_error', message);
  console.error(`Error: ${message}`);
  process.exit(1);
}

function main() {
  const parsed = parseArgs(process.argv.slice(2));
  setActiveCommand(parsed.command, parsed.json);
  const handler = COMMAND_HANDLERS[parsed.command];
  if (!handler) {
    printUsage();
    process.exit(1);
  }
  try {
    handler(parsed);
  } catch (error) {
    // The floor under the envelope, not the primary handler: a --json caller
    // gets a parseable failure for a throw no command anticipated. A shell user
    // keeps the stack trace, which is more useful at a terminal.
    if (!jsonMode()) throw error;
    exitJsonError('internal_error', error.message);
  }
}

main();
