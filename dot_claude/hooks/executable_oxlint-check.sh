#!/usr/bin/env bash
# PostToolUse hook: lint JS/TS files Claude edits with the project's oxlint.
# Exits 2 with findings on stderr so Claude sees them; exits 0 silently when
# the file isn't JS/TS, no oxlint config or binary is found, or oxlint itself
# misbehaves.

command -v jq >/dev/null 2>&1 || exit 0

f=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')
[[ -n "$f" && -f "$f" ]] || exit 0
[[ "$f" =~ \.(js|jsx|ts|tsx|mjs|cjs|mts|cts)$ ]] || exit 0

# Only lint projects that configure oxlint: find the nearest config file and
# the nearest project-local oxlint while walking up from the file.
config_root=""
oxlint=""
dir=$(cd "$(dirname "$f")" && pwd) || exit 0
while :; do
  if [[ -z "$config_root" ]]; then
    for name in .oxlintrc.json .oxlintrc.jsonc oxlint.config.ts oxlint.config.mts; do
      [[ -f "$dir/$name" ]] && config_root=$dir && break
    done
  fi
  if [[ -z "$oxlint" && -x "$dir/node_modules/.bin/oxlint" ]]; then
    oxlint="$dir/node_modules/.bin/oxlint"
  fi
  [[ -n "$config_root" && -n "$oxlint" || "$dir" == "/" ]] && break
  dir=$(dirname "$dir")
done
[[ -n "$config_root" ]] || exit 0
[[ -n "$oxlint" ]] || oxlint=$(command -v oxlint) || exit 0

# Run from the config's directory so oxlint discovers it.
cd "$config_root" || exit 0
out=$(NO_COLOR=1 "$oxlint" --deny-warnings --format=agent "$f" 2>&1)
status=$?

# 1 = lint findings; anything else is an environment problem, not the code.
if [[ $status -eq 1 && -n "$out" ]]; then
  printf 'oxlint found issues in %s:\n%s\n' "$f" "$out" >&2
  exit 2
fi
exit 0
