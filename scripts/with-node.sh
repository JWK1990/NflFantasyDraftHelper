#!/usr/bin/env bash
set -euo pipefail

MIN_MAJOR=20

node_major() {
  node -p "parseInt(process.versions.node, 10)" 2>/dev/null || echo 0
}

run_with_current_node() {
  exec "$@"
}

if [[ "$(node_major)" -ge "$MIN_MAJOR" ]]; then
  run_with_current_node "$@"
fi

NVM_SH="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
if [[ -s "$NVM_SH" ]]; then
  # nvm is a set of shell functions, not a binary.
  # shellcheck disable=SC1090
  . "$NVM_SH"
  nvm use >/dev/null
  if [[ "$(node_major)" -ge "$MIN_MAJOR" ]]; then
    run_with_current_node "$@"
  fi
fi

echo "This app needs Node 20.19+ (22 recommended). You have $(node -v 2>/dev/null || echo 'no node')." >&2
echo "Install Node 22, then in this directory run: nvm use" >&2
exit 1
