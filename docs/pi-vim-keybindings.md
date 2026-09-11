# Pi Vim-style keys

The command deck subclasses `pi-vim@0.14.2`'s exported `ModalEditor`; it remains
Pi's only custom editor. The dependency is pinned because the integration also
relocates its rendered mode/pending-command label. Do not enable pi-vim's separate
extension in `settings.json`: that would replace the command deck.

## Prompt

New, submitted, cleared and externally replaced prompts start in **Insert** mode.
`Esc` cancels pending Vim commands, leaves Visual mode, or enters Normal mode;
it never interrupts generation. The command deck shows the current mode.

| Keys                              | Action                                                       |
| --------------------------------- | ------------------------------------------------------------ |
| `i`, `a`, `I`, `A`, `o`, `O`      | Enter Insert mode                                            |
| `h j k l`, `w b e`, `0 $`, `gg G` | Move through the prompt                                      |
| `x`, `dd`, `dw`, `ciw`            | Delete/change text; counts work                              |
| `v`, `V`                          | Character-wise / line-wise selection                         |
| `d`, `c`, `y` in Visual mode      | Delete, change, yank selection                               |
| `yy`, `p`, `P`                    | Yank/paste using the editor-local unnamed register           |
| `u`, `Ctrl+r`, `.`                | Undo, redo, repeat change                                    |
| `Ctrl+g`                          | Compose in the external editor (`$EDITOR`, currently Neovim) |
| `Ctrl+\`                          | Interrupt generation or a running Pi shell command           |
| `Ctrl+c`                          | Pi's normal clear/exit behavior                              |
| `Alt+t`                           | Open the session tree (double-Escape behavior is disabled)   |

Normal-mode `:` uses pi-vim's small Ex interface (`:q` exits). `:!command` runs
through Pi's normal bash route and includes its output in context; `:!!command`
runs it with output excluded from context. Both preserve the composed prompt.
The same `!command` / `!!command` prefixes work directly in Insert mode. Built-in
Pi commands can also be dispatched through Ex (for example, `:settings`);
clipboard-copy Ex commands remain disabled.

## Menus and fullscreen transcript

These are action aliases, not a global Vim mode. Native arrows, PageUp/PageDown,
Enter and Escape remain available.

| Surface               | Keys                        | Action                       |
| --------------------- | --------------------------- | ---------------------------- |
| Standard selectors    | `Ctrl+j` / `Ctrl+k`         | Next / previous item         |
| Standard selectors    | `Ctrl+f` / `Ctrl+b`         | Next / previous page         |
| Session tree          | `Alt+h` / `Alt+l`           | Fold / unfold branch         |
| Fullscreen transcript | `Alt+j` / `Alt+k`           | Scroll down / up one line    |
| Fullscreen transcript | `Alt+d` / `Alt+u`           | Scroll down / up half a page |
| Fullscreen transcript | `Alt+/`                     | Open/close transcript search |
| Transcript search     | Enter / Shift+Enter, Escape | Next / previous match, close |
| Fullscreen transcript | Home / End                  | First / latest output        |

Fullscreen shortcuts take precedence over prompt editing: `Alt+d` scrolls rather
than deleting a word; `Alt+Delete` remains available for word deletion.

### Deliberate limits

- Menus still **search as you type**. Plain `j/k` and `/`-to-enter-search would
  require reliable focus information that Pi's public raw-input hook does not
  provide. Third-party overlays may use their own bindings.
- pi-vim implements visual selection operations but **does not highlight the
  selected span**. The mode label and cursor mark selection state. Use `Ctrl+g`
  for full Neovim selection rendering, plugins, named registers, or prompt search.
- Vim yanks/deletes stay local; they do not read or overwrite the system clipboard.
  Pi's existing clipboard shortcuts are unchanged.
- Modified keys depend on terminal delivery. PTY checks on Pi 0.85.1 verified
  `Ctrl+\` as both ASCII FS (`0x1c`) and Kitty CSI-u (`ESC[92;5u`), including shell
  cancellation without exiting Pi. Transcript aliases were checked with CSI-u.
  This does not verify physical keyboard shortcuts intercepted by a terminal or
  desktop; retain the native navigation keys as fallback.
- Pi's built-in help can still describe Escape as an interrupt key in some places.

## Deployment (requires separate approval)

Source files are not applied automatically. After approval, apply the dependency
manifest first, install dependencies with lifecycle scripts disabled, then apply
only the changed runtime files:

```sh
chezmoi apply ~/.pi/agent/package.json
npm --prefix ~/.pi/agent install --omit=dev --ignore-scripts
chezmoi apply ~/.pi/agent/extensions/command-deck-editor.ts \
  ~/.pi/agent/keybindings.json ~/.pi/agent/settings.json
```

Then run `/reload`. Tests and this document are repo-only; `node_modules` is never
copied by chezmoi. Do not run `pi install pi-vim`: the class is imported as a library,
not registered as a competing extension.

## Verification

```sh
npm --prefix dot_pi/agent run typecheck
npm --prefix dot_pi/agent test
npm --prefix dot_pi/agent run lint
npm --prefix dot_pi/agent run format:check
```

These run the package's existing scripts. During implementation, pnpm 12's script
runner attempted an automatic install and rejected the skipped esbuild build;
using npm to invoke the same scripts avoided changing workspace build policy.

For an isolated live check, use a temporary `PI_CODING_AGENT_DIR` containing the
new keybindings and minimal fullscreen settings, then launch Pi with
`--no-session --no-extensions --no-skills --no-prompt-templates --no-context-files
--no-approve -e <absolute-source-path>/command-deck-editor.ts` and `PI_OFFLINE=1`.
No credentials or model calls are needed to check editing, `/settings`, `/hotkeys`
and cancellation of `!sleep 30`.
