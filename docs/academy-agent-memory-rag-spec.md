# Product Spec: Academy Agent Memory In Subspace Context Injection

## Summary

Academy agents are specialist agents that may work with the same user across many Subspace workspaces. Today, when an Academy agent enters a workspace, it receives recent Subspace memory for the current workspace and its own compiled Academy boot surfaces. That gives it local project continuity and curated agent identity, but it does not reliably receive recent or relevant observations from that user's prior work with the same Academy agent in other workspaces.

Add a Subspace memory retrieval layer that blends current workspace memory with Academy-agent-specific memory across workspaces. The goal is for an Academy agent to understand:

- what has recently happened in the current workspace
- what the user has recently done with this specific Academy agent across workspaces
- older task-relevant observations from both the workspace and the agent's own history

`dailys.md` remains useful as compact standing memory, but it should not replace observation-level RAG. Daily summaries are intentionally lossy; RAG recovers concrete details such as file paths, bugs, rejected approaches, test outputs, user preferences, and implementation decisions.

## Problem

Subspace already injects recent observations for the active workspace and uses overflow/RAG when the first user prompt needs relevant older workspace observations.

Academy adds a second memory axis: the relationship between a user and a specialist agent.

Example:

1. A user works with `growth-analytics` in workspace A.
2. Later, the same user invokes `growth-analytics` in workspace B.
3. Subspace injects recent observations from workspace B.
4. Academy injects the agent's boot surfaces and recent daily summaries.
5. But the agent may not see recent detailed observations from its own prior work with that user in workspace A.

This makes Academy agents less specialized than intended. They carry curated identity, but not enough detailed short-term continuity from their cross-workspace work with the user.

## Goals

- Preserve existing workspace-local Subspace context injection.
- Add recent Academy-agent-specific observations across workspaces for the same user.
- Add RAG over older Academy-agent-specific observations, similar to existing workspace overflow RAG.
- Deduplicate observations already present in workspace injection.
- Keep token growth bounded and predictable.
- Let Academy provide agent identity metadata while Subspace owns indexing, retrieval, ranking, dedupe, and prompt-budget allocation.

## Non-Goals

- Do not replace current workspace memory injection.
- Do not rely only on Academy `dailys.md`.
- Do not copy all cross-workspace observations into Academy boot surfaces.
- Do not require Academy to maintain its own full RAG implementation.
- Do not expose another manual memory command as the primary path for session-start context.

## Desired Memory Model

At session start, Subspace should construct a blended memory context:

```text
session_memory =
  workspace_recent_observations
  + agent_recent_observations_across_workspaces
  + workspace_relevant_rag(first_prompt)
  + agent_relevant_rag(first_prompt)
  - duplicates
  trimmed_to_budget
```

Academy boot surfaces remain separate:

```text
academy_system_prompt =
  identity
  + role
  + knowledge
  + goals
  + priorities
  + threads
  + notes
  + dailys
```

The combined agent context should therefore include:

- curated Academy identity and standing memory
- current workspace recency
- cross-workspace agent-user recency
- task-relevant detail from current workspace history
- task-relevant detail from the agent's own cross-workspace history

## Proposed Context Sources

### 1. Workspace Recent Observations

Existing Subspace behavior. Keep this as the dominant context source because the active workspace remains the immediate operating environment.

### 2. Agent Recent Observations Across Workspaces

Retrieve recent observations associated with:

- current user
- current Academy agent identity
- any workspace

This should include work the same user did with the same agent in other workspaces.

### 3. Workspace Relevant RAG

Existing overflow behavior. When the first prompt is submitted, retrieve older observations from the active workspace that are semantically or lexically relevant to the prompt.

### 4. Agent Relevant RAG Across Workspaces

New behavior. When the first prompt is submitted, retrieve older observations associated with the same user and Academy agent identity across workspaces.

This is the highest-value addition because it recovers details that daily summaries intentionally compress away.

## Metadata Requirements

Academy should provide enough metadata for Subspace to identify agent-scoped memory:

```text
agent_kind=academy
agent_name=growth-analytics
agent_id=academy:growth-analytics
agent_home=/Users/joe/.academy/agents/growth-analytics
user_id=<current Subspace user>
workspace_id=<current workspace>
project_path=<current project path>
```

The exact names can vary, but the important stable key is:

```text
(user_id, agent_kind, agent_name)
```

Subspace observations created during Academy sessions should be tagged with that key so future retrieval can query across workspaces.

## Prompt Budget

Accept a small token increase for Academy sessions, but keep the default bounded.

Suggested initial allocation:

```text
workspace_recent: 45%
agent_recent: 20%
workspace_rag: 20%
agent_rag: 15%
```

Alternative conservative allocation:

```text
workspace_recent: 55%
agent_recent: 15%
workspace_rag: 20%
agent_rag: 10%
```

Budget rules:

- Workspace recent memory should remain dominant by default.
- Agent recent memory should be enough to preserve specialist continuity.
- RAG should be query-dependent and may be empty if confidence is low.
- If one bucket has no results, unused budget can flow to the next highest-priority bucket.
- Token budget should be configurable per agent/session in the future, but start with a fixed default.

## Deduplication

Dedupe must happen across all memory buckets before final prompt injection.

Recommended dedupe keys:

- stable observation id, if available
- session id + timestamp + summary hash
- exact text hash
- normalized text similarity for near-duplicates

Recommended priority when duplicates collide:

1. Keep the current-workspace version if the observation appears in both workspace and agent buckets.
2. Keep the richer/longer observation if one entry has more detail and both are from the same source event.
3. Keep the more recent observation if the content is equivalent.

The final injected context should not contain the same observation twice under both "workspace memory" and "agent memory."

## Ranking

Suggested ranking signals:

- recency
- relevance to first prompt
- same workspace boost
- same Academy agent boost
- same session/thread boost
- explicit user correction or decision boost
- implementation/result observations over generic status summaries

For RAG buckets, relevance should dominate recency. For recent buckets, recency should dominate relevance.

## Prompt Presentation

The injected memory should be clearly labeled so the agent can reason about source and scope:

```markdown
## Recent Workspace Memory

Recent observations from the current workspace.

## Recent Academy Agent Memory

Recent observations from this user's work with `growth-analytics` across workspaces.

## Relevant Workspace Memory

Older observations from this workspace retrieved for the current prompt.

## Relevant Academy Agent Memory

Older observations from this user's work with `growth-analytics` retrieved for the current prompt.
```

Labels matter because the agent should not confuse another workspace's facts with the active workspace's state.

## Interaction With Academy `dailys.md`

`dailys.md` should continue to be injected by Academy through the generated system prompt.

Its role:

- compact daily continuity
- broad recent trajectory
- stable "what happened lately" summary
- low-token standing context

Observation RAG's role:

- recover high-detail facts
- retrieve older relevant details
- preserve exact decisions, errors, paths, and user preferences
- support task-specific recall

These are complementary. `dailys.md` is not sufficient by itself.

## Acceptance Criteria

### Academy Session Metadata

- When an Academy agent launches inside Subspace, observations from that session are tagged with the Academy agent identity.
- The tag is stable across workspaces for the same user and agent.

### Recent Agent Memory

- When the same user launches the same Academy agent in a different workspace, session-start memory includes a bounded set of recent observations from that agent's prior work across workspaces.
- Current workspace recent observations are still present.
- Duplicate observations are not injected twice.

### Agent RAG

- On first prompt, Subspace retrieves relevant older observations from the same user's history with that Academy agent across workspaces.
- Retrieved agent observations are presented separately from current workspace observations.
- Low-confidence or irrelevant agent memories are omitted rather than filling budget with noise.

### Budget

- The added Academy memory layer increases context size only within a defined budget.
- If no Academy-agent observations exist, behavior falls back to current Subspace workspace memory behavior.

### Safety And Scope

- Cross-workspace agent memory is scoped to the same user.
- Another user's work with the same Academy agent name is not injected.
- Memory labels make it clear when an observation came from another workspace.

## Test Scenarios

### Scenario 1: Same Agent, Different Workspace

1. User works with `growth-analytics` in workspace A.
2. Observations are recorded and tagged as `academy:growth-analytics`.
3. User opens workspace B and launches `growth-analytics`.
4. Session context includes workspace B recent memory plus recent `growth-analytics` memory from workspace A.

Expected: The agent can refer to prior user-agent work without losing awareness of workspace B.

### Scenario 2: Dedupe Current Workspace

1. User works with `growth-analytics` in workspace B.
2. Workspace B observations and agent observations overlap.
3. User resumes `growth-analytics` in workspace B.

Expected: Overlapping observations appear once, not once in workspace memory and once in agent memory.

### Scenario 3: Relevant Older Agent Memory

1. User worked with `growth-analytics` weeks ago on a specific metric definition.
2. That observation is no longer recent.
3. User asks a new question using similar terminology.

Expected: Agent RAG retrieves the older metric-definition observation even if it is outside the recent window.

### Scenario 4: No Agent Memory

1. User launches a newly created Academy agent.
2. There are no prior observations tagged for that agent.

Expected: Subspace uses normal workspace memory behavior with no empty or confusing Academy-memory section.

## Open Questions

- Should the agent identity key use `agent_name`, an immutable generated `agent_id`, or both?
- Should agent memory retrieval be enabled for all Academy agents by default, or opt-in per agent?
- What is the right first default budget: conservative `15% agent recent / 10% agent RAG`, or more generous `20% / 15%`?
- Should same-agent memory from archived workspaces be included?
- Should the RAG layer include observations generated by non-Academy agents if they mention the Academy agent or its work?
- Should daily consolidation consume this same cross-workspace agent archive, or only the local `memory/observations/` copied into the Academy agent home?

## Recommended MVP

1. Tag Academy session observations with `(user_id, agent_kind=academy, agent_name)`.
2. Add a retrieval path for recent same-user same-agent observations across workspaces.
3. Blend those with current workspace recent observations using a small fixed Academy budget.
4. Add dedupe across workspace and agent buckets.
5. Add first-prompt RAG over same-user same-agent observations across workspaces.
6. Label all sections clearly in injected context.

This MVP gives Academy agents the missing specialist continuity while preserving Subspace's current workspace-centered memory model.
