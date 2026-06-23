#!/bin/bash
set -euo pipefail
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi
# No dependencies — zero-dependency Canvas 2D game, served as static files.
if ! command -v python3 &>/dev/null; then
  echo "Warning: python3 not found. Install it to run a local dev server." >&2
fi
