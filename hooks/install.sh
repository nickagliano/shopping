#!/usr/bin/env bash
set -euo pipefail
echo "Installing shopping dependencies..."
npm install
cp -n config/config.example.json config/config.json 2>/dev/null || true
echo "Done. Edit config/config.json to add your API keys."
