# Package ownership

Prefer `dot_config/mise/config.toml` for shared CLI tools and runtimes. Use registry
shorthands first, then explicit `npm:`, `cargo:`, `pipx:` or `go:` backends. Python
tools belong to Mise even though the backend is called `pipx`.

- `dot_config/packages/private_apt.txt`: Linux system packages, development
  headers, native toolchains, services and bootstrap tools.
- `dot_config/scoop/scoopfile.json`: Windows apps, fonts, native libraries,
  toolchains and bootstrap tools.
- `Brewfile`: macOS apps, native libraries, services and bootstrap tools.
- Language-manager lists in `dot_config/packages/`: currently empty; do not
  re-add tools already owned by Mise.

Git and Mise remain native bootstrap selections. Native package managers may
still install runtime/library dependencies transitively; removing an explicit
selection does not remove those dependencies. Matching names are not enough to
replace system development libraries with a Mise executable.

Most tools keep the existing `latest` policy, not identical version pins across
machines. Global Zig is pinned to `0.15.2` for terminal-control's Ghostty source
build. Upstream platform support still matters: `btop`, `tmux`
and `terminal-control` are restricted to Linux/macOS, and `mold` to Linux.
Windows persistent-session support for terminal-control is awaiting
[upstream PR #16](https://github.com/anomalyco/terminal-control/pull/16)
(unmerged when checked on 2026-09-09). Revisit that guard after a supported
release. Native Windows/macOS installations have not been exercised by the
Linux-hosted regression tests.

## Installing and pruning

`install-package-manifests` requires Python 3.9+ and remains install-only by
default. Explicitly opt into pruning, including apt and Scoop:

```sh
install-package-manifests --prune --dry-run
install-package-manifests --prune
# For an already reviewed plan, skip confirmations:
install-package-manifests --prune --yes
```

On Windows use `install-package-manifests.ps1` (the same arguments). The launcher
locates Python and propagates failures; the shared installer runs Scoop and other
PowerShell shims without interpolating package names as PowerShell code.

Scoop reads `~/.config/scoop/scoopfile.json` by default, or
`--scoop-file PATH`. With a custom `--manifest-dir`, the default Scoop config is
its sibling `../scoop/scoopfile.json`, not the real home's config. Installation
uses `scoop import`, including declared buckets. Pruning compares `scoop export`
against the configured apps, distinguishing user/global installs. It preserves
held apps, bootstrap tools and dependencies from retained installed manifests.
Global removals use `--global`; no buckets or persisted app data are purged.
Ambiguous duplicate user/global copies, unreadable dependencies, malformed
inventories and failed/missing configured apps abort pruning. Elevation is still
required for global operations when Scoop requires it.

Dry-run and real installs both skip bare package names already present in the
manager's inventory. Version/source requirements still go to the manager for
resolution; Scoop imports contain only missing or failed apps. APT refreshes
indexes only when an install command is needed. Dry-run executes no installs or
removals; APT planning modifies only a temporary copy of its auto/manual state.
Without `--yes`, installation and the resulting removal list have separate
confirmations. Unexpected installation or inventory failures prevent pruning.
Bun's missing-lockfile response skips Bun pruning; any explicit Bun install
requests are reported as unverified and forwarded to Bun. Missing manifests skip
that manager; **an existing empty manifest intentionally prunes its packages**.
Pruning accepts named package specs (including versions/scopes/Python extras),
not ambiguous bare Git URLs or local paths.

APT retains configured roots and their dependencies, held packages, Essential
and Protected packages, required/important/standard-priority packages, Python 3,
and kernel/bootloader packages. Its resolver computes unused packages using the
private state map. The exact removal set is simulated again before execution;
real auto/manual marks are unchanged, and no purge or broad autoremove runs.
Unresolved/virtual configured package names abort the plan rather than risking
their providers; use concrete installed names. Cargo operations consistently use
`CARGO_INSTALL_ROOT`, then `CARGO_HOME`, then `~/.cargo` via explicit `--root`
(the Cargo config's `install.root` is not used).
**Unlisted desktop applications and services can still be removed.** Review
APT's list carefully. Concurrent package-manager activity can invalidate a plan;
no simulation locks the later transaction.

Global pruning covers npm, Bun, pnpm, uv, Cargo and pipx. Mise-owned tool prefixes
are rejected (Node's ordinary npm global prefix is allowed); npm/corepack and
active manager bootstrap copies are retained. A legacy manager copy is eligible
only when its active executable resolves to a separate Mise install; opaque
shell launchers are conservatively retained. Switch PATH first, then retry.
This command does not prune Mise or Homebrew installations. Install and verify
Mise replacements before pruning the old manager copies.

## Migration

Changing these files does not uninstall existing packages. Deployment requires
separate approval; see [the chezmoi hooks](chezmoi-hooks.md) for the scoped
apply/install workflow. The Mise hook installs the shared manifest on each OS.

After deployment, verify the new tools before removing any old copies:

1. Run `mise which pi`, `mise which pnpm`, and equivalent checks for migrated
   tools. Compare shell resolution with `type -a pi pnpm` on Bash or
   `Get-Command pi,pnpm -All` on PowerShell. A previous global install can still
   win on PATH.
2. Smoke-test the tools and Neovim completions. The Pi bridge supports Mise's
   npm install, local dependencies, `PI_PACKAGE_DIR`, and legacy pnpm launchers.
3. Review each previous manager's inventory and explicitly approve removals.
   Do not mass-uninstall native libraries or bootstrap packages. Mise now owns
   Pi CLI updates; `upgrade-all` asks Pi to update only extension packages.

## Exporting host inventory

`sync-package-manifests` is also Python 3.9+, with a
`sync-package-manifests.ps1` launcher on Windows. It shares inventory parsing
and native command dispatch with the installer in
`~/.local/lib/package_manifests.py`; deploy that module along with either script.

```sh
sync-package-manifests --dry-run
sync-package-manifests --output-dir /path/to/inventory
```

The default remains
`${XDG_STATE_HOME:-$HOME/.local/state}/package-inventory`, including on Windows;
`upgrade-all` needs no invocation changes. `MANIFEST_DIR` and the
`--manifest-dir` alias remain supported; explicit CLI output wins over the
environment. Known curated package/Scoop directories are rejected as outputs.

The snapshots are **host inventory, not install intent**:

- apt manual packages and npm/Bun/pnpm/uv/Cargo/pipx globals: sorted,
  deduplicated text files, including bootstrap packages.
- Scoop apps (including global/held metadata) and buckets: `scoopfile.json`.
- Mise installed tool versions: `mise.json`.
- Homebrew installed formulae and casks: `brew.json`.

Missing managers are reported and their previous snapshots remain untouched;
no empty manifests are fabricated. A successful empty inventory is recorded as
empty. All available collectors must succeed before any snapshots are written.
Changed files use atomic, same-directory replacement; unchanged files keep their
timestamps. The collection is not a multi-file transaction if a later filesystem
write fails. `--dry-run` still collects and validates, but writes nothing.

Promote entries into Mise deliberately rather than replacing cross-platform
install configs with one host's inventory. The exporter never installs or prunes.

## Checks

Run from the source root; these use isolated fixtures, not real installs:

```sh
python3 tests/test-package-pruning.py
python3 tests/test-package-pruning-windows.py
python3 tests/test-package-ownership.py
python3 tests/test-package-inventory.py
python3 tests/test-minuet-pi-resolution.py
python3 tests/test-chezmoi-hooks.py
```
