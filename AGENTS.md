# Repository Notes

- This repo is a `chezmoi` source tree, not a normal app/library repo. Paths like `dot_config/opencode/opencode.json` map to `~/.config/opencode/opencode.json` when applied.
- `AGENTS.md` and `README.md` are intentionally excluded from deployment by `.chezmoiignore`, so root docs are repo-only guidance.
- OS-specific deployment is handled in `.chezmoiignore`. In particular, `.config/systemd` only applies on Linux, and several GUI configs are skipped outside macOS/Windows.

# High-Value Files

- OpenCode config: `dot_config/opencode/opencode.json`
- OpenCode global instructions that get deployed: `dot_config/opencode/AGENTS.md`
- Hindsight config: `dot_hindsight/opencode.json`
- Installed skills and provenance lockfile: `dot_agents/` and `dot_agents/dot_skill-lock.json`
- External fetched assets: `.chezmoiexternal.toml`

# Editing Rules

- Do not put repo-specific agent guidance only in `dot_config/opencode/AGENTS.md`; that file becomes the user's global OpenCode instructions. Keep repo-only notes in the root `AGENTS.md` unless the deployed behavior must change.
- For Homebrew changes, edit `.Brewfile_linux` or `.Brewfile_darwin`. `Brewfile.tmpl` is only the OS switch that includes one of those files.
- Treat `.chezmoiexternal.toml` entries as source-of-truth for fetched plugins/assets; do not create hand-maintained copies of those downloaded contents in the repo.

# Verification

- There is no repo-wide build/test/lint entrypoint. Verify the smallest relevant surface instead of guessing a global command.
- OpenCode JSON changes: read `dot_config/opencode/opencode.json` directly and keep edits schema-shaped; there is no local validation script in this repo.
- Markdown changes: the configured formatter is `markdownlint-cli2 --fix`.
- Lua changes: the configured formatter is `stylua --search-parent-directories --stdin-filepath "$FILE"`, using `dot_config/nvim/stylua.toml`.

# Structure Notes

- Neovim boots from `dot_config/nvim/init.lua`, which immediately loads `lua/config/lazy.lua`; LazyVim and local plugin specs are wired there.
- `dot_config/nvim/lua/plugins/*.lua` is mostly import wiring. The real language/formatting/linting customizations usually live under `lua/plugins/lang`, `lua/plugins/formatting`, and `lua/plugins/linting`.
- The Linux user service for OpenCode is `dot_config/systemd/user/opencode.service`, which runs `opencode web --port 4096 --print-logs` from `/home/ianpascoe`.
- `dot_agents/skills/*` contains checked-in skill content. Update `dot_agents/dot_skill-lock.json` consistently when changing installed skill sources or versions.
