# Herdr tmux Key-Parity Config Design

## Goal

Make `dot_config/herdr/config.toml` feel familiar to the existing tmux setup in `dot_config/tmux/tmux.conf`, focused on keybinding parity rather than full behavioral or visual emulation.

## Scope

Update only Herdr configuration. Preserve tmux configuration unchanged.

In scope:

- Set Herdr prefix to `ctrl+a`, matching tmux's primary prefix.
- Map Herdr actions with clear tmux equivalents to the same prefix keys.
- Add a Herdr custom command for `lazygit` on `prefix+g`.
- Keep Herdr-specific defaults where tmux has no direct equivalent.

Out of scope:

- Recreating tmux plugins in Herdr.
- Matching tmux status-line formatting exactly.
- Changing shell startup, update behavior, remotes, or experimental Herdr settings.
- Changing deployment rules or unrelated chezmoi files.

## Key Mapping

| tmux binding | tmux behavior | Herdr binding | Herdr behavior |
| --- | --- | --- | --- |
| `C-a` | prefix | `ctrl+a` | prefix |
| `prefix+|` | horizontal split | `prefix+|` | vertical split / side-by-side pane |
| `prefix+-` | vertical split | `prefix+minus` | horizontal split / stacked pane |
| `prefix+t` | new window | `prefix+t` | new tab |
| `prefix+n` | next window | `prefix+n` | next tab |
| `prefix+p` | previous window | `prefix+p` | previous tab |
| `prefix+d` | detach | `prefix+d` | detach |
| `prefix+x` | kill pane | `prefix+x` | close pane |
| `prefix+X` | kill window | `prefix+shift+x` | close tab |
| `prefix+z` | zoom pane | `prefix+z` | zoom pane |
| `prefix+r` | resize mode | `prefix+r` | resize mode |
| `prefix+,` | rename window | `prefix+comma` | rename tab |
| `prefix+.` | rename pane | `prefix+period` | rename pane |
| `prefix+R` | rename session | `prefix+shift+r` | rename workspace |
| `prefix+g` | lazygit popup | `prefix+g` | open lazygit pane command |

## Design Details

Herdr's config already contains commented examples for most keybindings. The implementation should make the selected bindings explicit in `[keys]` so the deployed config does not depend on Herdr defaults.

Where Herdr's action names differ from tmux terminology, choose the closest Herdr concept:

- tmux windows map to Herdr tabs.
- tmux sessions map to Herdr workspaces where a rename operation is involved.
- tmux popup commands map to a temporary Herdr pane command.

The `lazygit` binding should use `type = "pane"` and `command = "lazygit"`. It does not need to reproduce tmux's exact popup dimensions because Herdr's custom command model does not expose the same popup geometry controls in this config.

## Validation

- Confirm `dot_config/herdr/config.toml` remains valid TOML.
- Inspect the final `[keys]` section for the expected explicit bindings.
- Avoid touching unrelated modified files in the chezmoi source tree.
