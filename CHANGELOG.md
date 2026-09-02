# Changelog

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The heading at the top of this file is the version in `package.json`.

## 0.4.0-rc.1 — 2026-08-31

First release candidate, and the first Academy artifact that can be installed
rather than cloned.

### Added

- **A published client contract at `contract_version` 1.** Every command
  answers a JSON envelope: `{ contract_version, ok, command, ... }` on stdout
  with exit 0, or `{ contract_version, ok: false, command, error }` on stderr
  with exit 1. Exit status is 0 if and only if `ok` is true.
- **`doctor`** — the discovery command. It reports the supported contracts, the
  build version, the package root, the agents root, the event log path, the
  published command list, runtime availability, and health counts.
- **Fifteen published error codes**, each reachable from outside the binary and
  each documented in the integration guide.
- **An append-only event log**, so a client can follow lifecycle changes it did
  not make.
- **`docs/integration-guide.md`** — the whole published contract, written for an
  author of a client that drives Academy without reading Academy's source.
- **A client conformance suite** in `conformance/`. It imports no Academy
  source, asserts only what a client can observe, and runs against any build
  through `ACADEMY_BIN`.
- **Release tooling.** `scripts/release-check.mjs` is a read-only readiness
  gate, `scripts/publish-tree.mjs` generates the public tree from an allow-list,
  and `.agents/skills/release/SKILL.md` is the release procedure.

### Changed

- **Academy is client-agnostic.** No identifier in the source names a specific
  client product, with one documented exception: the memory sync bridge in
  `hooks/memory_bridge.mjs`, which is off unless `ACADEMY_MEMORY_BRIDGE=1`.
- **Package identity is `@joenandez/academy`.** The unscoped `academy` name is
  taken on the registry. The command is still `academy`.
- **Every path a command reports is absolute and normalised**, so a client can
  key an agent on `dir` across every record for that agent.

### Removed

- The Subspace-specific framing in `README.md`. Academy is described on its own
  terms, with the memory bridge named as the single exception.
