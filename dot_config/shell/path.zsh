##=========================================
## ~/.config/shell/path.zsh
##=========================================

typeset -gU path PATH

_zsh_prepend_path_existing() {
  local dir
  local -a dirs

  for dir in "$@"; do
    [[ -d "$dir" ]] || continue
    path=(${path:#$dir})
    dirs+=("$dir")
  done

  ((${#dirs[@]} == 0)) && return
  path=("${dirs[@]}" "${path[@]}")
}

_zsh_apply_base_path_order() {
  _zsh_prepend_path_existing \
    "$HOME/.local/bin" \
    "${XDG_CACHE_HOME:-$HOME/.cache}/.bun/bin" \
    "$HOME/.local/share/pnpm" \
    "$HOME/.npm-global/bin" \
    "$HOME/.cargo/bin" \
    /opt/homebrew/bin \
    /opt/homebrew/sbin \
    /home/linuxbrew/.linuxbrew/bin \
    /home/linuxbrew/.linuxbrew/sbin
}
