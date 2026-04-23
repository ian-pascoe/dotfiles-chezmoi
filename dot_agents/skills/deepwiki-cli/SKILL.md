---
name: deepwiki-cli
description: Use when a task needs AI-grounded documentation or architecture answers about a GitHub repository through the local `deepwiki-cli` wrapper. Reach for this whenever the user asks how a specific repo is structured, wants repo-specific docs or topic maps, needs an explanation of how code in a GitHub repository works, wants a summary of important modules or subsystems, or wants to compare implementation patterns across one or more repositories. Prefer this skill over generic web search when the task is about understanding a repository as a whole rather than looking up public API docs for a library.
metadata:
  {
    "openclaw":
      {
        "emoji": "📚",
        "requires": { "bins": ["deepwiki-cli"] }
      }
  }
---

# deepwiki-cli

Use `deepwiki-cli` to retrieve repository-focused documentation and ask codebase-aware questions about GitHub repositories.

This skill is best when the user needs help understanding a repository, not just a package API. Think architecture, subsystem boundaries, major flows, implementation patterns, and where to look next.

## Bootstrap the CLI

If `deepwiki-cli` is not installed yet, generate it first with `mcporter`:

```bash
npx -y mcporter@latest generate-cli --command https://mcp.deepwiki.com/mcp --compile ~/.local/bin/deepwiki-cli --name deepwiki-cli
```

After generation, verify it exists with:

```bash
~/.local/bin/deepwiki-cli --help
```

## Trigger Heuristics

- The user asks how a GitHub repository is organized or what its major components are.
- The user wants a repo-specific explanation like “how does this project handle auth?”, “where is caching implemented?”, or “what files should I read first?”.
- The user needs a documentation map for a repo before deeper investigation.
- The user wants a high-level answer grounded in a repository, not a generic explanation from training data.
- The user wants to compare similar patterns across multiple repositories.
- The user gives one or more GitHub repositories and asks an implementation or architecture question.

Do not use this skill for generic library API syntax, framework configuration, or version-specific public docs when `find-docs` is the better fit.

## Mindset

Treat DeepWiki as a repo-understanding tool.

- Use it to orient quickly in unfamiliar repositories.
- Start broad, then narrow to the question the user actually cares about.
- Prefer a topic map before a full wiki dump when you do not yet know where the answer lives.
- Ask targeted questions instead of vague ones.
- Report findings as repository-grounded summaries, not as unqualified guesses.

## Core Workflow

1. Identify the target repository or repositories in `owner/repo` form.
2. If the structure is unclear, start with `read-wiki-structure`.
3. If the user needs broad repository context, use `read-wiki-contents`.
4. If the user has a specific question, use `ask-question` with a focused prompt.
5. Summarize the answer with explicit repository context.
6. If the result is still too broad, ask a narrower follow-up question or inspect the structure first.

Use the simplest path that gets a grounded answer. Do not dump the full wiki unless the user asked for it or you genuinely need the broader context.

## Choosing the Right Command

### Use `read-wiki-structure`

Use this first when you need orientation.

- You do not know the major topics covered for the repository yet.
- You want a fast map of likely sections before reading more.
- You need to tell the user where relevant documentation probably lives.

```bash
deepwiki-cli read-wiki-structure --repo-name "facebook/react"
```

### Use `read-wiki-contents`

Use this when the user needs broader repository documentation or when the structure suggests the answer may span multiple topics.

- The user asked for an overview of the repository.
- You need more context before asking a precise question.
- The task is documentation extraction, summarization, or broad onboarding.

```bash
deepwiki-cli read-wiki-contents --repo-name "facebook/react"
```

### Use `ask-question`

Use this for targeted repository questions.

- “How does this repo implement authentication?”
- “Which modules handle request retries?”
- “What is the flow from API request to database write?”
- “How do these two repos differ in their plugin architecture?”

```bash
deepwiki-cli ask-question \
  --repo-name "facebook/react" \
  --question "How is the reconciler organized, and which parts should I read first?"
```

## Asking Good Questions

The quality of the answer depends heavily on the specificity of the question.

Good question traits:

- Names the concern: auth, caching, plugin system, build pipeline, rendering flow, data loading, test strategy.
- Asks for relationships: which modules, what flow, where to start reading.
- Requests the level of detail needed: overview, component map, step-by-step flow, comparison.

Weak question:

```bash
deepwiki-cli ask-question --repo-name "vercel/next.js" --question "Explain this repo"
```

Stronger question:

```bash
deepwiki-cli ask-question \
  --repo-name "vercel/next.js" \
  --question "How is routing organized in this repo, and which directories should I inspect to understand request handling end to end?"
```

## Multi-Repo Usage

`ask-question` accepts one repository or a list of repositories, up to 10 total.

Use multi-repo queries when the user wants comparison or cross-project synthesis.

- Compare architecture choices across similar projects.
- Contrast where different repos place a concern like auth, plugins, or data fetching.
- Identify recurring patterns across related repositories.

Prefer JSON array syntax in `--repo-name` if quoting a list would otherwise be awkward.

Multi-repo questions only work for repositories that DeepWiki already has available. If a repo is not indexed yet, the CLI will fail with a repository-not-found error.

```bash
deepwiki-cli ask-question \
  --repo-name '["facebook/react","some-org/some-indexed-repo"]' \
  --question "How do these repositories differ in internal rendering architecture and extension points?"
```

## Output Modes

Global output modes are available through `-o`.

- Use default text output for direct reading.
- Use `-o markdown` when you want a cleaner report-style result.
- Use `-o json` when another tool or agent will parse the result.
- Use `-o raw` only when you need the untouched underlying payload.

Examples:

```bash
deepwiki-cli -o markdown read-wiki-contents --repo-name "facebook/react"
deepwiki-cli -o json ask-question --repo-name "facebook/react" --question "What are the major packages in this repo?"
```

## Reliable Operating Rules

- Preserve exact `owner/repo` formatting.
- Start with `read-wiki-structure` when you need orientation.
- Prefer `ask-question` over dumping full contents if the user already has a clear question.
- Prefer `-o json` when the result will be consumed programmatically.
- Keep questions specific and repo-grounded.
- When comparing repos, name the dimension of comparison explicitly.
- If the answer feels too generic, refine the question rather than repeating it unchanged.

## Reporting Results

When using this skill for a user task, report both the answer and how it was derived.

- Name the repository or repositories used.
- Mention whether the answer came from structure lookup, full wiki contents, or targeted Q&A.
- Distinguish between high-confidence repo-grounded findings and broader interpretation.
- If the result suggests likely files, packages, or subsystems to inspect next, call those out clearly.
- If DeepWiki did not fully answer the question, say what remains uncertain.

## Minimal Recipes

### Get a quick topic map for a repository

```bash
deepwiki-cli read-wiki-structure --repo-name "microsoft/vscode"
```

### Read broad repository docs in markdown form

```bash
deepwiki-cli -o markdown read-wiki-contents --repo-name "microsoft/vscode"
```

### Ask where to start reading for a subsystem

```bash
deepwiki-cli ask-question \
  --repo-name "microsoft/vscode" \
  --question "How is the extension host organized, and which components should I read first to understand its lifecycle?"
```

### Compare two repositories

```bash
deepwiki-cli ask-question \
  --repo-name '["facebook/react","some-org/some-indexed-repo"]' \
  --question "How do these repos differ in project structure and subsystem boundaries?"
```

## Boundaries

Use `deepwiki-cli` when the unit of understanding is a repository.

Prefer other tools when:

- The task is generic API or framework documentation: use `find-docs`.
- The task is local repository inspection in the current workspace: use repo exploration tools directly.
- The task is GitHub issue, PR, workflow, or repository management: use `gh-cli`.
- The user wants to generate or modify DeepWiki content itself: only use generation or private-mode management commands when explicitly requested.

## Common Mistakes

- Asking broad questions when a structural pass would narrow the search first.
- Using this skill for public API syntax instead of library docs.
- Forgetting that repository names must be in `owner/repo` format.
- Reporting DeepWiki output as if it were independently verified local code inspection.
- Comparing multiple repos without saying what dimension should be compared.

## Notes

- Publicly useful commands in this CLI are `read-wiki-structure`, `read-wiki-contents`, and `ask-question`.
- Global flags include `-t, --timeout <ms>` and `-o, --output text|markdown|json|raw`.
- The CLI also exposes private-mode Devin and management commands. Do not use those unless the user explicitly asks for them and the environment supports them.
- Multi-repo examples depend on all referenced repositories already being indexed in DeepWiki.
