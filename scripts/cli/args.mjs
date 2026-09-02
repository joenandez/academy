import { CLI_NAME, NAME_RE, RUNTIMES } from './core.mjs';
import { UNIMPLEMENTED_COMMANDS } from './doctor.mjs';

const COMMAND_PARSERS = {
  // Published at contract_version 1 and built by a later phase. Parsed here so
  // dispatch can answer them in the envelope instead of a usage dump.
  ...Object.fromEntries(UNIMPLEMENTED_COMMANDS.map((command) => [command, jsonOnlyCommand])),
  doctor: (command, rest) => jsonOnlyCommand(command, rest),
  create: (command, rest) => namedJsonCommand(command, rest),
  hire: (command, rest) => parseHireArgs(command, rest),
  run: (_command, rest) => parseRunArgs(rest),
  nightly: (_command, rest) => {
    const parsed = parseRunArgs(rest);
    return parsed.command === 'help' ? parsed : { ...parsed, command: 'nightly' };
  },
  events: (command, rest) => parseEventsArgs(command, rest),
  migrate: (command, rest) => parseMigrateArgs(command, rest),
  rename: (command, rest) => parseRenameArgs(command, rest),
  archive: (command, rest) => namedJsonCommand(command, rest),
  unarchive: (command, rest) => namedJsonCommand(command, rest),
  sessions: (command, rest) => parseSessionsArgs(command, rest),
  list: (command, rest) => jsonOnlyCommand(command, rest),
  inspect: (command, rest) => namedJsonCommand(command, rest),
  tokens: (command, rest) => namedJsonCommand(command, rest),
  budget: (command, rest) => namedJsonCommand(command, rest),
  clean: (command, rest) => ({ command, name: rest[0] }),
  delete: (command, rest) => namedJsonCommand(command, rest),
  destroy: (command, rest) => ({ command, name: rest[0], force: rest.includes('--force') }),
  root: (command, rest) => jsonOnlyCommand(command, rest),
  notes: (_command, rest) => parseNotesArgs(rest),
};

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '-h' || command === '--help') return { command: 'help' };
  const parser = COMMAND_PARSERS[command];
  if (parser) return parser(command, rest);
  console.error(`Unknown command: ${command}`);
  return { command: 'help', exitCode: 1 };
}

function hasFlag(args, flag) {
  return args.includes(flag);
}

function jsonOnlyCommand(command, rest) {
  return { command, json: hasFlag(rest, '--json') };
}

function namedJsonCommand(command, rest) {
  return { command, name: rest.find((arg) => arg !== '--json'), json: hasFlag(rest, '--json') };
}

// `hire [--spec <path>] [--json] [-- ...]`. `--spec` selects the headless form
// and nothing else does: without it the interactive launch parses exactly as it
// always has, including the positional token that seeds the first user message.
// An option Academy does not know is only a fault in the headless form, because
// that is the only form that publishes an envelope to answer it in.
function parseHireArgs(command, rest) {
  const json = hasFlag(rest, '--json');
  const dashIdx = rest.indexOf('--');
  const optionArgs = dashIdx >= 0 ? rest.slice(0, dashIdx) : rest;
  let spec = null;
  let invalidOption = null;
  for (let i = 0; i < optionArgs.length; i++) {
    const arg = optionArgs[i];
    if (arg === '--json') continue;
    else if (arg === '--spec') spec = optionArgs[++i] ?? '';
    else if (arg.startsWith('--spec=')) spec = arg.slice('--spec='.length);
    else if (arg.startsWith('--')) invalidOption ??= arg;
  }
  return { command, json, spec, invalidOption, passthrough: extractPassthrough(rest) };
}

function parseRunArgs(rest) {
  const name = rest[0];
  const afterName = rest.slice(1);
  const dashIdx = afterName.indexOf('--');
  const optionArgs = dashIdx >= 0 ? afterName.slice(0, dashIdx) : afterName;
  const passthrough = dashIdx >= 0 ? afterName.slice(dashIdx + 1) : [];
  // No default here. The agent is not resolved yet, and defaulting before it is
  // what re-registered a codex agent's nightly job as claude-code for ten
  // nights. A null runtime means "not explicit"; `run` reads the persisted
  // scalar instead.
  let runtime = null;

  for (let i = 0; i < optionArgs.length; i++) {
    const arg = optionArgs[i];
    if (arg === '--agent') {
      const value = optionArgs[++i];
      if (!RUNTIMES.has(value))
        return invalidRunOption(`Invalid --agent value: ${value ?? '(none)'}`);
      runtime = value;
    } else if (arg?.startsWith('--agent=')) {
      const value = arg.slice('--agent='.length);
      if (!RUNTIMES.has(value))
        return invalidRunOption(`Invalid --agent value: ${value || '(none)'}`);
      runtime = value;
    } else if (arg) {
      return invalidRunOption(`Unknown run option: ${arg}`);
    }
  }

  return { command: 'run', name, runtime, passthrough };
}

function invalidRunOption(message) {
  console.error(`${message}. Use --agent claude-code or --agent codex before --.`);
  return { command: 'help', exitCode: 1 };
}

// `events --since <seq> [--logid <id>] [--json]`. `--since` stays a raw string:
// only `events` can answer an unreadable watermark in the envelope, and
// reinterpreting one here would serve the whole log to a client that asked for
// part of it.
function parseEventsArgs(command, rest) {
  let since = '0';
  let logId = null;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') continue;
    else if (arg === '--since') since = rest[++i] ?? '';
    else if (arg.startsWith('--since=')) since = arg.slice('--since='.length);
    else if (arg === '--logid') logId = rest[++i] ?? '';
    else if (arg.startsWith('--logid=')) logId = arg.slice('--logid='.length);
    // Not a usage dump. The command stays `events` so dispatch keeps the --json
    // flag and the command name, and `events` answers the fault in the envelope
    // it publishes rather than on stdout as human text.
    else return { command, json: hasFlag(rest, '--json'), invalidOption: arg };
  }
  return { command, json: hasFlag(rest, '--json'), since, logId };
}

// `migrate [--dry-run] [--json]`. An option Academy does not know stays on the
// `migrate` command rather than reaching the usage printer, so the handler
// answers it inside the envelope the caller asked for.
function parseMigrateArgs(command, rest) {
  const json = hasFlag(rest, '--json');
  let dryRun = false;
  for (const arg of rest) {
    if (arg === '--json') continue;
    else if (arg === '--dry-run') dryRun = true;
    else return { command, json, invalidOption: arg };
  }
  return { command, json, dryRun };
}

// `sessions [--agent <name>] [--json]`. Like `events` and `migrate`, an option
// Academy does not know is answered by the command in its own envelope.
function parseSessionsArgs(command, rest) {
  const json = hasFlag(rest, '--json');
  let agent;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--json') continue;
    else if (arg === '--agent') agent = rest[++i] ?? '';
    else if (arg.startsWith('--agent=')) agent = arg.slice('--agent='.length);
    else return { command, json, invalidOption: arg };
  }
  return { command, json, agent };
}

// `rename <old> <new> [--json]`. Like `events`, `migrate` and `sessions`, an
// option Academy does not know stays on the command so the handler answers it
// inside the envelope the caller asked for.
function parseRenameArgs(command, rest) {
  const json = hasFlag(rest, '--json');
  const positional = [];
  for (const arg of rest) {
    if (arg === '--json') continue;
    else if (arg.startsWith('--')) return { command, json, invalidOption: arg };
    else positional.push(arg);
  }
  return { command, json, name: positional[0], newName: positional[1] };
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

export function printUsage() {
  console.log(
    `
Usage: ${CLI_NAME} <command> [options]

Commands:
  doctor [--json]         Report Academy's version, roots, runtimes, and capability
  create <name> [--json]  Scaffold a new portable agent at ~/.academy/agents/<name>/
  hire                    Interactive hire flow — produces 8 boot files via Claude Code
  hire --spec <path> [--json]
                          Headless hire from a JSON specification file
                          {name, role, objective, runtime?}
  run <name> [--agent claude-code|codex] [-- ...]
                          Launch an agent with its persisted runtime; --agent
                          overrides it and persists the new choice
  nightly <name>          Run scheduled consolidation with the agent's persisted
                          runtime when observation memory is pending
  events --since <seq> [--logid <id>] [--json]
                          Replay lifecycle events after a sequence
  migrate [--dry-run] [--json]
                          Write the missing ownership marker for agents inside
                          AGENTS_ROOT; --dry-run reports without writing
  sessions [--agent <name>] [--json]
                          List sessions whose agent directory is inside
                          AGENTS_ROOT
  rename <old> <new> [--json]
                          Move an agent to a new name, rewriting its ownership
                          marker and re-registering its nightly job
  archive <name> [--json] Move an agent into the archived holding area
  unarchive <name> [--json]
                          Restore an archived agent to its canonical slot
  list                    List all agents
  inspect <name>          Inspect one agent
  tokens <name>           Estimate generated prompt tokens by surface
  budget <name>           Check prompt token budget by surface
  clean <name>            Truncate transient surfaces (notes.md, threads.md)
  destroy <name> --force  Remove an agent and all its files
  root                    Print Academy package root
  notes add [<agent>] "…" Append a short note to the agent's notes.md
  notes list [<agent>] [--last N]  Show recent notes (default last 12)

Examples:
  ${CLI_NAME} doctor --json
  ${CLI_NAME} create kai
  ${CLI_NAME} hire
  ${CLI_NAME} hire --spec ./kai.json --json
  ${CLI_NAME} run kai
  ${CLI_NAME} run kai -- -p "Run today's analytics review"
  ${CLI_NAME} tokens kai
  ${CLI_NAME} budget kai --json
  ${CLI_NAME} events --since 42 --logid 8f2c1d4e --json
  ${CLI_NAME} migrate --dry-run --json
  ${CLI_NAME} sessions --agent kai --json
  ${CLI_NAME} rename kai nova --json
  ${CLI_NAME} notes add "User prefers short status updates before edits"
  ${CLI_NAME} notes list --last 20
  `.trim(),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────────────────────
