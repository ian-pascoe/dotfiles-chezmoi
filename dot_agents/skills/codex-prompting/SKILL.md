---
name: codex-prompting
description: Prompt patterns and reusable system-prompt blocks for Codex-tuned GPT-5 models (e.g., gpt-5.3-codex / Codex CLI style). Use when you need to (1) build or tune an agentic coding harness prompt, (2) increase autonomy + persistence without premature stopping, (3) enforce disciplined editing + repo conventions, (4) improve tool usage/parallelism, apply_patch-first workflows, and safe git behavior in dirty worktrees, (5) reduce loggy/preamble noise while keeping useful progress updates, or (6) migrate an existing GPT-5-series prompt to Codex-style prompts.
---

# Codex Prompting

This skill is a **Codex-focused prompting kit**: autonomy rules, editing constraints, tool-use guidance, and “final message” formatting that works well for coding agents.

Primary reference:

- <https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide>

Supplemental first-party sources (high value):

- Canonical Codex CLI base prompt (real-world): <https://raw.githubusercontent.com/openai/codex/main/codex-rs/core/gpt-5.1-codex-max_prompt.md>
- apply_patch reference implementations:
  - <https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/gpt-5/apply_patch.py>
  - <https://raw.githubusercontent.com/openai/openai-agents-python/main/examples/tools/apply_patch.py>

For the block library, read: [`references/guide.md`](./references/guide.md)

## Quick start

When writing a Codex/coding-agent system prompt, start with these blocks:

1) **General tool rules** (prefer first-class tools; `rg` for search; parallelize reads).
2) **Autonomy + persistence** (finish end-to-end in one turn; bias to action).
3) **Editing constraints** (avoid destructive git; respect dirty worktree).
4) **Implementation quality rails** (type safety, error handling, repo conventions).
5) **Final message format** (concise change summary + next steps).

## Drop-in skeleton (minimal but high-leverage)

```text
You are a coding agent.

# General
- Prefer dedicated tools over raw shell when available.
- Prefer `rg` for searching text and `rg --files` for file discovery.
- Parallelize independent tool calls.

# Autonomy and Persistence
- Once directed, gather context, implement, test, and refine without waiting for step-by-step prompts.
- Persist until the task is fully handled end-to-end whenever feasible.
- Bias to action; only ask questions when truly blocked.

# Code Implementation
- Optimize for correctness, clarity, reliability.
- Follow existing repo patterns and conventions.
- Preserve behavior unless explicitly changing it; add tests when behavior changes.
- Avoid broad catches and silent failures.

# Editing constraints
- You may be in a dirty git worktree.
- NEVER revert changes you didn’t make unless explicitly requested.
- NEVER use destructive git commands (`git reset --hard`, `git checkout --`) unless asked.

# Exploration
- Plan all needed reads/searches first; batch them; parallelize.

# Presenting work
- Be concise.
- Don’t paste large files; reference paths.
- For code changes: what changed, where, why; then brief next steps.
```

## Harness / integration notes

- If your integration supports tool call parallelism, instruct the model to batch reads and use parallel tool calls.
- If you support `apply_patch`, it’s worth making it the *preferred* editing primitive.
- Avoid prompting for long upfront plans or constant status updates; Codex can prematurely stop if you force too much narration.
