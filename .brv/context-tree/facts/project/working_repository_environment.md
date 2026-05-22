---
title: Working Repository Environment
summary: Repository environment notes covering the working repo location, available shell context, and curation workflow constraints for this session.
tags: []
related: [facts/project/working_repo_environment.md]
keywords: []
createdAt: '2026-05-22T11:52:05.455Z'
updatedAt: '2026-05-22T11:52:40.584Z'
---
## Reason
Curate repository environment details from the provided context

## Raw Concept
**Task:**
Document the current repository environment and curation operating constraints for this session

**Changes:**
- Captured repository location and runtime environment
- Recorded curation workflow preference for UPSERT
- Preserved context tree location and current date
- Captured the working directory and repository status
- Captured platform, OS, and Node runtime versions
- Captured the current date and curation mode constraints

**Files:**
- .brv/context-tree/
- .brv/config.json
- .brv/context-tree/facts/project/working_repository_environment.md

**Flow:**
session context -> environment metadata -> durable facts capture -> curation workflow constraints

**Timestamp:** 2026-05-22T11:52:28.705Z

**Author:** ByteRover context engineer

## Narrative
### Structure
This entry records the operational environment for the current session, including the repository root and runtime platform details. It also preserves the instruction set for RLM-style curation used in this interaction.

### Dependencies
Depends on the provided context, history, metadata, and task ID variables supplied by the caller.

### Highlights
The session is running in an existing git repository on Linux with Node v26.2.0. The context is compact enough for single-pass curation.

### Rules
Do NOT print raw context. Do NOT call tools.curation.recon when recon has already been pre-computed. Verify via result.applied[].filePath and do NOT call readFile for verification.

### Examples
Useful for future sessions that need to know the repo root, runtime, or curation conventions.

## Facts
- **working_directory**: The working directory is /home/ianpascoe/.local/share/chezmoi [environment]
- **git_repo**: The directory is a git repo [environment]
- **platform**: The platform is linux [environment]
- **os_version**: The OS version is 6.12.86+deb13-amd64 [environment]
- **node_version**: The Node version is v26.2.0 [environment]
- **current_date**: The current date is 2026-05-22 [environment]
- **rlm_curation_mode**: Curate tasks in this environment must follow the RLM approach and use the provided context, history, metadata, and task ID variables [convention]
