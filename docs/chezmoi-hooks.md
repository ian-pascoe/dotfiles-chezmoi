# Deployment hooks

The scripts in `.chezmoiscripts/` run **after** files are deployed, in this order:

| Order | Action                                                        | Checksum inputs               |
| ----- | ------------------------------------------------------------- | ----------------------------- |
| 10    | `mise install`                                                | `dot_config/mise/config.toml` |
| 20    | Install Pi dependencies with pnpm, lifecycle scripts disabled | `dot_pi/agent/package.json`   |
| 30    | Refresh Bat's `current.tmTheme` and rebuild its cache         | Bat config and theme inputs   |
| 40    | `systemctl --user daemon-reload`                              | Source user service units     |

These are `run_onchange_after_` scripts: chezmoi hashes their rendered content,
including input checksums, and records successful runs. Unchanged applies do not
repeat installation or reloads. Failures remain eligible for retry.

## Prerequisites and boundaries

- Mise, Pi and Bat have native PowerShell hooks on Windows and POSIX shell hooks
  on Linux/macOS. Only the matching platform scripts render. The systemd hook is
  Linux-only; it does not have a Windows service-management substitute.
- Windows hooks do not depend on the interactive PowerShell profile, repo helper
  functions, WSL, an elevated shell, or Developer Mode. Native command exit codes
  are checked explicitly so failed installs are retried by chezmoi.
- The upstream Mise `btop` and `tmux` packages are restricted to Linux/macOS;
  their separate Windows ports are not silently substituted or installed.
- Install `mise` first and resolve any required config trust decisions explicitly.
  The hooks do not install mise itself or silently trust configurations.
- Tool installation can use the network and take time. Mise installs declared
  tools; it does not run `mise upgrade`. The config's existing `latest` versions
  are not a reproducible version lock.
- pnpm and Bat are invoked through mise, so a fresh non-interactive shell does
  not need refreshed PATH entries. All hooks explicitly select the deployed
  `~/.config/mise/config.toml`, independent of `XDG_CONFIG_HOME`. The Pi install preserves the runtime lockfile
  when compatible, but may update it when the manifest changes. There is no
  managed per-target lockfile, so fresh installation cannot use `--frozen-lockfile`.
- Bat waits until an active theme exists at `~/.config/theme/bat.tmTheme`.
  On Windows it honors `XDG_CONFIG_HOME` for the selected theme and `BAT_CONFIG_DIR`
  for the cache's theme inputs (defaults: `~/.config` and its `bat` directory).
  Windows copies `current.tmTheme` instead of requiring symlink privileges;
  Unix retains the existing symlink behavior. Existing Windows theme symlinks
  are removed without overwriting their targets. Selected theme content and
  Windows destination changes also trigger a rebuild.
  Neither variant chooses a theme, changes wallpaper, or restarts applications.
  If the theme only becomes available during an apply, run another apply.
- The systemd hook waits for a user-session bus. It does not enable, start, or
  restart services. Unavailable theme/session prerequisites render empty scripts,
  so a later apply can run them once available.
- These hooks are not continuous repair checks. If dependencies or caches are
  deleted without input changes, repair them explicitly; changing the manifest
  is not necessary just to reinstall dependencies.
- Downloaded dependencies remain excluded from chezmoi management. Plugin and
  asset fetching continues to belong in `.chezmoiexternal.toml.tmpl`.

Deployment remains a separate approved action. A full apply includes the hooks;
a scoped apply must select the relevant scripts as well as their input files.
Do not run scripts alone against stale or missing deployed inputs. Preview with
`chezmoi diff` or `chezmoi apply --dry-run --verbose` before an approved deployment.

## Verification

```sh
python3 tests/test-chezmoi-hooks.py
```

Run this harness on Linux with Python 3, chezmoi and PowerShell 7 (`pwsh`).
It uses real chezmoi against a disposable source, home, cache and state database.
Windows-rendered hooks are actually executed in profile-free PowerShell, not
merely syntax checked. Installer/cache/service commands are replaced with stubs.
Checks include scheduling, unchanged applies, retries for each Windows native
command failure, deferred prerequisites, dry-run behavior, OS guards, paths with
spaces/apostrophes, Windows environment overrides, and safe theme copying.
It performs no real installs or service operations. This exercises PowerShell
on Linux; native Windows executables, package availability and filesystem
behavior still require a Windows-machine smoke test.
