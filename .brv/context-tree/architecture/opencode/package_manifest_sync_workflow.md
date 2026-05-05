---
title: Package Manifest Sync Workflow
summary: sync-package-manifests refreshes package manifests and upgrade-all now invokes it before dotfiles pull; verification confirmed matching exports and no hooks added
tags: []
related: []
keywords: []
createdAt: '2026-05-05T16:42:22.708Z'
updatedAt: '2026-05-05T16:42:22.708Z'
---
## Reason
Document the implemented manifest refresh workflow and verification outcomes

## Raw Concept
**Task:**
Document the implemented package manifest synchronization workflow for chezmoi-managed dotfiles.

**Changes:**
- Added dot_local/bin/executable_sync-package-manifests
- Updated dot_local/bin/executable_upgrade-all to run sync-package-manifests
- Updated package manifest docs/spec/plan to match the new refresh flow
- Re-ran sync so dot_config/packages/*.txt reflects current installed state

**Files:**
- dot_local/bin/executable_sync-package-manifests
- dot_local/bin/executable_upgrade-all
- dot_config/packages/apt.txt
- dot_config/packages/npm-global.txt
- dot_config/packages/bun-global.txt
- dot_config/packages/pnpm-global.txt
- dot_config/packages/uv-tools.txt
- dot_config/packages/cargo-install.txt
- dot_config/packages/pipx.txt

**Flow:**
upgrade-all -> sync-package-manifests -> export package manager state -> write manifests -> dotfiles pull

**Timestamp:** 2026-05-05T16:42:11.505Z

**Author:** assistant

## Narrative
### Structure
The workflow is implemented through a dedicated sync script and an upgrade-all wrapper that invokes it before the dotfiles pull step.

### Dependencies
The sync script relies on direct package-manager exports and must tolerate empty-manager cases such as bun, pnpm, and pipx without failing the overall run.

### Highlights
Verification confirmed bash -n passed for both scripts, the sync script exited 0, chezmoi target-path mapped apt.txt correctly, and manifest export checks matched current installed state with no missing or extra items. No run_once_* or run_onchange_* hooks were added.

### Rules
No run_once_* or run_onchange_* hooks added

### Examples
Manifest export check: apt 223/223, npm 22/22, bun 0/0, pnpm 0/0, uv 4/4, cargo 12/12, pipx 0/0.
