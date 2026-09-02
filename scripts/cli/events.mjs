import { checkAgentsRoot, contractOk, exitJsonError } from './core.mjs';
import { boundsOf, readSequencedRecords } from './eventlog.mjs';

// Delivery is at-least-once and `seq` is the dedup key: a client applies each
// seq exactly once, so replaying an overlapping range must derive the same
// state. Nothing here filters by anything but the sequence.
export function readEvents({ since, logId, json, invalidOption }) {
  if (invalidOption !== undefined) return unreadableInvocation(invalidOption, json);
  checkAgentsRoot(json);
  // One read. The bounds are derived from the very records this call ships, so
  // the watermark a client adopts can never be newer than what it was given.
  const records = readSequencedRecords();
  const bounds = boundsOf(records);
  const requestedSeq = parseWatermark(since);

  if (!servable(requestedSeq, logId, bounds)) {
    replayUnavailable(since, logId, bounds, json);
    return;
  }

  const events = records.filter((record) => record.seq > requestedSeq);
  if (json) {
    contractOk('events', { ...bounds, events });
    return;
  }
  printEvents(bounds, events);
}

// Answered before the log is touched. A client that asked for --json and got
// human text has no code, no contract_version and no way to tell a rejected
// invocation from a crash, so the option it cannot use is named in the envelope.
// `invalid_spec` is the published code for a request Academy will not accept.
function unreadableInvocation(option, json) {
  const message = `Unknown events option: ${option}. Use --since <seq> [--logid <id>] [--json].`;
  if (json) exitJsonError('invalid_spec', message, { option });
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** A watermark is a non-negative integer. Zero means "I have applied nothing". */
function parseWatermark(since) {
  return /^\d+$/.test(String(since)) ? Number(since) : null;
}

// One failure rule, not a table. A watermark that cannot be served exactly is
// never answered with an empty success, because a client cannot tell that
// apart from "you are up to date" and would silently diverge.
function servable(requestedSeq, logId, bounds) {
  if (requestedSeq === null) return false;
  if (requestedSeq > bounds.lastSeq) return false;
  return logId === null || logId === bounds.logId;
}

function replayUnavailable(since, logId, bounds, json) {
  const message = logIdMismatch(logId, bounds)
    ? `Event log ${bounds.logId ?? '(absent)'} is not the log ${logId} this watermark came from. Re-sync from list.`
    : `Sequence ${since} cannot be served from a log holding ${bounds.firstSeq}..${bounds.lastSeq}. Re-sync from list.`;
  const fields = { requestedSeq: normaliseRequested(since), ...bounds };
  if (json) exitJsonError('replay_unavailable', message, fields);
  console.error(`Error: ${message}`);
  process.exit(1);
}

function logIdMismatch(logId, bounds) {
  return logId !== null && logId !== bounds.logId;
}

// Echo an unreadable watermark back verbatim so the client can see what it
// sent; a readable one is echoed as the number it is.
function normaliseRequested(since) {
  const parsed = parseWatermark(since);
  return parsed === null ? String(since) : parsed;
}

function printEvents(bounds, events) {
  console.log(`log ${bounds.logId ?? '(none)'}  seq ${bounds.firstSeq}..${bounds.lastSeq}`);
  for (const record of events) {
    console.log(`  ${String(record.seq).padStart(6)}  ${record.event}  ${record.agentName ?? ''}`);
  }
}
