# Manual Test Guide — `academy notes` CLI

Automated coverage: `node --test tests/agent-cli.test.mjs` (8 notes cases).
Below is the manual matrix to confirm against the real binary.

## Setup (isolated — does not touch real agents)
```bash
export AGENTS_ROOT="$(mktemp -d)/agents"
export ACADEMY_SKIP_NIGHTLY_TASK=1
./bin/academy create kai
DIR="$AGENTS_ROOT/kai"
```

## Cases

| # | Command | Expected |
|---|---------|----------|
| 1 | `ACADEMY_AGENT_DIR="$DIR" ./bin/academy notes add "short text"` | Prints `Noted → …/kai/notes.md`; bullet appended |
| 2 | `./bin/academy notes add kai "explicit-name note"` | Targets kai's notes.md (no env needed) |
| 3 | `ACADEMY_AGENT_HOME="$DIR" ./bin/academy notes add "via home synonym"` | Appended; HOME accepted as DIR synonym |
| 4 | `ACADEMY_AGENT_DIR="$DIR" ./bin/academy notes list` | Last ≤12 bullets, oldest→newest |
| 5 | `ACADEMY_AGENT_DIR="$DIR" ./bin/academy notes list --last 2` (and `--last=2`) | Exactly the 2 most recent bullets |
| 6 | `./bin/academy notes list bob` (bob has no notes.md) | `(no notes yet)`, exit 0 |
| 7 | `./bin/academy notes add "x"` with no agent name / no env | Exit 1 + usage hint on stderr |
| 8 | `ACADEMY_AGENT_DIR="$DIR" ./bin/academy notes add ""` | Exit 1, "note text required" |
| 9 | `ACADEMY_AGENT_DIR="$DIR" ./bin/academy notes frobnicate` | Exit 1, "Use 'add' or 'list'" |

## Format check
Appended lines must match `- YYYY-MM-DD HH:MM: <text>` in **local** time, and the
`# Notes` scaffold header + `academy notes add` instruction must remain intact
after an `add` (append never rewrites the file).

## Notes
- Resolution precedence: explicit `<agent>` arg → `ACADEMY_AGENT_DIR` →
  `ACADEMY_AGENT_HOME` → `ACADEMY_AGENT_NAME` → error.
- A "single bare word" after `add` that matches an agent-name pattern is treated
  as text (not an agent) unless more text follows — quote text to disambiguate.
