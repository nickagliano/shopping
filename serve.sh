#!/usr/bin/env bash
set -euo pipefail

# Load config into env
CONFIG="$(dirname "$0")/config/config.json"
if [[ -f "$CONFIG" ]]; then
  export $(jq -r 'to_entries | .[] | "\(.key)=\(.value)"' "$CONFIG" | xargs)
fi

PORT="${PORT:-5555}"
exec node --experimental-vm-modules server.js
