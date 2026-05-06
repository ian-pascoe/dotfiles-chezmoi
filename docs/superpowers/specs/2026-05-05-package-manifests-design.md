# Package Manifests Design

## Goal

Track non-mise, non-Homebrew package selections in the dotfiles repo so a new machine can be audited or restored from explicit package lists.

## Scope

Add store-only package manifests, a refresh command, and an explicit install command for these managers:

- Debian/Ubuntu apt packages
- npm global packages
- Bun global packages
- pnpm global packages
- uv tools
- cargo-installed binaries
- pipx tools

No install hooks, `run_once_*` scripts, or `chezmoi apply` package mutations are part of this change. Refreshing the manifests records installed state only; it does not install or remove packages. Installation is available only through an explicit user-run command.

## Location

Use `dot_config/packages/` so chezmoi deploys the files to `~/.config/packages/`.

This keeps the manifests in a standard user configuration location and makes them easy for future scripts to consume without inventing a custom dot-directory.

## Files

- `dot_config/packages/apt.txt`
- `dot_config/packages/npm-global.txt`
- `dot_config/packages/bun-global.txt`
- `dot_config/packages/pnpm-global.txt`
- `dot_config/packages/uv-tools.txt`
- `dot_config/packages/cargo-install.txt`
- `dot_config/packages/pipx.txt`
- `dot_local/bin/executable_sync-package-manifests`
- `dot_local/bin/executable_install-package-manifests`
- `dot_local/bin/executable_upgrade-all`

## Format

Each manifest is plain text:

- One package spec per line
- Blank lines allowed
- `#` comments allowed for notes or grouping
- Package-manager-native names and specifiers preserved where useful

Examples:

```text
# CLI tools
@anthropic-ai/claude-code
typescript
```

```text
camoufox
nano-pdf
```

## Data Flow

Chezmoi source files under `dot_config/packages/` deploy directly to `~/.config/packages/`.

`dot_local/bin/executable_sync-package-manifests` resolves the chezmoi source directory with `chezmoi source-path`, exports installed package state directly from each package manager, and updates the source manifests only when content changes.

`dot_local/bin/executable_upgrade-all` runs `sync-package-manifests` after package-manager updates and before dotfiles are pulled. This captures the current machine state during the normal maintenance workflow.

`dot_local/bin/executable_install-package-manifests` installs packages from deployed manifests in `~/.config/packages/`. It supports `--dry-run`, `--yes`, and `--manifest-dir DIR`. Without `--dry-run` or `--yes`, it prompts before installing.

Install commands by manifest:

- apt: `sudo apt-get update` then `sudo apt-get install -y ...`
- npm: `npm install -g <package>`
- Bun: `bun add -g <package>`
- pnpm: `pnpm add -g <package>`
- uv: `uv tool install <tool>`
- cargo: `cargo install <crate>`
- pipx: `pipx install <package>`

## Error Handling

Missing package managers are skipped during refresh and produce header-only manifests. Empty global package managers are handled as valid empty manifests.

During install, missing package managers are skipped with a visible message. Package installation failures remain visible command failures.

Future installer scripts should treat missing package managers as skipped sections and package install failures as visible command failures.

## Verification

Verify the change by checking that:

- All expected manifest files exist under `dot_config/packages/`
- The files are plain text and readable
- No `run_once_*`, `run_onchange_*`, or install hook was added
- `chezmoi` source paths map to `~/.config/packages/` as intended
- `bash -n` passes for `dot_local/bin/executable_sync-package-manifests` and `dot_local/bin/executable_upgrade-all`
- Running `sync-package-manifests` leaves manifests matching direct package-manager exports
- `bash -n` passes for `dot_local/bin/executable_install-package-manifests`
- `install-package-manifests --help` documents `--dry-run`, `--yes`, and `--manifest-dir`
- `install-package-manifests --dry-run` prints planned install commands without mutating packages

## Deferred Work

Future changes may add per-manager selection flags if installing every manifest at once becomes too broad. Package installation should remain separate from `chezmoi apply` unless there is a deliberate decision to make installation part of dotfile application.
