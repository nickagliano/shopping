#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

# Load config/config.json into env if it exists
CONFIG="$DIR/config/config.json"
if [[ -f "$CONFIG" ]]; then
  export $(jq -r 'to_entries | .[] | select(.value != "") | "\(.key)=\(.value)"' "$CONFIG" | xargs)
fi

# Port is set by EPC at deploy time; passed through for any HTTP server added later
export PORT="${PORT:-5555}"
export CHECK_INTERVAL_MINUTES="${CHECK_INTERVAL_MINUTES:-120}"

exec node "$DIR/server.js"
