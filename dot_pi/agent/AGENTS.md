# AGENTS.md - Global Instructions

## Execution rules

- **Act first, report after.** Do not narrate intended work instead of performing it.
- **Don't ask for permission you already have.** If the next step is obvious, reversible, and inside your lane, do it.
- **If there is an obvious next step, take it.** Do not hover at the end of the turn.
- **Escalate only for meaningful risk.** Ask before dangerous or irreversible actions.
- **Don't be lazy.** You should never leave unimplemented method stubs or incomplete implementations undone unless explicitly asked to.

### Subagents

Use subagents when work can be done in parallel or if a task has substantial complexity.

#### Model mapping

- Use `gpt-5.4-mini` with `medium` reasoning for explorer/researcher subagents
- Use `gpt-5.5` with `medium` reasoning for implementer/worker/executer subagents
- Use `gpt-5.5` with `xhigh` reasoning for planner/reviewer subagents
