##=========================================
## ~/.config/shell/path.bash
##=========================================

_bash_prepend_path_existing() {
  local dir
  local new_path=()
  local path_parts=()
  local seen=()

  IFS=':' read -r -a path_parts <<<"${PATH:-}"

  for dir in "$@"; do
    [ -d "$dir" ] || continue
    new_path+=("$dir")
    seen+=("$dir")
  done

  for dir in "${path_parts[@]}"; do
    [ -n "$dir" ] || continue
    case " ${seen[*]} " in
    *" $dir "*) continue ;;
    esac
    new_path+=("$dir")
    seen+=("$dir")
  done

  PATH=$(
    IFS=:
    printf '%s' "${new_path[*]}"
  )
  export PATH
}

_bash_apply_base_path_order() {
  _bash_prepend_path_existing \
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
