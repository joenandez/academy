# Academy client integration guide

**Contract version 1.**

This is the whole published contract between Academy and a client that drives
it. It is written for an author of a client product — a desktop app, a web
service, another CLI — who will integrate Academy without reading Academy's
source. Everything a client may depend on is here. Anything not here is
internal and may change in any release.

Academy emits data. Clients render it. A client asks; it never guesses and
never reads what is not published.

---

## Contents

1. [Install and provision](#1-install-and-provision)
2. [The response envelope](#2-the-response-envelope)
3. [Versions and the compatibility floor](#3-versions-and-the-compatibility-floor)
4. [Discovery: call `doctor` first](#4-discovery-call-doctor-first)
5. [The fourteen published commands](#5-the-fourteen-published-commands)
6. [Commands Academy has but does not publish](#6-commands-academy-has-but-does-not-publish)
7. [The fifteen error codes](#7-the-fifteen-error-codes)
8. [The event log](#8-the-event-log)
9. [The agent directory layout](#9-the-agent-directory-layout)
10. [The document contract: eight boot surfaces](#10-the-document-contract-eight-boot-surfaces)
11. [External dependencies](#11-external-dependencies)
12. [The one client-specific exception](#12-the-one-client-specific-exception)
13. [Verify your integration](#13-verify-your-integration)
14. [What is not contract](#14-what-is-not-contract)

---

## 1. Install and provision

Academy is a Node package with no npm dependencies. It needs Node 18 or
later, and two external binaries described in §11. The launcher is `bin/academy`.

Academy stores agents in an **agents root**. The root is
`$AGENTS_ROOT` when that variable is set, and `~/.academy/agents` otherwise. A
client that manages its own root sets `AGENTS_ROOT` on every invocation. Two
installs with different roots are fully independent.

Never assume a path. `doctor` reports `agentsRoot` and `eventLog`, and
`sessions` reports `sessionIndex`. Read them from the payload.

**Environment variables a client may set**

| Variable | Effect |
| --- | --- |
| `AGENTS_ROOT` | The agents root. Default `~/.academy/agents`. |
| `ACADEMY_CLI_NAME` | The name Academy calls itself in human help text. Default `academy`. It does not change any command, flag, or payload. |
| `ACADEMY_HELM_TASKS_BIN` | Absolute path of the `helm-tasks` scheduler. See §11. |
| `ACADEMY_CLAUDE_BIN` | Absolute path of the `claude` runtime. |
| `ACADEMY_CODEX_BIN` | Absolute path of the `codex` runtime. |
| `ACADEMY_HIRE_TIMEOUT_MS` | Milliseconds `hire --spec` waits for the runtime. Default `600000`. |
| `ACADEMY_MEMORY_BRIDGE` | `1` enables the memory bridge. See §12. Off by default. |

A missing agents root is not an error. Academy creates the default root on
first use. A client provisions Academy silently and calls `doctor` before it
renders anything.

---

## 2. The response envelope

Every published command accepts `--json`. With `--json`, the command answers
with exactly one JSON document and nothing else.

**Success — on stdout, exit 0:**

```json
{
  "contract_version": 1,
  "ok": true,
  "command": "list",
  "agents": [],
  "archived": [],
  "lastSeq": 0,
  "logId": null
}
```

**Failure — on stderr, exit 1:**

```json
{
  "contract_version": 1,
  "ok": false,
  "command": "inspect",
  "error": {
    "code": "agent_not_found",
    "message": "Agent \"ghost\" not found at /home/u/.academy/agents/ghost",
    "name": "ghost"
  }
}
```

**The rules, all of them:**

- `contract_version`, `ok` and `command` are always the first three keys.
- The payload is spread at the top level on success. There is no `data`
  wrapper.
- `error.code` is one of the fifteen strings in §7. Switch on it.
- `error.message` is human text. It is never stable. Do not parse it and never
  switch on it.
- `error` carries extra context keys per code. They are listed in §7.
- **Exit status is 0 if and only if `ok` is true.**
- Success writes only to stdout. Failure writes only to stderr.
- One command breaks the stream rule in a defined way: a `doctor` failure
  carries its whole payload *and* an `error` object. See §4.

Without `--json`, every command prints human text instead. Human text is not
contract. A client always passes `--json`.

**`budget` needs one extra note.** An agent over its token cap is a report, not
a failure: `budget --json` answers `ok: true` and exits 0, and `withinBudget`
is `false`. The human form of `budget` exits 1 in that case. A client reads
`withinBudget`, never the exit status.

---

## 3. Versions and the compatibility floor

Two version numbers move independently.

- **`contract_version`** is the shape of the envelope and the meaning of every
  payload and error code in this guide. It is `1`, and it is frozen.
- **The package version** is the npm semver of the build. It moves on every
  release.

**Pin the contract, not the package.** A client asserts
`doctor.contracts.includes(1)` and refuses anything else. It must not compare
package versions.

`doctor` answers both:

```json
{ "contracts": [1], "version": "0.3.0-phase0+4c97d8d" }
```

`version` is the package version. A **source checkout** appends
`+<git describe --always --dirty>` as semver build metadata, so two checkouts
at different commits never report the same string. An **install** has no
checkout to describe and reports the published version bare, with no `+`.
Treat `version` as an opaque identity string for support and telemetry. Never
branch on it.

**The compatibility floor.** A build whose `doctor` payload carries no
`contract_version` is incompatible. There is no migration path and no shim. A
client that finds no `contract_version` reports a setup problem and reprovisions
Academy. It must not attempt to parse the response.

There is no `academy --version` command. `doctor --json` is the only published
source of the version.

---

## 4. Discovery: call `doctor` first

`doctor --json` is the availability gate. It is the one call a client may make
against an Academy it knows nothing about, and it is read-only. **Call it
before rendering any UI.**

```sh
academy doctor --json
```

```json
{
  "contract_version": 1,
  "ok": true,
  "command": "doctor",
  "contracts": [1],
  "version": "0.3.0-phase0+4c97d8d",
  "packageRoot": "/opt/academy",
  "agentsRoot": "/home/u/.academy/agents",
  "eventLog": "/home/u/.academy/events.jsonl",
  "commands": ["doctor", "list", "inspect", "tokens", "budget", "sessions",
               "events", "create", "hire", "rename", "archive", "unarchive",
               "delete", "migrate"],
  "runtimes": { "claude_code": { "available": true },
                "codex": { "available": false } },
  "errors": []
}
```

**Exactly eight payload keys, in this order:**

| Key | Meaning |
| --- | --- |
| `contracts` | Contract versions this build speaks. `[1]` today. |
| `version` | Package version, plus build metadata for a checkout. §3. |
| `packageRoot` | Absolute path of the Academy installation. |
| `agentsRoot` | Absolute path of the agents root in use. |
| `eventLog` | Absolute path of the lifecycle event log. §8. |
| `commands` | The published command list. §5. Ordered; the order is stable. |
| `runtimes` | `{ <provider>: { available: boolean } }` for `claude_code` and `codex`. |
| `errors` | The **health** channel. See below. |

**A degraded install is still `ok: true`.** An unavailable runtime, agents
missing an ownership marker, an agent with an unreadable runtime — none of these
fail `doctor`. The client renders its Academy experience and repairs what it
can.

**The one state answered `ok: false`** is an agents root that fails its audit:
a symlinked root, a root that is not a directory, a root resolving outside its
parent, or a named root whose parent does not exist. Every agent-addressed
command raises `unsafe_agent_path` on such a root, so a client told `ok: true`
would render an interface whose first call fails. The failure envelope still
carries the whole payload beside the `error` object, because a client parsing
the failure still needs the version and contract it is talking to:

```json
{
  "contract_version": 1, "ok": false, "command": "doctor",
  "contracts": [1], "version": "...", "packageRoot": "...",
  "agentsRoot": "...", "eventLog": "...", "commands": [...],
  "runtimes": {...}, "errors": [],
  "error": { "code": "unsafe_agent_path",
             "message": "AGENTS_ROOT must not be a symlink: /tmp/x/agents",
             "agentsRoot": "/tmp/x/agents" }
}
```

This is the only command whose failure envelope carries a payload.

### `errors[]` is a health channel, not the error channel

This is the single thing client authors get wrong. Academy has **two separate
channels** and they never mix.

|  | The error channel | The health channel |
| --- | --- | --- |
| Where | `error.code` in a failure envelope | `doctor.errors[]` |
| Shape | `{ code, message, ...context }` | `{ code, count }` |
| Means | This command failed | This install has *n* degraded things |
| Values | The fifteen codes in §7 | The three codes below |
| Effect on `ok` | `ok: false` | none — `ok` stays `true` |

**No code from one channel ever appears in the other.** None of the fifteen
error codes can appear in `doctor.errors[]`, and none of these three health
codes can appear in an `error` object.

| Health code | Counts | Repair |
| --- | --- | --- |
| `unowned_agents` | Agent directories inside the root with no valid `.academy-agent.json`. Every lifecycle command fails on them. | `academy migrate --json` |
| `invalid_runtime_agents` | Agents whose `agent.yaml` `runtime:` is outside `claude_code` / `codex`. | Rewrite `runtime:` to a valid value. |
| `unattributable_sessions` | Session index records written before the index carried an agent directory. They are historical, never rewritten. | None. They are excluded from `sessions`. |

Zero counts are omitted, so a healthy install reports `"errors": []`.

---

## 5. The fourteen published commands

These are exactly the commands in `doctor.commands`, in that order. Nothing
else is contract. Every one accepts `--json`.

Two shapes recur.

**`<agentRecord>`** — the roster record for one agent:

```json
{
  "name": "kai",
  "dir": "/home/u/.academy/agents/kai",
  "displayName": "Kai",
  "runtimeProvider": "claude_code",
  "role": "Data analyst"
}
```

`name`, `dir`, `displayName` and `runtimeProvider` are always present. `role`
is present only when `agent.yaml` declares a non-empty one. `dir` is absolute
and is the joined path, not a resolved symlink target, so a client may key
agents on it and match it against the record `create` gave it.
`runtimeProvider` is `claude_code`, `codex`, or `null` when `agent.yaml`
declares a value Academy does not recognise.

**`<jobId>`** — the identifier of an agent's nightly consolidation job, always
`<name>-nightly-consolidation`, or `null` when no job was registered.

### `doctor [--json]`

See §4.

### `list [--json]`

The roster, and the atomic re-sync point for the event log.

```json
{
  "contract_version": 1, "ok": true, "command": "list",
  "agents": [ "<agentRecord>" ],
  "archived": [ "<agentRecord>" ],
  "lastSeq": 42,
  "logId": "52892036-6c02-47c9-8ea3-ff811663a893"
}
```

`agents[]` is the working roster, sorted by name. `archived[]` names what the
roster leaves out, with each `dir` pointing inside the holding area. An archived
agent that simply vanished would be indistinguishable from a deleted one.

`lastSeq` and `logId` are the event-log watermark, read **before** the roster.
Taking both in one call is what makes re-sync safe — see §8.

`list` degrades rather than fails: one agent with an unreadable `runtime:`
reports `runtimeProvider: null` and every healthy agent beside it still
appears. This is the documented recovery path, and a client locked out of it
has no recovery left.

Errors: `unsafe_agent_path`.

### `inspect <name> [--json]`

One agent, in detail.

```json
{
  "contract_version": 1, "ok": true, "command": "inspect",
  "name": "kai", "dir": "...", "displayName": "kai",
  "runtimeProvider": "claude_code",
  "surfaces": {
    "identity": true, "role": true, "knowledge": true, "goals": true,
    "priorities": true, "threads": true, "notes": true, "dailys": true
  }
}
```

`surfaces` reports which of the eight boot files exist on disk. Unlike `list`,
`inspect` **raises** `invalid_runtime` rather than reporting `null`: a direct
question about one agent must not be answered with a provider Academy did not
resolve.

Errors: `invalid_name`, `agent_archived`, `agent_not_found`,
`unsafe_agent_path`, `invalid_runtime`.

### `tokens <name> [--json]`

The estimated prompt token cost of the agent's compiled boot context, by
surface.

```json
{
  "contract_version": 1, "ok": true, "command": "tokens",
  "agent": "kai",
  "dir": "/home/u/.academy/agents/kai",
  "promptPath": ".../.academy/generated/academy-system-prompt.md",
  "tokenizer": "estimated:chars-and-words-v1",
  "total": { "estimatedTokens": 756, "chars": 2714 },
  "overhead": { "estimatedTokens": 237, "chars": 937, "percent": 31.3 },
  "surfaces": [
    { "name": "identity", "file": "identity.md", "path": "...",
      "exists": true, "estimatedTokens": 53, "chars": 171, "percent": 7 }
  ]
}
```

`tokenizer` names the estimator. It is an estimate, not a model tokenizer
count. `surfaces[]` is in boot order: identity, role, knowledge, goals,
priorities, threads, notes, dailys.

`tokens` reads only the surface files, so an agent with an unrecognised
`runtime:` still reports normally here.

Errors: `invalid_name`, `agent_archived`, `agent_not_found`,
`unsafe_agent_path`, `internal_error`.

### `budget <name> [--json]`

The same estimate, judged against per-surface caps.

```json
{
  "contract_version": 1, "ok": true, "command": "budget",
  "agent": "kai", "dir": "...",
  "withinBudget": true,
  "total": { "estimatedTokens": 520, "cap": 7000, "overBy": 0 },
  "surfaces": [
    { "name": "identity", "estimatedTokens": 53, "cap": 400,
      "overBy": 0, "withinCap": true, "enforced": false }
  ],
  "violations": []
}
```

`enforced` distinguishes a cap Academy holds an agent to from an advisory one.
`withinBudget` is false only when an **enforced** surface is over. `violations`
repeats the surfaces with `withinCap: false`.

The cap values are not contract; they may change. The field names are.

**An over-budget agent is `ok: true` with exit 0.** Read `withinBudget`.

Errors: as `tokens` — `invalid_name`, `agent_archived`, `agent_not_found`,
`unsafe_agent_path`, `internal_error`.

### `sessions [--agent <name>] [--json]`

Agent sessions recorded by Academy's session hook.

```json
{
  "contract_version": 1, "ok": true, "command": "sessions",
  "agentsRoot": "/home/u/.academy/agents",
  "sessionIndex": "/home/u/.academy/sessions.jsonl",
  "sessions": [
    { "sessionId": "…", "agentName": "kai",
      "agentDir": "/home/u/.academy/agents/kai",
      "cwd": "/home/u/work/report", "startedAt": "2026-08-31T18:04:02.113Z" }
  ]
}
```

The session index is **global across installs** — one file, whichever root a
client drives. Attribution is therefore made at read time by `agentDir`
containment inside the resolved agents root, never by agent name: two roots can
each hold a `kai`. `--agent <name>` narrows further by `agentName`.

Rows written before the index carried `agentDir` are unattributable. They are
never rewritten, never returned by any root, and counted by `doctor` under
`unattributable_sessions`.

`sessions[]` is in index order, oldest first. `agentName`, `cwd` and
`startedAt` may be `null`; `sessionId` and `agentDir` are always present.

Errors: `invalid_name`, `unsafe_agent_path`, `invalid_spec` (an unknown
option).

### `events --since <seq> [--logid <id>] [--json]`

Replay lifecycle change. See §8 for the delivery contract.

```json
{
  "contract_version": 1, "ok": true, "command": "events",
  "firstSeq": 1, "lastSeq": 7,
  "logId": "52892036-6c02-47c9-8ea3-ff811663a893",
  "events": [ { "seq": 3, "event": "agent_created", "agentName": "rho",
                "agentDir": "...", "ts": "2026-09-01T02:13:56.599Z" } ]
}
```

`firstSeq` and `lastSeq` are the bounds of **the whole log**, not of the
returned page. `events[]` holds every record with `seq` strictly greater than
`--since`. `--since 0` means "I have applied nothing" and returns the whole log.

`--logid` is the log identity the client stored with its watermark. Pass it on
every call. Omitting it means Academy cannot tell a rebuilt log from the
original.

A `--since` value that is not a non-negative integer is answered with
`replay_unavailable`, not with a separate code, and `error.requestedSeq` echoes
back verbatim what was sent.

Errors: `unsafe_agent_path`, `replay_unavailable`, `invalid_spec` (an unknown
option).

### `create <name> [--json]`

Scaffold a new agent with the eight boot surfaces at their templates, register
its nightly job, and append `agent_created`.

```json
{
  "contract_version": 1, "ok": true, "command": "create",
  "created": true,
  "name": "kai", "dir": "...", "displayName": "kai",
  "runtimeProvider": "claude_code",
  "scheduledJobId": "kai-nightly-consolidation"
}
```

The payload is `{ created: true, ...<agentRecord>, scheduledJobId }`.

`create` is all-or-nothing. A failure to register the nightly job or to append
the event removes the directory before answering, so a failed `create` leaves
nothing behind and the same name can be retried.

Names are kebab-case: `^[a-z][a-z0-9-]{0,31}$`.

Errors: `invalid_name`, `agent_archived`, `agent_exists`,
`unsafe_agent_path`, `runtime_unavailable`, `log_corrupt`, `lock_timeout`.

### `hire --spec <path> [--json]`

The headless hire. It scaffolds the agent exactly as `create` does, then drives
the Claude Code runtime once to write the eight surfaces from a written brief.

```json
{
  "contract_version": 1, "ok": true, "command": "hire",
  "hired": true,
  "name": "nova", "dir": "...", "displayName": "nova",
  "runtimeProvider": "codex", "role": "Data analyst",
  "scheduledJobId": "nova-nightly-consolidation"
}
```

The payload is `{ hired: true, ...<agentRecord>, scheduledJobId }`.

**The specification file is contract.** It is JSON, and the key set is closed:

```json
{
  "name": "nova",
  "role": "Data analyst for the growth team",
  "objective": "Report weekly metrics and flag anomalies",
  "runtime": "codex"
}
```

| Key | Required | Rule |
| --- | --- | --- |
| `name` | yes | Kebab-case, `^[a-z][a-z0-9-]{0,31}$`, and free. |
| `role` | yes | Non-empty string, ≤2000 characters, single line, no `"` and no `\`. |
| `objective` | yes | Same rule as `role`. |
| `runtime` | no | `claude_code` or `codex`. Note the **underscore**; the `claude-code` hyphen form is rejected. |

Any other key is rejected with `invalid_spec`, not silently dropped. The file
must be a regular file of at most 64 KiB.

A hire whose runtime fails or times out is rolled back: the nightly job is
unregistered, the directory removed, and a compensating `agent_deleted` event
appended after the `agent_created` that was already published. The envelope
then answers `runtime_unavailable`.

`hire` without `--spec` is the **interactive** form. It spawns a terminal
session with inherited stdio and can never emit an envelope. It is not part of
this contract.

Errors: `invalid_spec`, `invalid_runtime`, `invalid_name`, `agent_exists`,
`agent_archived`, `unsafe_agent_path`, `runtime_unavailable`, `log_corrupt`,
`lock_timeout`.

### `rename <old> <new> [--json]`

Move an agent to a new name. The directory, the ownership marker, the
`agent.yaml` `name:` scalar, and the nightly job all move together, inside one
lock.

```json
{
  "contract_version": 1, "ok": true, "command": "rename",
  "renamed": true,
  "name": "vera", "dir": "…/agents/vera", "displayName": "vera",
  "runtimeProvider": "codex", "role": "Data analyst",
  "previousName": "nova",
  "previousDir": "…/agents/nova",
  "unscheduledJobId": "nova-nightly-consolidation",
  "scheduledJobId": "vera-nightly-consolidation"
}
```

The payload is `{ renamed: true, ...<agentRecord>, previousName, previousDir,
unscheduledJobId, scheduledJobId }`. A client keying agents on `dir` rewrites
its key from `previousDir` to `dir`.

`scheduledJobId` is `null` when the new nightly job could not be registered;
the rename still stands.

Errors: `invalid_name`, `agent_not_found`, `agent_archived`,
`not_academy_owned`, `agent_exists`, `unsafe_agent_path`,
`runtime_unavailable`, `unschedule_failed`, `invalid_spec`, `log_corrupt`,
`lock_timeout`, `internal_error`.

### `archive <name> [--json]`

Move an agent into the holding area and unregister its nightly job. Nothing is
destroyed and the move is reversible.

```json
{
  "contract_version": 1, "ok": true, "command": "archive",
  "archived": true,
  "name": "vera",
  "dir": "…/agents/.archived/vera",
  "previousDir": "…/agents/vera",
  "unscheduledJobId": "vera-nightly-consolidation"
}
```

An archived agent leaves `list.agents[]` and appears in `list.archived[]`.
Every published command except `unarchive` answers `agent_archived` for it — it
is never reported as missing, because a client told an archived specialist does
not exist would offer to hire a replacement for somebody who is still there.

**Committed-mutation failure.** Academy moves the directory before it appends
the lifecycle event. If `archive --json` answers `log_corrupt` or
`internal_error`, the move can already have landed. Recover with one
`academy list --json` call and replace the client roster and watermark from that
response.

Errors: `invalid_name`, `agent_not_found`, `agent_archived`,
`not_academy_owned`, `agent_exists`, `unsafe_agent_path`,
`runtime_unavailable`, `unschedule_failed`, `log_corrupt`, `lock_timeout`.

### `unarchive <name> [--json]`

Restore an archived agent to its canonical slot and re-register its nightly job.

```json
{
  "contract_version": 1, "ok": true, "command": "unarchive",
  "unarchived": true,
  "name": "vera",
  "dir": "…/agents/vera",
  "previousDir": "…/agents/.archived/vera",
  "scheduledJobId": "vera-nightly-consolidation"
}
```

`unarchive` is the one lifecycle command that may address an archived agent.
It is also the one that does **not** require the scheduler: with no scheduler
present it still succeeds and answers `scheduledJobId: null`.

Errors: `invalid_name`, `agent_not_found`, `not_academy_owned`,
`agent_exists`, `unsafe_agent_path`, `log_corrupt`, `lock_timeout`.

### `delete <name> [--json]`

Remove an agent and unregister its nightly job.

```json
{
  "contract_version": 1, "ok": true, "command": "delete",
  "deleted": true,
  "name": "vera",
  "dir": "…/agents/vera",
  "unscheduledJobId": "vera-nightly-consolidation"
}
```

The directory is moved aside before anything is removed. If the nightly job
cannot be unregistered, the directory is put back and the command answers
`unschedule_failed` — Academy refuses to leave a scheduled job pointing at an
agent that no longer exists. If it cannot be put back because the slot has been
refilled, the answer is `unschedule_failed_restore_blocked` and the `error`
object names the `quarantine` path an operator must recover by hand.

**Committed-mutation failure.** Academy removes the quarantined directory before
it appends the lifecycle event. If `delete --json` answers `log_corrupt` or
`internal_error`, the removal can already have landed. Recover with one
`academy list --json` call and replace the client roster and watermark from that
response.

Errors: `invalid_name`, `agent_not_found`, `agent_archived`,
`not_academy_owned`, `unsafe_agent_path`, `runtime_unavailable`,
`unschedule_failed`, `unschedule_failed_restore_blocked`, `log_corrupt`,
`lock_timeout`.

### `migrate [--dry-run] [--json]`

Write the missing ownership marker for agent directories that predate it. It is
the repair for `doctor`'s `unowned_agents` count, and it is operator-invoked,
never implicit.

```json
{
  "contract_version": 1, "ok": true, "command": "migrate",
  "agentsRoot": "/home/u/.academy/agents",
  "dryRun": false,
  "migrated": [ { "name": "kai", "dir": "…/agents/kai" } ],
  "refused": [ { "name": "zed", "dir": "…/agents/zed",
                 "reason": "resolves outside AGENTS_ROOT: /tmp/elsewhere" } ]
}
```

`migrate` never creates an agent, never edits agent content, and never touches
a directory it cannot prove is that agent's own slot inside the root. It marks
only directories that already contain an `agent.yaml`.

**A refusal keeps `ok: true`.** One unwritable directory is one entry in
`refused[]`, not an abandoned sweep — the operator asked for every outstanding
marker and has to learn which ones landed. `refused[]` reasons are human text
and are not stable. Only a lock timeout fails the whole command.

`--dry-run` reports what it would write and writes nothing. `migrated[]` then
lists the planned repairs.

Errors: `unsafe_agent_path`, `lock_timeout`, `invalid_spec` (an unknown
option).

---

## 6. Commands Academy has but does not publish

Academy implements more commands than it publishes. The unpublished ones keep
working, and **no client may build on them**: they are absent from
`doctor.commands`, they have no envelope guarantee, and they may change or
disappear in any release.

| Command | Why it is not published |
| --- | --- |
| `notes` | It writes a boot surface. Writing a surface is the *document* contract — a client edits `notes.md` on disk directly (§10). A second, CLI-shaped way to do the same thing would be a second definition of the same surface. |
| `nightly` | Invoked by the scheduler Academy registers, never by a client. |
| `clean` | Traces to no client requirement. |
| `root` | Duplicates `doctor`'s `packageRoot` and `agentsRoot`. |
| `run` | The launch verb. It spawns a runtime with inherited stdio and exits on the child's status, so it can never emit an envelope. It remains how an agent is launched interactively; it is not a machine contract. |
| `destroy` | Not contract. Use `delete`. |

`hire` is published; the **interactive** form of `hire` is not (§5).

---

## 7. The fifteen error codes

The set is **closed** at contract version 1. A client may switch on
`error.code` exhaustively. A sixteenth code would be a contract change.

| Code | Meaning | Extra `error` keys | An invocation that produces it |
| --- | --- | --- | --- |
| `agent_not_found` | No agent by that name in the root. | `name` | `inspect ghost --json` |
| `unsafe_agent_path` | The agents root, or the agent directory, is not a path Academy can safely use: a symlink, not a directory, or resolving outside its parent or outside the root. | `agentsRoot` for a root fault, `name` for an agent fault | `list --json` with `AGENTS_ROOT` a symlink |
| `not_academy_owned` | The directory has no valid `.academy-agent.json`, or the marker names another agent. | `name` | `rename kai nova --json` after deleting `kai/.academy-agent.json` |
| `invalid_name` | The name is not kebab-case `^[a-z][a-z0-9-]{0,31}$`. | `name` | `inspect "Not A Name" --json` |
| `agent_exists` | The target name already has a directory. | `name`, `dir` | `create kai --json` twice |
| `agent_archived` | The agent is in the holding area. Only `unarchive` may address it. | `name`, `dir` | `archive kai --json` then `inspect kai --json` |
| `replay_unavailable` | The requested watermark cannot be served exactly. §8. | `requestedSeq`, `firstSeq`, `lastSeq`, `logId` | `events --since 999999 --json` |
| `log_corrupt` | The event log holds bytes but no parseable record, and a lifecycle command is about to append to it. Operator repair, not a client re-sync. | `eventLog` | write one unparseable line into the event log, then `create kai --json` |
| `invalid_runtime` | A `runtime` value outside `claude_code` / `codex`, in `agent.yaml` or in a hire spec. | `runtime`, and `dir` or `specPath` | set `runtime: mainframe` in `agent.yaml`, then `inspect kai --json` |
| `invalid_spec` | A request Academy will not accept: an unreadable or schema-invalid hire spec, an `agent.yaml` key in a form Academy cannot rewrite, or an unknown command option. | `specPath` and `field`/`keys`, or `option`, or `path` | `hire --spec ./not-json.json --json` |
| `runtime_unavailable` | An executable Academy needs is missing or failed. §11. | `name` when a nightly job could not be registered; `executable` when a binary could not be resolved, plus `status` and `timedOut` when a hire runtime failed | `create kai --json` with no `helm-tasks` on `PATH` |
| `lock_timeout` | An agent's lifecycle lock could not be taken within five seconds. | `lockDir` | hold `<root>/.kai.lifecycle.lock`, then `delete kai --json` |
| `internal_error` | The floor under the envelope: a fault no command anticipated. A `--json` caller always gets a parseable failure. | none | replace `kai/notes.md` with a directory, then `budget kai --json` |
| `unschedule_failed` | An agent's nightly job could not be unregistered, so the lifecycle command refused rather than orphan the job. Nothing moved. | `name` | `delete kai --json` with a scheduler that fails to remove the job |
| `unschedule_failed_restore_blocked` | The same failure, and the agent's slot was refilled before the directory could be put back. The directory is in a named quarantine and needs an operator. | `name`, `quarantine` | `delete kai --json` with a scheduler that fails *and* recreates the slot |

Every row above is exercised by the conformance suite (§13), one invocation per
code.

`internal_error` is the floor and can answer any command. The other fourteen
are raised only by the commands whose sections list them in §5.

For `archive` and `delete`, `log_corrupt` or `internal_error` can follow a
committed directory move or removal. Use `list --json` as the atomic roster and
watermark recovery call described in §8.

**Handling guidance.** `agent_not_found`, `agent_exists`, `invalid_name`,
`agent_archived` and `invalid_spec` are user-facing and should be rendered as
such. `unsafe_agent_path`, `runtime_unavailable`, `log_corrupt`, `lock_timeout`
and the two `unschedule_*` codes are setup or environment problems and should be
surfaced to whoever administers the install. `replay_unavailable` has a defined
recovery, in §8. `internal_error` is a bug report.

---

## 8. The event log

Academy appends every agent lifecycle change to one file. `doctor` reports its
path as `eventLog`; it sits beside the agents root, at
`<agentsRoot>/../events.jsonl`. It is JSON Lines, append-only, and **never
trimmed**.

### Records

The first record of every log declares the log's own identity:

```json
{"seq":1,"event":"log_created","logId":"52892036-…","ts":"2026-09-01T02:12:24.253Z"}
```

Real lifecycle events start at `seq: 2`. Each carries
`{ seq, event, agentName, agentDir, ts }` plus per-event extras:

| `event` | Extra keys |
| --- | --- |
| `agent_created` | — |
| `agent_deleted` | — |
| `agent_renamed` | `previousName`, `previousDir` |
| `agent_archived` | `previousDir` |
| `agent_unarchived` | `previousDir` |

`seq` is a monotonic integer with no gaps. Because nothing trims, `firstSeq` is
permanently `1`.

### Delivery is at-least-once, and `seq` is the dedup key

**A client must apply each `seq` exactly once.** Academy may deliver the same
record more than once — most obviously because the re-sync in `list` reads its
watermark before its roster, so an agent created between the two reads appears
in both the roster and the next replay. Replaying an overlapping range must
therefore produce identical derived state in the client. Key your applied set
on `seq`, and make every handler idempotent.

Store `logId` beside your watermark. The pair `(logId, seq)` is your resume
point; `seq` alone is not.

### Polling

```sh
academy events --since <lastAppliedSeq> --logid <storedLogId> --json
```

Apply `events[]` in order. Adopt the response's `lastSeq` as your new
watermark. There is no daemon, no watcher and no push channel: a client polls at
whatever interval it chooses.

### `replay_unavailable`, and the one-call re-sync

An empty success would be indistinguishable from "you are up to date", so any
watermark that cannot be served exactly fails loudly with `replay_unavailable`
and `{ requestedSeq, firstSeq, lastSeq, logId }`.

**Three causes:**

1. The log is absent while the client holds a watermark above zero.
2. `--logid` does not match `logId` — the log was deleted and recreated, so
   sequence numbers restarted and the client's watermark belongs to a different
   epoch.
3. `requestedSeq` is above `lastSeq`.

**Recovery is one call, and it must be one call:**

```sh
academy list --json
```

`list` carries `lastSeq` and `logId` beside `agents[]` and `archived[]`, so the
roster snapshot and the watermark arrive **atomically**. Replace your roster
with what it returned, store its `lastSeq` and `logId`, and resume polling.

Do not re-sync with two calls. A `list` followed by a separate `events` loses
or double-applies anything that lands between them, and Academy publishes no
way to detect that.

### The log is client-readable

The event log path is contract, so an operator or a backup restore can replace
the file. That is exactly why `logId` exists, and why a client stores it.

---

## 9. The agent directory layout

An agent is a directory. Its layout is versioned by `contract_version`.

### Contract paths — a client may read and write these

| Path | Notes |
| --- | --- |
| `<agentsRoot>/<name>/agent.yaml` | Top-level scalars only. See below. |
| `<agentsRoot>/<name>/identity.md` | Boot surface. §10. |
| `<agentsRoot>/<name>/role.md` | Boot surface. |
| `<agentsRoot>/<name>/knowledge.md` | Boot surface. |
| `<agentsRoot>/<name>/goals.md` | Boot surface. |
| `<agentsRoot>/<name>/priorities.md` | Boot surface. |
| `<agentsRoot>/<name>/threads.md` | Boot surface. |
| `<agentsRoot>/<name>/notes.md` | Boot surface. |
| `<agentsRoot>/<name>/dailys.md` | Boot surface. |
| `<agentsRoot>/../events.jsonl` | The lifecycle event log. §8. Read only; Academy owns writes. Path from `doctor.eventLog`. |
| `~/.academy/sessions.jsonl` | The session index. Read only; the session hook owns writes. Path from `sessions.sessionIndex`. |

**`agent.yaml` is contract, with one rule.** Only *top-level scalars* are
published: `name`, `created`, `runtime`, `role`, `objective`, and
`displayName`, which sets the `displayName` field of every agent record and
falls back to `name` when absent. A client may edit
`runtime:` by hand, and the value must be `claude_code` or `codex` — anything
else makes the agent report `runtimeProvider: null` in `list` and raise
`invalid_runtime` in `inspect`. Academy reads the file with a line-oriented
reader and writes it with line surgery, never re-serialisation, so comments and
the `surfaces:` block survive untouched. Keep every published key as a
`key: value` line at column zero. A key restated indented, quoted or
space-padded is one Academy will refuse to rewrite, with `invalid_spec`.

### Internal paths — a client must not read or write these

They may change in any release, with no contract bump and no notice.

| Path | What it is |
| --- | --- |
| `<agentsRoot>/<name>/.academy-agent.json` | Ownership marker. Removing it breaks every lifecycle command; `migrate` restores it. |
| `<agentsRoot>/<name>/.academy/generated/` | The compiled system prompt. Derived from the eight surfaces; regenerated. |
| `<agentsRoot>/<name>/.claude/` | Claude Code skills, sub-agent definitions and local settings. |
| `<agentsRoot>/<name>/.claude-plugin` | Symlink into the Academy package. |
| `<agentsRoot>/<name>/hooks` | Symlink into the Academy package. |
| `<agentsRoot>/<name>/.agents/` | Codex skill surface. |
| `<agentsRoot>/<name>/.codex/` | Codex sub-agent definitions. |
| `<agentsRoot>/<name>/CLAUDE.md` | Runtime instruction file. |
| `<agentsRoot>/<name>/memory/` | Observation memory and the agent's own session log. |
| `<agentsRoot>/<name>/dreams/` | Nightly consolidation working area. |
| `<agentsRoot>/.archived/` | The holding area. Reach it through `archive` / `unarchive` and `list.archived[]`, never by path. |
| `<agentsRoot>/.<name>.lifecycle.lock` | Lifecycle lock. |
| `<agentsRoot>/.<name>.delete-quarantine.*` | Delete staging. |
| `<agentsRoot>/../events.lock`, `~/.academy/sessions.lock` | Append locks. |

The rule is simple: **the eight `.md` surfaces and `agent.yaml` are yours;
every dot-path is Academy's.**

---

## 10. The document contract: eight boot surfaces

Every agent has exactly eight boot surfaces, always these filenames:

```
identity.md  role.md   knowledge.md  goals.md
priorities.md  threads.md  notes.md   dailys.md
```

They are the agent's durable context, compiled into its system prompt on every
launch.

**Clients read and write them directly on disk.** There are deliberately no CLI
commands to write a surface. Direct file access *is* the document contract: a
client opens `<agentsRoot>/<name>/notes.md`, edits it, and saves. Academy picks
the change up on the next launch. Nothing needs to be told.

**What is contract:** the eight filenames, their location in the agent
directory, and that they are UTF-8 Markdown.

**What is not contract:** their headings, their internal conventions, the cap
values `budget` judges them against, and the templates `create` writes. A
client renders and edits what it finds; it must not require a particular
structure inside a surface.

Use `inspect` to learn which surfaces exist, and `tokens` or `budget` to show a
user the cost of what they have written.

---

## 11. External dependencies

Two executables are resolved from `PATH`. Neither is part of the response
contract, and both matter to a client author because their absence changes what
Academy can do.

### `helm-tasks` — required for the agent lifecycle

Academy registers each agent's nightly consolidation job through a scheduler
binary named `helm-tasks`, resolved from `PATH` or from
`ACADEMY_HELM_TASKS_BIN`.

**This is a hard dependency, and `doctor` does not report it.** `doctor`'s
`runtimes` names only `claude_code` and `codex`; there is no `helm-tasks` entry
and no health code for it. Without the binary:

| Command | Behaviour with no `helm-tasks` |
| --- | --- |
| `create` | fails, `runtime_unavailable` |
| `hire --spec` | fails, `runtime_unavailable` |
| `delete` | fails, `runtime_unavailable` |
| `rename` | fails, `runtime_unavailable` |
| `archive` | fails, `runtime_unavailable` |
| `unarchive` | succeeds, `scheduledJobId: null` |
| `doctor`, `list`, `inspect`, `tokens`, `budget`, `sessions`, `events`, `migrate` | unaffected |

A client that provisions Academy must provision the scheduler with it, or
present a setup problem to the operator. Detect it by attempting a `create` and
reading the code, not by probing `doctor`.

### `claude` and `codex` — the agent runtimes

`doctor.runtimes` reports each provider's availability. `hire --spec` needs
`claude`; a missing one answers `runtime_unavailable` with
`error.executable: "claude"`. Overrides are `ACADEMY_CLAUDE_BIN` and
`ACADEMY_CODEX_BIN`.

An unavailable runtime does not fail `doctor` and does not stop any read
command. It stops launching an agent, which is `run` — not a published command.

---

## 12. The one client-specific exception

Academy is client-agnostic. No identifier in Academy's code names a specific
client product, with exactly one deliberate exception, retained by decision and
documented here so the client-agnostic claim stays honest rather than quietly
becoming untrue. A case-insensitive search of the published package for either
client name returns one source file, named below.

**The exception is the memory sync bridge**, in Academy's `hooks/` directory.
`hooks/memory_bridge.mjs` is the only file in Academy that names a client. It
copies observation memory from one specific host product into an agent's
`memory/observations/`, and it declares the client-named environment keys, the
tool permission, and the nightly guidance prose that go with it.

**It is off by default.** The bridge activates only when
`ACADEMY_MEMORY_BRIDGE=1` is set in Academy's environment. Unset, a scaffolded
agent names no client at all: no client-named environment key is read, no
client-named tool permission is written into the agent's settings, and no
client-named prose appears in any skill.

**Treat it as an exception, not as a pattern.** It is not a plugin point, not
an extension mechanism, and not a template for a second client. A client
integrating Academy does not enable it, does not read it, and does not need it.
Academy publishes no other client-specific behaviour and will not add one.

---

## 13. Verify your integration

Academy ships a conformance suite. It is written for client authors, not for
Academy's developers: it never imports Academy source and asserts only what a
client can observe — the envelope, the exit status, the published command list,
the identity boundary, and the fifteen error codes.

```sh
# against the build in this package
node --test conformance/*.test.mjs

# against any other build: an install, an unpacked tarball, a checkout
ACADEMY_BIN=/usr/local/bin/academy node --test conformance/*.test.mjs
```

It needs Node 18, a POSIX shell, and nothing else. No packages are installed
and no test framework is used. Every test builds its own throwaway install with
a fresh temporary `HOME` and `AGENTS_ROOT` and a `PATH` built from nothing, so
it can drive the full lifecycle — including `delete` — with no way to reach any
agent on the machine running it. The scheduler and the runtime are stubbed,
because neither is part of the response contract.

Run it against the exact build you ship. `conformance/README.md` explains what
each file asserts and how to read a failure.

---

## 14. What is not contract

Depending on any of these will break.

- **Human output.** Every command without `--json` prints text for a person.
  Nothing about it is stable.
- **`error.message` text.** Switch on `error.code`. Render `message` if you
  want, but never parse it.
- **`refused[]` reasons in `migrate`.** Human text.
- **The unpublished commands** in §6, and the interactive form of `hire`.
- **Internal paths** in §9, including everything under an agent's dot-
  directories and the `.archived/` holding area.
- **Surface content conventions** — headings, section structure, the token cap
  values.
- **Academy's prompts.** What Academy says to a runtime is Academy's to change,
  including the hire prompt behind `hire --spec`.
- **The package version.** Pin `contract_version`.
- **Anything absent from `doctor.commands`.**

If you need something that is not published, say so rather than reading around
the contract. Reading Academy's internals is the failure this contract exists to
end.
