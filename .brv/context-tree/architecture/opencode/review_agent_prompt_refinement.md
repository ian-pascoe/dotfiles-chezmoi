---
consolidated_at: '2026-05-05T15:55:10.733Z'
consolidated_from: [{date: '2026-05-05T15:55:10.733Z', path: architecture/opencode/review_agent_prompt_refinement.overview.md, reason: 'These are the same review-agent prompt refinement in source, overview, and abstract form. The overview and abstract are summaries of the markdown source, not distinct knowledge.'}, {date: '2026-05-05T15:55:10.733Z', path: architecture/opencode/review_agent_prompt_refinement.abstract.md, reason: 'These are the same review-agent prompt refinement in source, overview, and abstract form. The overview and abstract are summaries of the markdown source, not distinct knowledge.'}]
related: [architecture/opencode/byterover_context_engine_ideas.md, architecture/opencode/byterover_plugin_curation_and_recall.md, architecture/opencode/byterover_recall_window_update.md, architecture/opencode/recall_and_curation_improvements.md]
---
title: Review Agent Prompt Refinement
summary: Review agent prompt was refined to emphasize evidence-based reviewing, severity ordering, no-edit behavior, and clear review output; verification checks passed except markdownlint-cli2 missing.

## Reason
Document the review agent prompt refinement and verification outcomes

## Raw Concept
**Task:**
Refine the reviewer prompt and document verification outcomes

**Changes:**
- Refined reviewer prompt to distinguish review from solving
- Tightened severity ordering and evidence requirements
- Clarified when fixes are allowed and how to report findings

**Files:**
- dot_config/opencode/prompt/review.md
- dot_config/opencode/opencode.jsonc

**Flow:**
read prompt -> refine review posture -> validate formatting and config -> record results

**Timestamp:** 2026-05-03T10:34:53.109Z

**Author:** ByteRover context engineer

## Narrative
### Structure
The review prompt is organized into review types, working rules, supervisor coordination, and a fixed review output format.

### Dependencies
It depends on evidence from code, tests, docs, requirements, and repo-local progress handling rules.

### Highlights
Prompt now emphasizes disciplined review behavior, minimal corrections, and clear findings reporting.

### Rules
Review-only or no-edit instructions win over progress-writing instructions. Do not write progress.md. Do not invent issues. Prefer small corrective edits over broad rewrites. If everything looks good, say so plainly.

### Examples
Review output sections: Correct, Fixed, Blocker, Note.

## Facts
- **review_agent_role**: The review agent is a disciplined review subagent that inspects, evaluates, and reports findings with evidence. [project]
- **review_agent_scope**: The review agent covers code diffs, plans, proposed solutions, current overall codebase state, and specific PRs or issues. [project]
- **review_checklist**: The review prompt requires checking intent, edge cases, tests, regressions, and minimal readability for code diffs. [convention]
- **review_no_edit_rule**: The review prompt says review-only or no-edit instructions win over progress-writing instructions. [convention]
- **evidence_standard**: The review prompt requires evidence-based findings and forbids inventing issues. [convention]
- **review_output_format**: The review prompt output format uses Correct, Fixed, Blocker, and Note sections. [convention]
- **verification_results**: Verification passed for JSONC parse, markdown structural checks, and git diff --check. [project]
- **formatter_availability**: markdownlint-cli2 was not installed, so the configured formatter could not run. [project]