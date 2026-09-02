---
name: check-in
description: Use when the user wants to start with {{agent_name}}, review how collaboration is going, clarify the agent's role, or improve future output quality.
---

# Check-In

Check-in is {{agent_name}}'s 1:1 protocol with the user. It is for alignment,
calibration, and improving collaboration quality. It is not a normal work
session unless the user explicitly turns it into one.

Use the agent's already-loaded context. Do not re-read boot files just to
discover what they say. Open or edit files only when something appears missing,
stale, contradictory, or ready for a durable update through `self-update`.

## Agent Paths

- Agent home: `{{agent_dir}}`
- This skill: `{{check_in_path}}`
- Self-update skill: `{{self_update_path}}`

## When To Use

- The user says "check in", "start", "how are things going", "what should we
  do", or similar.
- The user is using the agent for the first time and needs to understand how to
  work with it.
- The agent's role, priorities, cadence, or output quality may need adjustment.
- Recent work suggests a recurring task, scheduled prompt, or self-update may
  be useful.
- The user gives feedback about how the agent should behave or what its outputs
  should look like.

## Goal

End the conversation with one concrete collaboration improvement:

- a clarified work mode
- a next task
- a better output expectation
- a proposed priority or role adjustment
- a recommendation to create or update a scheduled work prompt
- a handoff to `self-update`
- an explicit "no change needed" confirmation

## Procedure

1. **Orient briefly.**
   Summarize the relevant current understanding in 2-4 sentences: what the
   agent is for, how it appears to be used, and any visible tension in goals,
   priorities, recent work, or user feedback.

2. **Name the likely collaboration mode.**
   Infer the current mode and say it plainly:
   - **On-demand expert:** the user calls the agent for domain-specific work.
   - **Proactive operator:** the agent is expected to make independent progress.
   - **Scheduled worker:** the agent has a recurring task with a defined cadence.
   - **Role calibration:** the user is refining the agent's behavior, scope, or standards.
   - **Retrospective:** the user wants to review recent work and improve quality.

3. **Surface one or two useful tensions.**
   Only mention tensions that would change behavior. Examples:
   - priorities do not match recent usage
   - the role is too broad or too narrow
   - the scheduled task is vague
   - the agent lacks examples of good output
   - feedback sounds durable enough to update role or knowledge
   - the user seems to want proactive work but no cadence exists

4. **Ask sharp questions, not generic ones.**
   Ask at most 2-3 questions. Each question must have a clear consequence.
   Good examples:
   - "Should I optimize for independent progress, or wait for explicit assignments?"
   - "What output from me has been most useful so far?"
   - "What have I been overdoing or underdoing?"
   - "Should this feedback become durable role guidance, domain knowledge, or just a temporary note?"
   - "Is this recurring enough that we should define a scheduled work prompt?"
   - "For the next deliverable, should I favor speed, depth, polish, or decision support?"

5. **Recommend a concrete next step.**
   Do not end with a vague offer. Recommend one of:
   - continue on-demand
   - define a scheduled task
   - run a specific work session now
   - update priorities
   - update role or knowledge via `self-update`
   - collect examples of good output
   - leave setup unchanged

6. **Hand off durable changes.**
   If the user gives durable steering, invoke or recommend `self-update`. Do
   not casually edit identity, role, knowledge, goals, priorities, notes,
   threads, dailys, or skills from check-in itself.

## Anti-Patterns

- Do not dump all boot context back to the user.
- Do not perform a full work session unless the user asks.
- Do not ask "How can I help?" as the main question.
- Do not treat proactive, scheduled, and on-demand agents the same.
- Do not invent a recurring responsibility from vague interest.
- Do not update self-surfaces directly unless the user has given clear steering
  and the `self-update` skill is being used.
- Do not turn every check-in into a request for more instructions.

## Output Shape

A useful check-in response should usually look like:

```markdown
## Current Read
{Brief summary of role, current mode, and relevant tension.}

## Recommendation
{One concrete recommendation for how the user and agent should work together next.}

## Questions
{1-3 sharp questions, only if needed.}

## Next Step
{Specific action: do work now, update self, define schedule, continue on-demand, or no change.}
```
