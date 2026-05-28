#!/usr/bin/env python3
"""SessionStart hook — emit one boot surface per invocation.

Usage: inject_surface.py <surface>

Surfaces: identity | role | knowledge | goals | priorities | threads | notes | dailys

Each surface lives at ~/.academy/agents/<name>/<surface>.md and is injected
into the session as additionalContext via stdout JSON.

Agent dir resolution (in priority order):
  1. ACADEMY_AGENT_DIR env var
  2. CWD if it contains agent.yaml
  3. CWD walk-up looking for agent.yaml

Per v3 §10 Phase 0: "8 simple hooks, one per surface" — no manifest, no
chunking, no inject_section heuristics. The 8 boot files target ~5–6k tokens
combined and stay well under the per-hook ~10k-char ceiling.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

SURFACES = (
    "identity",
    "role",
    "knowledge",
    "goals",
    "priorities",
    "threads",
    "notes",
    "dailys",
)

def resolve_agent_dir() -> Path | None:
    """Resolve the agent directory.

    Priority:
      1. ACADEMY_AGENT_DIR env var (set by `academy run`)
      2. Walk up from CWD looking for agent.yaml
    """
    env_dir = os.environ.get("ACADEMY_AGENT_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.is_dir():
            return p

    cwd = Path.cwd()
    for d in (cwd, *cwd.parents):
        if (d / "agent.yaml").is_file():
            return d
    return None


def build_context(surface: str, agent_dir: Path) -> str:
    """Read <surface>.md and return its content as-is.

    The file is self-describing (each starts with its own H1). The hook's job
    is to deliver the file into context — not to add framing. Empty/missing
    files emit a one-line placeholder so the agent knows the surface exists
    but is empty.
    """
    surface_file = agent_dir / f"{surface}.md"
    if not surface_file.is_file():
        return f"# {surface.title()}\n\n_(No {surface}.md present yet.)_"
    body = surface_file.read_text(encoding="utf-8").rstrip()
    if not body:
        return f"# {surface.title()}\n\n_({surface}.md is empty.)_"
    return body


def emit(context: str) -> None:
    """Emit Claude Code SessionStart hook JSON output."""
    payload = {
        "hookSpecificOutput": {
            "hookEventName": "SessionStart",
            "additionalContext": context,
        }
    }
    sys.stdout.write(json.dumps(payload))
    sys.stdout.flush()


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: inject_surface.py <{ '|'.join(SURFACES) }>", file=sys.stderr)
        return 2

    surface = sys.argv[1]
    if surface not in SURFACES:
        print(
            f"unknown surface '{surface}'. valid: {', '.join(SURFACES)}",
            file=sys.stderr,
        )
        return 2

    agent_dir = resolve_agent_dir()
    if agent_dir is None:
        # Not running inside an agent — emit nothing, exit clean.
        # This keeps the hook harmless when the user invokes Claude Code
        # in a non-agent dir while the plugin is still installed.
        return 0

    try:
        context = build_context(surface, agent_dir)
    except Exception as exc:  # pragma: no cover — defensive
        print(f"inject_surface[{surface}] error: {exc}", file=sys.stderr)
        return 0  # never block session start

    emit(context)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
