#!/bin/bash
# SessionStart hook for NEON BREAKOUT.
#
# This is a zero-dependency, no-build static project (vanilla HTML/CSS/JS),
# so there is nothing to "install". The only automated check the repo has is
# `node --check` on its JavaScript. We run it here so each web session starts
# with a clear signal that the code parses. Non-fatal: never blocks startup.
set -uo pipefail

# Only run in Claude Code on the web (remote) sessions.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

if ! command -v node >/dev/null 2>&1; then
  echo "session-start: node not found — skipping JS syntax check"
  exit 0
fi

status=0
for f in game.js sw.js; do
  if [ -f "$f" ]; then
    if node --check "$f"; then
      echo "session-start: ✅ $f parses"
    else
      echo "session-start: ‼️ $f has a syntax error"
      status=1
    fi
  fi
done

if [ "$status" -ne 0 ]; then
  echo "session-start: JS syntax check found problems (see above)"
fi

# Exit 0 regardless so a syntax error never blocks the session from starting.
exit 0
