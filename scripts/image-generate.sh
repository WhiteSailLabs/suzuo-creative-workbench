#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec /Users/Admin/.codex/skills/private-credentials/scripts/with-secret \
  chengying-image-api-key CHENGYING_API_KEY -- \
  /Users/Admin/.local/share/node-v24.21.0/bin/node "$SCRIPT_DIR/image-generate.mjs" "$@"
