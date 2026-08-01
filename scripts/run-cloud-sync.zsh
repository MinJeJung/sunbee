#!/bin/zsh
set -euo pipefail

RUNTIME_ROOT="/Users/minje/.local/share/sol-ebook-publish-dashboard"
export PATH="/Users/minje/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export CLOUD_DASHBOARD_URL="https://sunbee-books-cloud-dashboard.vercel.app"
export CODEX_BRIDGE_TOKEN="$(/usr/bin/security find-generic-password -a minje -s com.sunbeebooks.sol-ebook-dashboard.cloud-bridge -w)"

cd "$RUNTIME_ROOT"
exec "$RUNTIME_ROOT/node_modules/.bin/tsx" scripts/cloud-pull.ts
