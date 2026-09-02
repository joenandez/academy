import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { AGENTS_ROOT, withFileLock } from './core.mjs';

// The lifecycle event log is the durable history of every specialist hired and
// removed. It is append-only and never trimmed, so the sequence it carries is
// permanent and a client can dedup and resume on it.

function agentsRootParent() {
  return dirname(resolve(AGENTS_ROOT));
}

export function eventLogPath() {
  return join(agentsRootParent(), 'events.jsonl');
}

// Raised when the event log holds bytes but no record Academy can sequence
// from. Thrown rather than exited so the caller can roll its work back first.
export class LogCorruptError extends Error {
  constructor(message, eventLog) {
    super(message);
    this.code = 'log_corrupt';
    this.fields = { eventLog };
  }
}

function readEventLog(eventsPath) {
  if (!existsSync(eventsPath)) return null;
  const text = readFileSync(eventsPath, 'utf8');
  return text.trim() === '' ? null : text;
}

function recordSeq(line) {
  if (line.trim() === '') return null;
  try {
    const { seq } = JSON.parse(line);
    return Number.isInteger(seq) && seq >= 1 ? seq : null;
  } catch {
    return null;
  }
}

// Scan backwards to the last record that parses. A final line torn by a
// disk-full or a kill -9 must never reset the sequence to 1: duplicate seq
// values in one log silently corrupt every client that dedups on them.
function lastSeq(text, eventsPath) {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const seq = recordSeq(lines[i]);
    if (seq !== null) return seq;
  }
  throw new LogCorruptError(
    `Event log ${eventsPath} has bytes but no parseable record. Move it aside to start a new log.`,
    eventsPath,
  );
}

function logCreatedRecord() {
  // The log declares its own identity in its own first record, so a deleted and
  // rebuilt log is a new logId and a client can tell the epochs apart.
  return { seq: 1, event: 'log_created', logId: randomUUID(), ts: new Date().toISOString() };
}

export function appendLifecycleEvent(event, name, dir, extra = {}) {
  const parent = agentsRootParent();
  const eventsPath = eventLogPath();
  withFileLock(join(parent, 'events.lock'), () => {
    const text = readEventLog(eventsPath);
    const records = text === null ? [logCreatedRecord()] : [];
    const previous = text === null ? 1 : lastSeq(text, eventsPath);
    records.push({
      seq: previous + 1,
      event,
      agentName: name,
      agentDir: dir,
      ts: new Date().toISOString(),
      ...extra,
    });
    // A torn final line has no newline. Start a fresh one so this record lands
    // parseable instead of extending the damaged line.
    const separator = text !== null && !text.endsWith('\n') ? '\n' : '';
    appendFileSync(eventsPath, separator + records.map((r) => `${JSON.stringify(r)}\n`).join(''));
  });
}

// The replay read. Deliberately more forgiving than the append path: a log with
// bytes but no parseable record is an operator repair only when Academy is
// about to write to it. On replay it simply carries no servable sequence, and
// the one replay rule in `events` answers that without a second code.
export function readSequencedRecords() {
  const text = readEventLog(eventLogPath());
  if (text === null) return [];
  return text
    .split('\n')
    .map(parseRecord)
    .filter((record) => record !== null);
}

function parseRecord(line) {
  if (line.trim() === '') return null;
  try {
    const record = JSON.parse(line);
    return Number.isInteger(record.seq) && record.seq >= 1 ? record : null;
  } catch {
    return null;
  }
}

// The bounds a client dedups and resumes on, derived from records the caller
// already holds. A command that ships records must publish the bounds of those
// same records: read the log twice and the watermark can be strictly newer than
// the response, so a client adopting it as its resume point skips every record
// that landed in between, permanently.
export function boundsOf(records) {
  if (records.length === 0) return { firstSeq: 0, lastSeq: 0, logId: null };
  return {
    firstSeq: records[0].seq,
    lastSeq: records[records.length - 1].seq,
    logId: records[0].logId ?? null,
  };
}

// `firstSeq` is derived, not assumed: nothing trims, so it reads 1 for every
// log Academy has written, and deriving it keeps that an observation rather
// than a promise.
export function readEventLogWatermark() {
  return boundsOf(readSequencedRecords());
}
