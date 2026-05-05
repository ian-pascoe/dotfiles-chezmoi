---
title: Neovim SSH Clipboard Fix
summary: Neovim over SSH was fixed by forcing the OSC52 clipboard provider in SSH sessions and enabling unnamedplus so yanks route through the terminal/system clipboard.
tags: []
related: []
keywords: []
createdAt: '2026-05-05T16:39:53.496Z'
updatedAt: '2026-05-05T16:39:53.496Z'
---
## Reason
Preserve the durable fix for copy/paste behavior in Neovim over SSH

## Raw Concept
**Task:**
Document the Neovim clipboard fix applied for SSH sessions

**Changes:**
- Forced the clipboard provider to osc52 for SSH sessions
- Enabled unnamedplus to route normal yanks through the terminal/system clipboard
- Verified formatting and SSH startup behavior

**Files:**
- dot_config/nvim/lua/config/options.lua

**Flow:**
SSH session -> detect session type -> set osc52 provider -> set unnamedplus -> verify startup

**Timestamp:** 2026-05-05T16:39:35.246Z

## Narrative
### Structure
The fix lives in the Neovim options configuration and applies only when running over SSH.

### Dependencies
Relies on the terminal supporting OSC52 for clipboard transfer behavior.

### Highlights
The configuration preserves normal clipboard behavior in SSH while keeping the change minimal and verifiable.

### Rules
OSC52 copy depends on your local terminal supporting OSC52. Clipboard read/paste via OSC52 may also require terminal permission, but normal terminal paste still works.

### Examples
A successful verification reported ssh clipboard ok after the config update.

## Facts
- **neovim_ssh_clipboard_issue**: Copy and paste was not working properly in Neovim when SSH'ed into a machine. [project]
- **neovim_clipboard_provider**: The fix forces the Neovim clipboard provider to osc52 only for SSH sessions. [project]
- **neovim_clipboard_setting**: The fix sets clipboard=unnamedplus so normal yanks use the terminal/system clipboard. [project]
- **neovim_clipboard_verification**: The change was verified with stylua --check and an SSH startup check that returned ssh clipboard ok. [project]
- **osc52_terminal_dependency**: OSC52 copy depends on the local terminal supporting OSC52, and clipboard read/paste via OSC52 may require terminal permission. [environment]
