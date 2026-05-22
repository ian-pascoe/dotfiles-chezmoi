---
title: Working Repo Environment
summary: Repository and runtime environment facts for the chezmoi workspace and context tree layout.
tags: []
related: []
keywords: []
createdAt: '2026-05-22T11:41:50.237Z'
updatedAt: '2026-05-22T11:41:50.237Z'
---
## Reason
Capture repository and runtime facts from the active curation context.

## Raw Concept
**Task:**
Document the active repository environment and curation workspace facts.

**Changes:**
- Recorded the chezmoi workspace root
- Captured the git/Linux/Node runtime baseline
- Preserved context tree hierarchy constraints
- Recorded UPSERT as the preferred curation operation

**Files:**
- .brv/context-tree/
- .brv/config.json

**Flow:**
identify workspace -> capture environment constraints -> preserve curation conventions -> store durable facts

**Timestamp:** 2026-05-22T11:41:38.985Z

**Author:** ByteRover context engine

## Narrative
### Structure
This entry records environment and workspace facts that govern curation behavior in the chezmoi repository.

### Dependencies
Depends on the current repo location, operating system, Node runtime, and the .brv context tree layout.

### Highlights
Establishes the operational baseline for future curation tasks and reinforces UPSERT as the default mutation method.

## Facts
- **repo_root**: The repository is a chezmoi-managed dotfiles workspace at /home/ianpascoe/.local/share/chezmoi. [project]
- **runtime_environment**: The working directory is a git repository on Linux with Node.js v26.2.0. [environment]
- **context_tree_structure**: The context tree is stored under .brv/context-tree/ and uses a domain/topic/subtopic hierarchy with a maximum depth of 2 levels. [convention]
- **curation_operation_preference**: UPSERT is the preferred curation operation and should be used instead of ADD or UPDATE when possible. [convention]
