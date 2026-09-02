export const TEMPLATES = {
  'identity.md': (name, today) =>
    `# Identity

_(Who you are — values, character, voice, persona/backstory.)_

You are ${name}.

_(Hire flow will populate this. See \`academy hire\`.)_

---
_Created: ${today}._
`,
  'role.md': (name, today) =>
    `# Role

_(What you do — job, responsibilities, scope, deliverable shape, cadence.)_

_(Hire flow will populate this. See \`academy hire\`.)_

---
_Created: ${today}._
`,
  'knowledge.md': (name, today) =>
    `# Knowledge

_(What you know — domain expertise, mental models, frameworks, learned patterns.)_

Lightweight sections by domain (max 5–8). Dated entries within sections.
Curation is by reference + uniqueness + user signal — see scope §7.

_(Hire flow will populate this from research. See \`academy hire\`.)_

---
_Created: ${today}._
`,
  'goals.md': (name, today) =>
    `# Goals

_(Strategic direction — quarterly horizon, hard cap of 3.)_

1. _(goal one)_
2. _(goal two)_
3. _(goal three)_

---
_Created: ${today}. Re-affirm every 14 days._
`,
  'priorities.md': (name, today) =>
    `# Priorities

_(Weekly direction — WIP-limited, 3–5 visible.)_

- _(priority one)_
- _(priority two)_

---
_Created: ${today}._
`,
  'threads.md': (name, today) =>
    `# Threads

_(Active work pursuits — 5 active visible / 8 idle. Auto-demote by \`last_touched\`.)_

## Active

_(none yet)_

## Idle

_(none yet)_

## Parked

_(none yet)_

---
_Created: ${today}._
`,
  'notes.md': (name, today) =>
    `# Notes

_(Micro-steering staging area — 8–12 visible cap. Graduate or expire.)_

_Capture temporary steering, corrections, stakeholder facts, caveats, and raw
learnings here with_ \`academy notes add "..."\` _— it appends a timestamped
bullet without rewriting this file. Review with_ \`academy notes list\`_._

_(none yet)_

---
_Created: ${today}. Long-staying notes are a smell — they should graduate to knowledge / role / identity / skill, or expire._
`,
  'dailys.md': (name, today) =>
    `# Recent Days

_(Tight summaries, last 7 working days, FIFO.)_

_(none yet — populated by daily primitive in Phase 3.)_

---
_Created: ${today}._
`,
};
