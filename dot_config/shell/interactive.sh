##=========================================
## ~/.config/shell/interactive.sh
##=========================================
# Shared interactive config for bash and zsh. Keep this file valid in both;
# use $_shell_name for tools that emit shell-specific init scripts.

if [ -n "${ZSH_VERSION:-}" ]; then
  _shell_name='zsh'
elif [ -n "${BASH_VERSION:-}" ]; then
  _shell_name='bash'
else
  return 0
fi

## Editor
if command -v nvim &>/dev/null; then
  alias vim='nvim'
fi

## LSD
if command -v lsd &>/dev/null; then
  alias ls='lsd'
fi
alias l='ls'
alias ll='ls -l'
alias lla='ls -lA'
alias la='ls -A'
alias lt='ls --tree'
alias ltla='ls -lA --tree'

## Bat
if command -v bat &>/dev/null; then
  alias cat='bat --style=plain --paging=never'
fi

## Yazi
if command -v yazi &>/dev/null; then
  alias y='yazi'
fi

## Lazygit
if command -v lazygit &>/dev/null; then
  alias lg='lazygit'
fi

## Terraform
if command -v terraform &>/dev/null; then
  alias tf='terraform'
fi

## Brewfile
if command -v brew &>/dev/null; then
  brew() {
    command brew "$@"
    case "$1" in
    install | uninstall | remove | upgrade)
      command brew bundle dump --force --no-cargo --no-go --no-npm --no-uv --file="$HOME/Brewfile"
      ;;
    esac
  }
fi

## Hunk
if command -v hunk &>/dev/null; then
  hunk() {
    if [[ "$1" == "diff" ]]; then
      shift
      command hunk diff \
        --watch \
        --transparent-bg \
        --mode stack \
        --wrap \
        --theme "$(
          case "$(basename "$(readlink ~/.config/theme)")" in
          catppuccin) echo catppuccin-mocha ;;
          gruvbox) echo gruvbox-dark-medium ;;
          kanagawa) echo kanagawa-wave ;;
          everforest) echo everforest-dark ;;
          dracula) echo dracula ;;
          solarized) echo solarized-dark ;;
          one-dark) echo one-dark-pro ;;
          vesper) echo vesper ;;
          flexoki) echo github-dark-default ;;
          *) basename "$(readlink ~/.config/theme)" ;;
          esac
        )" \
        "$@"
    else
      command hunk "$@"
    fi
  }
fi

## Pi
if command -v pi &>/dev/null; then
  pi() {
    case "$1" in
    auth | config | install | list | remove | uninstall | update | --no-extensions | -ne)
      # Pi only recognizes subcommands when they are the first argument.
      command pi "$@"
      ;;
    *)
      command pi \
        --theme "$HOME/.config/theme/pi.json" \
        --active-theme "$(basename "$(readlink "$HOME/.config/theme")")" \
        "$@"
      ;;
    esac
  }
fi

## Completions
if command -v omp &>/dev/null; then
  eval "$(omp completions "$_shell_name")"
fi

if command -v hermes &>/dev/null; then
  eval "$(hermes completion "$_shell_name")"
fi

## FZF
if command -v fzf &>/dev/null; then
  eval "$(fzf --"$_shell_name")"
fi

## Zoxide
if command -v zoxide &>/dev/null; then
  eval "$(zoxide init "$_shell_name")"
  zd() {
    if [ $# -eq 0 ]; then
      builtin cd ~ && zoxide add "$(pwd)" && return
    elif [ -d "$1" ]; then
      builtin cd "$1" && zoxide add "$(pwd)" && return
    else
      z "$@" && printf '\U000F17A9 ' && pwd || echo "Error: Directory not found"
    fi
  }
  alias cd='zd'
fi

unset _shell_name
