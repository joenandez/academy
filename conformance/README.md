# Academy client conformance suite

This suite checks that an Academy build implements the client contract. It is
written for authors of clients that drive Academy, not for Academy's own
developers: it never imports Academy source and asserts only what a client can
observe — the response envelope, the exit status, and the published error codes.

## Run it

```sh
# against the build in this package
node --test conformance/*.test.mjs

# against any other build
ACADEMY_BIN=/usr/local/bin/academy node --test conformance/*.test.mjs
```

`ACADEMY_BIN` is the path of the Academy launcher to test. Unset, the suite
drives the `bin/academy` beside this directory. Point it at a global install, an
unpacked tarball, or a source checkout — the assertions are the same.

Requirements: Node 18 or later, a POSIX shell, and nothing else. No packages are
installed and no test framework is used.

## What it asserts

| File | Asserts |
| --- | --- |
| `discovery.test.mjs` | `doctor --json` — the published command list, the payload keys, the version rule, and the one state answered `ok:false` |
| `identity.test.mjs` | Every agent-addressed command refuses an out-of-root agents root and an out-of-root agent directory, and writes nothing outside the root |
| `error-codes.test.mjs` | An invocation for each of the fifteen published error codes |
| `envelope.test.mjs` | The envelope and the exit rule across every published command, on success and on failure |

## Safety

Every test builds its own throwaway install: a fresh temporary `HOME`, a fresh
temporary `AGENTS_ROOT`, and a `PATH` built from nothing. Values already
exported into your shell are **not** inherited by the build under test. The
suite drives the full lifecycle, including `delete`, `archive`, `rename` and
`migrate`, and can reach no agent outside its own temporary directories.

## Stubs

Two executables Academy uses are stubbed, because neither is part of the
response contract and a client author must not need either installed:

- `helm-tasks` — the scheduler Academy registers each agent's nightly job with.
  Academy resolves it from `PATH`, or from `ACADEMY_HELM_TASKS_BIN`. Without it,
  `create`, `delete`, `rename` and `archive` answer `runtime_unavailable`.
- `claude` — the runtime `hire --spec` drives. Academy resolves it from `PATH`,
  or from `ACADEMY_CLAUDE_BIN`.

The scheduler stub is also the only way to reach `unschedule_failed` and
`unschedule_failed_restore_blocked` from outside the binary.

## Reading a failure

Each assertion prints the exit status and both streams of the invocation that
produced it, so a failure names the command, the envelope it returned, and the
field that disagreed.
