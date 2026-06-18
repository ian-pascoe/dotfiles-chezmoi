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

<!-- BEGIN COMPOUND CODEX TOOL MAP -->
## Compound Codex Tool Mapping (Claude Compatibility)

This section maps Claude Code plugin tool references to Codex behavior.
Only this block is managed automatically.

Tool mapping:

- Read: use shell reads (cat/sed) or rg
- Write: create files via shell redirection or apply_patch
- Edit/MultiEdit: use apply_patch
- Bash: use shell_command
- Grep: use rg (fallback: grep)
- Glob: use rg --files or find
- LS: use ls via shell_command
- WebFetch/WebSearch: use curl or Context7 for library docs
- AskUserQuestion/Question: present choices as a numbered list in chat and wait for a reply number. For multi-select (multiSelect: true), accept comma-separated numbers. Never skip or auto-configure — always wait for the user's response before proceeding.
- Task (subagent dispatch) / Subagent / Parallel: run sequentially in main thread; use multi_tool_use.parallel for tool calls
- TaskCreate/TaskUpdate/TaskList/TaskGet/TaskStop/TaskOutput (Claude Code task-tracking, current): use update_plan (Codex's task-tracking primitive)
- TodoWrite/TodoRead (Claude Code task-tracking, legacy — deprecated, replaced by Task* tools): use update_plan
- Skill: open the referenced SKILL.md and follow it
- ExitPlanMode: ignore
<!-- END COMPOUND CODEX TOOL MAP -->
