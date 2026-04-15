##=========================================
## ~/.config/shell/login.sh
##=========================================

if [ -n "${BASH_VERSION:-}" ]; then
  _shell_name='bash'
elif [ -n "${ZSH_VERSION:-}" ]; then
  _shell_name='zsh'
else
  _shell_name='sh'
fi

## Homebrew/Linuxbrew
if [ -x /opt/homebrew/bin/brew ]; then
  eval "$(/opt/homebrew/bin/brew shellenv "$_shell_name")"
elif [ -x /home/linuxbrew/.linuxbrew/bin/brew ]; then
  eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv "$_shell_name")"
fi

## Crosspack
if [ -x "$HOME/.crosspack/bin/crosspack" ]; then
  eval "$("$HOME/.crosspack/bin/crosspack" init-shell --shell "$_shell_name")"
fi

## Cargo
if [ -f "$HOME/.cargo/env" ]; then
  source "$HOME/.cargo/env"
fi

## Python Venv
if [ -f "$HOME/.venv/bin/activate" ]; then
  source "$HOME/.venv/bin/activate"
fi

## Mise
if command -v mise &>/dev/null; then
  eval "$(mise activate "$_shell_name")"
fi

## Tirith
if command -v tirith &>/dev/null; then
  eval "$(tirith init --shell "$_shell_name")"
fi

## Environment-Specific Env
if [ -f "$HOME/.env" ]; then
  source "$HOME/.env"
fi

## SSH terminal fallback
if [ -n "${SSH_CONNECTION:-}" ] && [ "${TERM:-}" = "xterm-ghostty" ]; then
  if ! infocmp xterm-ghostty >/dev/null 2>&1; then
    if infocmp ghostty >/dev/null 2>&1; then
      export TERM='ghostty'
    else
      export TERM='xterm-256color'
    fi
  fi
fi

## Apply Base Path Order
if [ -n "${BASH_VERSION:-}" ] && command -v _bash_apply_base_path_order &>/dev/null; then
  _bash_apply_base_path_order
fi

if [ -n "${ZSH_VERSION:-}" ] && command -v _zsh_apply_base_path_order &>/dev/null; then
  _zsh_apply_base_path_order
fi

unset _shell_name
