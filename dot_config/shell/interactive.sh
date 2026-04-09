##=========================================
## ~/.config/shell/interactive.sh
##=========================================

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

## Zellij
if command -v zellij &>/dev/null; then
  alias zj='zellij'
  alias zjl='zellij list-sessions'
  alias zja='zellij attach'
  alias zjd='zellij delete-session'
  alias zjda='zellij delete-all-sessions'
  alias zjk='zellij kill-session'
  alias zjka='zellij kill-all-sessions'
  alias zj-dev='zellij --layout dev'
fi

## Brewfile
if command -v brew &>/dev/null; then
  brew() {
    command brew "$@"
    case "$1" in
    install|uninstall|remove|upgrade)
      command brew bundle dump --force --file="$HOME/Brewfile"
      ;;
    esac
  }
fi
